// Prompt-driven seasonal encounter suggestions. This ranks dive sites against
// nearby historical OBIS observations; it does not predict individual animals.

import { $ } from "./dom.js";
import { findPromptSpecies, getSpeciesObservations, searchSpeciesCatalogue, showSpeciesEvidence } from "./species.js";
import { getDiveCatalogue, openRecommendedDiveSite } from "./dive.js";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
let recommendations = [];
let activeQuery = null;
let selectedTaxon = null;
let selectedMonth = null;
let suggestionIndex = -1;
const esc = value => String(value == null ? "" : value).replace(/[&<>"]/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[character]));

function promptMonth(text) {
  const value = String(text || "").toLowerCase();
  const index = MONTHS.findIndex(month => new RegExp(`\\b(?:${month.toLowerCase()}|${month.slice(0, 3).toLowerCase()})\\b`).test(value));
  return index < 0 ? null : index + 1;
}

function km(aLat, aLng, bLat, bLng) {
  const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

function cellKey(lat, lng) { return `${Math.floor((lat + 90) / 2) * 2 - 90}:${Math.floor((lng + 180) / 2) * 2 - 180}`; }

function buildEvidence(records, month) {
  const cells = new Map();
  records.filter(record => record.month === month).forEach(record => {
    const key = cellKey(record.lat, record.lng), old = cells.get(key);
    if (old) old.count++; else {
      const [lat, lng] = key.split(":").map(Number); cells.set(key, { lat:lat + 1, lng:lng + 1, count:1 });
    }
  });
  return { cells, peak:Math.max(1, ...[...cells.values()].map(cell => cell.count)) };
}

function evidenceNear(site, evidence) {
  const { cells, peak } = evidence;
  const lat = +site.latitude, lng = +site.longitude;
  const baseLat = Math.floor((lat + 90) / 2) * 2 - 90, baseLng = Math.floor((lng + 180) / 2) * 2 - 180;
  let best = null, sightings = 0;
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    const cell = cells.get(`${baseLat + y * 2}:${baseLng + x * 2}`); if (!cell) continue;
    const sameCell = cellKey(lat, lng) === `${cell.lat - 1}:${cell.lng - 1}`;
    const distance = sameCell ? 0 : km(lat, lng, cell.lat, cell.lng); if (distance > 300) continue;
    sightings += cell.count;
    const density = Math.log1p(cell.count) / Math.log1p(peak);
    const score = density * Math.exp(-distance / 120);
    if (!best || score > best.score) best = { score, count:cell.count, distance };
  }
  if (best) best.sightings = sightings;
  return best;
}

function place(site) { return [site.region, site.country].filter(Boolean).join(", ") || `${(+site.latitude).toFixed(2)}, ${(+site.longitude).toFixed(2)}`; }

function renderResults(month, taxa) {
  const el = $("encounterResults");
  if (!recommendations.length) { el.hidden = false; el.innerHTML = `<div class="encounter-empty">No catalogue dive sites were close to recorded ${MONTHS[month - 1]} observations.</div>`; return; }
  el.hidden = false;
  el.innerHTML = `<div class="encounter-summary"><strong>${MONTHS[month - 1]}</strong><span>${taxa.map(item => `${item.icon} ${esc(item.common)}`).join(" or ")}</span><small>Relative sighting likelihood from historical records</small></div><div class="encounter-list">${recommendations.map((item, index) => `<button type="button" data-encounter-index="${index}"><b>${index + 1}</b><span><strong>${esc(item.site.name)}</strong><small>${esc(place(item.site))}</small><small class="encounter-sightings">${item.matches.map(match => `${match.taxon.icon} ${match.sightings.toLocaleString()} sighting${match.sightings === 1 ? "" : "s"}`).join(" · ")}</small></span><em class="encounter-likelihood">${item.likelihood}%<small>relative</small></em></button>`).join("")}</div>`;
}

async function findEncounters(monthOverride) {
  const input = $("encounterPrompt"), button = $("encounterFind"), output = $("encounterResults"), text = input.value.trim();
  const month = monthOverride || selectedMonth || promptMonth(text), taxa = selectedTaxon ? [selectedTaxon] : findPromptSpecies(text);
  if (!month || !taxa.length) { output.hidden = false; output.innerHTML = `<div class="encounter-empty">Select a species, then choose a month.</div>`; return; }
  const sites = getDiveCatalogue();
  if (!sites.length) { output.hidden = false; output.innerHTML = `<div class="encounter-empty">Dive catalogue is still loading. Try again shortly.</div>`; return; }
  button.disabled = true; button.textContent = "Searching..."; output.hidden = false; output.innerHTML = `<div class="encounter-empty">Comparing seasonal observations with ${sites.length.toLocaleString()} dive sites...</div>`;
  try {
    const data = await Promise.all(taxa.map(async taxon => ({ taxon, cells:buildEvidence((await getSpeciesObservations(taxon)).records, month) })));
    const ranked = sites.map(site => {
      const matches = data.map(item => ({ taxon:item.taxon, ...evidenceNear(site, item.cells) })).filter(match => match.score);
      const score = 1 - matches.reduce((remaining, match) => remaining * (1 - Math.min(.99, match.score)), 1);
      return { site, matches, score, likelihood:Math.max(1, Math.round(score * 100)) };
    }).filter(item => item.matches.length).sort((a, b) => b.score - a.score);
    recommendations = [];
    for (const item of ranked) {
      if (recommendations.every(saved => km(+saved.site.latitude, +saved.site.longitude, +item.site.latitude, +item.site.longitude) > 20)) recommendations.push(item);
      if (recommendations.length === 10) break;
    }
    activeQuery = { taxa, month };
    renderResults(month, taxa);
    await showSpeciesEvidence(taxa, month);
  } catch (error) { output.innerHTML = `<div class="encounter-empty">${esc(error.message || "Encounter search failed.")}</div>`; }
  finally { button.disabled = false; button.textContent = "Find dives"; }
}

function closeSuggestions() {
  const suggestions = $("encounterSuggestions"), input = $("encounterPrompt");
  suggestions.hidden = true; suggestions.innerHTML = ""; suggestionIndex = -1;
  input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant");
}

function renderSuggestions() {
  const input = $("encounterPrompt"), suggestions = $("encounterSuggestions"), matches = searchSpeciesCatalogue(input.value);
  if (!matches.length || selectedTaxon) { closeSuggestions(); return; }
  suggestions.innerHTML = matches.map((item, index) => `<button type="button" role="option" id="encounter-option-${index}" data-encounter-species="${esc(item.scientific)}" style="--species-color:${item.color}"><i>${item.icon}</i><span><strong>${esc(item.common)}</strong><small>${esc(item.scientific)}</small></span></button>`).join("");
  suggestions.hidden = false; input.setAttribute("aria-expanded", "true");
}

function setSuggestionIndex(next) {
  const buttons = [...$("encounterSuggestions").querySelectorAll("button")]; if (!buttons.length) return;
  suggestionIndex = (next + buttons.length) % buttons.length;
  buttons.forEach((button, index) => button.setAttribute("aria-selected", String(index === suggestionIndex)));
  const active = buttons[suggestionIndex]; $("encounterPrompt").setAttribute("aria-activedescendant", active.id); active.scrollIntoView({ block:"nearest" });
}

async function selectPlannerSpecies(taxon) {
  const input = $("encounterPrompt"), months = $("encounterMonths"), button = $("encounterFind"), output = $("encounterResults");
  selectedTaxon = taxon; selectedMonth = null; closeSuggestions();
  input.value = `${taxon.icon} ${taxon.common}`; input.classList.add("selected");
  input.setAttribute("aria-label", `${taxon.common} selected; clear to choose another species`);
  button.disabled = true; button.textContent = "Loading..."; output.hidden = true;
  months.hidden = false; months.innerHTML = `<span class="encounter-month-loading">Loading historical sightings...</span>`;
  try {
    const records = (await getSpeciesObservations(taxon)).records;
    const counts = Array.from({ length:12 }, (_, index) => records.filter(record => record.month === index + 1).length);
    const peak = Math.max(1, ...counts);
    months.innerHTML = `<div class="encounter-month-heading"><span>${taxon.icon} <strong>${esc(taxon.common)}</strong></span><small>Relative likelihood from historical sightings</small></div><div class="encounter-month-grid">${counts.map((count, index) => {
      const likelihood = count ? Math.max(1, Math.round(count / peak * 100)) : 0;
      return `<button type="button" data-encounter-month="${index + 1}" title="${MONTHS[index]}: ${count.toLocaleString()} historical sightings"><span>${MONTHS[index].slice(0, 3)}</span><strong>${likelihood}%</strong><small>${count.toLocaleString()}</small></button>`;
    }).join("")}</div>`;
    button.textContent = "Choose month";
  } catch (error) {
    months.innerHTML = `<span class="encounter-month-loading">${esc(error.message || "Historical sightings could not be loaded.")}</span>`;
    button.textContent = "Unavailable";
  }
}

export function initEncounterPlanner() {
  const input = $("encounterPrompt"), button = $("encounterFind"), results = $("encounterResults"), suggestions = $("encounterSuggestions"), months = $("encounterMonths"); if (!input || !button || !results || !suggestions || !months) return;
  input.oninput = () => {
    if (selectedTaxon) { selectedTaxon = null; selectedMonth = null; input.classList.remove("selected"); months.hidden = true; results.hidden = true; button.disabled = true; button.textContent = "Choose month"; }
    renderSuggestions();
  };
  input.onfocus = renderSuggestions;
  input.onkeydown = event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setSuggestionIndex(suggestionIndex + (event.key === "ArrowDown" ? 1 : -1)); }
    else if (event.key === "Enter" && suggestionIndex >= 0) { event.preventDefault(); suggestions.querySelectorAll("button")[suggestionIndex]?.click(); }
    else if (event.key === "Escape") closeSuggestions();
  };
  suggestions.onclick = event => { const choice = event.target.closest("[data-encounter-species]"); if (!choice) return; const taxon = searchSpeciesCatalogue(choice.dataset.encounterSpecies, 1)[0]; if (taxon) selectPlannerSpecies(taxon); };
  months.onclick = event => { const choice = event.target.closest("[data-encounter-month]"); if (!choice) return; selectedMonth = +choice.dataset.encounterMonth; months.querySelectorAll("[data-encounter-month]").forEach(item => item.classList.toggle("selected", item === choice)); button.disabled = false; button.textContent = `Find dives in ${MONTHS[selectedMonth - 1]}`; findEncounters(selectedMonth); };
  button.onclick = () => selectedMonth && findEncounters(selectedMonth);
  document.addEventListener("pointerdown", event => { if (!event.target.closest(".encounter-species-search")) closeSuggestions(); });
  results.onclick = event => {
    const button = event.target.closest("[data-encounter-index]"); if (!button) return;
    const recommendation = recommendations[+button.dataset.encounterIndex]; if (!recommendation) return;
    openRecommendedDiveSite(recommendation.site);
    if (activeQuery) showSpeciesEvidence(activeQuery.taxa, activeQuery.month);
  };
}

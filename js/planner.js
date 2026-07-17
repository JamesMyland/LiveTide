// Prompt-driven seasonal encounter suggestions. This ranks dive sites against
// nearby historical OBIS observations; it does not predict individual animals.

import { $ } from "./dom.js";
import { findPromptSpecies, getSpeciesObservations, searchSpeciesCatalogue, showSpeciesEvidence } from "./species.js";
import { getDiveCatalogue, highlightRecommendedDiveSite, openRecommendedDiveSite, showRecommendedDiveSites } from "./dive.js";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MAX_WISHLIST = 4;
let recommendations = [];
let activeQuery = null;
let selectedTaxa = [];
let selectedMonth = null;
let suggestionIndex = -1;
let encounterRequestId = 0;
let wishlistRequestId = 0;
const esc = value => String(value == null ? "" : value).replace(/[&<>"]/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[character]));
const findButtonLabel = month => `Find dives · ${MONTHS[month - 1].slice(0, 3)}`;

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
  return { cells };
}

function evidenceNear(site, evidence) {
  const { cells } = evidence;
  const lat = +site.latitude, lng = +site.longitude;
  const baseLat = Math.floor((lat + 90) / 2) * 2 - 90, baseLng = Math.floor((lng + 180) / 2) * 2 - 180;
  let closestDistance = Infinity, sightings = 0;
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    const cell = cells.get(`${baseLat + y * 2}:${baseLng + x * 2}`); if (!cell) continue;
    const sameCell = cellKey(lat, lng) === `${cell.lat - 1}:${cell.lng - 1}`;
    const distance = sameCell ? 0 : km(lat, lng, cell.lat, cell.lng); if (distance > 300) continue;
    sightings += cell.count;
    closestDistance = Math.min(closestDistance, distance);
  }
  return sightings ? { score:sightings, sightings, distance:closestDistance } : null;
}

function place(site) { return [site.region, site.country].filter(Boolean).join(", ") || `${(+site.latitude).toFixed(2)}, ${(+site.longitude).toFixed(2)}`; }
function sourceName(site) { return site.mapKind === "sites" || String(site.dataSource || "").includes("divemap.uk") ? "Divemap UK" : site._osm ? "OpenStreetMap" : "Divemap GR"; }

function renderResults(month, taxa) {
  const el = $("encounterResults");
  if (!recommendations.length) { el.hidden = false; el.innerHTML = `<div class="encounter-empty">No catalogue dive sites were close to recorded ${MONTHS[month - 1]} observations.</div>`; return; }
  el.hidden = false;
  el.innerHTML = `<div class="encounter-summary"><strong>${MONTHS[month - 1]}</strong><span>${taxa.map(item => `${item.icon} ${esc(item.common)}`).join(" or ")}</span><small>Relative sighting likelihood from historical records</small></div><div class="encounter-list">${recommendations.map((item, index) => `<button type="button" data-encounter-index="${index}"><b>${index + 1}</b><span><strong>${esc(item.site.name)}</strong><small>${esc(place(item.site))} · ${sourceName(item.site)}</small><small class="encounter-sightings">${item.matches.map(match => `${match.taxon.icon} ${match.sightings.toLocaleString()} sighting${match.sightings === 1 ? "" : "s"}`).join(" · ")}</small></span><em class="encounter-likelihood">${item.likelihood}%<small>relative</small></em></button>`).join("")}</div>`;
}

async function findEncounters(monthOverride) {
  const input = $("encounterPrompt"), button = $("encounterFind"), output = $("encounterResults"), text = input.value.trim();
  const month = monthOverride || selectedMonth || promptMonth(text), taxa = selectedTaxa.length ? selectedTaxa.slice() : findPromptSpecies(text);
  if (!month || !taxa.length) { output.hidden = false; output.innerHTML = `<div class="encounter-empty">Select a species, then choose a month.</div>`; return; }
  const requestId = ++encounterRequestId;
  showRecommendedDiveSites([]);
  button.disabled = true; button.textContent = "Searching..."; output.hidden = false; output.innerHTML = `<div class="encounter-empty">Loading the full dive-site catalogue...</div>`;
  const sites = await getDiveCatalogue();
  if (requestId !== encounterRequestId) return;
  if (!sites.length) { output.hidden = false; output.innerHTML = `<div class="encounter-empty">Dive catalogue is still loading. Try again shortly.</div>`; button.disabled = false; button.textContent = findButtonLabel(month); return; }
  output.innerHTML = `<div class="encounter-empty">Comparing seasonal observations with ${sites.length.toLocaleString()} dive sites...</div>`;
  try {
    const data = await Promise.all(taxa.map(async taxon => ({ taxon, cells:buildEvidence((await getSpeciesObservations(taxon)).records, month) })));
    if (requestId !== encounterRequestId) return;
    const candidates = sites.map(site => {
      const matches = data.map(item => ({ taxon:item.taxon, ...evidenceNear(site, item.cells) })).filter(match => match.score);
      const distance = Math.min(...matches.map(match => match.distance));
      return { site, matches, distance };
    }).filter(item => item.matches.length);
    const speciesPeaks = new Map(taxa.map(taxon => [taxon.scientific, Math.max(1, ...candidates.map(item => item.matches.find(match => match.taxon.scientific === taxon.scientific)?.sightings || 0))]));
    const ranked = candidates.map(item => ({ ...item,
      score:item.matches.reduce((total, match) => total + match.sightings / speciesPeaks.get(match.taxon.scientific), 0),
      coverage:item.matches.length,
    })).sort((a, b) => b.score - a.score || b.coverage - a.coverage || a.distance - b.distance);
    const peakScore = Math.max(1, ranked[0]?.score || 1);
    ranked.forEach(item => { item.likelihood = Math.max(1, Math.round(item.score / peakScore * 100)); });
    recommendations = [];
    for (const item of ranked) {
      if (recommendations.every(saved => km(+saved.site.latitude, +saved.site.longitude, +item.site.latitude, +item.site.longitude) > 20)) recommendations.push(item);
      if (recommendations.length === 10) break;
    }
    activeQuery = { taxa, month };
    showRecommendedDiveSites(recommendations.map(item => item.site));
    renderResults(month, taxa);
    await showSpeciesEvidence(taxa, month);
  } catch (error) { if (requestId === encounterRequestId) output.innerHTML = `<div class="encounter-empty">${esc(error.message || "Encounter search failed.")}</div>`; }
  finally { if (requestId === encounterRequestId) { button.disabled = false; button.textContent = findButtonLabel(month); } }
}

function closeSuggestions() {
  const suggestions = $("encounterSuggestions"), input = $("encounterPrompt");
  suggestions.hidden = true; suggestions.innerHTML = ""; suggestionIndex = -1;
  input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant");
}

function renderSuggestions() {
  const input = $("encounterPrompt"), suggestions = $("encounterSuggestions"), matches = searchSpeciesCatalogue(input.value)
    .filter(item => !selectedTaxa.some(selected => selected.scientific === item.scientific));
  if (!matches.length || selectedTaxa.length >= MAX_WISHLIST) { closeSuggestions(); return; }
  suggestions.innerHTML = matches.map((item, index) => `<button type="button" role="option" id="encounter-option-${index}" data-encounter-species="${esc(item.scientific)}" style="--species-color:${item.color}"><i>${item.icon}</i><span><strong>${esc(item.common)}</strong><small>${esc(item.scientific)}</small></span></button>`).join("");
  suggestions.hidden = false; input.setAttribute("aria-expanded", "true");
}

function setSuggestionIndex(next) {
  const buttons = [...$("encounterSuggestions").querySelectorAll("button")]; if (!buttons.length) return;
  suggestionIndex = (next + buttons.length) % buttons.length;
  buttons.forEach((button, index) => button.setAttribute("aria-selected", String(index === suggestionIndex)));
  const active = buttons[suggestionIndex]; $("encounterPrompt").setAttribute("aria-activedescendant", active.id); active.scrollIntoView({ block:"nearest" });
}

function renderWishlist() {
  const selected = $("encounterSelected"), input = $("encounterPrompt");
  selected.innerHTML = selectedTaxa.map(taxon => `<button type="button" data-remove-encounter-species="${esc(taxon.scientific)}" title="Remove ${esc(taxon.common)}" aria-label="Remove ${esc(taxon.common)}"><span>${taxon.icon}</span><b>${esc(taxon.common)}</b><i aria-hidden="true">×</i></button>`).join("");
  input.placeholder = selectedTaxa.length >= MAX_WISHLIST ? "Maximum selected" : selectedTaxa.length ? "Add another species" : "Search for a species";
  input.disabled = selectedTaxa.length >= MAX_WISHLIST;
}

async function refreshPlannerMonths() {
  const months = $("encounterMonths"), button = $("encounterFind"), output = $("encounterResults"), requestId = ++wishlistRequestId;
  encounterRequestId++; showRecommendedDiveSites([]); selectedMonth = null; output.hidden = true;
  if (!selectedTaxa.length) { months.hidden = true; button.disabled = true; button.textContent = "Choose month"; return; }
  button.disabled = true; button.textContent = "Loading..."; output.hidden = true;
  months.hidden = false; months.innerHTML = `<span class="encounter-month-loading">Loading historical sightings...</span>`;
  try {
    const taxa = selectedTaxa.slice(), histories = await Promise.all(taxa.map(async taxon => {
      const records = (await getSpeciesObservations(taxon)).records;
      const counts = Array.from({ length:12 }, (_, index) => records.filter(record => record.month === index + 1).length);
      return { taxon, counts, peak:Math.max(1, ...counts) };
    }));
    if (requestId !== wishlistRequestId) return;
    const counts = Array.from({ length:12 }, (_, month) => histories.reduce((total, history) => total + history.counts[month], 0));
    const likelihoods = Array.from({ length:12 }, (_, month) => Math.round(histories.reduce((total, history) => total + history.counts[month] / history.peak, 0) / histories.length * 100));
    const highestLikelihood = Math.max(0, ...likelihoods);
    const wishlistLabel = taxa.length === 1 ? taxa[0].common : `${taxa.length} species wishlist`;
    months.innerHTML = `<div class="encounter-month-heading"><span>${taxa.map(taxon => taxon.icon).join(" ")} <strong>${esc(wishlistLabel)}</strong></span><small>Equal-weight relative likelihood from historical sightings</small></div><div class="encounter-month-grid">${counts.map((count, index) => {
      const likelihood = likelihoods[index];
      return `<button type="button" data-encounter-month="${index + 1}" title="${MONTHS[index]}: ${count.toLocaleString()} combined historical sightings"><span>${MONTHS[index].slice(0, 3)}</span><strong>${likelihood}%</strong><small>${count.toLocaleString()}</small></button>`;
    }).join("")}</div>`;
    if (highestLikelihood) {
      selectedMonth = likelihoods.indexOf(highestLikelihood) + 1;
      const bestMonth = months.querySelector(`[data-encounter-month="${selectedMonth}"]`);
      if (bestMonth) bestMonth.classList.add("selected");
      button.disabled = false; button.textContent = findButtonLabel(selectedMonth);
      await findEncounters(selectedMonth);
    } else {
      button.textContent = "No sightings";
    }
  } catch (error) {
    months.innerHTML = `<span class="encounter-month-loading">${esc(error.message || "Historical sightings could not be loaded.")}</span>`;
    button.textContent = "Unavailable";
  }
}

async function selectPlannerSpecies(taxon) {
  const input = $("encounterPrompt");
  if (!taxon || selectedTaxa.length >= MAX_WISHLIST || selectedTaxa.some(item => item.scientific === taxon.scientific)) return;
  selectedTaxa.push(taxon); input.value = ""; closeSuggestions(); renderWishlist();
  await refreshPlannerMonths();
}

export function initEncounterPlanner() {
  const input = $("encounterPrompt"), button = $("encounterFind"), results = $("encounterResults"), suggestions = $("encounterSuggestions"), months = $("encounterMonths"), selected = $("encounterSelected"); if (!input || !button || !results || !suggestions || !months || !selected) return;
  input.oninput = renderSuggestions;
  input.onfocus = renderSuggestions;
  input.onkeydown = event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setSuggestionIndex(suggestionIndex + (event.key === "ArrowDown" ? 1 : -1)); }
    else if (event.key === "Enter" && suggestionIndex >= 0) { event.preventDefault(); suggestions.querySelectorAll("button")[suggestionIndex]?.click(); }
    else if (event.key === "Escape") closeSuggestions();
  };
  suggestions.onclick = event => { const choice = event.target.closest("[data-encounter-species]"); if (!choice) return; const taxon = searchSpeciesCatalogue(choice.dataset.encounterSpecies, 1)[0]; if (taxon) selectPlannerSpecies(taxon); };
  selected.onclick = event => { const choice = event.target.closest("[data-remove-encounter-species]"); if (!choice) return; selectedTaxa = selectedTaxa.filter(taxon => taxon.scientific !== choice.dataset.removeEncounterSpecies); renderWishlist(); refreshPlannerMonths(); input.focus(); };
  months.onclick = event => { const choice = event.target.closest("[data-encounter-month]"); if (!choice) return; selectedMonth = +choice.dataset.encounterMonth; months.querySelectorAll("[data-encounter-month]").forEach(item => item.classList.toggle("selected", item === choice)); button.disabled = false; button.textContent = findButtonLabel(selectedMonth); findEncounters(selectedMonth); };
  button.onclick = () => selectedMonth && findEncounters(selectedMonth);
  document.addEventListener("pointerdown", event => { if (!event.target.closest(".encounter-species-search")) closeSuggestions(); });
  results.onclick = event => {
    const button = event.target.closest("[data-encounter-index]"); if (!button) return;
    const recommendation = recommendations[+button.dataset.encounterIndex]; if (!recommendation) return;
    openRecommendedDiveSite(recommendation.site);
    if (activeQuery) showSpeciesEvidence(activeQuery.taxa, activeQuery.month);
  };
  const highlightResult = (event, on) => {
    const row = event.target.closest("[data-encounter-index]"); if (!row || row.contains(event.relatedTarget)) return;
    highlightRecommendedDiveSite(row.dataset.encounterIndex, on);
  };
  results.addEventListener("pointerover", event => highlightResult(event, true));
  results.addEventListener("pointerout", event => highlightResult(event, false));
  results.addEventListener("focusin", event => highlightResult(event, true));
  results.addEventListener("focusout", event => highlightResult(event, false));
  renderWishlist();
}

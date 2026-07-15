// Seasonal marine-life observations from OBIS, aggregated by calendar month.

import { $ } from "./dom.js";
import { GENERATED_SPECIES } from "./species-catalogue.js";

const OBIS = "https://api.obis.org/v3";
const CACHE_LS = "tide_obis_species_v1";
const UI_LS = "tide_obis_species_ui_v2";
const DB_NAME = "livetide-marine-life";
const DB_STORE = "species";
const CACHE_TTL = 30 * 24 * 3600e3;
const MAX_RECORDS = 10000;
const MAX_SELECTED = 4;
const CELL_SIZE = 2;
const CURATED_SPECIES = [
  { common:"Whale shark", scientific:"Rhincodon typus", icon:"🦈", color:"#168b87" },
  { common:"Basking shark", scientific:"Cetorhinus maximus", icon:"🦈", color:"#527fa3" },
  { common:"Great white shark", scientific:"Carcharodon carcharias", icon:"🦈", color:"#425d70" },
  { common:"Blue shark", scientific:"Prionace glauca", icon:"🦈", color:"#367fbd" },
  { common:"Oceanic whitetip shark", scientific:"Carcharhinus longimanus", icon:"🦈", color:"#667d4f" },
  { common:"Atlantic bluefin tuna", scientific:"Thunnus thynnus", icon:"🐟", color:"#246aa0" },
  { common:"Blue whale", scientific:"Balaenoptera musculus", icon:"🐋", color:"#3468a3" },
  { common:"Humpback whale", scientific:"Megaptera novaeangliae", icon:"🐋", color:"#7352a3" },
  { common:"Sperm whale", scientific:"Physeter macrocephalus", icon:"🐋", color:"#615b85" },
  { common:"Orca", scientific:"Orcinus orca", icon:"🐋", color:"#263b4a" },
  { common:"Common bottlenose dolphin", scientific:"Tursiops truncatus", icon:"🐬", color:"#288eb5" },
  { common:"Leatherback turtle", scientific:"Dermochelys coriacea", icon:"🐢", color:"#7b6744" },
  { common:"Green turtle", scientific:"Chelonia mydas", icon:"🐢", color:"#398861" },
  { common:"Loggerhead turtle", scientific:"Caretta caretta", icon:"🐢", color:"#bd693d" },
  { common:"Ocean sunfish", scientific:"Mola mola", icon:"🐠", color:"#a67535" },
  { common:"Giant oceanic manta ray", scientific:"Mobula birostris", icon:"◆", color:"#6d5796" },
  { common:"Shortfin mako", scientific:"Isurus oxyrinchus", icon:"🦈", color:"#477d91" },
  { common:"Atlantic salmon", scientific:"Salmo salar", icon:"🐟", color:"#c05d55" },
  { common:"European eel", scientific:"Anguilla anguilla", icon:"〰", color:"#697d47" },
  { common:"Swordfish", scientific:"Xiphias gladius", icon:"🐟", color:"#3e739a" },
  { common:"Tiger shark", scientific:"Galeocerdo cuvier", icon:"🦈", color:"#8a7448" },
  { common:"Great hammerhead", scientific:"Sphyrna mokarran", icon:"🦈", color:"#596f7d" },
  { common:"Scalloped hammerhead", scientific:"Sphyrna lewini", icon:"🦈", color:"#6d8794" },
  { common:"Blacktip reef shark", scientific:"Carcharhinus melanopterus", icon:"🦈", color:"#4d6b72" },
  { common:"Grey reef shark", scientific:"Carcharhinus amblyrhynchos", icon:"🦈", color:"#70818a" },
  { common:"Bull shark", scientific:"Carcharhinus leucas", icon:"🦈", color:"#765d50" },
  { common:"Nurse shark", scientific:"Ginglymostoma cirratum", icon:"🦈", color:"#8b7259" },
  { common:"Common thresher", scientific:"Alopias vulpinus", icon:"🦈", color:"#506f91" },
  { common:"Whitetip reef shark", scientific:"Triaenodon obesus", icon:"🦈", color:"#829092" },
  { common:"Reef manta ray", scientific:"Mobula alfredi", icon:"◆", color:"#53679c" },
  { common:"Spotted eagle ray", scientific:"Aetobatus narinari", icon:"◆", color:"#356f78" },
  { common:"Blue-spotted ribbontail ray", scientific:"Taeniura lymma", icon:"◆", color:"#3189a0" },
  { common:"Dugong", scientific:"Dugong dugon", icon:"🐋", color:"#668d80" },
  { common:"West Indian manatee", scientific:"Trichechus manatus", icon:"🐋", color:"#77967a" },
  { common:"Common minke whale", scientific:"Balaenoptera acutorostrata", icon:"🐋", color:"#426b88" },
  { common:"Fin whale", scientific:"Balaenoptera physalus", icon:"🐋", color:"#36577f" },
  { common:"Sei whale", scientific:"Balaenoptera borealis", icon:"🐋", color:"#52618f" },
  { common:"Gray whale", scientific:"Eschrichtius robustus", icon:"🐋", color:"#6e7781" },
  { common:"Beluga whale", scientific:"Delphinapterus leucas", icon:"🐋", color:"#799db0" },
  { common:"Narwhal", scientific:"Monodon monoceros", icon:"🐋", color:"#6f86a3" },
  { common:"Spinner dolphin", scientific:"Stenella longirostris", icon:"🐬", color:"#2386a8" },
  { common:"Risso's dolphin", scientific:"Grampus griseus", icon:"🐬", color:"#567f96" },
  { common:"Harbour porpoise", scientific:"Phocoena phocoena", icon:"🐬", color:"#477b85" },
  { common:"Hawksbill turtle", scientific:"Eretmochelys imbricata", icon:"🐢", color:"#947642" },
  { common:"Olive ridley turtle", scientific:"Lepidochelys olivacea", icon:"🐢", color:"#71884c" },
  { common:"Kemp's ridley turtle", scientific:"Lepidochelys kempii", icon:"🐢", color:"#788f66" },
  { common:"Giant Pacific octopus", scientific:"Enteroctopus dofleini", icon:"🐙", color:"#a14f63" },
  { common:"Giant cuttlefish", scientific:"Sepia apama", icon:"🦑", color:"#9b674f" },
  { common:"Giant clam", scientific:"Tridacna gigas", icon:"🐚", color:"#9d567c" },
  { common:"Japanese flying squid", scientific:"Todarodes pacificus", icon:"🦑", color:"#b05772" },
];
const SPECIES = [...CURATED_SPECIES, ...GENERATED_SPECIES];
const MONTHS = ["All year", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CATEGORIES = [
  { id:"sharks", label:"Sharks", icon:"🦈" }, { id:"rays", label:"Rays", icon:"◆" },
  { id:"whales", label:"Whales", icon:"🐋" }, { id:"dolphins", label:"Dolphins & porpoises", icon:"🐬" },
  { id:"turtles", label:"Turtles", icon:"🐢" }, { id:"fish", label:"Fish", icon:"🐟" },
  { id:"mammals", label:"Other marine mammals", icon:"🐋" }, { id:"cephalopods", label:"Cephalopods", icon:"🐙" },
  { id:"shellfish", label:"Shellfish", icon:"🐚" },
  { id:"crustaceans", label:"Crustaceans", icon:"🦀" }, { id:"corals", label:"Corals", icon:"🪸" },
  { id:"jellyfish", label:"Jellyfish", icon:"◌" }, { id:"echinoderms", label:"Echinoderms", icon:"★" },
  { id:"seabirds", label:"Seabirds", icon:"●" }, { id:"invertebrates", label:"Other invertebrates", icon:"•" },
];

let layer = null;
let activeMap = null;
let selected = [];
let datasets = new Map();
let requestId = 0;
let activeSuggestion = -1;
let activeCategory = "";
let loading = false;
let legend = null;

const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} };
const setStatus = (text, kind = "") => { const el = $("speciesStatus"); if (el) { el.hidden = !text; el.textContent = text; el.title = text; el.dataset.kind = kind; } };
const speciesByName = value => SPECIES.find(item => [item.common, item.scientific].some(name => name.toLowerCase() === String(value || "").trim().toLowerCase()));
export function searchSpeciesCatalogue(value, limit = 10) {
  const query = String(value || "").trim().toLowerCase();
  if (query.length < 2) return [];
  return SPECIES.filter(item => item.common.toLowerCase().includes(query) || item.scientific.toLowerCase().includes(query))
    .sort((a, b) => {
      const aName = a.common.toLowerCase(), bName = b.common.toLowerCase();
      return Number(bName.startsWith(query)) - Number(aName.startsWith(query)) || aName.localeCompare(bName);
    }).slice(0, limit);
}
const isEnabled = () => !!$("speciesLayerToggle")?.checked;
const setEnabled = enabled => {
  const toggle = $("speciesLayerToggle"); if (!toggle) return;
  toggle.checked = !!enabled; toggle.setAttribute("aria-expanded", String(enabled));
};

function openSpeciesDb() {
  return new Promise(resolve => {
    if (!window.indexedDB) { resolve(null); return; }
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(DB_STORE, { keyPath:"key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function readSpeciesCache(key) {
  const db = await openSpeciesDb();
  if (db) {
    const cached = await new Promise(resolve => {
      const request = db.transaction(DB_STORE, "readonly").objectStore(DB_STORE).get(key);
      request.onsuccess = () => resolve(request.result?.value || null); request.onerror = () => resolve(null);
    });
    db.close(); if (cached) return cached;
  }
  const legacy = (read(CACHE_LS) || {})[key] || null;
  if (legacy && db !== null) writeSpeciesCache(key, legacy);
  return legacy;
}

async function writeSpeciesCache(key, value) {
  const db = await openSpeciesDb();
  if (db) {
    await new Promise(resolve => {
      const request = db.transaction(DB_STORE, "readwrite").objectStore(DB_STORE).put({ key, value });
      request.onsuccess = request.onerror = () => resolve();
    });
    db.close();
    return;
  }
  const cache = read(CACHE_LS) || {}; cache[key] = value;
  const keys = Object.keys(cache).sort((a, b) => cache[b].savedAt - cache[a].savedAt).slice(0, 5);
  write(CACHE_LS, Object.fromEntries(keys.map(cacheKey => [cacheKey, cache[cacheKey]])));
}

function speciesCategory(item) {
  if (item.category) return item.category;
  const name = item.common.toLowerCase();
  if (name.includes("shark") || name.includes("hammerhead") || name.includes("thresher")) return "sharks";
  if (name.includes("ray") || name.includes("manta")) return "rays";
  if (name.includes("dolphin") || name.includes("porpoise")) return "dolphins";
  if (name.includes("turtle")) return "turtles";
  if (name.includes("octopus") || name.includes("cuttlefish") || name.includes("squid")) return "cephalopods";
  if (name.includes("clam")) return "shellfish";
  if (name.includes("dugong") || name.includes("manatee")) return "mammals";
  if (name.includes("whale") || name.includes("orca") || name.includes("narwhal")) return "whales";
  return "fish";
}

function matchingSpecies(query) {
  const value = String(query || "").trim().toLowerCase();
  const matches = SPECIES.filter(item => !selected.some(choice => choice.scientific === item.scientific) && (!activeCategory || speciesCategory(item) === activeCategory) && (!value || item.common.toLowerCase().includes(value) || item.scientific.toLowerCase().includes(value)));
  return matches.slice(0, activeCategory ? 50 : 8);
}

function saveUi(enabled = isEnabled()) {
  const month = $("speciesMonth").value;
  write(UI_LS, { species: selected.map(item => item.scientific), month:month === "" ? null : +month, enabled:!!enabled });
}

function renderSelected() {
  const el = $("speciesSelected"); if (!el) return;
  el.innerHTML = selected.map(item => `<button type="button" data-remove-species="${item.scientific}" title="${item.common} · click to remove" aria-label="Remove ${item.common}"><span>${item.icon}</span></button>`).join("");
  const search = $("speciesSearch");
  search.placeholder = selected.length ? (selected.length >= MAX_SELECTED ? "Maximum selected" : "Search or browse") : "Search or browse species";
  search.disabled = selected.length >= MAX_SELECTED;
}

function closeSuggestions() {
  const suggestions = $("speciesSuggestions"), search = $("speciesSearch"); if (!suggestions || !search) return;
  suggestions.hidden = true; suggestions.innerHTML = ""; activeSuggestion = -1; activeCategory = "";
  search.setAttribute("aria-expanded", "false"); search.removeAttribute("aria-activedescendant");
}

function renderSuggestions() {
  const suggestions = $("speciesSuggestions"), search = $("speciesSearch"); if (!suggestions || !search || search.disabled) return;
  if (!search.value.trim() && !activeCategory) {
    suggestions.innerHTML = CATEGORIES.map((category, index) => {
      const count = SPECIES.filter(item => speciesCategory(item) === category.id && !selected.some(choice => choice.scientific === item.scientific)).length;
      return `<button type="button" role="option" id="species-option-${index}" data-category="${category.id}"><i>${category.icon}</i><span><strong>${category.label}</strong><small>${count} available</small></span><b aria-hidden="true">›</b></button>`;
    }).join("");
    suggestions.hidden = false; activeSuggestion = -1; search.setAttribute("aria-expanded", "true"); return;
  }
  const matches = matchingSpecies(search.value);
  if (!matches.length) { closeSuggestions(); return; }
  const heading = activeCategory ? `<button type="button" class="species-category-back" id="species-category-back" data-category-back><i>‹</i><span><strong>${CATEGORIES.find(category => category.id === activeCategory)?.label || "Species"}</strong><small>All categories</small></span></button>` : "";
  suggestions.innerHTML = heading + matches.map((item, index) => `<button type="button" role="option" id="species-option-${index}" data-scientific="${item.scientific}"><i style="--species-color:${item.color}">${item.icon}</i><span><strong>${item.common}</strong><small>${item.common === item.scientific ? (item.detail || "Marine species") : item.scientific}</small></span><b aria-hidden="true">+</b></button>`).join("");
  suggestions.hidden = false; activeSuggestion = -1; search.setAttribute("aria-expanded", "true");
}

function activateSuggestion(button) {
  if (!button) return;
  if (button.hasAttribute("data-category-back")) { activeCategory = ""; renderSuggestions(); return; }
  if (button.dataset.category) { activeCategory = button.dataset.category; renderSuggestions(); return; }
  if (button.dataset.scientific) addSpecies(button.dataset.scientific);
}

function addSpecies(scientific) {
  const item = speciesByName(scientific); if (!item || selected.length >= MAX_SELECTED || selected.some(choice => choice.scientific === item.scientific)) return;
  selected.push(item); $("speciesSearch").value = ""; closeSuggestions(); renderSelected(); saveUi();
  if (isEnabled() && $("speciesMonth").value !== "") loadSelection();
}

function removeSpecies(scientific) {
  selected = selected.filter(item => item.scientific !== scientific); datasets.delete(scientific); renderSelected(); saveUi(); render();
}

function moveSuggestion(direction) {
  const buttons = [...$("speciesSuggestions").querySelectorAll("button")]; if (!buttons.length) return;
  activeSuggestion = (activeSuggestion + direction + buttons.length) % buttons.length;
  buttons.forEach((button, index) => button.setAttribute("aria-selected", String(index === activeSuggestion)));
  const active = buttons[activeSuggestion]; $("speciesSearch").setAttribute("aria-activedescendant", active.id); active.scrollIntoView({ block:"nearest" });
}

function recordDate(record) {
  const raw = record.eventDate || record.date_mid || record.date_start;
  if (typeof raw === "number") return new Date(raw < 1e12 ? raw * 1000 : raw);
  return raw ? new Date(raw) : null;
}

function cleanRecords(results) {
  return (results || []).map(record => {
    const lat = +record.decimalLatitude, lng = +record.decimalLongitude, date = recordDate(record), uncertainty = +record.coordinateUncertaintyInMeters;
    return { lat, lng, month:date && !isNaN(date) ? date.getUTCMonth() + 1 : 0, year:date && !isNaN(date) ? date.getUTCFullYear() : 0, uncertainty:Number.isFinite(uncertainty) ? uncertainty : null };
  }).filter(record => Number.isFinite(record.lat) && Number.isFinite(record.lng) && record.month && record.lat >= -90 && record.lat <= 90 && record.lng >= -180 && record.lng <= 180 && (record.uncertainty == null || record.uncertainty <= 100000));
}

async function fetchSpecies(taxon) {
  const key = taxon.scientific.toLowerCase(), cached = await readSpeciesCache(key);
  if (cached && Date.now() - cached.savedAt < CACHE_TTL) return { ...cached, cached:true };
  const params = new URLSearchParams({ scientificname:taxon.scientific, size:String(MAX_RECORDS), dropped:"false", absence:"false" });
  try {
    const response = await fetch(`${OBIS}/occurrence?${params}`); if (!response.ok) throw new Error(`OBIS returned ${response.status}`);
    const payload = await response.json(), result = { records:cleanRecords(payload.results), total:+(payload.total || 0), savedAt:Date.now() };
    if (!result.records.length) throw new Error(`No dated observations found for ${taxon.common}`);
    await writeSpeciesCache(key, result); return result;
  } catch (error) {
    if (cached?.records?.length) return { ...cached, cached:true, stale:true };
    throw error;
  }
}

export function findPromptSpecies(text, limit = 4) {
  const ignored = new Set(["want","see","find","look","dive","diving","where","should","month","when","with","into","from","that","this"]);
  const categoryWords = new Set(["shark","whale","dolphin","turtle","ray","tuna","seal","fish","octopus","squid"]);
  const months = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
  const cleaned = String(text || "").toLowerCase().replace(new RegExp(`\\b(?:${months})\\b`, "g"), " ")
    .replace(/\b(?:i|a|an|the|to|for|in|during|please)\b/g, " ").replace(/\s+/g, " ").trim();
  const phrases = cleaned.split(/\s+(?:or|and)\s+|[,/]/).map(phrase => phrase.trim()).filter(Boolean);
  const found = [];
  phrases.forEach(phrase => {
    const exact = SPECIES.filter(item => [item.common, item.scientific].some(name => phrase.includes(name.toLowerCase())))
      .sort((a, b) => Math.max(b.common.length, b.scientific.length) - Math.max(a.common.length, a.scientific.length))[0];
    if (exact) { found.push(exact); return; }
    const words = new Set((phrase.match(/[a-z]{3,}/g) || []).filter(word => !ignored.has(word)));
    const distinctiveWords = new Set([...words].filter(word => !categoryWords.has(word)));
    const best = SPECIES.map(item => {
      const commonWords = item.common.toLowerCase().match(/[a-z]{3,}/g) || [];
      const overlap = commonWords.filter(word => words.has(word)).length;
      const distinctiveOverlap = commonWords.filter(word => distinctiveWords.has(word)).length;
      return { item, score:distinctiveOverlap * 100 + overlap * 10 - commonWords.length, distinctiveOverlap };
    }).filter(candidate => distinctiveWords.size ? candidate.distinctiveOverlap > 0 : candidate.score >= 7)
      .sort((a, b) => b.score - a.score)[0];
    if (best) found.push(best.item);
  });
  return found.filter((item, index) => found.findIndex(other => other.scientific === item.scientific) === index).slice(0, limit);
}

export async function getSpeciesObservations(taxon) { return fetchSpecies(taxon); }

export async function showSpeciesEvidence(taxa, month) {
  selected = (taxa || []).slice(0, MAX_SELECTED);
  const monthSelect = $("speciesMonth"), picker = $("speciesPicker"), status = $("speciesStatus");
  if (monthSelect) monthSelect.value = String(month);
  if (picker) picker.hidden = false;
  if (status) status.hidden = false;
  setEnabled(true); renderSelected(); saveUi(true);
  datasets = new Map();
  await loadSelection();
}

function render() {
  if (!activeMap || typeof L === "undefined") return;
  if (legend) { legend.remove(); legend = null; }
  if (layer) activeMap.removeLayer(layer); layer = L.layerGroup();
  if (!isEnabled() || !selected.length || !datasets.size) return;
  const month = +$("speciesMonth").value, summaries = [], heatCells = new Map(), speciesShapes = new Map();
  selected.forEach(taxon => {
    const data = datasets.get(taxon.scientific); if (!data) return;
    const observations = month ? data.records.filter(record => record.month === month) : data.records;
    const cells = new Map();
    observations.forEach(record => {
      const lat = Math.floor((record.lat + 90) / CELL_SIZE) * CELL_SIZE - 90, lng = Math.floor((record.lng + 180) / CELL_SIZE) * CELL_SIZE - 180, key = `${lat}:${lng}`, old = cells.get(key);
      cells.set(key, { lat, lng, count:(old?.count || 0) + 1 });
    });
    const ranked = [...cells.values()].sort((a, b) => b.count - a.count), peak = Math.max(1, ranked[0]?.count || 1);
    ranked.forEach(cell => {
      const key = `${cell.lat}:${cell.lng}`, combined = heatCells.get(key) || { lat:cell.lat, lng:cell.lng, entries:[] };
      combined.entries.push({ taxon, count:cell.count, strength:Math.log1p(cell.count) / Math.log1p(peak) });
      heatCells.set(key, combined);
    });
    summaries.push(`${taxon.icon} ${taxon.common} ${observations.length.toLocaleString()}`);
  });
  heatCells.forEach(cell => {
    cell.entries.sort((a, b) => selected.indexOf(a.taxon) - selected.indexOf(b.taxon));
    const parts = cell.entries.length, sliceWidth = CELL_SIZE / parts;
    const tooltip = cell.entries.map(entry => `${entry.taxon.icon} ${entry.taxon.common}: ${entry.count.toLocaleString()} observations`).join("<br>");
    cell.entries.forEach((entry, index) => {
      const west = cell.lng + sliceWidth * index, east = index === parts - 1 ? cell.lng + CELL_SIZE : west + sliceWidth;
      const base = { opacity:1, fillOpacity:.10 + entry.strength * .34, weight:.65 };
      const shape = L.rectangle([[cell.lat,west],[cell.lat + CELL_SIZE,east]], {
        color:entry.taxon.color, fillColor:entry.taxon.color, ...base,
      }).bindTooltip(tooltip).addTo(layer);
      const shapes = speciesShapes.get(entry.taxon.scientific) || [];
      shapes.push({ shape, base }); speciesShapes.set(entry.taxon.scientific, shapes);
    });
  });
  layer.addTo(activeMap);
  legend = L.control({ position:"bottomright" });
  legend.onAdd = () => {
    const el = L.DomUtil.create("div", "species-map-key");
    el.innerHTML = `<strong>Marine observations</strong>${selected.filter(item => datasets.has(item.scientific)).map(item => `<span data-highlight-species="${item.scientific}" tabindex="0"><i style="--species-color:${item.color}">${item.icon}</i>${item.common}</span>`).join("")}<small>Hover a species to highlight it</small>`;
    const highlight = scientific => {
      speciesShapes.forEach((shapes, key) => shapes.forEach(({ shape, base }) => {
        if (key === scientific) { shape.setStyle({ opacity:1, fillOpacity:Math.min(.88, base.fillOpacity + .36), weight:1.5 }); shape.bringToFront(); }
        else shape.setStyle({ opacity:.18, fillOpacity:base.fillOpacity * .12, weight:.35 });
      }));
    };
    const restore = () => speciesShapes.forEach(shapes => shapes.forEach(({ shape, base }) => shape.setStyle(base)));
    el.querySelectorAll("[data-highlight-species]").forEach(row => {
      row.addEventListener("mouseenter", () => highlight(row.dataset.highlightSpecies));
      row.addEventListener("mouseleave", restore);
      row.addEventListener("focus", () => highlight(row.dataset.highlightSpecies));
      row.addEventListener("blur", restore);
    });
    L.DomEvent.disableClickPropagation(el); return el;
  };
  legend.addTo(activeMap); setStatus(`${summaries.join(" · ")} · historical observations, not a forecast`);
}

async function loadSelection() {
  if (!selected.length) { setStatus("Select at least one species.", "error"); return; }
  const id = ++requestId; loading = true; setStatus(`Loading ${selected.length} species from OBIS...`, "loading");
  try {
    const results = await Promise.all(selected.map(async taxon => [taxon.scientific, await fetchSpecies(taxon)]));
    if (id !== requestId) return; datasets = new Map(results); saveUi(true); render();
    if (results.some(([, data]) => data.stale)) setStatus(`${$("speciesStatus").textContent} · using saved offline data`);
  } catch (error) { if (id === requestId) setStatus(error.message || "OBIS observations could not be loaded.", "error"); }
  finally { if (id === requestId) loading = false; }
}

export function syncSpeciesLayer(map) {
  activeMap = map || activeMap;
  if (isEnabled() && selected.length && !datasets.size && !loading && $("speciesMonth").value !== "") loadSelection(); else render();
}

export function initSpeciesLayer(getMap) {
  const toggle = $("speciesLayerToggle"), picker = $("speciesPicker"), search = $("speciesSearch"), month = $("speciesMonth");
  if (!toggle || !picker || !search || !month) return;
  month.innerHTML = `<option value="">Select month</option>` + MONTHS.map((name,index) => `<option value="${index}">${name}</option>`).join("");
  const saved = read(UI_LS) || read("tide_obis_species_ui_v1") || {};
  const savedNames = saved.species || [saved.scientific || saved.common || "Whale shark"];
  selected = savedNames.map(speciesByName).filter(Boolean).slice(0, MAX_SELECTED);
  month.value = saved.month == null ? "" : String(saved.month); setEnabled(!!saved.enabled); picker.hidden = !isEnabled(); $("speciesStatus").hidden = !isEnabled(); renderSelected();
  toggle.onchange = () => {
    const enabled = isEnabled(); setEnabled(enabled); picker.hidden = !enabled; $("speciesStatus").hidden = !enabled;
    activeMap = getMap(); saveUi(enabled); if (enabled && !datasets.size && month.value !== "") loadSelection(); else render();
  };
  month.onchange = () => { activeMap = getMap(); saveUi(); if (month.value !== "") loadSelection(); else render(); };
  $("speciesSelected").onclick = event => { const button = event.target.closest("[data-remove-species]"); if (button) removeSpecies(button.dataset.removeSpecies); };
  search.onfocus = renderSuggestions; search.oninput = () => { activeCategory = ""; renderSuggestions(); };
  search.onkeydown = event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); if ($("speciesSuggestions").hidden) renderSuggestions(); moveSuggestion(event.key === "ArrowDown" ? 1 : -1); return; }
    if (event.key === "Escape") { closeSuggestions(); return; }
    if (event.key === "Enter") { event.preventDefault(); const options = $("speciesSuggestions").querySelectorAll("button"); if (!$("speciesSuggestions").hidden && activeSuggestion >= 0) activateSuggestion(options[activeSuggestion]); else { const exact = speciesByName(search.value); if (exact) addSpecies(exact.scientific); } }
  };
  $("speciesSuggestions").onmousedown = event => { const option = event.target.closest("button"); if (option) { event.preventDefault(); activateSuggestion(option); } };
  search.onblur = () => setTimeout(closeSuggestions, 120);
}

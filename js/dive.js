// Dive sites layer. Data comes from the Google Apps Script proxy (PROXY_URL),
// which fetches divemap.gr server-side with the token held there — so no token
// is needed in this app. The catalogue is cached in localStorage and only
// re-pulled weekly. Wrecks (divemap.uk GeoJSON via the proxy) are a separate
// toggleable layer, also cached weekly. Falls back to OpenStreetMap (Overpass)
// when no divemap data is available.

import { S } from "./state.js";
import { $ } from "./dom.js";
import { fetchOpenMeteo } from "./providers/openmeteo.js";
import { normaliseToLow } from "./tide.js";
import { initSpeciesLayer, syncSpeciesLayer } from "./species.js";

// Optional: paste your deployed Google Apps Script /exec URL here to load
// divemap.gr live via the CORS-enabled proxy (see scripts/apps-script/Code.gs).
// Leave "" to use the local snapshot (data/divesites.json) instead.
const PROXY_URL  = "https://script.google.com/macros/s/AKfycbzbMceHEbQyN1dNAJnPLb9edL3SIAPLleitz0WdKjAC0dxDdfJCbt245XE8v_haGmyYIg/exec";

const DATA_LS    = "dive_gr_dataset_v1";    // cached full catalogue
const OSM_LS     = "dive_osm_cache_v1";     // per-location Overpass fallback
const LAYER_LS   = "dive_map_layers_v1";     // cached divemap.uk GeoJSON sets
const WRECK_LS   = "dive_wrecks_v1";         // legacy wreck cache migration path
const DIVE_UI_LS = "dive_ui_filters_v1";     // selected levels, tags and visible map layers
const FEATURE_LS = "dive_feature_enrichment_v2";
const SITE_WEATHER_LS = "dive_site_weather_v3";
const SITE_WEATHER_DAY_LS = "dive_site_weather_day_v1";
const COUNTRY_GEO_LS = "dive_country_geocode_v1";
const FEATURE_SEARCH_LS = "dive_feature_search_v1";
const FEATURE_HISTORY_LS = "dive_feature_history_v1";
const FAVOURITES_LS = "dive_site_favourites_v1";
const TTL        = 7 * 24 * 3600e3;         // refresh cached data weekly
const FEATURE_TTL = 7 * 24 * 3600e3;        // static Divemap detail; live forecasts bypass this cache
const BASE       = "https://divemap.gr/api/v1";
const RADIUS_KM  = 90;                       // show dataset sites within this of the point
const MAX_PAGES  = 60;                       // safety cap for the catalogue poll

let dataset = [];                            // full divemap.gr catalogue
let diveMap = null, diveCluster = null, meMarker = null, focusMarker = null, recommendationLayer = null;
let recommendationMarkers = [];
let divePage = 0;
let activeFeature = null;
let featureSearchTimer = null;
let layerControlTimer = null;
const appliedLayerControls = new Map();
const DIVE_PAGE_SIZE = 12;
const diveMarkers = new Map();
let highlightedMapElement = null;
const MAP_LAYERS = {
  wrecks: { label: "Wreck", color: "#8a4b21", icon: "⚓" },
  unknown: { label: "Unknown object", color: "#7352a3", icon: "?" },
  launch: { label: "Launch", color: "#218467", icon: "↘" },
  "tide-station": { label: "Tide station", color: "#1973a5", icon: "∿" },
  lighthouse: { label: "Lighthouse", color: "#b17c00", icon: "✦" },
  sites: { label: "UK dive site", color: "#b23d76", icon: "▽" },
};
const mapLayerState = Object.fromEntries(Object.keys(MAP_LAYERS).map(k => [k, { cluster: null, data: null, loading: null, markers: new Map() }]));
let wreckCluster = null, wreckData = [], wrecksLoaded = false; // retained for old cached wreck loader

const readLS  = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const writeLS = (k, o) => { try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) {} };
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const savedDiveUi = readLS(DIVE_UI_LS) || {};
const savedMapLayers = new Set((savedDiveUi.layers || []).filter(k => MAP_LAYERS[k]));

function saveDiveUi() {
  const layers = [...document.querySelectorAll("[data-map-layer]:checked")].map(input => input.dataset.mapLayer);
  writeLS(DIVE_UI_LS, { layers, catalogue: $("diveCatalogueLayer")?.checked !== false });
}

function applyDiveCatalogueSelection(on) {
  if (diveMap && diveCluster) {
    const shown = diveMap.hasLayer(diveCluster);
    if (on && !shown) diveMap.addLayer(diveCluster);
    else if (!on && shown) diveMap.removeLayer(diveCluster);
  }
  saveDiveUi();
  divePage = 0;
  if (diveMap) renderVisibleDives();
  else if (!on) { $("diveList").innerHTML = ""; $("diveResultsHead").hidden = true; }
}

const isDiveSite = site => !!site && !site._wreck && (!site.mapKind || site.mapKind === "sites");
const favouriteKey = site => String(site && (site.sourceId || site.id || `${site.name || "site"}:${(+site.latitude).toFixed(5)},${(+site.longitude).toFixed(5)}`));
const favouriteRecord = site => ({
  id: site.id || "", sourceId: site.sourceId || "", name: site.name || "Favourite dive site",
  latitude: +site.latitude, longitude: +site.longitude, mapKind: site.mapKind || "",
  dataSource: site.dataSource || "", region: site.region || "", country: site.country || "",
  description: site.description || "", difficulty_label: site.difficulty_label || "",
  difficulty_code: site.difficulty_code || "", max_depth: site.max_depth || "",
  average_rating: site.average_rating || "", total_ratings: site.total_ratings || "",
  thumbnail: site.thumbnail || "",
  tags: Array.isArray(site.tags) ? site.tags.slice(0, 12) : site.tags ? [site.tags] : [],
  aliases: Array.isArray(site.aliases) ? site.aliases.slice(0, 8) : site.aliases ? [site.aliases] : [],
});
function saveFavourites(saved) {
  const json = JSON.stringify(saved.slice(0, 100));
  const disposableCaches = [
    FEATURE_SEARCH_LS, SITE_WEATHER_DAY_LS, SITE_WEATHER_LS, OSM_LS, WRECK_LS,
    FEATURE_LS, COUNTRY_GEO_LS, LAYER_LS, DATA_LS,
  ];
  try { localStorage.setItem(FAVOURITES_LS, json); return true; }
  catch (firstError) {
    for (const key of disposableCaches) {
      try {
        if (localStorage.getItem(key) == null) continue;
        localStorage.removeItem(key);
        localStorage.setItem(FAVOURITES_LS, json);
        return true;
      } catch (e) {}
    }
    throw firstError;
  }
}
function updateFavouriteButton(site) {
  const button = $("modalFavourite"); if (!button) return;
  button.hidden = !isDiveSite(site); if (button.hidden) return;
  button.classList.remove("save-error");
  const saved = readLS(FAVOURITES_LS) || [], on = saved.some(item => item.key === favouriteKey(site));
  button.classList.toggle("on", on); button.textContent = on ? "★" : "☆";
  button.setAttribute("aria-pressed", String(on));
  button.setAttribute("aria-label", on ? "Remove dive site from favourites" : "Add dive site to favourites");
  button.title = on ? "Remove from favourites" : "Add to favourites";
}
function toggleFavourite(site) {
  if (!isDiveSite(site)) return;
  try {
    const key = favouriteKey(site), saved = readLS(FAVOURITES_LS) || [], index = saved.findIndex(item => item.key === key);
    if (index >= 0) saved.splice(index, 1);
    else saved.unshift({ key, site: favouriteRecord(site), savedAt: Date.now() });
    saveFavourites(saved);
    updateFavouriteButton(site); renderFavourites();
  } catch (e) {
    const button = $("modalFavourite"); if (button) { button.title = `Unable to save favourite: ${e && e.message || "browser storage unavailable"}`; button.classList.add("save-error"); }
    console.warn("LiveTide could not save favourite", e);
  }
}

function renderFavourites() {
  const section = $("pickerFavourites"), list = $("favouriteSites"); if (!section || !list) return;
  const saved = (readLS(FAVOURITES_LS) || []).filter(item => item && item.site);
  section.hidden = false;
  list.innerHTML = saved.length ? "" : `<p class="favourites-empty">No favourites saved yet.</p>`;
  saved.forEach(item => {
    const button = document.createElement("button"); button.type = "button"; button.className = "favourite-site";
    const site = item.site, locality = site.region || site.country || site.mapProperties?.locality || "";
    button.innerHTML = `<span>★</span><b>${esc(site.name || "Favourite dive site")}</b>${locality ? `<small>${esc(locality)}</small>` : ""}`;
    button.onclick = async () => {
      const id = String(site.sourceId || site.id || "");
      let full = dataset.find(record => String(record.sourceId || record.id) === id) || site;
      if (site.mapKind && mapLayerState[site.mapKind]) {
        const layer = mapLayerState[site.mapKind].data || await loadMapLayer(site.mapKind);
        full = layer.find(record => String(record.sourceId || record.id) === id) || full;
      }
      openDetail(full);
    };
    list.appendChild(button);
  });
}

function km(aLat, aLng, bLat, bLng) {
  const R = 6371, toR = x => x * Math.PI / 180;
  const dLa = toR(bLat - aLat), dLo = toR(bLng - aLng);
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}


function useDataset(list) {
  dataset = list; S.diveData = list;
  if (S.current && $("status").style.display === "block") loadDives();  // refresh if already live
}
function cacheAndUse(list) { writeLS(DATA_LS, { list: list, fetchedAt: Date.now() }); useDataset(list); }

/* ---- Catalogue: cached in localStorage and only re-pulled weekly (TTL) ---- */
export async function initDiveData() {
  // 1) fresh cache (< TTL) — no network at all
  const cached = readLS(DATA_LS);
  if (cached && cached.list && cached.list.length && Date.now() - cached.fetchedAt < TTL) { useDataset(cached.list); return; }

  // 2) CORS-enabled proxy (Google Apps Script), if configured — live data
  if (PROXY_URL) {
    try {
      const r = await fetch(PROXY_URL + "?set=divesites", { cache: "no-cache" });
      if (r.ok) { const list = await r.json(); if (Array.isArray(list) && list.length) { cacheAndUse(list); return; } }
    } catch (e) {}
  }
  // 3) same-origin snapshot from scripts/fetch_data.py — avoids browser CORS entirely
  try {
    const r = await fetch("data/divesites.json", { cache: "no-cache" });
    if (r.ok) { const list = await r.json(); if (Array.isArray(list) && list.length) { cacheAndUse(list); return; } }
  } catch (e) {}
  // 4) direct live poll — only works if the API sends CORS headers; else OSM fallback
  const out = [];
  let page = 1, totalPages = 1;
  do {
    let r;
    try { r = await fetch(`${BASE}/dive-sites/?page=${page}&page_size=100`); }
    catch (e) { return; }
    if (!r.ok) return;
    let j; try { j = await r.json(); } catch (e) { return; }
    (j.items || []).forEach(s => out.push(s));
    totalPages = j.total_pages || 1;
    page++;
  } while (page <= totalPages && page <= MAX_PAGES);
  if (out.length) cacheAndUse(out);
}

const difficultyLabel = code => ({ OPEN_WATER: "Open Water", ADVANCED_OPEN_WATER: "Advanced", DEEP_NITROX: "Deep / Nitrox", TECHNICAL_DIVING: "Technical" }[code] || code);

function passesFilters(s) {
  return !isNaN(+s.latitude) && !isNaN(+s.longitude);
}
// filtered but NOT limited by distance — the whole catalogue for the map
function filteredAll() { return dataset.filter(passesFilters); }
// filtered AND within RADIUS_KM of the point — for the list
function nearbyFiltered(lat, lng) { return filteredAll().filter(s => km(lat, lng, +s.latitude, +s.longitude) <= RADIUS_KM); }

/* ---- OpenStreetMap fallback (free, no key) ---- */
async function overpass(lat, lng) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const store = readLS(OSM_LS) || {};
  if (store[key] && Date.now() - store[key].fetchedAt < TTL) return store[key].list;
  const r_m = RADIUS_KM * 1000;
  const q = `[out:json][timeout:25];(node["sport"="scuba_diving"](around:${r_m},${lat},${lng});node["amenity"="dive_centre"](around:${r_m},${lat},${lng}););out center 80;`;
  let r;
  try { r = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) }); }
  catch (e) { return []; }
  if (!r.ok) return [];
  let j; try { j = await r.json(); } catch (e) { return []; }
  const list = (j.elements || []).map(e => {
    const t = e.tags || {};
    return { id: "osm" + e.id, name: t.name || "Dive site", latitude: e.lat, longitude: e.lon, description: t.description || t.note || "", country: "", difficulty_code: "", tags: [], _osm: true };
  }).filter(d => d.latitude != null);
  store[key] = { list, fetchedAt: Date.now() }; writeLS(OSM_LS, store);
  return list;
}

/* ---- Render list + map for the current location ---- */
export async function loadDives() {
  const c = S.current; if (!c || !$("diveCard")) return;
  let sites = nearbyFiltered(c.lat, c.lng);
  let source = "divemap.gr";
  if (!sites.length) { sites = await overpass(c.lat, c.lng); source = "OpenStreetMap"; }
  S.dives = sites;
  renderDives(source);
}

function renderDives(source) {
  const card = $("diveCard"); if (!card) return;
  const resultsHead = $("diveResultsHead"), src = $("diveSrc");
  if (resultsHead && src && src.parentElement !== resultsHead) resultsHead.appendChild(src);
  const c = S.current, list = $("diveCatalogueLayer")?.checked === false ? [] : (S.dives || []);
  card.style.display = "block";
  const near = list.map(s => ({ s, km: km(c.lat, c.lng, +s.latitude, +s.longitude) })).sort((a, b) => a.km - b.km).slice(0, 12);
  if (!near.length) {
    $("diveList").innerHTML = "";
    resultsHead.hidden = true;
    $("diveSrc").textContent = "";
  } else {
    resultsHead.hidden = false;
    $("diveList").innerHTML = near.map(({ s, km }) => {
      const dist = km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1) + " km";
      return `<div class="dive-row">` +
        `<button type="button" class="dive-name" data-id="${esc(s.id)}">${esc(s.name)}</button>` +
        `<span class="dive-km">${dist}</span>` +
        `<button type="button" class="dive-search" title="Search Google" data-q="${esc(s.name + " dive site")}">🔍</button>` +
      `</div>`;
    }).join("");
    $("diveSrc").textContent = source;
  }
  // map plots the whole (filtered) catalogue so zooming out shows every site;
  // the view is framed on the nearby set. List stays the nearest 12.
  renderDiveMap(dataset.length ? filteredAll() : S.dives, S.dives);
}

function renderVisibleDives() {
  if (!diveMap || !S.current) return;
  const bounds = diveMap.getBounds();
  const catalogueEnabled = $("diveCatalogueLayer")?.checked !== false;
  const catalogue = catalogueEnabled ? (dataset.length ? filteredAll() : (S.dives || [])) : [];
  const sitesInput = document.querySelector('[data-map-layer="sites"]');
  const ukSites = sitesInput && sitesInput.checked && mapLayerState.sites.data
    ? mapLayerState.sites.data.filter(passesFilters) : [];
  const selectedLayerItems = Object.entries(mapLayerState).flatMap(([kind, state]) => {
    const input = document.querySelector(`[data-map-layer="${kind}"]`);
    return input && input.checked && state.data ? state.data.filter(passesFilters) : [];
  });
  const candidates = [...catalogue, ...selectedLayerItems];
  const visible = candidates.filter(s => bounds.contains([+s.latitude, +s.longitude]));
  S.visibleDives = visible;
  const sorted = visible.map(s => ({ s, km: km(S.current.lat, S.current.lng, +s.latitude, +s.longitude) }))
    .sort((a, b) => a.km - b.km);
  if (!sorted.length) {
    $("diveList").innerHTML = "";
    $("diveResultsHead").hidden = true;
    $("diveSrc").textContent = "";
    return;
  }
  $("diveResultsHead").hidden = false;
  const visibleKinds = new Set(visible.map(s => s.mapKind).filter(Boolean));
  const labels = [];
  if (visible.some(s => !s.mapKind || s.mapKind === "sites")) labels.push("dive sites");
  const plurals = { wrecks: "wrecks", unknown: "unknown objects", launch: "launches", "tide-station": "tide stations", lighthouse: "lighthouses" };
  Object.keys(plurals).forEach(kind => { if (visibleKinds.has(kind)) labels.push(plurals[kind]); });
  $("diveResultsTitle").textContent = `Nearby ${labels.length > 1 ? labels.slice(0, -1).join(", ") + " and " + labels.at(-1) : labels[0]}`;
  const pages = Math.ceil(sorted.length / DIVE_PAGE_SIZE);
  divePage = Math.max(0, Math.min(divePage, pages - 1));
  const start = divePage * DIVE_PAGE_SIZE, shown = sorted.slice(start, start + DIVE_PAGE_SIZE);
  $("diveList").innerHTML = `<div class="dive-view-count">Showing ${start + 1}–${start + shown.length} of ${visible.length} site${visible.length === 1 ? "" : "s"}</div>` + shown.map(({ s, km }) => {
    const dist = km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1) + " km";
    return `<div class="dive-row"><button type="button" class="dive-name" data-id="${esc(s.id)}">${esc(s.name)}</button><span class="dive-km">${dist}</span><button type="button" class="dive-search" title="Search Google" data-q="${esc(s.name + " dive site")}">⌕</button></div>`;
  }).join("") + (pages > 1 ? `<div class="dive-pagination"><button type="button" data-dive-page="prev"${divePage === 0 ? " disabled" : ""}>← Previous</button><span>Page ${divePage + 1} of ${pages}</span><button type="button" data-dive-page="next"${divePage >= pages - 1 ? " disabled" : ""}>Next →</button></div>` : "");
  $("diveSrc").textContent = ukSites.length ? "map view · multiple sources" : "divemap.gr · map view";
  shown.forEach(({ s }) => {
    if (!s.mapKind) return;
    const button = [...$("diveList").querySelectorAll(".dive-name")].find(el => el.dataset.id === String(s.id));
    if (!button) return;
    const type = document.createElement("span");
    type.className = "dive-type";
    type.textContent = MAP_LAYERS[s.mapKind]?.label || "Map feature";
    button.after(type);
    const search = button.parentElement.querySelector(".dive-search");
    if (search) search.dataset.q = `${s.name} ${type.textContent}`;
  });
  if (selectedLayerItems.length) $("diveSrc").textContent = "map view \u00b7 multiple sources";
}

async function searchNamedFeatures(query) {
  const q = String(query || "").trim().toLowerCase(); if (q.length < 2) return [];
  const rankMatches = records => {
    const seen = new Set();
    return records.filter(item => {
      const key = `${item.mapKind || "dive"}:${item.sourceId || item.id}`;
      if (seen.has(key)) return false; seen.add(key);
      const names = [item.name, ...(item.aliases || []).map(alias => typeof alias === "string" ? alias : alias.alias)].filter(Boolean);
      return names.some(name => String(name).toLowerCase().includes(q));
    }).sort((a, b) => {
      const an = String(a.name || "").toLowerCase(), bn = String(b.name || "").toLowerCase();
      return Number(bn.startsWith(q)) - Number(an.startsWith(q)) || an.localeCompare(bn);
    }).slice(0, 12);
  };
  const catalogueCache = readLS(DATA_LS), layerCache = readLS(LAYER_LS) || {};
  const freshCatalogue = catalogueCache && catalogueCache.list && Date.now() - catalogueCache.fetchedAt < TTL;
  const freshWrecks = layerCache.wrecks && layerCache.wrecks.list && Date.now() - layerCache.wrecks.fetchedAt < TTL;
  const freshSites = layerCache.sites && layerCache.sites.list && Date.now() - layerCache.sites.fetchedAt < TTL;
  if (freshCatalogue && freshWrecks && freshSites) return rankMatches([...catalogueCache.list, ...layerCache.wrecks.list, ...layerCache.sites.list]);
  const queryCache = readLS(FEATURE_SEARCH_LS) || {}, cachedQuery = queryCache[q];
  if (cachedQuery && Date.now() - cachedQuery.savedAt < 3600e3) return cachedQuery.results;
  if (PROXY_URL) try {
    const response = await fetch(`${PROXY_URL}?search=${encodeURIComponent(q)}`, { cache: "no-cache" });
    const payload = response.ok ? await response.json() : null;
    if (payload && Array.isArray(payload.results) && payload.results.length) {
      const results = payload.results.map(result => {
        const state = result.mapKind && mapLayerState[result.mapKind];
        return dataset.find(item => String(item.id) === String(result.id || result.sourceId)) ||
          state && state.data && state.data.find(item => String(item.sourceId || item.id) === String(result.sourceId || result.id)) || result;
      });
      queryCache[q] = { results, savedAt: Date.now() }; writeLS(FEATURE_SEARCH_LS, queryCache);
      return results;
    }
  } catch (e) {}
  const [wrecks, ukSites] = await Promise.all([loadMapLayer("wrecks"), loadMapLayer("sites")]);
  return rankMatches([...dataset, ...(S.dives || []), ...wrecks, ...ukSites]);
}

async function renderFeatureSearch(query) {
  const dropdown = $("featureDropdown"); if (!dropdown) return;
  const results = await searchNamedFeatures(query);
  if ($("featureSearch").value.trim() !== query) return;
  dropdown.innerHTML = "";
  results.forEach(item => {
    const row = document.createElement("div"), type = item._wreck ? "Wreck" : MAP_LAYERS[item.mapKind]?.label || "Dive site";
    row.innerHTML = `${esc(item.name || type)} <small>${esc(type)}</small>`;
    row.onclick = async () => {
      dropdown.style.display = "none"; $("featureSearch").value = item.name || "";
      let selected = item;
      if (item.mapKind && !item.mapProperties && mapLayerState[item.mapKind]) {
        const layer = await loadMapLayer(item.mapKind);
        selected = layer.find(record => String(record.sourceId || record.id) === String(item.sourceId || item.id)) || item;
      }
      saveFeatureHistory(selected); openDetail(selected);
    };
    dropdown.appendChild(row);
  });
  if (!results.length) dropdown.innerHTML = `<div><small>No matching wrecks or dive sites</small></div>`;
  dropdown.style.display = "block";
}

function saveFeatureHistory(item) {
  const entry = { name: item.name || "Marine feature", kind: item.mapKind || "dive", id: String(item.sourceId || item.id || ""), lat: +item.latitude, lng: +item.longitude };
  const history = (readLS(FEATURE_HISTORY_LS) || []).filter(saved => `${saved.kind}:${saved.id}` !== `${entry.kind}:${entry.id}`);
  history.unshift(entry); writeLS(FEATURE_HISTORY_LS, history.slice(0, 12)); renderFeatureHistory();
}

function renderFeatureHistory() {
  const select = $("featureHistory"); if (!select) return;
  const history = readLS(FEATURE_HISTORY_LS) || [];
  select.innerHTML = `<option value="">Previous wrecks and dive sites</option>`;
  history.forEach((item, index) => {
    const option = document.createElement("option"); option.value = String(index); option.textContent = item.name; select.appendChild(option);
  });
  select.hidden = !history.length;
  select.onchange = () => {
    if (!select.value) return;
    const item = history[+select.value];
    if (item) { $("featureSearch").value = item.name; openSharedCard(relatedLiveTideUrl(item.kind, item.id, { lat: item.lat, lng: item.lng }, item.name)); }
    select.value = "";
  };
}

function renderDiveMap(all, near, preserveView = false) {
  all = all || []; near = near || [];
  const el = $("diveMap"); if (!el || typeof L === "undefined") return;
  const c = S.current; if (!c) return;
  if (!diveMap) {
    diveMap = L.map(el, { zoomControl: true, attributionControl: false });
    // MarkerCluster requires a valid map view before asynchronously loaded
    // proxy layers can be added.
    diveMap.setView([c.lat, c.lng], 11);
    diveMap.on("moveend", () => { divePage = 0; renderVisibleDives(); });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(diveMap);
    // cluster sites when zoomed out; they split apart as you zoom in
    diveCluster = (typeof L.markerClusterGroup === "function")
      ? L.markerClusterGroup({ maxClusterRadius: 45, showCoverageOnHover: false })
      : L.layerGroup();
    if ($("diveCatalogueLayer")?.checked !== false) diveMap.addLayer(diveCluster);
    syncSpeciesLayer(diveMap);
  }
  diveCluster.clearLayers();
  diveMarkers.clear();
  if (meMarker) { diveMap.removeLayer(meMarker); meMarker = null; }
  meMarker = L.marker([c.lat, c.lng], {
    icon: L.divIcon({ className: "me-pin", html: "📍", iconSize: [28, 28], iconAnchor: [14, 28] }),
    zIndexOffset: 1000,
  }).bindTooltip(c.name, { direction: "top", permanent: false }).addTo(diveMap);
  all.forEach(s => {
    const la = +s.latitude, lo = +s.longitude;
    if (isNaN(la) || isNaN(lo)) return;
    const marker = L.marker([la, lo], { icon: L.divIcon({ className: "map-data-icon dive-site-icon", html: "▽", iconSize: [22, 22], iconAnchor: [11, 11] }) })
      .bindTooltip(s.name).on("click", () => openDetail(s)).addTo(diveCluster);
    diveMarkers.set(String(s.id), marker);
  });
  document.querySelectorAll("[data-map-layer]").forEach(input => toggleMapLayer(input.dataset.mapLayer, input.checked));
  const pts = [[c.lat, c.lng]];
  near.forEach(s => { const la = +s.latitude, lo = +s.longitude; if (!isNaN(la) && !isNaN(lo)) pts.push([la, lo]); });
  setTimeout(() => {
    diveMap.invalidateSize();
    if (!preserveView) pts.length > 1 ? diveMap.fitBounds(pts, { padding: [25, 25], maxZoom: 12 }) : diveMap.setView([c.lat, c.lng], 11);
    else renderVisibleDives();
  }, 60);
}

/* ---- Wreck layer (divemap.uk GeoJSON via the proxy) ---- */
function pick(p, keys) { for (const k of Object.keys(p)) { if (keys.includes(k.toLowerCase())) { const v = p[k]; if (v != null && v !== "") return v; } } return ""; }
function meaningfulDescription(value, name = "", id = "") {
  const text = String(value || "").replace(/\r/g, "").split("\n")
    .filter(line => !/^\s*(?:id|name)\s*:/i.test(line)).join("\n").trim();
  if (!text) return "";
  const normal = text.toLowerCase(), repeated = [name, id].filter(Boolean).map(v => String(v).trim().toLowerCase());
  return repeated.includes(normal) ? "" : text;
}
function parseGeo(gj, kind = "wrecks", dataSource = "divemap.uk via LiveTide proxy") {
  return ((gj && gj.features) || []).map(f => {
    const g = f.geometry || {}, p = f.properties || {};
    let lat, lng;
    if (g.type === "Point" && Array.isArray(g.coordinates)) { lng = +g.coordinates[0]; lat = +g.coordinates[1]; }
    let desc = meaningfulDescription(pick(p, ["description", "summary", "desc", "notes", "remarks", "information", "generalcom"]), pick(p, ["name", "title"]), p.id);
    if (!desc && kind === "wrecks") desc = Object.entries(p).filter(([k, v]) => !["id", "name"].includes(k.toLowerCase()) && v != null && v !== "").slice(0, 12).map(([k, v]) => `${k}: ${v}`).join("\n");
    return {
      id: kind + (p.id != null ? p.id : (p.fid != null ? p.fid : Math.random().toString(36).slice(2))),
      sourceId: p.id != null ? String(p.id) : "",
      name: pick(p, ["name", "title", "feature", "vessel", "wreck_name", "featurenam", "objnam", "station", "sitename"]) || MAP_LAYERS[kind].label,
      latitude: lat, longitude: lng,
      description: desc,
      wreck: kind === "wrecks" ? { ...p } : null,
      mapProperties: { ...p },
      mapKind: kind,
      dataSource,
      _wreck: kind === "wrecks",
      country: pick(p, ["country", "nation"]),
      region: pick(p, ["region", "county", "area", "district", "locality"]),
      thumbnail: pick(p, ["thumbnail", "image", "photo", "image_url", "photo_url"]),
      max_depth: pick(p, ["max_depth", "maximum_depth", "depth", "depth_max"]),
      difficulty_label: pick(p, ["difficulty", "level", "grade"]),
      difficulty_code: pick(p, ["difficulty_code", "difficulty", "level", "grade"]),
      access_instructions: pick(p, ["access", "access_info", "directions", "diving", "entry"]),
      safety_information: pick(p, ["hazards", "hazard", "warnings", "restrictions", "safety"]),
      marine_life: pick(p, ["marine_life", "wildlife", "species"]),
      history: pick(p, ["history", "historical_information"]),
      tags: [pick(p, ["type", "category", "site_type"]), pick(p, ["access_type", "dive_type"])].filter(Boolean),
    };
  }).filter(w => !isNaN(w.latitude) && !isNaN(w.longitude));
}
async function loadWrecks() {
  if (wrecksLoaded) return wreckData;
  // 1) authoritative UKHO snapshot — same-origin, loaded fresh (so re-running the
  //    Python script takes effect immediately; not localStorage-cached)
  try {
    const r = await fetch("data/uk-wrecks.geojson", { cache: "no-cache" });
    if (r.ok) { const gj = await r.json(); const list = parseGeo(gj); if (list.length) { wreckData = list; wrecksLoaded = true; return wreckData; } }
  } catch (e) {}
  // 2) cached proxy result (weekly)
  const cached = readLS(WRECK_LS);
  if (cached && cached.list && Date.now() - cached.fetchedAt < TTL) { wreckData = cached.list; wrecksLoaded = true; return wreckData; }
  // 3) divemap.uk wrecks via the proxy → cache weekly
  if (!PROXY_URL) return [];
  try {
    const r = await fetch(PROXY_URL + "?set=wrecks", { cache: "no-cache" });
    if (!r.ok) return [];
    const gj = await r.json();
    if (gj && gj.error) return [];
    const list = parseGeo(gj);
    if (!list.length) return [];
    wreckData = list; wrecksLoaded = true; writeLS(WRECK_LS, { list, fetchedAt: Date.now() });
    return wreckData;
  } catch (e) { return []; }
}
async function toggleWrecks(on) {
  if (!diveMap) return;
  if (!on) { if (wreckCluster) diveMap.removeLayer(wreckCluster); return; }
  const list = await loadWrecks();
  if (!wreckCluster) {
    wreckCluster = (typeof L.markerClusterGroup === "function")
      ? L.markerClusterGroup({ maxClusterRadius: 50, showCoverageOnHover: false })
      : L.layerGroup();
  }
  wreckCluster.clearLayers();
  list.forEach(w => {
    L.circleMarker([w.latitude, w.longitude], { radius: 4, color: "#5a3a1a", fillColor: "#b5651d", fillOpacity: .85, weight: 1 })
      .bindTooltip(w.name).on("click", () => openDetail(w)).addTo(wreckCluster);
  });
  diveMap.addLayer(wreckCluster);
  const sd = $("diveSrc");
  if (sd && !list.length) sd.textContent = "wrecks: none returned (divemap.uk may be blocking the proxy)";
}

/* ---- Additional divemap.uk proxy layers ---- */
async function loadMapLayer(kind) {
  const state = mapLayerState[kind];
  if (state.data && state.data.length) return state.data;
  if (state.loading) return state.loading;
  state.loading = (async () => {
    // Keep the checked-in UKHO data as the preferred wreck source.
    if (kind === "wrecks") {
      try {
        const r = await fetch("data/uk-wrecks.geojson", { cache: "no-cache" });
        if (r.ok) { const list = parseGeo(await r.json(), kind, "UK Hydrographic Office (UKHO)"); if (list.length) return list; }
      } catch (e) {}
    }
    const store = readLS(LAYER_LS) || {};
    const cached = store[kind];
    if (cached && cached.list && Date.now() - cached.fetchedAt < TTL) return cached.list;
    if (!PROXY_URL) return [];
    try {
      const r = await fetch(PROXY_URL + "?set=" + encodeURIComponent(kind), { cache: "no-cache" });
      if (!r.ok) return [];
      const gj = await r.json();
      if (gj && gj.error) return [];
      const list = parseGeo(gj, kind, "divemap.uk via LiveTide proxy");
      if (list.length) { store[kind] = { list, fetchedAt: Date.now() }; writeLS(LAYER_LS, store); }
      return list;
    } catch (e) { return []; }
  })();
  const loaded = await state.loading;
  state.data = loaded && loaded.length ? loaded : null;
  state.loading = null;
  return loaded || [];
}

async function toggleMapLayer(kind, on) {
  if (!diveMap) return;
  const state = mapLayerState[kind], style = MAP_LAYERS[kind];
  if (!state) return;
  if (!on) { if (state.cluster) diveMap.removeLayer(state.cluster); renderVisibleDives(); return; }
  const list = await loadMapLayer(kind);
  const input = document.querySelector(`[data-map-layer="${kind}"]`);
  if (!input || !input.checked) return;
  if (!state.cluster) {
    state.cluster = (typeof L.markerClusterGroup === "function")
      ? L.markerClusterGroup({ maxClusterRadius: 50, showCoverageOnHover: false })
      : L.layerGroup();
  }
  state.cluster.clearLayers();
  state.markers.clear();
  const visibleItems = kind === "sites" ? list.filter(passesFilters) : list;
  visibleItems.forEach(item => {
    const marker = L.marker([item.latitude, item.longitude], { icon: L.divIcon({
      className: `map-data-icon map-data-${kind}`,
      html: style.icon,
      iconSize: [22, 22], iconAnchor: [11, 11],
    }) }).bindTooltip(item.name).on("click", () => openDetail(item)).addTo(state.cluster);
    state.markers.set(String(item.id), marker);
  });
  diveMap.addLayer(state.cluster);
  renderVisibleDives();
  const sd = $("diveSrc");
  if (sd && !list.length) sd.textContent = `${kind}: no data returned`;
}

function reconcileMapLayerUi() {
  if (!diveMap) return;
  Object.entries(mapLayerState).forEach(([kind, state]) => {
    if (!state.cluster) return;
    const checked = !!document.querySelector(`[data-map-layer="${kind}"]`)?.checked;
    const shown = diveMap.hasLayer(state.cluster);
    if (checked && !shown) diveMap.addLayer(state.cluster);
    else if (!checked && shown) diveMap.removeLayer(state.cluster);
  });
  requestAnimationFrame(() => {
    diveMap.invalidateSize({ pan: false });
    renderVisibleDives();
  });
}

async function applyMapLayerSelection(input) {
  appliedLayerControls.set(input.dataset.mapLayer, input.checked);
  divePage = 0; saveDiveUi();
  reconcileMapLayerUi();
  input.closest("label")?.classList.add("loading");
  const source = $("diveSrc"), kind = input.dataset.mapLayer, label = MAP_LAYERS[kind]?.label || kind;
  if (source && input.checked) source.textContent = `Loading ${label.toLowerCase()} data…`;
  try {
    await toggleMapLayer(kind, input.checked);
    const count = mapLayerState[kind]?.data?.length || 0;
    if (source && input.checked && !count) source.textContent = `${label}: no data returned · toggle to retry`;
  }
  catch (e) {}
  finally {
    input.closest("label")?.classList.remove("loading");
    reconcileMapLayerUi();
  }
}

function watchMapLayerControls() {
  document.querySelectorAll("[data-map-layer]").forEach(input => {
    const kind = input.dataset.mapLayer, applied = appliedLayerControls.get(kind);
    if (applied === input.checked) return;
    applyMapLayerSelection(input);
  });
}

/* ---- Rich detail overlay ---- */
const googleSearch = q => window.open("https://www.google.com/search?q=" + encodeURIComponent(q || ""), "_blank", "noopener");
const divemapFeatureUrl = (lat, lng, id = "") => `https://divemap.uk/${id ? encodeURIComponent(id) : ""}?${encodeURIComponent("Φ")}=${lat}&${encodeURIComponent("λ")}=${lng}&z=13.00`;
const recordMapUrl = s => s.mapKind
  ? divemapFeatureUrl(s.latitude, s.longitude, s.sourceId || (s.mapProperties && s.mapProperties.id) || "")
  : `https://www.google.com/maps?q=${encodeURIComponent(s.latitude + "," + s.longitude)}`;
const diveMapUrl = (lat, lng) => `https://divemap.uk/?${encodeURIComponent("Φ")}=${lat}&${encodeURIComponent("λ")}=${lng}&z=13`;

function sharedCardUrl(site = activeFeature) {
  const url = new URL(location.href);
  if (!site) return url.toString();
  const kind = site.mapKind || "dive", id = site.sourceId || site.id || "";
  url.searchParams.set("card", `${kind}:${id}`);
  url.searchParams.set("lat", site.latitude);
  url.searchParams.set("lng", site.longitude);
  url.searchParams.set("name", site.name || "Marine feature");
  return url.toString();
}
function syncSharedCardUrl(site) {
  const url = new URL(location.href);
  if (site) {
    const shared = new URL(sharedCardUrl(site));
    ["card", "lat", "lng", "name"].forEach(key => url.searchParams.set(key, shared.searchParams.get(key)));
  } else ["card", "lat", "lng", "name"].forEach(key => url.searchParams.delete(key));
  history.replaceState(null, "", url);
}
function openDetail(site) {
  // The snapshot records are already rich; the per-site /{id} call is CORS-blocked
  // in the browser too, so we render straight from the stored record.
  activeFeature = site;
  syncSharedCardUrl(site);
  renderModal(site);
  enhanceModalLocation(site);
  $("diveModal").hidden = false;
  startCountryEnrichment(site);
  startFeatureEnrichment(site);
  organiseCardSources();
}

export async function openSharedCard(input = location.href) {
  const linkedUrl = new URL(input, location.href), params = linkedUrl.searchParams, value = params.get("card");
  if (!value) return false;
  const split = value.indexOf(":"), kind = split < 0 ? "dive" : value.slice(0, split), id = split < 0 ? value : value.slice(split + 1);
  let site = null;
  if (kind === "dive") site = dataset.find(item => String(item.id) === id);
  else if (mapLayerState[kind]) {
    const list = await loadMapLayer(kind);
    site = list.find(item => String(item.sourceId || item.id) === id || String(item.id) === id);
  }
  if (!site) {
    const lat = +params.get("lat"), lng = +params.get("lng");
    if (!isNaN(lat) && !isNaN(lng)) site = { id, sourceId: id, mapKind: kind === "dive" ? "" : kind, latitude: lat, longitude: lng, name: params.get("name") || "Shared marine feature", dataSource: kind === "dive" ? "divemap.gr" : "divemap.uk via LiveTide proxy", mapProperties: {} };
  }
  if (!site) return false;
  openDetail(site);
  return true;
}

function section(title, body) {
  if (!body) return "";
  const icons = { Description: "≡", History: "◷", "Marine life": "◌", Access: "↘", Safety: "△", Hazards: "△", Facilities: "⌂", Charges: "£" };
  return `<div class="dv-sec"><h3>${icons[title] ? `<span class="section-icon">${icons[title]}</span>` : ""}${esc(title)}</h3><p>${esc(body)}</p></div>`;
}
function sourceUrl(source) {
  const value = String(source || "").toLowerCase();
  if (value.includes("divemap.uk")) return "https://divemap.uk/";
  if (value.includes("divemap.gr")) return "https://divemap.gr/";
  if (value.includes("openstreetmap")) return "https://www.openstreetmap.org/";
  if (value.includes("hydrographic") || value.includes("ukho")) return "https://www.gov.uk/government/organisations/uk-hydrographic-office";
  if (value.includes("open-meteo")) return "https://open-meteo.com/";
  return "";
}
function sourceBlock(source, label = "Data source") {
  if (!source) return "";
  const href = sourceUrl(source);
  const value = href ? `<a href="${href}" target="_blank" rel="noopener">${esc(source)} &nearr;</a>` : `<b>${esc(source)}</b>`;
  return `<div class="dv-source"><span>${esc(label)}</span>${value}</div>`;
}
function organiseCardSources() {
  const body = $("modalBody"); if (!body) return;
  const sources = [...body.querySelectorAll(".dv-source,.station-forecast-source,.enrichment-sources,.site-weather-source")];
  if (!sources.length) return;
  let tray = body.querySelector(":scope > .card-sources");
  if (!tray) {
    tray = document.createElement("div"); tray.className = "card-sources";
    tray.innerHTML = `<div class="card-sources-title">Data sources</div>`;
  }
  const sourceKey = source => {
    const links = [...source.querySelectorAll("a[href]")].map(a => a.href.replace(/\/$/, "")).sort();
    if (links.length) return links.join("|");
    return source.textContent.replace(/(?:data|forecast)?\s*sources?/ig, "").replace(/cached.*$/i, "").trim().toLowerCase();
  };
  const seen = new Set([...tray.querySelectorAll(".card-source-row")].map(sourceKey));
  sources.filter(source => !tray.contains(source)).forEach(source => {
    if (source.classList.contains("site-weather-source") && !source.querySelector("a")) {
      source.innerHTML = `<span>Forecast source</span><a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo Forecast + Marine &nearr;</a><small>Cached for 1 hour</small>`;
    }
    const key = sourceKey(source);
    if (key && seen.has(key)) { source.remove(); return; }
    if (key) seen.add(key);
    source.classList.add("card-source-row");
    tray.appendChild(source);
  });
  body.appendChild(tray);
}
function coordinate(value, positive, negative) {
  const n = +value;
  return isNaN(n) ? "" : `${Math.abs(n).toFixed(4)}° ${n >= 0 ? positive : negative}`;
}
function enhanceModalLocation(site) {
  const lat = +site.latitude, lng = +site.longitude, body = $("modalBody");
  if (!body || isNaN(lat) || isNaN(lng)) return;
  const coordinateNode = body.querySelector(".ds-position>b,.feature-coordinates>b,.wk-position>b");
  if (!coordinateNode) return;
  coordinateNode.hidden = true;
  const actions = coordinateNode.parentElement.querySelector(":scope > span") || coordinateNode.parentElement;
  const toggle = document.createElement("button");
  toggle.type = "button"; toggle.className = "location-toggle";
  toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-label", "Show location options");
  toggle.title = "Show coordinates and location options"; toggle.innerHTML = "&#8982;";
  actions.prepend(toggle);
  const inlineTarget = coordinateNode.closest(".ds-overview")?.querySelector(".ds-badges") ||
    coordinateNode.closest(".wk-overview")?.querySelector(".wk-topline");
  if (inlineTarget && actions !== inlineTarget) {
    actions.classList.add("overview-inline-actions");
    inlineTarget.appendChild(actions);
    coordinateNode.parentElement.classList.add("location-coordinate-row-empty");
  }
  const decimal = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
  const panel = document.createElement("div");
  panel.className = "location-panel"; panel.hidden = true;
  panel.innerHTML = `<b>${esc(decimal)}</b><span><button type="button" class="location-copy">Copy</button><a href="geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(site.name || "Location")})">Device maps</a><a href="https://map.openseamap.org/?zoom=15&lat=${lat}&lon=${lng}" target="_blank" rel="noopener">Nautical chart &nearr;</a><a href="https://what3words.com/?map=${lat},${lng},18" target="_blank" rel="noopener">what3words &nearr;</a></span>`;
  const overview = coordinateNode.closest(".ds-overview,.feature-overview,.wk-overview") || coordinateNode.parentElement;
  overview.insertAdjacentElement("afterend", panel);
  toggle.onclick = () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
  };
  panel.querySelector(".location-copy").onclick = async event => {
    try { await navigator.clipboard.writeText(decimal); event.currentTarget.textContent = "Copied"; }
    catch (e) { event.currentTarget.textContent = decimal; }
  };
}
const COUNTRY_CODES = { england:"GB-ENG",scotland:"GB-SCT",wales:"GB-WLS","northern ireland":"GB-NIR",uk:"GB",usa:"US" };
let isoRegionNames = null;
const ISO_NAME_TO_ALPHA2 = {};
try {
  isoRegionNames = new Intl.DisplayNames(["en"], { type: "region" });
  for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b), name = isoRegionNames.of(code);
    if (name && name !== code) ISO_NAME_TO_ALPHA2[name.toLowerCase()] = code;
  }
  Object.assign(ISO_NAME_TO_ALPHA2, { "united states of america":"US", "united kingdom":"GB", "united kingdom of great britain and northern ireland":"GB", "russian federation":"RU", "republic of ireland":"IE" });
} catch (e) {}
function resolvedCountryCode(country, iso = "") {
  const raw = String(iso || country || "").trim(), lower = raw.toLowerCase();
  return String(COUNTRY_CODES[lower] || ISO_NAME_TO_ALPHA2[lower] || (/^[A-Za-z]{2}(?:-[A-Za-z]{2,3})?$/.test(raw) ? raw : "")).toUpperCase();
}
function recordCountry(site) {
  const p = site && site.mapProperties || {}, value = site && site.country || p.country || p.country_name || p.countryCode || p.country_code || "";
  return typeof value === "object" ? { name: value.name || "", code: value.iso3166 || value.code || "" } : { name: String(value || ""), code: String(p.country_code || p.countryCode || "") };
}
function showModalCountry(name, code, key) {
  const target = $("modalCountry"); if (!target || target.dataset.countryKey !== key) return;
  const resolved = resolvedCountryCode(name || code, code), alpha2 = resolved.split("-")[0];
  const label = name || (isoRegionNames && alpha2 ? isoRegionNames.of(alpha2) : code) || "Country";
  const imageCode = resolved === "GB-NIR" ? "gb" : resolved.toLowerCase();
  target.innerHTML = imageCode ? `<img src="https://flagcdn.com/32x24/${esc(imageCode)}.png" alt="${esc(label)} flag" title="${esc(label)}" onerror="this.closest('.modal-country').hidden=true">` : "";
  target.title = label;
  target.hidden = !target.innerHTML;
}
async function startCountryEnrichment(site) {
  const target = $("modalCountry"), lat = +site.latitude, lng = +site.longitude;
  if (!target || isNaN(lat) || isNaN(lng)) return;
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`, supplied = recordCountry(site);
  target.dataset.countryKey = key; showModalCountry(supplied.name, supplied.code, key);
  const store = readLS(COUNTRY_GEO_LS) || {}, cached = store[key];
  if (cached && Date.now() - cached.savedAt < TTL) { showModalCountry(cached.name, cached.code, key); return; }
  try {
    const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
    const result = response.ok ? await response.json() : null;
    if (!result || !(result.countryName || result.countryCode)) return;
    const resolved = { name: result.countryName || result.countryCode, code: result.countryCode || "", savedAt: Date.now() };
    store[key] = resolved; writeLS(COUNTRY_GEO_LS, store); showModalCountry(resolved.name, resolved.code, key);
  } catch (e) {}
}
const weatherButton = s => `<button type="button" class="site-weather-btn" data-lat="${esc(s.latitude)}" data-lng="${esc(s.longitude)}">Weather</button>`;
const weatherPanel = () => `<div class="site-weather" id="siteWeather" hidden></div>`;

function finstrokesUrl(site) {
  const seen = new Set();
  function find(value, depth = 0) {
    if (depth > 4 || value == null) return "";
    if (typeof value === "string") {
      const match = value.match(/https?:\/\/(?:www\.)?finstrokes\.com\/[^\s"'<>]+/i);
      if (match) return match[0].replace(/[),.;]+$/, "");
      if (/^\/?shore-dive\//i.test(value)) return "https://finstrokes.com/" + value.replace(/^\//, "");
      return "";
    }
    if (typeof value !== "object" || seen.has(value)) return "";
    seen.add(value);
    for (const child of Array.isArray(value) ? value : Object.values(value)) {
      const found = find(child, depth + 1); if (found) return found;
    }
    return "";
  }
  return find(site);
}

function renderDiveSiteModal(s) {
  const aliases = (s.aliases || []).map(a => typeof a === "string" ? a : a.alias).filter(Boolean);
  const tags = (s.tags || []).map(t => typeof t === "string" ? t : t.name).filter(Boolean);
  const difficulty = s.difficulty_label || difficultyLabel(s.difficulty_code);
  const rating = s.average_rating ? `${(+s.average_rating).toFixed(1)}/10${s.total_ratings ? ` (${s.total_ratings})` : ""}` : "";
  const distance = S.current ? km(S.current.lat, S.current.lng, +s.latitude, +s.longitude) : null;
  const source = s.dataSource || (s._osm ? "OpenStreetMap" : s.mapKind ? "divemap.uk via LiveTide proxy" : "divemap.gr");
  const mapsUrl = recordMapUrl(s);
  const weatherUrl = `https://www.windy.com/${encodeURIComponent(s.latitude)}/${encodeURIComponent(s.longitude)}`;
  const finstrokes = finstrokesUrl(s);
  const enrichmentId = s.sourceId || (s.mapProperties && s.mapProperties.id) || "";
  const chip = text => `<span>${esc(text)}</span>`;
  const stat = (icon, label, value) => value ? `<div class="dv-stat"><i>${icon}</i><span>${esc(label)}</span><b>${esc(value)}</b></div>` : "";
  const stats = stat("↧", "Maximum depth", s.max_depth ? s.max_depth + " m" : "") + stat("★", "Rating", rating) + stat("⌖", "From selected spot", distance == null ? "" : distance < 1 ? Math.round(distance * 1000) + " m" : distance.toFixed(1) + " km") + stat("➤", "Shore direction", s.shore_direction ? Math.round(s.shore_direction) + "°" : "");
  const comments = (s.comments || []).map(c =>
    `<div class="dv-comment"><b>${esc((c.user && c.user.username) || "diver")}</b>${c.user && c.user.diving_certification ? ` · <span class="dv-cert">${esc(c.user.diving_certification)}</span>` : ""}<p>${esc(c.content)}</p></div>`).join("");
  $("modalBody").innerHTML =
    (s.thumbnail ? `<img class="dv-thumb" src="${esc(s.mapKind ? divemapImageUrl(s.thumbnail) : s.thumbnail)}" alt="${esc(s.name || "Dive site")}" referrerpolicy="no-referrer" onerror="this.remove()">` : "") +
    `<div class="ds-overview"><div class="ds-badges">${chip("Dive site")}${difficulty ? chip(difficulty) : ""}${tags.slice(0, 3).map(chip).join("")}</div>` +
    (aliases.length ? `<div class="dv-alias">Also known as ${esc(aliases.join(", "))}</div>` : "") +
    `<div class="ds-position"><b>${esc(coordinate(s.latitude, "N", "S"))} &nbsp; ${esc(coordinate(s.longitude, "E", "W"))}</b><span class="ds-position-actions"><button type="button" class="site-weather-btn" data-lat="${esc(s.latitude)}" data-lng="${esc(s.longitude)}">Weather</button>${finstrokes ? `<a class="finstrokes-link" href="${esc(finstrokes)}" target="_blank" rel="noopener">Finstrokes ↗</a>` : ""}<a href="${mapsUrl}" target="_blank" rel="noopener">Map ↗</a></span></div>` +
    (stats ? `<div class="dv-stats ds-stats">${stats}</div>` : "") + `</div><div class="site-weather" id="siteWeather" hidden></div>` +
    (s.region ? `<div class="ds-locality"><h3>Locality</h3><div><b>${esc(s.region)}</b></div></div>` : "") +
    section("Description", meaningfulDescription(s.description, s.name, enrichmentId || s.id)) + section("History", s.history || s.historical_information) +
    section("Marine life", s.marine_life) + section("Access", s.access_instructions) + section("Safety", s.safety_information) +
    (tags.length > 3 ? `<div class="dv-sec"><h3>Site features</h3><div class="dv-chips">${tags.map(t => `<span class="dv-chip">${esc(t)}</span>`).join("")}</div></div>` : "") +
    (comments ? `<div class="dv-sec"><h3>Reviews</h3>${comments}</div>` : "") +
    (enrichmentId && s.mapKind === "sites" ? `<div class="feature-enrichment" id="featureEnrichment" data-feature-id="${esc(enrichmentId)}"><div class="enrichment-loading"><i></i>Loading live Divemap details…</div></div>` : "") +
    sourceBlock(source);
}

function startFeatureEnrichment(site) {
  const id = site && (site.sourceId || (site.mapProperties && site.mapProperties.id));
  if (!id || !site.mapKind) return;
  let target = $("featureEnrichment");
  if (!target) {
    target = document.createElement("div");
    target.id = "featureEnrichment"; target.className = "feature-enrichment";
    $("modalBody").appendChild(target);
  }
  target.dataset.featureId = String(id);
  target.innerHTML = `<div class="enrichment-loading"><i></i>Loading live Divemap details…</div>`;
  loadFeatureEnrichment(String(id));
}

const enrichedValue = field => field && field.value != null ? String(field.value) : "";
const DIVEMAP_IMAGE_CDN = "https://media.divemap.uk/cdn-cgi/image/width=400,quality=90,dpr=1,slow-connection-quality=40,format=auto,background=white";
function divemapOriginalImageUrl(src) {
  const value = String(src || "").trim();
  if (!value || /^(?:https?:)?\/\//i.test(value) || /^(?:data|blob):/i.test(value)) return value.startsWith("//") ? "https:" + value : value;
  return "https://media.divemap.uk/" + value.replace(/^\.\//, "").replace(/^\//, "");
}
function divemapImageUrl(src) {
  const value = divemapOriginalImageUrl(src);
  if (!value || value.includes("/cdn-cgi/image/")) return value;
  const mediaOrigin = "https://media.divemap.uk";
  return value.startsWith(mediaOrigin + "/") ? DIVEMAP_IMAGE_CDN + value.slice(mediaOrigin.length) : DIVEMAP_IMAGE_CDN + "/" + value;
}
const isYouTubeUrl = value => /(?:youtube\.com|youtu\.be)/i.test(String(value || ""));
function youtubeEmbedUrl(value) {
  try {
    const url = new URL(value), host = url.hostname.replace(/^www\./, "");
    let id = host === "youtu.be" ? url.pathname.split("/").filter(Boolean)[0] : url.searchParams.get("v");
    if (!id && url.pathname.includes("/shorts/")) id = url.pathname.split("/shorts/")[1].split("/")[0];
    if (!id && url.pathname.includes("/embed/")) id = url.pathname.split("/embed/")[1].split("/")[0];
    return id ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1` : "";
  } catch (e) { return ""; }
}
function openMediaModal(url, title) {
  const modal = $("mediaModal"), content = $("mediaModalContent"), original = $("mediaModalOriginal");
  if (!modal || !content || !url) return;
  const embed = isYouTubeUrl(url) ? youtubeEmbedUrl(url) : "";
  content.innerHTML = embed
    ? `<iframe src="${esc(embed)}" title="${esc(title || "YouTube video")}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`
    : `<img src="${esc(url)}" alt="${esc(title || "Full-size media")}">`;
  original.href = url; original.textContent = embed ? "Open on YouTube ↗" : "Open original ↗";
  modal.hidden = false;
}
function closeMediaModal() {
  const modal = $("mediaModal"), content = $("mediaModalContent");
  if (modal) modal.hidden = true;
  if (content) content.innerHTML = "";
}
const relatedDistance = d => d && d.m != null ? (d.m < 1000 ? Math.round(d.m) + " m" : (d.m / 1000).toFixed(1) + " km") : "";
function relatedLiveTideUrl(kind, id, position, name) {
  const url = new URL(location.href), pos = position || {};
  url.searchParams.set("card", `${kind}:${id || ""}`);
  if (pos.lat != null) url.searchParams.set("lat", pos.lat);
  if (pos.lng != null) url.searchParams.set("lng", pos.lng);
  url.searchParams.set("name", name || "Marine feature");
  return url.toString();
}
function relatedReferenceId(reference) {
  if (reference && reference.id) return String(reference.id);
  try {
    const segment = new URL(reference && reference.href || "").pathname.split("/").filter(Boolean)[0];
    return segment && !["feature", "reference"].includes(segment.toLowerCase()) ? segment : "";
  } catch (e) { return ""; }
}
function relatedList(title, icon, items, type) {
  if (!items || !items.length) return "";
  return `<div class="enrichment-section"><h3><span class="section-icon">${icon}</span>${esc(title)}</h3><div class="related-list">${items.slice(0, 5).map(item => {
    const feature = type === "launch" ? item.feature : (item.reference && item.reference.feature);
    const reference = item.reference || {}, name = feature && feature.name || reference.refName || title;
    const id = feature && feature.id || relatedReferenceId(reference), pos = feature && feature.position || reference.position || {};
    const kind = type === "launch" ? "launch" : "tide-station";
    const href = id || (pos.lat != null && pos.lng != null) ? relatedLiveTideUrl(kind, id, pos, name) : "";
    return `<div>${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(name)}</a>` : `<b>${esc(name)}</b>`}<span>${esc(relatedDistance(item.distance))}${item.bearing != null ? ` · ${Math.round(item.bearing)}°` : ""}</span></div>`;
  }).join("")}</div></div>`;
}

function renderFeatureEnrichment(feature, fetchedAt) {
  const data = feature.data || {}, depths = feature.depths || {}, sea = feature.seaTemperature || {}, ukho = feature.ukho || {};
  const prose = [
    ["Live description", enrichedValue(data.description)], ["Diving", enrichedValue(data.descriptionDive)],
    ["Biodiversity", enrichedValue(data.descriptionBiodiversity)], ["Local tides", enrichedValue(data.descriptionTides)],
    ["History", enrichedValue(data.descriptionHistory)], ["Hazards", enrichedValue(data.hazards)],
    ["Facilities", enrichedValue(data.facilities)], ["Charges", enrichedValue(data.charges)],
  ].filter(([, value]) => value);
  const depthItems = [["Minimum", depths.minComputed], ["Average", depths.avgComputed], ["Maximum", depths.maxComputed], ["GEBCO", depths.gebco]].filter(([, v]) => v != null);
  const months = Array.isArray(sea.monthly) ? sea.monthly : [];
  const services = (data.services || []).filter(s => s && s.service);
  const refKeys = new Set();
  const refs = (feature.referenceSet || []).filter(r => {
    if (!r || !(r.href || r.refName)) return false;
    const key = String(r.refTitle || r.refName || (r.refSource && r.refSource.name) || r.href || "").trim().toLowerCase();
    if (!key || refKeys.has(key)) return false;
    refKeys.add(key); return true;
  });
  const assets = (feature.assets || []).filter(a => a && (a.thumbCached || a.image || a.href));
  const related = feature.relatedFeatures || [];
  const protectionRows = [["Designation", enrichedValue(data.protectionDesignation)], ["Protected since", enrichedValue(data.protectionDate)], ["Agency", enrichedValue(data.protectionAgency)], ["Reason", enrichedValue(data.protectionReason)]].filter(([, v]) => v);
  const ukhoRows = [["UKHO ID", ukho.wreckId], ["Status", ukho.status || ukho.wreckCategory], ["Depth", ukho.depth != null ? ukho.depth + " m" : ""], ["Water depth", ukho.waterDepth != null ? ukho.waterDepth + " m" : ""], ["Vessel", ukho.type], ["Flag", ukho.flag], ["Cargo", ukho.cargo], ["Date sunk", ukho.dateSunk], ["Condition", ukho.generalComments]].filter(([, v]) => v != null && v !== "");
  const notices = refs.flatMap(r => r.data && r.data.notices || []);
  return `<div class="enrichment-head"><span>Live Divemap enrichment</span><b>Updated ${esc(new Date(fetchedAt || Date.now()).toLocaleString())}</b></div>` +
    (assets.length ? `<div class="enrichment-assets">${assets.slice(0, 8).map(a => { const imageOriginal = divemapOriginalImageUrl(a.image || a.thumbCached || a.href), src = divemapImageUrl(a.thumbCached || a.image || a.href), href = isYouTubeUrl(a.href) ? a.href : (imageOriginal || divemapOriginalImageUrl(a.href) || src); return `<a href="${esc(href)}" target="_blank" rel="noopener" title="${esc(a.title || a.description || (isYouTubeUrl(href) ? "Watch video" : "View image"))}"><img src="${esc(src)}" alt="${esc(a.altText || a.title || feature.name || "Divemap image")}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('a').remove()"><small>${esc(a.attributionText || a.reference && a.reference.refName || "")}</small></a>`; }).join("")}</div>` : "") +
    (depthItems.length ? `<div class="enrichment-depths">${depthItems.map(([k, v]) => `<span><small>${k}</small><b>${(+v).toFixed(1)} m</b></span>`).join("")}</div>` : "") +
    prose.map(([title, value]) => section(title, value)).join("") +
    (protectionRows.length ? `<div class="enrichment-section"><h3><span class="section-icon">&#9670;</span>Protection</h3><div class="feature-details">${protectionRows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div></div>` : "") +
    (ukhoRows.length ? `<div class="enrichment-section${ukhoRows.length > 4 ? " enrichment-panel-wide" : ""}"><h3><span class="section-icon">⚓</span>UKHO details</h3><div class="feature-details">${ukhoRows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div></div>` : "") +
    (sea.current != null || months.length ? `<div class="enrichment-section sea-temp"><h3><span class="section-icon">≈</span>Sea temperature</h3>${sea.current != null ? `<strong>${Math.round(+sea.current)}°C <small>current</small></strong>` : ""}${months.length ? `<div>${months.slice(0, 12).map((v, i) => `<span><small>${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][i]}</small><b>${Math.round(+v)}°</b></span>`).join("")}</div>` : ""}</div>` : "") +
    relatedList("Nearby launches", "↘", feature.launches, "launch") + relatedList("Nearby tide stations", "∿", feature.tideStations, "tide") +
    (related.length ? `<div class="enrichment-section enrichment-panel-wide enrichment-related"><h3><span class="section-icon">⌘</span>Related features</h3><div class="related-list">${related.slice(0, 8).map(r => `<div><a href="${esc(divemapFeatureUrl(r.position && r.position.lat, r.position && r.position.lng, r.id))}" target="_blank" rel="noopener">${esc(r.name || r.type || "Feature")}</a><span>${esc(r.type || "")}</span></div>`).join("")}</div></div>` : "") +
    (notices.length ? `<div class="enrichment-section"><h3><span class="section-icon">!</span>Notices</h3>${notices.slice(0, 6).map(n => `<div class="enrichment-notice"><b>${esc(n.title || n.category || "Notice")}</b><p>${esc(n.body || "")}</p></div>`).join("")}</div>` : "") +
    (services.length ? `<div class="enrichment-section"><h3><span class="section-icon">⌂</span>Services</h3><div class="service-list">${services.map(s => `<span><b>${esc(s.service)}</b><small>${esc([s.state, s.notes].filter(Boolean).join(" · "))}</small></span>`).join("")}</div></div>` : "") +
    (refs.length ? `<div class="enrichment-sources"><span>Sources</span>${refs.slice(0, 8).map(r => r.href ? `<a href="${esc(r.href)}" target="_blank" rel="noopener">${esc(r.refTitle || r.refName || r.refSource && r.refSource.name || "Source")} ↗</a>` : `<b>${esc(r.refTitle || r.refName)}</b>`).join("")}</div>` : "");
}

async function loadFeatureEnrichment(id) {
  const target = $("featureEnrichment"); if (!target || target.dataset.featureId !== id) return;
  const store = readLS(FEATURE_LS) || {}, cached = store[id];
  if (cached && Date.now() - cached.savedAt < FEATURE_TTL) { target.innerHTML = renderFeatureEnrichment(cached.feature, cached.fetchedAt); organiseCardSources(); return; }
  try {
    const r = await fetch(PROXY_URL + "?feature=" + encodeURIComponent(id), { cache: "no-cache" });
    const result = r.ok ? await r.json() : null;
    const current = $("featureEnrichment"); if (!current || current.dataset.featureId !== id) return;
    if (!result || result.error || !result.feature) { current.innerHTML = `<div class="enrichment-unavailable">Live Divemap details are unavailable.</div>`; return; }
    store[id] = { feature: result.feature, fetchedAt: result.fetchedAt, savedAt: Date.now() };
    writeLS(FEATURE_LS, store); current.innerHTML = renderFeatureEnrichment(result.feature, result.fetchedAt); organiseCardSources();
  } catch (e) {
    const current = $("featureEnrichment"); if (current && current.dataset.featureId === id) current.innerHTML = `<div class="enrichment-unavailable">Live Divemap details are unavailable.</div>`;
  }
}

const clean = v => String(v == null ? "" : v).replace(/\r/g, "").replace(/^[\s\n]+|[\s\n]+$/g, "").replace(/\n{3,}/g, "\n\n");
const wreckValue = (p, ...keys) => clean(pick(p || {}, keys));
const metres = v => v && !isNaN(+v) ? `${(+v).toFixed(+v % 1 ? 1 : 0)} m` : v;
function wreckDate(v) {
  const s = clean(v); if (!/^\d{8}$/.test(s)) return s;
  const d = new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T00:00:00Z`);
  return isNaN(d) ? s : new Intl.DateTimeFormat([], { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(d);
}
function wreckRow(label, value) {
  return value ? `<div class="wk-row"><span>${esc(label)}</span><b>${esc(value)}</b></div>` : "";
}
function renderLaunchModal(s) {
  const p = s.mapProperties || {};
  const value = (...keys) => clean(pick(p, keys));
  const source = s.dataSource || "divemap.uk via LiveTide proxy";
  const mapsUrl = recordMapUrl(s);
  const weatherUrl = `https://www.windy.com/${encodeURIComponent(s.latitude)}/${encodeURIComponent(s.longitude)}`;
  const image = value("image", "photo", "thumbnail", "image_url", "photo_url");
  const locality = value("locality", "town", "place", "county");
  const region = value("region", "area", "district");
  const country = value("country") || "United Kingdom";
  const hazards = value("hazards", "hazard", "warnings", "warning", "restrictions");
  const facilities = value("facilities", "facility", "amenities", "services");
  const charges = value("charges", "charge", "fees", "fee", "cost", "pricing");
  const access = value("access", "access_info", "directions", "instructions");
  const operator = value("operator", "owner", "managed_by");
  const phone = value("phone", "telephone", "tel", "contact");
  const website = value("website", "url", "link");
  $("modalBody").innerHTML =
    (image ? `<img class="dv-thumb" src="${esc(divemapImageUrl(image))}" alt="${esc(s.name || "Launch point")}" referrerpolicy="no-referrer" onerror="this.remove()">` : "") +
    `<div class="ds-overview launch-overview"><div class="ds-badges launch-badges"><span>Launch</span>${value("type", "category") ? `<span>${esc(value("type", "category"))}</span>` : ""}</div>` +
    `<div class="ds-position"><b>${esc(coordinate(s.latitude, "N", "S"))} &nbsp; ${esc(coordinate(s.longitude, "E", "W"))}</b><span class="ds-position-actions">${weatherButton(s)}<a href="${mapsUrl}" target="_blank" rel="noopener">Map ↗</a></span></div>` +
    ([locality, region].filter(Boolean).length ? `<div class="compact-locality"><b>${esc([locality, region].filter(Boolean).join(" · "))}</b></div>` : "") + `</div>` + weatherPanel() +
    section("Description", value("description", "summary", "information", "notes")) + section("Hazards", hazards) +
    section("Facilities", facilities) + section("Charges", charges) + section("Access", access) +
    ((operator || phone || website) ? `<div class="dv-sec launch-contact"><h3>Contact</h3>${operator ? `<p><b>${esc(operator)}</b></p>` : ""}${phone ? `<p>${esc(phone)}</p>` : ""}${website ? `<p><a href="${esc(website)}" target="_blank" rel="noopener">Operator website ↗</a></p>` : ""}</div>` : "") +
    sourceBlock(source);
}

function renderMapFeatureModal(s) {
  const p = s.mapProperties || {}, style = MAP_LAYERS[s.mapKind] || MAP_LAYERS.unknown;
  const mapsUrl = recordMapUrl(s);
  const weatherUrl = `https://www.windy.com/${encodeURIComponent(s.latitude)}/${encodeURIComponent(s.longitude)}`;
  const skip = new Set(["name", "title", "latitude", "longitude", "lat", "lng", "lon", "id", "fid"]);
  const rows = Object.entries(p).filter(([k, v]) => !skip.has(k.toLowerCase()) && v != null && v !== "" && typeof v !== "object").slice(0, 14);
  const label = k => k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  $("modalBody").innerHTML =
    `<div class="feature-overview"><div class="feature-hero" style="--feature-color:${style.color}"><span>${style.icon}</span><div><b>${esc(style.label)}</b><small>Map feature</small></div></div>` +
    `<div class="feature-coordinates"><b>${esc(coordinate(s.latitude, "N", "S"))} &nbsp; ${esc(coordinate(s.longitude, "E", "W"))}</b><span>${weatherButton(s)}<a href="${mapsUrl}" target="_blank" rel="noopener">Map ↗</a></span></div></div>` + weatherPanel() +
    section("Description", meaningfulDescription(s.description, s.name, s.sourceId || p.id || s.id)) +
    (rows.length ? `<div class="feature-details"><h3><span class="section-icon">≡</span>Details</h3>${rows.map(([k, v]) => `<div><span>${esc(label(k))}</span><b>${esc(v)}</b></div>`).join("")}</div>` : "") +
    sourceBlock(s.dataSource || "divemap.uk via LiveTide proxy");
}

let tideStationRequest = 0;
function tideWeekChart(levels) {
  if (!levels.length) return "";
  const w = 620, h = 174, pad = 10, plotBottom = 132;
  const t0 = levels[0].t, t1 = levels[levels.length - 1].t;
  const values = levels.map(p => p.v), lo = Math.min(...values), hi = Math.max(...values), range = hi - lo || 1;
  const points = levels.map(p => {
    const x = pad + ((p.t - t0) / (t1 - t0 || 1)) * (w - pad * 2);
    const y = pad + (1 - (p.v - lo) / range) * (plotBottom - pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const now = Date.now();
  let currentMarker = "";
  if (now >= t0 && now <= t1) {
    let index = levels.findIndex(p => p.t >= now); if (index < 1) index = 1;
    const before = levels[index - 1], after = levels[index] || before;
    const ratio = after.t === before.t ? 0 : (now - before.t) / (after.t - before.t);
    const currentLevel = before.v + (after.v - before.v) * ratio;
    const x = pad + ((now - t0) / (t1 - t0 || 1)) * (w - pad * 2);
    const y = pad + (1 - (currentLevel - lo) / range) * (plotBottom - pad);
    const labelX = Math.max(38, Math.min(w - 38, x));
    currentMarker = `<g class="station-now"><line x1="${x.toFixed(1)}" y1="${pad}" x2="${x.toFixed(1)}" y2="${plotBottom}"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5"/><text x="${labelX.toFixed(1)}" y="${Math.max(13, y - 9).toFixed(1)}">Now · ${currentLevel.toFixed(2)} m</text></g>`;
  }
  const dayWidth = (w - pad * 2) / 7;
  const grid = Array.from({ length: 29 }, (_, i) => {
    const x = pad + i * dayWidth / 4, major = i % 4 === 0;
    return `<line class="${major ? "day-line" : "quarter-line"}" x1="${x}" y1="${pad}" x2="${x}" y2="${plotBottom}"/>`;
  }).join("");
  const axis = Array.from({ length: 7 }, (_, day) => {
    const x0 = pad + day * dayWidth;
    const date = new Date(t0 + day * 864e5);
    const label = new Intl.DateTimeFormat([], { weekday: "short" }).format(date);
    const quarters = ["00", "06", "12", "18"].map((q, i) => `<text class="quarter-label" x="${x0 + (i + .5) * dayWidth / 4}" y="147">${q}</text>`).join("");
    return quarters + `<text class="day-label" x="${x0 + dayWidth / 2}" y="166">${esc(label)}</text>`;
  }).join("");
  return `<div class="station-chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Seven day tide curve with current tide position and six-hour time quarters"><g class="station-grid">${grid}</g><polyline points="${points}"/>${currentMarker}<g class="station-axis">${axis}</g></svg><div><span>${lo.toFixed(2)} m</span><b>7-day tide forecast</b><span>${hi.toFixed(2)} m</span></div></div>`;
}

const WIND_DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const windCompass = deg => WIND_DIRS[Math.round((((+deg % 360) + 360) % 360) / 45) % 8];
const weatherLabel = code => ({ 0:"Clear",1:"Mostly clear",2:"Partly cloudy",3:"Overcast",45:"Fog",48:"Freezing fog",51:"Light drizzle",53:"Drizzle",55:"Heavy drizzle",61:"Light rain",63:"Rain",65:"Heavy rain",71:"Light snow",73:"Snow",75:"Heavy snow",80:"Rain showers",81:"Rain showers",82:"Heavy showers",95:"Thunderstorm" }[+code] || "Mixed conditions");

async function loadSiteWeatherDay(button) {
  const target = $("siteWeatherDay"); if (!target) return;
  const { date, lat, lng } = button.dataset;
  target.hidden = false; target.innerHTML = `<div class="wx-day-loading">Loading hourly weather…</div>`;
  document.querySelectorAll(".site-weather-day").forEach(el => el.classList.toggle("on", el === button));
  const key = `${(+lat).toFixed(3)},${(+lng).toFixed(3)}:${date}`, store = readLS(SITE_WEATHER_DAY_LS) || {};
  let cached = store[key];
  if (!cached || Date.now() - cached.savedAt > 3600e3) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}` +
      `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
      `&wind_speed_unit=kn&timezone=auto&start_date=${date}&end_date=${date}`;
    try { const response = await fetch(url); if (response.ok) cached = { data: await response.json(), savedAt: Date.now() }; } catch (e) {}
    if (cached) { store[key] = cached; writeLS(SITE_WEATHER_DAY_LS, store); }
  }
  if (!cached || !cached.data || !cached.data.hourly) { target.innerHTML = `<div class="wx-day-loading">Hourly weather is temporarily unavailable.</div>`; return; }
  const h = cached.data.hourly, units = cached.data.hourly_units || {};
  const arrow = direction => `<i class="wx-arrow" style="transform:rotate(${((+direction || 0) + 180) % 360}deg)">↑</i>`;
  target.innerHTML = `<div class="wx-day-head"><b>${new Date(date + "T12:00:00").toLocaleDateString([], { weekday:"long", day:"numeric", month:"short" })}</b><button type="button" aria-label="Close hourly weather">×</button></div>` +
    `<div class="wx-hour-grid">${(h.time || []).map((time, i) => `<div class="wx-hour"><b>${time.slice(11, 16)}</b><span>${esc(weatherLabel(h.weather_code && h.weather_code[i]))}</span><strong>${Math.round(h.temperature_2m[i])}°</strong><small>feels ${Math.round(h.apparent_temperature[i])}°</small><small>☂ ${h.precipitation_probability[i] || 0}%</small><small>${arrow(h.wind_direction_10m[i])} ${Math.round(h.wind_speed_10m[i])} ${esc(units.wind_speed_10m || "kn")}</small><small>gust ${Math.round(h.wind_gusts_10m[i])}</small></div>`).join("")}</div>`;
  target.querySelector("button").onclick = () => { target.hidden = true; document.querySelectorAll(".site-weather-day").forEach(el => el.classList.remove("on")); };
}

async function loadSiteWeather(lat, lng) {
  const target = $("siteWeather"); if (!target) return;
  const key = `${(+lat).toFixed(3)},${(+lng).toFixed(3)}`, store = readLS(SITE_WEATHER_LS) || {}, cached = store[key];
  target.hidden = false;
  if (cached && Date.now() - cached.savedAt < 3600e3) { target.innerHTML = cached.html; organiseCardSources(); return; }
  target.innerHTML = `<div class="enrichment-loading"><i></i>Loading local conditions…</div>`;
  try {
    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&current=temperature_2m,apparent_temperature,weather_code,precipitation,wind_speed_10m,wind_direction_10m,wind_gusts_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant&forecast_days=7&wind_speed_unit=kn&timezone=auto`;
    const marineUrl = `https://marine-api.open-meteo.com/v1/marine?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&current=wave_height,wave_direction,wave_period,sea_surface_temperature&timezone=auto`;
    const [forecastResponse, marineResponse] = await Promise.all([fetch(forecastUrl), fetch(marineUrl)]);
    const forecast = forecastResponse.ok ? await forecastResponse.json() : {}, marine = marineResponse.ok ? await marineResponse.json() : {};
    const c = forecast.current || {}, m = marine.current || {}, daily = forecast.daily || {};
    if (c.temperature_2m == null && m.wave_height == null) throw new Error("No weather data");
    const fact = (icon, label, value) => value === "" || value == null ? "" : `<div><i>${icon}</i><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
    const html = `<div class="site-weather-head"><b>${esc(weatherLabel(c.weather_code))}</b><span>Updated ${esc(new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}))}</span></div><div class="site-weather-grid">` +
      fact("◉", "Air", c.temperature_2m != null ? `${Math.round(c.temperature_2m)}°C${c.apparent_temperature != null ? ` · feels ${Math.round(c.apparent_temperature)}°` : ""}` : "") +
      fact("➤", "Wind", c.wind_speed_10m != null ? `${Math.round(c.wind_speed_10m)} kn ${windCompass(c.wind_direction_10m)}${c.wind_gusts_10m != null ? ` · gust ${Math.round(c.wind_gusts_10m)} kn` : ""}` : "") +
      fact("◌", "Rain", c.precipitation != null ? `${c.precipitation} mm` : "") +
      fact("≈", "Sea", m.sea_surface_temperature != null ? `${Math.round(m.sea_surface_temperature)}°C` : "") +
      fact("∿", "Waves", m.wave_height != null ? `${(+m.wave_height).toFixed(1)} m${m.wave_period != null ? ` · ${Math.round(m.wave_period)} s` : ""}${m.wave_direction != null ? ` · ${windCompass(m.wave_direction)}` : ""}` : "") +
      `</div>` + (daily.time && daily.time.length ? `<div class="site-weather-week">${daily.time.slice(0, 7).map((date, i) => {
        const day = new Intl.DateTimeFormat([], { weekday: "short" }).format(new Date(date + "T12:00:00"));
        const high = daily.temperature_2m_max && daily.temperature_2m_max[i], low = daily.temperature_2m_min && daily.temperature_2m_min[i];
        const rain = daily.precipitation_probability_max && daily.precipitation_probability_max[i], wind = daily.wind_speed_10m_max && daily.wind_speed_10m_max[i], direction = daily.wind_direction_10m_dominant && daily.wind_direction_10m_dominant[i];
        return `<button type="button" class="site-weather-day" data-date="${esc(date)}" data-lat="${esc(lat)}" data-lng="${esc(lng)}" title="Show hourly weather for ${esc(day)}"><h4>${esc(day)}</h4><span>${esc(weatherLabel(daily.weather_code && daily.weather_code[i]))}</span><b>${high != null ? Math.round(high) + "°" : "—"}<small>${low != null ? "/" + Math.round(low) + "°" : ""}</small></b><em>☂ ${rain != null ? Math.round(rain) : 0}%</em><em>➤ ${wind != null ? Math.round(wind) : "—"} kn ${direction != null ? windCompass(direction) : ""}</em></button>`;
      }).join("")}</div><div class="site-weather-day-detail" id="siteWeatherDay" hidden></div>` : "") + `<div class="site-weather-source"><span>Forecast source</span><a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo Forecast + Marine &nearr;</a><small>Cached for 1 hour</small></div>`;
    store[key] = { html, savedAt: Date.now() }; writeLS(SITE_WEATHER_LS, store); target.innerHTML = html; organiseCardSources();
  } catch (e) { target.innerHTML = `<div class="enrichment-unavailable">Local weather is temporarily unavailable.</div>`; }
}

async function fetchStationWind(lat, lng) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=wind_speed_10m,wind_direction_10m&daily=wind_speed_10m_max,wind_direction_10m_dominant&timezone=auto&forecast_days=7&timeformat=unixtime`;
  try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch (e) { return null; }
}

function renderTideDays(extremes, weather) {
  const groups = new Map();
  extremes.forEach(e => {
    const key = new Date(e.t).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(e);
  });
  const daily = weather && weather.daily || {}, hourly = weather && weather.hourly || {};
  const windUnit = weather && weather.hourly_units && weather.hourly_units.wind_speed_10m || "km/h";
  return `<div class="station-days">${[...groups.entries()].slice(0, 7).map(([day, events], index) => {
    const high = events.filter(e => e.type === "high").sort((a, b) => b.v - a.v)[0];
    const low = events.filter(e => e.type === "low").sort((a, b) => a.v - b.v)[0];
    const event = (label, e) => e ? `<span><small>${label} ${new Date(e.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small><b>${e.v.toFixed(2)} m</b></span>` : `<span><small>${label}</small><b>—</b></span>`;
    const dayStart = daily.time && daily.time[index];
    const quarters = dayStart != null && hourly.time ? [0, 6, 12, 18].map(hour => {
      const target = dayStart + hour * 3600;
      const i = hourly.time.indexOf(target), speed = i >= 0 && hourly.wind_speed_10m && hourly.wind_speed_10m[i];
      const direction = i >= 0 && hourly.wind_direction_10m && hourly.wind_direction_10m[i];
      if (speed == null) return "";
      const compass = windCompass(direction || 0);
      return `<span title="${String(hour).padStart(2, "0")}:00 · ${compass} · ${Math.round(speed)} ${esc(windUnit)}"><em>${String(hour).padStart(2, "0")}</em><i style="transform:rotate(${((+direction || 0) + 180) % 360}deg)">↑</i><b>${Math.round(speed)}</b></span>`;
    }).join("") : "";
    const wind = quarters ? `<div class="station-wind-quarters"><small>Wind · ${esc(windUnit)}</small><div>${quarters}</div></div>` : "";
    return `<div><h4>${esc(day)}</h4>${event("High", high)}${event("Low", low)}${wind}</div>`;
  }).join("")}</div>`;
}

async function loadTideStationWeek(s, requestId) {
  const target = $("stationTides"); if (!target) return;
  const [result, weather] = await Promise.all([fetchOpenMeteo(+s.latitude, +s.longitude), fetchStationWind(+s.latitude, +s.longitude)]);
  if (requestId !== tideStationRequest || !$("stationTides")) return;
  if (result.error || !result.levels || !result.levels.length) {
    target.innerHTML = `<div class="station-error">Tide forecast is temporarily unavailable. Try this station again shortly.</div>`;
    return;
  }
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = +start + 7 * 864e5;
  const levels = result.levels.filter(p => p.t >= +start && p.t < end).map(p => ({ ...p }));
  const extremes = (result.extremes || []).filter(e => e.t >= +start && e.t < end).map(e => ({ ...e }));
  normaliseToLow(levels, extremes);
  target.innerHTML = tideWeekChart(levels) + renderTideDays(extremes, weather) +
    `<div class="station-forecast-source"><span>Forecast source</span><a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo Marine + Forecast APIs &nearr;</a><small>Fetched ${new Date().toLocaleString()} · heights normalized to the forecast low · wind shown at 00, 06, 12 and 18 hours</small></div>`;
  organiseCardSources();
}

function renderTideStationModal(s) {
  const p = s.mapProperties || {}, requestId = ++tideStationRequest;
  const mapsUrl = recordMapUrl(s);
  const stationType = clean(pick(p, ["type", "category", "station_type"])) || "Tide station";
  $("modalBody").innerHTML =
    `<div class="feature-overview"><div class="feature-hero tide-station-hero"><span>∿</span><div><b>${esc(stationType)}</b><small>Marine observation point</small></div></div>` +
    `<div class="feature-coordinates"><b>${esc(coordinate(s.latitude, "N", "S"))} &nbsp; ${esc(coordinate(s.longitude, "E", "W"))}</b><span>${weatherButton(s)}<a href="${mapsUrl}" target="_blank" rel="noopener">Map ↗</a></span></div></div>` + weatherPanel() +
    sourceBlock(s.dataSource || "divemap.uk via LiveTide proxy") +
    `<div class="station-tides" id="stationTides"><div class="station-loading"><i></i><span>Loading seven days of tidal data…</span></div></div>`;
  loadTideStationWeek(s, requestId);
}

function renderWreckModal(s) {
  const p = s.wreck || {};
  const depth = wreckValue(p, "depth"), waterDepth = wreckValue(p, "water_dept", "water_depth");
  const length = wreckValue(p, "length", "sonar_leng"), width = wreckValue(p, "width", "sonar_widt");
  const height = wreckValue(p, "shadow_hei"), orientation = wreckValue(p, "orientatio", "orientation");
  const category = wreckValue(p, "wreck_cate") || "Wreck";
  const status = wreckValue(p, "general_co", "generalcom");
  const circumstances = wreckValue(p, "circumstan", "history");
  const survey = wreckValue(p, "surveying_", "surveying");
  const selectedDistance = S.current ? km(S.current.lat, S.current.lng, s.latitude, s.longitude) : null;
  const position = wreckValue(p, "position") || `${(+s.latitude).toFixed(5)}, ${(+s.longitude).toFixed(5)}`;
  const badge = (text, tone = "") => text ? `<span class="wk-badge ${tone}">${esc(text)}</span>` : "";
  const stat = (icon, label, value) => value ? `<div class="wk-stat"><span class="wk-stat-icon">${icon}</span><b>${esc(value)}</b><small>${esc(label)}</small></div>` : "";

  $("modalBody").innerHTML =
    `<div class="wk-overview"><div class="wk-topline">${badge(category, "warn")}${badge(wreckValue(p, "water_leve"))}</div>` +
    `<div class="wk-position"><b>${esc(position)}<small>${esc(wreckValue(p, "horizontal"))}</small></b><span class="ds-position-actions">${weatherButton(s)}<a href="https://www.google.com/maps?q=${encodeURIComponent(s.latitude + "," + s.longitude)}" target="_blank" rel="noopener">Map ↗</a></span></div>` +
    `<div class="wk-stats">` +
      stat("↧", "Least depth", metres(depth)) +
      stat("≋", "General depth", metres(waterDepth)) +
      stat("↔", "Length", metres(length)) +
      stat("↕", "Height", metres(height)) +
    `</div></div>` + weatherPanel() +
    `<div class="wk-section"><h3>Wreck details</h3><div class="wk-grid">` +
      wreckRow("UKHO wreck ID", wreckValue(p, "wreck_id", "id")) +
      wreckRow("Vessel type", wreckValue(p, "type")) +
      wreckRow("Flag", wreckValue(p, "flag")) +
      wreckRow("Date sunk", wreckDate(wreckValue(p, "date_sunk"))) +
      wreckRow("Dimensions", [metres(length), metres(width)].filter(Boolean).join(" × ")) +
      wreckRow("Orientation", orientation ? `${orientation}°` : "") +
      wreckRow("Tonnage", [wreckValue(p, "tonnage"), wreckValue(p, "tonnage_ty")].filter(Boolean).join(" ")) +
      wreckRow("Cargo", wreckValue(p, "cargo")) +
      wreckRow("Seabed", wreckValue(p, "bottom_tex")) +
      wreckRow("Depth quality", wreckValue(p, "depth_qual")) +
      wreckRow("Depth method", wreckValue(p, "depth_meth")) +
      wreckRow("Vertical datum", wreckValue(p, "vertical_d")) +
    `</div></div>` +
    (status ? `<div class="wk-section"><h3>Condition</h3><p>${esc(status)}</p></div>` : "") +
    (circumstances ? `<div class="wk-section"><h3>History</h3><p>${esc(circumstances)}</p></div>` : "") +
    (survey ? `<details class="wk-survey"><summary>Survey history</summary><p>${esc(survey)}</p></details>` : "") +
    `<div class="wk-section wk-source"><h3>Location</h3><p>${selectedDistance == null ? "UK waters" : `${selectedDistance.toFixed(1)} km from ${esc(S.current.name)}`}</p>` +
      `<small>Source: ${esc(s.dataSource || "UK Hydrographic Office (UKHO)")}${wreckValue(p, "last_amend") ? ` · amended ${esc(wreckDate(wreckValue(p, "last_amend")))}` : ""}</small></div>`;
}

function renderModal(s) {
  const m = $("diveModal");
  m.dataset.q = (s.name || "") + " dive site";
  m.dataset.lat = s.latitude || ""; m.dataset.lng = s.longitude || "";
  m.dataset.divemapId = s.sourceId || (s.mapProperties && s.mapProperties.id) || "";
  $("modalTitle").textContent = s.name || "Dive site";
  updateFavouriteButton(s);
  $("modalMore").textContent = s._wreck ? "Search this wreck ↗" : "Find out more ↗";
  if (s._wreck) { renderWreckModal(s); $("modalBody").insertAdjacentHTML("beforeend", sourceBlock(s.dataSource || "UK Hydrographic Office (UKHO)")); return; }
  if (s.mapKind === "launch") { renderLaunchModal(s); return; }
  if (s.mapKind === "tide-station") { renderTideStationModal(s); return; }
  if (s.mapKind && s.mapKind !== "sites") { renderMapFeatureModal(s); return; }
  renderDiveSiteModal(s); return;
  const aliases = (s.aliases || []).map(a => typeof a === "string" ? a : a.alias).filter(Boolean);
  const tags = (s.tags || []).map(t => typeof t === "string" ? t : t.name).filter(Boolean);
  const chips = arr => arr.map(t => `<span class="dv-chip">${esc(t)}</span>`).join("");
  const stat = (l, v) => v ? `<div class="dv-stat"><span>${esc(l)}</span><b>${esc(v)}</b></div>` : "";
  const rating = s.average_rating ? `${(+s.average_rating).toFixed(1)}/10${s.total_ratings ? ` (${s.total_ratings})` : ""}` : "";
  const comments = (s.comments || []).map(c =>
    `<div class="dv-comment"><b>${esc((c.user && c.user.username) || "diver")}</b>${c.user && c.user.diving_certification ? ` · <span class="dv-cert">${esc(c.user.diving_certification)}</span>` : ""}<p>${esc(c.content)}</p></div>`).join("");

  $("modalBody").innerHTML =
    (aliases.length ? `<div class="dv-alias">a.k.a. ${esc(aliases.join(", "))}</div>` : "") +
    `<div class="dv-meta">${[s.region, s.country].filter(Boolean).map(esc).join(", ")}</div>` +
    (s.thumbnail ? `<img class="dv-thumb" src="${esc(s.mapKind ? divemapImageUrl(s.thumbnail) : s.thumbnail)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : "") +
    `<div class="dv-stats">` +
      stat("Max depth", s.max_depth ? s.max_depth + " m" : "") +
      stat("Difficulty", s.difficulty_label || difficultyLabel(s.difficulty_code)) +
      stat("Rating", rating) +
      stat("Shore dir.", s.shore_direction ? Math.round(s.shore_direction) + "°" : "") +
    `</div>` +
    (tags.length ? `<div class="dv-chips">${chips(tags)}</div>` : "") +
    section("Description", s.description) +
    section("Marine life", s.marine_life) +
    section("Access", s.access_instructions) +
    section("Safety", s.safety_information) +
    (comments ? `<div class="dv-sec"><h3>Reviews</h3>${comments}</div>` : "") +
    sourceBlock(s.dataSource || (s._osm ? "OpenStreetMap" : s.mapKind ? "divemap.uk via LiveTide proxy" : "divemap.gr"));
}

/* ---- Wiring ---- */
function highlightSiteMarker(id, on) {
  if (highlightedMapElement) { highlightedMapElement.classList.remove("map-marker-highlight"); highlightedMapElement = null; }
  if (!on || !id) return;
  let marker = diveMarkers.get(String(id)), cluster = diveCluster;
  if (!marker) {
    for (const state of Object.values(mapLayerState)) {
      marker = state.markers.get(String(id));
      if (marker) { cluster = state.cluster; break; }
    }
  }
  if (!marker) return;
  const visible = cluster && typeof cluster.getVisibleParent === "function" ? cluster.getVisibleParent(marker) : marker;
  const el = visible && (typeof visible.getElement === "function" ? visible.getElement() : visible._icon);
  if (el) { el.classList.add("map-marker-highlight"); highlightedMapElement = el; }
}

function showFeatureOnMap(site) {
  const lat = +(site && site.latitude), lng = +(site && site.longitude);
  if (!diveMap || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  const card = $("diveCard");
  card.hidden = false; card.style.display = "block"; card.classList.remove("collapsed");
  $("liveUI").classList.remove("hide");
  if (focusMarker) diveMap.removeLayer(focusMarker);
  focusMarker = L.marker([lat, lng], {
    icon: L.divIcon({ className: "map-focus-pin", html: "⌖", iconSize: [34, 34], iconAnchor: [17, 17] }),
    zIndexOffset: 2000,
  }).bindTooltip(site.name || "Selected feature", { direction: "top", permanent: false }).addTo(diveMap);
  setTimeout(() => { diveMap.invalidateSize(); diveMap.setView([lat, lng], Math.max(diveMap.getZoom(), 14), { animate: true }); focusMarker.openTooltip(); }, 80);
  return true;
}

export async function getDiveCatalogue() {
  const ukSites = await loadMapLayer("sites"), seen = new Set();
  return [...dataset, ...ukSites].filter(site => {
    if (!isDiveSite(site) || !passesFilters(site)) return false;
    const source = site.mapKind || (site._osm ? "osm" : "divemap.gr");
    const id = site.sourceId || site.id;
    const key = id ? `${source}:${id}` : `${source}:${String(site.name || "").toLowerCase()}:${(+site.latitude).toFixed(4)}:${(+site.longitude).toFixed(4)}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
export function showRecommendedDiveSites(sites) {
  if (!diveMap || typeof L === "undefined") return;
  if (recommendationLayer) recommendationLayer.clearLayers();
  else recommendationLayer = L.layerGroup().addTo(diveMap);
  recommendationMarkers = [];
  const valid = (sites || []).filter(site => Number.isFinite(+site.latitude) && Number.isFinite(+site.longitude)).slice(0, 10);
  if (!valid.length) return;
  const bounds = L.latLngBounds([]);
  valid.forEach((site, index) => {
    const lat = +site.latitude, lng = +site.longitude;
    const marker = L.marker([lat, lng], {
      icon:L.divIcon({ className:"encounter-map-marker", html:`<span>${index + 1}</span>`, iconSize:[28, 34], iconAnchor:[14, 34] }),
      zIndexOffset:1500,
    }).bindTooltip(`#${index + 1} ${site.name || "Suggested dive site"}`, { direction:"top" })
      .on("click", () => openDetail(site)).addTo(recommendationLayer);
    recommendationMarkers.push(marker);
    bounds.extend([Math.max(-90, lat - 3), Math.max(-180, lng - 3)]);
    bounds.extend([Math.min(90, lat + 3), Math.min(180, lng + 3)]);
  });
  const card = $("diveCard");
  if (card) { card.hidden = false; card.style.display = "block"; card.classList.remove("collapsed"); }
  $("liveUI")?.classList.remove("hide");
  setTimeout(() => { diveMap.invalidateSize(); diveMap.fitBounds(bounds, { padding:[30, 30], maxZoom:7, animate:true }); }, 80);
}
export function highlightRecommendedDiveSite(index, on) {
  const marker = recommendationMarkers[+index]; if (!marker) return;
  const element = marker.getElement();
  if (element) element.classList.toggle("highlight", !!on);
  marker.setZIndexOffset(on ? 3000 : 1500);
  if (on) marker.openTooltip(); else marker.closeTooltip();
}
export function openRecommendedDiveSite(site) {
  if (!site) return;
  showFeatureOnMap(site); openDetail(site);
}

function setMapFullscreen(on) {
  const card = $("diveCard"), button = $("diveFullscreen"); if (!card || !button) return;
  if (on) card.classList.remove("collapsed");
  card.classList.toggle("map-fullscreen", on);
  document.body.classList.toggle("map-fullscreen-active", on);
  button.setAttribute("aria-pressed", String(on));
  button.setAttribute("aria-label", on ? "Close map fullscreen" : "Open map fullscreen");
  button.title = on ? "Close map fullscreen" : "Open map fullscreen";
  button.textContent = on ? "✕" : "⛶";
  clearTimeout(S.idleTimer);
  $("liveUI").classList.remove("hide");
  setTimeout(() => { if (diveMap) { diveMap.invalidateSize(); renderVisibleDives(); } }, 80);
  if (!on) window.dispatchEvent(new Event("mousemove"));
}

export function initDive() {
  const closeDetail = () => {
    $("diveModal").hidden = true; $("shareMenu").hidden = true;
    $("modalShare").setAttribute("aria-expanded", "false");
    activeFeature = null; syncSharedCardUrl(null);
  };
  renderFeatureHistory(); renderFavourites();
  initSpeciesLayer(() => diveMap);
  const catalogueToggle = $("diveCatalogueLayer");
  if (catalogueToggle) {
    catalogueToggle.checked = savedDiveUi.catalogue !== false;
    catalogueToggle.onchange = () => applyDiveCatalogueSelection(catalogueToggle.checked);
  }
  if ($("diveFullscreen")) $("diveFullscreen").onclick = () => setMapFullscreen(!$("diveCard").classList.contains("map-fullscreen"));
  const filterToggle = $("diveFiltersToggle"), filterBody = $("diveFiltersBody");
  if (filterToggle && filterBody) filterToggle.onclick = () => {
    const open = filterBody.hidden;
    filterBody.hidden = !open;
    filterToggle.setAttribute("aria-expanded", String(open));
    filterToggle.title = open ? "Hide map layers" : "Show map layers";
    filterToggle.classList.toggle("on", open);
    const label = filterToggle.querySelector("span"); if (label) label.textContent = open ? "Hide layers" : "Map layers";
    if (!open) filterBody.querySelectorAll("details[open]").forEach(d => { d.open = false; });
    $("diveCard").classList.toggle("filters-open", open);
  };
  document.querySelectorAll("[data-map-layer]").forEach(input => {
    input.checked = savedMapLayers.has(input.dataset.mapLayer);
    appliedLayerControls.set(input.dataset.mapLayer, input.checked);
    input.onchange = e => applyMapLayerSelection(e.target);
  });
  clearInterval(layerControlTimer);
  layerControlTimer = setInterval(watchMapLayerControls, 300);
  if ($("featureSearch")) $("featureSearch").addEventListener("input", () => {
    clearTimeout(featureSearchTimer);
    const query = $("featureSearch").value.trim();
    if (query.length < 2) { $("featureDropdown").style.display = "none"; return; }
    featureSearchTimer = setTimeout(() => renderFeatureSearch(query), 300);
  });
  document.addEventListener("click", event => {
    if ($("featureDropdown") && !$("featureDropdown").contains(event.target) && event.target !== $("featureSearch")) $("featureDropdown").style.display = "none";
  });

  $("diveList").addEventListener("click", e => {
    const pager = e.target.closest("[data-dive-page]");
    if (pager && !pager.disabled) { divePage += pager.dataset.divePage === "next" ? 1 : -1; renderVisibleDives(); return; }
    const sb = e.target.closest(".dive-search");
    if (sb) { googleSearch(sb.getAttribute("data-q")); return; }
    const n = e.target.closest(".dive-name");
    if (n) { const site = [...(S.visibleDives || []), ...(S.dives || [])].find(s => String(s.id) === n.getAttribute("data-id")); if (site) openDetail(site); }
  });
  $("diveList").addEventListener("pointerover", e => { const n = e.target.closest(".dive-name"); if (n) highlightSiteMarker(n.dataset.id, true); });
  $("diveList").addEventListener("pointerout", e => { const n = e.target.closest(".dive-name"); if (n && !n.contains(e.relatedTarget)) highlightSiteMarker(n.dataset.id, false); });
  $("diveList").addEventListener("focusin", e => { const n = e.target.closest(".dive-name"); if (n) highlightSiteMarker(n.dataset.id, true); });
  $("diveList").addEventListener("focusout", e => { const n = e.target.closest(".dive-name"); if (n) highlightSiteMarker(n.dataset.id, false); });

  $("modalClose").onclick = closeDetail;
  $("modalFavourite").onclick = () => { if (activeFeature) toggleFavourite(activeFeature); };
  $("modalShare").onclick = () => {
    const menu = $("shareMenu"), opening = menu.hidden, url = sharedCardUrl();
    const title = activeFeature?.name || "LiveTide marine feature", message = `${title} - ${url}`;
    menu.hidden = !opening; $("modalShare").setAttribute("aria-expanded", String(opening));
    if (!opening) return;
    menu.querySelector('[data-share-method="whatsapp"]').href = `https://wa.me/?text=${encodeURIComponent(message)}`;
    menu.querySelector('[data-share-method="email"]').href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(message)}`;
    menu.querySelector('[data-share-method="messenger"]').href = `fb-messenger://share/?link=${encodeURIComponent(url)}`;
  };
  $("shareMenu").addEventListener("click", async event => {
    const method = event.target.dataset.shareMethod; if (!method || !activeFeature) return;
    const url = sharedCardUrl(), title = activeFeature.name || "LiveTide marine feature";
    if (method === "device") {
      event.preventDefault();
      if (navigator.share) { try { await navigator.share({ title, text: `View ${title} on LiveTide`, url }); } catch (e) {} }
      else { try { await navigator.clipboard.writeText(url); event.target.textContent = "Link copied"; } catch (e) {} }
    } else if (method === "copy") {
      event.preventDefault();
      try { await navigator.clipboard.writeText(url); event.target.textContent = "Link copied"; } catch (e) { event.target.textContent = "Copy unavailable"; }
    }
  });
  $("modalMore").onclick = () => googleSearch($("diveModal").dataset.q);
  $("modalMap").onclick = () => {
    const feature = activeFeature; if (!feature || !showFeatureOnMap(feature)) return;
    closeDetail();
  };
  $("diveModal").addEventListener("click", e => {
    const cardLink = e.target.closest('.related-list a[href*="card="]');
    if (cardLink) { e.preventDefault(); openSharedCard(cardLink.href); return; }
    const mediaLink = e.target.closest(".enrichment-assets a, .enrichment-sources a");
    if (mediaLink && (mediaLink.closest(".enrichment-assets") || isYouTubeUrl(mediaLink.href))) {
      e.preventDefault(); openMediaModal(mediaLink.href, mediaLink.title || mediaLink.textContent.trim()); return;
    }
    const weatherButton = e.target.closest(".site-weather-btn");
    if (weatherButton) {
      const panel = $("siteWeather"), closing = panel && !panel.hidden;
      if (panel) panel.hidden = closing;
      weatherButton.textContent = closing ? "Weather" : "Hide weather";
      if (!closing) loadSiteWeather(weatherButton.dataset.lat, weatherButton.dataset.lng);
      return;
    }
    const weatherDay = e.target.closest(".site-weather-day");
    if (weatherDay) { loadSiteWeatherDay(weatherDay); return; }
    if (e.target.id === "diveModal") closeDetail();
  });
  if ($("mediaModalClose")) $("mediaModalClose").onclick = closeMediaModal;
  if ($("mediaModal")) $("mediaModal").addEventListener("click", e => { if (e.target.id === "mediaModal") closeMediaModal(); });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if ($("mediaModal") && !$("mediaModal").hidden) { closeMediaModal(); return; }
    if ($("diveCard").classList.contains("map-fullscreen")) setMapFullscreen(false);
    else closeDetail();
  });
}

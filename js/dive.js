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
const SITE_WEATHER_LS = "dive_site_weather_v2";
const COUNTRY_GEO_LS = "dive_country_geocode_v1";
const TTL        = 7 * 24 * 3600e3;         // refresh cached data weekly
const FEATURE_TTL = 7 * 24 * 3600e3;        // static Divemap detail; live forecasts bypass this cache
const BASE       = "https://divemap.gr/api/v1";
const RADIUS_KM  = 90;                       // show dataset sites within this of the point
const MAX_PAGES  = 60;                       // safety cap for the catalogue poll

let dataset = [];                            // full divemap.gr catalogue
let diveMap = null, diveCluster = null, meMarker = null;
let divePage = 0;
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
  writeLS(DIVE_UI_LS, { layers });
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
  const c = S.current, list = S.dives || [];
  card.style.display = "block";
  const near = list.map(s => ({ s, km: km(c.lat, c.lng, +s.latitude, +s.longitude) })).sort((a, b) => a.km - b.km).slice(0, 12);
  if (!near.length) {
    $("diveList").innerHTML = `<div class="dive-empty">No dive sites found near here.</div>`;
    $("diveSrc").textContent = "";
  } else {
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
  const catalogue = dataset.length ? filteredAll() : (S.dives || []);
  const sitesInput = document.querySelector('[data-map-layer="sites"]');
  const ukSites = sitesInput && sitesInput.checked && mapLayerState.sites.data
    ? mapLayerState.sites.data.filter(passesFilters) : [];
  const candidates = [...catalogue, ...ukSites];
  const visible = candidates.filter(s => bounds.contains([+s.latitude, +s.longitude]));
  S.visibleDives = visible;
  const sorted = visible.map(s => ({ s, km: km(S.current.lat, S.current.lng, +s.latitude, +s.longitude) }))
    .sort((a, b) => a.km - b.km);
  if (!sorted.length) {
    $("diveList").innerHTML = `<div class="dive-empty">No filtered dive sites in the current map view.</div>`;
    return;
  }
  const pages = Math.ceil(sorted.length / DIVE_PAGE_SIZE);
  divePage = Math.max(0, Math.min(divePage, pages - 1));
  const start = divePage * DIVE_PAGE_SIZE, shown = sorted.slice(start, start + DIVE_PAGE_SIZE);
  $("diveList").innerHTML = `<div class="dive-view-count">Showing ${start + 1}–${start + shown.length} of ${visible.length} site${visible.length === 1 ? "" : "s"}</div>` + shown.map(({ s, km }) => {
    const dist = km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1) + " km";
    return `<div class="dive-row"><button type="button" class="dive-name" data-id="${esc(s.id)}">${esc(s.name)}</button><span class="dive-km">${dist}</span><button type="button" class="dive-search" title="Search Google" data-q="${esc(s.name + " dive site")}">⌕</button></div>`;
  }).join("") + (pages > 1 ? `<div class="dive-pagination"><button type="button" data-dive-page="prev"${divePage === 0 ? " disabled" : ""}>← Previous</button><span>Page ${divePage + 1} of ${pages}</span><button type="button" data-dive-page="next"${divePage >= pages - 1 ? " disabled" : ""}>Next →</button></div>` : "");
  $("diveSrc").textContent = ukSites.length ? "map view · multiple sources" : "divemap.gr · map view";
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
    diveMap.addLayer(diveCluster);
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
  if (state.data) return state.data;
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
  state.data = await state.loading;
  state.loading = null;
  return state.data;
}

async function toggleMapLayer(kind, on) {
  if (!diveMap) return;
  const state = mapLayerState[kind], style = MAP_LAYERS[kind];
  if (!state) return;
  if (!on) { if (state.cluster) diveMap.removeLayer(state.cluster); if (kind === "sites") renderVisibleDives(); return; }
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
  if (kind === "sites") renderVisibleDives();
  const sd = $("diveSrc");
  if (sd && !list.length) sd.textContent = `${kind}: no data returned`;
}

/* ---- Rich detail overlay ---- */
const googleSearch = q => window.open("https://www.google.com/search?q=" + encodeURIComponent(q || ""), "_blank", "noopener");
const divemapFeatureUrl = (lat, lng, id = "") => `https://divemap.uk/${id ? encodeURIComponent(id) : ""}?${encodeURIComponent("Φ")}=${lat}&${encodeURIComponent("λ")}=${lng}&z=13.00`;
const recordMapUrl = s => s.mapKind
  ? divemapFeatureUrl(s.latitude, s.longitude, s.sourceId || (s.mapProperties && s.mapProperties.id) || "")
  : `https://www.google.com/maps?q=${encodeURIComponent(s.latitude + "," + s.longitude)}`;
const diveMapUrl = (lat, lng) => `https://divemap.uk/?${encodeURIComponent("Φ")}=${lat}&${encodeURIComponent("λ")}=${lng}&z=13`;

function openDetail(site) {
  // The snapshot records are already rich; the per-site /{id} call is CORS-blocked
  // in the browser too, so we render straight from the stored record.
  renderModal(site);
  $("diveModal").hidden = false;
  startCountryEnrichment(site);
  startFeatureEnrichment(site);
}

function section(title, body) {
  if (!body) return "";
  const icons = { Description: "≡", History: "◷", "Marine life": "◌", Access: "↘", Safety: "△", Hazards: "△", Facilities: "⌂", Charges: "£" };
  return `<div class="dv-sec"><h3>${icons[title] ? `<span class="section-icon">${icons[title]}</span>` : ""}${esc(title)}</h3><p>${esc(body)}</p></div>`;
}
function sourceBlock(source) {
  return source ? `<div class="dv-source"><span>Data source</span><b>${esc(source)}</b></div>` : "";
}
function coordinate(value, positive, negative) {
  const n = +value;
  return isNaN(n) ? "" : `${Math.abs(n).toFixed(4)}° ${n >= 0 ? positive : negative}`;
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
function relatedList(title, icon, items, type) {
  if (!items || !items.length) return "";
  return `<div class="enrichment-section"><h3><span class="section-icon">${icon}</span>${esc(title)}</h3><div class="related-list">${items.slice(0, 5).map(item => {
    const feature = type === "launch" ? item.feature : (item.reference && item.reference.feature);
    const reference = item.reference || {}, name = feature && feature.name || reference.refName || title;
    const id = feature && feature.id || "", pos = feature && feature.position || reference.position || {};
    const href = reference.href || (id ? divemapFeatureUrl(pos.lat, pos.lng, id) : "");
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
  if (cached && Date.now() - cached.savedAt < FEATURE_TTL) { target.innerHTML = renderFeatureEnrichment(cached.feature, cached.fetchedAt); return; }
  try {
    const r = await fetch(PROXY_URL + "?feature=" + encodeURIComponent(id), { cache: "no-cache" });
    const result = r.ok ? await r.json() : null;
    const current = $("featureEnrichment"); if (!current || current.dataset.featureId !== id) return;
    if (!result || result.error || !result.feature) { current.innerHTML = `<div class="enrichment-unavailable">Live Divemap details are unavailable.</div>`; return; }
    store[id] = { feature: result.feature, fetchedAt: result.fetchedAt, savedAt: Date.now() };
    writeLS(FEATURE_LS, store); current.innerHTML = renderFeatureEnrichment(result.feature, result.fetchedAt);
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

async function loadSiteWeather(lat, lng) {
  const target = $("siteWeather"); if (!target) return;
  const key = `${(+lat).toFixed(3)},${(+lng).toFixed(3)}`, store = readLS(SITE_WEATHER_LS) || {}, cached = store[key];
  target.hidden = false;
  if (cached && Date.now() - cached.savedAt < 3600e3) { target.innerHTML = cached.html; return; }
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
        return `<div><h4>${esc(day)}</h4><span>${esc(weatherLabel(daily.weather_code && daily.weather_code[i]))}</span><b>${high != null ? Math.round(high) + "°" : "—"}<small>${low != null ? "/" + Math.round(low) + "°" : ""}</small></b><em>☂ ${rain != null ? Math.round(rain) : 0}%</em><em>➤ ${wind != null ? Math.round(wind) : "—"} kn ${direction != null ? windCompass(direction) : ""}</em></div>`;
      }).join("")}</div>` : "") + `<div class="site-weather-source">Open-Meteo Forecast + Marine · cached for 1 hour</div>`;
    store[key] = { html, savedAt: Date.now() }; writeLS(SITE_WEATHER_LS, store); target.innerHTML = html;
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
    `<div class="station-forecast-source"><span>Forecast source</span><b>Open-Meteo Marine + Forecast APIs</b><small>Fetched ${new Date().toLocaleString()} · heights normalized to the forecast low · wind shown at 00, 06, 12 and 18 hours</small></div>`;
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
  $("modalMore").textContent = s._wreck ? "Search this wreck ↗" : "Find out more ↗";
  if (s._wreck) { renderWreckModal(s); return; }
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
    input.onchange = e => { divePage = 0; saveDiveUi(); toggleMapLayer(e.target.dataset.mapLayer, e.target.checked); };
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

  $("modalClose").onclick = () => { $("diveModal").hidden = true; };
  $("modalMore").onclick = () => googleSearch($("diveModal").dataset.q);
  $("modalMap").onclick = () => { const m = $("diveModal"); if (m.dataset.lat && m.dataset.lng) window.open(divemapFeatureUrl(m.dataset.lat, m.dataset.lng, m.dataset.divemapId), "_blank", "noopener"); };
  $("diveModal").addEventListener("click", e => {
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
    if (e.target.id === "diveModal") $("diveModal").hidden = true;
  });
  if ($("mediaModalClose")) $("mediaModalClose").onclick = closeMediaModal;
  if ($("mediaModal")) $("mediaModal").addEventListener("click", e => { if (e.target.id === "mediaModal") closeMediaModal(); });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if ($("mediaModal") && !$("mediaModal").hidden) { closeMediaModal(); return; }
    if ($("diveCard").classList.contains("map-fullscreen")) setMapFullscreen(false);
    else $("diveModal").hidden = true;
  });
}

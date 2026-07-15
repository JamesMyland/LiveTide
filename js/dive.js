// Dive sites layer, powered by the divemap.gr REST API (open project; the user
// supplies their own token). On load we poll the whole catalogue into a cached
// dataset; picking a location plots nearby sites on a map and lists them;
// clicking a site fetches its full record for a rich detail overlay. Filters by
// difficulty / country / tag. Falls back to OpenStreetMap (Overpass) when the
// divemap dataset is empty or unreachable (e.g. CORS blocked).

import { S } from "./state.js";
import { $ } from "./dom.js";

const TOKEN_LS   = "dive_api_key";          // divemap.gr token (optional)
const DATA_LS    = "dive_gr_dataset_v1";    // cached full catalogue
const OSM_LS     = "dive_osm_cache_v1";     // per-location Overpass fallback
const TTL        = 24 * 3600e3;
const BASE       = "https://divemap.gr/api/v1";
const RADIUS_KM  = 90;                       // show dataset sites within this of the point
const MAX_PAGES  = 60;                       // safety cap for the catalogue poll

let dataset = [];                            // full divemap.gr catalogue
const filters = { country: "", difficulty: "", tag: "" };
let diveMap = null, diveLayer = null;

const readLS  = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const writeLS = (k, o) => { try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) {} };
const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const authHeaders = () => { const t = getDiveKey(); return t ? { Authorization: "Bearer " + t } : {}; };

function km(aLat, aLng, bLat, bLng) {
  const R = 6371, toR = x => x * Math.PI / 180;
  const dLa = toR(bLat - aLat), dLo = toR(bLng - aLng);
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function loadDiveKey() { const k = localStorage.getItem(TOKEN_LS); if (k && $("diveKey")) $("diveKey").value = k; }
export function getDiveKey() { const el = $("diveKey"); return (el && el.value || "").trim(); }

/* ---- Catalogue: poll every page once, cache for a day ---- */
export async function initDiveData() {
  const cached = readLS(DATA_LS);
  if (cached && cached.list && Date.now() - cached.fetchedAt < TTL) { dataset = cached.list; S.diveData = dataset; buildFilters(); return; }
  const out = [];
  let page = 1, totalPages = 1;
  do {
    let r;
    try { r = await fetch(`${BASE}/dive-sites/?page=${page}&page_size=100`, { headers: authHeaders() }); }
    catch (e) { return; }                    // network / CORS -> leave dataset empty, fall back to OSM
    if (!r.ok) return;
    let j; try { j = await r.json(); } catch (e) { return; }
    (j.items || []).forEach(s => out.push(s));
    totalPages = j.total_pages || 1;
    page++;
  } while (page <= totalPages && page <= MAX_PAGES);
  dataset = out; S.diveData = out;
  writeLS(DATA_LS, { list: out, fetchedAt: Date.now() });
  buildFilters();
  if (S.current && $("status").style.display === "block") loadDives();  // refresh if already live
}

function buildFilters() {
  const countries = [...new Set(dataset.map(s => s.country).filter(Boolean))].sort();
  const diffs = [...new Set(dataset.map(s => s.difficulty_code).filter(Boolean))];
  const tags = {};
  dataset.forEach(s => (s.tags || []).forEach(t => { if (t && t.id != null) tags[t.id] = t.name; }));
  const opt = (v, label, sel) => `<option value="${esc(v)}"${sel ? " selected" : ""}>${esc(label)}</option>`;
  if ($("dfCountry")) $("dfCountry").innerHTML = opt("", "All countries") + countries.map(c => opt(c, c, c === filters.country)).join("");
  if ($("dfDiff")) $("dfDiff").innerHTML = opt("", "All levels") + diffs.map(d => opt(d, difficultyLabel(d), d === filters.difficulty)).join("");
  if ($("dfTag")) $("dfTag").innerHTML = opt("", "All tags") + Object.entries(tags).sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => opt(id, n, id === filters.tag)).join("");
}
const difficultyLabel = code => ({ OPEN_WATER: "Open Water", ADVANCED_OPEN_WATER: "Advanced", DEEP_NITROX: "Deep / Nitrox", TECHNICAL_DIVING: "Technical" }[code] || code);

function nearbyFiltered(lat, lng) {
  return dataset.filter(s => {
    if (filters.country && s.country !== filters.country) return false;
    if (filters.difficulty && s.difficulty_code !== filters.difficulty) return false;
    if (filters.tag && !(s.tags || []).some(t => String(t.id) === filters.tag)) return false;
    const la = +s.latitude, lo = +s.longitude;
    return !isNaN(la) && !isNaN(lo) && km(lat, lng, la, lo) <= RADIUS_KM;
  });
}

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
  renderDiveMap(near.map(n => n.s));
}

function renderDiveMap(sites) {
  const el = $("diveMap"); if (!el || typeof L === "undefined") return;
  const c = S.current;
  if (!diveMap) {
    diveMap = L.map(el, { zoomControl: true, attributionControl: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(diveMap);
    diveLayer = L.layerGroup().addTo(diveMap);
  }
  diveLayer.clearLayers();
  L.circleMarker([c.lat, c.lng], { radius: 6, color: "#e2554a", fillColor: "#e2554a", fillOpacity: .9, weight: 2 }).bindTooltip(c.name).addTo(diveLayer);
  const pts = [[c.lat, c.lng]];
  sites.forEach(s => {
    const la = +s.latitude, lo = +s.longitude;
    L.circleMarker([la, lo], { radius: 5, color: "#0b3d6b", fillColor: "#2a7fc4", fillOpacity: .85, weight: 1.5 })
      .bindTooltip(s.name).on("click", () => openDetail(s)).addTo(diveLayer);
    pts.push([la, lo]);
  });
  setTimeout(() => { diveMap.invalidateSize(); pts.length > 1 ? diveMap.fitBounds(pts, { padding: [25, 25], maxZoom: 12 }) : diveMap.setView([c.lat, c.lng], 11); }, 60);
}

/* ---- Rich detail overlay ---- */
const googleSearch = q => window.open("https://www.google.com/search?q=" + encodeURIComponent(q || ""), "_blank", "noopener");
const diveMapUrl = (lat, lng) => `https://divemap.uk/?${encodeURIComponent("Φ")}=${lat}&${encodeURIComponent("λ")}=${lng}&z=13`;

async function openDetail(site) {
  renderModal(site);                         // show summary immediately
  const m = $("diveModal"); m.hidden = false;
  if (site._osm || site.id == null) return;
  try {
    const r = await fetch(`${BASE}/dive-sites/${site.id}`, { headers: authHeaders() });
    if (r.ok) renderModal(await r.json());
  } catch (e) {}
}

function section(title, body) { return body ? `<div class="dv-sec"><h3>${esc(title)}</h3><p>${esc(body)}</p></div>` : ""; }

function renderModal(s) {
  const m = $("diveModal");
  m.dataset.q = (s.name || "") + " dive site";
  m.dataset.lat = s.latitude || ""; m.dataset.lng = s.longitude || "";
  $("modalTitle").textContent = s.name || "Dive site";
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
    (s.thumbnail ? `<img class="dv-thumb" src="${esc(s.thumbnail)}" alt="" referrerpolicy="no-referrer">` : "") +
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
    (comments ? `<div class="dv-sec"><h3>Reviews</h3>${comments}</div>` : "");
}

/* ---- Wiring ---- */
export function initDive() {
  $("diveSave").onclick = () => {
    const k = getDiveKey();
    if (k) localStorage.setItem(TOKEN_LS, k); else localStorage.removeItem(TOKEN_LS);
    localStorage.removeItem(DATA_LS);          // token change -> refresh catalogue
    initDiveData();
  };
  ["dfCountry", "dfDiff", "dfTag"].forEach(id => { const el = $(id); if (el) el.onchange = () => { filters.country = $("dfCountry").value; filters.difficulty = $("dfDiff").value; filters.tag = $("dfTag").value; loadDives(); }; });

  $("diveList").addEventListener("click", e => {
    const sb = e.target.closest(".dive-search");
    if (sb) { googleSearch(sb.getAttribute("data-q")); return; }
    const n = e.target.closest(".dive-name");
    if (n) { const site = (S.dives || []).find(s => String(s.id) === n.getAttribute("data-id")); if (site) openDetail(site); }
  });

  $("modalClose").onclick = () => { $("diveModal").hidden = true; };
  $("modalMore").onclick = () => googleSearch($("diveModal").dataset.q);
  $("modalMap").onclick = () => { const m = $("diveModal"); if (m.dataset.lat && m.dataset.lng) window.open(diveMapUrl(m.dataset.lat, m.dataset.lng), "_blank", "noopener"); };
  $("diveModal").addEventListener("click", e => { if (e.target.id === "diveModal") $("diveModal").hidden = true; });
  document.addEventListener("keydown", e => { if (e.key === "Escape") $("diveModal").hidden = true; });
}

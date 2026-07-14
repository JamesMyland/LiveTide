// "Dive sites nearby" layer.
//   Primary: divemap.gr REST API (rich data — description, depth, difficulty).
//            Reads are public; an optional token raises rate limits.
//   Fallback: OpenStreetMap dive sites/centres via Overpass (free, no key).

import { S } from "./state.js";
import { $ } from "./dom.js";

const DIVE_KEY_LS    = "dive_api_key";        // divemap.gr token (optional)
const OSM_CACHE_LS   = "dive_osm_cache_v1";   // per-location Overpass results
const DM_CACHE_LS    = "dive_divemap_cache";  // per-country divemap results
const COUNTRY_LS     = "dive_country_cache";  // reverse-geocoded country per coord
const TTL = 24 * 3600e3;                      // dive sites change rarely
const RADIUS_KM = 30;                         // Overpass search radius

const DIVEMAP_BASE = "https://divemap.gr/api/v1";
const DM_RADIUS_KM = 80;                      // keep divemap results within this of the point

const readLS  = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch (e) { return {}; } };
const writeLS = (k, o) => { try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) {} };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function km(aLat, aLng, bLat, bLng) {
  const R = 6371, toR = x => x * Math.PI / 180;
  const dLa = toR(bLat - aLat), dLo = toR(bLng - aLng);
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function loadDiveKey() { const k = localStorage.getItem(DIVE_KEY_LS); if (k && $("diveKey")) $("diveKey").value = k; }
export function getDiveKey() { const el = $("diveKey"); return (el && el.value || "").trim(); }

/* Free default: OpenStreetMap dive sites / centres / shops via Overpass. */
async function fetchOverpass(lat, lng) {
  const r_m = RADIUS_KM * 1000;
  const q = `[out:json][timeout:25];(` +
    `node["sport"="scuba_diving"](around:${r_m},${lat},${lng});` +
    `node["amenity"="dive_centre"](around:${r_m},${lat},${lng});` +
    `node["shop"="scuba_diving"](around:${r_m},${lat},${lng});` +
    `);out center 80;`;
  let r;
  try { r = await fetch("https://overpass-api.de/api/interpreter", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q) }); }
  catch (e) { return null; }
  if (!r.ok) return null;
  let j; try { j = await r.json(); } catch (e) { return null; }
  return (j.elements || []).map(e => {
    const la = e.lat != null ? e.lat : (e.center && e.center.lat);
    const lo = e.lon != null ? e.lon : (e.center && e.center.lon);
    const t = e.tags || {};
    const kind = t.amenity === "dive_centre" ? "centre" : (t.shop === "scuba_diving" ? "shop" : (t["scuba_diving:type"] || "site"));
    return { name: t.name || (kind === "centre" ? "Dive centre" : kind === "shop" ? "Dive shop" : "Dive site"), type: kind, lat: la, lng: lo, desc: t.description || t.note || "", source: "OpenStreetMap" };
  }).filter(d => d.lat != null && d.lng != null);
}
async function overpassCached(lat, lng) {
  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const store = readLS(OSM_CACHE_LS); const hit = store[key];
  if (hit && Date.now() - hit.fetchedAt < TTL) return hit.sites;
  const sites = await fetchOverpass(lat, lng);
  if (sites) { store[key] = { sites, fetchedAt: Date.now() }; writeLS(OSM_CACHE_LS, store); }
  return sites;
}

/* divemap.gr has no lat/lng filter, so we query by country and distance-filter
   locally. Country comes from a (cached) reverse-geocode of the point. */
async function countryFor(lat, lng) {
  const store = readLS(COUNTRY_LS), ck = `${lat.toFixed(1)},${lng.toFixed(1)}`;
  if (store[ck]) return store[ck];
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
    if (!r.ok) return null;
    const j = await r.json();
    if (j.countryName) { store[ck] = j.countryName; writeLS(COUNTRY_LS, store); }
    return j.countryName || null;
  } catch (e) { return null; }
}

/* Primary: divemap.gr. Rich fields (description, max_depth, difficulty). Reads
   are public; a token (Bearer) is sent when provided. Cached per country. */
async function fetchDivemap(lat, lng, token) {
  const country = await countryFor(lat, lng);
  if (!country) return null;
  const store = readLS(DM_CACHE_LS); const hit = store[country];
  let all;
  if (hit && Date.now() - hit.fetchedAt < TTL) {
    all = hit.list;
  } else {
    all = [];
    const headers = token ? { Authorization: "Bearer " + token } : {};
    for (let page = 1; page <= 8; page++) {   // cap pages so a huge country can't run away
      let r;
      try { r = await fetch(`${DIVEMAP_BASE}/dive-sites/?country=${encodeURIComponent(country)}&page=${page}&page_size=100`, { headers }); }
      catch (e) { return null; }             // network/CORS -> fall back to Overpass
      if (!r.ok) return null;
      let j; try { j = await r.json(); } catch (e) { return null; }
      (j.items || []).forEach(s => {
        const bits = [];
        if (s.max_depth) bits.push(`Max depth ${s.max_depth} m`);
        if (s.difficulty_label) bits.push(s.difficulty_label);
        const meta = bits.join(" · ");
        all.push({
          name: s.name || "Dive site",
          type: s.difficulty_label || "site",
          lat: +s.latitude, lng: +s.longitude,
          desc: (meta ? meta + "\n\n" : "") + (s.description || ""),
          source: "divemap.gr",
        });
      });
      if (!j.has_next_page) break;
    }
    all = all.filter(d => !isNaN(d.lat) && !isNaN(d.lng));
    store[country] = { list: all, fetchedAt: Date.now() }; writeLS(DM_CACHE_LS, store);
  }
  const near = all.filter(d => km(lat, lng, d.lat, d.lng) <= DM_RADIUS_KM);
  return near.length ? near : null;
}

export async function loadDives() {
  const c = S.current; if (!c || !$("diveCard")) return;
  let sites = await fetchDivemap(c.lat, c.lng, getDiveKey());   // rich primary
  if (!sites || !sites.length) sites = await overpassCached(c.lat, c.lng);   // free fallback
  S.dives = sites || [];
  renderDives();
}

function renderDives() {
  const card = $("diveCard"); if (!card) return;
  const c = S.current, list = S.dives || [];
  if (!c || !list.length) { card.style.display = "none"; return; }
  const near = list.map(d => ({ ...d, km: km(c.lat, c.lng, d.lat, d.lng) })).sort((a, b) => a.km - b.km).slice(0, 8);
  card.style.display = "block";
  $("diveList").innerHTML = near.map(d => {
    const dist = d.km < 1 ? Math.round(d.km * 1000) + " m" : d.km.toFixed(1) + " km";
    return `<div class="dive-row">` +
      `<button type="button" class="dive-name" data-name="${esc(d.name)}" data-desc="${esc(d.desc || "")}" data-q="${esc(d.name + " dive site")}" data-lat="${d.lat}" data-lng="${d.lng}">${esc(d.name)}</button>` +
      `<span class="dive-km">${dist}</span>` +
      `<button type="button" class="dive-search" title="Search Google" data-search="${esc(d.name + " dive site")}">🔍</button>` +
    `</div>`;
  }).join("");
  $("diveSrc").textContent = near[0].source;
  renderDiveMap(near);
}

let diveMap = null, diveLayer = null;
function renderDiveMap(near) {
  const el = $("diveMap"); if (!el || typeof L === "undefined") return;
  const c = S.current;
  if (!diveMap) {
    diveMap = L.map(el, { zoomControl: true, attributionControl: false });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18 }).addTo(diveMap);
    diveLayer = L.layerGroup().addTo(diveMap);
  }
  diveLayer.clearLayers();
  L.circleMarker([c.lat, c.lng], { radius: 6, color: "#e2554a", fillColor: "#e2554a", fillOpacity: .9, weight: 2 })
    .bindTooltip(c.name).addTo(diveLayer);
  const pts = [[c.lat, c.lng]];
  near.forEach(d => {
    L.circleMarker([d.lat, d.lng], { radius: 5, color: "#0b3d6b", fillColor: "#2a7fc4", fillOpacity: .85, weight: 1.5 })
      .bindTooltip(d.name)
      .on("click", () => openModal(d.name, d.desc, d.name + " dive site", d.lat, d.lng))
      .addTo(diveLayer);
    pts.push([d.lat, d.lng]);
  });
  setTimeout(() => {
    diveMap.invalidateSize();
    if (pts.length > 1) diveMap.fitBounds(pts, { padding: [25, 25], maxZoom: 12 });
    else diveMap.setView([c.lat, c.lng], 11);
  }, 60);
}

const googleSearch = q => window.open("https://www.google.com/search?q=" + encodeURIComponent(q || ""), "_blank", "noopener");
// divemap.uk centres on latitude (Φ) / longitude (λ) query params
const diveMapUrl = (lat, lng) => `https://divemap.uk/?${encodeURIComponent("Φ")}=${lat}&${encodeURIComponent("λ")}=${lng}&z=13`;

function openModal(name, desc, q, lat, lng) {
  $("modalTitle").textContent = name || "Dive site";
  $("modalBody").textContent = (desc && desc.trim()) ? desc : "No description available for this site — use the links below to find out more.";
  const m = $("diveModal");
  m.dataset.q = q || name || ""; m.dataset.lat = lat || ""; m.dataset.lng = lng || "";
  m.hidden = false;
}
function closeModal() { $("diveModal").hidden = true; }

export function initDive() {
  $("diveSave").onclick = () => {
    const k = getDiveKey();
    if (k) localStorage.setItem(DIVE_KEY_LS, k); else localStorage.removeItem(DIVE_KEY_LS);
    if (S.current && $("status").style.display === "block") loadDives();
  };
  // click a name to open the reader modal; the 🔍 button does a quick web search
  $("diveList").addEventListener("click", e => {
    const s = e.target.closest(".dive-search");
    if (s) { googleSearch(s.getAttribute("data-search")); return; }
    const n = e.target.closest(".dive-name");
    if (n) openModal(n.getAttribute("data-name"), n.getAttribute("data-desc"), n.getAttribute("data-q"), n.getAttribute("data-lat"), n.getAttribute("data-lng"));
  });
  // modal controls
  $("modalClose").onclick = closeModal;
  $("modalMore").onclick = () => googleSearch($("diveModal").dataset.q);
  $("modalMap").onclick = () => { const m = $("diveModal"); if (m.dataset.lat && m.dataset.lng) window.open(diveMapUrl(m.dataset.lat, m.dataset.lng), "_blank", "noopener"); };
  $("diveModal").addEventListener("click", e => { if (e.target.id === "diveModal") closeModal(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
}

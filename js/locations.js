// Location selection: fetch (via the selected provider), cache, saved spots,
// and the demo fallback. Ties the data layer to the live view.

import { S } from "./state.js";
import { $, flash } from "./dom.js";
import { PROVIDERS, PRESETS, SAVED_LS, LAST_LS } from "./config.js";
import { ckey, readStore, writeEntry, cacheValid } from "./cache.js";
import { ago } from "./format.js";
import { getKey } from "./apikey.js";
import { normaliseToLow } from "./tide.js";
import { fetchTides } from "./providers/index.js";
import { startLive } from "./live.js";
import { openProviderPicker } from "./providerPicker.js";

// Synthetic semidiurnal curve so the UI works with no key / offline.
export function buildDemo(name, lat, lng, tz) {
  const levels = [], now = Date.now(), period = 12.42 * 3600e3, phase = (lng / 180) * Math.PI;
  for (let h = -12; h <= 24; h++) {
    const t = now + h * 3600e3;
    levels.push({ t, v: +(1.8 * Math.sin((2 * Math.PI * t) / period + phase)).toFixed(3) });
  }
  const extremes = [];
  for (let i = 1; i < levels.length - 1; i++) {
    if (levels[i].v > levels[i - 1].v && levels[i].v > levels[i + 1].v) extremes.push({ t: levels[i].t, v: levels[i].v, type: "high" });
    if (levels[i].v < levels[i - 1].v && levels[i].v < levels[i + 1].v) extremes.push({ t: levels[i].t, v: levels[i].v, type: "low" });
  }
  normaliseToLow(levels, extremes);
  const vals = levels.map(l => l.v);
  return { name, lat, lng, tz, levels, extremes, min: Math.min(...vals), max: Math.max(...vals), demo: true };
}

export async function selectLocation(name, lat, lng, tz, force) {
  if (!S.provider) { flash("Choose a tide data provider first.", "#7a5a12"); openProviderPicker(); return; }
  const requestId = ++S.locationRequestId;
  const prov = PROVIDERS[S.provider];
  const cacheKey = S.provider + ":" + ckey(lat, lng);   // cache is per-provider
  try { localStorage.setItem(LAST_LS, JSON.stringify({ name, lat, lng, tz })); } catch (e) {}

  // 1) reuse cached data if it still covers the near future — zero api calls
  if (!force) {
    const cached = readStore()[cacheKey];
    if (cacheValid(cached)) {
      S.current = { ...cached, name, tz }; startLive();
      flash(`Using cached ${prov.name} data (${ago(cached.fetchedAt)}) — no request used.`, "#1e7a45"); return;
    }
  }

  // providers that need a key fall back to a demo curve when none is entered
  if (prov.key && !getKey()) {
    S.current = buildDemo(name, lat, lng, tz); startLive();
    flash(`${prov.name} needs an API key — showing a demo curve. Add a key, or pick Open-Meteo (no key).`, "#7a5a12"); return;
  }

  flash(`Fetching tide data from ${prov.name}…`, "#274a68");
  try {
    const r = await fetchTides(lat, lng);
    if (requestId !== S.locationRequestId) return;
    if (r.error === "key")       { flash("Stormglass key rejected (401/403). Check the key."); return; }
    if (r.error === "nokey")     { flash(`${prov.name} needs an API key.`, "#7a5a12"); return; }
    if (r.error === "nostation") { flash("NOAA has no tide station near here — it covers US coasts only. Try Open-Meteo for this spot.", "#7a5a12"); return; }
    if (r.error === "limit") {
      const cached = readStore()[cacheKey];
      if (cached && cached.levels && cached.levels.length) { S.current = { ...cached, name, tz }; startLive(); flash("Daily request limit reached — showing last cached data.", "#7a5a12"); return; }
      flash("Stormglass daily request limit reached and nothing cached for here yet.", "#7a5a12"); return;
    }
    if (r.error) {
      const cached = readStore()[cacheKey];
      if (cached && cached.levels) { S.current = { ...cached, name, tz }; startLive(); flash("Couldn't reach the provider — showing cached data.", "#7a5a12"); return; }
      flash(`No tide data returned from ${prov.name}. Try another provider or a coastal spot.`); return;
    }
    const levels = r.levels, extremes = r.extremes || [];
    normaliseToLow(levels, extremes);   // lowest tide in view -> 0 m, consistent across providers
    const vals = levels.map(l => l.v);
    const entry = {
      name, lat, lng, tz, levels, extremes,
      min: Math.min(...vals), max: Math.max(...vals),
      demo: false, provider: S.provider, station: r.station || null, fetchedAt: Date.now(),
    };
    writeEntry(cacheKey, entry);
    S.current = entry; startLive();
    flash(`Live ${prov.name} data loaded${r.station ? " · " + r.station : ""} and cached.`, "#1e7a45");
  } catch (e) {
    if (requestId !== S.locationRequestId) return;
    const cached = readStore()[cacheKey];
    if (cached && cached.levels) { S.current = { ...cached, name, tz }; startLive(); flash("Network issue — showing cached data.", "#7a5a12"); return; }
    flash(`Network error contacting ${prov.name}.`);
  }
}

// Restore the last-viewed location from cache on load, without an API call.
export function restoreLast() {
  if (!S.provider) return;   // nothing to restore until a provider is chosen
  let last; try { last = JSON.parse(localStorage.getItem(LAST_LS)); } catch (e) {}
  if (!last) return;
  const cached = readStore()[S.provider + ":" + ckey(last.lat, last.lng)];
  if (cacheValid(cached)) {
    S.current = { ...cached, name: last.name, tz: last.tz }; startLive();
    flash(`Restored ${last.name} from cache (${ago(cached.fetchedAt)}) — no request used.`, "#1e7a45");
  }
}

/* ---- Saved spots + preset chips ---- */
function keyOf(lat, lng) { return `${lat.toFixed(2)},${lng.toFixed(2)}`; }
function readSaved() { try { return JSON.parse(localStorage.getItem(SAVED_LS)) || []; } catch (e) { return []; } }
function writeSaved(a) { try { localStorage.setItem(SAVED_LS, JSON.stringify(a)); } catch (e) {} }

export function addSaved(name, lat, lng, tz) {
  const k = keyOf(lat, lng);
  if (PRESETS.some(p => keyOf(p.lat, p.lng) === k)) return;   // already a preset
  const arr = readSaved().filter(s => keyOf(s.lat, s.lng) !== k);
  arr.unshift({ name, lat, lng, tz }); writeSaved(arr.slice(0, 12)); renderChips();
}
function removeSaved(lat, lng) {
  writeSaved(readSaved().filter(s => keyOf(s.lat, s.lng) !== keyOf(lat, lng))); renderChips();
}

export function renderChips() {
  const select = $("locationHistory"); if (!select) return;
  const places = [...PRESETS.map(p => ({ ...p, preset: true })), ...readSaved()].slice(0, 12);
  select.innerHTML = `<option value="">Previous locations</option>`;
  places.forEach((place, index) => {
    const option = document.createElement("option"); option.value = String(index); option.textContent = place.name; select.appendChild(option);
  });
  select.hidden = !places.length;
  select.onchange = () => {
    if (!select.value) return;
    const place = places[+select.value];
    if (place) { $("search").value = place.name; selectLocation(place.name, place.lat, place.lng, place.tz); }
    select.value = "";
  };
}

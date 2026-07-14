// Per-location, per-provider tide cache in localStorage. Stormglass bills per
// request, so we pull a week at a time and reuse it until it is nearly spent.

import { CACHE_LS, MIN_FORWARD_MS } from "./config.js";

export function ckey(lat, lng) { return `${lat.toFixed(2)},${lng.toFixed(2)}`; }

export function readStore() {
  try { return JSON.parse(localStorage.getItem(CACHE_LS)) || {}; }
  catch (e) { return {}; }
}

export function writeEntry(k, entry) {
  const s = readStore(); s[k] = entry;
  try { localStorage.setItem(CACHE_LS, JSON.stringify(s)); } catch (e) {}
}

// Valid while there is still at least MIN_FORWARD_MS of future data.
export function cacheValid(e) {
  return e && e.levels && e.levels.length &&
         Date.now() < e.levels[e.levels.length - 1].t - MIN_FORWARD_MS;
}

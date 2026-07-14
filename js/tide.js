// Core tide maths: interpolation, extreme detection, datum normalisation.

import { S } from "./state.js";

// Linear-interpolated sea level at a given time (ms epoch) for the active dataset.
export function levelAt(ms) {
  const L = S.current.levels;
  if (ms <= L[0].t) return L[0].v;
  if (ms >= L[L.length - 1].t) return L[L.length - 1].v;
  for (let i = 0; i < L.length - 1; i++) {
    if (ms >= L[i].t && ms <= L[i + 1].t) {
      const f = (ms - L[i].t) / (L[i + 1].t - L[i].t);
      return L[i].v + (L[i + 1].v - L[i].v) * f;
    }
  }
  return L[L.length - 1].v;
}

// Find local maxima/minima in a levels array (used when a provider gives only a curve).
export function deriveExtremes(levels) {
  const ex = [];
  for (let i = 1; i < levels.length - 1; i++) {
    const a = levels[i - 1].v, b = levels[i].v, c = levels[i + 1].v;
    if (b > a && b >= c) ex.push({ t: levels[i].t, v: b, type: "high" });
    if (b < a && b <= c) ex.push({ t: levels[i].t, v: b, type: "low" });
  }
  return ex;
}

// Shift a dataset so the lowest point in view reads 0 m. Providers use different
// datums (Open-Meteo = MSL, can go negative; Stormglass = LAT; NOAA = MLLW), so
// normalising to the period low keeps heights positive and comparable everywhere.
export function normaliseToLow(levels, extremes) {
  if (!levels.length) return;
  const lo = Math.min(...levels.map(l => l.v));
  if (!lo) return;                       // already 0-based
  levels.forEach(l => { l.v -= lo; });
  extremes.forEach(e => { e.v -= lo; });
}

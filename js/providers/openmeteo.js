// Open-Meteo Marine API — free, no key, global. Returns {levels,extremes}|{error}.
// Docs: https://open-meteo.com/en/docs/marine-weather-api

import { deriveExtremes } from "../tide.js";

export async function fetchOpenMeteo(lat, lng) {
  const u = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lng}` +
            `&hourly=sea_level_height_msl&timeformat=unixtime&past_days=1&forecast_days=7`;
  let r;
  try { r = await fetch(u); } catch (e) { return { error: "net" }; }
  if (!r.ok) return { error: "bad" };
  const j = await r.json(), H = j.hourly;
  if (!H || !H.time || !H.sea_level_height_msl) return { error: "nodata" };
  const levels = [];
  for (let i = 0; i < H.time.length; i++) {
    const v = H.sea_level_height_msl[i];
    if (v != null) levels.push({ t: H.time[i] * 1000, v });
  }
  if (!levels.length) return { error: "nodata" };
  return { levels, extremes: deriveExtremes(levels) };
}

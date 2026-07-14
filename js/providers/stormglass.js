// Stormglass tide API — station-based, needs an API key. Returns {levels,extremes}|{error}.
// Docs: https://docs.stormglass.io/

import { FETCH_DAYS } from "../config.js";

export async function fetchStormglass(lat, lng, key) {
  if (!key) return { error: "nokey" };
  // Prefer the LAT datum; fall back to default datum / a shorter window if rejected.
  const attempts = [
    { days: FETCH_DAYS, datum: "LAT" },
    { days: FETCH_DAYS, datum: "" },
    { days: 2, datum: "" },
  ];
  for (const { days, datum } of attempts) {
    const now = Math.floor(Date.now() / 1000);
    let base = `lat=${lat}&lng=${lng}&start=${now - 6 * 3600}&end=${now + days * 24 * 3600}`;
    if (datum) base += `&datum=${datum}`;
    const opts = { headers: { Authorization: key } };
    const [slR, exR] = await Promise.all([
      fetch(`https://api.stormglass.io/v2/tide/sea-level/point?${base}`, opts),
      fetch(`https://api.stormglass.io/v2/tide/extremes/point?${base}`, opts),
    ]);
    if (slR.status === 401 || slR.status === 403) return { error: "key" };
    if (slR.status === 402 || slR.status === 429) return { error: "limit" };
    if (!slR.ok) { if (slR.status === 400 || slR.status === 422) continue; return { error: "bad" }; }
    const sl = await slR.json(), ex = await exR.json();
    if (!sl.data || !sl.data.length) continue;
    const levels = sl.data.map(d => ({ t: new Date(d.time).getTime(), v: d.sg }));
    const extremes = (ex.data || []).map(d => ({ t: new Date(d.time).getTime(), v: d.height, type: d.type }));
    return { levels, extremes };
  }
  return { error: "bad" };
}

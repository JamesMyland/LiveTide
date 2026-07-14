// NOAA CO-OPS tide predictions — free, no key, US coasts only. Snaps to the
// nearest tide-prediction station. Returns {levels,extremes,station}|{error}.
// Docs: https://api.tidesandcurrents.noaa.gov/api/prod/

import { S } from "../state.js";
import { deriveExtremes } from "../tide.js";

async function stationList() {
  if (S.noaaStations) return S.noaaStations;
  try { const c = localStorage.getItem("noaa_stations"); if (c) { S.noaaStations = JSON.parse(c); return S.noaaStations; } } catch (e) {}
  let r;
  try { r = await fetch("https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions"); }
  catch (e) { return null; }
  if (!r.ok) return null;
  const j = await r.json();
  S.noaaStations = (j.stations || []).map(s => ({ id: s.id, name: s.name, lat: +s.lat, lng: +s.lng }));
  try { localStorage.setItem("noaa_stations", JSON.stringify(S.noaaStations)); } catch (e) {}
  return S.noaaStations;
}

function nearest(list, lat, lng) {
  let best = null, bd = 1e18;
  list.forEach(s => {
    const dx = s.lat - lat, dy = (s.lng - lng) * Math.cos(lat * Math.PI / 180);
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = s; }
  });
  return best ? { station: best, km: Math.sqrt(bd) * 111 } : null;
}

function yyyymmdd(ms) {
  const d = new Date(ms), p = n => String(n).padStart(2, "0");
  return d.getUTCFullYear() + p(d.getUTCMonth() + 1) + p(d.getUTCDate());
}

export async function fetchNOAA(lat, lng) {
  const list = await stationList(); if (!list) return { error: "net" };
  const near = nearest(list, lat, lng);
  if (!near || near.km > 150) return { error: "nostation" };
  const st = near.station.id, nm = near.station.name;
  const base = `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?application=LiveTide` +
    `&station=${st}&product=predictions&datum=MLLW&time_zone=gmt&units=metric&format=json` +
    `&begin_date=${yyyymmdd(Date.now() - 864e5)}&end_date=${yyyymmdd(Date.now() + 7 * 864e5)}`;
  const parse = t => Date.parse(t.replace(" ", "T") + "Z");
  let hR, xR;
  try { [hR, xR] = await Promise.all([fetch(base + "&interval=h"), fetch(base + "&interval=hilo")]); }
  catch (e) { return { error: "net" }; }
  let levels = [], extremes = [];
  if (xR.ok) { const xj = await xR.json(); extremes = (xj.predictions || []).map(p => ({ t: parse(p.t), v: +p.v, type: p.type === "H" ? "high" : "low" })); }
  if (hR.ok) { const hj = await hR.json(); levels = (hj.predictions || []).map(p => ({ t: parse(p.t), v: +p.v })); }
  if (!levels.length && extremes.length) levels = extremes.map(x => ({ t: x.t, v: x.v })); // subordinate stations: hi/lo only
  if (!levels.length) return { error: "nodata" };
  if (!extremes.length) extremes = deriveExtremes(levels);
  return { levels, extremes, station: nm };
}

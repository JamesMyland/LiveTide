// Weather layer for the same coordinate (Open-Meteo Forecast API, free, no key).
// Rendered as a strip directly under the tide curve, covering the SAME window and
// range as the chart (hourly across the day, daily across the week).

import { S } from "./state.js";
import { $ } from "./dom.js";
import { dayWindow, ampm } from "./format.js";

const WX_LS = "tide_weather_v2";   // v2: now includes hourly data for the day view
const WX_DAY_LS = "tide_weather_day_v1";
const TTL = 2 * 3600e3;                       // refresh weather ~every 2h
const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const compass = deg => DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
// arrow points the way the wind blows TO (meteorological "from" + 180°)
const windArrow = deg => `<span class="wx-arrow" style="transform:rotate(${(deg + 180) % 360}deg)">↑</span>`;

function readWx() { try { return JSON.parse(localStorage.getItem(WX_LS)) || {}; } catch (e) { return {}; } }
function writeWx(o) { try { localStorage.setItem(WX_LS, JSON.stringify(o)); } catch (e) {} }
function readDayWx() { try { return JSON.parse(localStorage.getItem(WX_DAY_LS)) || {}; } catch (e) { return {}; } }
function writeDayWx(o) { try { localStorage.setItem(WX_DAY_LS, JSON.stringify(o)); } catch (e) {} }

async function fetchWeather(lat, lng) {
  const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&hourly=temperature_2m,wind_speed_10m,wind_direction_10m` +
    `&daily=temperature_2m_max,temperature_2m_min,wind_speed_10m_max,wind_direction_10m_dominant` +
    `&timezone=auto&forecast_days=7&timeformat=unixtime`;
  let r; try { r = await fetch(u); } catch (e) { return null; }
  if (!r.ok) return null;
  try { return await r.json(); } catch (e) { return null; }
}

export async function loadWeather() {
  const c = S.current; if (!c) return;
  const key = `${c.lat.toFixed(2)},${c.lng.toFixed(2)}`;
  const store = readWx(); let wx = store[key];
  const stale = !wx || Date.now() - wx.fetchedAt > TTL || !(wx.data && wx.data.hourly);
  if (stale) {
    const j = await fetchWeather(c.lat, c.lng);
    if (j) { wx = { data: j, fetchedAt: Date.now() }; store[key] = wx; writeWx(store); }
  }
  S.weather = wx ? wx.data : null;
  renderWeather();
}

function nearestIdx(times, targetSec) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < times.length; i++) { const d = Math.abs(times[i] - targetSec); if (d < bd) { bd = d; best = i; } }
  return best;
}

const cell = (lbl, temp, dir, spd) =>
  `<div class="wx-cell"><div class="wx-c-lbl">${lbl}</div>` +
  `<div class="wx-c-temp">${temp}</div>` +
  `<div class="wx-c-wind">${windArrow(dir)} ${compass(dir)}</div>` +
  `<div class="wx-c-spd">${spd}</div></div>`;

const weatherLabel = code => ({
  0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Cloudy", 45: "Fog", 48: "Icy fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain",
  65: "Heavy rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 80: "Rain showers",
  81: "Showers", 82: "Heavy showers", 95: "Thunderstorm", 96: "Storm and hail", 99: "Severe storm"
})[code] || "Mixed";

async function loadWeatherDay(date, button) {
  const c = S.current, panel = $("wxDayDetail"); if (!c || !panel) return;
  document.querySelectorAll(".wx-day").forEach(el => el.classList.toggle("on", el === button));
  panel.hidden = false;
  panel.innerHTML = `<div class="wx-day-loading">Loading hourly weather…</div>`;
  const key = `${c.lat.toFixed(2)},${c.lng.toFixed(2)}:${date}`, store = readDayWx(); let entry = store[key];
  if (!entry || Date.now() - entry.fetchedAt > TTL) {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lng}` +
      `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m` +
      `&timezone=auto&start_date=${date}&end_date=${date}`;
    try { const response = await fetch(url); if (response.ok) entry = { data: await response.json(), fetchedAt: Date.now() }; } catch (e) {}
    if (entry) { store[key] = entry; writeDayWx(store); }
  }
  if (!entry || !entry.data || !entry.data.hourly) { panel.innerHTML = `<div class="wx-day-loading">Hourly weather is temporarily unavailable.</div>`; return; }
  const h = entry.data.hourly, units = entry.data.hourly_units || {};
  panel.innerHTML = `<div class="wx-day-head"><b>${new Date(date + "T12:00:00").toLocaleDateString([], { weekday:"long", day:"numeric", month:"short" })}</b><button type="button" aria-label="Close hourly weather">×</button></div>` +
    `<div class="wx-hour-grid">${(h.time || []).map((time, i) => `<div class="wx-hour"><b>${time.slice(11, 16)}</b><span>${weatherLabel(h.weather_code && h.weather_code[i])}</span><strong>${Math.round(h.temperature_2m[i])}°</strong><small>feels ${Math.round(h.apparent_temperature[i])}°</small><small>☂ ${h.precipitation_probability[i] || 0}%</small><small>${windArrow(h.wind_direction_10m[i] || 0)} ${Math.round(h.wind_speed_10m[i])} ${units.wind_speed_10m || "km/h"}</small><small>gust ${Math.round(h.wind_gusts_10m[i])}</small></div>`).join("")}</div>`;
  panel.querySelector("button").onclick = () => { panel.hidden = true; document.querySelectorAll(".wx-day").forEach(el => el.classList.remove("on")); };
}

// Called by the chart whenever it (re)draws, so weather tracks the same range.
export function renderWeather() {
  const strip = $("wxStrip"); if (!strip) return;
  const j = S.weather;
  if (!j) { strip.innerHTML = ""; strip.style.display = "none"; return; }
  strip.style.display = "block";

  const week = S.chartRange === "week";
  const du = j.daily_units || {}, hu = j.hourly_units || {};
  const tU = hu.temperature_2m || "°";
  const wU = du.wind_speed_10m_max || hu.wind_speed_10m || "km/h";

  let cells = "", cols = "w4";
  if (week) {
    cols = "w7";
    const d = j.daily || {}, t = d.time || [];
    cells = t.map((ts, i) => {
      const day = new Intl.DateTimeFormat([], { weekday: "short", timeZone: j.timezone || undefined }).format(new Date(ts * 1000));
      const dir = d.wind_direction_10m_dominant ? d.wind_direction_10m_dominant[i] : 0;
      const temp = `<span class="wx-hi">${Math.round(d.temperature_2m_max[i])}°</span>` +
                   `<span class="wx-lo">${Math.round(d.temperature_2m_min[i])}°</span>`;
      const date = new Date(ts * 1000).toLocaleDateString("en-CA", { timeZone: j.timezone || undefined });
      return `<button type="button" class="wx-day" data-date="${date}" title="Show hourly weather for ${day}">${cell(day, temp, dir, Math.round(d.wind_speed_10m_max[i]))}</button>`;
    }).join("");
  } else {
    const h = j.hourly || {}, ht = h.time || [], [t0] = dayWindow();
    cells = [0, 6, 12, 18].map(q => {
      const i = nearestIdx(ht, (t0 + q * 3600e3) / 1000);
      const temp = h.temperature_2m ? Math.round(h.temperature_2m[i]) + "°" : "—";
      const spd = h.wind_speed_10m ? Math.round(h.wind_speed_10m[i]) : "—";
      const dir = h.wind_direction_10m ? h.wind_direction_10m[i] : 0;
      return cell(ampm(q), temp, dir, spd);
    }).join("");
  }

  strip.innerHTML = `<div class="wx-strip-grid ${cols}">${cells}</div>` +
    `<div class="wx-strip-cap">temp ${tU} · wind ${wU}${week ? " (daily max · select a day for hourly weather)" : ""}</div>` +
    (week ? `<div class="wx-day-detail" id="wxDayDetail" hidden></div>` : "");
  strip.querySelectorAll(".wx-day").forEach(button => button.onclick = () => loadWeatherDay(button.dataset.date, button));
}

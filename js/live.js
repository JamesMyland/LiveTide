// Live view: the per-second tick that drives the background fill and status
// panel, plus the auto-hide behaviour.

import { S } from "./state.js";
import { $ } from "./dom.js";
import { PROVIDERS } from "./config.js";
import { levelAt } from "./tide.js";
import { fmtTime, fmtCountdown } from "./format.js";
import { drawChart } from "./chart.js";
import { loadWeather } from "./weather.js";
import { selectLocation } from "./locations.js";

export function startLive() {
  const c = S.current;
  $("picker").style.display = "none";
  $("status").style.display = "block";
  $("appear").style.display = "block";
  $("chartCard").style.display = "block";
  $("demoBadge").style.display = c.demo ? "inline-block" : "none";
  $("stPlace").textContent = c.name;
  $("stCoords").textContent = `${c.lat.toFixed(3)}, ${c.lng.toFixed(3)}${c.demo ? "  ·  demo curve" : ""}`;
  clearInterval(S.liveTimer);
  tick();
  S.liveTimer = setInterval(tick, 1000);
  poke();
  loadWeather();   // fetch/refresh weather for this location (cached ~2h)
}

export function tick() {
  const c = S.current, now = Date.now();
  const v = levelAt(now), vPrev = levelAt(now - 5 * 60000), rising = v >= vPrev;

  // fill = current height as a fraction of the week's peak (0 m = period low)
  const base = Math.min(0, c.min), denom = (c.max - base) || 1;
  const frac = Math.max(0, Math.min(1, (v - base) / denom));
  document.documentElement.style.setProperty("--fill", (frac * 100).toFixed(2) + "%");

  $("stLevel").textContent = v.toFixed(2);
  const tr = $("stTrend");
  tr.textContent = rising ? "▲ flooding (coming in)" : "▼ ebbing (going out)";
  tr.className = "trend " + (rising ? "rising" : "falling");
  document.body.classList.toggle("flow-in", rising);
  document.body.classList.toggle("flow-out", !rising);
  $("stPeak").textContent = `${Math.round(frac * 100)}% · range 0–${c.max.toFixed(2)} m`;

  const nextHigh = c.extremes.filter(e => e.type === "high" && e.t > now).sort((a, b) => a.t - b.t)[0];
  const nextLow  = c.extremes.filter(e => e.type === "low"  && e.t > now).sort((a, b) => a.t - b.t)[0];
  $("stHigh").textContent = nextHigh ? `${fmtTime(nextHigh.t)} · ${nextHigh.v.toFixed(2)}m ${fmtCountdown(nextHigh.t - now)}` : "—";
  $("stLow").textContent  = nextLow  ? `${fmtTime(nextLow.t)} · ${nextLow.v.toFixed(2)}m ${fmtCountdown(nextLow.t - now)}` : "—";

  $("stClock").textContent = "Local time: " + (() => {
    try { return new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: c.tz || undefined }).format(new Date()); }
    catch (e) { return new Date().toLocaleTimeString(); }
  })();
  $("stData").textContent = c.demo ? "synthetic data"
    : ((PROVIDERS[c.provider] && PROVIDERS[c.provider].detail) || "live sea level") + (c.station ? " · " + c.station : "");

  if (!$("liveUI").classList.contains("hide")) drawChart();

  // refetch only once we've run past the cached window
  if (now > c.levels[c.levels.length - 1].t && !c.demo)
    selectLocation(c.name, c.lat, c.lng, c.tz, true);
}

// Reveal the UI; re-hide after 4s idle (only while a location is live).
export function poke() {
  const lu = $("liveUI"); lu.classList.remove("hide"); clearTimeout(S.idleTimer);
  if ($("status").style.display === "block") { drawChart(); S.idleTimer = setTimeout(() => lu.classList.add("hide"), 4000); }
}

export function initLive() {
  $("changeLoc").onclick = () => {
    clearInterval(S.liveTimer); clearTimeout(S.idleTimer);
    $("liveUI").classList.remove("hide");
    $("status").style.display = "none"; $("appear").style.display = "none"; $("chartCard").style.display = "none";
    $("picker").style.display = "block";
  };
  $("refreshData").onclick = () => { if (S.current) selectLocation(S.current.name, S.current.lat, S.current.lng, S.current.tz, true); };
  ["mousemove", "touchstart", "keydown", "click"].forEach(ev => window.addEventListener(ev, poke));
  $("liveUI").addEventListener("mouseenter", () => clearTimeout(S.idleTimer));
  $("liveUI").addEventListener("mouseleave", poke);
}

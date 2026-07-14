// Canvas tide chart: today or the next 7 days, with height ticks, am/pm quarter
// labels, high/low markers, a live "now" marker, and hover tooltips.

import { S } from "./state.js";
import { $ } from "./dom.js";
import { levelAt } from "./tide.js";
import { hexA, dayWindow, ampm, chartTheme } from "./format.js";
import { renderWeather } from "./weather.js";

function chartWindow() {
  const [d0] = dayWindow();
  return S.chartRange === "week" ? [d0, d0 + 7 * 864e5] : [d0, d0 + 864e5];
}

export function drawChart() {
  const cv = $("tideChart"); if (!cv || !S.current || !S.current.levels) return;
  const c = S.current, card = $("chartCard"), dpr = window.devicePixelRatio || 1;
  const W = Math.max(240, card.clientWidth - 32), H = 150;
  cv.style.width = W + "px"; cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);

  const [t0, t1] = chartWindow(), week = S.chartRange === "week";
  const x0 = 36, x1 = W - 10, y0 = 12, y1 = H - 18;   // left gutter for height ticks
  const N = week ? 336 : 96, samp = [];
  for (let i = 0; i <= N; i++) { const t = t0 + (t1 - t0) * i / N; samp.push([t, levelAt(t)]); }
  const rawLo = Math.min(...samp.map(s => s[1])), rawHi = Math.max(...samp.map(s => s[1]));
  let lo = rawLo, hi = rawHi;
  const pad = (hi - lo) * 0.12 || 0.2; lo -= pad; hi += pad; const span = (hi - lo) || 1;
  const px = t => x0 + (t - t0) / (t1 - t0) * (x1 - x0);
  const py = v => y1 - (v - lo) / span * (y1 - y0);
  const { sea1, sea2 } = chartTheme();

  // height ticks: highest & lowest across the visible curve
  ctx.textAlign = "right"; ctx.font = "9px sans-serif";
  [[rawHi, "#1e7a45"], [rawLo, "#b2542a"]].forEach(([v, col]) => {
    const Y = py(v);
    ctx.strokeStyle = "rgba(11,39,64,.18)"; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, Y); ctx.lineTo(x1, Y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = col; ctx.fillText(v.toFixed(1) + "m", x0 - 5, Y + 3);
  });

  // gridlines + labels: am/pm quarters (day) or weekday names (week)
  ctx.textAlign = "center"; ctx.font = "10px sans-serif";
  if (week) {
    for (let d = 0; d <= 7; d++) {
      const X = px(t0 + d * 864e5);
      ctx.fillStyle = "rgba(11,39,64,.10)"; ctx.fillRect(X, y0, 1, y1 - y0);
      if (d < 7) for (let q = 6; q < 24; q += 6) { const Xq = px(t0 + d * 864e5 + q * 3600e3); ctx.fillStyle = "rgba(11,39,64,.04)"; ctx.fillRect(Xq, y0, 1, y1 - y0); }
      if (d < 7) {
        const noon = t0 + d * 864e5 + 432e5;
        const lbl = new Intl.DateTimeFormat([], { weekday: "short", timeZone: (c.tz) || undefined }).format(new Date(noon));
        ctx.fillStyle = "#5c7691"; ctx.fillText(lbl, px(noon), H - 4);
      }
    }
  } else {
    for (let h = 0; h <= 24; h += 6) {
      const X = px(t0 + h * 3600e3);
      ctx.fillStyle = "rgba(11,39,64,.08)"; ctx.fillRect(X, y0, 1, y1 - y0);
      ctx.fillStyle = "#5c7691"; ctx.fillText(ampm(h), X, H - 4);
    }
  }

  // tide curve + fill
  ctx.beginPath();
  samp.forEach(([t, v], i) => { const X = px(t), Y = py(v); i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
  ctx.lineWidth = 2; ctx.strokeStyle = sea2; ctx.stroke();
  ctx.lineTo(x1, y1); ctx.lineTo(x0, y1); ctx.closePath();
  const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, hexA(sea1, .45)); g.addColorStop(1, hexA(sea1, .04));
  ctx.fillStyle = g; ctx.fill();

  // high / low markers (recorded for hover tooltips)
  S.chartPts = [];
  c.extremes.filter(e => e.t >= t0 && e.t <= t1).forEach(e => {
    const X = px(e.t), Y = py(e.v);
    S.chartPts.push({ x: X, y: Y, e });
    ctx.beginPath(); ctx.arc(X, Y, week ? 2 : 3, 0, Math.PI * 2); ctx.fillStyle = e.type === "high" ? "#1e7a45" : "#b2542a"; ctx.fill();
    if (!week) { ctx.fillStyle = "#33475a"; ctx.font = "9px sans-serif"; ctx.fillText(e.v.toFixed(1) + "m", X, e.type === "high" ? Y - 6 : Y + 12); }
  });

  // now marker
  const now = Date.now();
  if (now >= t0 && now <= t1) {
    const X = px(now);
    ctx.strokeStyle = "#e2554a"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(X, y0); ctx.lineTo(X, y1); ctx.stroke();
    const Y = py(levelAt(now)); ctx.beginPath(); ctx.arc(X, Y, 4, 0, Math.PI * 2); ctx.fillStyle = "#e2554a"; ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
  }
}

export function setChartRange(r) {
  S.chartRange = r;
  $("segDay").classList.toggle("on", r === "day");
  $("segWeek").classList.toggle("on", r === "week");
  $("chartTitle").textContent = r === "week" ? "Next 7 days" : "Today's tide";
  drawChart();
  renderWeather();   // keep the weather strip on the same range
}

export function initChart() {
  $("segDay").onclick = () => setChartRange("day");
  $("segWeek").onclick = () => setChartRange("week");
  const cv = $("tideChart");
  cv.addEventListener("mousemove", e => {
    const tip = $("chartTip"), mx = e.offsetX, my = e.offsetY;
    let best = null, bd = 1e9;
    S.chartPts.forEach(p => { const d = Math.hypot(p.x - mx, p.y - my); if (d < bd) { bd = d; best = p; } });
    if (best && bd < 16) {
      const ex = best.e; let when;
      try { when = new Intl.DateTimeFormat([], { weekday: S.chartRange === "week" ? "short" : undefined, hour: "2-digit", minute: "2-digit", timeZone: (S.current && S.current.tz) || undefined }).format(new Date(ex.t)); }
      catch (_) { when = new Date(ex.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
      tip.textContent = `${ex.type === "high" ? "High" : "Low"} ${ex.v.toFixed(2)}m · ${when}`;
      tip.style.left = (cv.offsetLeft + best.x) + "px";
      tip.style.top = (cv.offsetTop + best.y) + "px";
      tip.style.display = "block"; cv.style.cursor = "pointer";
    } else { tip.style.display = "none"; cv.style.cursor = "default"; }
  });
  cv.addEventListener("mouseleave", () => { $("chartTip").style.display = "none"; });
  window.addEventListener("resize", () => { if ($("chartCard").style.display === "block") drawChart(); });
}

// Colour, time and date formatting helpers.

import { S } from "./state.js";

// #rrggbb -> rgba() with alpha.
export function hexA(hex, a) {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Lighten (pct>0, toward white) or darken (pct<0, toward black) a hex colour.
export function shade(hex, pct) {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  let r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
  const t = pct < 0 ? 0 : 255, p = Math.abs(pct);
  r = Math.round((t - r) * p) + r; g = Math.round((t - g) * p) + g; b = Math.round((t - b) * p) + b;
  return "#" + [r, g, b].map(x => x.toString(16).padStart(2, "0")).join("");
}

export function ago(ts) {
  if (!ts) return "just now";
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  return h < 24 ? h + "h ago" : Math.floor(h / 24) + "d ago";
}

// Offset (ms) between a timezone's local time and UTC at a given instant.
export function tzOffsetMs(tz, date) {
  try {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false, year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(date).reduce((a, x) => (a[x.type] = x.value, a), {});
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - date.getTime();
  } catch (e) { return -date.getTimezoneOffset() * 60000; }
}

// [start, end] ms for "today" in the active location's timezone.
export function dayWindow() {
  const now = new Date();
  if (S.current && S.current.tz) {
    const off = tzOffsetMs(S.current.tz, now);
    const ln = new Date(now.getTime() + off);
    const mid = Date.UTC(ln.getUTCFullYear(), ln.getUTCMonth(), ln.getUTCDate()) - off;
    return [mid, mid + 864e5];
  }
  const d = new Date(); d.setHours(0, 0, 0, 0);
  return [d.getTime(), d.getTime() + 864e5];
}

export function fmtTime(ms) {
  try { return new Intl.DateTimeFormat([], { hour: "2-digit", minute: "2-digit", timeZone: (S.current && S.current.tz) || undefined }).format(new Date(ms)); }
  catch (e) { return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
}

export function fmtCountdown(ms) {
  if (ms < 0) return "";
  const m = Math.round(ms / 60000), h = Math.floor(m / 60), mm = m % 60;
  return h > 0 ? `in ${h}h ${mm}m` : `in ${mm}m`;
}

// Hour (0-24) -> "6am" / "12pm" etc.
export function ampm(h) { h = ((h % 24) + 24) % 24; const p = h < 12 ? "am" : "pm"; let hh = h % 12; if (!hh) hh = 12; return hh + p; }

// Read the current sea gradient colours from CSS variables (for the chart).
export function chartTheme() {
  const cs = getComputedStyle(document.documentElement);
  return {
    sea1: (cs.getPropertyValue("--sea1") || "#2a7fc4").trim(),
    sea2: (cs.getPropertyValue("--sea2") || "#0b3d6b").trim(),
  };
}

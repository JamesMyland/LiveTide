// Map pin picker (Leaflet + OpenStreetMap). `L` is the global from the Leaflet
// CDN script loaded in the page <head>. Reverse-geocoding via BigDataCloud.

import { S } from "./state.js";
import { $ } from "./dom.js";
import { addSaved, selectLocation } from "./locations.js";

function initMap() {
  if (typeof L === "undefined") { $("mapHint").textContent = "Map library didn't load — check your connection."; return; }
  if (S.map) { setTimeout(() => S.map.invalidateSize(), 60); return; }
  S.map = L.map("map", { worldCopyJump: true }).setView([30, 0], 2);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    { maxZoom: 19, attribution: "© OpenStreetMap contributors" }).addTo(S.map);
  S.map.on("click", e => onMapClick(e.latlng.lat, e.latlng.lng));
  setTimeout(() => S.map.invalidateSize(), 60);
}

async function onMapClick(lat, lng) {
  lng = ((lng + 180) % 360 + 360) % 360 - 180;   // normalise if panned across copies
  if (S.marker) S.marker.setLatLng([lat, lng]);
  else S.marker = L.circleMarker([lat, lng], { radius: 8, weight: 2, color: "#0b3d6b", fillColor: "#2a7fc4", fillOpacity: .9 }).addTo(S.map);
  S.picked = { name: `${lat.toFixed(3)}, ${lng.toFixed(3)}`, lat, lng, tz: null };
  $("useSpot").disabled = false;
  $("mapHint").textContent = "Looking up place name…";
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
    const j = await r.json();
    const nm = [j.city || j.locality, j.principalSubdivision].filter(Boolean).join(", ");   // drop country
    if (nm) S.picked.name = nm;
    $("mapHint").textContent = (nm ? nm + "  " : "") + `(${lat.toFixed(3)}, ${lng.toFixed(3)})`;
  } catch (e) { $("mapHint").textContent = `Pin at ${lat.toFixed(3)}, ${lng.toFixed(3)}`; }
}

export function initMapPicker() {
  $("mapToggle").onclick = () => {
    const w = $("mapWrap"), show = w.style.display !== "block";
    w.style.display = show ? "block" : "none";
    $("mapToggle").textContent = show ? "hide map" : "📍 …or drop a pin on a map";
    if (show) initMap();
  };
  $("useSpot").onclick = () => {
    if (!S.picked) return;
    addSaved(S.picked.name, S.picked.lat, S.picked.lng, S.picked.tz);
    selectLocation(S.picked.name, S.picked.lat, S.picked.lng, S.picked.tz);
  };
}

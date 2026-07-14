// Place-name search using the Open-Meteo geocoder (no key).

import { S } from "./state.js";
import { $, flash } from "./dom.js";
import { addSaved, selectLocation } from "./locations.js";

async function geocode(q) {
  try {
    const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=6&name=${encodeURIComponent(q)}`);
    const j = await r.json();
    const dd = $("dropdown"); dd.innerHTML = "";
    if (!j.results || !j.results.length) { dd.style.display = "none"; return; }
    j.results.forEach(res => {
      const label = [res.name, res.admin1, res.country].filter(Boolean).join(", ");
      const d = document.createElement("div");
      d.innerHTML = `${res.name} <small>${[res.admin1, res.country].filter(Boolean).join(", ")}</small>`;
      d.onclick = () => {
        $("dropdown").style.display = "none"; $("search").value = label;
        addSaved(label, res.latitude, res.longitude, res.timezone);
        selectLocation(label, res.latitude, res.longitude, res.timezone);
      };
      dd.appendChild(d);
    });
    dd.style.display = "block";
  } catch (e) { flash("Couldn't reach the place search. Check your connection."); }
}

export function initSearch() {
  $("search").addEventListener("input", () => {
    clearTimeout(S.searchTimer);
    const q = $("search").value.trim();
    if (q.length < 2) { $("dropdown").style.display = "none"; return; }
    S.searchTimer = setTimeout(() => geocode(q), 300);
  });
  document.addEventListener("click", e => {
    if (!$("dropdown").contains(e.target) && e.target !== $("search")) $("dropdown").style.display = "none";
  });
}

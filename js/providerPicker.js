// Compact, collapsible provider picker. Expanded and flagged "required" until a
// choice is made; collapses to a one-line summary once a provider is selected.

import { S } from "./state.js";
import { $, flash } from "./dom.js";
import { PROVIDERS, PROV_LS } from "./config.js";
import { selectLocation } from "./locations.js";

let open = !S.provider;   // stays expanded until the user chooses

export function openProviderPicker() { open = true; renderProviders(); }

export function renderProviders() {
  const box = $("providers"); if (!box) return;
  const sel = S.provider ? PROVIDERS[S.provider] : null;
  const showBody = open || !sel;

  const head =
    `<div class="prov-head${!sel ? " req" : ""}" id="provHead">` +
      `<span class="prov-head-label">Tide data provider</span>` +
      `<span class="prov-head-val">${sel ? sel.name : "Choose one"}</span>` +
      (!sel ? `<span class="prov-req">required</span>` : "") +
      `<span class="prov-caret">${showBody ? "▾" : "▸"}</span>` +
    `</div>`;

  let body = "";
  if (showBody) {
    const seg = Object.entries(PROVIDERS).map(([id, p]) =>
      `<button type="button" class="provBtn${id === S.provider ? " on" : ""}" data-id="${id}">${p.name}</button>`).join("");
    const info = sel
      ? `<div class="prov-benefit">${sel.benefit}` +
        (sel.signup ? ` <a class="prov-link" href="${sel.signup}" target="_blank" rel="noopener">Sign up ↗</a>` : "") + `</div>`
      : `<div class="prov-benefit">Pick where tide data comes from — each option shows its trade-offs.</div>`;
    body = `<div class="prov-body"><div class="provSeg">${seg}</div>${info}</div>`;
  }

  box.innerHTML = head + body;
  const headEl = $("provHead");
  if (headEl) headEl.onclick = () => { if (sel) { open = !open; renderProviders(); } };  // can't close until chosen
  box.querySelectorAll(".provBtn").forEach(b => b.onclick = () => setProvider(b.dataset.id));
  $("keyBlock").style.display = (sel && sel.key) ? "block" : "none";
}

export function setProvider(id) {
  if (!PROVIDERS[id]) return;
  S.provider = id;
  try { localStorage.setItem(PROV_LS, id); } catch (e) {}
  open = false;                    // collapse once a choice is made
  renderProviders();
  if (S.current && $("status").style.display === "block")
    selectLocation(S.current.name, S.current.lat, S.current.lng, S.current.tz, true);
  else
    flash(`${PROVIDERS[id].name}: ${PROVIDERS[id].benefit}`, "#274a68");
}

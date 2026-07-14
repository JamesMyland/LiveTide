// Per-panel collapse toggles (status / chart / dive). Each ".collapse-btn"
// carries data-card="<element id>"; state is remembered in localStorage.

import { $ } from "./dom.js";

const LS = "tide_collapsed";
const read = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch (e) { return {}; } };
const write = o => { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {} };

export function initCollapse() {
  const state = read();
  document.querySelectorAll(".collapse-btn").forEach(btn => {
    const id = btn.getAttribute("data-card");
    const el = $(id); if (!el) return;
    if (state[id]) el.classList.add("collapsed");
    btn.onclick = () => {
      const collapsed = el.classList.toggle("collapsed");
      const s = read(); s[id] = collapsed; write(s);
    };
  });
}

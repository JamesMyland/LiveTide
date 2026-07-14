// Stormglass API key handling — stored only in the browser's localStorage.

import { $, flash } from "./dom.js";
import { KEY_LS } from "./config.js";

export function loadKey() {
  const k = localStorage.getItem(KEY_LS);
  if (k) { $("key").value = k; $("forgetKey").style.display = "inline"; }
}

export function getKey() { return ($("key").value || "").trim(); }

export function initApiKey() {
  $("saveKey").onclick = () => {
    const k = $("key").value.trim();
    if (k) { localStorage.setItem(KEY_LS, k); $("forgetKey").style.display = "inline"; flash("Key saved in this browser.", "#1e7a45"); }
  };
  $("forgetKey").onclick = () => {
    localStorage.removeItem(KEY_LS); $("key").value = ""; $("forgetKey").style.display = "none"; flash("Saved key removed.", "#1e7a45");
  };
}

// Appearance controls: sea/sand gradient colours, tide opacity ("fade"),
// flip (fill end), 90° rotation of the whole app, and auto screen-orientation.

import { S } from "./state.js";
import { $ } from "./dom.js";
import { APPEAR_LS, DEF_SEA, DEF_SAND, DEF_OP } from "./config.js";
import { shade } from "./format.js";

const portraitMQ = window.matchMedia("(orientation: portrait)");
const isPortrait = () => portraitMQ.matches;

export function applyAppearance() {
  const a = S.appear, rs = document.documentElement.style;
  rs.setProperty("--sea1", shade(a.sea, 0.18));
  rs.setProperty("--sea2", shade(a.sea, -0.45));
  rs.setProperty("--sand1", shade(a.sand, 0.12));
  rs.setProperty("--sand2", shade(a.sand, -0.30));
  rs.setProperty("--tide-op", (a.op / 100).toFixed(2));
  document.body.classList.remove("o-up", "o-down");
  document.body.classList.add(a.flip ? "o-down" : "o-up");
  const angle = a.auto ? (isPortrait() ? 90 : 0) : a.angle;
  document.body.classList.remove("rot-90", "rot-180", "rot-270");
  if (angle) document.body.classList.add("rot-" + angle);
  $("flipBtn").classList.toggle("on", a.flip);
  $("autoBtn").classList.toggle("on", a.auto);
  $("rotLeft").disabled = a.auto;
  $("rotRight").disabled = a.auto;
}

function saveAppearance() { try { localStorage.setItem(APPEAR_LS, JSON.stringify(S.appear)); } catch (e) {} }

export function loadAppearance() {
  let a = {}; try { a = JSON.parse(localStorage.getItem(APPEAR_LS)) || {}; } catch (e) {}
  const angle = a.angle != null ? ((a.angle % 360) + 360) % 360 : (a.rotate ? 90 : 0); // migrate old bool
  S.appear = { sea: a.sea || DEF_SEA, sand: a.sand || DEF_SAND, op: (a.op ?? DEF_OP), flip: !!a.flip, angle, auto: !!a.auto };
  $("cSea").value = S.appear.sea; $("cSand").value = S.appear.sand; $("opTide").value = S.appear.op;
  applyAppearance();
}

function onInput() {
  S.appear.sea = $("cSea").value; S.appear.sand = $("cSand").value; S.appear.op = +$("opTide").value;
  applyAppearance(); saveAppearance();
}
function rotateBy(deg) { if (S.appear.auto) return; S.appear.angle = ((S.appear.angle + deg) % 360 + 360) % 360; applyAppearance(); saveAppearance(); }

export function initAppearance() {
  ["input", "change"].forEach(ev => {
    $("cSea").addEventListener(ev, onInput);
    $("cSand").addEventListener(ev, onInput);
    $("opTide").addEventListener(ev, onInput);
  });
  $("flipBtn").onclick = () => { S.appear.flip = !S.appear.flip; applyAppearance(); saveAppearance(); };
  $("rotLeft").onclick = () => rotateBy(-90);
  $("rotRight").onclick = () => rotateBy(90);
  $("autoBtn").onclick = () => { S.appear.auto = !S.appear.auto; applyAppearance(); saveAppearance(); };

  // Settings collapse behind a compact toggle (closed by default).
  const setSettingsOpen = open => {
    $("appear").classList.toggle("open", open);
    try { localStorage.setItem("tide_appear_open", open ? "1" : "0"); } catch (e) {}
  };
  $("appearToggle").onclick = () => setSettingsOpen(!$("appear").classList.contains("open"));
  $("appearClose").onclick = () => setSettingsOpen(false);
  try { if (localStorage.getItem("tide_appear_open") === "1") $("appear").classList.add("open"); } catch (e) {}
  try { portraitMQ.addEventListener("change", () => { if (S.appear.auto) applyAppearance(); }); }
  catch (e) { portraitMQ.addListener(() => { if (S.appear.auto) applyAppearance(); }); }
  window.addEventListener("orientationchange", () => { if (S.appear.auto) applyAppearance(); });
}

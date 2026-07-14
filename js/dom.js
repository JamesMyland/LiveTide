// Tiny DOM helpers shared everywhere.

export const $ = id => document.getElementById(id);

// Status/message line under the picker.
export function flash(text, colour) {
  const m = $("msg");
  if (!m) return;
  m.textContent = text;
  m.style.color = colour || "#b23b3b";
}

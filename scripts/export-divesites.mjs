#!/usr/bin/env node
/*
 * Export the full divemap.gr dive-site catalogue to data/divesites.json.
 *
 * CORS blocks the browser from calling divemap.gr directly, but Node (like
 * curl/Postman) isn't subject to CORS — so we fetch here, commit the JSON, and
 * LiveTide loads that same-origin file. Re-run whenever you want fresh data.
 *
 * Usage:
 *   DIVEMAP_TOKEN=your_token node scripts/export-divesites.mjs
 *   node scripts/export-divesites.mjs your_token
 *   node scripts/export-divesites.mjs            (no token — public read)
 *
 * Requires Node 18+ (built-in fetch).
 */
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "https://divemap.gr/api/v1";
const token = process.env.DIVEMAP_TOKEN || process.argv[2] || "";
const headers = token ? { Authorization: "Bearer " + token } : {};

const all = [];
let page = 1, totalPages = 1;
do {
  const url = `${BASE}/dive-sites/?page=${page}&page_size=100`;
  const r = await fetch(url, { headers });
  if (!r.ok) { console.error(`HTTP ${r.status} on page ${page}:`, await r.text()); process.exit(1); }
  const j = await r.json();
  (j.items || []).forEach(s => all.push(s));
  totalPages = j.total_pages || 1;
  console.error(`page ${page}/${totalPages} — ${all.length} sites`);
  page++;
} while (page <= totalPages);

mkdirSync("data", { recursive: true });
writeFileSync("data/divesites.json", JSON.stringify(all));
console.error(`\nWrote data/divesites.json (${all.length} dive sites).`);

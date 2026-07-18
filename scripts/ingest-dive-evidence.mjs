#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";

const WFS = "https://geoserver-123.aodn.org.au/geoserver/ows";
const TYPE_NAME = "imos:ep_site_list_public_data";
const OUTPUT = new URL("../data/dive-survey-evidence.json", import.meta.url);
const MANIFEST = new URL("../data/dive-survey-evidence.manifest.json", import.meta.url);

async function fetchPage(startIndex, count) {
  const url = new URL(WFS);
  Object.entries({ service:"WFS", version:"1.0.0", request:"GetFeature", typeName:TYPE_NAME,
    outputFormat:"application/json", startIndex:String(startIndex), maxFeatures:String(count), sortBy:"site_code" })
    .forEach(([key, value]) => url.searchParams.set(key, value));
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(url, { signal:controller.signal, headers:{ Accept:"application/geo+json, application/json", "User-Agent":"LiveTide dive evidence ingestion/1.0" } });
    if (!response.ok) throw new Error(`IMOS WFS returned ${response.status}`);
    return await response.json();
  } finally { clearTimeout(timer); }
}

function normalise(feature) {
  const p = feature?.properties || {}, [longitude, latitude] = feature?.geometry?.coordinates || [];
  if (!p.site_code || !p.site_name || !Number.isFinite(+latitude) || !Number.isFinite(+longitude)) return null;
  return {
    id:`imos-rls:${p.site_code}`, sourceId:String(p.site_code), name:String(p.site_name),
    latitude:+latitude, longitude:+longitude, country:String(p.country || ""), area:String(p.area || ""),
    location:String(p.location || ""), realm:String(p.realm || ""), province:String(p.province || ""),
    ecoregion:String(p.ecoregion || ""), latitudeZone:String(p.lat_zone || ""), programs:String(p.programs || ""),
    evidenceClass:"diver_survey_station", dataSource:"IMOS National Reef Monitoring Network",
  };
}

const pageSize = 1000, records = [], seen = new Set();
let startIndex = 0, matched = Infinity;
while (startIndex < matched) {
  const page = await fetchPage(startIndex, pageSize);
  matched = Number(page.numberMatched ?? page.totalFeatures) || 0;
  for (const feature of page.features || []) {
    const record = normalise(feature); if (!record || seen.has(record.id)) continue;
    seen.add(record.id); records.push(record);
  }
  const returned = Number(page.numberReturned) || (page.features || []).length;
  if (!returned) break;
  startIndex += returned;
  process.stderr.write(`IMOS/RLS ${Math.min(startIndex, matched)}/${matched}\n`);
}

await mkdir(new URL("../data/", import.meta.url), { recursive:true });
await writeFile(OUTPUT, JSON.stringify(records));
await writeFile(MANIFEST, JSON.stringify({
  generatedAt:new Date().toISOString(), records:records.length,
  sources:[{ id:"imos-nrmn-rls", url:WFS, typeName:TYPE_NAME, records:records.length,
    attribution:"Integrated Marine Observing System (IMOS), National Reef Monitoring Network and Reef Life Survey contributors",
    licence:"Catalogue states freely available for non-profit use; formal dataset licence is unspecified and requires confirmation",
    rightsReview:true, evidenceClass:"diver_survey_station" }], failures:[],
}, null, 2));
process.stderr.write(`Wrote ${records.length} survey stations to data/dive-survey-evidence.json\n`);

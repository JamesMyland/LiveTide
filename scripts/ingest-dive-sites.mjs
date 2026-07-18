#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

const OUTPUT = new URL("../data/enriched-divesites.json", import.meta.url);
const MANIFEST = new URL("../data/enriched-divesites.manifest.json", import.meta.url);
const API = "https://api.opendivemap.com/v1/sites";
const TAIWAN_ATTRACTIONS_ZIP = "https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Attraction-json.zip";
const TAIWAN_DIVE_ATTRACTIONS = new Map(Object.entries({
  Attraction_376540000A_000365:"Shilang Diving Area",
  Attraction_376540000A_000367:"Green Island Nanliao Fishing Harbor",
  Attraction_376540000A_001315:"Green Island Underwater Postbox",
  Attraction_376550000A_001286:"Shitiping Recreation Area",
  Attraction_A15011000H_000014:"Baisha Bay Water Recreation Area",
  Attraction_A15011300H_000055:"Longdong Bay Ocean Park",
}));
const ARCGIS_SOURCES = [{
  id:"nz-doc-hauraki-dive-sites",
  layer:"https://seasketch.doc.govt.nz/arcgis/rest/services/Hauraki/Marine_Use_Activities_test/MapServer/1",
  name:"NZ DOC SeaSketch - Hauraki Gulf dive sites",
  country:"New Zealand",
  countryCode:"NZ",
  attribution:"Department of Conservation (NZ), Waikato Regional Council, and Dive New Zealand",
  licence:"CC BY 4.0 for DOC-produced material; third-party rights require confirmation",
  rightsReview:true,
}, {
  id:"noaa-nccos-caribbean-scuba-spots",
  layer:"https://gis.ngdc.noaa.gov/arcgis/rest/services/nccos/BiogeographicAssessments_USCaribbeanPrioritization/MapServer/14",
  name:"NOAA NCCOS - Puerto Rico and USVI SCUBA spots",
  country:"United States",
  countryCode:"US",
  attribution:"NOAA NCCOS; Puerto Rico source: caribdiveguide.com; USVI source: wannadive.net",
  licence:"NOAA public service; credited third-party source rights require confirmation",
  rightsReview:true,
}, {
  id:"bc-coastal-diving-sites",
  layer:"https://maps.gov.bc.ca/arcgis/rest/services/whse/bcgw_pub_whse_environmental_monitoring/MapServer/23",
  catalogueUrl:"https://catalogue.data.gov.bc.ca/dataset/6f344ab9-279f-4782-b53a-fa15ffbfa3f7",
  name:"Province of British Columbia - Coastal BC Diving Sites",
  country:"Canada",
  countryCode:"CA",
  region:"British Columbia",
  attribution:"Province of British Columbia",
  licence:"Open Government Licence - British Columbia",
  nameField:"LOCATION",
  idField:"DIVING_SITE_ID",
  descriptionFields:["COMMENTS"],
  tags:["coastal scuba diving site"],
  mapProperties(feature) {
    const p = feature.properties || {}, access = clean(p.DIVE_TYPE).toUpperCase();
    return {
      access_instructions:access === "B" ? "Boat access" : access === "S" ? "Shore access" : "",
      relativeImportance:number(p.RELATIVE_IMPORTANCE),
      sourceProject:clean(p.SOURCE_PROJECT),
      upstreamDataSource:clean(p.DATA_SOURCE),
    };
  },
}, {
  id:"wa-dpird-abrolhos-dive-trails",
  layer:"https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/People_and_Society/MapServer/12",
  name:"WA DPIRD - Abrolhos Islands dive trails",
  country:"Australia",
  countryCode:"AU",
  attribution:"© State of Western Australia, Department of Primary Industries and Regional Development",
  licence:"CC BY 4.0",
  groupByName:true,
}];
const args = process.argv.slice(2);
const localFiles = args.filter(value => /\.geo?json$/i.test(value));
const OVERPASS_ENDPOINTS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
];
const OSM_REGIONS = [{ id:"osm-ph-cebu", name:"OpenStreetMap - Cebu region", bbox:"9,123,12,125", country:"Philippines", countryCode:"PH" }];

const clean = value => value == null ? "" : String(value).trim();
const number = value => { const result = Number(value); return Number.isFinite(result) ? result : null; };
const aliasesFromTags = (tags = {}) => Object.entries(tags)
  .filter(([key]) => key === "alt_name" || key === "old_name" || key.startsWith("names_"))
  .flatMap(([, value]) => Array.isArray(value) ? value : clean(value).split(";"))
  .map(clean).filter(Boolean);

function normaliseOpenDiveMap(feature) {
  const p = feature?.properties || {}, [longitude, latitude] = feature?.geometry?.coordinates || [];
  if (!clean(p.name) || number(latitude) == null || number(longitude) == null) return null;
  const topologies = Array.isArray(p.topologies) ? p.topologies.map(clean).filter(Boolean) : [];
  return {
    id:`opendivemap:${p.id}`, sourceId:clean(p.id), name:clean(p.name), aliases:aliasesFromTags(p.tags),
    latitude:number(latitude), longitude:number(longitude), country:clean(p.country_name || p.country_code),
    countryCode:clean(p.country_code), region:clean(p.region_name || p.region_code), sea:clean(p.sea_name),
    description:[p.environment, ...topologies].map(clean).filter(Boolean).join(" · "),
    max_depth:number(p.max_depth) ?? "", access_instructions:clean(p.entry), tags:topologies,
    dataSource:"OpenDiveMap contributors", sourceUrl:`https://opendivemap.com/sites/${encodeURIComponent(p.id)}`,
    licence:"ODbL-1.0", evidenceClass:"recreational_site",
  };
}

function normaliseGeoJson(feature, source, metadata = {}) {
  if (feature?.geometry?.type !== "Point") return null;
  const p = feature.properties || {}, [longitude, latitude] = feature.geometry.coordinates || [];
  const name = clean((metadata.nameField && p[metadata.nameField]) || p.name || p.Name || p.site_name || p.Site_Name);
  if (!name || number(latitude) == null || number(longitude) == null) return null;
  const sourceId = clean((metadata.idField && p[metadata.idField]) || p.id || p.ID || p.OBJECTID || feature.id || `${latitude},${longitude}`);
  const rawDescription = (metadata.descriptionFields || ["description", "Description", "desc_"])
    .map(field => clean(p[field])).filter(Boolean).join(" · ");
  const referenceUrl = /^https?:\/\//i.test(rawDescription) ? rawDescription : "";
  return { id:`${metadata.sourceKey || source}:${sourceId}`, sourceId, name, latitude:number(latitude), longitude:number(longitude),
    country:clean(p.country || p.country_name || metadata.country), countryCode:clean(p.country_code || metadata.countryCode), region:clean(p.region || p.state || metadata.region),
    description:referenceUrl ? "" : rawDescription, referenceUrl, max_depth:number(p.max_depth || p.depth) ?? "",
    tags:[...(metadata.tags || [])], dataSource:source, sourceUrl:metadata.sourceUrl || "", attribution:metadata.attribution || source,
    licence:metadata.licence || "review-required", rightsReview:!!metadata.rightsReview,
    evidenceClass:"recreational_site", ...(metadata.mapProperties ? metadata.mapProperties(feature) : {}) };
}

async function fetchJson(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, { headers:{ Accept:"application/geo+json, application/json" } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal:controller.signal }); }
  finally { clearTimeout(timer); }
}

async function ingestOpenDiveMap() {
  const records = []; let offset = 0, matched = Infinity;
  while (offset < matched) {
    const page = await fetchJson(`${API}?limit=1000&offset=${offset}`);
    matched = Number(page.numberMatched) || 0;
    const list = (page.features || []).map(normaliseOpenDiveMap).filter(Boolean);
    records.push(...list);
    const returned = Number(page.numberReturned) || list.length;
    if (!returned) break;
    offset += returned;
    process.stderr.write(`OpenDiveMap ${Math.min(offset, matched)}/${matched}\n`);
  }
  return records;
}

function zipEntry(buffer, wantedName) {
  let eocd = -1;
  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65557); index--) {
    if (buffer.readUInt32LE(index) === 0x06054b50) { eocd = index; break; }
  }
  if (eocd < 0) throw new Error("ZIP end-of-directory record not found");
  const entries = buffer.readUInt16LE(eocd + 10), centralOffset = buffer.readUInt32LE(eocd + 16);
  let offset = centralOffset;
  for (let index = 0; index < entries; index++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error("Invalid ZIP central directory");
    const method = buffer.readUInt16LE(offset + 10), compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28), extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32), localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    if (name === wantedName) {
      if (buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error("Invalid ZIP local header");
      const localNameLength = buffer.readUInt16LE(localOffset + 26), localExtraLength = buffer.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + localNameLength + localExtraLength, compressed = buffer.subarray(start, start + compressedSize);
      if (method === 0) return compressed;
      if (method === 8) return inflateRawSync(compressed);
      throw new Error(`Unsupported ZIP compression method ${method}`);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`${wantedName} not found in ZIP`);
}

async function ingestTaiwanDiveAttractions() {
  const response = await fetch(TAIWAN_ATTRACTIONS_ZIP);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const json = zipEntry(Buffer.from(await response.arrayBuffer()), "AttractionList.json").toString("utf8").replace(/^\uFEFF/, "");
  const payload = JSON.parse(json), records = [];
  for (const attraction of payload.Attractions || []) {
    const englishName = TAIWAN_DIVE_ATTRACTIONS.get(attraction.AttractionID);
    const latitude = number(attraction.PositionLat), longitude = number(attraction.PositionLon);
    if (!englishName || latitude == null || longitude == null || Number(attraction.IsPublicAccess) !== 1) continue;
    records.push({
      id:`taiwan-tourism:${attraction.AttractionID}`, sourceId:attraction.AttractionID, name:englishName,
      aliases:[clean(attraction.AttractionName)].filter(Boolean), latitude, longitude, country:"Taiwan", countryCode:"TW",
      region:"", description:clean(attraction.Description), tags:["government-listed diving attraction"],
      dataSource:"Taiwan Tourism Administration - Tourism Information Database",
      sourceUrl:clean(attraction.WebsiteURL) || "https://data.gov.tw/dataset/7777",
      attribution:"Taiwan Tourism Administration, Ministry of Transportation and Communications",
      licence:"Taiwan Open Government Data License 1.0", evidenceClass:"recreational_site",
      publicAccess:true, sourceUpdatedAt:clean(attraction.UpdateTime || payload.UpdateTime),
    });
  }
  if (records.length !== TAIWAN_DIVE_ATTRACTIONS.size) throw new Error(`Expected ${TAIWAN_DIVE_ATTRACTIONS.size} classified records, received ${records.length}`);
  return { records, sourceUpdatedAt:clean(payload.UpdateTime) };
}

async function ingestArcGis(source) {
  const service = await fetchJson(`${source.layer}?f=pjson`);
  if (service.geometryType !== "esriGeometryPoint" || !String(service.capabilities || "").includes("Query")) {
    throw new Error("ArcGIS layer is not a queryable point layer");
  }
  const pageSize = Math.min(Number(service.maxRecordCount) || 1000, 2000), features = [];
  let offset = 0;
  while (true) {
    const query = new URL(`${source.layer}/query`);
    Object.entries({ where:"1=1", outFields:"*", returnGeometry:"true", outSR:"4326", f:"geojson",
      resultOffset:String(offset), resultRecordCount:String(pageSize), orderByFields:`${service.fields?.find(field => field.type === "esriFieldTypeOID")?.name || "OBJECTID"} ASC` })
      .forEach(([key, value]) => query.searchParams.set(key, value));
    const page = await fetchJson(query.toString());
    features.push(...(page.features || [])); offset += (page.features || []).length;
    if (!(page.exceededTransferLimit || (page.features || []).length === pageSize) || !(page.features || []).length) break;
  }
  const metadata = { sourceKey:source.id, country:source.country, countryCode:source.countryCode, region:source.region,
    sourceUrl:source.catalogueUrl || source.layer, attribution:source.attribution, licence:source.licence,
    rightsReview:source.rightsReview, nameField:source.nameField, idField:source.idField,
    descriptionFields:source.descriptionFields, tags:source.tags, mapProperties:source.mapProperties };
  const records = source.groupByName ? normaliseGroupedArcGisPoints(features, source, metadata) :
    features.map(feature => normaliseGeoJson(feature, source.name, metadata)).filter(Boolean);
  return { records, description:clean(service.description), serviceVersion:service.currentVersion };
}

function normaliseGroupedArcGisPoints(features, source, metadata) {
  const groups = new Map();
  for (const feature of features) {
    const name = clean(feature?.properties?.name || feature?.properties?.Name);
    const coordinates = feature?.geometry?.type === "Point" ? feature.geometry.coordinates : [];
    if (!name || number(coordinates[0]) == null || number(coordinates[1]) == null) continue;
    const canonicalName = name.replace(/\bDrive Trail\b/i, "Dive Trail");
    const group = groups.get(canonicalName) || [];
    group.push(feature); groups.set(canonicalName, group);
  }
  return [...groups].map(([name, group]) => {
    const longitude = group.reduce((sum, feature) => sum + number(feature.geometry.coordinates[0]), 0) / group.length;
    const latitude = group.reduce((sum, feature) => sum + number(feature.geometry.coordinates[1]), 0) / group.length;
    const sourceId = normalName(name).replaceAll(" ", "-");
    return {
      id:`${source.id}:${sourceId}`, sourceId, name, latitude, longitude,
      country:source.country, countryCode:source.countryCode, region:"Houtman Abrolhos Islands, Western Australia",
      description:`Official marked dive trail with ${group.length} numbered route markers.`,
      tags:["dive trail"], dataSource:source.name, sourceUrl:metadata.sourceUrl,
      attribution:metadata.attribution, licence:metadata.licence, rightsReview:!!metadata.rightsReview,
      evidenceClass:"recreational_site", markerCount:group.length,
    };
  });
}

function normaliseOsm(element, source) {
  const tags = element.tags || {}, latitude = number(element.lat ?? element.center?.lat), longitude = number(element.lon ?? element.center?.lon);
  if (latitude == null || longitude == null || tags.amenity === "dive_centre" || tags.shop === "scuba_diving" || tags.club === "scuba_diving") return null;
  const name = clean(tags.name || tags["name:en"]); if (!name) return null;
  const sourceId = `${element.type}/${element.id}`, topology = clean(tags["scuba_diving:type"] || tags.natural || tags.historic);
  return {
    id:`${source.id}:${sourceId}`, sourceId, name,
    aliases:[tags.alt_name, tags.old_name, tags["name:en"]].flatMap(value => clean(value).split(";")).filter(value => value && value !== name),
    latitude, longitude, country:source.country, countryCode:source.countryCode, region:"",
    description:[topology, tags["scuba_diving:entry"] && `${tags["scuba_diving:entry"]} entry`].filter(Boolean).join(" · "),
    max_depth:number(tags["scuba_diving:maxdepth"] || tags["scuba_diving:depth"]) ?? "",
    access_instructions:clean(tags["scuba_diving:entry"]), tags:topology ? [topology] : [],
    dataSource:"OpenStreetMap contributors", sourceUrl:`https://www.openstreetmap.org/${sourceId}`,
    attribution:"© OpenStreetMap contributors", licence:"ODbL-1.0", evidenceClass:"recreational_site", _osm:true,
  };
}

async function ingestOverpass(source) {
  const selectors = [`nwr["scuba_diving:divespot"="yes"](${source.bbox});`, `nwr["sport"="scuba_diving"]["name"](${source.bbox});`, `nwr["scuba_diving:type"](${source.bbox});`].join("");
  const query = `[out:json][timeout:20];(${selectors});out center tags;`, errors = [];
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetchWithTimeout(endpoint, { method:"POST", headers:{ "Content-Type":"application/x-www-form-urlencoded;charset=UTF-8", Accept:"application/json", "User-Agent":"LiveTide dive-site ingestion/1.0" }, body:`data=${encodeURIComponent(query)}` }, 28000);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 120).replace(/\s+/g, " ")}`);
      const payload = await response.json(); if (payload.remark) throw new Error(payload.remark);
      return (payload.elements || []).map(element => normaliseOsm(element, source)).filter(Boolean);
    } catch (error) { errors.push(`${new URL(endpoint).hostname}: ${error.name === "AbortError" ? "timeout" : error.message}`); }
  }
  throw new Error(errors.join("; "));
}

const radians = value => value * Math.PI / 180;
function distanceMetres(a, b) {
  const dLat = radians(b.latitude - a.latitude), dLng = radians(b.longitude - a.longitude);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(value));
}
const normalName = value => clean(value).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
function deduplicate(records) {
  const kept = [], cells = new Map();
  for (const record of records) {
    const cell = `${Math.round(record.latitude * 100)}:${Math.round(record.longitude * 100)}`;
    const nearby = cells.get(cell) || [];
    const duplicate = nearby.find(other => normalName(other.name) === normalName(record.name) && distanceMetres(other, record) <= 250);
    if (duplicate) { duplicate.aliases = [...new Set([...(duplicate.aliases || []), ...(record.aliases || [])])]; continue; }
    kept.push(record); nearby.push(record); cells.set(cell, nearby);
  }
  return kept;
}

async function readLocal(path) {
  const value = JSON.parse(await readFile(path, "utf8"));
  const features = value.type === "FeatureCollection" ? value.features : [];
  const source = `Local ${path.replace(/^.*[\\/]/, "")}`;
  return features.map(feature => normaliseGeoJson(feature, source)).filter(Boolean);
}

const sources = [], failures = [], records = [];
if (!args.includes("--offline")) {
  try { const list = await ingestOpenDiveMap(); records.push(...list); sources.push({ id:"opendivemap", records:list.length, url:API, licence:"ODbL-1.0" }); }
  catch (error) { failures.push({ id:"opendivemap", error:String(error.message || error) }); }
  try {
    const result = await ingestTaiwanDiveAttractions(); records.push(...result.records);
    sources.push({ id:"taiwan-tourism-dive-attractions", records:result.records.length, url:TAIWAN_ATTRACTIONS_ZIP,
      catalogueUrl:"https://data.gov.tw/dataset/7777", licence:"Taiwan Open Government Data License 1.0",
      attribution:"Taiwan Tourism Administration, Ministry of Transportation and Communications", sourceUpdatedAt:result.sourceUpdatedAt,
      classification:"Manually reviewed public attractions explicitly described as recreational diving locations" });
  } catch (error) { failures.push({ id:"taiwan-tourism-dive-attractions", error:String(error.message || error) }); }
  for (const source of ARCGIS_SOURCES) {
    try {
      const result = await ingestArcGis(source); records.push(...result.records);
      sources.push({ id:source.id, records:result.records.length, url:source.layer, licence:source.licence,
        catalogueUrl:source.catalogueUrl, attribution:source.attribution, rightsReview:source.rightsReview,
        description:result.description, serviceVersion:result.serviceVersion });
    } catch (error) { failures.push({ id:source.id, error:String(error.message || error) }); }
  }
  if (args.includes("--osm")) for (const source of OSM_REGIONS) {
    try {
      const list = await ingestOverpass(source); records.push(...list);
      sources.push({ id:source.id, records:list.length, url:"https://www.openstreetmap.org/", licence:"ODbL-1.0", attribution:"© OpenStreetMap contributors", bbox:source.bbox });
    } catch (error) { failures.push({ id:source.id, error:String(error.message || error) }); }
  }
}
for (const path of localFiles) {
  try { const list = await readLocal(path); records.push(...list); sources.push({ id:path, records:list.length, url:path, licence:"review-required" }); }
  catch (error) { failures.push({ id:path, error:String(error.message || error) }); }
}
const output = deduplicate(records);
if (!output.length) throw new Error(`No records ingested. ${failures.map(item => `${item.id}: ${item.error}`).join("; ")}`);
await mkdir(new URL("../data/", import.meta.url), { recursive:true });
await writeFile(OUTPUT, JSON.stringify(output));
await writeFile(MANIFEST, JSON.stringify({ generatedAt:new Date().toISOString(), records:output.length, sources, failures }, null, 2));
process.stderr.write(`Wrote ${output.length} records to data/enriched-divesites.json\n`);

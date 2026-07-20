#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";

const IMOS_WFS = "https://geoserver-123.aodn.org.au/geoserver/ows";
const IMOS_TYPE_NAME = "imos:ep_site_list_public_data";
const NOAA_ROOT = "https://gis.ngdc.noaa.gov/arcgis/rest/services/nccos";
const OUTPUT = new URL("../data/dive-survey-evidence.json", import.meta.url);
const MANIFEST = new URL("../data/dive-survey-evidence.manifest.json", import.meta.url);
const NOAA_ATTRIBUTION = "NOAA/NOS/NCCOS Marine Spatial Ecology / Biogeography Branch";
const NOAA_LICENCE = "CC0 1.0";
const NOAA_LICENCE_URL = "https://creativecommons.org/publicdomain/zero/1.0/";
const NOAA_WARNING = "Historical habitat-map validation station; survey methods vary and the record does not establish public access, current conditions or diving safety.";
const SEASEARCH = {
  id:"ie-nbdc-seasearch-scuba-surveys",
  zipUrl:"https://maps.biodiversityireland.ie/Dataset/Download?datasetId=158",
  entryName:"SeaSearchIrishMarineSpeciesDistributions.txt",
  catalogueUrl:"https://data.gov.ie/dataset/seasearch-records-from-irish-coastal-waters",
  rawSha256:"cec9bfee025dfc6b1d949fee70cd42414287c92b391b0f800ad7cb0c52091475",
  expectedRecords:1057,
  expectedOccurrences:40153,
};
const NOAA_EXPECTED_HASHES = {
  "noaa-as-habitat-validation":"1ab46228b3b809655dbd12ad12d7857598500e52e1e1b4a76dbe90c97458f56b",
  "noaa-buis-habitat-validation":"131dc6b3473b1c1081ec2346922ce2c90c0e4fef7dc78bab420dda75e352c8a2",
  "noaa-cnmi-habitat-validation":"382bae11785b5a47935013f78bf11a0f93a6fed631d0127f8d6cb87b2c767ae1",
  "noaa-guam-habitat-validation":"2bd671afd120c9fcda69e3b95676aee511ce3dc77d0794b283dd541c3a67de0e",
  "noaa-hawaii-habitat-validation":"42edc0b4277e90dbbe6a6c1ee54b499c9d77a43d463b21d3004db8b41073e61d",
  "noaa-ner-habitat-validation":"0622b495505006c4c92977a255594663e6e75ccb3a14e0bb86cef969f5b06b6b",
  "noaa-palau-habitat-validation":"e068df11c37ce0f5babbd38901c18b6cd9de6aaa725c082abec4814e9b9f62ef",
  "noaa-palmyra-habitat-validation":"a015cfbe24898475d7c8910330b01a50ed8dc5f35566a8ffca150831ae06a444",
  "noaa-steer-habitat-validation":"e4875a938cdd1ba2d84fc86075e6da4d66b7a21ec8ca82a1ad9fb49778ad3acb",
  "noaa-stjohn-habitat-validation":"736c4ca33192e3b2d0bf8b34ea27b8a0f3f270fce7a43d7769f119320528eafc",
  "noaa-swpr-habitat-validation":"b506d4e096d0a7e46dddb486146d4193777ec08ef9be96afa51c6d0854bd8ee0",
  "noaa-vieques-habitat-validation":"27a07a26d45f8cbd778e901e86725f735a6144b44e923ce362a371a6d8319c8f",
  "noaa-richard-2022-reef-assessment":"3eb9357d783ae03b096698b5b681b9fe1db6ee3d910090b4c4fbf5adc4d0d57d",
};

const NOAA_SOURCES = [
  ["noaa-as-habitat-validation", "BenthicMapping_AS_Dynamic", 0, 960, "American Samoa", "American Samoa"],
  ["noaa-buis-habitat-validation", "BenthicMapping_BUIS_Dynamic", 0, 2044, "United States Virgin Islands", "Buck Island Reef National Monument"],
  ["noaa-cnmi-habitat-validation", "BenthicMapping_CNMI_Dynamic", 0, 1028, "Northern Mariana Islands", "Commonwealth of the Northern Mariana Islands"],
  ["noaa-guam-habitat-validation", "BenthicMapping_Guam_Dynamic", 0, 504, "Guam", "Guam"],
  ["noaa-hawaii-habitat-validation", "BenthicMapping_Hawaii_Dynamic", 0, 2846, "United States", "Hawaii"],
  ["noaa-ner-habitat-validation", "BenthicMapping_NER_Dynamic", 3, 2868, "Puerto Rico", "Northeast Puerto Rico and Culebra"],
  ["noaa-palau-habitat-validation", "BenthicMapping_Palau_Dynamic", 0, 1753, "Palau", "Palau"],
  ["noaa-palmyra-habitat-validation", "BenthicMapping_Palmyra_Dynamic", 0, 476, "United States Minor Outlying Islands", "Palmyra Atoll"],
  ["noaa-steer-habitat-validation", "BenthicMapping_STEER_Dynamic", 0, 974, "United States Virgin Islands", "St Thomas and St John"],
  ["noaa-stjohn-habitat-validation", "BenthicMapping_StJohn_Dynamic", 0, 1346, "United States Virgin Islands", "St John"],
  ["noaa-swpr-habitat-validation", "BenthicMapping_SWPR_Dynamic", 0, 927, "Puerto Rico", "Southwest Puerto Rico"],
  ["noaa-vieques-habitat-validation", "BenthicMapping_Vieques_Dynamic", 0, 322, "Puerto Rico", "Vieques"],
].map(([id, service, layer, expectedRecords, country, area]) => ({ id, service, layer, expectedRecords, country, area }));
NOAA_SOURCES.push({
  id:"noaa-richard-2022-reef-assessment",
  layerUrl:"https://services2.arcgis.com/C8EMgrsFcRFL6LrL/arcgis/rest/services/RICHARD_Benthic_Survey_Sites/FeatureServer/0",
  expectedRecords:161,
  country:"Guam and Northern Mariana Islands",
  area:"Guam and CNMI",
  label:"NOAA PIFSC RICHARD 2022 reef assessment",
  attribution:"NOAA Pacific Islands Fisheries Science Center (PIFSC); NOAA National Centers for Coastal Ocean Science (NCCOS)",
  evidenceClass:"reef_assessment_dive_station",
  dataWarning:"Historical 2022 NOAA scientific-diver monitoring station; the record does not establish public access, current conditions or recreational diving safety.",
  richard:true,
});

async function fetchJson(url, label) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, { signal:controller.signal, headers:{ Accept:"application/geo+json, application/json", "User-Agent":"LiveTide dive evidence ingestion/1.0" } });
    if (!response.ok) throw new Error(`${label} returned ${response.status}`);
    const payload = await response.json();
    if (payload?.error) throw new Error(`${label}: ${payload.error.message || "ArcGIS error"}`);
    return payload;
  } finally { clearTimeout(timer); }
}

async function fetchBuffer(url, label) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 60000);
  try {
    const response = await fetch(url, { signal:controller.signal, headers:{ Accept:"application/zip", "User-Agent":"LiveTide dive evidence ingestion/1.0" } });
    if (!response.ok) throw new Error(`${label} returned ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } finally { clearTimeout(timer); }
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

async function fetchImosPage(startIndex, count) {
  const url = new URL(IMOS_WFS);
  Object.entries({ service:"WFS", version:"1.0.0", request:"GetFeature", typeName:IMOS_TYPE_NAME,
    outputFormat:"application/json", startIndex:String(startIndex), maxFeatures:String(count), sortBy:"site_code" })
    .forEach(([key, value]) => url.searchParams.set(key, value));
  return fetchJson(url, "IMOS WFS");
}

async function fetchImos() {
  const pageSize = 1000, features = [];
  let startIndex = 0, matched = Infinity;
  while (startIndex < matched) {
    const page = await fetchImosPage(startIndex, pageSize);
    matched = Number(page.numberMatched ?? page.totalFeatures) || 0;
    features.push(...(page.features || []));
    const returned = Number(page.numberReturned) || (page.features || []).length;
    if (!returned) break;
    startIndex += returned;
    process.stderr.write(`IMOS/RLS ${Math.min(startIndex, matched)}/${matched}\n`);
  }
  return features;
}

async function fetchNoaa(source) {
  const layerUrl = source.layerUrl || `${NOAA_ROOT}/${source.service}/MapServer/${source.layer}`;
  const metadata = await fetchJson(`${layerUrl}?f=json`, source.id);
  const objectIdField = metadata.objectIdField || metadata.fields?.find(field => field.type === "esriFieldTypeOID")?.name || "OBJECTID";
  const pageSize = Math.min(Number(metadata.maxRecordCount) || 1000, 1000), features = [];
  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(`${layerUrl}/query`);
    Object.entries({ where:"1=1", outFields:"*", returnGeometry:"true", outSR:"4326", f:"geojson",
      resultOffset:String(offset), resultRecordCount:String(pageSize), orderByFields:objectIdField })
      .forEach(([key, value]) => url.searchParams.set(key, value));
    const page = await fetchJson(url, source.id), returned = page.features || [];
    features.push(...returned);
    process.stderr.write(`${source.id} ${features.length}/${source.expectedRecords}\n`);
    if (returned.length < pageSize) break;
  }
  if (features.length !== source.expectedRecords) throw new Error(`${source.id} expected ${source.expectedRecords} records, received ${features.length}`);
  return { features, layerUrl, objectIdField, layerName:metadata.name || "Dive Sites" };
}

const clean = value => value == null ? "" : String(value).trim();
const pick = (properties, names) => {
  for (const name of names) if (properties[name] != null && clean(properties[name])) return properties[name];
  return "";
};
const number = value => value !== "" && value != null && Number.isFinite(+value) ? +value : undefined;
const date = value => {
  if (!value) return "";
  if (Number.isFinite(+value) && +value > 100000000000) return new Date(+value).toISOString().slice(0, 10);
  return clean(value);
};
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const bufferHash = value => createHash("sha256").update(value).digest("hex");
const compact = (values, limit = 600) => [...new Set(values.map(clean).filter(Boolean))].join("; ").slice(0, limit);
const isoDate = value => {
  const match = clean(value).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : clean(value);
};

function parseSeaSearch(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/), header = lines.shift()?.split("\t") || [];
  const column = Object.fromEntries(header.map((name, index) => [name, index]));
  const required = ["SurveyKey", "Date", "TaxonName", "East", "North", "SiteName", "Habitat description", "Record comment", "Recorder"];
  if (required.some(name => column[name] == null)) throw new Error(`SeaSearch export is missing required columns: ${required.filter(name => column[name] == null).join(", ")}`);
  const groups = new Map();
  for (const line of lines) {
    if (!line) continue;
    const row = line.split("\t"), surveyKey = clean(row[column.SurveyKey]), siteName = clean(row[column.SiteName]);
    const longitude = number(row[column.East]), latitude = number(row[column.North]);
    if (!surveyKey || !siteName || latitude == null || longitude == null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    const locationId = `${surveyKey}:${latitude.toFixed(8)}:${longitude.toFixed(8)}`;
    const siteDigest = createHash("sha256").update(siteName).digest("hex").slice(0, 12);
    const sourceId = `${locationId}:${siteDigest}`, key = `${locationId}:${siteName}`;
    let group = groups.get(key);
    if (!group) {
      group = { sourceId, surveyKey, siteName, latitude, longitude, dates:[], taxa:[], habitats:[], comments:[], recorders:[], occurrenceRecords:0 };
      groups.set(key, group);
    }
    group.occurrenceRecords++;
    group.dates.push(row[column.Date]);
    group.taxa.push(row[column.TaxonName]);
    group.habitats.push(row[column["Habitat description"]]);
    group.comments.push(row[column["Record comment"]]);
    group.recorders.push(row[column.Recorder]);
  }
  return [...groups.values()].map(group => ({
    id:`${SEASEARCH.id}:${group.sourceId}`, sourceKey:SEASEARCH.id, sourceId:group.sourceId, surveyKey:group.surveyKey,
    name:`${group.siteName} SeaSearch survey`, latitude:group.latitude, longitude:group.longitude, country:"Ireland", area:group.siteName,
    surveyDate:isoDate(group.dates.find(Boolean)), surveyType:"trained citizen-scientist SCUBA visual survey",
    occurrenceRecords:group.occurrenceRecords, taxonCount:new Set(group.taxa.map(clean).filter(Boolean)).size,
    habitatSummary:compact(group.habitats), surveyNotes:compact(group.comments), recorders:compact(group.recorders, 250),
    evidenceClass:"citizen_science_scuba_survey_station",
  }));
}

function normaliseImos(feature) {
  const p = feature?.properties || {}, [longitude, latitude] = feature?.geometry?.coordinates || [];
  if (!p.site_code || !p.site_name || !Number.isFinite(+latitude) || !Number.isFinite(+longitude)) return null;
  return {
    id:`imos-rls:${p.site_code}`, sourceKey:"imos-nrmn-rls", sourceId:String(p.site_code), name:String(p.site_name),
    latitude:+latitude, longitude:+longitude, country:clean(p.country), area:clean(p.area), location:clean(p.location),
    realm:clean(p.realm), province:clean(p.province), ecoregion:clean(p.ecoregion), latitudeZone:clean(p.lat_zone),
    programs:clean(p.programs), evidenceClass:"diver_survey_station",
  };
}

function normaliseNoaa(feature, source, objectIdField) {
  const p = feature?.properties || {}, [longitude, latitude] = feature?.geometry?.coordinates || [];
  const sourceId = clean(p[objectIdField] ?? p.OBJECTID);
  if (!sourceId || !Number.isFinite(+latitude) || !Number.isFinite(+longitude) || Math.abs(+latitude) > 90 || Math.abs(+longitude) > 180) return null;
  const surveySiteId = clean(pick(p, ["Site_ID", "SITE_ID", "SITE", "Site", "POINT"]));
  const richardAreas = { GUA:"Guam", ROT:"Rota", TIN:"Tinian", SAI:"Saipan", PAG:"Pagan", ASC:"Asuncion", MAU:"Maug" };
  const richardArea = source.richard ? richardAreas[surveySiteId.split("-")[0]] || source.area : source.area;
  const richardCountry = source.richard ? (richardArea === "Guam" ? "Guam" : "Northern Mariana Islands") : source.country;
  const activityFields = source.richard ? {
    FISH_REA_S:"fish reef assessment", CORAL_BELT:"coral belt survey", PHOTOQUAD_:"photo quadrat", SFM_YN:"structure-from-motion",
    DS_SUITE_A:"diver survey suite", CB_ACTIVIT:"carbonate chemistry", CTD_ACTIVI:"CTD profile", H2O_ACTIVI:"water sampling",
    STR_DEP_AC:"temperature recorder deployment", STR_REC_AC:"temperature recorder recovery", CAUS_DEPLO:"calcification unit deployment",
    CAUS_RETRI:"calcification unit recovery", BMUS_DEPLO:"bioerosion unit deployment", BMUS_RETRI:"bioerosion unit recovery",
  } : {};
  const surveyActivities = Object.entries(activityFields).filter(([field]) => clean(p[field]).toUpperCase() === "YES").map(([, label]) => label).join(", ");
  const record = {
    id:`${source.id}:${sourceId}`, sourceKey:source.id, sourceId, surveySiteId,
    name:`${source.richard ? `${richardArea} reef assessment` : `${source.area} habitat survey`} ${surveySiteId || sourceId}`, latitude:+latitude, longitude:+longitude,
    country:richardCountry, area:richardArea,
    missionId:clean(pick(p, ["MISSIONID"])), surveyActivities,
    surveyDate:date(pick(p, ["SUR_DATE", "GPS_DATE", "GPS_Date", "DATE_", "Date_", "Date"])),
    surveyYear:number(pick(p, ["SUR_YEAR"])), surveyType:clean(pick(p, ["Site_Type", "DATA_TYPE", "TYPE", "Type", "SURVEY"])),
    assessment:clean(pick(p, ["Assessment", "ASSESSMENT", "UW_ASSESSM"])),
    method:clean(pick(p, ["Symbol", "SYMBOL"])), sourceDepth:number(pick(p, ["DEPTH"])),
    majorStructure:clean(pick(p, ["MAJ_STRUCT", "M_STRUCT", "Maj_Struct"])),
    detailedStructure:clean(pick(p, ["DET_STRUCT", "D_STRUCT", "Det_Struct"])),
    majorCover:clean(pick(p, ["PRIM_COVER", "M_COVER", "Maj_Cover"])),
    coverPercent:number(pick(p, ["P_MAJ_COV", "P_COVER"])), coralCover:number(pick(p, ["P_CORAL_CV", "P_CORAL"])),
    zone:clean(pick(p, ["ZONE", "Zone"])), relief:clean(pick(p, ["RELIEF"])), comments:clean(pick(p, ["COMMENTS", "Comments"])),
    bleaching:clean(pick(p, ["BLEACHING"])), photoCount:number(pick(p, ["PhotoCount"])),
    videoExists:clean(pick(p, ["VideoExists"])), evidenceClass:source.evidenceClass || "marine_habitat_validation_station",
  };
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== "" && value !== undefined));
}

const records = [], seen = new Set(), sources = {}, manifestSources = [], failures = [];
function addRecords(list) {
  for (const record of list) {
    if (!record || seen.has(record.id)) continue;
    seen.add(record.id); records.push(record);
  }
}

try {
  const archive = await fetchBuffer(SEASEARCH.zipUrl, SEASEARCH.id), raw = zipEntry(archive, SEASEARCH.entryName);
  const sourceHash = bufferHash(raw);
  if (sourceHash !== SEASEARCH.rawSha256) throw new Error(`${SEASEARCH.id} source hash changed: ${sourceHash}`);
  const normalised = parseSeaSearch(raw.toString("utf8"));
  const occurrences = normalised.reduce((sum, record) => sum + record.occurrenceRecords, 0);
  if (normalised.length !== SEASEARCH.expectedRecords || occurrences !== SEASEARCH.expectedOccurrences) {
    throw new Error(`${SEASEARCH.id} produced ${normalised.length}/${SEASEARCH.expectedRecords} survey events and ${occurrences}/${SEASEARCH.expectedOccurrences} occurrences`);
  }
  sources[SEASEARCH.id] = {
    dataSource:"SeaSearch records from Irish coastal waters", sourceUrl:SEASEARCH.catalogueUrl,
    attribution:"National Biodiversity Data Centre and SeaSearch trained citizen-scientist divers",
    licence:"CC BY 4.0", licenceUrl:"https://creativecommons.org/licenses/by/4.0/", rightsReview:false,
    evidenceClass:"citizen_science_scuba_survey_station",
    dataWarning:"Historical 2003-2021 biological recording by trained volunteer SCUBA divers; the survey coordinate does not establish public access, current conditions or diving safety.",
  };
  addRecords(normalised);
  manifestSources.push({ id:SEASEARCH.id, url:SEASEARCH.zipUrl, catalogueUrl:SEASEARCH.catalogueUrl, entryName:SEASEARCH.entryName,
    records:normalised.length, occurrenceRecords:occurrences, expectedRecords:SEASEARCH.expectedRecords,
    expectedOccurrences:SEASEARCH.expectedOccurrences, sourceHash, observationPeriod:"2003-2021", ...sources[SEASEARCH.id] });
  process.stderr.write(`SeaSearch ${normalised.length} survey events / ${occurrences} occurrences\n`);
} catch (error) { failures.push({ source:SEASEARCH.id, error:String(error?.message || error) }); }

try {
  const features = await fetchImos(), normalised = features.map(normaliseImos).filter(Boolean);
  sources["imos-nrmn-rls"] = {
    dataSource:"IMOS National Reef Monitoring Network", sourceUrl:"https://www.data.gov.au/data/dataset/imos-national-reef-monitoring-network-sub-facility-site-information",
    attribution:"Integrated Marine Observing System (IMOS), National Reef Monitoring Network and Reef Life Survey contributors",
    licence:"Catalogue states freely available for non-profit use; formal dataset licence is unspecified and requires confirmation",
    rightsReview:true, evidenceClass:"diver_survey_station",
    dataWarning:"Historical survey station; not proof of public access, current conditions or diving safety.",
  };
  addRecords(normalised);
  manifestSources.push({ id:"imos-nrmn-rls", url:IMOS_WFS, typeName:IMOS_TYPE_NAME, records:normalised.length,
    sourceHash:hash(features), ...sources["imos-nrmn-rls"] });
} catch (error) { failures.push({ source:"imos-nrmn-rls", error:String(error?.message || error) }); }

for (const source of NOAA_SOURCES) try {
  const { features, layerUrl, objectIdField, layerName } = await fetchNoaa(source);
  const sourceHash = hash(features), expectedHash = NOAA_EXPECTED_HASHES[source.id];
  if (!expectedHash || sourceHash !== expectedHash) throw new Error(`${source.id} source hash changed: ${sourceHash}`);
  const normalised = features.map(feature => normaliseNoaa(feature, source, objectIdField)).filter(Boolean);
  if (normalised.length !== source.expectedRecords) throw new Error(`${source.id} produced ${normalised.length}/${source.expectedRecords} valid coordinates`);
  sources[source.id] = { dataSource:source.label || `NOAA NCCOS ${source.area} habitat validation`, sourceUrl:layerUrl,
    attribution:source.attribution || NOAA_ATTRIBUTION, licence:NOAA_LICENCE, licenceUrl:NOAA_LICENCE_URL, rightsReview:false,
    evidenceClass:source.evidenceClass || "marine_habitat_validation_station", dataWarning:source.dataWarning || NOAA_WARNING };
  addRecords(normalised);
  manifestSources.push({ id:source.id, url:layerUrl, layerName, records:normalised.length, expectedRecords:source.expectedRecords,
    sourceHash, ...sources[source.id] });
} catch (error) {
  failures.push({ source:source.id, error:String(error?.message || error) });
}

if (failures.length) throw new Error(`Evidence ingestion failed closed: ${failures.map(item => `${item.source}: ${item.error}`).join("; ")}`);
await mkdir(new URL("../data/", import.meta.url), { recursive:true });
await writeFile(OUTPUT, JSON.stringify({ sources, records }));
await writeFile(MANIFEST, JSON.stringify({ generatedAt:new Date().toISOString(), records:records.length, sources:manifestSources, failures }, null, 2));
process.stderr.write(`Wrote ${records.length} survey stations from ${manifestSources.length} sources to data/dive-survey-evidence.json\n`);

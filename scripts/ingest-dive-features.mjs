#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";

const OUTPUT = new URL("../data/dive-feature-evidence.json", import.meta.url);
const MANIFEST = new URL("../data/dive-feature-evidence.manifest.json", import.meta.url);
const SOURCES = [{
  id:"fl-fwc-artificial-reefs",
  layer:"https://gis.myfwc.com/mapping/rest/services/Open_Data/Artificial_Reef_Locations_in_Florida/MapServer/12",
  name:"Florida FWC Artificial Reef Deployments",
  attribution:"Florida Fish and Wildlife Conservation Commission, Division of Marine Fisheries Management",
  licence:"Available without restriction; attribution expected",
  evidenceClass:"artificial_reef_deployment",
  sourceUrl:"https://myfwc.com/fishing/saltwater/artificial-reefs/locate/",
  normalise(feature, source) {
    const p = feature.properties || {}, coordinates = feature.geometry?.coordinates || [];
    const longitude = number(coordinates[0]), latitude = number(coordinates[1]);
    const sourceId = clean(p.DeployID), name = clean(p.Name || p.DeployID);
    if (!sourceId || !name || latitude == null || longitude == null || !latitude && !longitude) return null;
    return {
      id:`${source.id}:${sourceId}`, sourceId, name, latitude, longitude,
      region:[clean(p.County), "Florida"].filter(Boolean).join(", "), county:clean(p.County), coast:clean(p.Coast),
      featureType:"Artificial reef deployment", deploymentDate:clean(p.DeployDate),
      description:clean(p.Description), materialDescription:clean(p.MatDescrip), materialCategory:clean(p.MatCat),
      jurisdiction:clean(p.Jurisdiction), tonnage:number(p.Tonnage), depthFeet:number(p.Depth), reliefFeet:number(p.Relief),
      locationAccuracy:number(p.LocAccuracy), sourceUpdatedAt:p.last_edited_date ? new Date(Number(p.last_edited_date)).toISOString() : "",
      protection:"Not verified for navigation, access or diving safety",
      dataSource:source.name, attribution:source.attribution, licence:source.licence,
      evidenceClass:source.evidenceClass, sourceUrl:source.sourceUrl,
    };
  },
}, {
  id:"us-noaa-awois-wrecks",
  layer:"https://services5.arcgis.com/HDRa0B57OVrv2E1q/arcgis/rest/services/Wrecks_and_Obstructions/FeatureServer/0",
  name:"NOAA AWOIS Wrecks and Obstructions (public NYSDOS mirror)",
  attribution:"NOAA Office of Coast Survey; public service mirror provided by New York Department of State",
  licence:"Public free informational use; source citation required; not for navigation",
  evidenceClass:"charted_wreck_or_obstruction",
  sourceUrl:"https://www.fisheries.noaa.gov/inport/item/70439",
  normalise(feature, source) {
    const p = feature.properties || {}, coordinates = feature.geometry?.coordinates || [];
    const longitude = number(coordinates[0]), latitude = number(coordinates[1]);
    const objectId = clean(p.OBJECTID_1 || p.OBJECTID), recordNumber = clean(p.record || objectId);
    const featureType = clean(p.vesselTerm || "Wreck or obstruction").toLowerCase().replace(/^./, value => value.toUpperCase());
    if (!objectId || latitude == null || longitude == null || !latitude && !longitude) return null;
    const depth = number(p.depth), depthUnits = clean(p.soundingTy).toLowerCase();
    return {
      id:`${source.id}:${objectId}`, sourceId:objectId, recordNumber, name:`NOAA ${featureType.toLowerCase()} record ${recordNumber}`,
      latitude, longitude, featureType, chart:clean(p.chart), positionQuality:clean(p.positionQu),
      positionMethod:clean(p.positionSo), depthLabel:depth == null ? "" : `${depth} ${depthUnits.includes("meter") ? "m" : depthUnits.includes("feet") ? "ft" : "depth units"}`,
      whenLost:number(p.yearSunk) > 0 ? String(number(p.yearSunk)) : "", areaIdentifier:clean(p.areaIdenti),
      protection:"Legacy AWOIS evidence; verify the current chart, position, protection and access",
      dataSource:source.name, attribution:source.attribution, licence:source.licence,
      evidenceClass:source.evidenceClass, sourceUrl:source.sourceUrl, sourceSnapshot:"Public mirror modified 2024-10-08",
    };
  },
}, {
  id:"wa-museum-shipwrecks",
  layer:"https://public-services.slip.wa.gov.au/public/rest/services/SLIP_Public_Services/People_and_Society/MapServer/0",
  name:"Western Australian Museum Shipwrecks (WAM-002)",
  attribution:"© Western Australian Museum",
  licence:"CC BY 4.0",
  evidenceClass:"recorded_wreck",
  sourceUrl:"https://catalogue.data.wa.gov.au/dataset/shipwrecks",
}, {
  id:"vicmap-hydro-wrecks",
  kind:"wfs",
  url:"https://opendata.maps.vic.gov.au/geoserver/wfs",
  typeName:"open-data-platform:hy_navigation_point",
  cqlFilter:"feature_type_code='wreck'",
  name:"Vicmap Hydro Navigation Point - Wrecks",
  attribution:"State of Victoria, Department of Transport and Planning",
  licence:"CC BY 4.0",
  evidenceClass:"charted_wreck",
  sourceUrl:"https://discover.data.vic.gov.au/dataset/vicmap-hydro-navigation-point",
  normalise(feature, source) {
    const p = feature.properties || {}, coordinates = feature.geometry?.coordinates || [];
    const longitude = number(coordinates[0]), latitude = number(coordinates[1]);
    const sourceId = clean(p.ufi || p.feature_ufi || feature.id);
    if (!sourceId || latitude == null || longitude == null || (!latitude && !longitude)) return null;
    return {
      id:`${source.id}:${sourceId}`, sourceId, name:`Vicmap charted wreck ${sourceId}`, latitude, longitude,
      featureType:"Charted wreck", sourceQualityCode:clean(p.feature_quality_id),
      sourceUpdatedAt:clean(p.auth_org_verified || p.feature_create_date_ufi || p.create_date_ufi),
      protection:"Hydrographic feature evidence only; verify current charts, heritage protection, access and diving safety",
      dataSource:source.name, attribution:source.attribution, licence:source.licence,
      evidenceClass:source.evidenceClass, sourceUrl:source.sourceUrl,
    };
  },
}, {
  id:"emodnet-heritage-wrecks",
  kind:"wfs",
  url:"https://ows.emodnet-humanactivities.eu/wfs",
  typeName:"emodnet:heritageshipwrecks",
  name:"EMODnet Human Activities - Heritage Ship Wrecks",
  attribution:"EMODnet Human Activities; original authority retained per record",
  licence:"CC BY 4.0",
  evidenceClass:"heritage_wreck",
  sourceUrl:"https://emodnet.ec.europa.eu/en/human-activities",
  normalise(feature, source) {
    const p = feature.properties || {}, coordinates = feature.geometry?.coordinates || [];
    const longitude = number(coordinates[0]), latitude = number(coordinates[1]);
    const sourceId = known(p.source_id || feature.id), name = known(p.name) || `Heritage wreck ${sourceId}`;
    if (!sourceId || latitude == null || longitude == null || (!latitude && !longitude)) return null;
    const leastDepth = number(p.least_depth), maximumDepth = number(p.max_depth), depthInfo = known(p.depth_info);
    const depthLabel = depthInfo || (leastDepth > 0 && maximumDepth > leastDepth ? `${leastDepth}-${maximumDepth} m`
      : leastDepth > 0 ? `${leastDepth} m` : maximumDepth > 0 ? `${maximumDepth} m` : "");
    const referenceUrl = [p.website1, p.website2].map(known).find(value => /^https?:\/\//i.test(value)) || "";
    return {
      id:`${source.id}:${sourceId}`, sourceId, name, latitude, longitude, country:known(p.country),
      featureType:known(p.obj_type) || "Heritage shipwreck", whenLost:known(p.sink_yr), depthLabel,
      locationAccuracy:number(p.loc_prec), sourceOrigin:known(p.source_inf), sourceUpdatedAt:known(p.yr_updated),
      positionMethod:known(p.point_info), protection:known(p.statutory) || "Heritage status and access must be verified",
      referenceUrl, dataSource:source.name, attribution:source.attribution, licence:source.licence,
      evidenceClass:source.evidenceClass, sourceUrl:source.sourceUrl,
    };
  },
}, {
  id:"ph-namria-wrecks",
  kind:"wms-kml",
  url:"https://geoserver.geoportal.gov.ph/geoserver/geoportal/wms?service=WMS&version=1.1.1&request=GetMap&layers=geoportal%3Ahd_wreck&styles=&bbox=116.7,4.5,125.7,21.7&width=2048&height=2048&srs=EPSG%3A4326&format=application%2Fvnd.google-earth.kml%2Bxml&transparent=true",
  name:"NAMRIA Geoportal Philippines - Wreck",
  attribution:"National Mapping and Resource Information Authority (NAMRIA), Geoportal Philippines",
  licence:"Open under NAMRIA Memorandum Order No. 008, series of 2022",
  evidenceClass:"navigational_wreck",
  sourceUrl:"https://www.geoportal.gov.ph/",
}];

const clean = value => value == null ? "" : String(value).trim();
const known = value => { const result = clean(value); return /^(?:n\/?a|unknown|null|-)$/i.test(result) ? "" : result; };
const number = value => { const result = Number(value); return Number.isFinite(result) ? result : null; };

async function fetchJson(url) {
  const response = await fetch(url, { headers:{ Accept:"application/geo+json, application/json" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { headers:{ Accept:"application/vnd.google-earth.kml+xml, application/xml, text/xml" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.text();
}

const decodeXml = value => String(value || "").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"')
  .replaceAll("&#39;", "'").replaceAll("&amp;", "&");

async function ingestWmsKml(source) {
  const kml = await fetchText(source.url), records = [];
  for (const match of kml.matchAll(/<Placemark[^>]*>([\s\S]*?)<\/Placemark>/g)) {
    const block = match[1], featureId = decodeXml(block.match(/<name>([\s\S]*?)<\/name>/)?.[1]).trim();
    const coordinates = block.match(/<coordinates>\s*([-+\d.]+),([-+\d.]+)/);
    const description = decodeXml(block.match(/<description>([\s\S]*?)<\/description>/)?.[1]);
    const fields = Object.fromEntries([...description.matchAll(/<span class="atr-name">([^<]+)<\/span>:\s*<\/strong>\s*<span class="atr-value">([^<]*)<\/span>/g)]
      .map(item => [decodeXml(item[1]).trim(), decodeXml(item[2]).trim()]));
    const latitude = number(coordinates?.[2]), longitude = number(coordinates?.[1]), name = clean(fields.name);
    if (!featureId || !name || /^[-–—]$/.test(name) || latitude == null || longitude == null) continue;
    records.push({
      id:`${source.id}:${featureId}`, sourceId:featureId, name, latitude, longitude,
      region:clean(fields.location), whereLost:clean(fields.location), featureType:"Navigational wreck",
      chart:clean(fields.chart), coast:clean(fields.coast), protection:"Check current Philippine navigation and heritage restrictions",
      dataSource:source.name, attribution:source.attribution, licence:source.licence,
      evidenceClass:source.evidenceClass, sourceUrl:source.sourceUrl,
    });
  }
  if (!records.length) throw new Error("Public WMS KML returned no wreck features");
  return records;
}

async function ingestArcGis(source) {
  const service = await fetchJson(`${source.layer}?f=pjson`);
  if (service.geometryType !== "esriGeometryPoint" || !String(service.capabilities || "").includes("Query")) {
    throw new Error("ArcGIS layer is not a queryable point layer");
  }
  const oid = service.fields?.find(field => field.type === "esriFieldTypeOID")?.name || "OBJECTID";
  const pageSize = Math.min(Number(service.maxRecordCount) || 1000, 2000), features = [];
  let offset = 0;
  while (true) {
    const query = new URL(`${source.layer}/query`);
    Object.entries({ where:"1=1", outFields:"*", returnGeometry:"true", outSR:"4326", f:"geojson",
      resultOffset:String(offset), resultRecordCount:String(pageSize), orderByFields:`${oid} ASC` })
      .forEach(([key, value]) => query.searchParams.set(key, value));
    const collection = await fetchJson(query), page = collection.features || [];
    features.push(...page); offset += page.length;
    if (!page.length || !(collection.exceededTransferLimit || page.length === pageSize)) break;
  }
  return features.map(feature => source.normalise ? source.normalise(feature, source) : (() => {
    const p = feature.properties || {}, coordinates = feature.geometry?.coordinates || [];
    const longitude = number(coordinates[0]), latitude = number(coordinates[1]);
    const sourceId = clean(p.unique_num || p.ogc_fid || feature.id), name = clean(p.name);
    if (!sourceId || !name || latitude == null || longitude == null || !latitude && !longitude) return null;
    return {
      id:`${source.id}:${sourceId}`, sourceId, name, latitude, longitude,
      region:clean(p.region), whereLost:clean(p.where_lost), featureType:clean(p.type_of_si || "Shipwreck"),
      whenLost:clean(p.when_lost), whenFound:clean(p.when_found), inspected:clean(p.date_inspe),
      protection:clean(p.protected), positionMethod:clean(p.position_i), construction:clean(p.constructi),
      minimumDepth:number(p.min_depth) || null, maximumDepth:number(p.max_depth) || null,
      referenceUrl:clean(p.url).replace(/^http:\/\//i, "https://"),
      dataSource:source.name, attribution:source.attribution, licence:source.licence, sourceUrl:source.sourceUrl,
      evidenceClass:source.evidenceClass,
    };
  })()).filter(Boolean);
}

async function ingestWfs(source) {
  const features = [], pageSize = 2000;
  let startIndex = 0, matched = Infinity;
  while (startIndex < matched) {
    const query = new URL(source.url);
    Object.entries({ service:"WFS", version:"2.0.0", request:"GetFeature", typeNames:source.typeName,
      outputFormat:"application/json", srsName:"EPSG:4326", CQL_FILTER:source.cqlFilter || "INCLUDE",
      count:String(pageSize), startIndex:String(startIndex) })
      .forEach(([key, value]) => query.searchParams.set(key, value));
    const collection = await fetchJson(query), page = collection.features || [];
    const reported = Number(collection.numberMatched ?? collection.totalFeatures);
    if (Number.isFinite(reported)) matched = reported;
    features.push(...page);
    if (!page.length || page.length < pageSize) break;
    startIndex += page.length;
  }
  if (!features.length) throw new Error("Public WFS returned no matching point features");
  return features.map(feature => source.normalise(feature, source)).filter(Boolean);
}

const records = [], sources = [], failures = [];
for (const source of SOURCES) try {
  const list = source.kind === "wms-kml" ? await ingestWmsKml(source)
    : source.kind === "wfs" ? await ingestWfs(source) : await ingestArcGis(source);
  records.push(...list.map(record => ({ ...record, sourceKey:source.id })));
  sources.push({ id:source.id, records:list.length, url:source.layer || source.url, sourceUrl:source.sourceUrl,
    licence:source.licence, attribution:source.attribution, evidenceClass:source.evidenceClass });
} catch (error) { failures.push({ id:source.id, error:String(error.message || error) }); }
if (!records.length) throw new Error(`No feature evidence ingested. ${failures.map(item => item.error).join("; ")}`);
await mkdir(new URL("../data/", import.meta.url), { recursive:true });
const sourceRegistry = Object.fromEntries(sources.map(source => [source.id, {
  dataSource:SOURCES.find(item => item.id === source.id)?.name || source.id,
  attribution:source.attribution, licence:source.licence, sourceUrl:source.sourceUrl,
}]));
const compactRecords = records.map(record => {
  const { dataSource, attribution, licence, sourceUrl, ...compact } = record;
  return compact;
});
await writeFile(OUTPUT, JSON.stringify({ version:2, sources:sourceRegistry, records:compactRecords }));
await writeFile(MANIFEST, JSON.stringify({ generatedAt:new Date().toISOString(), formatVersion:2, records:records.length, sources, failures }, null, 2));
process.stderr.write(`Wrote ${records.length} feature-evidence records\n`);

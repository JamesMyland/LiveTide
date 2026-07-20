#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";

const OUTPUT = new URL("../data/enriched-divesites.json", import.meta.url);
const MANIFEST = new URL("../data/enriched-divesites.manifest.json", import.meta.url);
const SOURCE_METADATA_DIR = new URL("../data/source-metadata/", import.meta.url);
const API = "https://api.opendivemap.com/v1/sites";
const HAWAII_DAY_USE_MOORINGS = {
  id:"us-hi-dlnr-day-use-moorings",
  pageUrl:"https://dlnr.hawaii.gov/dobor/dmb/locations/",
  rowSha256:"2ec31a77d934673535957f57f07d33f8194bc675ccd680fb4740b53af08b3320",
  expectedRows:234,
  headlineMoorings:236,
  wfsUrl:"http://geo.pacioos.hawaii.edu/geoserver/PACIOOS/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=PACIOOS%3Ahi_mk_all_day_use_moorings&outputFormat=application%2Fjson&srsName=EPSG%3A4326",
  wfsFeatureSha256:"c4f44eea78fd6b8670490a2780d81850091e899f1fd7efc9a23e3000153753f4",
  expectedWfsFeatures:175,
  metadataUrl:"https://www.pacioos.hawaii.edu/metadata/iso/hi_mk_all_day_use_moorings.xml",
  metadataFile:"pacioos-hawaii-day-use-moorings.xml",
};
const TAIWAN_ATTRACTIONS_ZIP = "https://media.taiwan.net.tw/XMLReleaseAll_public/v2.0/Zh_tw/Attraction-json.zip";
const BCO_DMO_RESEARCH_SOURCES = [{
  id:"bco-dmo-leyte-scuba-sites",
  csv:"https://datadocs.bco-dmo.org/dataset/642957/file/R88Xy43Ug4qlyK/Dive_Sites.csv",
  catalogueUrl:"https://www.bco-dmo.org/dataset/642957",
  name:"BCO-DMO - Reef Fish Resilience Leyte SCUBA sites",
  nameField:"Dive_Site", latitudeField:"Latitude", longitudeField:"Longitude",
  requiredFields:["Dive_Site", "Sample_Type", "Latitude", "Longitude"],
  accept:row => row.Sample_Type === "SCUBA",
  country:"Philippines", countryCode:"PH", region:"Leyte", expectedRecords:2,
  attribution:"Pinsky, M. and Stuart, M. (2016), Biological and Chemical Oceanography Data Management Office",
  sourceUpdatedAt:"2016-04-12", observationPeriod:"2012-05-05 to 2018-04-10",
  project:"RAPID: Mega-typhoon impacts on the metapopulation resilience of coral reef fishes",
  description:"Research SCUBA sampling location from the Reef Fish Resilience project; recreational access and exact entry arrangements are not established by this dataset.",
}, {
  id:"bco-dmo-caribbean-sponge-scuba-sites",
  csv:"https://datadocs.bco-dmo.org/dataset/954346/file/WWEOp3XtGQW05/954346_v1_genetics.csv",
  catalogueUrl:"https://www.bco-dmo.org/dataset/954346",
  name:"BCO-DMO - Caribbean sponge microbiome SCUBA sites",
  nameField:"Dive_Site", latitudeField:"Lat", longitudeField:"Lon",
  requiredFields:["Region", "Dive_Site", "Lat", "Lon", "Collection_date"],
  accept:row => !["unknown", "honduras_n"].includes(clean(row.Dive_Site).toLowerCase()),
  countryForRow:row => row.Region === "Florida Keys" ? "United States" : row.Region,
  countryCodeForRow:row => ({ Belize:"BZ", Honduras:"HN", Panama:"PA", "Florida Keys":"US" })[row.Region] || "",
  regionForRow:row => row.Region, expectedRecords:14,
  attribution:"Freeman, C. J., Easson, C. G., Thacker, R. W., Matterson, K., Paul, V. J. and Baker, D. M. (2025), BCO-DMO",
  sourceUpdatedAt:"2025-04-23", observationPeriod:"2013-05 to 2014-05",
  project:"Collaborative Research: Investigations into microbially mediated ecological diversification in sponges",
  description:"Named reef location where Caribbean sponge samples were collected by SCUBA; this research dataset does not establish public access or an exact tourism entry point.",
}, {
  id:"bco-dmo-iceland-strytan-scuba-sites",
  csv:"https://datadocs.bco-dmo.org/dataset/685418/file/3YY3glLcmxA7n0/Strytan_elements.csv",
  catalogueUrl:"https://www.bco-dmo.org/dataset/685418",
  name:"BCO-DMO - Strytan Hydrothermal Field SCUBA sites",
  nameField:"site", latitudeField:"lat", longitudeField:"lon",
  requiredFields:["site", "lat", "lon", "date", "temp"],
  accept:row => !["nd", "on-land"].includes(clean(row.site).toLowerCase()),
  nameForRow:row => clean(row.site).replaceAll("_", " "),
  country:"Iceland", countryCode:"IS", region:"Eyjafjordur", expectedRecords:3,
  attribution:"Price, R. and Amend, J. (2017), Biological and Chemical Oceanography Data Management Office",
  sourceUpdatedAt:"2017-03-22", observationPeriod:"Dataset title: July 2012; coordinate-bearing CSV rows: July 2013",
  project:"A Lost City-type hydrothermal system in readily accessible, shallow water",
  description:"Hydrothermal vent-fluid and precipitate sampling location reached by research SCUBA; this record does not establish public access or ordinary recreational suitability.",
  tags:["research SCUBA site", "hydrothermal vent field"],
  mapProperties:group => ({
    maximumVentTemperatureC:Math.max(...group.rows.map(row => number(row.temp)).filter(value => value != null)),
    sourceDataWarning:"The BCO-DMO dataset title dates the expedition to July 2012, while the coordinate-bearing CSV rows are dated July 2013.",
  }),
  safetyInformation:group => `Hydrothermal vent samples at this location reached ${Math.max(...group.rows.map(row => number(row.temp)).filter(value => value != null)).toFixed(1)} degrees C in the source data. This is a historical research coordinate, not a verified public entry point or an assessment of recreational suitability. Use a qualified local technical operator and verify access, hazards and current conditions.`,
}];
const GEOJSON_SOURCES = [{
  id:"pw-palaris-palau-dive-sites",
  url:"http://geo.pacioos.hawaii.edu/geoserver/PACIOOS/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=PACIOOS%3Apw_plrs_all_divesites&outputFormat=application%2Fjson&srsName=EPSG%3A4326",
  featureSha256:"8abd7b5cb3937debbe47fd4145e86e2eb154b116a86868f016bc90cd1e25daf1",
  catalogueUrl:"https://www.pacioos.hawaii.edu/metadata/pw_plrs_all_divesites.html",
  metadataUrl:"https://www.pacioos.hawaii.edu/metadata/iso/pw_plrs_all_divesites.xml",
  metadataFile:"palaris-palau-dive-sites.xml",
  name:"PALARIS / PacIOOS - Palau Dive Sites",
  nameField:"name",
  country:"Palau",
  countryCode:"PW",
  region:"Palau",
  expectedRecords:37,
  attribution:"Palau Automated Land and Resources Information System (PALARIS); distributed by PacIOOS",
  licence:"CC0 1.0; PacIOOS metadata permits free use and redistribution",
  evidenceClass:"recreational_site",
  tags:["recognized recreational dive site"],
  mapProperties() {
    return {
      description:"Recognized recreational dive site from the PALARIS Palau dive-site compilation.",
      sourceUpdatedAt:"2016-01-25",
      sourceVintage:"2008 compilation",
      sourceProject:"PALARIS Palau Dive Sites",
      positionQuality:"Legacy PALARIS point coordinate; verify the current site position and entry plan locally.",
      sourceDataWarning:"PacIOOS permits free use and redistribution but states that the data may contain inaccuracies and is not intended for legal use.",
      safety_information:"This legacy recreational-site coordinate is not a navigation aid or a current assessment of access, conditions or safety. Confirm the precise site, marine-zone rules, operator access and dive plan with a qualified Palau operator.",
    };
  },
}, {
  id:"gu-gcmp-guam-dive-sites",
  url:"http://geo.pacioos.hawaii.edu/geoserver/PACIOOS/ows?service=WFS&version=2.0.0&request=GetFeature&typeNames=PACIOOS%3Agu_db_all_divesites&outputFormat=application%2Fjson&srsName=EPSG%3A4326",
  featureSha256:"3625dbdb5d1a1dd04f188da7049c5b152a251f33bad43f30e3df834976062411",
  catalogueUrl:"https://www.pacioos.hawaii.edu/metadata/gu_db_all_divesites.html",
  metadataUrl:"https://www.pacioos.hawaii.edu/metadata/iso/gu_db_all_divesites.xml",
  metadataFile:"pacioos-guam-dive-sites.xml",
  name:"GCMP / PacIOOS - Guam Dive Sites",
  nameField:"SITE_NAME",
  idField:"ID",
  country:"Guam",
  countryCode:"GU",
  region:"Guam",
  expectedRecords:34,
  attribution:"Guam Coastal Management Program (GCMP); distributed by PacIOOS",
  licence:"PacIOOS metadata permits free use and redistribution; not intended for legal use",
  evidenceClass:"recreational_site",
  tags:["recognized recreational dive site"],
  mapProperties() {
    return {
      description:"Named recreational dive site from the Guam Coastal Management Program compilation.",
      sourceUpdatedAt:"2016-01-25",
      sourceVintage:"Legacy GCMP compilation published by PacIOOS in 2016",
      sourceProject:"Guam Coastal Management Program Dive Sites",
      positionQuality:"Legacy GCMP point coordinate; verify the current site position and entry plan locally.",
      sourceDataWarning:"PacIOOS permits free use and redistribution but states that the data may contain inaccuracies and is not intended for legal use.",
      safety_information:"This legacy recreational-site coordinate is not a navigation aid or a current assessment of access, conditions or safety. Confirm the precise site, permissions, operator access and dive plan with a qualified Guam operator.",
    };
  },
}];
const TAIWAN_DIVE_ATTRACTIONS = new Map(Object.entries({
  Attraction_376540000A_000365:"Shilang Diving Area",
  Attraction_376540000A_000367:"Green Island Nanliao Fishing Harbor",
  Attraction_376540000A_001315:"Green Island Underwater Postbox",
  Attraction_376550000A_001286:"Shitiping Recreation Area",
  Attraction_A15011000H_000014:"Baisha Bay Water Recreation Area",
  Attraction_A15011300H_000055:"Longdong Bay Ocean Park",
}));
const ARCGIS_SOURCES = [{
  id:"ca-pca-minnewanka-scuba",
  layer:"https://services2.arcgis.com/wCOMu5IS7YdSyPNx/arcgis/rest/services/Interest_Point_Interet_APCA_OpenOuvert/FeatureServer/0",
  catalogueUrl:"https://www.arcgis.com/home/item.html?id=ed9ba960823e427ab730b3ee1c577c7f",
  where:"Principal_type=79",
  name:"Parks Canada - SCUBA Diving Points of Interest",
  country:"Canada",
  countryCode:"CA",
  region:"Banff National Park, Alberta",
  attribution:"Parks Canada Agency",
  licence:"Open Government Licence - Canada",
  licenceUrl:"https://open.canada.ca/en/open-government-licence-canada",
  termsUrl:"https://open.canada.ca/en/open-government-licence-canada",
  nameField:"Name_e",
  idField:"OBJECTID",
  descriptionFields:["Descr_e"],
  tags:["official Parks Canada SCUBA point of interest", "cold-water altitude dive", "shore access"],
  expectedFeatures:1,
  expectedRecords:1,
  featureSha256:"a093a7c0f2a793324f268202e60d0c35bfa694186dd31d017a4bcdfbfd064672",
  referenceUrl() { return "https://parks.canada.ca/pn-np/ab/banff/activ/nautiques-sports/plonge-diving"; },
  mapProperties(feature) {
    const p = feature.properties || {};
    return {
      aliases:[clean(p.Nom_f), ...clean(p.Noms_Alt_Names).split(";").map(clean)].filter(Boolean),
      description:"Official Parks Canada SCUBA access point for the Lake Minnewanka submerged townsite diving area.",
      access_instructions:`${clean(p.Descr_e) || "Shore access"}. A valid aquatic-invasive-species prevention self-certification permit is required for SCUBA gear; follow current Clean, Drain, Dry requirements.`,
      sourceUpdatedAt:"2026-07-08",
      sourceProject:"Parks Canada open points-of-interest service",
      publicAccess:true,
      positionQuality:"Official visitor point of interest marking shore access; use the Parks Canada dive map and current local guidance for individual underwater features.",
      sourceDataWarning:"Lake Minnewanka contains protected submerged heritage. The catalogue point is an access location, not the coordinate of every underwater feature and not a navigation aid.",
      safety_information:"Cold-water, high-altitude diving requires appropriate training, equipment and altitude-adjusted planning. Deeper sites and structure penetration are for well-prepared, experienced divers. Use a buddy, display a dive flag, check current Parks Canada restrictions and never disturb or attach equipment to submerged heritage.",
    };
  },
}, {
  id:"au-qld-qpws-public-moorings",
  layer:"https://spatial-gis.information.qld.gov.au/arcgis/rest/services/Environment/ParksMarineProtectedAreas/MapServer/16",
  name:"Queensland Parks and Wildlife Service - Public Moorings",
  country:"Australia",
  countryCode:"AU",
  attribution:"© State of Queensland (Department of Environment and Science) 2024",
  licence:"CC BY 4.0",
  licenceUrl:"https://creativecommons.org/licenses/by/4.0/",
  termsUrl:"https://www.qld.gov.au/legal/copyright",
  evidenceClass:"recreational_mooring",
  expectedFeatures:386,
  expectedRecords:162,
  featureSha256:"75789e22eef44aa75fc2c4cb7c5bcf2562bbf45fdc038cc50ec8d54d2c2f8946",
  groupPublicMoorings:true,
}, {
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
}, {
  id:"reef-ne-dive-sites",
  layer:"https://services.northeastoceandata.org/arcgis1/rest/services/RecreationAndCulture/MapServer/32",
  catalogueUrl:"https://www.northeastoceandata.org/files/metadata/Themes/Recreation/REEFDiveSitesAndReports.pdf",
  name:"REEF - Northeast US and Canada dive sites and reports",
  region:"Northeast US and Canada",
  attribution:"REEF. 2026. Reef Environmental Education Foundation Volunteer Fish Survey Project Database (source snapshot April 2020)",
  licence:"Public portal data; cite REEF database; distribute with source caveats and limitations",
  nameField:"geog",
  idField:"geogid",
  tags:["REEF volunteer fish survey site"],
  referenceUrl(feature) { return clean(feature.properties?.REEF_report); },
  mapProperties(feature) {
    const p = feature.properties || {};
    return {
      surveyZone:clean(p.geogid),
      sourceUpdatedAt:"2020-04-30",
      positionQuality:"General site or area coordinate; positional accuracy varies by report",
      sourceProject:"REEF Volunteer Fish Survey Project",
      description:"Named REEF volunteer fish-survey location with a linked geographic-zone report.",
      safety_information:"The coordinate may represent a general site or area and positional accuracy varies by report. Verify the precise location, access, conditions and local restrictions before diving.",
    };
  },
}, {
  id:"on-leeds-grenville-dive-sites",
  layer:"https://services3.arcgis.com/KQcdsE7S72bcD7R8/arcgis/rest/services/Recreation/FeatureServer/14",
  catalogueUrl:"https://www.arcgis.com/home/item.html?id=4afffa41d6e34650931490f4610b19b9&sublayer=14",
  name:"United Counties of Leeds and Grenville - Dive Sites",
  country:"Canada",
  countryCode:"CA",
  region:"Leeds and Grenville, Ontario",
  attribution:"United Counties of Leeds and Grenville",
  licence:"Official GeoHub open data; no special restrictions or limitations stated on the item",
  nameField:"Name",
  idField:"GlobalID",
  tags:["official county dive site"],
  referenceUrl(feature) { return clean(feature.properties?.Website); },
  mapProperties(feature) {
    const p = feature.properties || {}, minimumFeet = number(p.Depth_Min_ft), maximumFeet = number(p.Depth_Max_ft);
    const year = value => Number.isFinite(Number(value)) ? String(new Date(Number(value)).getUTCFullYear()) : "";
    const inconsistent = minimumFeet != null && maximumFeet != null && minimumFeet > maximumFeet;
    return {
      difficulty_label:clean(p.Ability),
      minimumDepthFeet:minimumFeet,
      maximumDepthFeet:maximumFeet,
      max_depth:maximumFeet == null ? "" : Math.round(maximumFeet * 0.3048 * 10) / 10,
      history:[year(p.Ship_Built) && `Built ${year(p.Ship_Built)}`, year(p.Ship_Sunk) && `Sunk ${year(p.Ship_Sunk)}`].filter(Boolean).join("; "),
      sourceUpdatedAt:"2025-09-23",
      sourceProject:"Leeds Grenville GeoHub Recreation layer",
      description:"Official county recreational dive-site record.",
      safety_information:inconsistent
        ? `The source depth range is internally inconsistent (${minimumFeet} ft minimum, ${maximumFeet} ft maximum). Verify depth, conditions and access with current local information before diving.`
        : "Verify depth, conditions, access and local restrictions before diving.",
    };
  },
}, {
  id:"us-fl-fwc-artificial-reef-deployments",
  layer:"https://gis.myfwc.com/mapping/rest/services/Open_Data/Artificial_Reef_Locations_in_Florida/MapServer/12",
  catalogueUrl:"https://geodata.myfwc.com/datasets/artificial-reefs-in-florida",
  metadataUrl:"https://www.arcgis.com/sharing/rest/content/items/eb2bfd225149405bba23604f20159f56/info/metadata/metadata.xml",
  metadataFile:"fwc-artificial-reefs.xml",
  name:"FWC - Artificial Reef Deployments in Florida",
  country:"United States",
  countryCode:"US",
  region:"Florida",
  attribution:"FWC-FWRI and FWC Division of Marine Fisheries Management",
  licence:"Attributed derivative use permitted by FWC item metadata; original metadata must accompany the dataset",
  evidenceClass:"artificial_reef_deployment",
  nameField:"Name",
  idField:"DeployID",
  descriptionFields:["Description"],
  tags:["artificial reef deployment"],
  mapProperties(feature) {
    const p = feature.properties || {};
    const rawDate = clean(p.DDate), deploymentDate = /^\d{8}$/.test(rawDate)
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}` : "";
    const reportedDepthFeet = number(p.Depth), depthFeet = reportedDepthFeet > 0 ? reportedDepthFeet : null;
    const reportedReliefFeet = number(p.Relief), reliefFeet = reportedReliefFeet > 0 ? reportedReliefFeet : null;
    const reportedTonnage = number(p.Tonnage), tonnage = reportedTonnage > 0 ? reportedTonnage : null;
    const accuracyCode = number(p.LocAccuracy);
    const updatedAt = number(p.last_edited_date);
    return {
      deploymentId:clean(p.DeployID), deploymentDate,
      maximumDepthFeet:depthFeet, max_depth:depthFeet == null ? "" : Math.round(depthFeet * 0.3048 * 10) / 10,
      reliefFeet, tonnage, materialCategory:clean(p.MatCat), materialDescription:clean(p.MatDescrip),
      jurisdiction:clean(p.Jurisdiction), coast:clean(p.Coast), county:clean(p.County),
      locationAccuracyCode:accuracyCode,
      positionQuality:accuracyCode == null
        ? "FWC deployment coordinate; most locations have not been independently confirmed."
        : `FWC location-accuracy code ${accuracyCode}; most locations have not been independently confirmed.`,
      sourceUpdatedAt:updatedAt == null ? "" : new Date(updatedAt).toISOString(),
      sourceProject:"Florida Artificial Reef Program statewide deployment database",
      sourceDataWarning:"Display only. FWC states that reef materials can move, degrade or become buried, and that historical locations or coordinates may be inaccurate or unverified.",
      safety_information:"This is an artificial-reef deployment record, not a verified recreational dive site or navigation aid. Do not use this coordinate for navigation. Confirm the present reef position, depth, access, regulations and suitability with FWC notices and a qualified local operator.",
      tags:["artificial reef deployment", clean(p.MatCat).toLowerCase()].filter(Boolean),
    };
  },
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
const number = value => {
  const cleaned = clean(value);
  if (!cleaned) return null;
  const result = Number(cleaned);
  return Number.isFinite(result) ? result : null;
};
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
  const sourceReference = metadata.referenceUrl ? clean(metadata.referenceUrl(feature)) : "";
  const referenceUrl = /^https?:\/\//i.test(sourceReference) ? sourceReference : /^https?:\/\//i.test(rawDescription) ? rawDescription : "";
  return { id:`${metadata.sourceKey || source}:${sourceId}`, sourceId, name, latitude:number(latitude), longitude:number(longitude),
    country:clean(p.country || p.country_name || metadata.country), countryCode:clean(p.country_code || metadata.countryCode), region:clean(p.region || p.state || metadata.region),
    description:referenceUrl ? "" : rawDescription, referenceUrl, max_depth:number(p.max_depth || p.depth) ?? "",
    tags:[...(metadata.tags || [])], dataSource:source, sourceUrl:metadata.sourceUrl || "", attribution:metadata.attribution || source,
    licence:metadata.licence || "review-required", licenceUrl:metadata.licenceUrl || "", termsUrl:metadata.termsUrl || "", rightsReview:!!metadata.rightsReview,
    evidenceClass:metadata.evidenceClass || "recreational_site", ...(metadata.mapProperties ? metadata.mapProperties(feature) : {}) };
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

function parseCsvLine(line) {
  const values = []; let value = "", quoted = false;
  for (let index = 0; index < line.length; index++) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index++; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) { values.push(value); value = ""; }
    else value += character;
  }
  values.push(value); return values;
}

async function ingestBcoDmoResearchSites(source) {
  const response = await fetchWithTimeout(source.csv, { headers:{ Accept:"text/csv" } }, 30000);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const lines = (await response.text()).replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const headers = parseCsvLine(lines.shift() || "").map(clean);
  if (!source.requiredFields.every(field => headers.includes(field))) throw new Error(`Unexpected ${source.id} CSV schema`);
  const groups = new Map();
  for (const line of lines) {
    const values = parseCsvLine(line), row = Object.fromEntries(headers.map((header, column) => [header, clean(values[column])]));
    const name = source.nameForRow ? clean(source.nameForRow(row)) : clean(row[source.nameField]);
    const latitude = number(row[source.latitudeField]), longitude = number(row[source.longitudeField]);
    if (!name || latitude == null || longitude == null || (latitude === 0 && longitude === 0) || (source.accept && !source.accept(row))) continue;
    const key = `${normalName(name)}|${latitude}|${longitude}`, group = groups.get(key) || { name, latitude, longitude, rows:[] };
    group.rows.push(row); groups.set(key, group);
  }
  const nameCounts = new Map();
  for (const group of groups.values()) nameCounts.set(normalName(group.name), (nameCounts.get(normalName(group.name)) || 0) + 1);
  const records = [...groups.values()].map(group => {
    const row = group.rows[0], nameKey = normalName(group.name), multiplePositions = nameCounts.get(nameKey) > 1;
    const sourceId = `${nameKey.replaceAll(" ", "-")}:${group.latitude.toFixed(6)}:${group.longitude.toFixed(6)}`;
    return {
      id:`${source.id}:${sourceId}`, sourceId, name:group.name, latitude:group.latitude, longitude:group.longitude,
      country:source.countryForRow ? source.countryForRow(row) : source.country,
      countryCode:source.countryCodeForRow ? source.countryCodeForRow(row) : source.countryCode,
      region:source.regionForRow ? source.regionForRow(row) : source.region,
      description:source.description, tags:source.tags || ["research SCUBA site", "marine field survey"], evidenceClass:"research_scuba_site",
      dataSource:source.name, sourceUrl:source.catalogueUrl, referenceUrl:source.csv,
      attribution:source.attribution, licence:"CC BY 4.0", sourceUpdatedAt:source.sourceUpdatedAt,
      observationPeriod:source.observationPeriod, sourceProject:source.project, researchSampleRows:group.rows.length,
      positionQuality:multiplePositions ? "The source uses this site name at more than one coordinate." : "Historical research sampling coordinate; positional precision may vary by study.",
      safety_information:source.safetyInformation ? source.safetyInformation(group, multiplePositions) : `This is a historical research sampling coordinate${multiplePositions ? " and the source assigns this name to multiple positions" : ""}, not a verified public entry point. Confirm access, local permission, current conditions and the precise dive plan with a qualified local operator.`,
      ...(source.mapProperties ? source.mapProperties(group) : {}),
    };
  });
  if (records.length !== source.expectedRecords) throw new Error(`Expected ${source.expectedRecords} ${source.id} sites, received ${records.length}`);
  return records;
}

async function ingestGeoJson(source) {
  const payload = await fetchJson(source.url);
  if (payload?.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
    throw new Error("Source did not return a GeoJSON FeatureCollection");
  }
  if (source.featureSha256) {
    const actual = createHash("sha256").update(JSON.stringify(payload.features)).digest("hex");
    if (actual !== source.featureSha256) throw new Error(`Feature integrity hash changed: ${actual}`);
  }
  const metadata = {
    sourceKey:source.id, country:source.country, countryCode:source.countryCode, region:source.region,
    sourceUrl:source.catalogueUrl || source.url, attribution:source.attribution, licence:source.licence,
    rightsReview:source.rightsReview, nameField:source.nameField, idField:source.idField,
    descriptionFields:source.descriptionFields, tags:source.tags, mapProperties:source.mapProperties,
    evidenceClass:source.evidenceClass,
  };
  const records = payload.features.map(feature => normaliseGeoJson(feature, source.name, metadata)).filter(Boolean);
  if (source.expectedRecords != null && records.length !== source.expectedRecords) {
    throw new Error(`Expected ${source.expectedRecords} ${source.id} sites, received ${records.length}`);
  }
  let sourceMetadata = "";
  if (source.metadataUrl) {
    const response = await fetchWithTimeout(source.metadataUrl, { headers:{ Accept:"application/xml, text/xml" } });
    if (!response.ok) throw new Error(`Source metadata returned ${response.status}`);
    sourceMetadata = await response.text();
  }
  return { records, sourceMetadata };
}

function decodeHtmlText(value) {
  const named = { amp:"&", apos:"'", gt:">", lt:"<", nbsp:" ", quot:'"' };
  return String(value || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match)
    .replace(/\s+/g, " ").trim();
}

function degreeMinuteCoordinate(value, negative = false) {
  const parts = String(value || "").match(/\d+/g) || [];
  if (parts.length < 3) return null;
  const degrees = Number(parts[0]), minutes = Number(`${parts[1]}.${parts.slice(2).join("")}`);
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || minutes >= 60) return null;
  const coordinate = degrees + minutes / 60;
  return negative ? -coordinate : coordinate;
}

async function ingestHawaiiDayUseMoorings() {
  const source = HAWAII_DAY_USE_MOORINGS;
  const pageResponse = await fetchWithTimeout(source.pageUrl, { headers:{ Accept:"text/html" } });
  if (!pageResponse.ok) throw new Error(`Hawaii DLNR page returned ${pageResponse.status}`);
  const html = await pageResponse.text(), table = html.match(/<table\b[\s\S]*?<\/table>/i)?.[0];
  if (!table) throw new Error("Hawaii DLNR mooring table was not found");
  const headline = Number(html.match(/INSTALLED DAY-USE MOORINGS STATEWIDE\s*=\s*(\d+)/i)?.[1]);
  if (headline !== source.headlineMoorings) throw new Error(`Expected headline count ${source.headlineMoorings}, received ${headline}`);
  const cells = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(row =>
    [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => decodeHtmlText(cell[1])));
  let island = "";
  const rows = [];
  for (const row of cells) {
    const heading = clean(row[1]).toUpperCase();
    if (heading.includes("LANAI")) island = "Lanai";
    else if (heading.includes("MOLOKINI")) island = "Molokini";
    else if (["OAHU", "MAUI", "HAWAII", "KAUAI"].includes(heading)) island = heading[0] + heading.slice(1).toLowerCase();
    if (/^\d+$/.test(row[0] || "") && row.length >= 5) {
      rows.push({ island, number:Number(row[0]), name:clean(row[2]), latitude:clean(row[3]), longitude:clean(row[4]) });
    }
  }
  if (rows.length !== source.expectedRows || rows.some(row => !row.island || !row.name)) {
    throw new Error(`Expected ${source.expectedRows} complete Hawaii DLNR rows, received ${rows.length}`);
  }
  const rowHash = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  if (rowHash !== source.rowSha256) throw new Error(`Hawaii DLNR normalized row hash changed: ${rowHash}`);

  const wfs = await fetchJson(source.wfsUrl);
  if (wfs?.type !== "FeatureCollection" || !Array.isArray(wfs.features) || wfs.features.length !== source.expectedWfsFeatures) {
    throw new Error(`Expected ${source.expectedWfsFeatures} PacIOOS mooring features`);
  }
  const wfsHash = createHash("sha256").update(JSON.stringify(wfs.features)).digest("hex");
  if (wfsHash !== source.wfsFeatureSha256) throw new Error(`PacIOOS mooring feature hash changed: ${wfsHash}`);
  const molokiniCorrection = wfs.features.find(feature => clean(feature?.properties?.name) === "Molokini-T");
  const correctionCoordinates = molokiniCorrection?.geometry?.coordinates || [];
  if (number(correctionCoordinates[0]) !== -156.49785 || number(correctionCoordinates[1]) !== 20.63283333) {
    throw new Error("The corroborating PacIOOS Molokini-T coordinate changed");
  }

  const updated = html.match(/last updated on\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  const sourceUpdatedAt = updated ? `20${updated[3].slice(-2)}-${updated[1].padStart(2, "0")}-${updated[2].padStart(2, "0")}` : "";
  const records = rows.map(row => {
    let latitude = degreeMinuteCoordinate(row.latitude), longitude = degreeMinuteCoordinate(row.longitude, true);
    let coordinateCorrection = "";
    if (row.island === "Molokini" && row.number === 20 && row.name === "Molokini-T" && row.latitude === "20.37.930" && row.longitude === "153.29.871") {
      [longitude, latitude] = correctionCoordinates.map(Number);
      coordinateCorrection = `DLNR publishes ${row.latitude}, ${row.longitude}; the matching PacIOOS source record supplies ${latitude}, ${longitude}.`;
    }
    if (latitude == null || longitude == null || latitude < 18 || latitude > 23 || longitude < -161 || longitude > -154) {
      throw new Error(`Invalid Hawaii DLNR coordinate for ${row.island} ${row.number}: ${row.latitude}, ${row.longitude}`);
    }
    const sourceId = `${row.island.toLowerCase()}:${row.number}`;
    return {
      id:`${source.id}:${sourceId}`, sourceId, name:row.name, latitude, longitude,
      country:"United States", countryCode:"US", region:`${row.island}, Hawaii`,
      description:"State-sanctioned day-use mooring at a popular dive or snorkel location.",
      tags:["day-use mooring", "popular dive or snorkel location", "boat access infrastructure"],
      dataSource:"Hawaii DLNR DOBOR / PacIOOS - Day-Use Moorings", sourceUrl:source.pageUrl,
      attribution:"State of Hawaii DLNR Division of Boating and Ocean Recreation; Malama Kai Foundation; distributed by PacIOOS",
      licence:"State of Hawaii website terms permit copying and distribution for informational use; PacIOOS metadata permits free use and redistribution; not intended for legal use",
      licenceUrl:"https://ets.hawaii.gov/soh-terms-of-use/",
      evidenceClass:"recreational_mooring", recordClassLabel:"State day-use mooring at a popular dive or snorkel location", mooringNumber:row.number,
      sourceRawLatitude:row.latitude, sourceRawLongitude:row.longitude, coordinateCorrection,
      sourceUpdatedAt, sourceVintage:`DLNR page updated ${sourceUpdatedAt}; PacIOOS service published 2016`,
      access_instructions:"Boat-access day-use mooring. Confirm current availability, permitted use and time limits with Hawaii DLNR before departure.",
      positionQuality:coordinateCorrection ? "Coordinate corrected from the matching official PacIOOS record; verify before navigation." : "Published DLNR degree-minute coordinate; verify before navigation.",
      sourceDataWarning:`The DLNR page headline reports ${headline} statewide moorings but publishes ${rows.length} coordinate rows. Moorings serve popular dive and snorkel locations and do not independently verify scuba suitability.${coordinateCorrection ? ` ${coordinateCorrection}` : ""}`,
      safety_information:"A published mooring is not a guarantee that the buoy is currently installed, available, suitable for the vessel or safe for diving. Check current Hawaii DLNR notices, marine-zone rules, weather and sea conditions; never use this catalogue for navigation.",
    };
  });
  const metadataResponse = await fetchWithTimeout(source.metadataUrl, { headers:{ Accept:"application/xml, text/xml" } });
  if (!metadataResponse.ok) throw new Error(`PacIOOS mooring metadata returned ${metadataResponse.status}`);
  return { records, sourceMetadata:await metadataResponse.text(), rowHash, wfsHash, sourceUpdatedAt, headline };
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
    Object.entries({ where:source.where || "1=1", outFields:"*", returnGeometry:"true", outSR:"4326", f:"geojson",
      resultOffset:String(offset), resultRecordCount:String(pageSize), orderByFields:`${service.fields?.find(field => field.type === "esriFieldTypeOID")?.name || "OBJECTID"} ASC` })
      .forEach(([key, value]) => query.searchParams.set(key, value));
    const page = await fetchJson(query.toString());
    features.push(...(page.features || [])); offset += (page.features || []).length;
    if (!(page.exceededTransferLimit || (page.features || []).length === pageSize) || !(page.features || []).length) break;
  }
  if (source.expectedFeatures != null && features.length !== source.expectedFeatures) {
    throw new Error(`Expected ${source.expectedFeatures} ${source.id} features, received ${features.length}`);
  }
  if (source.featureSha256) {
    const actual = createHash("sha256").update(JSON.stringify(features)).digest("hex");
    if (actual !== source.featureSha256) throw new Error(`Feature integrity hash changed: ${actual}`);
  }
  const metadata = { sourceKey:source.id, country:source.country, countryCode:source.countryCode, region:source.region,
    sourceUrl:source.catalogueUrl || source.layer, attribution:source.attribution, licence:source.licence,
    licenceUrl:source.licenceUrl, termsUrl:source.termsUrl,
    rightsReview:source.rightsReview, nameField:source.nameField, idField:source.idField, referenceUrl:source.referenceUrl,
    descriptionFields:source.descriptionFields, tags:source.tags, mapProperties:source.mapProperties,
    evidenceClass:source.evidenceClass };
  const records = source.groupPublicMoorings ? normalisePublicMoorings(features, source) :
    source.groupByName ? normaliseGroupedArcGisPoints(features, source, metadata) :
      features.map(feature => normaliseGeoJson(feature, source.name, metadata)).filter(Boolean);
  if (source.expectedRecords != null && records.length !== source.expectedRecords) {
    throw new Error(`Expected ${source.expectedRecords} ${source.id} records, received ${records.length}`);
  }
  let sourceMetadata = "";
  if (source.metadataUrl) {
    const response = await fetchWithTimeout(source.metadataUrl, { headers:{ Accept:"application/xml, text/xml" } });
    if (!response.ok) throw new Error(`Source metadata returned ${response.status}`);
    sourceMetadata = await response.text();
  }
  return { records, description:clean(service.description), serviceVersion:service.currentVersion, sourceMetadata };
}

function normalisePublicMoorings(features, source) {
  const groups = new Map();
  for (const feature of features) {
    const p = feature?.properties || {}, name = clean(p.site), coordinates = feature?.geometry?.coordinates || [];
    if (feature?.geometry?.type !== "Point" || !name || number(coordinates[0]) == null || number(coordinates[1]) == null) continue;
    const key = normalName(name), group = groups.get(key) || { name, features:[] };
    group.features.push(feature); groups.set(key, group);
  }
  return [...groups].map(([key, group]) => {
    const rows = group.features.map(feature => feature.properties || {});
    const longitude = group.features.reduce((sum, feature) => sum + number(feature.geometry.coordinates[0]), 0) / group.features.length;
    const latitude = group.features.reduce((sum, feature) => sum + number(feature.geometry.coordinates[1]), 0) / group.features.length;
    const regions = [...new Set(rows.map(row => clean(row.region)).filter(Boolean))];
    const localities = [...new Set(rows.map(row => clean(row.locality)).filter(Boolean))];
    const classes = [...new Set(rows.map(row => clean(row.mooring_class)).filter(Boolean))].sort();
    const references = [...new Set(rows.flatMap(row => [row.mooring_number_msq, row.mooring_number_gbrmpa, row.mooring_reference_number]).map(clean).filter(Boolean))];
    const vesselSizes = rows.map(row => number(row.vessel_size)).filter(value => value != null);
    const sourceId = key.replaceAll(" ", "-");
    return {
      id:`${source.id}:${sourceId}`, sourceId, name:group.name, latitude, longitude,
      country:source.country, countryCode:source.countryCode, region:regions.join(" / "), area:localities.join(" / "),
      description:`Queensland Parks and Wildlife Service public access infrastructure with ${group.features.length} mooring${group.features.length === 1 ? "" : "s"} at this named location.`,
      tags:["public mooring", "reef access infrastructure"], dataSource:source.name, sourceUrl:source.layer,
      attribution:source.attribution, licence:source.licence, licenceUrl:source.licenceUrl,
      evidenceClass:"recreational_mooring", recordClassLabel:"Public reef-access mooring; scuba suitability is not asserted",
      mooringCount:group.features.length, mooringClasses:classes.join(", "), mooringReferences:references.join(", "),
      maximumVesselSizeMetres:vesselSizes.length ? Math.max(...vesselSizes) : undefined,
      access_instructions:"Public moorings are shared, first-come access infrastructure. Observe the class, vessel-length, wind-strength and time limits shown on the buoy tag.",
      positionQuality:group.features.length === 1 ? "Published QPWS mooring coordinate; verify before navigation." : `Centroid of ${group.features.length} published QPWS mooring coordinates at this named site; use the official buoy positions for navigation.`,
      sourceDataWarning:"A public mooring provides reef or island access but does not independently establish scuba suitability. Availability, marine-park zoning, permits and activity restrictions can change.",
      safety_information:"Check current QPWS and GBRMPA notices, zoning, mooring availability, buoy limits, weather and sea conditions before departure. This catalogue is not a navigation aid or a current safety assessment.",
    };
  });
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
  const sourceRecord = record => ({
    id:record.id, sourceId:record.sourceId, dataSource:record.dataSource, sourceUrl:record.sourceUrl,
    referenceUrl:record.referenceUrl, attribution:record.attribution, licence:record.licence, licenceUrl:record.licenceUrl,
    sourceUpdatedAt:record.sourceUpdatedAt, rightsReview:!!record.rightsReview,
  });
  const sourcePriority = record => record.dataSource === "OpenDiveMap contributors" ? 0 : record.rightsReview ? 1 : record.attribution ? 3 : 2;
  for (const record of records) {
    // Each FWC row is a distinct deployment event, including repeat placements at one reef.
    if (record.evidenceClass === "artificial_reef_deployment") {
      kept.push(record);
      continue;
    }
    const cell = `${Math.round(record.latitude * 100)}:${Math.round(record.longitude * 100)}`;
    const nearby = cells.get(cell) || [];
    const duplicate = nearby.find(other => normalName(other.name) === normalName(record.name) && distanceMetres(other, record) <= 250);
    if (duplicate) {
      const aliases = [...new Set([...(duplicate.aliases || []), ...(record.aliases || []), duplicate.name, record.name].filter(Boolean))];
      const sourceRecords = [...(duplicate.sourceRecords || [sourceRecord(duplicate)]), sourceRecord(record)]
        .filter((source, index, all) => all.findIndex(item => item.id === source.id) === index);
      if (sourcePriority(record) > sourcePriority(duplicate)) Object.assign(duplicate, record);
      duplicate.aliases = aliases.filter(alias => alias !== duplicate.name);
      duplicate.sourceRecords = sourceRecords;
      continue;
    }
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
  for (const source of BCO_DMO_RESEARCH_SOURCES) {
    try {
      const list = await ingestBcoDmoResearchSites(source); records.push(...list);
      sources.push({ id:source.id, records:list.length, url:source.csv, catalogueUrl:source.catalogueUrl,
        licence:"CC BY 4.0", attribution:source.attribution,
        classification:"Historical research SCUBA sampling locations; access is not asserted" });
    } catch (error) { failures.push({ id:source.id, error:String(error.message || error) }); }
  }
  try {
    const source = HAWAII_DAY_USE_MOORINGS, result = await ingestHawaiiDayUseMoorings();
    records.push(...result.records);
    await mkdir(SOURCE_METADATA_DIR, { recursive:true });
    await writeFile(new URL(source.metadataFile, SOURCE_METADATA_DIR), result.sourceMetadata);
    sources.push({
      id:source.id, records:result.records.length, url:source.pageUrl, wfsUrl:source.wfsUrl,
      catalogueUrl:"https://www.pacioos.hawaii.edu/metadata/hi_mk_all_day_use_moorings.html",
      licence:"State of Hawaii website informational-use terms; PacIOOS free-use and redistribution limitation",
      termsUrl:"https://ets.hawaii.gov/soh-terms-of-use/",
      attribution:"State of Hawaii DLNR DOBOR; Malama Kai Foundation; PacIOOS",
      rowSha256:result.rowHash, wfsFeatureSha256:result.wfsHash,
      metadataUrl:source.metadataUrl, metadataFile:`data/source-metadata/${source.metadataFile}`,
      sourceUpdatedAt:result.sourceUpdatedAt, upstreamHeadlineMoorings:result.headline,
      classification:"recreational_mooring",
    });
  } catch (error) { failures.push({ id:HAWAII_DAY_USE_MOORINGS.id, error:String(error.message || error) }); }
  for (const source of GEOJSON_SOURCES) {
    try {
      const result = await ingestGeoJson(source); records.push(...result.records);
      if (source.metadataFile && result.sourceMetadata) {
        await mkdir(SOURCE_METADATA_DIR, { recursive:true });
        await writeFile(new URL(source.metadataFile, SOURCE_METADATA_DIR), result.sourceMetadata);
      }
      sources.push({
        id:source.id, records:result.records.length, url:source.url, catalogueUrl:source.catalogueUrl,
        licence:source.licence, attribution:source.attribution, rightsReview:source.rightsReview,
        featureSha256:source.featureSha256,
        metadataUrl:source.metadataUrl, metadataFile:source.metadataFile ? `data/source-metadata/${source.metadataFile}` : undefined,
        classification:source.evidenceClass || "recreational_site",
      });
    } catch (error) { failures.push({ id:source.id, error:String(error.message || error) }); }
  }
  for (const source of ARCGIS_SOURCES) {
    try {
      const result = await ingestArcGis(source); records.push(...result.records);
      if (source.metadataFile && result.sourceMetadata) {
        await mkdir(SOURCE_METADATA_DIR, { recursive:true });
        await writeFile(new URL(source.metadataFile, SOURCE_METADATA_DIR), result.sourceMetadata);
      }
      sources.push({ id:source.id, records:result.records.length, url:source.layer, licence:source.licence,
        catalogueUrl:source.catalogueUrl, attribution:source.attribution, rightsReview:source.rightsReview,
        description:result.description, serviceVersion:result.serviceVersion,
        licenceUrl:source.licenceUrl, termsUrl:source.termsUrl, expectedFeatures:source.expectedFeatures,
        expectedRecords:source.expectedRecords, featureSha256:source.featureSha256,
        metadataUrl:source.metadataUrl, metadataFile:source.metadataFile ? `data/source-metadata/${source.metadataFile}` : undefined,
        classification:source.evidenceClass || "recreational_site" });
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

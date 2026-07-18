# Dive-site data source registry

Last reviewed: 2026-07-18

This is a living registry of machine-readable sources that can contribute to
LiveTide's dive-site catalogue. "Dive site" is deliberately split into:

- recreational dive sites;
- dive operators and departure points;
- wrecks and artificial reefs;
- reef, habitat and bathymetry candidates;
- scientific dive and survey stations.

Scientific survey points and underwater features must not be presented as safe,
legal recreational dive sites unless another source supplies that evidence.

## Tier 1: ingest as recreational dive sites

| Source | Coverage | Access | Licence/access status | Notes |
| --- | --- | --- | --- | --- |
| OpenDiveMap | Global | `https://api.opendivemap.com/v1/sites` (GeoJSON) | ODbL; attribution/share-alike required | Purpose-built, unauthenticated read API. Supports country, region, entry, environment and topology filters. Reported catalogue: 3,123 sites/59 countries at review time. |
| OpenDeepMap | Global | GeoJSON and vector tiles | ODbL database; CC BY/BY-SA media | Rich fields for entry points, routes, depth, current, hazards and seasonality. Verify bulk endpoint and service stability before enabling production ingestion. |
| The Dive API | Global | Commercial REST API; query and coordinate search | Account/subscription; storage and redistribution terms must be agreed | Claims roughly 17,000 sites and 10,000 operators. Keep site and operator endpoints separate. |
| Divemap Greece | Global catalogue, strongest around Greece | `https://divemap.gr/api/v1/dive-sites` | Token supported; confirm redistribution terms | Already integrated. Public API documentation includes list/create/update flows. |
| Divemap UK | United Kingdom | Existing public GeoJSON/GraphQL integration | Confirm bulk cache/redistribution terms | Already integrated. Preserve upstream IDs and attribution. |
| New Zealand DOC SeaSketch | Hauraki Gulf | ArcGIS REST layer `Marine_Use_Activities_test/MapServer/1` | Government endpoint; confirm source-specific reuse terms | Named recreational sites assembled from DOC, Waikato Regional Council and Dive New Zealand. |
| WA DPIRD Abrolhos Dive Trails | Houtman Abrolhos Islands, Western Australia | SLIP ArcGIS layer 12 | CC BY 4.0; © State of Western Australia, Department of Primary Industries and Regional Development | Seven named official trails, grouped from 55 numbered route markers. |
| Taiwan Tourism Administration | Taiwan | Daily Tourism Information Database attractions ZIP | Taiwan Open Government Data License 1.0 | Six manually reviewed public attractions explicitly described as diving locations; stable government attraction IDs and Chinese aliases retained. |
| Province of British Columbia | Coastal British Columbia, Canada | DataBC ArcGIS `Coastal BC Diving Sites`, layer 23 | Open Government Licence - British Columbia | 184 named provincial scuba points are ingested; four duplicate names/positions collapse during catalogue deduplication. Anonymous planning points remain excluded. |

## Tier 2: open global and regional candidates

| Source | Coverage | Access | Licence/access status | Use |
| --- | --- | --- | --- | --- |
| OpenStreetMap | Global | Geofabrik `.osm.pbf` extracts; OSM replication diffs | ODbL | Extract `sport=scuba_diving`, `scuba_diving:divespot=yes`, `historic=wreck`, `wreck=*`, reefs, dive centres and shops. Do not use public Overpass for bulk ingestion. |
| Geofabrik | Philippines, Japan, Australia/Oceania, Asia, Europe, Africa and Americas | Daily regional PBF downloads | OSM/ODbL | Stable bulk transport for OSM. Process offline and publish small, versioned LiveTide datasets. |
| Reef Life Survey / IMOS NRMN | Australia and worldwide survey sites | AODN WFS layer `ep_site_list_public_data` | Catalogue says freely available for non-profit use; formal licence field is unspecified | Strong evidence that divers survey a reef, but not automatically a public recreational site. |
| EMODnet | EMEA seas | WFS/WMS/WMTS and bathymetry REST API | EU/open-data terms vary by layer | Wrecks, habitats, submerged landscapes, protected areas and depth enrichment. |
| EMODnet Human Activities heritage wrecks | Europe and adjacent seas | Public WFS layer `emodnet:heritageshipwrecks` | CC BY 4.0; record-level originator retained | 7,073 heritage wreck points ingested as lazy evidence with country, object type, depth, loss year, statutory status and update metadata. Protected or heritage status never implies recreational access. |
| Marine Regions (VLIZ) | Global | Gazetteer REST point lookup | CC BY 4.0 | Lazy sea, ecoregion, marine-region and EEZ context; never treated as a dive-site source or navigation data. |
| Japan Biodiversity Center | Japan | Shapefile/KML downloads | Government dataset; check per-dataset cautions | Coral reef and coastal habitat candidates, especially Okinawa/Ogasawara. |
| Okinawa Prefecture tourism attractions | Okinawa, Japan | BODIK CKAN package `470007_tourist_attraction` and official CSV | CC BY 4.0 | Coordinate-bearing government POIs. Use only as proximity enrichment for independently verified dive sites: the source does not classify its coastal attractions as dive sites. |
| Japan MSIL | Japan | Marine data catalogue/download services | Check individual dataset terms | Discovery index for coral reefs, bathymetry and marine restrictions. |
| Geoscience Australia | Australia | ArcGIS REST, WFS and WMS | Check service metadata | Reef morphology, seabed and marine-park enrichment. |
| LINZ Data Service | New Zealand | LDS APIs and downloads | Generally Creative Commons; verify layer | Hydrography, place names, seabed and wreck enrichment. |
| Western Australian Museum | Western Australia | SLIP ArcGIS MapServer layer 0 | CC BY 4.0; © Western Australian Museum | 305 positioned wreck/aircraft records ingested as lazy evidence, with protection status. Excluded from recreational recommendations. |
| Vicmap Hydro | Victoria, Australia | Public WFS layer `open-data-platform:hy_navigation_point`, filtered to `feature_type_code='wreck'` | CC BY 4.0; State of Victoria, Department of Transport and Planning | 30 coordinate-bearing charted wreck points ingested as lazy evidence. The layer does not consistently publish names and does not establish recreational access or safety. |
| Florida Fish and Wildlife Conservation Commission | Florida, United States | Open Data artificial-reef MapServer layer 12 | Available without restriction; FWC attribution expected | 4,548 deployment records ingested as lazy underwater-feature evidence with material, depth, relief, deployment date and accuracy. Not a recreational-site or navigation source. |
| NOAA/NCCOS ArcGIS services | US, Caribbean and Pacific territories | ArcGIS REST (`query` supports GeoJSON) | US government/public domain unless metadata says otherwise | Recreational SCUBA layers exist, but many similarly named "Dive Sites" layers are scientific surveys only. Classify each layer. |
| NOAA AWOIS via NY Department of State | United States coastal waters | Public FeatureServer snapshot plus NOAA InPort item 70439 | Public free informational use; citation required; not for navigation | 12,660 wreck/obstruction features ingested as lazy evidence. This is an older AWOIS snapshot, not NOAA's complete current synthesis; object ID and NOAA record number are stored separately. |
| NOAA Ocean Exploration | Global scientific expeditions | ArcGIS REST services | US government/public domain unless noted | Submersible/ROV dive locations and tracks: evidence/enrichment only. |
| NAMRIA Geoportal Philippines | Philippines | Public WMS vector KML layer `geoportal:hd_wreck` | Open under NAMRIA Memorandum Order No. 008, series of 2022 | 94 named navigational wrecks ingested as lazy evidence; WFS requires authentication. Not proof of dive access or safety. |
| Northeast Ocean Data Portal | US Northeast | GIS downloads/services | Check dataset metadata | Recreational SCUBA diving areas, commonly polygons rather than named points. |
| Wikidata | Global | SPARQL endpoint | CC0 structured data | Sparse named sites and wrecks; useful for aliases, Wikipedia links and identifiers. |

## Tier 3: commercial or partnership candidates

These sources may have valuable catalogues, but no public bulk recreational-site
API or redistribution permission was verified. Contact the owner before use.

| Source | Likely value | Constraint |
| --- | --- | --- |
| PADI Dive Guides / site catalogue | Large global curated catalogue | No verified public bulk dive-site API; partner agreement required. |
| SSI dive-site locator | Large community/logbook-derived catalogue | No verified public site export API. Do not reverse engineer private mobile endpoints. |
| Divemates | Claims 9,952 sites across 141 countries | Public Zenodo release contains aggregate counts, not site coordinates. Seek a data partnership. |
| Zyla World Scuba Diving Sites API | Claims about 15,000 sites; country search | Paid API; provenance and database redistribution rights need written confirmation. |
| Navionics/Boating POIs | Wrecks and marine POIs | SDK/partner terms; POI extraction and storage may be prohibited. |
| Google Places, HERE, Foursquare, TomTom | Dive operators and businesses | Primarily operators, not underwater sites; caching/redistribution restrictions apply. |
| dive.io | User dive logs | Authenticated API exposes account dives/photos, not a public site catalogue. |

## Excluded from automatic recreational-site ingestion

- OBIS and GBIF occurrence points: species evidence, not dive sites.
- Turks and Caicos `dive-sites-tcreef`: CKAN marks the dataset closed and restricts it to named users, so it is not ingested.
- Queensland artificial reef sites: lawful CC BY data, but these are managed fishing reefs with activity restrictions, not canonical recreational dive sites.
- Generic reef polygons: candidate habitat only.
- Scientific SCUBA, ROV, AUV or drop-camera stations: survey evidence only.
- Protected wreck databases: a wreck may be inaccessible, illegal or unsafe to dive.
- Search-engine results, scraped booking sites and private mobile APIs: unclear rights
  and unstable contracts.
- `amenity=dive_centre` and `shop=scuba_diving`: operators, not underwater sites.

## Central ingestion architecture

The browser must consume LiveTide's API/cache, never bulk upstream services.

1. A scheduled worker downloads or pages each upstream source independently.
2. Raw responses are stored immutably with source, retrieval time, request URL,
   HTTP validators, checksum and licence snapshot.
3. Source adapters normalise records into `site`, `operator`, `wreck`, `reef`,
   `survey_station` and `restriction` tables.
4. A spatial matching job builds canonical sites without deleting source records.
5. Quality and access rules decide whether a record can be recommended to divers.
6. The public API serves canonical records plus source attribution and freshness.
7. IndexedDB remains a client cache only; it is not the system of record.

Recommended storage is PostgreSQL with PostGIS. Object storage should retain raw
PBF, GeoJSON, CSV and API responses so transformations can be reproduced.

### Minimum source-record fields

```text
source_id, source_record_id, source_url, source_type, retrieved_at,
upstream_updated_at, licence_id, raw_checksum, name, aliases, geometry,
country_code, region_code, min_depth_m, max_depth_m, entry_type,
site_type, access_status, evidence_class, confidence, canonical_site_id
```

### Deduplication

Do not merge on name alone. Generate candidate matches using distance, normalised
name/aliases, topology, depth and locality. Keep a many-to-one source mapping and
record merge confidence. Suggested starting radii:

- exact named underwater site: 150 m;
- wreck: 300 m, with vessel-name aliases;
- reef or wall: 1 km, requiring name/topology agreement;
- operator: 50 m plus name/address matching.

### Licence boundaries

ODbL-derived records must retain attribution and may impose share-alike obligations
on a derived public database. Keep ODbL data in a traceable source partition until
legal review decides whether the canonical combined database is a derivative or a
collective database. Commercial API data must not be persisted beyond its contract.

## Rollout

1. Add OpenDiveMap as a separately attributed global layer and measure overlap.
2. Replace browser Overpass with server-side Geofabrik ingestion for Philippines,
   Japan, Australia, New Zealand and the existing Americas coverage.
3. Add IMOS/RLS and government recreational-site layers with explicit evidence
   classes; add candidate sites only after validation.
4. Add EMODnet, Australian and NOAA wreck/reef enrichment.
5. Approach The Dive API, PADI, SSI and Divemates for bulk-data and persistence
   terms, prioritising sources that allow canonicalisation and local storage.
6. Publish source coverage, freshness, attribution and removal mechanisms in the UI.

## Source links

- OpenDiveMap: https://opendivemap.com/docs/api
- OpenDeepMap: https://opendeepmap.com/
- The Dive API: https://thediveapi.com/
- Divemap API: https://divemap.gr/api-docs
- OSM scuba tagging: https://wiki.openstreetmap.org/wiki/Tag:sport=scuba_diving
- Geofabrik: https://download.geofabrik.de/
- IMOS/RLS: https://www.data.gov.au/data/dataset/imos-national-reef-monitoring-network-sub-facility-site-information
- EMODnet services: https://emodnet.ec.europa.eu/en/emodnet-web-service-documentation
- Japan Biodiversity GIS: https://www.biodic.go.jp/trialSystem/top_en.html
- Japan MSIL: https://www.msil.go.jp/data/catalogue/index.html
- Geoscience Australia services: https://services.ga.gov.au/
- LINZ Data Service: https://www.linz.govt.nz/products-services/data/linz-data-service
- NZ Hauraki layer: https://seasketch.doc.govt.nz/arcgis/rest/services/Hauraki/Marine_Use_Activities_test/MapServer/1
- Turks and Caicos dataset: https://dataportal.gov.tc/dataset/dive-sites-tcreef
- NOAA/NCCOS services: https://gis.ngdc.noaa.gov/arcgis/rest/services/nccos/

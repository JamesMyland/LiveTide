# Dive data API research backlog

Last reviewed: 2026-07-20

Scuba training-centre directories are tracked separately in [SCUBA_TRAINING_CENTRE_SOURCES.md](SCUBA_TRAINING_CENTRE_SOURCES.md). Training centres are facilities, not dive sites, and are excluded from encounter ranking.

This document is the working inventory for APIs and machine-readable datasets
that may enrich LiveTide. It is intentionally broader than recreational dive
sites: operators, wrecks, reefs, bathymetry, restrictions, scientific survey
stations and species observations are recorded separately.

This list is exhaustive only for sources discovered so far. Add newly discovered
sources here before implementing them, including the licence and persistence
rules. Do not scrape private mobile APIs or booking sites.

## Status legend

- **Ingested**: data is generated into the LiveTide repository.
- **Integrated**: consumed by the current browser/runtime.
- **Verified**: endpoint and response type confirmed, but not yet ingested.
- **Research**: promising source requiring endpoint, licence or coverage checks.
- **Partner**: requires an account, commercial agreement or written permission.
- **Rejected**: unsuitable as a canonical recreational dive-site source.

## Purpose-built dive-site APIs

| Source | Coverage | API or download | Access | Status | Next research |
| --- | --- | --- | --- | --- | --- |
| OpenDiveMap | Global | `https://api.opendivemap.com/v1/sites` | Public GeoJSON; ODbL | **Ingested** | Monitor coverage, update frequency and ODbL attribution requirements. |
| OpenDiveMap enums | Global | `https://api.opendivemap.com/v1/enums` | Public JSON | **Verified** | Import controlled topology, entry and environment vocabulary. |
| OpenDiveMap stats | Global | `https://api.opendivemap.com/v1/stats` | Public JSON | **Verified** | Use for ingestion completeness checks. |
| OpenDeepMap | Global | `https://opendeepmap.com/` | Advertises GeoJSON/vector tiles; ODbL | **Research** | Locate stable bulk/API endpoints and test actual availability. |
| The Dive API - sites | Global | `https://thediveapi.com/` | Subscription/API key | **Partner** | Obtain API documentation, pricing, rate limits, provenance, persistence and redistribution rights. |
| The Dive API - operators | Global | `https://thediveapi.com/` | Subscription/API key | **Partner** | Keep operators separate from underwater sites. Confirm fields and coverage. |
| Divemap Greece REST API | Global, strongest in Greece | `https://divemap.gr/api/v1/dive-sites` | Public reads/token; terms require review | **Integrated** | Confirm bulk redistribution and long-term caching rights. |
| Divemap Greece API docs | Global | `https://divemap.gr/api-docs` | Public documentation | **Verified** | Track schema and rate-limit changes. |
| Divemap UK GeoJSON | United Kingdom | `https://divemap.uk/geojson/{layer}.json` | Public endpoint; terms require review | **Integrated** | Confirm licence for `sites`, `wrecks`, `unknown`, `launch`, `tide-station`, and `lighthouse`. |
| Divemap UK GraphQL | United Kingdom | Existing LiveTide proxy integration | Public web endpoint; terms require review | **Integrated** | Document schema, endpoint and permitted caching explicitly. |
| Zyla World Scuba Diving Sites | Global | `https://zylalabs.com/api/867/world+scuba+diving+sites+api/647/search+places` | Paid bearer token | **Partner** | Determine provenance and whether responses may be centralised and redistributed. |
| Divesites.com legacy API | Global | Historical `http://api.divesites.com/` | Availability unclear | **Research** | Verify that the service still exists over HTTPS; ignore third-party API directories until confirmed. |
| dive.io API | User dive logs | `https://api.dive.io/v1` | Basic authentication | **Rejected** | No public site-catalogue resource is documented; reconsider only if API expands. |

## OpenStreetMap APIs and extracts

| Source | Coverage | API or download | Access | Status | Next research |
| --- | --- | --- | --- | --- | --- |
| OpenStreetMap regional extracts | Global | `https://download.geofabrik.de/` | Daily PBF; ODbL | **Verified** | Build server-side PBF ingestion and replication updates. |
| Philippines extract | Philippines | `https://download.geofabrik.de/asia/philippines.html` | PBF/GeoPackage; ODbL | **Verified** | Count true dive sites, operators, wrecks and reefs separately. |
| Japan extract | Japan | `https://download.geofabrik.de/asia/japan.html` | PBF; ODbL | **Verified** | Measure Okinawa and island coverage; retain Japanese and English names. |
| Australia extract | Australia | `https://download.geofabrik.de/australia-oceania/australia.html` | PBF; ODbL | **Verified** | Compare against IMOS and state wreck datasets. |
| Asia extracts | APAC | `https://download.geofabrik.de/asia.html` | Country PBF files; ODbL | **Verified** | Prioritise Indonesia, Malaysia, Thailand, Philippines, Japan, Maldives and Sri Lanka. |
| Australia/Oceania extracts | APAC/Oceania | `https://download.geofabrik.de/australia-oceania.html` | Country PBF files; ODbL | **Verified** | Prioritise Australia, New Zealand, Fiji, Palau, PNG and Pacific islands. |
| Europe extracts | EMEA | `https://download.geofabrik.de/europe.html` | Country PBF files; ODbL | **Verified** | Compare against Divemap and EMODnet. |
| Africa extracts | EMEA | `https://download.geofabrik.de/africa.html` | Country PBF files; ODbL | **Verified** | Prioritise Red Sea, South Africa, Mozambique, Tanzania, Kenya and island states. |
| Overpass API | Global | `https://overpass-api.de/api/interpreter` | Public shared service | **Integrated, retiring** | Replace bulk and regional browser queries with generated extracts; retain only small interactive fallbacks. |
| OSM main API | Global | `https://api.openstreetmap.org/api/0.6/` | Public editing/object API | **Rejected for bulk** | Use extracts instead; main API is not intended for bulk downloads. |

Relevant OSM tags:

```text
sport=scuba_diving
scuba_diving:divespot=yes
scuba_diving:type=*
scuba_diving:entry=*
scuba_diving:maxdepth=*
amenity=dive_centre
shop=scuba_diving
historic=wreck
wreck=*
natural=reef
reef=*
```

Operators and reefs must not automatically become recreational dive sites.

## Australia and Oceania

| Source | Coverage | API or download | Data class | Status | Next research |
| --- | --- | --- | --- | --- | --- |
| IMOS National Reef Monitoring Network | Australia and worldwide | AODN WFS layer `imos:ep_site_list_public_data` via `https://geoserver-123.aodn.org.au/geoserver/ows` | Diver survey stations | **Ingested as evidence** | 4,862 stations are stored separately and used only for lazy nearby-survey enrichment. Catalogue says freely available for non-profit use, but the formal dataset licence remains unspecified and flagged for confirmation. |
| WA DPIRD Abrolhos Islands Dive Trails | Houtman Abrolhos Islands, Western Australia | ArcGIS layer 12 in the SLIP People and Society MapServer | Seven named official recreational dive trails | **Ingested** | 55 numbered route markers are grouped into seven canonical trail records using marker centroids. CC BY 4.0. Required attribution: © State of Western Australia, Department of Primary Industries and Regional Development. |
| Queensland Parks and Wildlife Service public moorings | Great Barrier Reef, Whitsundays, Moreton Bay and other Queensland marine parks | Official `Environment/ParksMarineProtectedAreas/MapServer/16` ArcGIS layer | 386 public moorings grouped into 162 canonical named reef/island access locations | **Ingested as recreational access infrastructure** | QPWS states the moorings are available to all reef users and publishes mooring class, vessel size and coordinates. Multiple buoys and five whitespace/punctuation label variants are grouped so a site cannot dominate recommendations. CC BY 4.0 with State of Queensland attribution. A mooring is not proof of scuba suitability: cards require current zoning, permits, buoy limits, availability, weather and safety checks. |
| Australian Ocean Data Network | Australia | `https://portal.aodn.org.au/` and catalogue services | Marine datasets | **Research** | Search catalogue for recreational sites, artificial reefs, moorings and restrictions. |
| Geoscience Australia services | Australia | `https://services.ga.gov.au/` | Reefs, seabed, bathymetry | **Verified** | Inventory relevant ArcGIS/WFS layers and licences. |
| Western Australian Museum Shipwrecks (WAM-002) | Western Australia | SLIP People and Society MapServer layer 0 | Positioned wreck and aircraft evidence | **Ingested as evidence** | 305 records with public coordinates are generated separately from the recreational catalogue and shown lazily near opened sites. Protection status and Museum record links are preserved. CC BY 4.0; © Western Australian Museum. A recorded position does not imply access permission or dive safety. |
| Queensland artificial reef sites | Queensland | Queensland Open Data/QSpatial download | Managed fishing reefs | **Verified; excluded from dive catalogue** | CC BY 4.0, but the state says these were designed for recreational fishing and special activity notices may prohibit or restrict other activities. Retain as a future restriction/context layer only. |
| Australasian Underwater Cultural Heritage Database | Australia | Government web database | Protected wrecks | **Research** | Determine whether an API or licensed bulk export exists. |
| Queensland artificial reef sites | Queensland | Official `Environment/ParksMarineProtectedAreas/MapServer/4` layer and Queensland Open Data dataset `189cd727-08cc-47da-a56c-99f5977ca2ef` | 12 recreational-fishing artificial-reef management polygons | **Verified; excluded from recommendations** | CC BY 4.0, but the source says these reefs were designed specifically for recreational fishing and are subject to special activity notices that may prohibit or restrict other recreation. Do not turn polygon centroids into dive sites. Retain for a future marine-activity restriction/context overlay. |
| NSW offshore artificial reefs / FishSmart | New South Wales | FishSmart app, government pages and individual navigation notices | Managed recreational-fishing reef coordinates | **Verified; no stable public point API found** | The official Fisheries ArcGIS directory does not currently expose an artificial-reef point service. Coordinates are published piecemeal in notices and management PDFs, while FishSmart is the maintained consumer map. Do not reverse engineer or scrape the app; request a licensed bulk feed from NSW DPIRD. These are fishing infrastructure and must not become recreational dive recommendations without explicit access evidence. |
| NSW seabed reef extent | New South Wales | Data.NSW ArcGIS MapServer `Marine/NSW_seabed_reef_extent`, layers 0-1 | Statewide rocky-reef polygons and source footprints | **Verified; habitat enrichment only** | CC BY metadata, updated 2025-10-23. Useful for future spatial habitat context, but polygons do not establish a named dive site, entry point, safety or access. Keep separate from the point evidence artifact. |
| Vicmap Hydro Navigation Point | Victoria | Public WFS `open-data-platform:hy_navigation_point` | Charted hydrographic wreck points | **Ingested as evidence** | 30 `feature_type_code='wreck'` points are ingested under CC BY 4.0 with stable UFI identifiers. Names are usually absent, and the layer does not establish recreational access, heritage permission or diving safety. |
| Victorian Heritage API | Victoria | Read-only HAL API `https://api.heritagecouncil.vic.gov.au/shipwrecks` | Historic shipwreck records and descriptive enrichment | **Verified; enrichment research** | The dedicated collection currently reports 781 records under CC BY 4.0 and exposes vessel history, dimensions, construction, loss date and protection identifiers. Collection records do not expose coordinates, so they cannot be joined safely to Vicmap points without another stable identifier. Do not infer matches from locality text. |
| Marine and Coastal Feature Atlas Points | Victoria | DataVic/DataShare ordered spatial export | Mixed marine and coastal features | **Verified; manual export only** | CC BY 4.0 metadata is current, but no stable direct distribution API was found. DataShare uses a session-based order workflow. Do not embed its portal key or automate a brittle browser order; reassess if a WFS or direct download is published. |
| Hauraki Gulf SeaSketch Dive Sites | New Zealand | `https://seasketch.doc.govt.nz/arcgis/rest/services/Hauraki/Marine_Use_Activities_test/MapServer/1` | Named recreational sites | **Ingested** | 39 records ingested. DOC material is generally CC BY 4.0, but the layer combines DOC, Waikato Regional Council and Dive New Zealand data, so third-party rights remain flagged for confirmation. Find the production replacement for the `test` service. |
| Coastal BC Diving Sites | Coastal British Columbia, Canada | DataBC ArcGIS layer 23; catalogue dataset `6f344ab9-279f-4782-b53a-fa15ffbfa3f7` | Provincial coastal scuba-site points | **Ingested** | The official layer contains 397 planning points. Only the 184 records with a nonblank `LOCATION` are imported; catalogue deduplication currently retains 180. Stable `DIVING_SITE_ID`, boat/shore access, relative importance, source project and comments are preserved. Open Government Licence - British Columbia. |
| MaPP Public Recreation Dive Sites | Coastal British Columbia, Canada | ArcGIS FeatureServer `bb70813dc83049bc9b954558b668dcce`, layer 0 | 400 scuba-site points | **Rights hold; not ingested** | The layer combines DFO, local knowledge, guide books, websites, Vancouver Aquarium, Parks Canada, provincial and other sources. Its metadata says reuse is subject to upstream data-use agreements, while the public ArcGIS item states no licence. Do not redistribute until MaPP or the source custodians provide applicable terms. |
| Leeds and Grenville GeoHub Dive Sites | Eastern Ontario, Canada | ArcGIS FeatureServer layer 14 in the official Recreation service | 15 named recreational dive-site points | **Ingested** | All 15 official county GeoHub records are generated into the catalogue. Preserve GlobalID, difficulty, raw source depth fields, metric maximum depth, vessel years, reference link and 2025-09-23 data update. The source states no special restrictions or limitations. Internally inconsistent source depth ranges remain visibly flagged rather than silently corrected. |
| Parks Canada SCUBA Points of Interest | Lake Minnewanka, Banff National Park, Alberta | Authoritative ArcGIS item `ed9ba960823e427ab730b3ee1c577c7f`, layer 0 filtered to `Principal_type=79` | One bilingual official visitor SCUBA access point | **Ingested** | Open Government Licence - Canada. Preserve the English and French names, shore-stair description, official activity link, current AIS self-certification requirement, protected submerged-heritage warning and cold-water/high-altitude safety guidance. The point marks visitor access, not every submerged feature and is not a navigation aid. |
| LINZ Data Service | New Zealand | `https://data.linz.govt.nz/services/api/v1/` | Hydrography, seabed, names | **Verified** | Identify wreck and reef layers; obtain API key if required. |
| data.govt.nz CKAN API | New Zealand | `https://catalogue.data.govt.nz/api/3/action/` | Dataset discovery | **Verified** | Automate searches for diving, wreck, reef and maritime datasets. |

## Japan, Philippines and wider APAC

| Source | Coverage | API or download | Data class | Status | Next research |
| --- | --- | --- | --- | --- | --- |
| Taiwan Tourism Information Database | Taiwan | Daily `Attraction-json.zip` from `media.taiwan.net.tw`; catalogue dataset 7777 | Government-listed public tourism attractions | **Ingested in part** | Six manually reviewed records explicitly described as recreational diving locations are ingested using stable attraction IDs. Broad keyword imports are deliberately avoided. Taiwan Open Government Data License 1.0. Preserve Chinese aliases and upstream update timestamps. |
| Yilan marine-recreation one-stop dataset | Yilan County, Taiwan | Dataset 145927; CSV/XML/JSON resource host | Coastal recreation attractions | **Verified; resource unavailable** | Metadata and Open Government Data License 1.0 are current, but `opendataap2.e-land.gov.tw` timed out during verification. Retry later; do not mirror unofficial copies. |
| Okinawa Prefecture tourism attractions | Okinawa, Japan | BODIK CKAN package `470007_tourist_attraction`; CSV resource `57e74516-40c5-4e07-8f06-dac4ea0193e9` | Government tourism POIs with coordinates | **Verified; enrichment only** | Published by Okinawa Prefecture under CC BY 4.0 and updated through the official BODIK CKAN API. The 2026-01-09 catalogue version contains general attractions, including coastal landmarks such as Cape Maeda, but no field explicitly verifies recreational diving. Do not add these records to recommendations. They may provide nearby place/address/access context after matching an independently verified dive site. |
| Okinawa/BODIK open-data catalogue | Japan | CKAN API `https://data.bodik.jp/api/3/action`; API guide `https://odcs.bodik.jp/okinawa-dpf/api/` | Dataset discovery | **Verified** | Searches for `ダイビング`, `潜水` and `スキューバ` returned no dive-specific packages on 2026-07-18. Continue municipality-level searches, but require explicit dive-site semantics before ingestion. |
| Nagasaki Tabinet tourism spots | Nagasaki Prefecture, Japan | BODIK package `420000_nagasakitabinet`; recommended tourism CSV resource `e3907cf2-f9f0-4bb5-b94c-ea6f4abe460b` | Government tourism POIs and activities | **Verified; no scuba records found** | Nagasaki Prefecture publishes the feed under CC BY 4.0 with coordinates and descriptions. The current file includes an explicit Takashima snorkelling activity, but searches found no explicitly classified scuba/diving site. Snorkelling-only activities are excluded from the dive catalogue. Recheck on upstream updates. |
| BCO-DMO Moorea Reef Locations | Moorea, French Polynesia | Dataset `645257`; `LTR_Reef_Locations.csv` | Sampled reef coordinates | **Verified; context only** | CC BY 4.0 and coordinate-bearing, but the dataset record only states that reefs/sites were sampled and does not establish SCUBA use or public recreational access. Do not classify as dive sites without a method-level link from the associated study. |
| BCO-DMO western Pacific coral transect sites | Palau, Yap, FSM, Majuro and Kiritimati | Datasets `737508` and site list `735714` | Shallow coral-survey transects and coordinates | **Verified; context only** | CC BY 4.0. The current methods describe 2-5 m transects but do not state SCUBA, diver or snorkel methodology. Retain as reef-monitoring evidence rather than infer dive-site status. |
| PALARIS / PacIOOS Palau Dive Sites | Palau | PacIOOS WFS `PACIOOS:pw_plrs_all_divesites` and ISO/FGDC metadata | 37 named recognized recreational dive-site points | **Ingested** | Originated by the Palau Automated Land and Resources Information System and distributed by PacIOOS. The federal catalogue applies CC0 1.0, while the source metadata explicitly permits free use and redistribution. Preserve the 2008 compilation vintage, PALARIS/PacIOOS credit and the warning that the legacy coordinates may contain inaccuracies and are not intended for legal or navigation use. PacIOOS's HTTPS GeoServer currently uses a legacy DH key rejected by Node 24; the generator uses the byte-equivalent HTTP feature response only after validating its pinned SHA-256 against the official HTTPS payload, and fails closed on any change. The original ISO metadata is bundled at `data/source-metadata/palaris-palau-dive-sites.xml`. |
| GCMP / PacIOOS Guam Dive Sites | Guam | PacIOOS WFS `PACIOOS:gu_db_all_divesites` and ISO metadata | 34 named recognized recreational dive-site points | **Ingested** | Originated by the Guam Coastal Management Program and distributed by PacIOOS. The ISO metadata permits free use and redistribution, warns that the data may contain inaccuracies and excludes legal use. The generator consumes the byte-equivalent HTTP WFS feature response because the HTTPS GeoServer uses a legacy DH key rejected by Node 24; a pinned feature-array SHA-256 makes any upstream change fail closed. Preserve the legacy compilation warning and GCMP/PacIOOS credit. The original ISO metadata is bundled at `data/source-metadata/pacioos-guam-dive-sites.xml`. |
| Hawaii DLNR Day-Use Moorings / PacIOOS | Main Hawaiian Islands | Current DLNR DOBOR HTML table plus PacIOOS WFS `PACIOOS:hi_mk_all_day_use_moorings` and ISO metadata | 234 named day-use mooring coordinate rows at popular dive or snorkel locations | **Ingested as recreational infrastructure** | The current DLNR page is the authoritative maintained listing and was last updated 2026-06-23. State website terms permit copying and distribution for informational use; PacIOOS metadata separately permits free use and redistribution and excludes legal use. Records rank below verified dive sites because a mooring does not establish scuba suitability. Preserve the upstream discrepancy between the headline count of 236 and the 234 published coordinate rows. The malformed out-of-range `Molokini-T` HTML coordinate is replaced only after an exact match to the hash-pinned official PacIOOS feature. Both normalized HTML rows and the 175-feature WFS payload are integrity pinned; original ISO metadata is bundled at `data/source-metadata/pacioos-hawaii-day-use-moorings.xml`. |
| PacIOOS WFS capabilities inventory | Hawaii, Guam, CNMI, American Samoa, Palau, Marshall Islands and wider U.S. Pacific holdings | PacIOOS WFS 2.0 `GetCapabilities` | 511 feature types checked on 2026-07-20 | **Inventory complete for explicit dive/scuba semantics** | The exhaustive capabilities scan found the named Palau and Guam dive layers, unnamed Guam popularity points, Marshall Islands survey-style points and Hawaii day-use moorings documented here. Other matches describe coral-resilience polygons, monitoring sites, towed-diver centroids or biodiversity/tourism context; they do not establish public recreational destinations. No additional explicitly named CNMI, American Samoa, FSM or Hawaii dive-site FeatureType was present. Re-scan capabilities on upstream metadata updates. |
| University of Guam / PacIOOS Dive Site Popularity | Guam | PacIOOS WFS `PACIOOS:gu_yl_all_divesites` and ISO metadata | 52 unnamed popularity points scored 1-3 | **Verified; enrichment hold** | The popularity values are documented, but the layer contains no site names or stable join key. Only 11 points have an unambiguous named GCMP site within 250 m; a broader nearest-neighbour join becomes ambiguous. Do not create anonymous destinations or silently attach popularity by proximity. Revisit if PacIOOS or the originator supplies an authoritative crosswalk. |
| USAID / PacIOOS Marshall Islands Dive Sites | Marshall Islands | PacIOOS WFS `PACIOOS:mh_mgd_all_divesites` and ISO metadata | 151 point records with atoll, description and coral-cover fields | **Verified; classification hold** | PacIOOS permits free use and redistribution, but many names are survey codes and three records are unnamed. The available metadata does not establish that every point is a public recreational destination. Retain as a potential marine-survey evidence source until its methods and site classification are confirmed. |
| IUCN-hosted Tonga WFL1 dive layers | Tonga | ArcGIS FeatureServer layers 12 (`Dive sites TO`) and 13 (`Dive_Sites_Vavau`) in item `a86a09f47c40422fa733c95325ed2264` | Dive-site points | **Rights hold; not ingested** | The service owner is an IUCN ArcGIS account, but the item and service publish no licence, attribution, description or copyright statement. A separate personal web map republishes the layers without resolving those rights. Obtain written reuse terms and authoritative provenance before ingestion. |
| BCO-DMO Kimbe Bay anemonefish reefs | Papua New Guinea | Dataset `823794` | Ten reefs surveyed using SCUBA | **Coordinate conflict; not ingested** | Methods explicitly state SCUBA near Mahonia Na Dari, but the record text places the site at 150.5 E while the machine-readable/PDF spatial extent reports -150.5. Obtain corrected site coordinates before use; do not silently flip the longitude sign. |
| BCO-DMO northern Great Barrier Reef parrotfish survey | Northern Queensland, Australia | Dataset `828688` | 82 SCUBA video-survey sites | **Data unavailable; not ingested** | Methods clearly describe SCUBA and GPS-tracked survey dives, but BCO-DMO currently marks the dataset unvalidated and data unavailable with zero downloads. Reassess if the coordinate table is published under explicit reuse terms. |
| Kagoshima City tourism information | Kagoshima City, Japan | BODIK package `462012_kankojoho`; CSV resource `4239ff22-f77a-41a1-a86c-e02f10cfa5c7` | Government tourism information | **Verified; no dive records found** | CC BY 4.0. The current 82-record CSV has descriptions but no explicit diving/scuba/snorkelling entries and no coordinates, so it is not currently useful for site ingestion. |
| Ojika Town tourism facilities | Ojika, Nagasaki, Japan | BODIK package `423831_kakou`; CSV resource `73a1f196-e29d-4c46-b294-8e1714451782` | Government tourism facilities | **Verified; no dive records found** | CC BY 2.1 JP. The small coordinate-bearing facility list contains no explicit dive records; beach records must not be inferred to be dive sites. |
| Japan Biodiversity Center GIS | Japan | `https://www.biodic.go.jp/trialSystem/top_en.html` | Coral reefs, coast and habitats | **Verified download** | Record exact shapefile URLs, cautions and update dates. |
| Japan Marine Cadastre / MSIL | Japan | `https://www.msil.go.jp/data/catalogue/index.html` | Coral, bathymetry, protected areas | **Research** | Identify WMS/WFS/download endpoints and English metadata. |
| JAMSTEC data portals | Japan/Pacific | `https://www.jamstec.go.jp/` | Scientific dives, seabed, observations | **Research** | Locate machine-readable expedition/dive position services. |
| Japan Agency for Cultural Affairs | Japan | Government cultural-property portals | Underwater heritage | **Research** | Determine whether geospatial exports exist and whether coordinates are public. |
| Philippines Geoportal non-wreck layers | Philippines | `https://www.geoportal.gov.ph/` | Reefs, protected areas, marine features | **Research** | Classify coastal-resource and protected-area layers independently; do not treat habitat geometry as dive sites. |
| BCO-DMO Reef Fish Resilience SCUBA sites | Western Leyte, Philippines | Dataset `642957`; `Dive_Sites.csv` | Two historical research SCUBA sampling locations | **Ingested** | Final version 1, CC BY 4.0. Preserve Pinsky and Stuart citation, 2012-2018 study period and research-site classification. Coordinates do not establish public access or a precise tourism entry point, so cards carry an explicit verification warning. |
| BCO-DMO Caribbean sponge microbiome SCUBA sites | Belize, Honduras, Panama and Florida Keys | Dataset `954346`; versioned CSV/ERDDAP | 14 usable site-coordinate combinations from 636 SCUBA sample rows | **Ingested** | Version 1, CC BY 4.0. The generated records retain 624 qualifying sample rows after rejecting `0,0`, placeholder names and a case-only duplicate. Preserve the full dataset citation, 2013-2014 period and contributing sample-row count. Shared regional coordinates and repeated names at different positions remain visible with positional-quality warnings. |
| NAMRIA Geoportal Philippines Wreck | Philippines | Public WMS `geoportal:hd_wreck`, requested as vector KML | Navigational wreck evidence | **Ingested as evidence** | 94 named records are generated separately; 59 unnamed placeholders are excluded. The WMS is public and the inventory marks the layer Open under NAMRIA Memorandum Order No. 008 s. 2022; WFS currently returns 401. Preserve chart references and do not infer recreational access or safety. |
| Philippines DENR Biodiversity Management Bureau | Philippines | Government portals | Protected areas and reefs | **Research** | Find GIS downloads/services and legal access metadata. |
| NAMRIA | Philippines | Government hydrographic/geospatial services | Charts, bathymetry, names | **Partner/Research** | Establish open-data availability and restrictions on nautical data. |
| ASEAN Biodiversity / ACB | Southeast Asia | Regional biodiversity portals | Protected areas, habitats | **Research** | Locate stable API/download endpoints and licences. |
| Coral Triangle Atlas | Indonesia, Malaysia, Philippines, PNG, Solomon Islands, Timor-Leste | Regional GIS portal | Reefs, MPAs | **Research** | Verify current availability, API endpoints and permitted reuse. |

## Europe, Middle East and Africa

| Source | Coverage | API or download | Data class | Status | Next research |
| --- | --- | --- | --- | --- | --- |
| MMO1243 Recreational Scuba Diving | England | Defra OGC API Features collection `MMO1243_Recreational_Scuba_Diving` | 157 generalized recreational-activity polygons | **Verified; context only** | Open Government Licence with MMO attribution. Source points were buffered by 0.5 km and assigned lower confidence; records generally identify an MPA rather than an individual site. Do not turn polygon centroids into destination recommendations. |
| EMODnet Human Activities WFS - Heritage Ship Wrecks | European and adjacent seas | `https://ows.emodnet-humanactivities.eu/wfs`, typename `emodnet:heritageshipwrecks` | Harmonised heritage-wreck points | **Ingested as evidence** | 7,073 records are ingested under the layer metadata's CC BY 4.0 terms. Stable source IDs, original authority, country, object type, depth, loss year, point method, update year and statutory status are retained. Protection is shown as a warning, not an invitation to dive. |
| EMODnet Human Activities WFS - Worldwide wreck locations | Global, strongest in UKHO coverage | Same WFS, typename `emodnet:wwshipwrecks` | 67,391 charted/uncharted/live/dead wreck points | **Verified; defer bulk ingestion** | The WFS abstract says the UKHO source is updated quarterly and supplied under OGL 3.0; EMODnet metadata applies CC BY 4.0 to the harmonised product. The layer is useful but would materially enlarge the single lazy artifact. Add regional sharding and spatial loading before ingestion; preserve UKHO record IDs and navigation disclaimers. |
| EMODnet Seabed Habitats WFS | European seas | `https://ows.emodnet-seabedhabitats.eu/geoserver/emodnet_open/wfs` | Habitats and reefs | **Verified** | Select candidate-site enrichment layers. |
| EMODnet Bathymetry WFS | European seas | `https://ows.emodnet-bathymetry.eu/wfs` | Bathymetry products | **Verified** | Assess suitability for point depth enrichment. |
| EMODnet Bathymetry REST | European seas | `https://rest.emodnet-bathymetry.eu/` | Point/profile depths | **Integrated through Apps Script** | `depth_sample` is proxied and cached because the upstream response lacks browser CORS. Site cards show modelled depth, cell range/variation and survey reference with a navigation-safety warning. |
| EMODnet Biology occurrence WFS | European seas | `https://geo.vliz.be/geoserver/Dataportal/wfs` | Species occurrences | **Verified** | Compare with OBIS; avoid duplicate evidence. |
| EMODnet WMS/WMTS | European seas | See EMODnet service documentation | Map overlays | **Verified** | Use only when vector ingestion is unnecessary. |
| UK Hydrographic Office open data | United Kingdom | UKHO data services/downloads | Wrecks, tides and charts | **Integrated in part** | Document exact wreck dataset/API and update automation. |
| Historic England protected wrecks | England | Historic England GIS/downloads | Protected wrecks | **Research** | Add access restrictions and legal warnings. |
| Canmore / Historic Environment Scotland | Scotland | API/download services | Wrecks and heritage | **Research** | Locate geospatial API and licence. |
| Marine Institute Ireland | Ireland | ERDDAP/WMS/WFS/data catalogue | Marine data | **Research** | Find wrecks, reefs, dive surveys and bathymetry layers. |
| SeaSearch records from Irish coastal waters | Ireland | National Biodiversity Data Centre ZIP export via `https://maps.biodiversityireland.ie/Dataset/Download?datasetId=158` | Trained citizen-scientist SCUBA species surveys, 2003-2021 | **Ingested as lazy survey evidence; excluded from recommendations** | CC BY 4.0. The generator verifies the raw TSV checksum and aggregates 40,153 usable occurrence rows into 1,057 survey events at 1,018 locations using survey ID, site name and coordinate. Revisited locations remain separate by survey ID and date. Runtime cards show date, occurrence count, taxon count and compact habitat context. Survey coordinates do not establish public access or current diving safety. |
| INFOMAR Shipwrecks | Irish waters | Official ArcGIS `Infomar/Shipwrecks/MapServer/0` and downloadable dataset | 542 high-resolution seabed-surveyed wreck points | **Ingested as lazy evidence; excluded from recommendations** | CC BY 4.0 with the specified Irish Public Sector Data attribution. Preserve GSI and National Monuments references, vessel name/type, loss date, surveyed water depth, dimensions, cruise, imagery, report and 3D-model links. The source is evidence, not a navigation chart or proof of legal/safe recreational access. |
| SHOM data services | France | WMS/download/API services | Wrecks, bathymetry, navigation | **Research** | Establish open layers and redistribution constraints. |
| Italian national/regional geoportals | Italy | WFS/ArcGIS services | MPAs, wrecks, reefs | **Research** | Inventory coastal-region services. |
| Spanish marine geoportals | Spain | WFS/ArcGIS services | MPAs, reefs, wrecks | **Research** | Inventory national and autonomous-community services. |
| Malta Coastal and Marine Infrastructure as per SPED | Malta | Hale Connect WFS `am:ManagementRestrictionOrRegulationZone` | 31 point features classified as dive sites | **Rights hold; not ingested** | The public portal presents the dataset as open/HVD, but the authoritative live WFS capabilities declare Attribution-NonCommercial-NoDerivatives 4.0 and `otherRestrictions`. The points also carry no individual dive-site names. Do not centralise or derive a normalised catalogue without clarified terms and names from the Planning Authority. |
| Cyprus Hydrography diving areas | Cyprus | DLS ArcGIS `National/Hydrography_Data_GR/MapServer/65` | Four numbered diving-area polygons | **Verified; context only** | The data.gov.cy record is CC BY 4.0, but the geometry represents broad restriction/management areas rather than named recreational destinations. Preserve for a future regulatory-context overlay; do not recommend polygon centroids as sites. |
| Red Sea regional sources | Egypt, Israel, Jordan, Saudi Arabia, Sudan | Government/research portals | Reefs, wrecks, MPAs | **Research** | Identify machine-readable national services. |
| BCO-DMO Strytan Hydrothermal Field SCUBA sites | Eyjafjordur, Iceland | Dataset `685418`; `Strytan_elements.csv` | Three named research SCUBA sites | **Ingested** | CC BY 4.0. Three coordinate-bearing sites are generated from 25 qualifying sample rows; missing-coordinate and on-land records are excluded. Cards treat these as technical research locations, show maximum sampled vent temperatures and preserve the upstream discrepancy between the dataset title's July 2012 date and the CSV's July 2013 dates. |
| Seychelles MSP Atlas Dive Sites | Seychelles Inner Islands | `SEYMSP_ATLAS_USES_AND_ACTIVITIES`, layer 9 `Tourism_Dive_Sites` | 76 records, of which 70 are named/plausible tourism dive sites | **Rights hold; not ingested** | The service credits the Seychelles environment ministry database, TNC and SFA, but the official Seychelles MSP Atlas terms prohibit reproduction, modification, distribution and commercial use without written permission. Six records are blank and four of those are remote outliers. Obtain written permission before centralising any records. |
| South African National Biodiversity Institute | South Africa | BGIS APIs/downloads | Reefs, MPAs, biodiversity | **Research** | Locate relevant marine layers and licences. |

## Americas and Caribbean

| Source | Coverage | API or download | Data class | Status | Next research |
| --- | --- | --- | --- | --- | --- |
| NOAA/NCCOS ArcGIS services | US, Caribbean and Pacific territories | `https://gis.ngdc.noaa.gov/arcgis/rest/services/nccos/` | Recreational and scientific dive layers | **Ingested in part** | The 68-record Puerto Rico/USVI `SCUBA Diving Spots` layer is ingested with rights review because it credits caribdiveguide.com and wannadive.net. Continue classifying every other `Dive Sites` layer as recreational, SCUBA survey, ROV or AUV before ingestion. |
| NOAA AWOIS Wrecks and Obstructions | United States coastal waters | Public NYSDOS FeatureServer mirror of the NOAA AWOIS service; NOAA InPort item 70439 | Charted wreck/obstruction evidence | **Ingested as evidence** | The mirror exposes 12,660 features from the older AWOIS snapshot. Stable service object IDs, NOAA record numbers, chart, depth/unit, year sunk and position quality/method are retained. The source is provided free for informational use with citation required and is not for navigation, surveying, legal or engineering use. The current NOAA synthesis reports 41,941 features but its OceanReports service requires a token; do not describe this snapshot as complete or current. |
| NOAA NCCOS `All Dive Sites` / `Dive Sites` habitat-validation layers | American Samoa, Buck Island USVI, CNMI, Guam, Hawaii, northeast Puerto Rico/Culebra, Palau, Palmyra, St Thomas/St John, St John, southwest Puerto Rico and Vieques | 12 official NCCOS benthic-mapping ArcGIS layers under `https://gis.ngdc.noaa.gov/arcgis/rest/services/nccos/` | 16,048 habitat-map ground-validation and accuracy-assessment stations | **Ingested as lazy survey evidence; excluded from recommendations** | Layer descriptions establish that the points are historical underwater photo/video validation locations collected through mixed methods including SCUBA, snorkelling and tethered/drop cameras. They are not a public-dive-site catalogue. LiveTide stores them in `dive-survey-evidence.json` under CC0 1.0 with source-specific provenance and only loads them when a site detail card needs nearby evidence. They never enter the recommendation catalogue or map pin layers. |
| Flower Garden Banks sanctuary `Dive Sites` | Gulf of Mexico, United States | NOAA ArcGIS item `8a17f0758a7b42959de5213690e6d6c4` | Three sanctuary-bank polygons | **Verified; excluded from recommendations** | The layer contains the large Stetson, West Bank and East Bank managed-area polygons with 2022 environmental snapshots, not individual entry points or moorings. It is marked not for legal use. Retain as a future sanctuary/context overlay only. |
| Bermuda Popular Dive Sites | Bermuda | Government ArcGIS item `975b9074d7d348fc9f00fe69e6f79fb1` | Named open wrecks and North Rock | **Partner/permission required** | The Department of Conservation Services metadata explicitly identifies recreationally open wrecks and legal handling restrictions, but supplies a disclaimer rather than a reuse licence. Bermuda government website terms do not grant IP rights unless expressly stated. Request written redistribution permission before centralising. |
| Seychelles MSP Atlas dive sites | Seychelles Inner Islands | ArcGIS service `SEYMSP_ATLAS_USES_AND_ACTIVITIES/FeatureServer/9` | 76 points, including 72 locally named records | **Partner/permission required; not ingested** | The parent item describes frequently used scuba sites, but the live SFA-attributed sublayer is internally described as `Sea Cucumber Dive Sites`, four offshore records are unnamed, and the current Government of Seychelles MSP terms prohibit copying, modification, distribution or commercial use without written permission. Request both a recreational-site classification crosswalk and redistribution permission from MACCE/SMSP before centralising. |
| City of Gold Coast `Diving Structure` | Gold Coast, Australia | ArcGIS item `7fa37d8d0b814ad5916c6c9b8bef5695` | Municipal aquatic-facility assets | **Rejected** | CC BY 3.0, but the 171 features are swimming-pool starting blocks, towers and springboards rather than scuba sites or marine structures. |
| NOAA Ocean Exploration ArcGIS | Global expeditions | NOAA ArcGIS services | ROV/submersible dives and tracks | **Research** | Locate service root and licence metadata; evidence only. |
| NOAA National Coral Reef Monitoring Program | US reefs | NCCOS ArcGIS layers | Scientific SCUBA stations | **Verified** | Ingest as survey evidence, not recreational sites. |
| NOAA PIFSC RICHARD 2022 reef assessment | Guam, Rota, Tinian, Saipan, Pagan, Asuncion and Maug | ArcGIS item `aded47075b0b447b947b314fa97af5de`; `RICHARD_Benthic_Survey_Sites/FeatureServer/0` | 161 scientific-diver reef-monitoring stations | **Ingested as lazy survey evidence; excluded from recommendations** | The May 2022 `RA2201_LEG4` mission records are CC0 1.0. Preserve island, station, mission, date and completed survey activities. Scientific monitoring locations do not establish public access or recreational-diving safety. |
| REEF Dive Sites and Reports via Northeast Ocean Data Portal | Newfoundland to Virginia | `https://services.northeastoceandata.org/arcgis1/rest/services/RecreationAndCulture/MapServer/32` | 288 named recreational survey/dive-site points | **Ingested** | All 288 records are generated into the recreational catalogue with REEF zone ID, report URL, required database citation, April 2020 snapshot date and visible positional caveats. Metadata permits public use as-is with citation and limitation disclosure. Runtime verification confirmed all 288 are available to recommendations when live services are offline. |
| Maryland iMAP SCUBA Snorkeling Diving | Maryland Atlantic Coast and Coastal Bays | `Society/MD_RecreationalUses/FeatureServer/46` | Three participatory-mapping use polygons | **Verified; excluded from recommendations** | The generalized polygons describe activity areas rather than named access points. Do not convert their centroids into dive-site recommendations; retain only as a possible future recreation-context overlay. |
| Northeast Ocean Data Portal recreational SCUBA areas | US Northeast | Same MapServer, layer 16 | Generalised recreational diving polygons | **Verified; excluded from recommendations** | Composite includes guides, public portals, surveys and WannaDive. Areas are intentionally generalised for confidentiality and sensitivity, so do not convert polygon centroids into precise dive-site recommendations. |
| Marine Cadastre national artificial reefs | United States and territories | Public `Hosted/ArtificialReefs/FeatureServer/0` | 30,398 artificial-reef points | **Verified; not ingested** | The service drops state and originating-program fields, preventing source-aware attribution and reliable deduplication against FWC. Prefer authoritative state feeds until the national export preserves record-level lineage. |
| Marine Cadastre | United States | `https://marinecadastre.gov/` | Wrecks, reefs, marine uses | **Research** | Continue inventorying services, preferring current public endpoints with record-level provenance; several OceanReports services require tokens. |
| NOAA Electronic Navigational Charts | United States | NOAA ENC APIs/downloads | Wrecks and obstructions | **Research** | Determine safe extraction and chart-data attribution. |
| Florida FWC Artificial Reef Deployments | Florida | Official FWC ArcGIS layer 12 and open-data item `eb2bfd225149405bba23604f20159f56` | 4,548 artificial-reef deployment events as of May 2026 | **Ingested as evidence** | FWC explicitly permits attributed derived products in the item metadata and requires the original metadata to accompany the dataset, so the generator preserves that XML in `data/source-metadata/fwc-artificial-reefs.xml`. Records retain deployment ID/date, depth, relief, material, jurisdiction, county and the upstream location-accuracy code. They are classified below verified recreational sites: FWC says most positions are not independently confirmed, materials can move/degrade/become buried, and the data must not be used for navigation. |
| California State Lands Commission `Dive Sites` | San Diego/California | ArcGIS item `2b6e4b8c48f0473fa668e5d9cc807795` | Compiled scuba sites | **Rejected pending rights clearance** | The government-hosted layer declares no licence and combines PISCO, REEF, wannadive.net and scubadiving.com records. Do not ingest or redistribute without source-by-source permission. |
| California artificial reef and marine GIS | California | State/NOAA portals | Reefs, wrecks, restrictions | **Research** | Continue inventorying independently licensed government FeatureServers. |
| Turks and Caicos Data Portal | Turks and Caicos | CKAN package `dive-sites-tcreef` | Named recreational sites | **Rejected/restricted** | CKAN reports `license_id=other-closed`, `isopen=false`, `saeri_use_constraints=restricted`, and resources restricted to named users. Do not ingest without written permission from DECR and the Turks and Caicos Reef Fund. |
| Caribbean national open-data portals | Caribbean | CKAN/ArcGIS portals | Dive sites, reefs and wrecks | **Research** | Search country by country, prioritising major dive destinations. |
| Brazil ICMBio and marine geoportals | Brazil | Government GIS/download portals | Reefs, wrecks, MPAs | **Research** | Locate APIs and licences. |

## Global supporting APIs

These sources enrich or validate a site but do not independently prove that it
is a recreational dive site.

| Source | API | Use | Status |
| --- | --- | --- | --- |
| OBIS | `https://api.obis.org/` | Marine species observations and seasonal evidence | **Integrated** |
| GBIF | `https://api.gbif.org/v1/` | Additional occurrence and taxonomy data | **Research** |
| WoRMS | `https://www.marinespecies.org/rest/` | Scientific/common names and accepted taxonomy | **Integrated/Research** |
| Marine Regions Gazetteer | `https://www.marineregions.org/rest/getGazetteerRecordsByLatLong.json/{latitude}/{longitude}/` | Global sea names, MRGIDs and marine geography; browser-CORS lookup cached locally for 30 days, with duplicate upstream labels omitted. CC BY 4.0; not for legal or navigational use. | **Integrated as lazy enrichment** |
| Wikidata SPARQL | `https://query.wikidata.org/sparql` | Aliases, identifiers and notable sites/wrecks | **Research** |
| OpenAlex/Crossref | Public scholarly APIs | Find datasets and publications about specific sites | **Research** |
| Protected Planet / WDPA | API/download subject to account terms | Marine protected areas and restrictions | **Partner/Research** |
| Open-Meteo Marine | `https://marine-api.open-meteo.com/v1/marine` | Waves, swell, sea temperature and currents | **Integrated** |
| Open-Meteo Forecast | `https://api.open-meteo.com/v1/forecast` | Wind and weather | **Integrated** |
| NOAA CO-OPS | `https://api.tidesandcurrents.noaa.gov/api/prod/` | US tides, currents and station observations | **Research** |
| WorldTides | Commercial API | Global tides | **Partner** |
| Stormglass | Commercial API | Marine weather, tide and bio data | **Partner** |
| EMODnet Bathymetry REST | `https://rest.emodnet-bathymetry.eu/` | European depth enrichment | **Verified** |
| GEBCO | Gridded downloads/WMS | Global bathymetry | **Research** |
| General Bathymetric Chart services | GEBCO endpoints | Global depth fallback | **Research** |
| ArcGIS REST search | `https://www.arcgis.com/sharing/rest/search` | Discover public dive/wreck/reef FeatureServers | **Research tool** |
| CKAN APIs | `/api/3/action/package_search` on government portals | Discover open datasets | **Research tool** |

## Commercial catalogues requiring outreach

| Organisation | Likely data | Status | Required answer before use |
| --- | --- | --- | --- |
| PADI | Dive sites, guides, shops and resorts | **Partner** | Is there a licensed site API, and may LiveTide store and redistribute canonical records? |
| SSI | Dive-site locator, shops and verified dive logs | **Partner** | Is a public/partner site API available? No private mobile endpoint use. |
| Divemates | Sites, shops and marine species | **Partner** | Can coordinates and metadata be licensed? Public Zenodo data is aggregate only. |
| Garmin/Navionics | Marine POIs, wrecks and charts | **Partner** | Which SDK/API exposes POIs and what caching is permitted? |
| Reef Smart Guides | Detailed mapped sites | **Partner** | Is structured site data licensable separately from maps/media? |
| DiveAssure/DAN travel products | Operators and safety resources | **Partner** | API availability and permitted use. |
| Google Places | Dive businesses | **Partner/limited** | Place-data storage is restricted; not a source of underwater sites. |
| HERE | Dive businesses and POIs | **Partner/limited** | Confirm relevant categories and persistence restrictions. |
| TomTom | Dive businesses and POIs | **Partner/limited** | Confirm relevant categories and persistence restrictions. |
| Foursquare | Dive businesses | **Partner/limited** | Confirm category coverage and persistence restrictions. |

## Required research record

Before moving a source to **Verified**, record:

```text
Source owner:
Coverage:
Canonical landing page:
API/service root:
Protocol and output formats:
Authentication:
Rate limits:
Pagination:
Stable upstream identifier:
Update frequency:
Licence:
Attribution text:
May cache locally:
May combine/deduplicate:
May redistribute:
Personal/commercial-use restrictions:
Sensitive-site policy:
Sample response captured:
Last successful request:
```

## Ingestion priority

1. Complete server-side OpenStreetMap/Geofabrik ingestion by country.
2. Add verified named recreational datasets: Hauraki Gulf and Turks and Caicos.
3. Continue adding independently licensed scientific stations to the source-aware lazy survey-evidence artifact; IMOS/RLS, Irish SeaSearch and 12 NOAA NCCOS habitat-validation layers are integrated.
4. Add EMODnet, NOAA, Australian and New Zealand wreck/reef enrichment.
5. Research Philippines, Japan and Red Sea government portals in detail.
6. Request commercial terms from The Dive API, PADI, SSI and Divemates.
7. Publish per-source coverage, freshness, attribution and exclusion controls.

See also [DIVE_SITE_DATA_SOURCES.md](./DIVE_SITE_DATA_SOURCES.md) for the
normalisation, deduplication, storage and licensing architecture.

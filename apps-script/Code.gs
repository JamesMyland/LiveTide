/**
 * LiveTide dive-data proxy — Google Apps Script web app.
 *
 * The browser can't call divemap.gr directly (no CORS headers). This runs
 * server-side (UrlFetchApp isn't subject to CORS), fetches the data, and
 * re-serves it as JSON that LiveTide can read cross-origin. Your token stays
 * here as a Script Property — it never ships to the browser.
 *
 * Deploy with clasp — see README.md in this folder. After deploying, set the
 * DIVEMAP_TOKEN script property and paste the web-app /exec URL into PROXY_URL
 * in js/dive.js.
 *
 * ENDPOINTS
 *   ?set=divesites   -> full divemap.gr catalogue (JSON array)
 *   ?set=wrecks | unknown | launch | tide-station | lighthouse | sites
 *                    -> corresponding divemap.uk public GeoJSON layer
 *   ?search=<name>    -> compact wreck and dive-site name matches for key-up search
 *   ?bathymetry=<lat>,<lng> -> EMODnet DTM depth sample for European seas
 *
 * NOTE: divemap.uk layers are third-party data — check their licence and add
 * attribution before publishing, and they sit behind Cloudflare so may be
 * refused. divemap.gr is the primary, supported source.
 */
var GR_BASE = 'https://divemap.gr/api/v1';
var UK_SETS = ['wrecks', 'unknown', 'launch', 'tide-station', 'lighthouse', 'sites'];

function doGet(e) {
  var set = (e && e.parameter && e.parameter.set) || 'divesites';
  var featureId = e && e.parameter && e.parameter.feature;
  var search = e && e.parameter && e.parameter.search;
  var bathymetry = e && e.parameter && e.parameter.bathymetry;
  try {
    var data = bathymetry ? getBathymetrySample(bathymetry)
      : search ? searchDiveFeatures(search)
      : featureId ? getUkFeature(featureId)
      : (set === 'divesites') ? getDiveSites()
      : (UK_SETS.indexOf(set) >= 0) ? getUkGeoJson(set)
      : { error: 'unknown set: ' + set };
    return json(data);
  } catch (err) {
    return json({ error: String(err) });
  }
}

function getBathymetrySample(value) {
  var parts = String(value || '').split(','), lat = Number(parts[0]), lng = Number(parts[1]);
  if (parts.length !== 2 || !isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { error: 'invalid bathymetry coordinate' };
  }
  var cache = CacheService.getScriptCache(), cacheKey = 'emodnet-depth-' + lat.toFixed(4) + '-' + lng.toFixed(4);
  var hit = cache.get(cacheKey); if (hit) return JSON.parse(hit);
  var geom = 'POINT(' + lng.toFixed(6) + ' ' + lat.toFixed(6) + ')';
  var response = UrlFetchApp.fetch('https://rest.emodnet-bathymetry.eu/depth_sample?geom=' + encodeURIComponent(geom), { muteHttpExceptions:true });
  if (response.getResponseCode() !== 200) return { error:'EMODnet HTTP ' + response.getResponseCode() };
  var sample = JSON.parse(response.getContentText()), representative = sample.smoothed != null ? sample.smoothed : sample.avg;
  if (representative == null || !isFinite(Number(representative))) return { error:'no EMODnet depth at coordinate' };
  var out = { latitude:lat, longitude:lng, depthMetres:Math.abs(Number(representative)), sample:sample,
    source:'EMODnet Bathymetry DTM', sourceUrl:'https://rest.emodnet-bathymetry.eu/', fetchedAt:new Date().toISOString() };
  try { cache.put(cacheKey, JSON.stringify(out), 21600); } catch (err) {}
  return out;
}

function searchDiveFeatures(value) {
  var query = String(value || '').trim().toLowerCase();
  if (query.length < 2 || query.length > 80) return { results: [] };
  var cache = CacheService.getScriptCache(), cacheKey = 'feature-search-' + Utilities.base64EncodeWebSafe(query).slice(0, 100);
  var hit = cache.get(cacheKey);
  if (hit) return JSON.parse(hit);
  var results = searchGreekDiveSites(query).concat(getUkFeatureSearchIndex()).filter(function (item) {
    return item.searchName.indexOf(query) >= 0;
  }).sort(function (a, b) {
    var aStart = a.searchName.indexOf(query) === 0 ? 0 : 1;
    var bStart = b.searchName.indexOf(query) === 0 ? 0 : 1;
    return aStart - bStart || a.searchName.localeCompare(b.searchName);
  }).slice(0, 20).map(function (item) {
    var copy = {};
    Object.keys(item).forEach(function (key) { if (key !== 'searchName') copy[key] = item[key]; });
    return copy;
  });
  var out = { results: results };
  try { cache.put(cacheKey, JSON.stringify(out), 3600); } catch (err) {}
  return out;
}

function searchGreekDiveSites(query) {
  var token = PropertiesService.getScriptProperties().getProperty('DIVEMAP_TOKEN');
  var headers = token ? { Authorization: 'Bearer ' + token } : {};
  var url = GR_BASE + '/dive-sites/?search=' + encodeURIComponent(query) + '&page_size=40';
  var response = UrlFetchApp.fetch(url, { headers: headers, muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) return [];
  var body = JSON.parse(response.getContentText()), items = body.items || body.results || [];
  return items.map(function (site) {
    var name = site.name || site.title || '';
    return { id: String(site.id || ''), sourceId: String(site.id || ''), name: name, searchName: String(name).toLowerCase(), latitude: Number(site.latitude), longitude: Number(site.longitude), mapKind: '', dataSource: 'divemap.gr', _wreck: false };
  }).filter(function (site) { return site.name && !isNaN(site.latitude) && !isNaN(site.longitude); });
}

function getUkFeatureSearchIndex() {
  var cache = CacheService.getScriptCache(), count = Number(cache.get('uk-feature-search-index-count') || 0);
  if (count) {
    var cached = '';
    for (var i = 0; i < count; i++) {
      var part = cache.get('uk-feature-search-index-' + i);
      if (!part) { cached = ''; break; }
      cached += part;
    }
    if (cached) try { return JSON.parse(cached); } catch (err) {}
  }
  var index = [];
  ['wrecks', 'sites'].forEach(function (kind) {
    var geo = getUkGeoJson(kind);
    ((geo && geo.features) || []).forEach(function (feature, position) {
      var properties = feature.properties || {}, coordinates = feature.geometry && feature.geometry.coordinates || [];
      var name = properties.name || properties.title || properties.feature || properties.vessel || properties.wreck_name || properties.featurenam || properties.sitename;
      if (!name || coordinates.length < 2) return;
      var id = properties.id != null ? String(properties.id) : (properties.fid != null ? String(properties.fid) : kind + position);
      index.push({ id: kind + id, sourceId: id, name: name, searchName: String(name).toLowerCase(), latitude: Number(coordinates[1]), longitude: Number(coordinates[0]), mapKind: kind, dataSource: 'divemap.uk via LiveTide proxy', _wreck: kind === 'wrecks' });
    });
  });
  var raw = JSON.stringify(index), chunkSize = 70000, chunks = Math.ceil(raw.length / chunkSize);
  try {
    for (var c = 0; c < chunks; c++) cache.put('uk-feature-search-index-' + c, raw.slice(c * chunkSize, (c + 1) * chunkSize), 21600);
    cache.put('uk-feature-search-index-count', String(chunks), 21600);
  } catch (err) {}
  return index;
}

function getUkFeature(id) {
  if (!/^[A-Za-z0-9_-]{3,40}$/.test(id || '')) return { error: 'invalid feature id' };
  var cache = CacheService.getScriptCache();
  var cacheKey = 'uk-feature-' + id;
  var hit = cache.get(cacheKey);
  if (hit) return JSON.parse(hit);
  var query = [
    'query LiveTideFeature($id: String!) {',
    ' feature(id: $id) {',
    '  id name alternateNames type icon categories { name slug description }',
    '  position { lat lng plusCode } depths { confidence maxComputed avgComputed minComputed gebco }',
    '  district county region country { name iso3166 } countryDistance { m nm } positionConfidence positionPrecision',
    '  summary { description short }',
    '  ukho { wreckId wreckCategory obstructionCategory status classification position latitude longitude horizontalDatum limits positionMethod depth height depthMethod depthQuality depthAccuracy waterDepth waterLevelEffect verticalDatum reportedYear name type flag length width draught sonarLength sonarWidth shadowHeight orientation tonnage tonnageType cargo conspicVisual conspicRadar dateSunk nonSubContact bottomTexture scourDimensions debrisField originalSensor lastSensor originalDetectionYear lastDetectionYear originalSource markers circumstancesOfLoss surveyingDetails generalComments lastAmendedDate }',
    '  data {',
    '   description { value source { refName href refSource { name href sourceType } } }',
    '   descriptionDive { value source { refName href refSource { name href sourceType } } }',
    '   descriptionBiodiversity { value source { refName href refSource { name href sourceType } } }',
    '   descriptionTides { value source { refName href refSource { name href sourceType } } }',
    '   descriptionHistory { value source { refName href refSource { name href sourceType } } }',
    '   hazards { value source { refName href refSource { name href sourceType } } }',
    '   facilities { value source { refName href refSource { name href sourceType } } }',
    '   charges { value source { refName href refSource { name href sourceType } } }',
    '   contact { value source { refName href refSource { name href sourceType } } }',
    '   website { value source { refName href refSource { name href sourceType } } }',
    '   wreckId { value } wreckName { value } wreckNationality { value } wreckPurpose { value } wreckBuiltYear { value } wreckSunkYear { value } wreckCauseOfLoss { value } wreckState { value } wreckUkhoStatus { value }',
    '   protectionDesignation { value } protectionDate { value } protectionAgency { value } protectionAgencyId { value } protectionReason { value }',
    '   services { service state notes source { refName } }',
    '  }',
    '  launches { feature { id name type position { lat lng plusCode } } distance { nm m } bearing }',
    '  tideStations { reference { id refName href position { lat lng plusCode } feature { id name type position { lat lng plusCode } } } distance { nm m } bearing }',
    '  seaTemperature { monthly current }',
    '  relatedFeatures { id name type icon position { lat lng plusCode } }',
    '  referenceSet { id refId refName refTitle href position { lat lng plusCode } positionPrecision refSource { name href sourceType iconUrl bookAuthor bookPublisher bookPublishedYear bookIsbn } data { depthMin depthAvg depthMax notices { category title body } } referenceassetSet { id } }',
    '  assets { id title href description attributionText attributionHref image thumbCached assetType subject altText hasWatermark isScreenshot peopleVisible framing isSharp backscatterHeavy classifiedAt luminanceRange laplacianVariance reference { id refName refTitle href refSource { name href iconUrl } } }',
    ' }',
    '}'
  ].join('\n');
  var res = UrlFetchApp.fetch('https://divemap.uk/gql', {
    method: 'post', contentType: 'application/json',
    payload: JSON.stringify({ operationName: 'LiveTideFeature', variables: { id: id }, query: query }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) return { error: 'GraphQL HTTP ' + res.getResponseCode() };
  var body = JSON.parse(res.getContentText());
  if (body.errors && body.errors.length) return { error: body.errors[0].message || 'GraphQL error' };
  var feature = body.data && body.data.feature;
  if (!feature) return { error: 'feature not found' };
  var out = { feature: feature, fetchedAt: new Date().toISOString() };
  try { cache.put(cacheKey, JSON.stringify(out), 21600); } catch (err) {}
  return out;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getDiveSites() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get('divesites');
  if (hit) return JSON.parse(hit);

  var token = PropertiesService.getScriptProperties().getProperty('DIVEMAP_TOKEN');
  var headers = token ? { Authorization: 'Bearer ' + token } : {};
  var all = [], page = 1, totalPages = 1;
  do {
    var res = UrlFetchApp.fetch(GR_BASE + '/dive-sites/?page=' + page + '&page_size=100',
      { headers: headers, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) break;
    var j = JSON.parse(res.getContentText());
    (j.items || []).forEach(function (s) { all.push(s); });
    totalPages = j.total_pages || 1;
    page++;
  } while (page <= totalPages && page <= 60);

  try { cache.put('divesites', JSON.stringify(all), 21600); } catch (e) {} // 6h; skipped if >100KB
  return all;
}

function getUkGeoJson(set) {
  var res = UrlFetchApp.fetch('https://divemap.uk/geojson/' + set + '.json', { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return { error: 'HTTP ' + res.getResponseCode() };
  return JSON.parse(res.getContentText());
}

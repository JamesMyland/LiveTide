import { $ } from "./dom.js";

const CACHE_KEY = "livetide_species_profiles_v3";
const CACHE_TTL = 7 * 24 * 3600e3;
const esc = value => String(value == null ? "" : value).replace(/[&<>\"]/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[character]));
const plain = value => String(value || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
const readCache = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch (e) { return {}; } };
const writeCache = value => { try { localStorage.setItem(CACHE_KEY, JSON.stringify(value)); } catch (e) {} };
const getJson = async url => { const response = await fetch(url); if (!response.ok) throw new Error(`${response.status}`); return response.json(); };

async function resolveAphiaId(taxon) {
  if (taxon.aphiaID) return +taxon.aphiaID;
  return +(await getJson(`https://www.marinespecies.org/rest/AphiaIDByName/${encodeURIComponent(taxon.scientific)}?marine_only=true`));
}

async function commonsImages(taxon) {
  const params = new URLSearchParams({ action:"query", format:"json", origin:"*", generator:"search", gsrsearch:taxon.scientific, gsrnamespace:"6", gsrlimit:"4", prop:"imageinfo", iiprop:"url|extmetadata", iiurlwidth:"720" });
  try {
    const payload = await getJson(`https://commons.wikimedia.org/w/api.php?${params}`);
    return Object.values(payload?.query?.pages || {}).map(page => {
      const info = page.imageinfo?.[0], meta = info?.extmetadata || {};
      return info ? { url:info.thumburl || info.url, page:info.descriptionurl, title:page.title?.replace(/^File:/, ""), artist:plain(meta.Artist?.value), licence:plain(meta.LicenseShortName?.value), credit:plain(meta.Credit?.value) } : null;
    }).filter(item => item?.url && /^https:\/\//.test(item.url)).slice(0, 3);
  } catch (e) { return []; }
}

function conservationStatus(value) {
  const label = String(value || "").trim(), normalised = label.toLowerCase();
  const codes = {
    ex:["Extinct", 5], ew:["Extinct in the Wild", 5], cr:["Critically Endangered", 4],
    en:["Endangered", 3], vu:["Vulnerable", 2], nt:["Near Threatened", 1],
    lc:["Least Concern", 0], dd:["Data Deficient", 0], ne:["Not Evaluated", 0],
  };
  const coded = codes[normalised];
  if (coded) return { label:`${coded[0]} (${label.toUpperCase()})`, severity:coded[1], code:label.toUpperCase() };
  const statuses = [
    ["extinct in the wild", "Extinct in the Wild", 5], ["extinct", "Extinct", 5],
    ["critically endangered", "Critically Endangered", 4], ["endangered", "Endangered", 3],
    ["vulnerable", "Vulnerable", 2], ["near threatened", "Near Threatened", 1],
    ["least concern", "Least Concern", 0], ["data deficient", "Data Deficient", 0],
  ];
  const match = statuses.find(([prefix]) => normalised.startsWith(prefix));
  return match ? { label, severity:match[2] } : { label, severity:0 };
}

function obisRedListStatus(payload) {
  const records = Array.isArray(payload) ? payload : payload?.results || payload?.data || [];
  const record = records.find(item => item?.category || item?.iucnCategory || item?.redlistCategory);
  if (!record) return null;
  return { ...conservationStatus(record.category || record.iucnCategory || record.redlistCategory), source:"OBIS IUCN Red List checklist" };
}

function obisYearRange(payload) {
  const records = Array.isArray(payload) ? payload : payload?.results || payload?.data || [];
  const years = records.map(item => +(item?.year ?? item?.date_year ?? item?.key)).filter(year => Number.isInteger(year) && year > 0);
  return years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "";
}

async function wikidataConservation(wiki) {
  const speciesId = wiki?.wikibase_item;
  if (!/^Q\d+$/.test(speciesId || "")) return [];
  const entityParams = new URLSearchParams({ action:"wbgetentities", format:"json", origin:"*", ids:speciesId, props:"claims" });
  const entityPayload = await getJson(`https://www.wikidata.org/w/api.php?${entityParams}`);
  const statusIds = [...new Set((entityPayload?.entities?.[speciesId]?.claims?.P141 || [])
    .map(claim => claim?.mainsnak?.datavalue?.value?.id).filter(id => /^Q\d+$/.test(id || "")))];
  if (!statusIds.length) return [];
  const labelParams = new URLSearchParams({ action:"wbgetentities", format:"json", origin:"*", ids:statusIds.join("|"), props:"labels", languages:"en" });
  const labelPayload = await getJson(`https://www.wikidata.org/w/api.php?${labelParams}`);
  return statusIds.map(id => {
    const label = labelPayload?.entities?.[id]?.labels?.en?.value || id;
    return { id, ...conservationStatus(label) };
  }).sort((a, b) => b.severity - a.severity || a.label.localeCompare(b.label));
}

async function fetchProfile(taxon) {
  const aphiaID = await resolveAphiaId(taxon);
  if (!aphiaID) throw new Error("WoRMS could not resolve this scientific name.");
  const urls = [
    `https://www.marinespecies.org/rest/AphiaRecordByAphiaID/${aphiaID}`,
    `https://www.marinespecies.org/rest/AphiaVernacularsByAphiaID/${aphiaID}`,
    `https://www.marinespecies.org/rest/AphiaDistributionsByAphiaID/${aphiaID}`,
    `https://api.obis.org/v3/occurrence?taxonid=${aphiaID}&size=1`,
    `https://api.obis.org/v3/statistics/years?taxonid=${aphiaID}`,
    `https://api.obis.org/v3/checklist/redlist?taxonid=${aphiaID}`,
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(taxon.scientific)}`,
  ];
  const [record, vernaculars, distributions, obis, years, redlist, wiki, images] = await Promise.allSettled([...urls.map(getJson), commonsImages(taxon)]);
  const wikiProfile = wiki.status === "fulfilled" ? wiki.value : {};
  const obisStatus = redlist.status === "fulfilled" ? obisRedListStatus(redlist.value) : null;
  let conservation = obisStatus ? [obisStatus] : [];
  if (!conservation.length) try { conservation = await wikidataConservation(wikiProfile); } catch (error) {}
  return {
    aphiaID,
    record:record.status === "fulfilled" ? record.value : {},
    vernaculars:vernaculars.status === "fulfilled" ? vernaculars.value : [],
    distributions:distributions.status === "fulfilled" ? distributions.value : [],
    obis:obis.status === "fulfilled" ? obis.value : {},
    obisYears:years.status === "fulfilled" ? obisYearRange(years.value) : "",
    wiki:wikiProfile,
    images:images.status === "fulfilled" ? images.value : [],
    conservation,
  };
}

function renderLegacyProfile(taxon, profile) {
  const record = profile.record || {}, wiki = profile.wiki || {};
  const commonNames = [...new Set((profile.vernaculars || []).map(item => item.vernacular).filter(Boolean))].slice(0, 8);
  const total = Number(profile.obis?.total);
  const fact = (label, value) => value == null || value === "" ? "" : `<div><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  const photos = (profile.images || []).map(image => `<figure><a href="${esc(image.page)}" target="_blank" rel="noopener"><img src="${esc(image.url)}" alt="${esc(taxon.common)}" loading="lazy"></a><figcaption>${esc(image.artist || image.credit || image.title)}${image.licence ? ` · ${esc(image.licence)}` : ""}</figcaption></figure>`).join("");
  $("speciesInfoBody").innerHTML =
    (photos ? `<div class="species-info-photos">${photos}</div>` : "") +
    `<div class="species-info-summary"><span class="species-info-icon" style="--species-color:${esc(taxon.color)}">${taxon.icon}</span><div><h3>${esc(taxon.common)}</h3><i>${esc(record.scientificname || taxon.scientific)}${record.authority ? ` · ${esc(record.authority)}` : ""}</i></div></div>` +
    (wiki.extract ? `<p class="species-info-description">${esc(wiki.extract)}</p>` : "") +
    `<div class="species-info-facts">${fact("WoRMS status", record.status)}${fact("Rank", record.rank)}${fact("Marine", record.isMarine === 1 ? "Yes" : record.isMarine === 0 ? "No" : "Not recorded")}${fact("OBIS records", Number.isFinite(total) ? total.toLocaleString() : "Unavailable")}${fact("Distribution entries", (profile.distributions || []).length.toLocaleString())}</div>` +
    (commonNames.length ? `<div class="species-info-names"><b>Other common names</b><p>${commonNames.map(esc).join(" · ")}</p></div>` : "") +
    `<div class="species-health-note"><b>Health and rarity</b><p>OBIS record totals describe data coverage and sampling effort, not abundance, rarity, population size or encounter probability. A verified global conservation assessment is not supplied by WoRMS or OBIS.</p></div>` +
    `<div class="species-info-links"><a href="https://www.marinespecies.org/aphia.php?p=taxdetails&id=${profile.aphiaID}" target="_blank" rel="noopener">WoRMS record &nearr;</a><a href="https://obis.org/taxon/${profile.aphiaID}" target="_blank" rel="noopener">OBIS map &nearr;</a><a href="https://www.iucnredlist.org/search?query=${encodeURIComponent(record.scientificname || taxon.scientific)}&searchType=species" target="_blank" rel="noopener">Check IUCN status &nearr;</a>${wiki.content_urls?.desktop?.page ? `<a href="${esc(wiki.content_urls.desktop.page)}" target="_blank" rel="noopener">Wikipedia &nearr;</a>` : ""}</div>`;
}

function renderProfile(taxon, profile) {
  const record = profile.record || {}, wiki = profile.wiki || {};
  const commonNames = [...new Set((profile.vernaculars || []).map(item => item.vernacular).filter(Boolean))].slice(0, 8);
  const total = Number(profile.obis?.total), conservation = profile.conservation || [], highestRisk = conservation[0] || null;
  const threatened = (highestRisk?.severity || 0) >= 2;
  const riskClass = highestRisk?.severity >= 4 ? "critical" : highestRisk?.severity === 3 ? "endangered" : highestRisk?.severity === 2 ? "vulnerable" : "other";
  const fact = (label, value) => value == null || value === "" ? "" : `<div><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
  const photos = (profile.images || []).map(image => `<figure><a href="${esc(image.page)}" target="_blank" rel="noopener"><img src="${esc(image.url)}" alt="${esc(taxon.common)}" loading="lazy"></a><figcaption>${esc(image.artist || image.credit || image.title)}${image.licence ? ` &middot; ${esc(image.licence)}` : ""}</figcaption></figure>`).join("");
  const statusBadge = threatened
    ? `<span class="species-risk-badge risk-${riskClass}">At risk of extinction &middot; ${esc(highestRisk.label)}</span>`
    : highestRisk ? `<span class="species-risk-badge risk-other">${esc(highestRisk.label)}</span>` : "";
  const health = highestRisk
    ? `<div class="species-health-note${threatened ? ` species-risk-alert risk-${riskClass}` : ""}"><b>${threatened ? "Extinction-risk warning" : "Conservation status"}</b><p>${esc(highestRisk.source || "Wikidata")} lists this species as ${esc(highestRisk.label)}. Verify the current assessment and population trend with the linked IUCN Red List record. OBIS totals describe data coverage, not abundance or population size.</p></div>`
    : `<div class="species-health-note"><b>Health and rarity</b><p>No structured conservation status was found in Wikidata. OBIS totals describe data coverage and sampling effort, not abundance, rarity or population size. Check IUCN for the current assessment.</p></div>`;
  $("speciesInfoBody").innerHTML =
    (photos ? `<div class="species-info-photos">${photos}</div>` : "") +
    `<div class="species-info-summary${threatened ? " at-risk" : ""}"><span class="species-info-icon" style="--species-color:${esc(taxon.color)}">${taxon.icon}</span><div><h3>${esc(taxon.common)}</h3><i>${esc(record.scientificname || taxon.scientific)}${record.authority ? ` &middot; ${esc(record.authority)}` : ""}</i>${statusBadge}</div></div>` +
    (wiki.extract ? `<p class="species-info-description">${esc(wiki.extract)}</p>` : "") +
    `<div class="species-info-facts">${fact("Conservation", highestRisk?.label || "Not recorded")}${fact("WoRMS status", record.status)}${fact("Marine", record.isMarine === 1 ? "Yes" : record.isMarine === 0 ? "No" : "Not recorded")}${fact("OBIS records", Number.isFinite(total) ? total.toLocaleString() : "Unavailable")}${fact("OBIS record period", profile.obisYears || "Unavailable")}${fact("Distribution entries", (profile.distributions || []).length.toLocaleString())}</div>` +
    (commonNames.length ? `<div class="species-info-names"><b>Other common names</b><p>${commonNames.map(esc).join(" &middot; ")}</p></div>` : "") +
    health +
    `<div class="species-info-links"><a href="https://www.marinespecies.org/aphia.php?p=taxdetails&id=${profile.aphiaID}" target="_blank" rel="noopener">WoRMS record &nearr;</a><a href="https://obis.org/taxon/${profile.aphiaID}" target="_blank" rel="noopener">OBIS map &nearr;</a><a href="https://www.iucnredlist.org/search?query=${encodeURIComponent(record.scientificname || taxon.scientific)}&searchType=species" target="_blank" rel="noopener">Verify IUCN status &nearr;</a>${highestRisk?.id ? `<a href="https://www.wikidata.org/wiki/${esc(highestRisk.id)}" target="_blank" rel="noopener">Wikidata status &nearr;</a>` : ""}${wiki.content_urls?.desktop?.page ? `<a href="${esc(wiki.content_urls.desktop.page)}" target="_blank" rel="noopener">Wikipedia &nearr;</a>` : ""}</div>`;
}

export function initSpeciesInfo() {
  const modal = $("speciesInfoModal"), close = $("speciesInfoClose"); if (!modal || modal.dataset.ready) return;
  modal.dataset.ready = "true";
  const hide = () => { modal.hidden = true; };
  close.onclick = hide;
  modal.addEventListener("click", event => { if (event.target === modal) hide(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !modal.hidden) hide(); });
}

export async function openSpeciesInfo(taxon) {
  initSpeciesInfo();
  const modal = $("speciesInfoModal"), body = $("speciesInfoBody"); if (!modal || !body || !taxon) return;
  $("speciesInfoTitle").textContent = taxon.common || taxon.scientific;
  modal.hidden = false; body.innerHTML = `<div class="species-info-loading"><i></i>Loading species profile...</div>`;
  const key = taxon.scientific.toLowerCase(), cache = readCache(), cached = cache[key];
  try {
    const profile = cached && Date.now() - cached.savedAt < CACHE_TTL ? cached.profile : await fetchProfile(taxon);
    if (!cached || profile !== cached.profile) { cache[key] = { profile, savedAt:Date.now() }; writeCache(cache); }
    renderProfile(taxon, profile);
  } catch (error) { body.innerHTML = `<div class="species-info-error">Species information is temporarily unavailable.</div>`; }
}

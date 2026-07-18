import { writeFile } from "node:fs/promises";

const existingSource = await (await import("node:fs/promises")).readFile(new URL("../js/species.js", import.meta.url), "utf8");
const existing = new Set([...existingSource.matchAll(/scientific:\s*"([^"]+)"/g)].map(match => match[1]));
const response = await fetch("https://api.obis.org/v3/checklist?scientificname=Animalia&size=1500");
if (!response.ok) throw new Error(`OBIS returned ${response.status}`);
const payload = await response.json();

const groups = {
  sharks:["🦈","#557582"], rays:["◆","#4d778d"], whales:["🐋","#426b88"], dolphins:["🐬","#288eb5"],
  turtles:["🐢","#56865f"], fish:["🐟","#3e739a"], mammals:["🐋","#718674"], cephalopods:["🦑","#9b5f78"],
  shellfish:["🐚","#9a705c"], crustaceans:["🦀","#b15f4f"], corals:["🪸","#c55f72"], jellyfish:["◌","#795da5"],
  echinoderms:["★","#aa773f"], seabirds:["●","#607b8b"], invertebrates:["•","#728b6d"],
};

function category(taxon) {
  const order = taxon.order || "", family = taxon.family || "", cls = taxon.class || "", phylum = taxon.phylum || "";
  if (cls === "Aves") return "seabirds";
  if (/Elasmobranch|Chondrichth/i.test(cls + (taxon.superclass || ""))) return /Rajiform|Myliobatiform|Torpediniform|Rhinopristiform/i.test(order) ? "rays" : "sharks";
  if (/Delphinidae|Phocoenidae/i.test(family)) return "dolphins";
  if (/Cetacea/i.test(order)) return "whales";
  if (/Mammalia/i.test(cls)) return "mammals";
  if (/Testudines/i.test(order)) return "turtles";
  if (/Cephalopoda/i.test(cls)) return "cephalopods";
  if (/Teleostei|Actinopter/i.test(cls + (taxon.superclass || ""))) return "fish";
  if (/Arthropoda/i.test(phylum)) return "crustaceans";
  if (/Anthozoa/i.test(cls)) return "corals";
  if (/Cnidaria/i.test(phylum)) return "jellyfish";
  if (/Echinodermata/i.test(phylum)) return "echinoderms";
  if (/Mollusca/i.test(phylum)) return "shellfish";
  return "invertebrates";
}

const taxa = (payload.results || []).filter(taxon => taxon.taxonRank === "Species" && taxon.kingdom === "Animalia" && taxon.scientificName && !existing.has(taxon.scientificName)).slice(0, 450);

const capitalise = value => String(value || "").trim().replace(/^./, letter => letter.toUpperCase());
const isEnglish = value => ["en", "eng", "english"].includes(String(value || "").toLowerCase());

async function wormsCommonName(taxon) {
  let aphiaID = taxon.taxonID;
  const getNames = async id => {
    if (!id) return [];
    const response = await fetch(`https://www.marinespecies.org/rest/AphiaVernacularsByAphiaID/${id}`);
    return response.ok ? response.json() : [];
  };
  let names = await getNames(aphiaID);
  if (!names.some(name => isEnglish(name.language_code) && name.vernacular)) {
    const response = await fetch(`https://www.marinespecies.org/rest/AphiaIDByName/${encodeURIComponent(taxon.scientificName)}?marine_only=true`);
    if (response.ok) aphiaID = await response.json();
    names = await getNames(aphiaID);
  }
  const english = names.find(name => isEnglish(name.language_code) && name.vernacular);
  return english ? { common:capitalise(english.vernacular), source:"WoRMS", aphiaID } : null;
}

async function gbifCommonName(scientific) {
  const match = await fetch(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(scientific)}`);
  if (!match.ok) return null;
  const usage = await match.json(), key = usage.usageKey || usage.key;
  if (!key) return null;
  const response = await fetch(`https://api.gbif.org/v1/species/${key}/vernacularNames`);
  if (!response.ok) return null;
  const payload = await response.json(), names = payload.results || payload;
  const english = names.filter(name => isEnglish(name.language) && name.vernacularName)
    .sort((a, b) => Number(b.preferred) - Number(a.preferred))[0];
  return english ? { common:capitalise(english.vernacularName), source:"GBIF", gbifKey:key } : null;
}

let cursor = 0, completed = 0;
const records = new Array(taxa.length);
async function enrich() {
  while (cursor < taxa.length) {
    const index = cursor++, taxon = taxa[index], group = category(taxon), [icon, color] = groups[group];
    let resolved = null;
    try { resolved = await wormsCommonName(taxon); } catch {}
    if (!resolved) try { resolved = await gbifCommonName(taxon.scientificName); } catch {}
    records[index] = {
      common:resolved?.common || taxon.scientificName, scientific:taxon.scientificName,
      detail:taxon.family || taxon.class || taxon.phylum || "Marine species", category:group, icon, color,
      aphiaID:resolved?.aphiaID || taxon.taxonID, ...(resolved?.source ? { commonSource:resolved.source } : {}),
      ...(resolved?.gbifKey ? { gbifKey:resolved.gbifKey } : {}),
    };
    completed++;
    if (completed % 50 === 0) console.log(`Resolved ${completed}/${taxa.length} vernacular names`);
  }
}
await Promise.all(Array.from({ length:4 }, enrich));
if (records.length !== 450) throw new Error(`Expected 450 species, received ${records.length}`);
const output = `// Generated from the OBIS Animalia checklist by scripts/build-species-catalogue.mjs.\nexport const GENERATED_SPECIES = ${JSON.stringify(records, null, 2)};\n`;
await writeFile(new URL("../js/species-catalogue.js", import.meta.url), output, "utf8");
console.log(`Generated ${records.length} species`);

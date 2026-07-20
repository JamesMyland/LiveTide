# Scuba training-centre data sources

Last reviewed: 2026-07-20

Training centres are a separate map feature from dive sites. They must not be included in encounter recommendation scoring unless they also have an independently sourced dive-site record.

## Integrated

| Source | Coverage | Access | Licence / reuse status | Runtime status |
|---|---|---|---|---|
| SSI training centre locator | Global snapshot, 1,892 records | User-supplied `data/ssi_dive_centres.json` | Public locator; bulk redistribution rights not verified | Separate `training-centres` layer, off by default, every record flagged `rightsReview` |

The SSI adapter retains centre ID, name, coordinates, address, contact details, programme labels, logo and the official SSI record URL. Do not publish or redistribute the snapshot until SSI confirms reuse terms.

## Open ingestion candidate

### OpenStreetMap

- Approved tag: `amenity=dive_centre`
- Related tags: `shop=scuba_diving`, `club=scuba_diving`
- Useful fields include `name`, `operator`, address, contact details, filling gases, rental, repair, courses and training agency (`league`).
- Licence: Open Database Licence (ODbL); preserve OpenStreetMap attribution and comply with share-alike obligations for a derived database.
- Preferred bulk route: regional Geofabrik extracts or another published OSM extract. Public Overpass instances are for bounded interactive queries, not global bulk ingestion.

## Partnership or permission targets

These organisations publish official public locators, but no documented, licensed bulk API was verified during this review. Treat them as link-out or partnership targets until written permission or an export agreement exists.

| Organisation | Official locator | Next action |
|---|---|---|
| PADI | https://www.padi.com/dive-shops/world/ | Request partner feed, permitted export, update cadence and branding terms |
| NAUI | https://www.naui.org/services/locate-dive-center/ | Request centre directory API/export and reuse terms |
| SDI / TDI / ERDI / PFI | https://www.tdisdi.com/tdi/find-a-dive-center/ | Request partner feed and stable centre identifiers |
| SSI | https://www.divessi.com/en/locator/trainingcenters | Confirm rights for the supplied snapshot and future incremental refreshes |
| PSS Worldwide | https://www.pssworldwide.org/en/PSSPeople.aspx | Request directory export and licence |
| RAID | Public training-centre locator | Request partner feed and reuse terms |
| BSAC | Public club and centre finder | Clarify whether clubs may be republished and obtain a licensed export |
| CMAS federations | Federation-specific directories | Work federation by federation; identifiers and rights are decentralised |
| GUE | https://www.gue.com/where-can-i-get-gue-training | Request a centre export; keep instructors and scheduled classes out of the centre layer |
| ACUC | https://acucinternational.com/en/diving-centers/ | Request a licensed export; ACUC notes that its public list is voluntary and may be incomplete |

The PADI, NAUI, BSAC, RAID, PSS, GUE and ACUC public locators were rechecked on 20 July 2026. They demonstrate that centre records exist, but none exposes a documented bulk API or redistribution licence suitable for direct ingestion. Do not treat an endpoint observed in browser developer tools as permission to copy or republish the directory.

## Normalised record contract

```json
{
  "id": "source:stable-id",
  "name": "Centre name",
  "latitude": 0,
  "longitude": 0,
  "address": "",
  "country": "",
  "phone": "",
  "email": "",
  "website": "",
  "trainingAgencies": [],
  "programmes": [],
  "sourceUrl": "",
  "referenceUrl": "",
  "attribution": "",
  "licence": "",
  "rightsReview": false,
  "sourceUpdatedAt": ""
}
```

## Safety and quality controls

- Never infer that a listed centre is currently authorised, open, safe or endorsed by LiveTide.
- Keep source name, source record link, retrieval date and licence on every record.
- Deduplicate only with reversible source aliases; do not discard the original source IDs.
- Revalidate coordinates, website and active status on refresh.
- Do not reverse-engineer private mobile APIs or bypass locator access controls.

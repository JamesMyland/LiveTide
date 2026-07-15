# LiveTide dive-data proxy (Google Apps Script)

A tiny web app that fetches divemap.gr server-side and re-serves it as JSON with
CORS, so the LiveTide browser app can consume it. Your divemap.gr token stays
here (as a Script Property), never in the browser.

## Deploy with clasp

```bash
npm install -g @google/clasp
clasp login
```

Get a script to push to. Either:

- **New project:** run `clasp create --type webapp --title "LiveTide Dive Proxy"`
  in an empty directory, copy the printed `scriptId`, and paste it into
  `.clasp.json` here; **or**
- **Existing project:** create a blank project at <https://script.google.com>,
  copy the id from its URL (`/d/<scriptId>/edit`) into `.clasp.json`.

Then, from this `apps-script/` folder:

```bash
clasp push -f                       # uploads Code.gs + appsscript.json
clasp deploy --description "v1"     # creates a web-app deployment
clasp open                          # Deploy ▸ Manage deployments ▸ copy the /exec URL
```

## Configure

1. In the Apps Script editor (`clasp open`): **Project Settings ▸ Script properties**
   add `DIVEMAP_TOKEN = <your divemap.gr token>` (optional — reads are public).
2. Paste the web-app **/exec** URL into `PROXY_URL` in `js/dive.js`.

## Endpoints

- `?set=divesites` — full divemap.gr catalogue (JSON array)
- `?set=wrecks|unknown|launch|tide-station|lighthouse|sites` — divemap.uk GeoJSON
- `?search=<name>` — debounced key-up search results for wreck and dive-site names;
  the cold path queries divemap.gr directly and fetches the UK GeoJSON indexes,
  so a first-time visitor does not require a pre-existing cache

The browser uses its fresh catalogue and layer caches before this endpoint.
It calls `?search=` when those local caches are missing or incomplete, which is
the normal first-visit path.
  (third-party data — check licence/attribution; may be refused by Cloudflare).

- `?feature=<divemap-id>` — live Divemap GraphQL enrichment: descriptions,
  depths, media assets, UKHO/protection metadata, notices, related features,
  sources, services, nearby launches/tide stations, and sea temperature.

### Live feature enrichment

`?feature=<divemap-id>` performs one anonymous Divemap GraphQL request and
returns structured feature details, media, UKHO and protection metadata, sources,
services, related features, nearby launches/tide stations, and sea temperature.
Results are cached in the browser for 7 days, preventing another proxy request
when the same feature is reopened. The GAS response is additionally cached for
6 hours (the Apps Script cache limit). Live tide and wind forecasts are fetched
separately so time-sensitive conditions are not held for a week.

## Redeploy after changes

```bash
clasp push -f
clasp deploy --deploymentId <id> --description "v2"   # update the same web-app URL
```

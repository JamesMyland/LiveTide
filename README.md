# LiveTide

A single-page web app that turns live tide data into an ambient, glanceable display. The background *is* the tide: blue sea rising over yellow sand, filled to the current height as a fraction of the week's peak, updating in real time. Leave it on a screen and you can see at a glance where the tide is and which way it's heading.

Eventually intended for mobile / app-store distribution.

## Features

- **Encounter planner** - enter species and a month in natural language to rank Divemap dive sites near historical OBIS observations, then open a recommendation directly on the map.

- **Choose your tide-data provider** — a compact, required-on-first-use selector for **Open-Meteo** (free, no key, global), **Stormglass** (station-accurate, needs a free key) or **NOAA CO-OPS** (official, no key, US only). Each shows its trade-offs and a sign-up link where relevant. Heights are normalised so the lowest tide in view reads 0 m, keeping providers comparable.
- **Find a location two ways** — type-to-search any place name (Open-Meteo geocoder) or drop a pin on an interactive map (Leaflet + OpenStreetMap). Chosen spots are saved as reusable chips.
- **Live sea-level background** — the sea fills to the current tide height as a fraction of the week's peak (e.g. 2 m of a 10 m peak fills 20%), moving continuously as time passes.
- **Ebb and flow** — a faint directional current drifts inward when the tide is flooding and outward when it's ebbing.
- **Tide chart** — a curve for **Today** or the **Next 7 days**, with high/low markers, highest/lowest height ticks, am/pm quarter labels, a live "now" marker, and hover tooltips showing the time of each high and low.
- **Weather layer** — temperature, wind speed and wind direction for the same coordinate (Open-Meteo Forecast API, no key), with a **Today / 7-day** toggle.
- **Appearance controls** — customisable sea and sand gradient colours, adjustable tide opacity ("fade"), flip (fill from top or base), and 90° rotation (‹ / ›) that rotates the whole UI for a physically turned monitor, plus an **Auto** mode that follows the screen's orientation.
- **Ambient mode** — the UI auto-hides after a few seconds of inactivity and reappears on mouse movement, leaving just the tide.

## Data sources

- **[OBIS](https://obis.org/)** - dated global marine-species observations used by the seasonal distribution map layer.

The marine-life selector includes 500 species: 50 curated entries plus 450 accepted species generated from the OBIS Animalia checklist. The generator resolves English common names from WoRMS where available and retains the scientific name and family as fallback, with taxonomy-derived categories, icons, and map colours. Observation coverage varies by species and contributing dataset.

- **[Open-Meteo](https://open-meteo.com/)** — marine tide model (sea level), weather forecast, and place-name geocoding. Free, no key, non-commercial.
- **[Stormglass](https://stormglass.io/)** — station-based tide sea-level and high/low extremes (requires a free API key).
- **[NOAA CO-OPS](https://api.tidesandcurrents.noaa.gov/api/prod/)** — official US tide-station predictions (no key, US coasts only).
- **[BigDataCloud](https://www.bigdatacloud.com/)** — reverse geocoding for map pins (no key).
- **[OpenStreetMap](https://www.openstreetmap.org/) / [Leaflet](https://leafletjs.com/)** — the map tiles and pin picker.

## Getting started

1. Serve the app over http (see **Hosting** — ES modules do not load from a `file://` double-click).
2. Choose a **tide data provider** (required). Open-Meteo needs no key; Stormglass needs a free key from [stormglass.io](https://stormglass.io/).
3. If you chose Stormglass, paste your key into the field and click **Save** (stored only in your browser's `localStorage`).
4. Search for a location or drop a map pin.

## Request usage and caching

Tide data is cached per location and provider in `localStorage`: LiveTide fetches a **whole week** in one request and reuses it until nearly spent, so reopening the page makes **no** further calls. This matters most for **Stormglass**, whose free tier allows only **10 requests/day**; Open-Meteo and NOAA are effectively unlimited for personal use. Weather is cached separately and refreshed about every 2 hours. With no provider data available the app falls back to cached data, or to a synthetic demo curve.

Marine-life observation datasets are cached in IndexedDB for 30 days per species. Existing localStorage entries are still read as a migration fallback, and stale saved observations remain available when OBIS cannot be reached.

## Hosting

LiveTide is a static site with no build step, but the JavaScript is split into **ES modules** under `js/`, which browsers only load over `http(s)` — **not** from a `file://` double-click. Serve it instead:

- **Locally:** run `python -m http.server` (or any static server) in the project folder and open the printed URL.
- **Anywhere:** GitHub Pages, Netlify, Cloudflare Pages, an S3 bucket, etc.

### Deploying to GitHub Pages

1. Push the code to the repository's default branch.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Choose your default branch and the **/ (root)** folder, then **Save**.
5. Wait ~1 minute for the first build, then open:

   ```
   https://jamesmyland.github.io/LiveTide/
   ```

`index.html` is the app itself, so it loads directly at the repository URL.

## Tech

Vanilla HTML, CSS and JavaScript — no framework, no bundler. `index.html` holds the markup; styles are split across `css/`; all behaviour lives in ES modules under `js/`. The tide chart uses the Canvas API; the map uses Leaflet.

### Project structure

```
index.html             app markup; loads css/ and js/main.js
css/
  base.css             variables, reset, cards, form controls
  scene.css            sky/sun/sand/sea, swell, flow, orientation, rotation
  picker.css           search, chips, map picker, provider selector
  status.css           live status readout + appearance panel
  chart.css            tide chart + weather strip
js/
  main.js              bootstrap: wires modules, restores state
  config.js            constants, provider metadata
  state.js             shared mutable app state
  dom.js format.js     DOM + colour/time/date helpers
  cache.js tide.js     localStorage cache; interpolation, extremes, datum normalisation
  apikey.js            Stormglass key persistence
  geo.js map.js        place search; Leaflet pin picker
  locations.js         location selection, saved spots, demo fallback
  live.js              per-second tick, status panel, auto-hide
  chart.js             day / 7-day tide chart + hover tooltips
  weather.js           temperature + wind layer (day / week)
  providerPicker.js    compact collapsible provider selector
  appearance.js        colours, fade, flip, rotate, auto-orientation
  providers/
    index.js           dispatcher -> the selected provider
    openmeteo.js        stormglass.js        noaa.js
```

## Roadmap

- Package for mobile / app store.
- Optional units (metres/feet) and datum selection.
- Multiple saved locations on one screen.

## License

TBD.

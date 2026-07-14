# LiveTide

A single-page web app that turns live tide data into an ambient, glanceable display. The background *is* the tide: blue sea rising over yellow sand, filled to the current height as a fraction of the week's peak, updating in real time. Leave it on a screen and you can see at a glance where the tide is and which way it's heading.

Eventually intended for mobile / app-store distribution.

## Features

- **Pick any coast three ways** — type-to-search any place name (Open-Meteo geocoder), one-tap preset spots, or drop a pin on an interactive map (Leaflet + OpenStreetMap). Searched and pinned locations are saved as reusable chips.
- **Live sea-level background** — the sea fills to the current tide height as a fraction of the week's highest tide (e.g. 2 m of a 10 m peak fills 20%), moving continuously as time passes.
- **Ebb and flow** — a faint directional current drifts inward when the tide is flooding and outward when it's ebbing.
- **Tide chart** — a curve for **Today** or the **Next 7 days**, with high/low markers, highest/lowest height ticks, am/pm quarter labels, a live "now" marker, and hover tooltips showing the time of each high and low.
- **Appearance controls** — customisable sea and sand gradient colours, adjustable tide opacity ("fade"), flip (fill from top or base), and 90° rotation (‹ / ›) that rotates the whole UI for a physically turned monitor, plus an **Auto** mode that follows the screen's orientation.
- **Ambient mode** — the UI auto-hides after a few seconds of inactivity and reappears on mouse movement, leaving just the tide.

## Data sources

- **[Stormglass](https://stormglass.io/)** — tide sea-level and extremes (requires a free API key).
- **[Open-Meteo Geocoding](https://open-meteo.com/)** — place-name search (no key).
- **[BigDataCloud](https://www.bigdatacloud.com/)** — reverse geocoding for map pins (no key).
- **[OpenStreetMap](https://www.openstreetmap.org/) / [Leaflet](https://leafletjs.com/)** — the map tiles and picker.

## Getting started

1. Get a free API key from [stormglass.io](https://stormglass.io/).
2. Open `tide.html` in a browser (double-click, or host it — see below).
3. Paste your Stormglass key into the API key field and click **Save**.
4. Search for a location, tap a preset, or drop a map pin.

The key is stored only in your browser's `localStorage` — it is never sent anywhere except directly to the Stormglass API.

## Request usage and caching

The Stormglass free tier allows **10 requests per day**. To stay within that, LiveTide fetches a **whole week** of data in a single request per location and caches it in `localStorage`. Reopening the page or revisiting a location reuses the cache and makes **no** further requests until the cached week is nearly used up. Heights are requested on the LAT datum (positive, tide-table style) with automatic fallback if unavailable.

If you run out of requests, the app falls back to the last cached data. With no key at all, it shows a synthetic demo tide curve so the interface still works.

## Hosting

LiveTide is a single self-contained static file (no build step, no dependencies to install). To publish via **GitHub Pages**, either rename `tide.html` to `index.html` or set Pages to serve this branch, then open the repo's Pages URL.

## Tech

Vanilla HTML, CSS and JavaScript. Tide chart rendered with the Canvas API; map via Leaflet. No framework, no bundler.

## Roadmap

- Package for mobile / app store.
- Optional units (metres/feet) and datum selection.
- Multiple saved locations on one screen.

## License

TBD.

# Enrich dive-map data and streamline feature cards

## Summary

This change turns the Dive Sites Nearby area into a richer, persistent map for
dive sites and related marine features. It adds Divemap-backed feature layers,
live card enrichment, seven-day weather and tide information, media viewing,
country identification, pagination, and a more compact responsive interface.

## What changed

### Dive map and layers

- Add selectable layers for dive sites, wrecks, unknown objects, launches,
  tide stations, and lighthouses.
- Load Divemap UK GeoJSON through the Google Apps Script proxy.
- Include records from every enabled layer in both the map and current-view
  results list, including UK sites, wrecks, launches, tide stations,
  lighthouses, and unknown objects.
- Remember selected map layers across page refreshes without enabling all
  sources automatically.
- Remove unreliable level and tag filters.
- Add marker clustering, hover highlighting, full-screen map mode, and correct
  layer z-index behaviour.
- Paginate current-view results with Previous and Next controls, label each
  result by feature type, and update the nearby heading to match visible data.
- Keep the layer control at the upper-left of the map card and show the nearby
  results heading and source below the map only when results exist.
- Reduce the collapsed map card to a single Points of interest row with only
  its expand control; restore layers, full-screen, map, source, and results
  controls when expanded.

### Rich feature cards

- Add dedicated layouts for dive sites, launches, wrecks, tide stations, and
  other map features.
- Fetch live Divemap GraphQL enrichment whenever an opened feature has a
  Divemap ID.
- Display descriptions, diving guidance, biodiversity, hazards, facilities,
  charges, depths, UKHO wreck metadata, protection information, services,
  related features, nearby launches, nearby tide stations, sea temperature,
  notices, assets, and original sources when available.
- Suppress empty, repeated, or identity-only description content.
- Link back to the exact Divemap feature ID wherever possible.
- Add a compact Share menu to every card with the native device share sheet,
  WhatsApp, email, Messenger, and copy-link options.
- Generate stable feature deep links containing the source kind, record ID,
  coordinates, and name, then automatically reopen the shared card after its
  catalogue or map layer is available.
- Show direct Finstrokes links when supplied by the source record.
- Consolidate data, enrichment, and forecast provenance at the bottom of every
  feature card, with direct links to Divemap, Open-Meteo, OpenStreetMap, UKHO,
  and referenced record sources where available.
- Present provenance as a consistent appendix-style Data sources node and
  deduplicate providers when expandable weather or enrichment panels are
  opened repeatedly.
- Keep the source appendix compact, with single-height provider rows and
  reduced heading and row padding.
- Cache static feature enrichment in the browser for seven days.

### Weather and tide information

- Add an expandable in-card Open-Meteo weather panel to every feature type.
- Show current air temperature, apparent temperature, precipitation, wind,
  gusts, sea-surface temperature, and wave conditions.
- Add a compact seven-day forecast with daily high/low temperature, rain
  probability, maximum wind, and dominant wind direction.
- Cache coordinate-based weather responses for one hour.
- Fetch seven days of tide and wind data when a tide station is opened.
- Show day and six-hour quarter axes, wind changes through each day, and a
  highlighted current position and height on the tide curve.

### Media

- Route Divemap thumbnails through the Divemap/Cloudflare image transform URL.
- Keep full absolute original-media URLs for the viewer.
- Open images in an in-app lightbox rather than navigating away.
- Embed YouTube media in the viewer and show YouTube badges on linked content.
- Remove failed image tiles cleanly.

### Country and locality

- Reverse-geocode feature coordinates to determine the country.
- Resolve ISO 3166 alpha-2 values to the appropriate flag.
- Show one image-based country flag beside the card title with the country name
  on hover.
- Cache reverse-geocoding results for seven days.
- Keep locality sections limited to meaningful town, county, area, or region
  data without repeating the country.

### UI cleanup

- Consolidate card identity, coordinates, actions, locality, and statistics
  into compact overview panels.
- Hide long latitude/longitude values from card headers behind a compact
  location control with reveal, clipboard copy, native `geo:` hand-off,
  OpenSeaMap nautical chart, and what3words lookup options.
- Keep the feature type, location control, Weather, Finstrokes, and Map actions
  together on a single compact overview line where space permits.
- Use encoding-safe HTML entities for source and forecast external-link icons.
- Use responsive two- and three-column fact layouts where the data supports it.
- Keep narrative content full width for readability.
- Place Weather, Finstrokes, and Map actions inline where possible.
- Compact sea-temperature history into one horizontal strip.
- Reduce status-card height and unused modal space.
- Add sticky modal actions, a slimmer scrollbar, and responsive mobile fallbacks.
- Split the two modal footer actions evenly across the available width.
- Use dynamic viewport heights and safe-area insets so the interface, feature
  modal, media viewer, and full-screen map remain inside mobile screens.
- Allow the main mobile interface to scroll when content exceeds the available
  height and reduce mobile padding to preserve usable space.
- Wait five seconds after interaction stops before fading the live interface.
- Keep the live interface visible while the map is in full-screen mode.

## Data sources

- Divemap UK GeoJSON and GraphQL
- Divemap Greece dive-site catalogue
- UK Hydrographic Office wreck data
- Open-Meteo Forecast and Marine APIs
- BigDataCloud reverse geocoding
- FlagCDN country flags
- OpenStreetMap/Overpass fallback
- Finstrokes links where present in source data

## Caching

- Dive-site catalogue and map layers: 7 days
- Divemap feature enrichment: 7 days in the browser
- Google Apps Script feature response: up to 6 hours
- Reverse-geocoded countries: 7 days
- In-card weather: 1 hour
- Tide and wind forecasts remain time-sensitive and are fetched when required.

## Verification

- `node --check js/dive.js`
- `node --check js/live.js`
- `node --check` against `apps-script/Code.gs`
- `git diff --check`

## Deployment notes

The frontend files must be published normally.

The Apps Script proxy was also expanded, so update the existing GAS deployment
to preserve the current `/exec` URL:

```powershell
cd C:\projects\personal\LiveTide\apps-script
clasp push -f
clasp deploy --deploymentId <existing-deployment-id> --description "Expanded Divemap enrichment"
```

No new API key is required for Divemap UK GraphQL, Open-Meteo, reverse
geocoding, or country flags. The existing optional Divemap Greece token remains
configured as a GAS Script Property.

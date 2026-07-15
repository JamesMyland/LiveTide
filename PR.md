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
- Make the full Points of interest label clickable as an alternative to the
  small expand icon.

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
- Route nearby launch and tide-station links through LiveTide deep links and
  open the related card in place instead of navigating to Divemap, including
  reference-only tide stations whose feature ID must be recovered from their
  source reference.
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

- Default to Open-Meteo when no tide-data provider has been saved, while
  preserving any valid provider previously selected by the user.
- Show today's weather and wind beside a compact, axis-free tide sparkline
  when the tide card is collapsed; restore the full curve and existing
  Today/7 days controls when expanded.
- Explicitly hide all live-view cards when Change location is selected so the
  collapsed tide card cannot override picker mode with its grid display rule.
- Add an expandable in-card Open-Meteo weather panel to every feature type.
- Show current air temperature, apparent temperature, precipitation, wind,
  gusts, sea-surface temperature, and wave conditions.
- Add a compact seven-day forecast with daily high/low temperature, rain
  probability, maximum wind, and dominant wind direction.
- Make each day in the main seven-day forecast selectable and fetch a cached
  hour-by-hour Open-Meteo breakdown for that date only when it is opened.
- Provide the same on-demand hourly day breakdown in the Weather panel opened
  from every dive site, wreck, launch, tide station, and map-feature card.
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

- Move tide-provider selection and its optional Stormglass key into the
  renamed Settings panel instead of requiring provider choice up front.
- Expand Settings to a wider desktop panel with provider and appearance
  controls arranged horizontally, while retaining a stacked mobile layout.
- Keep the tide-data provider and optional API-key controls in their own row,
  then group Sea, Sand, Tide fade, Flip, rotation, and Auto in one appearance row.
- Add a dedicated close control to the open Settings panel and persist its
  closed state consistently with the existing Settings toggle.
- Promote Change location from a quiet text link to a compact, high-contrast
  location action while leaving Refresh now visually secondary.
- Hide Refresh now and its separator for providers that do not require an API
  key, retaining the manual refresh action only for key-based data sources.
- Invalidate pending tide-provider requests when Change location opens so a
  late response cannot restore the collapsed Today's tide panel over the picker.
- Split the initial search into coastal-location search and name-based wreck
  or dive-site search; open matching feature cards directly from results.
- Remove the redundant manual map-pin picker now that selected search results
  drive the active location and map position directly.
- Replace saved-location chips with compact Previous locations and Previous
  wrecks and dive sites dropdowns, keeping the twelve most recent unique
  selections locally and reopening them directly.
- Add a cached GAS `?search=<name>` endpoint for debounced key-up wreck and
  dive-site lookup, returning compact results while retaining the checked-in
  browser-data fallback when the proxy is unavailable.
- Make first-run search independent of a warm cache: query Divemap Greece by
  search term and build only the compact UK wreck/site index on the cold path;
  use query and index caches solely to accelerate subsequent lookups.
- Prefer complete, fresh browser catalogue and layer caches for name search;
  use a one-hour browser query cache next, and call GAS only for a cold or
  incomplete browser cache before falling back to checked-in data.
- Consolidate card identity, coordinates, actions, locality, and statistics
  into compact overview panels.
- Add a Show me on map action to every feature card that closes the modal,
  reveals the LiveTide map, centers on the feature, and highlights its position.
- Add a favourite star to dive-site cards and store up to 100 selected site
  records locally in the browser, restoring their state whenever reopened.
- Give saved favourites a clearly filled yellow star control so their active
  state is immediately distinguishable from the neutral empty-star state.
- Always show locally saved favourite dive sites on the search screen and let
  users reopen their full cards directly without running another search.
- Store favourites as compact records, verify browser-storage writes before
  changing state, and resolve full cached catalogue data when a favourite opens.
- Accept scalar or array tag and alias fields while creating favourite records,
  preventing source-shape differences from aborting the favourite click.
- Keep the Favourite dive sites section visible with an explicit empty state and
  version the relevant browser assets so stale modules cannot hide the feature.
- Prioritise favourites when browser storage is full by clearing rebuildable
  catalogue and forecast caches incrementally, retrying after each removal.
- Present search-screen favourites as compact rounded chips with an aligned
  highlighted star, concise typography, and a restrained hover treatment.
- Reconcile map-layer changes immediately and again after asynchronous loading,
  keeping visible results, counts, labels, and source text in sync on all paths.
- Do not retain empty layer responses in memory: allow the next toggle to retry
  the healthy proxy and expose loading or empty-response status in the map UI.
- Reconcile every Leaflet cluster against the current checkbox state after each
  layer change, invalidate the map, and redraw in-view results on the next frame.
- Normalize layer-selector and map-marker glyph font metrics so each icon is
  optically centred within its circular control and marker.
- Render layer symbols through class-based pseudo-icons so their raw Unicode
  text baselines cannot shift selector or Leaflet marker alignment.
- Watch actual layer-checkbox state as a fallback and automatically reconcile
  changes when a browser misses the bound change event.
- Keep all imports of `dive.js` on one canonical module URL so map creation and
  layer handlers share the same Leaflet map and layer state instance.
- Remove temporary layer diagnostics after confirming and repairing the shared
  map-module state issue.
- Optically centre the favourite star glyph inside its circular badge by
  normalising its font metrics and baseline.
- Vertically align the dive-site type, location, Weather, Map, and selected-spot
  distance controls on one compact overview row with consistent control heights.
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

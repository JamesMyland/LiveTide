Adds selectable tide-data providers and a weather layer, refactors the
single-file app into ES modules with split CSS, and fixes mobile layout.

## Providers
- Choose Open-Meteo (free, no key, global), Stormglass (station accuracy,
  free key) or NOAA CO-OPS (official, no key, US only).
- Compact, collapsible selector; required on first load, collapses once chosen,
  each option showing its trade-offs and a sign-up link where needed.
- Heights normalised so the lowest tide in view reads 0 m (fixes Open-Meteo
  negatives vs Stormglass), keeping providers comparable.
- Per-provider, week-long localStorage caching to respect Stormglass's
  10-requests/day free tier.

## Weather layer
- Temperature, wind speed and wind direction from the Open-Meteo Forecast API
  (no key), shown under the tide curve and tracking the chart's Today / 7-day
  toggle (hourly across the day, daily across the week).

## Refactor
- Split the inline script into ES modules under `js/` (config, state, cache,
  tide maths, per-provider fetchers, chart, weather, appearance, live loop,
  UI wiring).
- Split the inline CSS into `css/` (base, scene, picker, status, chart).
- `index.html` is now the app itself; old redirect and `tide.html` removed.
- **NOTE:** ES modules require serving over http (GitHub Pages or a local
  server) — no longer runs from a `file://` double-click.

## Mobile
- Display controls collapse behind a "⚙ Display" toggle (closed by default) so
  they don't overlap the tide curve.
- 7-day weather stacks max/min temperature so all seven columns fit.

## Other
- Removed the preset demo locations (chips come only from user searches/pins).
- Unified the status and chart card widths.

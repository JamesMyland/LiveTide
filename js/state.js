// Shared mutable application state. A single object so every module sees the
// same live values without a web of setters.

import { PROVIDERS, PROV_LS, DEF_SEA, DEF_SAND, DEF_OP } from "./config.js";

// No default provider — the user must choose one on first load.
let p = localStorage.getItem(PROV_LS);
if (p && !PROVIDERS[p]) p = null;
if (!p) p = "openmeteo";

export const S = {
  current: null,        // active location + tide dataset
  provider: p,          // selected provider id, defaulting to Open-Meteo

  liveTimer: null,      // per-second tick interval
  idleTimer: null,      // auto-hide timeout
  searchTimer: null,    // geocoder debounce
  locationRequestId: 0,// invalidates late tide responses when changing view/location

  noaaStations: null,                        // cached NOAA station list

  chartRange: "day",    // "day" | "week"
  chartPts: [],         // on-screen high/low positions for hover tooltips

  weather: null,        // Open-Meteo forecast payload (rendered under the chart, same range)
  dives: [],            // nearby dive sites for the active location
  diveData: [],         // full divemap.gr dataset (polled once, cached)

  appear: { sea: DEF_SEA, sand: DEF_SAND, op: DEF_OP, flip: false, angle: 0, auto: false },
};

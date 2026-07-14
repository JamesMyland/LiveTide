// Static configuration: localStorage keys, tuning constants, presets, providers.

export const KEY_LS    = "sg_api_key";
export const PROV_LS   = "tide_provider";
export const CACHE_LS  = "tide_cache_v1";
export const LAST_LS   = "tide_last_loc";
export const SAVED_LS  = "tide_saved_spots";
export const APPEAR_LS = "tide_appearance";

export const FETCH_DAYS     = 7;          // window pulled per request
export const MIN_FORWARD_MS = 2 * 3600e3; // reuse cache while >=2h of forward data remains

export const DEF_SEA = "#2a7fc4", DEF_SAND = "#f4d998", DEF_OP = 85;

// No preset "demo" locations — chips are built only from the user's own
// searched / pinned spots (see js/locations.js).
export const PRESETS = [];

// Metadata for each tide-data provider. Fetch logic lives in js/providers/<id>.js.
export const PROVIDERS = {
  openmeteo: {
    name: "Open-Meteo", tag: "no key", key: false, signup: null,
    benefit: "Free, global, no sign-up. Hourly sea level from an ~8 km marine model — great coverage, a little less precise inside narrow estuaries.",
    detail: "Open-Meteo marine model · hourly sea level (MSL) · global ~8 km",
  },
  stormglass: {
    name: "Stormglass", tag: "API key", key: true, signup: "https://stormglass.io/",
    benefit: "Station-calibrated accuracy with published high/low times. Free tier is 10 requests/day (LiveTide caches a week per call).",
    detail: "Stormglass · sea level (LAT datum) + station high/low extremes",
  },
  noaa: {
    name: "NOAA CO-OPS", tag: "no key · US", key: false, signup: null,
    benefit: "Official US agency predictions — no key, no real limit, station-accurate. US coasts only.",
    detail: "NOAA CO-OPS · nearest-station predictions (MLLW) + high/low · US only",
  },
};

// Provider dispatcher — routes a fetch to the currently-selected provider.

import { S } from "../state.js";
import { getKey } from "../apikey.js";
import { fetchOpenMeteo } from "./openmeteo.js";
import { fetchStormglass } from "./stormglass.js";
import { fetchNOAA } from "./noaa.js";

export function fetchTides(lat, lng) {
  if (S.provider === "stormglass") return fetchStormglass(lat, lng, getKey());
  if (S.provider === "noaa")       return fetchNOAA(lat, lng);
  return fetchOpenMeteo(lat, lng);
}

// Bootstrap: wire up every UI module, then restore saved state.

import { loadKey, initApiKey } from "./apikey.js";
import { initSearch } from "./geo.js";
import { initLive } from "./live.js";
import { initChart } from "./chart.js";
import { initAppearance, loadAppearance } from "./appearance.js";
import { initMapPicker } from "./map.js";
import { initDive, loadDiveKey } from "./dive.js";
import { initCollapse } from "./collapse.js";
import { renderProviders } from "./providerPicker.js";
import { renderChips, restoreLast } from "./locations.js";
import { S } from "./state.js";
import { flash } from "./dom.js";

// attach event handlers
initApiKey();
initSearch();
initLive();
initChart();
initAppearance();
initMapPicker();
initDive();
initCollapse();

// restore persisted state
loadKey();
loadDiveKey();
loadAppearance();
renderProviders();
renderChips();
restoreLast();

// first-run prompt: a provider choice is required before anything loads
if (!S.provider) flash("Choose a tide data provider to begin.", "#7a5a12");

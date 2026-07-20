// Bootstrap: wire up every UI module, then restore saved state.

import { loadKey, initApiKey } from "./apikey.js";
import { initSearch } from "./geo.js";
import { initLive } from "./live.js?v=20260720-marine-centres2";
import { initChart } from "./chart.js?v=20260720-marine-centres2";
import { initAppearance, loadAppearance } from "./appearance.js";
import { initDive, initDiveData, openSharedCard } from "./dive.js?v=20260720-marine-centres2";
import { initCollapse } from "./collapse.js";
import { renderProviders } from "./providerPicker.js";
import { renderChips, restoreLast } from "./locations.js";
import { initEncounterPlanner } from "./planner.js?v=20260720-marine-centres2";

// attach event handlers
initApiKey();
initSearch();
initLive();
initChart();
initAppearance();
initDive();
initCollapse();
initEncounterPlanner();

// restore persisted state
loadKey();
initDiveData().then(openSharedCard); // load the catalogue, then restore a shared card when linked
loadAppearance();
renderProviders();
renderChips();
restoreLast();

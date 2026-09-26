// Discover experience — one persistent shell, three journeys, one state machine.
//
//   Discover shell (shared: city · Buy/Rent · filters · header · map · alerts)
//   ├── AREAS   journey state: nodeKey · clusterFocus · scope (AREA_SET | CITY |
//   │           POLYGON | VIEWPORT) · committed · draft · detail
//   ├── SCHOOLS journey state: st.sch — nodeKey · areaKey · query · boards ·
//   │           levels · selected school · radiusKm
//   └── AGRI    journey state: st.ag  — originKey · corridorId · clusterId ·
//               maxKm · agri filters · active parcel
//
// Switching journeys never writes into another journey's state. Map and panel are
// two renderings of the same `st`; committed transitions push browser history,
// presentation-only changes (cluster zoom, chip focus, pan, Map/List) never do.
/* Lazy view of window.EXP: the design-system bundle evaluates this file
// before EXP exists, so a value capture here would be undefined forever in that copy.
// A Proxy resolves each property at access time instead. */
const EX = new Proxy({}, { get: (_t, k) => (window.EXP ? window.EXP[k] : undefined), has: (_t, k) => !!window.EXP && k in window.EXP });

const SCENARIOS = [
  { id: "guided-areas", label: "Areas-first" },
  { id: "schools-first", label: "Schools-first" },
  { id: "area-schools", label: "Area → Schools" },
  { id: "agri", label: "Agricultural" },
  { id: "multi-area", label: "Multi-area" },
  { id: "polygon", label: "Polygon" },
  { id: "viewport", label: "Search this area" },
  { id: "zero-results", label: "Zero results" },
  { id: "alert", label: "Alert" },
  { id: "mobile", label: "Mobile" },
  // Commercial — additive states, each one the existing shell with the property
  // FAMILY set to Commercial. No scenario below introduces a screen, a hierarchy or
  // a component that the baseline does not already have.
  { id: "com-broad", label: "All commercial", group: "com" },
  { id: "com-shop", label: "Shop", group: "com" },
  { id: "com-office", label: "Office", group: "com" },
  { id: "com-multi", label: "Multi-subtype", group: "com" },
  { id: "com-cleared-subs", label: "Subtypes cleared", group: "com" },
  { id: "com-zero", label: "Com. zero", group: "com" },
  { id: "com-detail", label: "Com. detail", group: "com" },
  { id: "com-mobile", label: "Com. mobile", group: "com" },
  // Family switching — the same canonical context on both sides; only the family,
  // its subtype row, the result membership, the cards and the markers change.
  { id: "fam-res-all", label: "Res: all", group: "fam" },
  { id: "fam-res-sub", label: "Res: Villas", group: "fam" },
  { id: "fam-res-to-com", label: "Res → Com", group: "fam" },
  { id: "fam-com-to-res", label: "Com → Res", group: "fam" },
  // Context-sensitive attribute filters — bedrooms, plot area and budget each
  // appear only where they actually apply.
  { id: "attr-dwelling", label: "Beds + Carpet", group: "attr" },
  { id: "attr-plot", label: "Plot size", group: "attr" },
  { id: "attr-plot-to-dwelling", label: "Plot → dwelling", group: "attr" },
  { id: "attr-com-buy", label: "Com. Buy budget", group: "attr" },
  { id: "attr-com-rent", label: "Com. Rent budget", group: "attr" },
  { id: "attr-com-sub-budget", label: "Budget retained", group: "attr" },
  { id: "attr-plot-mobile", label: "Plot mobile", group: "attr" },
  { id: "attr-res-mobile", label: "Res. mobile", group: "attr" },
  // Commercial area + budget refinement frames — one canonical context throughout,
  // so a pair differs only by the filter under review.
  { id: "ca-all", label: "All + Area", group: "carea" },
  { id: "ca-shop", label: "Shop built-up", group: "carea" },
  { id: "ca-office", label: "Office built-up", group: "carea" },
  { id: "ca-building", label: "Building built-up", group: "carea" },
  { id: "ca-warehouse", label: "Warehouse area", group: "carea" },
  { id: "ca-land", label: "Land plot size", group: "carea" },
  { id: "ca-multi", label: "Multi → generic area", group: "carea" },
  { id: "ca-lease", label: "Rent / Lease budget", group: "carea" },
  { id: "ca-anon", label: "Anonymous", group: "carea" },
  { id: "ca-zero", label: "Zero results", group: "carea" },
  { id: "ca-one", label: "Singular copy", group: "carea" },
  { id: "ca-mobile", label: "Mobile filters", group: "carea" },
  // Preserved — the non-regression set: the original behaviour, reached through the
  // original components, with the Residential family selected.
  { id: "pre-default", label: "Baseline", group: "pre" },
  { id: "pre-hierarchy", label: "Hierarchy", group: "pre" },
  { id: "pre-residential", label: "Residential", group: "pre" },
  { id: "pre-schools", label: "Schools", group: "pre" },
  { id: "pre-agri", label: "Agricultural", group: "pre" },
  { id: "pre-listmap", label: "List / Map", group: "pre" },
  { id: "pre-marker", label: "Marker", group: "pre" },
  { id: "pre-cleared", label: "Com. cleared", group: "pre" },
  // #2627 — mobile Map filtering. One canonical filter state; the sheet stages a copy.
  { id: "mf-01", label: "01 No filters", group: "mf" },
  { id: "mf-02", label: "02 Entry", group: "mf" },
  { id: "mf-03", label: "03 Sheet · Res.", group: "mf" },
  { id: "mf-04", label: "04 Edited, not applied", group: "mf" },
  { id: "mf-05", label: "05 Applied", group: "mf" },
  { id: "mf-06", label: "06 Reopened", group: "mf" },
  { id: "mf-07", label: "07 Clear all", group: "mf" },
  { id: "mf-08", label: "08 Zero results", group: "mf" },
  { id: "mf-09", label: "09 Sheet · Com.", group: "mf" },
  { id: "mf-10", label: "10 Com. applied", group: "mf" },
  { id: "mf-11", label: "11 Marker + filter", group: "mf" },
  { id: "mf-12", label: "12 375 × 667", group: "mf" },
  { id: "mf-13", label: "13 Rent only", group: "mf" },
  { id: "mf-14", label: "14 Schools · homes", group: "mf" },
  { id: "mf-15", label: "15 Schools · sheet", group: "mf" },
  { id: "mf-16", label: "16 Schools · applied", group: "mf" }
];
const SCENARIO_GROUPS = [
  { key: null, label: "Existing Discover" },
  { key: "com", label: "Commercial — added" },
  { key: "fam", label: "Family switching" },
  { key: "attr", label: "Contextual attributes" },
  { key: "carea", label: "Commercial area & budget" },
  { key: "pre", label: "Preserved behaviour" },
  { key: "mf", label: "Map filters · #2627" }
];
const TRIO = ["hebbal", "nagawara", "jakkur"];
// Commercial review scopes — real areas from the canonical catalogue, chosen because
// they actually carry the subtype being demonstrated.
const COM_TRIO = ["indiranagar", "whitefield", "jpnagar"];
const AGRI_DEFAULT_KM = () => window.BLR_DATA.agri.defaultMaxKm;

function schBase() {
  return { nodeKey: "blr", clusterFocus: null, areaKey: null, areaKeys: null, query: "", boards: [], levels: [], selId: null, radiusKm: 5, hover: null, returnTo: null };
}
function agBase() {
  return { originKey: null, corridorId: null, clusterId: null, maxKm: AGRI_DEFAULT_KM(), filters: { ...window.DP_AGRI_DEFAULTS }, query: "", active: null, hover: null, hoverSrc: null };
}
function baseState() {
  return {
    scenario: "guided-areas", journey: "areas", city: "Bangalore",
    nodeKey: "blr", clusterFocus: null, scope: null, prevScope: null, committed: [],
    draft: null, draftNote: null, focusChip: null, preview: null, peek: null,
    filters: { ...EX.DEFAULT_FILTERS }, presentation: "list", phase: "idle",
    detail: null, dirty: false, dirtyBounds: null, confirm: null, polyDraft: null,
    alerts: [], alertDraft: null, alertPhase: null, view: null, deleteAsk: null, query: "",
    shown: 8, saved: [], hover: null, device: "desktop", note: null,
    // Commercial listings are price-gated for anonymous buyers; this is the only
    // state Commercial adds to the shell, and it changes nothing for residential.
    signedIn: false,
    // review-only design state: which account type the header is rendered for
    role: "buyer",
    sch: schBase(), ag: agBase()
  };
}
function scenarioState(id) {
  const s = baseState();
  s.scenario = id;
  if (id === "multi-area") Object.assign(s, { nodeKey: "hebbal", scope: { kind: "AREA_SET", areaKeys: ["hebbal"] }, committed: ["hebbal"] });
  else if (id === "polygon" || id === "viewport" || id === "alert") Object.assign(s, { nodeKey: "hebbal", scope: { kind: "AREA_SET", areaKeys: TRIO.slice() }, committed: TRIO.slice() });
  else if (id === "zero-results") Object.assign(s, { nodeKey: "hebbal", scope: { kind: "AREA_SET", areaKeys: TRIO.slice() }, committed: TRIO.slice(), filters: { ...EX.DEFAULT_FILTERS, beds: 3, maxPrice: 5000000, ready: true } });
  else if (id === "mobile") Object.assign(s, { device: "mobile" });
  else if (id === "schools-first") Object.assign(s, { journey: "schools" });
  else if (id === "area-schools") Object.assign(s, {
    journey: "schools", nodeKey: "hebbal", scope: { kind: "AREA_SET", areaKeys: ["hebbal"] }, committed: ["hebbal"],
    sch: { ...schBase(), nodeKey: "hebbal", areaKey: "hebbal", areaKeys: ["hebbal"], returnTo: ["hebbal"] }
  });
  else if (id === "agri") Object.assign(s, { journey: "agri" });
  // ---- Commercial / family switching -----------------------------------------
  // Every scenario below shares ONE canonical context — the same city, the same
  // three committed areas, the same scope mode, camera and breadcrumb — so a pair
  // of them isolates exactly the family delta and nothing else.
  else if (id.indexOf("com-") === 0 || id.indexOf("fam-") === 0 || id.indexOf("attr-") === 0 || id.indexOf("ca-") === 0) {
    const ctx = { nodeKey: "indiranagar", scope: { kind: "AREA_SET", areaKeys: COM_TRIO.slice() }, committed: COM_TRIO.slice() };
    // both families' subtype state travels together; `family` picks which is live
    const ff = (patch) => ({ ...EX.DEFAULT_FILTERS, family: "Commercial", comSubs: [], ...patch });
    Object.assign(s, ctx, { filters: ff() });
    if (id === "com-shop") s.filters = ff({ comSubs: ["shop"] });
    else if (id === "com-office") s.filters = ff({ comSubs: ["office"] });
    else if (id === "com-multi") s.filters = ff({ comSubs: ["shop", "office", "warehouse"] });
    else if (id === "com-cleared-subs") s.filters = ff({ comSubs: [] });
    else if (id === "com-zero") Object.assign(s, { nodeKey: "hebbal", scope: { kind: "AREA_SET", areaKeys: TRIO.slice() }, committed: TRIO.slice(), filters: ff({ comSubs: ["warehouse"] }) });
    else if (id === "com-detail") {
      const first = EX.inAreas(COM_TRIO, s.filters)[0];
      if (first) s.detail = first.id;
    } else if (id === "com-mobile") Object.assign(s, { device: "mobile", filters: ff({ comSubs: ["shop"] }) });
    // family-switch pairs: identical context, identical retained subtype state on
    // BOTH sides — only `family` differs, which is the whole point of the pair.
    else if (id === "fam-res-all") s.filters = ff({ family: "Residential", ptype: "Any type" });
    else if (id === "fam-res-sub") s.filters = ff({ family: "Residential", ptype: "Villa" });
    else if (id === "fam-res-to-com") s.filters = ff({ family: "Commercial", ptype: "Villa", comSubs: ["shop", "office"] });
    else if (id === "fam-com-to-res") s.filters = ff({ family: "Residential", ptype: "Villa", comSubs: ["shop", "office"] });
    // contextual attributes — same context throughout, so only the attribute row moves
    else if (id === "attr-dwelling") s.filters = ff({ family: "Residential", ptype: "Apartment", beds: 2, carpetArea: 1000, maxPrice: 12000000 });
    else if (id === "attr-plot") s.filters = ff({ family: "Residential", ptype: "Plot", plotArea: 1200, maxPrice: 12000000, beds: 2, carpetArea: 1000 });
    else if (id === "attr-plot-to-dwelling") s.filters = ff({ family: "Residential", ptype: "Apartment", beds: 2, carpetArea: 1000, plotArea: 1200, maxPrice: 12000000 });
    else if (id === "attr-com-buy") s.filters = ff({ family: "Commercial", purpose: "Buy", comMaxPrice: 25000000, maxPrice: 12000000 });
    else if (id === "attr-com-rent") s.filters = ff({ family: "Commercial", purpose: "Rent", comMaxPrice: 150000, maxPrice: 35000 });
    else if (id === "attr-com-sub-budget") s.filters = ff({ family: "Commercial", purpose: "Rent", comSubs: ["office"], comMaxPrice: 150000 });
    else if (id === "attr-plot-mobile") Object.assign(s, { device: "mobile", filters: ff({ family: "Residential", ptype: "Plot", plotArea: 600 }) });
    else if (id === "attr-res-mobile") Object.assign(s, { device: "mobile", filters: ff({ family: "Residential", ptype: "Apartment", beds: 2, carpetArea: 900 }) });
    // ---- Commercial area & budget ------------------------------------------
    else if (id === "ca-all") s.filters = ff({ comArea: 1000, comMaxPrice: 25000000 });
    else if (id === "ca-shop") s.filters = ff({ comSubs: ["shop"], comArea: 1000 });
    else if (id === "ca-office") s.filters = ff({ comSubs: ["office"], comArea: 1000 });
    else if (id === "ca-building") s.filters = ff({ comSubs: ["building"], comArea: 5000 });
    else if (id === "ca-warehouse") s.filters = ff({ comSubs: ["warehouse"], comArea: 2500, purpose: "Rent" });
    else if (id === "ca-land") {
      // Commercial land genuinely sits on the city edge, not in the central trio, so
      // this one frame carries its own areas rather than showing an empty result set.
      // It is a demonstration frame, not one half of a comparison pair.
      Object.assign(s, { nodeKey: "hebbal", scope: { kind: "AREA_SET", areaKeys: ["hebbal", "krpuram", "budigere"] }, committed: ["hebbal", "krpuram", "budigere"] });
      s.filters = ff({ comSubs: ["land"], comArea: 1000 });
    }
    else if (id === "ca-multi") s.filters = ff({ comSubs: ["shop", "office", "warehouse"], comArea: 1000 });
    else if (id === "ca-lease") s.filters = ff({ purpose: "Rent", comMaxPrice: 100000, comArea: 1000 });
    else if (id === "ca-anon") Object.assign(s, { signedIn: false, filters: ff({ comSubs: ["office"] }) });
    else if (id === "ca-zero") s.filters = ff({ comSubs: ["building"], comArea: 2500, comMaxPrice: 10000000 });
    else if (id === "ca-one") s.filters = ff({ comSubs: ["shop"], comArea: 1000 });
    else if (id === "ca-mobile") Object.assign(s, { device: "mobile", filters: ff({ comSubs: ["shop"], comArea: 1000, comMaxPrice: 50000000 }) });  }
  // ---- Preserved: original behaviour, reached through the original components
  else if (id === "pre-hierarchy") Object.assign(s, { nodeKey: "north" });
  else if (id === "pre-schools") Object.assign(s, { journey: "schools" });
  else if (id === "pre-residential") Object.assign(s, { nodeKey: "hebbal", scope: { kind: "AREA_SET", areaKeys: TRIO.slice() }, committed: TRIO.slice(), filters: { ...EX.DEFAULT_FILTERS, ptype: "Apartment", beds: 2 } });
  else if (id === "pre-agri") Object.assign(s, { journey: "agri" });
  else if (id === "pre-listmap") Object.assign(s, { device: "mobile", presentation: "map", nodeKey: "hebbal", scope: { kind: "AREA_SET", areaKeys: TRIO.slice() }, committed: TRIO.slice() });
  else if (id === "pre-marker") Object.assign(s, { nodeKey: "hebbal", scope: { kind: "AREA_SET", areaKeys: ["hebbal"] }, committed: ["hebbal"] });
  else if (id === "pre-cleared") Object.assign(s, { nodeKey: "indiranagar", scope: { kind: "AREA_SET", areaKeys: COM_TRIO.slice() }, committed: COM_TRIO.slice(), filters: { ...EX.DEFAULT_FILTERS, comSubs: ["shop", "office"] } });
  if (id.indexOf("mf-") === 0) {
    const D = EX.DEFAULT_FILTERS;
    const bud = (f) => { const b = EX.budgetsFor(f).filter((x) => x.k); return b.length ? b[Math.min(2, b.length - 1)].k : 0; };
    const resEd = { ...D, ptype: "Apartment", beds: 2 };
    resEd.maxPrice = bud(resEd);
    const res = { device: "mobile", vp: id === "mf-12" ? "375" : "390", presentation: "map", nodeKey: "hebbal", scope: { kind: "AREA_SET", areaKeys: TRIO.slice() }, committed: TRIO.slice() };
    const com = { ...res, nodeKey: "indiranagar", scope: { kind: "AREA_SET", areaKeys: COM_TRIO.slice() }, committed: COM_TRIO.slice() };
    const comD = { ...D, family: "Commercial", comSubs: [] };
    Object.assign(s, id === "mf-09" || id === "mf-10" ? com : res);
    if (id === "mf-02") s.mfFocusDemo = true;
    else if (id === "mf-03") s.mfSheet = { draft: { ...D } };
    else if (id === "mf-04" || id === "mf-12") s.mfSheet = { draft: { ...resEd } };
    else if (id === "mf-05") s.filters = { ...resEd };
    else if (id === "mf-06") { s.filters = { ...resEd }; s.mfSheet = { draft: { ...resEd } }; }
    else if (id === "mf-07") { s.filters = { ...resEd }; s.mfSheet = { draft: { ...D, purpose: resEd.purpose, family: resEd.family } }; }
    else if (id === "mf-08") s.filters = { ...D, beds: 3, maxPrice: 5000000, ready: true };
    else if (id === "mf-09") { s.filters = { ...comD }; s.mfSheet = { draft: { ...comD, comSubs: ["shop"] } }; }
    else if (id === "mf-10") s.filters = { ...comD, comSubs: ["shop"] };
    else if (id === "mf-13") s.filters = { ...D, purpose: "Rent" };
    else if (id === "mf-14" || id === "mf-15" || id === "mf-16") {
      const sel = window.EXJ.schoolsIn("hebbal")[0];
      Object.assign(s, { journey: "schools", sch: { ...schBase(), nodeKey: sel.areaKey, areaKey: sel.areaKey, areaKeys: [sel.areaKey], selId: sel.id, radiusKm: 5 } });
      const schEd = { ...D, ptype: "Apartment", beds: 2 };
      if (id === "mf-15") s.mfSheet = { draft: schEd };
      if (id === "mf-16") s.filters = schEd;
    }
    else if (id === "mf-11") { s.filters = { ...resEd }; const first = EX.inAreas(TRIO, resEd)[0]; s.peek = first ? first.id : null; }
  }
  return s;
}
const HINTS = {
  "mf-01": () => "Map, no filters: Filters leads the top-left row — outlined, labelled, 44px, clear of zoom and the results sheet. Tap it.",
  "mf-02": () => "Keyboard focus on the entry. Its accessible name states the count: “Filters, none active”. Enter opens the sheet and focus moves to its heading.",
  "mf-03": () => "Modal bottom sheet over a dimmed, inert map. The same List groups, all open. Buy/Rent sits first because the List control bar is not on Map.",
  "mf-04": () => "Staged: chips change, the map behind does not. The footer states the gap — not applied yet — and the button carries the live count for the draft.",
  "mf-05": () => "Applied: the entry turns navy with a count, the results sheet says Filtered: … with Edit, and the markers, sheet and List all show the same result set.",
  "mf-06": () => "Reopening restores the applied selections exactly — the draft is seeded from the canonical filters every time. Nothing to apply until something changes.",
  "mf-07": () => "Clear all resets the DRAFT (Buy/Rent and family kept, like the List reset). The map still shows the filtered set until Show is tapped; Cancel keeps the old filters.",
  "mf-08": () => "Honest zero: 0 matching homes, the filters named, nothing widened. Edit filters reopens the sheet; Clear filters applies the reset at once.",
  "mf-09": () => "Commercial in the same sheet: family, Commercial type, contextual area and budget — no bedrooms. The draft adds Shops; the count updates before Apply.",
  "mf-10": () => "Commercial subtype applied: pins, sheet title and the Filtered line agree. The entry counts refinements only (the family is said by the result noun).",
  "mf-11": () => "A marker preview replaces the results sheet at the bottom; Filters stays top-left and usable. Opening Filters closes the preview first.",
  "mf-13": () => "Buy → Rent only: the badge shows no count (intent is not a refinement), but the heading says homes to rent · Residential, so the Rent context is never lost.",
  "mf-14": () => "Schools → Homes near a school, on Map: the same Filters entry. The heading states intent + family; school and radius stay owned by Schools (ring, pin, breadcrumb).",
  "mf-15": () => "Same sheet, property filters only — no school, radius, board or level controls. The count is homes within the SAME school radius for the draft.",
  "mf-16": () => "Applied in Schools: entry shows ②, Filtered: 2+ BHK · Apartment. Radius, selected school and Back to schools are unchanged.",
  "mf-12": () => "375 × 667: the sheet stops 88px below the top edge (app bar stays visible, dimmed), the body scrolls, the footer with Show stays pinned. Switch 390/412 in the bar above to compare.",
  "guided-areas": (st, v) => st.detail ? "Press Back to results — the scope, filters and camera come back unchanged."
    : v.scopeKind === "HIERARCHY" ? "Browse all is the full " + (st.scope.level === "direction" ? "Direction" : "Local destination") + " — Back restores the exact hierarchy screen, camera and cluster focus."
      : v.scopeKind === "CITY" ? "Browse all listings is city-wide. Back returns to the directional Areas root."
      : v.level === "city" ? "Three journeys, one shell. Tap the North card on the map — or its row in the panel."
        : v.level === "direction" ? "Continue into Hebbal · Yelahanka."
          : v.level === "local" ? (st.clusterFocus ? "Breadcrumb is unchanged — this was a camera move. Now tap the Hebbal marker." : "Tap the dashed Hebbal · Nagawara cluster: it zooms, it does not navigate.")
            : "Open a listing, then use Back to results.",
  "schools-first": (st) => st.sch.selId ? "Radius is a school-centred query. 3 / 5 / 10 km, distance-sorted."
    : st.sch.areaKey ? "Board and Level filters narrow the rows and the map pins together. View homes opens the radius state."
      : "Pick a direction — or search a school by name in the bar above and skip the funnel entirely.",
  "area-schools": (st) => st.sch.selId ? "Back to properties in Hebbal returns to the Areas journey with Hebbal still selected."
    : "You arrived from Hebbal: the area is kept, and Areas still holds the Hebbal property state.",
  agri: (st) => st.ag.clusterId ? "Agri filters and search are the parcel model's own — no residential counts here."
    : st.ag.corridorId ? "Distance bands are cumulative. Switch to Areas and the Areas journey is exactly where you left it."
      : "Farmland is searched outward by direction from an origin. Enter from an area and that area becomes the origin.",
  "multi-area": (st) => st.draft ? (st.draft.length < 3 ? "Add a nearby area — the total steps 42 → 73 → 95 and the map stays where it is. Nothing is searched until you press Show N listings." : "Three areas is the maximum; a fourth is refused with a reason. Press Show 95 listings to commit one AREA_SET.")
    : "Explore schools in Hebbal, search within it, or open Add nearby areas.",
  polygon: (st) => st.scope && st.scope.kind === "POLYGON" ? "Return to selected areas restores the three chips by name." : "Press Draw search area, then Use drawn area — the replacement is confirmed, never combined.",
  viewport: (st) => st.scope && st.scope.kind === "VIEWPORT" ? "Return to Hebbal + Nagawara + Jakkur when you are done." : "Pan or zoom the map: results stay. Then press Search this area.",
  "zero-results": () => "Nothing widened itself. The recovery offered matches the scope you are actually in.",
  alert: (st) => st.alertDraft ? "Check the scope and filters, pick a frequency, then Create alert. Tick the failure box to see the honest failure path." : st.view === "alerts" ? "Pause, resume, delete or open a saved alert." : "Press Create alert in the scope bar.",
  mobile: (st) => st.presentation === "map" ? "Tap the cluster to zoom — the breadcrumb does not change. List returns to the same state." : "Journeys, list and map all switch at 390 × 844.",

  // ---- Commercial — additive states -----------------------------------------
  "com-broad": (st) => st.filters.family !== "Commercial" ? "Residential is selected again — this is the untouched baseline. Press Commercial in the Type row to switch family."
    : "Type holds the property FAMILY — Residential or Commercial, nothing else. Choosing Commercial swapped the subtype row beneath it; the city, the areas, the breadcrumb and the map are exactly as they were.",
  "com-shop": () => "Shop selected inside the Commercial family. Card facts are built-up area and floor or hub; the pin carries the label, never a gated price.",
  "com-office": () => "Office selected. Shop and Office are told apart by label, not by colour — both read in greyscale.",
  "com-multi": () => "Three subtypes at once. Each chip in the scope bar removes only itself.",
  "com-cleared-subs": () => "Subtypes cleared, still in Commercial: All commercial is a family-LOCAL state. Clearing subtypes never leaves the family, the geography or the search behind.",
  "com-zero": () => "Zero results keeps the selection and claims no count. Widening never switches family on its own — that offer is explicit and labelled.",
  "com-detail": () => "Subtype-aware detail in the existing detail view. Broker-entered claims are boxed and labelled; absent fields are omitted, never stubbed.",
  "com-mobile": (st) => st.presentation === "map" ? "Commercial pins and popovers at 390 × 844 — the existing map behaviour, unchanged." : "Residential | Commercial stays at the top; the commercial subtype chips sit directly below it and wrap over two rows. Refinements are one tap away under More filters.",

  // ---- family switching — subtype state is scoped per family ------------------
  "fam-res-all": () => "Residential family, All residential. Beds and budget belong to this family and are offered only here.",
  "fam-res-sub": () => "Residential + Villas. Now press Commercial — this Villas selection is remembered, not carried across.",
  "fam-res-to-com": () => "Switched to Commercial with Shop + Office. The Villas selection still exists, parked in the Residential family. Same city, areas, breadcrumb, camera and Buy/Rent as the Residential frame.",
  "fam-com-to-res": () => "Switched back: Villas is restored exactly as it was, and Shop + Office are parked in Commercial. Neither family ever reinterprets the other's subtypes.",

  // ---- Commercial area & budget ----------------------------------------------
  "ca-all": () => "All Commercial with both attribute filters: AREA (SQ FT) because the selection spans subtypes, plus the Buy budget on the Commercial ladder. Illustrative thresholds, not market data.",
  "ca-shop": () => "One subtype selected, so the area label names what it measures: BUILT-UP AREA (SQ FT). The number in the field is unchanged — only the label follows the subtype.",
  "ca-office": () => "Office keeps BUILT-UP AREA. Same field, same value, subtype-appropriate label.",
  "ca-building": () => "Commercial Building keeps BUILT-UP AREA at a larger threshold.",
  "ca-warehouse": () => "Warehouse / Godown reads WAREHOUSE AREA, on Rent / Lease with monthly budget bands.",
  "ca-land": () => "Commercial Land reads PLOT SIZE. This frame uses Hebbal · KR Puram · Budigere Cross because commercial land really does sit on the city edge — showing an empty central result set would prove nothing. Note the imagery: a cleared development plot, never green farmland, which belongs to Agricultural.",
  "ca-multi": () => "Three subtypes selected, so the label falls back to the generic AREA (SQ FT): one number cannot mean built-up and plot size at once.",
  "ca-lease": () => "Rent / Lease: the budget switches to explicit monthly bands (≤ ₹50K / month …). Purchase bands are never reused here. Cards still show each listing's own For Rent or For Lease.",
  "ca-anon": () => "Anonymous Commercial: price band or sign-in gate, coarsened location, no phone or email. Signing in reveals the broker's figures — it does not verify them.",
  "ca-zero": () => "Zero results, Commercial recovery order: drop the subtype, widen the budget, widen the area, create an alert. Leaving Commercial is offered last and separately. No nearby areas, no invented counts.",
  "ca-one": () => "Singular copy: 1 commercial property for sale, not 1 commercial properties. Watch the count line and the card action.",
  "ca-mobile": () => "Commercial filters at 390 × 844: family selector, subtype row, then area and budget — Type and Commercial type stay open, Area and Budget sit behind More filters with a count. Every group label sits directly above its own chips, chips wrap, 44px tap targets, nothing covers the search or List/Map.",

  // ---- contextual attribute filters ------------------------------------------
  "attr-dwelling": () => "A dwelling offers Beds, Carpet area and Budget. Area is available to every Residential subtype — it is the unit that changes, not its presence.",
  "attr-plot": () => "Plots swap Beds for Plot size in the same place, and keep Budget. A plot has no bedrooms, so none are offered, claimed on a card, or shown in the detail. The 2 BHK and carpet-area selections are parked, not applied.",
  "attr-plot-to-dwelling": () => "Back on a dwelling: Beds returns at 2+ and Carpet area at 1,000+ sq ft, exactly as they were. Plot size is parked at 1,200+ sq ft. Carpet area and plot size are separate state and never stand in for each other.",  "attr-com-buy": () => "Commercial Buy budget — sale-price thresholds on the Commercial ladder. Illustrative values, not derived from verified listings. The Residential budget is untouched underneath.",
  "attr-com-rent": () => "Same control on Rent: monthly-rent thresholds, and the label reads Monthly rent with Any rent as the default.",
  "attr-com-sub-budget": () => "Budget is independent of subtype: add or remove Commercial subtype chips and it stays put. Reset commercial filters is the one action that clears both.",
  "attr-res-mobile": () => "Residential filters at 390 × 844: Type and Residential type stay open, the refinements sit behind More filters with a count. Open it — Bedrooms, Carpet area and Budget each keep their own label directly above their own chips.",
  "attr-plot-mobile": () => "Plot filters at 390 × 844 — Plot size and Budget as their own stacked groups, tap-only, with no bedrooms and no carpet area anywhere.",

  // ---- Preserved — non-regression -------------------------------------------
  "pre-default": () => "Baseline, Residential family: the Type row offers Residential | Commercial, and Residential type below it holds the original subtypes. Every count is the pre-Commercial count.",
  "pre-hierarchy": () => "Canonical hierarchy, unchanged: City → Direction → Local destination → Area, with the original breadcrumb and Back.",
  "pre-residential": () => "Existing residential filtering — Apartments, 2+ BHK. Beds and budget still apply, and Commercial stock is invisible to these counts.",
  "pre-schools": () => "The Schools journey, untouched. Agricultural and Schools stay separate journeys — neither is a property family.",
  "pre-agri": () => "The Agricultural journey, untouched — its own parcel model, its own counts. It is a journey, never a third property type.",
  "pre-listmap": () => "List / Map switching at 390 × 844, exactly as before. Switch to List and back.",
  "pre-marker": () => "Existing price pins, clusters and marker selection. Click a pin to open the original listing detail.",
  "pre-cleared": (st) => st.filters.family === "Commercial" ? "Now press Residential in the Type row." : "Back in the Residential family: same three areas, same camera, same breadcrumb, residential counts restored. This is the baseline experience."
};

function Experience() {
  const [st, setSt] = React.useState(() => {
    const q = new URLSearchParams(window.location.search).get("journey");
    return SCENARIOS.some((j) => j.id === q) ? scenarioState(q) : baseState();
  });
  const set = (patch) => setSt((s) => ({ ...s, ...patch }));
  const setHover = (k) => setSt((s) => (s.hover === k ? s : { ...s, hover: k }));
  const snapRef = React.useRef([]);
  const mfOpenRef = React.useRef(false), mfSkipPop = React.useRef(false);

  // ---- browser history: committed states only -------------------------------
  const snapOf = (s) => ({ journey: s.journey, city: s.city, nodeKey: s.nodeKey, scope: s.scope, committed: s.committed, filters: s.filters, sch: s.sch, ag: s.ag, clusterFocus: null, draft: null, focusChip: null });
  const pushCommit = (next) => {
    const snaps = snapRef.current;
    snaps.push(next);
    window.history.pushState({ i: snaps.length - 1 }, "");
  };
  // a listing detail is a child STATE of its results: it gets its own history entry, so
  // Browser Back closes it and lands on the same results Back to results returns to.
  const pushDetail = (id) => pushCommit({ ...snapOf(st), detail: id });
  // the entry state is itself a snapshot, so the first Back never falls through to a reset
  React.useEffect(() => {
    snapRef.current = [{ ...snapOf(st), detail: null }];
    window.history.replaceState({ i: 0 }, "");
    // eslint-disable-next-line
  }, []);
  React.useEffect(() => {
    const onPop = (e) => {
      // #2627: browser Back while the filter sheet is open = Cancel, nothing else
      if (mfSkipPop.current) { mfSkipPop.current = false; return; }
      if (mfOpenRef.current) { mfOpenRef.current = false; setSt((s) => ({ ...s, mfSheet: null })); return; }
      const i = e.state && e.state.i;
      const snap = i != null ? snapRef.current[i] : null;
      setSt((s) => ({ ...s, ...(snap || { journey: "areas", nodeKey: "blr", scope: null, committed: [], clusterFocus: null, detail: null, draft: null }) }));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const commit = (patch) => {
    setSt((s) => {
      const next = { ...s, peek: null, ...patch };
      pushCommit({ ...snapOf(next), detail: null });
      return next;
    });
  };
  const setSch = (patch) => setSt((s) => ({ ...s, sch: { ...s.sch, ...patch } }));
  // result-defining values that REPLACE the current committed state instead of stacking a
  // history entry per chip press (school radius, agricultural distance band)
  const replaceTop = (next) => {
    const snaps = snapRef.current;
    if (snaps.length) snaps[snaps.length - 1] = { ...snapOf(next), detail: null };
    window.history.replaceState({ i: Math.max(0, snaps.length - 1) }, "");
  };
  const replaceSch = (patch, extra) => setSt((s) => {
    const next = { ...s, ...(extra || {}), sch: { ...s.sch, ...patch } };
    replaceTop(next);
    return next;
  });
  const replaceAg = (patch, extra) => setSt((s) => {
    const next = { ...s, ...(extra || {}), ag: { ...s.ag, ...patch } };
    replaceTop(next);
    return next;
  });
  const commitSch = (patch, extra) => setSt((s) => {
    const next = { ...s, ...(extra || {}), journey: "schools", sch: { ...s.sch, ...patch } };
    pushCommit({ journey: "schools", city: next.city, nodeKey: next.nodeKey, scope: next.scope, committed: next.committed, filters: next.filters, sch: next.sch, ag: next.ag, clusterFocus: null, detail: null, draft: null });
    return next;
  });
  const setAg = (patch) => setSt((s) => ({ ...s, ag: { ...s.ag, ...patch } }));
  const commitAg = (patch, extra) => setSt((s) => {
    const next = { ...s, ...(extra || {}), journey: "agri", ag: { ...s.ag, ...patch } };
    pushCommit({ journey: "agri", city: next.city, nodeKey: next.nodeKey, scope: next.scope, committed: next.committed, filters: next.filters, sch: next.sch, ag: next.ag, clusterFocus: null, detail: null, draft: null });
    return next;
  });

  const timers = React.useRef([]);
  React.useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (ms, fn) => timers.current.push(setTimeout(fn, ms));

  // ---- derived results (areas journey) --------------------------------------
  const results = React.useMemo(() => {
    const sc = st.scope;
    if (!sc || st.journey !== "areas") return [];
    let list;
    if (sc.kind === "AREA_SET" || sc.kind === "HIERARCHY") list = EX.inAreas(sc.areaKeys, st.filters);
    else if (sc.kind === "CITY") list = EX.listings.filter((l) => EX.passes(l, st.filters));
    else if (sc.kind === "POLYGON") list = EX.inPoly(sc.poly, st.filters);
    else if (sc.kind === "VIEWPORT") list = EX.inBounds(sc.bounds, st.filters);
    else return [];
    return st.query ? EX.searchWithin(list, st.query) : list;
  }, [st.scope, st.filters, st.query, st.journey]);

  // ---- actions -------------------------------------------------------------
  const mfClose = (patch) => {
    set({ mfSheet: null, ...patch });
    if (mfOpenRef.current) { mfOpenRef.current = false; mfSkipPop.current = true; window.history.back(); }
  };
  const act = {
    hover: (k) => setHover(k),
    setCity: (c) => commit({ city: c, journey: "areas", nodeKey: "blr", scope: null, committed: [], sch: schBase(), ag: agBase(), note: null }),
    setFilters: (patch) => set({ filters: { ...st.filters, ...patch }, shown: 8, phase: "idle" }),
    // Switching family swaps which subtype row is offered and which catalogue is
    // searched. It touches nothing else — not the journey, city, search, hierarchy,
    // breadcrumb, selected areas, scope mode, camera, List/Map or Buy/Rent — and it
    // leaves BOTH families' subtype selections in place, so each is restored on return.
    setFamily: (fam) => set({ filters: { ...st.filters, family: fam }, shown: 8, phase: "idle" }),
    resetFilters: () => set({ filters: { ...EX.DEFAULT_FILTERS, purpose: st.filters.purpose, family: st.filters.family }, shown: 8, phase: "idle" }),

    // ---- journey switching: each journey keeps its own state ----------------
    setJourney: (j) => {
      if (j === st.journey) return;
      const patch = { journey: j, detail: null, confirm: null, alertDraft: null, view: null, note: null };
      if (j === "schools") {
        const carry = st.journey === "areas" && st.scope && st.scope.kind === "AREA_SET" && st.committed.length ? st.committed.slice() : null;
        if (carry) patch.sch = { ...schBase(), nodeKey: carry[0], areaKey: carry.length === 1 ? carry[0] : null, areaKeys: carry, returnTo: carry };
      } else if (j === "agri") {
        const carry = st.journey === "areas" && st.committed.length === 1 ? st.committed[0] : st.journey === "schools" ? st.sch.areaKey : null;
        if (carry && !st.ag.originKey) patch.ag = { ...agBase(), originKey: carry };
      }
      commit(patch);
    },

    // ---- AREAS journey ------------------------------------------------------
    pickNode: (child) => {
      if (child.kind === "area") return act.pickArea(child.key);
      commit({ nodeKey: child.key, clusterFocus: null, preview: null, note: null });
    },
    pickArea: (key) => commit({ journey: "areas", nodeKey: key, scope: { kind: "AREA_SET", areaKeys: [key] }, committed: [key], clusterFocus: null, draft: null, focusChip: null, detail: null, preview: null, dirty: false, shown: 8, note: null, query: "" }),
    pickAreas: (keys) => commit({ journey: "areas", nodeKey: keys[keys.length - 1], scope: { kind: "AREA_SET", areaKeys: keys.slice() }, committed: keys.slice(), clusterFocus: null, draft: null, focusChip: null, detail: null, dirty: false, shown: 8, note: null, query: "" }),
    browseAll: () => commit({ journey: "areas", nodeKey: "blr", scope: { kind: "CITY" }, committed: [], clusterFocus: null, draft: null, focusChip: null, detail: null, preview: null, dirty: false, shown: 8, query: "", note: null }),
    // Browse-all at an intermediate hierarchy level (Direction / Local destination): a
    // dedicated HIERARCHY scope over every area under the CURRENT node — the node itself
    // (not a leaf area) stays nodeKey, so the breadcrumb, Back and camera are all exact.
    // Regardless of the map's cluster/viewport focus, the scope is always the full node.
    browseHierarchy: () => {
      const lvl = EX.levelOf(st.nodeKey);
      const keys = (lvl === "direction" ? EX.areasOfDirection(st.nodeKey) : EX.areasOfLocal(st.nodeKey)).map((a) => a.key);
      commit({ journey: "areas", scope: { kind: "HIERARCHY", level: lvl, areaKeys: keys }, committed: keys, focusChip: null, draft: null, detail: null, dirty: false, shown: 8, query: "", note: null });
    },
    pickCluster: (c) => set({ clusterFocus: { key: c.key, members: c.members } }),
    showAllAreas: () => set({ clusterFocus: null }),
    setQuery: (q) => set({ query: q, shown: 8 }),
    onCrumb: (key) => {
      if (st.journey === "schools") return act.schoolsCrumb(key);
      if (st.journey === "agri") return act.agriCrumb(key);
      if (key === st.nodeKey && !st.scope) return;
      const lvl = EX.levelOf(key);
      commit(lvl === "area" ? { nodeKey: key, scope: { kind: "AREA_SET", areaKeys: [key] }, committed: [key], clusterFocus: null, detail: null, draft: null }
        : { nodeKey: key, scope: null, committed: [], clusterFocus: null, detail: null, draft: null, focusChip: null, dirty: false });
    },
    // journey-aware Back (the shell and the mobile header both call this)
    backHierarchy: () => {
      if (st.detail) return act.backToResults();
      if (st.journey === "schools") return act.schoolsBack();
      if (st.journey === "agri") return act.agriBack();
      // HIERARCHY results never moved nodeKey — Back just drops the scope, so the exact
      // Direction/Local screen (rows, camera, cluster focus) reappears unchanged.
      if (st.scope && st.scope.kind === "HIERARCHY") return commit({ scope: null, committed: [], focusChip: null, draft: null, detail: null, dirty: false, note: null });
      if (st.scope && st.scope.kind === "CITY") return commit({ scope: null, committed: [], nodeKey: "blr", detail: null });
      const p = EX.parentOf(st.nodeKey);
      if (!p) return;
      commit({ nodeKey: p, scope: null, committed: [], clusterFocus: null, focusChip: null, draft: null, dirty: false, note: null });
    },
    openDraft: () => set({ draft: (st.committed.length ? st.committed : [st.nodeKey]).slice(), draftNote: null }),
    // zero-result recovery for an AREA / AREA_SET: the nearby area enters the DRAFT,
    // so the selected-area scope only changes when the shopper commits it.
    addNearbyDraft: (key) => set({ draft: (st.committed.length ? st.committed : [st.nodeKey]).slice().concat(key).slice(0, 3), draftNote: null }),
    addDraft: (key) => {
      const d = st.draft || [];
      if (d.indexOf(key) !== -1) return set({ draftNote: EX.byKey[key].name + " is already selected." });
      if (d.length >= 3) return set({ draftNote: "Three areas is the maximum — one selected area plus two nearby. Remove one to add " + EX.byKey[key].name + "." });
      set({ draft: d.concat(key), draftNote: null });
    },
    removeDraft: (key) => set({ draft: st.draft.filter((k) => k !== key), draftNote: null }),
    cancelDraft: () => set({ draft: null, draftNote: null }),
    commitDraft: () => {
      const keys = st.draft.slice();
      commit({ scope: { kind: "AREA_SET", areaKeys: keys }, committed: keys, draft: null, draftNote: null, focusChip: null, phase: "loading", shown: 8, dirty: false });
      later(360, () => set({ phase: "idle" }));
    },
    removeCommitted: (key) => {
      if (st.committed.length <= 1) return act.clearScope();
      const keys = st.committed.filter((k) => k !== key);
      commit({ scope: { kind: "AREA_SET", areaKeys: keys }, committed: keys, focusChip: null });
    },
    clearScope: () => set({ confirm: { kind: "clear", title: "Clear your selected areas?", body: "You will stay on " + (EX.ancestry(st.nodeKey).slice(-2, -1).map((c) => c.label).join("") || "Bangalore") + " with no result scope. Your filters are kept.", primary: "Clear selected areas", secondary: "Keep them" } }),
    focusChip: (k) => set({ focusChip: st.focusChip === k ? null : k }),
    fitAll: () => set({ focusChip: null }),
    drawArea: () => {
      const c = st.committed.length ? EX.centerOf(st.committed.map((k) => EX.byKey[k])) : { lat: EX.city.lat, lon: EX.city.lon };
      const r = st.committed.length ? 0.028 : 0.075;
      const poly = [[c.lat + r, c.lon - r * 0.5], [c.lat + r * 0.5, c.lon + r], [c.lat - r * 0.6, c.lon + r * 0.9], [c.lat - r, c.lon - r * 0.3], [c.lat - r * 0.2, c.lon - r * 1.1]];
      set({ polyDraft: poly, note: null });
    },
    usePoly: () => set({ confirm: { kind: "poly", title: "Replace your current search area with this drawn area?", body: (st.committed.length ? st.committed.map((k) => EX.byKey[k].name).join(", ") + " will be removed from the search. " : "The city-wide list will be replaced. ") + "Your filters stay as they are, and you can return.", primary: "Use drawn area", secondary: "Cancel" } }),
    searchThisArea: () => set({ confirm: { kind: "viewport", title: "Search the visible map area instead?", body: (st.scope && st.scope.kind === "AREA_SET" ? st.committed.map((k) => EX.byKey[k].name).join(", ") + " will be replaced by whatever is on screen. " : "") + "Filters are kept, and the return target stays available.", primary: "Search this area", secondary: "Keep current scope" } }),
    // a scope of one KIND becoming a scope of another KIND is always confirmed
    replaceWithAreas: (keys) => set({ confirm: { kind: "toareas", keys: keys.slice(), title: "Replace this search with selected areas?", body: (st.scope && st.scope.kind === "POLYGON" ? "Your drawn area" : "The visible-map search") + " will be removed and " + keys.map((k) => EX.byKey[k].name).join(", ") + " will become the search scope. Your filters stay as they are.", primary: "Use selected areas", secondary: "Keep current scope" } }),
    // widening a visible-map search stays a visible-map search
    expandVisible: () => {
      const b = st.scope.bounds;
      const dy = (b.north - b.south) * 0.4, dx = (b.east - b.west) * 0.4;
      commit({ scope: { kind: "VIEWPORT", bounds: { south: b.south - dy, north: b.north + dy, west: b.west - dx, east: b.east + dx } }, phase: "loading", shown: 8, dirty: false, note: "Visible map area widened. This is still a visible-map search." });
      later(420, () => set({ phase: "idle" }));
    },
    acceptConfirm: () => {
      const c = st.confirm;
      if (!c) return;
      if (c.kind === "poly") {
        commit({ scope: { kind: "POLYGON", poly: st.polyDraft }, prevScope: st.scope, polyDraft: null, confirm: null, phase: "loading", focusChip: null, shown: 8, dirty: false });
        later(420, () => set({ phase: "idle" }));
      } else if (c.kind === "viewport") {
        commit({ scope: { kind: "VIEWPORT", bounds: st.dirtyBounds }, prevScope: st.scope, confirm: null, phase: "loading", focusChip: null, shown: 8, dirty: false });
        later(520, () => set({ phase: "idle" }));
      } else if (c.kind === "clear") {
        const p = EX.parentOf(st.nodeKey) || "blr";
        commit({ nodeKey: p, scope: null, committed: [], confirm: null, focusChip: null, dirty: false });
      } else if (c.kind === "toareas") {
        commit({ scope: { kind: "AREA_SET", areaKeys: c.keys }, committed: c.keys, prevScope: st.scope, polyDraft: null, confirm: null, phase: "loading", focusChip: null, shown: 8, dirty: false });
        later(380, () => set({ phase: "idle" }));
      } else set({ confirm: null });
    },
    cancelConfirm: () => set({ confirm: null, polyDraft: null }),
    returnToAreas: () => {
      const prev = st.prevScope || { kind: "AREA_SET", areaKeys: st.committed.length ? st.committed : ["hebbal"] };
      commit({ scope: prev, prevScope: st.scope, committed: prev.kind === "AREA_SET" ? prev.areaKeys : st.committed, polyDraft: null, dirty: false, phase: "loading", shown: 8 });
      later(360, () => set({ phase: "idle" }));
    },
    onCameraMove: (b) => { if (view.listingCapable) set({ dirty: true, dirtyBounds: b }); },
    // mobile map mode gets a listing PREVIEW sheet; anywhere else the detail opens directly
    openListing: (id) => {
      if (st.device === "mobile" && st.presentation === "map") return set({ peek: id });
      pushDetail(id);
      set({ detail: id, peek: null });
    },
    openPeekDetail: () => { pushDetail(st.peek); set({ detail: st.peek, presentation: "list" }); },
    closePeek: () => set({ peek: null }),
    backToResults: () => set(st.peek ? { detail: null, presentation: "map" } : { detail: null }),
    applyRelax: (patch) => set({ filters: { ...st.filters, ...patch }, shown: 8, note: "You changed one filter. The scope is untouched." }),
    simulateError: () => set({ phase: "error" }),
    retry: () => { set({ phase: "loading" }); later(500, () => set({ phase: "idle" })); },

    // ---- SCHOOLS journey ----------------------------------------------------
    schoolsPickNode: (child) => (child.kind === "area" ? act.pickSchoolArea(child.key) : commitSch({ nodeKey: child.key, clusterFocus: null })),
    schoolsPickCluster: (c) => setSch({ clusterFocus: { key: c.key, members: c.members } }),
    schoolsShowAll: () => setSch({ clusterFocus: null }),
    pickSchoolArea: (key) => commitSch({ nodeKey: key, areaKey: key, areaKeys: [key], selId: null, query: "", boards: [], levels: [], clusterFocus: null, returnTo: st.sch.returnTo && st.sch.returnTo.length === 1 && st.sch.returnTo[0] === key ? st.sch.returnTo : null }),
    selectSchool: (id) => {
      const s = window.EXJ.schoolById(id);
      if (!s) return;
      commitSch({ nodeKey: s.areaKey, selId: id, radiusKm: 5 }, { shown: 8 });
    },
    jumpSchool: (id) => {
      const s = window.EXJ.schoolById(id);
      if (!s) return;
      commitSch({ nodeKey: s.areaKey, areaKey: s.areaKey, areaKeys: [s.areaKey], selId: id, radiusKm: 5, query: "", boards: [], levels: [], returnTo: null }, { journey: "schools", shown: 8 });
    },
    changeSchool: () => commitSch({ selId: null }),
    setRadius: (km) => replaceSch({ radiusKm: km }, { shown: 8 }),
    setSchoolFacet: (k, v) => setSch({ [k]: v }),
    clearSchoolFilters: () => setSch({ query: "", boards: [], levels: [] }),
    schoolsHover: (id) => setSt((s) => (s.sch.hover === id ? s : { ...s, sch: { ...s.sch, hover: id } })),
    schoolsBack: () => {
      const s = st.sch;
      if (s.selId) return commitSch({ selId: null });
      if (s.areaKeys && s.areaKeys.length > 1) return act.backToAreaProperties();
      if (s.areaKey) return commitSch({ areaKey: null, areaKeys: null, nodeKey: EX.parentOf(s.areaKey) || "blr", clusterFocus: null });
      const p = EX.parentOf(s.nodeKey);
      if (p) return commitSch({ nodeKey: p, clusterFocus: null });
    },
    schoolsCrumb: (key) => {
      if (key === "sch-root") return commitSch({ nodeKey: "blr", areaKey: null, areaKeys: null, selId: null, clusterFocus: null, returnTo: null });
      if (key === "blr") return commit({ journey: "areas" });
      if (key === "sch-selected") return commitSch({ selId: null });
      if (EX.byKey[key]) return commitSch({ nodeKey: key, areaKey: key, areaKeys: [key], selId: null });
      commitSch({ nodeKey: key, areaKey: null, areaKeys: null, selId: null, clusterFocus: null });
    },
    // Area → Schools: every selected area is carried, and the way back is explicit
    openAreaSchools: () => {
      const keys = st.committed.slice();
      commitSch({ nodeKey: keys[0], areaKey: keys.length === 1 ? keys[0] : null, areaKeys: keys, selId: null, query: "", boards: [], levels: [], returnTo: keys }, { journey: "schools" });
    },
    backToAreaProperties: () => {
      const keys = (st.sch.returnTo && st.sch.returnTo.length ? st.sch.returnTo : st.sch.areaKeys) || (st.sch.areaKey ? [st.sch.areaKey] : []);
      if (!keys.length) return commit({ journey: "areas" });
      const same = st.scope && st.scope.kind === "AREA_SET" && st.committed.length === keys.length && keys.every((k) => st.committed.indexOf(k) !== -1);
      if (same) return commit({ journey: "areas", detail: null });
      act.pickAreas(keys);
    },

    // ---- AGRI journey -------------------------------------------------------
    setAgriOrigin: (key) => commitAg({ originKey: key, corridorId: null, clusterId: null, maxKm: AGRI_DEFAULT_KM(), query: "", active: null }, { journey: "agri" }),
    agriPickCorridor: (id) => commitAg({ corridorId: id, clusterId: null, maxKm: AGRI_DEFAULT_KM(), filters: { ...window.DP_AGRI_DEFAULTS }, query: "", active: null }),
    agriPickTown: (id) => commitAg({ clusterId: id, filters: { ...window.DP_AGRI_DEFAULTS }, query: "", active: null }),
    setAgriMaxKm: (km) => replaceAg({ maxKm: km }, { shown: 8 }),
    setAgriFilters: (f) => setAg({ filters: f }),
    setAgriQuery: (q) => setAg({ query: q }),
    agriActivate: (id) => setAg({ active: id }),
    agriHover: (id, src) => setSt((s) => (s.ag.hover === id ? s : { ...s, ag: { ...s.ag, hover: id, hoverSrc: src || "panel" } })),
    agriBack: () => {
      if (st.ag.clusterId) return commitAg({ clusterId: null, query: "", active: null });
      if (st.ag.corridorId) return commitAg({ corridorId: null, query: "" });
    },
    agriCrumb: (key) => {
      if (key === "blr") return commit({ journey: "areas" });
      if (key === "agri-root") return commitAg({ corridorId: null, clusterId: null, query: "" });
      if (window.EXJ.corridorOf(key)) return commitAg({ corridorId: key, clusterId: null, query: "" });
    },

    // ---- shared -------------------------------------------------------------
    openAlertForm: () => set({ alertDraft: { scopeLabel: view.scopeLabel || view.heading.title, freq: "Daily", unsupported: st.filters.ready, failNext: false }, alertPhase: null, view: null }),
    setAlertField: (patch) => set({ alertDraft: { ...st.alertDraft, ...patch } }),
    closeAlertForm: () => set({ alertDraft: null, alertPhase: null }),
    submitAlert: () => {
      set({ alertPhase: "saving" });
      later(900, () => setSt((s) => {
        if (s.alertDraft && s.alertDraft.failNext) return { ...s, alertPhase: "error" };
        const a = { id: "al" + (s.alerts.length + 1), scopeLabel: s.alertDraft.scopeLabel, kind: s.scope ? s.scope.kind.replace("_", " ").toLowerCase() : "area set", freq: s.alertDraft.freq, filters: EX.filterLabels(s.filters).join(" · "), status: "Active", checked: "checked just now", newMatches: 0, snapshot: { journey: s.journey, scope: s.scope, committed: s.committed, filters: s.filters, nodeKey: s.nodeKey } };
        return { ...s, alerts: [a].concat(s.alerts), alertDraft: null, alertPhase: null, view: "alerts", note: "Alert saved. " + a.scopeLabel + " · " + a.freq };
      }));
    },
    toggleAlert: (id) => set({ alerts: st.alerts.map((a) => (a.id === id ? { ...a, status: a.status === "Active" ? "Paused" : "Active" } : a)) }),
    deleteAlert: (id) => (st.deleteAsk === id ? set({ alerts: st.alerts.filter((a) => a.id !== id), deleteAsk: null }) : set({ deleteAsk: id })),
    openAlert: (a) => commit({ ...a.snapshot, view: null, detail: null, draft: null, note: a.newMatches ? a.newMatches + " new matches since this alert was last checked." : "Saved search restored exactly — scope and filters come from the alert, not the camera.", shown: 8 }),
    closeAlerts: () => set({ view: null, note: null }),
    showMore: () => set({ shown: st.shown + 8 }),
    toggleSave: (id) => set({ saved: st.saved.indexOf(id) !== -1 ? st.saved.filter((x) => x !== id) : st.saved.concat(id) }),
    setPresentation: (p) => set({ presentation: p, mfSheet: null }),
    // ---- #2627 mobile Map filters: staged copy of the canonical filters -------
    openMapFilters: () => {
      if (!mfOpenRef.current) { mfOpenRef.current = true; window.history.pushState({ i: Math.max(0, snapRef.current.length - 1), mf: true }, ""); }
      set({ mfSheet: { draft: { ...st.filters } }, peek: null, mfFocusDemo: false });
    },
    mfEdit: (p) => setSt((s) => (s.mfSheet ? { ...s, mfSheet: { ...s.mfSheet, draft: { ...s.mfSheet.draft, ...p } } } : s)),
    mfClear: () => setSt((s) => (s.mfSheet ? { ...s, mfSheet: { ...s.mfSheet, draft: window.MFX.cleared(s.mfSheet.draft) } } : s)),
    mfCancel: () => mfClose({}),
    mfApply: () => {
      const f = st.mfSheet.draft;
      const n = window.MFX.count(st, f);
      mfClose({ filters: { ...f }, shown: 8, phase: "idle", peek: null, mfAnnounce: "Filters applied. " + n + " " + EX.nounsOf(f).count(n) + " on the map." });
    },
    mapClearFilters: () => {
      const f = window.MFX.cleared(st.filters);
      set({ filters: f, shown: 8, phase: "idle", mfAnnounce: "Filters cleared. " + window.MFX.count(st, f) + " listings on the map." });
    },
    toggleSignedIn: () => set({ signedIn: !st.signedIn }),
    openAlerts: () => set({ view: "alerts" })
  };

  const view = React.useMemo(() => {
    const v = st.journey === "schools" ? window.ExpSchoolsView(st, act) : st.journey === "agri" ? window.ExpAgriView(st, act) : buildView(st, results, act);
    v.presentation = st.presentation;
    if (v.hover === undefined) v.hover = st.journey === "schools" ? st.sch.hover : st.journey === "agri" ? st.ag.hover : st.hover;
    if (v.journeyRoot === undefined) v.journeyRoot = st.journey === "areas" && st.nodeKey === "blr" && !st.scope && !st.draft;
    if (!v.notes) v.notes = [];
    return v;
    // eslint-disable-next-line
  }, [st, results]);

  const isMobile = st.device === "mobile";
  const hint = (HINTS[st.scenario] || (() => ""))(st, view);

  return (
    <div style={{ minHeight: "100vh", background: "var(--canvas-200)", display: "flex", flexDirection: "column" }}>
      <ExpReviewerBar st={st} setSt={setSt} hint={hint} onScenario={(id) => { snapRef.current = []; mfOpenRef.current = false; setSt((prev) => { const n = scenarioState(id); if (n.device === "mobile" && prev.device === "mobile" && id !== "mf-12" && prev.vp) n.vp = prev.vp; return n; }); }} />
      <div style={{ flex: 1, display: "grid", placeItems: "start center", padding: isMobile ? "24px 16px 40px" : "18px 16px 32px" }}>
        <ExpErrorBoundary>
          <ExpShell st={st} view={view} act={act} isMobile={isMobile} />
        </ExpErrorBoundary>
      </div>
    </div>
  );
}

// ---- BEFORE / AFTER comparison (review chrome, not product UI) --------------
// The two scenarios below share ONE scope: the same city, the same three committed
// areas, the same camera and the same breadcrumb. Switching between them therefore
// shows the additive delta and nothing else.
const COMPARE_ROWS = [
  ["Canonical hierarchy", "City → Direction → Local destination → Area", "Identical — family is a filter, not a level"],
  ["Breadcrumb and Back", "Original breadcrumb, original history", "Identical"],
  ["Search input", "Interactive, opens area suggestions", "Identical — same component, same behaviour"],
  ["Buy / Rent", "Buy shows sale stock, Rent shows rental stock", "Identical — Lease listings surface under Rent"],
  ["Top-level TYPE row", "Residential subtypes sat here", "Holds the FAMILY only: Residential | Commercial"],
  ["Subtype row", "Residential type — All residential, Apartments, Villas, Plots", "Commercial type — All commercial + the five subtypes"],
  ["Subtype memory", "One selection", "One per family, retained independently"],
  ["Attribute row", "Beds + Carpet area + Budget · Plot size + Budget on Plots", "Budget only — bedrooms never apply"],
  ["Budget state", "Residential ladder (≤ ₹50 L … ₹1.2 Cr)", "Own Commercial ladder, own field, own memory"],
  ["Result scope", "Selected areas, chips removable", "Identical — subtype chips join the same row"],
  ["Result cards", "Existing listing card", "Same card, three content slots swapped"],
  ["Map markers", "Price pin, cluster disc, selection", "Same pin carrying the subtype label"],
  ["Clustering and camera", "Proximity clusters, fly-to-bounds", "Identical — untouched"],
  ["List / Map switching", "Available at 390 × 844", "Identical"],
  ["Schools / Agricultural", "Separate Discover journeys", "Identical — neither is a property family"],
  ["Existing counts", "807 listings city-wide", "807 — Commercial stock is invisible to the Residential family"]
];
function ExpCompare({ st, setSt, onScenario }) {
  // `open` lives in shared state, not local: ExpShell's fit must re-run when this
  // expands, and a component-local toggle would not re-render it.
  const open = !!st.compareOpen;
  const setOpen = (v) => setSt((s) => ({ ...s, compareOpen: v }));
  const before = st.scenario === "pre-cleared", after = st.scenario === "com-broad";
  return (
    <div style={{ background: "var(--navy-800)", borderTop: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 16px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "9.5px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)" }}>Before / after</span>
        <button onClick={() => onScenario("pre-cleared")} style={{ padding: "4px 11px", borderRadius: "var(--radius-full)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "11.5px", fontWeight: 700, border: "1px solid " + (before ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.22)"), background: before ? "#fff" : "transparent", color: before ? "var(--navy-900)" : "rgba(255,255,255,0.85)" }}>Residential family</button>
        <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.4)" }}>↔</span>
        <button onClick={() => onScenario("com-broad")} style={{ padding: "4px 11px", borderRadius: "var(--radius-full)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "11.5px", fontWeight: 700, border: "1px solid " + (after ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.22)"), background: after ? "#fff" : "transparent", color: after ? "var(--navy-900)" : "rgba(255,255,255,0.85)" }}>Commercial family</button>
        <span style={{ fontSize: "11.5px", color: "rgba(255,255,255,0.62)", minWidth: "200px", flex: 1 }}>Same city, same three areas, same camera, same breadcrumb, same Buy/Rent — only the property family, its subtype row and the result membership change.</span>
        <button onClick={() => setOpen(!open)} style={{ padding: "4px 10px", borderRadius: "var(--radius-full)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "11.5px", fontWeight: 600, border: "1px solid rgba(255,255,255,0.22)", background: "transparent", color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap" }}>{open ? "Hide the element-by-element check" : "Element-by-element check"}</button>
      </div>
      {open && (
        <div data-review-expand="true" style={{ padding: "0 16px 12px" }}>
          {/* Bounded and scrollable: this table is sticky review chrome, and an
              unbounded one steals the whole viewport from the shell it frames. */}
          <div style={{ maxHeight: "38vh", overflowY: "auto", borderRadius: "var(--radius-md)", border: "1px solid rgba(255,255,255,0.12)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(150px,1fr) minmax(180px,1.3fr) minmax(180px,1.4fr)", gap: "1px", background: "rgba(255,255,255,0.12)" }}>
            {["Element", "Residential family", "Commercial family"].map((c) => (
              <div key={c} style={{ background: "var(--navy-900)", padding: "7px 11px", fontSize: "9.5px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "rgba(255,255,255,0.55)" }}>{c}</div>
            ))}
            {COMPARE_ROWS.map((r) => r.map((cell, i) => {
              const added = i === 2 && /Holds the FAMILY|Commercial type|per family|bedrooms never|own field|Same card|Same pin|slots swapped|subtype label/.test(cell);
              return (
                <div key={r[0] + i} style={{ background: "var(--navy-800)", padding: "7px 11px", fontSize: "11px", lineHeight: 1.4, color: i === 0 ? "rgba(255,255,255,0.92)" : added ? "var(--gold-100)" : "rgba(255,255,255,0.66)", fontWeight: i === 0 ? 700 : 400 }}>{cell}</div>
              );
            }))}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- reviewer strip (not product UI) ---------------------------------------
function ExpReviewerBar({ st, setSt, onScenario, hint }) {
  // The scenario set has grown to five groups; showing every pill at once made the
  // chrome taller than the shell it frames. One group at a time keeps it to two rows.
  const groupOf = (id) => { const s = SCENARIOS.filter((x) => x.id === id)[0]; return s ? (s.group || null) : null; };
  const [grp, setGrp] = React.useState(() => groupOf(st.scenario));
  React.useEffect(() => { setGrp(groupOf(st.scenario)); }, [st.scenario]);
  const pill = (on) => ({ padding: "4px 10px", borderRadius: "var(--radius-full)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "11.5px", fontWeight: 600, border: "1px solid " + (on ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.2)"), background: on ? "#fff" : "transparent", color: on ? "var(--navy-900)" : "rgba(255,255,255,0.8)", whiteSpace: "nowrap" });
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 900, background: "var(--navy-900)", color: "rgba(255,255,255,0.82)" }} data-review-chrome="true">
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 16px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>Review</span>
        {SCENARIO_GROUPS.map((g) => {
          const on = (g.key || null) === grp;
          return (
            <button key={g.label} onClick={() => setGrp(g.key || null)}
              style={{ padding: "4px 10px", borderRadius: "var(--radius-full)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "11px", fontWeight: 700, border: "1px solid " + (on ? "rgba(255,255,255,0.55)" : "transparent"), background: on ? "rgba(255,255,255,0.14)" : "transparent", color: on ? "#fff" : "rgba(255,255,255,0.55)", whiteSpace: "nowrap" }}>{g.label}</button>
          );
        })}
        <span style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
          <button onClick={() => setSt((s) => ({ ...s, device: "desktop", presentation: "list", mfSheet: null }))} style={{ padding: "4px 10px", borderRadius: "var(--radius-full)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "11.5px", fontWeight: 600, border: "1px solid rgba(255,255,255,0.2)", background: st.device === "desktop" ? "rgba(255,255,255,0.16)" : "transparent", color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap" }}>1366 × 768</button>
          {/* Mobile viewports: switching size keeps List/Map and every other state, so the
              same screen can be compared at 375 × 667, 390 × 844 and 412 × 915. */}
          {Object.keys(EXP_MOBILE_VP).map((k) => {
            const on = st.device === "mobile" && (st.vp || "390") === k;
            return <button key={k} onClick={() => setSt((s) => ({ ...s, device: "mobile", vp: k, presentation: s.device === "mobile" ? s.presentation : "list" }))} style={{ padding: "4px 10px", borderRadius: "var(--radius-full)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "11.5px", fontWeight: 600, border: "1px solid rgba(255,255,255,0.2)", background: on ? "rgba(255,255,255,0.16)" : "transparent", color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap" }}>{EXP_MOBILE_VP[k].join(" × ")}</button>;
          })}
          {/* Commercial listings are price-gated for anonymous buyers, so the review needs
              both sides. This is review chrome, never product UI — the product decides
              anonymity from the session, not from a control in the filter toolbar. */}
          {[["Anon", false], ["Signed in", true]].map(([lbl, v]) => (
            <button key={lbl} onClick={() => setSt((s) => ({ ...s, signedIn: v }))} style={{ padding: "4px 10px", borderRadius: "var(--radius-full)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "11.5px", fontWeight: 600, border: "1px solid rgba(255,255,255,0.2)", background: !!st.signedIn === v ? "rgba(255,255,255,0.16)" : "transparent", color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap" }}>{lbl}</button>
          ))}
          {/* review chrome: header coverage per account type (Buyer / Dealer / Admin) */}
          {[["Buyer", "buyer"], ["Dealer", "dealer"], ["Admin", "admin"]].map(([lbl, v]) => (
            <button key={v} onClick={() => setSt((s) => ({ ...s, role: v }))} data-review-role={v} style={{ padding: "4px 10px", borderRadius: "var(--radius-full)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "11.5px", fontWeight: 600, border: "1px solid rgba(255,255,255,0.2)", background: (st.role || "buyer") === v ? "rgba(255,255,255,0.16)" : "transparent", color: "rgba(255,255,255,0.85)", whiteSpace: "nowrap" }}>{lbl}</button>
          ))}
          <a href="transitions.html" style={{ alignSelf: "center", fontSize: "11.5px", fontWeight: 600, color: "var(--copper-400)", whiteSpace: "nowrap", marginLeft: "4px" }}>Storyboard ↗</a>
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "0 16px 7px", flexWrap: "wrap" }}>
        {SCENARIOS.filter((j) => (j.group || null) === grp).map((j) => (
          <button key={j.id} onClick={() => onScenario(j.id)} style={pill(st.scenario === j.id)}>{j.label}</button>
        ))}
        <span style={{ flex: 1, minWidth: "200px", fontSize: "11.5px", color: "rgba(255,255,255,0.72)", paddingLeft: "6px" }}>{hint}</span>
      </div>
      <ExpCompare st={st} setSt={setSt} onScenario={onScenario} />
    </div>
  );
}

// A map hiccup must never cost the whole artifact. Without a boundary, Leaflet
// throwing from inside a commit effect makes React discard the entire tree, and the
// reviewer gets a blank page with no clue what happened.
class ExpErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null, attempt: 0 }; }
  static getDerivedStateFromError(err) { return { err: err }; }
  componentDidCatch(err, info) { console.error("Discover shell error:", err, info && info.componentStack); }
  render() {
    if (!this.state.err) return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;
    return (
      <div style={{ maxWidth: "560px", margin: "40px auto", padding: "20px 22px", background: "var(--surface-card)", border: "1px solid var(--brick-600)", borderRadius: "var(--radius-lg)", fontFamily: "var(--font-sans)" }}>
        <h2 style={{ margin: "0 0 8px", fontFamily: "var(--font-serif)", fontSize: "20px", fontWeight: 600, color: "var(--text-strong)" }}>The Discover shell stopped rendering</h2>
        <p style={{ margin: "0 0 14px", fontSize: "13px", lineHeight: 1.5, color: "var(--text-body)" }}>This is a failure in the review harness, not a designed state. Try again re-mounts the shell in place; most transient errors clear on the retry.</p>
        <pre style={{ margin: "0 0 14px", padding: "10px 12px", background: "var(--surface-subtle)", borderRadius: "var(--radius-md)", fontFamily: "var(--font-mono)", fontSize: "11.5px", lineHeight: 1.45, color: "var(--brick-600)", whiteSpace: "pre-wrap" }}>{String(this.state.err && this.state.err.message || this.state.err)}</pre>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {/* Clearing err and bumping the key remounts the subtree, so a transient
              error does not latch the reviewer on this card for the whole session. */}
          <button onClick={() => this.setState((s) => ({ err: null, attempt: s.attempt + 1 }))} style={{ padding: "9px 15px", borderRadius: "var(--radius-md)", border: "none", cursor: "pointer", background: "var(--accent)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 700 }}>Try again</button>
          <button onClick={() => window.location.reload()} style={{ padding: "9px 15px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", cursor: "pointer", background: "var(--paper)", color: "var(--text-strong)", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600 }}>Reload the artifact</button>
        </div>
      </div>
    );
  }
}

// ---- shell: fixed target sizes, scaled to fit ------------------------------
const EXP_MOBILE_VP = { 375: [375, 667], 390: [390, 844], 412: [412, 915] };
function ExpShell({ st, view, act, isMobile }) {
  const mvp = EXP_MOBILE_VP[st.vp || "390"] || EXP_MOBILE_VP[390];
  const W = isMobile ? mvp[0] : 1366, H = isMobile ? mvp[1] : 768;
  const [scale, setScale] = React.useState(1);
  // The review chrome is MEASURED, never hardcoded — a constant here went stale twice.
  // But measuring is not enough on its own: the chrome's height also changes when the
  // hint text re-wraps on a scenario switch, and a ResizeObserver did not fire for
  // that. So the fit runs after EVERY commit via a dep-less layout effect (two
  // getBoundingClientRect reads; setScale no-ops when the value is unchanged), which
  // cannot go stale, with the observer and resize listener kept for changes that
  // originate outside React.
  const fit = React.useCallback(() => {
    const chrome = document.querySelector("[data-review-chrome]");
    let chromeH = chrome ? chrome.getBoundingClientRect().height : 0;
    // The element-by-element table is an OPT-IN reference panel. Fitting against it
    // would crush the shell to an unreadable scale on a short viewport, so it is
    // excluded: the shell keeps a sensible size and the page scrolls by the table's
    // height while it is open, which is the normal answer for expanded chrome.
    const expand = document.querySelector("[data-review-expand]");
    if (expand) chromeH -= expand.getBoundingClientRect().height;
    const availW = window.innerWidth - 40;
    // the shell sits in a padded container: 18/32 desktop, 24/40 mobile. The extra 4px
    // is slack: the chrome's height is fractional and can settle a pixel late (hint
    // reflow, font swap), and without slack that remainder becomes page overflow.
    const availH = window.innerHeight - chromeH - (isMobile ? 64 : 50) - 4;
    const next = Math.max(0.2, Math.min(1, availW / W, availH / H));
    setScale((s) => (Math.abs(s - next) < 0.0005 ? s : next));
  }, [W, H, isMobile]);
  React.useLayoutEffect(fit);
  React.useEffect(() => {
    // one deferred pass for anything that settles after the commit
    const raf = requestAnimationFrame(fit);
    window.addEventListener("resize", fit);
    let ro = null;
    const chrome = document.querySelector("[data-review-chrome]");
    if (chrome && typeof ResizeObserver !== "undefined") { ro = new ResizeObserver(fit); ro.observe(chrome); }
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", fit); ro && ro.disconnect(); };
  }, [fit]);
  return (
    <div style={{ width: W * scale + "px", height: H * scale + "px" }}>
      <div style={{ width: W + "px", height: H + "px", transform: "scale(" + scale + ")", transformOrigin: "top left", borderRadius: isMobile ? "26px" : "var(--radius-lg)", overflow: "hidden", background: "var(--paper)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow-xl)", display: "flex", flexDirection: "column", position: "relative" }}>
        {isMobile ? <ExpMobile st={st} view={view} act={act} /> : <ExpDesktop st={st} view={view} act={act} />}
      </div>
    </div>
  );
}

const JOURNEY_BADGE = { areas: ["Areas", "accent"], schools: ["Schools", "neutral"], agri: ["Agricultural", "success"] };

// ONE shared global header for every desktop state, session and role (same rule in
// Discover and Results). Mobile (compact) keeps its existing chrome. Structure:
// logo · [city | Buy/Rent | search] · journeys · role actions. The passive journey
// badge is gone on desktop (the selected journey pill already says it). Search is
// floored at 300px. If the row would still overflow: stage 1 drops the logo
// tagline, stage 2 tightens gaps, stage 3 folds 2+ role actions into one menu.
// Nothing ever wraps to a second row.
// Role actions are review-coverage only: they link to the existing Dealer / Admin
// artifacts in this system and grant nothing.
const HDR_ROLE_ACTIONS = {
  buyer: [],
  dealer: [{ label: "My listings", icon: "layers", href: "../broker/listings.html" }, { label: "Post a listing", icon: "plus", href: "../buyer/choose-lisiting-journey.html", primary: true }],
  admin: [{ label: "Admin console", icon: "users", href: "../../City Launch - Admin Wireframes v1.html", primary: true }]
};
const HDR_ROLE_LABEL = { buyer: "Buyer", dealer: "Dealer", admin: "Admin" };
function HdrBtn({ a, compact }) {
  const base = { display: "inline-flex", alignItems: "center", gap: "6px", border: "1px solid " + (a.primary ? "var(--navy-800)" : "var(--border-strong)"), background: a.primary ? "var(--navy-800)" : "var(--paper)", cursor: "pointer", padding: compact ? "5px 10px" : "7px 12px", borderRadius: "var(--radius-md)", fontFamily: "var(--font-sans)", fontSize: compact ? "11.5px" : "12.5px", fontWeight: 600, color: a.primary ? "#fff" : "var(--text-strong)", whiteSpace: "nowrap", textDecoration: "none", flex: "none" };
  const { Icon } = window.ReTrendsDesignSystem_f37966;
  const inner = <>{a.icon && <Icon name={a.icon} size={14} color={a.primary ? "#fff" : "var(--grey-500)"} />}{a.label}</>;
  return a.href ? <a href={a.href} target="_blank" rel="noopener" data-role-action={a.label} style={base}>{inner}</a> : <button onClick={a.onClick} data-role-action={a.label} style={base}>{inner}</button>;
}
function HdrActionsMenu({ label, items }) {
  const { Icon } = window.ReTrendsDesignSystem_f37966;
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", f); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", f); document.removeEventListener("keydown", k); };
  }, [open]);
  const row = { display: "flex", alignItems: "center", gap: "9px", width: "100%", padding: "8px 10px", border: "none", borderRadius: "var(--radius-md)", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--text-strong)", textDecoration: "none", textAlign: "left" };
  return (
    <span ref={ref} data-design-component="role-actions-menu" style={{ position: "relative", flex: "none" }}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} style={{ display: "inline-flex", alignItems: "center", gap: "6px", border: "1px solid var(--border-strong)", background: "var(--paper)", cursor: "pointer", padding: "7px 10px 7px 12px", borderRadius: "var(--radius-md)", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-strong)", whiteSpace: "nowrap" }}>
        {label}<Icon name="chevron-down" size={14} color="var(--grey-500)" />
      </button>
      {open && (
        <div role="menu" style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 1200, minWidth: "190px", padding: "5px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)" }}>
          {items.map((a) => a.href
            ? <a key={a.label} role="menuitem" href={a.href} target="_blank" rel="noopener" style={row}><Icon name={a.icon || "arrow-right"} size={15} color="var(--grey-500)" />{a.label}</a>
            : <button key={a.label} role="menuitem" onClick={() => { setOpen(false); a.onClick(); }} style={row}><Icon name={a.icon || "arrow-right"} size={15} color="var(--grey-500)" />{a.label}</button>)}
        </div>
      )}
    </span>
  );
}
function ExpTopNav({ compact, st, act, view }) {
  const { Icon, Badge } = window.ReTrendsDesignSystem_f37966;
  const badge = JOURNEY_BADGE[st.journey] || JOURNEY_BADGE.areas;
  const ref = React.useRef(null);
  const [stage, setStage] = React.useState(0);
  const global = !compact && view;
  const role = st.role || "buyer";
  const actions = [{ label: "Saved alerts", onClick: act.openAlerts }].concat(HDR_ROLE_ACTIONS[role] || []);
  // reset MUST run before the fit check in the same commit (else set(1)+set(0) nets to a no-op bail-out)
  React.useLayoutEffect(() => { setStage(0); }, [st.journey, role, st.city]);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!global || !el || stage >= 3) return;
    const sr = el.querySelector('[data-design-component="area-autocomplete"]');
    if (el.scrollWidth > el.clientWidth + 1 || (sr && sr.offsetWidth < 300)) setStage(stage + 1);
  });
  React.useEffect(() => {
    const el = ref.current;
    if (!global || !el || !window.ResizeObserver) return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - w) > 1) { w = el.clientWidth; setStage(0); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, [global]);
  return (
    <header ref={ref} data-design-component="global-header" data-role={role} data-fit-stage={stage} style={{ flex: "none", position: "relative", zIndex: 1100, height: compact ? "44px" : "58px", display: "flex", alignItems: "center", gap: compact ? "10px" : global ? (stage >= 2 ? "8px" : "14px") : "24px", padding: compact ? "0 14px" : stage >= 2 ? "0 14px" : "0 20px", background: "var(--paper)", borderBottom: "1px solid var(--border)" }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: compact ? "26px" : "32px", height: compact ? "26px" : "32px", borderRadius: "var(--radius-md)", background: "var(--navy-800)", display: "grid", placeItems: "center" }}><Icon name="map-pin" size={compact ? 15 : 18} color="#fff" /></div>
        <div style={{ lineHeight: 1.1, whiteSpace: "nowrap" }}>
          <div style={{ fontSize: compact ? "13px" : "14.5px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>Bangalore Property Tracker</div>
          {!compact && stage < 1 && <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Real estate trends</div>}
        </div>
      </div>
      {global && <window.ExpModeBar st={st} act={act} view={view} isMobile={false} part="header" tight={stage >= 2} />}
      <div data-design-component="role-actions" style={{ flex: "none", marginLeft: global ? 0 : "auto", display: "flex", alignItems: "center", gap: "8px" }}>
        {!global && !compact && <Badge tone={badge[1]} pill>{badge[0]}</Badge>}
        {global && stage >= 3 && actions.length > 1
          ? <HdrActionsMenu label={HDR_ROLE_LABEL[role]} items={actions} />
          : (compact ? actions.slice(0, 1) : actions).map((a) => <HdrBtn key={a.label} a={a} compact={compact} />)}
      </div>
    </header>
  );
}

function mapProps(st, view, act) {
  return {
    view, hover: view.hover, dirty: st.dirty, phase: st.phase,
    onPick: st.journey === "schools" ? act.schoolsPickNode : act.pickNode,
    onCluster: st.journey === "schools" ? act.schoolsPickCluster : act.pickCluster,
    onArea: st.journey === "schools" ? act.pickSchoolArea : act.pickArea,
    onOpenListing: act.openListing,
    onHover: st.journey === "schools" ? act.schoolsHover : st.journey === "agri" ? act.agriHover : act.hover,
    onCameraMove: act.onCameraMove, onSearchThisArea: act.searchThisArea,
    onCrumb: act.onCrumb, showAllAreas: st.journey === "schools" ? act.schoolsShowAll : act.showAllAreas, onFitAll: act.fitAll,
    onSchool: act.selectSchool, onSchoolHover: act.schoolsHover, schoolHover: st.sch.hover,
    onAgriNav: act.agriPickCorridor, onAgriTown: act.agriPickTown, onParcel: act.agriActivate, agriActive: st.ag.active
  };
}

function ExpDesktop({ st, view, act }) {
  return (
    <>
      <ExpTopNav st={st} act={act} view={view} />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div style={{ flex: "0 0 52%", position: "relative", borderRight: "1px solid var(--border)" }}>
          <window.ExpMap {...mapProps(st, view, act)} isMobile={false} />
        </div>
        <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
          <window.ExpPanel view={view} st={st} act={act} isMobile={false} />
        </div>
      </div>
    </>
  );
}

function ExpMobile({ st, view, act }) {
  const mapMode = st.presentation === "map";
  return (
    <>
      <ExpTopNav compact st={st} act={act} />
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", padding: "8px 14px", background: "var(--paper)", borderBottom: "1px solid var(--border)" }}>
        {view.showBack && <button onClick={act.backHierarchy} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 700, color: "var(--accent)", whiteSpace: "nowrap" }}>‹ {view.backLabel}</button>}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "4px", fontSize: "11.5px", fontWeight: 600, color: "var(--text-muted)", overflow: "hidden", whiteSpace: "nowrap" }}>
          {view.crumb.map((c, i) => <React.Fragment key={c.key}>{i > 0 && <span style={{ color: "var(--grey-400)" }}>›</span>}<span style={{ color: i === view.crumb.length - 1 ? "var(--text-strong)" : "var(--text-muted)", fontWeight: i === view.crumb.length - 1 ? 700 : 600 }}>{c.label}</span></React.Fragment>)}
        </div>
        <div style={{ flex: "none", display: "inline-flex", padding: "2px", borderRadius: "var(--radius-full)", background: "var(--input-bg)", border: "1px solid var(--border)" }}>
          {["list", "map"].map((p) => (
            <button key={p} onClick={() => act.setPresentation(p)} style={{ padding: "4px 11px", borderRadius: "var(--radius-full)", border: "none", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "11.5px", fontWeight: 700, background: st.presentation === p ? "var(--navy-800)" : "transparent", color: st.presentation === p ? "#fff" : "var(--text-muted)" }}>{p === "list" ? "List" : "Map"}</button>
          ))}
        </div>
      </div>
      {mapMode ? (
        <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
          <window.ExpMap {...mapProps(st, view, act)} isMobile lead={window.MFX && window.MFX.available(st, view) ? <window.ExpMapFilterButton st={st} act={act} focusDemo={st.mfFocusDemo} /> : null} />
          <ExpSheet st={st} view={view} act={act} />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          <window.ExpPanel view={view} st={st} act={act} isMobile />
        </div>
      )}
      {mapMode && st.mfSheet && <window.ExpMapFilterSheet st={st} act={act} view={view} />}
      <div aria-live="polite" style={{ position: "absolute", width: "1px", height: "1px", overflow: "hidden", clip: "rect(0 0 0 0)" }}>{st.mfAnnounce || ""}</div>
    </>
  );
}

function ExpSheet({ st, view, act }) {
  const rows = view.sheetRows || [];
  const mapFilters = !!(window.MFX && window.MFX.available(st, view) && (view.listingCapable || view.level === "schools-homes"));
  // #2627 ruling 2: intent + family always stated in the heading; refinements go on the Filtered line
  const sheetTitle = mapFilters ? window.MFX.intent(st.filters, view.results.length) : view.sheetTitle;
  // mobile Map mode: a selected marker opens a listing PREVIEW here, never a silent no-op
  if (st.peek) {
    const l = EX.listings.find((x) => x.id === st.peek);
    if (l) return (
      <div data-design-component="listing-peek" style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 720, padding: "10px 14px 18px", background: "var(--paper)", borderRadius: "16px 16px 0 0", borderTop: "1px solid var(--border)", boxShadow: "0 -8px 26px rgba(20,26,40,0.18)" }}>
        <div style={{ width: "38px", height: "4px", borderRadius: "999px", background: "var(--stone-400)", margin: "0 auto 10px" }} />
        <div style={{ display: "flex", gap: "11px" }}>
          <img src={l.image} alt={l.title} style={{ flex: "none", width: "92px", height: "78px", objectFit: "cover", borderRadius: "var(--radius-md)" }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "17px", fontWeight: 700, color: "var(--text-strong)" }}>{EX.priceText(l, st.filters)}</span>
              <button onClick={act.closePeek} aria-label="Close" style={{ flex: "none", width: "26px", height: "26px", borderRadius: "var(--radius-full)", border: "1px solid var(--border)", background: "var(--surface-subtle)", color: "var(--text-muted)", cursor: "pointer", lineHeight: 1, fontSize: "14px" }}>×</button>
            </div>
            <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-strong)", marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{EX.isCom(l) ? EX.comLabel(l.comSub) + " · " + l.deal : l.propType === "Plot" ? "Plot · " + l.sqft.toLocaleString("en-IN") + " sq.ft" : l.propType + " · " + l.beds + " BHK"}</div>
            <div style={{ fontSize: "11.5px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.locality}, {l.area}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", marginTop: "11px" }}>
          <button onClick={act.openPeekDetail} style={{ flex: 1, padding: "11px", borderRadius: "var(--radius-md)", border: "none", background: "var(--accent)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 700, cursor: "pointer" }}>View details</button>
          <button onClick={act.closePeek} style={{ flex: "none", padding: "11px 14px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", background: "var(--paper)", color: "var(--text-strong)", fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 600, cursor: "pointer" }}>Close</button>
        </div>
        <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--text-muted)", textAlign: "center" }}>Back from the details returns to this map view.</div>
      </div>
    );
  }
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 700, padding: "10px 14px 18px", background: "var(--paper)", borderRadius: "16px 16px 0 0", borderTop: "1px solid var(--border)", boxShadow: "0 -8px 26px rgba(20,26,40,0.16)", transition: "transform var(--dur-normal) var(--ease-out)" }}>
      <div style={{ width: "38px", height: "4px", borderRadius: "999px", background: "var(--stone-400)", margin: "0 auto 10px" }} />
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
        <span data-design-component="map-result-heading" style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-strong)" }}>{sheetTitle}</span>
        {view.clusterFocus
          ? <button onClick={st.journey === "schools" ? act.schoolsShowAll : act.showAllAreas} style={{ border: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12px", fontWeight: 700, color: "var(--accent)" }}>Show all areas</button>
          : view.scopeKind === "AREA_SET" && view.committed.length > 1 ? <button onClick={act.fitAll} style={{ border: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12px", fontWeight: 700, color: "var(--accent)" }}>Fit all</button> : null}
      </div>
      {view.scopeKind && <div style={{ marginTop: "6px", display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 9px", borderRadius: "var(--radius-xs)", border: "1px solid var(--border-strong)", background: "var(--surface-subtle)", fontSize: "11.5px", fontWeight: 700, color: "var(--text-strong)" }}>Result scope — {view.scopeLabel}</div>}
      {mapFilters && view.results.length > 0 && <window.ExpMapFilterSummary st={st} act={act} />}
      {mapFilters && view.results.length === 0 ? <div style={{ marginTop: "10px" }}><window.ExpMapZero st={st} act={act} view={view} /></div> : (
      <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginTop: "9px", maxHeight: "190px", overflowY: "auto" }}>
        {rows.map((r) => (
          <button key={r.key} onClick={r.onClick} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 11px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)" }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: "13px", fontWeight: 700, color: "var(--text-strong)" }}>{r.label}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-body)", whiteSpace: "nowrap" }}>{r.meta}</span>
            <span style={{ color: "var(--grey-400)" }}>›</span>
          </button>
        ))}
      </div>
      )}
      {view.stickyCta && <div style={{ marginTop: "10px" }}><button onClick={view.stickyCta.onClick} style={{ width: "100%", padding: "12px", borderRadius: "var(--radius-md)", border: "none", background: "var(--accent)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 700, cursor: "pointer" }}>{view.stickyCta.label}</button></div>}
    </div>
  );
}

// ---- AREAS journey view -----------------------------------------------------
function buildView(st, results, act) {
  const level0 = EX.levelOf(st.nodeKey);
  const scopeKind = st.scope ? st.scope.kind : null;
  const resultsView = !!scopeKind && !st.draft;
  const level = resultsView ? "listings" : level0;
  const crumb = EX.ancestry(st.nodeKey);
  const kids = resultsView ? [] : EX.childrenOf(st.nodeKey, st.filters);
  const areaKids = kids.length && kids[0].kind === "area";
  const grouping = areaKids ? EX.clustersFor(st.nodeKey, st.filters) : { clusters: [], singles: [] };
  const focusMembers = st.clusterFocus ? st.clusterFocus.members : null;

  const v = {
    journey: "areas", level, crumb, scopeKind, committed: st.committed, focusChip: st.focusChip, hover: st.hover, filters: st.filters,
    noun: EX.nounsOf(st.filters).plural, nouns: EX.nounsOf(st.filters),
    clusterFocus: st.clusterFocus, presentation: st.presentation, results, notes: [],
    destinations: [], areaList: [], mapClusters: [], areaMarkers: [], pins: [], discs: [],
    poly: st.polyDraft || (scopeKind === "POLYGON" ? st.scope.poly : null), polyDraft: !!st.polyDraft,
    listingCapable: resultsView, maxZoom: 15, sheetRows: [], sheetTitle: "", stickyCta: null,
    scopeLabel: scopeKind === "HIERARCHY" ? crumb[crumb.length - 1].label : scopeKind === "AREA_SET" ? st.committed.map((k) => EX.byKey[k].name).join(" · ") : scopeKind === "CITY" ? "All of Bangalore" : scopeKind === "POLYGON" ? "Drawn area" : scopeKind === "VIEWPORT" ? "Visible map area" : "",
    scopeTotal: results.length, showBack: false, backLabel: "", cameraNote: null
  };

  if (!resultsView) {
    if (areaKids) {
      const list = focusMembers ? kids.filter((k) => focusMembers.indexOf(k.key) !== -1) : kids;
      v.areaList = list;
      v.areaMarkers = (focusMembers ? list : grouping.singles).map((a) => ({ ...a, selected: false }));
      if (!focusMembers) v.mapClusters = grouping.clusters;
    } else {
      v.destinations = kids;
      v.compass = true;
    }
    const areasUnder = level === "city" ? EX.areas : level === "direction" ? EX.areasOfDirection(st.nodeKey) : EX.areasOfLocal(st.nodeKey);
    const fitList = focusMembers ? focusMembers.map((k) => EX.byKey[k]) : areasUnder.filter((a) => EX.countIn(a.key, st.filters) > 0);
    v.fitBounds = EX.boundsOf(fitList.length ? fitList : areasUnder);
    v.fitKey = "nav-" + st.nodeKey + "-" + (st.clusterFocus ? st.clusterFocus.key : "") + "-" + EX.filterLabels(st.filters).join(",");
    v.maxZoom = level === "city" ? 11 : level === "direction" ? 12 : 14;
    const total = kids.reduce((s, k) => s + k.n, 0);
    v.heading = level === "city"
      ? { eyebrow: "Areas · Bangalore", title: "Where in Bangalore?", stat: { v: total, l: v.nouns.count(total) }, sub: "Five directions, positioned as they really lie. Each card names the areas with matching listings inside it." }
      : level === "direction"
        ? { eyebrow: "Direction · " + crumb[crumb.length - 1].label, title: crumb[crumb.length - 1].label, stat: { v: total, l: v.nouns.count(total) }, sub: areaKids ? "This direction goes straight to its areas — no extra layer is invented." : "Local destinations, named by their prominent areas." }
        : { eyebrow: "Local destination", title: crumb[crumb.length - 1].label, stat: { v: total, l: v.nouns.count(total) }, sub: "Pick an area to see its listings. The dashed cluster on the map only zooms." };
    if (areaKids) {
      v.notes.push(focusMembers
        ? { tone: "info", text: focusMembers.length + " areas in this map view — the breadcrumb did not change.", action: "Show all " + kids.length + " areas", onAction: act.showAllAreas }
        : { tone: "info", text: kids.length + " areas with matches here. Crowded markers are grouped on the map for legibility only." });
    } else if (kids.some((k) => k.n === 0)) {
      v.notes.push({ tone: "muted", text: "Destinations with no matches under your current filters stay on the map and in this list — the geography does not move when filters change." });
    }
    if (!kids.length) v.notes.push({ tone: "warn", text: "No area here has a listing that matches your filters.", action: "Reset filters", onAction: act.resetFilters });
    v.sheetTitle = focusMembers ? focusMembers.length + " areas in this map view" : (areaKids ? kids.length + " areas with matches" : kids.length + " destinations");
    v.sheetRows = (v.areaList.length ? v.areaList : kids).slice(0, 6).map((k) => ({ key: k.key, label: k.label, meta: k.n + " " + v.noun, onClick: () => (k.kind === "area" ? act.pickArea(k.key) : act.pickNode(k)) }));
  } else {
    const single = scopeKind === "AREA_SET" && st.committed.length === 1;
    const areaObjs = st.committed.map((k) => EX.byKey[k]);
    const focusArea = st.focusChip ? EX.byKey[st.focusChip] : null;
    v.areaActions = single;
    v.hierarchyAreas = scopeKind === "HIERARCHY" ? areaObjs : [];
    v.zeroKeys = scopeKind === "CITY" ? EX.areas.map((a) => a.key) : st.committed;
    // recovery is scope-specific: only an AREA_SET states its own area names as the scope
    v.zeroScopeNames = scopeKind === "AREA_SET" ? areaObjs.map((a) => a.name) : null;
    v.returnAreaKeys = st.prevScope && st.prevScope.kind === "AREA_SET" ? st.prevScope.areaKeys.slice() : st.committed.slice();
    const rent = st.filters.purpose === "Rent";
    v.heading = single
      ? { eyebrow: "Areas · " + areaObjs[0].name, title: v.nouns.inPlace(areaObjs[0].name), stat: { v: results.length, l: v.nouns.deal(results.length) } }
      : scopeKind === "CITY"
        ? { eyebrow: "Browse all " + v.nouns.plural, title: v.nouns.allCity, stat: { v: results.length, l: v.nouns.count(results.length) }, sub: "Every listing in the city on one filterable list — the funnel skipped, filters and alerts unchanged." }
        : scopeKind === "HIERARCHY"
          ? { eyebrow: "Result scope — " + (st.scope.level === "direction" ? "Direction" : "Local destination"), title: v.nouns.inPlace(crumb[crumb.length - 1].label), stat: { v: results.length, l: v.nouns.deal(results.length) }, sub: "Every area in " + crumb[crumb.length - 1].label + " on one filterable list." }
          : {
            eyebrow: scopeKind === "AREA_SET" ? "Selected areas · " + st.committed.length : v.nouns.dealScope + (scopeKind === "POLYGON" ? "Drawn area" : "Visible map area"),
            title: scopeKind === "AREA_SET" ? areaObjs.map((a) => a.name).join(", ") : scopeKind === "POLYGON" ? "Inside your drawn boundary" : "On screen right now",
            stat: { v: results.length, l: v.nouns.count(results.length) }
          };
    if (st.query) v.notes.push({ tone: "info", text: "Filtered to “" + st.query + "” within " + (single ? areaObjs[0].name : v.scopeLabel) + " — " + results.length + " of " + (single ? EX.countIn(st.committed[0], st.filters) : "the") + " " + v.nouns.unitPlural + ".", action: "Clear search", onAction: () => act.setQuery("") });
    if (scopeKind === "HIERARCHY") v.schoolsBlock = { n: areaObjs.reduce((s, a) => s + a.schools, 0), names: crumb[crumb.length - 1].label };
    else if (scopeKind === "AREA_SET" && st.committed.length > 1) v.schoolsBlock = { n: areaObjs.reduce((s, a) => s + a.schools, 0), names: areaObjs.map((a) => a.name).join(", ") };
    if (st.focusChip) v.notes.push({ tone: "info", text: "Map focused on " + focusArea.name + ". All " + results.length + " listings from " + st.committed.length + " areas are still in this list." });
    if (st.dirty && !st.confirm) v.notes.push({ tone: "muted", text: "You moved the map. These results still come from " + v.scopeLabel + " — nothing was requested." });
    if (st.polyDraft) v.notes.push({ tone: "muted", text: "Boundary drawn. Results still come from " + v.scopeLabel + ".", action: "Use drawn area", onAction: act.usePoly });
    if (st.note) v.notes.push({ tone: "ok", text: st.note });
    if (scopeKind === "VIEWPORT") v.cameraNote = "Committed bounds. Panning again offers a fresh Search this area — it does not update these results.";
    v.pins = results.slice(0, 300);
    if (scopeKind === "AREA_SET") {
      v.fitBounds = focusArea ? focusArea.bounds : EX.boundsOf(areaObjs);
      v.fitKey = "res-" + st.committed.join(",") + "-" + (st.focusChip || "") + "-" + EX.filterLabels(st.filters).join(",");
    } else if (scopeKind === "CITY") {
      v.fitBounds = EX.city.bounds;
      v.fitKey = "city-all";
      v.maxZoom = 12;
    } else if (scopeKind === "HIERARCHY") {
      v.fitBounds = EX.boundsOf(areaObjs);
      v.fitKey = "hier-" + st.nodeKey + "-" + EX.filterLabels(st.filters).join(",");
      v.maxZoom = st.scope.level === "direction" ? 13 : 14;
    } else if (scopeKind === "POLYGON") {
      v.fitBounds = st.scope.poly.map((p) => [p[0], p[1]]);
      v.fitKey = "poly-" + st.scope.poly[0].join(",");
    } else {
      v.fitBounds = null;
      v.fitKey = "vp-" + JSON.stringify(st.scope.bounds);
      v.scopeRect = [[st.scope.bounds.south, st.scope.bounds.west], [st.scope.bounds.north, st.scope.bounds.east]];
    }
    v.sheetTitle = results.length + " " + v.noun + " · " + v.scopeLabel;
    v.sheetRows = results.slice(0, 5).map((l) => ({ key: l.id, label: l.title, meta: EX.priceText(l, st.filters), onClick: () => act.openListing(l.id) }));
  }

  const parent = EX.parentOf(st.nodeKey);
  if (st.detail) { v.showBack = true; v.backLabel = "Back to results"; }
  else if (scopeKind === "HIERARCHY") { v.showBack = true; v.backLabel = "Back to " + crumb[crumb.length - 1].label; }
  else if (scopeKind === "CITY") { v.showBack = true; v.backLabel = "Back to Areas in Bangalore"; }
  else if (parent) {
    v.showBack = true;
    const a = EX.byKey[st.nodeKey];
    v.backLabel = a ? "Back to areas in " + EX.directions.find((d) => d.key === a.direction).short : "Back to " + crumb[crumb.length - 2].label;
  }

  if (st.draft) {
    const draftTotal = EX.inAreas(st.draft, st.filters).length;
    v.heading = { eyebrow: "Add nearby areas", title: "Add nearby areas", stat: { v: st.draft.length, l: "of 3 selected" }, sub: "Add up to 2 nearby areas. Nothing is searched yet — the map stays on " + EX.byKey[st.draft[0]].name + " and the results below do not move until you show the listings." };
    v.areaActions = false;
    v.draftTotal = draftTotal;
    const cands = EX.nearbyFor(st.draft, st.filters).slice(0, 4);
    v.areaMarkers = st.draft.map((k) => ({ key: k, label: EX.byKey[k].name, n: EX.countIn(k, st.filters), center: { lat: EX.byKey[k].lat, lon: EX.byKey[k].lon }, selected: true }))
      .concat(cands.map((s) => ({ key: s.key, label: s.name, n: s.n, center: { lat: EX.byKey[s.key].lat, lon: EX.byKey[s.key].lon }, selected: false, candidate: true })));
    v.mapClusters = []; v.destinations = []; v.areaList = [];
    // The camera stays anchored on the committed area(s): same fitKey as the results
    // view it was opened from, so opening the draft never zooms out to the candidates.
    v.fitBounds = EX.boundsOf((st.committed.length ? st.committed : [st.draft[0]]).map((k) => EX.byKey[k]));
    v.fitKey = "res-" + st.committed.join(",") + "-" + (st.focusChip || "") + "-" + EX.filterLabels(st.filters).join(",");
    v.listingCapable = false;
    v.sheetTitle = st.draft.length + " of 3 selected · draft";
    v.sheetRows = st.draft.map((k) => ({ key: k, label: EX.byKey[k].name, meta: EX.countIn(k, st.filters) + " listings · remove", onClick: () => act.removeDraft(k) }))
      .concat(cands.slice(0, 3).map((s) => ({ key: s.key, label: "Add " + s.name, meta: s.n + " listings", onClick: () => act.addDraft(s.key) })));
    v.stickyCta = { label: "Show " + draftTotal + " listings", onClick: act.commitDraft };
  }
  v.paintKey = ["areas", v.level, st.nodeKey, scopeKind, st.committed.join(","), st.draft ? "d" + st.draft.join(",") : "", st.detail || "", st.view || "", st.clusterFocus ? "c" : "", st.query].join("|");
  return v;
}

Object.assign(window, { Experience, ExpBuildView: buildView });

// This file is deliberately side-effect-free: the design-system compiler also bundles
// it into _ds_bundle.js, which runs BEFORE the data modules load, so any mount here
// would execute once with its dependencies missing.
//
// Instead it publishes a readiness handle that ONLY a copy with real dependencies can
// set. The bundled copy runs while window.EXP is undefined and so never sets it;
// experience.html waits for this handle rather than for `window.Experience`, which
// the bundle also defines. Because this is the last .jsx the page loads, every other
// real module has already executed by the time it resolves.
if (window.EXP && window.EXP.DEFAULT_FILTERS && window.EXP.listings) window.ExperienceReady = Experience;

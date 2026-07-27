// State manifest — Groups C (committed multi-area), D (schools in selected areas),
// E (zero-result recovery), F (saved-search alerts).
(function () {
  const R = window.RS, A = R.A;
  if (window.__RS_STATES_B) return;
  window.__RS_STATES_B = 1;
  window.RS_STATES = window.RS_STATES || [];
  const push = (s) => window.RS_STATES.push(s);
  const chip = (id) => ({ id, label: A[id].name });
  const mkArea = (id, o) => Object.assign({ kind: "area", id, lat: A[id].lat, lon: A[id].lon, name: A[id].name, count: `${A[id].listings} listings` }, o || {});
  const fitOf = (ids) => ids.map((i) => [A[i].lat, A[i].lon]);
  const POLY = [[13.0530, 77.5840], [13.0585, 77.6190], [13.0365, 77.6335], [13.0215, 77.6055], [13.0300, 77.5845]];
  const THREE = [chip("hebbal"), chip("nagawara"), chip("jakkur")];
  const PRICE = (id, n) => R.listingsFor([id], n).map((l) => ({ kind: "price", lat: l.lat, lon: l.lon, label: R.inr(l.price) }));
  const N = (o) => Object.assign({
    hierBack: "Goes to the canonical parent, Hebbal · Yelahanka. It does not clear the result scope.",
    browserBack: "Goes to the previous committed state — not the parent node.",
    listMap: "Presentation only. Same result scope, same listings.",
  }, o || {});
  const EDIT_CLEAR = { edit: "Edits the current area set as a draft; results hold until Search.", clear: "Removes all three chips after a confirmation and leaves you at the parent node with no result scope." };
  const ZERO_FILTERS = ["Buy", "Up to ₹45 lakh", "3 BHK", "Ready to move"];

  // ============================ GROUP C ============================
  push({
    id: "C1", group: "C", issue: "#2017", name: "committed-three-areas",
    title: "Hebbal + Nagawara + Jakkur committed",
    ac: "A committed multi-area search shows one combined total, all member chips, and a map fitted to every selected area — and is not presented as a hierarchy breadcrumb.",
    intent: "The result heading names the set as a set (Selected areas · three names · one total). The breadcrumb above it still points at the canonical node, unchanged and shorter than the selection.",
    sync: "The map is fitted to all three areas; each selected marker is filled and check-marked, and its panel chip is the same object.",
    scopeKind: "areas", scopeShort: "3 areas",
    notes: N(Object.assign({ commit: "Already committed — this is the post-Search state.", returnScope: "Offered whenever a polygon or viewport later replaces this set." }, EDIT_CLEAR)),
    tryIt: [{ label: "Focus just Nagawara", to: "C3" }, { label: "Edit or clear the set", to: "C2" }, { label: "Create an alert", to: "F1" }, { label: "Schools in these areas", to: "D2" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", chips: THREE, note: "Three areas, one combined result. Tap a chip to focus that area on the map without removing the others.", actions: [{ label: "Edit areas", to: "C2" }, { label: "Clear selected areas", variant: "ghost", to: "C2" }, { label: "Create alert", to: "F1" }] },
      { t: "heading", label: "Selected areas", value: "Hebbal · Nagawara · Jakkur", count: 95 },
      { t: "why", text: "95 = 42 in Hebbal + 31 in Nagawara + 22 in Jakkur. No other area is included." },
      { t: "filters" },
      { t: "listings", label: "Homes for sale", ids: ["hebbal", "nagawara", "jakkur"], n: 4 },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true, action: { to: "C3" } }), mkArea("nagawara", { sel: true, action: { to: "C3" } }), mkArea("jakkur", { sel: true, action: { to: "C3" } })],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · 3 selected areas" }, crumb: "Map fitted to all selected areas", buttons: [{ label: "Fit all", icon: "maximize", to: "C1" }] },
    },
    mobileCta: { label: "Edit areas", variant: "outline", to: "C2" },
  });

  push({
    id: "C2", group: "C", issue: "#2017", name: "committed-edit-and-clear",
    title: "Edit areas and Clear selected areas",
    ac: "Editing and clearing are separate, named actions; clearing the whole set is confirmed and reversible.",
    intent: "Edit keeps the set and opens the draft editor. Clear destroys it, so it asks — and states exactly what will be left behind.",
    scopeKind: "areas", scopeShort: "3 areas",
    notes: N(Object.assign({ browserBack: "Restores the three-area committed state after a clear." }, EDIT_CLEAR)),
    tryIt: [{ label: "Edit the set", to: "B3" }, { label: "Confirm clear", to: "G1" }, { label: "Cancel", to: "C1" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", chips: THREE, note: "Nothing has been removed yet." },
      { t: "confirm", fromKind: "areas", from: "Hebbal + 2 areas", toKind: "areas", to: "No result scope", body: "Clearing removes all three chips and returns you to Hebbal · Yelahanka with no result scope. Your filters are kept.", actions: [{ label: "Clear all three", variant: "danger", to: "G1" }, { label: "Edit instead", to: "B3" }, { label: "Cancel", variant: "ghost", to: "C1" }] },
      { t: "heading", label: "Selected areas", value: "Hebbal · Nagawara · Jakkur", count: 95 },
      { t: "listings", ids: ["hebbal", "nagawara", "jakkur"], n: 2, dimmed: true },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara", { sel: true }), mkArea("jakkur", { sel: true })],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · 3 selected areas" } },
    },
    mobileCta: { label: "Clear all three", variant: "danger", to: "G1" },
  });

  push({
    id: "C3", group: "C", issue: "#2017", name: "committed-focus-one-chip",
    title: "Focusing one selected area without losing the others",
    ac: "Selecting one chip focuses that area on the map; the other areas remain in the result scope and in the combined total.",
    intent: "Focus is presentation. The heading still reads all three names and 95 listings; only the camera and the list order change, and the panel says so.",
    sync: "Nagawara's chip is filled and its marker is emphasised. The other two markers stay drawn — dimmed, not removed.",
    scopeKind: "areas", scopeShort: "3 areas · focus Nagawara",
    notes: N(Object.assign({ returnScope: "Fit all returns the camera to all three areas.", listMap: "Focus survives the List/Map toggle because it is a camera state, not a scope change." }, EDIT_CLEAR)),
    tryIt: [{ label: "Fit all three again", to: "C1" }, { label: "Non-contiguous example", to: "C4" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", chips: THREE, focusedId: "nagawara", note: "Focused on Nagawara. All three areas are still in your result scope.", actions: [{ label: "Fit all", variant: "navy", to: "C1" }] },
      { t: "heading", label: "Selected areas", value: "Hebbal · Nagawara · Jakkur", count: 95 },
      { t: "why", text: "The list is sorted to put Nagawara's 31 listings first. Nothing was removed — Hebbal and Jakkur follow below." },
      { t: "filters" },
      { t: "listings", label: "Nagawara first", ids: ["nagawara", "hebbal"], n: 4 },
    ],
    map: {
      fit: fitOf(["nagawara"]), maxZoom: 14,
      markers: [mkArea("nagawara", { sel: true }), mkArea("hebbal", { sel: true, dim: true }), mkArea("jakkur", { sel: true, dim: true })],
      overlay: { scopeBadge: { kind: "areas", label: "Focus · Nagawara (3 areas in scope)" }, buttons: [{ label: "Fit all", icon: "maximize", tone: "navy", to: "C1" }] },
    },
    mobileCta: { label: "Fit all three areas", variant: "navy", to: "C1" },
  });

  push({
    id: "C4", group: "C", issue: "#2017", name: "committed-non-contiguous",
    title: "Non-contiguous selection — Hebbal, Whitefield, JP Nagar",
    ac: "Areas that are not adjacent can be searched together; the combined results stay in one panel and Fit all frames the whole set.",
    intent: "Nothing in the design assumes the areas touch. The heading is still a set, the total is still a sum, and the map zooms out rather than picking a winner.",
    sync: "Fit all frames three corners of the city at once; each marker keeps its own count so the sum is checkable on screen.",
    scopeKind: "areas", scopeShort: "3 areas",
    notes: N(Object.assign({ hierBack: "Goes to Bangalore — the three areas share no parent below the city.", returnScope: "Fit all reframes without changing the set." }, EDIT_CLEAR)),
    tryIt: [{ label: "Focus Whitefield", to: "C5" }, { label: "Create an alert", to: "F1" }],
    blocks: [
      { t: "crumb", items: ["Bangalore"] },
      { t: "scopebar", kind: "areas", chips: [chip("hebbal"), chip("whitefield"), chip("jpnagar")], note: "These areas are not next to each other. That is allowed — they are searched as one set.", actions: [{ label: "Fit all", variant: "navy", to: "C4" }, { label: "Edit areas", to: "B3" }] },
      { t: "heading", label: "Selected areas", value: "Hebbal · Whitefield · JP Nagar", count: 144 },
      { t: "why", text: "144 = 42 + 64 + 38. The breadcrumb shows Bangalore because these three areas have no common parent below the city — this set is not a hierarchy node." },
      { t: "filters" },
      { t: "listings", label: "Homes for sale", ids: ["hebbal", "whitefield", "jpnagar"], n: 4 },
    ],
    map: {
      fit: fitOf(["hebbal", "whitefield", "jpnagar"]), maxZoom: 11,
      markers: [mkArea("hebbal", { sel: true }), mkArea("whitefield", { sel: true, action: { to: "C5" } }), mkArea("jpnagar", { sel: true })],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · 3 non-contiguous areas" }, buttons: [{ label: "Fit all", icon: "maximize", tone: "navy", to: "C4" }] },
    },
    mobileCta: { label: "Fit all three areas", variant: "navy", to: "C4" },
  });

  push({
    id: "C5", group: "C", issue: "#2017", name: "committed-focus-then-fit-all",
    title: "Focus one, then Fit all",
    ac: "Fit all is reachable from a focused state on both desktop and mobile and restores the camera without touching the scope.",
    intent: "Closes the loop on C3/C4: focus is always undoable from the map and from the panel, and the scope row never flickers.",
    scopeKind: "areas", scopeShort: "3 areas · focus Whitefield",
    notes: N(Object.assign({ listMap: "Fit all is in the map overlay and in the scope row, so it is reachable in either mobile presentation." }, EDIT_CLEAR)),
    tryIt: [{ label: "Fit all", to: "C4" }, { label: "Back to the contiguous set", to: "C1" }],
    blocks: [
      { t: "crumb", items: ["Bangalore"] },
      { t: "scopebar", kind: "areas", chips: [chip("hebbal"), chip("whitefield"), chip("jpnagar")], focusedId: "whitefield", note: "Focused on Whitefield. Hebbal and JP Nagar are still in scope.", actions: [{ label: "Fit all", variant: "navy", to: "C4" }] },
      { t: "heading", label: "Selected areas", value: "Hebbal · Whitefield · JP Nagar", count: 144 },
      { t: "why", text: "Whitefield's 64 listings are shown first. The total is still 144." },
      { t: "listings", label: "Whitefield first", ids: ["whitefield"], n: 4 },
    ],
    map: {
      fit: fitOf(["whitefield"]), maxZoom: 14,
      markers: [mkArea("whitefield", { sel: true })].concat(PRICE("whitefield", 4)),
      overlay: { scopeBadge: { kind: "areas", label: "Focus · Whitefield (3 areas in scope)" }, buttons: [{ label: "Fit all", icon: "maximize", tone: "navy", to: "C4" }] },
    },
    mobileCta: { label: "Fit all three areas", variant: "navy", to: "C4" },
  });

  // ============================ GROUP D ============================
  const SCHOOL_NOTE = "Schools located inside the areas you selected. This is context only — it does not filter or reorder your property results, and it does not mean every home is close to every school.";
  const BOUNDARY = [
    "It does not mean every home is close to every school.",
    "It is not a ranking or a quality judgement.",
    "It does not show travel time or catchment.",
    "Selecting a school does not change your property results.",
  ];

  push({
    id: "D1", group: "D", issue: "#2017", name: "schools-count-on-suggestion",
    title: "School count on a nearby-area suggestion",
    ac: "Nearby suggestions carry a school count alongside the listing count, with no implied relationship between the two.",
    intent: "Two independent facts about an area, printed as two independent facts — mono, side by side, separated by a middot, never combined into a score.",
    scopeKind: "areas", scopeShort: "1 area (draft)",
    notes: N({}),
    tryIt: [{ label: "Add Nagawara and commit", to: "D2" }, { label: "An area with 0 listings", to: "D4" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"] },
      { t: "scopebar", kind: "areas", draft: true, chips: [chip("hebbal")], note: "Draft — 1 of 3 areas." },
      { t: "draft", note: "Listing counts and school counts are separate facts about each area.", suggestions: [{ id: "nagawara", name: "Nagawara", listings: 31, schools: 9, rel: "Adjacent", to: "D2" }, { id: "jakkur", name: "Jakkur", listings: 22, schools: 7, rel: "3.4 km away", to: "D2" }] },
      { t: "callout", tone: "info", icon: "building", title: "What the school count means", body: "9 schools are located inside Nagawara. It is not a quality score, a distance, or a catchment." },
      { t: "actions", items: [{ label: "Show 42 listings", variant: "primary", to: "A1" }] },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara", { count: "31 listings · 9 schools", cta: "Tap to add", action: { to: "D2" } }), mkArea("jakkur", { count: "22 listings · 7 schools", cta: "Tap to add", action: { to: "D2" } })],
      overlay: { scopeBadge: { kind: "areas", label: "Draft scope · 1 of 3 areas" } },
    },
    mobileCta: { label: "Show 42 listings", to: "A1" },
  });

  push({
    id: "D2", group: "D", issue: "#2017", name: "schools-summary-committed",
    title: "School summary after committing three areas",
    ac: "The summary uses the exact framing “Schools in selected areas” and is visibly secondary to the property results.",
    intent: "The block sits below the result heading in plum — the school journey's colour — so it reads as informational context inside a property search, not a second search.",
    scopeKind: "areas", scopeShort: "3 areas",
    notes: N(EDIT_CLEAR),
    tryIt: [{ label: "List the schools", to: "D3" }, { label: "Read the boundary copy", to: "D5" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", chips: THREE, note: "Three areas, one combined result." },
      { t: "heading", label: "Selected areas", value: "Hebbal · Nagawara · Jakkur", count: 95 },
      { t: "schools", count: "27", note: SCHOOL_NOTE, actions: [{ label: "See the 27 schools", to: "D3" }] },
      { t: "filters" },
      { t: "listings", label: "Homes for sale", ids: ["hebbal", "nagawara", "jakkur"], n: 2 },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true, count: "42 listings · 11 schools" }), mkArea("nagawara", { sel: true, count: "31 listings · 9 schools" }), mkArea("jakkur", { sel: true, count: "22 listings · 7 schools" })],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · 3 selected areas" } },
    },
    mobileCta: { label: "See the 27 schools", variant: "outline", to: "D3" },
  });

  push({
    id: "D3", group: "D", issue: "#2017", name: "schools-expanded-list",
    title: "Expanded list — only schools inside the selected areas",
    ac: "The expanded list contains only schools located in the selected areas, grouped by area, with no ranking and no distance.",
    intent: "Grouping by area is the proof: every school is under the name of the area that contains it, so the boundary of the claim is visible in the layout itself.",
    scopeKind: "areas", scopeShort: "3 areas",
    notes: N(Object.assign({ propBack: "Opening a school does not change the property results; Back returns to this list with the scope intact." }, EDIT_CLEAR)),
    tryIt: [{ label: "Collapse the list", to: "D2" }, { label: "Boundary copy in full", to: "D5" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", chips: THREE },
      { t: "heading", label: "Selected areas", value: "Hebbal · Nagawara · Jakkur", count: 95 },
      {
        t: "schools", count: "27", note: SCHOOL_NOTE,
        items: [{ area: "Hebbal", list: R.SCHOOLS.hebbal }, { area: "Nagawara", list: R.SCHOOLS.nagawara }, { area: "Jakkur", list: R.SCHOOLS.jakkur }],
        actions: [{ label: "Collapse", variant: "ghost", to: "D2" }],
      },
      { t: "why", text: "Showing 10 of 27 named schools. Only schools inside Hebbal, Nagawara and Jakkur appear." },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true, count: "11 schools" }), mkArea("nagawara", { sel: true, count: "9 schools" }), mkArea("jakkur", { sel: true, count: "7 schools" })],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · 3 selected areas" } },
    },
    mobileCta: { label: "Collapse school list", variant: "outline", to: "D2" },
  });

  push({
    id: "D4", group: "D", issue: "#2017", name: "schools-zero-listings-four-schools",
    title: "A truthful area — 0 listings · 4 schools",
    ac: "An area with no listings but real schools is shown honestly: the property count is zero and the school count is not hidden or inflated.",
    intent: "The hardest honest case. Zero listings is stated plainly, the school fact is kept, and the recovery is a suggestion — never a silent broadening.",
    scopeKind: "areas", scopeShort: "Kodigehalli",
    notes: N({ hierBack: "Returns to Hebbal · Yelahanka with Kodigehalli still selectable.", clear: "Removes the chip; no results are restored because none were replaced." }),
    tryIt: [{ label: "Add Hebbal alongside it", to: "E2" }, { label: "Direct canonical empty area", to: "E6" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Kodigehalli"] },
      { t: "scopebar", kind: "areas", chips: [chip("kodigehalli")], note: "Kodigehalli is a real canonical area. It has no listings right now." },
      { t: "heading", label: "Selected areas", value: "Kodigehalli", count: 0, tone: "zero" },
      { t: "schools", count: "4", note: "Kodigehalli has 4 schools but no listings at the moment. We are not showing you homes from anywhere else." },
      { t: "callout", tone: "info", title: "0 listings · 4 schools", body: "This is the real state of the area, not an error and not an empty search. New listings appear here as soon as they are verified." },
      { t: "actions", items: [{ label: "Add a nearby area", variant: "primary", to: "E2" }, { label: "Create an alert for Kodigehalli", to: "F1" }] },
    ],
    map: {
      fit: fitOf(["kodigehalli", "hebbal", "sahakarnagar"]),
      markers: [mkArea("kodigehalli", { sel: true, count: "0 listings · 4 schools" }), mkArea("hebbal", { cta: "Tap to add", action: { to: "E2" } }), mkArea("sahakarnagar", { cta: "Tap to add", action: { to: "E2" } })],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · Kodigehalli (0 listings)" } },
    },
    mobileCta: { label: "Add a nearby area", to: "E2" },
  });

  push({
    id: "D5", group: "D", issue: "#2017", name: "schools-boundary-copy",
    title: "Supporting copy explaining the school boundary",
    ac: "Where the school block could be over-read, the design states in plain words what it does not claim.",
    intent: "One disclosure, four sentences, inside the same block — not a legal footer, not a tooltip.",
    scopeKind: "areas", scopeShort: "3 areas",
    notes: N(EDIT_CLEAR),
    tryIt: [{ label: "Back to the summary", to: "D2" }, { label: "See the list", to: "D3" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", chips: THREE },
      { t: "heading", label: "Selected areas", value: "Hebbal · Nagawara · Jakkur", count: 95 },
      { t: "schools", count: "27", note: SCHOOL_NOTE, boundary: BOUNDARY, actions: [{ label: "See the 27 schools", to: "D3" }, { label: "Collapse", variant: "ghost", to: "D2" }] },
      { t: "why", text: "Property results are unchanged by anything in the school block." },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara", { sel: true }), mkArea("jakkur", { sel: true })],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · 3 selected areas" } },
    },
    mobileCta: { label: "See the 27 schools", variant: "outline", to: "D3" },
  });

  // ============================ GROUP E ============================
  const ZERO_HEAD = { t: "heading", label: "Selected areas", value: "Hebbal · Nagawara · Jakkur", count: 0, tone: "zero" };
  const RELAX = [
    { label: "Increase maximum price to ₹60 lakh", count: 7, to: "C1" },
    { label: "Remove “Ready to move”", count: 4, to: "C1" },
    { label: "Include 2 BHK", count: 11, to: "C1" },
  ];

  push({
    id: "E1", group: "E", issue: "#2018", name: "zero-three-areas",
    title: "Zero results across three selected areas",
    ac: "A zero result keeps the chips, the filters and the map scope exactly as they were, and never broadens anything on its own.",
    intent: "The empty state is a report, not a dead end. Everything the user chose is still on screen and still says what it said before the search.",
    sync: "The three markers keep their selected treatment and show 0 with the current filters, so the map agrees with the panel.",
    scopeKind: "areas", scopeShort: "3 areas",
    notes: N(Object.assign({ browserBack: "Returns to the last state that had results." }, EDIT_CLEAR)),
    tryIt: [{ label: "Nearby alternatives", to: "E2" }, { label: "Relax one filter", to: "E5" }, { label: "Compare with a backend error", to: "E9" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", chips: THREE, note: "Kept exactly as you set them. We have not added or removed an area." },
      ZERO_HEAD,
      { t: "filters", chips: ZERO_FILTERS },
      { t: "callout", tone: "warn", title: "No homes match these filters in these three areas", body: "There are 95 listings across Hebbal, Nagawara and Jakkur, but none of them are 3 BHK, ready to move and under ₹45 lakh.", actions: [{ label: "Show nearby areas", variant: "primary", to: "E2" }, { label: "Change one filter", to: "E5" }] },
      { t: "why", text: "The list is empty because nothing matched — not because the request failed." },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true, count: "0 with your filters" }), mkArea("nagawara", { sel: true, count: "0 with your filters" }), mkArea("jakkur", { sel: true, count: "0 with your filters" })],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · 3 areas · 0 matches" } },
    },
    mobileCta: { label: "Show nearby areas", to: "E2" },
  });

  push({
    id: "E2", group: "E", issue: "#2018", name: "zero-nearby-alternatives",
    title: "Nearby alternatives with current-filter counts",
    ac: "Alternatives are counted with the filters the user actually has, and are offered — never applied.",
    intent: "Every number in the list is a promise the next screen must keep: 3 means three homes matching these exact filters, in that named area.",
    scopeKind: "areas", scopeShort: "3 areas",
    notes: N(EDIT_CLEAR),
    tryIt: [{ label: "Preview Kempapura", to: "E3" }, { label: "Or relax a filter instead", to: "E5" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", chips: THREE, note: "Unchanged. Adding an area below is an explicit action." },
      ZERO_HEAD,
      { t: "filters", chips: ZERO_FILTERS },
      {
        t: "alts", title: "Nearby areas that do match your filters", note: "Counts use your current filters. Adding one of these replaces an existing chip if you are already at three areas.",
        items: [
          { id: "kempapura", name: "Kempapura", rel: "1.9 km away", count: 3, schools: 3, actions: [{ label: "Preview", to: "E3" }, { label: "+ Add and search", variant: "primary", to: "E4" }] },
          { id: "amruthahalli", name: "Amruthahalli", rel: "4.1 km away", count: 2, schools: 5, actions: [{ label: "Preview", to: "E3" }, { label: "+ Add and search", variant: "outline", to: "E4" }] },
          { id: "sahakarnagar", name: "Sahakar Nagar", rel: "4.6 km away", count: 5, schools: 8, actions: [{ label: "Preview", to: "E3" }, { label: "+ Add and search", variant: "outline", to: "E4" }] },
        ],
      },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur", "kempapura", "sahakarnagar"]),
      markers: [mkArea("hebbal", { sel: true, count: "0 with your filters" }), mkArea("nagawara", { sel: true, count: "0 with your filters" }), mkArea("jakkur", { sel: true, count: "0 with your filters" }), mkArea("kempapura", { count: "3 with your filters", cta: "Tap to preview", action: { to: "E3" } }), mkArea("sahakarnagar", { count: "5 with your filters", cta: "Tap to preview", action: { to: "E3" } })],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · 3 areas · 0 matches" } },
    },
    mobileCta: { label: "Preview Kempapura", variant: "outline", to: "E3" },
  });

  push({
    id: "E3", group: "E", issue: "#2018", name: "zero-preview-before-add",
    title: "Previewing Kempapura before adding it",
    ac: "An alternative can be inspected without joining the result scope; the preview is labelled as not added.",
    intent: "Preview is a read-only expansion inside the recovery list, framed in copper and captioned Preview — not added yet, so it can never be mistaken for a committed change.",
    sync: "The Kempapura marker is outlined for preview but not filled — it is not in the scope.",
    scopeKind: "areas", scopeShort: "3 areas",
    notes: N(Object.assign({ browserBack: "Closing the preview leaves the three-area scope untouched." }, EDIT_CLEAR)),
    tryIt: [{ label: "Add Kempapura and search", to: "E4" }, { label: "Close the preview", to: "E2" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", chips: THREE, note: "Still three areas. Kempapura is not selected." },
      ZERO_HEAD,
      { t: "filters", chips: ZERO_FILTERS },
      {
        t: "alts", title: "Nearby areas that do match your filters",
        items: [
          {
            id: "kempapura", name: "Kempapura", rel: "1.9 km away", count: 3, schools: 3, preview: true,
            actions: [{ label: "Close", variant: "ghost", to: "E2" }],
            previewActions: [{ label: "Add Kempapura and search", variant: "primary", to: "E4" }, { label: "Not this one", variant: "ghost", to: "E2" }],
          },
        ],
      },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur", "kempapura"]),
      markers: [mkArea("hebbal", { sel: true, dim: true }), mkArea("nagawara", { sel: true, dim: true }), mkArea("jakkur", { sel: true, dim: true }), mkArea("kempapura", { count: "3 with your filters", cta: "Previewing — not added" })],
      overlay: { scopeBadge: { kind: "areas", label: "Preview · Kempapura not in scope" } },
    },
    mobileCta: { label: "Add Kempapura and search", to: "E4" },
  });

  push({
    id: "E4", group: "E", issue: "#2018", name: "zero-add-and-search",
    title: "Explicit add-and-search",
    ac: "Broadening the geography happens only through a named action, and the result names what changed.",
    intent: "After the explicit act, the panel reports the swap in words — which chip left, which arrived, and where the three results come from.",
    scopeKind: "areas", scopeShort: "3 areas",
    notes: N(Object.assign({ browserBack: "Returns to the zero-result state with the original three chips." }, EDIT_CLEAR)),
    tryIt: [{ label: "Undo — back to the original three", to: "E1" }, { label: "Create an alert for this set", to: "F1" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", chips: [chip("hebbal"), chip("nagawara"), chip("kempapura")], note: "You added Kempapura. Jakkur was released to stay within three areas.", actions: [{ label: "Undo", variant: "ghost", to: "E1" }] },
      { t: "heading", label: "Selected areas", value: "Hebbal · Nagawara · Kempapura", count: 3 },
      { t: "why", text: "All 3 matches are in Kempapura. Hebbal and Nagawara still return nothing with these filters — we have not changed your filters." },
      { t: "filters", chips: ZERO_FILTERS },
      { t: "listings", label: "Homes for sale", ids: ["kempapura"], n: 3 },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "kempapura"]),
      markers: [mkArea("hebbal", { sel: true, count: "0 with your filters" }), mkArea("nagawara", { sel: true, count: "0 with your filters" }), mkArea("kempapura", { sel: true, count: "3 with your filters" })],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · 3 areas · 3 matches" } },
    },
    mobileCta: { label: "Create an alert", variant: "outline", to: "F1" },
  });

  push({
    id: "E5", group: "E", issue: "#2018", name: "zero-filter-relaxation",
    title: "Filter-relaxation previews",
    ac: "Each relaxation names one filter change and the exact number of listings it would return; none is applied automatically.",
    intent: "One filter per row, one number per row. The geography is untouched and the copy says so.",
    scopeKind: "areas", scopeShort: "3 areas",
    notes: N(Object.assign({ browserBack: "Returns here with the original filters if a relaxation is applied and rejected." }, EDIT_CLEAR)),
    tryIt: [{ label: "Increase price to ₹60 lakh", to: "C1" }, { label: "Try nearby areas instead", to: "E2" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", chips: THREE, note: "Your areas are not part of these suggestions." },
      ZERO_HEAD,
      { t: "filters", chips: ZERO_FILTERS },
      { t: "relax", items: RELAX },
      { t: "actions", items: [{ label: "Or show nearby areas instead", variant: "outline", to: "E2" }] },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true, count: "0 with your filters" }), mkArea("nagawara", { sel: true, count: "0 with your filters" }), mkArea("jakkur", { sel: true, count: "0 with your filters" })],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · 3 areas · 0 matches" } },
    },
    mobileCta: { label: "Increase price to ₹60 lakh", to: "C1" },
  });

  push({
    id: "E6", group: "E", issue: "#2018", name: "zero-direct-canonical-area",
    title: "Direct canonical area with no current listings",
    ac: "An area reached directly — by link or by search — with no listings still renders as a real place, not as a failed search.",
    intent: "Arriving cold at an empty area should teach something: the area exists, this is what is here, and this is how to be told when that changes.",
    scopeKind: "areas", scopeShort: "Kodigehalli",
    notes: N({ hierBack: "Goes to Hebbal · Yelahanka — the parent of this canonical area.", browserBack: "Leaves the site if this was a cold deep link." }),
    tryIt: [{ label: "Alert me when listings appear", to: "F1" }, { label: "Show nearby areas", to: "E2" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Kodigehalli"] },
      { t: "scopebar", kind: "areas", chips: [chip("kodigehalli")], note: "You arrived directly at this area." },
      { t: "heading", label: "Selected areas", value: "Kodigehalli", count: 0, tone: "zero" },
      { t: "callout", tone: "info", title: "Kodigehalli has no listings yet", body: "The area is part of our canonical map of Bangalore and it has 4 schools, but nobody has listed a verified home here yet. We have not shown you homes from anywhere else." },
      { t: "schools", count: "4", note: SCHOOL_NOTE },
      { t: "actions", items: [{ label: "Alert me when listings appear", variant: "primary", to: "F1" }, { label: "Show nearby areas", to: "E2" }] },
    ],
    map: {
      fit: fitOf(["kodigehalli", "sahakarnagar"]),
      markers: [mkArea("kodigehalli", { sel: true, count: "0 listings · 4 schools" }), mkArea("sahakarnagar", { cta: "Tap to add", action: { to: "E2" } })],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · Kodigehalli" } },
    },
    mobileCta: { label: "Alert me when listings appear", to: "F1" },
  });

  push({
    id: "E7", group: "E", issue: "#2018", name: "zero-polygon",
    title: "Polygon zero-result state",
    ac: "A drawn area with no matches keeps the drawing and offers to widen the shape or change a filter — it does not silently expand the boundary.",
    intent: "The polygon stays on the map at full strength. Recovery is offered as two named, separate choices.",
    scopeKind: "polygon", scopeShort: "Drawn area",
    notes: N({ clear: "Removing the chip clears the drawing entirely.", edit: "Edit shape reopens the vertices — the design never nudges them for you." }),
    tryIt: [{ label: "Change one filter", to: "E5" }, { label: "Switch to selected areas", to: "A4" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "polygon", chips: [{ id: "poly", label: "Drawn area" }], note: "Your boundary is unchanged. We have not widened it." },
      { t: "heading", label: "Drawn area", value: "Your drawn boundary", count: 0, tone: "zero" },
      { t: "filters", chips: ZERO_FILTERS },
      { t: "callout", tone: "warn", title: "No homes match these filters inside your drawn area", body: "57 listings sit inside this boundary, but none of them are 3 BHK, ready to move and under ₹45 lakh.", actions: [{ label: "Change one filter", variant: "primary", to: "E5" }, { label: "Edit the shape", to: "A5" }] },
      { t: "relax", title: "One filter change", items: RELAX },
    ],
    map: {
      polygon: POLY, fit: POLY,
      markers: [],
      overlay: { scopeBadge: { kind: "polygon", label: "Result scope · Drawn area · 0 matches" }, buttons: [{ label: "Edit shape", to: "A5" }] },
    },
    mobileCta: { label: "Change one filter", to: "E5" },
  });

  push({
    id: "E8", group: "E", issue: "#2018", name: "zero-viewport",
    title: "Visible-map zero-result state with Return to previous areas",
    ac: "A zero result in a viewport scope always offers the return to the previously committed areas.",
    intent: "The most reversible empty state in the product: one tap restores a search that was known to work.",
    scopeKind: "viewport", scopeShort: "Map area",
    notes: N({ returnScope: "Return to Hebbal + Nagawara + Jakkur restores the previous committed set and its results.", commit: "Searching this area again after panning commits a different rectangle." }),
    tryIt: [{ label: "Return to the previous areas", to: "C1" }, { label: "Change one filter", to: "E5" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "viewport", chips: [{ id: "vp", label: "Visible map area" }], note: "This rectangle is what you committed. It has not been widened.", actions: [{ label: "Return to Hebbal + Nagawara + Jakkur", variant: "navy", to: "C1" }] },
      { t: "heading", label: "Visible map area", value: "This map view", count: 0, tone: "zero", sub: "listings in this view" },
      { t: "filters", chips: ZERO_FILTERS },
      { t: "callout", tone: "warn", title: "No homes match these filters in this map view", body: "Move the map and search again, change a filter, or go back to the three areas you had before.", actions: [{ label: "Return to previous areas", variant: "primary", to: "C1" }, { label: "Change one filter", to: "E5" }] },
    ],
    map: {
      fit: fitOf(["kodigehalli", "sahakarnagar", "amruthahalli"]), viewportFrame: true,
      markers: [],
      overlay: { scopeBadge: { kind: "viewport", label: "Result scope · Visible map area · 0" }, returnTo: { label: "Return to Hebbal + Nagawara + Jakkur", to: "C1" } },
    },
    mobileCta: { label: "Return to previous areas", to: "C1" },
  });

  push({
    id: "E9", group: "E", issue: "#2018", name: "error-backend-retry",
    title: "Backend error with Retry — visibly different from zero results",
    ac: "A backend failure is rendered in the error treatment with Retry and is never confusable with an honest zero result.",
    intent: "Different colour, different icon, different verb, different offer. Compare directly with E1: the empty state suggests, the error state retries.",
    scopeKind: "areas", scopeShort: "3 areas",
    notes: N(Object.assign({ browserBack: "Returns to the last successful result." }, EDIT_CLEAR)),
    tryIt: [{ label: "Retry", to: "C1" }, { label: "Compare with a true zero result", to: "E1" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", chips: THREE, note: "Your areas and filters are safe." },
      { t: "error", title: "We could not reach the listings service", body: "This is not a zero-result search. We do not know how many homes match — we could not ask. Nothing about your search has changed.", actions: [{ label: "Retry", variant: "primary", to: "C1" }, { label: "Edit areas", to: "B3" }] },
      { t: "filters", chips: ZERO_FILTERS },
      { t: "why", text: "No count is shown, because showing 0 here would be a false statement." },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true, count: "count unavailable" }), mkArea("nagawara", { sel: true, count: "count unavailable" }), mkArea("jakkur", { sel: true, count: "count unavailable" })],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · 3 areas · not loaded" } },
    },
    mobileCta: { label: "Retry", to: "C1" },
  });

  push({
    id: "E10", group: "E", issue: "#2018", name: "error-transient-keep-last-results",
    title: "Transient failure with last successful results retained",
    ac: "Where the previous results are still true for the current scope, they are retained and labelled as possibly out of date.",
    intent: "Retaining stale results is only honest when the scope did not change. The banner says when they were fetched and offers a refresh.",
    scopeKind: "areas", scopeShort: "3 areas",
    notes: N(Object.assign({ browserBack: "No new state was pushed — the refresh failed, the state did not change." }, EDIT_CLEAR)),
    tryIt: [{ label: "Refresh — succeeds", to: "C1" }, { label: "Hard failure instead", to: "E9" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", chips: THREE },
      { t: "callout", tone: "warn", title: "Showing your last successful results", body: "We could not refresh just now. These 95 listings are for the same three areas and the same filters, loaded 4 minutes ago. New listings since then may be missing.", actions: [{ label: "Refresh", variant: "primary", to: "C1" }] },
      { t: "heading", label: "Selected areas", value: "Hebbal · Nagawara · Jakkur", count: 95, sub: "listings · loaded 4 min ago" },
      { t: "listings", label: "Homes for sale", ids: ["hebbal", "nagawara", "jakkur"], n: 2 },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara", { sel: true }), mkArea("jakkur", { sel: true })],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · 3 areas · cached" } },
    },
    mobileCta: { label: "Refresh", to: "C1" },
  });

  push({
    id: "E11", group: "E", issue: "#2018", name: "zero-mobile-recovery",
    title: "Mobile recovery — actions before the map",
    ac: "On mobile the recovery actions appear above the fold; an oversized empty map never pushes them out of reach.",
    intent: "Mobile stays list-first even when the list is empty. The map is available on the toggle, not occupying the first screen.",
    scopeKind: "areas", scopeShort: "3 areas",
    notes: N(Object.assign({ listMap: "The empty map is one tap away, never the default. Fit all and Search this area live in the map presentation." }, EDIT_CLEAR)),
    tryIt: [{ label: "Nearby areas", to: "E2" }, { label: "Change one filter", to: "E5" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", chips: THREE },
      ZERO_HEAD,
      { t: "callout", tone: "warn", title: "No homes match these filters in these three areas", body: "Recovery actions stay directly under the heading on every screen size.", actions: [{ label: "Show nearby areas", variant: "primary", to: "E2" }, { label: "Change one filter", to: "E5" }] },
      { t: "relax", items: RELAX },
    ],
    mobileBlocks: [
      { t: "scopebar", kind: "areas", chips: THREE, note: "Kept exactly as you set them." },
      { t: "heading", label: "Selected areas", value: "Hebbal · Nagawara · Jakkur", count: 0, tone: "zero" },
      { t: "callout", tone: "warn", title: "No homes match these filters", body: "Nothing was broadened. Pick one recovery below.", actions: [{ label: "Show nearby areas", variant: "primary", to: "E2" }] },
      { t: "relax", items: RELAX },
      { t: "filters", chips: ZERO_FILTERS },
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true, count: "0 with your filters" }), mkArea("nagawara", { sel: true, count: "0 with your filters" }), mkArea("jakkur", { sel: true, count: "0 with your filters" })],
      overlay: { scopeBadge: { kind: "areas", label: "3 areas · 0 matches" } },
    },
    mobileCta: { label: "Show nearby areas", to: "E2" },
  });

  // ============================ GROUP F ============================
  const FILTER_SUMMARY = "Buy · up to ₹45 lakh · 3 BHK · ready to move";

  push({
    id: "F1", group: "F", issue: "#2019", name: "alert-create-selected-areas",
    title: "Create alert for selected areas — signed in",
    ac: "The alert confirmation restates the exact result scope and every filter before anything is saved, and defaults to Daily.",
    intent: "The summary table is the contract. Scope and filters are quoted back in the same words the search used, so there is nothing to infer.",
    scopeKind: "areas", scopeShort: "3 areas",
    notes: N(Object.assign({ browserBack: "Closes the sheet without creating an alert." }, EDIT_CLEAR)),
    tryIt: [{ label: "Create the alert", to: "F5" }, { label: "Saving fails", to: "F6" }, { label: "An unsupported filter", to: "F4" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", chips: THREE },
      { t: "alertform", title: "Create alert for 3 selected areas", scope: "Selected areas — Hebbal, Nagawara, Jakkur", filters: FILTER_SUMMARY, frequency: "Daily", actions: [{ label: "Create alert", variant: "primary", to: "F5" }, { label: "Cancel", variant: "ghost", to: "C1" }] },
      { t: "why", text: "Nothing is saved until you press Create alert." },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara", { sel: true }), mkArea("jakkur", { sel: true })],
      overlay: { scopeBadge: { kind: "areas", label: "Alert scope · 3 selected areas" } },
    },
    mobileCta: { label: "Create alert", to: "F5" },
  });

  push({
    id: "F2", group: "F", issue: "#2019", name: "alert-create-polygon",
    title: "Create alert for a drawn area",
    ac: "A polygon scope can be saved as an alert and is described as a drawn boundary, not as a list of areas.",
    intent: "The scope row of the summary names the shape and its vertex count so the saved alert is identifiable later in the management list.",
    scopeKind: "polygon", scopeShort: "Drawn area",
    notes: N({ clear: "Cancelling leaves the drawing in place." }),
    tryIt: [{ label: "Create the alert", to: "F5" }, { label: "Back to the polygon results", to: "A5" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "polygon", chips: [{ id: "poly", label: "Drawn area" }] },
      { t: "alertform", title: "Create alert for your drawn area", body: "We will watch the exact boundary you drew — not the areas it overlaps.", scope: "Drawn area — 5-point boundary around Hebbal and Nagawara", filters: FILTER_SUMMARY, frequency: "Daily", actions: [{ label: "Create alert", variant: "primary", to: "F5" }, { label: "Cancel", variant: "ghost", to: "A5" }] },
    ],
    map: { polygon: POLY, fit: POLY, markers: [], overlay: { scopeBadge: { kind: "polygon", label: "Alert scope · Drawn area" } } },
    mobileCta: { label: "Create alert", to: "F5" },
  });

  push({
    id: "F3", group: "F", issue: "#2019", name: "alert-create-viewport",
    title: "Create alert for the visible map area",
    ac: "A viewport scope can be saved and is described as a fixed rectangle, with a warning that it will not follow the map.",
    intent: "The one case that needs an extra sentence: the saved rectangle is frozen at creation time. Saying so here prevents a broken expectation later.",
    scopeKind: "viewport", scopeShort: "Map area",
    notes: N({ returnScope: "Cancelling returns to the viewport results with the return-to-areas action intact." }),
    tryIt: [{ label: "Create the alert", to: "F5" }, { label: "Back to the map results", to: "A7" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "viewport", chips: [{ id: "vp", label: "Visible map area" }] },
      { t: "alertform", title: "Create alert for this map area", body: "We save the rectangle as it is now. It will not move if you pan the map later.", scope: "Visible map area — fixed rectangle around Jakkur, Yelahanka and Amruthahalli", filters: FILTER_SUMMARY, frequency: "Daily", actions: [{ label: "Create alert", variant: "primary", to: "F5" }, { label: "Cancel", variant: "ghost", to: "A7" }] },
    ],
    map: { fit: fitOf(["jakkur", "yelahanka", "amruthahalli"]), viewportFrame: true, markers: [], overlay: { scopeBadge: { kind: "viewport", label: "Alert scope · Visible map area" } } },
    mobileCta: { label: "Create alert", to: "F5" },
  });

  push({
    id: "F4", group: "F", issue: "#2019", name: "alert-unsupported-filter",
    title: "Unsupported-filter disclosure",
    ac: "A filter that alerts cannot honour is disclosed and kept visible — it is never silently dropped from the saved search.",
    intent: "The filter stays in the summary, labelled Not included, so the alert the user receives can be reconciled against the search they saved.",
    scopeKind: "areas", scopeShort: "3 areas",
    notes: N(EDIT_CLEAR),
    tryIt: [{ label: "Create anyway", to: "F5" }, { label: "Cancel", to: "C1" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", chips: THREE },
      {
        t: "alertform", title: "Create alert for 3 selected areas",
        scope: "Selected areas — Hebbal, Nagawara, Jakkur", filters: FILTER_SUMMARY, notIncluded: "“Ready to move” — alerts cannot match on possession status yet",
        unsupported: { title: "One filter will not be applied to this alert", body: "Alerts cannot filter on possession status yet, so you may be emailed about homes that are not ready to move. We have kept the filter listed above rather than removing it from your saved search." },
        frequency: "Daily", actions: [{ label: "Create alert anyway", variant: "primary", to: "F5" }, { label: "Cancel", variant: "ghost", to: "C1" }],
      },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara", { sel: true }), mkArea("jakkur", { sel: true })],
      overlay: { scopeBadge: { kind: "areas", label: "Alert scope · 3 selected areas" } },
    },
    mobileCta: { label: "Create alert anyway", to: "F5" },
  });

  push({
    id: "F5", group: "F", issue: "#2019", name: "alert-created",
    title: "Alert created successfully",
    ac: "Success is only shown once the alert is durably saved, and the confirmation repeats the scope, filters and frequency.",
    intent: "The success message is small, specific and links straight to management — no celebratory language, no ambiguity about what was saved.",
    scopeKind: "areas", scopeShort: "3 areas",
    notes: N(Object.assign({ browserBack: "Returns to the results; the alert stays created." }, EDIT_CLEAR)),
    tryIt: [{ label: "Manage alerts", to: "F8" }, { label: "Back to results", to: "C1" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "callout", tone: "ok", icon: "check", title: "Alert saved", body: "Daily email for Hebbal, Nagawara and Jakkur — Buy, up to ₹45 lakh, 3 BHK, ready to move. Saved to your account.", actions: [{ label: "Manage alerts", variant: "outline", to: "F8" }, { label: "Back to results", variant: "ghost", to: "C1" }] },
      { t: "scopebar", kind: "areas", chips: THREE, note: "Your search is unchanged — creating an alert does not alter the result scope." },
      { t: "heading", label: "Selected areas", value: "Hebbal · Nagawara · Jakkur", count: 95 },
      { t: "listings", label: "Homes for sale", ids: ["hebbal", "nagawara", "jakkur"], n: 2 },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara", { sel: true }), mkArea("jakkur", { sel: true })],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · 3 selected areas" } },
    },
    mobileCta: { label: "Manage alerts", variant: "outline", to: "F8" },
  });

  push({
    id: "F6", group: "F", issue: "#2019", name: "alert-persistence-failed",
    title: "Alert persistence failure with Retry",
    ac: "If the alert did not save, no success message is shown; the form is preserved and Retry is offered.",
    intent: "The rule is absolute — success language appears only after durable persistence. Everything the user typed survives the failure.",
    scopeKind: "areas", scopeShort: "3 areas",
    notes: N(EDIT_CLEAR),
    tryIt: [{ label: "Retry — succeeds", to: "F5" }, { label: "Cancel", to: "C1" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "error", title: "Your alert was not saved", body: "We could not reach your account. Nothing has been created — you will not receive emails for this search yet. Your settings below are still here.", actions: [{ label: "Retry", variant: "primary", to: "F5" }, { label: "Cancel", variant: "ghost", to: "C1" }] },
      { t: "alertform", title: "Create alert for 3 selected areas", scope: "Selected areas — Hebbal, Nagawara, Jakkur", filters: FILTER_SUMMARY, frequency: "Daily", actions: [{ label: "Retry saving", variant: "primary", to: "F5" }] },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara", { sel: true }), mkArea("jakkur", { sel: true })],
      overlay: { scopeBadge: { kind: "areas", label: "Alert scope · 3 selected areas" } },
    },
    mobileCta: { label: "Retry saving", to: "F5" },
  });

  push({
    id: "F7", group: "F", issue: "#2019", name: "alert-anonymous",
    title: "Anonymous user — sign in to create an alert",
    ac: "An anonymous user is told an account is required, keeps their search across sign-in, and is offered the Request a property fallback.",
    intent: "The search is the thing worth protecting. Both paths — sign in, or ask us directly — are offered without implying an alert was created.",
    scopeKind: "areas", scopeShort: "3 areas", signedOut: true,
    notes: N(Object.assign({ browserBack: "Returns to the results with the same three chips; nothing was saved." }, EDIT_CLEAR)),
    tryIt: [{ label: "Sign in and create", to: "F1" }, { label: "Request a property", to: "F7" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", chips: THREE, note: "We will keep these three areas and your filters through sign-in." },
      { t: "callout", tone: "info", title: "Sign in to create an alert", body: "Alerts are emailed, so they need an account. Your search — Hebbal, Nagawara and Jakkur with your current filters — is kept exactly as it is while you sign in.", actions: [{ label: "Sign in and create alert", variant: "primary", to: "F1" }] },
      { t: "callout", tone: "accent", icon: "message-circle", title: "Or tell us what you are looking for", body: "Request a property and a verified broker will come back to you. This is not an alert and does not create one — no email subscription is set up.", actions: [{ label: "Request a property", variant: "outline", to: "F7" }] },
      { t: "heading", label: "Selected areas", value: "Hebbal · Nagawara · Jakkur", count: 95 },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara", { sel: true }), mkArea("jakkur", { sel: true })],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · 3 selected areas" } },
    },
    mobileCta: { label: "Sign in and create alert", to: "F1" },
  });

  push({
    id: "F8", group: "F", issue: "#2019", name: "alert-management",
    title: "Alert management — active, paused, frequency, last checked",
    ac: "Every saved alert shows its scope kind, filters, status, frequency, last-checked time and new matches, with manage and delete available.",
    intent: "One row per alert, with the scope glyph doing the work of saying whether it is areas, a drawing or a rectangle — the same three glyphs used in the chips.",
    scopeKind: "areas", scopeShort: "Saved searches",
    notes: N({ hierBack: "This page sits outside the Discover hierarchy; Back returns to the last Discover state.", browserBack: "Returns to the results you came from." }),
    tryIt: [{ label: "Pause the first alert", to: "F9" }, { label: "Open a notification deep link", to: "F10" }],
    blocks: [
      { t: "crumb", items: ["Your account", "Saved searches"] },
      { t: "heading", label: "Saved searches", value: "Your alerts", count: 3, sub: "saved searches" },
      {
        t: "alertlist", items: [
          { name: "Hebbal · Nagawara · Jakkur", kind: "areas", status: "Active", filters: "Buy · up to ₹45 lakh · 3 BHK · ready to move", frequency: "Daily", lastChecked: "today, 07:02", newMatches: 4, actions: [{ label: "Open", variant: "navy", to: "F10" }, { label: "Pause", to: "F9" }, { label: "Delete", variant: "danger", to: "F9" }] },
          { name: "Drawn area near Hebbal lake", kind: "polygon", status: "Paused", filters: "Buy · ₹1–2 Cr · any BHK", frequency: "Weekly", lastChecked: "12 Jul, 07:00", newMatches: 0, actions: [{ label: "Resume", variant: "navy", to: "F9" }, { label: "Delete", variant: "danger", to: "F9" }] },
          { name: "Map area — Whitefield", kind: "viewport", status: "Active", filters: "Rent · up to ₹45,000/mo · 2 BHK+", frequency: "Instant", lastChecked: "today, 09:41", newMatches: 2, actions: [{ label: "Open", variant: "navy", to: "F10" }, { label: "Pause", to: "F9" }] },
        ],
      },
      { t: "why", text: "A paused alert keeps its scope and filters. It is not deleted and it is not silently resumed." },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur", "whitefield"]), maxZoom: 11,
      markers: [mkArea("hebbal", { sel: true, count: "alert" }), mkArea("whitefield", { count: "alert" })],
      overlay: { scopeBadge: { kind: "areas", label: "3 saved searches" } },
    },
    mobileCta: { label: "Create a new alert", variant: "outline", to: "F1" },
  });

  push({
    id: "F9", group: "F", issue: "#2019", name: "alert-pause-resume-delete",
    title: "Pause, resume and delete confirmations",
    ac: "Pause and resume are immediate and reversible; delete is confirmed and states that the saved scope and filters will be lost.",
    intent: "Two reversible actions and one destructive one, weighted accordingly — only the destructive one interrupts.",
    scopeKind: "areas", scopeShort: "Saved searches",
    notes: N({ browserBack: "Returns to the alert list with no change applied." }),
    tryIt: [{ label: "Confirm delete", to: "F8" }, { label: "Cancel", to: "F8" }],
    blocks: [
      { t: "crumb", items: ["Your account", "Saved searches"] },
      { t: "callout", tone: "ok", icon: "check", title: "Paused — Drawn area near Hebbal lake", body: "We will stop emailing you about this search. Its boundary and filters are kept so you can resume it any time.", actions: [{ label: "Resume now", variant: "outline", to: "F8" }] },
      { t: "confirm", fromKind: "areas", from: "Hebbal · Nagawara · Jakkur", toKind: "areas", to: "Deleted", body: "Deleting removes the saved scope, the filters and the alert history. This cannot be undone — pause it instead if you may want it back.", actions: [{ label: "Delete alert", variant: "danger", to: "F8" }, { label: "Pause instead", to: "F8" }, { label: "Cancel", variant: "ghost", to: "F8" }] },
      {
        t: "alertlist", items: [
          { name: "Map area — Whitefield", kind: "viewport", status: "Active", filters: "Rent · up to ₹45,000/mo · 2 BHK+", frequency: "Instant", lastChecked: "today, 09:41", newMatches: 2, actions: [{ label: "Pause", to: "F9" }] },
        ],
      },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true, dim: true }), mkArea("nagawara", { sel: true, dim: true }), mkArea("jakkur", { sel: true, dim: true })],
      overlay: { scopeBadge: { kind: "areas", label: "Saved search · pending delete" } },
    },
    mobileCta: { label: "Delete alert", variant: "danger", to: "F8" },
  });

  push({
    id: "F10", group: "F", issue: "#2019", name: "alert-deeplink-restored",
    title: "Notification deep link with the exact saved search restored",
    ac: "Opening an alert email restores the saved result scope and filters exactly, and says what has changed since the last check.",
    intent: "The deep link lands in the ordinary results view — same chips, same filters, same total — with one banner explaining why the user is here.",
    sync: "The map is fitted to the saved area set, not to the new listings, so the restored scope is what is framed.",
    scopeKind: "areas", scopeShort: "3 areas",
    notes: N(Object.assign({ browserBack: "Leaves the site — this was a cold entry from an email.", hierBack: "Goes to Hebbal · Yelahanka, the canonical parent of the saved areas." }, EDIT_CLEAR)),
    tryIt: [{ label: "Show all 95 listings", to: "C1" }, { label: "Manage this alert", to: "F8" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "callout", tone: "accent", icon: "star", title: "From your daily alert · 4 new since 25 Jul", body: "Your saved search has been restored exactly: Hebbal, Nagawara and Jakkur with Buy, up to ₹45 lakh, 3 BHK, ready to move.", actions: [{ label: "Show all 95 listings", variant: "outline", to: "C1" }, { label: "Manage this alert", variant: "ghost", to: "F8" }] },
      { t: "scopebar", kind: "areas", chips: THREE, note: "Restored from your saved search — not re-derived from the map." },
      { t: "heading", label: "Selected areas", value: "Hebbal · Nagawara · Jakkur", count: 4, sub: "new listings" },
      { t: "filters", chips: ZERO_FILTERS },
      { t: "listings", label: "New since your last alert", ids: ["hebbal", "nagawara"], n: 4 },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara", { sel: true }), mkArea("jakkur", { sel: true })],
      overlay: { scopeBadge: { kind: "areas", label: "Restored · 3 selected areas" } },
    },
    mobileCta: { label: "Show all 95 listings", variant: "outline", to: "C1" },
  });
})();

// State manifest — Groups A (result-scope foundation), B (multi-area editing),
// G (map ↔ panel synchronisation). Each entry is one named, linkable mock.
(function () {
  const R = window.RS, A = R.A;
  if (window.__RS_STATES_A) return;
  window.__RS_STATES_A = 1;
  window.RS_STATES = [];
  const push = (s) => window.RS_STATES.push(s);

  const CRUMB = ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"];
  const chip = (id) => ({ id, label: A[id].name });
  const mkArea = (id, o) => Object.assign({ kind: "area", id, lat: A[id].lat, lon: A[id].lon, name: A[id].name, count: `${A[id].listings} listings` }, o || {});
  const fitOf = (ids) => ids.map((i) => [A[i].lat, A[i].lon]);
  const POLY = [[13.0530, 77.5840], [13.0585, 77.6190], [13.0365, 77.6335], [13.0215, 77.6055], [13.0300, 77.5845]];
  const N = (o) => Object.assign({
    hierBack: "Goes to the canonical parent, Hebbal · Yelahanka. It does not clear the result scope.",
    browserBack: "Goes to the previous committed state — not the parent node.",
    listMap: "Presentation only. Same result scope, same listings.",
  }, o || {});

  const PRICE = (id, n) => R.listingsFor([id], n).map((l) => ({ kind: "price", lat: l.lat, lon: l.lon, label: R.inr(l.price) }));

  // ============================ GROUP A ============================
  push({
    id: "A1", group: "A", issue: "#2016", name: "scope-single-area",
    title: "Single selected area with a result-scope chip",
    ac: "The active result scope is exactly one of selected areas / drawn polygon / visible map area, and is always named on screen above the results.",
    intent: "Establishes the four-part model on one screen: the breadcrumb is canonical navigation, the chip row is the result scope, the filter row is property filters, and the map is presentation. None of them borrow each other's shape.",
    sync: "The Hebbal marker is filled navy with a copper check because Hebbal is in the result scope; the neighbouring markers are ordinary canonical-area pins that would join the scope if tapped.",
    scopeKind: "areas", scopeShort: "Hebbal",
    notes: N({ edit: "Opens the draft chip editor with Hebbal pre-selected. Results do not change until Search is pressed.", clear: "Removes every chip and returns to the Hebbal · Yelahanka node with no result scope.", commit: "Not offered here — the scope is already committed." }),
    tryIt: [{ label: "Edit areas → draft editor", to: "B1" }, { label: "Draw an area instead", to: "A2" }, { label: "Move the map (camera only)", to: "A6" }],
    blocks: [
      { t: "crumb", items: CRUMB },
      { t: "scopebar", kind: "areas", chips: [chip("hebbal")], note: "Listings below are for Hebbal only. Moving the map does not change this.", actions: [{ label: "Edit areas", to: "B1" }, { label: "Draw an area", to: "A2" }] },
      { t: "heading", label: "Selected areas", value: "Hebbal", count: 42 },
      { t: "filters" },
      { t: "listings", label: "Homes for sale", ids: ["hebbal"], n: 4 },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur", "kempapura"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara"), mkArea("jakkur"), mkArea("kempapura")],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · Hebbal" }, crumb: "Hebbal · Yelahanka", legend: true, buttons: [{ label: "Draw an area", icon: "sliders-horizontal", to: "A2" }] },
    },
    mobileCta: { label: "Edit areas", variant: "outline", to: "B1" },
  });

  push({
    id: "A2", group: "A", issue: "#2016", name: "scope-replace-areas-with-polygon",
    title: "Selected areas replaced by a polygon — confirmation",
    ac: "Changing result-scope kind is an explicit, confirmed replacement; the two scopes never combine silently.",
    intent: "A drawn polygon cannot coexist with selected areas. The confirmation names what is being dropped and what replaces it, in the chip vocabulary the user already sees.",
    sync: "The map shows the drawn boundary and keeps the Hebbal pin visible but unselected, so it is clear the area chip is being retired, not merged.",
    scopeKind: "polygon", scopeShort: "Drawn area",
    notes: N({ browserBack: "Cancelling — or Browser Back — restores the Hebbal selected-area scope untouched.", commit: "Replace scope commits the polygon. Nothing changes until then." }),
    tryIt: [{ label: "Replace with drawn area", to: "A5" }, { label: "Keep selected areas", to: "A1" }],
    blocks: [
      { t: "crumb", items: CRUMB },
      { t: "confirm", fromKind: "areas", from: "Hebbal", toKind: "polygon", to: "Drawn area", body: "A drawn area replaces your selected areas — the two cannot be combined. Your filters stay exactly as they are.", actions: [{ label: "Replace scope", variant: "primary", to: "A5" }, { label: "Keep Hebbal", to: "A1" }] },
      { t: "why", text: "Results below are still for Hebbal. They will not change until you confirm." },
      { t: "heading", label: "Selected areas", value: "Hebbal", count: 42 },
      { t: "listings", ids: ["hebbal"], n: 2, dimmed: true },
    ],
    map: {
      polygon: POLY, fit: POLY,
      markers: [mkArea("hebbal", { dim: true }), mkArea("nagawara", { dim: true })],
      overlay: { scopeBadge: { kind: "polygon", label: "Drawn area — not applied yet" }, buttons: [{ label: "Redraw", to: "A2" }, { label: "Discard drawing", to: "A1" }] },
    },
    mobileCta: { label: "Replace scope with drawn area", to: "A5" },
  });

  push({
    id: "A3", group: "A", issue: "#2015", name: "scope-replace-areas-with-viewport",
    title: "Selected areas replaced by visible map area — confirmation",
    ac: "Search this area commits the visible map area as the result scope and explicitly replaces any selected areas.",
    intent: "Search this area is a commitment, not a camera move. The confirmation shows the trade explicitly and offers the return path before it happens.",
    sync: "The dashed frame is the exact rectangle that would become the scope; the three area chips are shown greyed in the 'Now' slot of the confirmation.",
    scopeKind: "viewport", scopeShort: "Map area",
    notes: N({ returnScope: "After replacing, Return to Hebbal + Nagawara + Jakkur restores the committed area set.", commit: "Search this area is the commitment point." }),
    tryIt: [{ label: "Search this area", to: "A8" }, { label: "Keep the three areas", to: "C1" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "confirm", fromKind: "areas", from: "Hebbal + 2 areas", toKind: "viewport", to: "Visible map area", body: "Searching this area replaces your three selected areas with whatever is currently on screen. You can return to them afterwards.", actions: [{ label: "Search this area", variant: "primary", to: "A8" }, { label: "Keep selected areas", to: "C1" }] },
      { t: "why", text: "Results below are still for the three selected areas." },
      { t: "heading", label: "Selected areas", value: "Hebbal · Nagawara · Jakkur", count: 95 },
      { t: "listings", ids: ["hebbal", "nagawara", "jakkur"], n: 2, dimmed: true },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur", "thanisandra"]), viewportFrame: true,
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara", { sel: true }), mkArea("jakkur", { sel: true }), mkArea("thanisandra")],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · 3 selected areas" }, searchThisArea: { to: "A8", sub: "Replaces your selected areas" } },
    },
    mobileCta: { label: "Search this area", to: "A8" },
  });

  push({
    id: "A4", group: "A", issue: "#2016", name: "scope-replace-polygon-with-areas",
    title: "Polygon replaced by selected areas — confirmation",
    ac: "The replacement contract is symmetric: choosing areas while a polygon is active discards the polygon with the same confirmation.",
    intent: "The same component, reversed. Nothing about the replacement reads as 'adding to' the drawn area.",
    sync: "The polygon is still drawn but shown as retiring; the tapped Nagawara pin is pre-selected in the 'After' chip.",
    scopeKind: "areas", scopeShort: "Nagawara",
    notes: N({ browserBack: "Cancelling keeps the drawn area exactly as drawn." }),
    tryIt: [{ label: "Replace with Nagawara", to: "B1" }, { label: "Keep the drawn area", to: "A5" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Nagawara"] },
      { t: "confirm", fromKind: "polygon", from: "Drawn area", toKind: "areas", to: "Nagawara", body: "Selecting an area discards your drawing. The drawn boundary is not kept as a filter on top of the area.", actions: [{ label: "Use Nagawara instead", variant: "primary", to: "B1" }, { label: "Keep the drawn area", to: "A5" }] },
      { t: "why", text: "Results below are still for the drawn area." },
      { t: "heading", label: "Drawn area", value: "Your drawn boundary", count: 57 },
      { t: "listings", ids: ["hebbal", "nagawara"], n: 2, dimmed: true },
    ],
    map: {
      polygon: POLY, fit: POLY,
      markers: [mkArea("nagawara"), mkArea("hebbal", { dim: true })],
      overlay: { scopeBadge: { kind: "polygon", label: "Result scope · Drawn area" } },
    },
    mobileCta: { label: "Use Nagawara instead", to: "B1" },
  });

  push({
    id: "A5", group: "A", issue: "#2016", name: "scope-polygon-active",
    title: "Active polygon result state",
    ac: "A committed polygon scope is named, removable, and reported with an honest count of what falls inside it.",
    intent: "The polygon behaves exactly like an area chip in the scope row — one chip, one ×, one honest total — so the three scope kinds are interchangeable in grammar but never in meaning.",
    sync: "The panel total counts only listings inside the boundary; areas that merely touch the boundary are not folded in.",
    scopeKind: "polygon", scopeShort: "Drawn area",
    notes: N({ hierBack: "Still goes to Hebbal · Yelahanka. A drawn area is not a hierarchy node.", clear: "Removing the chip clears the drawing and leaves you with no result scope.", edit: "Edit shape reopens the draw tool with the existing vertices." }),
    tryIt: [{ label: "Switch to selected areas", to: "A4" }, { label: "Create an alert for this shape", to: "F2" }, { label: "Show the zero-result case", to: "E7" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "polygon", chips: [{ id: "poly", label: "Drawn area" }], note: "57 listings fall inside the boundary you drew. Listings just outside it are not included.", actions: [{ label: "Edit shape", to: "A5" }, { label: "Create alert", to: "F2" }] },
      { t: "heading", label: "Drawn area", value: "Your drawn boundary", count: 57 },
      { t: "filters" },
      { t: "listings", label: "Homes for sale", ids: ["hebbal", "nagawara"], n: 4 },
    ],
    map: {
      polygon: POLY, fit: POLY,
      markers: PRICE("hebbal", 4).concat(PRICE("nagawara", 3)),
      overlay: { scopeBadge: { kind: "polygon", label: "Result scope · Drawn area" }, buttons: [{ label: "Edit shape", to: "A5" }, { label: "Clear drawing", to: "A4" }] },
    },
    mobileCta: { label: "Create alert for this shape", variant: "outline", to: "F2" },
  });

  push({
    id: "A6", group: "A", issue: "#2015", name: "camera-moved-results-unchanged",
    title: "Camera moved, results unchanged",
    ac: "Panning or zooming never changes the result scope; the pending offer to re-scope is explicit and reversible.",
    intent: "The single most confusable pair in the whole feature. The results keep their old, still-true heading; the map states plainly that it has moved; Search this area is the only bridge between them.",
    sync: "Markers for the current viewport are drawn faintly and carry no counts, because they are not part of any result yet.",
    scopeKind: "areas", scopeShort: "Hebbal",
    notes: N({ browserBack: "No history entry was created — the camera move is not a state.", commit: "Search this area commits the visible map area and replaces the Hebbal chip." }),
    tryIt: [{ label: "Search this area", to: "A7" }, { label: "Recentre on Hebbal", to: "A1" }],
    blocks: [
      { t: "crumb", items: CRUMB },
      { t: "stale", title: "The map has moved — these results have not", body: "You are looking at Jakkur and Yelahanka, but the listings below are still the 42 in Hebbal. Search this area to make the visible map area your result scope.", actions: [{ label: "Search this area", variant: "primary", to: "A7" }, { label: "Recentre on Hebbal", to: "A1" }] },
      { t: "scopebar", kind: "areas", chips: [chip("hebbal")], note: "Unchanged. Your result scope is still Hebbal." },
      { t: "heading", label: "Selected areas", value: "Hebbal", count: 42 },
      { t: "listings", label: "Homes for sale in Hebbal", ids: ["hebbal"], n: 4 },
    ],
    map: {
      fit: fitOf(["jakkur", "yelahanka", "amruthahalli"]),
      markers: [mkArea("jakkur", { dim: true, cta: "Not in your results" }), mkArea("yelahanka", { dim: true, cta: "Not in your results" }), mkArea("amruthahalli", { dim: true, cta: "Not in your results" })],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · still Hebbal" }, crumb: "Camera moved — scope unchanged", searchThisArea: { to: "A7", sub: "Replaces Hebbal with what you see" } },
    },
    mobileCta: { label: "Search this area", to: "A7" },
  });

  push({
    id: "A7", group: "A", issue: "#2015", name: "viewport-scope-active",
    title: "Active visible-map result state",
    ac: "A committed viewport scope is labelled Visible map area and always offers a return to the previous area scope.",
    intent: "Once committed, the viewport is a first-class scope with its own chip — and the escape hatch back to the named areas is permanent, not a toast.",
    sync: "The dashed frame marks the exact committed rectangle; if the user pans again, state A6's stale banner returns for this scope too.",
    scopeKind: "viewport", scopeShort: "Map area",
    notes: N({ returnScope: "Return to Hebbal restores the selected-area scope and its 42 listings.", hierBack: "Still goes to Hebbal · Yelahanka. The viewport is not a hierarchy node.", clear: "Removing the chip leaves no result scope and returns you to the area picker." }),
    tryIt: [{ label: "Return to Hebbal", to: "A1" }, { label: "Create an alert for this view", to: "F3" }, { label: "Zero results in this view", to: "E8" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "viewport", chips: [{ id: "vp", label: "Visible map area" }], note: "These results follow the map rectangle you committed. Panning the map will not update them until you press Search this area again.", actions: [{ label: "Return to Hebbal", variant: "navy", to: "A1" }, { label: "Create alert", to: "F3" }] },
      { t: "heading", label: "Visible map area", value: "Jakkur · Yelahanka · Amruthahalli", count: 68, sub: "listings in this view" },
      { t: "why", text: "The panel list changed because you committed a new result scope, not because the map moved." },
      { t: "filters" },
      { t: "listings", label: "Homes for sale", ids: ["jakkur", "yelahanka"], n: 4 },
    ],
    map: {
      fit: fitOf(["jakkur", "yelahanka", "amruthahalli"]), viewportFrame: true,
      markers: PRICE("jakkur", 4).concat(PRICE("yelahanka", 3)),
      overlay: { scopeBadge: { kind: "viewport", label: "Result scope · Visible map area" }, returnTo: { label: "Return to Hebbal", to: "A1" } },
    },
    mobileCta: { label: "Return to Hebbal", variant: "navy", to: "A1" },
  });

  push({
    id: "A8", group: "A", issue: "#2015", name: "viewport-scope-from-three-areas",
    title: "Visible-map result state entered from three selected areas",
    ac: "The return affordance names every area it will restore, however many there were.",
    intent: "Proves the return path is data, not copy: it lists all three names rather than a generic 'previous search'.",
    sync: "The three original areas stay drawn as faint pins inside the frame so the user can see what they left.",
    scopeKind: "viewport", scopeShort: "Map area",
    notes: N({ returnScope: "Return to Hebbal + Nagawara + Jakkur restores all three chips and the 95-listing total.", browserBack: "Also returns to the three-area committed state." }),
    tryIt: [{ label: "Return to all three areas", to: "C1" }, { label: "Create an alert for this view", to: "F3" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "viewport", chips: [{ id: "vp", label: "Visible map area" }], note: "Your three selected areas were replaced when you searched this area.", actions: [{ label: "Return to Hebbal + Nagawara + Jakkur", variant: "navy", to: "C1" }] },
      { t: "heading", label: "Visible map area", value: "This map view", count: 73, sub: "listings in this view" },
      { t: "why", text: "Rows changed because the result scope changed from three named areas to the map rectangle." },
      { t: "filters" },
      { t: "listings", label: "Homes for sale", ids: ["hebbal", "nagawara", "thanisandra"], n: 4 },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur", "thanisandra"]), viewportFrame: true,
      markers: [mkArea("hebbal", { dim: true }), mkArea("nagawara", { dim: true }), mkArea("jakkur", { dim: true })],
      overlay: { scopeBadge: { kind: "viewport", label: "Result scope · Visible map area" }, returnTo: { label: "Return to Hebbal + Nagawara + Jakkur", to: "C1" } },
    },
    mobileCta: { label: "Return to Hebbal + Nagawara + Jakkur", variant: "navy", to: "C1" },
  });

  push({
    id: "A9", group: "A", issue: "#2016", name: "scope-change-loading",
    title: "Loading while changing result scope",
    ac: "While a scope change is in flight the new scope is already named, the old results are not passed off as new, and the chips are never lost.",
    intent: "The scope row commits immediately so the user knows what they asked for; only the result list is in a loading state.",
    scopeKind: "areas", scopeShort: "Hebbal + 2",
    notes: N({ browserBack: "Cancels the in-flight request and returns to the previous committed state." }),
    tryIt: [{ label: "Loaded successfully", to: "C1" }, { label: "It fails", to: "A10" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", chips: [chip("hebbal"), chip("nagawara"), chip("jakkur")], note: "Scope committed. Fetching listings for all three areas." },
      { t: "heading", label: "Selected areas", value: "Hebbal · Nagawara · Jakkur", count: "—", sub: "counting listings" },
      { t: "loading", label: "Loading listings for 3 selected areas…", sub: "Your chips and filters are kept. Nothing has been broadened.", rows: 3, rowH: "104px" },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara", { sel: true }), mkArea("jakkur", { sel: true })],
      overlay: { scopeBadge: { kind: "areas", label: "Loading 3 selected areas…" } },
    },
    mobileCta: { label: "Cancel", variant: "outline", to: "C1" },
  });

  push({
    id: "A10", group: "A", issue: "#2016", name: "scope-change-failed",
    title: "Failure while changing result scope",
    ac: "A failed scope change is stated as a failure, keeps the requested scope visible, and offers Retry — it never renders as zero results.",
    intent: "The distinction that matters most for trust: 'we could not load this' looks nothing like 'there is nothing here'.",
    scopeKind: "areas", scopeShort: "Hebbal + 2",
    notes: N({ browserBack: "Returns to the last state that rendered successfully." }),
    tryIt: [{ label: "Retry — succeeds", to: "C1" }, { label: "Compare with true zero results", to: "E1" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", chips: [chip("hebbal"), chip("nagawara"), chip("jakkur")], note: "Your selection is safe. Only the listing request failed." },
      { t: "error", title: "We could not load listings for these areas", body: "This is a problem on our side, not an empty result. Your three areas and your filters are unchanged.", actions: [{ label: "Retry", variant: "primary", to: "C1" }, { label: "Edit areas", to: "B3" }] },
      { t: "why", text: "No listings are shown because the request failed — not because none matched." },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara", { sel: true }), mkArea("jakkur", { sel: true })],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · 3 areas (not loaded)" } },
    },
    mobileCta: { label: "Retry", to: "C1" },
  });

  // ============================ GROUP B ============================
  const sug = (id, to, o) => Object.assign({ id, name: A[id].name, listings: A[id].listings, schools: A[id].schools, rel: A[id].rel, to }, o || {});

  push({
    id: "B1", group: "B", issue: "#2017", name: "draft-single-area",
    title: "Initial Hebbal selection with nearby suggestions",
    ac: "Selected areas and nearby suggestions are shown together; each suggestion carries its own listing and school counts and its relationship to the selection.",
    intent: "The chip row is a draft. The primary button states exactly how many listings pressing it would show, so committing is never a guess.",
    sync: "Suggestion rows and their map pins are the same objects — adding from either side updates both.",
    scopeKind: "areas", scopeShort: "Hebbal (draft)",
    notes: N({ edit: "This is the edit surface. Chip changes here are drafts.", commit: "Show 42 listings commits the draft and becomes the result scope.", browserBack: "Leaves the editor without committing; the previously committed scope is restored." }),
    tryIt: [{ label: "Add Nagawara", to: "B2" }, { label: "See more nearby areas", to: "B6" }, { label: "Commit as-is", to: "A1" }],
    blocks: [
      { t: "crumb", items: CRUMB },
      { t: "scopebar", kind: "areas", draft: true, chips: [chip("hebbal")], note: "Draft — results have not changed yet." },
      { t: "draft", note: "Counts are for the whole area, before your filters.", suggestions: [sug("nagawara", "B2"), sug("jakkur", "B3"), sug("kempapura", "B6")] },
      { t: "actions", items: [{ label: "Show 42 listings", variant: "primary", to: "A1" }, { label: "Cancel", variant: "ghost", to: "A1" }] },
      { t: "why", text: "The results panel below is unchanged until you press Show listings." },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur", "kempapura"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara", { cta: "Tap to add", action: { to: "B2" } }), mkArea("jakkur", { cta: "Tap to add", action: { to: "B3" } }), mkArea("kempapura", { cta: "Tap to add", action: { to: "B6" } })],
      overlay: { scopeBadge: { kind: "areas", label: "Draft scope · 1 of 3 areas" } },
    },
    mobileCta: { label: "Show 42 listings", to: "A1" },
  });

  push({
    id: "B2", group: "B", issue: "#2017", name: "draft-two-areas",
    title: "Two selected areas before Search",
    ac: "Adding a suggestion updates the draft chips and the pending total, and does not fetch results.",
    intent: "The count on the button moves from 42 to 73 the moment a chip is added — the only feedback needed to make the draft model legible.",
    scopeKind: "areas", scopeShort: "2 areas (draft)",
    notes: N({ edit: "Chips can be removed with × while still in draft.", commit: "Show 73 listings is the commitment point." }),
    tryIt: [{ label: "Add Jakkur (reaches the limit)", to: "B3" }, { label: "Commit two areas", to: "C1" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", draft: true, chips: [chip("hebbal"), chip("nagawara")], note: "Draft — 2 of 3 areas. Results have not changed yet." },
      { t: "draft", suggestions: [sug("nagawara", "B2", { state: "added" }), sug("jakkur", "B3"), sug("kempapura", "B6")] },
      { t: "actions", items: [{ label: "Show 73 listings", variant: "primary", to: "C1" }, { label: "Cancel", variant: "ghost", to: "A1" }] },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur", "kempapura"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara", { sel: true }), mkArea("jakkur", { cta: "Tap to add", action: { to: "B3" } }), mkArea("kempapura", { cta: "Tap to add", action: { to: "B6" } })],
      overlay: { scopeBadge: { kind: "areas", label: "Draft scope · 2 of 3 areas" } },
    },
    mobileCta: { label: "Show 73 listings", to: "C1" },
  });

  push({
    id: "B3", group: "B", issue: "#2017", name: "draft-max-three-areas",
    title: "Maximum three selected areas before Search",
    ac: "The three-area maximum is stated before it is hit, not only when it is exceeded.",
    intent: "At the limit the suggestion list stays visible but its Add buttons go quiet, and the limit is explained in the scope row rather than in a toast.",
    scopeKind: "areas", scopeShort: "3 areas (draft)",
    notes: N({ commit: "Show 95 listings commits all three.", edit: "Remove a chip to free a slot." }),
    tryIt: [{ label: "Try to add a fourth", to: "B4" }, { label: "Commit three areas", to: "C1" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", draft: true, chips: [chip("hebbal"), chip("nagawara"), chip("jakkur")], note: "Draft — 3 of 3 areas, the maximum for one search. Remove one to swap it out." },
      { t: "draft", suggestions: [sug("kempapura", "B4", { state: "blocked" }), sug("amruthahalli", "B4", { state: "blocked" }), sug("sahakarnagar", "B4", { state: "blocked" })], note: "Add is unavailable while three areas are selected." },
      { t: "actions", items: [{ label: "Show 95 listings", variant: "primary", to: "C1" }, { label: "Cancel", variant: "ghost", to: "A1" }] },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur", "kempapura"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara", { sel: true }), mkArea("jakkur", { sel: true }), mkArea("kempapura", { cta: "Limit reached", dim: true, action: { to: "B4" } })],
      overlay: { scopeBadge: { kind: "areas", label: "Draft scope · 3 of 3 areas" } },
    },
    mobileCta: { label: "Show 95 listings", to: "C1" },
  });

  push({
    id: "B4", group: "B", issue: "#2017", name: "draft-fourth-area-blocked",
    title: "Maximum-three feedback when adding a fourth",
    ac: "Attempting a fourth area explains the limit and offers a swap; it never silently drops an existing chip.",
    intent: "The recovery is a real action — pick which chip to release — not just a refusal.",
    scopeKind: "areas", scopeShort: "3 areas (draft)",
    notes: N({ edit: "Swapping removes exactly one named chip and adds Kempapura in the same step." }),
    tryIt: [{ label: "Swap out Jakkur", to: "B2" }, { label: "Keep the current three", to: "B3" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", draft: true, chips: [chip("hebbal"), chip("nagawara"), chip("jakkur")], note: "Still 3 of 3. Nothing was removed." },
      {
        t: "draft", suggestions: [sug("kempapura", "B4", { state: "blocked" })],
        feedback: { tone: "warn", title: "You can search up to three areas at once", body: "Kempapura was not added. Release one of your three areas to make room — we will not choose for you.", actions: [{ label: "Remove Jakkur, add Kempapura", variant: "outline", to: "B2" }, { label: "Keep my three areas", variant: "ghost", to: "B3" }] },
      },
      { t: "actions", items: [{ label: "Show 95 listings", variant: "primary", to: "C1" }] },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur", "kempapura"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara", { sel: true }), mkArea("jakkur", { sel: true }), mkArea("kempapura", { cta: "Limit reached", dim: true })],
      overlay: { scopeBadge: { kind: "areas", label: "Draft scope · 3 of 3 — limit reached" } },
    },
    mobileCta: { label: "Show 95 listings", to: "C1" },
  });

  push({
    id: "B5", group: "B", issue: "#2017", name: "draft-duplicate-area",
    title: "Duplicate-area feedback",
    ac: "Selecting an already-selected area is acknowledged and the existing chip is highlighted — no duplicate chip, no silent no-op.",
    intent: "The same canonical area reached from the map, the search box and a suggestion row is one chip. The feedback points at the chip that already exists.",
    sync: "The already-selected map pin flashes its In result scope caption rather than adding a second pin.",
    scopeKind: "areas", scopeShort: "2 areas (draft)",
    notes: N({}),
    tryIt: [{ label: "Continue editing", to: "B2" }, { label: "Commit two areas", to: "C1" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "scopebar", kind: "areas", draft: true, chips: [chip("hebbal"), chip("nagawara")], focusedId: "nagawara", note: "Nagawara is highlighted above — it is already in your draft." },
      {
        t: "draft", suggestions: [sug("nagawara", "B5", { state: "added" }), sug("jakkur", "B3")],
        feedback: { tone: "info", icon: "check", title: "Nagawara is already selected", body: "We kept your existing chip rather than adding a second one. Counts are unchanged." },
      },
      { t: "actions", items: [{ label: "Show 73 listings", variant: "primary", to: "C1" }] },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara", { sel: true }), mkArea("jakkur", { cta: "Tap to add", action: { to: "B3" } })],
      overlay: { scopeBadge: { kind: "areas", label: "Draft scope · 2 of 3 areas" } },
    },
    mobileCta: { label: "Show 73 listings", to: "C1" },
  });

  push({
    id: "B6", group: "B", issue: "#2017", name: "draft-more-nearby-areas",
    title: "More nearby areas — selector and search",
    ac: "Nearby suggestions are a shortlist; the full canonical set for the parent node is reachable and searchable without leaving the draft.",
    intent: "Suggestions must not become the ceiling. The expanded list stays inside the draft editor so no chip is lost on the way.",
    sync: "The map shows every canonical area in the parent node, not only the shortlist.",
    scopeKind: "areas", scopeShort: "1 area (draft)",
    notes: N({ hierBack: "Closing this list returns to the shortlist, not to the parent node." }),
    tryIt: [{ label: "Add Sahakar Nagar", to: "B2" }, { label: "Back to suggestions", to: "B1" }],
    blocks: [
      { t: "crumb", items: CRUMB },
      { t: "scopebar", kind: "areas", draft: true, chips: [chip("hebbal")], note: "Draft — 1 of 3 areas." },
      { t: "callout", tone: "info", icon: "search", title: "All areas in Hebbal · Yelahanka", body: "12 canonical areas sit under this node. Counts are for the whole area, before your filters." },
      { t: "draft", note: "Showing all areas in the current node, nearest first.", suggestions: [sug("kempapura", "B2"), sug("amruthahalli", "B2"), sug("sahakarnagar", "B2"), sug("kodigehalli", "D4"), sug("yelahanka", "B2")], more: { label: "Back to nearby suggestions", variant: "ghost", to: "B1" } },
      { t: "actions", items: [{ label: "Show 42 listings", variant: "primary", to: "A1" }] },
    ],
    map: {
      fit: fitOf(["hebbal", "kempapura", "amruthahalli", "sahakarnagar", "kodigehalli", "yelahanka"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("kempapura"), mkArea("amruthahalli"), mkArea("sahakarnagar"), mkArea("kodigehalli", { count: "0 listings · 4 schools" }), mkArea("yelahanka")],
      overlay: { scopeBadge: { kind: "areas", label: "Draft scope · 1 of 3 areas" }, inView: "6 of 12 areas in this map view", showAll: { label: "Show all 12 areas", to: "G3" } },
    },
    mobileCta: { label: "Show 42 listings", to: "A1" },
  });

  push({
    id: "B7", group: "B", issue: "#2017", name: "draft-counts-loading",
    title: "Suggestion counts loading",
    ac: "While counts load, the selected chips, the area names and the commit action all remain usable.",
    intent: "Counts are the slow part; names and selection are not. Only the numbers are in a loading state.",
    scopeKind: "areas", scopeShort: "1 area (draft)",
    notes: N({}),
    tryIt: [{ label: "Counts partially fail", to: "B8" }, { label: "Counts arrive", to: "B1" }],
    blocks: [
      { t: "crumb", items: CRUMB },
      { t: "scopebar", kind: "areas", draft: true, chips: [chip("hebbal")], note: "Draft — your selection is not affected by the count request." },
      { t: "draft", suggestions: [sug("nagawara", "B1", { loading: true }), sug("jakkur", "B1", { loading: true }), sug("kempapura", "B1", { loading: true })] },
      { t: "actions", items: [{ label: "Show 42 listings", variant: "primary", to: "A1" }] },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur", "kempapura"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara", { count: "counting…" }), mkArea("jakkur", { count: "counting…" }), mkArea("kempapura", { count: "counting…" })],
      overlay: { scopeBadge: { kind: "areas", label: "Draft scope · 1 of 3 areas" } },
    },
    mobileCta: { label: "Show 42 listings", to: "A1" },
  });

  push({
    id: "B8", group: "B", issue: "#2017", name: "draft-counts-partial-error",
    title: "Partial count failure without losing chips",
    ac: "A failed count is labelled as unavailable rather than shown as zero, and the area remains addable.",
    intent: "Zero and unknown are different facts. An unknown count must never be rendered as 0 listings.",
    scopeKind: "areas", scopeShort: "1 area (draft)",
    notes: N({}),
    tryIt: [{ label: "Retry counts", to: "B1" }, { label: "Add Jakkur anyway", to: "B2" }],
    blocks: [
      { t: "crumb", items: CRUMB },
      { t: "scopebar", kind: "areas", draft: true, chips: [chip("hebbal")], note: "Draft — your chip is intact." },
      {
        t: "draft", suggestions: [sug("nagawara", "B2"), sug("jakkur", "B2", { countError: true }), sug("kempapura", "B2", { countError: true })],
        feedback: { tone: "warn", title: "Some counts could not be loaded", body: "Two areas are showing “count unavailable” rather than a zero. You can still add them — we will count them when you search.", actions: [{ label: "Retry counts", variant: "outline", to: "B1" }] },
      },
      { t: "actions", items: [{ label: "Show 42 listings", variant: "primary", to: "A1" }] },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur", "kempapura"]),
      markers: [mkArea("hebbal", { sel: true }), mkArea("nagawara"), mkArea("jakkur", { count: "count unavailable" }), mkArea("kempapura", { count: "count unavailable" })],
      overlay: { scopeBadge: { kind: "areas", label: "Draft scope · 1 of 3 areas" } },
    },
    mobileCta: { label: "Show 42 listings", to: "A1" },
  });

  // ============================ GROUP G ============================
  push({
    id: "G1", group: "G", issue: "#2014", name: "sync-hierarchy-destination",
    title: "Map and panel selecting the same canonical destination",
    ac: "Shallow directional navigation: a hierarchy destination on the map and its panel row are one control and produce one breadcrumb change.",
    intent: "The hierarchy destination is the only marker family that moves the breadcrumb. Its card carries the same eyebrow, name, nearby-area count and total as the panel row beside it.",
    sync: "Hovering either the marker or the panel row emphasises both; activating either pushes the same node onto the breadcrumb.",
    scopeKind: "areas", scopeShort: "No scope yet",
    notes: N({ hierBack: "Returns to North Bangalore, the canonical parent of this node.", browserBack: "Returns to whatever was committed before you started navigating.", commit: "Navigation alone sets no result scope — you still choose areas." }),
    tryIt: [{ label: "Explore Yelahanka · Devanahalli", to: "G2" }, { label: "Select Hebbal instead", to: "A1" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore"] },
      { t: "heading", label: "North Bangalore", value: "Where in North Bangalore?", count: null },
      { t: "why", text: "No result scope is set yet. These rows are navigation destinations, not results." },
      {
        t: "alts", title: "Areas in North Bangalore", note: "Choosing a destination changes the breadcrumb. It does not filter listings on its own.",
        items: [
          { name: "Yelahanka · Devanahalli", rel: "+12 nearby areas", countLabel: "186 listings · 41 schools", actions: [{ label: "Explore", variant: "navy", to: "G2" }] },
          { name: "Hebbal · Yelahanka", rel: "+9 nearby areas", countLabel: "157 listings · 38 schools", actions: [{ label: "Explore", variant: "navy", to: "B1" }] },
          { name: "Thanisandra · Hennur", rel: "+7 nearby areas", countLabel: "96 listings · 21 schools", actions: [{ label: "Explore", variant: "navy", to: "G3" }] },
        ],
      },
    ],
    map: {
      fit: [[13.00, 77.52], [13.28, 77.76]], maxZoom: 11,
      markers: [
        { kind: "hier", lat: 13.1900, lon: 77.6800, eyebrow: "North Bangalore", title: "Yelahanka · Devanahalli", sub: "+12 nearby areas", count: "186 listings", action: { to: "G2" } },
        { kind: "hier", lat: 13.0400, lon: 77.5650, eyebrow: "North Bangalore", title: "Hebbal · Yelahanka", sub: "+9 nearby areas", count: "157 listings", action: { to: "B1" } },
        { kind: "hier", lat: 13.0350, lon: 77.7050, eyebrow: "North Bangalore", title: "Thanisandra · Hennur", sub: "+7 nearby areas", count: "96 listings", action: { to: "G3" } },
      ],
      overlay: { scopeBadge: { kind: "areas", label: "No result scope yet" }, crumb: "Bangalore › North Bangalore", legend: true },
    },
    mobileCta: { label: "Explore Yelahanka · Devanahalli", variant: "navy", to: "G2" },
  });

  push({
    id: "G2", group: "G", issue: "#2014", name: "sync-visual-cluster-focus",
    title: "Visual area cluster — zoom without changing scope",
    ac: "A visual cluster zooms or reveals its member areas and changes neither the breadcrumb nor the result scope.",
    intent: "The cluster is drawn as a hollow, dashed, magnifier-marked chip — a zoom control, not a destination. The panel says explicitly that nothing about the results changed.",
    sync: "Tapping the cluster expands its members on the map and scrolls the panel to those rows; the breadcrumb text is untouched.",
    scopeKind: "areas", scopeShort: "Hebbal",
    notes: N({ hierBack: "Unaffected — the cluster did not push a node.", browserBack: "Unaffected — a zoom is not a committed state.", listMap: "The cluster only exists on the map; the panel shows its members as ordinary rows." }),
    tryIt: [{ label: "Zoom into the cluster", to: "B1" }, { label: "Back to destinations", to: "G1" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"] },
      { t: "callout", tone: "info", icon: "map-pin", title: "Zooming a cluster does not change your results", body: "The Hebbal · Nagawara cluster on the map is a map control. It reveals the areas inside it. Your breadcrumb and your result scope stay exactly as they are." },
      { t: "scopebar", kind: "areas", chips: [chip("hebbal")], note: "Unchanged by the zoom." },
      { t: "heading", label: "Selected areas", value: "Hebbal", count: 42 },
      { t: "listings", label: "Homes for sale", ids: ["hebbal"], n: 2 },
    ],
    map: {
      fit: fitOf(["hebbal", "nagawara", "jakkur", "thanisandra"]),
      markers: [
        { kind: "cluster", lat: 13.0430, lon: 77.6090, title: "Hebbal · Nagawara", sub: "+3 areas with matches", count: "120 listings · 50 schools", action: { to: "B1" } },
        mkArea("jakkur", { cta: "Tap to add", action: { to: "B3" } }),
        mkArea("thanisandra", { cta: "Tap to add", action: { to: "B6" } }),
      ],
      overlay: { scopeBadge: { kind: "areas", label: "Result scope · Hebbal (unchanged)" }, legend: true },
    },
    mobileCta: { label: "Zoom into the cluster", variant: "outline", to: "B1" },
  });

  push({
    id: "G3", group: "G", issue: "#2015", name: "sync-areas-in-map-view",
    title: "Panel subset explained — 5 areas in this map view",
    ac: "The panel never silently replaces a complete list with the current map subset; it labels the subset and offers the full list.",
    intent: "Filtering the panel to the viewport is useful and dangerous in equal measure. The row count, the reason and the undo all sit above the list.",
    sync: "5 areas in this map view on the map and the panel's Showing 5 of 20 line are the same number from the same source.",
    scopeKind: "areas", scopeShort: "No scope yet",
    notes: N({ listMap: "The subset is a presentation choice; Show all 20 areas restores the full list without moving the map." }),
    tryIt: [{ label: "Show all 20 areas", to: "B6" }, { label: "Select Thanisandra", to: "B1" }],
    blocks: [
      { t: "crumb", items: ["Bangalore", "North Bangalore", "Thanisandra · Hennur"] },
      { t: "callout", tone: "accent", icon: "map-pin", title: "Showing 5 of 20 areas", body: "The list below is limited to the areas currently on screen. Nothing has been removed from your search.", actions: [{ label: "Show all 20 areas", variant: "outline", to: "B6" }] },
      { t: "why", text: "Rows changed because the map view changed — not because your result scope changed." },
      {
        t: "alts", title: "Areas in this map view", note: "Adding an area from here starts a draft; it does not run a search.",
        items: [
          { name: "Thanisandra", rel: "In view", countLabel: "37 listings · 6 schools", actions: [{ label: "+ Add", to: "B1" }] },
          { name: "Hennur", rel: "In view", countLabel: "29 listings · 6 schools", actions: [{ label: "+ Add", to: "B1" }] },
          { name: "Nagawara", rel: "In view", countLabel: "31 listings · 9 schools", actions: [{ label: "+ Add", to: "B2" }] },
        ],
      },
    ],
    map: {
      fit: fitOf(["thanisandra", "hennur", "nagawara"]),
      markers: [mkArea("thanisandra", { cta: "Tap to add", action: { to: "B1" } }), mkArea("hennur", { cta: "Tap to add", action: { to: "B1" } }), mkArea("nagawara", { cta: "Tap to add", action: { to: "B2" } })],
      overlay: { scopeBadge: { kind: "areas", label: "No result scope yet" }, inView: "5 areas in this map view", showAll: { label: "Show all 20 areas", to: "B6" } },
    },
    mobileCta: { label: "Show all 20 areas", variant: "outline", to: "B6" },
  });
})();

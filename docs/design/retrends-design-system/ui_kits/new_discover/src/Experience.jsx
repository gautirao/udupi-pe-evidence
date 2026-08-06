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
const EX = window.EXP;

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
  { id: "mobile", label: "Mobile" }
];
const TRIO = ["hebbal", "nagawara", "jakkur"];
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
  return s;
}
const HINTS = {
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
  mobile: (st) => st.presentation === "map" ? "Tap the cluster to zoom — the breadcrumb does not change. List returns to the same state." : "Journeys, list and map all switch at 390 × 844."
};

function Experience() {
  const [st, setSt] = React.useState(() => {
    const q = new URLSearchParams(window.location.search).get("journey");
    return SCENARIOS.some((j) => j.id === q) ? scenarioState(q) : baseState();
  });
  const set = (patch) => setSt((s) => ({ ...s, ...patch }));
  const setHover = (k) => setSt((s) => (s.hover === k ? s : { ...s, hover: k }));
  const snapRef = React.useRef([]);

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
  const act = {
    hover: (k) => setHover(k),
    setCity: (c) => commit({ city: c, journey: "areas", nodeKey: "blr", scope: null, committed: [], sch: schBase(), ag: agBase(), note: null }),
    setFilters: (patch) => set({ filters: { ...st.filters, ...patch }, shown: 8, phase: "idle" }),
    resetFilters: () => set({ filters: { ...EX.DEFAULT_FILTERS, purpose: st.filters.purpose }, shown: 8, phase: "idle" }),

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
    setPresentation: (p) => set({ presentation: p }),
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
      <ExpReviewerBar st={st} setSt={setSt} hint={hint} onScenario={(id) => { snapRef.current = []; setSt(scenarioState(id)); }} />
      <div style={{ flex: 1, display: "grid", placeItems: "start center", padding: isMobile ? "24px 16px 40px" : "18px 16px 32px" }}>
        <ExpShell st={st} view={view} act={act} isMobile={isMobile} />
      </div>
    </div>
  );
}

// ---- reviewer strip (not product UI) ---------------------------------------
function ExpReviewerBar({ st, setSt, onScenario, hint }) {
  return (
    <div style={{ position: "sticky", top: 0, zIndex: 900, background: "var(--navy-900)", color: "rgba(255,255,255,0.82)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "7px 16px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "rgba(255,255,255,0.5)" }}>Review</span>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {SCENARIOS.map((j) => (
            <button key={j.id} onClick={() => onScenario(j.id)} style={{ padding: "4px 10px", borderRadius: "var(--radius-full)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "11.5px", fontWeight: 600, border: "1px solid " + (st.scenario === j.id ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.2)"), background: st.scenario === j.id ? "#fff" : "transparent", color: st.scenario === j.id ? "var(--navy-900)" : "rgba(255,255,255,0.8)" }}>{j.label}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "4px", marginLeft: "6px" }}>
          {["desktop", "mobile"].map((d) => (
            <button key={d} onClick={() => setSt((s) => ({ ...s, device: d, presentation: "list" }))} style={{ padding: "4px 10px", borderRadius: "var(--radius-full)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "11.5px", fontWeight: 600, border: "1px solid rgba(255,255,255,0.2)", background: st.device === d ? "rgba(255,255,255,0.16)" : "transparent", color: "rgba(255,255,255,0.85)" }}>{d === "desktop" ? "1366 × 768" : "390 × 844"}</button>
          ))}
        </div>
        <span style={{ flex: 1, minWidth: "220px", fontSize: "12px", color: "rgba(255,255,255,0.72)" }}>{hint}</span>
        <a href="transitions.html" style={{ fontSize: "11.5px", fontWeight: 600, color: "var(--copper-400)", whiteSpace: "nowrap" }}>Storyboard ↗</a>
      </div>
    </div>
  );
}

// ---- shell: fixed target sizes, scaled to fit ------------------------------
function ExpShell({ st, view, act, isMobile }) {
  const W = isMobile ? 390 : 1366, H = isMobile ? 844 : 768;
  const [scale, setScale] = React.useState(1);
  React.useEffect(() => {
    const fit = () => {
      const availW = window.innerWidth - 40, availH = window.innerHeight - 130;
      setScale(Math.min(1, availW / W, availH / H));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [W, H]);
  return (
    <div style={{ width: W * scale + "px", height: H * scale + "px" }}>
      <div style={{ width: W + "px", height: H + "px", transform: "scale(" + scale + ")", transformOrigin: "top left", borderRadius: isMobile ? "26px" : "var(--radius-lg)", overflow: "hidden", background: "var(--paper)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow-xl)", display: "flex", flexDirection: "column", position: "relative" }}>
        {isMobile ? <ExpMobile st={st} view={view} act={act} /> : <ExpDesktop st={st} view={view} act={act} />}
      </div>
    </div>
  );
}

const JOURNEY_BADGE = { areas: ["Areas", "accent"], schools: ["Schools", "neutral"], agri: ["Agricultural", "success"] };

function ExpTopNav({ compact, st, act }) {
  const { Icon, Badge } = window.ReTrendsDesignSystem_f37966;
  const badge = JOURNEY_BADGE[st.journey] || JOURNEY_BADGE.areas;
  return (
    <header style={{ flex: "none", height: compact ? "44px" : "56px", display: "flex", alignItems: "center", gap: compact ? "10px" : "24px", padding: compact ? "0 14px" : "0 22px", background: "var(--paper)", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: compact ? "26px" : "32px", height: compact ? "26px" : "32px", borderRadius: "var(--radius-md)", background: "var(--navy-800)", display: "grid", placeItems: "center" }}><Icon name="map-pin" size={compact ? 15 : 18} color="#fff" /></div>
        <div style={{ lineHeight: 1.1, whiteSpace: "nowrap" }}>
          <div style={{ fontSize: compact ? "13px" : "14.5px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>Bangalore Property Tracker</div>
          {!compact && <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Real estate trends</div>}
        </div>
      </div>
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "12px" }}>
        {!compact && <Badge tone={badge[1]} pill>{badge[0]}</Badge>}
        <button onClick={act.openAlerts} style={{ border: "1px solid var(--border-strong)", background: "var(--paper)", cursor: "pointer", padding: compact ? "5px 10px" : "7px 13px", borderRadius: "var(--radius-md)", fontFamily: "var(--font-sans)", fontSize: compact ? "11.5px" : "12.5px", fontWeight: 600, color: "var(--text-strong)", whiteSpace: "nowrap" }}>Saved alerts</button>
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
      <ExpTopNav st={st} act={act} />
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
          <window.ExpMap {...mapProps(st, view, act)} isMobile />
          <ExpSheet st={st} view={view} act={act} />
        </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          <window.ExpPanel view={view} st={st} act={act} isMobile />
        </div>
      )}
    </>
  );
}

function ExpSheet({ st, view, act }) {
  const rows = view.sheetRows || [];
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
            <div style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-strong)", marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.propType} · {l.beds} BHK</div>
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
        <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-strong)" }}>{view.sheetTitle}</span>
        {view.clusterFocus
          ? <button onClick={st.journey === "schools" ? act.schoolsShowAll : act.showAllAreas} style={{ border: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12px", fontWeight: 700, color: "var(--accent)" }}>Show all areas</button>
          : view.scopeKind === "AREA_SET" && view.committed.length > 1 ? <button onClick={act.fitAll} style={{ border: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12px", fontWeight: 700, color: "var(--accent)" }}>Fit all</button> : null}
      </div>
      {view.scopeKind && <div style={{ marginTop: "6px", display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 9px", borderRadius: "var(--radius-xs)", border: "1px solid var(--border-strong)", background: "var(--surface-subtle)", fontSize: "11.5px", fontWeight: 700, color: "var(--text-strong)" }}>Result scope — {view.scopeLabel}</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginTop: "9px", maxHeight: "190px", overflowY: "auto" }}>
        {rows.map((r) => (
          <button key={r.key} onClick={r.onClick} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 11px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)" }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: "13px", fontWeight: 700, color: "var(--text-strong)" }}>{r.label}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-body)", whiteSpace: "nowrap" }}>{r.meta}</span>
            <span style={{ color: "var(--grey-400)" }}>›</span>
          </button>
        ))}
      </div>
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
    noun: st.filters.purpose === "Rent" ? "rentals" : "listings",
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
      ? { eyebrow: "Areas · Bangalore", title: "Where in Bangalore?", stat: { v: total, l: v.noun }, sub: "Five directions, positioned as they really lie. Each card names the areas with matching homes inside it." }
      : level === "direction"
        ? { eyebrow: "Direction · " + crumb[crumb.length - 1].label, title: crumb[crumb.length - 1].label, stat: { v: total, l: v.noun }, sub: areaKids ? "This direction goes straight to its areas — no extra layer is invented." : "Local destinations, named by their prominent areas." }
        : { eyebrow: "Local destination", title: crumb[crumb.length - 1].label, stat: { v: total, l: v.noun }, sub: "Pick an area to see its homes. The dashed cluster on the map only zooms." };
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
      ? { eyebrow: "Areas · " + areaObjs[0].name, title: (rent ? "Homes to rent in " : "Properties in ") + areaObjs[0].name, stat: { v: results.length, l: rent ? (results.length === 1 ? "home to rent" : "homes to rent") : results.length === 1 ? "home for sale" : "homes for sale" } }
      : scopeKind === "CITY"
        ? { eyebrow: "Browse all listings", title: rent ? "All homes to rent in Bangalore" : "All homes in Bangalore", stat: { v: results.length, l: v.noun }, sub: "Every listing in the city on one filterable list — the funnel skipped, filters and alerts unchanged." }
        : scopeKind === "HIERARCHY"
          ? { eyebrow: "Result scope — " + (st.scope.level === "direction" ? "Direction" : "Local destination"), title: (rent ? "Homes to rent in " : "Properties in ") + crumb[crumb.length - 1].label, stat: { v: results.length, l: rent ? (results.length === 1 ? "home to rent" : "homes to rent") : results.length === 1 ? "home for sale" : "homes for sale" }, sub: "Every area in " + crumb[crumb.length - 1].label + " on one filterable list." }
          : {
            eyebrow: scopeKind === "AREA_SET" ? "Selected areas · " + st.committed.length : (rent ? "Homes to rent · " : "Homes for sale · ") + (scopeKind === "POLYGON" ? "Drawn area" : "Visible map area"),
            title: scopeKind === "AREA_SET" ? areaObjs.map((a) => a.name).join(", ") : scopeKind === "POLYGON" ? "Inside your drawn boundary" : "On screen right now",
            stat: { v: results.length, l: v.noun }
          };
    if (st.query) v.notes.push({ tone: "info", text: "Filtered to “" + st.query + "” within " + (single ? areaObjs[0].name : v.scopeLabel) + " — " + results.length + " of " + (single ? EX.countIn(st.committed[0], st.filters) : "the") + " homes.", action: "Clear search", onAction: () => act.setQuery("") });
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

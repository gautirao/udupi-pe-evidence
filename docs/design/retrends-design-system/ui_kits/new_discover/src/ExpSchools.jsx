// Discover experience — SCHOOLS journey (restored from the existing product's
// Schools mode, rebuilt on the canonical directional hierarchy).
// City → direction → local destination → area → schools in that area → homes
// near the chosen school (3 / 5 / 10 km). Board + Level filters and school-name
// search are preserved; a city-wide school search in the control bar means a
// shopper who knows the school never has to walk the funnel.
const { Icon: SJIcon } = window.ReTrendsDesignSystem_f37966;
const SJ = window.EXP;
const PLUM = "var(--plum-600)";

function SJGhost({ children, onClick, strong }) {
  const [h, setH] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ padding: "7px 12px", borderRadius: "var(--radius-md)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, border: "1px solid " + (strong ? PLUM : "var(--border-strong)"), background: h ? "var(--grey-50)" : "var(--paper)", color: strong ? PLUM : "var(--text-strong)", whiteSpace: "nowrap", transition: "background var(--dur-fast)" }}>{children}</button>
  );
}
function SJChip({ label, on, onClick }) {
  return (
    <button onClick={onClick} aria-pressed={on} style={{ padding: "6px 12px", borderRadius: "var(--radius-full)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, border: "1px solid " + (on ? PLUM : "var(--border)"), background: on ? PLUM : "var(--surface-card)", color: on ? "#fff" : "var(--text-body)", transition: "background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast)" }}>{label}</button>
  );
}
function SJToolLabel({ children }) {
  return <span style={{ flex: "none", fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{children}</span>;
}

// ---- view -------------------------------------------------------------------
// Returns the fields the shared shell (panel + map) needs for this journey.
function ExpSchoolsView(st, act) {
  const s = st.sch;
  const EXJ = window.EXJ;
  const crumbBase = [{ key: "blr", label: "Bangalore" }, { key: "sch-root", label: "Schools" }];
  const v = {
    journey: "schools", level: "schools-nav", journeyRoot: s.nodeKey === "blr" && !s.areaKey && !s.areaKeys && !s.selId,
    destinations: [], areaList: [], areaMarkers: [], mapClusters: [], pins: [], schoolPins: [], discs: [],
    notes: [], results: [], crumb: crumbBase, maxZoom: 12, listingCapable: false, filters: st.filters,
    scopeKind: null, committed: [], sheetRows: [], sheetTitle: "", stickyCta: null, showBack: false, backLabel: ""
  };
  const keys = s.areaKeys && s.areaKeys.length ? s.areaKeys : s.areaKey ? [s.areaKey] : null;
  const multi = !!keys && keys.length > 1;
  const names = keys ? keys.map((k) => SJ.byKey[k].name) : [];
  const andList = (a) => (a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]);
  const INSIDE = "School counts show schools located inside these areas. They are not a measure of distance from any home.";

  // ---- homes near the selected school -------------------------------------
  if (s.selId) {
    const sel = EXJ.schoolById(s.selId);
    const homes = EXJ.homesNear(sel, s.radiusKm, st.filters);
    const shortName = sel.name.split(",")[0];
    v.level = "schools-homes";
    v.school = sel;
    v.results = homes;
    v.pins = homes.slice(0, 300);
    v.schoolPins = [sel];
    v.radiusRing = { lat: sel.lat, lon: sel.lon, km: s.radiusKm };
    v.fitBounds = [[sel.lat - s.radiusKm / 111, sel.lon - s.radiusKm / 100], [sel.lat + s.radiusKm / 111, sel.lon + s.radiusKm / 100]];
    v.fitKey = "sch-homes-" + sel.id + "-" + s.radiusKm;
    v.maxZoom = 14;
    v.crumb = crumbBase.concat(multi ? [{ key: "sch-selected", label: "Selected areas" }, { key: sel.id, label: shortName }] : [{ key: sel.areaKey, label: sel.area }, { key: sel.id, label: shortName }]);
    // the radius is result-defining state, so it is named in the heading and the scope line
    v.scopeKind = "SCHOOL_RADIUS";
    v.scopeLabel = "Homes within " + s.radiusKm + " km of " + shortName;
    v.heading = { eyebrow: "Selected school · " + sel.name, title: "Homes within " + s.radiusKm + " km of " + shortName, stat: { v: homes.length, l: homes.length === 1 ? "home" : "homes" } };
    v.showBack = true; v.backLabel = multi ? "Back to schools in selected areas" : "Back to schools in " + sel.area;
    v.sheetTitle = homes.length + " homes within " + s.radiusKm + " km";
    v.sheetRows = homes.slice(0, 5).map((l) => ({ key: l.id, label: l.title, meta: SJ.priceText(l, st.filters), onClick: () => act.openListing(l.id) }));
    v.paintKey = ["sch-homes", sel.id, s.radiusKm, SJ.filterLabels(st.filters).join(",")].join("|");
    return v;
  }

  // ---- schools inside the selected area, or inside the selected AREA SET ----
  if (keys) {
    const all = multi ? EXJ.schoolsInAreas(keys) : EXJ.schoolsIn(keys[0]);
    const list = EXJ.schoolsFilter(all, s.query, s.boards, s.levels);
    const areaObjs = keys.map((k) => SJ.byKey[k]);
    v.level = "schools-area";
    v.area = multi ? null : areaObjs[0];
    v.areaNames = names;
    v.multiAreas = multi;
    v.schoolList = list;
    v.schoolAll = all;
    v.boards = EXJ.boardsIn(all);
    v.levels = EXJ.levelsIn(all);
    v.schoolPins = list;
    v.fitBounds = multi ? SJ.boundsOf(areaObjs) : areaObjs[0].bounds;
    v.fitKey = "sch-area-" + keys.join(",");
    v.maxZoom = multi ? 13 : 15;
    v.crumb = crumbBase.concat(multi ? [{ key: "sch-selected", label: "Selected areas" }] : [{ key: keys[0], label: names[0] }]);
    v.heading = multi
      ? { eyebrow: "Schools in selected areas", title: names.join(" · "), stat: { v: list.length, l: list.length === 1 ? "school" : "schools" }, sub: all.length + " schools located inside " + andList(names) + ". Selecting one opens homes within a radius of that school — your property results in these areas are untouched." }
      : { eyebrow: "Schools · " + names[0], title: "Schools in " + names[0], stat: { v: list.length, l: list.length === 1 ? "school" : "schools" }, sub: all.length + " schools located inside " + names[0] + "." };
    v.notes.push({ tone: "muted", text: INSIDE });
    v.showBack = true;
    v.backLabel = multi
      ? "Back to properties in " + names.join(" + ")
      : s.returnTo && s.returnTo.length === 1
        ? "Back to properties in " + names[0]
        : "Back to areas in " + (areaObjs[0].local ? SJ.locals.find((l) => l.key === areaObjs[0].local).label : SJ.directions.find((d) => d.key === areaObjs[0].direction).short);
    v.sheetTitle = list.length + " schools in " + (multi ? "selected areas" : names[0]);
    v.sheetRows = list.slice(0, 6).map((x) => ({ key: x.id, label: x.name, meta: multi ? x.area : x.board, onClick: () => act.selectSchool(x.id) }));
    v.paintKey = ["sch-area", keys.join(","), s.query, s.boards.join(","), s.levels.join(",")].join("|");
    return v;
  }

  // ---- directional navigation, counted in schools --------------------------
  const kids = EXJ.schoolChildrenOf(s.nodeKey);
  const areaKids = kids.length && kids[0].kind === "area";
  const grouping = areaKids ? EXJ.schoolClustersFor(s.nodeKey) : { clusters: [], singles: kids };
  const focus = s.clusterFocus ? s.clusterFocus.members : null;
  const chain = SJ.ancestry(s.nodeKey);
  v.crumb = crumbBase.concat(chain.slice(1).map((c) => ({ key: c.key, label: c.label })));
  if (areaKids) {
    const list = focus ? kids.filter((k) => focus.indexOf(k.key) !== -1) : kids;
    v.areaList = list;
    v.areaMarkers = (focus ? list : grouping.singles).map((a) => ({ ...a, selected: false }));
    if (!focus) v.mapClusters = grouping.clusters;
    v.clusterFocus = s.clusterFocus;
  } else {
    v.destinations = kids;
    v.compass = s.nodeKey === "blr";
  }
  const under = s.nodeKey === "blr" ? SJ.areas : SJ.levelOf(s.nodeKey) === "direction" ? SJ.areasOfDirection(s.nodeKey) : SJ.areasOfLocal(s.nodeKey);
  const fitList = focus ? focus.map((k) => SJ.byKey[k]) : under.filter((a) => a.schools > 0);
  v.fitBounds = SJ.boundsOf(fitList.length ? fitList : under);
  v.fitKey = "sch-nav-" + s.nodeKey + "-" + (s.clusterFocus ? s.clusterFocus.key : "");
  v.maxZoom = s.nodeKey === "blr" ? 11 : SJ.levelOf(s.nodeKey) === "direction" ? 12 : 14;
  const total = kids.reduce((x, k) => x + k.n, 0);
  const last = chain[chain.length - 1].label;
  v.heading = s.nodeKey === "blr"
    ? { eyebrow: "Schools · Bangalore", title: "Where do you want schools?", stat: { v: total, l: "schools in these areas" }, sub: "Pick a direction, or search a school by name in the bar above — knowing the school is always enough." }
    : { eyebrow: "Schools · " + last, title: areaKids ? "Areas with schools in " + last : last, stat: { v: total, l: "schools in these areas" }, sub: areaKids ? "Pick an area to see the schools located inside it." : "Local destinations, named by the areas with the most schools." };
  v.notes.push({ tone: "muted", text: INSIDE });
  if (areaKids) v.notes.push(focus
    ? { tone: "info", text: focus.length + " areas in this map view — the breadcrumb did not change.", action: "Show all " + kids.length + " areas", onAction: act.schoolsShowAll }
    : { tone: "info", text: kids.length + " areas with schools here. Crowded markers are grouped on the map for legibility only." });
  const parent = SJ.parentOf(s.nodeKey);
  if (parent) { v.showBack = true; v.backLabel = "Back to " + chain[chain.length - 2].label; }
  v.sheetTitle = areaKids ? kids.length + " areas with schools" : kids.length + " destinations";
  v.sheetRows = (v.areaList.length ? v.areaList : kids).slice(0, 6).map((k) => ({ key: k.key, label: k.label, meta: k.n + " schools", onClick: () => (k.kind === "area" ? act.pickSchoolArea(k.key) : act.schoolsPickNode(k)) }));
  v.paintKey = ["sch-nav", s.nodeKey, s.clusterFocus ? s.clusterFocus.key : ""].join("|");
  return v;
}

// ---- rows -------------------------------------------------------------------
function SJNavRow({ d, st, act }) {
  const [h, setH] = React.useState(false);
  const hovered = h || st.sch.hover === d.key;
  const isArea = d.kind === "area";
  return (
    <div role="button" tabIndex={0} data-design-component={isArea ? "school-area-card" : "directional-card"}
      onClick={() => (isArea ? act.pickSchoolArea(d.key) : act.schoolsPickNode(d))} onKeyDown={(e) => (e.key === "Enter" ? (isArea ? act.pickSchoolArea(d.key) : act.schoolsPickNode(d)) : null)}
      onMouseEnter={() => { setH(true); act.schoolsHover(d.key); }} onMouseLeave={() => { setH(false); act.schoolsHover(null); }}
      style={{ background: "var(--surface-card)", border: "1px solid " + (hovered ? "var(--plum-500)" : "var(--border)"), borderRadius: "var(--radius-lg)", padding: "11px 14px", cursor: "pointer", boxShadow: hovered ? "var(--shadow-md)" : "var(--shadow-xs)", transform: hovered ? "translateY(-1px)" : "none", transition: "box-shadow var(--dur-normal), transform var(--dur-normal), border-color var(--dur-fast)", display: "flex", alignItems: "center", gap: "12px" }}>
      <span style={{ flex: "none", width: isArea ? "32px" : "38px", height: isArea ? "32px" : "38px", borderRadius: isArea ? "var(--radius-full)" : "var(--radius-md)", background: hovered ? PLUM : "var(--plum-tint)", display: "grid", placeItems: "center", transition: "background var(--dur-fast)" }}>
        <SJIcon name={isArea ? "map-pin" : "building"} size={isArea ? 16 : 19} color={hovered ? "#fff" : PLUM} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
          <h3 style={{ margin: 0, fontSize: isArea ? "14.5px" : "15.5px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.label}</h3>
          <span style={{ flex: "none", display: "inline-flex", alignItems: "baseline", gap: "4px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: isArea ? "13px" : "16px", fontWeight: 700, color: "var(--text-strong)" }}>{d.n}</span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{isArea ? "schools" : "schools in these areas"}</span>
          </span>
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {isArea ? d.listings + " listings" : d.names.join(" · ") + "  ·  " + (d.n === 0 ? "No schools recorded here" : (d.matchAreas || 0) + " areas with schools")}
        </div>
      </div>
      {isArea
        ? <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12px", fontWeight: 700, color: hovered ? PLUM : "var(--text-muted)", whiteSpace: "nowrap" }}>View schools <SJIcon name="chevron-right" size={15} color={hovered ? PLUM : "var(--grey-400)"} /></span>
        : <SJIcon name="chevron-right" size={17} color={hovered ? PLUM : "var(--grey-400)"} />}
    </div>
  );
}

function SJSchoolRow({ s, st, act, showArea }) {
  const [h, setH] = React.useState(false);
  const hov = h || st.sch.hover === s.id;
  return (
    <div role="button" tabIndex={0} data-design-component="school-result" onClick={() => act.selectSchool(s.id)} onKeyDown={(e) => (e.key === "Enter" ? act.selectSchool(s.id) : null)}
      onMouseEnter={() => { setH(true); act.schoolsHover(s.id); }} onMouseLeave={() => { setH(false); act.schoolsHover(null); }}
      style={{ display: "flex", alignItems: "center", gap: "11px", padding: "10px 12px", background: "var(--surface-card)", border: "1px solid " + (hov ? "var(--plum-500)" : "var(--border)"), borderRadius: "var(--radius-lg)", boxShadow: hov ? "var(--shadow-md)" : "var(--shadow-xs)", cursor: "pointer", transition: "border-color var(--dur-fast), box-shadow var(--dur-normal)", fontFamily: "var(--font-sans)" }}>
      <span style={{ flex: "none", width: "34px", height: "34px", borderRadius: "var(--radius-md)", background: "var(--plum-tint)", display: "grid", placeItems: "center" }}><SJIcon name="building" size={17} color={PLUM} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: "14px", fontWeight: 700, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
        <span style={{ display: "block", fontSize: "11.5px", color: "var(--text-muted)" }}>{s.board} · {s.levels.join(" · ")}{showArea ? " · in " + s.area : ""}</span>
      </span>
      <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", fontWeight: 700, color: PLUM, whiteSpace: "nowrap" }}>View homes <SJIcon name="arrow-right" size={14} /></span>
    </div>
  );
}

// ---- panel ------------------------------------------------------------------
function ExpSchoolsPanel({ view, st, act, isMobile }) {
  const s = st.sch;

  if (view.level === "schools-homes") {
    const sel = view.school;
    const homes = view.results;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div data-design-component="scope-bar" style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--plum-tint)", border: "1px solid var(--plum-100)" }}>
          <span style={{ flex: 1, minWidth: "200px", fontSize: "12.5px", color: "var(--text-body)", lineHeight: 1.45 }}>
            <b style={{ color: "var(--text-strong)" }}>Result scope — homes within {s.radiusKm} km of {sel.name.split(",")[0]}</b><br />
            Straight-line radius from the school, not a travel time. Your property filters apply to these homes.
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "13px", fontWeight: 700, color: "var(--text-strong)" }}>{homes.length} homes</span>
        </div>
        <window.DPRadius value={s.radiusKm} onChange={act.setRadius} school={sel} count={(km) => SJ.homesNearSchool(sel, km, st.filters).length} />
        <div style={{ display: "flex", gap: "7px", flexWrap: "wrap" }}>
          <SJGhost onClick={act.changeSchool}>Choose another school</SJGhost>
          {s.returnTo && s.returnTo.length > 0 && <SJGhost strong onClick={act.backToAreaProperties}>Back to properties in {s.returnTo.map((k) => SJ.byKey[k].name).join(" + ")}</SJGhost>}
        </div>
        {homes.length === 0
          ? <window.DPEmpty accent="plum" icon="route" title={"No homes within " + s.radiusKm + " km"} body="Try a wider radius, change one property filter, or choose another school." />
          : <window.ExpListingsGrid homes={homes.slice(0, st.shown)} st={st} act={act} isMobile={isMobile} distFrom={sel} />}
        {homes.length > st.shown && <SJGhost onClick={act.showMore}>Show more of {homes.length} homes</SJGhost>}
      </div>
    );
  }

  if (view.level === "schools-area") {
    const tog = (arr, val, key) => act.setSchoolFacet(key, arr.indexOf(val) !== -1 ? arr.filter((x) => x !== val) : arr.concat([val]));
    const label = view.multiAreas ? view.areaNames.join(" · ") : view.areaNames[0];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "3px 9px", borderRadius: "var(--radius-full)", background: "var(--evergreen-50)", fontSize: "11.5px", fontWeight: 600, color: "var(--evergreen-600)" }}>
            <SJIcon name="check" size={12} color="var(--evergreen-600)" />{view.multiAreas ? "Your " + view.areaNames.length + " selected areas are kept" : "Your selected area " + label + " is kept"}
          </span>
          {s.returnTo && s.returnTo.length > 0 && <SJGhost strong onClick={act.backToAreaProperties}>Back to properties in {s.returnTo.map((k) => SJ.byKey[k].name).join(" + ")}</SJGhost>}
        </div>
        <div data-design-component="school-filters" style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 12px", minHeight: "40px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
            <SJIcon name="search" size={15} color="var(--grey-400)" />
            <input value={s.query} onChange={(e) => act.setSchoolFacet("query", e.target.value)} placeholder="Search school name…"
              style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-sans)", fontSize: "13px", color: "var(--text-strong)" }} />
            {s.query && <button onClick={() => act.setSchoolFacet("query", "")} style={{ border: "none", background: "var(--surface-subtle)", cursor: "pointer", borderRadius: "var(--radius-full)", width: "20px", height: "20px", lineHeight: 1, color: "var(--text-muted)" }}>×</button>}
          </div>
          {view.boards.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <SJToolLabel>Board</SJToolLabel>
              {view.boards.map((b) => <SJChip key={b} label={b} on={s.boards.indexOf(b) !== -1} onClick={() => tog(s.boards, b, "boards")} />)}
            </div>
          )}
          {view.levels.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <SJToolLabel>Level</SJToolLabel>
              {view.levels.map((l) => <SJChip key={l} label={l} on={s.levels.indexOf(l) !== -1} onClick={() => tog(s.levels, l, "levels")} />)}
            </div>
          )}
        </div>
        {view.schoolList.length === 0
          ? <window.DPEmpty accent="plum" icon="building" title="No schools match" body={"Clear a board or level filter, or search a different name in " + label + "."}
            actions={<SJGhost onClick={act.clearSchoolFilters}>Clear school filters</SJGhost>} />
          : <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>{view.schoolList.map((x) => <SJSchoolRow key={x.id} s={x} st={st} act={act} showArea={view.multiAreas} />)}</div>}
      </div>
    );
  }

  // navigation levels
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {view.destinations.map((d) => <SJNavRow key={d.key} d={d} st={st} act={act} />)}
      {view.areaList.map((a) => <SJNavRow key={a.key} d={a} st={st} act={act} />)}
    </div>
  );
}

Object.assign(window, { ExpSchoolsView, ExpSchoolsPanel });

// #2627 — mobile Map filter experience. Design artifact for #2628.
// Owns NO filter state: the sheet edits a staged COPY of st.filters (st.mfSheet.draft)
// and Apply writes it back through the same canonical filters the List uses.
// Controls are the existing EPFilters groups, rendered expanded, never a second taxonomy.
const MF = new Proxy({}, { get: (_t, k) => (window.EXP ? window.EXP[k] : undefined) });

// Refinements = everything the shopper narrowed beyond intent (Buy/Rent) and family.
function mfRefinements(f) {
  const l = MF.filterLabels(f);
  return f.family === "Commercial" ? l.slice(2) : l.slice(1);
}
function mfCount(st, f) {
  // Schools → Homes near <school>: the same property filters over the SAME school + radius.
  // School, radius and board/level are Schools-journey state and are never touched here.
  if (st.journey === "schools") {
    const sel = st.sch && st.sch.selId && window.EXJ ? window.EXJ.schoolById(st.sch.selId) : null;
    return sel ? window.EXJ.homesNear(sel, st.sch.radiusKm, f).length : 0;
  }
  const sc = st.scope;
  if (!sc) return 0;
  let list = [];
  if (sc.kind === "AREA_SET" || sc.kind === "HIERARCHY") list = MF.inAreas(sc.areaKeys, f);
  else if (sc.kind === "CITY") list = MF.listings.filter((l) => MF.passes(l, f));
  else if (sc.kind === "POLYGON") list = MF.inPoly(sc.poly, f);
  else if (sc.kind === "VIEWPORT") list = MF.inBounds(sc.bounds, f);
  return (st.query ? MF.searchWithin(list, st.query) : list).length;
}
function mfUnits(f, n) {
  const nn = MF.nounsOf(f);
  return n === 1 ? nn.deal(1).replace(/ (for sale|to rent)$/, "") : nn.unitPlural;
}
const mfSame = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const mfCleared = (f) => ({ ...MF.DEFAULT_FILTERS, purpose: f.purpose, family: f.family });
// Buy/Rent: the exact rule the List control bar applies (ExpModeBar)
const mfPurposePatch = (f, v) => ({ purpose: v, maxPrice: 0, comMaxPrice: 0, ptype: v === "Rent" && f.ptype === "Plot" ? "Any type" : f.ptype });
// Same property result set → same property-filter capability in List and Map:
// Areas listing results, and Schools "Homes near <school>".
function mfAvailable(st, view) {
  if (st.journey === "schools") return view.level === "schools-homes";
  return st.journey === "areas" && ["city", "direction", "local"].indexOf(view.level) === -1 && !st.draft;
}
// Intent + family are never counted as refinements, but are ALWAYS stated.
function mfIntent(f, n) {
  return n + " " + MF.nounsOf(f).deal(n) + " · " + (f.family === "Commercial" ? "Commercial" : "Residential");
}

// ---- entry point ------------------------------------------------------------
function ExpMapFilterButton({ st, act, focusDemo }) {
  const { Icon } = window.ReTrendsDesignSystem_f37966;
  const n = mfRefinements(st.filters).length;
  const on = n > 0;
  const open = !!st.mfSheet;
  return (
    <button id="mf-entry" data-design-component="map-filter-entry" onClick={act.openMapFilters}
      aria-haspopup="dialog" aria-expanded={open} aria-controls="mf-sheet"
      aria-label={(on ? "Filters, " + n + " active" : "Filters, no refinements") + ". Showing " + MF.nounsOf(st.filters).dealPlural + ", " + st.filters.family + "."}
      style={{ display: "inline-flex", alignItems: "center", gap: "8px", minHeight: "44px", padding: on ? "0 8px 0 14px" : "0 16px 0 14px", borderRadius: "var(--radius-full)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 700, border: "1px solid " + (on ? "var(--navy-800)" : "var(--border-strong)"), background: on ? "var(--navy-800)" : "var(--paper)", color: on ? "#fff" : "var(--text-strong)", boxShadow: focusDemo ? "0 0 0 3px var(--paper), 0 0 0 5px var(--accent), var(--shadow-md)" : "var(--shadow-md)" }}>
      <Icon name="sliders-horizontal" size={17} color={on ? "#fff" : "var(--navy-800)"} />
      <span>Filters</span>
      {on && <span aria-hidden="true" style={{ minWidth: "24px", height: "24px", padding: "0 7px", borderRadius: "var(--radius-full)", background: "var(--accent)", color: "#fff", display: "inline-grid", placeItems: "center", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700 }}>{n}</span>}
    </button>
  );
}

// ---- "the markers you see are filtered" — one line in the results sheet --------
function ExpMapFilterSummary({ st, act }) {
  const r = mfRefinements(st.filters);
  if (!r.length) return null;
  return (
    <div data-design-component="map-filter-summary" style={{ marginTop: "7px", display: "flex", alignItems: "center", gap: "8px", minHeight: "32px", padding: "0 4px 0 10px", borderRadius: "var(--radius-sm)", background: "var(--navy-100)", color: "var(--navy-800)" }}>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "12px", fontWeight: 600 }}><b style={{ fontWeight: 700 }}>Filtered:</b> {r.join(" · ")}</span>
      <button onClick={act.openMapFilters} style={{ flex: "none", minHeight: "32px", padding: "0 10px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 700, color: "var(--accent)" }}>Edit</button>
    </div>
  );
}

// ---- honest zero-result state on Map ----------------------------------------------
function ExpMapZero({ st, act, view }) {
  const n = mfRefinements(st.filters).length;
  const units = mfUnits(st.filters, 0);
  const canReturn = st.journey === "areas" && st.prevScope && view.scopeKind !== "AREA_SET";
  const sch = st.journey === "schools";
  return (
    <div data-design-component="map-zero-results" role="status" style={{ padding: "4px 0 2px" }}>
      <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-strong)" }}>0 matching {mfIntent(st.filters, 0).replace(/^0 /, "")}</div>
      <p style={{ margin: "5px 0 0", fontSize: "12.5px", lineHeight: 1.45, color: "var(--text-body)", textWrap: "pretty" }}>
        {sch ? view.scopeLabel.replace(/^Homes/, "No " + units) : "Nothing in " + view.scopeLabel} matches {n ? (n === 1 ? "your filter" : "your " + n + " filters") : "this search"}. {sch ? "The school and radius were not changed, and filters were not widened for you." : "Filters were not widened for you."}
      </p>
      {n > 0 && <div style={{ marginTop: "6px", fontSize: "11.5px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mfRefinements(st.filters).join(" · ")}</div>}
      <div style={{ display: "flex", gap: "8px", marginTop: "11px" }}>
        <button onClick={act.openMapFilters} style={{ flex: 1, minHeight: "44px", borderRadius: "var(--radius-md)", border: "none", background: "var(--accent)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 700, cursor: "pointer" }}>Edit filters</button>
        {n > 0 && <button onClick={act.mapClearFilters} style={{ flex: 1, minHeight: "44px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", background: "var(--paper)", color: "var(--text-strong)", fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 600, cursor: "pointer" }}>Clear filters</button>}
      </div>
      {canReturn && <button onClick={act.returnToAreas} style={{ marginTop: "8px", width: "100%", minHeight: "40px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 700, color: "var(--accent)" }}>Return to previous scope</button>}
    </div>
  );
}

// ---- the filter sheet (modal bottom sheet, staged) ---------------------------------
function ExpMapFilterSheet({ st, act, view }) {
  const d = st.mfSheet.draft;
  const applied = st.filters;
  const dirty = !mfSame(d, applied);
  const n = mfCount(st, d);
  const nowN = mfCount(st, applied);
  const refs = mfRefinements(d).length;
  const canClear = !mfSame(d, mfCleared(d));
  const sheetRef = React.useRef(null), headRef = React.useRef(null);
  const [dy, setDy] = React.useState(0);
  const drag = React.useRef(null);

  // focus: into the dialog heading on open, back to the Filters entry on close
  React.useEffect(() => {
    const prev = document.activeElement;
    if (headRef.current) headRef.current.focus({ preventScroll: true });
    return () => {
      const b = document.getElementById("mf-entry");
      if (b) b.focus({ preventScroll: true }); else if (prev && prev.focus) prev.focus({ preventScroll: true });
    };
  }, []);
  const onKey = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); act.mfCancel(); return; }
    if (e.key !== "Tab" || !sheetRef.current) return;
    const f = [...sheetRef.current.querySelectorAll("button:not([disabled]),[tabindex='0']")];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === headRef.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  // swipe-down = Cancel. Only the grab zone (handle + header) drags; the body scrolls.
  const down = (e) => { if (e.target.closest("button")) return; drag.current = { y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e) => { if (drag.current) setDy(Math.max(0, e.clientY - drag.current.y)); };
  const up = () => { if (!drag.current) return; drag.current = null; if (dy > 90) act.mfCancel(); setDy(0); };

  // staged editing: EPFilters is handed the DRAFT and a draft-writing act
  const dst = { ...st, filters: d };
  const dact = { ...act, setFilters: (p) => act.mfEdit(p), setFamily: (fam) => act.mfEdit({ family: fam }), resetFilters: () => act.mfEdit(mfCleared(d)) };
  const EPChip = window.EPChip, EPToolLabel = window.EPToolLabel;
  const units = mfUnits(d, n);

  return (
    <div data-design-component="map-filter-layer" style={{ position: "absolute", inset: 0, zIndex: 1200, display: "flex", flexDirection: "column", justifyContent: "flex-end" }} onKeyDown={onKey}>
      {/* scrim: the map stays visible as context but is inert while editing — tap = Cancel */}
      <div onClick={act.mfCancel} aria-hidden="true" style={{ position: "absolute", inset: 0, background: "rgba(18,24,38,0.42)" }} />
      <div ref={sheetRef} id="mf-sheet" role="dialog" aria-modal="true" aria-labelledby="mf-title" data-design-component="map-filter-sheet"
        style={{ position: "relative", maxHeight: "calc(100% - 88px)", display: "flex", flexDirection: "column", background: "var(--paper)", borderRadius: "18px 18px 0 0", boxShadow: "0 -12px 36px rgba(18,24,38,0.28)", transform: "translateY(" + dy + "px)", transition: drag.current ? "none" : "transform var(--dur-normal) var(--ease-out)" }}>
        <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} style={{ flex: "none", touchAction: "none", cursor: "grab", padding: "8px 8px 10px 18px", borderBottom: "1px solid var(--border)" }}>
          <div style={{ width: "38px", height: "4px", borderRadius: "999px", background: "var(--stone-400)", margin: "0 auto 8px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 id="mf-title" ref={headRef} tabIndex={-1} style={{ margin: 0, outline: "none", fontFamily: "var(--font-serif)", fontSize: "21px", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-strong)", display: "flex", alignItems: "center", gap: "8px" }}>
                Filters{refs > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, padding: "2px 8px", borderRadius: "var(--radius-full)", background: "var(--navy-100)", color: "var(--navy-800)", whiteSpace: "nowrap", letterSpacing: 0 }}>{refs} set</span>}
              </h2>
              <div style={{ marginTop: "2px", fontSize: "12px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{view.scopeLabel}</div>
              {st.journey === "schools" && <div data-design-component="schools-scope-note" style={{ marginTop: "2px", fontSize: "11.5px", color: "var(--plum-600)", fontWeight: 600 }}>Property filters only · school and radius stay on the map</div>}
            </div>
            <button onClick={act.mfCancel} style={{ flex: "none", minHeight: "44px", padding: "0 12px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 700, color: "var(--accent)" }}>Cancel</button>
          </div>
        </div>
        <div className="upt-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", padding: "14px 18px 18px", display: "flex", flexDirection: "column", gap: "11px" }}>
          <div data-design-component="purpose-group" style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
            <EPToolLabel>Buy or rent</EPToolLabel>
            <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
              {["Buy", "Rent"].map((p) => <EPChip key={p} mob label={p} on={d.purpose === p} onClick={() => act.mfEdit(mfPurposePatch(d, p))} />)}
            </div>
          </div>
          <window.EPFilters st={dst} act={dact} isMobile expanded />
        </div>
        <div data-design-component="map-filter-footer" style={{ flex: "none", padding: "10px 18px calc(14px + env(safe-area-inset-bottom))", borderTop: "1px solid var(--border)", background: "var(--paper)", boxShadow: "0 -6px 16px rgba(18,24,38,0.06)" }}>
          <div aria-live="polite" style={{ minHeight: "18px", marginBottom: "8px", fontSize: "12px", fontWeight: 600, color: n === 0 ? "var(--brick-600)" : "var(--text-muted)" }}>
            {n === 0 ? (st.journey === "schools" ? "No " + mfUnits(d, 0) + " match these filters within " + st.sch.radiusKm + " km." : "No " + mfUnits(d, 0) + " match these filters in " + view.scopeLabel + ".")
              : dirty ? "Not applied yet — the map still shows " + nowN + " " + mfUnits(applied, nowN) + "."
              : "These filters are on the map now."}
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button onClick={act.mfClear} disabled={!canClear} style={{ flex: "none", minHeight: "48px", padding: "0 16px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", background: "var(--paper)", cursor: canClear ? "pointer" : "default", fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 600, color: canClear ? "var(--text-strong)" : "var(--text-disabled, var(--grey-400))", opacity: canClear ? 1 : 0.6 }}>Clear all</button>
            <button data-design-component="map-filter-apply" onClick={act.mfApply} style={{ flex: 1, minHeight: "48px", borderRadius: "var(--radius-md)", border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "14.5px", fontWeight: 700 }}>Show {n} {units}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ExpMapFilterButton, ExpMapFilterSheet, ExpMapFilterSummary, ExpMapZero, MFX: { intent: mfIntent, refinements: mfRefinements, count: mfCount, cleared: mfCleared, available: mfAvailable, same: mfSame } });

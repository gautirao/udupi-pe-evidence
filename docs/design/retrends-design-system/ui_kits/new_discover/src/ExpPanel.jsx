// Discover experience — panel. One shell body for all three journeys:
// the shared header (control bar + journey cards), then the journey's own body.
// Density: in a results state the scope label, the area title and the listing
// count are ONE block (never three stacked containers), and only one secondary
// workflow is ever expanded at a time.
const { Icon: EIcon, Badge: EBadge } = window.ReTrendsDesignSystem_f37966;
/* Lazy view of window.EXP: the design-system bundle evaluates this file
// before EXP exists, so a value capture here would be undefined forever in that copy.
// A Proxy resolves each property at access time instead. */
const EP = new Proxy({}, { get: (_t, k) => (window.EXP ? window.EXP[k] : undefined), has: (_t, k) => !!window.EXP && k in window.EXP });
const SCOPE_TITLE = { AREA_SET: "Selected areas", CITY: "All listings", POLYGON: "Drawn area", VIEWPORT: "Visible map area" };
const NAV_LEVELS = ["city", "direction", "local"];

function EPToolLabel({ children }) {
  return <span style={{ flex: "none", whiteSpace: "nowrap", fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{children}</span>;
}
function EPChip({ label, on, onClick, tone, mob }) {
  const acc = tone || "var(--accent)";
  // flex:none + nowrap so a chip never shrinks or breaks its label mid-word; on
  // mobile the chips wrap onto more lines instead, and grow to a 44px tap target.
  if (mob) return (
    <button onClick={onClick} aria-pressed={!!on} style={{ flex: "none", whiteSpace: "nowrap", minHeight: "44px", padding: "0 14px", borderRadius: "var(--radius-full)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, border: "1px solid " + (on ? acc : "var(--border)"), background: on ? acc : "var(--surface-card)", color: on ? "#fff" : "var(--text-body)", transition: "background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast)" }}>{label}</button>
  );
  return (
    <button onClick={onClick} aria-pressed={!!on} style={{ flex: "none", whiteSpace: "nowrap", padding: "6px 12px", borderRadius: "var(--radius-full)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, border: "1px solid " + (on ? acc : "var(--border)"), background: on ? acc : "var(--surface-card)", color: on ? "#fff" : "var(--text-body)", transition: "background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast)" }}>{label}</button>
  );
}
function EPGhost({ children, onClick, strong, mob }) {
  const [h, setH] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{ minHeight: mob ? "44px" : undefined, padding: mob ? "0 13px" : "6px 11px", borderRadius: "var(--radius-md)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, border: "1px solid " + (strong ? "var(--navy-800)" : "var(--border-strong)"), background: h ? "var(--grey-50)" : "var(--paper)", color: "var(--text-strong)", whiteSpace: "nowrap", transition: "background var(--dur-fast)" }}>{children}</button>
  );
}
function EPPrimary({ children, onClick, disabled, full, sub }) {
  const [h, setH] = React.useState(false);
  return (
    <div style={{ width: full ? "100%" : "auto" }}>
      <button onClick={onClick} disabled={disabled} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
        style={{ width: full ? "100%" : "auto", padding: "11px 16px", borderRadius: "var(--radius-md)", border: "none", cursor: disabled ? "default" : "pointer", fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 700, color: "#fff", background: disabled ? "var(--grey-400)" : h ? "var(--accent-hover)" : "var(--accent)", boxShadow: "var(--shadow-sm)", transition: "background var(--dur-fast)" }}>{children}</button>
      {sub && <div style={{ marginTop: "5px", fontSize: "11.5px", color: "var(--text-muted)", textAlign: "center" }}>{sub}</div>}
    </div>
  );
}
function EPNote({ tone, children, action, onAction }) {
  const map = { info: ["var(--navy-100)", "var(--navy-700)"], warn: ["var(--ochre-50)", "var(--ochre-600)"], error: ["var(--brick-50)", "var(--brick-600)"], ok: ["var(--evergreen-50)", "var(--evergreen-600)"], muted: ["var(--surface-subtle)", "var(--grey-500)"] };
  const [bg, fg] = map[tone] || map.info;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "9px", padding: "8px 12px", borderRadius: "var(--radius-md)", background: bg, fontSize: "12.5px", lineHeight: 1.4, color: "var(--text-body)" }}>
      <span style={{ flex: "none", width: "6px", height: "6px", borderRadius: "var(--radius-full)", background: fg }} />
      <span style={{ flex: 1 }}>{children}</span>
      {action && <button onClick={onAction} style={{ flex: "none", border: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 700, color: "var(--accent)" }}>{action}</button>}
    </div>
  );
}

// ---- Commercial: one more option in the existing property-type filter -------
// Identity colour is --gold-600, the one brand hue Discover had not claimed
// (Areas copper, Schools plum, Agricultural evergreen).
const COM_GOLD = "var(--gold-600)";
function EPComTag({ sub, small }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: small ? "5px" : "6px", padding: small ? "3px 8px" : "4px 10px", borderRadius: "var(--radius-full)", background: "var(--gold-100)", color: "var(--text-strong)", fontSize: small ? "11px" : "12px", fontWeight: 700, letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>
      <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: COM_GOLD, flex: "none" }} />{EP.comLabel(sub)}
    </span>
  );
}
// the three price presentations — the only place anonymity is decided
function EPComPrice({ l, signedIn, big }) {
  const txt = EP.comPriceText(l, signedIn);
  if (signedIn) return <span style={{ fontFamily: "var(--font-mono)", fontSize: big ? "26px" : "18px", fontWeight: big ? 700 : 600, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{txt}</span>;
  if (txt) return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: "7px", flexWrap: "wrap" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: big ? "24px" : "17px", fontWeight: 600, color: "var(--text-strong)" }}>{txt}</span>
      <span style={{ fontSize: big ? "12px" : "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>Price band</span>
    </span>
  );
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", padding: big ? "7px 12px" : "5px 10px", borderRadius: "var(--radius-md)", background: "var(--surface-subtle)", border: "1px solid var(--border)", color: "var(--text-body)", fontSize: big ? "14px" : "12.5px", fontWeight: 600, whiteSpace: "nowrap" }}>
      <svg width={big ? 15 : 13} height={big ? 15 : 13} viewBox="0 0 24 24" fill="none" stroke="var(--grey-500)" strokeWidth="2" strokeLinecap="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
      Sign in to view price
    </span>
  );
}

// ---- filters (areas journey results) ---------------------------------------
// ONE filter group per row, label in a fixed left column so every heading owns
// the chips beside it and no heading is ever pushed into another group's
// leftover horizontal space. Order is always:
//   TYPE               — the property FAMILY: Residential | Commercial
//   <FAMILY> TYPE      — that family's own subtypes, and only that family's
//   attributes         — one group per refinement that applies to what is selected
// Attribute groups by context — area is available to EVERY Residential subtype:
//   Apartment / Villa / House   Bedrooms · Carpet area · Budget
//   Plots                       Plot size · Budget                  (never bedrooms)
//   All residential (mixed)     Home bedrooms · Home carpet area · Plot size · Budget
//   Commercial                  Area · Budget                       (never bedrooms)
// Units live on the chips (`600+ sq ft`), so group labels stay short and the
// label column never has to widen: CARPET AREA, PLOT SIZE, BUILT-UP AREA.
function EPGroup({ label, dc, children, isMobile, rowStyle }) {
  // Mobile is a genuinely different layout, not a squeezed desktop one: the label
  // sits ON TOP of its own chips so it can never scroll away from them or read as
  // belonging to a neighbouring group, and the chips wrap onto as many lines as
  // they need at a 44px tap height. Nothing scrolls sideways.
  if (isMobile) return (
    <div data-design-component={dc} style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
      <EPToolLabel>{label}</EPToolLabel>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
        {React.Children.map(children, (c) => (React.isValidElement(c) ? React.cloneElement(c, { mob: true }) : c))}
      </div>
    </div>
  );
  return (
    <div data-design-component={dc} style={{ display: "grid", gridTemplateColumns: "96px minmax(0,1fr)", columnGap: "9px", alignItems: "start" }}>
      <span style={{ paddingTop: "8px", fontSize: "10.5px", fontWeight: 700, lineHeight: 1.25, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{label}</span>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>{children}</div>
    </div>
  );
}
const epShortArea = (s) => String(s || "").replace(" (sq ft)", "");
function EPFilters({ st, act, isMobile, expanded }) {
  const f = st.filters;
  const rent = f.purpose === "Rent";
  const com = f.family === "Commercial";
  const subs = f.comSubs || [];
  const resTypes = rent ? ["Any type", "Apartment", "Villa"] : ["Any type", "Apartment", "Villa", "Plot"];
  // Shared with filterLabels and the scope chips, so the row, the chips and the alert
  // summary can never disagree about which controls apply.
  const homes = EP.showsHomes(f), plots = EP.showsPlots(f);
  const plotOnly = plots && !homes;
  const mixedRes = plots && homes;
  const budgets = EP.budgetsFor(f);
  const budgetVal = com ? f.comMaxPrice : f.maxPrice;
  const setBudget = (k) => act.setFilters(com ? { comMaxPrice: k } : { maxPrice: k });
  const budgetList = budgets.slice();
  if (budgetVal && !budgetList.some((b) => b.k === budgetVal)) budgetList.push({ k: budgetVal, l: EP.budgetLabel(f, budgetVal) });
  const rowStyle = { display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" };
  const grp = { isMobile, rowStyle };
  // one hairline between the TYPE/subtype block and the attribute groups, so the
  // panel reads as two intentional blocks rather than a stack of similar rows
  const divider = isMobile ? null : <span style={{ height: "1px", background: "var(--border)", margin: "3px 0 4px" }} />;
  const budgetGroup = (
    <EPGroup {...grp} dc="budget-group" label={rent ? "Monthly rent" : "Budget"}>
      {budgetList.map((b) => <EPChip key={"p" + b.k} label={b.l} on={budgetVal === b.k} onClick={() => setBudget(b.k)} />)}
    </EPGroup>
  );
  const attrGroups = com ? (
  // Area and Budget are separate groups: independent of each other, of the
  // subtype selection and of the geography. Clearing subtypes never clears
  // either — Reset commercial filters does.
  <>
    <EPGroup {...grp} dc="commercial-area-group" label={epShortArea(EP.comAreaLabel(f))}>
      {EP.COM_AREAS.map((a) => <EPChip key={"a" + a.k} label={a.l} on={(f.comArea || 0) === a.k} onClick={() => act.setFilters({ comArea: a.k })} tone={COM_GOLD} />)}
    </EPGroup>
    {budgetGroup}
    {(f.comMaxPrice || f.comArea || subs.length > 0 || f.verified) && (
      <div data-design-component="commercial-reset-row" style={isMobile ? rowStyle : { display: "grid", gridTemplateColumns: "96px minmax(0,1fr)", columnGap: "9px" }}>
        {!isMobile && <span />}
        <span style={{ display: "flex" }}>
          <EPGhost mob={isMobile} onClick={() => act.setFilters({ comSubs: [], comMaxPrice: 0, comArea: 0, verified: false })}>Reset commercial filters</EPGhost>
        </span>
      </div>
    )}
  </>
      ) : (
  // Every Residential subtype gets an area filter; what changes is which one.
  // Carpet area and plot size are separate fields and separate groups — in the
  // mixed state each label names the inventory it governs.
  <>
    {homes && (
      <EPGroup {...grp} dc="residential-beds-group" label={mixedRes ? "Home bedrooms" : "Bedrooms"}>
        {[0, 1, 2, 3].map((b) => <EPChip key={b} label={b === 0 ? "Any" : b === 3 ? "3+" : String(b)} on={f.beds === b} onClick={() => act.setFilters({ beds: b })} />)}
      </EPGroup>
    )}
    {homes && (
      <EPGroup {...grp} dc="residential-carpet-group" label={mixedRes ? "Home carpet area" : "Carpet area"}>
        {EP.CARPET_AREAS.map((a) => <EPChip key={"c" + a.k} label={a.l} on={f.carpetArea === a.k} onClick={() => act.setFilters({ carpetArea: a.k })} />)}
      </EPGroup>
    )}
    {plots && (
      <EPGroup {...grp} dc="residential-plot-group" label="Plot size">
        {EP.PLOT_AREAS.map((a) => <EPChip key={a.k} label={a.l} on={f.plotArea === a.k} onClick={() => act.setFilters({ plotArea: a.k })} />)}
      </EPGroup>
    )}
    {budgetGroup}
  </>
      );
  const activeAttrs = (com ? [f.comArea, f.comMaxPrice] : [f.beds, homes && f.carpetArea, plots && f.plotArea, f.maxPrice]).concat([f.ready, f.verified]).filter(Boolean).length;
  const [open, setOpen] = React.useState(false);
  // Collapsed is the default even with refinements set: what is currently applied
  // is already stated by the active-filter chips in the result header below, so
  // nothing is hidden — the count on the button only says how much is in there.
  return (
    <div data-design-component="filter-toolbar" style={{ display: "flex", flexDirection: "column", gap: isMobile ? "11px" : "5px" }}>
      {/* the family selector, plus the two standing toggles — nothing else */}
      <EPGroup {...grp} dc="property-family-row" label="Type">
        <EPChip label="Residential" on={!com} onClick={() => act.setFamily("Residential")} />
        <EPChip label="Commercial" on={com} onClick={() => act.setFamily("Commercial")} tone={COM_GOLD} />
        {!isMobile && <EPChip label={rent ? "Available now" : com ? "Ready to occupy" : "Ready to move"} on={f.ready} onClick={() => act.setFilters({ ready: !f.ready })} />}
        {!isMobile && <EPChip label="Broker identity verified" on={f.verified} onClick={() => act.setFilters({ verified: !f.verified })} tone="var(--evergreen-600)" />}
      </EPGroup>
      {com ? (
        // five subtypes wrap onto a second line inside their own group rather than
        // squeezing unrelated controls onto fewer rows
        <EPGroup {...grp} dc="commercial-subtype-row" label="Commercial type">
          <EPChip label="All commercial" on={subs.length === 0} onClick={() => act.setFilters({ comSubs: [] })} tone={COM_GOLD} />
          {EP.com.SUBTYPES.map((s) => (
            <EPChip key={s.k} label={s.label} on={subs.indexOf(s.k) !== -1}
              onClick={() => act.setFilters({ comSubs: subs.indexOf(s.k) !== -1 ? subs.filter((x) => x !== s.k) : subs.concat(s.k) })} tone={COM_GOLD} />
          ))}
          {subs.length > 0 && <EPGhost onClick={() => act.setFilters({ comSubs: [] })}>Clear commercial types</EPGhost>}
        </EPGroup>
      ) : (
        <EPGroup {...grp} dc="residential-subtype-row" label="Residential type">
          {resTypes.map((t) => <EPChip key={t} label={t === "Any type" ? "All residential" : t + "s"} on={f.ptype === t} onClick={() => act.setFilters({ ptype: t })} />)}
          {f.ptype !== "Any type" && <EPGhost onClick={() => act.setFilters({ ptype: "Any type" })}>Clear residential types</EPGhost>}
        </EPGroup>
      )}
      {divider}
      {isMobile && expanded ? (
        // #2627 — inside the mobile Map filter sheet every group is already one scroll
        // away, so there is no disclosure: the same groups, in the same order, all open.
        <>
          <span style={{ height: "1px", background: "var(--border)" }} />
          {attrGroups}
          <EPGroup {...grp} dc="standing-toggles-group" label="Only show">
            <EPChip label={rent ? "Available now" : com ? "Ready to occupy" : "Ready to move"} on={f.ready} onClick={() => act.setFilters({ ready: !f.ready })} />
            <EPChip label="Broker identity verified" on={f.verified} onClick={() => act.setFilters({ verified: !f.verified })} tone="var(--evergreen-600)" />
          </EPGroup>
        </>
      ) : isMobile ? (
        // 390px cannot show six full-height groups and any results at the same time.
        // Rather than shrinking the groups back into label-less sideways strips, the
        // refinements sit behind one disclosure: the two decisions that change which
        // inventory you are looking at (family, subtype) stay open, refinements are
        // one tap away with a count of how many are set, and what is applied is
        // always legible in the active-filter chips under the result heading.
        <>
          <button onClick={() => setOpen(!open)} aria-expanded={open} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", width: "100%", minHeight: "44px", padding: "0 13px", borderRadius: "var(--radius-md)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 700, color: "var(--text-strong)", border: "1px solid var(--border-strong)", background: "var(--paper)" }}>
            <span>{open ? "Fewer filters" : "More filters"}</span>
            <span style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, color: "var(--text-muted)" }}>
              {!open && activeAttrs > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px" }}>{activeAttrs} set</span>}
              <span style={{ fontSize: "11px" }}>{open ? "\u2303" : "\u2304"}</span>
            </span>
          </button>
          {open && (
            <div data-design-component="mobile-attribute-groups" style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
              <EPGroup {...grp} dc="standing-toggles-group" label="Only show">
                <EPChip label={rent ? "Available now" : com ? "Ready to occupy" : "Ready to move"} on={f.ready} onClick={() => act.setFilters({ ready: !f.ready })} />
                <EPChip label="Broker identity verified" on={f.verified} onClick={() => act.setFilters({ verified: !f.verified })} tone="var(--evergreen-600)" />
              </EPGroup>
              {attrGroups}
            </div>
          )}
        </>
      ) : attrGroups}
    </div>
  );
}
// ---- desktop listing skin: compact sticky filter row --------------------------
// Same filter state, same setters, same chips as EPFilters — each group collapses
// into one dropdown pill so the row stays one line and pins while results scroll.
function expListingSkin(st, view) {
  return st.device !== "mobile" && view.journey === "areas" && NAV_LEVELS.indexOf(view.level) === -1 && !st.draft;
}
function EPDrop({ label, active, filled, tone, tint, icon, count, align, dc, style, children }) {
  const [open, setOpen] = React.useState(false);
  const [h, setH] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", f); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", f); document.removeEventListener("keydown", k); };
  }, [open]);
  const acc = tone || "var(--accent)";
  const fg = filled ? "#fff" : "var(--text-strong)";
  return (
    <div ref={ref} data-design-component={dc} style={{ position: "relative", flex: "none", ...(style || {}) }}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="true" aria-expanded={open} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
        style={{ display: "inline-flex", alignItems: "center", gap: "7px", height: "34px", padding: "0 9px 0 12px", borderRadius: "var(--radius-full)", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, color: fg,
          border: "1px solid " + (filled || active || open ? acc : "var(--border-strong)"), background: filled ? acc : active ? (tint || "var(--accent-tint)") : "var(--surface-card)",
          boxShadow: h && !filled ? "var(--shadow-xs)" : "none", filter: h && filled ? "brightness(1.06)" : "none", transition: "border-color var(--dur-fast), background var(--dur-fast), box-shadow var(--dur-fast)" }}>
        {icon && <EIcon name={icon} size={15} color={fg} />}
        <span>{label}</span>
        {count > 0 && <span style={{ minWidth: "18px", height: "18px", padding: "0 5px", borderRadius: "var(--radius-full)", background: "var(--navy-800)", color: "#fff", fontFamily: "var(--font-mono)", fontSize: "10.5px", fontWeight: 700, display: "inline-grid", placeItems: "center" }}>{count}</span>}
        <EIcon name="chevron-down" size={14} color={filled ? "#fff" : "var(--grey-500)"} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform var(--dur-fast)" }} />
      </button>
      {open && (
        <div role="dialog" style={{ position: "absolute", top: "calc(100% + 6px)", [align === "right" ? "right" : "left"]: 0, zIndex: 45, minWidth: "250px", maxWidth: "360px", padding: "13px 14px", display: "flex", flexDirection: "column", gap: "12px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)" }}>
          {children}
        </div>
      )}
    </div>
  );
}
function EPPop({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
      <EPToolLabel>{label}</EPToolLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>{children}</div>
    </div>
  );
}
// ---- FilterBar: THE one desktop right-panel filter system -------------------
// Every journey (By area · Near a school · Agricultural land) renders this same
// component. Journeys supply DEFINITIONS only — never their own pill, spacing,
// popover or More-filters treatment:
//   primary  { dc, label, tone, pop }            filled selector, always first, never collapses
//   groups   [{ k, drop, active, dc, label, pop }] drop 0 = never collapses; higher collapses first
//   more     node                                  specialist filters, always behind More filters
//   moreActive number                              how many of `more` are set (badge)
//   tone/tint                                      journey accent for active pills
function FilterBar({ ariaLabel, primary, groups, more, moreActive, tone, tint }) {
  const rowRef = React.useRef(null);
  const [nHide, setNHide] = React.useState(0);
  const sig = groups.map((g) => g.k + ":" + g.label).join("|");
  const collapsible = groups.filter((g) => g.drop > 0).sort((a, b) => b.drop - a.drop);
  const hidden = collapsible.slice(0, nHide).map((g) => g.k);
  React.useLayoutEffect(() => { setNHide(0); }, [sig]);
  React.useLayoutEffect(() => {
    const el = rowRef.current;
    if (el && el.scrollWidth > el.clientWidth + 1 && nHide < collapsible.length) setNHide(nHide + 1);
  });
  React.useEffect(() => {
    const el = rowRef.current;
    if (!el || !window.ResizeObserver) return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - w) > 1) { w = el.clientWidth; setNHide(0); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const moved = groups.filter((g) => hidden.indexOf(g.k) !== -1);
  const count = (moreActive || 0) + moved.filter((g) => g.active).length;
  return (
    <div ref={rowRef} data-design-component="filter-toolbar" data-filterbar="FilterBar" role="toolbar" aria-label={ariaLabel} style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "nowrap", minWidth: 0 }}>
      <EPDrop dc={primary.dc} label={primary.label} filled tone={primary.tone}>{primary.pop}</EPDrop>
      {groups.filter((g) => hidden.indexOf(g.k) === -1).map((g) => (
        <EPDrop key={g.k} dc={g.dc} label={g.label} active={g.active} tone={tone} tint={tint}>{g.pop}</EPDrop>
      ))}
      <span style={{ flex: "1 0 0px" }} />
      <EPDrop dc="standing-toggles-group" label="More filters" icon="sliders-horizontal" count={count} align="right">
        {moved.map((g) => <React.Fragment key={g.k}>{g.pop}</React.Fragment>)}
        {more}
      </EPDrop>
    </div>
  );
}
// the sticky strip FilterBar sits in — same offset, padding and hairline in every journey
function FilterBarStrip({ children }) {
  return (
    <div data-design-component="sticky-filter-row" style={{ position: "sticky", top: "-12px", zIndex: 20, margin: "0 -20px", padding: "8px 20px", background: "var(--background)", borderBottom: "1px solid var(--border)" }}>{children}</div>
  );
}
// ---- journey definition: residential / commercial property filters ----------
// Used by By area AND Near a school. `accent` lets a journey recolour the
// Residential selector + active pills (Schools → plum) without a new component.
function EPFiltersCompact({ st, act, accent, accentTint }) {
  const f = st.filters;
  const rent = f.purpose === "Rent";
  const com = f.family === "Commercial";
  const subs = f.comSubs || [];
  const resTypes = rent ? ["Any type", "Apartment", "Villa"] : ["Any type", "Apartment", "Villa", "Plot"];
  const homes = EP.showsHomes(f), plots = EP.showsPlots(f);
  const mixedRes = plots && homes;
  const budgets = EP.budgetsFor(f);
  const budgetVal = com ? f.comMaxPrice : f.maxPrice;
  const setBudget = (k) => act.setFilters(com ? { comMaxPrice: k } : { maxPrice: k });
  const budgetList = budgets.slice();
  if (budgetVal && !budgetList.some((b) => b.k === budgetVal)) budgetList.push({ k: budgetVal, l: EP.budgetLabel(f, budgetVal) });
  const readyLabel = rent ? "Available now" : com ? "Ready to occupy" : "Ready to move";
  const tone = com ? COM_GOLD : accent;
  const tint = com ? "var(--gold-100)" : accentTint;
  const sqft = (n) => n.toLocaleString("en-IN") + "+ sq ft";
  const typeLabel = com ? (subs.length === 0 ? "All types" : subs.length === 1 ? EP.comLabel(subs[0]) : subs.length + " types") : (f.ptype === "Any type" ? "All types" : f.ptype + "s");
  // Every group, in the same order as before. `drop` = collapse priority: when the row
  // would overflow, the highest drop value moves into More filters first. Family and
  // Budget never collapse.
  const groups = [];
  groups.push({ k: "type", drop: 1, active: com ? subs.length > 0 : f.ptype !== "Any type", dc: com ? "commercial-subtype-row" : "residential-subtype-row", label: typeLabel,
    pop: (
      <>
        {com ? (
          <EPPop label="Commercial type">
            <EPChip label="All commercial" on={subs.length === 0} onClick={() => act.setFilters({ comSubs: [] })} tone={COM_GOLD} />
            {EP.com.SUBTYPES.map((s) => (
              <EPChip key={s.k} label={s.label} on={subs.indexOf(s.k) !== -1}
                onClick={() => act.setFilters({ comSubs: subs.indexOf(s.k) !== -1 ? subs.filter((x) => x !== s.k) : subs.concat(s.k) })} tone={COM_GOLD} />
            ))}
          </EPPop>
        ) : (
          <EPPop label="Residential type">
            {resTypes.map((t) => <EPChip key={t} label={t === "Any type" ? "All residential" : t + "s"} on={f.ptype === t} onClick={() => act.setFilters({ ptype: t })} />)}
          </EPPop>
        )}
        {com && subs.length > 0 && <span style={{ display: "flex" }}><EPGhost onClick={() => act.setFilters({ comSubs: [] })}>Clear commercial types</EPGhost></span>}
        {!com && f.ptype !== "Any type" && <span style={{ display: "flex" }}><EPGhost onClick={() => act.setFilters({ ptype: "Any type" })}>Clear residential types</EPGhost></span>}
      </>
    ) });
  if (!com && homes) groups.push({ k: "beds", drop: 2, active: f.beds > 0, dc: "residential-beds-group", label: f.beds ? f.beds + "+ BHK" : "BHK",
    pop: <EPPop label={mixedRes ? "Home bedrooms" : "Bedrooms"}>{[0, 1, 2, 3].map((b) => <EPChip key={b} label={b === 0 ? "Any" : b === 3 ? "3+" : String(b)} on={f.beds === b} onClick={() => act.setFilters({ beds: b })} />)}</EPPop> });
  if (!com && homes) groups.push({ k: "carpet", drop: 4, active: f.carpetArea > 0, dc: "residential-carpet-group", label: f.carpetArea ? sqft(f.carpetArea) : "Carpet area",
    pop: <EPPop label={mixedRes ? "Home carpet area" : "Carpet area"}>{EP.CARPET_AREAS.map((a) => <EPChip key={"c" + a.k} label={a.l} on={f.carpetArea === a.k} onClick={() => act.setFilters({ carpetArea: a.k })} />)}</EPPop> });
  if (!com && plots) groups.push({ k: "plot", drop: 5, active: f.plotArea > 0, dc: "residential-plot-group", label: f.plotArea ? sqft(f.plotArea) + " plot" : "Plot size",
    pop: <EPPop label="Plot size">{EP.PLOT_AREAS.map((a) => <EPChip key={a.k} label={a.l} on={f.plotArea === a.k} onClick={() => act.setFilters({ plotArea: a.k })} />)}</EPPop> });
  if (com) groups.push({ k: "comArea", drop: 3, active: f.comArea > 0, dc: "commercial-area-group", label: f.comArea ? sqft(f.comArea) : epShortArea(EP.comAreaLabel(f)),
    pop: <EPPop label={epShortArea(EP.comAreaLabel(f))}>{EP.COM_AREAS.map((a) => <EPChip key={"a" + a.k} label={a.l} on={(f.comArea || 0) === a.k} onClick={() => act.setFilters({ comArea: a.k })} tone={COM_GOLD} />)}</EPPop> });
  groups.push({ k: "budget", drop: 0, active: budgetVal > 0, dc: "budget-group", label: budgetVal ? EP.budgetLabel(f, budgetVal) : rent ? "Monthly rent" : "Budget",
    pop: <EPPop label={rent ? "Monthly rent" : "Budget"}>{budgetList.map((b) => <EPChip key={"p" + b.k} label={b.l} on={budgetVal === b.k} onClick={() => setBudget(b.k)} />)}</EPPop> });
  const primary = { dc: "property-family-row", label: com ? "Commercial" : "Residential", tone: com ? COM_GOLD : (accent || "var(--accent)"),
    pop: (
      <EPPop label="Property family">
        <EPChip label="Residential" on={!com} onClick={() => act.setFamily("Residential")} tone={accent} />
        <EPChip label="Commercial" on={com} onClick={() => act.setFamily("Commercial")} tone={COM_GOLD} />
      </EPPop>
    ) };
  const more = (
    <>
        <EPPop label="Only show">
          <EPChip label={readyLabel} on={f.ready} onClick={() => act.setFilters({ ready: !f.ready })} />
          <EPChip label="Broker identity verified" on={f.verified} onClick={() => act.setFilters({ verified: !f.verified })} tone="var(--evergreen-600)" />
        </EPPop>
        {com && (f.comMaxPrice || f.comArea || subs.length > 0 || f.verified) && (
          <span data-design-component="commercial-reset-row" style={{ display: "flex" }}>
            <EPGhost onClick={() => act.setFilters({ comSubs: [], comMaxPrice: 0, comArea: 0, verified: false })}>Reset commercial filters</EPGhost>
          </span>
        )}
    </>
  );
  return <FilterBar ariaLabel="Property filters" primary={primary} groups={groups} more={more} moreActive={(f.ready ? 1 : 0) + (f.verified ? 1 : 0)} tone={tone} tint={tint} />;
}
// ---- journey definition: agricultural land ---------------------------------
// Same FilterBar. Size · Budget · Soil are the everyday decisions; road access and
// water are specialist land checks and live behind More filters.
const EP_AG_SIZES = [{ k: "any", l: "Any size" }, { k: "u1", l: "< 1 ac" }, { k: "1-3", l: "1–3 ac" }, { k: "3-5", l: "3–5 ac" }, { k: "5p", l: "5 ac+" }];
const EP_AG_PRICES = [{ k: "any", l: "Any price" }, { k: "u1", l: "< ₹1 Cr" }, { k: "1-2", l: "₹1–2 Cr" }, { k: "2p", l: "₹2 Cr+" }];
const EP_AG_SOILS = ["Any soil", "Red loam", "Red gravel", "Alluvial"];
function EPAgriFiltersCompact({ st, act }) {
  const f = st.ag.filters;
  const set = (p) => act.setAgriFilters({ ...f, ...p });
  const EV = "var(--evergreen-600)", EVT = "var(--evergreen-50)";
  const lab = (list, k) => (list.filter((x) => x.k === k)[0] || list[0]).l;
  const primary = { dc: "land-journey", label: "Agricultural land", tone: EV,
    pop: (
      <>
        <EPPop label="Looking for">
          <EPChip label="Agricultural land" on tone={EV} onClick={() => {}} />
          <EPChip label="Homes & commercial" on={false} onClick={() => act.setJourney("areas")} />
        </EPPop>
        <span style={{ fontSize: "11.5px", lineHeight: 1.4, color: "var(--text-muted)" }}>Agricultural land is its own journey with its own counts — homes and commercial open in By area.</span>
      </>
    ) };
  const groups = [
    { k: "size", drop: 2, active: f.size !== "any", dc: "agri-size-group", label: f.size !== "any" ? lab(EP_AG_SIZES, f.size) : "Land size",
      pop: <EPPop label="Land size">{EP_AG_SIZES.map((o) => <EPChip key={o.k} label={o.l} on={f.size === o.k} onClick={() => set({ size: o.k })} tone={EV} />)}</EPPop> },
    { k: "price", drop: 0, active: f.price !== "any", dc: "agri-budget-group", label: f.price !== "any" ? lab(EP_AG_PRICES, f.price) : "Budget",
      pop: <EPPop label="Budget">{EP_AG_PRICES.map((o) => <EPChip key={o.k} label={o.l} on={f.price === o.k} onClick={() => set({ price: o.k })} tone={EV} />)}</EPPop> },
    { k: "soil", drop: 3, active: f.soil !== "Any soil", dc: "agri-soil-group", label: f.soil !== "Any soil" ? f.soil : "Soil",
      pop: <EPPop label="Soil / cultivation">{EP_AG_SOILS.map((s) => <EPChip key={s} label={s} on={f.soil === s} onClick={() => set({ soil: s })} tone={EV} />)}</EPPop> }
  ];
  const anyActive = f.size !== "any" || f.price !== "any" || f.road || f.water || f.soil !== "Any soil";
  const more = (
    <>
      <EPPop label="Land access & water">
        <EPChip label="Road access" on={f.road} onClick={() => set({ road: !f.road })} tone={EV} />
        <EPChip label="Water available" on={f.water} onClick={() => set({ water: !f.water })} tone={EV} />
      </EPPop>
      {anyActive && <span style={{ display: "flex" }}><EPGhost onClick={() => act.setAgriFilters(window.DP_AGRI_DEFAULTS)}>Reset land filters</EPGhost></span>}
    </>
  );
  return <FilterBar ariaLabel="Agricultural land filters" primary={primary} groups={groups} more={more} moreActive={(f.road ? 1 : 0) + (f.water ? 1 : 0)} tone={EV} tint={EVT} />;
}
// menu of scope operations — every action the old chip row had, one click deeper
function EPMenu({ label, items, dc }) {
  const [open, setOpen] = React.useState(false);
  const [h, setH] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const k = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", f); document.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", f); document.removeEventListener("keydown", k); };
  }, [open]);
  return (
    <span ref={ref} data-design-component={dc} style={{ position: "relative", display: "inline-flex", flex: "none" }}>
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
        style={{ display: "inline-flex", alignItems: "center", gap: "4px", height: "26px", padding: "0 8px", borderRadius: "var(--radius-sm)", border: "1px solid " + (open ? "var(--border-strong)" : "transparent"), background: h || open ? "var(--surface-subtle)" : "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-strong)", whiteSpace: "nowrap" }}>
        {label}<EIcon name="chevron-down" size={13} color="var(--grey-500)" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform var(--dur-fast)" }} />
      </button>
      {open && (
        <div role="menu" style={{ position: "absolute", top: "calc(100% + 5px)", left: 0, zIndex: 46, minWidth: "210px", padding: "5px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)" }}>
          {items.filter(Boolean).map((it) => (
            <button key={it.label} role="menuitem" onClick={() => { setOpen(false); it.onClick(); }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-subtle)")} onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              style={{ display: "flex", alignItems: "center", gap: "9px", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderRadius: "var(--radius-md)", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: it.strong ? 700 : 600, color: "var(--text-strong)" }}>
              <EIcon name={it.icon} size={15} color="var(--grey-500)" />{it.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}
// in-scope listing search, collapsed to one pill until used; same act.setQuery
function EPSearchPill({ label, st, act }) {
  const [q, setQ] = React.useState(st.query || "");
  const [open, setOpen] = React.useState(!!st.query);
  const inRef = React.useRef(null);
  React.useEffect(() => { setQ(st.query || ""); if (st.query) setOpen(true); }, [st.query, label]);
  React.useEffect(() => { if (open && inRef.current && !q) inRef.current.focus(); }, [open]);
  if (!open) return (
    <button data-design-component="property-search" onClick={() => setOpen(true)} title={"Search " + label + " by road, project or landmark"}
      style={{ display: "inline-flex", alignItems: "center", gap: "7px", height: "36px", padding: "0 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", background: "var(--surface-card)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--text-strong)", whiteSpace: "nowrap" }}>
      <EIcon name="search" size={15} color="var(--grey-500)" />Search {label}
    </button>
  );
  return (
    <div data-design-component="property-search" style={{ display: "flex", alignItems: "center", gap: "7px", width: "250px", maxWidth: "100%", height: "36px", padding: "0 10px", background: "var(--surface-card)", border: "1px solid var(--accent)", borderRadius: "var(--radius-md)" }}>
      <EIcon name="search" size={15} color="var(--accent)" />
      <input ref={inRef} value={q} onChange={(e) => { setQ(e.target.value); act.setQuery(e.target.value); }} onBlur={() => { if (!q) setOpen(false); }} onKeyDown={(e) => { if (e.key === "Escape" && !q) setOpen(false); }}
        placeholder={"Road, project or landmark…"} aria-label={"Search " + label + " by road, project or landmark"}
        style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-sans)", fontSize: "13px", color: "var(--text-strong)" }} />
      <button onMouseDown={(e) => e.preventDefault()} onClick={() => { setQ(""); act.setQuery(""); setOpen(false); }} aria-label="Close search" style={{ border: "none", background: "var(--surface-subtle)", cursor: "pointer", borderRadius: "var(--radius-full)", width: "20px", height: "20px", display: "grid", placeItems: "center", padding: 0 }}><EIcon name="x" size={12} color="var(--text-muted)" /></button>
    </div>
  );
}
// Desktop listing header: title + search + sort on one line; count, scope chips
// and the scope-operations menu on the second. Replaces the full-width chip row.
function EPResultHeadSkin({ view, st, act, sort, onSort }) {
  const kind = view.scopeKind;
  const keys = view.committed;
  const h = view.heading;
  const total = view.scopeTotal;
  const searchLabel = kind === "HIERARCHY" ? view.scopeLabel : view.areaActions && keys[0] ? EP.byKey[keys[0]].name : null;
  const chip = { display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 8px", borderRadius: "var(--radius-xs)", background: "var(--surface-subtle)", border: "1px solid var(--border)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-strong)", whiteSpace: "nowrap" };
  const x = { border: "none", background: "transparent", padding: 0, cursor: "pointer", color: "inherit", opacity: 0.6, fontSize: "14px", lineHeight: 1 };
  const back = (kind === "VIEWPORT" || kind === "POLYGON") && st.prevScope;
  const menu = kind === "AREA_SET"
    ? { label: "Edit areas", items: [{ label: "Add or remove areas", icon: "pencil", onClick: act.openDraft, strong: true }, { label: "Draw search area", icon: "route", onClick: act.drawArea }, { label: "Clear selected areas", icon: "x", onClick: act.clearScope }, { label: "Create alert", icon: "alert-triangle", onClick: act.openAlertForm }] }
    : kind === "CITY" ? { label: "Options", items: [{ label: "Draw search area", icon: "route", onClick: act.drawArea }, { label: "Create alert", icon: "alert-triangle", onClick: act.openAlertForm }] }
      : kind ? { label: "Options", items: [{ label: "Create alert", icon: "alert-triangle", onClick: act.openAlertForm }] } : null;
  return (
    <div data-design-component="scope-bar" style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
      <div data-design-component="results-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px 14px", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, flex: "1 1 200px", minWidth: 0, fontFamily: "var(--font-serif)", fontSize: "24px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)", lineHeight: 1.15, textWrap: "pretty" }}>{h.title}</h2>
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px" }}>
          {searchLabel && <EPSearchPill label={searchLabel} st={st} act={act} />}
          <span style={{ position: "relative", display: "inline-flex" }}>
            <select value={sort} onChange={(e) => onSort(e.target.value)} data-design-component="sort-select" aria-label="Sort by"
              style={{ appearance: "none", WebkitAppearance: "none", height: "36px", padding: "0 32px 0 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)", background: "var(--surface-card)", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--text-strong)", cursor: "pointer" }}>
              {EP_SORTS.map((o) => <option key={o.k} value={o.k}>{o.k === "rel" ? "Sort: Relevance" : o.l}</option>)}
            </select>
            <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", display: "flex", pointerEvents: "none" }}><EIcon name="chevron-down" size={14} color="var(--grey-500)" /></span>
          </span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", minHeight: "26px" }}>
        <span style={{ fontSize: "13px", color: "var(--text-muted)", whiteSpace: "nowrap", marginRight: "4px" }}>
          {st.phase === "loading" ? "loading…" : <><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: total === 0 ? "var(--brick-600)" : "var(--text-strong)" }}>{total}</span> {h.stat ? h.stat.l : "listings"}</>}
        </span>
        {/* one area is already named by the title; chips earn their place at 2+ */}
        {kind === "AREA_SET" && keys.length > 1 && keys.map((k) => {
          const on = view.focusChip === k;
          return (
            <span key={k} style={{ ...chip, background: on ? "var(--navy-800)" : chip.background, color: on ? "#fff" : chip.color }}>
              <EIcon name="map-pin" size={12} color={on ? "#fff" : "var(--copper-500)"} />
              <button onClick={() => act.focusChip(k)} style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, color: "inherit" }}>{EP.byKey[k].name}</button>
              <button onClick={() => act.removeCommitted(k)} aria-label={"Remove " + EP.byKey[k].name} style={x}>×</button>
            </span>
          );
        })}
        {kind === "HIERARCHY" && view.hierarchyAreas.map((a) => <span key={a.key} style={{ ...chip, color: "var(--text-body)" }}><EIcon name="map-pin" size={11} color="var(--copper-500)" />{a.name}</span>)}
        {kind === "CITY" && <span style={chip}><EIcon name="layers" size={12} color="var(--copper-500)" />Every area in Bangalore</span>}
        {kind === "POLYGON" && <span style={{ ...chip, background: "var(--accent-tint)", border: "1px solid var(--accent)", fontWeight: 700, color: "var(--copper-600)" }}>Drawn area<button onClick={act.returnToAreas} style={{ ...x, opacity: 1 }}>×</button></span>}
        {kind === "VIEWPORT" && <span style={{ ...chip, background: "var(--navy-100)", border: "1px solid var(--navy-600)", fontWeight: 700, color: "var(--navy-700)" }}>Visible map area</span>}
        {back && <EPGhost strong onClick={act.returnToAreas}>Return to {st.prevScope.kind === "AREA_SET" ? st.prevScope.areaKeys.map((k) => EP.byKey[k].name).join(" + ") : "all listings"}</EPGhost>}
        {menu && <EPMenu dc="scope-actions-menu" label={menu.label} items={menu.items} />}
      </div>
    </div>
  );
}
const EP_SORTS = [{ k: "rel", l: "Relevance" }, { k: "pa", l: "Price: low to high" }, { k: "pd", l: "Price: high to low" }, { k: "sz", l: "Size: largest first" }];
function epSorted(list, sort, f) {
  if (!sort || sort === "rel") return list;
  const rent = f.purpose === "Rent";
  const p = (l) => (rent ? (l.rent != null ? l.rent : l.price) : l.price) || 0;
  const out = list.slice();
  if (sort === "pa") out.sort((a, b) => p(a) - p(b));
  else if (sort === "pd") out.sort((a, b) => p(b) - p(a));
  else if (sort === "sz") out.sort((a, b) => (b.sqft || 0) - (a.sqft || 0));
  return out;
}

// ---- ONE result header: scope · title · count · scope controls ---------------
function EPResultHead({ view, st, act, skin, sort, onSort }) {
  if (skin && !st.draft) return <EPResultHeadSkin view={view} st={st} act={act} sort={sort} onSort={onSort} />;
  const draft = !!st.draft;
  const kind = draft ? "AREA_SET" : view.scopeKind;
  const keys = draft ? st.draft : view.committed;
  const h = view.heading;
  const total = draft ? (view.draftTotal != null ? view.draftTotal : EP.inAreas(st.draft, st.filters).length) : view.scopeTotal;
  const eyebrow = draft ? "Draft selection · " + keys.length + " of 3 selected" : kind === "HIERARCHY" ? "Result scope — " + (st.scope.level === "direction" ? "Direction" : "Local destination") : kind ? "Result scope — " + SCOPE_TITLE[kind] : h.eyebrow;
  return (
    <div data-design-component="scope-bar" style={{ display: "flex", flexDirection: "column", gap: "7px", paddingBottom: "2px", borderBottom: draft ? "1.5px dashed var(--ochre-600)" : "none" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "14px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: draft ? "var(--ochre-600)" : "var(--text-muted)" }}>{eyebrow}</div>
          <h2 style={{ margin: "3px 0 0", fontFamily: "var(--font-serif)", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)", lineHeight: 1.15 }}>{h.title}</h2>
        </div>
        <div style={{ flex: "none", textAlign: "right" }}>
          {st.phase === "loading"
            ? <div style={{ fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--text-muted)" }}>loading…</div>
            : <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 600, color: total === 0 ? "var(--brick-600)" : "var(--text-strong)" }}>{draft ? keys.length + " of 3" : total}</div>}
          <div style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>{draft ? "areas selected" : h.stat ? h.stat.l : "listings"}</div>
        </div>
      </div>
      {kind && (
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          {kind === "AREA_SET" && keys.map((k) => {
            const on = view.focusChip === k;
            return (
              <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 8px", borderRadius: "var(--radius-xs)", background: on ? "var(--navy-800)" : "var(--surface-subtle)", color: on ? "#fff" : "var(--text-strong)", border: draft ? "1px dashed var(--border-strong)" : "1px solid var(--border)", fontSize: "12.5px", fontWeight: 600, transition: "background var(--dur-fast)" }}>
                <EIcon name="map-pin" size={12} color={on ? "#fff" : "var(--copper-500)"} />
                <button onClick={() => (draft ? null : act.focusChip(k))} style={{ border: "none", background: "transparent", padding: 0, cursor: draft ? "default" : "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, color: "inherit" }}>{EP.byKey[k].name}</button>
                {(!draft || keys.length > 1) && <button onClick={() => (draft ? act.removeDraft(k) : act.removeCommitted(k))} aria-label={"Remove " + EP.byKey[k].name} style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", color: "inherit", opacity: 0.6, fontSize: "14px", lineHeight: 1 }}>×</button>}
              </span>
            );
          })}
          {kind === "HIERARCHY" && view.hierarchyAreas.map((a) => (
            <span key={a.key} style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "5px 8px", borderRadius: "var(--radius-xs)", background: "var(--surface-subtle)", border: "1px solid var(--border)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-body)" }}>
              <EIcon name="map-pin" size={11} color="var(--copper-500)" />{a.name}
            </span>
          ))}
          {kind === "CITY" && <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 8px", borderRadius: "var(--radius-xs)", background: "var(--surface-subtle)", border: "1px solid var(--border)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-strong)" }}><EIcon name="layers" size={12} color="var(--copper-500)" />Every area in Bangalore</span>}
          {kind === "POLYGON" && <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 8px", borderRadius: "var(--radius-xs)", background: "var(--accent-tint)", border: "1px solid var(--accent)", fontSize: "12.5px", fontWeight: 700, color: "var(--copper-600)" }}>Drawn area<button onClick={act.returnToAreas} style={{ border: "none", background: "transparent", cursor: "pointer", color: "inherit", fontSize: "14px", lineHeight: 1 }}>×</button></span>}
          {kind === "VIEWPORT" && <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 8px", borderRadius: "var(--radius-xs)", background: "var(--navy-100)", border: "1px solid var(--navy-600)", fontSize: "12.5px", fontWeight: 700, color: "var(--navy-700)" }}>Visible map area</span>}
          {/* selected subtypes, family-scoped: each chip removes only itself, and
              clearing them returns to the family-wide state without leaving the family */}
          {st.filters.family === "Commercial" && (st.filters.comSubs || []).map((k) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 8px", borderRadius: "var(--radius-xs)", background: "var(--surface-subtle)", border: "1px solid var(--border)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-strong)" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: COM_GOLD }} />
              {EP.comLabel(k)}
              <button onClick={() => act.setFilters({ comSubs: st.filters.comSubs.filter((x) => x !== k) })} aria-label={"Remove " + EP.comLabel(k)} style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", color: "inherit", opacity: 0.6, fontSize: "14px", lineHeight: 1 }}>×</button>
            </span>
          ))}
          {st.filters.family === "Commercial" && !(st.filters.comSubs || []).length && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 8px", borderRadius: "var(--radius-xs)", background: "var(--gold-100)", border: "1px solid rgba(138,106,34,0.28)", fontSize: "12.5px", fontWeight: 700, color: "var(--text-strong)" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: COM_GOLD }} />All commercial
            </span>
          )}
          {st.filters.family === "Commercial" && (st.filters.comSubs || []).length > 0 && <EPGhost onClick={() => act.setFilters({ comSubs: [] })}>Clear commercial types</EPGhost>}
          {/* attribute chips, each naming the inventory it governs */}
          {st.filters.family === "Commercial" && st.filters.comArea > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 8px", borderRadius: "var(--radius-xs)", background: "var(--surface-subtle)", border: "1px solid var(--border)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-strong)" }}>
              <EIcon name="maximize" size={12} color="var(--navy-700)" />{st.filters.comArea.toLocaleString("en-IN")}+ sq ft
              <button onClick={() => act.setFilters({ comArea: 0 })} aria-label="Remove area" style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", color: "inherit", opacity: 0.6, fontSize: "14px", lineHeight: 1 }}>×</button>
            </span>
          )}
          {st.filters.family === "Commercial" && st.filters.comMaxPrice > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 8px", borderRadius: "var(--radius-xs)", background: "var(--surface-subtle)", border: "1px solid var(--border)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-strong)" }}>
              {EP.budgetLabel(st.filters, st.filters.comMaxPrice)}
              <button onClick={() => act.setFilters({ comMaxPrice: 0 })} aria-label="Remove budget" style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", color: "inherit", opacity: 0.6, fontSize: "14px", lineHeight: 1 }}>×</button>
            </span>
          )}
          {st.filters.family !== "Commercial" && EP.showsPlots(st.filters) && st.filters.plotArea > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 8px", borderRadius: "var(--radius-xs)", background: "var(--surface-subtle)", border: "1px solid var(--border)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-strong)" }}>
              <EIcon name="maximize" size={12} color="var(--navy-700)" />{st.filters.plotArea.toLocaleString("en-IN")}+ sq ft plot
              <button onClick={() => act.setFilters({ plotArea: 0 })} aria-label="Remove plot size" style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", color: "inherit", opacity: 0.6, fontSize: "14px", lineHeight: 1 }}>×</button>
            </span>
          )}
          {st.filters.family !== "Commercial" && EP.showsHomes(st.filters) && st.filters.carpetArea > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 8px", borderRadius: "var(--radius-xs)", background: "var(--surface-subtle)", border: "1px solid var(--border)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-strong)" }}>
              <EIcon name="maximize" size={12} color="var(--navy-700)" />{st.filters.carpetArea.toLocaleString("en-IN")}+ sq ft carpet
              <button onClick={() => act.setFilters({ carpetArea: 0 })} aria-label="Remove carpet area" style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", color: "inherit", opacity: 0.6, fontSize: "14px", lineHeight: 1 }}>×</button>
            </span>
          )}
          {st.filters.family !== "Commercial" && EP.showsHomes(st.filters) && st.filters.beds > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 8px", borderRadius: "var(--radius-xs)", background: "var(--surface-subtle)", border: "1px solid var(--border)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-strong)" }}>
              <EIcon name="bed" size={12} color="var(--navy-700)" />{st.filters.beds}+ BHK
              <button onClick={() => act.setFilters({ beds: 0 })} aria-label="Remove bedrooms" style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", color: "inherit", opacity: 0.6, fontSize: "14px", lineHeight: 1 }}>×</button>
            </span>
          )}
          {st.filters.family !== "Commercial" && st.filters.ptype !== "Any type" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 8px", borderRadius: "var(--radius-xs)", background: "var(--surface-subtle)", border: "1px solid var(--border)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-strong)" }}>
              <EIcon name="building" size={12} color="var(--navy-700)" />{st.filters.ptype + "s"}
              <button onClick={() => act.setFilters({ ptype: "Any type" })} aria-label={"Remove " + st.filters.ptype} style={{ border: "none", background: "transparent", padding: 0, cursor: "pointer", color: "inherit", opacity: 0.6, fontSize: "14px", lineHeight: 1 }}>×</button>
            </span>
          )}
          {!draft && kind === "AREA_SET" && <EPGhost onClick={act.openDraft}>Edit areas</EPGhost>}
          {!draft && kind === "AREA_SET" && <EPGhost onClick={act.clearScope}>Clear selected areas</EPGhost>}
          {!draft && (kind === "AREA_SET" || kind === "CITY") && <EPGhost onClick={act.drawArea}>Draw search area</EPGhost>}
          {!draft && (kind === "VIEWPORT" || kind === "POLYGON") && st.prevScope && (
            <EPGhost strong onClick={act.returnToAreas}>Return to {st.prevScope.kind === "AREA_SET" ? st.prevScope.areaKeys.map((k) => EP.byKey[k].name).join(" + ") : "all listings"}</EPGhost>
          )}
          {!draft && <EPGhost onClick={act.openAlertForm}>Create alert</EPGhost>}
        </div>
      )}
    </div>
  );
}

// scope-aware result search — identical treatment to the single-area property-search box,
// but named for the stable hierarchy node (Direction / Local destination) instead of an area.
function EPHierarchySearch({ view, st, act }) {
  const label = view.scopeLabel;
  const [q, setQ] = React.useState(st.query || "");
  React.useEffect(() => setQ(st.query || ""), [st.query, label]);
  return (
    <div data-design-component="property-search" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 12px", minHeight: "40px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
      <EIcon name="search" size={15} color="var(--grey-400)" />
      <input value={q} onChange={(e) => { setQ(e.target.value); act.setQuery(e.target.value); }} placeholder={"Search " + label + " by road, project or landmark…"}
        style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-sans)", fontSize: "13px", color: "var(--text-strong)" }} />
      {q && <button onClick={() => { setQ(""); act.setQuery(""); }} style={{ border: "none", background: "var(--surface-subtle)", cursor: "pointer", borderRadius: "var(--radius-full)", width: "20px", height: "20px", lineHeight: 1, color: "var(--text-muted)" }}>×</button>}
    </div>
  );
}
// ---- area landing: compact actions ------------------------------------------
function EPAreaActions({ view, st, act, skin }) {
  const pad = skin ? "10px 13px" : "9px 11px", ic = skin ? "36px" : "30px", tsz = skin ? "14px" : "13px", ssz = skin ? "12px" : "11.5px";
  const chev = (c) => skin ? <EIcon name="chevron-right" size={17} color={c} /> : <span style={{ flex: "none", fontSize: "14px", fontWeight: 700, color: c }}>›</span>;
  const key = view.committed[0];
  const name = EP.byKey[key].name;
  const schoolN = EP.byKey[key].schools;
  const [q, setQ] = React.useState(st.query || "");
  React.useEffect(() => setQ(st.query || ""), [st.query, key]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {!skin && <div data-design-component="property-search" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 12px", minHeight: "40px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
        <EIcon name="search" size={15} color="var(--grey-400)" />
        <input value={q} onChange={(e) => { setQ(e.target.value); act.setQuery(e.target.value); }} placeholder={"Search " + name + " by road, project or landmark…"}
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-sans)", fontSize: "13px", color: "var(--text-strong)" }} />
        {q && <button onClick={() => { setQ(""); act.setQuery(""); }} style={{ border: "none", background: "var(--surface-subtle)", cursor: "pointer", borderRadius: "var(--radius-full)", width: "20px", height: "20px", lineHeight: 1, color: "var(--text-muted)" }}>×</button>}
      </div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: skin ? "10px" : "8px" }}>
        <button data-design-component="school-shortcut" onClick={act.openAreaSchools}
          style={{ display: "flex", alignItems: "center", gap: skin ? "12px" : "9px", padding: pad, borderRadius: skin ? "var(--radius-lg)" : "var(--radius-md)", cursor: "pointer", textAlign: "left", background: "var(--plum-tint)", border: "1px solid var(--plum-100)" }}>
          <span style={{ flex: "none", width: ic, height: ic, borderRadius: "var(--radius-md)", background: "var(--plum-600)", display: "grid", placeItems: "center" }}><EIcon name="building" size={skin ? 18 : 16} color="#fff" /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: tsz, fontWeight: 700, color: "var(--text-strong)" }}>Schools in {name}</span>
            <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: ssz, color: "var(--plum-600)", marginTop: skin ? "2px" : 0 }}>{schoolN} schools · keeps this area</span>
          </span>
          {chev("var(--plum-600)")}
        </button>
        <button data-design-component="nearby-shortcut" onClick={act.openDraft}
          style={{ display: "flex", alignItems: "center", gap: skin ? "12px" : "9px", padding: pad, borderRadius: skin ? "var(--radius-lg)" : "var(--radius-md)", cursor: "pointer", textAlign: "left", background: "var(--surface-card)", border: "1px solid var(--border-strong)" }}>
          <span style={{ flex: "none", width: ic, height: ic, borderRadius: "var(--radius-md)", background: "var(--accent-tint)", display: "grid", placeItems: "center" }}><EIcon name="map-pin" size={skin ? 17 : 15} color="var(--copper-600)" /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: tsz, fontWeight: 700, color: "var(--text-strong)" }}>Add nearby areas</span>
            <span style={{ display: "block", fontSize: ssz, color: "var(--text-muted)", marginTop: skin ? "2px" : 0 }}>Add up to 2 nearby areas</span>
          </span>
          {chev("var(--accent)")}
        </button>
      </div>
    </div>
  );
}

// ---- rows ------------------------------------------------------------------
function EPDestRow({ d, view, act }) {
  const [h, setH] = React.useState(false);
  const hovered = h || view.hover === d.key;
  return (
    <div role="button" tabIndex={0} data-design-component="directional-card" onClick={() => act.pickNode(d)} onKeyDown={(e) => (e.key === "Enter" ? act.pickNode(d) : null)}
      onMouseEnter={() => { setH(true); act.hover(d.key); }} onMouseLeave={() => { setH(false); act.hover(null); }}
      style={{ background: "var(--surface-card)", border: "1px solid " + (hovered ? "var(--border-strong)" : "var(--border)"), borderRadius: "var(--radius-lg)", padding: "12px 14px", cursor: "pointer", boxShadow: hovered ? "var(--shadow-md)" : "var(--shadow-xs)", transform: hovered ? "translateY(-1px)" : "none", transition: "box-shadow var(--dur-normal), transform var(--dur-normal), border-color var(--dur-fast)", display: "flex", alignItems: "center", gap: "12px" }}>
      <div style={{ flex: "none", width: "38px", height: "38px", borderRadius: "var(--radius-md)", background: hovered ? "var(--navy-800)" : "var(--navy-100)", display: "grid", placeItems: "center", transition: "background var(--dur-fast)" }}>
        <EIcon name="map-pin" size={19} color={hovered ? "#fff" : "var(--navy-800)"} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
          <h3 style={{ margin: 0, fontSize: "15.5px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em", whiteSpace: "nowrap" }}>{d.label}</h3>
          <span style={{ flex: "none", display: "inline-flex", alignItems: "baseline", gap: "4px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: "var(--text-strong)" }}>{d.n}</span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{view.noun || "listings"}</span>
          </span>
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "3px" }}>{d.names.join(" · ")}  ·  {d.n === 0 ? "No matches with current filters" : (d.matchAreas || 0) + " areas with matches"}</div>
      </div>
      <EIcon name="chevron-right" size={18} color={hovered ? "var(--accent)" : "var(--grey-400)"} />
    </div>
  );
}
function EPAreaRow({ a, view, act }) {
  const [h, setH] = React.useState(false);
  const hovered = h || view.hover === a.key;
  return (
    <div role="button" tabIndex={0} data-nd-area={a.key} onClick={() => act.pickArea(a.key)} onKeyDown={(e) => (e.key === "Enter" ? act.pickArea(a.key) : null)}
      onMouseEnter={() => { setH(true); act.hover(a.key); }} onMouseLeave={() => { setH(false); act.hover(null); }}
      style={{ background: "var(--surface-card)", border: "1px solid " + (hovered ? "var(--border-strong)" : "var(--border)"), borderRadius: "var(--radius-lg)", padding: "11px 14px", cursor: "pointer", boxShadow: hovered ? "var(--shadow-md)" : "var(--shadow-xs)", transform: hovered ? "translateY(-1px)" : "none", transition: "box-shadow var(--dur-normal), transform var(--dur-normal), border-color var(--dur-fast)", display: "flex", alignItems: "center", gap: "12px" }}>
      <span style={{ flex: "none", width: "32px", height: "32px", borderRadius: "var(--radius-full)", background: "var(--accent-tint)", display: "grid", placeItems: "center" }}><EIcon name="map-pin" size={16} color="var(--copper-600)" /></span>
      <span style={{ flex: 1, minWidth: 0, fontSize: "14.5px", fontWeight: 700, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px", color: "var(--text-body)", whiteSpace: "nowrap" }}>{a.n} {view.noun || "listings"} · {a.schools} schools</span>
      <EIcon name="chevron-right" size={17} color={hovered ? "var(--accent)" : "var(--grey-400)"} />
    </div>
  );
}

// ---- add-nearby-areas workflow (draft geographic scope, committed by the CTA) ----
function EPDraftEditor({ view, st, act, isMobile }) {
  const draft = st.draft || [];
  const suggestions = EP.nearbyFor(draft, st.filters);
  const total = view.draftTotal != null ? view.draftTotal : EP.inAreas(draft, st.filters).length;
  const max = draft.length >= 3;
  const room = 3 - draft.length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {st.draftNote && <EPNote tone="warn">{st.draftNote}</EPNote>}
      <div>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
          <EPToolLabel>{max ? "Maximum of 3 areas reached" : "Add up to " + room + " nearby area" + (room > 1 ? "s" : "")}</EPToolLabel>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-muted)" }}>{draft.length} of 3 selected</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(208px, 1fr))", gap: "8px", marginTop: "8px" }}>
          {suggestions.map((s) => {
            const added = draft.indexOf(s.key) !== -1;
            return (
              <div key={s.key} data-design-component="nearby-area-card" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", background: "var(--surface-card)", border: "1px solid " + (added ? "var(--navy-800)" : "var(--border)"), borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xs)", transition: "border-color var(--dur-fast)" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "14px", fontWeight: 700, color: "var(--text-strong)" }}>{s.name}</span>
                  <span style={{ display: "block", fontSize: "11.5px", color: "var(--text-muted)" }}>{s.rel}</span>
                  <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-body)", marginTop: "3px" }}>{s.n} {view.noun || "listings"} · {s.schools} schools</span>
                </span>
                {added
                  ? <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "5px", padding: "7px 11px", borderRadius: "var(--radius-md)", background: "var(--navy-100)", color: "var(--navy-800)", fontSize: "12.5px", fontWeight: 700 }}><EIcon name="check" size={13} color="var(--navy-800)" strokeWidth={3} />Added</span>
                  : <button onClick={() => act.addDraft(s.key)} disabled={max} style={{ flex: "none", padding: "7px 14px", borderRadius: "var(--radius-md)", cursor: max ? "not-allowed" : "pointer", border: "none", background: max ? "var(--grey-300)" : "var(--navy-800)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 700 }}>Add</button>}
              </div>
            );
          })}
        </div>
      </div>
      <EPNote tone={max ? "warn" : "muted"}>{max ? "Three areas is the maximum — remove one to swap in another." : "This is a draft selection: the map, the results and browser history do not change until you show the listings."}</EPNote>
      {isMobile
        ? <EPGhost onClick={act.cancelDraft}>Cancel</EPGhost>
        : (
          <div style={{ display: "flex", gap: "8px", alignItems: "center", position: "sticky", bottom: "-18px", background: "var(--background)", paddingTop: "10px", paddingBottom: "12px" }}>
            <div style={{ flex: 1 }}><EPPrimary full onClick={act.commitDraft} sub={draft.length > 1 ? "Combined total for " + draft.map((k) => EP.byKey[k].name).join(" + ") : "Honest total for " + EP.byKey[draft[0]].name + " alone"}>Show {total} listings</EPPrimary></div>
            <EPGhost onClick={act.cancelDraft}>Cancel</EPGhost>
          </div>
        )}
    </div>
  );
}

// ---- zero-result recovery: the offer always matches the ACTIVE scope ---------
function EPZero({ view, st, act }) {
  const kind = view.scopeKind;
  const keys = view.zeroKeys && view.zeroKeys.length ? view.zeroKeys : view.committed;
  const relax = EP.relaxations(keys, st.filters);
  const com = st.filters.family === "Commercial";
  const areaScope = kind === "AREA_SET" || kind === "CITY";
  // In Commercial the recovery order is deliberate: stay inside Commercial first
  // (subtype, then budget, then area), and only then offer the other family. Nearby
  // areas are not offered here — they change the geography, which is a bigger move
  // than relaxing a Commercial attribute.
  const nearby = !com && areaScope ? EP.nearbyFor(view.committed, st.filters).filter((n) => n.n > 0).slice(0, 3) : [];
  const primary = relax.filter((r) => !r.secondary);
  const secondary = relax.filter((r) => r.secondary);
  const returnKeys = (view.returnAreaKeys || []).filter((k) => EP.byKey[k]);
  const scopeLine = view.zeroScopeNames ? view.zeroScopeNames.join(" · ") : view.scopeLabel;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ padding: "14px 16px", borderRadius: "var(--radius-lg)", background: "var(--ochre-50)", border: "1px solid var(--ochre-600)" }}>
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-strong)", lineHeight: 1.3 }}>
          {kind === "AREA_SET" ? `No matching ${view.noun || "listings"} in your ${view.committed.length} selected area${view.committed.length > 1 ? "s" : ""}` : kind === "POLYGON" ? `No matching ${view.noun || "listings"} inside your drawn area` : kind === "CITY" ? `No matching ${view.noun || "listings"} anywhere in Bangalore` : kind === "HIERARCHY" ? `No matching ${view.noun || "listings"} in ${view.scopeLabel}` : `No matching ${view.noun || "listings"} in the visible map area`}
        </h3>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-body)", marginTop: "5px" }}>{scopeLine} — {EP.filterLabels(st.filters).join(" · ")}</div>
        <div style={{ fontSize: "12.5px", color: "var(--text-muted)", marginTop: "7px" }}>Your search is kept exactly as it is. Nothing here widens it for you.</div>
      </div>
      {kind === "POLYGON" && (
        <div>
          <EPToolLabel>Change your drawn area</EPToolLabel>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "7px" }}>
            <EPGhost strong onClick={act.drawArea}>Adjust boundary</EPGhost>
            {returnKeys.length > 0 && <EPGhost onClick={() => act.replaceWithAreas(returnKeys)}>Replace with {returnKeys.map((k) => EP.byKey[k].name).join(" + ")}</EPGhost>}
          </div>
          <div style={{ marginTop: "6px", fontSize: "11.5px", color: "var(--text-muted)" }}>Replacing the drawn area with selected areas is confirmed first — the two scopes are never combined.</div>
        </div>
      )}
      {kind === "VIEWPORT" && (
        <div>
          <EPToolLabel>Change the searched map area</EPToolLabel>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "7px" }}>
            <EPGhost strong onClick={act.expandVisible}>Expand visible map area</EPGhost>
            {st.prevScope && <EPGhost onClick={act.returnToAreas}>Return to previous selected areas</EPGhost>}
            {returnKeys.length > 0 && <EPGhost onClick={() => act.replaceWithAreas(returnKeys)}>Replace with {returnKeys.map((k) => EP.byKey[k].name).join(" + ")}</EPGhost>}
          </div>
          <div style={{ marginTop: "6px", fontSize: "11.5px", color: "var(--text-muted)" }}>Expanding keeps this a visible-map search. Replacing it with selected areas is confirmed first.</div>
        </div>
      )}
      {areaScope && !com && nearby.length > 0 && (
        <div>
          <EPToolLabel>Nearby areas with matches — your filters</EPToolLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginTop: "7px" }}>
            {nearby.map((n) => (
              <div key={n.key} style={{ display: "flex", alignItems: "center", gap: "11px", padding: "10px 12px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)" }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "14px", fontWeight: 700, color: "var(--text-strong)" }}>{n.name}</span>
                  <span style={{ display: "block", fontSize: "12px", color: "var(--text-muted)" }}>{n.rel}</span>
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px", color: "var(--accent)", fontWeight: 700 }}>{n.n} {view.noun || "listings"}</span>
                <button onClick={() => act.addNearbyDraft(n.key)} style={{ flex: "none", padding: "7px 14px", borderRadius: "var(--radius-md)", cursor: "pointer", border: "none", background: "var(--navy-800)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 700 }}>Add</button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: "6px", fontSize: "11.5px", color: "var(--text-muted)" }}>Add opens your selected areas as a draft — the search only changes when you show the listings.</div>
        </div>
      )}
      {areaScope && !com && nearby.length === 0 && <EPNote tone="muted">No nearby area has matches with these filters either. A filter change below is the honest next step.</EPNote>}
      {primary.length > 0 && (
        <div>
          <EPToolLabel>{com ? "Stay in Commercial — change one filter" : "Change one filter"}</EPToolLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginTop: "7px" }}>
            {primary.map((r) => (
              <button key={r.label} onClick={() => act.applyRelax(r.patch)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "11px 12px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)" }}>
                <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-strong)" }}>{r.label}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px", fontWeight: 700, color: "var(--accent)" }}>{r.n} {view.nouns ? view.nouns.count(r.n) : "listings"}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
        <EPGhost strong onClick={act.openAlertForm}>Create alert for this search</EPGhost>
      </div>
      {secondary.length > 0 && (
        <div style={{ paddingTop: "10px", borderTop: "1px solid var(--border)" }}>
          <EPToolLabel>Or leave Commercial</EPToolLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginTop: "7px" }}>
            {secondary.map((r) => (
              <button key={r.label} onClick={() => act.applyRelax(r.patch)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "10px 12px", background: "var(--surface-subtle)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)" }}>
                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-body)" }}>{r.label}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: "var(--text-muted)" }}>{r.n}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- alerts ----------------------------------------------------------------
function EPAlertForm({ view, st, act }) {
  const d = st.alertDraft;
  return (
    <div style={{ padding: "16px", borderRadius: "var(--radius-lg)", background: "var(--surface-card)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow-md)", display: "flex", flexDirection: "column", gap: "13px" }}>
      <div>
        <h3 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "20px", fontWeight: 600, color: "var(--text-strong)" }}>Create alert</h3>
        <p style={{ margin: "5px 0 0", fontSize: "12.5px", color: "var(--text-muted)" }}>Saved exactly as shown. Nothing is broadened.</p>
      </div>
      {[["Scope", d.scopeLabel], ["Filters", EP.filterLabels(st.filters).join(" · ")]].map(([k, v]) => (
        <div key={k}>
          <EPToolLabel>{k}</EPToolLabel>
          <div style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-strong)", marginTop: "3px" }}>{v}</div>
        </div>
      ))}
      {d.unsupported && <EPNote tone="warn">“Ready to move” cannot be checked by alerts yet. It stays in your search but will not be applied to alert matches.</EPNote>}
      <div>
        <EPToolLabel>Frequency</EPToolLabel>
        <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
          {["Daily", "Weekly", "Instant"].map((fq) => <EPChip key={fq} label={fq} on={d.freq === fq} onClick={() => act.setAlertField({ freq: fq })} />)}
        </div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "var(--text-body)" }}>
        <input type="checkbox" checked={!!d.failNext} onChange={(e) => act.setAlertField({ failNext: e.target.checked })} />
        Simulate a persistence failure
      </label>
      {st.alertPhase === "error" && <EPNote tone="error" action="Retry" onAction={act.submitAlert}>We could not save this alert. Nothing was stored — your search is untouched.</EPNote>}
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <div style={{ flex: 1 }}><EPPrimary full disabled={st.alertPhase === "saving"} onClick={act.submitAlert}>{st.alertPhase === "saving" ? "Saving…" : "Create alert"}</EPPrimary></div>
        <EPGhost onClick={act.closeAlertForm}>Cancel</EPGhost>
      </div>
    </div>
  );
}
function EPAlertList({ st, act }) {
  if (!st.alerts.length) return <EPNote tone="muted">No saved alerts yet.</EPNote>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {st.alerts.map((a) => (
        <div key={a.id} style={{ padding: "12px 14px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xs)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: "14px", fontWeight: 700, color: "var(--text-strong)" }}>{a.scopeLabel}</span>
            <span style={{ padding: "2px 8px", borderRadius: "var(--radius-full)", background: a.status === "Active" ? "var(--evergreen-50)" : "var(--ochre-50)", color: a.status === "Active" ? "var(--evergreen-600)" : "var(--ochre-600)", fontSize: "11px", fontWeight: 700 }}>{a.status}</span>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--text-muted)", marginTop: "3px" }}>{a.kind} · {a.freq} · {a.filters} · {a.checked}</div>
          <div style={{ display: "flex", gap: "7px", marginTop: "9px", flexWrap: "wrap" }}>
            <EPGhost onClick={() => act.openAlert(a)}>Open saved search</EPGhost>
            <EPGhost onClick={() => act.toggleAlert(a.id)}>{a.status === "Active" ? "Pause" : "Resume"}</EPGhost>
            <EPGhost onClick={() => act.deleteAlert(a.id)}>{st.deleteAsk === a.id ? "Confirm delete — scope and filters are lost" : "Delete"}</EPGhost>
            {a.newMatches > 0 && <span style={{ marginLeft: "auto", alignSelf: "center", fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 700, color: "var(--accent)" }}>{a.newMatches} new</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---- listings / detail ------------------------------------------------------
// Dense = desktop listing skin: as many ≥250px columns as the panel allows (2 at
// 1366, 3 on wider screens) — never a forced column count.
const epCols = (isMobile, dense) => isMobile ? "1fr" : dense ? "repeat(auto-fill, minmax(250px, 1fr))" : "repeat(2, minmax(0,1fr))";
function EPListings({ view, st, act, isMobile, dense, sort }) {
  if (st.phase === "loading") return (
    <div style={{ display: "grid", gridTemplateColumns: epCols(isMobile, dense), gap: dense ? "14px" : "16px" }}>
      {[0, 1, 2, 3].map((i) => <div key={i} style={{ height: "300px", borderRadius: "var(--radius-lg)", background: "linear-gradient(100deg, var(--canvas-200) 30%, var(--stone-300) 50%, var(--canvas-200) 70%)", border: "1px solid var(--border)" }} />)}
    </div>
  );
  return <window.ExpListingsGrid homes={epSorted(view.results, sort, st.filters).slice(0, st.shown)} st={st} act={act} isMobile={isMobile} dense={dense} />;
}
function ExpListingsGrid({ homes, st, act, isMobile, distFrom, dense }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: epCols(isMobile, dense), gap: dense ? "14px" : "16px" }}>
      {homes.map((l) => (
        <window.DPListingCard key={l.id} listing={l} saved={st.saved.indexOf(l.id) !== -1} onToggleSave={act.toggleSave} onHover={act.hover} onOpen={act.openListing}
          signedIn={st.signedIn} priceText={EP.priceText(l, st.filters)} distanceKm={distFrom ? window.BLR_DIST(distFrom, l) : null} />
      ))}
    </div>
  );
}

// ---- Commercial detail: the SAME detail view, made subtype-aware -------------
// Absent fields are omitted outright. Broker-entered claims sit inside a labelled
// block. Anonymous and authenticated differ only in the price treatment, the
// location precision and the contact block.
function EPComRows({ rows }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {rows.map((r, i) => (
        <div key={r[0]} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px", padding: "7px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
          <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>{r[0]}</span>
          <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--text-strong)", textAlign: "right" }}>{r[1]}</span>
        </div>
      ))}
    </div>
  );
}
function EPComSection({ s }) {
  if (s.broker) {
    return (
      <div data-design-component="broker-disclosure" style={{ borderRadius: "var(--radius-md)", background: "var(--ochre-50)", border: "1px solid rgba(169,116,28,0.24)", padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "9px" }}>
          <EIcon name="info" size={14} color="var(--ochre-600)" />
          <span style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--ochre-600)" }}>Broker-provided information — {s.title.toLowerCase()}</span>
        </div>
        <EPComRows rows={s.rows} />
        <p style={{ margin: "9px 0 0", fontSize: "11.5px", lineHeight: 1.45, color: "var(--text-muted)", textWrap: "pretty" }}>Entered by the listing broker. ReTrends has not independently checked these details.</p>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <EPToolLabel>{s.title}</EPToolLabel>
      <EPComRows rows={s.rows} />
    </div>
  );
}
function EPComDetail({ l, st, act, view }) {
  const signedIn = !!st.signedIn;
  return (
    <div data-design-component="commercial-detail" data-subtype={l.comSub} style={{ display: "flex", flexDirection: "column", gap: "13px" }}>
      <button onClick={act.backToResults} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 700, color: "var(--accent)" }}>‹ Back to results</button>
      <div style={{ borderRadius: "var(--radius-lg)", overflow: "hidden", background: "var(--surface-card)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
        <div style={{ position: "relative" }}>
          <img src={l.image} alt={l.title} style={{ width: "100%", height: "210px", objectFit: "cover", display: "block" }} />
          <div style={{ position: "absolute", top: "11px", left: "11px" }}><EPComTag sub={l.comSub} /></div>
        </div>
        <div style={{ padding: "16px 18px 18px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <EPComPrice l={l} signedIn={signedIn} big />
              <h3 style={{ margin: "8px 0 4px", fontSize: "17px", fontWeight: 700, color: "var(--text-strong)", lineHeight: 1.3, letterSpacing: "-0.01em" }}>{l.title}</h3>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--text-muted)", flexWrap: "wrap" }}>
                <EIcon name="map-pin" size={13} color="var(--grey-400)" />
                {signedIn ? l.locality + ", " + l.area : l.coarse}
                {!signedIn && <span style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--text-muted)" }}>Approximate</span>}
              </div>
            </div>
            <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{l.deal}</span>
          </div>
        </div>
      </div>
      {l.comSub !== "shop" && l.comSub !== "office" && l.comSub !== "building" && l.comSub !== "warehouse" && l.comSub !== "land" && (
        <EPNote tone="warn">This listing has no recorded Commercial subtype, so it is shown as Commercial with generic details only.</EPNote>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>
        <EPToolLabel>Summary</EPToolLabel>
        <div data-design-component="commercial-summary" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "8px" }}>
          {l.summary.map((it) => (
            <div key={it.label} style={{ display: "flex", alignItems: "center", gap: "9px", padding: "9px 11px", background: "var(--surface-subtle)", borderRadius: "var(--radius-md)", minWidth: 0 }}>
              <EIcon name={it.icon} size={15} color="var(--grey-500)" />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "10px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{it.label}</span>
                <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.value}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      {l.sections.map((s) => <EPComSection key={s.title} s={s} />)}
      {/* What ReTrends actually checks, stated plainly. Nothing here asserts verified
          ownership, approvals, zoning or legal clearance, and signing in does not
          change any of it. */}
      <div data-design-component="trust-scope" style={{ borderRadius: "var(--radius-md)", background: "var(--surface-subtle)", border: "1px solid var(--border)", padding: "12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: l.trustTier === "verified" ? "var(--evergreen-600)" : l.trustTier === "trusted" ? "var(--ochre-600)" : "var(--grey-400)", flex: "none" }} />
          <span style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-strong)" }}>{EP.com ? EP.com.tierText(l.trustTier) : "Broker-submitted listing"}</span>
        </div>
        <p style={{ margin: 0, fontSize: "11.5px", lineHeight: 1.45, color: "var(--text-muted)", textWrap: "pretty" }}>{EP.com ? EP.com.tierNote(l.trustTier) : ""} Ownership, approvals, zoning and legal status are not checked by ReTrends.</p>
      </div>
      {signedIn ? (
        <div data-design-component="contact-block" style={{ borderRadius: "var(--radius-lg)", border: "1px solid var(--border)", background: "var(--surface-card)", boxShadow: "var(--shadow-xs)", padding: "15px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
            <span style={{ flex: "none", width: "32px", height: "32px", borderRadius: "var(--radius-md)", background: "var(--navy-100)", display: "grid", placeItems: "center" }}><EIcon name="message-circle" size={16} color="var(--navy-800)" /></span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontSize: "14px", fontWeight: 700, color: "var(--text-strong)" }}>Contact the listing broker</span>
              <span style={{ display: "block", fontSize: "11.5px", color: "var(--text-muted)" }}>Listed by a ReTrends broker</span>
            </span>
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <EPPrimary onClick={() => { }}>Request a callback</EPPrimary>
            <EPGhost onClick={() => { }}>Send a message</EPGhost>
          </div>
          <p style={{ margin: 0, fontSize: "11.5px", lineHeight: 1.45, color: "var(--text-muted)" }}>Enquiries go through ReTrends. The broker's phone number and email are not shown here.</p>
        </div>
      ) : (
        <div data-design-component="price-gate" style={{ borderRadius: "var(--radius-lg)", border: "1px solid rgba(138,106,34,0.32)", background: "var(--gold-100)", padding: "15px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={COM_GOLD} strokeWidth="2" strokeLinecap="round"><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            <span style={{ fontSize: "14.5px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{l.band ? "Sign in for the exact " + (l.deal === "For Sale" ? "price" : "rent") : "Sign in to view the price"}</span>
          </div>
          <p style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.5, color: "var(--text-body)", textWrap: "pretty" }}>
            {l.band ? "You are seeing a price band and an approximate location. Signing in shows the exact figure, the street-level location and a way to reach the broker." : "Signing in shows the exact figure, the street-level location and a way to reach the broker."}
          </p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <EPPrimary onClick={act.toggleSignedIn}>Sign in</EPPrimary>
            <EPGhost onClick={act.toggleSignedIn}>Create an account</EPGhost>
          </div>
          <p style={{ margin: 0, fontSize: "11.5px", lineHeight: 1.45, color: "var(--text-muted)" }}>Phone numbers and email addresses are never shown in Discover. Enquiries go through ReTrends. Signing in reveals the figures the broker supplied — it does not verify them.</p>
        </div>
      )}
      <EPNote tone="muted">Your search, filters and map view are restored when you go back{view.scopeKind === "AREA_SET" ? " — " + view.committed.map((k) => EP.byKey[k].name).join(" + ") : view.scopeKind ? " — " + (SCOPE_TITLE[view.scopeKind] || "your results") : ""}, along with the place you had reached in the list.</EPNote>
    </div>
  );
}
function EPDetail({ st, act, view }) {
  const l = EP.listings.find((x) => x.id === st.detail);
  if (!l) return null;
  if (EP.isCom(l)) return <EPComDetail l={l} st={st} act={act} view={view} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <button onClick={act.backToResults} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 700, color: "var(--accent)" }}>‹ Back to results</button>
      <div style={{ borderRadius: "var(--radius-lg)", overflow: "hidden", background: "var(--surface-card)", border: "1px solid var(--border)", boxShadow: "var(--shadow-sm)" }}>
        <img src={l.image} alt={l.title} style={{ width: "100%", height: "230px", objectFit: "cover" }} />
        <div style={{ padding: "16px 18px 20px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "26px", fontWeight: 700, color: "var(--text-strong)" }}>{EP.priceText(l, st.filters)}</span>
            <EBadge tone="neutral" pill>{l.propType}</EBadge>
          </div>
          <h3 style={{ margin: "8px 0 4px", fontSize: "17px", fontWeight: 700, color: "var(--text-strong)" }}>{l.title}</h3>
          <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>{l.locality}, {l.area}</div>
          <div style={{ display: "flex", gap: "18px", marginTop: "14px", fontFamily: "var(--font-mono)", fontSize: "13px", color: "var(--text-body)" }}>
            {l.propType === "Plot"
              ? <><span>{l.sqft.toLocaleString("en-IN")} sq.ft plot</span><span>Land</span><span>{l.ready ? "Ready to register" : "Documentation in progress"}</span></>
              : <><span>{l.beds} BHK</span><span>{l.baths} baths</span><span>{l.sqft} sq.ft</span><span>{l.ready ? "Ready to move" : "Under construction"}</span></>}
          </div>
          <div style={{ marginTop: "16px", padding: "12px", borderRadius: "var(--radius-md)", background: "var(--trust-verified-bg)", fontSize: "12.5px", color: "var(--evergreen-600)", fontWeight: 600 }}>
            {l.trustTier === "verified" ? "Documents verified · RERA registered · broker checked" : l.trustTier === "trusted" ? "Broker checked · documents pending" : "Listed — verification not complete"}
          </div>
        </div>
      </div>
      <EPNote tone="muted">Your search, filters and map view are restored when you go back{view.scopeKind === "AREA_SET" ? " — " + view.committed.map((k) => EP.byKey[k].name).join(" + ") : view.scopeKind ? " — " + (SCOPE_TITLE[view.scopeKind] || "your results") : ""}, along with the place you had reached in the list.</EPNote>
    </div>
  );
}

// secondary text action — identical treatment to the journey-root "Browse all listings →"
// link in ExpModeBar (MB browse-all button): no border/background, muted default,
// text-strong on hover/focus, trailing arrow icon.
function EPBrowseAllLink({ onClick, children }) {
  const [h, setH] = React.useState(false);
  const [f, setF] = React.useState(false);
  const on = h || f;
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onFocus={() => setF(true)} onBlur={() => setF(false)}
      style={{ marginTop: "4px", display: "inline-flex", alignItems: "center", gap: "5px", border: "none", background: "transparent", cursor: "pointer", padding: 0, fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, color: on ? "var(--text-strong)" : "var(--text-muted)", outline: f ? "2px solid var(--accent)" : "none", outlineOffset: "3px", borderRadius: "var(--radius-xs)" }}>
      {children} <EIcon name="arrow-right" size={14} />
    </button>
  );
}
function EPHeading({ eyebrow, title, sub, stat, tint, browseAll }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "14px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: tint || "var(--accent)" }}>{eyebrow}</div>
          <h2 style={{ margin: "4px 0 0", fontFamily: "var(--font-serif)", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)", lineHeight: 1.15 }}>{title}</h2>
        </div>
        {stat && (
          <div style={{ flex: "none", textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 600, color: "var(--text-strong)" }}>{stat.v}</div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{stat.l}</div>
            {browseAll && <EPBrowseAllLink onClick={browseAll.onClick}>{browseAll.label}</EPBrowseAllLink>}
          </div>
        )}
      </div>
      {sub && <p style={{ margin: "7px 0 0", fontSize: "13px", lineHeight: 1.45, color: "var(--text-body)", maxWidth: "56ch", textWrap: "pretty" }}>{sub}</p>}
    </div>
  );
}

const JOURNEY_TINT = { areas: "var(--accent)", schools: "var(--plum-600)", agri: "var(--evergreen-600)" };

// ---- panel body -------------------------------------------------------------
function ExpPanel({ view, st, act, isMobile }) {
  const journey = view.journey;
  const navLevel = journey === "areas" ? NAV_LEVELS.indexOf(view.level) !== -1 : false;
  const showFilters = (journey === "areas" && !navLevel) || (journey === "schools" && view.level === "schools-homes");
  const heading = view.heading;
  const tint = JOURNEY_TINT[journey];
  // desktop listing skin: control bar moves to the full-width row above map + panel
  // (ExpDesktop), filters collapse into one sticky dropdown row inside the scroller.
  const skin = !isMobile && expListingSkin(st, view);
  const [sort, setSort] = React.useState("rel");
  const stickyFilters = skin && showFilters ? <FilterBarStrip><EPFiltersCompact st={st} act={act} /></FilterBarStrip> : null;
  // Near a school + Agricultural land: the SAME FilterBar in the same strip, fed their own definitions
  const schoolBar = !isMobile && journey === "schools" && view.level === "schools-homes";
  const agriBar = !isMobile && journey === "agri" && view.level === "agri-parcels";
  const compact = skin || schoolBar || agriBar;
  const journeyFilters = !st.detail && !st.alertDraft && st.view !== "alerts" && (schoolBar
    ? <FilterBarStrip><EPFiltersCompact st={st} act={act} accent="var(--plum-600)" accentTint="var(--plum-tint)" /></FilterBarStrip>
    : agriBar ? <FilterBarStrip><EPAgriFiltersCompact st={st} act={act} /></FilterBarStrip> : null);
  // the list keeps its place across a detail round trip: the offset is stored against the
  // result state it belongs to, and restored only when that same state comes back.
  const scRef = React.useRef(null);
  const posRef = React.useRef({ key: null, top: 0 });
  const onScroll = (e) => { if (!st.detail) posRef.current = { key: view.paintKey, top: e.currentTarget.scrollTop }; };
  React.useLayoutEffect(() => {
    const el = scRef.current;
    if (el && !st.detail && posRef.current.key === view.paintKey && posRef.current.top) el.scrollTop = posRef.current.top;
  }, [view.paintKey, st.detail]);
  const backBtn = view.showBack && (
    <button onClick={act.backHierarchy} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 700, color: tint }}>‹ {view.backLabel}</button>
  );

  return (
    <div data-design-component="results-panel" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--background)" }}>
      {/* mobile: unchanged full bar. desktop: global controls live in the one-row
          header; the panel keeps only contextual cues and the non-skin filter rows. */}
      {isMobile ? (
        <div style={{ flex: "none", padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "9px" }}>
          <window.ExpModeBar st={st} act={act} view={view} isMobile />
        </div>
      ) : (view.journeyRoot || (showFilters && !skin && !schoolBar)) && (
        <div style={{ flex: "none", padding: "10px 20px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "9px" }}>
          <window.ExpModeBar st={st} act={act} view={view} isMobile={false} part="cues" />
          {showFilters && !skin && !schoolBar && <EPFilters st={st} act={act} isMobile={false} />}
        </div>
      )}
      <div className="upt-scroll" ref={scRef} onScroll={onScroll} key={view.paintKey} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isMobile ? "12px 14px 108px" : compact ? "12px 20px 26px" : "14px 20px 26px", display: "flex", flexDirection: "column", gap: compact ? "10px" : "12px", animation: "expFade var(--dur-normal) var(--ease-out)" }}>
        {/* On mobile the filter groups stack at full tap height, which is taller than a
            phone can spare from a fixed header. They ride at the top of the scrolling
            body instead: every group is reachable by the scroll a phone user already
            makes, nothing is hidden behind a sideways swipe, and the search and
            List/Map above stay pinned. */}
        {showFilters && isMobile && !st.detail && !st.alertDraft && st.view !== "alerts" && (
          <div style={{ paddingBottom: "12px", marginBottom: "1px", borderBottom: "1px solid var(--border)" }}>
            <EPFilters st={st} act={act} isMobile />
          </div>
        )}
        {st.detail ? <EPDetail st={st} act={act} view={view} />
          : st.alertDraft ? <EPAlertForm view={view} st={st} act={act} />
            : st.view === "alerts" ? (
              <>
                <EPHeading eyebrow="Saved searches" title="Your alerts" stat={{ v: st.alerts.length, l: "alerts" }} />
                {st.note && <EPNote tone="ok">{st.note}</EPNote>}
                <EPAlertList st={st} act={act} />
                <EPGhost onClick={act.closeAlerts}>Back to results</EPGhost>
              </>
            ) : journey === "schools" ? (
              <>
                {backBtn}
                <EPHeading eyebrow={heading.eyebrow} title={heading.title} sub={heading.sub} stat={heading.stat} tint={tint} />
                {journeyFilters}
                {view.notes.map((n, i) => <EPNote key={i} tone={n.tone} action={n.action} onAction={n.onAction}>{n.text}</EPNote>)}
                <window.ExpSchoolsPanel view={view} st={st} act={act} isMobile={isMobile} />
              </>
            ) : journey === "agri" ? (
              <>
                {backBtn}
                <EPHeading eyebrow={heading.eyebrow} title={heading.title} sub={heading.sub} stat={heading.stat} tint={tint} />
                {journeyFilters}
                {view.notes.map((n, i) => <EPNote key={i} tone={n.tone} action={n.action} onAction={n.onAction}>{n.text}</EPNote>)}
                <window.ExpAgriPanel view={view} st={st} act={act} isMobile={isMobile} />
              </>
            ) : (
              <>
                {backBtn}
                {navLevel && !st.draft
                  ? <EPHeading eyebrow={heading.eyebrow} title={heading.title} sub={heading.sub} stat={heading.stat}
                      browseAll={(view.level === "direction" || view.level === "local") ? { label: "Browse all " + heading.stat.v + " " + heading.stat.l, onClick: act.browseHierarchy } : null} />
                  : <EPResultHead view={view} st={st} act={act} skin={skin} sort={sort} onSort={setSort} />}
                {stickyFilters}
                {view.notes.map((n, i) => <EPNote key={i} tone={n.tone} action={n.action} onAction={n.onAction}>{n.text}</EPNote>)}
                {st.confirm && (
                  <div style={{ padding: "15px 16px", borderRadius: "var(--radius-lg)", background: "var(--surface-card)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow-lg)" }}>
                    <h3 style={{ margin: 0, fontSize: "15.5px", fontWeight: 700, color: "var(--text-strong)" }}>{st.confirm.title}</h3>
                    <p style={{ margin: "6px 0 0", fontSize: "13px", lineHeight: 1.45, color: "var(--text-body)", textWrap: "pretty" }}>{st.confirm.body}</p>
                    <div style={{ display: "flex", gap: "8px", marginTop: "13px" }}>
                      <EPPrimary onClick={act.acceptConfirm}>{st.confirm.primary}</EPPrimary>
                      <EPGhost onClick={act.cancelConfirm}>{st.confirm.secondary}</EPGhost>
                    </div>
                  </div>
                )}
                {st.draft ? <EPDraftEditor view={view} st={st} act={act} isMobile={isMobile} />
                  : navLevel ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {view.destinations.map((d) => <EPDestRow key={d.key} d={d} view={view} act={act} />)}
                      {view.areaList.map((a) => <EPAreaRow key={a.key} a={a} view={view} act={act} />)}
                    </div>
                  ) : st.phase === "error" ? (
                    <div style={{ padding: "16px", borderRadius: "var(--radius-lg)", background: "var(--brick-50)", border: "1px solid var(--brick-600)" }}>
                      <h3 style={{ margin: 0, fontSize: "15.5px", fontWeight: 700, color: "var(--text-strong)" }}>We could not load these results</h3>
                      <p style={{ margin: "6px 0 12px", fontSize: "13px", color: "var(--text-body)" }}>This is a request failure, not an empty market. Your scope and filters are unchanged.</p>
                      <EPPrimary onClick={act.retry}>Retry</EPPrimary>
                    </div>
                  ) : view.results.length === 0 && st.phase !== "loading" ? <EPZero view={view} st={st} act={act} />
                    : (
                      <>
                        {view.scopeKind === "HIERARCHY" && !skin && <EPHierarchySearch view={view} st={st} act={act} />}
                        {view.areaActions && <EPAreaActions view={view} st={st} act={act} skin={skin} />}
                        {view.schoolsBlock && (
                          <div style={{ display: "flex", alignItems: "center", gap: "11px", padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--plum-tint)", border: "1px solid var(--plum-100)" }}>
                            <span style={{ flex: "none", width: "30px", height: "30px", borderRadius: "var(--radius-md)", background: "var(--plum-600)", display: "grid", placeItems: "center" }}><EIcon name="building" size={16} color="#fff" /></span>
                            <span style={{ flex: 1 }}>
                              <span style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--text-strong)" }}>Schools in {view.scopeKind === "HIERARCHY" ? view.scopeLabel : "selected areas"} · <span style={{ fontFamily: "var(--font-mono)" }}>{view.schoolsBlock.n}</span></span>
                              <span style={{ display: "block", fontSize: "11.5px", color: "var(--text-muted)", lineHeight: 1.4 }}>{view.schoolsBlock.n} schools located inside {view.schoolsBlock.names}. Not a measure of distance from any home.</span>
                            </span>
                            <EPGhost onClick={act.openAreaSchools}>Open Schools</EPGhost>
                          </div>
                        )}
                        <EPListings view={view} st={st} act={act} isMobile={isMobile} dense={skin} sort={skin ? sort : "rel"} />
                        {view.results.length > st.shown && <EPGhost onClick={act.showMore}>Show more of {view.results.length} {view.noun || "listings"}</EPGhost>}
                      </>
                    )}
              </>
            )}
      </div>
      {isMobile && view.stickyCta && (
        <div style={{ flex: "none", position: "absolute", left: 0, right: 0, bottom: 0, padding: "12px 16px 20px", background: "rgba(255,255,255,0.96)", borderTop: "1px solid var(--border)", zIndex: 30 }}>
          <EPPrimary full onClick={view.stickyCta.onClick}>{view.stickyCta.label}</EPPrimary>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ExpPanel, ExpListingsGrid, EPFilters, EPFiltersCompact, FilterBar, FilterBarStrip, EPAgriFiltersCompact, EPChip, EPGroup, EPToolLabel, expListingSkin });

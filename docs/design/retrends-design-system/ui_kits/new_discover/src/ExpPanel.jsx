// Discover experience — panel. One shell body for all three journeys:
// the shared header (control bar + journey cards), then the journey's own body.
// Density: in a results state the scope label, the area title and the listing
// count are ONE block (never three stacked containers), and only one secondary
// workflow is ever expanded at a time.
const { Icon: EIcon, Badge: EBadge } = window.ReTrendsDesignSystem_f37966;
const EP = window.EXP;
const SCOPE_TITLE = { AREA_SET: "Selected areas", CITY: "All listings", POLYGON: "Drawn area", VIEWPORT: "Visible map area" };
const NAV_LEVELS = ["city", "direction", "local"];

function EPToolLabel({ children }) {
  return <span style={{ flex: "none", fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{children}</span>;
}
function EPChip({ label, on, onClick, tone }) {
  const acc = tone || "var(--accent)";
  return (
    <button onClick={onClick} aria-pressed={!!on} style={{ padding: "6px 12px", borderRadius: "var(--radius-full)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, border: "1px solid " + (on ? acc : "var(--border)"), background: on ? acc : "var(--surface-card)", color: on ? "#fff" : "var(--text-body)", transition: "background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast)" }}>{label}</button>
  );
}
function EPGhost({ children, onClick, strong }) {
  const [h, setH] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{ padding: "6px 11px", borderRadius: "var(--radius-md)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, border: "1px solid " + (strong ? "var(--navy-800)" : "var(--border-strong)"), background: h ? "var(--grey-50)" : "var(--paper)", color: "var(--text-strong)", whiteSpace: "nowrap", transition: "background var(--dur-fast)" }}>{children}</button>
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

// ---- filters (areas journey results) ---------------------------------------
function EPFilters({ st, act }) {
  const f = st.filters;
  const rent = f.purpose === "Rent";
  const budgets = rent
    ? [{ k: 0, l: "Any rent" }, { k: 20000, l: "≤ ₹20k/mo" }, { k: 35000, l: "≤ ₹35k/mo" }, { k: 60000, l: "≤ ₹60k/mo" }]
    : [{ k: 0, l: "Any price" }, { k: 5000000, l: "≤ ₹50 L" }, { k: 8000000, l: "≤ ₹80 L" }, { k: 12000000, l: "≤ ₹1.2 Cr" }];
  if (f.maxPrice && !budgets.some((b) => b.k === f.maxPrice)) budgets.push({ k: f.maxPrice, l: "≤ " + (rent ? EP.rentShort(f.maxPrice) : EP.inrShort(f.maxPrice)) });
  return (
    <div data-design-component="filter-toolbar" style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
        <EPToolLabel>Type</EPToolLabel>
        {(rent ? ["Any type", "Apartment", "Villa"] : ["Any type", "Apartment", "Villa", "Plot"]).map((t) => <EPChip key={t} label={t === "Any type" ? "All" : t + "s"} on={f.ptype === t} onClick={() => act.setFilters({ ptype: t })} />)}
        <span style={{ marginLeft: "auto", display: "flex", gap: "6px" }}>
          <EPChip label={rent ? "Available now" : "Ready to move"} on={f.ready} onClick={() => act.setFilters({ ready: !f.ready })} />
          <EPChip label="Verified only" on={f.verified} onClick={() => act.setFilters({ verified: !f.verified })} tone="var(--evergreen-600)" />
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
        <EPToolLabel>Beds</EPToolLabel>
        {[0, 1, 2, 3].map((b) => <EPChip key={b} label={b === 0 ? "Any" : b === 3 ? "3+" : String(b)} on={f.beds === b} onClick={() => act.setFilters({ beds: b })} />)}
        <span style={{ width: "10px" }} />
        <EPToolLabel>{rent ? "Monthly rent" : "Budget"}</EPToolLabel>
        {budgets.map((b) => <EPChip key={b.k} label={b.l} on={f.maxPrice === b.k} onClick={() => act.setFilters({ maxPrice: b.k })} />)}
      </div>
    </div>
  );
}

// ---- ONE result header: scope · title · count · scope controls ---------------
function EPResultHead({ view, st, act }) {
  const draft = !!st.draft;
  const kind = draft ? "AREA_SET" : view.scopeKind;
  const keys = draft ? st.draft : view.committed;
  const h = view.heading;
  const total = draft ? (view.draftTotal != null ? view.draftTotal : EP.inAreas(st.draft, st.filters).length) : view.scopeTotal;
  const eyebrow = draft ? "Draft selection · " + keys.length + " of 3 selected" : kind ? "Result scope — " + SCOPE_TITLE[kind] : h.eyebrow;
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
          {kind === "CITY" && <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 8px", borderRadius: "var(--radius-xs)", background: "var(--surface-subtle)", border: "1px solid var(--border)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-strong)" }}><EIcon name="layers" size={12} color="var(--copper-500)" />Every area in Bangalore</span>}
          {kind === "POLYGON" && <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 8px", borderRadius: "var(--radius-xs)", background: "var(--accent-tint)", border: "1px solid var(--accent)", fontSize: "12.5px", fontWeight: 700, color: "var(--copper-600)" }}>Drawn area<button onClick={act.returnToAreas} style={{ border: "none", background: "transparent", cursor: "pointer", color: "inherit", fontSize: "14px", lineHeight: 1 }}>×</button></span>}
          {kind === "VIEWPORT" && <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 8px", borderRadius: "var(--radius-xs)", background: "var(--navy-100)", border: "1px solid var(--navy-600)", fontSize: "12.5px", fontWeight: 700, color: "var(--navy-700)" }}>Visible map area</span>}
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

// ---- area landing: compact actions ------------------------------------------
function EPAreaActions({ view, st, act }) {
  const key = view.committed[0];
  const name = EP.byKey[key].name;
  const schoolN = EP.byKey[key].schools;
  const [q, setQ] = React.useState(st.query || "");
  React.useEffect(() => setQ(st.query || ""), [st.query, key]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div data-design-component="property-search" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 12px", minHeight: "40px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
        <EIcon name="search" size={15} color="var(--grey-400)" />
        <input value={q} onChange={(e) => { setQ(e.target.value); act.setQuery(e.target.value); }} placeholder={"Search " + name + " by road, project or landmark…"}
          style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-sans)", fontSize: "13px", color: "var(--text-strong)" }} />
        {q && <button onClick={() => { setQ(""); act.setQuery(""); }} style={{ border: "none", background: "var(--surface-subtle)", cursor: "pointer", borderRadius: "var(--radius-full)", width: "20px", height: "20px", lineHeight: 1, color: "var(--text-muted)" }}>×</button>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        <button data-design-component="school-shortcut" onClick={act.openAreaSchools}
          style={{ display: "flex", alignItems: "center", gap: "9px", padding: "9px 11px", borderRadius: "var(--radius-md)", cursor: "pointer", textAlign: "left", background: "var(--plum-tint)", border: "1px solid var(--plum-100)" }}>
          <span style={{ flex: "none", width: "30px", height: "30px", borderRadius: "var(--radius-md)", background: "var(--plum-600)", display: "grid", placeItems: "center" }}><EIcon name="building" size={16} color="#fff" /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--text-strong)" }}>Schools in {name}</span>
            <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: "11.5px", color: "var(--plum-600)" }}>{schoolN} schools · keeps this area</span>
          </span>
          <span style={{ flex: "none", fontSize: "14px", fontWeight: 700, color: "var(--plum-600)" }}>›</span>
        </button>
        <button onClick={act.openDraft}
          style={{ display: "flex", alignItems: "center", gap: "9px", padding: "9px 11px", borderRadius: "var(--radius-md)", cursor: "pointer", textAlign: "left", background: "var(--surface-card)", border: "1px solid var(--border-strong)" }}>
          <span style={{ flex: "none", width: "30px", height: "30px", borderRadius: "var(--radius-md)", background: "var(--accent-tint)", display: "grid", placeItems: "center" }}><EIcon name="map-pin" size={15} color="var(--copper-600)" /></span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--text-strong)" }}>Add nearby areas</span>
            <span style={{ display: "block", fontSize: "11.5px", color: "var(--text-muted)" }}>Add up to 2 nearby areas</span>
          </span>
          <span style={{ flex: "none", fontSize: "14px", fontWeight: 700, color: "var(--accent)" }}>›</span>
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
  const areaScope = kind === "AREA_SET" || kind === "CITY";
  const nearby = areaScope ? EP.nearbyFor(view.committed, st.filters).filter((n) => n.n > 0).slice(0, 3) : [];
  const returnKeys = (view.returnAreaKeys || []).filter((k) => EP.byKey[k]);
  const scopeLine = view.zeroScopeNames ? view.zeroScopeNames.join(" · ") : view.scopeLabel;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ padding: "14px 16px", borderRadius: "var(--radius-lg)", background: "var(--ochre-50)", border: "1px solid var(--ochre-600)" }}>
        <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "var(--text-strong)", lineHeight: 1.3 }}>
          {kind === "AREA_SET" ? `No matching ${view.noun || "listings"} in your ${view.committed.length} selected area${view.committed.length > 1 ? "s" : ""}` : kind === "POLYGON" ? `No matching ${view.noun || "listings"} inside your drawn area` : kind === "CITY" ? `No matching ${view.noun || "listings"} anywhere in Bangalore` : `No matching ${view.noun || "listings"} in the visible map area`}
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
      {areaScope && nearby.length > 0 && (
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
      {areaScope && nearby.length === 0 && <EPNote tone="muted">No nearby area has matches with these filters either. A filter change below is the honest next step.</EPNote>}
      {relax.length > 0 && (
        <div>
          <EPToolLabel>Change one filter</EPToolLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: "7px", marginTop: "7px" }}>
            {relax.map((r) => (
              <button key={r.label} onClick={() => act.applyRelax(r.patch)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "11px 12px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)" }}>
                <span style={{ fontSize: "13.5px", fontWeight: 600, color: "var(--text-strong)" }}>{r.label}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "12.5px", fontWeight: 700, color: "var(--accent)" }}>{r.n} listings</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <EPGhost strong onClick={act.openAlertForm}>Create alert for this search</EPGhost>
        <EPGhost onClick={act.simulateError}>Simulate a backend failure</EPGhost>
      </div>
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
function EPListings({ view, st, act, isMobile }) {
  if (st.phase === "loading") return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0,1fr))", gap: "16px" }}>
      {[0, 1, 2, 3].map((i) => <div key={i} style={{ height: "300px", borderRadius: "var(--radius-lg)", background: "linear-gradient(100deg, var(--canvas-200) 30%, var(--stone-300) 50%, var(--canvas-200) 70%)", border: "1px solid var(--border)" }} />)}
    </div>
  );
  return <window.ExpListingsGrid homes={view.results.slice(0, st.shown)} st={st} act={act} isMobile={isMobile} />;
}
function ExpListingsGrid({ homes, st, act, isMobile, distFrom }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0,1fr))", gap: "16px" }}>
      {homes.map((l) => (
        <window.DPListingCard key={l.id} listing={l} saved={st.saved.indexOf(l.id) !== -1} onToggleSave={act.toggleSave} onHover={act.hover} onOpen={act.openListing}
          priceText={EP.priceText(l, st.filters)} distanceKm={distFrom ? window.BLR_DIST(distFrom, l) : null} />
      ))}
    </div>
  );
}
function EPDetail({ st, act, view }) {
  const l = EP.listings.find((x) => x.id === st.detail);
  if (!l) return null;
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
            <span>{l.beds} BHK</span><span>{l.baths} baths</span><span>{l.sqft} sq.ft</span><span>{l.ready ? "Ready to move" : "Under construction"}</span>
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

function EPHeading({ eyebrow, title, sub, stat, tint }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "14px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: tint || "var(--accent)" }}>{eyebrow}</div>
          <h2 style={{ margin: "4px 0 0", fontFamily: "var(--font-serif)", fontSize: "22px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)", lineHeight: 1.15 }}>{title}</h2>
        </div>
        {stat && <div style={{ flex: "none", textAlign: "right" }}><div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 600, color: "var(--text-strong)" }}>{stat.v}</div><div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{stat.l}</div></div>}
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
      <div style={{ flex: "none", padding: isMobile ? "10px 14px" : "12px 20px", borderBottom: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "9px" }}>
        <window.ExpModeBar st={st} act={act} view={view} isMobile={isMobile} />
        {showFilters && <EPFilters st={st} act={act} />}
      </div>
      <div className="upt-scroll" ref={scRef} onScroll={onScroll} key={view.paintKey} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isMobile ? "12px 14px 108px" : "14px 20px 26px", display: "flex", flexDirection: "column", gap: "12px", animation: "expFade var(--dur-normal) var(--ease-out)" }}>
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
                {view.notes.map((n, i) => <EPNote key={i} tone={n.tone} action={n.action} onAction={n.onAction}>{n.text}</EPNote>)}
                <window.ExpSchoolsPanel view={view} st={st} act={act} isMobile={isMobile} />
              </>
            ) : journey === "agri" ? (
              <>
                {backBtn}
                <EPHeading eyebrow={heading.eyebrow} title={heading.title} sub={heading.sub} stat={heading.stat} tint={tint} />
                {view.notes.map((n, i) => <EPNote key={i} tone={n.tone} action={n.action} onAction={n.onAction}>{n.text}</EPNote>)}
                <window.ExpAgriPanel view={view} st={st} act={act} isMobile={isMobile} />
              </>
            ) : (
              <>
                {backBtn}
                {navLevel && !st.draft
                  ? <EPHeading eyebrow={heading.eyebrow} title={heading.title} sub={heading.sub} stat={heading.stat} />
                  : <EPResultHead view={view} st={st} act={act} />}
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
                        {view.areaActions && <EPAreaActions view={view} st={st} act={act} />}
                        {view.schoolsBlock && (
                          <div style={{ display: "flex", alignItems: "center", gap: "11px", padding: "10px 12px", borderRadius: "var(--radius-md)", background: "var(--plum-tint)", border: "1px solid var(--plum-100)" }}>
                            <span style={{ flex: "none", width: "30px", height: "30px", borderRadius: "var(--radius-md)", background: "var(--plum-600)", display: "grid", placeItems: "center" }}><EIcon name="building" size={16} color="#fff" /></span>
                            <span style={{ flex: 1 }}>
                              <span style={{ display: "block", fontSize: "13px", fontWeight: 700, color: "var(--text-strong)" }}>Schools in selected areas · <span style={{ fontFamily: "var(--font-mono)" }}>{view.schoolsBlock.n}</span></span>
                              <span style={{ display: "block", fontSize: "11.5px", color: "var(--text-muted)", lineHeight: 1.4 }}>{view.schoolsBlock.n} schools located inside {view.schoolsBlock.names}. Not a measure of distance from any home.</span>
                            </span>
                            <EPGhost onClick={act.openAreaSchools}>Open Schools</EPGhost>
                          </div>
                        )}
                        <EPListings view={view} st={st} act={act} isMobile={isMobile} />
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

Object.assign(window, { ExpPanel, ExpListingsGrid });

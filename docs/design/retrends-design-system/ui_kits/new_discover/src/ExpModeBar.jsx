// Discover experience — shell control bar + journey (mode) selector.
// Restored from the existing product (ui_kits/new_discover/src/NDPanel.jsx `Setup`):
// city switcher · Buy/Rent · direct search · the three journey cards
// (Areas · Schools · Agricultural) · Browse all listings · capability cues.
// Evolved for density: the cards are one compact row instead of three tall tiles.
const { Icon: MBIcon } = window.ReTrendsDesignSystem_f37966;
const MB_TINT = { areas: "var(--accent)", schools: "var(--plum-600)", agri: "var(--evergreen-600)" };
const MB_BG = { areas: "var(--accent-tint)", schools: "var(--plum-tint)", agri: "var(--evergreen-50)" };
const MB_MODES = [
  { k: "areas", label: "Areas", icon: "map-pin", sub: "Explore by neighbourhood", recommended: true },
  { k: "schools", label: "Schools", icon: "building", sub: "Find homes near a school" },
  { k: "agri", label: "Agricultural", icon: "sprout", sub: "Explore farmland beyond the city" }
];

function MBLabel({ children }) {
  return <span style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{children}</span>;
}

// one compact journey card — full-card affordance, single selected signal (check)
function MBModeCard({ m, on, onSelect, compact }) {
  const [h, setH] = React.useState(false);
  const [f, setF] = React.useState(false);
  const tint = MB_TINT[m.k];
  return (
    <button role="tab" aria-selected={on} onClick={onSelect} data-design-component="journey-card" data-journey={m.k}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onFocus={() => setF(true)} onBlur={() => setF(false)}
      style={{
        position: "relative", display: "flex", alignItems: "center", gap: "9px", padding: compact ? "7px 9px" : "8px 10px", textAlign: "left", cursor: "pointer", minWidth: 0,
        borderRadius: "var(--radius-lg)", border: on ? "1.5px solid " + tint : "1.5px solid var(--border)",
        background: on ? MB_BG[m.k] : "var(--surface-card)", boxShadow: (h || f) && !on ? "var(--shadow-sm)" : "none",
        outline: f ? "2px solid " + tint : "2px solid transparent", outlineOffset: "2px",
        transition: "border-color var(--dur-fast), background var(--dur-fast), box-shadow var(--dur-fast)", fontFamily: "var(--font-sans)"
      }}>
      <span style={{ flex: "none", width: "28px", height: "28px", borderRadius: "var(--radius-md)", background: on ? tint : "var(--surface-subtle)", display: "grid", placeItems: "center", transition: "background var(--dur-fast)" }}>
        <MBIcon name={m.icon} size={16} color={on ? "#fff" : tint} />
      </span>
      <span style={{ minWidth: 0, flex: 1, lineHeight: 1.25 }}>
        <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
          <span style={{ fontSize: "13px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-strong)", whiteSpace: "nowrap" }}>{m.label}</span>
          {m.recommended && !compact && <span style={{ padding: "1px 5px", borderRadius: "var(--radius-full)", background: "var(--accent-tint)", color: "var(--accent)", fontSize: "8.5px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>Rec</span>}
        </span>
        {!compact && <span style={{ display: "block", fontSize: "10.5px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.sub}</span>}
      </span>
      {on && (
        <span style={{ flex: "none", width: "17px", height: "17px", borderRadius: "var(--radius-full)", background: tint, display: "grid", placeItems: "center" }}>
          <MBIcon name="check" size={11} color="#fff" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

// capability cues — change with the selected journey (journey roots only)
function MBCues({ journey }) {
  const EXd = window.EXP;
  const items = journey === "schools"
    ? [{ icon: "building", t: window.EXJ.schoolsUnder("blr") + " schools" }, { icon: "route", t: "Homes nearby" }, { icon: "map-pin", t: "Radius 3 / 5 / 10 km" }]
    : journey === "agri"
      ? [{ icon: "compass", t: "By direction" }, { icon: "route", t: "By distance from origin" }, { icon: "sprout", t: window.BLR_AGRI.totalParcels + " parcels" }]
      : [{ icon: "map-pin", t: EXd.areas.length + " areas" }, { icon: "building", t: EXd.listings.length + " listings" }, { icon: "trending-up", t: "Up to 3 selected areas" }];
  const tint = MB_TINT[journey];
  return (
    <div data-design-component="metadata-strip" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px 10px", padding: "6px 11px", background: MB_BG[journey], borderRadius: "var(--radius-md)" }}>
      {items.map((it, i) => (
        <React.Fragment key={it.t}>
          {i > 0 && <span style={{ width: "3px", height: "3px", borderRadius: "50%", background: "var(--grey-400)" }} />}
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11px", fontWeight: 600, color: "var(--text-body)", whiteSpace: "nowrap" }}>
            <MBIcon name={it.icon} size={13} color={tint} />{it.t}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

function MBCityPill({ city, onCity }) {
  const [open, setOpen] = React.useState(false);
  const [h, setH] = React.useState(false);
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, [open]);
  const cities = [{ name: "Bangalore", live: true }, { name: "Mumbai", live: false }, { name: "Pune", live: false }, { name: "Hyderabad", live: false }];
  return (
    <div ref={ref} data-design-component="city-switcher" style={{ position: "relative", flex: "0 0 auto" }}>
      <button onClick={() => setOpen((o) => !o)} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} aria-haspopup="listbox" aria-expanded={open} title="Change city"
        style={{ display: "flex", alignItems: "center", gap: "7px", height: "100%", padding: "0 12px", cursor: "pointer", border: "none", borderRight: "1px solid var(--border)", background: h || open ? "var(--surface-subtle)" : "transparent", borderRadius: "var(--radius-md) 0 0 var(--radius-md)", transition: "background var(--dur-fast)", fontFamily: "var(--font-sans)" }}>
        <MBIcon name="map-pin" size={15} color="var(--accent)" />
        <span style={{ fontSize: "13.5px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-strong)", whiteSpace: "nowrap" }}>{city}</span>
        <MBIcon name="chevron-down" size={14} color={h || open ? "var(--text-strong)" : "var(--grey-500)"} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform var(--dur-fast)" }} />
      </button>
      {open && (
        <div role="listbox" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 60, width: "228px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", overflow: "hidden", padding: "6px" }}>
          <div style={{ padding: "6px 10px 4px" }}><MBLabel>Change city</MBLabel></div>
          {cities.map((c) => {
            const on = c.name === city;
            return (
              <button key={c.name} disabled={!c.live} onClick={() => { setOpen(false); if (c.live) onCity(c.name); }}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", width: "100%", textAlign: "left", padding: "9px 10px", border: "none", borderRadius: "var(--radius-md)", background: on ? "var(--accent-tint)" : "transparent", cursor: c.live ? "pointer" : "not-allowed", fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 600, color: c.live ? "var(--text-strong)" : "var(--text-muted)" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}><MBIcon name="map-pin" size={15} color={on ? "var(--accent)" : "var(--grey-400)"} />{c.name}</span>
                {on ? <MBIcon name="check" size={15} color="var(--accent)" strokeWidth={3} /> : !c.live && <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-muted)" }}>Soon</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MBBuyRent({ value, onChange }) {
  return (
    <div data-design-component="buy-rent-toggle" style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "3px", padding: "0 7px", borderRight: "1px solid var(--border)" }}>
      {["Buy", "Rent"].map((o) => {
        const on = value === o;
        return <button key={o} onClick={() => onChange(o)} style={{ border: "none", cursor: "pointer", padding: "6px 12px", borderRadius: "var(--radius-full)", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, background: on ? "var(--navy-800)" : "transparent", color: on ? "#fff" : "var(--text-muted)", transition: "background var(--dur-fast)" }}>{o}</button>;
      })}
    </div>
  );
}

// direct search — journey-aware. Schools also matches school NAMES (city-wide).
function MBSearch({ st, act }) {
  const EXd = window.EXP;
  const journey = st.journey;
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const ref = React.useRef(null);
  const tint = MB_TINT[journey];
  React.useEffect(() => {
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, []);
  React.useEffect(() => setHi(0), [q, journey]);
  const results = React.useMemo(() => {
    const t = q.trim();
    if (!t) return [];
    if (journey === "schools") {
      const schools = window.EXJ.searchSchools(t).map((s) => ({ kind: "school", id: s.id, title: s.name, sub: s.board + " · " + s.area, cta: "View homes" }));
      const areas = EXd.searchAreas(t).filter((a) => a.schools > 0).slice(0, 3).map((a) => ({ kind: "area", id: a.key, title: a.name, sub: a.schools + " schools · " + EXd.ancestry(a.key).slice(1, -1).map((c) => c.label).join(" · "), cta: "View schools" }));
      return schools.slice(0, 4).concat(areas).slice(0, 6);
    }
    return EXd.searchAreas(t).map((a) => ({ kind: "area", id: a.key, title: a.name, sub: EXd.ancestry(a.key).slice(1, -1).map((c) => c.label).join(" · "), cta: journey === "agri" ? "Use as origin" : "Open area" }));
  }, [q, journey]);
  const pick = (r) => {
    if (!r) return;
    setQ(""); setOpen(false);
    if (r.kind === "school") return act.jumpSchool(r.id);
    if (journey === "agri") return act.setAgriOrigin(r.id);
    if (journey === "schools") return act.pickSchoolArea(r.id);
    act.pickArea(r.id);
  };
  const onKey = (e) => {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((i) => (i + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => (i - 1 + results.length) % results.length); }
    else if (e.key === "Enter") { e.preventDefault(); pick(results[hi]); }
    else if (e.key === "Escape") setOpen(false);
  };
  const placeholder = journey === "schools" ? "Search a school or an area…" : journey === "agri" ? "Jump to a farmland search origin…" : "Search an area — try Hebbal";
  return (
    <div ref={ref} data-design-component="area-autocomplete" style={{ position: "relative", flex: "1 1 200px", minWidth: "150px", display: "flex", alignItems: "center" }}>
      <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", display: "flex", color: open ? tint : "var(--grey-500)", pointerEvents: "none" }}><MBIcon name="search" size={16} /></span>
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey} placeholder={placeholder} aria-label="Search"
        style={{ width: "100%", padding: "0 32px 0 35px", height: "100%", minHeight: "42px", border: "none", background: "transparent", fontFamily: "var(--font-sans)", fontSize: "13.5px", color: "var(--text-strong)", outline: "none" }} />
      {q && <button onClick={() => { setQ(""); setOpen(false); }} aria-label="Clear" style={{ position: "absolute", right: "9px", top: "50%", transform: "translateY(-50%)", width: "20px", height: "20px", border: "none", borderRadius: "var(--radius-full)", background: "var(--surface-subtle)", color: "var(--text-muted)", cursor: "pointer", display: "grid", placeItems: "center" }}><MBIcon name="x" size={12} /></button>}
      {open && q.trim() && (
        <div role="listbox" style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 55, background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", overflow: "hidden", maxHeight: "320px", overflowY: "auto" }}>
          {results.length === 0
            ? <div style={{ padding: "13px 15px", fontSize: "13px", color: "var(--text-muted)" }}>Nothing matches “{q}”.</div>
            : results.map((r, i) => (
              <button key={r.kind + r.id} role="option" aria-selected={i === hi} onClick={() => pick(r)} onMouseEnter={() => setHi(i)}
                style={{ display: "flex", alignItems: "center", gap: "11px", width: "100%", textAlign: "left", padding: "10px 13px", border: "none", borderTop: i ? "1px solid var(--border)" : "none", background: i === hi ? "var(--surface-subtle)" : "transparent", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
                <span style={{ flex: "none", width: "30px", height: "30px", borderRadius: "var(--radius-md)", background: MB_BG[journey], display: "grid", placeItems: "center" }}>
                  <MBIcon name={r.kind === "school" ? "building" : journey === "agri" ? "sprout" : "map-pin"} size={15} color={tint} />
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: "13.5px", fontWeight: 700, color: "var(--text-strong)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
                  <span style={{ display: "block", fontSize: "11.5px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sub}</span>
                </span>
                <span style={{ flex: "none", fontSize: "12px", fontWeight: 700, color: tint, whiteSpace: "nowrap" }}>{r.cta} →</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// The whole shell header: control bar + journey cards (+ cues at journey roots).
function ExpModeBar({ st, act, view, isMobile }) {
  const showCues = !isMobile && view.journeyRoot;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div data-design-component="global-control-bar" style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface-card)", boxShadow: "var(--shadow-xs)", minHeight: "42px" }}>
        <MBCityPill city={st.city} onCity={act.setCity} />
        {st.journey !== "agri" && <MBBuyRent value={st.filters.purpose} onChange={(v) => act.setFilters({ purpose: v, maxPrice: 0, ptype: v === "Rent" && st.filters.ptype === "Plot" ? "Any type" : st.filters.ptype })} />}
        <MBSearch st={st} act={act} />
      </div>
      <div role="tablist" data-design-component="mode-selector" aria-label="Search journey" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "6px" }}>
        {MB_MODES.map((m) => <MBModeCard key={m.k} m={m} compact={isMobile} on={st.journey === m.k} onSelect={() => act.setJourney(m.k)} />)}
      </div>
      {showCues && (
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ flex: 1, minWidth: "180px" }}><MBCues journey={st.journey} /></span>
          {st.journey !== "agri" && (
            <button onClick={act.browseAll} style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "5px", border: "none", background: "transparent", cursor: "pointer", padding: 0, fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-muted)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-strong)")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}>
              Browse all listings <MBIcon name="arrow-right" size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ExpModeBar });

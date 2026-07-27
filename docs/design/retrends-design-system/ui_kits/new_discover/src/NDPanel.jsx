// Discover V2 — panel. Exports window.NDModeBar, window.NDPanelBody
// Pure view over the ctx bag from NewDiscover. Every level mirrors the map 1:1:
// each panel card ↔ one map marker (shared hover + identical navigation on click).
const { Icon: NIcon, Button: NButton } = window.ReTrendsDesignSystem_f37966;
const noun = window.BLR_NOUN;
const title = window.BLR_TITLE;
const CO = window.BLR_COUNTS;

const DIR_ARROW = { N: "\u2191", E: "\u2192", S: "\u2193", W: "\u2190", C: "\u25C9" };

// ---- compact, mutually-exclusive search-mode selector ----
const MODE_TINT = { areas: "var(--accent)", schools: "var(--plum-600)", agri: "var(--evergreen-600)" };
const MODE_BG = { areas: "var(--accent-tint)", schools: "var(--plum-tint)", agri: "var(--evergreen-50)" };

// one compact mode card — full-card affordance, single selected signal (top-right check)
function ModeCard({ m, on, onSelect }) {
  const [h, setH] = React.useState(false);
  const [f, setF] = React.useState(false);
  const active = h || f;
  const tint = MODE_TINT[m.k];
  return (
    <button role="tab" aria-selected={on} onClick={onSelect}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onFocus={() => setF(true)} onBlur={() => setF(false)}
      style={{
        position: "relative", display: "flex", flexDirection: "column", gap: "6px", padding: "10px 11px", textAlign: "left", cursor: "pointer",
        borderRadius: "var(--radius-lg)", border: on ? `1.5px solid ${tint}` : "1.5px solid var(--border)",
        background: on ? MODE_BG[m.k] : "var(--surface-card)",
        boxShadow: active && !on ? "var(--shadow-sm)" : "none",
        outline: f ? `2px solid ${tint}` : "2px solid transparent", outlineOffset: "2px",
        transition: "border-color var(--dur-fast), background var(--dur-fast), box-shadow var(--dur-fast)", fontFamily: "var(--font-sans)",
      }}>
      {on && (
        <span style={{ position: "absolute", top: "9px", right: "9px", flex: "none", width: "18px", height: "18px", borderRadius: "var(--radius-full)", background: tint, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <NIcon name="check" size={12} color="#fff" strokeWidth={3} />
        </span>
      )}
      <span style={{ flex: "none", width: "28px", height: "28px", borderRadius: "var(--radius-md)", background: on ? tint : "var(--surface-subtle)", display: "flex", alignItems: "center", justifyContent: "center", transition: "background var(--dur-fast)" }}>
        <NIcon name={m.icon} size={16} color={on ? "#fff" : tint} />
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "13.5px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>{m.label}</span>
        {m.recommended && <span style={{ padding: "1px 6px", borderRadius: "var(--radius-full)", background: "var(--accent-tint)", color: "var(--accent)", fontSize: "8.5px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>Rec</span>}
      </span>
      <span style={{ fontSize: "11px", color: "var(--text-muted)", lineHeight: 1.3, textWrap: "pretty" }}>{m.sub}</span>
    </button>
  );
}

// capability cues below the selector — change with the selected mode
function CapabilityCues({ mode }) {
  const DATA = window.BLR_DATA;
  const items = mode === "schools"
    ? [{ icon: "building", t: "Choose a school" }, { icon: "route", t: "Homes nearby" }, { icon: "map-pin", t: "Radius 5 km / 10 km" }]
    : mode === "agri"
    ? [{ icon: "compass", t: "By direction" }, { icon: "route", t: "By distance from origin" }, { icon: "sprout", t: "Farmland only" }]
    : [{ icon: "map-pin", t: `${DATA.areas.length} areas` }, { icon: "building", t: `${CO.totalHomes} properties` }, { icon: "trending-up", t: "Locality insights" }];
  const tint = MODE_TINT[mode];
  return (
    <div data-design-component="metadata-strip" style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "7px 10px", padding: "7px 11px", background: MODE_BG[mode], borderRadius: "var(--radius-md)" }}>
      {items.map((it, i) => (
        <React.Fragment key={it.t}>
          {i > 0 && <span style={{ width: "3px", height: "3px", borderRadius: "50%", background: "var(--grey-400)" }} />}
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "11.5px", fontWeight: 600, color: "var(--text-body)", whiteSpace: "nowrap" }}>
            <NIcon name={it.icon} size={13} color={tint} />{it.t}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

const SetupLabel = ({ children }) => <span style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)" }}>{children}</span>;

// ---- compact city switcher — a seamless segment of the control bar ----
function CityPill({ city }) {
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
        style={{ display: "flex", alignItems: "center", gap: "8px", height: "100%", padding: "0 13px", cursor: "pointer",
          border: "none", borderRight: "1px solid var(--border)", background: h || open ? "var(--surface-subtle)" : "transparent",
          borderRadius: "var(--radius-md) 0 0 var(--radius-md)", transition: "background var(--dur-fast)", fontFamily: "var(--font-sans)" }}>
        <NIcon name="map-pin" size={16} color="var(--accent)" />
        <span style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-strong)", whiteSpace: "nowrap" }}>{city}</span>
        <NIcon name="chevron-down" size={15} color={h || open ? "var(--text-strong)" : "var(--grey-500)"} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform var(--dur-fast)" }} />
      </button>
      {open && (
        <div role="listbox" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50, width: "230px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", overflow: "hidden", padding: "6px" }}>
          <div style={{ padding: "6px 10px 4px" }}><SetupLabel>Change city</SetupLabel></div>
          {cities.map((c) => {
            const on = c.name === city;
            return (
              <button key={c.name} disabled={!c.live} onClick={() => setOpen(false)} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", width: "100%", textAlign: "left",
                padding: "9px 10px", border: "none", borderRadius: "var(--radius-md)", background: on ? "var(--accent-tint)" : "transparent",
                cursor: c.live ? "pointer" : "not-allowed", fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 600, color: c.live ? "var(--text-strong)" : "var(--text-muted)" }}
                onMouseEnter={(e) => { if (c.live && !on) e.currentTarget.style.background = "var(--surface-subtle)"; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}><NIcon name="map-pin" size={15} color={on ? "var(--accent)" : "var(--grey-400)"} />{c.name}</span>
                {on ? <NIcon name="check" size={15} color="var(--accent)" strokeWidth={3} /> : !c.live && <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-muted)" }}>Soon</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Buy/Rent as an inline bar segment (no nested pill chrome).
function BuyRentSeg({ value, onChange }) {
  return (
    <div data-design-component="buy-rent-toggle" style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "3px", padding: "0 8px", borderRight: "1px solid var(--border)" }}>
      {["Buy", "Rent"].map((o) => {
        const on = value === o;
        return (
          <button key={o} onClick={() => onChange(o)} style={{ border: "none", cursor: "pointer", padding: "6px 13px", borderRadius: "var(--radius-full)", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, background: on ? "var(--navy-800)" : "transparent", color: on ? "#fff" : "var(--text-muted)", transition: "background var(--dur-fast)" }}>{o}</button>
        );
      })}
    </div>
  );
}

// ---- direct area autocomplete — searches an AREA; action + placeholder adapt to the mode ----
// Rendered as the flexible tail segment of the control bar (no border/label of its own).
function AreaSearch({ ctx }) {
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const ref = React.useRef(null);
  const DATA = window.BLR_DATA;
  const mode = ctx.mode;
  const action = mode === "schools" ? "View schools" : mode === "agri" ? "Use as origin" : "Open area";
  const placeholder = mode === "schools" ? "Jump to an area with schools…" : mode === "agri" ? "Jump to a farmland search origin…" : "Jump straight to any area…";
  const tint = MODE_TINT[mode];
  React.useEffect(() => {
    const f = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", f);
    return () => document.removeEventListener("mousedown", f);
  }, []);
  const results = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    let list = DATA.areas.filter((a) => a.name.toLowerCase().indexOf(term) !== -1);
    if (mode === "schools") list = list.filter((a) => CO.schoolsArea(a.id) > 0);
    return list.sort((a, b) => (a.name.toLowerCase().indexOf(term) - b.name.toLowerCase().indexOf(term)) || a.name.localeCompare(b.name)).slice(0, 6);
  }, [q, mode]);
  React.useEffect(() => setHi(0), [q, mode]);
  const pick = (a) => { if (!a) return; ctx.pickArea(a.id); setQ(""); setOpen(false); };
  const onKey = (e) => {
    if (!open || !results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((i) => (i + 1) % results.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((i) => (i - 1 + results.length) % results.length); }
    else if (e.key === "Enter") { e.preventDefault(); pick(results[hi]); }
    else if (e.key === "Escape") setOpen(false);
  };
  const regionShort = (rid) => (window.ND.region(rid) ? window.ND.region(rid).short : "");
  return (
    <div ref={ref} data-design-component="area-autocomplete" style={{ position: "relative", flex: "1 1 210px", minWidth: "150px", display: "flex", alignItems: "center" }}>
      <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", display: "flex", color: open ? tint : "var(--grey-500)", pointerEvents: "none" }}><NIcon name="search" size={16} /></span>
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
        placeholder={placeholder} aria-label="Search any area or locality"
        style={{ width: "100%", padding: "0 34px 0 36px", height: "100%", minHeight: "42px", border: "none", background: "transparent", fontFamily: "var(--font-sans)", fontSize: "13.5px", color: "var(--text-strong)", outline: "none" }} />
      {q && (
        <button onClick={() => { setQ(""); setOpen(false); }} aria-label="Clear" style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", width: "20px", height: "20px", border: "none", borderRadius: "var(--radius-full)", background: "var(--surface-subtle)", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><NIcon name="x" size={12} /></button>
      )}
      {open && q.trim() && (
        <div role="listbox" style={{ position: "absolute", top: "calc(100% + 8px)", left: 0, right: 0, zIndex: 55, background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-lg)", overflow: "hidden", maxHeight: "340px", overflowY: "auto" }}>
          {results.length === 0 ? (
            <div style={{ padding: "14px 16px", fontSize: "13px", color: "var(--text-muted)" }}>No area matches “{q}”{mode === "schools" ? " with schools" : ""}.</div>
          ) : results.map((a, i) => (
            <button key={a.id} role="option" aria-selected={i === hi} onClick={() => pick(a)} onMouseEnter={() => setHi(i)}
              style={{ display: "flex", alignItems: "center", gap: "12px", width: "100%", textAlign: "left", padding: "11px 14px", border: "none", borderTop: i ? "1px solid var(--border)" : "none", background: i === hi ? "var(--surface-subtle)" : "transparent", cursor: "pointer", fontFamily: "var(--font-sans)" }}>
              <span style={{ flex: "none", width: "32px", height: "32px", borderRadius: "var(--radius-md)", background: MODE_BG[mode], display: "flex", alignItems: "center", justifyContent: "center" }}>
                <NIcon name={mode === "schools" ? "building" : mode === "agri" ? "sprout" : "map-pin"} size={16} color={tint} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: "14px", fontWeight: 700, color: "var(--text-strong)" }}>{a.name}</span>
                <span style={{ display: "block", fontSize: "12px", color: "var(--text-muted)" }}>{regionShort(a.region)} · {ctx.city}</span>
              </span>
              <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", fontWeight: 600, color: tint, whiteSpace: "nowrap" }}>{action} <NIcon name="arrow-right" size={14} /></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- one compact control bar: city · buy/rent · direct search — then the guided mode selector ----
function Setup({ ctx }) {
  const modes = [
    { k: "areas", label: "Areas", icon: "map-pin", sub: "Explore by neighbourhood", recommended: true },
    { k: "schools", label: "Schools", icon: "building", sub: "Find homes near a school" },
    { k: "agri", label: "Agricultural", icon: "sprout", sub: "Explore farmland beyond the city" },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* one coordinated control bar */}
      <div data-design-component="global-control-bar" style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface-card)", boxShadow: "var(--shadow-xs)", minHeight: "44px" }}>
        <CityPill city={ctx.city} />
        <BuyRentSeg value={ctx.buyRent} onChange={ctx.setBuyRent} />
        <AreaSearch ctx={ctx} />
      </div>
      {/* mode selector — the guided directional journey */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}>
          <SetupLabel>Looking for</SetupLabel>
          <span style={{ fontSize: "11.5px", color: "var(--text-muted)" }}>— or explore by direction</span>
        </span>
        {ctx.mode !== "agri" && (
          <button onClick={ctx.browseAll} style={{ display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent", cursor: "pointer", padding: 0, fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-muted)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-strong)")} onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}>
            Browse all listings <NIcon name="arrow-right" size={14} />
          </button>
        )}
      </div>
      <div role="tablist" data-design-component="mode-selector" aria-label="Search mode" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", alignItems: "stretch" }}>
        {modes.map((m) => <ModeCard key={m.k} m={m} on={ctx.mode === m.k} onSelect={() => ctx.setMode(m.k)} />)}
      </div>
      <CapabilityCues mode={ctx.mode} />
    </div>
  );
}

function ColStack({ children, gap }) { return <div style={{ display: "flex", flexDirection: "column", gap: (gap || 12) + "px" }}>{children}</div>; }

// subtle reassurance strip beneath the region cards
function TrustStrip() {
  return (
    <div data-design-component="trust-strip" style={{ display: "flex", alignItems: "center", gap: "12px", marginTop: "20px", padding: "13px 16px", background: "var(--trust-verified-bg)", border: "1px solid var(--evergreen-100, #CFE6D9)", borderRadius: "var(--radius-lg)" }}>
      <span style={{ flex: "none", width: "34px", height: "34px", borderRadius: "var(--radius-full)", background: "var(--evergreen-600)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <NIcon name="shield-check" size={18} color="#fff" />
      </span>
      <p style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.45, color: "var(--text-body)", textWrap: "pretty" }}>
        <strong style={{ color: "var(--text-strong)" }}>Every listing is verified.</strong> Documents checked, RERA registered and broker confirmed before it reaches you.
      </p>
    </div>
  );
}
function ListingGrid({ list, ctx, distFrom }) {
  const isMobile = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 560px)").matches;
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "minmax(0, 1fr)" : "repeat(2, minmax(0, 1fr))", gap: "16px" }}>
      {list.map((l) => {
        const on = ctx.active === l.id;
        return (
          <div key={l.id} data-nd-card={l.id} style={{ borderRadius: "var(--radius-lg)", outline: on ? "2px solid var(--accent)" : "2px solid transparent", outlineOffset: "2px", transition: "outline-color var(--dur-fast)", scrollMarginTop: "12px" }}>
            <window.DPListingCard listing={l} onHover={ctx.setActive} onOpen={() => {}} saved={ctx.saved.includes(l.id)} onToggleSave={ctx.toggleSave} distanceKm={distFrom ? window.BLR_DIST(distFrom, l) : null} />
          </div>
        );
      })}
    </div>
  );
}

// ---- directional region / sub-cluster card (mirrors a map name-marker) ----
function DirNavCard({ node, ctx }) {
  const [h, setH] = React.useState(false);
  const [f, setF] = React.useState(false);
  const hovered = h || f || (ctx.hoverId === node.id && ctx.hoverSrc !== "panel");
  const plum = ctx.mode === "schools";
  const tint = plum ? "var(--plum-600)" : "var(--accent)";
  const enter = () => { setH(true); ctx.onHover(node.id, "panel"); };
  const leave = () => { setH(false); ctx.onHover(null, "panel"); };
  const isRegion = node.type === "region";
  const cardTitle = isRegion ? (node.dirLabel || node.region.short).replace(/\s*bangalore$/i, "").trim() : node.reps2.join(" & ");
  const moreN = node.total - node.reps4.length;
  const namesLine = node.reps4.join(" · ") + (moreN > 0 ? "  ·  +" + moreN + " " + (moreN === 1 ? "area" : "areas") : "");
  return (
    <div role="button" tabIndex={0} data-design-component="directional-card" data-nd-card={node.id} aria-label={`${cardTitle}, ${node.count} ${node.noun}. ${node.reps4.join(", ")}${moreN > 0 ? " and " + moreN + " more areas" : ""}. Activate to explore.`}
      onMouseEnter={enter} onMouseLeave={leave} onFocus={() => { setF(true); ctx.onHover(node.id, "panel"); }} onBlur={() => { setF(false); ctx.onHover(null, "panel"); }}
      onClick={() => ctx.onPickNode(node)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ctx.onPickNode(node); } }}
      style={{ background: "var(--surface-card)", border: "1px solid " + (hovered ? "var(--border-strong)" : "var(--border)"), borderRadius: "var(--radius-lg)", padding: "12px 14px", cursor: "pointer",
        boxShadow: hovered ? "var(--shadow-md)" : "var(--shadow-xs)", transform: hovered ? "translateY(-1px)" : "none", transition: "box-shadow var(--dur-normal), transform var(--dur-normal), border-color var(--dur-fast)",
        outline: (ctx.hoverId === node.id && ctx.hoverSrc === "map") || f ? `2px solid ${tint}` : "2px solid transparent", outlineOffset: "2px", display: "flex", alignItems: "center", gap: "12px" }}>
      <div style={{ flex: "none", width: "38px", height: "38px", borderRadius: "var(--radius-md)", background: hovered ? "var(--navy-800)" : "var(--navy-100)", display: "flex", alignItems: "center", justifyContent: "center", transition: "background var(--dur-fast)" }}>
        <NIcon name={node.isCentre ? "target" : "map-pin"} size={19} color={hovered ? "#fff" : "var(--navy-800)"} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
          <h3 style={{ margin: 0, fontSize: "15.5px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em", lineHeight: 1.2, whiteSpace: "nowrap" }}>{cardTitle}</h3>
          <span style={{ flex: "none", display: "inline-flex", alignItems: "baseline", gap: "4px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "16px", fontWeight: 700, color: "var(--text-strong)" }}>{node.count.toLocaleString("en-IN")}</span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{node.noun}</span>
          </span>
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-muted)", lineHeight: 1.35, marginTop: "3px", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{namesLine}</div>
      </div>
      <NIcon name="chevron-right" size={18} color={hovered ? tint : "var(--grey-400)"} style={{ flex: "none", transition: "color var(--dur-fast)" }} />
    </div>
  );
}

// area row with map hover sync
function AreaRow({ node, ctx }) {
  const [h, setH] = React.useState(false);
  const plum = ctx.mode === "schools";
  const hov = ctx.hoverId === node.id && ctx.hoverSrc === "map";
  return (
    <div data-nd-area={node.id} onMouseEnter={() => { setH(true); ctx.onHover(node.id, "panel"); }} onMouseLeave={() => { setH(false); ctx.onHover(null, "panel"); }}
      style={{ borderRadius: "var(--radius-lg)", outline: hov ? `2px solid ${plum ? "var(--plum-500)" : "var(--accent)"}` : "2px solid transparent", outlineOffset: "2px", transition: "outline-color var(--dur-fast)" }}>
      {plum ? <window.DPSchoolAreaCard area={node.area} onView={() => ctx.onPickNode(node)} /> : <window.DPAreaCard area={node.area} mode={ctx.buyRent} onView={() => ctx.onPickNode(node)} />}
    </div>
  );
}

// compact nav-level header (lighter than the navy leaf band)
function NavHeader({ ctx, eyebrow, heading, sub, stat, compact }) {
  const accentTint = ctx.mode === "schools" ? "var(--plum-600)" : ctx.mode === "agri" ? "var(--evergreen-600)" : "var(--accent)";
  return (
    <div style={{ marginBottom: compact ? "12px" : "18px" }}>
      {ctx.back && <window.DPBackLink onClick={ctx.back}>{ctx.backLabel}</window.DPBackLink>}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "14px" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: accentTint, marginBottom: compact ? "3px" : "5px" }}>{eyebrow}</div>
          <h2 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: compact ? "21px" : "24px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)", lineHeight: 1.15 }}>{heading}</h2>
        </div>
        {stat && (
          <div style={{ flex: "none", textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "22px", fontWeight: 600, color: "var(--text-strong)" }}>{typeof stat.value === "number" ? stat.value.toLocaleString("en-IN") : stat.value}</div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>{stat.label}</div>
          </div>
        )}
      </div>
      {sub && <p style={{ margin: compact ? "7px 0 0" : "10px 0 0", fontSize: compact ? "13px" : "14px", lineHeight: 1.45, color: "var(--text-body)", maxWidth: "52ch", textWrap: "pretty" }}>{sub}</p>}
    </div>
  );
}

// ---- compact results-shell controls (production parity, V2 styling) ----
function ToolLabel({ children }) { return <span style={{ flex: "none", fontSize: "10.5px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-muted)", marginRight: "2px" }}>{children}</span>; }
function FChip({ label, on, onClick, accent, icon }) {
  return (
    <button onClick={onClick} aria-pressed={on} style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "6px 12px", borderRadius: "var(--radius-full)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600,
      border: "1px solid " + (on ? accent : "var(--border)"), background: on ? accent : "var(--surface-card)", color: on ? "#fff" : "var(--text-body)", transition: "background var(--dur-fast), border-color var(--dur-fast), color var(--dur-fast)" }}>
      {icon && <NIcon name={icon} size={13} color={on ? "#fff" : "var(--grey-500)"} strokeWidth={on ? 3 : 2} />}{label}
    </button>
  );
}
// Search WITHIN the selected area's listings (distinct from the global area autocomplete).
function PropSearch({ ctx, area, isBrowse }) {
  const [q, setQ] = React.useState(ctx.listingQuery);
  React.useEffect(() => setQ(ctx.listingQuery), [ctx.listingQuery]);
  const submit = () => ctx.setListingQuery(q);
  const scope = isBrowse ? "these listings" : area.name + " properties";
  return (
    <div data-design-component="property-search" style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
      <div style={{ position: "relative", flex: 1 }}>
        <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", display: "flex", color: "var(--grey-500)", pointerEvents: "none" }}><NIcon name="search" size={16} /></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder={`Search within ${scope}…`} aria-label={`Search within ${scope}`}
          style={{ width: "100%", padding: "9px 32px 9px 36px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface-card)", fontFamily: "var(--font-sans)", fontSize: "13.5px", color: "var(--text-strong)", outline: "none", boxShadow: "var(--shadow-xs)" }} />
        {q && <button onClick={() => { setQ(""); ctx.setListingQuery(""); }} aria-label="Clear" style={{ position: "absolute", right: "9px", top: "50%", transform: "translateY(-50%)", width: "20px", height: "20px", border: "none", borderRadius: "var(--radius-full)", background: "var(--surface-subtle)", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><NIcon name="x" size={12} /></button>}
      </div>
      <button onClick={submit} style={{ flex: "none", padding: "0 16px", borderRadius: "var(--radius-md)", border: "none", background: "var(--navy-800)", color: "#fff", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600 }}>Search</button>
    </div>
  );
}
// Essential property filters — compact toolbar (type · bedrooms · verified), not a tall form.
function ListingToolbar({ ctx }) {
  const f = ctx.filters, setF = ctx.setFilters, acc = "var(--accent)";
  const ptypes = [{ k: "Any type", label: "All" }, { k: "Apartment", label: "Apartments" }, { k: "Villa", label: "Villas" }, { k: "Plot", label: "Plots" }];
  const beds = [{ k: 0, label: "Any" }, { k: 1, label: "1 BHK" }, { k: 2, label: "2 BHK" }, { k: 3, label: "3 BHK+" }];
  return (
    <div data-design-component="filter-toolbar" style={{ display: "flex", flexDirection: "column", gap: "9px", marginBottom: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap" }}>
        <ToolLabel>Type</ToolLabel>{ptypes.map((p) => <FChip key={p.k} label={p.label} on={f.ptype === p.k} onClick={() => setF({ ...f, ptype: p.k })} accent={acc} />)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap" }}>
        <ToolLabel>Beds</ToolLabel>{beds.map((b) => <FChip key={b.k} label={b.label} on={f.beds === b.k} onClick={() => setF({ ...f, beds: b.k })} accent={acc} />)}
        <span style={{ flex: 1 }} />
        <FChip label="Verified only" icon="shield-check" on={f.verified} onClick={() => setF({ ...f, verified: !f.verified })} accent="var(--evergreen-600)" />
      </div>
    </div>
  );
}
// Compact secondary action: jump into Schools for this area (keeps geographic context).
function SchoolsShortcut({ ctx, area }) {
  const [h, setH] = React.useState(false);
  return (
    <button data-design-component="school-shortcut" onClick={ctx.exploreSchools} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ display: "flex", alignItems: "center", gap: "11px", width: "100%", textAlign: "left", padding: "10px 13px", marginBottom: "12px", borderRadius: "var(--radius-md)", border: "1px solid " + (h ? "var(--plum-500)" : "var(--plum-200, #E4D3E8)"), background: "var(--plum-tint)", cursor: "pointer", fontFamily: "var(--font-sans)", boxShadow: h ? "var(--shadow-sm)" : "none", transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)" }}>
      <span style={{ flex: "none", width: "32px", height: "32px", borderRadius: "var(--radius-md)", background: "var(--plum-600)", display: "flex", alignItems: "center", justifyContent: "center" }}><NIcon name="building" size={17} color="#fff" /></span>
      <span style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
        <span style={{ display: "block", fontSize: "13.5px", fontWeight: 700, color: "var(--text-strong)" }}>Find homes near a school</span>
        <span style={{ display: "block", fontSize: "11.5px", color: "var(--text-muted)" }}>Explore schools in {area.name} — keeps this area</span>
      </span>
      <NIcon name="arrow-right" size={16} color="var(--plum-600)" style={{ flex: "none" }} />
    </button>
  );
}
// School board + level filters and name search (schools results state).
function SchoolFilters({ ctx, v }) {
  const plum = "var(--plum-600)";
  const boards = ["CBSE", "ICSE", "State", "International"].filter((b) => v.boardsAvail.indexOf(b) !== -1);
  const levels = ["Primary", "Secondary", "Higher Secondary"].filter((l) => v.levelsAvail.indexOf(l) !== -1);
  const tog = (arr, val, set) => set(arr.indexOf(val) !== -1 ? arr.filter((x) => x !== val) : arr.concat([val]));
  return (
    <div data-design-component="school-filters" style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "14px" }}>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", display: "flex", color: "var(--grey-500)", pointerEvents: "none" }}><NIcon name="search" size={16} /></span>
        <input value={ctx.schoolQuery} onChange={(e) => ctx.setSchoolQuery(e.target.value)} placeholder="Search school name…" aria-label="Search school name"
          style={{ width: "100%", padding: "9px 32px 9px 36px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface-card)", fontFamily: "var(--font-sans)", fontSize: "13.5px", color: "var(--text-strong)", outline: "none", boxShadow: "var(--shadow-xs)" }} />
        {ctx.schoolQuery && <button onClick={() => ctx.setSchoolQuery("")} aria-label="Clear" style={{ position: "absolute", right: "9px", top: "50%", transform: "translateY(-50%)", width: "20px", height: "20px", border: "none", borderRadius: "var(--radius-full)", background: "var(--surface-subtle)", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><NIcon name="x" size={12} /></button>}
      </div>
      {boards.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap" }}><ToolLabel>Board</ToolLabel>{boards.map((b) => <FChip key={b} label={b} on={ctx.schoolBoards.indexOf(b) !== -1} onClick={() => tog(ctx.schoolBoards, b, ctx.setSchoolBoards)} accent={plum} />)}</div>}
      {levels.length > 0 && <div style={{ display: "flex", alignItems: "center", gap: "7px", flexWrap: "wrap" }}><ToolLabel>Level</ToolLabel>{levels.map((l) => <FChip key={l} label={l} on={ctx.schoolLevels.indexOf(l) !== -1} onClick={() => tog(ctx.schoolLevels, l, ctx.setSchoolLevels)} accent={plum} />)}</div>}
    </div>
  );
}
// Compact school result row with "View homes →" (map hover sync via id).
function SchoolRow({ school, ctx }) {
  const [h, setH] = React.useState(false);
  const [f, setF] = React.useState(false);
  const hovered = h || f || (ctx.hoverId === school.id && ctx.hoverSrc !== "panel");
  const meta = [school.board].concat((school.levels || []).slice(0, 3)).join(" · ");
  return (
    <div role="button" tabIndex={0} data-design-component="school-result" data-nd-card={school.id} aria-label={`${school.name}. ${meta}. Activate to see homes near this school.`}
      onMouseEnter={() => { setH(true); ctx.onHover(school.id, "panel"); }} onMouseLeave={() => { setH(false); ctx.onHover(null, "panel"); }}
      onFocus={() => { setF(true); ctx.onHover(school.id, "panel"); }} onBlur={() => { setF(false); ctx.onHover(null, "panel"); }}
      onClick={() => ctx.onPickSchool(school.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ctx.onPickSchool(school.id); } }}
      style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 14px", borderRadius: "var(--radius-lg)", border: "1px solid " + (hovered ? "var(--plum-500)" : "var(--border)"), background: "var(--surface-card)", boxShadow: hovered ? "var(--shadow-md)" : "var(--shadow-xs)", cursor: "pointer", transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)", outline: (ctx.hoverId === school.id && ctx.hoverSrc === "map") || f ? "2px solid var(--plum-500)" : "2px solid transparent", outlineOffset: "2px", fontFamily: "var(--font-sans)" }}>
      <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "var(--radius-md)", background: "var(--plum-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}><NIcon name="building" size={18} color="var(--plum-600)" /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <h4 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{school.name}</h4>
        <div style={{ fontSize: "11.5px", color: "var(--text-muted)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{meta}</div>
      </div>
      <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", fontWeight: 600, color: "var(--plum-600)", whiteSpace: "nowrap" }}>View homes <NIcon name="arrow-right" size={14} /></span>
    </div>
  );
}

// Search within the current agricultural results (parcels or towns) — keeps origin/direction.
function AgriSearch({ ctx, placeholder }) {
  const [q, setQ] = React.useState(ctx.agriQuery);
  React.useEffect(() => setQ(ctx.agriQuery), [ctx.agriQuery]);
  const submit = () => ctx.setAgriQuery(q);
  return (
    <div data-design-component="agricultural-search" style={{ display: "flex", gap: "8px", marginBottom: "12px" }}>
      <div style={{ position: "relative", flex: 1 }}>
        <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", display: "flex", color: "var(--grey-500)", pointerEvents: "none" }}><NIcon name="search" size={16} /></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder={placeholder} aria-label={placeholder}
          style={{ width: "100%", padding: "9px 32px 9px 36px", borderRadius: "var(--radius-md)", border: "1px solid var(--border)", background: "var(--surface-card)", fontFamily: "var(--font-sans)", fontSize: "13.5px", color: "var(--text-strong)", outline: "none", boxShadow: "var(--shadow-xs)" }} />
        {q && <button onClick={() => { setQ(""); ctx.setAgriQuery(""); }} aria-label="Clear" style={{ position: "absolute", right: "9px", top: "50%", transform: "translateY(-50%)", width: "20px", height: "20px", border: "none", borderRadius: "var(--radius-full)", background: "var(--surface-subtle)", color: "var(--text-muted)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><NIcon name="x" size={12} /></button>}
      </div>
      <button onClick={submit} style={{ flex: "none", padding: "0 16px", borderRadius: "var(--radius-md)", border: "none", background: "var(--evergreen-600)", color: "#fff", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600 }}>Search</button>
    </div>
  );
}
// Compact inline agri origin control (no large card).
function AgriOriginBar({ ctx }) {
  const origin = ctx.agriOrigin, name = origin ? origin.name : ctx.city + " centre";
  return (
    <div data-design-component="agricultural-origin" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", padding: "7px 12px", background: "var(--evergreen-50)", border: "1px solid var(--evergreen-100, #CFE6D9)", borderRadius: "var(--radius-md)", marginBottom: "12px" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", minWidth: 0, fontSize: "12.5px", color: "var(--text-body)" }}>
        <NIcon name="target" size={15} color="var(--evergreen-600)" style={{ flex: "none" }} />
        <span style={{ minWidth: 0 }}>Search origin: <strong style={{ color: "var(--text-strong)", fontWeight: 700 }}>{name}</strong></span>
      </span>
      <button onClick={ctx.back} style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 9px", borderRadius: "var(--radius-md)", border: "1px solid var(--evergreen-600)", background: "var(--surface-card)", color: "var(--evergreen-700, #1F694A)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>Change <NIcon name="arrow-right" size={12} /></button>
    </div>
  );
}
// Compact, fully-clickable town result row (agri direction → towns).
function TownRow({ town, ctx, origin }) {
  const [h, setH] = React.useState(false);
  const [f, setF] = React.useState(false);
  const AG = window.BLR_AGRI;
  const hovered = h || f || (ctx.hoverId === town.id && ctx.hoverSrc !== "panel");
  const parcels = AG.townProps(town.id), acres = AG.townAcres(town.id);
  const distKm = Math.round(window.BLR_DIST(origin || { lat: window.BLR_DATA.city.lat, lon: window.BLR_DATA.city.lon }, town));
  return (
    <div role="button" tabIndex={0} data-design-component="town-row" data-nd-card={town.id} aria-label={`${town.name}, about ${distKm} km from ${origin ? origin.name : ctx.city}, ${parcels} parcels, ${acres.toFixed(1)} acres. Activate to view parcels.`}
      onMouseEnter={() => { setH(true); ctx.onHover(town.id, "panel"); }} onMouseLeave={() => { setH(false); ctx.onHover(null, "panel"); }}
      onFocus={() => { setF(true); ctx.onHover(town.id, "panel"); }} onBlur={() => { setF(false); ctx.onHover(null, "panel"); }}
      onClick={() => ctx.onPickNode({ type: "town", id: town.id })} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ctx.onPickNode({ type: "town", id: town.id }); } }}
      style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 14px", borderRadius: "var(--radius-lg)", border: "1px solid " + (hovered ? "var(--evergreen-600)" : "var(--border)"), background: "var(--surface-card)", boxShadow: hovered ? "var(--shadow-md)" : "var(--shadow-xs)", cursor: "pointer", transition: "border-color var(--dur-fast), box-shadow var(--dur-fast)", outline: (ctx.hoverId === town.id && ctx.hoverSrc === "map") || f ? "2px solid var(--evergreen-600)" : "2px solid transparent", outlineOffset: "2px", fontFamily: "var(--font-sans)" }}>
      <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "var(--radius-md)", background: "var(--evergreen-50)", display: "flex", alignItems: "center", justifyContent: "center" }}><NIcon name="map-pin" size={18} color="var(--evergreen-600)" /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
          <h4 style={{ margin: 0, fontSize: "14.5px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{town.name} <span style={{ fontWeight: 600, color: "var(--text-muted)", fontSize: "12.5px" }}>· {distKm} km</span></h4>
          <span style={{ flex: "none", display: "inline-flex", alignItems: "baseline", gap: "4px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: "var(--evergreen-700, #1F694A)" }}>{parcels}</span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>· {acres.toFixed(1)} ac</span>
          </span>
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{town.blurb}</div>
      </div>
      <NIcon name="chevron-right" size={18} color={hovered ? "var(--evergreen-600)" : "var(--grey-400)"} style={{ flex: "none", transition: "color var(--dur-fast)" }} />
    </div>
  );
}

function PanelBody({ ctx }) {
  const v = ctx.view;

  // marker click / step → scroll the panel to the highlighted card
  React.useEffect(() => {
    if (!ctx.active) return;
    const sc = document.querySelector(".upt-scroll");
    const card = sc && sc.querySelector('[data-nd-card="' + ctx.active + '"]');
    if (!sc || !card) return;
    const cr = card.getBoundingClientRect(), sr = sc.getBoundingClientRect();
    if (cr.top < sr.top + 8 || cr.bottom > sr.bottom - 8) sc.scrollTo({ top: sc.scrollTop + (cr.top - sr.top) - 20, behavior: "smooth" });
  }, [ctx.active]);

  // ===== residential nav levels =====
  if (v.level === "regions") {
    return (
      <>
        <NavHeader ctx={ctx} eyebrow={`Discover ${ctx.city}`} heading={ctx.mode === "schools" ? "Where do you want schools?" : "Where do you want to explore?"}
          stat={{ value: v.total, label: ctx.noun }} compact />
        <window.DPSection icon="compass" tight right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{v.nodes.length} regions</span>}>{ctx.mode === "schools" ? "School regions" : "Directional regions"}</window.DPSection>
        <ColStack gap={8}>{v.nodes.map((n) => <DirNavCard key={n.id} node={n} ctx={ctx} />)}</ColStack>
        <TrustStrip />
      </>
    );
  }
  if (v.level === "clusters") {
    return (
      <>
        <NavHeader ctx={ctx} eyebrow={v.crumbLabel} heading={`Inside ${v.scopeName}`} sub="This region splits again into directional clusters. Each sits in its real direction on the map." stat={{ value: v.count, label: ctx.noun }} />
        <window.DPSection icon="compass" right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{v.nodes.length} clusters</span>}>Directional clusters</window.DPSection>
        <ColStack>{v.nodes.map((n) => <DirNavCard key={n.id} node={n} ctx={ctx} />)}</ColStack>
      </>
    );
  }
  if (v.level === "areas") {
    return (
      <>
        <NavHeader ctx={ctx} eyebrow={v.crumbLabel} heading={`Areas in ${v.scopeName}`} sub={ctx.mode === "schools" ? "Pick an area to see the schools in it." : "Pick an area to open its listings."} stat={{ value: v.nodes.length, label: v.nodes.length === 1 ? "area" : "areas" }} />
        <window.DPSection icon="map-pin" right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{v.nodes.length} areas</span>}>{ctx.mode === "schools" ? "Areas with schools" : "Areas"}</window.DPSection>
        <ColStack>{v.nodes.map((n) => <AreaRow key={n.id} node={n} ctx={ctx} />)}</ColStack>
      </>
    );
  }
  if (v.level === "schools") {
    const area = window.BLR_DATA.areas.find((a) => a.id === v.areaId);
    const homesCount = v.areaListings.length;
    return (
      <>
        <NavHeader ctx={ctx} eyebrow="Schools · your area is kept" heading={`Schools in ${area.name}`} sub="Search and filter schools, then view homes near the one you choose. Your area stays selected." stat={{ value: v.schoolList.length, label: v.schoolList.length === 1 ? "school" : "schools" }} compact />
        <SchoolFilters ctx={ctx} v={v} />
        {v.schoolList.length === 0
          ? <window.DPEmpty accent="plum" icon="building" title="No schools match" body="Clear a board or level filter, or search a different name." actions={<NButton variant="primary" size="md" onClick={() => { ctx.setSchoolBoards([]); ctx.setSchoolLevels([]); ctx.setSchoolQuery(""); }}>Clear school filters</NButton>} />
          : <ColStack gap={8}>{v.schoolList.map((s) => <SchoolRow key={s.id} school={s} ctx={ctx} />)}</ColStack>}
        {homesCount > 0 && (
          <div style={{ marginTop: "22px", paddingTop: "18px", borderTop: "1px solid var(--border)" }}>
            <window.DPSection icon="building" tight right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{homesCount}</span> shown</span>}>{title(ctx.buyRent)} in {area.name}</window.DPSection>
            <ListingGrid list={v.areaListings} ctx={ctx} />
          </div>
        )}
      </>
    );
  }
  if (v.level === "homes") {
    const school = window.BLR_DATA.schools.find((s) => s.id === v.schoolId);
    const homes = ctx.items;
    return (
      <>
        <NavHeader ctx={ctx} eyebrow="Selected school" heading={school.name.split(",")[0]} sub={school.address} stat={{ value: homes.length, label: noun(ctx.buyRent, homes.length) }} compact />
        <window.DPRadius value={ctx.radiusKm} onChange={ctx.setRadiusKm} school={school} />
        {homes.length === 0
          ? <window.DPEmpty accent="plum" icon="route" title={`No homes within ${ctx.radiusKm} km`} body="Try a wider radius or change the school."
              actions={<>{ctx.radiusKm < 10 && <NButton variant="primary" size="md" onClick={() => ctx.setRadiusKm(ctx.radiusKm === 3 ? 5 : 10)}>Try {ctx.radiusKm === 3 ? 5 : 10} km</NButton>}<NButton variant="outline" size="md" onClick={ctx.back}>Change school</NButton></>} />
          : <><window.DPSection icon="map-pin" tight right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{homes.length}</span> within {ctx.radiusKm} km</span>}>Homes near {school.name.split(",")[0]}</window.DPSection>
              <ListingGrid list={homes} ctx={ctx} distFrom={school} /></>}
      </>
    );
  }
  if (v.level === "listings" || v.level === "browse") {
    const area = v.area;
    const list = ctx.items;
    const isBrowse = v.level === "browse";
    const heading = isBrowse ? (v.regionId ? `All homes in ${window.ND.region(v.regionId).name}` : `All homes in ${ctx.city}`) : `Properties in ${area.name}`;
    const total = v.itemsRaw ? v.itemsRaw.length : list.length;
    const filtered = ctx.listingQuery.trim() || list.length !== total;
    return (
      <>
        <NavHeader ctx={ctx} eyebrow={isBrowse ? "Browse all listings" : "Selected area"} heading={heading} sub={isBrowse ? "Every verified home in scope on one filterable list." : area.blurb} stat={{ value: total, label: noun(ctx.buyRent, total) }} compact />
        {!isBrowse && <SchoolsShortcut ctx={ctx} area={area} />}
        <PropSearch ctx={ctx} area={area} isBrowse={isBrowse} />
        <ListingToolbar ctx={ctx} />
        {list.length === 0
          ? <window.DPEmpty icon="sliders-horizontal" title="No homes match" body={ctx.listingQuery.trim() ? "No listings match your search and filters." : "Widen the budget or bedrooms, or switch Buy/Rent."}
              actions={<NButton variant="primary" size="md" onClick={() => { ctx.setFilters(window.DP_DEFAULT_FILTERS); ctx.setListingQuery(""); }}>Clear search & filters</NButton>} />
          : <><window.DPSection icon="building" tight right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{filtered ? <><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{list.length}</span> of {total} · <button onClick={() => { ctx.setFilters(window.DP_DEFAULT_FILTERS); ctx.setListingQuery(""); }} style={{ border: "none", background: "transparent", color: "var(--accent)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, padding: 0 }}>Reset</button></> : <><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{list.length}</span> shown</>}</span>}>{title(ctx.buyRent)}</window.DPSection>
              <ListingGrid list={list} ctx={ctx} /></>}
      </>
    );
  }

  // ===== agri levels =====
  if (v.level === "corridors") {
    const corridors = window.BLR_DATA.agri.corridors;
    const origin = ctx.agriOrigin; // {name,lat,lon} or null
    const originName = origin ? origin.name : ctx.city + " centre";
    return (
      <>
        <NavHeader ctx={ctx} eyebrow="Agricultural land" heading={origin ? `Agricultural land around ${origin.name}` : `Farmland out of ${ctx.city}`}
          sub={origin ? `Explore farmland by outbound direction and distance from ${origin.name}, or reset to search from ${ctx.city} centre.` : `Explore farmland by outbound direction and distance from ${ctx.city}, or choose another area as the search origin.`}
          stat={{ value: window.BLR_AGRI.totalParcels, label: "parcels" }} compact />
        <div data-design-component="agricultural-origin" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", padding: "8px 12px", background: "var(--evergreen-50)", border: "1px solid var(--evergreen-100, #CFE6D9)", borderRadius: "var(--radius-md)", marginBottom: "12px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", minWidth: 0, fontSize: "12.5px", color: "var(--text-body)" }}>
            <NIcon name="target" size={15} color="var(--evergreen-600)" style={{ flex: "none" }} />
            <span style={{ minWidth: 0 }}>Search origin: <strong style={{ color: "var(--text-strong)", fontWeight: 700 }}>{originName}</strong></span>
          </span>
          {origin && (
            <button onClick={ctx.resetAgriOrigin} style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", borderRadius: "var(--radius-md)", border: "1px solid var(--evergreen-600)", background: "var(--surface-card)", color: "var(--evergreen-700, #1F694A)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>
              Use {ctx.city} centre <NIcon name="x" size={12} />
            </button>
          )}
        </div>
        <window.DPSection icon="compass" tight right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}>{corridors.length} directions</span>}>{origin ? "Directions from " + origin.name : "Outbound directions"}</window.DPSection>
        <ColStack gap={8}>{corridors.map((c) => <window.DPCorridorCard key={c.id} corridor={c} origin={origin} onView={(id) => ctx.onPickNode({ type: "corridor", id })} highlighted={ctx.hoverId === c.id && ctx.hoverSrc === "map"} onHover={ctx.onHover} />)}</ColStack>
      </>
    );
  }
  if (v.level === "towns") {
    const AG = window.BLR_AGRI, corridor = window.BLR_DATA.agri.corridors.find((c) => c.id === v.corridorId);
    const km = ctx.maxKm, origin = ctx.agriOrigin;
    const DIRWORD = { N: "North", E: "East", S: "South", W: "West" };
    const dirWord = origin ? DIRWORD[v.oDir] : DIRWORD[corridor.dir] || corridor.short;
    const townTitle = origin ? `${dirWord} of ${origin.name}` : corridor.label;
    let towns = AG.visibleTowns(v.corridorId, km);
    if (ctx.agriQuery.trim()) { const t = ctx.agriQuery.trim().toLowerCase(); towns = towns.filter((c) => (c.name + " " + (c.blurb || "")).toLowerCase().indexOf(t) !== -1); }
    const parcels = AG.dirProps(v.corridorId, km), acres = AG.dirAcres(v.corridorId, km);
    return (
      <>
        <NavHeader ctx={ctx} eyebrow={origin ? "Origin: " + origin.name : "Direction from " + ctx.city} heading={townTitle}
          sub={`${dirWord.toLowerCase()} farmland by distance — cumulative bands include closer parcels too.`}
          stat={{ value: parcels, label: parcels === 1 ? "parcel" : "parcels" }} compact />
        <AgriOriginBar ctx={ctx} />
        <window.DPDistanceChips distances={ctx.agriDistances} value={km} onChange={ctx.setMaxKm} count={(k) => AG.dirProps(v.corridorId, k)} originName={origin ? origin.name : null} />
        <AgriSearch ctx={ctx} placeholder="Search towns or land type…" />
        {towns.length === 0
          ? <window.DPEmpty accent="agri" icon="route" title={ctx.agriQuery.trim() ? "No towns match" : `No towns within ${km} km`} body={ctx.agriQuery.trim() ? "Clear the search or widen the distance." : "Increase the distance band."} actions={<NButton variant="primary" size="md" onClick={() => { ctx.setAgriQuery(""); ctx.setMaxKm(ctx.agriDistances[ctx.agriDistances.length - 1]); }}>Widen</NButton>} />
          : <><window.DPSection icon="map-pin" tight right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{acres.toFixed(1)}</span> ac · within {km} km {dirWord.toLowerCase()}</span>}>Towns in {dirWord}</window.DPSection>
              <ColStack gap={8}>{towns.map((c) => <TownRow key={c.id} town={c} ctx={ctx} origin={origin} />)}</ColStack></>}
      </>
    );
  }
  if (v.level === "parcels") {
    const AG = window.BLR_AGRI, cluster = window.BLR_DATA.agri.clusters.find((c) => c.id === v.clusterId);
    const parcels = ctx.items, origin = ctx.agriOrigin;
    const DIRWORD = { N: "North", E: "East", S: "South", W: "West" };
    const dir = DIRWORD[window.BLR_DATA.agri.corridors.find((c) => c.id === v.corridorId).dir];
    return (
      <>
        <NavHeader ctx={ctx} eyebrow={`${origin ? origin.name : ctx.city} · ${dir} · up to ${ctx.maxKm} km`} heading={`${cluster.name} agricultural land`} sub={cluster.blurb}
          stat={{ value: AG.townProps(v.clusterId), label: "parcels" }} compact />
        <AgriSearch ctx={ctx} placeholder="Search these parcels…" />
        <window.DPAgriFilters f={ctx.agriFilters} setF={ctx.setAgriFilters} onClear={() => ctx.setAgriFilters(window.DP_AGRI_DEFAULTS)} />
        {parcels.length === 0
          ? <window.DPEmpty accent="agri" icon="sliders-horizontal" title="No parcels match" body="Widen the size or price, or clear the search." actions={<NButton variant="primary" size="md" onClick={() => { ctx.setAgriFilters(window.DP_AGRI_DEFAULTS); ctx.setAgriQuery(""); }}>Clear search & filters</NButton>} />
          : <><window.DPSection icon="layers" tight right={<span style={{ fontSize: "13px", color: "var(--text-muted)" }}><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--text-strong)" }}>{parcels.length}</span> shown</span>}>Parcels in {cluster.name}</window.DPSection>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "16px" }}>{parcels.map((p) => <window.DPParcelCard key={p.id} parcel={p} onOpen={() => {}} saved={ctx.saved.includes(p.id)} onToggleSave={ctx.toggleSave} />)}</div></>}
      </>
    );
  }
  return null;
}

window.NDSetup = Setup;
window.NDPanelBody = PanelBody;

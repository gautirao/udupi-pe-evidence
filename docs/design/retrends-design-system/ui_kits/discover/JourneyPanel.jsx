// Udupi Property Tracker — DISCOVERY ENTRY right panel. Exports window.UPTJourneyPanel
// Editorial, trust-led journey selector. Three visually distinct search journeys,
// each with its own identity colour (area = ink-navy, school = plum, agri =
// evergreen). Copper stays reserved for the single primary CTA.
const { Icon: PanelIcon, Select: DSSelect } = window.ReTrendsDesignSystem_f37966;

// Journey-specific glyphs not in the shared Icon subset, drawn inline (Lucide).
function GlyphLayers({ c }) {
  return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/></svg>);
}
function GlyphSchool({ c }) {
  return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/></svg>);
}
function GlyphSprout({ c }) {
  return (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6c-.9 1.2-1.4 2.5-1.5 3.9-1.4-1-2-2.7-1.7-4.5-.2-.2 2.5-.4 3.2.6z"/></svg>);
}

const GLYPH = { area: GlyphLayers, school: GlyphSchool, agri: GlyphSprout };

function Chip({ children }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 9px",
      borderRadius: "var(--radius-full)", background: "var(--surface-subtle)", border: "1px solid var(--border)",
      fontFamily: "var(--font-mono)", fontSize: "11.5px", fontWeight: 600, color: "var(--text-body)", whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

function JourneyCard({ j, selected, onSelect, onHover, compact }) {
  const [hover, setHover] = React.useState(false);
  const Glyph = GLYPH[j.key];
  const active = selected || hover;
  const primary = j.primary;

  return (
    <button
      onMouseEnter={() => { setHover(true); onHover(j.key); }}
      onMouseLeave={() => { setHover(false); onHover(null); }}
      onClick={() => onSelect(j.key)}
      style={{
        textAlign: "left", width: "100%", cursor: "pointer", display: "block",
        background: selected ? j.tint : "var(--paper)",
        border: `1.5px solid ${active ? j.accent : "var(--border)"}`,
        borderRadius: "var(--radius-lg)", padding: compact ? "16px" : "18px 20px",
        boxShadow: selected ? `var(--shadow-lg), 0 0 0 3px ${j.ring}` : (hover ? "var(--shadow-lg)" : "var(--shadow-sm)"),
        transform: hover && !selected ? "translateY(-2px)" : "translateY(0)",
        transition: "transform .2s cubic-bezier(.4,0,.2,1), box-shadow .2s cubic-bezier(.4,0,.2,1), border-color .12s, background .15s",
        fontFamily: "var(--font-sans)", position: "relative",
      }}>
      <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
        <div style={{
          width: "46px", height: "46px", flex: "none", borderRadius: "var(--radius-md)",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: active ? j.accent : j.tint,
          transition: "background .15s",
        }}>
          <Glyph c={active ? "#fff" : j.accent} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "3px" }}>
            <h3 style={{ margin: 0, fontSize: "16.5px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>{j.title}</h3>
            {primary && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "var(--radius-full)",
                background: "var(--accent-tint)", color: "var(--copper-600)", fontSize: "10.5px", fontWeight: 700,
                letterSpacing: "0.04em", textTransform: "uppercase",
              }}>Recommended</span>
            )}
            {selected && (
              <span style={{ marginLeft: "auto", display: "inline-flex", width: "20px", height: "20px", borderRadius: "50%", background: j.accent, alignItems: "center", justifyContent: "center" }}>
                <PanelIcon name="check" size={13} color="#fff" strokeWidth={3} />
              </span>
            )}
          </div>
          <p style={{ margin: "0 0 11px", fontSize: "13.5px", lineHeight: 1.5, color: "var(--text-body)" }}>{j.desc}</p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "13px" }}>
            {j.chips.map((c) => <Chip key={c}>{c}</Chip>)}
          </div>

          {primary ? (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "8px", padding: "9px 16px",
              borderRadius: "var(--radius-md)", background: active ? "var(--accent-hover)" : "var(--accent)",
              color: "#fff", fontSize: "13.5px", fontWeight: 600, transition: "background .12s",
            }}>
              {j.cta}
              <span style={{ display: "inline-flex", transform: active ? "translateX(3px)" : "none", transition: "transform .15s" }}>
                <PanelIcon name="arrow-right" size={16} color="#fff" />
              </span>
            </span>
          ) : (
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "7px",
              fontSize: "13.5px", fontWeight: 600, color: active ? j.accent : "var(--text-strong)", transition: "color .12s",
            }}>
              {j.cta}
              <span style={{ display: "inline-flex", transform: active ? "translateX(3px)" : "none", transition: "transform .15s" }}>
                <PanelIcon name="arrow-right" size={16} color={active ? j.accent : "var(--grey-500)"} />
              </span>
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ---- Loading skeletons ----
function SkelLine({ w, h }) {
  return <div className="upt-shimmer" style={{ width: w, height: h || "13px", borderRadius: "var(--radius-xs)", background: "var(--stone-300)" }} />;
}
function SkelCard({ compact }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: compact ? "16px" : "18px 20px", background: "var(--paper)", display: "flex", gap: "14px" }}>
      <div className="upt-shimmer" style={{ width: "46px", height: "46px", borderRadius: "var(--radius-md)", background: "var(--stone-300)", flex: "none" }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "9px" }}>
        <SkelLine w="55%" h="16px" />
        <SkelLine w="92%" />
        <SkelLine w="70%" />
        <div style={{ height: "4px" }} />
        <SkelLine w="38%" h="30px" />
      </div>
    </div>
  );
}

function UPTJourneyPanel({ mode, setMode, city, setCity, selected, setSelected, onHover, total, groupsCount, areasCount, loading, compact }) {
  const D = window.UPT_AREA_DATA;
  const journeys = [
    {
      key: "area", primary: true, title: "Explore by area",
      accent: "var(--navy-800)", tint: "var(--navy-100)", ring: "rgba(27,42,69,0.18)",
      desc: "Start with the neighbourhood. Explore Udupi localities, then open the properties inside the area that fits.",
      chips: [`${areasCount} areas`, `${total} properties`, "Locality insights"],
      cta: "Explore areas",
    },
    {
      key: "school", primary: false, title: "Search near a school",
      accent: "#6E4E96", tint: "#F0EAF6", ring: "rgba(110,78,150,0.18)",
      desc: "Pick a school as your anchor and see only the homes within an easy daily commute of it.",
      chips: ["5 or 10 km radius", "Homes near schools"],
      cta: "Find homes near schools",
    },
    {
      key: "agri", primary: false, title: "Find agricultural land",
      accent: "var(--evergreen-600)", tint: "var(--evergreen-50)", ring: "rgba(31,122,92,0.18)",
      desc: "Looking for farmland instead? Search parcels by corridor, direction and distance from town.",
      chips: ["By corridor & direction", "Farmland only"],
      cta: "Search farmland",
    },
  ];

  const seg = (val) => ({
    flex: 1, padding: "8px 0", textAlign: "center", cursor: "pointer", border: "none",
    borderRadius: "var(--radius-sm)", fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 600,
    background: mode === val ? "var(--paper)" : "transparent",
    color: mode === val ? "var(--text-strong)" : "var(--text-muted)",
    boxShadow: mode === val ? "var(--shadow-sm)" : "none",
    transition: "background .12s, color .12s",
  });

  return (
    <div className="upt-scroll" style={{
      height: "100%", overflowY: "auto", background: "var(--background)",
      padding: compact ? "26px 20px 40px" : "40px 44px 52px", fontFamily: "var(--font-sans)",
    }}>
      <div style={{ maxWidth: "560px", margin: "0 auto" }}>
        {/* Eyebrow */}
        <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "14px" }}>
          <PanelIcon name="map-pin" size={15} color="var(--accent)" />
          <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Discover Udupi</span>
        </div>

        {/* Hero */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "26px" }}>
            <SkelLine w="85%" h="34px" /><SkelLine w="60%" h="34px" />
            <div style={{ height: "6px" }} />
            <SkelLine w="95%" /><SkelLine w="80%" />
          </div>
        ) : (
          <>
            <h1 style={{
              margin: "0 0 14px", fontFamily: "var(--font-serif)", fontWeight: 600,
              fontSize: compact ? "30px" : "40px", lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--text-strong)",
            }}>Find your place in Udupi, your way.</h1>
            <p style={{ margin: "0 0 26px", fontSize: compact ? "15px" : "16.5px", lineHeight: 1.55, color: "var(--text-body)", maxWidth: "46ch" }}>
              Browse verified properties across coastal Karnataka. Pick how you'd like to start — by neighbourhood, by school, or by farmland.
            </p>
          </>
        )}

        {/* Controls: city + Buy/Rent */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center",
          padding: "14px", marginBottom: "10px", background: "var(--paper)",
          border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xs)",
        }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "5px", flex: compact ? "1 1 100%" : "1 1 150px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>City</span>
            <div style={{ position: "relative" }}>
              <select value={city} onChange={(e) => setCity(e.target.value)} style={{
                width: "100%", appearance: "none", WebkitAppearance: "none", padding: "9px 34px 9px 12px",
                border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", background: "var(--input-bg)",
                fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 600, color: "var(--text-strong)", cursor: "pointer",
              }}>
                <option>Udupi</option>
                <option>Mangaluru</option>
                <option>Kundapura</option>
                <option>Karkala</option>
              </select>
              <span style={{ position: "absolute", right: "11px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                <PanelIcon name="chevron-down" size={16} color="var(--grey-500)" />
              </span>
            </div>
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: "5px", flex: compact ? "1 1 100%" : "1 1 180px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>Looking to</span>
            <div style={{ display: "flex", gap: "3px", padding: "3px", background: "var(--input-bg)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-strong)" }}>
              <button style={seg("Buy")} onClick={() => setMode("Buy")}>Buy</button>
              <button style={seg("Rent")} onClick={() => setMode("Rent")}>Rent</button>
            </div>
          </div>
        </div>
        <p style={{ margin: "0 0 24px", paddingLeft: "2px", fontSize: "12.5px", color: "var(--text-muted)" }}>
          {mode === "Buy" ? "Showing sale prices in \u20b9 across every journey." : "Showing monthly rents — same properties, reworded for renting."}
        </p>

        {/* Section label */}
        <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "12px" }}>
          Three ways to search
        </div>

        {/* Journey cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {loading
            ? [0, 1, 2].map((i) => <SkelCard key={i} compact={compact} />)
            : journeys.map((j) => (
                <JourneyCard key={j.key} j={j} selected={selected === j.key} onSelect={setSelected} onHover={onHover} compact={compact} />
              ))}
        </div>

        {/* Trust strip */}
        {!loading && (
          <div style={{
            display: "flex", alignItems: "center", gap: "11px", marginTop: "24px", paddingTop: "20px",
            borderTop: "1px solid var(--border)",
          }}>
            <span style={{ width: "34px", height: "34px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--evergreen-50)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <PanelIcon name="shield-check" size={19} color="var(--evergreen-600)" />
            </span>
            <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.45, color: "var(--text-body)" }}>
              <strong style={{ color: "var(--text-strong)" }}>Every listing is verified.</strong> Documents checked, RERA registered, broker confirmed — before it reaches you.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

window.UPTJourneyPanel = UPTJourneyPanel;

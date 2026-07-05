// Udupi Property Tracker — AREA-FIRST › University Belt drill-down panel.
// Exports window.UPTUniBeltPanel.
//
// The focused drill-down AFTER a visitor picked the "University Belt" group:
//   eyebrow (AREA-FIRST + Start over) → Back to all groups → serif hero →
//   City + Buy/Rent controls → SELECTED-GROUP context card → "Localities in this
//   group" → locality cards (Manipal strong, Katapadi muted) → trust strip.
// Same editorial, trust-led language as the Discover landing & area-first landing.
const { Icon: UBIcon } = window.ReTrendsDesignSystem_f37966;

// Small left-pointing chevron (the Icon subset ships chevron-right only).
function UBBackChevron({ c, size = 15 }) {
  return (<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>);
}

function UBStatCell({ n, label, accent }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: "21px", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: accent ? "var(--copper-600)" : "var(--text-strong)" }}>{n}</div>
      <div style={{ marginTop: "5px", fontSize: "12px", color: "var(--text-muted)" }}>{label}</div>
    </div>
  );
}

// ---- Locality card: strong (has properties) vs muted (0) ----
function LocalityCard({ a, mode, selected, onSelect, onHover, compact }) {
  const [hover, setHover] = React.useState(false);
  const empty = a.properties === 0;
  const active = (selected || hover) && !empty;
  const noun = a.properties === 1 ? "property" : "properties";

  return (
    <button
      onMouseEnter={() => { if (!empty) { setHover(true); onHover(a.id); } }}
      onMouseLeave={() => { setHover(false); onHover(null); }}
      onClick={() => { if (!empty) onSelect(a.id); }}
      disabled={empty}
      aria-disabled={empty}
      style={{
        textAlign: "left", width: "100%", display: "block", cursor: empty ? "default" : "pointer",
        background: selected && !empty ? "var(--accent-tint)" : (empty ? "var(--surface-subtle)" : "var(--paper)"),
        border: `1.5px solid ${active ? "var(--accent)" : (empty ? "transparent" : "var(--border)")}`,
        borderRadius: "var(--radius-lg)", padding: compact ? "15px" : "17px 19px",
        boxShadow: selected && !empty ? "var(--shadow-lg), 0 0 0 3px rgba(176,92,58,0.18)" : (active ? "var(--shadow-lg)" : (empty ? "none" : "var(--shadow-sm)")),
        transform: hover && !selected && !empty ? "translateY(-2px)" : "translateY(0)",
        transition: "transform .2s cubic-bezier(.4,0,.2,1), box-shadow .2s cubic-bezier(.4,0,.2,1), border-color .12s, background .15s",
        fontFamily: "var(--font-sans)", opacity: empty ? 0.9 : 1,
      }}>
      <div style={{ display: "flex", gap: "13px", alignItems: "flex-start" }}>
        {/* Avatar */}
        <div style={{
          width: "44px", height: "44px", flex: "none", borderRadius: "var(--radius-md)",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: empty ? "transparent" : (active ? "var(--navy-800)" : "var(--navy-100)"),
          border: empty ? "1px dashed var(--stone-400)" : "none", transition: "background .15s",
        }}>
          <UBIcon name="map-pin" size={21} color={empty ? "var(--grey-400)" : (active ? "#fff" : "var(--navy-800)")} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title + cue */}
          <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "3px" }}>
            <h3 style={{ margin: 0, fontSize: "16.5px", fontWeight: 700, letterSpacing: "-0.01em", color: empty ? "var(--text-muted)" : "var(--text-strong)" }}>{a.name}</h3>
            <span style={{
              marginLeft: "auto", flex: "none", display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 9px", borderRadius: "var(--radius-full)",
              background: "var(--surface-subtle)", border: "1px solid var(--border)", fontFamily: "var(--font-mono)",
              fontSize: "11px", fontWeight: 600, color: "var(--text-muted)",
            }}>{a.cue}</span>
          </div>

          {/* Description */}
          <p style={{ margin: "0 0 13px", fontSize: "13px", lineHeight: 1.5, color: empty ? "var(--text-muted)" : "var(--text-body)" }}>{a.blurb}</p>

          {/* Footer: count + CTA */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
            {empty ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "12.5px", fontWeight: 600, color: "var(--text-muted)" }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", border: "1.5px solid var(--grey-400)" }} />
                0 properties
              </span>
            ) : (
              <span style={{ fontSize: "13px", color: "var(--text-body)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: active ? "var(--copper-600)" : "var(--text-strong)" }}>{a.properties}</span>{" "}{noun}
              </span>
            )}
            {empty ? (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 11px", borderRadius: "var(--radius-full)",
                background: "var(--surface-subtle)", border: "1px solid var(--border)", fontSize: "12px", fontWeight: 600, color: "var(--grey-500)",
              }}>No listings yet</span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "13.5px", fontWeight: 600, color: active ? "var(--accent)" : "var(--text-strong)", transition: "color .12s" }}>
                View properties
                <span style={{ display: "inline-flex", transform: active ? "translateX(3px)" : "none", transition: "transform .15s" }}>
                  <UBIcon name="arrow-right" size={16} color={active ? "var(--accent)" : "var(--grey-500)"} />
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

// ---- Loading skeletons ----
function UBSkelLine({ w, h }) {
  return <div className="upt-shimmer" style={{ width: w, height: h || "13px", borderRadius: "var(--radius-xs)", background: "var(--stone-300)" }} />;
}
function UBSkelCard({ compact }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: compact ? "15px" : "17px 19px", background: "var(--paper)", display: "flex", gap: "13px" }}>
      <div className="upt-shimmer" style={{ width: "44px", height: "44px", borderRadius: "var(--radius-md)", background: "var(--stone-300)", flex: "none" }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "9px" }}>
        <UBSkelLine w="50%" h="16px" /><UBSkelLine w="92%" /><UBSkelLine w="68%" />
        <div style={{ height: "4px" }} /><UBSkelLine w="55%" h="24px" />
      </div>
    </div>
  );
}

function UPTUniBeltPanel({ mode, setMode, city, setCity, loading, compact, dataState, hoverLocality, onHoverLocality, onPickLocality, onBackToGroups, onStartOver }) {
  const D = window.UPT_UNIBELT;
  const g = D.group;
  const lowData = dataState === "low";
  const localities = D.localities.map((a) => (lowData ? { ...a, properties: 0 } : a));
  const totalProps = localities.reduce((s, a) => s + a.properties, 0);
  const liveCount = localities.filter((a) => a.properties > 0).length;

  const seg = (val) => ({
    flex: 1, padding: "8px 0", textAlign: "center", cursor: "pointer", border: "none",
    borderRadius: "var(--radius-sm)", fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 600,
    background: mode === val ? "var(--paper)" : "transparent", color: mode === val ? "var(--text-strong)" : "var(--text-muted)",
    boxShadow: mode === val ? "var(--shadow-sm)" : "none", transition: "background .12s, color .12s",
  });

  return (
    <div className="upt-scroll" style={{
      height: "100%", overflowY: "auto", background: "var(--background)",
      padding: compact ? "20px 20px 40px" : "30px 44px 52px", fontFamily: "var(--font-sans)",
    }}>
      <div style={{ maxWidth: "560px", margin: "0 auto" }}>
        {/* Eyebrow row: journey tag + Start over (secondary) */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "var(--radius-full)",
            background: "var(--navy-100)", color: "var(--navy-800)", fontSize: "11px", fontWeight: 700,
            letterSpacing: "0.06em", textTransform: "uppercase",
          }}>
            <UBIcon name="layers" size={13} color="var(--navy-800)" />Area-first
          </span>
          <button onClick={onStartOver} style={{
            marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 11px",
            border: "1px solid var(--border)", background: "transparent", borderRadius: "var(--radius-full)",
            cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-muted)",
          }}>
            <UBIcon name="x" size={14} color="var(--text-muted)" />Start over
          </button>
        </div>

        {/* Back to all groups — the primary way back up the journey */}
        <button onClick={onBackToGroups} style={{
          display: "inline-flex", alignItems: "center", gap: "7px", marginBottom: "16px", padding: "8px 14px 8px 11px",
          border: "1px solid var(--border-strong)", background: "var(--paper)", borderRadius: "var(--radius-full)",
          cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--text-strong)",
          boxShadow: "var(--shadow-xs)",
        }}>
          <UBBackChevron c="var(--navy-800)" />Back to all groups
        </button>

        {/* Hero */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
            <UBSkelLine w="90%" h="32px" /><UBSkelLine w="60%" h="32px" />
            <div style={{ height: "6px" }} /><UBSkelLine w="95%" /><UBSkelLine w="74%" />
          </div>
        ) : (
          <>
            <h1 style={{
              margin: "0 0 13px", fontFamily: "var(--font-serif)", fontWeight: 600,
              fontSize: compact ? "27px" : "37px", lineHeight: 1.12, letterSpacing: "-0.02em", color: "var(--text-strong)",
            }}>Choose a locality in University Belt</h1>
            <p style={{ margin: "0 0 24px", fontSize: compact ? "14.5px" : "16px", lineHeight: 1.55, color: "var(--text-body)", maxWidth: "50ch" }}>
              Pick a locality around Manipal and nearby areas, then open the properties available there.
            </p>
          </>
        )}

        {/* Controls: city + Buy/Rent */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", padding: "14px", marginBottom: "10px",
          background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xs)",
        }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "5px", flex: compact ? "1 1 100%" : "1 1 150px" }}>
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>City</span>
            <div style={{ position: "relative" }}>
              <select value={city} onChange={(e) => setCity(e.target.value)} style={{
                width: "100%", appearance: "none", WebkitAppearance: "none", padding: "9px 34px 9px 12px",
                border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)", background: "var(--input-bg)",
                fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 600, color: "var(--text-strong)", cursor: "pointer",
              }}>
                <option>Udupi</option><option>Mangaluru</option><option>Kundapura</option><option>Karkala</option>
              </select>
              <span style={{ position: "absolute", right: "11px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
                <UBIcon name="chevron-down" size={16} color="var(--grey-500)" />
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
        <p style={{ margin: "0 0 22px", paddingLeft: "2px", fontSize: "12.5px", color: "var(--text-muted)" }}>
          {mode === "Buy" ? "Showing sale prices in \u20b9 across these localities." : "Showing monthly rents — same properties, reworded for renting."}
        </p>

        {/* Selected-group context card */}
        {loading ? (
          <div style={{ marginBottom: "24px" }}><UBSkelCard compact={compact} /></div>
        ) : (
          <div style={{
            marginBottom: "26px", borderRadius: "var(--radius-lg)", overflow: "hidden",
            border: "1px solid var(--navy-100)", background: "var(--navy-100)", boxShadow: "var(--shadow-sm)",
          }}>
            <div style={{ display: "flex", gap: "13px", alignItems: "flex-start", padding: compact ? "16px" : "18px 20px" }}>
              <div style={{ width: "46px", height: "46px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--navy-800)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <UBIcon name="layers" size={22} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <span style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--navy-600)" }}>Selected group</span>
                </div>
                <h2 style={{ margin: "0 0 5px", fontSize: "18px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--navy-900)" }}>{g.name}</h2>
                <p style={{ margin: 0, fontSize: "13.5px", lineHeight: 1.5, color: "var(--navy-700)" }}>{g.description}</p>
              </div>
            </div>
            {/* Stats strip on paper — two metrics + a location/context tag */}
            <div style={{ display: "flex", alignItems: "center", padding: compact ? "14px 16px" : "15px 20px", background: "var(--paper)", borderTop: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "22px" }}>
                <UBStatCell n={g.areas} label="areas" />
                <div style={{ width: "1px", height: "30px", background: "var(--border)" }} />
                <UBStatCell n={lowData ? 0 : g.properties} label="properties" accent={!lowData} />
              </div>
              <span style={{
                marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "5px", padding: "5px 11px", borderRadius: "var(--radius-full)",
                background: "var(--surface-subtle)", border: "1px solid var(--border)", fontSize: "12px", fontWeight: 600, color: "var(--text-body)", whiteSpace: "nowrap",
              }}>
                <UBIcon name="map-pin" size={13} color="var(--text-muted)" />{g.cue}
              </span>
            </div>
          </div>
        )}

        {/* Section label */}
        {!loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <UBIcon name="map-pin" size={14} color="var(--text-muted)" />
            <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>Localities in this group</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "11.5px", fontWeight: 600, color: "var(--text-muted)" }}>{localities.length} localities</span>
          </div>
        )}

        {/* Locality cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
          {loading
            ? [0, 1].map((i) => <UBSkelCard key={i} compact={compact} />)
            : localities.map((a) => (
                <LocalityCard key={a.id} a={a} mode={mode} selected={hoverLocality === a.id || undefined}
                  onSelect={onPickLocality} onHover={onHoverLocality} compact={compact} />
              ))}
        </div>

        {/* All-zero honest empty state */}
        {!loading && liveCount === 0 && (
          <div style={{
            display: "flex", gap: "11px", alignItems: "flex-start", marginTop: "16px", padding: "14px 16px",
            background: "var(--ochre-50)", border: "1px solid rgba(169,116,28,0.22)", borderRadius: "var(--radius-lg)",
          }}>
            <UBIcon name="map-pin" size={18} color="var(--ochre-600)" style={{ marginTop: "1px" }} />
            <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.5, color: "var(--ochre-600)" }}>
              <strong>No verified properties in University Belt yet.</strong> We add new listings across Udupi every week — check back soon, or browse another neighbourhood group.
            </p>
          </div>
        )}

        {/* Trust strip */}
        {!loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "11px", marginTop: "24px", paddingTop: "20px", borderTop: "1px solid var(--border)" }}>
            <span style={{ width: "34px", height: "34px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--evergreen-50)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <UBIcon name="shield-check" size={19} color="var(--evergreen-600)" />
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

window.UPTUniBeltPanel = UPTUniBeltPanel;

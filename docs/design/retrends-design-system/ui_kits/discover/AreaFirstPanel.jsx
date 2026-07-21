// Udupi Property Tracker — AREA-FIRST journey right panel. Exports window.UPTAreaFirstPanel
// The decision panel after the visitor chose "Explore by area": pick a neighbourhood
// group (or click a locality on the map) before seeing listings. Same editorial,
// trust-led language as the Discover landing — eyebrow → serif hero → controls →
// summary card → neighbourhood-group cards → trust strip. Group cards carry the
// lift-and-tint motif; 0-listing groups drop to a muted, non-actionable variant.
const { Icon: AFIcon } = window.ReTrendsDesignSystem_f37966;

// Buyer-friendly plain-English copy keyed to each group (overrides terser data labels).
const AF_GROUP_COPY = {
  "university-belt": { blurb: "Academic and student housing around Manipal — strong rental demand and walk-to-campus flats.", cue: "Central Udupi" },
  "coastal-strip":   { blurb: "Beachside and fishing villages west of Udupi, from Malpe down to Kaup.", cue: "West Udupi" },
  "city-centre":     { blurb: "Core urban and temple precinct — walkable, well-connected addresses.", cue: "Central Udupi" },
  "north-udupi":     { blurb: "Developing northern belt around Brahmavar — newer projects and bigger plots.", cue: "North Udupi" },
  "south-udupi":     { blurb: "Quiet residential southern belt toward Padubidri and Shirva.", cue: "South Udupi" },
};

function AFStatChip({ children }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 9px", borderRadius: "var(--radius-full)",
      background: "var(--surface-subtle)", border: "1px solid var(--border)", fontFamily: "var(--font-mono)",
      fontSize: "11.5px", fontWeight: 600, color: "var(--text-body)", whiteSpace: "nowrap",
    }}>{children}</span>
  );
}

// Glyph for the group avatar (Lucide "layers" — already a journey motif here).
function AFLayers({ c }) {
  return (<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/></svg>);
}

function NeighbourhoodCard({ g, mode, selected, onSelect, onHover, compact }) {
  const [hover, setHover] = React.useState(false);
  const empty = g.homes === 0;
  const active = (selected || hover) && !empty;
  const copy = AF_GROUP_COPY[g.id] || {};
  const noun = mode === "Rent" ? (g.homes === 1 ? "rental available" : "rentals available") : (g.homes === 1 ? "property for sale" : "properties for sale");

  return (
    <button
      onMouseEnter={() => { if (!empty) { setHover(true); onHover(g.id); } }}
      onMouseLeave={() => { setHover(false); onHover(null); }}
      onClick={() => { if (!empty) onSelect(g.id); }}
      aria-disabled={empty}
      style={{
        textAlign: "left", width: "100%", display: "block", cursor: empty ? "default" : "pointer",
        background: selected && !empty ? "var(--accent-tint)" : (empty ? "var(--surface-subtle)" : "var(--paper)"),
        border: `1.5px solid ${active ? "var(--accent)" : (empty ? "transparent" : "var(--border)")}`,
        borderRadius: "var(--radius-lg)", padding: compact ? "15px" : "17px 19px",
        boxShadow: selected && !empty ? "var(--shadow-lg), 0 0 0 3px rgba(176,92,58,0.18)" : (active ? "var(--shadow-lg)" : (empty ? "none" : "var(--shadow-sm)")),
        transform: hover && !selected && !empty ? "translateY(-2px)" : "translateY(0)",
        transition: "transform .2s cubic-bezier(.4,0,.2,1), box-shadow .2s cubic-bezier(.4,0,.2,1), border-color .12s, background .15s",
        fontFamily: "var(--font-sans)", opacity: empty ? 0.82 : 1,
      }}>
      <div style={{ display: "flex", gap: "13px", alignItems: "flex-start" }}>
        {/* Avatar */}
        <div style={{
          width: "44px", height: "44px", flex: "none", borderRadius: "var(--radius-md)",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: empty ? "transparent" : (active ? "var(--navy-800)" : "var(--navy-100)"),
          border: empty ? "1px dashed var(--stone-400)" : "none", transition: "background .15s",
        }}>
          <AFLayers c={empty ? "var(--grey-400)" : (active ? "#fff" : "var(--navy-800)")} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title + areas badge */}
          <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "3px" }}>
            <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, letterSpacing: "-0.01em", color: empty ? "var(--text-muted)" : "var(--text-strong)" }}>{g.name}</h3>
            <span style={{
              marginLeft: "auto", flex: "none", display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: "var(--radius-full)",
              background: "var(--surface-subtle)", border: "1px solid var(--border)", fontFamily: "var(--font-mono)",
              fontSize: "11px", fontWeight: 600, color: "var(--text-muted)",
            }}>{g.areas} {g.areas === 1 ? "area" : "areas"}</span>
          </div>

          {/* Description */}
          <p style={{ margin: "0 0 9px", fontSize: "13px", lineHeight: 1.5, color: empty ? "var(--text-muted)" : "var(--text-body)" }}>{copy.blurb}</p>

          {/* Location tag */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "13px" }}>
            <AFStatChip><AFIcon name="map-pin" size={12} color="var(--text-muted)" />{copy.cue}</AFStatChip>
          </div>

          {/* Footer: count + CTA */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
            {empty ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "12.5px", fontWeight: 600, color: "var(--text-muted)" }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", border: "1.5px solid var(--grey-400)" }} />
                No listings yet
              </span>
            ) : (
              <span style={{ fontSize: "13px", color: "var(--text-body)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: active ? "var(--copper-600)" : "var(--text-strong)" }}>{g.homes}</span>{" "}{noun}
              </span>
            )}
            {empty ? (
              <span style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--grey-400)" }}>Coming soon</span>
            ) : (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", fontSize: "13.5px", fontWeight: 600, color: active ? "var(--accent)" : "var(--text-strong)", transition: "color .12s" }}>
                View areas
                <span style={{ display: "inline-flex", transform: active ? "translateX(3px)" : "none", transition: "transform .15s" }}>
                  <AFIcon name="arrow-right" size={16} color={active ? "var(--accent)" : "var(--grey-500)"} />
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
function AFSkelLine({ w, h }) {
  return <div className="upt-shimmer" style={{ width: w, height: h || "13px", borderRadius: "var(--radius-xs)", background: "var(--stone-300)" }} />;
}
function AFSkelCard({ compact }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: compact ? "15px" : "17px 19px", background: "var(--paper)", display: "flex", gap: "13px" }}>
      <div className="upt-shimmer" style={{ width: "44px", height: "44px", borderRadius: "var(--radius-md)", background: "var(--stone-300)", flex: "none" }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "9px" }}>
        <AFSkelLine w="55%" h="16px" /><AFSkelLine w="92%" /><AFSkelLine w="70%" />
        <div style={{ height: "4px" }} /><AFSkelLine w="60%" h="26px" />
      </div>
    </div>
  );
}

function UPTAreaFirstPanel({ mode, setMode, city, setCity, selectedGroup, setSelectedGroup, onHoverGroup, loading, compact, dataState, onStartOver }) {
  const D = window.UPT_AREA_DATA;
  const lowData = dataState === "low";
  // In low-data, only University Belt keeps live listings — demonstrates the empty-group treatment.
  const groups = D.groups.map((g) => (lowData && g.id !== "university-belt" ? { ...g, homes: 0 } : g));

  const totalAreas = groups.reduce((s, g) => s + g.areas, 0);
  const totalHomes = groups.reduce((s, g) => s + g.homes, 0);
  const liveGroups = groups.filter((g) => g.homes > 0).length;

  const seg = (val) => ({
    flex: 1, padding: "8px 0", textAlign: "center", cursor: "pointer", border: "none",
    borderRadius: "var(--radius-sm)", fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 600,
    background: mode === val ? "var(--paper)" : "transparent", color: mode === val ? "var(--text-strong)" : "var(--text-muted)",
    boxShadow: mode === val ? "var(--shadow-sm)" : "none", transition: "background .12s, color .12s",
  });

  return (
    <div className="upt-scroll" style={{
      height: "100%", overflowY: "auto", background: "var(--background)",
      padding: compact ? "22px 20px 40px" : "34px 44px 52px", fontFamily: "var(--font-sans)",
    }}>
      <div style={{ maxWidth: "560px", margin: "0 auto" }}>
        {/* Eyebrow row: journey tag + Start over */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "var(--radius-full)",
            background: "var(--navy-100)", color: "var(--navy-800)", fontSize: "11px", fontWeight: 700,
            letterSpacing: "0.06em", textTransform: "uppercase",
          }}>
            <AFIcon name="layers" size={13} color="var(--navy-800)" />Area-first
          </span>
          <button onClick={onStartOver} style={{
            marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 11px",
            border: "1px solid var(--border-strong)", background: "var(--paper)", borderRadius: "var(--radius-full)",
            cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-body)",
          }}>
            <AFIcon name="x" size={14} color="var(--text-muted)" />Start over
          </button>
        </div>

        {/* Hero */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
            <AFSkelLine w="85%" h="32px" /><AFSkelLine w="55%" h="32px" />
            <div style={{ height: "6px" }} /><AFSkelLine w="95%" /><AFSkelLine w="78%" />
          </div>
        ) : (
          <>
            <h1 style={{
              margin: "0 0 13px", fontFamily: "var(--font-serif)", fontWeight: 600,
              fontSize: compact ? "28px" : "38px", lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--text-strong)",
            }}>Choose an area in Udupi</h1>
            <p style={{ margin: "0 0 24px", fontSize: compact ? "14.5px" : "16px", lineHeight: 1.55, color: "var(--text-body)", maxWidth: "48ch" }}>
              Start with a neighbourhood group, then narrow down to the localities and properties inside it.
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
                <AFIcon name="chevron-down" size={16} color="var(--grey-500)" />
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
          {mode === "Buy" ? "Showing sale prices in \u20b9 across every area." : "Showing monthly rents — same properties, reworded for renting."}
        </p>

        {/* Summary card — Explore by area */}
        {loading ? (
          <div style={{ marginBottom: "22px" }}><AFSkelCard compact={compact} /></div>
        ) : (
          <div style={{
            display: "flex", flexDirection: "column", gap: "14px", padding: compact ? "16px" : "18px 20px", marginBottom: "24px",
            background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-sm)",
          }}>
            <div style={{ display: "flex", gap: "13px", alignItems: "flex-start" }}>
              <div style={{ width: "44px", height: "44px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--accent-tint)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <AFIcon name="map-pin" size={21} color="var(--accent)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ margin: "0 0 4px", fontSize: "16.5px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>Explore by area</h2>
                <p style={{ margin: 0, fontSize: "13.5px", lineHeight: 1.5, color: "var(--text-body)" }}>Browse Udupi localities on the map, or choose a neighbourhood group below to start.</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "0", borderTop: "1px solid var(--border)", paddingTop: "14px" }}>
              {[[groups.length, "groups"], [totalAreas, "areas"], [totalHomes, "properties"]].map(([n, l], i) => (
                <div key={l} style={{ flex: 1, paddingLeft: i ? "16px" : 0, borderLeft: i ? "1px solid var(--border)" : "none" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 700, lineHeight: 1, letterSpacing: "-0.02em", color: l === "properties" ? "var(--copper-600)" : "var(--text-strong)" }}>{n}</div>
                  <div style={{ marginTop: "5px", fontSize: "12px", color: "var(--text-muted)" }}>{l}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section label */}
        {!loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <AFIcon name="layers" size={14} color="var(--text-muted)" />
            <span style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>Neighbourhood groups</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: "11.5px", fontWeight: 600, color: "var(--text-muted)" }}>{groups.length} groups</span>
          </div>
        )}

        {/* Group cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
          {loading
            ? [0, 1, 2, 3].map((i) => <AFSkelCard key={i} compact={compact} />)
            : groups.map((g) => (
                <NeighbourhoodCard key={g.id} g={g} mode={mode} selected={selectedGroup === g.id} onSelect={setSelectedGroup} onHover={onHoverGroup} compact={compact} />
              ))}
        </div>

        {/* Trust strip */}
        {!loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "11px", marginTop: "24px", paddingTop: "20px", borderTop: "1px solid var(--border)" }}>
            <span style={{ width: "34px", height: "34px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--evergreen-50)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <AFIcon name="shield-check" size={19} color="var(--evergreen-600)" />
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

window.UPTAreaFirstPanel = UPTAreaFirstPanel;

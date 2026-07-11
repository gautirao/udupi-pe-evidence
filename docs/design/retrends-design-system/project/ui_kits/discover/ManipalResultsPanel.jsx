// Udupi Property Tracker — AREA-FIRST › University Belt › Manipal RESULTS panel.
// Exports window.UPTManipalPanel.
//
// The polished public results surface for Manipal: in-panel breadcrumb path +
// AREA-FIRST badge → "Properties in Manipal" serif hero → subheading → City +
// Buy/Rent controls → compact filters (property type primary, BHK secondary) +
// "Refine by school" contextual prompt → search → result count → premium
// two-column listing cards (with verified placeholder treatment) → empty &
// loading states → trust strip. Same editorial, trust-led language as the rest
// of the area-first journey.
const { Icon: MIcon, TrustBadge: MTrustBadge } = window.ReTrendsDesignSystem_f37966;

// Per-type colour identity — must match the map markers + legend (ManipalResultsMap.jsx).
const CARD_TYPE = {
  Apartment: { bg: "var(--navy-100)", fg: "var(--navy-700)", dot: "var(--navy-700)" },
  Villa: { bg: "var(--accent-tint)", fg: "var(--copper-600)", dot: "var(--copper-600)" },
  Plot: { bg: "var(--evergreen-50)", fg: "var(--evergreen-600)", dot: "var(--evergreen-600)" },
};

/* ---------- premium listing card ---------- */
function ListingCard({ p, mode, selected, hovered, onHover, onSelect, compact }) {
  const active = selected || hovered;
  const isResidential = p.beds != null;
  const price = mode === "Rent" && p.rentLabel ? p.rentLabel : p.priceLabel;
  const rentUnavailable = mode === "Rent" && !p.rentLabel;

  return (
    <div
      onMouseEnter={() => onHover(p.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onSelect(p.id)}
      style={{
        position: "relative", background: "var(--surface-card)", borderRadius: "var(--radius-lg)", overflow: "hidden",
        border: selected ? "1px solid var(--accent)" : "1px solid var(--border)",
        boxShadow: selected ? "0 0 0 3px rgba(176,92,58,0.18), var(--shadow-lg)" : (hovered ? "var(--shadow-lg)" : "var(--shadow-sm)"),
        transform: hovered && !selected ? "translateY(-2px)" : "none",
        transition: "box-shadow var(--dur-normal) var(--ease-standard), transform var(--dur-normal) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)",
        cursor: "pointer", fontFamily: "var(--font-sans)", display: "flex", flexDirection: "column",
      }}>

      {/* Image / premium placeholder */}
      <div style={{ position: "relative", height: "158px", overflow: "hidden", background: "var(--surface-muted)" }}>
        {p.image ? (
          <img src={p.image} alt={p.title} loading="lazy" style={{
            width: "100%", height: "100%", objectFit: "cover",
            transform: active ? "scale(1.045)" : "scale(1)", transition: "transform var(--dur-slow) var(--ease-standard)",
          }} />
        ) : (
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px",
            background: "linear-gradient(150deg, var(--canvas-200) 0%, var(--surface-subtle) 55%, var(--accent-tint) 140%)",
          }}>
            <span style={{ width: "44px", height: "44px", borderRadius: "var(--radius-md)", background: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-xs)" }}>
              <MIcon name="building" size={22} color="var(--copper-500)" />
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px", letterSpacing: "0.04em", color: "var(--text-muted)", textTransform: "uppercase" }}>Photo coming soon</span>
          </div>
        )}

        {/* Trust badge (top-left) */}
        <div style={{ position: "absolute", top: "11px", left: "11px" }}><MTrustBadge tier={p.trustTier} size="sm" /></div>

        {/* Favourite / save (top-right) */}
        <FavButton />
      </div>

      {/* Body */}
      <div style={{ padding: compact ? "13px 14px 14px" : "14px 16px 16px", display: "flex", flexDirection: "column", flex: 1 }}>
        {/* Price + status */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px", marginBottom: "6px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "20px", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>
            {rentUnavailable ? p.priceLabel : price}
          </span>
          <span style={{
            flex: "none", display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 9px", borderRadius: "var(--radius-full)",
            background: "var(--evergreen-50)", color: "var(--evergreen-600)", fontSize: "11px", fontWeight: 700, letterSpacing: "0.01em", whiteSpace: "nowrap",
          }}>
            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--evergreen-600)" }} />
            {p.status}
          </span>
        </div>

        {/* Title */}
        <h3 style={{ margin: "0 0 5px", fontSize: "15.5px", fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.01em", color: "var(--text-strong)", textWrap: "pretty" }}>{p.title}</h3>

        {/* Locality */}
        <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12.5px", color: "var(--text-muted)", marginBottom: "12px" }}>
          <MIcon name="map-pin" size={13} color="var(--grey-400)" />{p.locality}, Manipal
        </div>

        {/* Type badge + attributes */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "9px", marginBottom: "13px" }}>
          {(() => { const ct = CARD_TYPE[p.type] || CARD_TYPE.Apartment; return (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11.5px", fontWeight: 600, padding: "3px 9px 3px 8px", borderRadius: "var(--radius-xs)", background: ct.bg, color: ct.fg }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: ct.dot, flex: "none" }} />{p.type}
            </span>
          ); })()}
          {isResidential && <Fact icon="bed">{p.beds} BHK</Fact>}
          {p.baths != null && <Fact icon="bath">{p.baths}</Fact>}
          <Fact icon="maximize">{p.sqft.toLocaleString("en-IN")} sq ft</Fact>
        </div>

        {/* Footer: freshness + CTA */}
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--text-muted)" }}>
            <MIcon name="calendar" size={13} color="var(--grey-400)" />{p.posted}
          </span>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "6px", padding: "7px 13px", borderRadius: "var(--radius-md)",
            border: "1px solid " + (active ? "var(--navy-800)" : "var(--border-strong)"),
            background: active ? "var(--navy-800)" : "var(--paper)", color: active ? "#fff" : "var(--text-strong)",
            fontSize: "12.5px", fontWeight: 600, transition: "background var(--dur-fast) var(--ease-standard), color var(--dur-fast), border-color var(--dur-fast)",
          }}>
            View details
            <span style={{ display: "inline-flex", transform: active ? "translateX(2px)" : "none", transition: "transform .15s" }}>
              <MIcon name="arrow-right" size={14} color={active ? "#fff" : "var(--grey-500)"} />
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function FavButton() {
  const [saved, setSaved] = React.useState(false);
  const [h, setH] = React.useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); setSaved((s) => !s); }}
      onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      aria-label={saved ? "Saved" : "Save property"}
      style={{
        position: "absolute", top: "10px", right: "10px", width: "32px", height: "32px", borderRadius: "var(--radius-full)",
        border: "1px solid var(--border)", background: h || saved ? "var(--paper)" : "rgba(255,255,255,0.92)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", boxShadow: "var(--shadow-sm)",
        transition: "background var(--dur-fast) var(--ease-standard)",
      }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill={saved ? "var(--accent)" : "none"} stroke={saved ? "var(--accent)" : "var(--text-muted)"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      </svg>
    </button>
  );
}

function Fact({ icon, children }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", color: "var(--text-body)" }}>
      <MIcon name={icon} size={14} color="var(--grey-400)" />{children}
    </span>
  );
}

/* ---------- filter chips ---------- */
function TypeChip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "7px 14px", borderRadius: "var(--radius-full)", cursor: "pointer",
      fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, whiteSpace: "nowrap",
      border: active ? "1px solid var(--navy-800)" : "1px solid var(--border-strong)",
      background: active ? "var(--navy-800)" : "var(--paper)", color: active ? "#fff" : "var(--text-body)",
      transition: "all var(--dur-fast) var(--ease-standard)",
    }}>{label}</button>
  );
}
function BhkChip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 12px", borderRadius: "var(--radius-full)", cursor: "pointer",
      fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, whiteSpace: "nowrap",
      border: "1px solid " + (active ? "var(--accent)" : "var(--border)"),
      background: active ? "var(--accent-tint)" : "transparent", color: active ? "var(--copper-600)" : "var(--text-muted)",
      transition: "all var(--dur-fast) var(--ease-standard)",
    }}>{label}</button>
  );
}

/* ---------- skeletons ---------- */
function MSkelLine({ w, h }) {
  return <div className="upt-shimmer" style={{ width: w, height: h || "13px", borderRadius: "var(--radius-xs)", background: "var(--stone-300)" }} />;
}
function MSkelCard() {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", overflow: "hidden", background: "var(--paper)" }}>
      <div className="upt-shimmer" style={{ height: "158px", background: "var(--stone-300)" }} />
      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
        <MSkelLine w="45%" h="20px" /><MSkelLine w="88%" h="15px" /><MSkelLine w="60%" />
        <div style={{ height: "2px" }} /><MSkelLine w="72%" />
      </div>
    </div>
  );
}

function UPTManipalPanel(props) {
  const {
    mode, setMode, city, setCity, loading, compact,
    typeFilter, setTypeFilter, bhkFilter, setBhkFilter, query, setQuery,
    properties, totalCount, hoverId, selectedId, onHover, onSelect, onResetFilters,
  } = props;

  const D = window.UPT_MANIPAL;
  const count = properties.length;
  const filtersActive = typeFilter !== "All" || bhkFilter.length > 0 || query.trim() !== "";

  const seg = (val) => ({
    flex: 1, padding: "8px 0", textAlign: "center", cursor: "pointer", border: "none",
    borderRadius: "var(--radius-sm)", fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 600,
    background: mode === val ? "var(--paper)" : "transparent", color: mode === val ? "var(--text-strong)" : "var(--text-muted)",
    boxShadow: mode === val ? "var(--shadow-sm)" : "none", transition: "background .12s, color .12s",
  });

  const types = ["All", "Apartments", "Villas", "Plots"];
  const bhks = ["2 BHK", "3 BHK"];
  const plotsOnly = typeFilter === "Plots";

  function toggleBhk(b) {
    setBhkFilter(bhkFilter.includes(b) ? bhkFilter.filter((x) => x !== b) : [...bhkFilter, b]);
  }

  return (
    <div className="upt-scroll" style={{
      height: "100%", overflowY: "auto", background: "var(--background)",
      padding: compact ? "18px 18px 40px" : "26px 36px 48px", fontFamily: "var(--font-sans)",
    }}>
      <div style={{ maxWidth: "780px", margin: "0 auto" }}>

        {/* In-panel breadcrumb path */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginBottom: "13px", fontSize: "12.5px", fontWeight: 600 }}>
          <span style={{ color: "var(--text-muted)", cursor: "pointer" }}>Discover</span>
          <MIcon name="chevron-right" size={13} color="var(--grey-400)" />
          <span style={{ color: "var(--text-muted)", cursor: "pointer" }}>Choose an area</span>
          <MIcon name="chevron-right" size={13} color="var(--grey-400)" />
          <span style={{ color: "var(--text-muted)", cursor: "pointer" }}>University Belt</span>
          <MIcon name="chevron-right" size={13} color="var(--grey-400)" />
          <span style={{ color: "var(--text-strong)" }}>Manipal</span>
        </div>

        {/* Eyebrow row: journey badge + Start over */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "13px" }}>
          <span style={{
            display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 10px", borderRadius: "var(--radius-full)",
            background: "var(--navy-100)", color: "var(--navy-800)", fontSize: "11px", fontWeight: 700,
            letterSpacing: "0.06em", textTransform: "uppercase",
          }}>
            <MIcon name="layers" size={13} color="var(--navy-800)" />Area-first
          </span>
          <button style={{
            marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 11px",
            border: "1px solid var(--border)", background: "transparent", borderRadius: "var(--radius-full)",
            cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-muted)",
          }}>
            <MIcon name="x" size={14} color="var(--text-muted)" />Start over
          </button>
        </div>

        {/* Hero */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "22px" }}>
            <MSkelLine w="70%" h="34px" /><div style={{ height: "4px" }} /><MSkelLine w="94%" /><MSkelLine w="66%" />
          </div>
        ) : (
          <>
            <h1 style={{
              margin: "0 0 11px", fontFamily: "var(--font-serif)", fontWeight: 600,
              fontSize: compact ? "28px" : "38px", lineHeight: 1.1, letterSpacing: "-0.02em", color: "var(--text-strong)",
            }}>Properties in Manipal</h1>
            <p style={{ margin: "0 0 22px", fontSize: compact ? "14.5px" : "16px", lineHeight: 1.55, color: "var(--text-body)", maxWidth: "54ch" }}>
              Explore verified listings around Manipal, with map context and area-first filters.
            </p>
          </>
        )}

        {/* Controls: city + Buy/Rent */}
        <div style={{
          display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center", padding: "14px", marginBottom: "9px",
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
                <MIcon name="chevron-down" size={16} color="var(--grey-500)" />
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
        <p style={{ margin: "0 0 20px", paddingLeft: "2px", fontSize: "12.5px", color: "var(--text-muted)" }}>
          {mode === "Buy" ? "Showing sale prices in \u20b9 for Manipal." : "Showing monthly rents where available — plots are sale-only."}
        </p>

        {/* Filter card: property type (primary) + BHK (secondary) + refine-by-school */}
        <div style={{
          padding: compact ? "15px" : "18px 20px", marginBottom: "18px",
          background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xs)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            <MIcon name="sliders-horizontal" size={14} color="var(--text-muted)" />
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>Property type</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: plotsOnly ? "0" : "15px" }}>
            {types.map((t) => <TypeChip key={t} label={t} active={typeFilter === t} onClick={() => setTypeFilter(t)} />)}
          </div>

          {/* BHK — secondary, hidden when Plots selected (plots have no BHK) */}
          {!plotsOnly && (
            <div style={{ display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap", paddingTop: "14px", borderTop: "1px solid var(--border)" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-muted)" }}>Bedrooms</span>
              {bhks.map((b) => <BhkChip key={b} label={b} active={bhkFilter.includes(b)} onClick={() => toggleBhk(b)} />)}
              {/* Passive contextual note — school-first is a separate journey, so this is a non-interactive hint, not an action. */}
              <span title="School-first search is a separate journey" style={{
                marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 11px", borderRadius: "var(--radius-full)",
                background: "var(--surface-subtle)", border: "1px solid var(--border)",
                fontFamily: "var(--font-sans)", fontSize: "11.5px", fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap",
              }}>
                <MIcon name="shield" size={12} color="var(--grey-400)" />Schools shown on each listing
              </span>
            </div>
          )}
        </div>

        {/* Search */}
        <div style={{ position: "relative", marginBottom: "18px" }}>
          <span style={{ position: "absolute", left: "14px", top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <MIcon name="search" size={17} color="var(--grey-400)" />
          </span>
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search properties in Manipal"
            style={{
              width: "100%", padding: "11px 14px 11px 42px", border: "1px solid var(--border-strong)", borderRadius: "var(--radius-md)",
              background: "var(--input-bg)", fontFamily: "var(--font-sans)", fontSize: "14px", color: "var(--text-strong)", outline: "none",
            }}
          />
          {query && (
            <button onClick={() => setQuery("")} style={{
              position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", width: "26px", height: "26px",
              borderRadius: "var(--radius-full)", border: "none", background: "var(--surface-subtle)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <MIcon name="x" size={14} color="var(--text-muted)" />
            </button>
          )}
        </div>

        {/* Result count */}
        {!loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "13px" }}>
            <MIcon name="shield-check" size={16} color="var(--evergreen-600)" />
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-strong)" }}>
              {count > 0 ? (
                <><span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{count}</span> verified {count === 1 ? "property" : "properties"} in Manipal</>
              ) : "No properties match your filters"}
            </span>
            {filtersActive && (
              <button onClick={onResetFilters} style={{
                marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "5px", padding: "5px 11px", borderRadius: "var(--radius-full)",
                border: "1px solid var(--border)", background: "transparent", cursor: "pointer",
                fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-muted)",
              }}>
                <MIcon name="x" size={13} color="var(--text-muted)" />Clear filters
              </button>
            )}
          </div>
        )}

        {/* Results grid */}
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(auto-fill, minmax(232px, 1fr))", gap: "16px" }}>
            {[0, 1, 2, 3].map((i) => <MSkelCard key={i} />)}
          </div>
        ) : count > 0 ? (
          <div style={{ display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(auto-fill, minmax(232px, 1fr))", gap: "16px" }}>
            {properties.map((p) => (
              <ListingCard key={p.id} p={p} mode={mode} compact={compact}
                selected={selectedId === p.id} hovered={hoverId === p.id}
                onHover={onHover} onSelect={onSelect} />
            ))}
          </div>
        ) : (
          /* Empty-results state */
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: "8px",
            padding: "44px 28px", background: "var(--paper)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)",
          }}>
            <span style={{ width: "52px", height: "52px", borderRadius: "var(--radius-full)", background: "var(--surface-subtle)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "4px" }}>
              <MIcon name="search" size={24} color="var(--grey-400)" />
            </span>
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "var(--text-strong)" }}>No properties match these filters</h3>
            <p style={{ margin: "0 0 8px", fontSize: "13.5px", lineHeight: 1.5, color: "var(--text-muted)", maxWidth: "40ch" }}>
              Try widening the property type or clearing the search to see all verified listings in Manipal.
            </p>
            <button onClick={onResetFilters} style={{
              display: "inline-flex", alignItems: "center", gap: "7px", padding: "9px 16px", borderRadius: "var(--radius-md)",
              border: "none", background: "var(--accent)", color: "#fff", cursor: "pointer",
              fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 600, boxShadow: "var(--shadow-sm)",
            }}>
              <MIcon name="x" size={15} color="#fff" />Clear all filters
            </button>
          </div>
        )}

        {/* Trust strip */}
        {!loading && (
          <div style={{ display: "flex", alignItems: "center", gap: "11px", marginTop: "26px", paddingTop: "20px", borderTop: "1px solid var(--border)" }}>
            <span style={{ width: "34px", height: "34px", flex: "none", borderRadius: "var(--radius-md)", background: "var(--evergreen-50)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <MIcon name="shield-check" size={19} color="var(--evergreen-600)" />
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

window.UPTManipalPanel = UPTManipalPanel;

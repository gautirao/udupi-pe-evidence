// Udupi Property Tracker — shared DISCOVER SURFACE. Exports window.UPTDiscoverSurface
// The single composition of the discovery experience: public TopNav + the reused
// UPTDiscoverMap (left) and UPTJourneyPanel (right), with a genuine mobile layout.
// Data-driven: pass `data` (defaults to production window.UPT_AREA_DATA) so the
// SAME surface can render a not-yet-live city's preview revision without any
// duplicate Discover UI. Used by the public Discover page AND the admin
// City-Launch preview — Preview Mode is only a thin shell around this.
const { Icon: SurfIcon } = window.ReTrendsDesignSystem_f37966;

function UPTSurfaceTopNav({ compact }) {
  const [h, setH] = React.useState(false);
  return (
    <header style={{
      height: compact ? "52px" : "60px", flex: "none", display: "flex", alignItems: "center", gap: compact ? "14px" : "28px",
      padding: compact ? "0 16px" : "0 28px", background: "var(--paper)", borderBottom: "1px solid var(--border)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{ width: "32px", height: "32px", borderRadius: "var(--radius-md)", background: "var(--navy-800)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <SurfIcon name="map-pin" size={18} color="#fff" />
        </div>
        <div style={{ lineHeight: 1.1, whiteSpace: "nowrap" }}>
          <div style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>Udupi Property Tracker</div>
          {!compact && <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Real estate trends</div>}
        </div>
      </div>
      {!compact && (
        <nav style={{ display: "flex", alignItems: "center", gap: "2px" }}>
          {[["Discover", true], ["Trends", false], ["Saved", false]].map(([label, on]) => (
            <span key={label} style={{
              padding: "8px 12px", borderRadius: "var(--radius-md)", fontSize: "13.5px", fontWeight: 600, cursor: "pointer",
              color: on ? "var(--text-strong)" : "var(--text-muted)", background: on ? "var(--surface-subtle)" : "transparent",
            }}>{label}</span>
          ))}
        </nav>
      )}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "14px" }}>
        <button onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{
          border: "1px solid var(--border-strong)", background: h ? "var(--grey-50)" : "var(--paper)", cursor: "pointer",
          padding: compact ? "7px 14px" : "8px 18px", borderRadius: "var(--radius-md)", fontSize: "13.5px", fontWeight: 600,
          color: "var(--text-strong)", transition: "background var(--dur-fast) var(--ease-standard)",
        }}>Sign in</button>
      </div>
    </header>
  );
}

// The full discovery surface. All Discover-specific props flow straight through
// to the unchanged map/panel components.
function UPTDiscoverSurface({ data, dataState, loading, compact, showTopNav = true, onPickArea, onSimClick, guide, guideKey }) {
  const D = data || window.UPT_AREA_DATA;
  const TOTAL = D.listings.length;
  const GROUPS = D.groups.length;
  const AREAS = D.areas.length;

  const [mode, setMode] = React.useState("Buy");
  const [city, setCity] = React.useState(D.city.name);
  const [selected, setSelected] = React.useState(null);
  const [hovered, setHovered] = React.useState(null);
  const [mTab, setMTab] = React.useState("browse");

  const mapEl = (
    <window.UPTDiscoverMap
      areas={D.areas} listings={D.listings} total={TOTAL}
      dataState={dataState || "normal"} loading={loading}
      onPickArea={(id) => { setSelected("area"); onPickArea && onPickArea(id); }} compact={compact}
      city={D.city} cityLabel={D.city.name} emptyAreas={D.emptyAreas || []} fitAreas={D.fitAreas || D.areas}
      simListing={D.simListing} onSimClick={onSimClick} guide={guide} guideKey={guideKey}
    />
  );
  const panelEl = (
    <window.UPTJourneyPanel
      mode={mode} setMode={setMode} city={city} setCity={setCity}
      selected={selected} setSelected={setSelected} onHover={setHovered}
      total={TOTAL} groupsCount={GROUPS} areasCount={AREAS} loading={loading} compact={compact} cityName={D.city.name}
    />
  );

  if (compact) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "var(--background)" }}>
        {showTopNav && <UPTSurfaceTopNav compact />}
        <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, display: mTab === "browse" ? "block" : "none" }}>{panelEl}</div>
          <div style={{ position: "absolute", inset: 0, display: mTab === "map" ? "block" : "none" }}>{mapEl}</div>
        </div>
        <div style={{ flex: "none", display: "flex", gap: "8px", padding: "10px 14px", background: "var(--paper)", borderTop: "1px solid var(--border)" }}>
          {[["browse", "Browse", "building"], ["map", "Map", "map-pin"]].map(([key, label, icon]) => (
            <button key={key} onClick={() => setMTab(key)} style={{
              flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "7px", padding: "11px 0",
              border: "1px solid " + (mTab === key ? "var(--navy-800)" : "var(--border-strong)"), borderRadius: "var(--radius-md)",
              background: mTab === key ? "var(--navy-800)" : "var(--paper)", color: mTab === key ? "#fff" : "var(--text-strong)",
              fontSize: "13.5px", fontWeight: 600, cursor: "pointer",
            }}>
              <SurfIcon name={icon} size={16} color={mTab === key ? "#fff" : "var(--navy-800)"} />
              {label}{key === "map" ? ` · ${TOTAL}` : ""}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {showTopNav && <UPTSurfaceTopNav />}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0, position: "relative", borderRight: "1px solid var(--border)" }}>{mapEl}</div>
        <div style={{ width: "clamp(440px, 42%, 560px)", flex: "none", minHeight: 0 }}>{panelEl}</div>
      </div>
    </div>
  );
}

window.UPTDiscoverSurface = UPTDiscoverSurface;
window.UPTSurfaceTopNav = UPTSurfaceTopNav;

// ReTrends portal — Discover (map + listings). Exports window.RTDiscover
const { Button, Icon, Badge, Input, Select, PropertyCard, TrustBadge } = window.ReTrendsDesignSystem_f37966;

const FILTERS = ["For sale", "For rent", "Verified only", "Under ₹1.5 Cr", "3 BHK+"];

function FakeMap({ properties, activeId, onPick }) {
  // Stylised map surface with locality pins (not a live map).
  const pins = [
    { id: "p1", x: 34, y: 30 }, { id: "p3", x: 62, y: 24 }, { id: "p5", x: 48, y: 54 },
    { id: "p2", x: 24, y: 66 }, { id: "p4", x: 72, y: 70 }, { id: "p6", x: 55, y: 82 },
  ];
  const fmt = (p) => p >= 10000000 ? `₹${(p / 10000000).toFixed(1)}Cr` : `₹${(p / 100000).toFixed(0)}L`;
  return (
    <div style={{ position: "relative", height: "100%", minHeight: "560px", borderRadius: "var(--radius-xl)", overflow: "hidden", border: "1px solid var(--border)",
      background: "linear-gradient(135deg,#EBEEF3,#E4E8EE)",
      backgroundImage: "linear-gradient(rgba(28,43,74,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(28,43,74,0.05) 1px,transparent 1px)",
      backgroundSize: "40px 40px" }}>
      {/* faux roads */}
      <div style={{ position: "absolute", top: "44%", left: 0, right: 0, height: "8px", background: "rgba(255,255,255,0.7)", transform: "rotate(-4deg)" }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: "52%", width: "8px", background: "rgba(255,255,255,0.7)", transform: "rotate(3deg)" }} />
      {pins.map((pin) => {
        const prop = properties.find((p) => p.id === pin.id);
        if (!prop) return null;
        const active = pin.id === activeId;
        return (
          <button key={pin.id} onClick={() => onPick(pin.id)} style={{
            position: "absolute", left: pin.x + "%", top: pin.y + "%", transform: "translate(-50%,-100%)",
            border: "none", cursor: "pointer", background: "transparent", padding: 0,
          }}>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: "4px", padding: "5px 9px",
              fontFamily: "var(--font-mono)", fontSize: "12px", fontWeight: 600,
              borderRadius: "var(--radius-full)", whiteSpace: "nowrap",
              background: active ? "var(--accent)" : "var(--paper)", color: active ? "#fff" : "var(--navy-800)",
              boxShadow: active ? "var(--shadow-lg)" : "var(--shadow-sm)",
              border: active ? "none" : "1px solid var(--border)",
              transform: active ? "scale(1.08)" : "scale(1)", transition: "all var(--dur-fast) var(--ease-standard)",
            }}>
              {prop.trustTier === "verified" && <Icon name="shield-check" size={12} color={active ? "#fff" : "var(--positive)"} />}
              {fmt(prop.price)}
            </span>
          </button>
        );
      })}
      <div style={{ position: "absolute", top: "16px", left: "16px", display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "var(--paper)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", fontSize: "13px", fontWeight: 600, color: "var(--text-strong)" }}>
        <Icon name="map-pin" size={15} color="var(--accent)" />Top metros · Pan-India
      </div>
    </div>
  );
}

function RTDiscover({ navigate, onOpenListing }) {
  const D = window.RT_DATA;
  const [active, setActive] = React.useState("p1");
  const [activeFilters, setActiveFilters] = React.useState(["Verified only"]);
  const toggle = (f) => setActiveFilters((s) => s.includes(f) ? s.filter((x) => x !== f) : [...s, f]);

  return (
    <div style={{ maxWidth: "var(--container-max)", margin: "0 auto", padding: "24px" }}>
      {/* Filter bar */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
        <div style={{ minWidth: "260px", flex: "0 0 auto" }}>
          <Input placeholder="Search localities, projects…" leadingIcon={<Icon name="search" size={16} />} />
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {FILTERS.map((f) => {
            const on = activeFilters.includes(f);
            return (
              <button key={f} onClick={() => toggle(f)} style={{
                padding: "7px 13px", borderRadius: "var(--radius-full)", cursor: "pointer",
                fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600,
                border: on ? "1px solid var(--navy-800)" : "1px solid var(--border-strong)",
                background: on ? "var(--navy-800)" : "var(--paper)", color: on ? "#fff" : "var(--text-body)",
                transition: "all var(--dur-fast) var(--ease-standard)",
              }}>{f}</button>
            );
          })}
        </div>
        <div style={{ marginLeft: "auto" }}>
          <Button variant="ghost" size="sm"><Icon name="sliders-horizontal" size={16} />More filters</Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.15fr", gap: "20px", alignItems: "start" }}>
        {/* Listings column */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "14px" }}>
            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-strong)" }}>{D.properties.length} properties</span>
            <Select size="sm" options={["Most relevant", "Price: low to high", "Newest"]} style={{ minWidth: "150px" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            {D.properties.map((p) => (
              <div key={p.id} onMouseEnter={() => setActive(p.id)} style={{ outline: p.id === active ? "2px solid var(--accent)" : "none", outlineOffset: "2px", borderRadius: "var(--radius-lg)" }}>
                <PropertyCard property={p} onClick={() => onOpenListing(p.id)} />
              </div>
            ))}
          </div>
        </div>
        {/* Map (sticky) */}
        <div style={{ position: "sticky", top: "88px" }}>
          <FakeMap properties={D.properties} activeId={active} onPick={(id) => { setActive(id); }} />
        </div>
      </div>
    </div>
  );
}

window.RTDiscover = RTDiscover;

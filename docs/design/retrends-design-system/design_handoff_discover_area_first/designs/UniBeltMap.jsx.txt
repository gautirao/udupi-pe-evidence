// Udupi Property Tracker — AREA-FIRST › University Belt drill-down map.
// Exports window.UPTUniBeltMap.
//
// Shows LOCALITY-level markers for the localities INSIDE University Belt:
//   • Manipal (8) reads strong — warm paper card, copper count chip, tail.
//   • Katapadi (0) drops to the quiet muted variant — dashed hairline, hollow dot.
// A subtle dashed ring marks the University Belt context (not a hard region).
// Recognisable nearby places (Udupi City, Udyavara, Brahmavar) are drawn as faint
// ghost labels for orientation only — never competing with the group's localities.
// Hover/selected lift any live marker; a selected locality fills ink-navy.
const { Icon: UBMapIcon } = window.ReTrendsDesignSystem_f37966;

const UB_PIN = (c) => `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;

// Strong / muted locality marker.
function ubPillHTML(a, active, selected) {
  if (a.properties === 0) {
    return `
    <div style="transform:translate(-50%,-50%);font-family:var(--font-sans);opacity:${active ? 0.98 : 0.7};transition:opacity .18s;">
      <div style="display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:var(--radius-full);
        background:rgba(255,255,255,0.92);border:1px dashed var(--stone-400);white-space:nowrap;
        box-shadow:${active ? "var(--shadow-sm)" : "none"};transform:scale(${active ? 1.04 : 1});transition:all .15s cubic-bezier(.4,0,.2,1);cursor:default;">
        <span style="width:6px;height:6px;border-radius:50%;border:1.5px solid var(--grey-400);"></span>
        <span style="font-size:12px;font-weight:600;color:var(--text-muted);">${a.name}</span>
        <span style="font-family:var(--font-mono);font-size:10.5px;color:var(--grey-400);">0</span>
      </div>
    </div>`;
  }
  const bg = selected ? "var(--navy-800)" : "var(--paper)";
  const fg = selected ? "#fff" : "var(--text-strong)";
  const border = selected ? "none" : (active ? "1px solid var(--accent)" : "1px solid var(--border)");
  const shadow = active || selected ? "var(--shadow-lg)" : "var(--shadow-md)";
  const scale = selected ? 1.08 : active ? 1.05 : 1;
  const chipBg = selected ? "rgba(255,255,255,0.16)" : "var(--accent-tint)";
  const chipFg = selected ? "#fff" : "var(--copper-600)";
  const pinColor = selected ? "#fff" : "var(--copper-500)";
  return `
  <div style="transform:translate(-50%,-118%);font-family:var(--font-sans);transition:opacity .18s;">
    <div style="display:inline-flex;align-items:center;gap:7px;padding:7px 9px 7px 12px;border-radius:var(--radius-full);
      background:${bg};border:${border};box-shadow:${shadow};white-space:nowrap;transform:scale(${scale});
      transition:transform .15s cubic-bezier(.4,0,.2,1),box-shadow .15s;cursor:pointer;">
      ${UB_PIN(pinColor)}
      <span style="font-size:13px;font-weight:700;letter-spacing:-0.01em;color:${fg};">${a.name}</span>
      <span style="font-family:var(--font-mono);font-size:11px;font-weight:600;padding:2px 8px;border-radius:var(--radius-full);background:${chipBg};color:${chipFg};">${a.properties}</span>
    </div>
    <div style="width:8px;height:8px;background:${bg};border-right:${border};border-bottom:${border};transform:rotate(45deg);margin:-5px auto 0;box-shadow:${shadow};"></div>
  </div>`;
}

// Faint orientation label for a recognisable nearby place (not in this group).
function ubGhostHTML(a) {
  return `
  <div style="transform:translate(-50%,-50%);font-family:var(--font-sans);opacity:0.5;">
    <div style="display:inline-flex;align-items:center;gap:5px;white-space:nowrap;cursor:default;">
      <span style="width:5px;height:5px;border-radius:50%;background:var(--grey-400);"></span>
      <span style="font-size:11px;font-weight:600;color:var(--grey-500);">${a.name}</span>
    </div>
  </div>`;
}

function UPTUniBeltMap({ dataState, loading, compact, hoverLocality, onHoverLocality, onPickLocality }) {
  const D = window.UPT_UNIBELT;
  const elRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const layerRef = React.useRef(null);
  const ringRef = React.useRef(null);
  const [hoverId, setHoverId] = React.useState(null);
  const [pickedId, setPickedId] = React.useState(null);

  const lowData = dataState === "low";
  // In the all-zero state, even Manipal drops to 0 — demonstrates the empty group.
  const localities = React.useMemo(
    () => D.localities.map((a) => (lowData ? { ...a, properties: 0 } : a)),
    [lowData]
  );
  const shown = localities.reduce((s, a) => s + a.properties, 0);

  React.useEffect(() => {
    if (mapRef.current || !window.L) return;
    const map = window.L.map(elRef.current, {
      center: [D.group.center.lat, D.group.center.lon], zoom: compact ? 12 : 13,
      zoomControl: false, attributionControl: true, scrollWheelZoom: false,
    });
    window.L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: "\u00a9 OpenStreetMap \u00b7 \u00a9 CARTO", maxZoom: 19, subdomains: "abcd",
    }).addTo(map);
    window.L.control.zoom({ position: "bottomright" }).addTo(map);
    map.attributionControl.setPosition("bottomleft");
    mapRef.current = map;

    // Subtle University Belt context ring.
    ringRef.current = window.L.circle([D.group.center.lat, D.group.center.lon], {
      radius: D.group.radiusM, color: "var(--copper-500)", weight: 1.5, opacity: 0.5,
      dashArray: "3 5", fillColor: "var(--copper-500)", fillOpacity: 0.05, interactive: false,
    }).addTo(map);

    layerRef.current = window.L.layerGroup().addTo(map);
    try {
      const pts = D.localities.map((a) => [a.lat, a.lon]);
      map.fitBounds(pts, { padding: compact ? [70, 70] : [120, 120], maxZoom: compact ? 12 : 14 });
    } catch (e) { /* keep default */ }
    setTimeout(() => map.invalidateSize(), 80);
    redraw();
    // eslint-disable-next-line
  }, []);

  React.useEffect(() => { if (mapRef.current) setTimeout(() => mapRef.current.invalidateSize(), 80); }, [compact]);
  React.useEffect(() => { redraw(); });

  function makeIcon(html) { return window.L.divIcon({ html, className: "upt-pin", iconSize: [1, 1] }); }

  function redraw() {
    const map = mapRef.current, group = layerRef.current;
    if (!map || !group) return;
    if (ringRef.current) ringRef.current.setStyle({ opacity: loading ? 0 : 0.5, fillOpacity: loading ? 0 : 0.05 });
    group.clearLayers();
    if (loading) return;

    // Ghost orientation labels first (lowest z).
    D.nearby.forEach((a) => {
      window.L.marker([a.lat, a.lon], { icon: makeIcon(ubGhostHTML(a)), zIndexOffset: 50, interactive: false }).addTo(group);
    });

    // Locality markers.
    localities.forEach((a) => {
      const active = hoverId === a.id || hoverLocality === a.id;
      const selected = pickedId === a.id && a.properties > 0;
      const z = (selected ? 2000 : active ? 1500 : 0) + (a.properties > 0 ? 800 : 200);
      const html = ubPillHTML(a, active, selected);
      window.L.marker([a.lat, a.lon], { icon: makeIcon(html), zIndexOffset: z, riseOnHover: true })
        .on("mouseover", () => { setHoverId(a.id); onHoverLocality && onHoverLocality(a.id); })
        .on("mouseout", () => { setHoverId(null); onHoverLocality && onHoverLocality(null); })
        .on("click", () => { if (a.properties > 0) { setPickedId(a.id); onPickLocality && onPickLocality(a.id); } })
        .addTo(group);
    });
  }

  return (
    <div style={{ position: "relative", height: "100%", width: "100%", background: "#EDEBE6" }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0 }} />

      {/* Context breadcrumb pill: which group you're inside */}
      <div style={{
        position: "absolute", top: compact ? "12px" : "18px", left: compact ? "12px" : "18px", zIndex: 500,
        display: "flex", alignItems: "center", gap: "8px", padding: "9px 14px",
        background: "var(--paper)", borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-md)",
        border: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 700, color: "var(--text-strong)",
      }}>
        <UBMapIcon name="layers" size={15} color="var(--accent)" />
        <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Udupi</span>
        <UBMapIcon name="chevron-right" size={13} color="var(--grey-400)" />
        University Belt
      </div>

      {/* Legend */}
      {!loading && (
        <div style={{
          position: "absolute", bottom: "44px", left: compact ? "12px" : "18px", zIndex: 500,
          display: "flex", flexDirection: "column", gap: "7px", padding: "10px 12px",
          background: "rgba(255,255,255,0.93)", backdropFilter: "blur(6px)", borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-sm)", border: "1px solid var(--border)", fontFamily: "var(--font-sans)",
          fontSize: "12px", color: "var(--text-body)", fontWeight: 600,
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "13px", height: "13px" }}>
              <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "var(--copper-500)" }} />
            </span>
            Areas with properties
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-muted)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "13px", height: "13px" }}>
              <span style={{ width: "9px", height: "9px", borderRadius: "50%", border: "1.5px solid var(--grey-400)" }} />
            </span>
            Areas with no listings yet
          </span>
        </div>
      )}

      {/* All-zero honest note */}
      {!loading && lowData && (
        <div style={{
          position: "absolute", bottom: compact ? "62px" : "70px", left: "50%", transform: "translateX(-50%)", zIndex: 500,
          display: "flex", alignItems: "center", gap: "8px", padding: "9px 14px", maxWidth: "calc(100% - 32px)",
          background: "var(--ochre-50)", borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-sm)",
          border: "1px solid rgba(169,116,28,0.25)", fontFamily: "var(--font-sans)", fontSize: "12.5px",
          fontWeight: 600, color: "var(--ochre-600)", whiteSpace: "nowrap",
        }}>
          <UBMapIcon name="map-pin" size={14} color="var(--ochre-600)" />
          No verified properties in University Belt yet — we add more weekly
        </div>
      )}

      {/* Footer pill */}
      {!loading && (
        <div style={{
          position: "absolute", bottom: compact ? "16px" : "20px", left: "50%", transform: "translateX(-50%)", zIndex: 500,
          display: "flex", alignItems: "center", gap: "8px", padding: "9px 16px", background: "var(--paper)",
          borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border)",
          fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--text-body)", whiteSpace: "nowrap",
        }}>
          <UBMapIcon name="map-pin" size={15} color="var(--accent)" />
          {shown > 0 ? (
            <span>Showing <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-strong)" }}>{shown}</span> verified properties in University Belt</span>
          ) : (
            <span>No properties listed in University Belt yet</span>
          )}
        </div>
      )}

      {/* Loading shimmer */}
      {loading && (
        <div style={{ position: "absolute", inset: 0, zIndex: 600, background: "#E7E5E0", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div className="upt-shimmer" style={{ position: "absolute", inset: 0 }} />
          <div style={{
            display: "flex", alignItems: "center", gap: "10px", padding: "11px 18px", background: "var(--paper)",
            borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-md)", fontFamily: "var(--font-sans)",
            fontSize: "13px", fontWeight: 600, color: "var(--text-muted)", zIndex: 2,
          }}>
            <span className="upt-spin" style={{ width: "15px", height: "15px", borderRadius: "50%", border: "2px solid var(--stone-400)", borderTopColor: "var(--navy-800)" }} />
            Loading University Belt…
          </div>
        </div>
      )}
    </div>
  );
}

window.UPTUniBeltMap = UPTUniBeltMap;

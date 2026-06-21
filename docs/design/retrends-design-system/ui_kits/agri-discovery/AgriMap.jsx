// Udupi agri-discovery — Leaflet map. Exports window.AgriMap
// CARTO Voyager tiles, calm region boundary, and HIGH-CONTRAST agri cluster markers
// that read clearly against the green Western-Ghats forest background.
const { Icon: AgriIcon } = window.ReTrendsDesignSystem_f37966;

// Agricultural journey accent (earthy evergreen) — hard-coded hex inside divIcon
// HTML so marker contrast never depends on CSS-var resolution in SVG attributes.
const AGRI = { deep: "#1C5B43", mid: "#1F7A5C", bright: "#2E9B74", ink: "#1B2A45" };

const SPROUT = (c, s) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></svg>`;

// High-contrast cluster marker: white-haloed evergreen disc with a bold mono count,
// a sprout identity badge, and a name chip beneath that mirrors the panel row.
function clusterHTML(group, selected) {
  const size = selected ? 56 : 48;
  const num = selected ? 22 : 19;
  const ring = selected ? "rgba(31,122,92,0.28)" : "rgba(31,122,92,0.16)";
  const shadow = selected
    ? "0 14px 30px rgba(16,46,34,0.5),0 3px 8px rgba(16,46,34,0.35)"
    : "0 10px 22px rgba(16,46,34,0.42),0 2px 6px rgba(16,46,34,0.28)";
  const chipBorder = selected ? AGRI.mid : "rgba(17,24,39,0.08)";
  const chipShadow = selected ? "0 4px 12px rgba(16,46,34,0.22)" : "0 2px 6px rgba(17,24,39,0.12)";
  return `
  <div style="transform:translate(-50%,-100%);text-align:center;font-family:var(--font-sans);transition:all .15s cubic-bezier(.4,0,.2,1);">
    <div style="position:relative;width:${size}px;height:${size}px;margin:0 auto;">
      <span style="position:absolute;inset:-7px;border-radius:999px;background:${ring};"></span>
      <div style="position:relative;width:${size}px;height:${size}px;border-radius:999px;
        background:linear-gradient(155deg,${AGRI.bright},${AGRI.deep});border:3px solid #fff;box-shadow:${shadow};
        display:flex;align-items:center;justify-content:center;">
        <span style="font-family:var(--font-mono);font-size:${num}px;font-weight:800;color:#fff;line-height:1;letter-spacing:-0.02em;">${group.properties}</span>
        <span style="position:absolute;top:-7px;right:-7px;width:21px;height:21px;border-radius:999px;background:#fff;
          border:1.5px solid #DCEBE0;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.18);">
          ${SPROUT(AGRI.mid, 12)}
        </span>
      </div>
    </div>
    <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid ${AGRI.deep};margin:-2px auto 0;filter:drop-shadow(0 3px 2px rgba(16,46,34,0.25));"></div>
    <div style="margin-top:6px;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;
      background:#fff;box-shadow:${chipShadow};border:1px solid ${chipBorder};white-space:nowrap;">
      <span style="font-size:12px;font-weight:700;color:${AGRI.ink};letter-spacing:-0.01em;">${group.name}</span>
      <span style="width:3px;height:3px;border-radius:999px;background:rgba(17,24,39,0.25);"></span>
      <span style="font-family:var(--font-mono);font-size:11px;font-weight:600;color:${AGRI.mid};">${group.properties} agri</span>
    </div>
  </div>`;
}

function AgriMap({ groups, selectedGroup, onPickGroup }) {
  const elRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const layerRef = React.useRef(null);

  React.useEffect(() => {
    if (mapRef.current || !window.L) return;
    const D = window.AGRI_DATA;
    const map = window.L.map(elRef.current, {
      zoomControl: false, attributionControl: true, scrollWheelZoom: true,
    });
    window.L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '© OpenStreetMap · © CARTO', maxZoom: 19, subdomains: "abcd",
    }).addTo(map);
    window.L.control.zoom({ position: "bottomright" }).addTo(map);
    map.attributionControl.setPosition("bottomleft");

    // Existing region boundary — visible but calm: a soft evergreen fill with a
    // crisp dashed stroke so it frames the area without competing with markers.
    window.L.polygon(D.region.polygon, {
      color: "#1F7A5C", weight: 2, opacity: 0.85, dashArray: "2 7", lineCap: "round",
      fillColor: "#1F7A5C", fillOpacity: 0.06,
    }).addTo(map);

    mapRef.current = map;
    layerRef.current = window.L.layerGroup().addTo(map);
    map.fitBounds(D.region.bounds, { padding: [40, 40] });
    setTimeout(() => map.invalidateSize(), 60);
    redraw();
    // eslint-disable-next-line
  }, []);

  React.useEffect(() => { redraw(); });

  function redraw() {
    const map = mapRef.current, group = layerRef.current;
    if (!map || !group) return;
    group.clearLayers();
    groups.forEach((g) => {
      const selected = g.id === selectedGroup;
      window.L.marker([g.lat, g.lon], {
        icon: window.L.divIcon({ html: clusterHTML(g, selected), className: "agri-pin", iconSize: [1, 1] }),
        zIndexOffset: selected ? 1000 : 500,
      }).on("click", () => onPickGroup && onPickGroup(g.id)).addTo(group);
    });
  }

  // focus the selected group's marker
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedGroup) return;
    const g = window.AGRI_DATA.groups.find((x) => x.id === selectedGroup);
    if (g) map.flyTo([g.lat, g.lon], 11, { duration: 0.7 });
  }, [selectedGroup]);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0 }} />

      {/* Top-left: Udupi location pill + city selector — mirrors the panel city */}
      <div style={{ position: "absolute", top: "18px", left: "18px", zIndex: 500, display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "7px", padding: "9px 14px",
          background: "var(--paper)", borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-md)",
          border: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 600, color: "var(--text-strong)",
        }}>
          <AgriIcon name="map-pin" size={16} color="var(--accent)" />
          <span>Udupi</span>
          <AgriIcon name="chevron-right" size={14} color="var(--grey-400)" />
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", color: "#1C5B43" }}>
            <span dangerouslySetInnerHTML={{ __html: SPROUT("#1F7A5C", 14) }} />
            E towards Manipal
          </span>
        </div>
      </div>

      {/* Top-right: city selector */}
      <div style={{ position: "absolute", top: "18px", right: "18px", zIndex: 500 }}>
        <button style={{
          display: "inline-flex", alignItems: "center", gap: "10px", padding: "9px 12px 9px 15px",
          background: "var(--paper)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-md)",
          border: "1px solid var(--border)", cursor: "pointer", fontFamily: "var(--font-sans)",
          fontSize: "13.5px", fontWeight: 600, color: "var(--text-strong)",
        }}>
          Udupi
          <AgriIcon name="chevron-down" size={16} color="var(--grey-500)" />
        </button>
      </div>

      {/* Bottom-centre: polished "showing N" count */}
      <div style={{
        position: "absolute", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 500,
        display: "inline-flex", alignItems: "center", gap: "8px", padding: "8px 16px",
        background: "var(--paper)", borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-lg)",
        border: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: "13px", color: "var(--text-body)",
      }}>
        <span style={{ width: "7px", height: "7px", borderRadius: "999px", background: "var(--accent)" }} />
        Showing <strong style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-strong)" }}>{window.AGRI_DATA.showingTotal}</strong> properties
      </div>

      {/* Bottom-left legend — only existing layers: region boundary + property cluster */}
      <div style={{
        position: "absolute", bottom: "44px", left: "18px", zIndex: 500,
        display: "flex", flexDirection: "column", gap: "9px", padding: "12px 14px",
        background: "rgba(255,255,255,0.94)", backdropFilter: "blur(6px)", borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-sm)", border: "1px solid var(--border)",
        fontFamily: "var(--font-sans)", fontSize: "12px", color: "var(--text-body)",
      }}>
        <span style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>On this map</span>
        <span style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <span style={{ width: "16px", height: "0", borderTop: "2px dashed #1F7A5C" }} />
          Agri region boundary
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <span style={{
            width: "16px", height: "16px", borderRadius: "999px", border: "2px solid #fff",
            background: "linear-gradient(155deg,#2E9B74,#1C5B43)", boxShadow: "0 1px 3px rgba(16,46,34,0.4)",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-mono)", fontSize: "9px", fontWeight: 800, color: "#fff",
          }}>n</span>
          Property group · count
        </span>
      </div>
    </div>
  );
}

window.AgriMap = AgriMap;

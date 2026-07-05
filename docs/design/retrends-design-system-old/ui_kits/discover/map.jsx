// ReTrends Discover — Leaflet map panel with price-pin markers and
// marker <-> card selection sync. Exports window.RTMapPanel.
const { Icon: RTIcon } = window.ReTrendsDesignSystem_f37966;

// shield-check path (matches the design system Icon) for verified pins
const SHIELD = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="VAR" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg>';

function pricePinHTML(label, { selected, verified }) {
  const bg = selected ? "var(--accent)" : "var(--paper)";
  const fg = selected ? "#fff" : "var(--navy-800)";
  const border = selected ? "none" : "1px solid var(--border-strong)";
  const shadow = selected ? "var(--shadow-lg)" : "var(--shadow-sm)";
  const ring = selected ? "0 0 0 3px rgba(176,92,58,0.22)," : "";
  const shield = verified ? SHIELD.replace("VAR", selected ? "#fff" : "var(--evergreen-600)") : "";
  return `<div style="transform:translate(-50%,-115%);transition:all 160ms cubic-bezier(0.4,0,0.2,1);">
    <div style="display:inline-flex;align-items:center;gap:5px;padding:6px 11px;white-space:nowrap;
      font-family:var(--font-mono);font-size:12.5px;font-weight:600;letter-spacing:-0.01em;
      border-radius:9999px;background:${bg};color:${fg};border:${border};
      box-shadow:${ring}${shadow};transform:scale(${selected ? 1.08 : 1});transform-origin:bottom center;">
      ${shield}${label}
    </div>
    <div style="width:9px;height:9px;background:${selected ? "var(--accent)" : "var(--paper)"};
      border-right:${border};border-bottom:${border};transform:translateX(-50%) rotate(45deg);
      margin:-5px auto 0;margin-left:50%;box-shadow:${selected ? "none" : "var(--shadow-xs)"};"></div>
  </div>`;
}

function localityPinHTML(label, sub) {
  return `<div style="transform:translate(-50%,-50%);">
    <div style="width:18px;height:18px;border-radius:9999px;background:var(--navy-800);
      border:3px solid var(--paper);box-shadow:var(--shadow-md);"></div>
  </div>`;
}

function schoolPinHTML(name) {
  return `<div style="transform:translate(-50%,-115%);">
    <div style="display:inline-flex;align-items:center;gap:6px;padding:6px 11px;white-space:nowrap;
      font-family:var(--font-sans);font-size:12px;font-weight:600;border-radius:9999px;
      background:var(--navy-800);color:#fff;box-shadow:var(--shadow-md);">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 22v-4a2 2 0 0 0-4 0v4"/><path d="m18 10 4 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8l4-2"/><path d="M18 5v17"/><path d="m4 6 8-4 8 4"/><path d="M6 5v17"/><circle cx="12" cy="9" r="2"/></svg>
      ${name}
    </div>
    <div style="width:9px;height:9px;background:var(--navy-800);transform:translateX(-50%) rotate(45deg);margin:-5px auto 0;margin-left:50%;"></div>
  </div>`;
}

function RTMapPanel({ listings, selectedId, onSelect, center, zoom, locality, school, mode, showSearchArea }) {
  const elRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const layerRef = React.useRef(null);
  const [moved, setMoved] = React.useState(false);
  const armedRef = React.useRef(false);

  // init once
  React.useEffect(() => {
    if (mapRef.current || !window.L || !elRef.current) return;
    const map = window.L.map(elRef.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: true });
    map.setView(center, zoom);
    window.L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; OpenStreetMap', maxZoom: 19,
    }).addTo(map);
    window.L.control.zoom({ position: "bottomleft" }).addTo(map);
    layerRef.current = window.L.layerGroup().addTo(map);
    mapRef.current = map;
    if (showSearchArea) {
      setTimeout(() => { armedRef.current = true; }, 800);
      const onUserMove = () => { if (armedRef.current) setMoved(true); };
      map.on("dragend", onUserMove);
      map.on("zoomend", onUserMove);
    }
    setTimeout(() => map.invalidateSize(), 60);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // re-center when the page/journey changes
  React.useEffect(() => {
    if (mapRef.current) { mapRef.current.setView(center, zoom); setTimeout(() => mapRef.current.invalidateSize(), 60); }
  }, [center[0], center[1], zoom]);

  // rebuild markers on data / selection / mode change
  React.useEffect(() => {
    const L = window.L, lg = layerRef.current;
    if (!L || !lg) return;
    lg.clearLayers();

    // locality anchor
    if (locality) {
      L.marker(locality.coords, { icon: L.divIcon({ className: "", iconSize: [0, 0], html: localityPinHTML(locality.label) }), interactive: false, zIndexOffset: 0 }).addTo(lg);
    }
    // school anchor (school journey only)
    if (mode === "school" && school) {
      L.marker(school.coords, { icon: L.divIcon({ className: "", iconSize: [0, 0], html: schoolPinHTML(school.name) }), interactive: false, zIndexOffset: 200 }).addTo(lg);
    }
    // listing price pins
    listings.forEach((p) => {
      const sel = p.id === selectedId;
      const m = L.marker(p.coords, {
        icon: L.divIcon({ className: "", iconSize: [0, 0], html: pricePinHTML(p.priceLabel, { selected: sel, verified: p.trustTier === "verified" }) }),
        zIndexOffset: sel ? 1000 : 400,
      }).addTo(lg);
      m.on("click", () => onSelect(p.id));
    });
  }, [listings, selectedId, mode, school, locality]);

  // pan to selected pin
  React.useEffect(() => {
    if (!mapRef.current || !selectedId) return;
    const p = listings.find((x) => x.id === selectedId);
    if (p) mapRef.current.panTo(p.coords, { animate: true, duration: 0.35 });
  }, [selectedId]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0, background: "var(--canvas-200)" }} />
      {/* map-movement state — calm, no aggressive auto-refetch */}
      {showSearchArea && moved && (
        <button onClick={() => setMoved(false)} style={{ position: "absolute", top: "16px", left: "50%", transform: "translateX(-50%)", zIndex: 600, display: "inline-flex", alignItems: "center", gap: "8px", padding: "9px 16px", borderRadius: "var(--radius-full)", cursor: "pointer", border: "1px solid var(--border)", background: "var(--navy-800)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, boxShadow: "var(--shadow-lg)" }}>
          <RTIcon name="search" size={15} color="#fff" />Search this map area
        </button>
      )}
      {/* selected-locality card, top-left — matches the live product */}
      <div style={{ position: "absolute", top: "16px", left: "16px", zIndex: 500, display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px", background: "var(--paper)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border)" }}>
        <RTIcon name="map-pin" size={18} color="var(--accent)" />
        <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
          <span style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-strong)" }}>{mode === "school" && school ? school.area : locality.label}</span>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{locality.sub}</span>
        </span>
      </div>
      {/* count pill, bottom-center */}
      <div style={{ position: "absolute", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 500, padding: "8px 16px", background: "var(--paper)", borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border)", fontSize: "13px", fontWeight: 600, color: "var(--text-body)" }}>
        Showing <span style={{ fontFamily: "var(--font-mono)", color: "var(--text-strong)" }}>{listings.length}</span> properties
      </div>
    </div>
  );
}

window.RTMapPanel = RTMapPanel;

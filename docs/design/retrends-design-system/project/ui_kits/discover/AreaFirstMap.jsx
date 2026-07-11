// Udupi Property Tracker — AREA-FIRST journey map. Exports window.UPTAreaFirstMap
// Individual LOCALITY markers (Malpe, Manipal, Brahmavar, Kaup, Saligrama …), each
// a premium warm-card pill showing area name + property count. Non-zero areas read
// strong (paper card, copper count chip); zero areas drop to a quiet muted variant.
// Adds GROUP HIGHLIGHTING: hovering a neighbourhood-group card lifts that group's
// localities and dims the rest, so the panel and map stay linked. No group markers.
const { Icon: MapIcon } = window.ReTrendsDesignSystem_f37966;

// Catalogue localities that exist but have no live listings yet — always muted.
const UPT_AF_EMPTY_AREAS = [
  { id: "e-saligrama", name: "Saligrama", group: "north-udupi", homes: 0, lat: 13.4360, lon: 74.7000 },
  { id: "e-amoghapura", name: "Amoghapura", group: "university-belt", homes: 0, lat: 13.3720, lon: 74.7250 },
  { id: "e-hejamadi", name: "Hejamadi", group: "south-udupi", homes: 0, lat: 13.1060, lon: 74.7800 },
  { id: "e-uchila", name: "Uchila", group: "coastal-strip", homes: 0, lat: 13.2940, lon: 74.7250 },
  { id: "e-santekatte", name: "Santekatte", group: "city-centre", homes: 0, lat: 13.3110, lon: 74.7430 },
  { id: "e-hebri", name: "Hebri", group: "north-udupi", homes: 0, lat: 13.4480, lon: 74.9870 },
];

const AF_PIN = (c) => `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;

// Premium locality marker. dim = a group is highlighted and this isn't in it.
function afPillHTML(a, active, selected, dim) {
  if (a.homes === 0) {
    return `
    <div style="transform:translate(-50%,-50%);font-family:var(--font-sans);opacity:${dim ? 0.3 : (active ? 0.95 : 0.62)};transition:opacity .18s;">
      <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:var(--radius-full);
        background:rgba(255,255,255,0.9);border:1px dashed var(--stone-400);white-space:nowrap;
        box-shadow:${active ? "var(--shadow-sm)" : "none"};transform:scale(${active ? 1.03 : 1});transition:all .15s cubic-bezier(.4,0,.2,1);cursor:default;">
        <span style="width:6px;height:6px;border-radius:50%;border:1.5px solid var(--grey-400);"></span>
        <span style="font-size:11.5px;font-weight:600;color:var(--text-muted);">${a.name}</span>
        <span style="font-family:var(--font-mono);font-size:10.5px;color:var(--grey-400);">0</span>
      </div>
    </div>`;
  }
  const bg = selected ? "var(--navy-800)" : "var(--paper)";
  const fg = selected ? "#fff" : "var(--text-strong)";
  const border = selected ? "none" : (active ? "1px solid var(--accent)" : "1px solid var(--border)");
  const shadow = active || selected ? "var(--shadow-lg)" : "var(--shadow-md)";
  const scale = selected ? 1.07 : active ? 1.05 : 1;
  const chipBg = selected ? "rgba(255,255,255,0.16)" : "var(--accent-tint)";
  const chipFg = selected ? "#fff" : "var(--copper-600)";
  const pinColor = selected ? "#fff" : "var(--copper-500)";
  return `
  <div style="transform:translate(-50%,-118%);font-family:var(--font-sans);opacity:${dim ? 0.34 : 1};transition:opacity .18s;">
    <div style="display:inline-flex;align-items:center;gap:7px;padding:6px 8px 6px 11px;border-radius:var(--radius-full);
      background:${bg};border:${border};box-shadow:${shadow};white-space:nowrap;transform:scale(${scale});
      transition:transform .15s cubic-bezier(.4,0,.2,1),box-shadow .15s;cursor:pointer;">
      ${AF_PIN(pinColor)}
      <span style="font-size:12.5px;font-weight:700;letter-spacing:-0.01em;color:${fg};">${a.name}</span>
      <span style="font-family:var(--font-mono);font-size:11px;font-weight:600;padding:1.5px 7px;border-radius:var(--radius-full);background:${chipBg};color:${chipFg};">${a.homes}</span>
    </div>
    <div style="width:8px;height:8px;background:${bg};border-right:${border};border-bottom:${border};transform:rotate(45deg);margin:-5px auto 0;box-shadow:${shadow};"></div>
  </div>`;
}

// Compact dot for tightly-clustered localities — expands to a card on hover.
function afCompactHTML(a, active, dim) {
  return `
  <div style="transform:translate(-50%,-50%);font-family:var(--font-sans);opacity:${dim ? 0.34 : 1};transition:opacity .18s;">
    <div style="display:inline-flex;align-items:center;gap:4px;padding:5px 9px;border-radius:var(--radius-full);
      background:var(--paper);border:1px solid ${active ? "var(--accent)" : "var(--border)"};box-shadow:var(--shadow-md);white-space:nowrap;cursor:pointer;
      transform:scale(${active ? 1.06 : 1});transition:transform .15s cubic-bezier(.4,0,.2,1);">
      ${AF_PIN("var(--copper-500)")}
      <span style="font-family:var(--font-mono);font-size:11.5px;font-weight:700;color:var(--text-strong);">${a.homes}</span>
    </div>
  </div>`;
}

function UPTAreaFirstMap({ areas, dataState, loading, highlightGroup, onHoverArea, onPickArea, compact }) {
  const elRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const layerRef = React.useRef(null);
  const [hoverArea, setHoverArea] = React.useState(null);
  const [pickedArea, setPickedArea] = React.useState(null);

  const markerSet = React.useMemo(() => {
    if (dataState === "low") {
      // Emerging market: only the University Belt localities stay live.
      const sparse = areas.map((a) => (a.group === "university-belt" ? a : { ...a, homes: 0 }));
      return sparse.concat(UPT_AF_EMPTY_AREAS);
    }
    return areas.concat(UPT_AF_EMPTY_AREAS);
  }, [areas, dataState]);

  const shownHomes = markerSet.reduce((s, a) => s + a.homes, 0);
  const emptyCount = markerSet.filter((a) => a.homes === 0).length;

  const compactIds = React.useMemo(() => {
    const live = markerSet.filter((a) => a.homes > 0);
    const T = 0.013, ids = new Set();
    for (let i = 0; i < live.length; i++)
      for (let j = i + 1; j < live.length; j++)
        if (Math.abs(live[i].lat - live[j].lat) < T && Math.abs(live[i].lon - live[j].lon) < T) { ids.add(live[i].id); ids.add(live[j].id); }
    return ids;
  }, [markerSet]);

  React.useEffect(() => {
    if (mapRef.current || !window.L) return;
    const D = window.UPT_AREA_DATA;
    const map = window.L.map(elRef.current, {
      center: [D.city.lat, D.city.lon], zoom: compact ? 10 : 11,
      zoomControl: false, attributionControl: true, scrollWheelZoom: false,
    });
    window.L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: "\u00a9 OpenStreetMap \u00b7 \u00a9 CARTO", maxZoom: 19, subdomains: "abcd",
    }).addTo(map);
    window.L.control.zoom({ position: "bottomright" }).addTo(map);
    map.attributionControl.setPosition("bottomleft");
    mapRef.current = map;
    layerRef.current = window.L.layerGroup().addTo(map);
    try {
      const pts = areas.concat(UPT_AF_EMPTY_AREAS).filter((a) => a.lon < 74.85).map((a) => [a.lat, a.lon]);
      map.fitBounds(pts, { padding: compact ? [36, 36] : [70, 70], maxZoom: compact ? 10 : 12 });
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
    group.clearLayers();
    if (loading) return;
    markerSet.forEach((a) => {
      const active = hoverArea === a.id || (highlightGroup && a.group === highlightGroup && a.homes > 0);
      const selected = pickedArea === a.id && a.homes > 0;
      const dim = !!highlightGroup && a.group !== highlightGroup;
      const z = (selected ? 2000 : active ? 1500 : 0) + (a.homes > 0 ? 800 : 100);
      const useCompact = a.homes > 0 && compactIds.has(a.id) && !active && !selected;
      const html = useCompact ? afCompactHTML(a, active, dim) : afPillHTML(a, active, selected, dim);
      window.L.marker([a.lat, a.lon], { icon: makeIcon(html), zIndexOffset: z, riseOnHover: true })
        .on("mouseover", () => { setHoverArea(a.id); onHoverArea && onHoverArea(a); })
        .on("mouseout", () => { setHoverArea(null); onHoverArea && onHoverArea(null); })
        .on("click", () => { if (a.homes > 0) { setPickedArea(a.id); onPickArea && onPickArea(a); } })
        .addTo(group);
    });
  }

  return (
    <div style={{ position: "relative", height: "100%", width: "100%", background: "#EDEBE6" }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0 }} />

      {/* City breadcrumb */}
      <div style={{
        position: "absolute", top: compact ? "12px" : "18px", left: compact ? "12px" : "18px", zIndex: 500,
        display: "flex", alignItems: "center", gap: "7px", padding: "9px 14px",
        background: "var(--paper)", borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-md)",
        border: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 700, color: "var(--text-strong)",
      }}>
        <MapIcon name="map-pin" size={16} color="var(--accent)" />Udupi
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

      {/* Low-data honest note */}
      {!loading && dataState === "low" && emptyCount > 0 && (
        <div style={{
          position: "absolute", bottom: compact ? "62px" : "70px", left: "50%", transform: "translateX(-50%)", zIndex: 500,
          display: "flex", alignItems: "center", gap: "8px", padding: "9px 14px", maxWidth: "calc(100% - 32px)",
          background: "var(--ochre-50)", borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-sm)",
          border: "1px solid rgba(169,116,28,0.25)", fontFamily: "var(--font-sans)", fontSize: "12.5px",
          fontWeight: 600, color: "var(--ochre-600)", whiteSpace: "nowrap",
        }}>
          <MapIcon name="map-pin" size={14} color="var(--ochre-600)" />
          {emptyCount} areas have no listings yet — we add more across Udupi weekly
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
          <MapIcon name="map-pin" size={15} color="var(--accent)" />
          Showing <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-strong)" }}>{shownHomes}</span> verified properties across Udupi
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
            Loading the Udupi map…
          </div>
        </div>
      )}
    </div>
  );
}

window.UPTAreaFirstMap = UPTAreaFirstMap;

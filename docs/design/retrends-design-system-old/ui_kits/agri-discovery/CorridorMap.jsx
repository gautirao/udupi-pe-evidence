// Udupi agri-discovery — CORRIDOR-SELECTION landing map. Exports window.CorridorMap
// Calm regional view: a navy Udupi anchor at centre, four directional corridor cues
// radiating N/E/S/W, and faint spokes that brighten when the matching panel card is
// hovered or selected. Preserves city pill, city selector, zoom, attribution and the
// "Showing N properties" badge. No invented map layers.
const { Icon: CMIcon } = window.ReTrendsDesignSystem_f37966;

const AGRI = { deep: "#1C5B43", mid: "#1F7A5C", bright: "#2E9B74", tint: "#EAF3EF", line: "#CFE5D8", ink: "#1B2A45" };

// Compact directional corridor cue: a cardinal-letter disc with a town chip beneath.
// Idle = calm white/tint; active (hovered or selected from the panel) = evergreen fill,
// enlarged, with a brighter chip — mirroring the corridor card on the right.
function corridorHTML(c, active) {
  const size = active ? 46 : 38;
  const fontSize = active ? 18 : 15;
  const disc = active
    ? `background:linear-gradient(155deg,${AGRI.bright},${AGRI.deep});color:#fff;border:3px solid #fff;box-shadow:0 12px 26px rgba(16,46,34,0.45),0 2px 6px rgba(16,46,34,0.3);`
    : `background:#fff;color:${AGRI.deep};border:2px solid ${AGRI.line};box-shadow:0 4px 12px rgba(16,46,34,0.18);`;
  const chip = active
    ? `border:1px solid ${AGRI.mid};box-shadow:0 4px 12px rgba(16,46,34,0.22);`
    : `border:1px solid rgba(17,24,39,0.08);box-shadow:0 2px 6px rgba(17,24,39,0.12);`;
  return `
  <div style="transform:translate(-50%,-50%);text-align:center;font-family:var(--font-sans);transition:all .15s cubic-bezier(.4,0,.2,1);">
    <div style="width:${size}px;height:${size}px;margin:0 auto;border-radius:999px;${disc}
      display:flex;align-items:center;justify-content:center;">
      <span style="font-family:var(--font-mono);font-size:${fontSize}px;font-weight:800;line-height:1;letter-spacing:-0.02em;">${c.dir}</span>
    </div>
    <div style="margin-top:6px;display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:999px;background:#fff;white-space:nowrap;${chip}">
      <span style="font-size:11.5px;font-weight:700;color:${AGRI.ink};letter-spacing:-0.01em;">${c.town}</span>
      <span style="width:3px;height:3px;border-radius:999px;background:rgba(17,24,39,0.25);"></span>
      <span style="font-family:var(--font-mono);font-size:10.5px;font-weight:600;color:${AGRI.mid};">100km</span>
    </div>
  </div>`;
}

function udupiHTML() {
  return `
  <div style="transform:translate(-50%,-100%);text-align:center;font-family:var(--font-sans);">
    <div style="position:relative;width:40px;height:40px;margin:0 auto;border-radius:999px;
      background:linear-gradient(155deg,#26395B,#0E1626);border:3px solid #fff;
      box-shadow:0 12px 26px rgba(14,22,38,0.45),0 2px 6px rgba(14,22,38,0.3);
      display:flex;align-items:center;justify-content:center;">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg>
    </div>
    <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #0E1626;margin:-2px auto 0;filter:drop-shadow(0 3px 2px rgba(14,22,38,0.25));"></div>
    <div style="margin-top:5px;display:inline-block;padding:3px 11px;border-radius:999px;background:#0E1626;
      box-shadow:0 4px 12px rgba(14,22,38,0.28);">
      <span style="font-size:11.5px;font-weight:700;color:#fff;letter-spacing:0.01em;">Udupi</span>
    </div>
  </div>`;
}

function CorridorMap({ corridors, city, active, onPick, onHover }) {
  const elRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const spokesRef = React.useRef(null);
  const markersRef = React.useRef(null);

  React.useEffect(() => {
    if (mapRef.current || !window.L) return;
    const D = window.CORRIDOR_DATA;
    const map = window.L.map(elRef.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: true });
    window.L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: "© OpenStreetMap · © CARTO", maxZoom: 19, subdomains: "abcd",
    }).addTo(map);
    window.L.control.zoom({ position: "bottomright" }).addTo(map);
    map.attributionControl.setPosition("bottomleft");

    spokesRef.current = window.L.layerGroup().addTo(map);
    markersRef.current = window.L.layerGroup().addTo(map);

    map.fitBounds(D.bounds, { padding: [30, 30] });
    setTimeout(() => map.invalidateSize(), 60);
    mapRef.current = map;
    draw();
    // eslint-disable-next-line
  }, []);

  React.useEffect(() => { draw(); });

  function draw() {
    const map = mapRef.current;
    if (!map) return;
    const sl = spokesRef.current, ml = markersRef.current;
    sl.clearLayers(); ml.clearLayers();

    // Faint directional spokes from Udupi to each corridor anchor (brighten when active).
    corridors.forEach((c) => {
      const on = c.id === active;
      window.L.polyline([[city.lat, city.lon], [c.lat, c.lon]], {
        color: AGRI.mid, weight: on ? 3 : 2, opacity: on ? 0.9 : 0.32,
        dashArray: on ? null : "2 7", lineCap: "round",
      }).addTo(sl);
    });

    // Udupi centre anchor.
    window.L.marker([city.lat, city.lon], {
      icon: window.L.divIcon({ html: udupiHTML(), className: "agri-pin", iconSize: [1, 1] }), zIndexOffset: 400,
    }).addTo(ml);

    // Corridor cues.
    corridors.forEach((c) => {
      const on = c.id === active;
      window.L.marker([c.lat, c.lon], {
        icon: window.L.divIcon({ html: corridorHTML(c, on), className: "agri-pin", iconSize: [1, 1] }),
        zIndexOffset: on ? 1000 : 600,
      })
        .on("click", () => onPick && onPick(c.id))
        .on("mouseover", () => onHover && onHover(c.id))
        .on("mouseout", () => onHover && onHover(null))
        .addTo(ml);
    });
  }

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0 }} />

      {/* Top-left: Udupi location pill */}
      <div style={{ position: "absolute", top: "18px", left: "18px", zIndex: 500, display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: "7px", padding: "9px 14px",
          background: "var(--paper)", borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-md)",
          border: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 600, color: "var(--text-strong)",
        }}>
          <CMIcon name="map-pin" size={16} color="var(--accent)" />
          <span>Udupi</span>
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
          <CMIcon name="chevron-down" size={16} color="var(--grey-500)" />
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
        Showing <strong style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-strong)" }}>{window.CORRIDOR_DATA.showingTotal}</strong> properties
      </div>

      {/* Bottom-left legend — only existing concepts: Udupi origin + corridor direction */}
      <div style={{
        position: "absolute", bottom: "44px", left: "18px", zIndex: 500,
        display: "flex", flexDirection: "column", gap: "9px", padding: "12px 14px",
        background: "rgba(255,255,255,0.94)", backdropFilter: "blur(6px)", borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-sm)", border: "1px solid var(--border)",
        fontFamily: "var(--font-sans)", fontSize: "12px", color: "var(--text-body)",
      }}>
        <span style={{ fontSize: "10.5px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>On this map</span>
        <span style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <span style={{ width: "16px", height: "16px", borderRadius: "999px", border: "2px solid #fff", background: "linear-gradient(155deg,#26395B,#0E1626)", flex: "none" }} />
          Udupi — search origin
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "9px" }}>
          <span style={{ width: "16px", height: "0", borderTop: "2px dashed #1F7A5C", flex: "none" }} />
          Corridor direction · up to 100 km
        </span>
      </div>
    </div>
  );
}

window.CorridorMap = CorridorMap;

// Discover — Result Scopes · map layer.
// FOUR visually distinct marker families (#2016 / #2017). They differ by SHAPE,
// GLYPH, LABEL and ACTION — never by colour alone:
//   1 hierarchy destination · solid navy card, layered glyph, "Explore ›"
//   2 visual area cluster   · dashed hollow chip, zoom glyph, "Tap to zoom"
//   3 individual area       · white tailed pin, map-pin glyph, "Tap to view homes"
//   4 listing price/cluster · mono price pill / solid copper disc (unchanged)
const RSD = window.RS;

const GLYPH = {
  layers: (c) => `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/></svg>`,
  zoom: (c) => `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/><path d="M8 11h6"/><path d="M11 8v6"/></svg>`,
  pin: (c) => `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`,
  check: (c) => `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,
};

// 1 — hierarchy destination: canonical navigation. Changes breadcrumb + node state.
function hierCardHTML(m) {
  return `<div class="rs-mk rs-hier" style="position:relative;width:230px;margin-left:-115px;transform:translateY(-50%);font-family:var(--font-sans);text-align:center;">
    <div class="rs-core" style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;max-width:216px;padding:9px 16px 10px;border-radius:var(--radius-lg);background:var(--navy-800);color:#fff;box-shadow:var(--shadow-lg);border:1.5px solid rgba(255,255,255,0.5);">
      <span style="display:inline-flex;align-items:center;gap:4px;opacity:.8;">${GLYPH.layers("#fff")}<span style="font-size:8.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;">${m.eyebrow || "Explore deeper"}</span></span>
      <span style="font-size:13px;font-weight:700;letter-spacing:-0.01em;line-height:1.2;">${m.title}</span>
      <span style="font-size:10.5px;font-weight:600;opacity:.72;">${m.sub}</span>
      <span style="font-family:var(--font-mono);font-size:14px;font-weight:700;line-height:1.2;margin-top:2px;">${m.count}</span>
    </div>
    <div style="margin-top:6px;display:inline-flex;align-items:center;gap:4px;padding:3px 11px;border-radius:var(--radius-full);background:var(--paper);box-shadow:var(--shadow-md);font-size:10.5px;font-weight:700;color:var(--copper-600);white-space:nowrap;">Explore <span style="font-size:12px;line-height:1;">&#8250;</span></div>
  </div>`;
}

// 2 — visual area cluster: presentation focus only. Never changes breadcrumb or scope.
function zoomChipHTML(m) {
  return `<div class="rs-mk rs-zoom" style="position:relative;width:240px;margin-left:-120px;transform:translateY(-50%);font-family:var(--font-sans);text-align:center;">
    <div class="rs-core" style="display:inline-flex;flex-direction:column;align-items:center;gap:1px;max-width:226px;padding:8px 15px 9px;border-radius:var(--radius-xl, 16px);background:rgba(255,255,255,0.94);border:2px dashed var(--navy-700);box-shadow:var(--shadow-md);">
      <span style="display:inline-flex;align-items:center;gap:5px;">${GLYPH.zoom("var(--navy-800)")}<span style="font-size:12.5px;font-weight:700;color:var(--text-strong);letter-spacing:-0.01em;">${m.title}</span></span>
      <span style="font-size:10.5px;font-weight:600;color:var(--text-muted);">${m.sub}</span>
      <span style="font-family:var(--font-mono);font-size:11px;font-weight:600;color:var(--text-body);margin-top:1px;">${m.count}</span>
    </div>
    <div style="margin-top:5px;display:inline-flex;align-items:center;gap:5px;padding:3px 11px;border-radius:var(--radius-full);background:var(--navy-800);color:#fff;box-shadow:var(--shadow-md);font-size:10px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;white-space:nowrap;">${GLYPH.zoom("#fff")} Tap to zoom</div>
  </div>`;
}

// 3 — individual canonical area marker: selects a real area (a result-scope member).
function areaPinHTML(m) {
  const sel = m.sel;
  const bg = sel ? "var(--navy-800)" : "var(--paper)";
  const fg = sel ? "#fff" : "var(--navy-800)";
  const sub = sel ? "rgba(255,255,255,0.75)" : "var(--text-muted)";
  const border = sel ? "1.5px solid var(--copper-500)" : "1px solid var(--border)";
  const dim = m.dim ? "opacity:.5;" : "";
  return `<div class="rs-mk rs-area" style="position:relative;width:250px;margin-left:-125px;transform:translateY(-100%);text-align:center;font-family:var(--font-sans);${dim}">
    <div class="rs-core" style="display:inline-flex;align-items:center;gap:8px;padding:7px 13px;border-radius:var(--radius-full);background:${bg};color:${fg};box-shadow:${sel ? "var(--shadow-lg)" : "var(--shadow-md)"};border:${border};white-space:nowrap;transform:scale(${sel ? 1.06 : 1});">
      ${sel ? GLYPH.check("var(--copper-400, #E0A184)") : GLYPH.pin("var(--copper-500)")}
      <span style="font-size:13px;font-weight:700;letter-spacing:-0.01em;">${m.name}</span>
      <span style="font-family:var(--font-mono);font-size:11px;color:${sub};">${m.count}</span>
    </div>
    <div style="width:10px;height:10px;background:${bg};border-right:${border};border-bottom:${border};transform:rotate(45deg);margin:-6px auto 0;box-shadow:${sel ? "var(--shadow-lg)" : "var(--shadow-md)"};"></div>
    <div class="rs-cap" style="margin-top:5px;display:inline-block;padding:2px 9px;border-radius:var(--radius-full);background:var(--paper);box-shadow:var(--shadow-sm);font-size:10px;font-weight:700;color:${sel ? "var(--copper-600)" : "var(--text-muted)"};white-space:nowrap;">${sel ? "In result scope" : m.cta || "Tap to view homes"}</div>
  </div>`;
}

// 4a — listing price marker (unchanged property grammar).
function priceHTML(m) {
  return `<div class="rs-mk" style="transform:translate(-50%,-100%);font-family:var(--font-mono);">
    <div style="display:inline-flex;align-items:center;padding:5px 10px;border-radius:var(--radius-full);background:${m.on ? "var(--accent)" : "var(--paper)"};color:${m.on ? "#fff" : "var(--navy-800)"};box-shadow:var(--shadow-sm);border:1px solid ${m.on ? "#fff" : "var(--border)"};white-space:nowrap;font-size:12px;font-weight:600;">${m.label}</div></div>`;
}
// 4b — listing cluster disc.
function priceClusterHTML(m) {
  const size = m.n >= 40 ? 62 : m.n >= 20 ? 54 : 46;
  return `<div class="rs-mk" style="transform:translate(-50%,-50%);font-family:var(--font-sans);text-align:center;">
    <div style="width:${size}px;height:${size}px;border-radius:var(--radius-full);background:var(--accent);color:#fff;box-shadow:var(--shadow-lg);border:3px solid rgba(255,255,255,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;">
      <span style="font-family:var(--font-mono);font-size:16px;font-weight:700;">${m.n}</span>
      <span style="font-size:7.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.85;">homes</span>
    </div></div>`;
}

const BUILD = { hier: hierCardHTML, cluster: zoomChipHTML, area: areaPinHTML, price: priceHTML, pricecluster: priceClusterHTML };

function ScopeMap({ map, compact, onAction }) {
  const ref = React.useRef(null);
  const mapRef = React.useRef(null);
  const layerRef = React.useRef(null);
  const cfg = map || {};

  React.useEffect(() => {
    const m = window.L.map(ref.current, { zoomControl: false, attributionControl: true, scrollWheelZoom: false, dragging: true });
    window.L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap &copy; CARTO" }).addTo(m);
    window.L.control.zoom({ position: "bottomright" }).addTo(m);
    m.setView([13.045, 77.605], 12);
    mapRef.current = m;
    layerRef.current = window.L.layerGroup().addTo(m);
    setTimeout(() => m.invalidateSize(), 60);
    return () => m.remove();
  }, []);

  React.useEffect(() => {
    const m = mapRef.current; if (!m) return;
    m.invalidateSize();
    const g = layerRef.current; g.clearLayers();
    const pts = [];
    (cfg.markers || []).forEach((mk) => {
      const html = (BUILD[mk.kind] || areaPinHTML)(mk);
      window.L.marker([mk.lat, mk.lon], { icon: window.L.divIcon({ html, className: "rs-pin", iconSize: [1, 1] }), zIndexOffset: mk.kind === "price" ? 0 : 400 })
        .addTo(g).on("click", () => onAction && onAction(mk.action || null, mk));
      pts.push([mk.lat, mk.lon]);
    });
    if (cfg.polygon) {
      window.L.polygon(cfg.polygon, { color: "#B05C3A", weight: 2.5, dashArray: "7 5", fillColor: "#B05C3A", fillOpacity: 0.1 }).addTo(g);
      cfg.polygon.forEach((p) => pts.push(p));
    }
    if (cfg.fit && cfg.fit.length) {
      m.fitBounds(cfg.fit, { padding: compact ? [34, 34] : [70, 90], maxZoom: cfg.maxZoom || 14, animate: false });
    } else if (pts.length) {
      m.fitBounds(pts, { padding: compact ? [46, 46] : [90, 110], maxZoom: cfg.maxZoom || 14, animate: false });
    } else if (cfg.center) {
      m.setView(cfg.center, cfg.zoom || 12, { animate: false });
    }
  }, [JSON.stringify(cfg), compact]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#EDEBE6" }}>
      <div ref={ref} className={cfg.dim ? "rs-navmode" : ""} style={{ position: "absolute", inset: 0 }}></div>
      <window.RSMapOverlays cfg={cfg} compact={compact} onAction={onAction} />
    </div>
  );
}

window.RSMap = ScopeMap;
window.RSMarkerHTML = BUILD;

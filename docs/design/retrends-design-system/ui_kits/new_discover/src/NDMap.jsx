// Discover V2 — ONE Leaflet map, driven by a `view` descriptor. Exports window.NDMap
//
// The map is the primary spatial-navigation surface. Direction is carried by geographic
// POSITION: a northern cluster sits north, an eastern one east. Nav markers therefore never
// spell out "North/South" — they show representative DESTINATION NAMES; the panel supplies the
// descriptive directional label. Every marker has a matching panel card (hover/select sync).
const { Icon: MIcon } = window.ReTrendsDesignSystem_f37966;
const short = window.BLR_INR_SHORT;
const TIER_LABEL = { verified: "Verified", trusted: "Trusted", listed: "Listed" };
const ACCENT_BG = { copper: "var(--navy-800)", plum: "var(--navy-800)", agri: "#1F7A5C" };

// Small concentric-ring glyph — marks the CENTRAL cluster without a "Central" label.
const CENTRE_GLYPH = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.75"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5" fill="currentColor"/></svg>`;

// ---- nav marker: a substantial directional REGION CARD. Position conveys direction
// (compass layout), the count is the visual hero, and card width scales with inventory so
// the user reads where the city's supply is concentrated at a glance. Not a precise pin. ----
function dirCard(o) {
  const sel = o.sel, hov = o.hovered, centre = o.centre;
  const w = o.weight == null ? 0.5 : o.weight; // 0..1 relative inventory
  const width = o.width || Math.round(130 + w * 40);
  const countFont = Math.round(22 + w * 9); // 22..31px
  const bg = centre ? (sel ? "var(--navy-800)" : "var(--navy-700, #2A3B5F)") : (sel ? "var(--navy-900)" : "var(--navy-800)");
  const border = `1.5px solid rgba(255,255,255,${sel ? 0.95 : centre ? 0.68 : 0.42})`;
  const cap = o.accent === "plum" ? "var(--plum-600)" : "var(--copper-600)";
  const namesTxt = o.names.join(" \u00B7 ");
  const eyebrow = centre
    ? `<span style="display:inline-flex;align-items:center;gap:5px;font-size:8.5px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:rgba(255,255,255,.72);"><span style="display:inline-flex;">${CENTRE_GLYPH}</span>Central</span>`
    : "";
  return `<div class="nd-nav${hov ? " nd-nav-on" : ""}" style="position:relative;width:${width}px;margin-left:-${width / 2}px;transform:translateY(-50%);font-family:var(--font-sans);text-align:center;">
    <div class="nd-navcore" style="display:flex;flex-direction:column;align-items:center;gap:2px;padding:9px 15px 10px;border-radius:var(--radius-lg);background:${bg};color:#fff;box-shadow:var(--shadow-lg);border:${border};transform:scale(${sel ? 1.06 : 1});transition:transform .18s cubic-bezier(.4,0,.2,1),box-shadow .18s,border-color .18s;">
      ${eyebrow}
      <span style="font-size:12.5px;font-weight:700;letter-spacing:-0.01em;line-height:1.2;text-wrap:balance;">${namesTxt}</span>
      <span style="display:flex;align-items:baseline;gap:5px;margin-top:2px;">
        <span style="font-family:var(--font-mono);font-size:${countFont}px;font-weight:800;line-height:1;letter-spacing:-0.02em;">${o.count.toLocaleString("en-IN")}</span>
        <span style="font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:rgba(255,255,255,.72);">${o.noun === "schools" ? "schools" : "homes"}</span>
      </span>
      ${o.more > 0 ? `<span style="margin-top:3px;padding:1px 9px;border-radius:var(--radius-full);background:rgba(255,255,255,0.14);font-size:10px;font-weight:600;color:rgba(255,255,255,.9);">+${o.more} areas</span>` : ""}
    </div>
    <div class="nd-cap" style="margin-top:5px;display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:var(--radius-full);background:var(--paper);box-shadow:var(--shadow-md);font-size:10px;font-weight:700;color:${cap};white-space:nowrap;">Tap to explore <span style="font-size:12px;line-height:1;">&#8250;</span></div>
  </div>`;
}
function areaPin(o) {
  const sel = o.sel, tone = o.accent;
  const bg = sel ? "var(--navy-800)" : "var(--paper)";
  const fg = sel ? "#fff" : "var(--navy-800)";
  const sub = sel ? "rgba(255,255,255,0.7)" : "var(--text-muted)";
  const border = sel ? "none" : "1px solid var(--border)";
  const pin = sel ? "#fff" : (tone === "plum" ? "var(--plum-500)" : "var(--copper-500)");
  const chev = sel ? "rgba(255,255,255,0.75)" : (tone === "plum" ? "var(--plum-600)" : "var(--copper-600)");
  const glyph = tone === "plum"
    ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${pin}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m22 10-10-5L2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>`
    : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${pin}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
  return `<div class="nd-nav${o.hovered ? " nd-nav-on" : ""}" style="position:relative;width:230px;margin-left:-115px;transform:translateY(-100%);text-align:center;font-family:var(--font-sans);">
    <div class="nd-navcore" style="display:inline-flex;align-items:center;gap:8px;padding:7px 13px;border-radius:var(--radius-full);background:${bg};color:${fg};box-shadow:${sel ? "var(--shadow-lg)" : "var(--shadow-md)"};border:${border};white-space:nowrap;transition:all .18s cubic-bezier(.4,0,.2,1);transform:scale(${sel ? 1.06 : 1});">
      <span style="font-size:13px;font-weight:700;letter-spacing:-0.01em;">${o.name}</span>
      <span style="display:inline-flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:11px;color:${sub};">${glyph}${o.count}</span>
      <span style="font-size:13.5px;font-weight:700;color:${chev};line-height:1;">&#8250;</span>
    </div>
    <div style="width:10px;height:10px;background:${bg};border-right:${border};border-bottom:${border};transform:rotate(45deg);margin:-6px auto 0;box-shadow:${sel ? "var(--shadow-lg)" : "var(--shadow-md)"};"></div>
  </div>`;
}
function schoolPin(o) {
  const sel = o.sel;
  const bg = sel ? "var(--plum-600)" : "var(--paper)";
  const fg = sel ? "#fff" : "var(--navy-800)";
  const border = sel ? "none" : "1px solid var(--border)";
  return `<div class="nd-nav${o.hovered ? " nd-nav-on" : ""}" style="position:relative;width:250px;margin-left:-125px;transform:translateY(-100%);text-align:center;font-family:var(--font-sans);">
    <div class="nd-navcore" style="display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:var(--radius-full);background:${bg};color:${fg};box-shadow:${sel ? "var(--shadow-lg)" : "var(--shadow-sm)"};border:${border};white-space:nowrap;transition:all .18s cubic-bezier(.4,0,.2,1);transform:scale(${sel ? 1.06 : 1});max-width:230px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${sel ? "#fff" : "var(--plum-600)"}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;"><path d="m22 10-10-5L2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>
      <span style="font-size:12.5px;font-weight:700;letter-spacing:-0.01em;overflow:hidden;text-overflow:ellipsis;">${o.name.split(",")[0]}</span>
      ${sel ? "" : `<span style="font-size:13.5px;font-weight:700;color:var(--plum-600);line-height:1;">&#8250;</span>`}
    </div>
    <div style="width:10px;height:10px;background:${bg};border-right:${border};border-bottom:${border};transform:rotate(45deg);margin:-6px auto 0;box-shadow:${sel ? "var(--shadow-lg)" : "var(--shadow-sm)"};"></div>
  </div>`;
}
// Agri corridor card — outbound DIRECTION from the origin; shows key town names + parcel count.
function corridorCard(o) {
  const sel = o.sel;
  const bg = sel ? "#154834" : "#1F7A5C";
  const nameLine = o.names.join(" \u00B7 ") + (o.more > 0 ? ` <span style="opacity:.6;font-weight:600;">+${o.more}</span>` : "");
  const subLine = o.sub ? `<span style="font-size:9.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;opacity:.82;">${o.sub}</span>` : "";
  return `<div class="nd-nav${o.hovered ? " nd-nav-on" : ""}" style="position:relative;width:200px;margin-left:-100px;transform:translateY(-50%);font-family:var(--font-sans);text-align:center;">
    <div class="nd-navcore" style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;max-width:194px;padding:8px 14px 9px;border-radius:var(--radius-lg);background:${bg};color:#fff;box-shadow:var(--shadow-lg);border:1.5px solid rgba(255,255,255,${sel ? 0.9 : 0.5});transform:scale(${sel ? 1.05 : 1});transition:transform .18s cubic-bezier(.4,0,.2,1),box-shadow .18s;">
      ${subLine}
      <span style="font-size:12.5px;font-weight:700;letter-spacing:-0.01em;white-space:nowrap;">${nameLine}</span>
      <span style="display:inline-flex;align-items:baseline;gap:4px;"><span style="font-family:var(--font-mono);font-size:13.5px;font-weight:700;">${o.count}</span><span style="font-size:8px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;opacity:.78;">${o.noun}</span></span>
    </div>
    <div class="nd-cap" style="margin-top:6px;display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:var(--radius-full);background:var(--paper);box-shadow:var(--shadow-md);font-size:10.5px;font-weight:700;color:var(--evergreen-700, #1F694A);white-space:nowrap;">Tap to zoom in <span style="font-size:12px;line-height:1;">&#8250;</span></div>
  </div>`;
}
// Agri ORIGIN marker — the point farmland is measured outward from (an area, or the city centre).
function originPin(name) {
  return `<div style="transform:translate(-50%,-100%);font-family:var(--font-sans);text-align:center;">
    <div style="display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:var(--radius-full);background:#154834;color:#fff;box-shadow:var(--shadow-lg);border:1.5px solid rgba(255,255,255,0.9);white-space:nowrap;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="#fff"/></svg>
      <span style="font-size:12px;font-weight:700;letter-spacing:-0.01em;">Origin · ${name}</span>
    </div>
    <div style="width:9px;height:9px;background:#154834;transform:rotate(45deg);margin:-5px auto 0;"></div>
  </div>`;
}
// Directional SEARCH SECTOR — a green wedge + cumulative distance arcs radiating from the
// origin toward the corridor's real bearing. A search-scope overlay only (not a boundary):
// translucent fill keeps the basemap readable; the active band is emphasised, the rest muted.
function drawSector(layer, s) {
  const cosLat = Math.cos((s.lat * Math.PI) / 180);
  const pt = (km, brgDeg) => { const b = (brgDeg * Math.PI) / 180; return [s.lat + (km / 111) * Math.cos(b), s.lon + (km / (111 * cosLat)) * Math.sin(b)]; };
  const arc = (km, a0, a1) => { const out = []; for (let a = a0; a <= a1 + 0.001; a += 3) out.push(pt(km, a)); return out; };
  const a0 = s.bearing - s.half, a1 = s.bearing + s.half;
  const out = [];
  // muted full-extent wedge (context beyond the active band)
  out.push(window.L.polygon([[s.lat, s.lon]].concat(arc(s.maxBand, a0, a1)), { color: "#1F7A5C", weight: 1, opacity: 0.3, fill: true, fillColor: "#1F7A5C", fillOpacity: 0.04, dashArray: "4 7", interactive: false }));
  // active wedge to the selected distance
  out.push(window.L.polygon([[s.lat, s.lon]].concat(arc(s.maxKm, a0, a1)), { color: "#1F7A5C", weight: 1.6, opacity: 0.85, fill: true, fillColor: "#2E9B74", fillOpacity: 0.12, interactive: false }));
  // cumulative distance arcs
  s.bands.forEach((b) => {
    if (b > s.maxBand) return;
    const active = b === s.maxKm;
    out.push(window.L.polyline(arc(b, a0, a1), { color: "#1F7A5C", weight: active ? 2.2 : 1, opacity: active ? 0.9 : (b < s.maxKm ? 0.4 : 0.22), dashArray: active ? null : "3 6", interactive: false }));
    // small band label at the wedge's leading edge
    const [la, lo] = pt(b, a1 + 1.5);
    out.push(window.L.marker([la, lo], { interactive: false, zIndexOffset: 400, icon: window.L.divIcon({ className: "upt-pin", iconSize: [1, 1], html: `<div style="transform:translate(-50%,-50%);font-family:var(--font-mono);font-size:10px;font-weight:700;color:${active ? "#154834" : "#5C7267"};background:var(--paper);padding:1px 6px;border-radius:var(--radius-full);box-shadow:var(--shadow-sm);white-space:nowrap;opacity:${active ? 1 : 0.75};">${b} km</div>` }) }));
  });
  out.forEach((l) => l.addTo(layer));
}
function townDisc(o) {
  const size = o.sel ? 52 : 44;
  return `<div class="nd-nav${o.hovered ? " nd-nav-on" : ""}" style="transform:translate(-50%,-100%);font-family:var(--font-sans);text-align:center;">
    <div class="nd-navcore" style="width:${size}px;height:${size}px;border-radius:var(--radius-full);background:linear-gradient(160deg,#2E9B74,#1C5B43);border:3px solid #fff;box-shadow:0 4px 14px rgba(20,50,40,.35);display:flex;align-items:center;justify-content:center;margin:0 auto;transition:all .18s cubic-bezier(.4,0,.2,1);">
      <span style="font-family:var(--font-mono);font-size:17px;font-weight:800;color:#fff;">${o.count}</span>
    </div>
    <div style="margin-top:4px;display:inline-block;padding:3px 9px;border-radius:var(--radius-full);background:#fff;box-shadow:var(--shadow-sm);font-size:11px;font-weight:700;color:var(--text-strong);white-space:nowrap;">${o.name} &middot; ${o.count} agri</div>
  </div>`;
}
function homePin(l, active) {
  const bg = active ? "var(--accent)" : "var(--paper)";
  const fg = active ? "#fff" : "var(--navy-800)";
  return `<div style="transform:translate(-50%,-100%);font-family:var(--font-mono);">
    <div style="display:inline-flex;align-items:center;padding:5px 10px;border-radius:var(--radius-full);background:${bg};color:${fg};box-shadow:${active ? "var(--shadow-lg)" : "var(--shadow-sm)"};border:${active ? "1.5px solid #fff" : "1px solid var(--border)"};white-space:nowrap;font-size:12px;font-weight:600;transform:scale(${active ? 1.12 : 1});transition:all .18s cubic-bezier(.4,0,.2,1);z-index:${active ? 5 : 1};">${short(l.price)}</div></div>`;
}
function parcelPin(p, active) {
  const bg = active ? "var(--evergreen-600)" : "var(--paper)";
  const fg = active ? "#fff" : "var(--evergreen-700, #1F694A)";
  return `<div style="transform:translate(-50%,-100%);font-family:var(--font-mono);">
    <div style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:var(--radius-full);background:${bg};color:${fg};box-shadow:${active ? "var(--shadow-lg)" : "var(--shadow-sm)"};border:${active ? "1.5px solid #fff" : "1px solid var(--border)"};white-space:nowrap;font-size:12px;font-weight:600;transform:scale(${active ? 1.1 : 1});transition:all .18s cubic-bezier(.4,0,.2,1);">${p.acres} ac</div></div>`;
}
function clusterBubble(count, tone) {
  const bg = tone === "agri" ? "var(--evergreen-600)" : "var(--navy-800)";
  const size = Math.round(42 + Math.min(count, 24) * 0.8);
  return `<div class="nd-cluster" style="transform:translate(-50%,-50%);font-family:var(--font-sans);text-align:center;cursor:pointer;">
    <div class="nd-cluster-disc" style="width:${size}px;height:${size}px;border-radius:var(--radius-full);background:${bg};color:#fff;box-shadow:var(--shadow-lg);border:3px solid rgba(255,255,255,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;margin:0 auto;transition:transform .18s cubic-bezier(.4,0,.2,1);">
      <span style="font-family:var(--font-mono);font-size:17px;font-weight:700;">${count}</span>
      <span style="font-size:8px;font-weight:700;letter-spacing:.05em;opacity:.82;text-transform:uppercase;">${tone === "agri" ? "parcels" : "homes"}</span>
    </div></div>`;
}
function leafPopupHTML(l, idx, total, agri) {
  const tag = agri ? `<span class="dp-pop-tag dp-pop-tag-agri">${l.acres} acres</span>` : (l.tag ? `<span class="dp-pop-tag">${l.tag}</span>` : "");
  const type = agri ? l.crop : l.propType;
  const loc = agri ? `${l.distKm} km out &middot; ${l.road}` : `${l.locality}, ${l.area}`;
  const meta = agri ? `${l.water} &middot; ${l.soil}` : `${l.beds} BHK &middot; ${l.baths} bath &middot; ${l.sqft} sq.ft`;
  return `<div class="dp-pop${agri ? " dp-pop-agri" : ""}">
    <div class="dp-pop-img" style="background-image:url('${l.image}')"><span class="dp-pop-tier dp-tier-${l.trustTier}">${TIER_LABEL[l.trustTier] || "Listed"}</span>${tag}</div>
    <div class="dp-pop-body">
      <div class="dp-pop-row"><span class="dp-pop-price">${window.BLR_INR(l.price)}</span><span class="dp-pop-type">${type}</span></div>
      <div class="dp-pop-title">${l.title}</div>
      <div class="dp-pop-loc">${loc}</div>
      <div class="dp-pop-meta">${meta}</div>
      <div class="dp-pop-foot"><div class="dp-pop-step"><button class="dp-pp dp-pp-prev">&#8249;</button><span>${idx + 1} / ${total}</span><button class="dp-pp dp-pp-next">&#8250;</button></div><button class="dp-pp-show">Show in list</button></div>
    </div></div>`;
}

function clusterLeaves(items, map, px) {
  const pts = items.map((it) => ({ it, p: map.latLngToContainerPoint([it.lat, it.lon]) }));
  const used = new Array(pts.length).fill(false), out = [];
  for (let i = 0; i < pts.length; i++) {
    if (used[i]) continue;
    const grp = [pts[i]]; used[i] = true;
    for (let j = i + 1; j < pts.length; j++) {
      if (used[j]) continue;
      const dx = pts[i].p.x - pts[j].p.x, dy = pts[i].p.y - pts[j].p.y;
      if (Math.sqrt(dx * dx + dy * dy) < px) { grp.push(pts[j]); used[j] = true; }
    }
    out.push(grp);
  }
  return out;
}

const PAD = { paddingTopLeft: [96, 168], paddingBottomRight: [80, 108] };
const CAM = { duration: 0.8, easeLinearity: 0.22 };
const CLUSTER_PX = 46;

function NDMap(props) {
  const { view, accent, hoverId, hoverSrc, active, onActivate, onPickNode, isMobile, crumb, summary } = props;
  const D = window.BLR_DATA;
  const elRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const navG = React.useRef(null);      // nav markers
  const leafG = React.useRef(null);     // dense leaf pins
  const ringRef = React.useRef(null);
  const camKeyRef = React.useRef(null);
  const nodeMk = React.useRef(new Map());   // id → marker (nav)
  const singleRef = React.useRef(new Map());
  const orderRef = React.useRef([]);
  const reclusterRef = React.useRef(null);
  const moveRedrawRef = React.useRef(null);
  const zoomDrawnRef = React.useRef(null);
  const activeRef = React.useRef(active); activeRef.current = active;
  const hoverIdRef = React.useRef(hoverId); hoverIdRef.current = hoverId;
  const [mapW, setMapW] = React.useState(700);

  const icon = (html) => window.L.divIcon({ html, className: "upt-pin", iconSize: [1, 1] });

  const buildKey = JSON.stringify({
    l: view.level, n: view.nodes ? view.nodes.map((x) => x.id + ":" + x.count).join(",") : "",
    i: view.items ? view.items.map((x) => x.id).join(",") : "", s: view.schoolId, r: view.radiusKm, a: accent, f: view.fitKey,
    o: view.originMarker ? view.originMarker.name : "", k: view.maxKm || 0,
  });
  const camKey = JSON.stringify({ l: view.level, f: view.fitKey });

  React.useEffect(() => {
    if (mapRef.current || !window.L) return;
    const map = window.L.map(elRef.current, { center: [D.city.lat, D.city.lon], zoom: D.city.zoom, zoomControl: false, attributionControl: true, scrollWheelZoom: true });
    window.L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { attribution: "© OpenStreetMap · © CARTO", maxZoom: 19, subdomains: "abcd" }).addTo(map);
    window.L.control.zoom({ position: "bottomright" }).addTo(map);
    map.attributionControl.setPosition("bottomleft");
    mapRef.current = map;
    navG.current = window.L.layerGroup().addTo(map);
    leafG.current = window.L.layerGroup().addTo(map);
    map.on("zoomend", () => { if (reclusterRef.current) reclusterRef.current(); });
    map.on("moveend", () => { if (moveRedrawRef.current) moveRedrawRef.current(); });
    setTimeout(() => { map.invalidateSize(); rebuild(); }, 60);
    // eslint-disable-next-line
  }, []);

  React.useEffect(() => {
    if (!elRef.current || !window.ResizeObserver) return;
    const ro = new ResizeObserver(() => { if (mapRef.current) mapRef.current.invalidateSize(); if (elRef.current) setMapW(elRef.current.clientWidth); });
    ro.observe(elRef.current);
    if (elRef.current) setMapW(elRef.current.clientWidth);
    return () => ro.disconnect();
  }, []);

  React.useEffect(() => { if (mapRef.current) rebuild(); /* eslint-disable-next-line */ }, [buildKey]);

  // active leaf restyle + gentle pan
  React.useEffect(() => {
    const map = mapRef.current; if (!map) return;
    singleRef.current.forEach(({ marker, item, agri }, id) => marker.setIcon(icon(agri ? parcelPin(item, id === active) : homePin(item, id === active))));
    if (active && singleRef.current.has(active)) map.panInside(singleRef.current.get(active).marker.getLatLng(), { padding: [80, 80] });
    // eslint-disable-next-line
  }, [active]);

  // panel → marker hover emphasis (toggle class, never recreate)
  React.useEffect(() => {
    nodeMk.current.forEach((m, id) => {
      const el = m.getElement(); if (!el) return;
      const node = el.querySelector(".nd-nav");
      if (node) node.classList.toggle("nd-nav-on", !!hoverId && hoverSrc !== "map" && id === hoverId);
      m.setZIndexOffset(id === hoverId && hoverSrc !== "map" ? 2000 : (m.__sel ? 900 : 0));
    });
  }, [hoverId, hoverSrc]);

  function rebuild() {
    const map = mapRef.current, g = navG.current, leaf = leafG.current;
    if (!map || !g) return;
    g.clearLayers(); leaf.clearLayers();
    nodeMk.current.clear(); singleRef.current.clear(); orderRef.current = [];
    reclusterRef.current = null; moveRedrawRef.current = null;
    if (ringRef.current) { map.removeLayer(ringRef.current); ringRef.current = null; }
    const moveCam = camKey !== camKeyRef.current;
    camKeyRef.current = camKey;
    const navLevel = ["regions", "clusters", "corridors"].includes(view.level);
    if (elRef.current) elRef.current.classList.toggle("nd-navmode", navLevel);

    const fitTo = (b, z) => { try { map.flyToBounds(b, { ...PAD, ...CAM, maxZoom: z || 15 }); } catch (e) { map.flyTo([D.city.lat, D.city.lon], 11, CAM); } };
    const onHover = props.onHover;

    // ---- nav markers ----
    function placeNode(node, at) {
      const ll = at || [node.center.lat, node.center.lon];
      const kind = node.markerKind;
      let html;
      if (kind === "dir") html = dirCard({ names: node.reps2, more: node.total - node.reps2.length, count: node.count, noun: node.noun, sel: node.sel, hovered: node.id === hoverIdRef.current && hoverSrc !== "map", centre: node.isCentre, weight: node.__weight, width: node.__cardW, accent });
      else if (kind === "area") html = areaPin({ name: node.name, count: node.count, sel: node.sel, hovered: node.id === hoverIdRef.current && hoverSrc !== "map", accent });
      else if (kind === "school") html = schoolPin({ name: node.name, sel: node.sel, hovered: node.id === hoverIdRef.current && hoverSrc !== "map" });
      else if (kind === "corridor") html = corridorCard({ names: node.reps2, more: node.more || 0, count: node.count, noun: node.noun, sel: node.sel, hovered: node.id === hoverIdRef.current && hoverSrc !== "map", sub: node.oSub });
      else if (kind === "town") html = townDisc({ name: node.name, count: node.count, sel: node.sel, hovered: node.id === hoverIdRef.current && hoverSrc !== "map" });
      const label = node.aria || `${node.name || node.reps2.join(", ")}. ${node.count} ${node.noun}. Activate to zoom in.`;
      const m = window.L.marker(ll, { icon: icon(html), zIndexOffset: node.sel ? 900 : 0, title: label, keyboard: true, riseOnHover: true }).addTo(g);
      m.__sel = node.sel;
      m.on("click", () => onPickNode(node));
      if (onHover) { m.on("mouseover", () => onHover(node.id, "map")); m.on("mouseout", () => onHover(null, "map")); }
      const el = m.getElement();
      if (el) {
        el.setAttribute("aria-label", label);
        el.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onPickNode(node); } });
        if (onHover) { el.addEventListener("focus", () => onHover(node.id, "map")); el.addEventListener("blur", () => onHover(null, "map")); }
      }
      nodeMk.current.set(node.id, m);
    }

    // ---- dense leaf pins (listings / homes / parcels) ----
    function mountLeaves(items, agri) {
      const tone = agri ? "agri" : "home";
      const draw = () => {
        zoomDrawnRef.current = map.getZoom();
        leaf.clearLayers(); singleRef.current.clear(); orderRef.current = [];
        const groups = clusterLeaves(items, map, CLUSTER_PX);
        groups.forEach((grp) => {
          if (grp.length === 1) {
            const it = grp[0].it, on = it.id === activeRef.current;
            const m = window.L.marker([it.lat, it.lon], { icon: icon(agri ? parcelPin(it, on) : homePin(it, on)), zIndexOffset: on ? 1000 : 0 }).addTo(leaf);
            m.bindPopup(leafPopupHTML(it, 0, 1, agri), { closeButton: true, autoPan: true, autoPanPadding: [40, 40], offset: [0, -14], minWidth: 232, maxWidth: 232 });
            m.on("click", () => { onActivate && onActivate(it.id); focus(it.id); });
            wire(m, it.id, agri);
            singleRef.current.set(it.id, { marker: m, item: it, agri });
            orderRef.current.push(it.id);
          } else {
            const lat = grp.reduce((s, x) => s + x.it.lat, 0) / grp.length, lon = grp.reduce((s, x) => s + x.it.lon, 0) / grp.length;
            const members = grp.map((x) => x.it);
            const m = window.L.marker([lat, lon], { icon: icon(clusterBubble(grp.length, tone)) }).addTo(leaf);
            m.on("click", () => { try { map.flyToBounds(window.L.latLngBounds(members.map((x) => [x.lat, x.lon])).pad(0.25), { ...PAD, duration: 0.6, maxZoom: 17 }); } catch (e) {} });
          }
        });
        orderRef.current.forEach((id, i) => { const rec = singleRef.current.get(id); if (rec) rec.marker.setPopupContent(leafPopupHTML(rec.item, i, orderRef.current.length, agri)); });
      };
      const focus = (id) => { const rec = singleRef.current.get(id); if (!rec) return; onActivate && onActivate(id); map.panInside(rec.marker.getLatLng(), { padding: [90, 90] }); rec.marker.openPopup(); };
      const wire = (marker, id, agri) => marker.on("popupopen", (ev) => {
        const el = ev.popup.getElement(); if (!el) return;
        const order = orderRef.current, i = order.indexOf(id);
        const prev = el.querySelector(".dp-pp-prev"), next = el.querySelector(".dp-pp-next"), show = el.querySelector(".dp-pp-show"), step = el.querySelector(".dp-pop-step");
        if (order.length <= 1 && step) step.style.visibility = "hidden";
        if (prev) prev.onclick = (e) => { e.stopPropagation(); focus(order[(i - 1 + order.length) % order.length]); };
        if (next) next.onclick = (e) => { e.stopPropagation(); focus(order[(i + 1) % order.length]); };
        if (show) show.onclick = (e) => { e.stopPropagation(); onActivate && onActivate(id); };
      });
      reclusterRef.current = draw;
      draw();
    }

    // Compass composition — nav markers are arranged around the city centre by their true
    // bearing: North at top, East right, South bottom, West left, Centre in the middle. Exact
    // centroids are ignored (this is an orientation canvas, not a pin map), but each card keeps
    // its real direction so the set reads as a trustworthy compass of the property landscape.
    // Recomputed on every settled move so cards stay composed after a fly.
    function navRedraw() {
      g.clearLayers(); nodeMk.current.clear();
      const size = map.getSize();
      const cx = size.x / 2, cy = size.y / 2 + (isMobile ? 6 : 0);
      // card width adapts to the map panel so W · Centre · E clear each other on the midline
      const maxW = Math.max(112, Math.min(168, (size.x - 20) / 3.28));
      const cardMin = Math.min(126, maxW);
      const rx = Math.max(maxW * 0.96, Math.min(size.x / 2 - maxW / 2 - 2, 252));
      // reserve the top card's own half-height (~62) + margin so North never clips the map top
      const ry = Math.max(108, Math.min(size.y / 2 - 88, 250));
      const cos = Math.cos((D.city.lat * Math.PI) / 180);
      const centreNode = view.nodes.find((n) => n.isCentre);
      const gLat = centreNode ? centreNode.center.lat : view.nodes.reduce((s, n) => s + n.center.lat, 0) / view.nodes.length;
      const gLon = centreNode ? centreNode.center.lon : view.nodes.reduce((s, n) => s + n.center.lon, 0) / view.nodes.length;
      const maxCount = Math.max.apply(null, view.nodes.map((n) => n.count)) || 1;
      const minCount = Math.min.apply(null, view.nodes.map((n) => n.count));
      view.nodes.forEach((n) => {
        const wt = maxCount === minCount ? 0.6 : (n.count - minCount) / (maxCount - minCount);
        n.__weight = wt;
        n.__cardW = Math.round(cardMin + wt * (maxW - cardMin));
        let px = cx, py = cy;
        if (!n.isCentre) {
          const dy = n.center.lat - gLat, dx = (n.center.lon - gLon) * cos;
          const ang = Math.atan2(dx, dy); // 0 = N, +90° = E
          px = cx + Math.sin(ang) * rx;
          py = cy - Math.cos(ang) * ry;
        }
        placeNode(n, map.containerPointToLatLng(window.L.point(px, py)));
      });
    }

    // directional search sector (agri towns level) — drawn first so markers layer above it
    if (view.sector) drawSector(g, view.sector);

    // ---- render by level ----
    const RADIAL = ["regions", "clusters", "corridors"].includes(view.level);
    if (view.nodes && RADIAL) { reclusterRef.current = navRedraw; moveRedrawRef.current = navRedraw; navRedraw(); }
    else if (view.nodes && ["areas", "schools", "towns"].includes(view.level)) view.nodes.forEach((n) => placeNode(n));
    if (view.level === "homes" && view.school) {
      if (typeof view.radiusKm === "number") ringRef.current = window.L.circle([view.school.lat, view.school.lon], { radius: view.radiusKm * 1000, color: "var(--plum-500)", weight: 1.5, opacity: 0.6, fillColor: "var(--plum-500)", fillOpacity: 0.08, dashArray: "4 5" }).addTo(map);
      placeNode({ markerKind: "school", id: "anchor", name: view.school.name, sel: true, center: { lat: view.school.lat, lon: view.school.lon }, count: 0, noun: "school" });
    }
    if (view.items && ["listings", "homes", "browse"].includes(view.level)) mountLeaves(view.items, false);
    if (view.items && view.level === "parcels") mountLeaves(view.items, true);

    // agri ORIGIN marker (area or city centre farmland is measured from)
    if (view.originMarker) {
      window.L.marker([view.originMarker.lat, view.originMarker.lon], { icon: icon(originPin(view.originMarker.name)), interactive: false, zIndexOffset: 1200 }).addTo(g);
    }

    // ---- camera ----
    if (moveCam) {
      if (view.level === "homes" && ringRef.current) { try { map.flyToBounds(ringRef.current.getBounds(), { ...PAD, ...CAM }); } catch (e) {} }
      else if (view.fitBounds) fitTo(view.fitBounds, view.maxZoom);
      else map.flyTo([D.city.lat, D.city.lon], D.city.zoom, CAM);
    }
  }

  const isAgri = accent === "agri";
  const crumbColor = isAgri ? "var(--evergreen-600)" : "var(--plum-600)";
  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0 }} />
      <div style={{ position: "absolute", top: "18px", left: "18px", zIndex: 500, display: "flex", alignItems: "center", gap: "7px", padding: "9px 14px", background: "var(--paper)", borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 600, maxWidth: "calc(100% - 36px)", overflow: "hidden" }}>
        <MIcon name="map-pin" size={16} color={isAgri ? "var(--evergreen-600)" : "var(--accent)"} />
        {(crumb || ["Bangalore"]).map((c, i, arr) => (
          <React.Fragment key={i}>
            {i > 0 && <MIcon name="chevron-right" size={14} color="var(--grey-400)" />}
            <span style={{ color: i === arr.length - 1 ? (i === 0 ? "var(--text-strong)" : crumbColor) : "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      {props.instr && mapW >= 560 && (
        <div style={{ position: "absolute", bottom: "20px", left: "18px", zIndex: 520, maxWidth: "250px", background: "var(--paper)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border)", borderLeft: `3px solid ${isAgri ? "var(--evergreen-600)" : "var(--accent)"}`, padding: "11px 14px", fontFamily: "var(--font-sans)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "3px" }}>
            <MIcon name="compass" size={14} color={isAgri ? "var(--evergreen-600)" : "var(--accent)"} />
            <span style={{ fontSize: "11px", fontWeight: 700, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: isAgri ? "var(--evergreen-700, #1F694A)" : "var(--accent)" }}>{props.instr.eyebrow}</span>
          </div>
          <p style={{ margin: 0, fontSize: "12.5px", lineHeight: 1.45, color: "var(--text-body)", textWrap: "pretty" }}>{props.instr.body}</p>
        </div>
      )}
      <div style={{ position: "absolute", top: "18px", right: "18px", zIndex: 500, display: "flex", alignItems: "center", gap: "8px", padding: "9px 15px", background: "var(--paper)", borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--text-body)", whiteSpace: "nowrap" }}>
        <MIcon name={summary.icon} size={15} color={summary.color} />
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-strong)" }}>{summary.count.toLocaleString("en-IN")}</span> {summary.noun}
      </div>
      {view.sector && (
        <div style={{ position: "absolute", bottom: "20px", left: "18px", zIndex: 500, display: "flex", alignItems: "center", gap: "9px", maxWidth: "min(320px, calc(100% - 36px))", padding: "9px 13px", background: "var(--paper)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border)", fontFamily: "var(--font-sans)" }}>
          <span style={{ flex: "none", width: "22px", height: "16px", borderRadius: "3px", background: "rgba(46,155,116,0.16)", border: "1.5px solid #1F7A5C" }} />
          <span style={{ fontSize: "11.5px", lineHeight: 1.35, color: "var(--text-muted)", textWrap: "pretty" }}><strong style={{ color: "var(--text-strong)", fontWeight: 700 }}>Search sector</strong> — direction &amp; distance from {view.sector.originName}</span>
        </div>
      )}
    </div>
  );
}

window.NDMap = NDMap;

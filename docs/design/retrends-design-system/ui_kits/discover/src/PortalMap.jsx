// Unified Discover Portal — ONE Leaflet map. Exports window.DPMap
// A single map instance; only its marker layer swaps. The active layer is a
// pure function of (journey, level) passed in as `layer`. Agri has its own
// evergreen layers and never mixes with residential/ school markers.
const { Icon: MIcon } = window.ReTrendsDesignSystem_f37966;
const CO = window.BLR_COUNTS;
const AG = window.BLR_AGRI;
const short = window.BLR_INR_SHORT;

// ---- marker HTML builders ----
function regionBubble(r, count, sel) {
  const bg = sel ? "var(--navy-900)" : "rgba(27,42,69,0.95)";
  return `<div style="transform:translate(-50%,-50%);font-family:var(--font-sans);text-align:center;">
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;width:86px;height:86px;border-radius:var(--radius-full);background:${bg};color:#fff;box-shadow:var(--shadow-lg);border:2px solid rgba(255,255,255,0.5);transform:scale(${sel ? 1.06 : 1});transition:all .15s cubic-bezier(.4,0,.2,1);">
      <span style="font-family:var(--font-mono);font-size:19px;font-weight:700;line-height:1;">${count}</span>
      <span style="font-size:11px;font-weight:700;">${r.short}</span>
    </div></div>`;
}
function bubblePill(name, count, sel, accent) {
  const bg = sel ? "var(--navy-900)" : "rgba(27,42,69,0.95)";
  const svg = accent === "agri"
    ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20"/><path d="M5 8c4 0 7-3 7-6 0 3 3 6 7 6"/></svg>`
    : accent === "school"
    ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 10-10-5L2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>`
    : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/></svg>`;
  return `<div style="transform:translate(-50%,-50%);font-family:var(--font-sans);">
    <div style="display:inline-flex;align-items:center;gap:9px;padding:8px 14px;border-radius:var(--radius-full);background:${bg};color:#fff;box-shadow:var(--shadow-lg);white-space:nowrap;border:1.5px solid rgba(255,255,255,0.45);transform:scale(${sel ? 1.06 : 1});transition:all .15s cubic-bezier(.4,0,.2,1);">
      ${svg}<span style="font-size:13px;font-weight:700;letter-spacing:-0.01em;">${name}</span>
      <span style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,0.7);">${count}</span>
    </div></div>`;
}
function areaPin(name, count, sel, tone) {
  const bg = sel ? "var(--navy-800)" : "var(--paper)";
  const fg = sel ? "#fff" : "var(--navy-800)";
  const sub = sel ? "rgba(255,255,255,0.7)" : "var(--text-muted)";
  const border = sel ? "none" : "1px solid var(--border)";
  const shadow = sel ? "var(--shadow-lg)" : "var(--shadow-md)";
  const pin = sel ? "#fff" : (tone === "plum" ? "var(--plum-500)" : tone === "agri" ? "var(--evergreen-600)" : "var(--copper-500)");
  const glyph = tone === "plum"
    ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${pin}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m22 10-10-5L2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>`
    : `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${pin}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
  return `<div style="transform:translate(-50%,-100%);font-family:var(--font-sans);">
    <div style="display:inline-flex;align-items:center;gap:8px;padding:7px 13px;border-radius:var(--radius-full);background:${bg};color:${fg};box-shadow:${shadow};border:${border};white-space:nowrap;transition:all .15s cubic-bezier(.4,0,.2,1);transform:scale(${sel ? 1.06 : 1});">
      <span style="font-size:13px;font-weight:700;letter-spacing:-0.01em;">${name}</span>
      <span style="display:inline-flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:11px;color:${sub};">${glyph}${count}</span>
    </div>
    <div style="width:10px;height:10px;background:${bg};border-right:${border};border-bottom:${border};transform:rotate(45deg);margin:-6px auto 0;box-shadow:${shadow};"></div></div>`;
}
function schoolPin(s, sel) {
  const bg = sel ? "var(--plum-600)" : "var(--paper)";
  const fg = sel ? "#fff" : "var(--navy-800)";
  const shadow = sel ? "var(--shadow-lg)" : "var(--shadow-sm)";
  const border = sel ? "none" : "1px solid var(--border)";
  return `<div style="transform:translate(-50%,-100%);font-family:var(--font-sans);">
    <div style="display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:var(--radius-full);background:${bg};color:${fg};box-shadow:${shadow};border:${border};white-space:nowrap;transition:all .15s cubic-bezier(.4,0,.2,1);transform:scale(${sel ? 1.06 : 1});max-width:220px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${sel ? '#fff' : 'var(--plum-600)'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;"><path d="m22 10-10-5L2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>
      <span style="font-size:12.5px;font-weight:700;letter-spacing:-0.01em;overflow:hidden;text-overflow:ellipsis;">${s.name.split(",")[0]}</span>
    </div>
    <div style="width:10px;height:10px;background:${bg};border-right:${border};border-bottom:${border};transform:rotate(45deg);margin:-6px auto 0;box-shadow:${shadow};"></div></div>`;
}
function homePin(l, active) {
  const bg = active ? "var(--accent)" : "var(--paper)";
  const fg = active ? "#fff" : "var(--navy-800)";
  return `<div style="transform:translate(-50%,-100%);font-family:var(--font-mono);">
    <div style="display:inline-flex;align-items:center;padding:5px 10px;border-radius:var(--radius-full);background:${bg};color:${fg};box-shadow:${active ? 'var(--shadow-lg)' : 'var(--shadow-sm)'};border:${active ? 'none' : '1px solid var(--border)'};white-space:nowrap;font-size:12px;font-weight:600;transform:scale(${active ? 1.08 : 1});transition:all .15s cubic-bezier(.4,0,.2,1);">${short(l.price)}</div></div>`;
}
function parcelPin(p, active) {
  const bg = active ? "var(--evergreen-600)" : "var(--paper)";
  const fg = active ? "#fff" : "var(--evergreen-700, #1F694A)";
  return `<div style="transform:translate(-50%,-100%);font-family:var(--font-mono);">
    <div style="display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:var(--radius-full);background:${bg};color:${fg};box-shadow:${active ? 'var(--shadow-lg)' : 'var(--shadow-sm)'};border:${active ? 'none' : '1px solid var(--border)'};white-space:nowrap;font-size:12px;font-weight:600;transform:scale(${active ? 1.06 : 1});transition:all .15s cubic-bezier(.4,0,.2,1);">${p.acres} ac</div></div>`;
}

// Big evergreen DIRECTION bubble (agri landing) — dir letter + parcel count + short label.
function agriDirBubble(c, count, sel) {
  const bg = sel ? "#1C5B43" : "#1F7A5C";
  return `<div style="transform:translate(-50%,-50%);font-family:var(--font-sans);text-align:center;">
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:74px;height:74px;border-radius:var(--radius-full);background:${bg};color:#fff;box-shadow:0 4px 14px rgba(20,50,40,.35);border:3px solid #fff;transform:scale(${sel ? 1.06 : 1});transition:all .15s cubic-bezier(.4,0,.2,1);">
      <span style="font-family:var(--font-mono);font-size:18px;font-weight:800;line-height:1;">${count}</span>
      <span style="font-size:10px;font-weight:700;">${c.dir}</span>
    </div>
    <div style="margin-top:5px;display:inline-block;padding:3px 9px;border-radius:var(--radius-full);background:#fff;box-shadow:var(--shadow-sm);font-size:11px;font-weight:700;color:var(--text-strong);white-space:nowrap;">${c.short}</div>
  </div>`;
}
// White-haloed evergreen TOWN disc — high-contrast count over green tiles + name chip.
function agriTownDisc(name, count, sel) {
  const size = sel ? 52 : 44;
  return `<div style="transform:translate(-50%,-100%);font-family:var(--font-sans);text-align:center;">
    <div style="width:${size}px;height:${size}px;border-radius:var(--radius-full);background:linear-gradient(160deg,#2E9B74,#1C5B43);border:3px solid #fff;box-shadow:0 4px 14px rgba(20,50,40,.35);display:flex;align-items:center;justify-content:center;margin:0 auto;transition:all .15s cubic-bezier(.4,0,.2,1);">
      <span style="font-family:var(--font-mono);font-size:17px;font-weight:800;color:#fff;">${count}</span>
    </div>
    <div style="margin-top:4px;display:inline-block;padding:3px 9px;border-radius:var(--radius-full);background:#fff;box-shadow:var(--shadow-sm);font-size:11px;font-weight:700;color:var(--text-strong);white-space:nowrap;">${name} · ${count} agri</div>
  </div>`;
}

const CITY_LEGEND = {
  "region-bubbles": { dot: "var(--navy-800)", text: "Regions" },
  "region-hotspots": { dot: "var(--copper-500)", text: "Top areas", ring: true },
  "area-groups": { dot: "var(--navy-800)", text: "Area groups" },
  "area-areas": { dot: "var(--copper-500)", text: "Areas", ring: true },
  "area-listings": { dot: "var(--accent)", text: "Listings" },
  "school-zones": { dot: "var(--navy-800)", text: "School zones" },
  "school-areas": { dot: "var(--plum-500)", text: "Areas", ring: true },
  "school-schools": { dot: "var(--plum-500)", text: "Schools", ring: true },
  "school-homes": { dot: "var(--accent)", text: "Homes" },
  "agri-corridors": { dot: "var(--navy-800)", text: "Corridors" },
  "agri-clusters": { dot: "var(--evergreen-600)", text: "Village clusters", ring: true },
  "agri-parcels": { dot: "var(--evergreen-600)", text: "Parcels" },
};

function DPMap({ layer, scope, selection, radiusKm, maxKm, activeListing, listings, parcels, crumb, summary, onPickRegion, onPickGroup, onPickArea, onPickSchool, onPickZone, onPickCorridor, onPickCluster }) {
  const D = window.BLR_DATA;
  const elRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const layerRef = React.useRef(null);
  const ringRef = React.useRef(null);
  const polyRef = React.useRef(null);
  const sel = selection || {};

  React.useEffect(() => {
    if (mapRef.current || !window.L) return;
    const map = window.L.map(elRef.current, { center: [D.city.lat, D.city.lon], zoom: D.city.zoom, zoomControl: false, attributionControl: true, scrollWheelZoom: true });
    window.L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", { attribution: '© OpenStreetMap · © CARTO', maxZoom: 19, subdomains: "abcd" }).addTo(map);
    window.L.control.zoom({ position: "bottomright" }).addTo(map);
    map.attributionControl.setPosition("bottomleft");
    mapRef.current = map;
    layerRef.current = window.L.layerGroup().addTo(map);
    setTimeout(() => map.invalidateSize(), 60);
    redraw();
    // eslint-disable-next-line
  }, []);
  React.useEffect(() => { redraw(); });

  const icon = (html) => window.L.divIcon({ html, className: "upt-pin", iconSize: [1, 1] });
  const region = (id) => D.regions.find((r) => r.id === id);
  const fit = (b, cLat, cLon, z) => { const m = mapRef.current; try { m.flyToBounds(b, { padding: [70, 70], duration: 0.7, maxZoom: z || 15 }); } catch (e) { m.flyTo([cLat, cLon], z || 12, { duration: 0.7 }); } };
  const fitCity = () => mapRef.current.flyTo([D.city.lat, D.city.lon], D.city.zoom, { duration: 0.6 });

  function redraw() {
    const map = mapRef.current, g = layerRef.current;
    if (!map || !g) return;
    g.clearLayers();
    if (ringRef.current) { map.removeLayer(ringRef.current); ringRef.current = null; }
    if (polyRef.current) { map.removeLayer(polyRef.current); polyRef.current = null; }
    const add = (lat, lon, html, click, z) => window.L.marker([lat, lon], { icon: icon(html), zIndexOffset: z || 0 }).on("click", click || (() => {})).addTo(g);
    const offsetPt = (bearing, km) => { const kLat = 1 / 111, kLon = 1 / (111 * Math.cos(D.city.lat * Math.PI / 180)), b = bearing * Math.PI / 180; return [D.city.lat + km * Math.cos(b) * kLat, D.city.lon + km * Math.sin(b) * kLon]; };
    const drawWedge = (c, km, faint) => { polyRef.current = window.L.polygon(window.BLR_WEDGE(D.city, c.bearing, c.half, km), { color: "#1F7A5C", weight: 2, opacity: faint ? 0.45 : 0.7, dashArray: "5 5", fillColor: "#2E9B74", fillOpacity: faint ? 0.05 : 0.09 }).addTo(map); };

    switch (layer) {
      case "region-hotspots": {
        const r = region(scope);
        D.areas.filter((a) => a.region === scope).map((a) => ({ a, c: CO.homesArea(a.id) })).sort((x, y) => y.c - x.c).slice(0, 4)
          .forEach(({ a, c }) => add(a.lat, a.lon, areaPin(a.name, c, false, "copper"), () => onPickArea(a.id), 900));
        if (r) fit(r.bounds, r.center.lat, r.center.lon, 12);
        return;
      }
      case "area-groups": {
        const groups = D.groups.filter((gr) => !scope || gr.region === scope);
        groups.forEach((gr) => add(gr.center.lat, gr.center.lon, bubblePill(gr.name, CO.homesGroup(gr.id), gr.id === sel.groupId), () => onPickGroup(gr.id)));
        if (scope) { const r = region(scope); fit(r.bounds, r.center.lat, r.center.lon, 12); } else fitCity();
        return;
      }
      case "area-areas": {
        const gr = D.groups.find((x) => x.id === sel.groupId);
        D.areas.filter((a) => a.group === sel.groupId).forEach((a) => add(a.lat, a.lon, areaPin(a.name, CO.homesArea(a.id), a.id === sel.areaId, "copper"), () => onPickArea(a.id), 900));
        if (gr) fit(gr.bounds, gr.center.lat, gr.center.lon, 14);
        return;
      }
      case "area-listings": {
        (listings || []).forEach((l) => add(l.lat, l.lon, homePin(l, l.id === activeListing)));
        const a = D.areas.find((x) => x.id === sel.areaId);
        if (a) fit(a.bounds, a.lat, a.lon, 15);
        else if (scope) { const r = region(scope); fit(r.bounds, r.center.lat, r.center.lon, 12); } else fitCity();
        return;
      }
      case "school-zones": {
        const zones = D.zones.filter((z) => !scope || z.region === scope);
        zones.forEach((z) => add(z.center.lat, z.center.lon, bubblePill(z.name, CO.schoolsZone(z.id), z.id === sel.zoneId, "school"), () => onPickZone(z.id)));
        if (scope) { const r = region(scope); fit(r.bounds, r.center.lat, r.center.lon, 12); } else fitCity();
        return;
      }
      case "school-areas": {
        const z = D.zones.find((x) => x.id === sel.zoneId);
        D.areas.filter((a) => a.zone === sel.zoneId).forEach((a) => add(a.lat, a.lon, areaPin(a.name, CO.schoolsArea(a.id), a.id === sel.areaId, "plum"), () => onPickArea(a.id), 900));
        if (z) fit(z.bounds, z.center.lat, z.center.lon, 13);
        return;
      }
      case "school-schools": {
        const a = D.areas.find((x) => x.id === sel.areaId);
        D.schools.filter((s) => s.areaId === sel.areaId).forEach((s) => add(s.lat, s.lon, schoolPin(s, s.id === sel.schoolId), () => onPickSchool(s.id), 800));
        if (a) fit(a.bounds, a.lat, a.lon, 15);
        return;
      }
      case "school-homes": {
        const s = D.schools.find((x) => x.id === sel.schoolId);
        if (s) {
          if (typeof radiusKm === "number") {
            ringRef.current = window.L.circle([s.lat, s.lon], { radius: radiusKm * 1000, color: "var(--plum-500)", weight: 1.5, opacity: 0.6, fillColor: "var(--plum-500)", fillOpacity: 0.08, dashArray: "4 5" }).addTo(map);
          }
          (listings || []).forEach((l) => add(l.lat, l.lon, homePin(l, l.id === activeListing)));
          add(s.lat, s.lon, schoolPin(s, true), () => {}, 1000);
          if (ringRef.current) { try { map.flyToBounds(ringRef.current.getBounds(), { padding: [50, 50], duration: 0.7 }); } catch (e) { map.flyTo([s.lat, s.lon], 13, { duration: 0.7 }); } }
          else map.flyTo([s.lat, s.lon], 13, { duration: 0.7 });
        }
        return;
      }
      case "agri-corridors": {
        D.agri.corridors.forEach((c) => {
          const [plat, plon] = offsetPt(c.bearing, Math.max(20, AG.maxTownDist(c.id) * 0.55));
          add(plat, plon, agriDirBubble(c, AG.dirProps(c.id), c.id === sel.corridorId), () => onPickCorridor(c.id));
        });
        fitCity();
        return;
      }
      case "agri-clusters": {
        const c = D.agri.corridors.find((x) => x.id === sel.corridorId);
        const km = maxKm || 100;
        if (c) {
          drawWedge(c, km);
          AG.visibleTowns(c.id, km).forEach((cl) => add(cl.lat, cl.lon, agriTownDisc(cl.name, AG.townProps(cl.id), cl.id === sel.clusterId), () => onPickCluster(cl.id), 900));
          try { map.flyToBounds(polyRef.current.getBounds(), { padding: [55, 55], duration: 0.7 }); } catch (e) { map.flyTo([D.city.lat, D.city.lon], 9, { duration: 0.7 }); }
        }
        return;
      }
      case "agri-parcels": {
        const c = D.agri.corridors.find((x) => x.id === sel.corridorId);
        const cl = D.agri.clusters.find((x) => x.id === sel.clusterId);
        if (c) drawWedge(c, maxKm || 100, true);
        (parcels || []).forEach((p) => add(p.lat, p.lon, parcelPin(p, p.id === activeListing)));
        if (cl) fit(cl.bounds, cl.lat, cl.lon, 13);
        return;
      }
      default: { // region-bubbles (city landing)
        D.regions.forEach((r) => add(r.center.lat, r.center.lon, regionBubble(r, CO.homesRegion(r.id), r.id === scope), () => onPickRegion(r.id)));
        fitCity();
      }
    }
  }

  const lg = CITY_LEGEND[layer] || CITY_LEGEND["region-bubbles"];
  const isAgri = String(layer).startsWith("agri");
  const crumbColor = isAgri ? "var(--evergreen-600)" : "var(--plum-600)";

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0 }} />
      {/* Breadcrumb chip — mirrors the panel scope + journey */}
      <div style={{ position: "absolute", top: "18px", left: "18px", zIndex: 500, display: "flex", alignItems: "center", gap: "7px", padding: "9px 14px", background: "var(--paper)", borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 600, color: "var(--text-strong)", width: "max-content", maxWidth: "calc(100% - 36px)", overflow: "hidden" }}>
        <MIcon name="map-pin" size={16} color={isAgri ? "var(--evergreen-600)" : "var(--accent)"} />
        {(crumb || ["Bangalore"]).map((c, i, arr) => (
          <React.Fragment key={i}>
            {i > 0 && <MIcon name="chevron-right" size={14} color="var(--grey-400)" />}
            <span style={{ color: i === arr.length - 1 ? (i === 0 ? "var(--text-strong)" : crumbColor) : "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      {/* Legend */}
      <div style={{ position: "absolute", bottom: "44px", left: "18px", zIndex: 500, display: "flex", flexDirection: "column", gap: "8px", padding: "11px 13px", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(6px)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: "12px", color: "var(--text-body)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "11px", height: "11px", borderRadius: "var(--radius-full)", background: lg.ring ? "var(--paper)" : lg.dot, border: lg.ring ? `1px solid ${lg.dot}` : "none" }} />{lg.text}
        </span>
        {layer === "school-homes" && (
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}><span style={{ width: "11px", height: "11px", borderRadius: "var(--radius-full)", border: "1.5px dashed var(--plum-500)", background: "transparent" }} />{radiusKm} km radius</span>
        )}
      </div>
      {/* Summary pill */}
      <div style={{ position: "absolute", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 500, display: "flex", alignItems: "center", gap: "8px", padding: "9px 16px", background: "var(--paper)", borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--text-body)", whiteSpace: "nowrap" }}>
        <MIcon name={summary.icon} size={15} color={summary.color} />
        Showing <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-strong)" }}>{summary.count.toLocaleString("en-IN")}</span> {summary.noun}
      </div>
    </div>
  );
}

window.DPMap = DPMap;

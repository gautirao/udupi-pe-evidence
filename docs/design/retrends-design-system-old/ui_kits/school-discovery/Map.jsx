// Udupi school-discovery — Leaflet map. Exports window.UPTMap
// Calm CartoDB Positron tiles, on-brand markers, selection synced to the panel.
const { Icon: UPTIcon } = window.ReTrendsDesignSystem_f37966;

function fmtPriceShort(p) {
  return p >= 10000000 ? `₹${(p / 10000000).toFixed(2)} Cr` : `₹${(p / 100000).toFixed(0)} L`;
}

// --- marker HTML builders (styled inline so they match the design system) ---
// School pins carry the purple school-journey accent (used sparingly).
function schoolPinHTML(school, selected) {
  const bg = selected ? "var(--plum-600)" : "var(--paper)";
  const fg = selected ? "#fff" : "var(--navy-800)";
  const sub = selected ? "rgba(255,255,255,0.85)" : "var(--text-muted)";
  const shadow = selected ? "var(--shadow-lg)" : "var(--shadow-sm)";
  const border = selected ? "none" : "1px solid var(--border)";
  const label = school.shortName || school.area;
  return `
  <div style="transform:translate(-50%,-100%);font-family:var(--font-sans);">
    <div style="display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:var(--radius-full);
      background:${bg};color:${fg};box-shadow:${shadow};border:${border};white-space:nowrap;
      transition:all .15s cubic-bezier(.4,0,.2,1);transform:scale(${selected ? 1.06 : 1});">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${selected ? '#fff' : 'var(--plum-600)'}"
        stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;">
        <path d="m22 10-10-5L2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/>
      </svg>
      <span style="font-size:13px;font-weight:700;letter-spacing:-0.01em;">${label}</span>
    </div>
    <div style="width:10px;height:10px;background:${bg};border-right:${border};border-bottom:${border};
      transform:rotate(45deg);margin:-6px auto 0;box-shadow:${shadow};"></div>
  </div>`;
}

// Area pin — the intermediary markers that map 1:1 to the area cards.
function areaPinHTML(area, selected) {
  const bg = selected ? "var(--navy-800)" : "var(--paper)";
  const fg = selected ? "#fff" : "var(--navy-800)";
  const sub = selected ? "rgba(255,255,255,0.7)" : "var(--text-muted)";
  const border = selected ? "none" : "1px solid var(--border)";
  const shadow = selected ? "var(--shadow-lg)" : "var(--shadow-md)";
  const noHomes = area.listings === 0;
  return `
  <div style="transform:translate(-50%,-100%);font-family:var(--font-sans);">
    <div style="display:inline-flex;align-items:center;gap:8px;padding:7px 13px;border-radius:var(--radius-full);
      background:${bg};color:${fg};box-shadow:${shadow};border:${border};white-space:nowrap;
      transition:all .15s cubic-bezier(.4,0,.2,1);transform:scale(${selected ? 1.06 : 1});">
      <span style="font-size:13px;font-weight:700;letter-spacing:-0.01em;">${area.name}</span>
      <span style="display:inline-flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:11px;color:${sub};">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${selected ? '#fff' : 'var(--plum-500)'}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m22 10-10-5L2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>${area.schools}
        <span style="opacity:.5;">·</span>
        ${noHomes ? '0' : area.listings} <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${selected ? '#fff' : 'var(--copper-500)'}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
      </span>
    </div>
    <div style="width:10px;height:10px;background:${bg};border-right:${border};border-bottom:${border};
      transform:rotate(45deg);margin:-6px auto 0;box-shadow:${shadow};"></div>
  </div>`;
}

function zonePinHTML(zone, selected) {
  const bg = selected ? "var(--navy-800)" : "rgba(27,42,69,0.92)";
  return `
  <div style="transform:translate(-50%,-50%);font-family:var(--font-sans);">
    <div style="display:inline-flex;align-items:center;gap:7px;padding:7px 13px;border-radius:var(--radius-full);
      background:${bg};color:#fff;box-shadow:var(--shadow-lg);white-space:nowrap;border:1.5px solid rgba(255,255,255,0.5);
      transform:scale(${selected ? 1.06 : 1});transition:all .15s cubic-bezier(.4,0,.2,1);">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2"
        stroke-linecap="round" stroke-linejoin="round"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/></svg>
      <span style="font-size:13px;font-weight:700;">${zone.name}</span>
    </div>
  </div>`;
}

function homePinHTML(listing, active) {
  const bg = active ? "var(--accent)" : "var(--paper)";
  const fg = active ? "#fff" : "var(--navy-800)";
  return `
  <div style="transform:translate(-50%,-100%);font-family:var(--font-mono);">
    <div style="display:inline-flex;align-items:center;padding:5px 10px;border-radius:var(--radius-full);
      background:${bg};color:${fg};box-shadow:${active ? 'var(--shadow-lg)' : 'var(--shadow-sm)'};
      border:${active ? 'none' : '1px solid var(--border)'};white-space:nowrap;font-size:12px;font-weight:600;
      transform:scale(${active ? 1.08 : 1});transition:all .15s cubic-bezier(.4,0,.2,1);">
      ${fmtPriceShort(listing.price)}
    </div>
  </div>`;
}

function UPTMap({ mode, schools, zones, areas, listings, selectedSchool, selectedZone, selectedArea, activeListing, radiusKm, showZoneHomes, onPickSchool, onPickZone, onPickArea }) {
  const elRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const layerRef = React.useRef(null);
  const ringRef = React.useRef(null);

  // init once
  React.useEffect(() => {
    if (mapRef.current || !window.L) return;
    const D = window.UPT_DATA;
    const map = window.L.map(elRef.current, {
      center: [D.city.lat, D.city.lon], zoom: D.city.zoom,
      zoomControl: false, attributionControl: true, scrollWheelZoom: true,
    });
    window.L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '© OpenStreetMap · © CARTO', maxZoom: 19, subdomains: "abcd",
    }).addTo(map);
    window.L.control.zoom({ position: "bottomright" }).addTo(map);
    map.attributionControl.setPosition("bottomleft");
    mapRef.current = map;
    layerRef.current = window.L.layerGroup().addTo(map);
    setTimeout(() => map.invalidateSize(), 60);
    redraw();
    // eslint-disable-next-line
  }, []);

  // redraw markers when inputs change
  React.useEffect(() => { redraw(); });

  function makeIcon(html, size) {
    return window.L.divIcon({ html, className: "upt-pin", iconSize: size || [1, 1] });
  }

  function redraw() {
    const map = mapRef.current, group = layerRef.current;
    if (!map || !group) return;
    group.clearLayers();
    if (ringRef.current) { map.removeLayer(ringRef.current); ringRef.current = null; }

    if (selectedSchool) {
      const s = schools.find((x) => x.id === selectedSchool);
      if (s) {
        const hasCoords = s.lat != null && s.lon != null;
        // purple focus ring sized to the chosen radius (only when it's a real km value)
        if (hasCoords && typeof radiusKm === "number" && isFinite(radiusKm)) {
          ringRef.current = window.L.circle([s.lat, s.lon], {
            radius: radiusKm * 1000, color: "var(--plum-500)", weight: 1.5, opacity: 0.6,
            fillColor: "var(--plum-500)", fillOpacity: 0.07, dashArray: "4 5",
          }).addTo(map);
        }
        if (hasCoords) window.L.marker([s.lat, s.lon], { icon: makeIcon(schoolPinHTML(s, true)), zIndexOffset: 1000 }).addTo(group);
        listings.forEach((l) => {
          if (l.lat == null || l.lon == null) return;
          window.L.marker([l.lat, l.lon], { icon: makeIcon(homePinHTML(l, l.id === activeListing)) }).addTo(group);
        });
        if (hasCoords) {
          if (ringRef.current) { try { map.flyToBounds(ringRef.current.getBounds(), { padding: [40, 40], duration: 0.7 }); } catch (e) { map.flyTo([s.lat, s.lon], 13, { duration: 0.7 }); } }
          else map.flyTo([s.lat, s.lon], 13, { duration: 0.7 });
        }
      }
      return;
    }

    // ---- Area selected: schools in the area + home pins ----
    if (selectedArea) {
      const a = areas.find((x) => x.id === selectedArea);
      if (a) {
        schools.filter((s) => s.areaId === selectedArea).forEach((s) => {
          window.L.marker([s.lat, s.lon], { icon: makeIcon(schoolPinHTML(s, false)), zIndexOffset: 800 })
            .on("click", () => onPickSchool && onPickSchool(s.id)).addTo(group);
        });
        listings.forEach((l) => {
          window.L.marker([l.lat, l.lon], { icon: makeIcon(homePinHTML(l, l.id === activeListing)) }).addTo(group);
        });
        try { map.flyToBounds(a.bounds, { padding: [60, 60], duration: 0.7, maxZoom: 15 }); }
        catch (e) { map.flyTo([a.lat, a.lon], 14, { duration: 0.7 }); }
      }
      return;
    }

    // ---- Zone selected (intermediary): area markers, or all-homes pins ----
    if (selectedZone) {
      const z = zones.find((x) => x.id === selectedZone);
      if (z) {
        if (showZoneHomes) {
          // "View all homes in zone" — show home pins fitted to the zone
          listings.forEach((l) => {
            if (l.lat == null || l.lon == null) return;
            window.L.marker([l.lat, l.lon], { icon: makeIcon(homePinHTML(l, l.id === activeListing)) }).addTo(group);
          });
        } else {
          areas.filter((a) => a.zone === selectedZone).forEach((a) => {
            window.L.marker([a.lat, a.lon], { icon: makeIcon(areaPinHTML(a, false)), zIndexOffset: 900 })
              .on("click", () => onPickArea && onPickArea(a.id)).addTo(group);
          });
        }
        try { map.flyToBounds(z.bounds, { padding: [70, 70], duration: 0.7, maxZoom: 13 }); }
        catch (e) { map.flyTo([z.center.lat, z.center.lon], 12, { duration: 0.7 }); }
      }
      return;
    }

    // landing: show school pins + zone pins
    schools.forEach((s) => {
      window.L.marker([s.lat, s.lon], { icon: makeIcon(schoolPinHTML(s, false)) })
        .on("click", () => onPickSchool && onPickSchool(s.id)).addTo(group);
    });
    zones.forEach((z) => {
      window.L.marker([z.center.lat, z.center.lon], { icon: makeIcon(zonePinHTML(z, false)) })
        .on("click", () => onPickZone && onPickZone(z.id)).addTo(group);
    });
    const D = window.UPT_DATA;
    map.flyTo([D.city.lat, D.city.lon], D.city.zoom, { duration: 0.5 });
  }

  const crumbZone = (selectedZone && zones.find((z) => z.id === selectedZone)?.name) ||
    (selectedArea && zones.find((z) => z.id === areas.find((a) => a.id === selectedArea)?.zone)?.name) ||
    (selectedSchool && zones.find((z) => z.id === schools.find((s) => s.id === selectedSchool)?.zone)?.name) || null;
  const crumbArea = (selectedArea && areas.find((a) => a.id === selectedArea)?.name) ||
    (selectedSchool && areas.find((a) => a.id === schools.find((s) => s.id === selectedSchool)?.areaId)?.name) || null;
  const crumbSchool = (selectedSchool && schools.find((s) => s.id === selectedSchool)?.name) || null;

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0 }} />
      {/* Breadcrumb chip — top left, mirrors the panel selection */}
      <div style={{
        position: "absolute", top: "18px", left: "18px", right: "18px", zIndex: 500,
        display: "flex", alignItems: "center", gap: "7px", padding: "9px 14px",
        background: "var(--paper)", borderRadius: "var(--radius-full)",
        boxShadow: "var(--shadow-md)", border: "1px solid var(--border)",
        fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 600, color: "var(--text-strong)",
        width: "max-content", maxWidth: "calc(100% - 36px)", overflow: "hidden",
      }}>
        <UPTIcon name="map-pin" size={16} color="var(--accent)" />
        <span>Udupi</span>
        {crumbZone && <><UPTIcon name="chevron-right" size={14} color="var(--grey-400)" /><span style={{ color: crumbArea || crumbSchool ? "var(--text-muted)" : "var(--text-strong)" }}>{crumbZone}</span></>}
        {crumbArea && <><UPTIcon name="chevron-right" size={14} color="var(--grey-400)" /><span style={{ color: crumbSchool ? "var(--text-muted)" : "var(--text-strong)" }}>{crumbArea}</span></>}
        {crumbSchool && <><UPTIcon name="chevron-right" size={14} color="var(--grey-400)" /><span style={{ color: "var(--plum-600)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{crumbSchool}</span></>}
      </div>
      {/* Legend — bottom left, above attribution */}
      <div style={{
        position: "absolute", bottom: "44px", left: "18px", zIndex: 500,
        display: "flex", flexDirection: "column", gap: "8px", padding: "11px 13px",
        background: "rgba(255,255,255,0.92)", backdropFilter: "blur(6px)",
        borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border)",
        fontFamily: "var(--font-sans)", fontSize: "12px", color: "var(--text-body)",
      }}>
        {selectedZone && !selectedArea && !selectedSchool && (
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "11px", height: "11px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--paper)" }} />Areas in this zone
          </span>
        )}
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "11px", height: "11px", borderRadius: "var(--radius-full)", border: "1px solid var(--plum-500)", background: "var(--plum-tint)" }} />Schools
        </span>
        {(selectedArea || selectedSchool) && (
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "11px", height: "11px", borderRadius: "var(--radius-full)", background: "var(--accent)" }} />Homes
          </span>
        )}
        {selectedSchool && (
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "11px", height: "11px", borderRadius: "var(--radius-full)", border: "1.5px dashed var(--plum-500)", background: "transparent" }} />
            {typeof radiusKm === "number" && isFinite(radiusKm) ? `${radiusKm} km radius` : "Area-wide"}
          </span>
        )}
      </div>
    </div>
  );
}

window.UPTMap = UPTMap;

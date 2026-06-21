// Udupi AREA-FIRST discovery — Leaflet map. Exports window.UPTAreaMap
// Calm CARTO Voyager tiles, ink-navy + copper markers synced to the panel.
// Markers: GROUP (navy, landing) → AREA (paper, group selected) → HOME (price pin).
// NO school pins, NO radius ring — that's the school-first journey.
const { Icon: UPTIcon } = window.ReTrendsDesignSystem_f37966;

function fmtPriceShort(p) {
  return p >= 10000000 ? `₹${(p / 10000000).toFixed(2)} Cr` : `₹${(p / 100000).toFixed(0)} L`;
}

// Group marker — navy pill with area + home counts (landing).
function groupPinHTML(g, selected) {
  const bg = selected ? "var(--navy-900)" : "rgba(27,42,69,0.95)";
  return `
  <div style="transform:translate(-50%,-50%);font-family:var(--font-sans);">
    <div style="display:inline-flex;align-items:center;gap:9px;padding:8px 14px;border-radius:var(--radius-full);
      background:${bg};color:#fff;box-shadow:var(--shadow-lg);white-space:nowrap;border:1.5px solid rgba(255,255,255,0.45);
      transform:scale(${selected ? 1.06 : 1});transition:all .15s cubic-bezier(.4,0,.2,1);">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/></svg>
      <span style="font-size:13px;font-weight:700;letter-spacing:-0.01em;">${g.name}</span>
      <span style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,0.7);">${g.homes}</span>
    </div>
  </div>`;
}

// Area marker — paper pill with home count (copper pin). Maps 1:1 to area cards.
function areaPinHTML(a, selected) {
  const bg = selected ? "var(--navy-800)" : "var(--paper)";
  const fg = selected ? "#fff" : "var(--navy-800)";
  const sub = selected ? "rgba(255,255,255,0.7)" : "var(--text-muted)";
  const border = selected ? "none" : "1px solid var(--border)";
  const shadow = selected ? "var(--shadow-lg)" : "var(--shadow-md)";
  const pinColor = selected ? "#fff" : "var(--copper-500)";
  return `
  <div style="transform:translate(-50%,-100%);font-family:var(--font-sans);">
    <div style="display:inline-flex;align-items:center;gap:8px;padding:7px 13px;border-radius:var(--radius-full);
      background:${bg};color:${fg};box-shadow:${shadow};border:${border};white-space:nowrap;
      transition:all .15s cubic-bezier(.4,0,.2,1);transform:scale(${selected ? 1.06 : 1});">
      <span style="font-size:13px;font-weight:700;letter-spacing:-0.01em;">${a.name}</span>
      <span style="display:inline-flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:11px;color:${sub};">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${pinColor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>${a.homes}
      </span>
    </div>
    <div style="width:10px;height:10px;background:${bg};border-right:${border};border-bottom:${border};
      transform:rotate(45deg);margin:-6px auto 0;box-shadow:${shadow};"></div>
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

function UPTAreaMap({ groups, areas, listings, selectedGroup, selectedArea, activeListing, totalCount, onPickGroup, onPickArea }) {
  const elRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const layerRef = React.useRef(null);

  React.useEffect(() => {
    if (mapRef.current || !window.L) return;
    const D = window.UPT_AREA_DATA;
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

  React.useEffect(() => { redraw(); });

  function makeIcon(html, size) {
    return window.L.divIcon({ html, className: "upt-pin", iconSize: size || [1, 1] });
  }

  function redraw() {
    const map = mapRef.current, group = layerRef.current;
    if (!map || !group) return;
    group.clearLayers();

    // ---- Area selected: home pins fitted to the area ----
    if (selectedArea) {
      const a = areas.find((x) => x.id === selectedArea);
      if (a) {
        listings.forEach((l) => {
          if (l.lat == null || l.lon == null) return;
          window.L.marker([l.lat, l.lon], { icon: makeIcon(homePinHTML(l, l.id === activeListing)) }).addTo(group);
        });
        try { map.flyToBounds(a.bounds, { padding: [70, 70], duration: 0.7, maxZoom: 15 }); }
        catch (e) { map.flyTo([a.lat, a.lon], 14, { duration: 0.7 }); }
      }
      return;
    }

    // ---- Group selected: area markers inside the group ----
    if (selectedGroup) {
      const g = groups.find((x) => x.id === selectedGroup);
      if (g) {
        areas.filter((a) => a.group === selectedGroup).forEach((a) => {
          window.L.marker([a.lat, a.lon], { icon: makeIcon(areaPinHTML(a, false)), zIndexOffset: 900 })
            .on("click", () => onPickArea && onPickArea(a.id)).addTo(group);
        });
        try { map.flyToBounds(g.bounds, { padding: [70, 70], duration: 0.7, maxZoom: 13 }); }
        catch (e) { map.flyTo([g.center.lat, g.center.lon], 12, { duration: 0.7 }); }
      }
      return;
    }

    // ---- Landing: group markers ----
    groups.forEach((g) => {
      window.L.marker([g.center.lat, g.center.lon], { icon: makeIcon(groupPinHTML(g, false)) })
        .on("click", () => onPickGroup && onPickGroup(g.id)).addTo(group);
    });
    const D = window.UPT_AREA_DATA;
    map.flyTo([D.city.lat, D.city.lon], D.city.zoom, { duration: 0.5 });
  }

  const groupObj = selectedGroup && groups.find((g) => g.id === selectedGroup);
  const areaObj = selectedArea && areas.find((a) => a.id === selectedArea);
  const crumbGroup = groupObj?.name || (areaObj && groups.find((g) => g.id === areaObj.group)?.name) || null;
  const crumbArea = areaObj?.name || null;

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0 }} />

      {/* Breadcrumb — top left */}
      <div style={{
        position: "absolute", top: "18px", left: "18px", zIndex: 500,
        display: "flex", alignItems: "center", gap: "7px", padding: "9px 14px",
        background: "var(--paper)", borderRadius: "var(--radius-full)",
        boxShadow: "var(--shadow-md)", border: "1px solid var(--border)",
        fontFamily: "var(--font-sans)", fontSize: "13.5px", fontWeight: 600, color: "var(--text-strong)",
        width: "max-content", maxWidth: "calc(100% - 36px)", overflow: "hidden",
      }}>
        <UPTIcon name="map-pin" size={16} color="var(--accent)" />
        <span>Udupi</span>
        {crumbGroup && <><UPTIcon name="chevron-right" size={14} color="var(--grey-400)" /><span style={{ color: crumbArea ? "var(--text-muted)" : "var(--text-strong)" }}>{crumbGroup}</span></>}
        {crumbArea && <><UPTIcon name="chevron-right" size={14} color="var(--grey-400)" /><span style={{ color: "var(--copper-600)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{crumbArea}</span></>}
      </div>

      {/* Legend — bottom left, above attribution */}
      <div style={{
        position: "absolute", bottom: "44px", left: "18px", zIndex: 500,
        display: "flex", flexDirection: "column", gap: "8px", padding: "11px 13px",
        background: "rgba(255,255,255,0.92)", backdropFilter: "blur(6px)",
        borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border)",
        fontFamily: "var(--font-sans)", fontSize: "12px", color: "var(--text-body)",
      }}>
        {!selectedGroup && !selectedArea && (
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "11px", height: "11px", borderRadius: "var(--radius-full)", background: "var(--navy-800)" }} />Neighbourhood groups
          </span>
        )}
        {selectedGroup && !selectedArea && (
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "11px", height: "11px", borderRadius: "var(--radius-full)", border: "1px solid var(--copper-500)", background: "var(--paper)" }} />Areas
          </span>
        )}
        {selectedArea && (
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "11px", height: "11px", borderRadius: "var(--radius-full)", background: "var(--accent)" }} />Homes
          </span>
        )}
      </div>

      {/* Summary pill — bottom center */}
      <div style={{
        position: "absolute", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 500,
        display: "flex", alignItems: "center", gap: "8px", padding: "9px 16px",
        background: "var(--paper)", borderRadius: "var(--radius-full)",
        boxShadow: "var(--shadow-md)", border: "1px solid var(--border)",
        fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--text-body)", whiteSpace: "nowrap",
      }}>
        <UPTIcon name="map-pin" size={15} color="var(--accent)" />
        Showing <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-strong)" }}>{totalCount}</span> {totalCount === 1 ? "property" : "properties"}
      </div>
    </div>
  );
}

window.UPTAreaMap = UPTAreaMap;

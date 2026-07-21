// Bangalore SCHOOL-FIRST discovery — Leaflet map. Exports window.BLRSchoolMap
// Scoped navigation — the map ALWAYS mirrors the right panel's level:
//   city   → macro REGION bubbles
//   region → all school pins in the region (overview)
//   zones  → school-ZONE group bubbles
//   zone   → AREA bubbles inside the zone
//   area   → SCHOOL pins in that area only
//   school → selected school + radius ring + nearby home pins
const { Icon: BIcon } = window.ReTrendsDesignSystem_f37966;
const C = window.BLR_SCHOOL_COUNTS;

function fmtPriceShort(p) {
  return p >= 10000000 ? `₹${(p / 10000000).toFixed(2)} Cr` : `₹${(p / 100000).toFixed(0)} L`;
}

function regionBubbleHTML(r, count, selected) {
  const bg = selected ? "var(--navy-900)" : "rgba(27,42,69,0.95)";
  return `
  <div style="transform:translate(-50%,-50%);font-family:var(--font-sans);text-align:center;">
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;
      width:88px;height:88px;border-radius:var(--radius-full);background:${bg};color:#fff;
      box-shadow:var(--shadow-lg);border:2px solid rgba(255,255,255,0.5);
      transform:scale(${selected ? 1.06 : 1});transition:all .15s cubic-bezier(.4,0,.2,1);">
      <span style="font-family:var(--font-mono);font-size:19px;font-weight:700;line-height:1;">${count}</span>
      <span style="font-size:10.5px;font-weight:700;letter-spacing:-0.01em;">schools</span>
      <span style="font-size:10px;font-weight:600;opacity:.8;">${r.short}</span>
    </div>
  </div>`;
}

function zoneBubbleHTML(z, count, selected) {
  const bg = selected ? "var(--navy-900)" : "rgba(27,42,69,0.95)";
  return `
  <div style="transform:translate(-50%,-50%);font-family:var(--font-sans);">
    <div style="display:inline-flex;align-items:center;gap:9px;padding:8px 14px;border-radius:var(--radius-full);
      background:${bg};color:#fff;box-shadow:var(--shadow-lg);white-space:nowrap;border:1.5px solid rgba(255,255,255,0.45);
      transform:scale(${selected ? 1.06 : 1});transition:all .15s cubic-bezier(.4,0,.2,1);">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 10-10-5L2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>
      <span style="font-size:13px;font-weight:700;letter-spacing:-0.01em;">${z.name}</span>
      <span style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,0.7);">${count}</span>
    </div>
  </div>`;
}

function areaPinHTML(a, schools, homes, selected) {
  const bg = selected ? "var(--navy-800)" : "var(--paper)";
  const fg = selected ? "#fff" : "var(--navy-800)";
  const sub = selected ? "rgba(255,255,255,0.7)" : "var(--text-muted)";
  const border = selected ? "none" : "1px solid var(--border)";
  const shadow = selected ? "var(--shadow-lg)" : "var(--shadow-md)";
  return `
  <div style="transform:translate(-50%,-100%);font-family:var(--font-sans);">
    <div style="display:inline-flex;align-items:center;gap:8px;padding:7px 13px;border-radius:var(--radius-full);
      background:${bg};color:${fg};box-shadow:${shadow};border:${border};white-space:nowrap;
      transition:all .15s cubic-bezier(.4,0,.2,1);transform:scale(${selected ? 1.06 : 1});">
      <span style="font-size:13px;font-weight:700;letter-spacing:-0.01em;">${a.name}</span>
      <span style="display:inline-flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:11px;color:${sub};">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${selected ? '#fff' : 'var(--plum-500)'}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m22 10-10-5L2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>${schools}
      </span>
    </div>
    <div style="width:10px;height:10px;background:${bg};border-right:${border};border-bottom:${border};
      transform:rotate(45deg);margin:-6px auto 0;box-shadow:${shadow};"></div>
  </div>`;
}

function schoolPinHTML(s, selected) {
  const bg = selected ? "var(--plum-600)" : "var(--paper)";
  const fg = selected ? "#fff" : "var(--navy-800)";
  const shadow = selected ? "var(--shadow-lg)" : "var(--shadow-sm)";
  const border = selected ? "none" : "1px solid var(--border)";
  const label = s.name.split(",")[0];
  return `
  <div style="transform:translate(-50%,-100%);font-family:var(--font-sans);">
    <div style="display:inline-flex;align-items:center;gap:7px;padding:6px 11px;border-radius:var(--radius-full);
      background:${bg};color:${fg};box-shadow:${shadow};border:${border};white-space:nowrap;
      transition:all .15s cubic-bezier(.4,0,.2,1);transform:scale(${selected ? 1.06 : 1});max-width:230px;">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${selected ? '#fff' : 'var(--plum-600)'}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;"><path d="m22 10-10-5L2 10l10 5 10-5z"/><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5"/></svg>
      <span style="font-size:12.5px;font-weight:700;letter-spacing:-0.01em;overflow:hidden;text-overflow:ellipsis;">${label}</span>
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

function BLRSchoolMap({ step, regions, zones, areas, schools, listings, selectedRegion, selectedZone, selectedArea, selectedSchool, radiusKm, activeListing, totalCount, onPickRegion, onPickZone, onPickArea, onPickSchool }) {
  const elRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const layerRef = React.useRef(null);
  const ringRef = React.useRef(null);

  React.useEffect(() => {
    if (mapRef.current || !window.L) return;
    const D = window.BLR_SCHOOL_DATA;
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
    if (ringRef.current) { map.removeLayer(ringRef.current); ringRef.current = null; }
    const D = window.BLR_SCHOOL_DATA;

    // ---- SCHOOL selected: marker + radius ring + nearby home pins ----
    if (step === "school" && selectedSchool) {
      const s = schools.find((x) => x.id === selectedSchool);
      if (s) {
        if (typeof radiusKm === "number") {
          ringRef.current = window.L.circle([s.lat, s.lon], {
            radius: radiusKm * 1000, color: "var(--plum-500)", weight: 1.5, opacity: 0.6,
            fillColor: "var(--plum-500)", fillOpacity: 0.08, dashArray: "4 5",
          }).addTo(map);
        }
        listings.forEach((l) => {
          if (l.lat == null || l.lon == null) return;
          window.L.marker([l.lat, l.lon], { icon: makeIcon(homePinHTML(l, l.id === activeListing)) }).addTo(group);
        });
        window.L.marker([s.lat, s.lon], { icon: makeIcon(schoolPinHTML(s, true)), zIndexOffset: 1000 }).addTo(group);
        if (ringRef.current) { try { map.flyToBounds(ringRef.current.getBounds(), { padding: [50, 50], duration: 0.7 }); } catch (e) { map.flyTo([s.lat, s.lon], 13, { duration: 0.7 }); } }
        else map.flyTo([s.lat, s.lon], 13, { duration: 0.7 });
      }
      return;
    }

    // ---- AREA selected: school pins in the area only ----
    if (step === "area" && selectedArea) {
      const a = areas.find((x) => x.id === selectedArea);
      if (a) {
        schools.filter((s) => s.areaId === selectedArea).forEach((s) => {
          window.L.marker([s.lat, s.lon], { icon: makeIcon(schoolPinHTML(s, s.id === selectedSchool)), zIndexOffset: 800 })
            .on("click", () => onPickSchool && onPickSchool(s.id)).addTo(group);
        });
        try { map.flyToBounds(a.bounds, { padding: [60, 60], duration: 0.7, maxZoom: 15 }); }
        catch (e) { map.flyTo([a.lat, a.lon], 14, { duration: 0.7 }); }
      }
      return;
    }

    // ---- ZONE selected: area bubbles inside the zone ----
    if (step === "zone" && selectedZone) {
      const z = zones.find((x) => x.id === selectedZone);
      if (z) {
        areas.filter((a) => a.zone === selectedZone).forEach((a) => {
          window.L.marker([a.lat, a.lon], { icon: makeIcon(areaPinHTML(a, C.schoolsArea(a.id), C.homesArea(a.id), a.id === selectedArea)), zIndexOffset: 900 })
            .on("click", () => onPickArea && onPickArea(a.id)).addTo(group);
        });
        try { map.flyToBounds(z.bounds, { padding: [70, 70], duration: 0.7, maxZoom: 13 }); }
        catch (e) { map.flyTo([z.center.lat, z.center.lon], 12, { duration: 0.7 }); }
      }
      return;
    }

    // ---- SEARCH NEAR SCHOOL (zones): zone group bubbles inside the region ----
    if (step === "zones" && selectedRegion) {
      const r = regions.find((x) => x.id === selectedRegion);
      zones.filter((z) => z.region === selectedRegion).forEach((z) => {
        window.L.marker([z.center.lat, z.center.lon], { icon: makeIcon(zoneBubbleHTML(z, C.schoolsZone(z.id), z.id === selectedZone)) })
          .on("click", () => onPickZone && onPickZone(z.id)).addTo(group);
      });
      if (r) { try { map.flyToBounds(r.bounds, { padding: [70, 70], duration: 0.7, maxZoom: 12 }); } catch (e) { map.flyTo([r.center.lat, r.center.lon], 11, { duration: 0.7 }); } }
      return;
    }

    // ---- REGION selected: all school pins in the region (overview) ----
    if (step === "region" && selectedRegion) {
      const r = regions.find((x) => x.id === selectedRegion);
      schools.filter((s) => s.region === selectedRegion).forEach((s) => {
        window.L.marker([s.lat, s.lon], { icon: makeIcon(schoolPinHTML(s, false)), zIndexOffset: 700 })
          .on("click", () => onPickSchool && onPickSchool(s.id)).addTo(group);
      });
      if (r) { try { map.flyToBounds(r.bounds, { padding: [70, 70], duration: 0.7, maxZoom: 12 }); } catch (e) { map.flyTo([r.center.lat, r.center.lon], 11, { duration: 0.7 }); } }
      return;
    }

    // ---- CITY landing: macro region bubbles ----
    regions.forEach((r) => {
      window.L.marker([r.center.lat, r.center.lon], { icon: makeIcon(regionBubbleHTML(r, C.schoolsRegion(r.id), r.id === selectedRegion)) })
        .on("click", () => onPickRegion && onPickRegion(r.id)).addTo(group);
    });
    map.flyTo([D.city.lat, D.city.lon], D.city.zoom, { duration: 0.5 });
  }

  const regionObj = selectedRegion && regions.find((r) => r.id === selectedRegion);
  const zoneObj = selectedZone && zones.find((z) => z.id === selectedZone);
  const areaObj = selectedArea && areas.find((a) => a.id === selectedArea);
  const schoolObj = selectedSchool && schools.find((s) => s.id === selectedSchool);

  const legend = {
    city: { dot: "var(--navy-800)", text: "Regions" },
    region: { dot: "var(--plum-500)", text: "Schools", ring: true },
    zones: { dot: "var(--navy-800)", text: "School zones" },
    zone: { dot: "var(--plum-500)", text: "Areas", ring: true },
    area: { dot: "var(--plum-500)", text: "Schools", ring: true },
    school: { dot: "var(--accent)", text: "Homes" },
  }[step] || { dot: "var(--navy-800)", text: "Regions" };

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
        <BIcon name="map-pin" size={16} color="var(--plum-600)" />
        <span>Bangalore</span>
        {regionObj && <><BIcon name="chevron-right" size={14} color="var(--grey-400)" /><span style={{ color: (zoneObj || areaObj || schoolObj) ? "var(--text-muted)" : "var(--text-strong)" }}>{regionObj.short}</span></>}
        {areaObj && <><BIcon name="chevron-right" size={14} color="var(--grey-400)" /><span style={{ color: schoolObj ? "var(--text-muted)" : "var(--text-strong)" }}>{areaObj.name}</span></>}
        {!areaObj && zoneObj && <><BIcon name="chevron-right" size={14} color="var(--grey-400)" /><span style={{ color: "var(--text-strong)" }}>{zoneObj.name}</span></>}
        {schoolObj && <><BIcon name="chevron-right" size={14} color="var(--grey-400)" /><span style={{ color: "var(--plum-600)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{schoolObj.name.split(",")[0]}</span></>}
      </div>

      {/* Legend */}
      <div style={{
        position: "absolute", bottom: "44px", left: "18px", zIndex: 500,
        display: "flex", flexDirection: "column", gap: "8px", padding: "11px 13px",
        background: "rgba(255,255,255,0.92)", backdropFilter: "blur(6px)",
        borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border)",
        fontFamily: "var(--font-sans)", fontSize: "12px", color: "var(--text-body)",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "11px", height: "11px", borderRadius: "var(--radius-full)", background: legend.ring ? "var(--paper)" : legend.dot, border: legend.ring ? `1px solid ${legend.dot}` : "none" }} />{legend.text}
        </span>
        {step === "school" && (
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "11px", height: "11px", borderRadius: "var(--radius-full)", border: "1.5px dashed var(--plum-500)", background: "transparent" }} />{radiusKm} km radius
          </span>
        )}
      </div>

      {/* Summary pill */}
      <div style={{
        position: "absolute", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 500,
        display: "flex", alignItems: "center", gap: "8px", padding: "9px 16px",
        background: "var(--paper)", borderRadius: "var(--radius-full)",
        boxShadow: "var(--shadow-md)", border: "1px solid var(--border)",
        fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--text-body)", whiteSpace: "nowrap",
      }}>
        <BIcon name={step === "school" ? "map-pin" : "building"} size={15} color={step === "school" ? "var(--accent)" : "var(--plum-600)"} />
        Showing <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-strong)" }}>{totalCount}</span> {step === "school" ? (totalCount === 1 ? "home" : "homes") : (totalCount === 1 ? "school" : "schools")}
      </div>
    </div>
  );
}

window.BLRSchoolMap = BLRSchoolMap;

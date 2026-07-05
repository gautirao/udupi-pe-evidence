// Bangalore AREA-FIRST discovery — Leaflet map. Exports window.BLRAreaMap
// Scoped navigation: the map ALWAYS shows the same level as the right panel.
//   city   → macro REGION bubbles (5 max)
//   region → top hotspot AREA bubbles (3–5) + "+ more" indicator
//   groups → area GROUP/ZONE bubbles inside the region
//   group  → individual AREA bubbles inside the group
//   area   → residential listing price pins
const { Icon: BIcon } = window.ReTrendsDesignSystem_f37966;
const COUNTS = window.BLR_AREA_COUNTS;

function fmtPriceShort(p) {
  return p >= 10000000 ? `₹${(p / 10000000).toFixed(2)} Cr` : `₹${(p / 100000).toFixed(0)} L`;
}

// Big macro-region bubble (city landing) — navy circle, total property count.
function regionBubbleHTML(r, count, selected) {
  const bg = selected ? "var(--navy-900)" : "rgba(27,42,69,0.95)";
  return `
  <div style="transform:translate(-50%,-50%);font-family:var(--font-sans);text-align:center;">
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;
      width:88px;height:88px;border-radius:var(--radius-full);background:${bg};color:#fff;
      box-shadow:var(--shadow-lg);border:2px solid rgba(255,255,255,0.5);
      transform:scale(${selected ? 1.06 : 1});transition:all .15s cubic-bezier(.4,0,.2,1);">
      <span style="font-family:var(--font-mono);font-size:19px;font-weight:700;line-height:1;">${count}</span>
      <span style="font-size:11px;font-weight:700;letter-spacing:-0.01em;">${r.short}</span>
    </div>
  </div>`;
}

// Zone / group bubble (search-by-area level) — navy pill with home count.
function groupPinHTML(g, count, selected) {
  const bg = selected ? "var(--navy-900)" : "rgba(27,42,69,0.95)";
  return `
  <div style="transform:translate(-50%,-50%);font-family:var(--font-sans);">
    <div style="display:inline-flex;align-items:center;gap:9px;padding:8px 14px;border-radius:var(--radius-full);
      background:${bg};color:#fff;box-shadow:var(--shadow-lg);white-space:nowrap;border:1.5px solid rgba(255,255,255,0.45);
      transform:scale(${selected ? 1.06 : 1});transition:all .15s cubic-bezier(.4,0,.2,1);">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/></svg>
      <span style="font-size:13px;font-weight:700;letter-spacing:-0.01em;">${g.name}</span>
      <span style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,0.7);">${count}</span>
    </div>
  </div>`;
}

// Area marker — paper pill with home count (copper pin). Maps 1:1 to area cards.
function areaPinHTML(a, count, selected) {
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
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${pinColor}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>${count}
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

const HOTSPOT_MAX = 4; // top areas shown on region-level map

function BLRAreaMap({ step, regions, groups, areas, listings, selectedRegion, selectedGroup, selectedArea, activeListing, totalCount, moreAreas, onPickRegion, onPickGroup, onPickArea }) {
  const elRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const layerRef = React.useRef(null);

  React.useEffect(() => {
    if (mapRef.current || !window.L) return;
    const D = window.BLR_AREA_DATA;
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
    const D = window.BLR_AREA_DATA;

    // ---- AREA selected: listing price pins fitted to the area ----
    if (step === "area" && selectedArea) {
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

    // ---- GROUP selected: individual area bubbles inside the group ----
    if (step === "group" && selectedGroup) {
      const g = groups.find((x) => x.id === selectedGroup);
      if (g) {
        areas.filter((a) => a.group === selectedGroup).forEach((a) => {
          window.L.marker([a.lat, a.lon], { icon: makeIcon(areaPinHTML(a, COUNTS.area(a.id), a.id === selectedArea)), zIndexOffset: 900 })
            .on("click", () => onPickArea && onPickArea(a.id)).addTo(group);
        });
        try { map.flyToBounds(g.bounds, { padding: [70, 70], duration: 0.7, maxZoom: 14 }); }
        catch (e) { map.flyTo([g.center.lat, g.center.lon], 12, { duration: 0.7 }); }
      }
      return;
    }

    // ---- SEARCH BY AREA (groups): group/zone bubbles inside the region ----
    if (step === "groups" && selectedRegion) {
      const r = regions.find((x) => x.id === selectedRegion);
      groups.filter((g) => g.region === selectedRegion).forEach((g) => {
        window.L.marker([g.center.lat, g.center.lon], { icon: makeIcon(groupPinHTML(g, COUNTS.group(g.id), g.id === selectedGroup)) })
          .on("click", () => onPickGroup && onPickGroup(g.id)).addTo(group);
      });
      if (r) { try { map.flyToBounds(r.bounds, { padding: [70, 70], duration: 0.7, maxZoom: 12 }); } catch (e) { map.flyTo([r.center.lat, r.center.lon], 11, { duration: 0.7 }); } }
      return;
    }

    // ---- REGION selected: top hotspot area bubbles (max HOTSPOT_MAX) ----
    if (step === "region" && selectedRegion) {
      const r = regions.find((x) => x.id === selectedRegion);
      const regAreas = areas.filter((a) => a.region === selectedRegion)
        .map((a) => ({ a, c: COUNTS.area(a.id) }))
        .sort((x, y) => y.c - x.c)
        .slice(0, HOTSPOT_MAX);
      regAreas.forEach(({ a, c }) => {
        window.L.marker([a.lat, a.lon], { icon: makeIcon(areaPinHTML(a, c, false)), zIndexOffset: 900 })
          .on("click", () => onPickArea && onPickArea(a.id)).addTo(group);
      });
      if (r) { try { map.flyToBounds(r.bounds, { padding: [70, 70], duration: 0.7, maxZoom: 12 }); } catch (e) { map.flyTo([r.center.lat, r.center.lon], 11, { duration: 0.7 }); } }
      return;
    }

    // ---- CITY landing: macro region bubbles ----
    regions.forEach((r) => {
      window.L.marker([r.center.lat, r.center.lon], { icon: makeIcon(regionBubbleHTML(r, COUNTS.region(r.id), r.id === selectedRegion)) })
        .on("click", () => onPickRegion && onPickRegion(r.id)).addTo(group);
    });
    map.flyTo([D.city.lat, D.city.lon], D.city.zoom, { duration: 0.5 });
  }

  // ---- breadcrumb pieces ----
  const regionObj = selectedRegion && regions.find((r) => r.id === selectedRegion);
  const groupObj = selectedGroup && groups.find((g) => g.id === selectedGroup);
  const areaObj = selectedArea && areas.find((a) => a.id === selectedArea);

  // legend label by step
  const legend = {
    city: { dot: "var(--navy-800)", text: "Regions" },
    region: { dot: "var(--copper-500)", text: "Top areas", ring: true },
    groups: { dot: "var(--navy-800)", text: "Area groups" },
    group: { dot: "var(--copper-500)", text: "Areas", ring: true },
    area: { dot: "var(--accent)", text: "Listings" },
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
        <BIcon name="map-pin" size={16} color="var(--accent)" />
        <span>Bangalore</span>
        {regionObj && <><BIcon name="chevron-right" size={14} color="var(--grey-400)" /><span style={{ color: (groupObj || areaObj) ? "var(--text-muted)" : "var(--text-strong)" }}>{regionObj.short}</span></>}
        {groupObj && <><BIcon name="chevron-right" size={14} color="var(--grey-400)" /><span style={{ color: areaObj ? "var(--text-muted)" : "var(--text-strong)" }}>{groupObj.name}</span></>}
        {areaObj && <><BIcon name="chevron-right" size={14} color="var(--grey-400)" /><span style={{ color: "var(--copper-600)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{areaObj.name}</span></>}
      </div>

      {/* "+ more areas" indicator — region level only */}
      {step === "region" && moreAreas > 0 && (
        <div style={{
          position: "absolute", top: "18px", right: "18px", zIndex: 500,
          display: "flex", alignItems: "center", gap: "6px", padding: "8px 13px",
          background: "var(--paper)", borderRadius: "var(--radius-full)",
          boxShadow: "var(--shadow-sm)", border: "1px solid var(--border)",
          fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap",
        }}>
          <BIcon name="plus" size={13} color="var(--grey-400)" />{moreAreas} more {moreAreas === 1 ? "area" : "areas"} — search by area
        </div>
      )}

      {/* Legend — bottom left, above attribution */}
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
      </div>

      {/* Summary pill — bottom center */}
      <div style={{
        position: "absolute", bottom: "20px", left: "50%", transform: "translateX(-50%)", zIndex: 500,
        display: "flex", alignItems: "center", gap: "8px", padding: "9px 16px",
        background: "var(--paper)", borderRadius: "var(--radius-full)",
        boxShadow: "var(--shadow-md)", border: "1px solid var(--border)",
        fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--text-body)", whiteSpace: "nowrap",
      }}>
        <BIcon name="map-pin" size={15} color="var(--accent)" />
        Showing <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-strong)" }}>{totalCount.toLocaleString("en-IN")}</span> {totalCount === 1 ? "property" : "properties"}
      </div>
    </div>
  );
}

window.BLRAreaMap = BLRAreaMap;

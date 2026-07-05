// School-first selected-zone — Leaflet map. Exports window.UPTZMap
// Calm CARTO Voyager tiles. The selected zone is drawn as a soft tinted
// boundary; areas are markers; the active area gets a copper focus ring; homes
// drop as price pins synced to the panel.
const { Icon: ZMIcon } = window.ReTrendsDesignSystem_f37966;
const ZJOURNEY = "#5B4FA0";

function fmtPriceShort(p) {
  return p >= 10000000 ? `₹${(p / 10000000).toFixed(2)} Cr` : `₹${(p / 100000).toFixed(0)} L`;
}

function areaPinHTML(area, selected, dim) {
  const empty = area.listings === 0;
  const bg = selected ? "var(--navy-800)" : "var(--paper)";
  const fg = selected ? "#fff" : "var(--text-strong)";
  const sub = selected ? "rgba(255,255,255,0.7)" : "var(--text-muted)";
  const border = selected ? "1.5px solid rgba(255,255,255,0.4)" : "1px solid var(--border)";
  const shadow = selected ? "var(--shadow-lg)" : "var(--shadow-md)";
  return `
  <div style="transform:translate(-50%,-100%);font-family:var(--font-sans);opacity:${dim ? 0.55 : 1};transition:opacity .2s;">
    <div style="display:inline-flex;align-items:center;gap:9px;padding:7px 12px;border-radius:var(--radius-full);
      background:${bg};color:${fg};box-shadow:${shadow};border:${border};white-space:nowrap;
      transition:all .15s cubic-bezier(.4,0,.2,1);transform:scale(${selected ? 1.05 : 1});">
      <span style="font-size:13.5px;font-weight:700;letter-spacing:-0.01em;">${area.name}</span>
      <span style="display:inline-flex;align-items:center;gap:4px;font-family:var(--font-mono);font-size:11px;color:${selected ? '#fff' : ZJOURNEY};">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${selected ? '#fff' : ZJOURNEY}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        ${area.schools}</span>
      <span style="font-family:var(--font-mono);font-size:11px;color:${sub};">${empty ? '0 homes' : area.listings + ' homes'}</span>
    </div>
    <div style="width:9px;height:9px;background:${bg};border-right:${border};border-bottom:${border};
      transform:rotate(45deg);margin:-5px auto 0;box-shadow:${shadow};"></div>
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

function UPTZMap({ view, selectedArea, activeListing, onPickArea }) {
  const D = window.UPTZ_DATA;
  const elRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const layerRef = React.useRef(null);
  const shapeRef = React.useRef(null);
  const ringRef = React.useRef(null);

  React.useEffect(() => {
    if (mapRef.current || !window.L) return;
    const map = window.L.map(elRef.current, {
      center: [D.zone.center.lat, D.zone.center.lon], zoom: D.city.zoom,
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

  function makeIcon(html) { return window.L.divIcon({ html, className: "uptz-pin", iconSize: [1, 1] }); }

  function redraw() {
    const map = mapRef.current, group = layerRef.current;
    if (!map || !group) return;
    group.clearLayers();
    if (shapeRef.current) { map.removeLayer(shapeRef.current); shapeRef.current = null; }
    if (ringRef.current) { map.removeLayer(ringRef.current); ringRef.current = null; }

    const areaObj = selectedArea && D.areas.find((a) => a.id === selectedArea);
    const listings = D.listings; // all 8 are in Manipal

    // --- always: soft zone boundary ---
    shapeRef.current = window.L.rectangle(D.zone.bounds, {
      color: "var(--navy-800)", weight: 1.5, opacity: 0.35, dashArray: "6 5",
      fillColor: "var(--navy-800)", fillOpacity: 0.04,
    }).addTo(map);

    if (view === "area" && areaObj) {
      // focus ring on the selected area
      ringRef.current = window.L.circle([areaObj.center.lat, areaObj.center.lon], {
        radius: 1300, color: "var(--accent)", weight: 1.5, opacity: 0.5,
        fillColor: "var(--copper-500)", fillOpacity: 0.07,
      }).addTo(map);
      // area markers — selected one highlighted, other dimmed
      D.areas.forEach((a) => {
        window.L.marker([a.center.lat, a.center.lon], {
          icon: makeIcon(areaPinHTML(a, a.id === selectedArea, a.id !== selectedArea)),
          zIndexOffset: a.id === selectedArea ? 1000 : 0,
        }).on("click", () => onPickArea && onPickArea(a.id)).addTo(group);
      });
      // home pins for the selected area
      listings.filter((l) => l.area.toLowerCase() === areaObj.name.toLowerCase()).forEach((l) => {
        window.L.marker([l.lat, l.lon], { icon: makeIcon(homePinHTML(l, l.id === activeListing)) }).addTo(group);
      });
      try { map.flyToBounds(areaObj.bounds, { padding: [70, 70], duration: 0.7, maxZoom: 15 }); } catch (e) {}
      return;
    }

    if (view === "zone-all") {
      // all area markers (subtle) + all home pins across the zone
      D.areas.forEach((a) => {
        window.L.marker([a.center.lat, a.center.lon], { icon: makeIcon(areaPinHTML(a, false, true)) })
          .on("click", () => onPickArea && onPickArea(a.id)).addTo(group);
      });
      listings.forEach((l) => {
        window.L.marker([l.lat, l.lon], { icon: makeIcon(homePinHTML(l, l.id === activeListing)) }).addTo(group);
      });
      try { map.flyToBounds(D.zone.bounds, { padding: [60, 60], duration: 0.7, maxZoom: 14 }); } catch (e) {}
      return;
    }

    // --- default: zone landing — show area markers, no homes ---
    D.areas.forEach((a) => {
      window.L.marker([a.center.lat, a.center.lon], { icon: makeIcon(areaPinHTML(a, false, false)), zIndexOffset: 500 })
        .on("click", () => onPickArea && onPickArea(a.id)).addTo(group);
    });
    try { map.flyToBounds(D.zone.bounds, { padding: [70, 70], duration: 0.6, maxZoom: 14 }); } catch (e) {}
  }

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0 }} />

      {/* Zone chip — top left */}
      <div style={{
        position: "absolute", top: "18px", left: "18px", zIndex: 500,
        display: "flex", alignItems: "center", gap: "10px", padding: "10px 14px",
        background: "var(--paper)", borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-md)", border: "1px solid var(--border)",
      }}>
        <div style={{
          width: "30px", height: "30px", borderRadius: "var(--radius-md)", background: "var(--navy-800)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <ZMIcon name="layers" size={16} color="#fff" />
        </div>
        <div style={{ lineHeight: 1.15 }}>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "14px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em" }}>{D.zone.name}</div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: "11px", color: "var(--text-muted)" }}>{D.zone.subtitle}</div>
        </div>
      </div>

      {/* Legend — bottom left, above attribution */}
      <div style={{
        position: "absolute", bottom: "44px", left: "18px", zIndex: 500,
        display: "flex", flexDirection: "column", gap: "8px", padding: "11px 13px",
        background: "rgba(255,255,255,0.92)", backdropFilter: "blur(6px)",
        borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-sm)", border: "1px solid var(--border)",
        fontFamily: "var(--font-sans)", fontSize: "12px", color: "var(--text-body)",
      }}>
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "11px", height: "11px", borderRadius: "var(--radius-full)", border: "1px solid var(--border)", background: "var(--paper)" }} />Areas
        </span>
        {(view === "area" || view === "zone-all") && (
          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "11px", height: "11px", borderRadius: "var(--radius-full)", background: "var(--accent)" }} />Homes
          </span>
        )}
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ width: "11px", height: "11px", borderRadius: "3px", border: "1.5px dashed var(--navy-800)", opacity: 0.5 }} />Zone
        </span>
      </div>
    </div>
  );
}

window.UPTZMap = UPTZMap;

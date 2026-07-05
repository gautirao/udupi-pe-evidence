// Udupi Property Tracker — AREA-FIRST › University Belt › Manipal RESULTS map.
// Exports window.UPTManipalMap.
//
// Map focused on MANIPAL, showing the verified properties as premium price
// pills. A soft copper ring marks the Manipal locality context. Hover/selected
// is two-way linked with the result cards: hovering a card lifts its marker and
// vice-versa; a selected listing fills ink-navy. Recognisable nearby places
// (Parkala, Udupi City, Katapadi) are faint ghost labels for orientation only.
const { Icon: MMapIcon, TrustBadge: MMapTrustBadge } = window.ReTrendsDesignSystem_f37966;

const MM_PIN = (c) => `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;

// Per-type visual identity: distinct colour + distinct glyph, shared by markers + legend.
const MM_TYPE = {
  Apartment: {
    label: "Apartments", color: "var(--navy-700)",
    glyph: (c) => `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/></svg>`,
  },
  Villa: {
    label: "Villas", color: "var(--copper-600)",
    glyph: (c) => `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-5h4v5"/></svg>`,
  },
  Plot: {
    label: "Plots / land", color: "var(--evergreen-600)",
    glyph: (c) => `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16v16H4z" stroke-dasharray="3 3"/><path d="M9 15l2.5-3 2 2.2L16 9"/></svg>`,
  },
};

// Premium price-pill marker for one property — leads with a type-coloured glyph disc.
function mmPillHTML(p, active, selected) {
  const t = MM_TYPE[p.type] || MM_TYPE.Apartment;
  const bg = selected ? "var(--navy-800)" : "var(--paper)";
  const fg = selected ? "#fff" : "var(--text-strong)";
  const border = selected ? "none" : (active ? "1px solid var(--accent)" : "1px solid var(--border)");
  const shadow = active || selected ? "var(--shadow-lg)" : "var(--shadow-md)";
  const scale = selected ? 1.09 : active ? 1.05 : 1;
  // Glyph disc: type colour fill always (so type reads at a glance); on selected, lighten the disc to stay legible on navy.
  const discBg = selected ? "rgba(255,255,255,0.18)" : t.color;
  const glyphColor = "#fff";
  return `
  <div style="transform:translate(-50%,-118%);font-family:var(--font-sans);transition:opacity .18s;">
    <div style="display:inline-flex;align-items:center;gap:7px;padding:5px 12px 5px 5px;border-radius:var(--radius-full);
      background:${bg};border:${border};box-shadow:${shadow};white-space:nowrap;transform:scale(${scale});
      transition:transform .15s cubic-bezier(.4,0,.2,1),box-shadow .15s;cursor:pointer;">
      <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:${discBg};flex:none;">${t.glyph(glyphColor)}</span>
      <span style="font-family:var(--font-mono);font-size:12.5px;font-weight:700;letter-spacing:-0.01em;color:${fg};padding-right:2px;">${p.priceLabel}</span>
    </div>
    <div style="width:8px;height:8px;background:${bg};border-right:${border};border-bottom:${border};transform:rotate(45deg);margin:-5px auto 0;box-shadow:${shadow};"></div>
  </div>`;
}

// Faint orientation label for a recognisable nearby place (outside Manipal).
function mmGhostHTML(a) {
  return `
  <div style="transform:translate(-50%,-50%);font-family:var(--font-sans);opacity:0.5;">
    <div style="display:inline-flex;align-items:center;gap:5px;white-space:nowrap;cursor:default;">
      <span style="width:5px;height:5px;border-radius:50%;background:var(--grey-400);"></span>
      <span style="font-size:11px;font-weight:600;color:var(--grey-500);">${a.name}</span>
    </div>
  </div>`;
}

// Compact listing preview shown when a marker is selected. Pinned to a free
// corner (desktop top-right / mobile bottom sheet) so it never sits on top of
// the other markers. Cleared on close, on a different marker, on empty-map
// click, and on zoom — all handled by the parent's selectedId.
function MapPreviewCard({ p, compact, onClose }) {
  const t = MM_TYPE[p.type] || MM_TYPE.Apartment;
  const isResidential = p.beds != null;
  const pos = compact
    ? { left: "12px", right: "12px", bottom: "16px", animation: "uptPreviewInUp .24s cubic-bezier(.2,.7,.3,1)" }
    : { top: "18px", right: "18px", width: "332px", animation: "uptPreviewInDown .24s cubic-bezier(.2,.7,.3,1)" };
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: "absolute", zIndex: 600, ...pos,
        background: "var(--paper)", borderRadius: "var(--radius-lg)", boxShadow: "var(--shadow-xl)",
        border: "1px solid var(--border)", overflow: "hidden", fontFamily: "var(--font-sans)", display: "flex",
      }}>
      {/* Thumbnail */}
      <div style={{ position: "relative", width: "110px", flex: "none", background: "var(--surface-muted)", overflow: "hidden" }}>
        {p.image ? (
          <img src={p.image} alt={p.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(150deg, var(--canvas-200), var(--accent-tint))" }}>
            <MMapIcon name="building" size={22} color="var(--copper-500)" />
          </div>
        )}
        <div style={{ position: "absolute", top: "8px", left: "8px" }}><MMapTrustBadge tier={p.trustTier} size="sm" /></div>
      </div>
      {/* Details */}
      <div style={{ flex: 1, minWidth: 0, padding: "12px 14px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "8px" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: "18px", fontWeight: 600, letterSpacing: "-0.01em", color: "var(--text-strong)" }}>{p.priceLabel}</span>
          <button onClick={onClose} aria-label="Close preview" style={{
            flex: "none", width: "26px", height: "26px", marginRight: "-4px", marginTop: "-2px", borderRadius: "var(--radius-full)",
            border: "none", background: "var(--surface-subtle)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <MMapIcon name="x" size={14} color="var(--text-muted)" />
          </button>
        </div>
        <h3 style={{ margin: "4px 0 3px", fontSize: "14px", fontWeight: 700, lineHeight: 1.25, color: "var(--text-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "var(--text-muted)", marginBottom: "10px", minWidth: 0 }}>
          <MMapIcon name="map-pin" size={12} color="var(--grey-400)" />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.locality}, Manipal</span>
        </div>
        <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "10px", fontSize: "12px", fontWeight: 600, color: "var(--text-body)", minWidth: 0, overflow: "hidden" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: t.color, flex: "none" }} />{p.type}
            </span>
            <span style={{ whiteSpace: "nowrap", color: "var(--text-muted)" }}>{isResidential ? p.beds + " BHK" : p.sqft.toLocaleString("en-IN") + " sq ft"}</span>
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12.5px", fontWeight: 700, color: "var(--accent)", whiteSpace: "nowrap", flex: "none" }}>
            View<MMapIcon name="arrow-right" size={14} color="var(--accent)" />
          </span>
        </div>
      </div>
    </div>
  );
}

function UPTManipalMap({ properties, loading, compact, hoverId, selectedId, onHover, onSelect }) {
  const D = window.UPT_MANIPAL;
  const elRef = React.useRef(null);
  const mapRef = React.useRef(null);
  const layerRef = React.useRef(null);
  const ringRef = React.useRef(null);
  const labelRef = React.useRef(null);
  const onSelectRef = React.useRef(onSelect);
  onSelectRef.current = onSelect;

  const selectedProp = React.useMemo(
    () => properties.find((p) => p.id === selectedId) || null,
    [properties, selectedId]
  );
  const previewOpen = !loading && !!selectedProp;

  const shown = properties.length;

  React.useEffect(() => {
    if (mapRef.current || !window.L) return;
    const map = window.L.map(elRef.current, {
      center: [D.locality.center.lat, D.locality.center.lon], zoom: compact ? 13 : 14,
      zoomControl: false, attributionControl: true, scrollWheelZoom: false,
    });
    window.L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: "\u00a9 OpenStreetMap \u00b7 \u00a9 CARTO", maxZoom: 19, subdomains: "abcd",
    }).addTo(map);
    window.L.control.zoom({ position: "bottomright" }).addTo(map);
    map.attributionControl.setPosition("bottomleft");
    mapRef.current = map;

    // Clear any open listing preview when the user clicks empty map or zooms.
    map.on("click", () => { onSelectRef.current && onSelectRef.current(null); });
    map.on("zoomstart", () => { onSelectRef.current && onSelectRef.current(null); });

    // Soft Manipal locality context ring.
    ringRef.current = window.L.circle([D.locality.center.lat, D.locality.center.lon], {
      radius: D.locality.radiusM, color: "var(--copper-500)", weight: 1.5, opacity: 0.55,
      dashArray: "3 5", fillColor: "var(--copper-500)", fillOpacity: 0.05, interactive: false,
    }).addTo(map);

    layerRef.current = window.L.layerGroup().addTo(map);
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
    if (ringRef.current) ringRef.current.setStyle({ opacity: loading ? 0 : 0.55, fillOpacity: loading ? 0 : 0.05 });
    group.clearLayers();
    if (loading) return;

    // Ghost orientation labels first (lowest z).
    D.nearby.forEach((a) => {
      window.L.marker([a.lat, a.lon], { icon: makeIcon(mmGhostHTML(a)), zIndexOffset: 50, interactive: false }).addTo(group);
    });

    // Manipal centre context label (subtle, non-interactive).
    const lblHTML = `<div style="transform:translate(-50%,-50%);font-family:var(--font-sans);opacity:0.85;">
      <span style="font-size:13px;font-weight:700;letter-spacing:0.01em;color:var(--copper-600);text-shadow:0 1px 2px rgba(255,255,255,0.9);">Manipal</span></div>`;
    window.L.marker([D.locality.center.lat + 0.006, D.locality.center.lon - 0.004], { icon: makeIcon(lblHTML), zIndexOffset: 30, interactive: false }).addTo(group);

    // Property price markers.
    properties.forEach((p) => {
      const active = hoverId === p.id;
      const selected = selectedId === p.id;
      const z = (selected ? 2000 : active ? 1500 : 600);
      const html = mmPillHTML(p, active, selected);
      window.L.marker([p.lat, p.lon], { icon: makeIcon(html), zIndexOffset: z, riseOnHover: true })
        .on("mouseover", () => { onHover && onHover(p.id); })
        .on("mouseout", () => { onHover && onHover(null); })
        .on("click", () => { onSelect && onSelect(p.id); })
        .addTo(group);
    });
  }

  return (
    <div className={previewOpen && compact ? "upt-hide-zoom" : ""} style={{ position: "relative", height: "100%", width: "100%", background: "#EDEBE6" }}>
      <div ref={elRef} style={{ position: "absolute", inset: 0 }} />

      {/* Context breadcrumb pill: where you are on the map */}
      <div style={{
        position: "absolute", top: compact ? "12px" : "18px", left: compact ? "12px" : "18px", zIndex: 500,
        display: "flex", alignItems: "center", gap: "7px", padding: "9px 14px",
        background: "var(--paper)", borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-md)",
        border: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 700, color: "var(--text-strong)",
      }}>
        <MMapIcon name="map-pin" size={15} color="var(--accent)" />
        <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Udupi</span>
        <MMapIcon name="chevron-right" size={12} color="var(--grey-400)" />
        <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>University Belt</span>
        <MMapIcon name="chevron-right" size={12} color="var(--grey-400)" />
        Manipal
      </div>

      {/* Legend — one entry per property type, symbols match the markers */}
      {!loading && shown > 0 && !(compact && previewOpen) && (
        <div style={{
          position: "absolute", bottom: "44px", left: compact ? "12px" : "18px", zIndex: 500,
          maxWidth: "calc(100% - 24px)",
          background: "rgba(255,255,255,0.94)", backdropFilter: "blur(6px)", borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-md)", border: "1px solid var(--border)", fontFamily: "var(--font-sans)",
          padding: compact ? "9px 11px" : "10px 13px",
        }}>
          <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: "7px" }}>
            Property type
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: compact ? "9px 13px" : "7px 16px" }}>
            {["Apartment", "Villa", "Plot"].map((k) => {
              const t = MM_TYPE[k];
              const n = properties.filter((p) => p.type === k).length;
              if (n === 0) return null;
              return (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "var(--text-body)", whiteSpace: "nowrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "20px", height: "20px", borderRadius: "50%", background: t.color, flex: "none" }}
                    dangerouslySetInnerHTML={{ __html: t.glyph("#fff") }} />
                  {t.label}
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", fontWeight: 700, color: "var(--text-muted)" }}>{n}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty (no matches) note on the map */}
      {!loading && shown === 0 && (
        <div style={{
          position: "absolute", bottom: compact ? "62px" : "70px", left: "50%", transform: "translateX(-50%)", zIndex: 500,
          display: "flex", alignItems: "center", gap: "8px", padding: "9px 14px", maxWidth: "calc(100% - 32px)",
          background: "var(--ochre-50)", borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-sm)",
          border: "1px solid rgba(169,116,28,0.25)", fontFamily: "var(--font-sans)", fontSize: "12.5px",
          fontWeight: 600, color: "var(--ochre-600)", whiteSpace: "nowrap",
        }}>
          <MMapIcon name="search" size={14} color="var(--ochre-600)" />
          No properties match these filters in Manipal
        </div>
      )}

      {/* Footer pill */}
      {!loading && !(compact && previewOpen) && (
        <div style={{
          position: "absolute", bottom: compact ? "16px" : "20px", left: "50%", transform: "translateX(-50%)", zIndex: 500,
          display: "flex", alignItems: "center", gap: "8px", padding: "9px 16px", background: "var(--paper)",
          borderRadius: "var(--radius-full)", boxShadow: "var(--shadow-md)", border: "1px solid var(--border)",
          fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, color: "var(--text-body)", whiteSpace: "nowrap",
        }}>
          <MMapIcon name="map-pin" size={15} color="var(--accent)" />
          {shown > 0 ? (
            <span>Showing <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-strong)" }}>{shown}</span> verified {shown === 1 ? "property" : "properties"} in Manipal</span>
          ) : (
            <span>No properties to show in Manipal</span>
          )}
        </div>
      )}

      {/* Selected-listing preview card */}
      {previewOpen && (
        <MapPreviewCard
          key={selectedProp.id}
          p={selectedProp}
          compact={compact}
          onClose={() => onSelect && onSelect(null)}
        />
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
            Loading Manipal properties…
          </div>
        </div>
      )}
    </div>
  );
}

window.UPTManipalMap = UPTManipalMap;

// Discover experience — AGRICULTURAL journey (restored from the existing product's
// Agri mode; the separate agri model in BLR_DATA.agri, never mixed with residential
// counts). Origin (Bangalore centre, or the area you came from) → outbound direction
// → cumulative distance band → town → parcels, with the real agri filters and cards.
const { Icon: AJIcon } = window.ReTrendsDesignSystem_f37966;
const EVER = "var(--evergreen-600)";
const EVER_DARK = "var(--evergreen-700, #1F694A)";

function AJGhost({ children, onClick, strong }) {
  const [h, setH] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
      style={{ padding: "7px 12px", borderRadius: "var(--radius-md)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 600, border: "1px solid " + (strong ? EVER : "var(--border-strong)"), background: h ? "var(--grey-50)" : "var(--paper)", color: strong ? EVER_DARK : "var(--text-strong)", whiteSpace: "nowrap", transition: "background var(--dur-fast)" }}>{children}</button>
  );
}

// ---- view -------------------------------------------------------------------
function ExpAgriView(st, act) {
  const a = st.ag;
  const EXJ = window.EXJ, AG = window.BLR_AGRI, AD = window.BLR_DATA.agri;
  const origin = a.originKey ? EXJ.originPtOf(a.originKey) : null;
  const originPt = origin || EXJ.cityPt;
  const originCrumb = origin ? "Origin: " + origin.name : "Agri land";
  const v = {
    journey: "agri", level: "agri-corridors", journeyRoot: !a.corridorId,
    destinations: [], areaList: [], areaMarkers: [], mapClusters: [], pins: [], schoolPins: [], discs: [],
    navCards: [], townDiscs: [], parcelPins: [], notes: [], results: [], listingCapable: false,
    scopeKind: null, committed: [], sheetRows: [], sheetTitle: "", stickyCta: null, showBack: false, backLabel: "",
    originMarker: origin ? { lat: origin.lat, lon: origin.lon, name: origin.name } : null,
    crumb: [{ key: "blr", label: "Bangalore" }, { key: "agri-root", label: originCrumb }],
    maxZoom: 10
  };

  // ---- parcels in a town ---------------------------------------------------
  if (a.clusterId) {
    const town = EXJ.townOf(a.clusterId);
    const corridor = EXJ.corridorOf(town.corridor);
    const { items, raw } = EXJ.agriParcels(a.clusterId, a.filters, a.query);
    v.level = "agri-parcels";
    v.town = town; v.corridor = corridor; v.results = items; v.rawCount = raw.length;
    v.parcelPins = items;
    v.fitBounds = town.bounds;
    v.fitKey = "agri-parcels-" + a.clusterId;
    v.maxZoom = 13;
    v.crumb = v.crumb.concat([{ key: corridor.id, label: EXJ.DIR_WORD[corridor.dir] || corridor.short }, { key: town.id, label: town.name }]);
    v.heading = { eyebrow: (origin ? origin.name : "Bangalore") + " · " + (EXJ.DIR_WORD[corridor.dir] || corridor.short) + " · up to " + a.maxKm + " km", title: town.name + " agricultural land", stat: { v: AG.townProps(a.clusterId), l: "parcels" }, sub: town.blurb };
    v.scopeKind = "AGRI_PARCELS";
    v.scopeLabel = "Parcels in " + town.name + " · " + Math.round(window.BLR_DIST(originPt, town)) + " km " + (EXJ.DIR_WORD[corridor.dir] || corridor.short).toLowerCase() + " of " + (origin ? origin.name : "Bangalore");
    v.showBack = true; v.backLabel = "Back to towns in " + (EXJ.DIR_WORD[corridor.dir] || corridor.short);
    v.sheetTitle = items.length + " parcels in " + town.name;
    v.sheetRows = items.slice(0, 5).map((p) => ({ key: p.id, label: p.title, meta: p.acres + " ac", onClick: () => act.agriActivate(p.id) }));
    v.paintKey = ["agri-parcels", a.clusterId, a.query, JSON.stringify(a.filters)].join("|");
    return v;
  }

  // ---- towns along a direction ---------------------------------------------
  if (a.corridorId) {
    const corridor = EXJ.corridorOf(a.corridorId);
    const towns = EXJ.agriTowns(a.corridorId, a.maxKm, a.query);
    const allTowns = AG.townsOf(a.corridorId);
    const centroid = AG.corridorCentroid(a.corridorId);
    const oDir = origin ? EXJ.DIR_WORD[window.BLR_BEARING_DIR(originPt, centroid)] : EXJ.DIR_WORD[corridor.dir];
    const range = origin ? AG.corridorDistRange(a.corridorId, originPt, a.maxKm) : null;
    v.level = "agri-towns";
    v.corridor = corridor; v.towns = towns; v.dirWord = oDir || corridor.short;
    v.parcelCount = AG.dirProps(a.corridorId, a.maxKm);
    v.acres = AG.dirAcres(a.corridorId, a.maxKm);
    v.townDiscs = towns.map((t) => ({ key: t.id, name: t.name, n: AG.townProps(t.id), center: { lat: t.lat, lon: t.lon } }));
    v.wedge = { origin: { lat: originPt.lat, lon: originPt.lon }, bearing: EXJ.bearingTo(originPt, centroid), half: 33, km: a.maxKm, bands: AD.distances.slice() };
    const pts = allTowns.map((t) => ({ lat: t.lat, lon: t.lon })).concat([{ lat: originPt.lat, lon: originPt.lon }]);
    v.fitBounds = [[Math.min.apply(null, pts.map((p) => p.lat)) - 0.05, Math.min.apply(null, pts.map((p) => p.lon)) - 0.05], [Math.max.apply(null, pts.map((p) => p.lat)) + 0.05, Math.max.apply(null, pts.map((p) => p.lon)) + 0.05]];
    v.fitKey = "agri-towns-" + a.corridorId + "-" + (a.originKey || "city") + "-" + a.maxKm;
    v.maxZoom = 11;
    v.crumb = v.crumb.concat([{ key: corridor.id, label: v.dirWord + (range ? " · " + range.min + "–" + range.max + " km" : "") }]);
    // the distance band is result-defining state, so it is named in the heading and scope line
    v.scopeKind = "AGRI_BAND";
    v.scopeLabel = "Parcels " + (range ? range.min + "–" + range.max : "up to " + a.maxKm) + " km " + (v.dirWord || "").toLowerCase() + " of " + (origin ? origin.name : "Bangalore");
    v.heading = { eyebrow: origin ? "Origin: " + origin.name : "Direction from Bangalore", title: "Parcels " + (range ? range.min + "–" + range.max : "up to " + a.maxKm) + " km " + (v.dirWord || "").toLowerCase() + " of " + (origin ? origin.name : "Bangalore"), stat: { v: v.parcelCount, l: v.parcelCount === 1 ? "parcel" : "parcels" }, sub: "Distance bands are cumulative, so a wider band keeps the closer towns too." };
    v.showBack = true; v.backLabel = "Back to directions";
    v.sheetTitle = towns.length + " towns within " + a.maxKm + " km";
    v.sheetRows = towns.slice(0, 6).map((t) => ({ key: t.id, label: t.name, meta: AG.townProps(t.id) + " parcels", onClick: () => act.agriPickTown(t.id) }));
    v.paintKey = ["agri-towns", a.corridorId, a.maxKm, a.originKey || "", a.query].join("|");
    return v;
  }

  // ---- outbound directions -------------------------------------------------
  const nodes = EXJ.agriCorridorNodes(a.originKey);
  v.navCards = nodes;
  const pts = nodes.map((n) => n.center).concat([{ lat: originPt.lat, lon: originPt.lon }]);
  v.fitBounds = [[Math.min.apply(null, pts.map((p) => p.lat)) - 0.08, Math.min.apply(null, pts.map((p) => p.lon)) - 0.08], [Math.max.apply(null, pts.map((p) => p.lat)) + 0.08, Math.max.apply(null, pts.map((p) => p.lon)) + 0.08]];
  v.fitKey = "agri-corridors-" + (a.originKey || "city");
  v.maxZoom = 9;
  v.heading = {
    eyebrow: "Agricultural land",
    title: origin ? "Agricultural land around " + origin.name : "Farmland out of Bangalore",
    stat: { v: AG.totalParcels, l: "parcels" },
    sub: origin ? "Farmland is rarely inside " + origin.name + " — explore it by direction and distance outward from there." : "Farmland is grouped by the direction it lies from the city, not filed under an urban neighbourhood."
  };
  v.sheetTitle = nodes.length + " outbound directions";
  v.sheetRows = nodes.map((n) => ({ key: n.key, label: n.label, meta: n.n + " parcels", onClick: () => act.agriPickCorridor(n.key) }));
  v.paintKey = "agri-corridors|" + (a.originKey || "city");
  return v;
}

// ---- origin bar -------------------------------------------------------------
function AJOriginBar({ st, act }) {
  const origin = st.ag.originKey ? window.EXP.byKey[st.ag.originKey] : null;
  return (
    <div data-design-component="agricultural-origin" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap", padding: "7px 12px", background: "var(--evergreen-50)", border: "1px solid var(--evergreen-100, #CFE6D9)", borderRadius: "var(--radius-md)" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: "8px", minWidth: 0, fontSize: "12.5px", color: "var(--text-body)" }}>
        <AJIcon name="target" size={15} color={EVER} style={{ flex: "none" }} />
        <span style={{ minWidth: 0 }}>Search origin: <strong style={{ color: "var(--text-strong)", fontWeight: 700 }}>{origin ? origin.name : "Bangalore centre"}</strong></span>
      </span>
      {origin && (
        <button onClick={() => act.setAgriOrigin(null)} style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "4px 10px", borderRadius: "var(--radius-md)", border: "1px solid " + EVER, background: "var(--surface-card)", color: EVER_DARK, cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12px", fontWeight: 600, whiteSpace: "nowrap" }}>
          Use Bangalore centre <AJIcon name="x" size={12} />
        </button>
      )}
    </div>
  );
}

// ---- agri search within current results ------------------------------------
function AJSearch({ st, act, placeholder }) {
  return (
    <div data-design-component="agricultural-search" style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 12px", minHeight: "40px", background: "var(--surface-card)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)" }}>
      <AJIcon name="search" size={15} color="var(--grey-400)" />
      <input value={st.ag.query} onChange={(e) => act.setAgriQuery(e.target.value)} placeholder={placeholder}
        style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-sans)", fontSize: "13px", color: "var(--text-strong)" }} />
      {st.ag.query && <button onClick={() => act.setAgriQuery("")} style={{ border: "none", background: "var(--surface-subtle)", cursor: "pointer", borderRadius: "var(--radius-full)", width: "20px", height: "20px", lineHeight: 1, color: "var(--text-muted)" }}>×</button>}
    </div>
  );
}

function AJTownRow({ town, st, act, originPt }) {
  const [h, setH] = React.useState(false);
  const AG = window.BLR_AGRI;
  const hov = h || st.ag.hover === town.id;
  const parcels = AG.townProps(town.id), acres = AG.townAcres(town.id);
  const distKm = Math.round(window.BLR_DIST(originPt, town));
  return (
    <div role="button" tabIndex={0} data-design-component="town-row" onClick={() => act.agriPickTown(town.id)} onKeyDown={(e) => (e.key === "Enter" ? act.agriPickTown(town.id) : null)}
      onMouseEnter={() => { setH(true); act.agriHover(town.id, "panel"); }} onMouseLeave={() => { setH(false); act.agriHover(null, "panel"); }}
      style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 13px", borderRadius: "var(--radius-lg)", border: "1px solid " + (hov ? EVER : "var(--border)"), background: "var(--surface-card)", boxShadow: hov ? "var(--shadow-md)" : "var(--shadow-xs)", cursor: "pointer", transition: "border-color var(--dur-fast), box-shadow var(--dur-normal)", fontFamily: "var(--font-sans)" }}>
      <span style={{ flex: "none", width: "34px", height: "34px", borderRadius: "var(--radius-md)", background: "var(--evergreen-50)", display: "grid", placeItems: "center" }}><AJIcon name="map-pin" size={17} color={EVER} /></span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
          <h4 style={{ margin: 0, fontSize: "14.5px", fontWeight: 700, color: "var(--text-strong)", letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {town.name} <span style={{ fontWeight: 600, color: "var(--text-muted)", fontSize: "12.5px" }}>· {distKm} km</span>
          </h4>
          <span style={{ flex: "none", display: "inline-flex", alignItems: "baseline", gap: "4px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "15px", fontWeight: 700, color: EVER_DARK }}>{parcels}</span>
            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>· {acres.toFixed(1)} ac</span>
          </span>
        </div>
        <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{town.blurb}</div>
      </div>
      <AJIcon name="chevron-right" size={17} color={hov ? EVER : "var(--grey-400)"} />
    </div>
  );
}

// ---- panel ------------------------------------------------------------------
function ExpAgriPanel({ view, st, act, isMobile }) {
  const a = st.ag;
  const AG = window.BLR_AGRI, AD = window.BLR_DATA.agri;
  const originPt = a.originKey ? window.EXJ.originPtOf(a.originKey) : window.EXJ.cityPt;

  if (view.level === "agri-parcels") {
    const parcels = view.results;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div data-design-component="scope-bar" style={{ display: "inline-flex", alignItems: "center", gap: "7px", alignSelf: "flex-start", padding: "5px 10px", borderRadius: "var(--radius-xs)", border: "1px solid var(--evergreen-100, #CFE6D9)", background: "var(--evergreen-50)", fontSize: "11.5px", fontWeight: 700, color: EVER_DARK }}>Result scope — {view.scopeLabel}</div>
        <AJSearch st={st} act={act} placeholder="Search these parcels…" />
        <window.DPAgriFilters f={a.filters} setF={act.setAgriFilters} onClear={() => act.setAgriFilters(window.DP_AGRI_DEFAULTS)} />
        {parcels.length === 0
          ? <window.DPEmpty accent="agri" icon="sliders-horizontal" title="No parcels match" body="Widen the size or price, or clear the search."
            actions={<AJGhost strong onClick={() => { act.setAgriFilters(window.DP_AGRI_DEFAULTS); act.setAgriQuery(""); }}>Clear search &amp; filters</AJGhost>} />
          : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
                <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-strong)" }}>Parcels in {view.town.name}</span>
                <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}><span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-strong)" }}>{parcels.length}</span> of {view.rawCount} shown</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, minmax(0,1fr))", gap: "16px" }}>
                {parcels.map((p) => (
                  <div key={p.id} data-exp-card={p.id} style={{ borderRadius: "var(--radius-lg)", outline: a.active === p.id ? "2px solid " + EVER : "2px solid transparent", outlineOffset: "2px", transition: "outline-color var(--dur-fast)" }}>
                    <window.DPParcelCard parcel={p} onOpen={() => act.agriActivate(p.id)} saved={st.saved.indexOf(p.id) !== -1} onToggleSave={act.toggleSave} />
                  </div>
                ))}
              </div>
            </>
          )}
      </div>
    );
  }

  if (view.level === "agri-towns") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
        <AJOriginBar st={st} act={act} />
        <div data-design-component="scope-bar" style={{ display: "inline-flex", alignItems: "center", gap: "7px", alignSelf: "flex-start", padding: "5px 10px", borderRadius: "var(--radius-xs)", border: "1px solid var(--evergreen-100, #CFE6D9)", background: "var(--evergreen-50)", fontSize: "11.5px", fontWeight: 700, color: EVER_DARK }}>Result scope — {view.scopeLabel}</div>
        <window.DPDistanceChips distances={AD.distances} value={a.maxKm} onChange={act.setAgriMaxKm} count={(k) => AG.dirProps(a.corridorId, k)} originName={a.originKey ? window.EXP.byKey[a.originKey].name : null} />
        <AJSearch st={st} act={act} placeholder="Search towns or land type…" />
        {view.towns.length === 0
          ? <window.DPEmpty accent="agri" icon="route" title={a.query ? "No towns match" : "No towns within " + a.maxKm + " km"} body={a.query ? "Clear the search or widen the distance band." : "Increase the distance band to include towns further out."}
            actions={<AJGhost strong onClick={() => { act.setAgriQuery(""); act.setAgriMaxKm(AD.distances[AD.distances.length - 1]); }}>Widen to {AD.distances[AD.distances.length - 1]} km</AJGhost>} />
          : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
                <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-strong)" }}>Towns in {view.dirWord}</span>
                <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}><span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--text-strong)" }}>{view.acres.toFixed(1)}</span> ac · within {a.maxKm} km</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {view.towns.map((t) => <AJTownRow key={t.id} town={t} st={st} act={act} originPt={originPt} />)}
              </div>
            </>
          )}
      </div>
    );
  }

  // corridors
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "11px" }}>
      <AJOriginBar st={st} act={act} />
      <div style={{ display: "flex", alignItems: "flex-start", gap: "9px", padding: "10px 12px", background: "var(--evergreen-50)", border: "1px solid var(--evergreen-100, #CFE6D9)", borderRadius: "var(--radius-md)", fontSize: "12px", lineHeight: 1.45, color: "var(--text-body)" }}>
        <AJIcon name="sprout" size={15} color={EVER} style={{ flex: "none", marginTop: "1px" }} />
        Agricultural land is a separate model — parcels, corridors and distances. Nothing here is counted into the residential areas or listings.
      </div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "10px" }}>
        <span style={{ fontSize: "13.5px", fontWeight: 700, color: "var(--text-strong)" }}>{a.originKey ? "Directions from " + window.EXP.byKey[a.originKey].name : "Outbound directions"}</span>
        <span style={{ fontSize: "12.5px", color: "var(--text-muted)" }}>{AD.corridors.length} directions</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {AD.corridors.map((c) => (
          <window.DPCorridorCard key={c.id} corridor={c} origin={a.originKey ? window.EXJ.originPtOf(a.originKey) : null}
            onView={(id) => act.agriPickCorridor(id)} highlighted={st.ag.hover === c.id && st.ag.hoverSrc === "map"} onHover={act.agriHover} />
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { ExpAgriView, ExpAgriPanel });

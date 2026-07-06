// Unified Discover Portal — orchestrator. Exports window.DiscoverPortal
// ONE shell. `scope` (region) is a filter; `journey` is a narrowing method.
// Everything else is derived. The map layer and the panel body are two views of
// the same (scope, journey, level) tuple.
const { Icon: PIcon } = window.ReTrendsDesignSystem_f37966;
const D = window.BLR_DATA;
const CO = window.BLR_COUNTS;
const AG = window.BLR_AGRI;

const JOURNEY_TAG = {
  area: { label: "By area", icon: "map-pin", bg: "var(--accent-tint)", fg: "var(--copper-600)" },
  listings: { label: "All listings", icon: "layers", bg: "var(--accent-tint)", fg: "var(--copper-600)" },
  school: { label: "Near school", icon: "building", bg: "var(--plum-tint)", fg: "var(--plum-600)" },
  agri: { label: "Agricultural", icon: "layers", bg: "var(--evergreen-50)", fg: "var(--evergreen-600)" },
};

function computeLayer(s) {
  if (s.journey === "agri") return s.clusterId ? "agri-parcels" : s.corridorId ? "agri-clusters" : "agri-corridors";
  if (s.journey === "area") return s.areaId ? "area-listings" : s.groupId ? "area-areas" : "area-groups";
  if (s.journey === "listings") return "area-listings";
  if (s.journey === "school") return s.schoolId ? "school-homes" : s.areaId ? "school-schools" : s.zoneId ? "school-areas" : "school-zones";
  return s.scope ? "region-hotspots" : "region-bubbles";
}

function DiscoverPortal() {
  const init = React.useMemo(() => {
    const p = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
    const r = parseInt(p.get("radiusKm"), 10);
    // Validate every id against the data; unknown ids fall back to the nearest valid level.
    const has = (arr, id) => !!id && arr.some((x) => x.id === id);
    const jr = p.get("journey");
    const journey = ["area", "school", "listings", "agri"].includes(jr) ? jr : null;
    let scope = has(D.regions, p.get("region")) ? p.get("region") : null;
    let groupId = has(D.groups, p.get("groupId")) ? p.get("groupId") : null;
    let zoneId = has(D.zones, p.get("zoneId")) ? p.get("zoneId") : null;
    let areaId = has(D.areas, p.get("areaId")) ? p.get("areaId") : null;
    let schoolId = has(D.schools, p.get("schoolId")) ? p.get("schoolId") : null;
    let corridorId = has(D.agri.corridors, p.get("corridorId")) ? p.get("corridorId") : null;
    let clusterId = has(D.agri.clusters, p.get("clusterId")) ? p.get("clusterId") : null;
    if (journey === "agri") { scope = null; groupId = null; zoneId = null; areaId = null; schoolId = null; }
    else { corridorId = null; clusterId = null; }
    if (clusterId && corridorId && D.agri.clusters.find((c) => c.id === clusterId).corridor !== corridorId) clusterId = null;
    if (!scope && areaId) scope = D.areas.find((a) => a.id === areaId).region;
    if (!scope && schoolId) scope = D.schools.find((s) => s.id === schoolId).region;
    if (!scope && zoneId) scope = D.zones.find((z) => z.id === zoneId).region;
    if (!scope && groupId) scope = D.groups.find((g) => g.id === groupId).region;
    const mk = parseInt(p.get("maxKm"), 10);
    let maxKm = D.agri.distances.indexOf(mk) !== -1 ? mk : D.agri.defaultMaxKm;
    if (clusterId) { const t = D.agri.clusters.find((c) => c.id === clusterId); if (t && t.distKm > maxKm) maxKm = D.agri.distances.find((k) => k >= t.distKm) || 100; }
    return {
      mode: p.get("mode") === "rent" ? "Rent" : "Buy",
      scope, journey, groupId, zoneId, areaId, schoolId, corridorId, clusterId, maxKm,
      radiusKm: [3, 5, 10].includes(r) ? r : 5,
    };
  }, []);

  const [mode, setMode] = React.useState(init.mode);
  const [city, setCity] = React.useState("Bangalore");
  const [scope, setScope] = React.useState(init.scope);
  const [journey, setJourney_] = React.useState(init.journey);
  const [groupId, setGroupId] = React.useState(init.groupId);
  const [zoneId, setZoneId] = React.useState(init.zoneId);
  const [areaId, setAreaId] = React.useState(init.areaId);
  const [schoolId, setSchoolId] = React.useState(init.schoolId);
  const [corridorId, setCorridorId] = React.useState(init.corridorId);
  const [clusterId, setClusterId] = React.useState(init.clusterId);
  const [radiusKm, setRadiusKm] = React.useState(init.radiusKm);
  const [maxKm, setMaxKm] = React.useState(init.maxKm);
  const [searchMode, setSearchMode] = React.useState(init.journey === "school" ? "school" : "area");
  const [filters, setFilters] = React.useState(window.DP_DEFAULT_FILTERS);
  const [agriFilters, setAgriFilters] = React.useState(window.DP_AGRI_DEFAULTS);
  const [active, setActive] = React.useState(null);
  const [saved, setSaved] = React.useState(["h1"]);

  const state = { scope, journey, groupId, zoneId, areaId, schoolId, corridorId, clusterId };
  const layer = computeLayer(state);
  const region = (id) => D.regions.find((r) => r.id === id);

  // ---- navigation ----
  const toggleSave = (id) => setSaved((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);
  const clearSel = () => { setGroupId(null); setZoneId(null); setAreaId(null); setSchoolId(null); setCorridorId(null); setClusterId(null); setActive(null); };
  const reset = () => { setScope(null); setJourney_(null); clearSel(); setFilters(window.DP_DEFAULT_FILTERS); setAgriFilters(window.DP_AGRI_DEFAULTS); };
  // Changing city resets region / journey / selection back to that city's neutral landing (Buy/Rent persists).
  const changeCity = (c) => { setCity(c); reset(); };
  const changeRegion = () => { setScope(null); setJourney_(null); clearSel(); setSearchMode("area"); };

  // Region is scope-only (journey still null) → the search toggle defaults to Area, never School.
  const pickRegion = (id) => { setScope(id); clearSel(); setSearchMode("area"); };
  const setJourney = (j) => {
    clearSel();
    if (j === "agri") { setScope(null); setJourney_("agri"); setMaxKm(D.agri.defaultMaxKm); setAgriFilters(window.DP_AGRI_DEFAULTS); return; }
    setJourney_(j);
    setSearchMode(j === "school" ? "school" : "area");
    if (j === "area" || j === "listings") setFilters(window.DP_DEFAULT_FILTERS);
  };
  const pickGroup = (id) => { const g = D.groups.find((x) => x.id === id); if (!g) return; setJourney_("area"); setScope(g.region); setGroupId(id); setAreaId(null); setActive(null); };
  const pickZone = (id) => { const z = D.zones.find((x) => x.id === id); if (!z) return; setJourney_("school"); setScope(z.region); setZoneId(id); setAreaId(null); setSchoolId(null); setActive(null); };
  const openAreaListings = (a) => { setJourney_("area"); setScope(a.region); setGroupId(a.group); setZoneId(null); setSchoolId(null); setAreaId(a.id); setFilters(window.DP_DEFAULT_FILTERS); setActive(null); };
  const openAreaSchools = (a) => { setJourney_("school"); setScope(a.region); setZoneId(a.zone); setGroupId(null); setSchoolId(null); setAreaId(a.id); setRadiusKm(5); setActive(null); };
  const pickArea = (id) => { const a = D.areas.find((x) => x.id === id); if (!a) return; journey === "school" ? openAreaSchools(a) : openAreaListings(a); };
  const pickSchool = (id) => { const s = D.schools.find((x) => x.id === id); if (!s) return; setJourney_("school"); setScope(s.region); setZoneId(s.zone); setAreaId(s.areaId); setSchoolId(s.id); setRadiusKm(5); setActive(null); };
  const pickCorridor = (id) => { setJourney_("agri"); setScope(null); setCorridorId(id); setClusterId(null); setMaxKm(D.agri.defaultMaxKm); setAgriFilters(window.DP_AGRI_DEFAULTS); setActive(null); };
  const pickCluster = (id) => { setClusterId(id); setActive(null); };

  const back = () => {
    const toNeutralJourney = () => { setSearchMode("area"); setJourney_(null); };
    if (journey === "agri") { if (clusterId) return setClusterId(null); if (corridorId) return setCorridorId(null); return toNeutralJourney(); }
    if (journey === "area" || journey === "listings") { if (areaId) return setAreaId(null); if (groupId) return setGroupId(null); return toNeutralJourney(); }
    if (journey === "school") { if (schoolId) return setSchoolId(null); if (areaId) return setAreaId(null); if (zoneId) return setZoneId(null); return toNeutralJourney(); }
    return setScope(null);
  };

  // ---- scoped search ----
  const scopeLabel = scope ? region(scope).name : city;
  const searchResults = (q, m) => {
    const t = q.toLowerCase();
    if (m === "area") return D.areas.filter((a) => (!scope || a.region === scope) && a.name.toLowerCase().includes(t)).slice(0, 5)
      .map((a) => ({ id: a.id, title: a.name, sub: `Area · ${region(a.region).name}`, cta: journey === "school" ? "Schools here" : "View listings", _kind: "area", _obj: a }));
    return D.schools.filter((s) => (!scope || s.region === scope) && s.name.toLowerCase().includes(t)).slice(0, 5)
      .map((s) => ({ id: s.id, title: s.name, sub: `School · ${s.area} · ${window.BLR_HOMES_NEAR(s, 5).length} homes within 5 km`, cta: "Homes near it", _kind: "school", _obj: s }));
  };
  const onPickSearch = (r) => { if (r._kind === "area") { journey === "school" || searchMode === "school" ? openAreaSchools(r._obj) : openAreaListings(r._obj); } else pickSchool(r._obj.id); };

  // ---- URL sync ----
  React.useEffect(() => {
    const p = new URLSearchParams();
    if (mode === "Rent") p.set("mode", "rent");
    if (scope) p.set("region", scope);
    if (journey) p.set("journey", journey);
    if (groupId) p.set("groupId", groupId);
    if (zoneId) p.set("zoneId", zoneId);
    if (areaId) p.set("areaId", areaId);
    if (schoolId) { p.set("schoolId", schoolId); p.set("radiusKm", String(radiusKm)); }
    if (corridorId) { p.set("corridorId", corridorId); p.set("maxKm", String(maxKm)); }
    if (clusterId) p.set("clusterId", clusterId);
    try { history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p.toString() : "")); } catch (e) {}
  }, [mode, scope, journey, groupId, zoneId, areaId, schoolId, corridorId, clusterId, radiusKm, maxKm]);

  // ---- derived lists ----
  const regionObj = scope && region(scope);
  const groupObj = groupId && D.groups.find((g) => g.id === groupId);
  const zoneObj = zoneId && D.zones.find((z) => z.id === zoneId);
  const areaObj = areaId && D.areas.find((a) => a.id === areaId);
  const schoolObj = schoolId && D.schools.find((s) => s.id === schoolId);
  const corridorObj = corridorId && D.agri.corridors.find((c) => c.id === corridorId);
  const clusterObj = clusterId && D.agri.clusters.find((c) => c.id === clusterId);

  const areaListingsRaw = areaId ? D.listings.filter((l) => l.areaId === areaId) : (scope ? D.listings.filter((l) => l.region === scope) : D.listings.slice());
  const areaListings = window.DP_applyFilters(areaListingsRaw, filters);
  const schoolHomes = schoolId ? window.BLR_HOMES_NEAR(schoolObj, radiusKm).slice().sort((a, b) => window.BLR_DIST(schoolObj, a) - window.BLR_DIST(schoolObj, b)) : [];
  const parcelsRaw = clusterId ? D.agri.parcels.filter((p) => p.cluster === clusterId) : [];
  const parcels = window.DP_applyAgri(parcelsRaw, agriFilters);

  // map inputs
  let mapListings = [];
  if (layer === "area-listings") mapListings = areaListings;
  else if (layer === "school-homes") mapListings = schoolHomes;

  // ---- map crumb + summary ----
  const rShort = regionObj ? regionObj.short : null;
  const crumbMap = (() => {
    switch (layer) {
      case "region-hotspots": return [city, rShort];
      case "area-groups": return scope ? [city, rShort, "By area"] : [city, "By area"];
      case "area-areas": return [city, rShort, groupObj.name];
      case "area-listings": return areaObj ? [city, rShort, groupObj ? groupObj.name : "By area", areaObj.name] : (scope ? [city, rShort, "All listings"] : [city, "All listings"]);
      case "school-zones": return scope ? [city, rShort, "Near school"] : [city, "Near school"];
      case "school-areas": return [city, rShort, zoneObj.name];
      case "school-schools": return [city, rShort, areaObj.name];
      case "school-homes": return [city, rShort, areaObj ? areaObj.name : "", schoolObj.name.split(",")[0]].filter(Boolean);
      case "agri-corridors": return [city, "Agri land"];
      case "agri-clusters": return [city, "Agri land", corridorObj.dir];
      case "agri-parcels": return [city, "Agri land", corridorObj.dir, clusterObj.name.replace(/ cluster$/, "")];
      default: return [city];
    }
  })();

  const summary = (() => {
    const schoolSum = (n) => ({ icon: "building", color: "var(--plum-600)", count: n, noun: n === 1 ? "school" : "schools" });
    const homeSum = (n) => ({ icon: "map-pin", color: "var(--accent)", count: n, noun: n === 1 ? "home" : "homes" });
    const propSum = (n) => ({ icon: "map-pin", color: "var(--accent)", count: n, noun: n === 1 ? "property" : "properties" });
    const agriSum = (n) => ({ icon: "layers", color: "var(--evergreen-600)", count: n, noun: n === 1 ? "parcel" : "parcels" });
    switch (layer) {
      case "region-bubbles": return propSum(CO.totalHomes);
      case "region-hotspots": return propSum(CO.homesRegion(scope));
      case "area-groups": return propSum(scope ? CO.homesRegion(scope) : CO.totalHomes);
      case "area-areas": return propSum(CO.homesGroup(groupId));
      case "area-listings": return homeSum(mapListings.length);
      case "school-zones": return schoolSum(scope ? CO.schoolsRegion(scope) : CO.totalSchools);
      case "school-areas": return schoolSum(CO.schoolsZone(zoneId));
      case "school-schools": return schoolSum(CO.schoolsArea(areaId));
      case "school-homes": return homeSum(schoolHomes.length);
      case "agri-corridors": return agriSum(AG.totalParcels);
      case "agri-clusters": return agriSum(AG.dirProps(corridorId, maxKm));
      case "agri-parcels": return agriSum(parcels.length);
      default: return propSum(CO.totalHomes);
    }
  })();

  const tag = journey && JOURNEY_TAG[journey];
  const showSearch = (!!scope || !!journey) && journey !== "agri";

  const ctx = {
    layer, mode, city, scope, journey, regionObj, groupObj, zoneObj, areaObj, schoolObj, corridorObj, clusterObj,
    groupId, zoneId, areaId, schoolId, corridorId, clusterId, radiusKm, setRadiusKm, maxKm, setMaxKm, agriDistances: D.agri.distances,
    filters, setFilters, agriFilters, setAgriFilters,
    searchMode, setSearchMode, scopeLabel, searchResults, onPickSearch, showSearch,
    areaListings, areaListingsRaw, schoolHomes, parcels, parcelsRaw,
    saved, toggleSave, setActive, setMode,
    pickRegion, setJourney, pickGroup, pickZone, pickArea, pickSchool, pickCorridor, pickCluster,
    back, reset, changeRegion, changeCity, setCity, cities: ["Bangalore", "Udupi", "Mangaluru"],
  };

  return (
    <div style={{ display: "flex", height: "calc(100vh - 60px)" }}>
      {/* ---- Map (left) ---- */}
      <div style={{ flex: "0 0 50%", position: "relative", borderRight: "1px solid var(--border)" }}>
        <window.DPMap
          layer={layer} scope={scope} selection={{ groupId, zoneId, areaId, schoolId, corridorId, clusterId }}
          radiusKm={radiusKm} maxKm={maxKm} activeListing={active} listings={mapListings} parcels={parcels}
          crumb={crumbMap} summary={summary}
          onPickRegion={pickRegion} onPickGroup={pickGroup} onPickArea={pickArea} onPickSchool={pickSchool}
          onPickZone={pickZone} onPickCorridor={pickCorridor} onPickCluster={pickCluster}
        />
      </div>

      {/* ---- Panel (right) ---- */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "var(--background)" }}>
        {/* Persistent shell header — shown once a scope/journey is chosen. On the neutral
            landing the city + Buy/Rent controls live inside the hero (see DiscoverPanelBody). */}
        {(scope || journey) && (
        <div style={{ padding: "16px 28px 14px", borderBottom: "1px solid var(--border)", background: "var(--background)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
              <PIcon name="map-pin" size={16} color="var(--accent)" />
              <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                <select value={city} onChange={(e) => changeCity(e.target.value)} aria-label="City" style={{
                  appearance: "none", WebkitAppearance: "none", padding: "6px 30px 6px 8px", border: "1px solid transparent",
                  borderRadius: "var(--radius-md)", background: "transparent", cursor: "pointer",
                  fontFamily: "var(--font-sans)", fontSize: "15px", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-strong)",
                }}>
                  {["Bangalore", "Udupi", "Mangaluru"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <PIcon name="chevron-down" size={16} color="var(--grey-500)" style={{ position: "absolute", right: "8px", pointerEvents: "none" }} />
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
              <window.DPBuyRent value={mode} onChange={setMode} />
              <button onClick={reset} style={{ display: "inline-flex", alignItems: "center", gap: "6px", border: "none", background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "13px", fontWeight: 600, padding: 0, whiteSpace: "nowrap" }}>Start over <PIcon name="x" size={15} /></button>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
            <h1 style={{ margin: 0, fontFamily: "var(--font-serif)", fontSize: "23px", fontWeight: 600, letterSpacing: "-0.02em", color: "var(--text-strong)" }}>Discover {city}</h1>
            {regionObj && (
              <>
                <PIcon name="chevron-right" size={16} color="var(--grey-400)" />
                <button onClick={changeRegion} title="Clear region scope" style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 8px 4px 11px", borderRadius: "var(--radius-full)", border: "1px solid var(--border-strong)", background: "var(--navy-100)", color: "var(--navy-800)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: "12.5px", fontWeight: 700 }}>
                  {regionObj.name}<PIcon name="x" size={13} color="var(--navy-700)" />
                </button>
              </>
            )}
            {tag && <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", padding: "3px 10px", borderRadius: "var(--radius-full)", background: tag.bg, color: tag.fg, fontSize: "12px", fontWeight: 700 }}><PIcon name={tag.icon} size={12} color={tag.fg} />{tag.label}</span>}
          </div>
        </div>
        )}
        {/* Panel body */}
        <div className="upt-scroll" style={{ flex: 1, overflowY: "auto", padding: "22px 28px 40px" }}>
          <window.DiscoverPanelBody ctx={ctx} />
        </div>
      </div>
    </div>
  );
}

window.DiscoverPortal = DiscoverPortal;

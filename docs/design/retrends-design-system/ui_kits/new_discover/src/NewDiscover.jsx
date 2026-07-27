// Discover V2 — orchestrator. Exports window.NewDiscover
//
// ONE shell. `mode` (Areas | Schools | Agricultural) is a mutually-exclusive search-mode
// selector; the geographic path (region → generated directional cluster → area) answers WHERE.
// TWO ways in, ONE canonical state:
//   • guided:  city → direction → optional cluster → area
//   • direct:  search an area → resolve its full generated path (ND.pathToArea) → same state
// Areas & Schools share the residential path, so switching keeps the current AREA context.
// Agricultural treats the selected area as an ORIGIN (city centre by default) and explores
// farmland outward by direction + distance — it never files farmland under an urban region.
// City / Buy-Rent / mode / area / school / agri-origin / direction / distance all live in the
// URL hash, so refresh, Back and a shared deep link restore the same visible state.
const { Icon: PIcon } = window.ReTrendsDesignSystem_f37966;
const D = window.BLR_DATA;
const ND = window.ND;
const CO = window.BLR_COUNTS;
const AG = window.BLR_AGRI;
const DIR_LABEL = ND.DIR_LABEL;
const DIR_WORD = { N: "North", E: "East", S: "South", W: "West" };

function offsetPt(bearing, km) {
  const kLat = 1 / 111, kLon = 1 / (111 * Math.cos((D.city.lat * Math.PI) / 180)), b = (bearing * Math.PI) / 180;
  return { lat: D.city.lat + km * Math.cos(b) * kLat, lon: D.city.lon + km * Math.sin(b) * kLon };
}
function boundsOf(pts) {
  if (!pts.length) return null;
  const s = Math.min.apply(null, pts.map((p) => p.lat)), n = Math.max.apply(null, pts.map((p) => p.lat));
  const w = Math.min.apply(null, pts.map((p) => p.lon)), e = Math.max.apply(null, pts.map((p) => p.lon));
  return [[s, w], [n, e]];
}

function NewDiscover() {
  const [mode, setMode_] = React.useState("areas");
  const [buyRent, setBuyRent] = React.useState("Buy");
  const city = "Bangalore";
  // residential geographic path (shared by areas + schools)
  const [regionId, setRegionId] = React.useState(null);
  const [subPath, setSubPath] = React.useState([]);
  const [areaId, setAreaId] = React.useState(null);
  const [schoolId, setSchoolId] = React.useState(null);
  const [browsing, setBrowsing] = React.useState(false);
  // agri path
  const [agriOriginId, setAgriOriginId] = React.useState(null); // null = Bangalore centre
  const [corridorId, setCorridorId] = React.useState(null);
  const [clusterId, setClusterId] = React.useState(null);
  const [maxKm, setMaxKm] = React.useState(D.agri.defaultMaxKm);
  // ui state
  const [filters, setFilters] = React.useState(window.DP_DEFAULT_FILTERS);
  const [agriFilters, setAgriFilters] = React.useState(window.DP_AGRI_DEFAULTS);
  const [radiusKm, setRadiusKm] = React.useState(5);
  // within-area refinements (production parity: search within listings, school board/level/name filters)
  const [listingQuery, setListingQuery] = React.useState("");
  const [schoolQuery, setSchoolQuery] = React.useState("");
  const [schoolBoards, setSchoolBoards] = React.useState([]);
  const [schoolLevels, setSchoolLevels] = React.useState([]);
  const [agriQuery, setAgriQuery] = React.useState("");
  React.useEffect(() => { setListingQuery(""); }, [areaId, browsing]);
  React.useEffect(() => { setSchoolQuery(""); setSchoolBoards([]); setSchoolLevels([]); }, [areaId]);
  React.useEffect(() => { setAgriQuery(""); }, [corridorId, clusterId]);
  const [active, setActive] = React.useState(null);
  const [saved, setSaved] = React.useState(["h1"]);
  const [hover, setHover] = React.useState(null); // { id, src }
  const onHover = React.useCallback((id, src) => setHover(id ? { id, src: src || "panel" } : null), []);
  const toggleSave = (id) => setSaved((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const [isMobile, setIsMobile] = React.useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const f = (e) => setIsMobile(e.matches);
    mq.addEventListener ? mq.addEventListener("change", f) : mq.addListener(f);
    return () => (mq.removeEventListener ? mq.removeEventListener("change", f) : mq.removeListener(f));
  }, []);

  // ---- URL / restorable state (hash) ----
  const bootRef = React.useRef(false);
  const serialize = React.useCallback(() => {
    const p = [];
    if (buyRent === "Rent") p.push("br=rent");
    if (mode !== "areas") p.push("m=" + mode);
    if (mode === "agri") {
      if (agriOriginId) p.push("ao=" + agriOriginId);
      if (corridorId) p.push("c=" + corridorId);
      if (clusterId) p.push("cl=" + clusterId);
      if (maxKm !== D.agri.defaultMaxKm) p.push("km=" + maxKm);
    } else {
      if (browsing) { p.push("b=1"); if (regionId) p.push("r=" + regionId); }
      else {
        if (regionId) p.push("r=" + regionId);
        if (subPath.length) p.push("p=" + subPath.join(""));
        if (areaId) p.push("a=" + areaId);
        if (schoolId) { p.push("s=" + schoolId); if (radiusKm !== 5) p.push("rad=" + radiusKm); }
      }
    }
    return p.length ? "#" + p.join("&") : "#";
  }, [mode, buyRent, regionId, subPath, areaId, schoolId, browsing, agriOriginId, corridorId, clusterId, maxKm, radiusKm]);

  const applyHash = React.useCallback((hash) => {
    const q = {};
    (hash || "").replace(/^#/, "").split("&").filter(Boolean).forEach((kv) => { const [k, v] = kv.split("="); q[k] = v; });
    setBuyRent(q.br === "rent" ? "Rent" : "Buy");
    const m = q.m === "schools" || q.m === "agri" ? q.m : "areas";
    setMode_(m);
    if (m === "agri") {
      setAgriOriginId(q.ao || null); setCorridorId(q.c || null); setClusterId(q.cl || null);
      setMaxKm(q.km ? +q.km : D.agri.defaultMaxKm);
    } else {
      setRegionId(q.r || null);
      setSubPath(q.p ? q.p.split("") : []);
      setAreaId(q.a || null);
      setSchoolId(q.s || null);
      setRadiusKm(q.rad ? +q.rad : 5);
      setBrowsing(q.b === "1");
    }
  }, []);

  React.useEffect(() => {
    if (window.location.hash && window.location.hash !== "#") applyHash(window.location.hash);
    bootRef.current = true;
    const onPop = () => applyHash(window.location.hash);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
    // eslint-disable-next-line
  }, []);
  React.useEffect(() => {
    if (!bootRef.current) return;
    const h = serialize();
    if (h !== window.location.hash) window.history.pushState(null, "", h);
  }, [serialize]);

  // ---- navigation ----
  const resetLeaf = () => { setAreaId(null); setSchoolId(null); setBrowsing(false); setActive(null); };
  const setMode = (m) => {
    if (m === mode) return;
    setActive(null);
    if (m === "agri") {
      if (areaId) setAgriOriginId(areaId); // carry the residential area in as the search origin
      setMode_("agri");
      return;
    }
    // areas ↔ schools (or agri → residential): keep FULL geographic context (region, subPath, area).
    setSchoolId(null); setBrowsing(false);
    setMode_(m);
  };
  const pickNode = (node) => {
    setActive(null);
    if (node.type === "region") { setRegionId(node.id); setSubPath([]); resetLeaf(); return; }
    if (node.type === "cluster") { setSubPath((p) => [...p, node.dir]); resetLeaf(); return; }
    if (node.type === "area") { setAreaId(node.id); setSchoolId(null); setBrowsing(false); return; }
    if (node.type === "corridor") { setCorridorId(node.id); setClusterId(null); setMaxKm(D.agri.defaultMaxKm); setAgriFilters(window.DP_AGRI_DEFAULTS); return; }
    if (node.type === "town") { setClusterId(node.id); setAgriFilters(window.DP_AGRI_DEFAULTS); return; }
  };
  // Direct area search — mode-aware, but always lands on the SAME canonical hierarchy.
  const pickArea = (id) => {
    const area = D.areas.find((a) => a.id === id); if (!area) return;
    setActive(null);
    if (mode === "agri") {
      setAgriOriginId(id); setCorridorId(null); setClusterId(null); setMaxKm(D.agri.defaultMaxKm); setAgriFilters(window.DP_AGRI_DEFAULTS);
      return;
    }
    const p = ND.pathToArea(id, mode === "schools");
    setRegionId(p.regionId); setSubPath(p.subPath); setAreaId(id); setSchoolId(null); setBrowsing(false);
  };
  const resetAgriOrigin = () => { setAgriOriginId(null); setCorridorId(null); setClusterId(null); setActive(null); };
  const onPickSchool = (id) => { setSchoolId(id); setRadiusKm(5); setActive(null); };
  const browseAll = () => { setAreaId(null); setSchoolId(null); setActive(null); setBrowsing(true); };
  const back = () => {
    setActive(null);
    if (mode === "agri") { if (clusterId) return setClusterId(null); if (corridorId) return setCorridorId(null); return; }
    if (browsing) return setBrowsing(false);
    if (schoolId) return setSchoolId(null);
    if (areaId) return setAreaId(null);
    if (subPath.length) return setSubPath((p) => p.slice(0, -1));
    if (regionId) return setRegionId(null);
  };

  const agriOrigin = agriOriginId ? D.areas.find((a) => a.id === agriOriginId) : null;
  const originPt = agriOrigin ? { lat: agriOrigin.lat, lon: agriOrigin.lon, name: agriOrigin.name } : { lat: D.city.lat, lon: D.city.lon, name: city };

  // ---- derive the view ----
  const view = React.useMemo(() => {
    const schools = mode === "schools";
    if (mode === "agri") {
      const origin = agriOrigin ? originPt : null;
      const originMarker = agriOrigin ? { lat: originPt.lat, lon: originPt.lon, name: originPt.name } : null;
      const originCrumb = agriOrigin ? "Origin: " + agriOrigin.name : "Agri land";
      // corridors → towns → parcels
      if (clusterId) {
        const cl = D.agri.clusters.find((c) => c.id === clusterId);
        const corridor = D.agri.corridors.find((c) => c.id === cl.corridor);
        const oDir = origin ? window.BLR_BEARING_DIR(originPt, AG.corridorCentroid(cl.corridor)) : null;
        const raw = D.agri.parcels.filter((p) => p.cluster === clusterId);
        let items = window.DP_applyAgri(raw, agriFilters);
        if (agriQuery.trim()) { const t = agriQuery.trim().toLowerCase(); items = items.filter((p) => (p.title + " " + p.crop + " " + (p.road || "") + " " + (p.soil || "")).toLowerCase().indexOf(t) !== -1); }
        return { domain: "agri", level: "parcels", clusterId, corridorId: cl.corridor, items, itemsRaw: raw, originMarker,
          fitBounds: cl.bounds, fitKey: "agri-parcels-" + clusterId, maxZoom: 13,
          crumb: [city, originCrumb, origin ? DIR_WORD[oDir] : corridor.dir, cl.name.replace(/ cluster$/, "")],
          summary: { icon: "sprout", color: "var(--evergreen-600)", count: items.length, noun: items.length === 1 ? "parcel" : "parcels" } };
      }
      if (corridorId) {
        const corridor = D.agri.corridors.find((c) => c.id === corridorId);
        const towns = AG.visibleTowns(corridorId, maxKm);
        const allTowns = AG.townsOf(corridorId);
        const oDir = origin ? window.BLR_BEARING_DIR(originPt, AG.corridorCentroid(corridorId)) : null;
        const oRange = origin ? AG.corridorDistRange(corridorId, originPt, maxKm) : null;
        const nodes = towns.map((t) => ({ type: "town", id: t.id, markerKind: "town", center: { lat: t.lat, lon: t.lon }, name: t.name, count: AG.townProps(t.id), noun: "parcels", sel: false }));
        const n = AG.dirProps(corridorId, maxKm);
        // directional SEARCH SECTOR: wedge from the origin toward the corridor's real centroid,
        // with cumulative distance bands. Purely a search-scope overlay, not a parcel boundary.
        const centroid = AG.corridorCentroid(corridorId);
        const dy = centroid.lat - originPt.lat, dx = (centroid.lon - originPt.lon) * Math.cos((originPt.lat * Math.PI) / 180);
        const sectorBearing = (Math.atan2(dx, dy) * 180) / Math.PI; // 0=N, 90=E
        const bands = D.agri.distances.slice();
        const maxBand = Math.max.apply(null, bands);
        const sector = { lat: originPt.lat, lon: originPt.lon, bearing: sectorBearing, half: 33, maxKm, bands, maxBand, originName: originPt.name };
        return { domain: "agri", level: "towns", corridorId, maxKm, nodes, originMarker, agriOrigin, oDir, oRange, sector,
          fitBounds: boundsOf(allTowns.map((t) => ({ lat: t.lat, lon: t.lon })).concat([{ lat: originPt.lat, lon: originPt.lon }])), fitKey: "agri-towns-" + corridorId + "-" + (agriOriginId || "city"), maxZoom: 11,
          crumb: [city, originCrumb, origin ? (DIR_WORD[oDir] + " · " + oRange.min + "–" + oRange.max + " km") : corridor.dir],
          summary: { icon: "sprout", color: "var(--evergreen-600)", count: n, noun: n === 1 ? "parcel" : "parcels" } };
      }
      const nodes = D.agri.corridors.map((c) => {
        const centroid = AG.corridorCentroid(c.id);
        const center = origin ? centroid : offsetPt(c.bearing, Math.max(20, AG.maxTownDist(c.id) * 0.55));
        const oDir = origin ? window.BLR_BEARING_DIR(originPt, centroid) : null;
        const oRange = origin ? AG.corridorDistRange(c.id, originPt) : null;
        return { type: "corridor", id: c.id, markerKind: "corridor", center, reps2: c.keyTowns.slice(0, 2), more: Math.max(0, AG.dirGroups(c.id) - 2), count: AG.dirProps(c.id), noun: "parcels", sel: false, name: c.short, oDir, oRange, oSub: origin ? (DIR_WORD[oDir] + " of " + agriOrigin.name) : null };
      });
      return { domain: "agri", level: "corridors", nodes, agriOrigin, originMarker,
        fitBounds: boundsOf(nodes.map((n) => n.center).concat([{ lat: originPt.lat, lon: originPt.lon }])), fitKey: "agri-corridors-" + (agriOriginId || "city"), maxZoom: 9,
        crumb: [city, originCrumb],
        summary: { icon: "sprout", color: "var(--evergreen-600)", count: AG.totalParcels, noun: "parcels" } };
    }

    // residential
    const rv = ND.residentialView({ mode: schools ? "schools" : "areas", regionId, subPath, areaId, schoolId, browseScope: browsing ? (regionId || "") : null });
    const nounPl = schools ? "schools" : "properties";
    const accentColor = schools ? "var(--plum-600)" : "var(--accent)";
    const region = regionId ? ND.region(regionId) : null;
    // Sub-levels are labelled by their lead representative AREA names (never a repeated compass
    // word like "North of North"); direction is carried by map position + the small compass chip.
    const dirTrail = (() => {
      if (!region) return [];
      let areas = ND.areasInRegion(regionId).filter((a) => !schools || ND.hasSchools(a.id));
      let center = region.center; const trail = [];
      for (let i = 0; i < subPath.length; i++) {
        const secs = ND.partition(areas, center);
        const sec = secs.find((s) => s.dir === subPath[i]); if (!sec) break;
        trail.push(ND.reps(sec.areas, schools, 2).join(" & ") || DIR_LABEL[subPath[i]]);
        areas = sec.areas; center = sec.center;
      }
      return trail;
    })();
    const scopeName = region ? (dirTrail.length ? region.name + " · " + dirTrail[dirTrail.length - 1] : region.name) : city;

    if (rv.level === "regions") {
      const nodes = rv.nodes.map((n) => ({ ...n, markerKind: "dir", noun: nounPl, sel: false }));
      return { domain: "res", level: "regions", nodes, total: rv.nodes.reduce((s, n) => s + n.count, 0),
        fitBounds: boundsOf(nodes.map((n) => n.center)), fitKey: "regions-" + mode, maxZoom: 11,
        crumb: [city], summary: { icon: schools ? "building" : "map-pin", color: accentColor, count: schools ? CO.totalSchools : CO.totalHomes, noun: schools ? "schools" : "properties" } };
    }
    if (rv.level === "clusters") {
      const nodes = rv.nodes.map((n) => ({ ...n, markerKind: "dir", noun: nounPl, sel: false }));
      const cnt = rv.nodes.reduce((s, n) => s + n.count, 0);
      return { domain: "res", level: "clusters", nodes, count: cnt, scopeName, crumbLabel: subPath.length ? "Sub-region" : "Region",
        fitBounds: ND.bounds(rv.areas), fitKey: "clusters-" + regionId + "-" + subPath.join("") + "-" + mode, maxZoom: 14,
        crumb: [city, region.short].concat(dirTrail), summary: { icon: schools ? "building" : "map-pin", color: accentColor, count: cnt, noun: nounPl } };
    }
    if (rv.level === "areas") {
      const nodes = rv.nodes.map((n) => ({ ...n, markerKind: "area", name: n.area.name, noun: nounPl, sel: false }));
      const cnt = rv.nodes.reduce((s, n) => s + n.count, 0);
      return { domain: "res", level: "areas", nodes, count: cnt, scopeName, crumbLabel: subPath.length ? "Sub-region" : "Region",
        fitBounds: ND.bounds(rv.areas), fitKey: "areas-" + regionId + "-" + subPath.join("") + "-" + mode, maxZoom: 14,
        crumb: [city, region.short].concat(dirTrail), summary: { icon: schools ? "building" : "map-pin", color: accentColor, count: cnt, noun: nounPl } };
    }
    if (rv.level === "schools") {
      const area = D.areas.find((a) => a.id === areaId);
      const rShort = ND.region(area.region).short;
      const schoolsAll = D.schools.filter((s) => s.areaId === areaId);
      let schoolList = schoolsAll;
      if (schoolBoards.length) schoolList = schoolList.filter((s) => schoolBoards.indexOf(s.board) !== -1);
      if (schoolLevels.length) schoolList = schoolList.filter((s) => (s.levels || []).some((l) => schoolLevels.indexOf(l) !== -1));
      if (schoolQuery.trim()) { const t = schoolQuery.trim().toLowerCase(); schoolList = schoolList.filter((s) => s.name.toLowerCase().indexOf(t) !== -1); }
      const nodes = schoolList.map((s) => ({ type: "school", id: s.id, markerKind: "school", center: { lat: s.lat, lon: s.lon }, name: s.name, count: 0, noun: "school", sel: false }));
      const boardsAvail = Array.from(new Set(schoolsAll.map((s) => s.board)));
      const levelsAvail = Array.from(new Set(schoolsAll.reduce((a, s) => a.concat(s.levels || []), [])));
      const areaListings = D.listings.filter((l) => l.areaId === areaId);
      return { domain: "res", level: "schools", areaId, area, nodes, schoolList, schoolsAll, boardsAvail, levelsAvail, areaListings,
        fitBounds: area.bounds, fitKey: "schools-" + areaId + "-" + schoolList.map((s) => s.id).join(","), maxZoom: 15,
        crumb: [city, rShort].concat(dirTrail).concat([area.name]), summary: { icon: "building", color: accentColor, count: schoolList.length, noun: schoolList.length === 1 ? "school" : "schools" } };
    }
    if (rv.level === "homes") {
      const school = D.schools.find((s) => s.id === schoolId);
      const area = D.areas.find((a) => a.id === school.areaId);
      const rShort = ND.region(area.region).short;
      const items = window.BLR_HOMES_NEAR(school, radiusKm).slice().sort((a, b) => window.BLR_DIST(school, a) - window.BLR_DIST(school, b));
      return { domain: "res", level: "homes", schoolId, school, radiusKm, items,
        fitKey: "homes-" + schoolId + "-" + radiusKm,
        crumb: [city, rShort].concat(dirTrail).concat([area.name, school.name.split(",")[0]]),
        summary: { icon: "map-pin", color: "var(--accent)", count: items.length, noun: window.BLR_NOUN(buyRent, items.length) } };
    }
    if (rv.level === "listings") {
      const area = D.areas.find((a) => a.id === areaId);
      const raw = D.listings.filter((l) => l.areaId === areaId);
      let items = window.DP_applyFilters(raw, filters);
      if (listingQuery.trim()) { const t = listingQuery.trim().toLowerCase(); items = items.filter((l) => (l.title + " " + l.propType + " " + (l.locality || "") + " " + l.beds + " bhk").toLowerCase().indexOf(t) !== -1); }
      return { domain: "res", level: "listings", areaId, area, items, itemsRaw: raw, fitBounds: area.bounds, fitKey: "listings-" + areaId, maxZoom: 15,
        crumb: [city, ND.region(area.region).short].concat(dirTrail).concat([area.name]),
        summary: { icon: "map-pin", color: "var(--accent)", count: items.length, noun: window.BLR_NOUN(buyRent, items.length) } };
    }
    if (rv.level === "browse") {
      const raw = rv.listings;
      const items = window.DP_applyFilters(raw, filters);
      const pts = raw.map((l) => ({ lat: l.lat, lon: l.lon }));
      return { domain: "res", level: "browse", regionId: rv.regionId, items, itemsRaw: raw,
        fitBounds: rv.regionId ? ND.region(rv.regionId).bounds : boundsOf(pts), fitKey: "browse-" + (rv.regionId || "city"), maxZoom: rv.regionId ? 12 : 11,
        crumb: rv.regionId ? [city, ND.region(rv.regionId).short, "All listings"] : [city, "All listings"],
        summary: { icon: "map-pin", color: "var(--accent)", count: items.length, noun: window.BLR_NOUN(buyRent, items.length) } };
    }
    return { domain: "res", level: "regions", nodes: [], summary: { icon: "map-pin", color: accentColor, count: 0, noun: "properties" }, crumb: [city] };
  }, [mode, buyRent, regionId, subPath, areaId, schoolId, browsing, agriOriginId, corridorId, clusterId, maxKm, filters, agriFilters, radiusKm, listingQuery, schoolQuery, schoolBoards, schoolLevels, agriQuery]);

  // ---- back label ----
  const backLabel = (() => {
    if (mode === "agri") { if (clusterId) { const cl = D.agri.clusters.find((c) => c.id === clusterId); return "Back to towns"; } if (corridorId) return "Back to directions"; return null; }
    if (browsing) return "Back";
    if (schoolId) { const s = D.schools.find((x) => x.id === schoolId); return "Back to schools in " + D.areas.find((a) => a.id === s.areaId).name; }
    if (areaId) { const a = D.areas.find((x) => x.id === areaId); return "Back to areas in " + (regionId ? ND.region(regionId).short : city); }
    if (subPath.length) return "Back to " + (subPath.length > 1 ? "the parent cluster" : ND.region(regionId).short + " region");
    if (regionId) return "Back to all regions";
    return null;
  })();
  const showBack = backLabel !== null;

  const instr = (() => {
    if (view.level === "regions") return { eyebrow: "Explore by direction", body: "Each region sits in its true direction from the city. The marker names show what's there — tap one, or a card on the right, to zoom in." };
    if (view.level === "clusters") return { eyebrow: "Directional clusters", body: "This region divides again into clusters that keep their real direction. Tap to zoom in — or pick the matching card." };
    if (view.level === "corridors") return { eyebrow: "Outbound directions", body: agriOrigin ? ("Farmland may lie outside " + agriOrigin.name + ". Explore by direction and distance outward from it.") : "Farmland is grouped by the direction it lies from the city. Tap a corridor to explore its towns by distance." };
    return null;
  })();

  const ctx = {
    mode, setMode, buyRent, setBuyRent, city, view,
    hoverId: hover ? hover.id : null, hoverSrc: hover ? hover.src : null, onHover,
    onPickNode: pickNode, onPickSchool, browseAll, pickArea,
    agriOrigin: agriOrigin ? { name: agriOrigin.name, lat: agriOrigin.lat, lon: agriOrigin.lon } : null, resetAgriOrigin,
    back: showBack ? back : null, backLabel,
    items: view.items, filters, setFilters, agriFilters, setAgriFilters,
    listingQuery, setListingQuery, schoolQuery, setSchoolQuery,
    schoolBoards, setSchoolBoards, schoolLevels, setSchoolLevels,
    agriQuery, setAgriQuery,
    exploreSchools: () => setMode("schools"),
    radiusKm, setRadiusKm, maxKm, setMaxKm, agriDistances: D.agri.distances,
    active, setActive, saved, toggleSave,
    noun: mode === "schools" ? "schools" : "properties",
  };

  const accent = mode === "agri" ? "agri" : mode === "schools" ? "plum" : "copper";

  // Stable screen identifier — mirrors DESIGN_STATE_MANIFEST.json state ids (handoff only, no visible effect).
  const screenId = (() => {
    if (mode === "agri") {
      if (view.level === "parcels") return "agri-town-parcels";
      if (view.level === "towns") return "agri-corridor-towns";
      return agriOriginId ? "agri-area-origin" : "agri-city-default";
    }
    if (mode === "schools") {
      if (view.level === "homes") return "schools-homes-near";
      if (view.level === "schools") return "schools-area-schools";
      if (view.level === "clusters") return "schools-region-clusters";
      if (view.level === "areas") return "schools-region-areas";
      return "schools-city-default";
    }
    if (view.level === "browse") return "areas-browse-all";
    if (view.level === "listings") return "areas-area-listings";
    if (view.level === "clusters") return "areas-region-clusters";
    if (view.level === "areas") return "areas-region-areas";
    return "areas-city-default";
  })();

  return (
    <div data-design-screen={screenId} data-design-mode={mode} data-design-level={view.level} style={{ display: "flex", flexDirection: isMobile ? "column" : "row", height: "calc(100vh - 60px)" }}>
      <div data-design-component="map-surface" style={isMobile
        ? { flex: "0 0 42%", minHeight: "260px", position: "relative", borderBottom: "1px solid var(--border)" }
        : { flex: "0 0 52%", position: "relative", borderRight: "1px solid var(--border)" }}>
        <window.NDMap view={view} accent={accent} crumb={view.crumb} summary={view.summary} instr={instr}
          hoverId={ctx.hoverId} hoverSrc={ctx.hoverSrc} onHover={onHover}
          active={active} onActivate={setActive} onPickNode={pickNode} isMobile={isMobile} />
      </div>
      <div data-design-component="results-panel" style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", background: "var(--background)", ...(isMobile ? { borderRadius: "16px 16px 0 0", marginTop: "-14px", zIndex: 600, boxShadow: "0 -6px 24px rgba(20,26,40,0.12)" } : {}) }}>
        {isMobile && <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 2px", flex: "none" }}><span style={{ width: "40px", height: "4px", borderRadius: "var(--radius-full)", background: "var(--grey-300, #D8D4CC)" }} /></div>}
        <div style={{ padding: "16px 28px 16px", borderBottom: "1px solid var(--border)", background: "var(--background)", flex: "none" }}>
          <window.NDSetup ctx={ctx} isMobile={isMobile} />
        </div>
        <div className="upt-scroll" style={{ flex: 1, overflowY: "auto", padding: "16px 28px 28px" }}>
          <window.NDPanelBody ctx={ctx} />
        </div>
      </div>
    </div>
  );
}

window.NewDiscover = NewDiscover;

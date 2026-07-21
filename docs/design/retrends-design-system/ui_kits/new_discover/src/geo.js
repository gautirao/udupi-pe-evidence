// ============================================================================
// Discover V2 — directional navigation engine. Exports window.ND
//
// ONE partition function generates up to five directional sectors (N/E/S/W/Centre)
// from a set of areas relative to a centre point. It runs at every geographic level
// so the same directional grammar recurses: city → region → sub-cluster → area.
//
//   • City level uses the authored macro-regions (north/south/east/west/central) —
//     directionally correct by construction, with editorial names + cues.
//   • Every level below is GENERATED from area coordinates relative to the parent's
//     own extent, so a northern sub-cluster always sits north of its parent, etc.
//   • Direction is carried by geographic POSITION on the map. Markers never spell out
//     "North / South"; they show representative destination names instead.
// ============================================================================
window.ND = (function () {
  const D = window.BLR_DATA;
  const CO = window.BLR_COUNTS;
  const city = D.city;

  const MIN_SPLIT = 8;               // below this, a region/cluster lists individual areas
  const DIR_LABEL = { N: "North", E: "East", S: "South", W: "West", C: "Central" };

  const region = (id) => D.regions.find((r) => r.id === id);
  const areasInRegion = (id) => D.areas.filter((a) => a.region === id);
  const hasSchools = (id) => CO.schoolsArea(id) > 0;

  function kmOffset(a, c) {
    const dy = (a.lat - c.lat) * 111;                                   // +y = north
    const dx = (a.lon - c.lon) * 111 * Math.cos((c.lat * Math.PI) / 180); // +x = east
    return { dx, dy, dist: Math.hypot(dx, dy) };
  }
  function centroid(areas) {
    if (!areas.length) return { lat: city.lat, lon: city.lon };
    return {
      lat: areas.reduce((s, a) => s + a.lat, 0) / areas.length,
      lon: areas.reduce((s, a) => s + a.lon, 0) / areas.length,
    };
  }
  function bounds(areas) {
    if (!areas.length) return null;
    let s = 90, n = -90, w = 180, e = -180;
    areas.forEach((a) => { s = Math.min(s, a.lat); n = Math.max(n, a.lat); w = Math.min(w, a.lon); e = Math.max(e, a.lon); });
    return [[s, w], [n, e]];
  }

  // Count of homes (or schools) over a set of areas.
  function countAreas(areas, schools) {
    return areas.reduce((s, a) => s + (schools ? CO.schoolsArea(a.id) : CO.homesArea(a.id)), 0);
  }
  // Representative destination names — the biggest areas first.
  function reps(areas, schools, n) {
    return areas.slice().sort((a, b) => (schools ? CO.schoolsArea(b.id) - CO.schoolsArea(a.id) : CO.homesArea(b.id) - CO.homesArea(a.id)) || a.name.localeCompare(b.name)).slice(0, n).map((a) => a.name);
  }

  // Partition a set of areas into directional sectors relative to `center`.
  // Returns [{ dir, dirLabel, key, areas, areaIds, center, bearing, isCentre }] — only
  // non-empty sectors, ordered N,E,S,W,Centre.
  function partition(areas, center) {
    if (!areas.length) return [];
    const offs = areas.map((a) => ({ a, ...kmOffset(a, center) }));
    const maxD = Math.max.apply(null, offs.map((o) => o.dist)) || 1;
    const cr = Math.max(1.4, maxD * 0.30);      // inner "centre" catchment
    const b = { N: [], E: [], S: [], W: [], C: [] };
    offs.forEach((o) => {
      if (o.dist <= cr) { b.C.push(o.a); return; }
      const ang = (Math.atan2(o.dx, o.dy) * 180) / Math.PI;   // 0=N, 90=E, ±180=S, -90=W
      let d;
      if (ang >= -45 && ang < 45) d = "N";
      else if (ang >= 45 && ang < 135) d = "E";
      else if (ang >= -135 && ang < -45) d = "W";
      else d = "S";
      b[d].push(o.a);
    });
    return ["N", "E", "S", "W", "C"].filter((d) => b[d].length).map((d) => {
      const as = b[d];
      const ctr = centroid(as);
      return { dir: d, dirLabel: DIR_LABEL[d], key: d, areas: as, areaIds: as.map((x) => x.id), center: ctr, bearing: kmOffset(ctr, center), isCentre: d === "C" };
    });
  }

  // Walk a region + directional subPath (array of dir keys) → the current working set.
  function walk(regionId, subPath, schools) {
    let areas = areasInRegion(regionId).filter((a) => !schools || hasSchools(a.id));
    let center = region(regionId).center;
    for (let i = 0; i < subPath.length; i++) {
      const secs = partition(areas, center);
      const sec = secs.find((s) => s.dir === subPath[i]);
      if (!sec) break;
      areas = sec.areas; center = sec.center;
    }
    return { areas, center };
  }

  // The view descriptor the map + panel both render from the residential state.
  //   state = { mode:'areas'|'schools', regionId, subPath:[], areaId, schoolId, browseScope }
  function residentialView(st) {
    const schools = st.mode === "schools";
    // ---- leaves ----
    if (st.browseScope !== undefined && st.browseScope !== null) {
      const rid = st.browseScope || null;
      const list = rid ? D.listings.filter((l) => l.region === rid) : D.listings.slice();
      return { level: "browse", regionId: rid, listings: list };
    }
    if (schools && st.schoolId) return { level: "homes", schoolId: st.schoolId };
    if (st.areaId) return { level: schools ? "schools" : "listings", areaId: st.areaId };
    // ---- city → macro regions ----
    if (!st.regionId) {
      const nodes = D.regions.map((r) => {
        const as = areasInRegion(r.id).filter((a) => !schools || hasSchools(a.id));
        return {
          type: "region", id: r.id, region: r, dir: r.short, dirLabel: r.name, isCentre: r.id === "central",
          areas: as, center: r.center, count: countAreas(as, schools),
          reps2: reps(as, schools, 2), reps4: reps(as, schools, 4), total: as.length,
        };
      }).filter((n) => n.areas.length);
      return { level: "regions", nodes, center: city, scopeAreas: D.areas };
    }
    // ---- inside a region: generated directional sub-clusters, or individual areas ----
    const { areas, center } = walk(st.regionId, st.subPath, schools);
    const secs = partition(areas, center);
    if (areas.length > MIN_SPLIT && secs.length >= 2) {
      const nodes = secs.map((s) => ({
        type: "cluster", id: s.dir, dir: s.dir, dirLabel: s.dirLabel, isCentre: s.isCentre,
        areas: s.areas, center: s.center, count: countAreas(s.areas, schools),
        reps2: reps(s.areas, schools, 2), reps4: reps(s.areas, schools, 4), total: s.areas.length,
      }));
      return { level: "clusters", nodes, areas, center };
    }
    // individual areas
    const nodes = areas.slice().sort((a, b) => (schools ? CO.schoolsArea(b.id) - CO.schoolsArea(a.id) : CO.homesArea(b.id) - CO.homesArea(a.id)))
      .map((a) => ({ type: "area", id: a.id, area: a, center: { lat: a.lat, lon: a.lon }, count: schools ? CO.schoolsArea(a.id) : CO.homesArea(a.id) }));
    return { level: "areas", nodes, areas, center };
  }

  // Resolve an area to its canonical generated directional path, so a DIRECT area
  // search lands on exactly the same {regionId, subPath} the guided drill-down would.
  // Mirrors residentialView's descent: keep splitting while a level would show clusters.
  function pathToArea(areaId, schools) {
    const area = D.areas.find((a) => a.id === areaId);
    if (!area) return { regionId: null, subPath: [] };
    const regionId = area.region;
    let areas = areasInRegion(regionId).filter((a) => !schools || hasSchools(a.id));
    let center = region(regionId).center;
    const subPath = [];
    for (let guard = 0; guard < 10; guard++) {
      const secs = partition(areas, center);
      if (!(areas.length > MIN_SPLIT && secs.length >= 2)) break;
      const sec = secs.find((s) => s.areaIds.indexOf(areaId) !== -1);
      if (!sec) break;
      subPath.push(sec.dir);
      areas = sec.areas; center = sec.center;
    }
    return { regionId, subPath };
  }

  return {
    MIN_SPLIT, DIR_LABEL, region, areasInRegion, hasSchools,
    kmOffset, centroid, bounds, countAreas, reps, partition, walk, residentialView, pathToArea,
  };
})();

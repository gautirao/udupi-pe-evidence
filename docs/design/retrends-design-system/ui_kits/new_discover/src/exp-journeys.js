// Discover experience — journey adapters.
// Two journeys were present in the existing product (ui_kits/new_discover/index.html)
// and are restored here on top of the canonical EXP catalogue:
//   • SCHOOLS  — the residential directional path, school-oriented, plus a city-wide
//                school-name search (board / level filters, radius homes).
//   • AGRI     — the separate agricultural model (BLR_DATA.agri): outbound direction
//                from an ORIGIN (city centre, or the area you came from) → distance
//                band → town → parcels. Never mixed with residential counts.
(function () {
  const EX = window.EXP;
  const cityPt = { lat: EX.city.lat, lon: EX.city.lon, name: "Bangalore" };

  // ---- schools ---------------------------------------------------------------
  let flat = null;
  function allSchools() {
    if (flat) return flat;
    flat = [];
    EX.areas.forEach((a) => EX.schoolsOf(a.key).forEach((s) => flat.push({ ...s, areaKey: a.key, area: a.name, direction: a.direction, local: a.local, address: a.name + ", Bangalore" })));
    return flat;
  }
  const schoolById = (id) => allSchools().find((s) => s.id === id) || null;
  const schoolsIn = (areaKey) => allSchools().filter((s) => s.areaKey === areaKey);
  // distinct schools physically located inside a SET of selected areas
  const schoolsInAreas = (keys) => allSchools().filter((s) => keys.indexOf(s.areaKey) !== -1);
  const schoolsUnder = (nodeKey) => {
    if (nodeKey === "blr") return EX.areas.reduce((s, a) => s + a.schools, 0);
    if (EX.byKey[nodeKey]) return EX.byKey[nodeKey].schools;
    if (EX.locals.some((l) => l.key === nodeKey)) return EX.areasOfLocal(nodeKey).reduce((s, a) => s + a.schools, 0);
    return EX.areasOfDirection(nodeKey).reduce((s, a) => s + a.schools, 0);
  };
  const repsBySchools = (list, k) => list.slice().sort((a, b) => b.schools - a.schools).slice(0, k || 2).map((a) => a.name);
  const withSchools = (list) => list.filter((a) => a.schools > 0);

  // directional children, counted in SCHOOLS (mirrors EX.childrenOf shape).
  // Structural destinations are stable: names, position and presence never move.
  function schoolChildrenOf(nodeKey) {
    const node = (kind, key, label, all, extra) => ({
      kind, key, label, names: repsBySchools(all, 2), matchAreas: withSchools(all).length, totalAreas: all.length,
      n: all.reduce((s, a) => s + a.schools, 0), schools: all.reduce((s, a) => s + a.schools, 0),
      center: EX.centerOf(all), bounds: EX.boundsOf(all), ...extra
    });
    if (nodeKey === "blr") {
      return EX.directions.map((d) => node("direction", d.key, d.label, EX.areasOfDirection(d.key), { short: d.short, slot: d.bearing }));
    }
    const dir = EX.directions.find((d) => d.key === nodeKey);
    if (dir) {
      const ls = EX.locals.filter((l) => l.direction === dir.key);
      if (ls.length) {
        const parent = EX.centerOf(EX.areasOfDirection(dir.key));
        return ls.map((l) => {
          const all = EX.areasOfLocal(l.key);
          return node("local", l.key, l.label, all, { bearing: EX.bearingOf(parent, EX.centerOf(all)) });
        });
      }
      return areaSchoolChildren(withSchools(EX.areasOfDirection(dir.key)));
    }
    const loc = EX.locals.find((l) => l.key === nodeKey);
    if (loc) return areaSchoolChildren(withSchools(EX.areasOfLocal(loc.key)));
    return [];
  }
  function areaSchoolChildren(list) {
    return list.map((a) => ({ kind: "area", key: a.key, label: a.name, n: a.schools, schools: a.schools, listings: a.n, center: { lat: a.lat, lon: a.lon }, bounds: a.bounds }));
  }
  // presentation-only clusters, reused from the areas journey definitions
  function schoolClustersFor(nodeKey) {
    const kids = schoolChildrenOf(nodeKey);
    if (!kids.length || kids[0].kind !== "area") return { clusters: [], singles: kids };
    const used = {}, out = [];
    EX.clusters.filter((c) => c.local === nodeKey).forEach((c) => {
      const members = c.members.filter((k) => kids.some((x) => x.key === k));
      if (members.length < 2) return;
      members.forEach((k) => (used[k] = true));
      const list = members.map((k) => EX.byKey[k]);
      out.push({ kind: "cluster", key: c.key, members, names: repsBySchools(list, 2), more: members.length - 2, n: list.reduce((s, a) => s + a.schools, 0), schools: list.reduce((s, a) => s + a.schools, 0), listings: list.reduce((s, a) => s + a.n, 0), center: EX.centerOf(list), bounds: EX.boundsOf(list) });
    });
    return { clusters: out, singles: kids.filter((k) => !used[k.key]) };
  }

  const BOARD_ORDER = ["CBSE", "ICSE", "State", "IB"];
  const LEVEL_ORDER = ["Primary", "Secondary", "Higher Secondary"];
  const boardsIn = (list) => BOARD_ORDER.filter((b) => list.some((s) => s.board === b));
  const levelsIn = (list) => LEVEL_ORDER.filter((l) => list.some((s) => s.levels.indexOf(l) !== -1));
  function schoolsFilter(list, q, boards, levels) {
    let out = list;
    if (boards && boards.length) out = out.filter((s) => boards.indexOf(s.board) !== -1);
    if (levels && levels.length) out = out.filter((s) => s.levels.some((l) => levels.indexOf(l) !== -1));
    const t = (q || "").trim().toLowerCase();
    if (t) out = out.filter((s) => (s.name + " " + s.area).toLowerCase().indexOf(t) !== -1);
    return out;
  }
  // city-wide school-name search (direct access — no forced funnel)
  const searchSchools = (q) => {
    const t = (q || "").trim().toLowerCase();
    if (!t) return [];
    return allSchools().filter((s) => (s.name + " " + s.area).toLowerCase().indexOf(t) !== -1).slice(0, 6);
  };

  // ---- agricultural ----------------------------------------------------------
  const AD = () => window.BLR_DATA.agri;
  const AG = () => window.BLR_AGRI;
  const DIR_WORD = { N: "North", E: "East", S: "South", W: "West" };
  const kLat = 1 / 111;
  const kLon = (lat) => 1 / (111 * Math.cos((lat * Math.PI) / 180));
  function offsetPt(from, bearing, km) {
    const b = (bearing * Math.PI) / 180;
    return { lat: from.lat + km * Math.cos(b) * kLat, lon: from.lon + km * Math.sin(b) * kLon(from.lat) };
  }
  function bearingTo(from, to) {
    const dy = to.lat - from.lat, dx = (to.lon - from.lon) * Math.cos((from.lat * Math.PI) / 180);
    return (Math.atan2(dx, dy) * 180) / Math.PI;
  }
  // directional search SECTOR — a scope overlay, never a parcel boundary
  function wedge(origin, bearing, half, km) {
    const pts = [[origin.lat, origin.lon]];
    for (let a = -half; a <= half; a += 6) {
      const p = offsetPt(origin, bearing + a, km);
      pts.push([p.lat, p.lon]);
    }
    return pts;
  }
  const corridorOf = (id) => AD().corridors.find((c) => c.id === id) || null;
  const townOf = (id) => AD().clusters.find((c) => c.id === id) || null;
  const originPtOf = (key) => (key && EX.byKey[key] ? { lat: EX.byKey[key].lat, lon: EX.byKey[key].lon, name: EX.byKey[key].name } : cityPt);

  function agriCorridorNodes(originKey) {
    const origin = originKey ? originPtOf(originKey) : null;
    return AD().corridors.map((c) => {
      const centroid = AG().corridorCentroid(c.id);
      const center = origin ? centroid : offsetPt(cityPt, c.bearing, Math.max(20, AG().maxTownDist(c.id) * 0.55));
      const oDir = origin ? DIR_WORD[window.BLR_BEARING_DIR(origin, centroid)] : null;
      const range = origin ? AG().corridorDistRange(c.id, origin) : null;
      return {
        kind: "corridor", key: c.id, label: origin ? oDir + " of " + origin.name : c.short,
        sub: c.keyTowns.slice(0, 2).join(" · ") + (AG().dirGroups(c.id) > 2 ? "  ·  +" + (AG().dirGroups(c.id) - 2) + " towns" : ""),
        n: AG().dirProps(c.id), noun: "parcels", center, tone: "agri",
        range: range ? range.min + "–" + range.max + " km" : AG().maxTownDist(c.id) + " km out"
      };
    });
  }
  function agriTowns(corridorId, maxKm, q) {
    let towns = AG().visibleTowns(corridorId, maxKm);
    const t = (q || "").trim().toLowerCase();
    if (t) towns = towns.filter((c) => (c.name + " " + (c.blurb || "")).toLowerCase().indexOf(t) !== -1);
    return towns;
  }
  function agriParcels(clusterId, filters, q) {
    const raw = AD().parcels.filter((p) => p.cluster === clusterId);
    let items = window.DP_applyAgri(raw, filters);
    const t = (q || "").trim().toLowerCase();
    if (t) items = items.filter((p) => (p.title + " " + (p.crop || "") + " " + (p.road || "") + " " + (p.soil || "")).toLowerCase().indexOf(t) !== -1);
    return { items, raw };
  }

  window.EXJ = {
    cityPt, allSchools, schoolById, schoolsIn, schoolsInAreas, schoolsUnder, schoolChildrenOf, schoolClustersFor,
    boardsIn, levelsIn, schoolsFilter, searchSchools, homesNear: EX.homesNearSchool,
    DIR_WORD, offsetPt, bearingTo, wedge, corridorOf, townOf, originPtOf,
    agriCorridorNodes, agriTowns, agriParcels
  };
})();

// Discover experience — canonical mock backend.
// One catalogue of canonical AREAS with real coordinates; the shallow shopper
// hierarchy (City → Direction → [Local destination] → Area) is derived from it.
// Listings are generated deterministically so every count on screen is a real
// count of real records.
(function () {
  const IMG = [
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=720&h=480&fit=crop",
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=720&h=480&fit=crop",
    "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=720&h=480&fit=crop",
    "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=720&h=480&fit=crop",
    "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=720&h=480&fit=crop",
    "https://images.unsplash.com/photo-1576941089067-2de3c901e126?w=720&h=480&fit=crop"
  ];
  const A = (key, name, lat, lon, listings, schools, local, direction) => ({ key, name, lat, lon, n: listings, schools, local, direction, bounds: [[lat - 0.013, lon - 0.014], [lat + 0.013, lon + 0.014]] });

  const areas = [
    // North · Hebbal · Yelahanka
    A("hebbal", "Hebbal", 13.0358, 77.5970, 42, 12, "hebbal-yelahanka", "north"),
    A("nagawara", "Nagawara", 13.0450, 77.6210, 31, 9, "hebbal-yelahanka", "north"),
    A("jakkur", "Jakkur", 13.0760, 77.6070, 22, 7, "hebbal-yelahanka", "north"),
    A("yelahanka", "Yelahanka", 13.1030, 77.5960, 31, 8, "hebbal-yelahanka", "north"),
    A("kempapura", "Kempapura", 13.0570, 77.5860, 8, 3, "hebbal-yelahanka", "north"),
    A("amruthahalli", "Amruthahalli", 13.0700, 77.5790, 6, 2, "hebbal-yelahanka", "north"),
    A("ganganagar", "Ganganagar", 13.0080, 77.6050, 11, 4, "hebbal-yelahanka", "north"),
    // North · Devanahalli · Airport
    A("devanahalli", "Devanahalli", 13.2450, 77.7130, 26, 4, "devanahalli-airport", "north"),
    A("bagalur", "Bagalur", 13.1320, 77.6700, 9, 2, "devanahalli-airport", "north"),
    A("airport-road", "Airport Road", 13.1700, 77.6320, 13, 3, "devanahalli-airport", "north"),
    // North · Hennur · Thanisandra
    A("thanisandra", "Thanisandra", 13.0580, 77.6250, 24, 6, "hennur-thanisandra", "north"),
    A("hennur", "Hennur", 13.0410, 77.6360, 17, 5, "hennur-thanisandra", "north"),
    A("kothanur", "Kothanur", 13.0570, 77.6480, 9, 3, "hennur-thanisandra", "north"),
    // East (direct AREA children — a sparse direction)
    A("whitefield", "Whitefield", 12.9698, 77.7500, 68, 14, null, "east"),
    A("marathahalli", "Marathahalli", 12.9560, 77.7010, 52, 11, null, "east"),
    A("krpuram", "KR Puram", 13.0100, 77.6800, 31, 6, null, "east"),
    A("budigere", "Budigere Cross", 13.0350, 77.7500, 18, 3, null, "east"),
    // South
    A("jpnagar", "JP Nagar", 12.9100, 77.5850, 61, 13, null, "south"),
    A("jayanagar", "Jayanagar", 12.9250, 77.5830, 44, 12, null, "south"),
    A("bannerghatta", "Bannerghatta Road", 12.8600, 77.5850, 39, 7, null, "south"),
    A("electronic-city", "Electronic City", 12.8450, 77.6600, 47, 9, null, "south"),
    // West
    A("rajajinagar", "Rajajinagar", 12.9880, 77.5520, 38, 8, null, "west"),
    A("vijayanagar", "Vijayanagar", 12.9720, 77.5300, 33, 7, null, "west"),
    A("nagarbhavi", "Nagarbhavi", 12.9600, 77.5100, 26, 5, null, "west"),
    A("kengeri", "Kengeri", 12.9070, 77.4850, 29, 4, null, "west"),
    // Centre
    A("indiranagar", "Indiranagar", 12.9716, 77.6412, 34, 9, null, "centre"),
    A("domlur", "Domlur", 12.9600, 77.6380, 21, 5, null, "centre"),
    A("shivajinagar", "Shivajinagar", 12.9850, 77.6050, 17, 4, null, "centre")
  ];
  const byKey = {};
  areas.forEach((a) => (byKey[a.key] = a));

  const directions = [
    { key: "north", label: "North Bangalore", short: "North", bearing: "N" },
    { key: "east", label: "East Bangalore", short: "East", bearing: "E" },
    { key: "south", label: "South Bangalore", short: "South", bearing: "S" },
    { key: "west", label: "West Bangalore", short: "West", bearing: "W" },
    { key: "centre", label: "Central Bangalore", short: "Centre", bearing: "C" }
  ];
  const locals = [
    { key: "hebbal-yelahanka", label: "Hebbal · Yelahanka", direction: "north" },
    { key: "devanahalli-airport", label: "Devanahalli · Airport", direction: "north" },
    { key: "hennur-thanisandra", label: "Hennur · Thanisandra", direction: "north" }
  ];
  // density clusters are MAP PRESENTATION only — never hierarchy nodes
  const clusters = [
    { key: "c-hebbal-nagawara", local: "hebbal-yelahanka", members: ["hebbal", "nagawara", "kempapura", "amruthahalli", "ganganagar"] },
    { key: "c-jakkur-yelahanka", local: "hebbal-yelahanka", members: ["jakkur", "yelahanka"] }
  ];
  // nearby = geography first (shared boundary / distance), inventory only ranks
  const adjacency = {
    hebbal: [["nagawara", "Adjacent"], ["jakkur", null], ["kempapura", "Adjacent"], ["ganganagar", null], ["amruthahalli", null], ["thanisandra", null]],
    nagawara: [["hebbal", "Adjacent"], ["thanisandra", "Adjacent"], ["jakkur", null], ["hennur", null]],
    jakkur: [["yelahanka", "Adjacent"], ["hebbal", null], ["amruthahalli", "Adjacent"], ["thanisandra", null]],
    yelahanka: [["jakkur", "Adjacent"], ["amruthahalli", "Adjacent"], ["airport-road", null]],
    whitefield: [["marathahalli", "Adjacent"], ["budigere", null], ["krpuram", null]],
    jpnagar: [["jayanagar", "Adjacent"], ["bannerghatta", "Adjacent"], ["electronic-city", null]]
  };

  const dist = (a, b) => {
    const R = 6371, r = (d) => (d * Math.PI) / 180;
    const dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  };

  // ---- deterministic listings ------------------------------------------------
  let seed = 20260727;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const TYPES = ["Apartment", "Apartment", "Villa", "Plot", "Apartment", "Villa"];
  const listings = [];
  areas.forEach((a) => {
    for (let i = 0; i < a.n; i++) {
      const propType = TYPES[Math.floor(rnd() * TYPES.length)];
      const beds = propType === "Plot" ? 0 : 1 + Math.floor(rnd() * 4);
      const base = propType === "Villa" ? 12000000 : propType === "Plot" ? 7000000 : 3200000;
      const price = Math.round((base + rnd() * 6000000 + beds * 1200000) / 100000) * 100000;
      const sqft = propType === "Plot" ? 1200 + Math.round(rnd() * 40) * 30 : 520 + beds * 320 + Math.round(rnd() * 20) * 15;
      // Rent is a different inventory, not a different label: plots are never let, and
      // only part of the sale stock is also available to rent, with its own monthly price.
      const forRent = propType !== "Plot" && rnd() > 0.52;
      const rent = Math.round((price / 330 + beds * 2800 + (propType === "Villa" ? 14000 : 0)) / 500) * 500;
      listings.push({
        forRent, rent,
        id: a.key + "-" + i, areaKey: a.key, area: a.name, locality: a.name + (i % 3 === 0 ? " Main Road" : i % 3 === 1 ? " Ring Road" : " Layout"),
        lat: a.lat + (rnd() - 0.5) * 0.018, lon: a.lon + (rnd() - 0.5) * 0.02,
        price, propType, beds: beds || 0, baths: Math.max(1, beds - (rnd() > 0.6 ? 1 : 0)), sqft,
        title: (propType === "Plot" ? sqft.toLocaleString("en-IN") + " sq.ft plot" : beds + " BHK " + propType.toLowerCase()) + " · " + a.name,
        image: IMG[Math.floor(rnd() * IMG.length)],
        trustTier: rnd() > 0.62 ? "verified" : rnd() > 0.4 ? "trusted" : "listed",
        ready: rnd() > 0.45, tag: rnd() > 0.86 ? "New" : null
      });
    }
  });
  // Commercial inventory is appended to the SAME catalogue (additive). It is invisible
  // to every existing count because `passes` rejects it unless the property-type filter
  // is on Commercial — see src/exp-commercial.js.
  if (window.EXP_COM) listings.push.apply(listings, window.EXP_COM.build(areas));
  // The pre-Commercial catalogue size, captured before the append, so every existing
  // "N listings" cue keeps reporting exactly what it reported before Commercial.
  const residentialCount = listings.filter((l) => l.kind !== "commercial").length;

  // ---- filters ---------------------------------------------------------------
  // Two independent axes:
  //   family  — "Residential" | "Commercial" (the top-level TYPE control)
  //   subtype — scoped to its family and remembered per family:
  //             ptype   holds the Residential subtype (single-select, unchanged)
  //             comSubs holds the Commercial subtypes  (multi-select)
  // Attribute filters are context-sensitive and each keeps its own field, so no
  // selection is ever reinterpreted as another:
  //             beds        dwelling bedrooms   (Apartment / Villa / House)
  //             carpetArea  minimum carpet sq ft (Apartment / Villa / House)
  //             plotArea    minimum plot sq ft   (Plots)
  //             maxPrice    Residential budget
  //             comMaxPrice Commercial budget   (independent of the Residential one)
  // Area is available to EVERY Residential subtype — carpet area for dwellings, plot
  // size for plots — and the two are separate fields, never each other's stand-in.
  // Because the two families' budgets live in different fields, switching family
  // restores that family's last budget selection untouched.
  // Agricultural is NOT a family — it remains its own Discover journey.
  const DEFAULT_FILTERS = { family: "Residential", purpose: "Buy", beds: 0, carpetArea: 0, plotArea: 0, maxPrice: 0, comMaxPrice: 0, comArea: 0, ptype: "Any type", ready: false, verified: false, comSubs: [] };

  // Illustrative budget thresholds — chosen to span the fixture set, not derived
  // from verified listing data. Commercial stock sits an order of magnitude above
  // residential, so the two families carry their own ladders.
  const BUDGETS = {
    Residential: {
      Buy: [{ k: 0, l: "Any price" }, { k: 5000000, l: "≤ ₹50 L" }, { k: 8000000, l: "≤ ₹80 L" }, { k: 12000000, l: "≤ ₹1.2 Cr" }],
      Rent: [{ k: 0, l: "Any rent" }, { k: 20000, l: "≤ ₹20k/mo" }, { k: 35000, l: "≤ ₹35k/mo" }, { k: 60000, l: "≤ ₹60k/mo" }]
    },
    Commercial: {
      Buy: [{ k: 0, l: "Any price" }, { k: 10000000, l: "≤ ₹1 Cr" }, { k: 25000000, l: "≤ ₹2.5 Cr" }, { k: 50000000, l: "≤ ₹5 Cr" }],
      // Monthly values with the unit spelled out, so a Rent / Lease state can never be
      // mistaken for purchase bands.
      Rent: [{ k: 0, l: "Any rent" }, { k: 50000, l: "≤ ₹50K / month" }, { k: 100000, l: "≤ ₹1L / month" }, { k: 200000, l: "≤ ₹2L / month" }]
    }
  };
  const budgetsFor = (f) => BUDGETS[f.family === "Commercial" ? "Commercial" : "Residential"][f.purpose === "Rent" ? "Rent" : "Buy"];
  const budgetLabel = (f, v) => {
    const hit = budgetsFor(f).filter((b) => b.k === v)[0];
    return hit ? hit.l : "≤ " + (f.purpose === "Rent" ? rentShort(v) : inrShort(v));
  };
  // Illustrative area thresholds. "sq ft" is visible on every non-default choice.
  // Carpet area governs dwellings; plot size governs plots. Separate ladders because
  // the two measure different things.
  const CARPET_AREAS = [{ k: 0, l: "Any size" }, { k: 600, l: "600+ sq ft" }, { k: 1000, l: "1,000+ sq ft" }, { k: 1500, l: "1,500+ sq ft" }];
  const PLOT_AREAS = [{ k: 0, l: "Any size" }, { k: 600, l: "600+ sq ft" }, { k: 1200, l: "1,200+ sq ft" }, { k: 2400, l: "2,400+ sq ft" }];
  // Commercial area — one field, but the LABEL follows the selected subtype because
  // the same number means a different thing per subtype. Illustrative thresholds.
  const COM_AREAS = [{ k: 0, l: "Any size" }, { k: 1000, l: "1,000+ sq ft" }, { k: 2500, l: "2,500+ sq ft" }, { k: 5000, l: "5,000+ sq ft" }];
  const COM_AREA_LABEL = { shop: "Built-up area (sq ft)", office: "Built-up area (sq ft)", building: "Built-up area (sq ft)", warehouse: "Warehouse area (sq ft)", land: "Plot size (sq ft)" };
  const comAreaLabel = (f) => {
    const subs = (f && f.comSubs) || [];
    return subs.length === 1 ? (COM_AREA_LABEL[subs[0]] || "Area (sq ft)") : "Area (sq ft)";
  };

  // Result nouns follow the selected family and subtype: Commercial never borrows a
  // residential noun, and a plot is never called a home.
  function nounsOf(f) {
    const rent = f.purpose === "Rent";
    const com = f.family === "Commercial";
    const plot = !com && f.ptype === "Plot";
    const base = com ? "commercial listing" : plot ? "plot" : rent ? "rental" : "listing";
    const unit = com ? "commercial property" : plot ? "plot" : "home";
    // "commercial property" does not pluralise by adding s — the plural is carried
    // explicitly rather than derived, so no surface can print "commercial propertys".
    const units = com ? "commercial properties" : plot ? "plots" : "homes";
    const suffix = rent ? " to rent" : " for sale";
    return {
      plural: base + "s",
      count: (k) => (k === 1 ? base : base + "s"),
      deal: (k) => (k === 1 ? unit : units) + suffix,
      dealPlural: units + suffix,
      inPlace: (p) => (com ? "Commercial properties in " : plot ? "Plots in " : rent ? "Homes to rent in " : "Properties in ") + p,
      allCity: com ? "All commercial properties in Bangalore" : plot ? "All plots in Bangalore" : rent ? "All homes to rent in Bangalore" : "All homes in Bangalore",
      dealScope: (com ? (rent ? "Commercial to rent · " : "Commercial for sale · ") : plot ? "Plots for sale · " : rent ? "Homes to rent · " : "Homes for sale · "),
      unitPlural: units
    };
  }

  // Which inventories the current selection can actually return. `passes` keys off
  // the per-listing kind, so every REPORTING site (filter labels, scope chips, the
  // filter row itself) must key off these same predicates — re-deriving the test
  // locally is how the plot-size narrowing came to be applied but never reported.
  // Plots are sale-only stock, so a Rent search never returns them.
  const showsHomes = (f) => f.family !== "Commercial" && f.ptype !== "Plot";
  const showsPlots = (f) => f.family !== "Commercial" && (f.ptype === "Plot" || (f.ptype === "Any type" && f.purpose !== "Rent"));

  const filterLabels = (f) => {
    const out = [f.purpose];
    if (window.EXP_COM && f.family === "Commercial") {
      const l = out.concat(window.EXP_COM.labels(f));
      if (f.comArea) l.push(f.comArea.toLocaleString("en-IN") + "+ sq ft");
      if (f.comMaxPrice) l.push("up to " + budgetLabel(f, f.comMaxPrice).replace("≤ ", ""));
      if (f.verified) l.push("Broker identity verified");
      return l;
    }
    if (showsHomes(f) && f.beds) out.push(f.beds + "+ BHK");
    if (showsHomes(f) && f.carpetArea) out.push(f.carpetArea.toLocaleString("en-IN") + "+ sq ft carpet");
    if (showsPlots(f) && f.plotArea) out.push(f.plotArea.toLocaleString("en-IN") + "+ sq ft plot");
    if (f.maxPrice) out.push("up to " + (f.purpose === "Rent" ? rentShort(f.maxPrice) : inrShort(f.maxPrice)));
    if (f.ptype !== "Any type") out.push(f.ptype);
    if (f.ready) out.push("Ready to move");
    if (f.verified) out.push("Broker identity verified");
    return out;
  };
  const passes = (l, f) => {
    // The family decides which catalogue is in play. A Commercial record is invisible
    // to the Residential family and vice versa, so every pre-Commercial count holds.
    const com = f.family === "Commercial";
    if (com || l.kind === "commercial") return com && window.EXP_COM ? window.EXP_COM.passes(l, f) : false;
    if (f.purpose === "Rent" && !l.forRent) return false;
    // Bedrooms and carpet area apply to dwellings only, and plot size to plots only —
    // the controls are labelled that way, so neither may quietly filter the other's
    // inventory out.
    const isPlot = l.propType === "Plot";
    if (!isPlot && f.beds && l.beds < f.beds) return false;
    if (!isPlot && f.carpetArea && l.sqft < f.carpetArea) return false;
    if (isPlot && f.plotArea && l.sqft < f.plotArea) return false;
    if (f.maxPrice && (f.purpose === "Rent" ? l.rent : l.price) > f.maxPrice) return false;
    if (f.ptype !== "Any type" && l.propType !== f.ptype) return false;
    if (f.ready && !l.ready) return false;
    if (f.verified && l.trustTier !== "verified") return false;
    return true;
  };
  const inAreas = (keys, f) => listings.filter((l) => keys.indexOf(l.areaKey) !== -1 && passes(l, f));
  const countIn = (key, f) => inAreas([key], f).length;
  const inBounds = (b, f) => listings.filter((l) => l.lat >= b.south && l.lat <= b.north && l.lon >= b.west && l.lon <= b.east && passes(l, f));
  const inPoly = (poly, f) => listings.filter((l) => passes(l, f) && pointInPoly(l.lat, l.lon, poly));
  function pointInPoly(lat, lon, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [yi, xi] = poly[i], [yj, xj] = poly[j];
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  // ---- hierarchy queries -----------------------------------------------------
  const areasOfDirection = (d) => areas.filter((a) => a.direction === d);
  const areasOfLocal = (l) => areas.filter((a) => a.local === l);
  const localsOfDirection = (d) => locals.filter((l) => l.direction === d);
  // Math.min.apply(null, []) is Infinity and Math.max.apply(null, []) is -Infinity, so
  // an empty list would return bounds that PASS Leaflet's isValid() (it tests isNaN,
  // and Infinity is not NaN) and then yield NaN from getCenter() deep inside the camera
  // effect. Guarded at the source, mirroring centerOf below, so every caller — areas,
  // hierarchy, schools, agri — is covered. The filter also survives a committed key
  // that is missing from byKey, which would otherwise map to undefined and throw.
  const boundsOf = (list) => {
    const pts = (list || []).filter((a) => a && Number.isFinite(a.lat) && Number.isFinite(a.lon));
    if (!pts.length) return [[12.78, 77.44], [13.28, 77.79]];
    const lats = pts.map((a) => a.lat), lons = pts.map((a) => a.lon);
    return [[Math.min.apply(null, lats) - 0.02, Math.min.apply(null, lons) - 0.02], [Math.max.apply(null, lats) + 0.02, Math.max.apply(null, lons) + 0.02]];
  };
  const reps = (list, k) => list.slice().sort((a, b) => b.n - a.n).slice(0, k || 2).map((a) => a.name);

  // journey-aware children: only destinations with matching content are advertised
  function childrenOf(nodeKey, f) {
    // Structural destinations are STABLE: their position, their representative names and
    // their presence never depend on the active filters. Only the counts move, and a
    // destination with no matches stays on the map saying so.
    if (nodeKey === "blr") {
      return directions.map((d) => {
        const all = areasOfDirection(d.key);
        const list = all.filter((a) => countIn(a.key, f) > 0);
        const n = list.reduce((s, a) => s + countIn(a.key, f), 0);
        return { kind: "direction", key: d.key, label: d.label, short: d.short, slot: d.bearing, names: reps(all, 2), matchAreas: list.length, totalAreas: all.length, n, schools: all.reduce((s, a) => s + a.schools, 0), center: centerOf(all), bounds: boundsOf(all) };
      });
    }
    const dir = directions.find((d) => d.key === nodeKey);
    if (dir) {
      const ls = localsOfDirection(dir.key);
      if (ls.length) {
        const parent = centerOf(areasOfDirection(dir.key));
        return ls.map((l) => {
          const all = areasOfLocal(l.key);
          const list = all.filter((a) => countIn(a.key, f) > 0);
          const n = list.reduce((s, a) => s + countIn(a.key, f), 0);
          const c = centerOf(all);
          return { kind: "local", key: l.key, label: l.label, bearing: bearingOf(parent, c), names: reps(all, 2), matchAreas: list.length, totalAreas: all.length, n, schools: all.reduce((s, a) => s + a.schools, 0), center: c, bounds: boundsOf(all) };
        });
      }
      return areaChildren(areasOfDirection(dir.key), f);
    }
    const loc = locals.find((l) => l.key === nodeKey);
    if (loc) return areaChildren(areasOfLocal(loc.key), f);
    return [];
  }
  function areaChildren(list, f) {
    return list.map((a) => ({ kind: "area", key: a.key, label: a.name, n: countIn(a.key, f), schools: a.schools, center: { lat: a.lat, lon: a.lon }, bounds: a.bounds })).filter((a) => a.n > 0);
  }
  function centerOf(list) {
    if (!list.length) return { lat: 12.9716, lon: 77.5946 };
    return { lat: list.reduce((s, a) => s + a.lat, 0) / list.length, lon: list.reduce((s, a) => s + a.lon, 0) / list.length };
  }
  // bearing in degrees (0 = N, 90 = E) — drives the compass marker layout
  function bearingOf(from, to) {
    const dy = to.lat - from.lat, dx = (to.lon - from.lon) * Math.cos((from.lat * Math.PI) / 180);
    return (Math.atan2(dx, dy) * 180) / Math.PI;
  }
  // map presentation: group crowded AREA children into visual clusters
  function clustersFor(nodeKey, f) {
    const kids = childrenOf(nodeKey, f);
    if (!kids.length || kids[0].kind !== "area") return { clusters: [], singles: kids };
    const defs = clusters.filter((c) => c.local === nodeKey);
    const used = {};
    const out = [];
    defs.forEach((c) => {
      const members = c.members.filter((k) => kids.some((x) => x.key === k));
      if (members.length < 2) return;
      members.forEach((k) => (used[k] = true));
      const list = members.map((k) => byKey[k]);
      out.push({ kind: "cluster", key: c.key, members, names: reps(list, 2), more: members.length - 2, n: members.reduce((s, k) => s + countIn(k, f), 0), schools: list.reduce((s, a) => s + a.schools, 0), center: centerOf(list), bounds: boundsOf(list) });
    });
    return { clusters: out, singles: kids.filter((k) => !used[k.key]) };
  }
  function ancestry(nodeKey) {
    if (nodeKey === "blr") return [{ key: "blr", label: "Bangalore" }];
    const a = byKey[nodeKey];
    if (a) {
      const chain = [{ key: "blr", label: "Bangalore" }, { key: a.direction, label: directions.find((d) => d.key === a.direction).label }];
      if (a.local) chain.push({ key: a.local, label: locals.find((l) => l.key === a.local).label });
      chain.push({ key: a.key, label: a.name });
      return chain;
    }
    const l = locals.find((x) => x.key === nodeKey);
    if (l) return [{ key: "blr", label: "Bangalore" }, { key: l.direction, label: directions.find((d) => d.key === l.direction).label }, { key: l.key, label: l.label }];
    const d = directions.find((x) => x.key === nodeKey);
    if (d) return [{ key: "blr", label: "Bangalore" }, { key: d.key, label: d.label }];
    return [{ key: "blr", label: "Bangalore" }];
  }
  const parentOf = (nodeKey) => {
    const chain = ancestry(nodeKey);
    return chain.length > 1 ? chain[chain.length - 2].key : null;
  };
  const levelOf = (nodeKey) => (nodeKey === "blr" ? "city" : byKey[nodeKey] ? "area" : locals.some((l) => l.key === nodeKey) ? "local" : "direction");

  function nearbyFor(keys, f) {
    const seen = {};
    keys.forEach((k) => (seen[k] = true));
    const out = [];
    keys.forEach((k) => {
      (adjacency[k] || []).forEach(([nk, rel]) => {
        if (seen[nk] || !byKey[nk]) return;
        seen[nk] = true;
        const a = byKey[nk];
        out.push({ key: nk, name: a.name, n: countIn(nk, f), total: a.n, schools: a.schools, from: byKey[k].name, rel: rel ? rel + " to " + byKey[k].name : dist(byKey[k], a).toFixed(1) + " km away" });
      });
    });
    return out;
  }
  // one filter change at a time, each with its real resulting count
  function relaxations(keys, f) {
    const out = [];
    // Commercial: bed and budget chips belong to the Residential family, so the only
    // honest widenings are dropping the subtype narrowing or the verified-only chip.
    // Widening never switches family by itself — that offer is explicit and labelled.
    // Commercial recovery keeps the buyer INSIDE Commercial: subtype first, then the
    // two attribute filters, and only then, clearly secondary, the other family.
    // Nothing here widens the search on its own or touches the selected areas.
    if (f.family === "Commercial") {
      const subs = f.comSubs || [];
      if (subs.length === 1) {
        const n = inAreas(keys, { ...f, comSubs: [] }).length;
        if (n > 0) out.push({ label: "Remove " + window.EXP_COM.label(subs[0]), patch: { comSubs: [] }, n });
      } else if (subs.length > 1) {
        const dropped = subs.slice(0, -1);
        const nOne = inAreas(keys, { ...f, comSubs: subs.slice(0, -1) }).length;
        if (nOne > 0) out.push({ label: "Remove " + window.EXP_COM.label(subs[subs.length - 1]), patch: { comSubs: dropped }, n: nOne });
        const nAll = inAreas(keys, { ...f, comSubs: [] }).length;
        if (nAll > 0) out.push({ label: "Show all Commercial types", patch: { comSubs: [] }, n: nAll });
      }
      if (f.comMaxPrice) {
        const wider = budgetsFor(f).filter((b) => b.k === 0 || b.k > f.comMaxPrice)[0];
        const patch = { comMaxPrice: wider && wider.k ? wider.k : 0 };
        const n = inAreas(keys, { ...f, ...patch }).length;
        if (n > 0) out.push({ label: patch.comMaxPrice ? "Raise the budget to " + budgetLabel(f, patch.comMaxPrice).replace("≤ ", "") : (f.purpose === "Rent" ? "Accept any monthly figure" : "Accept any price"), patch, n });
      }
      if (f.comArea) {
        const smaller = COM_AREAS.filter((a) => a.k < f.comArea).slice(-1)[0];
        const patch = { comArea: smaller ? smaller.k : 0 };
        const n = inAreas(keys, { ...f, ...patch }).length;
        if (n > 0) out.push({ label: patch.comArea ? "Accept " + patch.comArea.toLocaleString("en-IN") + "+ sq ft" : "Accept any size", patch, n });
      }
      if (f.verified) {
        const n = inAreas(keys, { ...f, verified: false }).length;
        if (n > 0) out.push({ label: "Include listings without broker identity checks", patch: { verified: false }, n });
      }
      // When two narrowings bind at once, no single change helps and the buyer would be
      // left with nothing but "leave Commercial". This always-available action keeps
      // them in the family, and its count is the real number of records it would show.
      if ((f.comSubs || []).length || f.comArea || f.comMaxPrice || f.verified) {
        const wide = { ...f, comSubs: [], comArea: 0, comMaxPrice: 0, verified: false };
        const n = inAreas(keys, wide).length;
        if (n > 0 && !out.some((r) => r.n === n && r.patch.comSubs)) {
          out.push({ label: "Show all Commercial in these areas", patch: { comSubs: [], comArea: 0, comMaxPrice: 0, verified: false }, n });
        }
      }
      const other = inAreas(keys, { ...f, family: "Residential" }).length;
      if (other > 0) out.push({ label: "Switch to Residential listings here", patch: { family: "Residential" }, n: other, secondary: true });
      return out.slice(0, 6);
    }
    if (f.maxPrice) {
      for (const mult of [1.2, 1.6, 2, 3]) {
        const next = Math.round((f.maxPrice * mult) / 100000) * 100000;
        const n = inAreas(keys, { ...f, maxPrice: next }).length;
        if (n > 0) { out.push({ label: "Increase maximum price to " + inrShort(next), patch: { maxPrice: next }, n }); break; }
      }
    }
    if (f.ready) { const n = inAreas(keys, { ...f, ready: false }).length; if (n > 0) out.push({ label: "Remove Ready to move", patch: { ready: false }, n }); }
    if (showsPlots(f) && f.plotArea) {
      const n = inAreas(keys, { ...f, plotArea: 0 }).length;
      if (n > 0) out.push({ label: "Accept any plot size", patch: { plotArea: 0 }, n });
    }
    if (showsHomes(f) && f.carpetArea) {
      const n = inAreas(keys, { ...f, carpetArea: 0 }).length;
      if (n > 0) out.push({ label: "Accept any carpet area", patch: { carpetArea: 0 }, n });
    }
    if (f.ptype !== "Plot" && f.beds > 0) {
      for (let b = f.beds - 1; b >= 0; b--) {
        const n = inAreas(keys, { ...f, beds: b }).length;
        if (n > 0) { out.push({ label: b === 0 ? "Accept any number of bedrooms" : "Include " + b + " BHK", patch: { beds: b }, n }); break; }
      }
    }
    if (f.verified) { const n = inAreas(keys, { ...f, verified: false }).length; if (n > 0) out.push({ label: "Include listings without broker identity checks", patch: { verified: false }, n }); }
    if (f.ptype !== "Any type") { const n = inAreas(keys, { ...f, ptype: "Any type" }).length; if (n > 0) out.push({ label: "Include every residential type", patch: { ptype: "Any type" }, n }); }
    return out.slice(0, 4);
  }

  function inrShort(p) { return p >= 10000000 ? "₹" + (p / 10000000).toFixed(2).replace(/\.00$/, "") + " Cr" : "₹" + Math.round(p / 100000) + " L"; }
  function inr(p) { return inrShort(p); }
  function rentShort(v) { return "₹" + Math.round(v / 1000) + "k/mo"; }
  // what a listing costs under the active purpose — sale price or monthly rent
  function priceText(l, f) { return f && f.purpose === "Rent" ? rentShort(l.rent) : inrShort(l.price); }

  const searchAreas = (q) => {
    const t = (q || "").trim().toLowerCase();
    if (!t) return [];
    return areas.filter((a) => a.name.toLowerCase().indexOf(t) !== -1).slice(0, 6);
  };

  // ---- schools located inside an area (informational only) -------------------
  const SCHOOL_NAMES = ["Vidyanketan Public School", "Presidency School", "Kensri School", "Ryan International", "National Public School", "Vibgyor High", "Delhi Public School", "Greenwood High", "Sishu Griha", "Gopalan International", "Euro School", "Orchids International"];
  const BOARDS = ["CBSE", "ICSE", "State", "IB"];
  const LEVELS = [["Primary", "Secondary", "Higher Secondary"], ["Primary"], ["Primary", "Secondary"], ["Secondary", "Higher Secondary"]];
  const schoolCache = {};
  function schoolsOf(key) {
    if (schoolCache[key]) return schoolCache[key];
    const a = byKey[key];
    if (!a) return [];
    let s = 0;
    for (let i = 0; i < key.length; i++) s += key.charCodeAt(i);
    const out = [];
    for (let i = 0; i < a.schools; i++) {
      const board = BOARDS[(s + i * 5) % BOARDS.length];
      const levels = LEVELS[(s + i * 3) % LEVELS.length];
      const nm = SCHOOL_NAMES[(s + i * 7) % SCHOOL_NAMES.length];
      out.push({ id: key + "-s" + i, name: nm + (i > SCHOOL_NAMES.length - 1 ? " " + a.name : ""), board, levels,
        lat: a.lat + (((s + i * 13) % 21) - 10) / 900, lon: a.lon + (((s + i * 29) % 21) - 10) / 850 });
    }
    schoolCache[key] = out;
    return out;
  }
  const boardsIn = (key) => BOARDS.filter((b) => schoolsOf(key).some((s) => s.board === b));
  const levelsIn = (key) => ["Primary", "Secondary", "Higher Secondary"].filter((l) => schoolsOf(key).some((s) => s.levels.indexOf(l) !== -1));
  function filterSchools(key, q, board, level) {
    let list = schoolsOf(key);
    if (board && board !== "All") list = list.filter((s) => s.board === board);
    if (level && level !== "All") list = list.filter((s) => s.levels.indexOf(level) !== -1);
    const t = (q || "").trim().toLowerCase();
    if (t) list = list.filter((s) => s.name.toLowerCase().indexOf(t) !== -1);
    return list;
  }
  // homes within N km of a school — a school-CENTRED radius result state (its own query)
  function homesNearSchool(school, km, f) {
    return listings.filter((l) => dist(school, l) <= km && (!f || passes(l, f))).sort((a, b) => dist(school, a) - dist(school, b));
  }
  // search WITHIN an area's listings — road, project, landmark, type or size
  function searchWithin(list, q) {
    const t = (q || "").trim().toLowerCase();
    if (!t) return list;
    return list.filter((l) => (l.title + " " + l.locality + " " + l.area + " " + l.propType + " " + l.beds + " bhk " + l.sqft).toLowerCase().indexOf(t) !== -1);
  }

  window.EXP = {
    city: { key: "blr", label: "Bangalore", lat: 12.9716, lon: 77.5946, bounds: [[12.78, 77.44], [13.28, 77.79]] },
    areas, byKey, directions, locals, clusters, listings, DEFAULT_FILTERS, residentialCount,
    BUDGETS, budgetsFor, budgetLabel, PLOT_AREAS, CARPET_AREAS, COM_AREAS, comAreaLabel, nounsOf, showsHomes, showsPlots,
    childrenOf, clustersFor, ancestry, parentOf, levelOf, areasOfLocal, areasOfDirection,
    boundsOf, centerOf, reps, countIn, inAreas, inBounds, inPoly, passes, filterLabels,
    nearbyFor, relaxations, searchAreas, dist, inr, inrShort, rentShort, priceText, bearingOf, schoolsOf, searchWithin,
    boardsIn, levelsIn, filterSchools, homesNearSchool,
    // Commercial helpers, re-exported so panel/map/cards reach them through EXP
    com: window.EXP_COM || null,
    comLabel: (k) => (window.EXP_COM ? window.EXP_COM.label(k) : "Commercial"),
    comPriceText: (l, signedIn) => (window.EXP_COM ? window.EXP_COM.priceText(l, signedIn) : null),
    isCom: (l) => (window.EXP_COM ? window.EXP_COM.isCom(l) : false)
  };
})();

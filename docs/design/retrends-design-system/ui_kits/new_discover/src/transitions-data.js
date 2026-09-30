// ============================================================================
// Discover — journey transitions (#2020 transition_page_spec)
// Pure data. Every frame is a small schematic of the approved Discover shell:
//   frame = { crumb, map:{preset,offset,markers,overlays,float}, panel:{blocks} }
// Every step after the first carries `action` (what the user did) and `delta`
// (node / scope / filters / camera / history). "unchanged" is rendered muted.
// ============================================================================
(function () {
  // camera presets — real CARTO Voyager tiles, fractional tile coords
  const CAM = {
    city:      { z: 11, fx: 1465.43, fy: 949.62 },
    north:     { z: 12, fx: 2930.60, fy: 1897.30 },
    local:     { z: 13, fx: 5861.40, fy: 3794.10 },
    hebbal:    { z: 14, fx: 11723.2, fy: 7588.6 },
    hebbalTight:{ z: 15, fx: 23446.6, fy: 15177.4 },
    trio:      { z: 12, fx: 2931.20, fy: 1898.10 },
    spread:    { z: 11, fx: 1465.60, fy: 950.10 }
  };
  const U = "unchanged";

  // ---- reusable panel blocks -------------------------------------------------
  const FILTERS = { t: "pills", label: "Filters", items: ["Buy", "3 BHK", "up to ₹1.2 Cr"] };
  const cityRows = {
    t: "navrows", rows: [
      { title: "North", count: 186, noun: "homes", names: "Yelahanka · Devanahalli · Hebbal · Thanisandra", more: 12 },
      { title: "East", count: 241, noun: "homes", names: "Whitefield · Marathahalli · KR Puram", more: 9 },
      { title: "South", count: 264, noun: "homes", names: "JP Nagar · Jayanagar · Bannerghatta", more: 14 },
      { title: "West", count: 152, noun: "homes", names: "Rajajinagar · Vijayanagar · Nagarbhavi", more: 7 },
      { title: "Centre", count: 96, noun: "homes", names: "Indiranagar · Domlur · Shivajinagar", more: 4 }
    ]
  };
  const northRows = {
    t: "navrows", rows: [
      { title: "Hebbal & Yelahanka", count: 74, noun: "homes", names: "Hebbal · Yelahanka · Jakkur · Nagawara", more: 3 },
      { title: "Devanahalli & Airport", count: 48, noun: "homes", names: "Devanahalli · Airport Road · Bagalur", more: 2 },
      { title: "Hennur & Thanisandra", count: 41, noun: "homes", names: "Hennur · Thanisandra · Kothanur", more: 2 },
      { title: "Nagawara & Kempapura", count: 23, noun: "homes", names: "Nagawara · Kempapura · Amruthahalli", more: 1 }
    ]
  };
  const areaRows = {
    t: "arearows", rows: [
      { name: "Hebbal", count: 42, schools: 12 },
      { name: "Yelahanka", count: 31, schools: 8 },
      { name: "Jakkur", count: 22, schools: 7 },
      { name: "Nagawara", count: 31, schools: 9 },
      { name: "Kempapura", count: 8, schools: 3 }
    ]
  };

  // ---- markers ---------------------------------------------------------------
  const dest = (x, y, names, count, more, w) => ({ k: "dest", x, y, names, count, more, w });
  const clus = (x, y, names, more, count, schools) => ({ k: "cluster", x, y, names, more, count, schools });
  const area = (x, y, name, count, sel) => ({ k: "area", x, y, name, count, sel });
  const price = (x, y, p, on) => ({ k: "price", x, y, p, on });
  const disc = (x, y, n) => ({ k: "disc", x, y, n });

  const J = [];

  // ======================= J1 — guided Areas navigation =======================
  J.push({
    id: "J1", name: "Guided Areas navigation", device: "desktop", issues: ["#2014", "#1956"],
    intent: "Shallow directional browsing from the city root down to one canonical area and its listings — and back out again.",
    steps: [
      {
        id: "J1.1", label: "Bangalore landing", state: "G1",
        note: "Directional children of the promoted city root. No whole-city total marker.",
        frame: {
          crumb: ["Bangalore"],
          map: { preset: "city", nav: true, markers: [dest(50, 14, "Yelahanka · Devanahalli", 186, 12), dest(85, 42, "Whitefield · Marathahalli", 241, 9), dest(50, 87, "JP Nagar · Jayanagar", 264, 14), dest(15, 42, "Rajajinagar · Vijayanagar", 152, 7), dest(50, 47, "Indiranagar · Domlur", 96, 4)] },
          panel: { blocks: [{ t: "head", eyebrow: "Areas · Bangalore", title: "Where in Bangalore?", stat: { v: 939, l: "homes" } }, FILTERS, cityRows] }
        }
      },
      {
        id: "J1.2", label: "North Bangalore", state: "G1", action: "Tap the North destination — on the map card or its panel row. One control, one action.",
        delta: { node: "node=blr → node=blr-north", scope: "none (no result scope yet)", filters: U, camera: "fit North Bangalore bounds", history: "one entry pushed" },
        note: "Map card and panel row share identity and dispatch the same action.",
        frame: {
          crumb: ["Bangalore", "North Bangalore"],
          map: { preset: "north", nav: true, markers: [dest(44, 20, "Devanahalli · Airport", 48, 2), dest(52, 55, "Hebbal · Yelahanka", 74, 3), dest(82, 31, "Hennur · Thanisandra", 41, 2), dest(24, 76, "Nagawara · Kempapura", 23, 1)] },
          panel: { blocks: [{ t: "back", label: "Bangalore" }, { t: "head", eyebrow: "Direction · North", title: "North Bangalore", stat: { v: 186, l: "homes" } }, FILTERS, northRows] }
        }
      },
      {
        id: "J1.3", label: "Hebbal · Yelahanka", action: "Tap the Hebbal · Yelahanka local destination.",
        delta: { node: "node=blr-north-hebbal-yelahanka", scope: "none", filters: U, camera: "fit local-destination bounds", history: "one entry pushed" },
        note: "Maximum depth reached: City › Direction › Local Destination › Area. A third public cluster level is invalid.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"],
          map: { preset: "local", markers: [clus(38, 40, "Hebbal · Nagawara", 3, 120, 50), area(74, 30, "Yelahanka", 31), area(70, 66, "Jakkur", 22)] },
          panel: { blocks: [{ t: "back", label: "North Bangalore" }, { t: "head", eyebrow: "Local destination", title: "Hebbal · Yelahanka", stat: { v: 74, l: "homes" } }, FILTERS, { t: "note", tone: "info", text: "5 areas with matches · 34 canonical areas exist here" }, areaRows] }
        }
      },
      {
        id: "J1.4", label: "Visual area clusters", state: "G2", action: "Nothing yet — read the map. Two crowded areas are drawn as one visual cluster.",
        delta: { node: U, scope: U, filters: U, camera: U, history: "no entry" },
        note: "The dashed cluster chip is a zoom aid, not a hierarchy node. Only areas with matches contribute to its names and counts.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"],
          map: { preset: "local", focusCluster: true, markers: [clus(38, 40, "Hebbal · Nagawara", 3, 120, 50), area(74, 30, "Yelahanka", 31), area(70, 66, "Jakkur", 22)] },
          panel: { blocks: [{ t: "back", label: "North Bangalore" }, { t: "head", eyebrow: "Local destination", title: "Hebbal · Yelahanka", stat: { v: 74, l: "homes" } }, { t: "note", tone: "info", text: "Panel lists all 5 areas with matches. The map groups two of them for legibility." }, areaRows] }
        }
      },
      {
        id: "J1.5", label: "Cluster zoom", state: "G3", action: "Tap the visual cluster — “Tap to zoom”.",
        delta: { node: U, scope: U, filters: U, camera: "zoom to cluster members", history: "no entry — presentation only" },
        note: "Breadcrumb is identical to the previous step. The panel says why its rows changed and offers the full list back.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"],
          map: { preset: "hebbal", markers: [area(34, 38, "Hebbal", 42), area(62, 30, "Nagawara", 31), area(46, 72, "Kempapura", 8)] },
          panel: { blocks: [{ t: "back", label: "North Bangalore" }, { t: "head", eyebrow: "Local destination", title: "Hebbal · Yelahanka", stat: { v: 74, l: "homes" } }, { t: "subset", text: "3 areas in this map view", action: "Show all 5 areas" }, { t: "arearows", rows: [{ name: "Hebbal", count: 42, schools: 12 }, { name: "Nagawara", count: 31, schools: 9 }, { name: "Kempapura", count: 8, schools: 3 }] }] }
        }
      },
      {
        id: "J1.6", label: "Hebbal selected", state: "A1", action: "Tap the individual Hebbal marker — “Tap to view homes”.",
        delta: { node: "node=blr-north-hebbal-yelahanka-hebbal", scope: "AREA_SET · Hebbal", filters: U, camera: "fit Hebbal bounds", history: "one entry pushed" },
        note: "An individual area is canonical navigation and the first result scope in one action.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "hebbalTight", markers: [price(30, 34, "₹1.05 Cr", true), price(58, 26, "₹92 L"), disc(46, 58, 12), price(72, 62, "₹1.4 Cr")] },
          panel: { blocks: [{ t: "back", label: "Hebbal · Yelahanka" }, { t: "scopebar", kind: "AREA_SET", chips: ["Hebbal"], total: 42 }, { t: "head", eyebrow: "Homes for sale", title: "Hebbal", stat: { v: 42, l: "homes" } }, FILTERS, { t: "listings", n: 2 }] }
        }
      },
      {
        id: "J1.7", label: "Property detail", action: "Open a listing from the panel or a price pin.",
        delta: { node: U, scope: U, filters: U, camera: "pin focused", history: "one entry pushed" },
        note: "Back to results restores this exact scope, filters, camera and panel position.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "hebbalTight", dim: true, markers: [price(30, 34, "₹1.05 Cr", true), price(58, 26, "₹92 L"), disc(46, 58, 12)] },
          panel: { blocks: [{ t: "back", label: "Back to results" }, { t: "detail", price: "₹1.05 Cr", title: "3 BHK apartment · Hebbal Ring Road", meta: "3 BHK · 3 baths · 1,450 sq.ft" }] }
        }
      },
      {
        id: "J1.8", label: "Back to results", state: "A1", action: "Back to results.",
        delta: { node: U, scope: "AREA_SET · Hebbal restored", filters: "restored exactly", camera: "restored", history: "back one entry" },
        note: "In-app hierarchy Back would instead go to Hebbal · Yelahanka — the canonical parent, never navigate(-1).",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "hebbalTight", markers: [price(30, 34, "₹1.05 Cr", true), price(58, 26, "₹92 L"), disc(46, 58, 12), price(72, 62, "₹1.4 Cr")] },
          panel: { blocks: [{ t: "back", label: "Hebbal · Yelahanka" }, { t: "scopebar", kind: "AREA_SET", chips: ["Hebbal"], total: 42 }, { t: "head", eyebrow: "Homes for sale", title: "Hebbal", stat: { v: 42, l: "homes" } }, FILTERS, { t: "listings", n: 2 }] }
        }
      }
    ]
  });

  // ============ J2 — direct search and multi-area comparison =================
  J.push({
    id: "J2", name: "Direct area search and multi-area comparison", device: "desktop", issues: ["#2017", "#2016"],
    intent: "Search one area by name, act on the area (schools / search within), then compare it with up to two nearby areas as one AREA_SET.",
    steps: [
      {
        id: "J2.1", label: "Direct search Hebbal", state: "B1",
        note: "Direct search resolves the same canonical ancestry as guided navigation, and lands on the area with two explicit next actions: schools in the area, and search within it.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"], search: "Hebbal",
          map: { preset: "hebbal", markers: [area(38, 40, "Hebbal", 42, true), area(66, 30, "Nagawara", 31), area(58, 72, "Jakkur", 22)] },
          panel: { blocks: [{ t: "back", label: "Back to areas in North" }, { t: "scopebar", kind: "AREA_SET", chips: ["Hebbal"], total: 42 }, { t: "head", eyebrow: "Areas · Hebbal", title: "Properties in Hebbal", stat: { v: 42, l: "homes for sale" } }, { t: "actions" }, { t: "listings", n: 2 }] }
        }
      },      {
        id: "J2.1b", label: "Schools in Hebbal", state: "D3", action: "Explore schools in Hebbal.",
        delta: { node: U, scope: U, filters: U, camera: "school pins drawn inside Hebbal", history: "no entry — subview switch" },
        note: "Opens a dedicated Schools-in-Hebbal subview in the same shell — the area is kept, with school-name search, Board and Level filters, map pins that sync with the rows, and a View homes action per school. Informational: only schools located inside Hebbal.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "hebbalTight", markers: [], schoolPins: [[30, 34, "Vidyanketan"], [58, 30, "Presidency"], [46, 62, "Kensri"]] },
          panel: { blocks: [{ t: "back", label: "Back to properties in Hebbal" }, { t: "schoolsinarea", n: 12, board: "All", rows: [{ name: "Vidyanketan Public School", meta: "CBSE · Primary · Secondary · Higher Secondary" }, { name: "Presidency School", meta: "ICSE · Primary" }, { name: "Kensri School", meta: "ICSE · Primary · Secondary" }] }] }
        }
      },
      {
        id: "J2.1c", label: "School selected", state: "D3", action: "View homes near Presidency School.",
        delta: { node: U, scope: "AREA_SET → school-radius result state (5 km around the school)", filters: U, camera: "radius ring drawn, homes within it", history: "no entry — within the subview" },
        note: "Selecting a school collapses the browser into a compact summary with a 5 / 10 km radius toggle and the matching homes. This is a school-CENTRED radius scope — distinct from “schools in Hebbal”, and it never implies every Hebbal home is close to every Hebbal school. Change school / Clear school / Back to properties return cleanly.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "hebbalTight", schoolRing: true, schoolPins: [[50, 44, "Presidency"]], markers: [price(34, 34, "₹98 L", true), price(64, 40, "₹1.2 Cr"), price(48, 66, "₹85 L")] },
          panel: { blocks: [{ t: "back", label: "Back to properties in Hebbal" }, { t: "schoolradius", school: "Presidency School", radius: "5 km", n: 18 }, { t: "listings", n: 2 }] }
        }
      },
      {
        id: "J2.2", label: "Compare nearby", state: "B1", action: "Open “Compare with nearby areas”.",
        delta: { node: U, scope: "AREA_SET · Hebbal — now editable as a draft", filters: U, camera: U, history: "no entry — draft only" },
        note: "Nearby is defined by geography (adjacency, distance), not by inventory. Each suggestion is a card: reason, listing count, school count, Preview and Add.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "hebbal", markers: [area(38, 40, "Hebbal", 42, true), area(66, 30, "Nagawara", 31), area(58, 72, "Jakkur", 22)] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", draft: true, chips: ["Hebbal"], total: 42 }, { t: "comparecards", count: 1, rows: [{ name: "Nagawara", listings: 31, schools: 9, rel: "Adjacent to Hebbal" }, { name: "Jakkur", listings: 22, schools: 7, rel: "4.6 km away" }] }, { t: "cta", label: "Compare 42 listings", sub: "Honest total for Hebbal alone" }] }
        }
      },
      {
        id: "J2.3", label: "Preview Nagawara", state: "B1", action: "Preview Nagawara.",
        delta: { node: U, scope: "unchanged — preview does not draft or commit", filters: U, camera: "Nagawara highlighted on the map", history: "no entry" },
        note: "Preview highlights the area on the map without committing search, drafting a chip or changing results.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "hebbal", markers: [area(38, 40, "Hebbal", 42, true), area(66, 30, "Nagawara", 31, true), area(58, 72, "Jakkur", 22)] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", draft: true, chips: ["Hebbal"], total: 42 }, { t: "comparecards", count: 1, rows: [{ name: "Nagawara", listings: 31, schools: 9, rel: "Adjacent to Hebbal", preview: true }, { name: "Jakkur", listings: 22, schools: 7, rel: "4.6 km away" }] }, { t: "cta", label: "Compare 42 listings", sub: "Preview only — Hebbal still the sole draft" }] }
        }
      },
      {
        id: "J2.4", label: "Draft two areas", state: "B2", action: "Add Nagawara.",
        delta: { node: U, scope: "draft AREA_SET · Hebbal + Nagawara — not committed", filters: U, camera: U, history: "no entry" },
        note: "Results have not moved. The CTA total is the honest sum of the draft.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "hebbal", markers: [area(38, 40, "Hebbal", 42, true), area(66, 30, "Nagawara", 31, true), area(58, 72, "Jakkur", 22)] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", draft: true, chips: ["Hebbal", "Nagawara"], total: 73 }, { t: "comparecards", count: 2, rows: [{ name: "Jakkur", listings: 22, schools: 7, rel: "4.6 km away" }, { name: "Kempapura", listings: 8, schools: 3, rel: "Adjacent to Hebbal" }] }, { t: "cta", label: "Compare 73 listings", sub: "Draft — results unchanged until you compare" }] }
        }
      },
      {
        id: "J2.5", label: "Draft maximum three", state: "B3", action: "Add Jakkur.",
        delta: { node: U, scope: "draft AREA_SET · 3 areas (maximum)", filters: U, camera: U, history: "no entry" },
        note: "One selected area plus two nearby is the maximum. A further add is blocked with a swap prompt, never a silent drop.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "hebbal", markers: [area(38, 40, "Hebbal", 42, true), area(66, 30, "Nagawara", 31, true), area(58, 72, "Jakkur", 22, true)] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", draft: true, chips: ["Hebbal", "Nagawara", "Jakkur"], total: 95 }, { t: "note", tone: "warn", text: "Maximum of 3 areas reached. Remove one to swap in another." }, { t: "cta", label: "Compare 95 listings", sub: "Combined total for Hebbal + Nagawara + Jakkur" }] }
        }
      },
      {
        id: "J2.6", label: "Committed AREA_SET", state: "C1", action: "Compare 95 listings — the commitment point.",
        delta: { node: "unchanged — chips are not a breadcrumb", scope: "AREA_SET · Hebbal + Nagawara + Jakkur committed", filters: U, camera: "fit union bounds once", history: "one entry pushed" },
        note: "One combined result set owns cards and markers. The set is shown as chips, never as fake ancestry.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", markers: [disc(36, 44, 42), disc(62, 32, 31), disc(54, 70, 22)] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", chips: ["Hebbal", "Nagawara", "Jakkur"], total: 95, actions: ["Edit areas", "Clear"] }, { t: "head", eyebrow: "Homes for sale · 3 areas", title: "Hebbal, Nagawara, Jakkur", stat: { v: 95, l: "homes" } }, FILTERS, { t: "schools", title: "Schools in selected areas", n: 28, sub: "Located inside these areas. Not a proximity or quality measure." }, { t: "listings", n: 2 }] }
        }
      },
      {
        id: "J2.7", label: "Focus one chip", state: "C3", action: "Tap the Nagawara chip to focus it.",
        delta: { node: U, scope: "unchanged — all three areas still in scope", filters: U, camera: "camera focuses Nagawara", history: "no entry — presentation only" },
        note: "Focus is camera state. The combined total stays at 95 and Fit all restores the union view.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "hebbal", fitAll: true, markers: [area(58, 34, "Nagawara", 31, true), disc(24, 56, 42)] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", chips: ["Hebbal", "Nagawara", "Jakkur"], focus: "Nagawara", total: 95, actions: ["Fit all"] }, { t: "note", tone: "info", text: "Map focused on Nagawara. All 95 listings from three areas remain in the list." }, { t: "listings", n: 2 }] }
        }
      },
      {
        id: "J2.8", label: "Edit areas · Browser Back", state: "C2", action: "Edit areas — then Browser Back.",
        delta: { node: U, scope: "draft reopened; Browser Back returns the committed 3-area set", filters: U, camera: U, history: "editing pushes nothing; Browser Back pops the commit" },
        note: "Clear selected areas is confirmed and leaves the parent node with no result scope — it is not hierarchy Back.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", markers: [disc(36, 44, 42), disc(62, 32, 31), disc(54, 70, 22)] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", draft: true, chips: ["Hebbal", "Nagawara", "Jakkur"], total: 95, actions: ["Cancel"] }, { t: "note", tone: "muted", text: "Draft reopened from the committed set. Results below are still the committed 95." }, { t: "relax", label: "Also available here", rows: [{ label: "Clear selected areas", count: "confirmed" }, { label: "Browser Back", count: "committed set" }] }] }
        }
      }
    ]
  });

  // ================== J3 — AREA_SET → POLYGON replacement ====================
  J.push({
    id: "J3", name: "Area set to polygon replacement", device: "desktop", issues: ["#2016"],
    intent: "Exactly one result scope may be active. Changing kind is an explicit, reversible replacement.",
    steps: [
      {
        id: "J3.1", label: "Committed AREA_SET", state: "C1",
        note: "Starting point: three areas committed, 95 listings.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", markers: [disc(36, 44, 42), disc(62, 32, 31), disc(54, 70, 22)] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", chips: ["Hebbal", "Nagawara", "Jakkur"], total: 95, actions: ["Edit areas", "Draw area"] }, FILTERS, { t: "listings", n: 2 }] }
        }
      },
      {
        id: "J3.2", label: "Draw polygon", state: "A2", action: "Draw area — trace a boundary on the map.",
        delta: { node: U, scope: "unchanged — the drawing is a draft", filters: U, camera: U, history: "no entry" },
        note: "The polygon does not intersect or union with the chips. It is a candidate replacement.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", poly: "draft", markers: [disc(36, 44, 42), disc(62, 32, 31)] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", chips: ["Hebbal", "Nagawara", "Jakkur"], total: 95 }, { t: "note", tone: "muted", text: "Drawing a boundary. Results still come from the three selected areas." }, { t: "cta", label: "Use this boundary", sub: "You will be asked to confirm the replacement" }] }
        }
      },
      {
        id: "J3.3", label: "Replace confirmation", state: "A2", action: "Use this boundary.",
        delta: { node: U, scope: "replacement pending confirmation", filters: U, camera: U, history: "no entry until confirmed" },
        note: "Named, symmetric confirmation: A4 shows the same dialogue in the opposite direction.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", poly: "draft", markers: [disc(36, 44, 42), disc(62, 32, 31)] },
          panel: { blocks: [{ t: "confirm", title: "Replace selected areas with this boundary?", body: "Hebbal, Nagawara and Jakkur will be removed from the search. Filters stay as they are.", primary: "Replace and search", secondary: "Keep selected areas" }] }
        }
      },
      {
        id: "J3.4", label: "Active POLYGON", state: "A5", action: "Replace and search.",
        delta: { node: "unchanged — navigation context is untouched", scope: "AREA_SET → POLYGON · Drawn area", filters: U, camera: "fit the drawn boundary", history: "one entry pushed" },
        note: "Honest count of what falls inside the shape. The scope chip is removable and names its kind.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", poly: "active", markers: [disc(44, 46, 18), price(62, 36, "₹1.1 Cr")] },
          panel: { blocks: [{ t: "scopebar", kind: "POLYGON", chips: ["Drawn area"], total: 61, actions: ["Edit boundary", "Return to selected areas"] }, { t: "head", eyebrow: "Homes for sale · Drawn area", title: "61 homes inside your boundary", stat: { v: 61, l: "homes" } }, FILTERS, { t: "listings", n: 2 }] }
        }
      },
      {
        id: "J3.5", label: "Return to areas", state: "A4", action: "Return to selected areas — confirmed the same way.",
        delta: { node: U, scope: "POLYGON → AREA_SET · Hebbal + Nagawara + Jakkur", filters: U, camera: "fit union bounds", history: "one entry pushed" },
        note: "Reversibility is explicit: the previous set is restored by name, not inferred from the camera.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", markers: [disc(36, 44, 42), disc(62, 32, 31), disc(54, 70, 22)] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", chips: ["Hebbal", "Nagawara", "Jakkur"], total: 95, actions: ["Edit areas", "Draw area"] }, { t: "note", tone: "info", text: "Drawn boundary discarded. Your three areas are back in scope." }, { t: "listings", n: 2 }] }
        }
      }
    ]
  });

  // ==================== J4 — Search this area / VIEWPORT =====================
  J.push({
    id: "J4", name: "Search this area — viewport flow", device: "desktop", issues: ["#2015", "#2016"],
    intent: "Moving the map never searches. One explicit action commits the visible map area as the result scope.",
    steps: [
      {
        id: "J4.1", label: "Committed results", state: "C1",
        note: "Listing-capable level. Search this area is only offered here — never at City, Direction or Local Destination.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", markers: [disc(36, 44, 42), disc(62, 32, 31), disc(54, 70, 22)] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", chips: ["Hebbal", "Nagawara", "Jakkur"], total: 95 }, FILTERS, { t: "listings", n: 2 }] }
        }
      },
      {
        id: "J4.2", label: "Camera moved", state: "A6", action: "Pan and zoom the map. Nothing is requested.",
        delta: { node: U, scope: "unchanged — still the three areas", filters: U, camera: "user-driven move, settled", history: "no entry — pan and zoom never push" },
        note: "Old results remain and are still labelled by their real scope. The offer to re-scope appears, disabled until the move settles.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", offset: [-58, 34], searchThisArea: true, markers: [disc(52, 30, 42), disc(78, 18, 31)] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", chips: ["Hebbal", "Nagawara", "Jakkur"], total: 95 }, { t: "note", tone: "muted", text: "Results still cover your three selected areas. The map has moved." }, { t: "listings", n: 2 }] }
        }
      },
      {
        id: "J4.3", label: "Replacement offer", state: "A3", action: "Tap Search this area.",
        delta: { node: U, scope: "VIEWPORT replacement announced before it commits", filters: "carried over unchanged", camera: "latest settled bounds", history: "no entry yet" },
        note: "A viewport search replaces AREA_SET — it never combines with it.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", offset: [-58, 34], viewportRect: true, markers: [disc(52, 30, 42)] },
          panel: { blocks: [{ t: "note", tone: "ok", text: "Showing the visible map area. Filters kept — return to Hebbal + Nagawara + Jakkur any time." }] }
        }
      },
      {
        id: "J4.4", label: "Committing", state: "A9", action: "Search this area — request in flight.",
        delta: { node: U, scope: "VIEWPORT · Visible map area (loading)", filters: U, camera: "frozen at committed bounds", history: "one entry, on success" },
        note: "The new scope is already named; the old results are not passed off as new. Stale responses cannot overwrite this one.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", offset: [-58, 34], viewportRect: true, loading: true, markers: [] },
          panel: { blocks: [{ t: "scopebar", kind: "VIEWPORT", chips: ["Visible map area"], loading: true, actions: ["Return to Hebbal + Nagawara + Jakkur"] }, { t: "note", tone: "muted", text: "Searching the visible map area…" }, { t: "skeleton", n: 2 }] }
        }
      },
      {
        id: "J4.5", label: "Active VIEWPORT", state: "A8", action: "Results arrive.",
        delta: { node: "unchanged — node= is still Hebbal", scope: "VIEWPORT · Visible map area (committed)", filters: U, camera: "bounds recorded in the URL", history: "one meaningful result-scope state" },
        note: "The scope may cross the original area boundary. The return target names every area it will restore.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", offset: [-58, 34], viewportRect: true, markers: [price(34, 30, "₹88 L"), disc(58, 44, 21), price(76, 24, "₹1.2 Cr")] },
          panel: { blocks: [{ t: "scopebar", kind: "VIEWPORT", chips: ["Visible map area"], total: 47, actions: ["Return to Hebbal + Nagawara + Jakkur"] }, { t: "head", eyebrow: "Homes for sale · Visible map area", title: "47 homes on screen", stat: { v: 47, l: "homes" } }, FILTERS, { t: "listings", n: 2 }] }
        }
      },
      {
        id: "J4.6", label: "Return to areas", state: "A8", action: "Return to Hebbal + Nagawara + Jakkur.",
        delta: { node: U, scope: "VIEWPORT → AREA_SET restored by name", filters: U, camera: "fit union bounds", history: "one entry pushed" },
        note: "Refresh or a property-detail Back would have restored the viewport scope instead — bounds live in the URL, not in the camera.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", markers: [disc(36, 44, 42), disc(62, 32, 31), disc(54, 70, 22)] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", chips: ["Hebbal", "Nagawara", "Jakkur"], total: 95 }, { t: "note", tone: "info", text: "Visible-map search ended. Your three areas are back in scope." }, { t: "listings", n: 2 }] }
        }
      }
    ]
  });

  // ======================= J5 — zero-result recovery =========================
  J.push({
    id: "J5", name: "Honest zero-result recovery", device: "desktop", issues: ["#2018"],
    intent: "A zero result keeps the search intact and offers named recovery actions with real counts.",
    steps: [
      {
        id: "J5.1", label: "Zero across three areas", state: "E1",
        note: "Scope, chips, filters, URL and camera are all preserved. Nothing broadens itself.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", empty: true, markers: [] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", chips: ["Hebbal", "Nagawara", "Jakkur"], total: 0 }, { t: "zero", title: "No matching listings in your 3 selected areas", sub: "Buy · 3 BHK · up to ₹1.2 Cr", actions: ["Add nearby areas", "Increase budget", "Remove 3 BHK", "Clear filters", "Create alert"] }] }
        }
      },
      {
        id: "J5.2", label: "Nearby alternatives", state: "E2", action: "Add nearby areas.",
        delta: { node: U, scope: "unchanged — alternatives are offered, not applied", filters: U, camera: U, history: "no entry" },
        note: "Counts use the filters the shopper actually has. Geography defines the candidates.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", empty: true, markers: [area(70, 30, "Kempapura", 8), area(40, 64, "Amruthahalli", 6)] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", chips: ["Hebbal", "Nagawara", "Jakkur"], total: 0 }, { t: "note", tone: "warn", text: "Still 0 matches. These nearby areas have matches with your current filters." }, { t: "suggestions", rows: [{ name: "Kempapura", listings: 8, schools: 3, rel: "Adjacent" }, { name: "Amruthahalli", listings: 6, schools: 2, rel: "2.8 km away" }] }] }
        }
      },
      {
        id: "J5.3", label: "Preview, not added", state: "E3", action: "Preview Kempapura.",
        delta: { node: U, scope: "unchanged — preview is labelled as not added", filters: U, camera: "camera peeks at Kempapura", history: "no entry" },
        note: "Inspecting an alternative never joins it to the result scope.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "hebbal", markers: [area(52, 40, "Kempapura", 8, true), disc(24, 62, 0)] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", chips: ["Hebbal", "Nagawara", "Jakkur"], total: 0 }, { t: "note", tone: "muted", text: "Previewing Kempapura — not added to your search." }, { t: "listings", n: 2, label: "8 matches in Kempapura" }, { t: "cta", label: "Add Kempapura and search", sub: "This will change your result scope" }] }
        }
      },
      {
        id: "J5.4", label: "Filter relaxation", state: "E5", action: "Look at filter changes instead.",
        delta: { node: U, scope: U, filters: "unchanged — each option previews one change", camera: U, history: "no entry" },
        note: "One change at a time, each with a real count printed before it is taken.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", empty: true, markers: [] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", chips: ["Hebbal", "Nagawara", "Jakkur"], total: 0 }, { t: "relax", label: "Change one filter", rows: [{ label: "Increase maximum price to ₹1.6 Cr", count: "7 listings" }, { label: "Remove Ready to move", count: "4 listings" }, { label: "Include 2 BHK", count: "11 listings" }] }, { t: "note", tone: "muted", text: "Nothing is applied until you choose one." }] }
        }
      },
      {
        id: "J5.5", label: "Recovered results", state: "E4", action: "Add Kempapura and search.",
        delta: { node: U, scope: "AREA_SET · 3 areas → Hebbal + Nagawara + Kempapura", filters: "unchanged — geography changed, not the filters", camera: "fit new union", history: "one entry pushed" },
        note: "The result names what changed, so the shopper can undo it.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", markers: [disc(36, 44, 0), disc(62, 32, 0), area(52, 66, "Kempapura", 8, true)] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", chips: ["Hebbal", "Nagawara", "Kempapura"], total: 8, actions: ["Edit areas"] }, { t: "note", tone: "info", text: "Kempapura added. 8 matches — Hebbal and Nagawara still have none with these filters." }, { t: "listings", n: 2 }] }
        }
      },
      {
        id: "J5.6", label: "Browser Back", state: "E1", action: "Browser Back.",
        delta: { node: U, scope: "previous committed state — the 3-area zero result", filters: U, camera: "restored", history: "back one entry" },
        note: "The zero-result state is a committed state, so it is restorable — not a dead end.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", empty: true, markers: [] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", chips: ["Hebbal", "Nagawara", "Jakkur"], total: 0 }, { t: "zero", title: "No matching listings in your 3 selected areas", sub: "Buy · 3 BHK · up to ₹1.2 Cr", actions: ["Add nearby areas", "Increase budget", "Remove 3 BHK", "Clear filters", "Create alert"] }] }
        }
      }
    ]
  });

  // ============================ J6 — saved alert =============================
  J.push({
    id: "J6", name: "Saved-search alert", device: "desktop", issues: ["#2019"],
    intent: "Save the exact result scope and filters, and restore them from a notification.",
    steps: [
      {
        id: "J6.1", label: "Zero-result state", state: "E1",
        note: "Alerts are reachable from a result state or a zero-result state.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", empty: true, markers: [] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", chips: ["Hebbal", "Nagawara", "Jakkur"], total: 0 }, { t: "zero", title: "No matching listings in your 3 selected areas", sub: "Buy · 3 BHK · up to ₹1.2 Cr", actions: ["Add nearby areas", "Increase budget", "Create alert"] }] }
        }
      },
      {
        id: "J6.2", label: "Confirm the alert", state: "F1", action: "Create alert.",
        delta: { node: U, scope: "restated exactly, not re-derived", filters: "restated exactly", camera: U, history: "no entry" },
        note: "Frequency defaults to Daily. An unsupported filter would be disclosed here (F4), never dropped silently.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", empty: true, markers: [] },
          panel: { blocks: [{ t: "alertform", areas: "Hebbal · Nagawara · Jakkur", filters: "Buy · 3 BHK · up to ₹1.2 Cr", freq: "Daily" }] }
        }
      },
      {
        id: "J6.3", label: "Saved", state: "F5", action: "Create alert — persistence confirmed.",
        delta: { node: U, scope: "saved as AREA_SET with stable area keys", filters: "saved with a fingerprint", camera: U, history: "no entry" },
        note: "Success copy appears only once the alert is durably stored. A failure keeps the form and offers Retry (F6).",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", empty: true, markers: [] },
          panel: { blocks: [{ t: "note", tone: "ok", text: "Alert saved. Daily · Hebbal · Nagawara · Jakkur · Buy · 3 BHK · up to ₹1.2 Cr" }, { t: "alertlist", rows: [{ label: "Hebbal · Nagawara · Jakkur", kind: "3 areas", status: "Active", freq: "Daily", checked: "checked 2 h ago", n: 0 }] }] }
        }
      },
      {
        id: "J6.4", label: "Manage alerts", state: "F8", action: "Open saved alerts.",
        delta: { node: U, scope: U, filters: U, camera: U, history: "one entry pushed" },
        note: "Each alert shows its scope kind, filters, status, frequency, last check and new matches.",
        frame: {
          crumb: ["Bangalore", "Saved alerts"],
          map: { preset: "spread", dim: true, markers: [] },
          panel: { blocks: [{ t: "head", eyebrow: "Saved searches", title: "Your alerts", stat: { v: 3, l: "alerts" } }, { t: "alertlist", rows: [{ label: "Hebbal · Nagawara · Jakkur", kind: "3 areas", status: "Active", freq: "Daily", checked: "checked 2 h ago", n: 2 }, { label: "Drawn area near Hennur", kind: "Polygon", status: "Paused", freq: "Daily", checked: "paused 3 d ago", n: 0 }, { label: "Visible map area · fixed rectangle", kind: "Viewport", status: "Active", freq: "Weekly", checked: "checked 1 d ago", n: 1 }] }] }
        }
      },
      {
        id: "J6.5", label: "Deep link restored", state: "F10", action: "Open the notification link.",
        delta: { node: "restored as navigation metadata", scope: "AREA_SET restored from stable area keys", filters: "restored exactly", camera: "fit saved union bounds", history: "fresh entry" },
        note: "A removed or renamed canonical area gets non-blocking recovery — never an unrelated replacement.",
        frame: {
          crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"],
          map: { preset: "trio", markers: [price(36, 44, "₹1.18 Cr", true), disc(62, 32, 1)] },
          panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", chips: ["Hebbal", "Nagawara", "Jakkur"], total: 2, actions: ["Manage alert"] }, { t: "note", tone: "ok", text: "2 new matches since this alert was last checked." }, { t: "listings", n: 2 }] }
        }
      }
    ]
  });

  // ===================== J7 — mobile list-first transitions ==================
  J.push({
    id: "J7", name: "Mobile list-first transitions", device: "mobile", issues: ["#2014", "#2017", "#2015", "#2018", "#2019"],
    intent: "Mobile is list-first. Map is an alternate presentation of the same canonical state, never another hierarchy level.",
    steps: [
      {
        id: "J7.1", label: "City list", state: "G1",
        note: "The city root opens as a list of directional destinations.",
        frame: { device: "mobile", kind: "list", crumb: ["Bangalore"], panel: { blocks: [{ t: "head", eyebrow: "Areas · Bangalore", title: "Where in Bangalore?", stat: { v: 939, l: "homes" } }, FILTERS, cityRows] } }
      },
      {
        id: "J7.2", label: "Direction list", state: "G1", action: "Tap North.",
        delta: { node: "node=blr-north", scope: "none", filters: U, camera: "bounds recorded for the map view", history: "one entry pushed" },
        note: "Back is labelled with the canonical parent, not “Back”.",
        frame: { device: "mobile", kind: "list", crumb: ["Bangalore", "North Bangalore"], panel: { blocks: [{ t: "back", label: "Bangalore" }, { t: "head", eyebrow: "Direction · North", title: "North Bangalore", stat: { v: 186, l: "homes" } }, northRows] } }
      },
      {
        id: "J7.3", label: "Area list", action: "Tap Hebbal & Yelahanka.",
        delta: { node: "node=blr-north-hebbal-yelahanka", scope: "none", filters: U, camera: "local bounds", history: "one entry pushed" },
        note: "Local destination reached — the next tap selects a canonical area.",
        frame: { device: "mobile", kind: "list", crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"], panel: { blocks: [{ t: "back", label: "North Bangalore" }, { t: "head", eyebrow: "Local destination", title: "Hebbal · Yelahanka", stat: { v: 74, l: "homes" } }, { t: "note", tone: "info", text: "5 areas with matches" }, areaRows] } }
      },
      {
        id: "J7.4", label: "View map", state: "G2", action: "View map.",
        delta: { node: U, scope: U, filters: U, camera: "full-screen presentation of the same bounds", history: "no entry — presentation only" },
        note: "Same canonical state, different presentation. List returns to exactly this state.",
        frame: { device: "mobile", kind: "map", crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"], map: { preset: "local", markers: [clus(40, 34, "Hebbal · Nagawara", 3, 120, 50), area(72, 24, "Yelahanka", 31), area(64, 58, "Jakkur", 22)] }, sheet: { title: "5 areas with matches", rows: [{ name: "Hebbal", count: 42 }, { name: "Yelahanka", count: 31 }] } }
      },
      {
        id: "J7.5", label: "Cluster zoom", state: "G2", action: "Tap the visual cluster.",
        delta: { node: U, scope: U, filters: U, camera: "zoomed to cluster members", history: "no entry" },
        note: "Breadcrumb unchanged; the bottom sheet updates to the visible members and offers the full list.",
        frame: { device: "mobile", kind: "map", crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka"], map: { preset: "hebbal", markers: [area(34, 32, "Hebbal", 42), area(66, 26, "Nagawara", 31), area(48, 64, "Kempapura", 8)] }, sheet: { title: "3 areas in this map view", action: "Show all 5 areas", rows: [{ name: "Hebbal", count: 42 }, { name: "Nagawara", count: 31 }, { name: "Kempapura", count: 8 }] } }
      },
      {
        id: "J7.6", label: "Draft areas", state: "B2", action: "List → tap Hebbal → Compare nearby → add Nagawara.",
        delta: { node: "node=…-hebbal", scope: "draft AREA_SET · Hebbal + Nagawara", filters: U, camera: U, history: "selecting Hebbal pushed once; draft edits push nothing" },
        note: "Sticky commit stays reachable at 390×844; the maximum-three rule is stated in place.",
        frame: { device: "mobile", kind: "list", crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"], panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", draft: true, chips: ["Hebbal", "Nagawara"], total: 73 }, { t: "suggestions", rows: [{ name: "Jakkur", listings: 22, schools: 7, rel: "2.1 km away" }, { name: "Kempapura", listings: 8, schools: 3, rel: "3.4 km away" }] }, { t: "note", tone: "muted", text: "Maximum three areas." }] }, sticky: { label: "Show 73 listings" } }
      },
      {
        id: "J7.7", label: "Committed", state: "C1", action: "Show 73 listings.",
        delta: { node: U, scope: "AREA_SET committed · 2 areas", filters: U, camera: "fit union bounds once", history: "one entry pushed" },
        note: "Chips and combined total sit above the list — not a fake breadcrumb.",
        frame: { device: "mobile", kind: "list", crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"], panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", chips: ["Hebbal", "Nagawara"], total: 73, actions: ["Edit areas"] }, { t: "schools", title: "Schools in selected areas", n: 21, sub: "Located inside these areas." }, { t: "listings", n: 2 }] }, sticky: { label: "View map", ghost: true } }
      },
      {
        id: "J7.8", label: "Viewport search", state: "A7", action: "View map → move the map → Search this area.",
        delta: { node: U, scope: "AREA_SET → VIEWPORT · Visible map area", filters: U, camera: "committed bounds", history: "one entry pushed" },
        note: "The floating action clears the zoom controls, attribution and the listing peek.",
        frame: { device: "mobile", kind: "map", crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"], map: { preset: "trio", offset: [-40, 28], viewportRect: true, markers: [price(34, 34, "₹88 L"), disc(62, 46, 21)] }, sheet: { scope: "VIEWPORT", title: "Visible map area · 47 homes", action: "Return to Hebbal + Nagawara" } }
      },
      {
        id: "J7.9", label: "Zero recovery", state: "E11", action: "Tighten the filters until nothing matches, then return to List.",
        delta: { node: U, scope: "unchanged — the failed search is preserved", filters: "unchanged", camera: U, history: "no entry" },
        note: "Recovery actions sit above the map so an oversized empty map cannot push them out of reach.",
        frame: { device: "mobile", kind: "list", crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"], panel: { blocks: [{ t: "scopebar", kind: "AREA_SET", chips: ["Hebbal", "Nagawara"], total: 0 }, { t: "zero", title: "No matching listings in your 2 selected areas", sub: "Buy · 3 BHK · up to ₹1.2 Cr", actions: ["Add nearby areas", "Increase budget", "Create alert"] }] }, sticky: { label: "View map", ghost: true } }
      },
      {
        id: "J7.10", label: "Alert saved", state: "F5", action: "Create alert → confirm.",
        delta: { node: U, scope: "saved exactly as shown", filters: "saved exactly as shown", camera: U, history: "no entry" },
        note: "Confirmation and management both fit above the sticky action at 390×844.",
        frame: { device: "mobile", kind: "list", crumb: ["Bangalore", "North Bangalore", "Hebbal · Yelahanka", "Hebbal"], panel: { blocks: [{ t: "note", tone: "ok", text: "Alert saved. Daily · Hebbal · Nagawara · Buy · 3 BHK · up to ₹1.2 Cr" }, { t: "alertlist", rows: [{ label: "Hebbal · Nagawara", kind: "2 areas", status: "Active", freq: "Daily", checked: "checked just now", n: 0 }] }] } }
      }
    ]
  });

  // ---- marker legend ---------------------------------------------------------
  const LEGEND = [
    { k: "dest", title: "Hierarchy destination", behaviour: "Changes node= and breadcrumb. Pushes history.", shape: "Solid navy card, representative names, count as hero, “Tap to explore ›”." },
    { k: "cluster", title: "Visual area cluster", behaviour: "Camera only. node=, breadcrumb and result scope all unchanged.", shape: "Dashed hollow chip, magnifier-plus glyph, “+N areas with matches”, “Tap to zoom”." },
    { k: "area", title: "Individual area", behaviour: "Selects the canonical area and opens its listings.", shape: "White pill with a pointed tail, map-pin glyph, “Tap to view homes”." },
    { k: "price", title: "Listing price / cluster", behaviour: "Property grammar. Focus only — never a scope change.", shape: "Mono price pill; solid copper disc with a count when dense." },
    { k: "chip", title: "Result-scope chip", behaviour: "Names the one active scope. Dashed while a draft is being edited.", shape: "Square-cornered bordered chip with a scope glyph and ×." }
  ];

  // ---- unresolved decisions --------------------------------------------------
  const UNRESOLVED = [
    { q: "Viewport scope lifetime", body: "#2015 says refresh and property Back restore a committed VIEWPORT, but not whether it survives hierarchy navigation or a return visit a day later. This page assumes it is dropped when node= changes.", tag: "#2015" },
    { q: "Breadcrumb for non-contiguous sets", body: "#2017 forbids a fake breadcrumb for multi-area sets but does not say which node= remains. J2 keeps the last visited node and shows the set as chips only.", tag: "#2017" },
    { q: "Two count semantics", body: "Suggestion counts (#2017) are whole-area totals; recovery counts (#2018) are filter-aware. Both are labelled here — unify or keep the distinction?", tag: "#2017 / #2018" },
    { q: "Fourth-area behaviour", body: "#2017 fixes the maximum at three but does not say whether a fourth offers a swap or a hard stop. B4 and J2.4 offer a swap without choosing which chip is released.", tag: "#2017" },
    { q: "Schools from zero-listing areas", body: "#2016 counts schools located in selected areas. Whether a 0-listing area should still contribute to “28 schools” beside a property total is not stated.", tag: "#2016" },
    { q: "Frozen-rectangle alerts", body: "#2019 permits saving a committed VIEWPORT. F3 saves a fixed rectangle and says so; resolving it to canonical areas at save time would be easier to describe in management.", tag: "#2019" },
    { q: "Search this area before the camera moves", body: "#2015 defines the dirty-viewport rule but not the control's resting state. J4 shows it absent until a settled user-driven move.", tag: "#2015" }
  ];

  window.TX = { CAM: CAM, journeys: J, legend: LEGEND, unresolved: UNRESOLVED };
})();

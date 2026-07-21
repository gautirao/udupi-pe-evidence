// ============================================================================
// Unified Discover Portal — mock data (Bangalore Property Tracker · ReTrends)
// GitHub #1740. ONE data model behind ONE Discover shell.
//
//   Discover Bangalore
//     → optional region scope (North/South/East/West/Central)
//     → optional journey: area | school | listings | agri
//     → narrowed result
//
// Residential (area / school / listings) and AGRICULTURAL land are kept in
// SEPARATE tables and never mixed:
//   • region bubbles + all residential counts come from `listings` (homes only).
//   • agri corridors/clusters/parcels come from `agri` and never touch the
//     residential counts, layers or lists.
//
// DATA HONESTY: every count is derived from the real records below (see COUNTS
// and AGRI_COUNTS). School radius uses live haversine (DIST) over `listings`.
// ============================================================================

// ---- formatters + geo helpers ----
window.BLR_DIST = function (a, b) {
  if (!a || !b || a.lat == null || a.lon == null || b.lat == null || b.lon == null) return null;
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};
window.BLR_NOUN = function (mode, n) {
  if (mode === "Rent") return n === 1 ? "rental" : "rentals";
  return n === 1 ? "home for sale" : "homes for sale";
};
window.BLR_TITLE = function (mode) { return mode === "Rent" ? "Rentals" : "Homes for sale"; };
window.BLR_INR = function (p) {
  const cr = p / 10000000;
  if (cr >= 1) return `₹${cr.toFixed(2)} Cr`;
  return `₹${(p / 100000).toFixed(0)} L`;
};
window.BLR_INR_SHORT = function (p) {
  return p >= 10000000 ? `₹${(p / 10000000).toFixed(2)} Cr` : `₹${(p / 100000).toFixed(0)} L`;
};

const IMG = [
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=720&h=480&fit=crop",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=720&h=480&fit=crop",
  "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=720&h=480&fit=crop",
  "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=720&h=480&fit=crop",
  "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=720&h=480&fit=crop",
  "https://images.unsplash.com/photo-1576941089067-2de3c901e126?w=720&h=480&fit=crop",
  "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=720&h=480&fit=crop",
  "https://images.unsplash.com/photo-1480074568708-e7b720bb3f09?w=720&h=480&fit=crop",
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=720&h=480&fit=crop",
  "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=720&h=480&fit=crop",
  "https://images.unsplash.com/photo-1567496898669-ee935f5f647a?w=720&h=480&fit=crop",
  "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=720&h=480&fit=crop",
];
const LAND = [
  "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=720&h=480&fit=crop",
  "https://images.unsplash.com/photo-1444858291040-58f756a3bdd6?w=720&h=480&fit=crop",
  "https://images.unsplash.com/photo-1560493676-04071c5f467b?w=720&h=480&fit=crop",
  "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=720&h=480&fit=crop",
];

window.BLR_DATA = {
  city: { name: "Bangalore", lat: 12.9800, lon: 77.6050, zoom: 11 },

  // ---- Macro regions (city landing). Counts = residential listings only. ----
  regions: [
    { id: "north", name: "North Bangalore", short: "North", cue: "Airport corridor",
      blurb: "The airport-growth corridor — Hebbal, Yelahanka and the belt out to Devanahalli. Fast metro and highway access, new gated projects and strong appreciation.",
      center: { lat: 13.0900, lon: 77.6050 }, bounds: [[12.99, 77.55], [13.28, 77.73]] },
    { id: "south", name: "South Bangalore", short: "South", cue: "Established south",
      blurb: "Leafy, established neighbourhoods — Jayanagar, JP Nagar, Banashankari. Mature infrastructure, good schools and steady resale demand.",
      center: { lat: 12.9100, lon: 77.5850 }, bounds: [[12.83, 77.53], [12.95, 77.65]] },
    { id: "east", name: "East Bangalore", short: "East", cue: "IT corridor",
      blurb: "The tech belt — Whitefield, Marathahalli, KR Puram. Close to the big IT parks, high rental churn and a deep apartment market.",
      center: { lat: 12.9950, lon: 77.7150 }, bounds: [[12.93, 77.66], [13.02, 77.78]] },
    { id: "west", name: "West Bangalore", short: "West", cue: "Old-city west",
      blurb: "Rajajinagar, Vijayanagar and Malleshwaram — well-connected old-Bangalore addresses with independent houses and value apartments.",
      center: { lat: 12.9950, lon: 77.5450 }, bounds: [[12.95, 77.50], [13.03, 77.58]] },
    { id: "central", name: "Central Bangalore", short: "Central", cue: "City core",
      blurb: "Indiranagar, Koramangala and the MG Road core — premium, walkable and always in demand for both buyers and renters.",
      center: { lat: 12.9720, lon: 77.6280 }, bounds: [[12.94, 77.59], [12.99, 77.66]] },
  ],

  // ---- Area GROUPS (residential "search by area" journey). ----
  groups: [
    { id: "airport-belt", region: "north", name: "Airport Belt", blurb: "The Bellary Road / airport corridor — the fastest-growing pocket, anchored by Hebbal and running out to Devanahalli.", exampleAreas: ["Hebbal", "Yelahanka", "Devanahalli", "Jakkur"], center: { lat: 13.1000, lon: 77.6100 }, bounds: [[13.02, 77.57], [13.26, 77.72]] },
    { id: "north-growth", region: "north", name: "Thanisandra–Hennur Belt", blurb: "The Thanisandra–Hennur growth arc — 29 localities of newer apartment supply and metro-linked demand east of the airport road.", exampleAreas: ["Thanisandra", "Hennur", "Kalyan Nagar"], center: { lat: 13.0480, lon: 77.6380 }, bounds: [[13.000, 77.598], [13.098, 77.678]] },
    { id: "outer-north", region: "north", name: "Outer North", blurb: "Value-led outer pockets toward Doddaballapur — bigger plots and emerging township projects.", exampleAreas: ["Doddaballapur"], center: { lat: 13.2200, lon: 77.5400 }, bounds: [[13.18, 77.50], [13.30, 77.58]] },
    { id: "south-core", region: "south", name: "South Core", blurb: "Jayanagar and JP Nagar — the established heart of the south with mature streets and dependable resale.", exampleAreas: ["Jayanagar", "JP Nagar"], center: { lat: 12.9200, lon: 77.5850 }, bounds: [[12.88, 77.56], [12.95, 77.61]] },
    { id: "it-corridor", region: "east", name: "IT Corridor", blurb: "Whitefield and Marathahalli — the deepest rental market in the city, wrapped around the tech parks.", exampleAreas: ["Whitefield", "Marathahalli"], center: { lat: 12.9800, lon: 77.7250 }, bounds: [[12.93, 77.69], [13.01, 77.77]] },
    { id: "west-core", region: "west", name: "West Core", blurb: "Rajajinagar and Malleshwaram — leafy, well-connected old-city addresses.", exampleAreas: ["Rajajinagar", "Malleshwaram"], center: { lat: 12.9950, lon: 77.5500 }, bounds: [[12.96, 77.52], [13.02, 77.58]] },
    { id: "central-core", region: "central", name: "Central Core", blurb: "Indiranagar and Koramangala — premium, walkable and always in demand.", exampleAreas: ["Indiranagar", "Koramangala"], center: { lat: 12.9600, lon: 77.6350 }, bounds: [[12.93, 77.60], [12.99, 77.66]] },
  ],

  // ---- School ZONES (residential-adjacent "search near school" journey). ----
  zones: [
    { id: "hebbal-jakkur", region: "north", name: "Hebbal & Jakkur Schools", blurb: "The Hebbal–Jakkur lake belt — CBSE and ICSE schools around Manyata and the flyover.", exampleAreas: ["Hebbal", "Jakkur"], center: { lat: 13.0560, lon: 77.6010 }, bounds: [[13.020, 77.582], [13.092, 77.620]] },
    { id: "yelahanka-airport", region: "north", name: "Yelahanka & Airport Schools", blurb: "Yelahanka's planned layouts out to Devanahalli — the densest cluster of international schools.", exampleAreas: ["Yelahanka", "Devanahalli"], center: { lat: 13.1400, lon: 77.6300 }, bounds: [[13.085, 77.582], [13.262, 77.728]] },
    { id: "thanisandra-hennur", region: "north", name: "Thanisandra & Hennur Schools", blurb: "The Thanisandra–Hennur arc — newer international and CBSE schools beside fresh supply.", exampleAreas: ["Thanisandra", "Hennur"], center: { lat: 13.0530, lon: 77.6355 }, bounds: [[13.026, 77.616], [13.080, 77.656]] },
    { id: "south-schools", region: "south", name: "South Core Schools", blurb: "Jayanagar and JP Nagar's established schools.", exampleAreas: ["Jayanagar", "JP Nagar"], center: { lat: 12.9160, lon: 77.5840 }, bounds: [[12.892, 77.569], [12.940, 77.600]] },
    { id: "east-schools", region: "east", name: "IT Corridor Schools", blurb: "The international-school cluster around Whitefield.", exampleAreas: ["Whitefield", "Marathahalli"], center: { lat: 12.9700, lon: 77.7300 }, bounds: [[12.941, 77.687], [12.986, 77.766]] },
    { id: "west-schools", region: "west", name: "West Core Schools", blurb: "Rajajinagar and Malleshwaram's heritage schools.", exampleAreas: ["Rajajinagar", "Malleshwaram"], center: { lat: 12.9970, lon: 77.5600 }, bounds: [[12.976, 77.541], [13.018, 77.585]] },
    { id: "central-schools", region: "central", name: "Central Core Schools", blurb: "Premium central schools around Indiranagar and Koramangala.", exampleAreas: ["Indiranagar", "Koramangala"], center: { lat: 12.9550, lon: 77.6320 }, bounds: [[12.920, 77.610], [12.987, 77.656]] },
  ],

  // ---- Areas — the shared neighbourhood layer. Each carries BOTH `group`
  //      (area journey) and `zone` (school journey) membership. ----
  areas: [
    { id: "hebbal", region: "north", group: "airport-belt", zone: "hebbal-jakkur", name: "Hebbal", blurb: "Lake-side connectivity hub at the foot of the flyover — metro, ORR and airport road meet here.", lat: 13.0358, lon: 77.5970, bounds: [[13.020, 77.585], [13.052, 77.612]] },
    { id: "yelahanka", region: "north", group: "airport-belt", zone: "yelahanka-airport", name: "Yelahanka", blurb: "Planned satellite town with wide roads, gated layouts and easy airport access.", lat: 13.1007, lon: 77.5963, bounds: [[13.085, 77.582], [13.118, 77.612]] },
    { id: "jakkur", region: "north", group: "airport-belt", zone: "hebbal-jakkur", name: "Jakkur", blurb: "Lake-and-aerodrome pocket between Hebbal and Yelahanka — villas and mid-rise projects.", lat: 13.0776, lon: 77.6060, bounds: [[13.064, 77.593], [13.092, 77.620]] },
    { id: "devanahalli", region: "north", group: "airport-belt", zone: "yelahanka-airport", name: "Devanahalli", blurb: "Airport-adjacent township belt — larger plots, business park and premium gated communities.", lat: 13.2437, lon: 77.7115, bounds: [[13.228, 77.696], [13.262, 77.728]] },
    { id: "thanisandra", region: "north", group: "north-growth", zone: "thanisandra-hennur", name: "Thanisandra", blurb: "Fast-supplying apartment corridor off the airport road with metro-linked demand.", lat: 13.0650, lon: 77.6300, bounds: [[13.050, 77.616], [13.080, 77.645]] },
    { id: "hennur", region: "north", group: "north-growth", zone: "thanisandra-hennur", name: "Hennur", blurb: "Green, mid-market belt bridging the airport road to the outer ring road.", lat: 13.0410, lon: 77.6410, bounds: [[13.026, 77.627], [13.056, 77.656]] },
    // --- Thanisandra–Hennur Belt — dense-group localities (backend-owned; listings generated below) ---
    { id: "rk-hegde-nagar", region: "north", group: "north-growth", zone: null, name: "R.K. Hegde Nagar", blurb: "Apartment-heavy pocket beside Thanisandra Main Road.", lat: 13.0620, lon: 77.6205, bounds: [[13.054, 77.612], [13.070, 77.629]] },
    { id: "kalyan-nagar", region: "north", group: "north-growth", zone: null, name: "Kalyan Nagar", blurb: "Established mid-premium address off the outer ring road.", lat: 13.0230, lon: 77.6420, bounds: [[13.015, 77.634], [13.031, 77.650]] },
    { id: "hbr-layout", region: "north", group: "north-growth", zone: null, name: "HBR Layout", blurb: "Planned blocks between Hennur Road and the ORR.", lat: 13.0350, lon: 77.6270, bounds: [[13.027, 77.619], [13.043, 77.635]] },
    { id: "hennur-gardens", region: "north", group: "north-growth", zone: null, name: "Hennur Gardens", blurb: "Leafy gated-community stretch off Hennur Main Road.", lat: 13.0480, lon: 77.6440, bounds: [[13.040, 77.636], [13.056, 77.652]] },
    { id: "nagavara", region: "north", group: "north-growth", zone: null, name: "Nagavara", blurb: "Lakeside pocket beside Manyata Tech Park.", lat: 13.0450, lon: 77.6210, bounds: [[13.037, 77.613], [13.053, 77.629]] },
    { id: "byrathi", region: "north", group: "north-growth", zone: null, name: "Byrathi", blurb: "Fast-building villa-and-plot belt on Hennur–Bagalur Road.", lat: 13.0630, lon: 77.6560, bounds: [[13.055, 77.648], [13.071, 77.664]] },
    { id: "kothanur", region: "north", group: "north-growth", zone: null, name: "Kothanur", blurb: "Mid-market apartments around the Kothanur junction.", lat: 13.0570, lon: 77.6480, bounds: [[13.049, 77.640], [13.065, 77.656]] },
    { id: "horamavu", region: "north", group: "north-growth", zone: null, name: "Horamavu", blurb: "Value corridor between Banaswadi and the ORR.", lat: 13.0270, lon: 77.6600, bounds: [[13.019, 77.652], [13.035, 77.668]] },
    { id: "banaswadi", region: "north", group: "north-growth", zone: null, name: "Banaswadi", blurb: "Old-Bangalore grid with rail and ring-road links.", lat: 13.0140, lon: 77.6480, bounds: [[13.006, 77.640], [13.022, 77.656]] },
    { id: "kacharakanahalli", region: "north", group: "north-growth", zone: null, name: "Kacharakanahalli", blurb: "Quiet infill pocket between Hennur Road and Banaswadi.", lat: 13.0190, lon: 77.6350, bounds: [[13.011, 77.627], [13.027, 77.643]] },
    { id: "hrbr-layout", region: "north", group: "north-growth", zone: null, name: "HRBR Layout", blurb: "Premium planned blocks beside Kalyan Nagar.", lat: 13.0180, lon: 77.6440, bounds: [[13.010, 77.636], [13.026, 77.652]] },
    { id: "babusapalya", region: "north", group: "north-growth", zone: null, name: "Babusapalya", blurb: "High-churn rental pocket off Hennur Main Road.", lat: 13.0290, lon: 77.6500, bounds: [[13.021, 77.642], [13.037, 77.658]] },
    { id: "kalkere", region: "north", group: "north-growth", zone: null, name: "Kalkere", blurb: "Lake-adjacent value belt toward Horamavu.", lat: 13.0230, lon: 77.6660, bounds: [[13.015, 77.658], [13.031, 77.674]] },
    { id: "rachenahalli", region: "north", group: "north-growth", zone: null, name: "Rachenahalli", blurb: "Lakeside supply corridor behind Manyata.", lat: 13.0580, lon: 77.6250, bounds: [[13.050, 77.617], [13.066, 77.633]] },
    { id: "dodda-gubbi", region: "north", group: "north-growth", zone: null, name: "Dodda Gubbi", blurb: "Emerging plotted-development edge near the lake.", lat: 13.0900, lon: 77.6650, bounds: [[13.082, 77.657], [13.098, 77.673]] },
    { id: "chikkagubbi", region: "north", group: "north-growth", zone: null, name: "Chikkagubbi Village", blurb: "Village-edge plots on the belt's northern rim.", lat: 13.0830, lon: 77.6580, bounds: [[13.075, 77.650], [13.091, 77.666]] },
    { id: "bileshivale", region: "north", group: "north-growth", zone: null, name: "Bileshivale", blurb: "Low-density villa pocket off Hennur–Bagalur Road.", lat: 13.0740, lon: 77.6620, bounds: [[13.066, 77.654], [13.082, 77.670]] },
    { id: "kaval-bairasandra", region: "north", group: "north-growth", zone: null, name: "Kaval Bairasandra", blurb: "Dense inner pocket toward RT Nagar.", lat: 13.0140, lon: 77.6110, bounds: [[13.006, 77.603], [13.022, 77.619]] },
    { id: "ganganagar", region: "north", group: "north-growth", zone: null, name: "Ganganagar", blurb: "Old residential grid south of Hebbal.", lat: 13.0080, lon: 77.6050, bounds: [[13.000, 77.597], [13.016, 77.613]] },
    { id: "amani-byrathikhane", region: "north", group: "north-growth", zone: null, name: "Amani Byrathikhane", blurb: "Small lakeside pocket off Hennur Road.", lat: 13.0700, lon: 77.6480, bounds: [[13.062, 77.640], [13.078, 77.656]] },
    { id: "vignana-kendra", region: "north", group: "north-growth", zone: null, name: "Vignana Kendra", blurb: "Institutional edge beside Jakkur aerodrome.", lat: 13.0720, lon: 77.6150, bounds: [[13.064, 77.607], [13.080, 77.623]] },
    { id: "chelekere", region: "north", group: "north-growth", zone: null, name: "Chelekere", blurb: "Compact pocket between Kalyan Nagar and Hennur.", lat: 13.0300, lon: 77.6390, bounds: [[13.022, 77.631], [13.038, 77.647]] },
    { id: "geddalahalli", region: "north", group: "north-growth", zone: null, name: "Geddalahalli", blurb: "Hennur Road frontage with new mid-rise supply.", lat: 13.0480, lon: 77.6330, bounds: [[13.040, 77.625], [13.056, 77.641]] },
    { id: "k-narayanapura", region: "north", group: "north-growth", zone: null, name: "K. Narayanapura", blurb: "Student-and-rental pocket near Kristu Jayanti College.", lat: 13.0650, lon: 77.6440, bounds: [[13.057, 77.636], [13.073, 77.652]] },
    { id: "kyalasanahalli", region: "north", group: "north-growth", zone: null, name: "Kyalasanahalli", blurb: "Quiet village-edge plots off Hennur–Bagalur Road.", lat: 13.0780, lon: 77.6500, bounds: [[13.070, 77.642], [13.086, 77.658]] },
    { id: "sampigehalli", region: "north", group: "north-growth", zone: null, name: "Sampigehalli", blurb: "Emerging apartment pocket north of Thanisandra.", lat: 13.0750, lon: 77.6350, bounds: [[13.067, 77.627], [13.083, 77.643]] },
    { id: "thirumenahalli", region: "north", group: "north-growth", zone: null, name: "Thirumenahalli", blurb: "Gated-project belt between Jakkur and Thanisandra.", lat: 13.0850, lon: 77.6250, bounds: [[13.077, 77.617], [13.093, 77.633]] },
    { id: "doddaballapur", region: "north", group: "outer-north", zone: null, name: "Doddaballapur", blurb: "Emerging township and plotted-development belt for value buyers.", lat: 13.2257, lon: 77.5370, bounds: [[13.208, 77.520], [13.244, 77.556]] },
    { id: "jayanagar", region: "south", group: "south-core", zone: "south-schools", name: "Jayanagar", blurb: "Iconic planned neighbourhood with blocks, parks and strong resale.", lat: 12.9250, lon: 77.5830, bounds: [[12.910, 77.569], [12.940, 77.598]] },
    { id: "jp-nagar", region: "south", group: "south-core", zone: "south-schools", name: "JP Nagar", blurb: "Family-friendly south belt with good schools and steady demand.", lat: 12.9070, lon: 77.5850, bounds: [[12.892, 77.571], [12.922, 77.600]] },
    { id: "whitefield", region: "east", group: "it-corridor", zone: "east-schools", name: "Whitefield", blurb: "The original tech township — deep apartment and villa market beside the IT parks.", lat: 12.9698, lon: 77.7500, bounds: [[12.954, 77.735], [12.986, 77.766]] },
    { id: "marathahalli", region: "east", group: "it-corridor", zone: "east-schools", name: "Marathahalli", blurb: "High-churn rental hub on the outer ring road between the tech parks.", lat: 12.9560, lon: 77.7010, bounds: [[12.941, 77.687], [12.971, 77.716]] },
    { id: "rajajinagar", region: "west", group: "west-core", zone: "west-schools", name: "Rajajinagar", blurb: "Well-connected old-city grid with independent houses and value flats.", lat: 12.9910, lon: 77.5550, bounds: [[12.976, 77.541], [13.006, 77.570]] },
    { id: "malleshwaram", region: "west", group: "west-core", zone: "west-schools", name: "Malleshwaram", blurb: "Leafy heritage neighbourhood, walkable and premium for the west.", lat: 13.0030, lon: 77.5700, bounds: [[12.988, 77.556], [13.018, 77.585]] },
    { id: "indiranagar", region: "central", group: "central-core", zone: "central-schools", name: "Indiranagar", blurb: "Premium, walkable core — restaurants, metro and top-tier resale.", lat: 12.9719, lon: 77.6412, bounds: [[12.957, 77.627], [12.987, 77.656]] },
    { id: "koramangala", region: "central", group: "central-core", zone: "central-schools", name: "Koramangala", blurb: "Startup-and-cafe heartland with the deepest premium-rental demand.", lat: 12.9352, lon: 77.6245, bounds: [[12.920, 77.610], [12.950, 77.639]] },
  ],

  // ---- Schools (school journey). areaId + zone + region locate each. ----
  schools: [
    { id: "s-vidyaniketan", name: "Vidyaniketan Public School, Hebbal", address: "Hebbal Kempapura", area: "Hebbal", areaId: "hebbal", zone: "hebbal-jakkur", region: "north", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary", "Higher Secondary"], lat: 13.0442, lon: 77.5910 },
    { id: "s-presidency", name: "Presidency School, Hebbal", address: "Hebbal", area: "Hebbal", areaId: "hebbal", zone: "hebbal-jakkur", region: "north", type: "ICSE", board: "ICSE", levels: ["Primary", "Secondary"], lat: 13.0385, lon: 77.6035 },
    { id: "s-kensri", name: "Kensri School, Hebbal", address: "Hennur–Bellary Rd", area: "Hebbal", areaId: "hebbal", zone: "hebbal-jakkur", region: "north", type: "ICSE", board: "ICSE", levels: ["Primary", "Secondary", "Higher Secondary"], lat: 13.0370, lon: 77.6150 },
    { id: "s-dps-north", name: "Delhi Public School North, Sahakarnagar", address: "Sahakar Nagar / Jakkur", area: "Jakkur", areaId: "jakkur", zone: "hebbal-jakkur", region: "north", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary", "Higher Secondary"], lat: 13.0625, lon: 77.5860 },
    { id: "s-gnan", name: "Gnan Srishti School of Excellence, Jakkur", address: "Jakkur Main Rd", area: "Jakkur", areaId: "jakkur", zone: "hebbal-jakkur", region: "north", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary"], lat: 13.0812, lon: 77.6118 },
    { id: "s-vidyashilp", name: "Vidyashilp Academy", address: "Yelahanka", area: "Yelahanka", areaId: "yelahanka", zone: "yelahanka-airport", region: "north", type: "International", board: "International", levels: ["Primary", "Secondary", "Higher Secondary"], lat: 13.1060, lon: 77.5850 },
    { id: "s-canadian", name: "Canadian International School", address: "Yelahanka", area: "Yelahanka", areaId: "yelahanka", zone: "yelahanka-airport", region: "north", type: "International", board: "International", levels: ["Primary", "Secondary", "Higher Secondary"], lat: 13.1120, lon: 77.6010 },
    { id: "s-ryan-yel", name: "Ryan International School, Yelahanka", address: "Yelahanka New Town", area: "Yelahanka", areaId: "yelahanka", zone: "yelahanka-airport", region: "north", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary"], lat: 13.0985, lon: 77.5905 },
    { id: "s-akash", name: "Akash International School, Devanahalli", address: "Devanahalli", area: "Devanahalli", areaId: "devanahalli", zone: "yelahanka-airport", region: "north", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary"], lat: 13.2300, lon: 77.7000 },
    { id: "s-stonehill", name: "Stonehill International School", address: "Tarahunise, Devanahalli", area: "Devanahalli", areaId: "devanahalli", zone: "yelahanka-airport", region: "north", type: "International", board: "International", levels: ["Primary", "Secondary", "Higher Secondary"], lat: 13.1900, lon: 77.6420 },
    { id: "s-vibgyor", name: "VIBGYOR High, Thanisandra", address: "Thanisandra Main Rd", area: "Thanisandra", areaId: "thanisandra", zone: "thanisandra-hennur", region: "north", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary", "Higher Secondary"], lat: 13.0680, lon: 77.6280 },
    { id: "s-legacy", name: "Legacy School, Thanisandra", address: "Rachenahalli", area: "Thanisandra", areaId: "thanisandra", zone: "thanisandra-hennur", region: "north", type: "ICSE", board: "ICSE", levels: ["Primary", "Secondary"], lat: 13.0605, lon: 77.6350 },
    { id: "s-baldwin", name: "New Baldwin International School, Hennur", address: "Hennur Main Rd", area: "Hennur", areaId: "hennur", zone: "thanisandra-hennur", region: "north", type: "ICSE", board: "ICSE", levels: ["Primary", "Secondary", "Higher Secondary"], lat: 13.0430, lon: 77.6385 },
    { id: "s-euro", name: "EuroSchool, Hennur", address: "Hennur–Bagalur Rd", area: "Hennur", areaId: "hennur", zone: "thanisandra-hennur", region: "north", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary"], lat: 13.0450, lon: 77.6445 },
    { id: "s-nps-jayanagar", name: "National Public School, Jayanagar", address: "Jayanagar 4th Block", area: "Jayanagar", areaId: "jayanagar", zone: "south-schools", region: "south", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary", "Higher Secondary"], lat: 12.9260, lon: 77.5825 },
    { id: "s-carmel-jp", name: "Carmel School, JP Nagar", address: "JP Nagar 6th Phase", area: "JP Nagar", areaId: "jp-nagar", zone: "south-schools", region: "south", type: "ICSE", board: "ICSE", levels: ["Primary", "Secondary"], lat: 12.9080, lon: 77.5840 },
    { id: "s-vibgyor-wf", name: "VIBGYOR High, Whitefield", address: "Whitefield Main Rd", area: "Whitefield", areaId: "whitefield", zone: "east-schools", region: "east", type: "International", board: "International", levels: ["Primary", "Secondary", "Higher Secondary"], lat: 12.9710, lon: 77.7480 },
    { id: "s-mes-raj", name: "MES Kishora Kendra, Rajajinagar", address: "Rajajinagar", area: "Rajajinagar", areaId: "rajajinagar", zone: "west-schools", region: "west", type: "State", board: "State", levels: ["Primary", "Secondary"], lat: 12.9915, lon: 77.5545 },
    { id: "s-nhps-indira", name: "New Horizon Public School, Indiranagar", address: "Indiranagar", area: "Indiranagar", areaId: "indiranagar", zone: "central-schools", region: "central", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary"], lat: 12.9720, lon: 77.6405 },
  ],

  // ---- Residential listings (homes only — NO agri land here). ----
  listings: [
    // North · Airport Belt · Hebbal
    { id: "h1", title: "3 BHK lake-view apartment, Hebbal", locality: "Hebbal Kempapura", area: "Hebbal", areaId: "hebbal", group: "airport-belt", region: "north", price: 21500000, beds: 3, baths: 3, sqft: 1720, propType: "Apartment", trustTier: "verified", tag: "New", image: IMG[0], lat: 13.0372, lon: 77.5942 },
    { id: "h2", title: "2 BHK near Hebbal flyover", locality: "Nagavara", area: "Hebbal", areaId: "hebbal", group: "airport-belt", region: "north", price: 12800000, beds: 2, baths: 2, sqft: 1180, propType: "Apartment", trustTier: "trusted", image: IMG[1], lat: 13.0410, lon: 77.6020 },
    { id: "h3", title: "4 BHK villa, Hebbal", locality: "Sahakar Nagar", area: "Hebbal", areaId: "hebbal", group: "airport-belt", region: "north", price: 38500000, beds: 4, baths: 4, sqft: 3100, propType: "Villa", trustTier: "verified", image: IMG[2], lat: 13.0330, lon: 77.5905 },
    { id: "h4", title: "3 BHK gated flat, Hebbal", locality: "Kempapura", area: "Hebbal", areaId: "hebbal", group: "airport-belt", region: "north", price: 17900000, beds: 3, baths: 2, sqft: 1460, propType: "Apartment", trustTier: "trusted", image: IMG[3], lat: 13.0388, lon: 77.5988 },
    { id: "h5", title: "2 BHK ORR-facing, Hebbal", locality: "Manyata side", area: "Hebbal", areaId: "hebbal", group: "airport-belt", region: "north", price: 11200000, beds: 2, baths: 2, sqft: 1080, propType: "Apartment", trustTier: "listed", image: IMG[8], lat: 13.0428, lon: 77.6045 },
    { id: "h6", title: "4 BHK penthouse, Hebbal", locality: "Hebbal Kempapura", area: "Hebbal", areaId: "hebbal", group: "airport-belt", region: "north", price: 46000000, beds: 4, baths: 5, sqft: 3600, propType: "Penthouse", trustTier: "verified", tag: "New", image: IMG[11], lat: 13.0355, lon: 77.5960 },
    { id: "h7", title: "3 BHK independent house, Hebbal", locality: "RT Nagar edge", area: "Hebbal", areaId: "hebbal", group: "airport-belt", region: "north", price: 24500000, beds: 3, baths: 3, sqft: 2000, propType: "Independent House", trustTier: "trusted", image: IMG[5], lat: 13.0300, lon: 77.5930 },
    { id: "h8", title: "1 BHK compact flat, Hebbal", locality: "Nagavara", area: "Hebbal", areaId: "hebbal", group: "airport-belt", region: "north", price: 7200000, beds: 1, baths: 1, sqft: 640, propType: "Apartment", trustTier: "listed", image: IMG[9], lat: 13.0445, lon: 77.5998 },
    // North · Airport Belt · Yelahanka
    { id: "y1", title: "3 BHK gated apartment, Yelahanka", locality: "Yelahanka New Town", area: "Yelahanka", areaId: "yelahanka", group: "airport-belt", region: "north", price: 15200000, beds: 3, baths: 2, sqft: 1500, propType: "Apartment", trustTier: "verified", image: IMG[4], lat: 13.1020, lon: 77.5950 },
    { id: "y2", title: "4 BHK villa, Yelahanka", locality: "Judicial Layout", area: "Yelahanka", areaId: "yelahanka", group: "airport-belt", region: "north", price: 32000000, beds: 4, baths: 4, sqft: 2800, propType: "Villa", trustTier: "verified", tag: "New", image: IMG[2], lat: 13.0985, lon: 77.5990 },
    { id: "y3", title: "2 BHK near Yelahanka station", locality: "Yelahanka Old Town", area: "Yelahanka", areaId: "yelahanka", group: "airport-belt", region: "north", price: 9800000, beds: 2, baths: 2, sqft: 1050, propType: "Apartment", trustTier: "trusted", image: IMG[1], lat: 13.1040, lon: 77.5920 },
    { id: "y4", title: "3 BHK plot-built home, Yelahanka", locality: "Attur Layout", area: "Yelahanka", areaId: "yelahanka", group: "airport-belt", region: "north", price: 18500000, beds: 3, baths: 3, sqft: 1780, propType: "Independent House", trustTier: "trusted", image: IMG[5], lat: 13.1105, lon: 77.5980 },
    { id: "y5", title: "1 BHK studio, Yelahanka", locality: "Yelahanka New Town", area: "Yelahanka", areaId: "yelahanka", group: "airport-belt", region: "north", price: 6400000, beds: 1, baths: 1, sqft: 600, propType: "Apartment", trustTier: "listed", image: IMG[8], lat: 13.1005, lon: 77.5975 },
    // North · Airport Belt · Jakkur
    { id: "j1", title: "3 BHK lake-facing, Jakkur", locality: "Jakkur Plantation", area: "Jakkur", areaId: "jakkur", group: "airport-belt", region: "north", price: 19500000, beds: 3, baths: 3, sqft: 1620, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 13.0790, lon: 77.6045 },
    { id: "j2", title: "4 BHK villa near Jakkur aerodrome", locality: "Amruthahalli", area: "Jakkur", areaId: "jakkur", group: "airport-belt", region: "north", price: 34500000, beds: 4, baths: 4, sqft: 2950, propType: "Villa", trustTier: "verified", image: IMG[2], lat: 13.0660, lon: 77.5920 },
    { id: "j3", title: "2 BHK apartment, Jakkur", locality: "Jakkur Main Rd", area: "Jakkur", areaId: "jakkur", group: "airport-belt", region: "north", price: 10800000, beds: 2, baths: 2, sqft: 1120, propType: "Apartment", trustTier: "trusted", tag: "New", image: IMG[3], lat: 13.0800, lon: 77.6030 },
    { id: "j4", title: "3 BHK gated flat, Jakkur", locality: "Byatarayanapura", area: "Jakkur", areaId: "jakkur", group: "airport-belt", region: "north", price: 16200000, beds: 3, baths: 2, sqft: 1440, propType: "Apartment", trustTier: "listed", image: IMG[1], lat: 13.0745, lon: 77.6055 },
    // North · Airport Belt · Devanahalli
    { id: "d1", title: "4 BHK villa, Devanahalli", locality: "Airport Business Park", area: "Devanahalli", areaId: "devanahalli", group: "airport-belt", region: "north", price: 41000000, beds: 4, baths: 5, sqft: 3400, propType: "Villa", trustTier: "verified", tag: "New", image: IMG[11], lat: 13.2450, lon: 77.7100 },
    { id: "d2", title: "3 BHK township apartment, Devanahalli", locality: "Devanahalli town", area: "Devanahalli", areaId: "devanahalli", group: "airport-belt", region: "north", price: 14500000, beds: 3, baths: 3, sqft: 1560, propType: "Apartment", trustTier: "trusted", image: IMG[4], lat: 13.2420, lon: 77.7130 },
    { id: "d3", title: "Plot-built 3 BHK, Devanahalli", locality: "Bettakote", area: "Devanahalli", areaId: "devanahalli", group: "airport-belt", region: "north", price: 12800000, beds: 3, baths: 2, sqft: 1500, propType: "Independent House", trustTier: "listed", image: IMG[5], lat: 13.2405, lon: 77.7090 },
    // North · North Growth · Thanisandra
    { id: "t1", title: "3 BHK apartment, Thanisandra", locality: "Thanisandra Main Rd", area: "Thanisandra", areaId: "thanisandra", group: "north-growth", region: "north", price: 13500000, beds: 3, baths: 2, sqft: 1480, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 13.0665, lon: 77.6285 },
    { id: "t2", title: "2 BHK gated flat, Thanisandra", locality: "Rachenahalli", area: "Thanisandra", areaId: "thanisandra", group: "north-growth", region: "north", price: 9500000, beds: 2, baths: 2, sqft: 1080, propType: "Apartment", trustTier: "trusted", image: IMG[1], lat: 13.0630, lon: 77.6320 },
    { id: "t3", title: "3 BHK near Manyata, Thanisandra", locality: "Nagavara side", area: "Thanisandra", areaId: "thanisandra", group: "north-growth", region: "north", price: 16800000, beds: 3, baths: 3, sqft: 1600, propType: "Apartment", trustTier: "trusted", tag: "New", image: IMG[3], lat: 13.0680, lon: 77.6260 },
    { id: "t4", title: "4 BHK villa, Thanisandra", locality: "Kogilu", area: "Thanisandra", areaId: "thanisandra", group: "north-growth", region: "north", price: 29500000, beds: 4, baths: 4, sqft: 2700, propType: "Villa", trustTier: "verified", image: IMG[2], lat: 13.0700, lon: 77.6300 },
    // North · North Growth · Hennur
    { id: "he1", title: "3 BHK apartment, Hennur", locality: "Hennur Main Rd", area: "Hennur", areaId: "hennur", group: "north-growth", region: "north", price: 12200000, beds: 3, baths: 2, sqft: 1400, propType: "Apartment", trustTier: "trusted", image: IMG[4], lat: 13.0420, lon: 77.6395 },
    { id: "he2", title: "2 BHK gated flat, Hennur", locality: "Kalyan Nagar side", area: "Hennur", areaId: "hennur", group: "north-growth", region: "north", price: 8600000, beds: 2, baths: 2, sqft: 1020, propType: "Apartment", trustTier: "listed", image: IMG[8], lat: 13.0395, lon: 77.6430 },
    { id: "he3", title: "4 BHK villa, Hennur", locality: "Hennur-Bagalur Rd", area: "Hennur", areaId: "hennur", group: "north-growth", region: "north", price: 27800000, beds: 4, baths: 4, sqft: 2600, propType: "Villa", trustTier: "verified", tag: "New", image: IMG[2], lat: 13.0440, lon: 77.6440 },
    // North · Outer North · Doddaballapur
    { id: "db1", title: "3 BHK township home, Doddaballapur", locality: "Doddaballapur town", area: "Doddaballapur", areaId: "doddaballapur", group: "outer-north", region: "north", price: 8200000, beds: 3, baths: 2, sqft: 1450, propType: "Independent House", trustTier: "trusted", image: IMG[5], lat: 13.2270, lon: 77.5360 },
    { id: "db2", title: "2 BHK apartment, Doddaballapur", locality: "Bashettihalli", area: "Doddaballapur", areaId: "doddaballapur", group: "outer-north", region: "north", price: 5400000, beds: 2, baths: 2, sqft: 980, propType: "Apartment", trustTier: "listed", image: IMG[1], lat: 13.2240, lon: 77.5385 },
    // South · South Core · Jayanagar
    { id: "ja1", title: "3 BHK in Jayanagar", locality: "4th Block", area: "Jayanagar", areaId: "jayanagar", group: "south-core", region: "south", price: 22500000, beds: 3, baths: 3, sqft: 1650, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 12.9260, lon: 77.5825 },
    { id: "ja2", title: "2 BHK near Jayanagar market", locality: "9th Block", area: "Jayanagar", areaId: "jayanagar", group: "south-core", region: "south", price: 14800000, beds: 2, baths: 2, sqft: 1160, propType: "Apartment", trustTier: "trusted", image: IMG[1], lat: 12.9235, lon: 77.5855 },
    { id: "ja3", title: "4 BHK independent house, Jayanagar", locality: "3rd Block", area: "Jayanagar", areaId: "jayanagar", group: "south-core", region: "south", price: 41000000, beds: 4, baths: 4, sqft: 3000, propType: "Independent House", trustTier: "verified", image: IMG[2], lat: 12.9280, lon: 77.5810 },
    // South · South Core · JP Nagar
    { id: "jp1", title: "3 BHK apartment, JP Nagar", locality: "6th Phase", area: "JP Nagar", areaId: "jp-nagar", group: "south-core", region: "south", price: 16500000, beds: 3, baths: 2, sqft: 1500, propType: "Apartment", trustTier: "trusted", tag: "New", image: IMG[3], lat: 12.9080, lon: 77.5840 },
    { id: "jp2", title: "2 BHK gated flat, JP Nagar", locality: "5th Phase", area: "JP Nagar", areaId: "jp-nagar", group: "south-core", region: "south", price: 10900000, beds: 2, baths: 2, sqft: 1120, propType: "Apartment", trustTier: "listed", image: IMG[8], lat: 12.9055, lon: 77.5865 },
    // East · IT Corridor · Whitefield
    { id: "w1", title: "3 BHK near ITPL, Whitefield", locality: "Whitefield Main Rd", area: "Whitefield", areaId: "whitefield", group: "it-corridor", region: "east", price: 15500000, beds: 3, baths: 3, sqft: 1580, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 12.9710, lon: 77.7490 },
    { id: "w2", title: "2 BHK gated flat, Whitefield", locality: "Varthur Rd", area: "Whitefield", areaId: "whitefield", group: "it-corridor", region: "east", price: 9900000, beds: 2, baths: 2, sqft: 1100, propType: "Apartment", trustTier: "trusted", image: IMG[1], lat: 12.9680, lon: 77.7520 },
    { id: "w3", title: "4 BHK villa, Whitefield", locality: "Whitefield", area: "Whitefield", areaId: "whitefield", group: "it-corridor", region: "east", price: 33500000, beds: 4, baths: 4, sqft: 2850, propType: "Villa", trustTier: "verified", tag: "New", image: IMG[2], lat: 12.9720, lon: 77.7460 },
    // East · IT Corridor · Marathahalli
    { id: "m1", title: "2 BHK on ORR, Marathahalli", locality: "Outer Ring Rd", area: "Marathahalli", areaId: "marathahalli", group: "it-corridor", region: "east", price: 9200000, beds: 2, baths: 2, sqft: 1080, propType: "Apartment", trustTier: "trusted", image: IMG[3], lat: 12.9570, lon: 77.7000 },
    { id: "m2", title: "3 BHK apartment, Marathahalli", locality: "AECS Layout", area: "Marathahalli", areaId: "marathahalli", group: "it-corridor", region: "east", price: 13800000, beds: 3, baths: 2, sqft: 1420, propType: "Apartment", trustTier: "listed", image: IMG[4], lat: 12.9545, lon: 77.7030 },
    // West · West Core · Rajajinagar
    { id: "r1", title: "3 BHK in Rajajinagar", locality: "1st Block", area: "Rajajinagar", areaId: "rajajinagar", group: "west-core", region: "west", price: 18500000, beds: 3, baths: 3, sqft: 1550, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 12.9920, lon: 77.5540 },
    { id: "r2", title: "4 BHK independent house, Rajajinagar", locality: "2nd Stage", area: "Rajajinagar", areaId: "rajajinagar", group: "west-core", region: "west", price: 36000000, beds: 4, baths: 4, sqft: 2900, propType: "Independent House", trustTier: "trusted", image: IMG[2], lat: 12.9895, lon: 77.5565 },
    // West · West Core · Malleshwaram
    { id: "ma1", title: "3 BHK in Malleshwaram", locality: "8th Cross", area: "Malleshwaram", areaId: "malleshwaram", group: "west-core", region: "west", price: 24500000, beds: 3, baths: 3, sqft: 1620, propType: "Apartment", trustTier: "verified", tag: "New", image: IMG[3], lat: 13.0040, lon: 77.5690 },
    { id: "ma2", title: "2 BHK heritage flat, Malleshwaram", locality: "15th Cross", area: "Malleshwaram", areaId: "malleshwaram", group: "west-core", region: "west", price: 15200000, beds: 2, baths: 2, sqft: 1180, propType: "Apartment", trustTier: "trusted", image: IMG[1], lat: 13.0020, lon: 77.5715 },
    // Central · Central Core · Indiranagar
    { id: "i1", title: "3 BHK in Indiranagar", locality: "12th Main", area: "Indiranagar", areaId: "indiranagar", group: "central-core", region: "central", price: 34500000, beds: 3, baths: 3, sqft: 1780, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 12.9725, lon: 77.6400 },
    { id: "i2", title: "2 BHK near metro, Indiranagar", locality: "CMH Rd", area: "Indiranagar", areaId: "indiranagar", group: "central-core", region: "central", price: 21000000, beds: 2, baths: 2, sqft: 1200, propType: "Apartment", trustTier: "trusted", image: IMG[1], lat: 12.9740, lon: 77.6425 },
    { id: "i3", title: "4 BHK penthouse, Indiranagar", locality: "100 Ft Rd", area: "Indiranagar", areaId: "indiranagar", group: "central-core", region: "central", price: 62000000, beds: 4, baths: 5, sqft: 3400, propType: "Penthouse", trustTier: "verified", tag: "New", image: IMG[11], lat: 12.9705, lon: 77.6440 },
    // Central · Central Core · Koramangala
    { id: "k1", title: "3 BHK in Koramangala", locality: "5th Block", area: "Koramangala", areaId: "koramangala", group: "central-core", region: "central", price: 38500000, beds: 3, baths: 3, sqft: 1820, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 12.9360, lon: 77.6235 },
    { id: "k2", title: "2 BHK gated flat, Koramangala", locality: "6th Block", area: "Koramangala", areaId: "koramangala", group: "central-core", region: "central", price: 22500000, beds: 2, baths: 2, sqft: 1220, propType: "Apartment", trustTier: "trusted", image: IMG[1], lat: 12.9340, lon: 77.6260 },
    { id: "k3", title: "4 BHK villa, Koramangala", locality: "3rd Block", area: "Koramangala", areaId: "koramangala", group: "central-core", region: "central", price: 55000000, beds: 4, baths: 4, sqft: 3100, propType: "Villa", trustTier: "verified", image: IMG[2], lat: 12.9375, lon: 77.6220 },
  ],

  // ==========================================================================
  // AGRICULTURAL LAND — a SEPARATE model. Corridor → cluster → parcel.
  // Never mixed with residential counts, layers or lists.
  // ==========================================================================
  agri: {
    // Direction-first, distance-band agricultural discovery (reference: agri-discovery kit).
    // corridor = compass DIRECTION wedge from the city · cluster = TOWN inside it ·
    // parcel = individual agri listing. distKm = straight-line from the city centre;
    // a larger distance band (maxKm) grows the map wedge AND includes nearer towns too.
    distances: [10, 25, 50, 100],
    defaultMaxKm: 100,
    corridors: [
      { id: "n-doddaballapur", dir: "N", label: "N towards Doddaballapur", short: "North", bearing: 0, half: 36, blurb: "Airport-side farmland — vineyards, floriculture and investment land up the Doddaballapur–Chikkaballapur belt.", keyTowns: ["Yelahanka Rural", "Doddaballapur", "Chikkaballapur"] },
      { id: "e-hoskote", dir: "E", label: "E towards Hoskote & Kolar", short: "East", bearing: 90, half: 36, blurb: "Red-soil horticulture and poultry land east of the city, out past Hoskote and Malur toward Kolar.", keyTowns: ["Hoskote", "Malur", "Kolar"] },
      { id: "s-kanakapura", dir: "S", label: "S towards Kanakapura", short: "South", bearing: 180, half: 36, blurb: "Green, well-watered farmland — mango, coconut and riverside plots down the Kanakapura Road belt.", keyTowns: ["Harohalli", "Kanakapura", "Sathanur"] },
      { id: "w-magadi", dir: "W", label: "W towards Magadi & Ramanagara", short: "West", bearing: 270, half: 36, blurb: "Rain-fed and borewell farmland toward Magadi and Ramanagara — ragi, plantation and farmhouse plots.", keyTowns: ["Nelamangala", "Magadi", "Ramanagara"] },
    ],
    clusters: [
      { id: "t-yelahanka-rural", corridor: "n-doddaballapur", name: "Yelahanka Rural", blurb: "Peri-urban plots and nurseries just north of the city.", distKm: 16, lat: 13.130, lon: 77.600, bounds: [[13.10, 77.57], [13.16, 77.63]] },
      { id: "t-doddaballapur", corridor: "n-doddaballapur", name: "Doddaballapur", blurb: "Vineyard and floriculture belt around Doddaballapur town.", distKm: 40, lat: 13.290, lon: 77.540, bounds: [[13.25, 77.50], [13.33, 77.58]] },
      { id: "t-chikkaballapur", corridor: "n-doddaballapur", name: "Chikkaballapur", blurb: "Grape and vegetable farms toward the Nandi foothills.", distKm: 57, lat: 13.432, lon: 77.727, bounds: [[13.39, 77.68], [13.47, 77.77]] },
      { id: "t-hoskote", corridor: "e-hoskote", name: "Hoskote", blurb: "Red-soil horticulture land off NH-75.", distKm: 28, lat: 13.070, lon: 77.790, bounds: [[13.03, 77.75], [13.11, 77.83]] },
      { id: "t-malur", corridor: "e-hoskote", name: "Malur", blurb: "Industrial-adjacent farm plots and land banking.", distKm: 40, lat: 13.000, lon: 77.940, bounds: [[12.96, 77.90], [13.04, 77.98]] },
      { id: "t-kolar", corridor: "e-hoskote", name: "Kolar", blurb: "Mango, silk and value farm plots toward Kolar.", distKm: 65, lat: 13.136, lon: 78.130, bounds: [[13.09, 78.09], [13.18, 78.17]] },
      { id: "t-harohalli", corridor: "s-kanakapura", name: "Harohalli", blurb: "Mango and coconut farms near Harohalli industrial area.", distKm: 33, lat: 12.790, lon: 77.470, bounds: [[12.75, 77.43], [12.83, 77.51]] },
      { id: "t-kanakapura", corridor: "s-kanakapura", name: "Kanakapura", blurb: "Well-watered weekend farm plots near the Cauvery.", distKm: 55, lat: 12.550, lon: 77.420, bounds: [[12.51, 77.38], [12.59, 77.46]] },
      { id: "t-sathanur", corridor: "s-kanakapura", name: "Sathanur", blurb: "Riverside plantation and orchard land toward the Cauvery.", distKm: 75, lat: 12.420, lon: 77.350, bounds: [[12.38, 77.31], [12.46, 77.39]] },
      { id: "t-nelamangala", corridor: "w-magadi", name: "Nelamangala", blurb: "Highway-adjacent land banking toward Tumakuru road.", distKm: 28, lat: 13.100, lon: 77.390, bounds: [[13.06, 77.35], [13.14, 77.43]] },
      { id: "t-magadi", corridor: "w-magadi", name: "Magadi", blurb: "Plantation and farmhouse plots near Magadi town.", distKm: 42, lat: 12.960, lon: 77.220, bounds: [[12.92, 77.18], [13.00, 77.26]] },
      { id: "t-ramanagara", corridor: "w-magadi", name: "Ramanagara", blurb: "Silk-town farmland and rocky-belt plantation plots.", distKm: 50, lat: 12.720, lon: 77.280, bounds: [[12.68, 77.24], [12.76, 77.32]] },
    ],
    parcels: [
      { id: "p1", title: "3.2-acre vineyard plot", cluster: "t-doddaballapur", corridor: "n-doddaballapur", acres: 3.2, price: 14500000, distKm: 41, road: "Tar road", water: "Borewell", soil: "Red loam", crop: "Vineyard", survey: "Survey 42/1", trustTier: "verified", image: LAND[0], lat: 13.292, lon: 77.543 },
      { id: "p2", title: "1.5-acre floriculture farm", cluster: "t-doddaballapur", corridor: "n-doddaballapur", acres: 1.5, price: 7200000, distKm: 40, road: "Mud road", water: "Borewell", soil: "Red loam", crop: "Floriculture", survey: "Survey 51/3", trustTier: "trusted", image: LAND[1], lat: 13.288, lon: 77.537 },
      { id: "p3", title: "1-acre nursery plot, Yelahanka Rural", cluster: "t-yelahanka-rural", corridor: "n-doddaballapur", acres: 1.0, price: 9000000, distKm: 16, road: "Tar road", water: "Borewell", soil: "Red loam", crop: "Nursery", survey: "Survey 12/2", trustTier: "trusted", image: LAND[2], lat: 13.131, lon: 77.602 },
      { id: "p4", title: "2.4-acre vegetable farm, Yelahanka Rural", cluster: "t-yelahanka-rural", corridor: "n-doddaballapur", acres: 2.4, price: 15500000, distKm: 17, road: "Tar road", water: "Borewell + open well", soil: "Red loam", crop: "Vegetables", survey: "Survey 12/5", trustTier: "verified", image: LAND[3], lat: 13.128, lon: 77.597 },
      { id: "p5", title: "4-acre grape farm, Chikkaballapur", cluster: "t-chikkaballapur", corridor: "n-doddaballapur", acres: 4.0, price: 13800000, distKm: 57, road: "Tar road", water: "Borewell", soil: "Red gravel", crop: "Grapes", survey: "Survey 88/1", trustTier: "verified", image: LAND[0], lat: 13.434, lon: 77.729 },
      { id: "p6", title: "5.5-acre investment land, Chikkaballapur", cluster: "t-chikkaballapur", corridor: "n-doddaballapur", acres: 5.5, price: 17500000, distKm: 58, road: "Highway access", water: "None", soil: "Red gravel", crop: "Fallow", survey: "Survey 90/2", trustTier: "listed", image: LAND[1], lat: 13.430, lon: 77.724 },
      { id: "p7", title: "3-acre horticulture plot, Hoskote", cluster: "t-hoskote", corridor: "e-hoskote", acres: 3.0, price: 12500000, distKm: 28, road: "Highway access", water: "Borewell", soil: "Red gravel", crop: "Horticulture", survey: "Survey 33/4", trustTier: "verified", image: LAND[2], lat: 13.072, lon: 77.792 },
      { id: "p8", title: "2-acre red-soil farm, Hoskote", cluster: "t-hoskote", corridor: "e-hoskote", acres: 2.0, price: 8000000, distKm: 27, road: "Tar road", water: "None", soil: "Red gravel", crop: "Fallow", survey: "Survey 34/1", trustTier: "listed", image: LAND[3], lat: 13.068, lon: 77.787 },
      { id: "p9", title: "4.5-acre land bank, Malur", cluster: "t-malur", corridor: "e-hoskote", acres: 4.5, price: 12000000, distKm: 40, road: "Highway access", water: "Borewell", soil: "Red gravel", crop: "Fallow", survey: "Survey 61/2", trustTier: "trusted", image: LAND[0], lat: 13.002, lon: 77.942 },
      { id: "p10", title: "2.2-acre mulberry farm, Malur", cluster: "t-malur", corridor: "e-hoskote", acres: 2.2, price: 8900000, distKm: 41, road: "Tar road", water: "Borewell", soil: "Red loam", crop: "Sericulture", survey: "Survey 62/5", trustTier: "trusted", image: LAND[1], lat: 12.997, lon: 77.937 },
      { id: "p11", title: "6-acre mango farm, Kolar", cluster: "t-kolar", corridor: "e-hoskote", acres: 6.0, price: 19500000, distKm: 65, road: "Tar road", water: "Borewell + open well", soil: "Red loam", crop: "Mango", survey: "Survey 120/1", trustTier: "verified", image: LAND[2], lat: 13.138, lon: 78.132 },
      { id: "p12", title: "3.5-acre value plot, Kolar", cluster: "t-kolar", corridor: "e-hoskote", acres: 3.5, price: 9800000, distKm: 66, road: "Mud road", water: "None", soil: "Red gravel", crop: "Fallow", survey: "Survey 121/3", trustTier: "listed", image: LAND[3], lat: 13.133, lon: 78.127 },
      { id: "p13", title: "4-acre mango orchard, Harohalli", cluster: "t-harohalli", corridor: "s-kanakapura", acres: 4.0, price: 16800000, distKm: 33, road: "Tar road", water: "Borewell + open well", soil: "Red loam", crop: "Mango", survey: "Survey 45/2", trustTier: "verified", image: LAND[0], lat: 12.792, lon: 77.472 },
      { id: "p14", title: "2.5-acre coconut farm, Harohalli", cluster: "t-harohalli", corridor: "s-kanakapura", acres: 2.5, price: 11200000, distKm: 34, road: "Mud road", water: "Canal", soil: "Red loam", crop: "Coconut", survey: "Survey 46/1", trustTier: "trusted", image: LAND[1], lat: 12.787, lon: 77.467 },
      { id: "p15", title: "1-acre weekend farm, Kanakapura", cluster: "t-kanakapura", corridor: "s-kanakapura", acres: 1.0, price: 6500000, distKm: 55, road: "Tar road", water: "Borewell", soil: "Red loam", crop: "Mixed", survey: "Survey 77/4", trustTier: "trusted", image: LAND[2], lat: 12.552, lon: 77.422 },
      { id: "p16", title: "6-acre riverside land, Kanakapura", cluster: "t-kanakapura", corridor: "s-kanakapura", acres: 6.0, price: 27000000, distKm: 57, road: "Tar road", water: "River + borewell", soil: "Alluvial", crop: "Plantation", survey: "Survey 78/1", trustTier: "verified", image: LAND[3], lat: 12.547, lon: 77.417 },
      { id: "p17", title: "8-acre plantation, Sathanur", cluster: "t-sathanur", corridor: "s-kanakapura", acres: 8.0, price: 30000000, distKm: 75, road: "Tar road", water: "River + borewell", soil: "Alluvial", crop: "Plantation", survey: "Survey 101/2", trustTier: "verified", image: LAND[0], lat: 12.422, lon: 77.352 },
      { id: "p18", title: "3-acre orchard, Sathanur", cluster: "t-sathanur", corridor: "s-kanakapura", acres: 3.0, price: 10500000, distKm: 76, road: "Mud road", water: "Borewell", soil: "Red loam", crop: "Orchard", survey: "Survey 102/4", trustTier: "listed", image: LAND[1], lat: 12.418, lon: 77.347 },
      { id: "p19", title: "5-acre land bank, Nelamangala", cluster: "t-nelamangala", corridor: "w-magadi", acres: 5.0, price: 20500000, distKm: 28, road: "Highway access", water: "Borewell", soil: "Red gravel", crop: "Fallow", survey: "Survey 22/1", trustTier: "verified", image: LAND[2], lat: 13.102, lon: 77.392 },
      { id: "p20", title: "2.2-acre ragi farm, Nelamangala", cluster: "t-nelamangala", corridor: "w-magadi", acres: 2.2, price: 8900000, distKm: 29, road: "Tar road", water: "Borewell", soil: "Red loam", crop: "Ragi", survey: "Survey 23/5", trustTier: "trusted", image: LAND[3], lat: 13.097, lon: 77.387 },
      { id: "p21", title: "3-acre plantation plot, Magadi", cluster: "t-magadi", corridor: "w-magadi", acres: 3.0, price: 10500000, distKm: 42, road: "Tar road", water: "Borewell", soil: "Red loam", crop: "Plantation", survey: "Survey 55/2", trustTier: "trusted", image: LAND[0], lat: 12.962, lon: 77.222 },
      { id: "p22", title: "1.8-acre farmhouse plot, Magadi", cluster: "t-magadi", corridor: "w-magadi", acres: 1.8, price: 7800000, distKm: 43, road: "Mud road", water: "Borewell", soil: "Red loam", crop: "Farmhouse", survey: "Survey 56/1", trustTier: "listed", image: LAND[1], lat: 12.957, lon: 77.217 },
      { id: "p23", title: "4-acre silk-belt farm, Ramanagara", cluster: "t-ramanagara", corridor: "w-magadi", acres: 4.0, price: 13500000, distKm: 50, road: "Highway access", water: "Borewell", soil: "Red gravel", crop: "Sericulture", survey: "Survey 70/3", trustTier: "verified", image: LAND[2], lat: 12.722, lon: 77.282 },
      { id: "p24", title: "2.6-acre plantation plot, Ramanagara", cluster: "t-ramanagara", corridor: "w-magadi", acres: 2.6, price: 9600000, distKm: 51, road: "Tar road", water: "Open well", soil: "Red loam", crop: "Plantation", survey: "Survey 71/2", trustTier: "trusted", image: LAND[3], lat: 12.717, lon: 77.277 },
    ],
  },
};

// ---- Generated belt listings (Thanisandra–Hennur Belt dense-group stress case) ----
// ⚠ DESIGN-PROTOTYPE MOCK DATA ONLY. This file is the fixture for the Claude Design
// kit — it is not application code and touches no backend, API, OpenSearch index or
// database. In production every count stays backend/API-owned; this generator exists
// solely so the mock belt is real *records* (not fabricated render-time counts):
// every marker/panel number is still derived from `listings`.
(function () {
  const D = window.BLR_DATA;
  // Target homes per belt area. Thanisandra (4 curated) + Hennur (3 curated)
  // are topped up; every other belt area is fully generated. Belt total = 181.
  const TARGET = {
    thanisandra: 46, hennur: 17, "rk-hegde-nagar": 13, "kalyan-nagar": 12, "hbr-layout": 11,
    "hennur-gardens": 9, nagavara: 8, byrathi: 8, kothanur: 7, horamavu: 7, banaswadi: 6,
    kacharakanahalli: 5, "hrbr-layout": 5, babusapalya: 4, kalkere: 3, rachenahalli: 3,
    "dodda-gubbi": 2, chikkagubbi: 2, bileshivale: 2, "kaval-bairasandra": 2,
    ganganagar: 1, "amani-byrathikhane": 1, "vignana-kendra": 1, chelekere: 1,
    geddalahalli: 1, "k-narayanapura": 1, kyalasanahalli: 1, sampigehalli: 1, thirumenahalli: 1,
  };
  const SPECS = [
    { t: "Apartment", beds: 2, baths: 2, sqft: 1080, base: 9600000 },
    { t: "Apartment", beds: 3, baths: 2, sqft: 1460, base: 13900000 },
    { t: "Apartment", beds: 3, baths: 3, sqft: 1640, base: 17200000 },
    { t: "Apartment", beds: 1, baths: 1, sqft: 630, base: 6300000 },
    { t: "Villa", beds: 4, baths: 4, sqft: 2760, base: 28800000 },
    { t: "Independent House", beds: 3, baths: 3, sqft: 1880, base: 20500000 },
    { t: "Apartment", beds: 2, baths: 2, sqft: 1180, base: 11200000 },
    { t: "Penthouse", beds: 4, baths: 5, sqft: 3300, base: 43500000 },
  ];
  const TIERS = ["verified", "trusted", "listed", "trusted", "verified"];
  const IMGS = [];
  D.listings.forEach((l) => { if (IMGS.indexOf(l.image) === -1) IMGS.push(l.image); });
  const existing = {};
  D.listings.forEach((l) => { existing[l.areaId] = (existing[l.areaId] || 0) + 1; });
  let seq = 0;
  Object.keys(TARGET).forEach((areaId) => {
    const a = D.areas.find((x) => x.id === areaId);
    if (!a) return;
    const need = TARGET[areaId] - (existing[areaId] || 0);
    for (let i = 0; i < need; i++) {
      seq++;
      const sp = SPECS[seq % SPECS.length];
      const frac = ((seq * 37) % 100) / 100;              // deterministic 0..1
      const ang = seq * 2.399963;                          // golden angle — even scatter
      const rad = 0.0028 + 0.0052 * (((seq * 53) % 100) / 100);
      const price = Math.round(sp.base * (0.86 + 0.28 * frac) / 100000) * 100000;
      D.listings.push({
        id: "g-" + areaId + "-" + i,
        title: sp.beds + " BHK " + (sp.t === "Apartment" ? "apartment" : sp.t.toLowerCase()) + ", " + a.name,
        locality: a.name, area: a.name, areaId: areaId, group: "north-growth", region: "north",
        price: price, beds: sp.beds, baths: sp.baths, sqft: sp.sqft, propType: sp.t,
        trustTier: TIERS[seq % TIERS.length], tag: seq % 9 === 0 ? "New" : undefined,
        image: IMGS[seq % IMGS.length],
        lat: +(a.lat + rad * Math.cos(ang)).toFixed(5),
        lon: +(a.lon + rad * Math.sin(ang)).toFixed(5),
      });
    }
  });
})();

// ---- Derived residential counts (single source of truth) ----
window.BLR_COUNTS = (function () {
  const D = window.BLR_DATA;
  const areaOf = {}; D.areas.forEach((a) => areaOf[a.id] = a);
  const homesRegion = {}, homesGroup = {}, homesArea = {}, homesZone = {};
  D.listings.forEach((l) => {
    homesRegion[l.region] = (homesRegion[l.region] || 0) + 1;
    homesGroup[l.group] = (homesGroup[l.group] || 0) + 1;
    homesArea[l.areaId] = (homesArea[l.areaId] || 0) + 1;
    const z = areaOf[l.areaId] && areaOf[l.areaId].zone;
    if (z) homesZone[z] = (homesZone[z] || 0) + 1;
  });
  const schoolsRegion = {}, schoolsZone = {}, schoolsArea = {};
  D.schools.forEach((s) => {
    schoolsRegion[s.region] = (schoolsRegion[s.region] || 0) + 1;
    schoolsZone[s.zone] = (schoolsZone[s.zone] || 0) + 1;
    schoolsArea[s.areaId] = (schoolsArea[s.areaId] || 0) + 1;
  });
  return {
    homesRegion: (id) => homesRegion[id] || 0,
    homesGroup: (id) => homesGroup[id] || 0,
    homesArea: (id) => homesArea[id] || 0,
    homesZone: (id) => homesZone[id] || 0,
    schoolsRegion: (id) => schoolsRegion[id] || 0,
    schoolsZone: (id) => schoolsZone[id] || 0,
    schoolsArea: (id) => schoolsArea[id] || 0,
    totalHomes: D.listings.length,
    totalSchools: D.schools.length,
  };
})();

// ---- Derived AGRI model (direction-first, distance-band; separate from residential) ----
window.BLR_AGRI = (function () {
  const A = window.BLR_DATA.agri;
  const townsOf = (dir) => A.clusters.filter((t) => t.corridor === dir);
  const visibleTowns = (dir, maxKm) => townsOf(dir).filter((t) => t.distKm <= (maxKm || 1e9));
  const parcelsOfTown = (tid) => A.parcels.filter((p) => p.cluster === tid);
  const dirParcels = (dir, maxKm) => { const ids = visibleTowns(dir, maxKm).map((t) => t.id); return A.parcels.filter((p) => ids.indexOf(p.cluster) !== -1); };
  return {
    townsOf, visibleTowns, parcelsOfTown, dirParcels,
    townAcres: (tid) => parcelsOfTown(tid).reduce((s, p) => s + p.acres, 0),
    townProps: (tid) => parcelsOfTown(tid).length,
    dirAcres: (dir, maxKm) => dirParcels(dir, maxKm).reduce((s, p) => s + p.acres, 0),
    dirProps: (dir, maxKm) => dirParcels(dir, maxKm).length,
    dirGroups: (dir, maxKm) => visibleTowns(dir, maxKm).length,
    maxTownDist: (dir) => Math.max.apply(null, townsOf(dir).map((t) => t.distKm)),
    totalParcels: A.parcels.length,
  };
})();

// Homes within `km` of a school (haversine over residential listings).
window.BLR_HOMES_NEAR = function (school, km) {
  return window.BLR_DATA.listings.filter((l) => {
    const d = window.BLR_DIST(school, l);
    return d != null && d <= km;
  });
};

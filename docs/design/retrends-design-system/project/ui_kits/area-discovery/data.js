// Bangalore Property Tracker — SCOPED AREA-FIRST discovery mock data.
// Redesign for GitHub #1740: scoped discovery navigation.
//
// Product model:  City → Region → (journey) → Group/Zone → Area → Listings
//   1. City landing      → macro REGION bubbles (North/South/East/West/Central)
//   2. Region selected   → top hotspots on map + journey options
//   3. Search by area    → area GROUPS/ZONES inside the region (Airport Belt …)
//   4. Group selected    → individual AREAS inside the group (Hebbal, Yelahanka …)
//   5. Area selected      → residential LISTINGS with filters
//   + Direct area search  → jump straight to an area, auto-resolving region/group
//
// DATA HONESTY: every count is derived from the real listing records below
//   (see BLR_AREA_COUNTS) — never invented. The map and the right panel always
//   read the same level, so bubbles and cards agree 1:1.
//   AREA-FIRST shows residential homes ONLY — agricultural land is a separate,
//   visually-detached journey (see city landing).

// Buy/Rent-aware noun for home counts.
window.BLR_NOUN = function (mode, n) {
  if (mode === "Rent") return n === 1 ? "rental" : "rentals";
  return n === 1 ? "home for sale" : "homes for sale";
};
window.BLR_TITLE = function (mode) { return mode === "Rent" ? "Rentals" : "Homes for sale"; };

// ₹ formatter — Cr above a crore, else Lakh. Always mono in the UI.
window.BLR_INR = function (p) {
  const cr = p / 10000000;
  if (cr >= 1) return `₹${cr.toFixed(2)} Cr`;
  return `₹${(p / 100000).toFixed(0)} L`;
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

window.BLR_AREA_DATA = {
  city: { name: "Bangalore", lat: 12.9800, lon: 77.6050, zoom: 11 },

  // ---- Macro regions (city landing). center = bubble anchor; bounds = fly target. ----
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

  // ---- Area groups / zones inside a region (the "search by area" level). ----
  groups: [
    // North Bangalore
    { id: "airport-belt", region: "north", name: "Airport Belt",
      blurb: "The Bellary Road / airport corridor — the fastest-growing pocket, anchored by Hebbal and running out to Devanahalli.",
      exampleAreas: ["Hebbal", "Yelahanka", "Devanahalli", "Jakkur"],
      center: { lat: 13.1000, lon: 77.6100 }, bounds: [[13.02, 77.57], [13.26, 77.72]] },
    { id: "north-growth", region: "north", name: "North Growth",
      blurb: "The Thanisandra–Hennur growth arc — newer apartment supply and metro-linked demand just east of the airport road.",
      exampleAreas: ["Thanisandra", "Hennur"],
      center: { lat: 13.0500, lon: 77.6350 }, bounds: [[13.02, 77.61], [13.08, 77.67]] },
    { id: "outer-north", region: "north", name: "Outer North",
      blurb: "Value-led outer pockets toward Doddaballapur — bigger plots and emerging township projects for patient buyers.",
      exampleAreas: ["Doddaballapur"],
      center: { lat: 13.2200, lon: 77.5400 }, bounds: [[13.18, 77.50], [13.30, 77.58]] },
    // South Bangalore
    { id: "south-core", region: "south", name: "South Core",
      blurb: "Jayanagar and JP Nagar — the established heart of the south with mature streets and dependable resale.",
      exampleAreas: ["Jayanagar", "JP Nagar"],
      center: { lat: 12.9200, lon: 77.5850 }, bounds: [[12.88, 77.56], [12.95, 77.61]] },
    // East Bangalore
    { id: "it-corridor", region: "east", name: "IT Corridor",
      blurb: "Whitefield and Marathahalli — the deepest rental market in the city, wrapped around the tech parks.",
      exampleAreas: ["Whitefield", "Marathahalli"],
      center: { lat: 12.9800, lon: 77.7250 }, bounds: [[12.93, 77.69], [13.01, 77.77]] },
    // West Bangalore
    { id: "west-core", region: "west", name: "West Core",
      blurb: "Rajajinagar and Malleshwaram — leafy, well-connected old-city addresses.",
      exampleAreas: ["Rajajinagar", "Malleshwaram"],
      center: { lat: 12.9950, lon: 77.5500 }, bounds: [[12.96, 77.52], [13.02, 77.58]] },
    // Central Bangalore
    { id: "central-core", region: "central", name: "Central Core",
      blurb: "Indiranagar and Koramangala — premium, walkable and always in demand.",
      exampleAreas: ["Indiranagar", "Koramangala"],
      center: { lat: 12.9600, lon: 77.6350 }, bounds: [[12.93, 77.60], [12.99, 77.66]] },
  ],

  // ---- Areas inside groups (the intermediary step before listings). ----
  areas: [
    // North · Airport Belt
    { id: "hebbal", group: "airport-belt", region: "north", name: "Hebbal", cue: "North Bangalore", blurb: "Lake-side connectivity hub at the foot of the flyover — metro, ORR and airport road all meet here.", lat: 13.0358, lon: 77.5970, bounds: [[13.020, 77.585], [13.052, 77.612]] },
    { id: "yelahanka", group: "airport-belt", region: "north", name: "Yelahanka", cue: "North Bangalore", blurb: "Planned satellite town with wide roads, gated layouts and easy airport access.", lat: 13.1007, lon: 77.5963, bounds: [[13.085, 77.582], [13.118, 77.612]] },
    { id: "jakkur", group: "airport-belt", region: "north", name: "Jakkur", cue: "North Bangalore", blurb: "Lake-and-aerodrome pocket between Hebbal and Yelahanka — villas and mid-rise projects.", lat: 13.0776, lon: 77.6060, bounds: [[13.064, 77.593], [13.092, 77.620]] },
    { id: "devanahalli", group: "airport-belt", region: "north", name: "Devanahalli", cue: "North Bangalore", blurb: "Airport-adjacent township belt — larger plots, business park and premium gated communities.", lat: 13.2437, lon: 77.7115, bounds: [[13.228, 77.696], [13.262, 77.728]] },
    // North · North Growth
    { id: "thanisandra", group: "north-growth", region: "north", name: "Thanisandra", cue: "North Bangalore", blurb: "Fast-supplying apartment corridor off the airport road with metro-linked demand.", lat: 13.0650, lon: 77.6300, bounds: [[13.050, 77.616], [13.080, 77.645]] },
    { id: "hennur", group: "north-growth", region: "north", name: "Hennur", cue: "North Bangalore", blurb: "Green, mid-market belt bridging the airport road to the outer ring road.", lat: 13.0410, lon: 77.6410, bounds: [[13.026, 77.627], [13.056, 77.656]] },
    // North · Outer North
    { id: "doddaballapur", group: "outer-north", region: "north", name: "Doddaballapur", cue: "North Bangalore", blurb: "Emerging township and plotted-development belt for value buyers.", lat: 13.2257, lon: 77.5370, bounds: [[13.208, 77.520], [13.244, 77.556]] },
    // South
    { id: "jayanagar", group: "south-core", region: "south", name: "Jayanagar", cue: "South Bangalore", blurb: "Iconic planned neighbourhood with blocks, parks and strong resale.", lat: 12.9250, lon: 77.5830, bounds: [[12.910, 77.569], [12.940, 77.598]] },
    { id: "jp-nagar", group: "south-core", region: "south", name: "JP Nagar", cue: "South Bangalore", blurb: "Family-friendly south belt with good schools and steady demand.", lat: 12.9070, lon: 77.5850, bounds: [[12.892, 77.571], [12.922, 77.600]] },
    // East
    { id: "whitefield", group: "it-corridor", region: "east", name: "Whitefield", cue: "East Bangalore", blurb: "The original tech township — deep apartment and villa market beside the IT parks.", lat: 12.9698, lon: 77.7500, bounds: [[12.954, 77.735], [12.986, 77.766]] },
    { id: "marathahalli", group: "it-corridor", region: "east", name: "Marathahalli", cue: "East Bangalore", blurb: "High-churn rental hub on the outer ring road between the tech parks.", lat: 12.9560, lon: 77.7010, bounds: [[12.941, 77.687], [12.971, 77.716]] },
    // West
    { id: "rajajinagar", group: "west-core", region: "west", name: "Rajajinagar", cue: "West Bangalore", blurb: "Well-connected old-city grid with independent houses and value flats.", lat: 12.9910, lon: 77.5550, bounds: [[12.976, 77.541], [13.006, 77.570]] },
    { id: "malleshwaram", group: "west-core", region: "west", name: "Malleshwaram", cue: "West Bangalore", blurb: "Leafy heritage neighbourhood, walkable and premium for the west.", lat: 13.0030, lon: 77.5700, bounds: [[12.988, 77.556], [13.018, 77.585]] },
    // Central
    { id: "indiranagar", group: "central-core", region: "central", name: "Indiranagar", cue: "Central Bangalore", blurb: "Premium, walkable core — restaurants, metro and top-tier resale.", lat: 12.9719, lon: 77.6412, bounds: [[12.957, 77.627], [12.987, 77.656]] },
    { id: "koramangala", group: "central-core", region: "central", name: "Koramangala", cue: "Central Bangalore", blurb: "Startup-and-cafe heartland with the deepest premium-rental demand.", lat: 12.9352, lon: 77.6245, bounds: [[12.920, 77.610], [12.950, 77.639]] },
  ],

  // ---- Listings (residential only). region + group + areaId locate each home. ----
  listings: [
    // ===== North · Airport Belt · Hebbal (8) =====
    { id: "h1", title: "3 BHK lake-view apartment, Hebbal", locality: "Hebbal Kempapura", area: "Hebbal", areaId: "hebbal", group: "airport-belt", region: "north", price: 21500000, beds: 3, baths: 3, sqft: 1720, propType: "Apartment", trustTier: "verified", tag: "New", image: IMG[0], lat: 13.0372, lon: 77.5942 },
    { id: "h2", title: "2 BHK near Hebbal flyover", locality: "Nagavara", area: "Hebbal", areaId: "hebbal", group: "airport-belt", region: "north", price: 12800000, beds: 2, baths: 2, sqft: 1180, propType: "Apartment", trustTier: "trusted", image: IMG[1], lat: 13.0410, lon: 77.6020 },
    { id: "h3", title: "4 BHK villa, Hebbal", locality: "Sahakar Nagar", area: "Hebbal", areaId: "hebbal", group: "airport-belt", region: "north", price: 38500000, beds: 4, baths: 4, sqft: 3100, propType: "Villa", trustTier: "verified", image: IMG[2], lat: 13.0330, lon: 77.5905 },
    { id: "h4", title: "3 BHK gated flat, Hebbal", locality: "Kempapura", area: "Hebbal", areaId: "hebbal", group: "airport-belt", region: "north", price: 17900000, beds: 3, baths: 2, sqft: 1460, propType: "Apartment", trustTier: "trusted", image: IMG[3], lat: 13.0388, lon: 77.5988 },
    { id: "h5", title: "2 BHK ORR-facing, Hebbal", locality: "Manyata tech park side", area: "Hebbal", areaId: "hebbal", group: "airport-belt", region: "north", price: 11200000, beds: 2, baths: 2, sqft: 1080, propType: "Apartment", trustTier: "listed", image: IMG[8], lat: 13.0428, lon: 77.6045 },
    { id: "h6", title: "4 BHK penthouse, Hebbal", locality: "Hebbal Kempapura", area: "Hebbal", areaId: "hebbal", group: "airport-belt", region: "north", price: 46000000, beds: 4, baths: 5, sqft: 3600, propType: "Penthouse", trustTier: "verified", tag: "New", image: IMG[11], lat: 13.0355, lon: 77.5960 },
    { id: "h7", title: "3 BHK independent house, Hebbal", locality: "RT Nagar edge", area: "Hebbal", areaId: "hebbal", group: "airport-belt", region: "north", price: 24500000, beds: 3, baths: 3, sqft: 2000, propType: "Independent House", trustTier: "trusted", image: IMG[5], lat: 13.0300, lon: 77.5930 },
    { id: "h8", title: "1 BHK compact flat, Hebbal", locality: "Nagavara", area: "Hebbal", areaId: "hebbal", group: "airport-belt", region: "north", price: 7200000, beds: 1, baths: 1, sqft: 640, propType: "Apartment", trustTier: "listed", image: IMG[9], lat: 13.0445, lon: 77.5998 },
    // ===== North · Airport Belt · Yelahanka (5) =====
    { id: "y1", title: "3 BHK gated apartment, Yelahanka", locality: "Yelahanka New Town", area: "Yelahanka", areaId: "yelahanka", group: "airport-belt", region: "north", price: 15200000, beds: 3, baths: 2, sqft: 1500, propType: "Apartment", trustTier: "verified", image: IMG[4], lat: 13.1020, lon: 77.5950 },
    { id: "y2", title: "4 BHK villa, Yelahanka", locality: "Judicial Layout", area: "Yelahanka", areaId: "yelahanka", group: "airport-belt", region: "north", price: 32000000, beds: 4, baths: 4, sqft: 2800, propType: "Villa", trustTier: "verified", tag: "New", image: IMG[2], lat: 13.0985, lon: 77.5990 },
    { id: "y3", title: "2 BHK near Yelahanka station", locality: "Yelahanka Old Town", area: "Yelahanka", areaId: "yelahanka", group: "airport-belt", region: "north", price: 9800000, beds: 2, baths: 2, sqft: 1050, propType: "Apartment", trustTier: "trusted", image: IMG[1], lat: 13.1040, lon: 77.5920 },
    { id: "y4", title: "3 BHK plot-built home, Yelahanka", locality: "Attur Layout", area: "Yelahanka", areaId: "yelahanka", group: "airport-belt", region: "north", price: 18500000, beds: 3, baths: 3, sqft: 1780, propType: "Independent House", trustTier: "trusted", image: IMG[5], lat: 13.0960, lon: 77.5935 },
    { id: "y5", title: "1 BHK studio, Yelahanka", locality: "Yelahanka New Town", area: "Yelahanka", areaId: "yelahanka", group: "airport-belt", region: "north", price: 6400000, beds: 1, baths: 1, sqft: 600, propType: "Apartment", trustTier: "listed", image: IMG[8], lat: 13.1005, lon: 77.5975 },
    // ===== North · Airport Belt · Jakkur (4) =====
    { id: "j1", title: "3 BHK lake-facing, Jakkur", locality: "Jakkur Plantation", area: "Jakkur", areaId: "jakkur", group: "airport-belt", region: "north", price: 19500000, beds: 3, baths: 3, sqft: 1620, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 13.0790, lon: 77.6045 },
    { id: "j2", title: "4 BHK villa near Jakkur aerodrome", locality: "Amruthahalli", area: "Jakkur", areaId: "jakkur", group: "airport-belt", region: "north", price: 34500000, beds: 4, baths: 4, sqft: 2950, propType: "Villa", trustTier: "verified", image: IMG[2], lat: 13.0760, lon: 77.6080 },
    { id: "j3", title: "2 BHK apartment, Jakkur", locality: "Jakkur Main Rd", area: "Jakkur", areaId: "jakkur", group: "airport-belt", region: "north", price: 10800000, beds: 2, baths: 2, sqft: 1120, propType: "Apartment", trustTier: "trusted", tag: "New", image: IMG[3], lat: 13.0800, lon: 77.6030 },
    { id: "j4", title: "3 BHK gated flat, Jakkur", locality: "Byatarayanapura", area: "Jakkur", areaId: "jakkur", group: "airport-belt", region: "north", price: 16200000, beds: 3, baths: 2, sqft: 1440, propType: "Apartment", trustTier: "listed", image: IMG[1], lat: 13.0745, lon: 77.6055 },
    // ===== North · Airport Belt · Devanahalli (3) =====
    { id: "d1", title: "4 BHK villa, Devanahalli", locality: "Airport Business Park", area: "Devanahalli", areaId: "devanahalli", group: "airport-belt", region: "north", price: 41000000, beds: 4, baths: 5, sqft: 3400, propType: "Villa", trustTier: "verified", tag: "New", image: IMG[11], lat: 13.2450, lon: 77.7100 },
    { id: "d2", title: "3 BHK township apartment, Devanahalli", locality: "Devanahalli town", area: "Devanahalli", areaId: "devanahalli", group: "airport-belt", region: "north", price: 14500000, beds: 3, baths: 3, sqft: 1560, propType: "Apartment", trustTier: "trusted", image: IMG[4], lat: 13.2420, lon: 77.7130 },
    { id: "d3", title: "Plot-built 3 BHK, Devanahalli", locality: "Bettakote", area: "Devanahalli", areaId: "devanahalli", group: "airport-belt", region: "north", price: 12800000, beds: 3, baths: 2, sqft: 1500, propType: "Independent House", trustTier: "listed", image: IMG[5], lat: 13.2405, lon: 77.7090 },
    // ===== North · North Growth · Thanisandra (4) =====
    { id: "t1", title: "3 BHK apartment, Thanisandra", locality: "Thanisandra Main Rd", area: "Thanisandra", areaId: "thanisandra", group: "north-growth", region: "north", price: 13500000, beds: 3, baths: 2, sqft: 1480, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 13.0665, lon: 77.6285 },
    { id: "t2", title: "2 BHK gated flat, Thanisandra", locality: "Rachenahalli", area: "Thanisandra", areaId: "thanisandra", group: "north-growth", region: "north", price: 9500000, beds: 2, baths: 2, sqft: 1080, propType: "Apartment", trustTier: "trusted", image: IMG[1], lat: 13.0630, lon: 77.6320 },
    { id: "t3", title: "3 BHK near Manyata, Thanisandra", locality: "Nagavara side", area: "Thanisandra", areaId: "thanisandra", group: "north-growth", region: "north", price: 16800000, beds: 3, baths: 3, sqft: 1600, propType: "Apartment", trustTier: "trusted", tag: "New", image: IMG[3], lat: 13.0680, lon: 77.6260 },
    { id: "t4", title: "4 BHK villa, Thanisandra", locality: "Kogilu", area: "Thanisandra", areaId: "thanisandra", group: "north-growth", region: "north", price: 29500000, beds: 4, baths: 4, sqft: 2700, propType: "Villa", trustTier: "verified", image: IMG[2], lat: 13.0700, lon: 77.6300 },
    // ===== North · North Growth · Hennur (3) =====
    { id: "he1", title: "3 BHK apartment, Hennur", locality: "Hennur Main Rd", area: "Hennur", areaId: "hennur", group: "north-growth", region: "north", price: 12200000, beds: 3, baths: 2, sqft: 1400, propType: "Apartment", trustTier: "trusted", image: IMG[4], lat: 13.0420, lon: 77.6395 },
    { id: "he2", title: "2 BHK gated flat, Hennur", locality: "Kalyan Nagar side", area: "Hennur", areaId: "hennur", group: "north-growth", region: "north", price: 8600000, beds: 2, baths: 2, sqft: 1020, propType: "Apartment", trustTier: "listed", image: IMG[8], lat: 13.0395, lon: 77.6430 },
    { id: "he3", title: "4 BHK villa, Hennur", locality: "Hennur-Bagalur Rd", area: "Hennur", areaId: "hennur", group: "north-growth", region: "north", price: 27800000, beds: 4, baths: 4, sqft: 2600, propType: "Villa", trustTier: "verified", tag: "New", image: IMG[2], lat: 13.0440, lon: 77.6440 },
    // ===== North · Outer North · Doddaballapur (2) =====
    { id: "db1", title: "3 BHK township home, Doddaballapur", locality: "Doddaballapur town", area: "Doddaballapur", areaId: "doddaballapur", group: "outer-north", region: "north", price: 8200000, beds: 3, baths: 2, sqft: 1450, propType: "Independent House", trustTier: "trusted", image: IMG[5], lat: 13.2270, lon: 77.5360 },
    { id: "db2", title: "2 BHK apartment, Doddaballapur", locality: "Bashettihalli", area: "Doddaballapur", areaId: "doddaballapur", group: "outer-north", region: "north", price: 5400000, beds: 2, baths: 2, sqft: 980, propType: "Apartment", trustTier: "listed", image: IMG[1], lat: 13.2240, lon: 77.5385 },
    // ===== South · South Core · Jayanagar (3) =====
    { id: "ja1", title: "3 BHK in Jayanagar", locality: "4th Block", area: "Jayanagar", areaId: "jayanagar", group: "south-core", region: "south", price: 22500000, beds: 3, baths: 3, sqft: 1650, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 12.9260, lon: 77.5825 },
    { id: "ja2", title: "2 BHK near Jayanagar market", locality: "9th Block", area: "Jayanagar", areaId: "jayanagar", group: "south-core", region: "south", price: 14800000, beds: 2, baths: 2, sqft: 1160, propType: "Apartment", trustTier: "trusted", image: IMG[1], lat: 12.9235, lon: 77.5855 },
    { id: "ja3", title: "4 BHK independent house, Jayanagar", locality: "3rd Block", area: "Jayanagar", areaId: "jayanagar", group: "south-core", region: "south", price: 41000000, beds: 4, baths: 4, sqft: 3000, propType: "Independent House", trustTier: "verified", image: IMG[2], lat: 12.9280, lon: 77.5810 },
    // ===== South · South Core · JP Nagar (2) =====
    { id: "jp1", title: "3 BHK apartment, JP Nagar", locality: "6th Phase", area: "JP Nagar", areaId: "jp-nagar", group: "south-core", region: "south", price: 16500000, beds: 3, baths: 2, sqft: 1500, propType: "Apartment", trustTier: "trusted", tag: "New", image: IMG[3], lat: 12.9080, lon: 77.5840 },
    { id: "jp2", title: "2 BHK gated flat, JP Nagar", locality: "5th Phase", area: "JP Nagar", areaId: "jp-nagar", group: "south-core", region: "south", price: 10900000, beds: 2, baths: 2, sqft: 1120, propType: "Apartment", trustTier: "listed", image: IMG[8], lat: 12.9055, lon: 77.5865 },
    // ===== East · IT Corridor · Whitefield (3) =====
    { id: "w1", title: "3 BHK near ITPL, Whitefield", locality: "Whitefield Main Rd", area: "Whitefield", areaId: "whitefield", group: "it-corridor", region: "east", price: 15500000, beds: 3, baths: 3, sqft: 1580, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 12.9710, lon: 77.7490 },
    { id: "w2", title: "2 BHK gated flat, Whitefield", locality: "Varthur Rd", area: "Whitefield", areaId: "whitefield", group: "it-corridor", region: "east", price: 9900000, beds: 2, baths: 2, sqft: 1100, propType: "Apartment", trustTier: "trusted", image: IMG[1], lat: 12.9680, lon: 77.7520 },
    { id: "w3", title: "4 BHK villa, Whitefield", locality: "Whitefield", area: "Whitefield", areaId: "whitefield", group: "it-corridor", region: "east", price: 33500000, beds: 4, baths: 4, sqft: 2850, propType: "Villa", trustTier: "verified", tag: "New", image: IMG[2], lat: 12.9720, lon: 77.7460 },
    // ===== East · IT Corridor · Marathahalli (2) =====
    { id: "m1", title: "2 BHK on ORR, Marathahalli", locality: "Outer Ring Rd", area: "Marathahalli", areaId: "marathahalli", group: "it-corridor", region: "east", price: 9200000, beds: 2, baths: 2, sqft: 1080, propType: "Apartment", trustTier: "trusted", image: IMG[3], lat: 12.9570, lon: 77.7000 },
    { id: "m2", title: "3 BHK apartment, Marathahalli", locality: "AECS Layout", area: "Marathahalli", areaId: "marathahalli", group: "it-corridor", region: "east", price: 13800000, beds: 3, baths: 2, sqft: 1420, propType: "Apartment", trustTier: "listed", image: IMG[4], lat: 12.9545, lon: 77.7030 },
    // ===== West · West Core · Rajajinagar (2) =====
    { id: "r1", title: "3 BHK in Rajajinagar", locality: "1st Block", area: "Rajajinagar", areaId: "rajajinagar", group: "west-core", region: "west", price: 18500000, beds: 3, baths: 3, sqft: 1550, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 12.9920, lon: 77.5540 },
    { id: "r2", title: "4 BHK independent house, Rajajinagar", locality: "2nd Stage", area: "Rajajinagar", areaId: "rajajinagar", group: "west-core", region: "west", price: 36000000, beds: 4, baths: 4, sqft: 2900, propType: "Independent House", trustTier: "trusted", image: IMG[2], lat: 12.9895, lon: 77.5565 },
    // ===== West · West Core · Malleshwaram (2) =====
    { id: "ma1", title: "3 BHK in Malleshwaram", locality: "8th Cross", area: "Malleshwaram", areaId: "malleshwaram", group: "west-core", region: "west", price: 24500000, beds: 3, baths: 3, sqft: 1620, propType: "Apartment", trustTier: "verified", tag: "New", image: IMG[3], lat: 13.0040, lon: 77.5690 },
    { id: "ma2", title: "2 BHK heritage flat, Malleshwaram", locality: "15th Cross", area: "Malleshwaram", areaId: "malleshwaram", group: "west-core", region: "west", price: 15200000, beds: 2, baths: 2, sqft: 1180, propType: "Apartment", trustTier: "trusted", image: IMG[1], lat: 13.0020, lon: 77.5715 },
    // ===== Central · Central Core · Indiranagar (3) =====
    { id: "i1", title: "3 BHK in Indiranagar", locality: "12th Main", area: "Indiranagar", areaId: "indiranagar", group: "central-core", region: "central", price: 34500000, beds: 3, baths: 3, sqft: 1780, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 12.9725, lon: 77.6400 },
    { id: "i2", title: "2 BHK near metro, Indiranagar", locality: "CMH Rd", area: "Indiranagar", areaId: "indiranagar", group: "central-core", region: "central", price: 21000000, beds: 2, baths: 2, sqft: 1200, propType: "Apartment", trustTier: "trusted", image: IMG[1], lat: 12.9740, lon: 77.6425 },
    { id: "i3", title: "4 BHK penthouse, Indiranagar", locality: "100 Ft Rd", area: "Indiranagar", areaId: "indiranagar", group: "central-core", region: "central", price: 62000000, beds: 4, baths: 5, sqft: 3400, propType: "Penthouse", trustTier: "verified", tag: "New", image: IMG[11], lat: 12.9705, lon: 77.6440 },
    // ===== Central · Central Core · Koramangala (3) =====
    { id: "k1", title: "3 BHK in Koramangala", locality: "5th Block", area: "Koramangala", areaId: "koramangala", group: "central-core", region: "central", price: 38500000, beds: 3, baths: 3, sqft: 1820, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 12.9360, lon: 77.6235 },
    { id: "k2", title: "2 BHK gated flat, Koramangala", locality: "6th Block", area: "Koramangala", areaId: "koramangala", group: "central-core", region: "central", price: 22500000, beds: 2, baths: 2, sqft: 1220, propType: "Apartment", trustTier: "trusted", image: IMG[1], lat: 12.9340, lon: 77.6260 },
    { id: "k3", title: "4 BHK villa, Koramangala", locality: "3rd Block", area: "Koramangala", areaId: "koramangala", group: "central-core", region: "central", price: 55000000, beds: 4, baths: 4, sqft: 3100, propType: "Villa", trustTier: "verified", image: IMG[2], lat: 12.9375, lon: 77.6220 },
  ],
};

// ---- Derived counts (single source of truth so map + panel always agree). ----
window.BLR_AREA_COUNTS = (function () {
  const D = window.BLR_AREA_DATA;
  const byRegion = {}, byGroup = {}, byArea = {};
  D.listings.forEach((l) => {
    byRegion[l.region] = (byRegion[l.region] || 0) + 1;
    byGroup[l.group] = (byGroup[l.group] || 0) + 1;
    byArea[l.areaId] = (byArea[l.areaId] || 0) + 1;
  });
  return {
    region: (id) => byRegion[id] || 0,
    group: (id) => byGroup[id] || 0,
    area: (id) => byArea[id] || 0,
    total: D.listings.length,
  };
})();

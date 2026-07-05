// Bangalore Property Tracker — SCOPED SCHOOL-FIRST discovery mock data.
// Redesign for GitHub #1740: scoped discovery navigation.
//
// Product model:  City → Region → (Search near school) → School Zone → Area → School
//   1. City landing        → macro REGION bubbles + journey options
//   2. Region selected     → journey cards inside the region
//   7. Search near school   → school ZONE groups inside the region
//   8. Intent control        → "What do you know?" [I know the school] [I know the area]
//   9. Area selected          → SCHOOLS in that area (school markers only)
//  10. School selected         → homes within a radius (3 / 5 / 10 km) of the school
//
// DATA HONESTY:
//   • Distances are computed live with BLR_DIST (haversine) from real lat/lon.
//   • Radius counts and per-card "homes within N km" come from that math.
//   • School-first EXCLUDES agricultural land (none is present here).
//   • The left map and the right panel always render the same navigation level.

// Haversine distance in km between two {lat, lon} points.
window.BLR_DIST = function (a, b) {
  if (!a || !b || a.lat == null || a.lon == null || b.lat == null || b.lon == null) return null;
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
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
];

window.BLR_SCHOOL_DATA = {
  city: { name: "Bangalore", lat: 12.9800, lon: 77.6050, zoom: 11 },

  // ---- Macro regions (shared with the area journey). ----
  regions: [
    { id: "north", name: "North Bangalore", short: "North", cue: "Airport corridor",
      blurb: "The airport-growth corridor — Hebbal, Yelahanka and Devanahalli. Home to many of the city's international and CBSE schools.",
      center: { lat: 13.0900, lon: 77.6050 }, bounds: [[12.99, 77.55], [13.28, 77.73]] },
    { id: "south", name: "South Bangalore", short: "South", cue: "Established south",
      blurb: "Leafy, established neighbourhoods with long-standing schools — Jayanagar, JP Nagar, Banashankari.",
      center: { lat: 12.9100, lon: 77.5850 }, bounds: [[12.83, 77.53], [12.95, 77.65]] },
    { id: "east", name: "East Bangalore", short: "East", cue: "IT corridor",
      blurb: "The tech belt — Whitefield and Marathahalli — with a dense cluster of international schools near the parks.",
      center: { lat: 12.9950, lon: 77.7150 }, bounds: [[12.93, 77.66], [13.02, 77.78]] },
    { id: "west", name: "West Bangalore", short: "West", cue: "Old-city west",
      blurb: "Rajajinagar and Malleshwaram — established schools in well-connected old-Bangalore addresses.",
      center: { lat: 12.9950, lon: 77.5450 }, bounds: [[12.95, 77.50], [13.03, 77.58]] },
    { id: "central", name: "Central Bangalore", short: "Central", cue: "City core",
      blurb: "Indiranagar and Koramangala — premium central schools in the walkable core.",
      center: { lat: 12.9720, lon: 77.6280 }, bounds: [[12.94, 77.59], [12.99, 77.66]] },
  ],

  // ---- School ZONE groups inside a region (the "search near school" level). ----
  zones: [
    { id: "hebbal-jakkur", region: "north", name: "Hebbal & Jakkur Schools",
      blurb: "The Hebbal–Jakkur lake belt — CBSE and ICSE schools wrapped around Manyata and the flyover.",
      exampleAreas: ["Hebbal", "Jakkur"],
      center: { lat: 13.0560, lon: 77.6010 }, bounds: [[13.020, 77.582], [13.092, 77.620]] },
    { id: "yelahanka-airport", region: "north", name: "Yelahanka & Airport Schools",
      blurb: "Yelahanka's planned layouts out to Devanahalli — the city's densest cluster of international schools.",
      exampleAreas: ["Yelahanka", "Devanahalli"],
      center: { lat: 13.1400, lon: 77.6300 }, bounds: [[13.085, 77.582], [13.262, 77.728]] },
    { id: "thanisandra-hennur", region: "north", name: "Thanisandra & Hennur Schools",
      blurb: "The Thanisandra–Hennur growth arc — newer international and CBSE schools beside fresh apartment supply.",
      exampleAreas: ["Thanisandra", "Hennur"],
      center: { lat: 13.0530, lon: 77.6355 }, bounds: [[13.026, 77.616], [13.080, 77.656]] },
    // other regions — light coverage so the journey never dead-ends
    { id: "south-schools", region: "south", name: "South Core Schools",
      blurb: "Jayanagar and JP Nagar's established schools.",
      exampleAreas: ["Jayanagar", "JP Nagar"],
      center: { lat: 12.9160, lon: 77.5840 }, bounds: [[12.892, 77.569], [12.940, 77.600]] },
    { id: "east-schools", region: "east", name: "IT Corridor Schools",
      blurb: "The international-school cluster around Whitefield.",
      exampleAreas: ["Whitefield", "Marathahalli"],
      center: { lat: 12.9700, lon: 77.7300 }, bounds: [[12.941, 77.687], [12.986, 77.766]] },
    { id: "west-schools", region: "west", name: "West Core Schools",
      blurb: "Rajajinagar and Malleshwaram's heritage schools.",
      exampleAreas: ["Rajajinagar", "Malleshwaram"],
      center: { lat: 12.9970, lon: 77.5600 }, bounds: [[12.976, 77.541], [13.018, 77.585]] },
    { id: "central-schools", region: "central", name: "Central Core Schools",
      blurb: "Premium central schools around Indiranagar and Koramangala.",
      exampleAreas: ["Indiranagar", "Koramangala"],
      center: { lat: 12.9550, lon: 77.6320 }, bounds: [[12.920, 77.610], [12.987, 77.656]] },
  ],

  // ---- Areas inside zones (the neighbourhood level). ----
  areas: [
    // North · Hebbal & Jakkur
    { id: "hebbal", zone: "hebbal-jakkur", region: "north", name: "Hebbal", blurb: "Lake-side connectivity hub with CBSE and ICSE schools near the flyover.", lat: 13.0358, lon: 77.5970, bounds: [[13.018, 77.583], [13.055, 77.615]] },
    { id: "jakkur", zone: "hebbal-jakkur", region: "north", name: "Jakkur", blurb: "Lake-and-aerodrome pocket with newer schools and villa projects.", lat: 13.0776, lon: 77.6060, bounds: [[13.060, 77.590], [13.095, 77.622]] },
    // North · Yelahanka & Airport
    { id: "yelahanka", zone: "yelahanka-airport", region: "north", name: "Yelahanka", blurb: "Planned satellite town — the densest international-school cluster in the north.", lat: 13.1007, lon: 77.5963, bounds: [[13.082, 77.580], [13.120, 77.614]] },
    { id: "devanahalli", zone: "yelahanka-airport", region: "north", name: "Devanahalli", blurb: "Airport-adjacent township belt with boarding and international campuses.", lat: 13.2437, lon: 77.7115, bounds: [[13.185, 77.630], [13.262, 77.728]] },
    // North · Thanisandra & Hennur
    { id: "thanisandra", zone: "thanisandra-hennur", region: "north", name: "Thanisandra", blurb: "Fast-supplying apartment corridor with newer CBSE and international schools.", lat: 13.0650, lon: 77.6300, bounds: [[13.048, 77.616], [13.082, 77.646]] },
    { id: "hennur", zone: "thanisandra-hennur", region: "north", name: "Hennur", blurb: "Green mid-market belt bridging the airport road to the ORR.", lat: 13.0410, lon: 77.6410, bounds: [[13.024, 77.627], [13.058, 77.658]] },
    // other regions
    { id: "jayanagar", zone: "south-schools", region: "south", name: "Jayanagar", blurb: "Iconic planned neighbourhood with long-standing schools.", lat: 12.9250, lon: 77.5830, bounds: [[12.910, 77.569], [12.940, 77.598]] },
    { id: "jp-nagar", zone: "south-schools", region: "south", name: "JP Nagar", blurb: "Family-friendly south belt with good schools.", lat: 12.9070, lon: 77.5850, bounds: [[12.892, 77.571], [12.922, 77.600]] },
    { id: "whitefield", zone: "east-schools", region: "east", name: "Whitefield", blurb: "Tech township with a dense international-school cluster.", lat: 12.9698, lon: 77.7500, bounds: [[12.954, 77.735], [12.986, 77.766]] },
    { id: "rajajinagar", zone: "west-schools", region: "west", name: "Rajajinagar", blurb: "Old-city grid with heritage schools.", lat: 12.9910, lon: 77.5550, bounds: [[12.976, 77.541], [13.006, 77.570]] },
    { id: "indiranagar", zone: "central-schools", region: "central", name: "Indiranagar", blurb: "Premium walkable core with central schools.", lat: 12.9719, lon: 77.6412, bounds: [[12.957, 77.627], [12.987, 77.656]] },
  ],

  // ---- Schools. areaId + zone + region locate each; board/levels power filters. ----
  schools: [
    // North · Hebbal
    { id: "s-vidyaniketan", name: "Vidyaniketan Public School, Hebbal", address: "Hebbal Kempapura", area: "Hebbal", areaId: "hebbal", zone: "hebbal-jakkur", region: "north", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary", "Higher Secondary"], lat: 13.0442, lon: 77.5910 },
    { id: "s-presidency", name: "Presidency School, Hebbal", address: "Hebbal", area: "Hebbal", areaId: "hebbal", zone: "hebbal-jakkur", region: "north", type: "ICSE", board: "ICSE", levels: ["Primary", "Secondary"], lat: 13.0385, lon: 77.6035 },
    { id: "s-kensri", name: "Kensri School, Hebbal", address: "Hennur–Bellary Rd", area: "Hebbal", areaId: "hebbal", zone: "hebbal-jakkur", region: "north", type: "ICSE", board: "ICSE", levels: ["Primary", "Secondary", "Higher Secondary"], lat: 13.0370, lon: 77.6150 },
    // North · Jakkur
    { id: "s-dps-north", name: "Delhi Public School North, Sahakarnagar", address: "Sahakar Nagar / Jakkur", area: "Jakkur", areaId: "jakkur", zone: "hebbal-jakkur", region: "north", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary", "Higher Secondary"], lat: 13.0625, lon: 77.5860 },
    { id: "s-gnan", name: "Gnan Srishti School of Excellence, Jakkur", address: "Jakkur Main Rd", area: "Jakkur", areaId: "jakkur", zone: "hebbal-jakkur", region: "north", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary"], lat: 13.0812, lon: 77.6118 },
    // North · Yelahanka
    { id: "s-vidyashilp", name: "Vidyashilp Academy", address: "Yelahanka", area: "Yelahanka", areaId: "yelahanka", zone: "yelahanka-airport", region: "north", type: "International", board: "International", levels: ["Primary", "Secondary", "Higher Secondary"], lat: 13.1060, lon: 77.5850 },
    { id: "s-canadian", name: "Canadian International School", address: "Yelahanka", area: "Yelahanka", areaId: "yelahanka", zone: "yelahanka-airport", region: "north", type: "International", board: "International", levels: ["Primary", "Secondary", "Higher Secondary"], lat: 13.1120, lon: 77.6010 },
    { id: "s-ryan-yel", name: "Ryan International School, Yelahanka", address: "Yelahanka New Town", area: "Yelahanka", areaId: "yelahanka", zone: "yelahanka-airport", region: "north", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary"], lat: 13.0985, lon: 77.5905 },
    // North · Devanahalli
    { id: "s-akash", name: "Akash International School, Devanahalli", address: "Devanahalli", area: "Devanahalli", areaId: "devanahalli", zone: "yelahanka-airport", region: "north", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary"], lat: 13.2300, lon: 77.7000 },
    { id: "s-stonehill", name: "Stonehill International School", address: "Tarahunise, Devanahalli", area: "Devanahalli", areaId: "devanahalli", zone: "yelahanka-airport", region: "north", type: "International", board: "International", levels: ["Primary", "Secondary", "Higher Secondary"], lat: 13.1900, lon: 77.6420 },
    // North · Thanisandra
    { id: "s-vibgyor", name: "VIBGYOR High, Thanisandra", address: "Thanisandra Main Rd", area: "Thanisandra", areaId: "thanisandra", zone: "thanisandra-hennur", region: "north", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary", "Higher Secondary"], lat: 13.0680, lon: 77.6280 },
    { id: "s-legacy", name: "Legacy School, Thanisandra", address: "Rachenahalli", area: "Thanisandra", areaId: "thanisandra", zone: "thanisandra-hennur", region: "north", type: "ICSE", board: "ICSE", levels: ["Primary", "Secondary"], lat: 13.0605, lon: 77.6350 },
    // North · Hennur
    { id: "s-baldwin", name: "New Baldwin International School, Hennur", address: "Hennur Main Rd", area: "Hennur", areaId: "hennur", zone: "thanisandra-hennur", region: "north", type: "ICSE", board: "ICSE", levels: ["Primary", "Secondary", "Higher Secondary"], lat: 13.0430, lon: 77.6385 },
    { id: "s-euro", name: "EuroSchool, Hennur", address: "Hennur–Bagalur Rd", area: "Hennur", areaId: "hennur", zone: "thanisandra-hennur", region: "north", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary"], lat: 13.0450, lon: 77.6445 },
    // other regions (one or two each)
    { id: "s-nps-jayanagar", name: "National Public School, Jayanagar", address: "Jayanagar 4th Block", area: "Jayanagar", areaId: "jayanagar", zone: "south-schools", region: "south", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary", "Higher Secondary"], lat: 12.9260, lon: 77.5825 },
    { id: "s-carmel-jp", name: "Carmel School, JP Nagar", address: "JP Nagar 6th Phase", area: "JP Nagar", areaId: "jp-nagar", zone: "south-schools", region: "south", type: "ICSE", board: "ICSE", levels: ["Primary", "Secondary"], lat: 12.9080, lon: 77.5840 },
    { id: "s-vibgyor-wf", name: "VIBGYOR High, Whitefield", address: "Whitefield Main Rd", area: "Whitefield", areaId: "whitefield", zone: "east-schools", region: "east", type: "International", board: "International", levels: ["Primary", "Secondary", "Higher Secondary"], lat: 12.9710, lon: 77.7480 },
    { id: "s-mvm-raj", name: "MES Kishora Kendra, Rajajinagar", address: "Rajajinagar", area: "Rajajinagar", areaId: "rajajinagar", zone: "west-schools", region: "west", type: "State", board: "State", levels: ["Primary", "Secondary"], lat: 12.9915, lon: 77.5545 },
    { id: "s-nps-indira", name: "New Horizon Public School, Indiranagar", address: "Indiranagar", area: "Indiranagar", areaId: "indiranagar", zone: "central-schools", region: "central", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary"], lat: 12.9720, lon: 77.6405 },
  ],

  // ---- Listings (homes). areaId + zone + region locate each; radius uses lat/lon. ----
  listings: [
    // Hebbal
    { id: "h1", title: "3 BHK lake-view apartment, Hebbal", locality: "Hebbal Kempapura", area: "Hebbal", areaId: "hebbal", zone: "hebbal-jakkur", region: "north", price: 21500000, beds: 3, baths: 3, sqft: 1720, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 13.0372, lon: 77.5942 },
    { id: "h2", title: "2 BHK near Hebbal flyover", locality: "Nagavara", area: "Hebbal", areaId: "hebbal", zone: "hebbal-jakkur", region: "north", price: 12800000, beds: 2, baths: 2, sqft: 1180, propType: "Apartment", trustTier: "trusted", image: IMG[1], lat: 13.0410, lon: 77.6020 },
    { id: "h3", title: "4 BHK villa, Sahakar Nagar", locality: "Sahakar Nagar", area: "Hebbal", areaId: "hebbal", zone: "hebbal-jakkur", region: "north", price: 38500000, beds: 4, baths: 4, sqft: 3100, propType: "Villa", trustTier: "verified", image: IMG[2], lat: 13.0330, lon: 77.5905 },
    { id: "h4", title: "3 BHK gated flat, Hebbal", locality: "Kempapura", area: "Hebbal", areaId: "hebbal", zone: "hebbal-jakkur", region: "north", price: 17900000, beds: 3, baths: 2, sqft: 1460, propType: "Apartment", trustTier: "trusted", image: IMG[3], lat: 13.0388, lon: 77.5988 },
    // Jakkur
    { id: "j1", title: "3 BHK lake-facing, Jakkur", locality: "Jakkur Plantation", area: "Jakkur", areaId: "jakkur", zone: "hebbal-jakkur", region: "north", price: 19500000, beds: 3, baths: 3, sqft: 1620, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 13.0790, lon: 77.6045 },
    { id: "j2", title: "2 BHK apartment, Jakkur", locality: "Jakkur Main Rd", area: "Jakkur", areaId: "jakkur", zone: "hebbal-jakkur", region: "north", price: 10800000, beds: 2, baths: 2, sqft: 1120, propType: "Apartment", trustTier: "trusted", image: IMG[3], lat: 13.0800, lon: 77.6030 },
    { id: "j3", title: "4 BHK villa, Amruthahalli", locality: "Amruthahalli", area: "Jakkur", areaId: "jakkur", zone: "hebbal-jakkur", region: "north", price: 34500000, beds: 4, baths: 4, sqft: 2950, propType: "Villa", trustTier: "verified", image: IMG[2], lat: 13.0660, lon: 77.5920 },
    // Yelahanka
    { id: "y1", title: "3 BHK gated apartment, Yelahanka", locality: "Yelahanka New Town", area: "Yelahanka", areaId: "yelahanka", zone: "yelahanka-airport", region: "north", price: 15200000, beds: 3, baths: 2, sqft: 1500, propType: "Apartment", trustTier: "verified", image: IMG[4], lat: 13.1020, lon: 77.5950 },
    { id: "y2", title: "4 BHK villa, Judicial Layout", locality: "Judicial Layout", area: "Yelahanka", areaId: "yelahanka", zone: "yelahanka-airport", region: "north", price: 32000000, beds: 4, baths: 4, sqft: 2800, propType: "Villa", trustTier: "verified", image: IMG[2], lat: 13.0985, lon: 77.5990 },
    { id: "y3", title: "2 BHK near Yelahanka station", locality: "Yelahanka Old Town", area: "Yelahanka", areaId: "yelahanka", zone: "yelahanka-airport", region: "north", price: 9800000, beds: 2, baths: 2, sqft: 1050, propType: "Apartment", trustTier: "trusted", image: IMG[1], lat: 13.1040, lon: 77.5920 },
    { id: "y4", title: "3 BHK near Canadian Intl, Yelahanka", locality: "Attur Layout", area: "Yelahanka", areaId: "yelahanka", zone: "yelahanka-airport", region: "north", price: 18500000, beds: 3, baths: 3, sqft: 1780, propType: "Apartment", trustTier: "trusted", image: IMG[5], lat: 13.1105, lon: 77.5980 },
    // Thanisandra
    { id: "t1", title: "3 BHK apartment, Thanisandra", locality: "Thanisandra Main Rd", area: "Thanisandra", areaId: "thanisandra", zone: "thanisandra-hennur", region: "north", price: 13500000, beds: 3, baths: 2, sqft: 1480, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 13.0665, lon: 77.6285 },
    { id: "t2", title: "2 BHK gated flat, Rachenahalli", locality: "Rachenahalli", area: "Thanisandra", areaId: "thanisandra", zone: "thanisandra-hennur", region: "north", price: 9500000, beds: 2, baths: 2, sqft: 1080, propType: "Apartment", trustTier: "trusted", image: IMG[1], lat: 13.0630, lon: 77.6320 },
    // Hennur
    { id: "he1", title: "3 BHK apartment, Hennur", locality: "Hennur Main Rd", area: "Hennur", areaId: "hennur", zone: "thanisandra-hennur", region: "north", price: 12200000, beds: 3, baths: 2, sqft: 1400, propType: "Apartment", trustTier: "trusted", image: IMG[4], lat: 13.0420, lon: 77.6395 },
    { id: "he2", title: "2 BHK gated flat, Hennur", locality: "Kalyan Nagar side", area: "Hennur", areaId: "hennur", zone: "thanisandra-hennur", region: "north", price: 8600000, beds: 2, baths: 2, sqft: 1020, propType: "Apartment", trustTier: "listed", image: IMG[8], lat: 13.0395, lon: 77.6430 },
    // Devanahalli
    { id: "d1", title: "4 BHK villa, Devanahalli", locality: "Airport Business Park", area: "Devanahalli", areaId: "devanahalli", zone: "yelahanka-airport", region: "north", price: 41000000, beds: 4, baths: 5, sqft: 3400, propType: "Villa", trustTier: "verified", image: IMG[2], lat: 13.2450, lon: 77.7100 },
    { id: "d2", title: "3 BHK township apartment, Devanahalli", locality: "Devanahalli town", area: "Devanahalli", areaId: "devanahalli", zone: "yelahanka-airport", region: "north", price: 14500000, beds: 3, baths: 3, sqft: 1560, propType: "Apartment", trustTier: "trusted", image: IMG[4], lat: 13.2420, lon: 77.7130 },
    // other regions (a couple each so area→schools→homes works)
    { id: "ja1", title: "3 BHK in Jayanagar", locality: "4th Block", area: "Jayanagar", areaId: "jayanagar", zone: "south-schools", region: "south", price: 22500000, beds: 3, baths: 3, sqft: 1650, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 12.9260, lon: 77.5825 },
    { id: "jp1", title: "3 BHK apartment, JP Nagar", locality: "6th Phase", area: "JP Nagar", areaId: "jp-nagar", zone: "south-schools", region: "south", price: 16500000, beds: 3, baths: 2, sqft: 1500, propType: "Apartment", trustTier: "trusted", image: IMG[3], lat: 12.9080, lon: 77.5840 },
    { id: "w1", title: "3 BHK near ITPL, Whitefield", locality: "Whitefield Main Rd", area: "Whitefield", areaId: "whitefield", zone: "east-schools", region: "east", price: 15500000, beds: 3, baths: 3, sqft: 1580, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 12.9710, lon: 77.7490 },
    { id: "r1", title: "3 BHK in Rajajinagar", locality: "1st Block", area: "Rajajinagar", areaId: "rajajinagar", zone: "west-schools", region: "west", price: 18500000, beds: 3, baths: 3, sqft: 1550, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 12.9920, lon: 77.5540 },
    { id: "i1", title: "3 BHK in Indiranagar", locality: "12th Main", area: "Indiranagar", areaId: "indiranagar", zone: "central-schools", region: "central", price: 34500000, beds: 3, baths: 3, sqft: 1780, propType: "Apartment", trustTier: "verified", image: IMG[0], lat: 12.9725, lon: 77.6400 },
  ],
};

// ---- Derived helpers (single source of truth) ----
window.BLR_SCHOOL_COUNTS = (function () {
  const D = window.BLR_SCHOOL_DATA;
  const homesByRegion = {}, schoolsByRegion = {}, schoolsByZone = {}, homesByZone = {}, schoolsByArea = {}, homesByArea = {};
  D.listings.forEach((l) => {
    homesByRegion[l.region] = (homesByRegion[l.region] || 0) + 1;
    homesByZone[l.zone] = (homesByZone[l.zone] || 0) + 1;
    homesByArea[l.areaId] = (homesByArea[l.areaId] || 0) + 1;
  });
  D.schools.forEach((s) => {
    schoolsByRegion[s.region] = (schoolsByRegion[s.region] || 0) + 1;
    schoolsByZone[s.zone] = (schoolsByZone[s.zone] || 0) + 1;
    schoolsByArea[s.areaId] = (schoolsByArea[s.areaId] || 0) + 1;
  });
  return {
    homesRegion: (id) => homesByRegion[id] || 0,
    schoolsRegion: (id) => schoolsByRegion[id] || 0,
    homesZone: (id) => homesByZone[id] || 0,
    schoolsZone: (id) => schoolsByZone[id] || 0,
    homesArea: (id) => homesByArea[id] || 0,
    schoolsArea: (id) => schoolsByArea[id] || 0,
    totalHomes: D.listings.length,
    totalSchools: D.schools.length,
  };
})();

// Count homes within `km` of a school (haversine, honest).
window.BLR_HOMES_NEAR = function (school, km) {
  const D = window.BLR_SCHOOL_DATA;
  return D.listings.filter((l) => {
    const d = window.BLR_DIST(school, l);
    return d != null && d <= km;
  });
};

// Udupi Property Tracker — school-first discovery mock data.
// Coastal Karnataka context. Prices in ₹. Coordinates are approximate, real-ish
// places around Udupi so the Leaflet map reads as authentic.
//
// Journey model (school-first):
//   1. Landing                 → schools + zones
//   2. Zone selected           → AREAS inside the zone  (the intermediary step)
//   3. Area selected           → schools + homes in that area
//   4. School selected         → homes within a chosen radius (5 / 10 km / area-wide)
//
// DATA HONESTY:
//   • Distances are computed live with UPT_DIST (haversine) from real lat/lon —
//     never hard-coded. Listing cards show "X.X km from school" from that math.
//   • Every school & listing in the University Belt carries real coordinates so
//     radius filtering is genuine. A listing with no coords is handled, not faked.
//   • `walk` is EDITORIAL copy (e.g. "6 min walk to campus"). It is NOT a computed
//     travel time and is only shown as flavour outside the radius context.
//   • School-first EXCLUDES agricultural land — see UPT_IS_AGRI / UPT_HOME_LISTINGS.
//   • Area `schools`/`listings` counts equal the number of real records below.

// Haversine distance in km between two {lat, lon} points.
window.UPT_DIST = function (a, b) {
  if (!a || !b || a.lat == null || a.lon == null || b.lat == null || b.lon == null) return null;
  const R = 6371, toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

// Agricultural / raw-land types are excluded from the school-first journey.
window.UPT_IS_AGRI = function (l) {
  return /agri|farm|plot|land/i.test(l.propType || "");
};
// Homes only (school-first never surfaces agri land).
window.UPT_HOME_LISTINGS = function (list) {
  return (list || []).filter((l) => !window.UPT_IS_AGRI(l));
};

window.UPT_DATA = {
  city: { name: "Udupi", lat: 13.34119, lon: 74.74205, zoom: 11 },

  // ---- Schools (popular list + searchable). areaId ties a school to its area. ----
  // `board` (CBSE/ICSE/State/International) and `levels` (Primary/Secondary/Higher
  // Secondary) power the selected-area filter chips. Higher-ed has board:null, levels:[].
  schools: [
    // ---------- University Belt · Manipal (mixed K-12 + higher-ed) ----------
    { id: "s-manipal", name: "Manipal Academy of Higher Education", address: "Madhav Nagar, Eshwar Nagar", area: "Manipal", areaId: "manipal", type: "University", board: null, levels: [], listings: 9, lat: 13.3520, lon: 74.7860, zone: "university-belt" },
    { id: "s-mit", name: "Manipal Institute of Technology", address: "Eshwar Nagar, Manipal", area: "Manipal", areaId: "manipal", type: "University", board: null, levels: [], listings: 8, lat: 13.3490, lon: 74.7930, zone: "university-belt" },
    { id: "s-kasturba", name: "Kasturba Medical College", address: "Madhav Nagar, Manipal", area: "Manipal", areaId: "manipal", type: "University", board: null, levels: [], listings: 7, lat: 13.3540, lon: 74.7880, zone: "university-belt" },
    { id: "s-dps", name: "Delhi Public School, Manipal", address: "Eshwar Nagar, Manipal", area: "Manipal", areaId: "manipal", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary", "Higher Secondary"], listings: 6, lat: 13.3585, lon: 74.7840, zone: "university-belt" },
    { id: "s-vidyaniketan", name: "Vidya Niketan Public School", address: "Tiger Circle Rd, Manipal", area: "Manipal", areaId: "manipal", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary"], listings: 5, lat: 13.3500, lon: 74.7820, zone: "university-belt" },
    { id: "s-mgm", name: "Manipal MGM School", address: "Manipal-Udupi Rd, Manipal", area: "Manipal", areaId: "manipal", type: "ICSE", board: "ICSE", levels: ["Primary", "Secondary"], listings: 4, lat: 13.3560, lon: 74.7900, zone: "university-belt" },
    { id: "s-excel", name: "Excel Public School, Manipal", address: "End Point Rd, Manipal", area: "Manipal", areaId: "manipal", type: "ICSE", board: "ICSE", levels: ["Secondary", "Higher Secondary"], listings: 4, lat: 13.3450, lon: 74.7890, zone: "university-belt" },
    { id: "s-sharada", name: "Sharada Vidyalaya, Manipal", address: "Madhav Nagar, Manipal", area: "Manipal", areaId: "manipal", type: "State", board: "State", levels: ["Primary", "Secondary"], listings: 3, lat: 13.3535, lon: 74.7810, zone: "university-belt" },
    { id: "s-mis", name: "Manipal International School", address: "Bailoor, Manipal", area: "Manipal", areaId: "manipal", type: "International", board: "International", levels: ["Primary", "Secondary", "Higher Secondary"], listings: 5, lat: 13.3600, lon: 74.7820, zone: "university-belt" },
    { id: "s-vikas", name: "Vikas PU College, Manipal", address: "Udupi-Manipal Rd, Manipal", area: "Manipal", areaId: "manipal", type: "PU College", board: null, levels: ["Higher Secondary"], listings: 5, lat: 13.3560, lon: 74.7855, zone: "university-belt" },
    { id: "s-ghps", name: "Govt Higher Primary School, Manipal", address: "Manipal village, Manipal", area: "Manipal", areaId: "manipal", type: "State", board: "State", levels: ["Primary"], listings: 2, lat: 13.3515, lon: 74.7790, zone: "university-belt" },
    { id: "s-msap", name: "MIT School of Architecture & Planning", address: "End Point Rd, Manipal", area: "Manipal", areaId: "manipal", type: "University", board: null, levels: [], listings: 4, lat: 13.3470, lon: 74.7910, zone: "university-belt" },
    // ---------- University Belt · Katapadi (schools, no homes listed yet) ----------
    { id: "s-littleflower", name: "Little Flower English Medium School", address: "Katapadi, Udupi 574105", area: "Katapadi", areaId: "katapadi", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary"], listings: 0, lat: 13.3865, lon: 74.7535, zone: "university-belt" },
    { id: "s-kata-govt", name: "Government High School, Katapadi", address: "NH-66, Katapadi, Udupi 574105", area: "Katapadi", areaId: "katapadi", type: "State", board: "State", levels: ["Primary", "Secondary"], listings: 0, lat: 13.3880, lon: 74.7510, zone: "university-belt" },
    { id: "s-kata-venkat", name: "Sri Venkataramana School, Katapadi", address: "Katapadi Cross, Udupi 574105", area: "Katapadi", areaId: "katapadi", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary", "Higher Secondary"], listings: 0, lat: 13.3850, lon: 74.7560, zone: "university-belt" },
    // ---------- University Belt · Udyavara ----------
    { id: "s-udyavara-pu", name: "Udyavara PU College", address: "Udyavara, Udupi 574118", area: "Udyavara", areaId: "udyavara", type: "PU College", board: null, levels: ["Higher Secondary"], listings: 1, lat: 13.3035, lon: 74.7430, zone: "university-belt" },
    { id: "s-udyavara-eng", name: "Udyavara English Medium School", address: "Udyavara, Udupi 574118", area: "Udyavara", areaId: "udyavara", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary"], listings: 1, lat: 13.3010, lon: 74.7455, zone: "university-belt" },
    // ---------- University Belt · Parkala ----------
    { id: "s-parkala-school", name: "Parkala Higher Primary School", address: "Parkala, Udupi 576107", area: "Parkala", areaId: "parkala", type: "State", board: "State", levels: ["Primary"], listings: 1, lat: 13.3705, lon: 74.7635, zone: "university-belt" },
    { id: "s-parkala-pu", name: "Parkala PU College", address: "Parkala Main Rd, Udupi 576107", area: "Parkala", areaId: "parkala", type: "PU College", board: null, levels: ["Higher Secondary"], listings: 1, lat: 13.3690, lon: 74.7660, zone: "university-belt" },

    // ---------- Other zones (light coverage) ----------
    { id: "s-ashrama", name: "Ashrama School Udupi Bannanje", address: "8PRQ+FWJ, Brahmagiri, Udupi 576101", area: "Brahmagiri", areaId: "brahmagiri", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary"], listings: 6, lat: 13.3380, lon: 74.7490, zone: "city-centre" },
    { id: "s-eurokids", name: "Eurokids Pre-School Udupi", address: "Circuit House Rd, Brahmagiri, Udupi 576101", area: "Brahmagiri", areaId: "brahmagiri", type: "Pre-school", board: null, levels: ["Primary"], listings: 4, lat: 13.3395, lon: 74.7470, zone: "city-centre" },
    { id: "s-vidyodaya", name: "Vidyodaya Public School", address: "Kunjibettu, Udupi 576102", area: "Kunjibettu", areaId: "kunjibettu", type: "CBSE", board: "CBSE", levels: ["Primary", "Secondary", "Higher Secondary"], listings: 5, lat: 13.3310, lon: 74.7560, zone: "city-centre" },
    { id: "s-asiatech", name: "Asiatech College Kundapura", address: "Church Road, Kundapura 576201", area: "Kundapura", areaId: "kundapura", type: "College", board: null, levels: [], listings: 5, lat: 13.6280, lon: 74.6940, zone: "coastal-strip" },
    { id: "s-bearys", name: "Bearys First Grade College", address: "Kodi Beach Rd, Kundapur 576217", area: "Kundapura", areaId: "kundapura", type: "College", board: null, levels: [], listings: 4, lat: 13.6500, lon: 74.6800, zone: "coastal-strip" },
    { id: "s-bareerah", name: "Bareerah International School", address: "Darikere Road, Karkala 574114", area: "Karkala", areaId: "karkala", type: "International", board: "International", levels: ["Primary", "Secondary", "Higher Secondary"], listings: 3, lat: 13.2130, lon: 74.9950, zone: "south-udupi" },
  ],

  // ---- Zones / groups. schools/listings/areas mirror the records below. ----
  zones: [
    {
      id: "university-belt", name: "University Belt", subtitle: "Academic and student housing",
      blurb: "Student-heavy neighbourhoods anchored by Manipal's campuses. Strong rental demand, walk-to-class homes, and quieter family pockets a short drive out.",
      schools: 19, listings: 7, areas: 4,
      center: { lat: 13.3560, lon: 74.7720 }, bounds: [[13.290, 74.735], [13.395, 74.800]],
    },
    {
      id: "coastal-strip", name: "Coastal Strip", subtitle: "Beachside and fishing villages",
      blurb: "Beachside and fishing villages from Malpe to Kundapura — sea views and weekend-home appeal.",
      schools: 4, listings: 16, areas: 2,
      center: { lat: 13.3494, lon: 74.7050 }, bounds: [[13.30, 74.68], [13.66, 74.72]],
    },
    {
      id: "city-centre", name: "City Centre", subtitle: "Temple precinct and core",
      blurb: "Core urban and temple precinct around Car Street — established, well-connected addresses.",
      schools: 14, listings: 12, areas: 2,
      center: { lat: 13.3409, lon: 74.7480 }, bounds: [[13.325, 74.735], [13.352, 74.762]],
    },
    {
      id: "north-udupi", name: "North Udupi", subtitle: "Newer northern projects",
      blurb: "Rapidly developing northern belt around Brahmavar — newer projects and bigger plots.",
      schools: 4, listings: 0, areas: 1,
      center: { lat: 13.4309, lon: 74.7480 }, bounds: [[13.41, 74.735], [13.45, 74.762]],
    },
    {
      id: "south-udupi", name: "South Udupi", subtitle: "Quiet value-led south",
      blurb: "Quiet residential southern belt toward Kaup and Padubidri — calmer, value-led pockets.",
      schools: 3, listings: 4, areas: 1,
      center: { lat: 13.2200, lon: 74.7450 }, bounds: [[13.14, 74.73], [13.24, 74.80]],
    },
  ],

  // ---- Areas inside zones (the intermediary step). Counts = real records. ----
  areas: [
    { id: "manipal", zone: "university-belt", name: "Manipal", blurb: "University core with student rentals and family homes within walking distance of campus.", schools: 12, listings: 5, lat: 13.3520, lon: 74.7860, bounds: [[13.340, 74.775], [13.362, 74.800]] },
    { id: "katapadi", zone: "university-belt", name: "Katapadi", blurb: "Residential coastal-side area on NH-66 with nearby schools and easy campus access.", schools: 3, listings: 0, lat: 13.3870, lon: 74.7530, bounds: [[13.378, 74.745], [13.396, 74.762]] },
    { id: "udyavara", zone: "university-belt", name: "Udyavara", blurb: "Calmer southern pocket with newer apartments and a short commute to Manipal.", schools: 2, listings: 1, lat: 13.3020, lon: 74.7430, bounds: [[13.293, 74.735], [13.311, 74.752]] },
    { id: "parkala", zone: "university-belt", name: "Parkala", blurb: "Established township between Manipal and the city — schools, markets and family villas.", schools: 2, listings: 1, lat: 13.3700, lon: 74.7640, bounds: [[13.361, 74.756], [13.379, 74.773]] },
    // other zones
    { id: "brahmagiri", zone: "city-centre", name: "Brahmagiri", blurb: "Temple-precinct core, walkable and well connected.", schools: 2, listings: 1, lat: 13.3390, lon: 74.7490, bounds: [[13.330, 74.742], [13.348, 74.758]] },
    { id: "kunjibettu", zone: "city-centre", name: "Kunjibettu", blurb: "Quiet residential lanes close to the centre.", schools: 1, listings: 1, lat: 13.3310, lon: 74.7560, bounds: [[13.322, 74.748], [13.340, 74.764]] },
    { id: "kundapura", zone: "coastal-strip", name: "Kundapura", blurb: "Coastal town with colleges and weekend-home plots.", schools: 2, listings: 1, lat: 13.6300, lon: 74.6900, bounds: [[13.61, 74.67], [13.66, 74.71]] },
    { id: "malpe", zone: "coastal-strip", name: "Malpe", blurb: "Beachfront living minutes from the port and the ferry.", schools: 0, listings: 1, lat: 13.3494, lon: 74.7050, bounds: [[13.34, 74.69], [13.36, 74.71]] },
    { id: "karkala", zone: "south-udupi", name: "Karkala", blurb: "Heritage town with international schools nearby.", schools: 1, listings: 1, lat: 13.2130, lon: 74.9950, bounds: [[13.20, 74.985], [13.225, 75.005]] },
  ],

  // ---- Listings. schoolIds: schools this home is tagged near; zone + areaId locate it. ----
  listings: [
    // ----- University Belt · Manipal -----
    { id: "l1", title: "3 BHK near Manipal University", locality: "Eshwar Nagar", area: "Manipal", areaId: "manipal", price: 13500000, beds: 3, baths: 2, sqft: 1480, propType: "Apartment", trustTier: "verified", image: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=720&h=480&fit=crop", walk: "6 min walk to campus", postedDays: 3, schoolIds: ["s-manipal", "s-mit", "s-kasturba"], zone: "university-belt", lat: 13.3505, lon: 74.7905 },
    { id: "l2", title: "1 BHK studio, Tiger Circle", locality: "Tiger Circle", area: "Manipal", areaId: "manipal", price: 5200000, beds: 1, baths: 1, sqft: 720, propType: "Apartment", trustTier: "trusted", image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=720&h=480&fit=crop", walk: "Furnished · rental-ready", postedDays: 5, schoolIds: ["s-manipal", "s-mit"], zone: "university-belt", lat: 13.3530, lon: 74.7880 },
    { id: "l3", title: "4 BHK villa, End Point Road", locality: "End Point Rd", area: "Manipal", areaId: "manipal", price: 26500000, beds: 4, baths: 4, sqft: 2600, propType: "Villa", trustTier: "verified", image: "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=720&h=480&fit=crop", walk: "Gated community", postedDays: 8, schoolIds: ["s-manipal", "s-mit", "s-kasturba"], zone: "university-belt", lat: 13.3470, lon: 74.7950 },
    { id: "l9", title: "2 BHK garden flat, Eshwar Nagar", locality: "Eshwar Nagar", area: "Manipal", areaId: "manipal", price: 8900000, beds: 2, baths: 2, sqft: 1150, propType: "Apartment", trustTier: "trusted", image: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=720&h=480&fit=crop", walk: "9 min walk to MIT", postedDays: 4, schoolIds: ["s-mit", "s-manipal"], zone: "university-belt", lat: 13.3485, lon: 74.7895 },
    { id: "l10", title: "Studio + loft, Manipal centre", locality: "Udupi-Manipal Rd", area: "Manipal", areaId: "manipal", price: 4800000, beds: 1, baths: 1, sqft: 640, propType: "Apartment", trustTier: "listed", image: "https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=720&h=480&fit=crop", walk: "Student-ready · furnished", postedDays: 2, schoolIds: ["s-manipal", "s-vikas"], zone: "university-belt", lat: 13.3555, lon: 74.7840 },
    // Agricultural land — MUST be excluded from school-first everywhere.
    { id: "l-agri1", title: "Agricultural land off NH-66", locality: "Bailoor", area: "Manipal", areaId: "manipal", price: 9000000, beds: 0, baths: 0, sqft: 43560, propType: "Agricultural", trustTier: "listed", image: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=720&h=480&fit=crop", walk: "2 acres · red soil", postedDays: 30, schoolIds: [], zone: "university-belt", lat: 13.3600, lon: 74.7800 },
    // ----- University Belt · Udyavara -----
    { id: "l11", title: "3 BHK family home, Udyavara", locality: "Udyavara", area: "Udyavara", areaId: "udyavara", price: 7600000, beds: 3, baths: 2, sqft: 1320, propType: "Apartment", trustTier: "trusted", image: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=720&h=480&fit=crop", walk: null, postedDays: 10, schoolIds: ["s-udyavara-pu"], zone: "university-belt", lat: 13.3030, lon: 74.7440 },
    // ----- University Belt · Parkala -----
    { id: "l14", title: "3 BHK villa, Parkala township", locality: "Parkala Main Rd", area: "Parkala", areaId: "parkala", price: 11200000, beds: 3, baths: 3, sqft: 1720, propType: "Villa", trustTier: "verified", image: "https://images.unsplash.com/photo-1576941089067-2de3c901e126?w=720&h=480&fit=crop", walk: null, postedDays: 7, schoolIds: ["s-parkala-pu", "s-manipal"], zone: "university-belt", lat: 13.3700, lon: 74.7640 },
    // ----- Other zones -----
    { id: "l4", title: "2 BHK in Brahmagiri", locality: "Brahmagiri", area: "Udupi", areaId: "brahmagiri", price: 7800000, beds: 2, baths: 2, sqft: 1120, propType: "Apartment", trustTier: "trusted", image: "https://images.unsplash.com/photo-1567496898669-ee935f5f647a?w=720&h=480&fit=crop", walk: "Near Ashrama School", postedDays: 11, schoolIds: ["s-ashrama", "s-eurokids"], zone: "city-centre", lat: 13.3390, lon: 74.7500 },
    { id: "l5", title: "3 BHK in Kunjibettu", locality: "Kunjibettu", area: "Udupi", areaId: "kunjibettu", price: 8800000, beds: 3, baths: 3, sqft: 1350, propType: "Apartment", trustTier: "listed", image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=720&h=480&fit=crop", walk: "Quiet residential lane", postedDays: 19, schoolIds: ["s-vidyodaya", "s-ashrama"], zone: "city-centre", lat: 13.3315, lon: 74.7565 },
    { id: "l6", title: "2 BHK sea-view, Malpe", locality: "Malpe Beach Rd", area: "Malpe", areaId: "malpe", price: 9500000, beds: 2, baths: 2, sqft: 1180, propType: "Apartment", trustTier: "trusted", image: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=720&h=480&fit=crop", walk: "300m to the beach", postedDays: 6, schoolIds: [], zone: "coastal-strip", lat: 13.3494, lon: 74.7050 },
    { id: "l7", title: "3 BHK in Kundapura", locality: "Kodi Beach Rd", area: "Kundapura", areaId: "kundapura", price: 7200000, beds: 3, baths: 2, sqft: 1400, propType: "Apartment", trustTier: "verified", image: "https://images.unsplash.com/photo-1480074568708-e7b720bb3f09?w=720&h=480&fit=crop", walk: "Near Bearys College", postedDays: 14, schoolIds: ["s-bearys", "s-asiatech"], zone: "coastal-strip", lat: 13.6490, lon: 74.6820 },
    { id: "l8", title: "2 BHK near Karkala", locality: "Kariyakal", area: "Karkala", areaId: "karkala", price: 6200000, beds: 2, baths: 2, sqft: 1080, propType: "Apartment", trustTier: "listed", image: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=720&h=480&fit=crop", walk: "Near Bareerah Intl.", postedDays: 22, schoolIds: ["s-bareerah"], zone: "south-udupi", lat: 13.2140, lon: 74.9930 },
  ],
};

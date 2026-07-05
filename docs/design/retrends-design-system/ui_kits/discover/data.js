// Udupi Property Tracker — AREA-FIRST discovery mock data.
// Coastal Karnataka context. Prices in ₹. Coordinates are approximate, real-ish
// places around Udupi so the Leaflet map reads as authentic.
//
// Journey model (area-first):
//   1. Landing            → neighbourhood GROUPS (+ guidance summary)
//   2. Group selected     → AREAS inside that group  (the intermediary step)
//   3. Area selected      → residential HOMES in two-column property cards
//
// DATA HONESTY:
//   • Every count is the number of real records below — never invented.
//     group.areas  === number of areas with group === group.id
//     group.homes  === sum of those areas' home counts === matching listing records
//     area.homes   === number of listing records with that areaId
//   • Buy / Rent are wording-only here (same inventory, mode-aware noun) — matching
//     the school-first kit. "8 homes for sale" ⇄ "8 rentals available".
//   • AREA-FIRST shows residential homes ONLY. No agricultural land, no school
//     records, no radius math. Those belong to the agri-first / school-first kits.

// Buy/Rent-aware noun for home counts.
window.UPT_AREA_NOUN = function (mode, n) {
  if (mode === "Rent") return n === 1 ? "rental" : "rentals";
  return n === 1 ? "home for sale" : "homes for sale";
};
window.UPT_AREA_TITLE = function (mode) { return mode === "Rent" ? "Rentals" : "Homes for sale"; };

// ₹ formatter — Cr above a crore, else Lakh. Always mono in the UI.
window.UPT_AREA_INR = function (p) {
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

window.UPT_AREA_DATA = {
  city: { name: "Udupi", lat: 13.34119, lon: 74.74205, zoom: 11 },

  // ---- Neighbourhood groups (the landing). homes/areas mirror the records below. ----
  groups: [
    {
      id: "university-belt", name: "University Belt", subtitle: "Academic and student housing",
      cue: "Central Udupi",
      blurb: "Student-heavy neighbourhoods anchored by Manipal's campuses — strong rental demand, walk-to-class flats, and quieter family pockets a short drive out.",
      bestFor: "Student rentals, campus access, family homes near colleges",
      areas: 2, homes: 8,
      center: { lat: 13.3360, lon: 74.7700 }, bounds: [[13.290, 74.735], [13.395, 74.800]],
    },
    {
      id: "coastal-strip", name: "Coastal Strip", subtitle: "Beachside and fishing villages",
      cue: "West Udupi",
      blurb: "Beachfront living from Malpe down to Kaup — sea views, fishing-village character and weekend-home appeal along the shoreline.",
      bestFor: "Coastal lifestyle, second homes, beach access",
      areas: 2, homes: 9,
      center: { lat: 13.2840, lon: 74.7240 }, bounds: [[13.200, 74.690], [13.362, 74.760]],
    },
    {
      id: "city-centre", name: "City Centre", subtitle: "Core urban and temple precinct",
      cue: "Central Udupi",
      blurb: "The established heart of Udupi around Car Street and the Krishna temple — walkable, well-connected addresses with shops and transport at the door.",
      bestFor: "Convenience, shops, transport, temple precinct",
      areas: 3, homes: 7,
      center: { lat: 13.3380, lon: 74.7520 }, bounds: [[13.322, 74.740], [13.352, 74.766]],
    },
    {
      id: "north-udupi", name: "North Udupi", subtitle: "Rapidly developing northern belt",
      cue: "North Udupi",
      blurb: "Newer projects and bigger plots around Brahmavar — an emerging belt for buyers chasing value and space north of the city.",
      bestFor: "New builds, larger plots, value buyers",
      areas: 1, homes: 2,
      center: { lat: 13.4309, lon: 74.7480 }, bounds: [[13.408, 74.730], [13.452, 74.766]],
    },
    {
      id: "south-udupi", name: "South Udupi", subtitle: "Quiet residential southern belt",
      cue: "South Udupi",
      blurb: "Calmer, value-led residential pockets toward Padubidri and Shirva — family homes and independent houses away from the bustle.",
      bestFor: "Quiet living, families, independent houses",
      areas: 2, homes: 4,
      center: { lat: 13.1900, lon: 74.7780 }, bounds: [[13.120, 74.745], [13.255, 74.835]],
    },
  ],

  // ---- Areas inside groups (the intermediary step). homes = real records. ----
  areas: [
    // University Belt
    { id: "manipal", group: "university-belt", name: "Manipal", cue: "Central Udupi", blurb: "University core with student rentals and family flats within walking distance of campus.", homes: 5, lat: 13.3520, lon: 74.7860, bounds: [[13.340, 74.775], [13.362, 74.800]] },
    { id: "udyavara", group: "university-belt", name: "Udyavara", cue: "Central Udupi", blurb: "Calmer southern pocket with newer apartments and a short commute up to Manipal.", homes: 3, lat: 13.3020, lon: 74.7430, bounds: [[13.293, 74.735], [13.311, 74.752]] },
    // Coastal Strip
    { id: "malpe", group: "coastal-strip", name: "Malpe", cue: "West Udupi", blurb: "Beachfront living minutes from the port and ferry, with sea-view flats and weekend villas.", homes: 5, lat: 13.3494, lon: 74.7050, bounds: [[13.340, 74.695], [13.360, 74.715]] },
    { id: "kaup", group: "coastal-strip", name: "Kaup", cue: "West Udupi", blurb: "Lighthouse-and-beach village to the south — coastal homes with a quieter, local feel.", homes: 4, lat: 13.2230, lon: 74.7430, bounds: [[13.214, 74.735], [13.232, 74.752]] },
    // City Centre
    { id: "brahmagiri", group: "city-centre", name: "Brahmagiri", cue: "Central Udupi", blurb: "Temple-precinct core, walkable and very well connected to the whole city.", homes: 3, lat: 13.3390, lon: 74.7490, bounds: [[13.331, 74.742], [13.347, 74.757]] },
    { id: "kunjibettu", group: "city-centre", name: "Kunjibettu", cue: "Central Udupi", blurb: "Quiet residential lanes a few minutes from Car Street and the bus stand.", homes: 2, lat: 13.3310, lon: 74.7560, bounds: [[13.323, 74.748], [13.339, 74.764]] },
    { id: "car-street", group: "city-centre", name: "Car Street", cue: "Central Udupi", blurb: "Heritage heart around the Krishna temple — shops, markets and central apartments.", homes: 2, lat: 13.3409, lon: 74.7510, bounds: [[13.334, 74.745], [13.348, 74.758]] },
    // North Udupi
    { id: "brahmavar", group: "north-udupi", name: "Brahmavar", cue: "North Udupi", blurb: "Fast-growing junction town with newer apartment projects and plot-built villas.", homes: 2, lat: 13.4309, lon: 74.7480, bounds: [[13.420, 74.738], [13.442, 74.758]] },
    // South Udupi
    { id: "padubidri", group: "south-udupi", name: "Padubidri", cue: "South Udupi", blurb: "Beach-adjacent residential town on NH-66 with family homes and value flats.", homes: 2, lat: 13.1450, lon: 74.7700, bounds: [[13.136, 74.762], [13.154, 74.779]] },
    { id: "shirva", group: "south-udupi", name: "Shirva", cue: "South Udupi", blurb: "Inland village pocket with independent houses and quiet, leafy streets.", homes: 2, lat: 13.2400, lon: 74.8200, bounds: [[13.231, 74.812], [13.249, 74.829]] },
  ],

  // ---- Listings (residential only). group + areaId locate each home. ----
  listings: [
    // University Belt · Manipal (5)
    { id: "a-mp1", title: "3 BHK near Manipal University", locality: "Eshwar Nagar", area: "Manipal", areaId: "manipal", group: "university-belt", price: 13500000, beds: 3, baths: 2, sqft: 1480, propType: "Apartment", trustTier: "verified", tag: "New", image: IMG[0], lat: 13.3505, lon: 74.7905 },
    { id: "a-mp2", title: "1 BHK studio, Tiger Circle", locality: "Tiger Circle", area: "Manipal", areaId: "manipal", group: "university-belt", price: 5200000, beds: 1, baths: 1, sqft: 720, propType: "Apartment", trustTier: "trusted", image: IMG[8], lat: 13.3530, lon: 74.7880 },
    { id: "a-mp3", title: "4 BHK villa, End Point Road", locality: "End Point Rd", area: "Manipal", areaId: "manipal", group: "university-belt", price: 26500000, beds: 4, baths: 4, sqft: 2600, propType: "Villa", trustTier: "verified", image: IMG[2], lat: 13.3470, lon: 74.7950 },
    { id: "a-mp4", title: "2 BHK garden flat, Eshwar Nagar", locality: "Eshwar Nagar", area: "Manipal", areaId: "manipal", group: "university-belt", price: 8900000, beds: 2, baths: 2, sqft: 1150, propType: "Apartment", trustTier: "trusted", image: IMG[3], lat: 13.3485, lon: 74.7895 },
    { id: "a-mp5", title: "Studio + loft, Manipal centre", locality: "Udupi-Manipal Rd", area: "Manipal", areaId: "manipal", group: "university-belt", price: 4800000, beds: 1, baths: 1, sqft: 640, propType: "Apartment", trustTier: "listed", image: IMG[9], lat: 13.3555, lon: 74.7840 },
    // University Belt · Udyavara (3)
    { id: "a-ud1", title: "3 BHK family home, Udyavara", locality: "Udyavara", area: "Udyavara", areaId: "udyavara", group: "university-belt", price: 7600000, beds: 3, baths: 2, sqft: 1320, propType: "Apartment", trustTier: "trusted", image: IMG[4], lat: 13.3030, lon: 74.7440 },
    { id: "a-ud2", title: "2 BHK near NH-66, Udyavara", locality: "Udyavara Cross", area: "Udyavara", areaId: "udyavara", group: "university-belt", price: 6200000, beds: 2, baths: 2, sqft: 1080, propType: "Apartment", trustTier: "listed", image: IMG[1], lat: 13.3005, lon: 74.7455 },
    { id: "a-ud3", title: "3 BHK independent house", locality: "Udyavara village", area: "Udyavara", areaId: "udyavara", group: "university-belt", price: 9800000, beds: 3, baths: 3, sqft: 1560, propType: "Independent House", trustTier: "verified", image: IMG[5], lat: 13.3040, lon: 74.7415 },
    // Coastal Strip · Malpe (5)
    { id: "a-ma1", title: "2 BHK sea-view, Malpe", locality: "Malpe Beach Rd", area: "Malpe", areaId: "malpe", group: "coastal-strip", price: 9500000, beds: 2, baths: 2, sqft: 1180, propType: "Apartment", trustTier: "trusted", tag: "New", image: IMG[7], lat: 13.3500, lon: 74.7060 },
    { id: "a-ma2", title: "3 BHK beach house, Malpe", locality: "Malpe Port Rd", area: "Malpe", areaId: "malpe", group: "coastal-strip", price: 18500000, beds: 3, baths: 3, sqft: 2100, propType: "Villa", trustTier: "verified", image: IMG[2], lat: 13.3480, lon: 74.7035 },
    { id: "a-ma3", title: "2 BHK harbour-side flat", locality: "Malpe Harbour", area: "Malpe", areaId: "malpe", group: "coastal-strip", price: 6800000, beds: 2, baths: 1, sqft: 980, propType: "Apartment", trustTier: "listed", image: IMG[1], lat: 13.3510, lon: 74.7020 },
    { id: "a-ma4", title: "4 BHK weekend villa", locality: "Thottam Beach", area: "Malpe", areaId: "malpe", group: "coastal-strip", price: 32000000, beds: 4, baths: 4, sqft: 3200, propType: "Villa", trustTier: "verified", image: IMG[11], lat: 13.3470, lon: 74.7075 },
    { id: "a-ma5", title: "1 BHK sea-facing studio", locality: "Malpe Beach Rd", area: "Malpe", areaId: "malpe", group: "coastal-strip", price: 5500000, beds: 1, baths: 1, sqft: 700, propType: "Apartment", trustTier: "trusted", image: IMG[8], lat: 13.3520, lon: 74.7050 },
    // Coastal Strip · Kaup (4)
    { id: "a-ka1", title: "2 BHK near Kaup Beach", locality: "Kaup Beach Rd", area: "Kaup", areaId: "kaup", group: "coastal-strip", price: 7200000, beds: 2, baths: 2, sqft: 1120, propType: "Apartment", trustTier: "trusted", image: IMG[7], lat: 13.2240, lon: 74.7420 },
    { id: "a-ka2", title: "3 BHK lighthouse view", locality: "Kaup Lighthouse", area: "Kaup", areaId: "kaup", group: "coastal-strip", price: 11500000, beds: 3, baths: 2, sqft: 1480, propType: "Villa", trustTier: "verified", tag: "New", image: IMG[5], lat: 13.2215, lon: 74.7440 },
    { id: "a-ka3", title: "2 BHK coastal flat", locality: "Kaup Market", area: "Kaup", areaId: "kaup", group: "coastal-strip", price: 5900000, beds: 2, baths: 2, sqft: 1010, propType: "Apartment", trustTier: "listed", image: IMG[1], lat: 13.2250, lon: 74.7445 },
    { id: "a-ka4", title: "3 BHK garden home", locality: "Kaup-Padu Rd", area: "Kaup", areaId: "kaup", group: "coastal-strip", price: 9200000, beds: 3, baths: 3, sqft: 1620, propType: "Independent House", trustTier: "trusted", image: IMG[4], lat: 13.2225, lon: 74.7405 },
    // City Centre · Brahmagiri (3)
    { id: "a-br1", title: "2 BHK in Brahmagiri", locality: "Brahmagiri", area: "Udupi", areaId: "brahmagiri", group: "city-centre", price: 7800000, beds: 2, baths: 2, sqft: 1120, propType: "Apartment", trustTier: "trusted", image: IMG[10], lat: 13.3390, lon: 74.7500 },
    { id: "a-br2", title: "3 BHK near Car Street", locality: "Brahmagiri", area: "Udupi", areaId: "brahmagiri", group: "city-centre", price: 12500000, beds: 3, baths: 3, sqft: 1640, propType: "Apartment", trustTier: "verified", image: IMG[3], lat: 13.3400, lon: 74.7485 },
    { id: "a-br3", title: "2 BHK temple precinct", locality: "Car Street Rd", area: "Udupi", areaId: "brahmagiri", group: "city-centre", price: 8400000, beds: 2, baths: 2, sqft: 1090, propType: "Apartment", trustTier: "listed", image: IMG[1], lat: 13.3380, lon: 74.7505 },
    // City Centre · Kunjibettu (2)
    { id: "a-ku1", title: "3 BHK in Kunjibettu", locality: "Kunjibettu", area: "Udupi", areaId: "kunjibettu", group: "city-centre", price: 8800000, beds: 3, baths: 3, sqft: 1350, propType: "Apartment", trustTier: "listed", image: IMG[1], lat: 13.3315, lon: 74.7565 },
    { id: "a-ku2", title: "2 BHK quiet lane", locality: "Kunjibettu", area: "Udupi", areaId: "kunjibettu", group: "city-centre", price: 6900000, beds: 2, baths: 2, sqft: 1040, propType: "Apartment", trustTier: "trusted", image: IMG[9], lat: 13.3305, lon: 74.7550 },
    // City Centre · Car Street (2)
    { id: "a-cs1", title: "2 BHK heritage home, Car Street", locality: "Car Street", area: "Udupi", areaId: "car-street", group: "city-centre", price: 9900000, beds: 2, baths: 2, sqft: 1200, propType: "Independent House", trustTier: "verified", tag: "New", image: IMG[5], lat: 13.3412, lon: 74.7512 },
    { id: "a-cs2", title: "3 BHK central apartment", locality: "Maruti Veethika", area: "Udupi", areaId: "car-street", group: "city-centre", price: 11200000, beds: 3, baths: 2, sqft: 1420, propType: "Apartment", trustTier: "trusted", image: IMG[3], lat: 13.3405, lon: 74.7500 },
    // North Udupi · Brahmavar (2)
    { id: "a-bv1", title: "3 BHK new project, Brahmavar", locality: "Brahmavar", area: "Brahmavar", areaId: "brahmavar", group: "north-udupi", price: 7400000, beds: 3, baths: 2, sqft: 1380, propType: "Apartment", trustTier: "trusted", tag: "New", image: IMG[4], lat: 13.4309, lon: 74.7490 },
    { id: "a-bv2", title: "4 BHK plot-built villa", locality: "Brahmavar Rd", area: "Brahmavar", areaId: "brahmavar", group: "north-udupi", price: 13800000, beds: 4, baths: 3, sqft: 2400, propType: "Villa", trustTier: "verified", image: IMG[2], lat: 13.4320, lon: 74.7465 },
    // South Udupi · Padubidri (2)
    { id: "a-pa1", title: "2 BHK near Padubidri Beach", locality: "Padubidri", area: "Padubidri", areaId: "padubidri", group: "south-udupi", price: 6600000, beds: 2, baths: 2, sqft: 1060, propType: "Apartment", trustTier: "listed", image: IMG[7], lat: 13.1455, lon: 74.7705 },
    { id: "a-pa2", title: "3 BHK family home, Padubidri", locality: "NH-66 Padubidri", area: "Padubidri", areaId: "padubidri", group: "south-udupi", price: 8200000, beds: 3, baths: 2, sqft: 1340, propType: "Independent House", trustTier: "trusted", image: IMG[5], lat: 13.1445, lon: 74.7690 },
    // South Udupi · Shirva (2)
    { id: "a-sh1", title: "2 BHK in Shirva", locality: "Shirva", area: "Shirva", areaId: "shirva", group: "south-udupi", price: 5800000, beds: 2, baths: 2, sqft: 1000, propType: "Apartment", trustTier: "listed", image: IMG[1], lat: 13.2405, lon: 74.8205 },
    { id: "a-sh2", title: "3 BHK villa, Shirva", locality: "Shirva-Mudarangadi", area: "Shirva", areaId: "shirva", group: "south-udupi", price: 9400000, beds: 3, baths: 3, sqft: 1580, propType: "Villa", trustTier: "trusted", tag: "New", image: IMG[5], lat: 13.2390, lon: 74.8185 },
  ],
};

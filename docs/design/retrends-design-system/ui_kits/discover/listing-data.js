/* Udupi Property Tracker — Listing detail sample data.
   Five NON-AGRICULTURAL property types share one schema; buildSpecs() returns
   the type-appropriate spec tiles + detail rows so irrelevant fields are
   hidden, never shown empty. No fabricated metrics, broker names or ratings. */
(function () {
  // ---- helpers --------------------------------------------------------------
  const trim = (n) => parseFloat(n.toFixed(2)).toString();
  const fmtPrice = (v) => {
    if (v == null) return null;
    return v >= 10000000 ? `₹${trim(v / 10000000)} crore` : `₹${trim(v / 100000)} lakh`;
  };
  const perSqft = (p) => (p.price && p.builtUp ? `₹${Math.round(p.price / p.builtUp).toLocaleString("en-IN")} / sq ft` : null);

  // Compact top-facts line under the title — type aware.
  function topFacts(p) {
    const f = [];
    if (p.kind === "plot") {
      if (p.plotArea) f.push(p.plotArea);
      if (p.dimensions) f.push(p.dimensions);
      if (p.roadAccess) f.push(p.roadAccess);
      if (p.facing) f.push(`${p.facing}-facing`);
    } else if (p.kind === "commercial") {
      if (p.builtUp) f.push(`${p.builtUp.toLocaleString("en-IN")} sq ft`);
      if (p.floors) f.push(p.floors);
      if (p.usage) f.push(p.usage);
      if (p.frontage) f.push(p.frontage);
    } else {
      if (p.bedrooms) f.push(`${p.bedrooms} BHK`);
      if (p.bathrooms) f.push(`${p.bathrooms} bath`);
      if (p.builtUp) f.push(`${p.builtUp.toLocaleString("en-IN")} sq ft`);
      if (p.furnishing) f.push(p.furnishing);
    }
    return f;
  }

  // ---- nearby (shared — same City Center neighbourhood) ----------------------
  const SCHOOLS = [
    { name: "Christ King PU College", board: "State", dist: "180 m" },
    { name: "Bhandarkar's College of Arts & Science", board: "State", dist: "300 m" },
    { name: "Board High School Udupi", board: "State", dist: "360 m" },
    { name: "Vidyodaya High School", board: "State", dist: "430 m" },
    { name: "Poornaprajna College", board: "State", dist: "490 m" },
    { name: "MGM College Udupi", board: "State", dist: "520 m" },
    { name: "Ashrama School Udupi Bannanje", board: "CBSE", dist: "580 m" },
    { name: "Milagres PU College", board: "State", dist: "680 m" },
    { name: "Sri Sharada PU College", board: "State", dist: "750 m" },
    { name: "Eurokids Pre-School Udupi", board: "Private", dist: "780 m" },
    { name: "Basel Mission Higher Primary School", board: "State", dist: "830 m" },
    { name: "Sacred Heart High School", board: "ICSE", dist: "840 m" },
    { name: "St Cecily's PU College", board: "State", dist: "1.3 km" },
    { name: "Kadiyali English Medium School", board: "Private", dist: "1.3 km" },
    { name: "KIDZEE Udupi", board: "CBSE", dist: "1.5 km" },
    { name: "Sri Bhuvanendra College", board: "State", dist: "1.8 km" },
    { name: "Lords International Residential School", board: "CBSE", dist: "1.9 km" },
    { name: "Jnanaganga PU College", board: "State", dist: "2.0 km" },
  ];

  const ESSENTIALS = [
    { icon: "building", label: "Hospital", items: [{ name: "Dr TMA Pai Hospital", dist: "450 m" }, { name: "Adarsha Hospital", dist: "900 m" }] },
    { icon: "map-pin", label: "Transport", items: [{ name: "Udupi Service Bus Stand", dist: "650 m" }, { name: "City Bus Stand", dist: "1.1 km" }] },
    { icon: "search", label: "Daily needs", items: [{ name: "More Supermarket", dist: "300 m" }, { name: "Kunjibettu Market", dist: "850 m" }] },
    { icon: "star", label: "Landmarks", items: [{ name: "Sri Krishna Matha", dist: "1.4 km" }, { name: "City Centre Mall", dist: "1.7 km" }] },
  ];

  // ---- the five listings ----------------------------------------------------
  const COMMON = {
    citySlug: "udupi", city: "Udupi", area: "City Center", areaSlug: "city-center",
    fullAddress: "City Center, near Diana Circle, Udupi 576101",
    mapsUrl: "https://maps.google.com/?q=Udupi+City+Center",
    updated: "today", postedDate: "June 23, 2026",
    schools: SCHOOLS, essentials: ESSENTIALS,
    photos: [
      { label: "Living room" }, { label: "Dining area" }, { label: "Master bedroom" },
    ],
  };

  const LISTINGS = {
    apartment: Object.assign({}, COMMON, {
      kind: "apartment", kindLabel: "Apartment", ref: "PROP-07180",
      title: "3 BHK in City Center", price: 5130000, builtUp: 1200,
      listingType: "sale", listedBy: "broker", trustTier: "trusted",
      description:
        "A bright, well-kept 3 BHK on the third floor of a quiet residential block in the heart of City Center. Walking distance to schools, the bus stand and daily-needs stores. Tiled flooring throughout, covered parking, and a balcony facing the morning sun. Suited to a family wanting a central, low-commute home — or a managed rental.",
      bedrooms: 3, bathrooms: 3, furnishing: "Semi-furnished", parking: "1 covered",
      floor: "3rd of 5", age: "4 years", facing: "East", availability: "Ready to move",
      areaMarket: null,
    }),

    house: Object.assign({}, COMMON, {
      kind: "house", kindLabel: "Independent house", ref: "PROP-07181",
      title: "4 BHK independent house", price: 14500000, builtUp: 2400, plotArea: "3,000 sq ft",
      listingType: "sale", listedBy: "owner", trustTier: "verified",
      description:
        "A G+1 independent house on a 3,000 sq ft plot in City Center, with a private gated entry and space for two cars. Four bedrooms, a separate pooja room and a utility yard at the rear. Owner-occupied and well-maintained — ready for a family that wants land of their own without leaving the city core.",
      bedrooms: 4, bathrooms: 4, furnishing: "Unfurnished", parking: "2 (gated)",
      floors: "G + 1", age: "9 years", facing: "North-east", availability: "Ready to move",
      areaMarket: { median: "₹4,950 / sq ft", trend: "+6.2%", trendDir: "up", listings: 12, demand: "Steady", confidence: "Limited data" },
    }),

    villa: Object.assign({}, COMMON, {
      kind: "villa", kindLabel: "Villa", ref: "PROP-07182",
      title: "4 BHK villa with private garden", price: 28500000, builtUp: 3200, plotArea: "4,500 sq ft",
      listingType: "sale", listedBy: "broker", trustTier: "verified",
      description:
        "A newly built G+2 villa in a small gated cluster, with a landscaped front garden, double-height living room and a rooftop terrace. Modular kitchen, fitted wardrobes and a covered porch for two cars. A premium, move-in-ready home for buyers who want space and finish close to the city.",
      bedrooms: 4, bathrooms: 5, furnishing: "Furnished", parking: "2 covered",
      floors: "G + 2", age: "New", facing: "East", availability: "Ready to move",
      areaMarket: null,
    }),

    plot: Object.assign({}, COMMON, {
      kind: "plot", kindLabel: "Residential plot", ref: "PROP-07183",
      title: "Residential plot in City Center", price: 9600000, builtUp: null, plotArea: "2,400 sq ft",
      listingType: "sale", listedBy: "owner", trustTier: "trusted",
      description:
        "A clear-title residential plot of 2,400 sq ft on a 30 ft tar road, with a compound wall already on three sides. East-facing corner plot suitable for an independent house up to G+2 under current local norms. Central location with schools and daily needs within walking distance — a buildable, low-risk plot for a self-built home.",
      dimensions: "40 × 60 ft", roadAccess: "30 ft tar road", boundary: "Compound wall on 3 sides",
      title_status: "Clear title · single owner", buildSuitability: "Residential — up to G+2",
      facing: "East", cornerPlot: "Corner plot", availability: "Immediate registration",
      areaMarket: { median: "₹4,275 / sq ft", trend: "+8.4%", trendDir: "up", listings: 9, demand: "Rising", confidence: "Limited data" },
    }),

    commercial: Object.assign({}, COMMON, {
      kind: "commercial", kindLabel: "Commercial building", ref: "PROP-07184",
      title: "Commercial building on main road", price: 62000000, builtUp: 6500,
      listingType: "sale", listedBy: "broker", trustTier: "verified",
      description:
        "A G+3 commercial building with 45 ft of main-road frontage in City Center — high visibility and steady footfall. Suited to office or retail use, with basement plus surface parking, a passenger lift and three-phase power with backup. Currently vacant and available on sale; floor plates can be leased individually.",
      builtUp: 6500, floors: "G + 3", frontage: "45 ft road frontage", parking: "Basement + 12 surface",
      usage: "Office / retail", visibility: "Main road · high footfall", powerBackup: "3-phase + DG backup",
      lift: "1 passenger lift", availability: "Vacant — available now",
      areaMarket: { median: "₹6,800 / sq ft", trend: "+4.1%", trendDir: "up", listings: 6, demand: "Steady", confidence: "Limited data" },
    }),
  };

  // ---- type-adaptive spec builder ------------------------------------------
  // Returns the spec tiles (big row) + detail rows appropriate to p.kind.
  // Fields that don't apply to a type are simply never emitted.
  function buildSpecs(p) {
    const tile = (icon, label, value) => (value != null && value !== "" ? { icon, label, value } : null);
    const clean = (arr) => arr.filter(Boolean);
    let tiles = [], rows = [];

    if (p.kind === "plot") {
      tiles = clean([
        tile("maximize", "Plot area", p.plotArea),
        tile("layers", "Dimensions", p.dimensions),
        tile("route", "Road access", p.roadAccess),
        tile("building", "Build suitability", p.buildSuitability),
      ]);
      rows = clean([
        tile("shield", "Boundary", p.boundary),
        tile("file-check", "Title", p.title_status),
        tile("map-pin", "Facing", p.facing),
        tile("check", "Plot type", p.cornerPlot),
        tile("calendar", "Availability", p.availability),
        tile("users", "Listed by", p.listedBy === "owner" ? "Owner" : "Broker"),
      ]);
    } else if (p.kind === "commercial") {
      tiles = clean([
        tile("maximize", "Built-up area", p.builtUp ? `${p.builtUp.toLocaleString("en-IN")} sq ft` : null),
        tile("layers", "Floors", p.floors),
        tile("route", "Road frontage", p.frontage),
        tile("eye", "Visibility", p.visibility),
      ]);
      rows = clean([
        tile("building", "Usage", p.usage),
        tile("map-pin", "Parking / loading", p.parking),
        tile("trending-up", "Power", p.powerBackup),
        tile("arrow-up-right", "Lift", p.lift),
        tile("calendar", "Availability", p.availability),
        tile("users", "Listed by", p.listedBy === "owner" ? "Owner" : "Broker"),
      ]);
    } else {
      // apartment / house / villa — residential
      tiles = clean([
        tile("bed", "Bedrooms", p.bedrooms ? `${p.bedrooms} BHK` : null),
        tile("bath", "Bathrooms", p.bathrooms),
        tile("maximize", "Built-up area", p.builtUp ? `${p.builtUp.toLocaleString("en-IN")} sq ft` : null),
        tile(p.kind === "apartment" ? "building" : "layers", p.kind === "apartment" ? "Floor" : "Floors", p.kind === "apartment" ? p.floor : p.floors),
      ]);
      rows = clean([
        tile("maximize", "Plot area", p.plotArea),
        tile("layers", "Furnishing", p.furnishing),
        tile("route", "Parking", p.parking),
        tile("calendar", "Property age", p.age),
        tile("map-pin", "Facing", p.facing),
        tile("check", "Availability", p.availability),
        tile("users", "Listed by", p.listedBy === "owner" ? "Owner" : "Broker"),
      ]);
    }
    return { tiles, rows };
  }

  window.UPT_LISTINGS = LISTINGS;
  window.UPT_buildSpecs = buildSpecs;
  window.UPT_topFacts = topFacts;
  window.UPT_fmtPrice = fmtPrice;
  window.UPT_perSqft = perSqft;
})();

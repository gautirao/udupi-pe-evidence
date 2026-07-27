// Discover — Result Scopes and Multi-Area Search · mock data
// Extension of ui_kits/discover (unchanged). Self-contained so the approved kit
// is never edited. Every count below is a fixture, but the arithmetic is honest:
// combined totals are sums of their parts and nothing is silently broadened.
(function () {
  const IMG = [
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=720&h=480&fit=crop",
    "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=720&h=480&fit=crop",
    "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=720&h=480&fit=crop",
    "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=720&h=480&fit=crop",
    "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=720&h=480&fit=crop",
    "https://images.unsplash.com/photo-1576941089067-2de3c901e126?w=720&h=480&fit=crop",
    "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=720&h=480&fit=crop",
    "https://images.unsplash.com/photo-1480074568708-e7b720bb3f09?w=720&h=480&fit=crop",
  ];

  // Canonical areas (#1956). `listings` / `schools` are the unfiltered catalogue counts.
  const A = {
    hebbal: { name: "Hebbal", lat: 13.0358, lon: 77.5970, listings: 42, schools: 11, parent: "Hebbal · Yelahanka" },
    nagawara: { name: "Nagawara", lat: 13.0435, lon: 77.6215, listings: 31, schools: 9, parent: "Hebbal · Yelahanka", rel: "Adjacent" },
    jakkur: { name: "Jakkur", lat: 13.0745, lon: 77.6070, listings: 22, schools: 7, parent: "Hebbal · Yelahanka", rel: "3.4 km away" },
    kempapura: { name: "Kempapura", lat: 13.0492, lon: 77.5893, listings: 18, schools: 3, parent: "Hebbal · Yelahanka", rel: "1.9 km away" },
    amruthahalli: { name: "Amruthahalli", lat: 13.0672, lon: 77.5941, listings: 14, schools: 5, parent: "Hebbal · Yelahanka", rel: "4.1 km away" },
    sahakarnagar: { name: "Sahakar Nagar", lat: 13.0620, lon: 77.5820, listings: 26, schools: 8, parent: "Hebbal · Yelahanka", rel: "4.6 km away" },
    thanisandra: { name: "Thanisandra", lat: 13.0570, lon: 77.6300, listings: 37, schools: 6, parent: "Thanisandra · Hennur", rel: "3.1 km away" },
    hennur: { name: "Hennur", lat: 13.0410, lon: 77.6400, listings: 29, schools: 6, parent: "Thanisandra · Hennur", rel: "5.2 km away" },
    kodigehalli: { name: "Kodigehalli", lat: 13.0560, lon: 77.5762, listings: 0, schools: 4, parent: "Hebbal · Yelahanka", rel: "5.0 km away" },
    yelahanka: { name: "Yelahanka", lat: 13.1007, lon: 77.5963, listings: 44, schools: 14, parent: "Hebbal · Yelahanka" },
    devanahalli: { name: "Devanahalli", lat: 13.2437, lon: 77.7172, listings: 19, schools: 5, parent: "Yelahanka · Devanahalli" },
    whitefield: { name: "Whitefield", lat: 12.9698, lon: 77.7500, listings: 64, schools: 15, parent: "IT Corridor" },
    jpnagar: { name: "JP Nagar", lat: 12.9070, lon: 77.5855, listings: 38, schools: 12, parent: "South Core" },
  };
  Object.keys(A).forEach((k) => { A[k].id = k; });

  const area = (id) => A[id];
  const areas = (ids) => ids.map(area);
  const nameList = (ids) => areas(ids).map((a) => a.name).join(" · ");
  const sum = (ids, key) => areas(ids).reduce((n, a) => n + a[key], 0);

  // Schools located INSIDE the named areas. Informational only (#2017 first release):
  // no ranking, no travel time, no radius search, no effect on property results.
  const SCHOOLS = {
    hebbal: ["Vidyaniketan Public School", "Presidency School, Hebbal", "Kensri School", "Ryan International, Hebbal"],
    nagawara: ["Cambridge Public School, Nagawara", "St. Ann's, Nagawara", "Legacy School (Manyata edge)"],
    jakkur: ["Delhi Public School North", "Canadian International School", "Jakkur Public School"],
    kempapura: ["Sri Chaitanya, Kempapura"],
    kodigehalli: ["Kodigehalli Govt. High School", "Vidya Mandir, Kodigehalli", "Little Flower, Kodigehalli", "Sri Vani School"],
  };

  const TITLES = [
    ["3 BHK lake-view apartment", 21500000, 3, 3, 1620, "Apartment", "verified"],
    ["2 BHK near the flyover", 12800000, 2, 2, 1180, "Apartment", "trusted"],
    ["4 BHK villa", 38500000, 4, 4, 3100, "Villa", "verified"],
    ["3 BHK gated flat", 17900000, 3, 2, 1460, "Apartment", "verified"],
    ["2 BHK ORR-facing", 11200000, 2, 2, 1080, "Apartment", "listed"],
    ["4 BHK penthouse", 46000000, 4, 5, 3600, "Penthouse", "trusted"],
    ["3 BHK independent house", 24500000, 3, 3, 2050, "Independent House", "verified"],
    ["1 BHK compact flat", 7200000, 1, 1, 640, "Apartment", "listed"],
  ];

  // Deterministic listing fixtures for an area set — enough to fill a result panel.
  function listingsFor(ids, n) {
    const out = [];
    let i = 0;
    while (out.length < n) {
      const a = area(ids[out.length % ids.length]);
      const t = TITLES[i % TITLES.length];
      out.push({
        id: `${a.id}-${i}`, title: `${t[0]}, ${a.name}`, area: a.name, areaId: a.id,
        locality: a.name, price: t[1] - (i % 3) * 700000, beds: t[2], baths: t[3],
        sqft: t[4] + (i % 4) * 40, propType: t[5], trustTier: t[6], image: IMG[i % IMG.length],
        lat: a.lat + ((i % 5) - 2) * 0.0042, lon: a.lon + ((i % 4) - 1.5) * 0.0052,
      });
      i++;
    }
    return out;
  }

  const inr = (p) => (p >= 10000000 ? `₹${(p / 10000000).toFixed(2)} Cr` : `₹${(p / 100000).toFixed(0)} L`);
  const plural = (n, s, p) => `${n} ${n === 1 ? s : (p || s + "s")}`;

  // Default property filters shown on every state (kept identical across scope changes
  // so a scope swap never looks like a filter change).
  const FILTERS = ["Buy", "Up to ₹45 lakh", "3 BHK", "Ready to move"];

  window.RS = { A, area, areas, nameList, sum, SCHOOLS, listingsFor, inr, plural, IMG, FILTERS };
})();

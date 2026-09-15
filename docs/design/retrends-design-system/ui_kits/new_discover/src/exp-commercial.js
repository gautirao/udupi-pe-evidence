// Commercial inventory — an ADDITIVE layer on the canonical mock backend.
// Loaded before exp-data.js, which calls EXP_COM.build() to append Commercial
// records to the one `listings` catalogue and delegates Commercial filtering here.
// Nothing in the residential, schools or agricultural model changes: a Commercial
// record fails `passes` unless the existing property-type filter is on Commercial,
// so every pre-existing count on screen stays exactly what it was.
(function () {
  // The only buyer-facing labels. Missing/legacy/unrecognised values -> "Commercial".
  const SUBTYPES = [
    { k: "shop", label: "Shop" },
    { k: "office", label: "Office" },
    { k: "building", label: "Commercial Building" },
    { k: "warehouse", label: "Warehouse / Godown" },
    { k: "land", label: "Commercial Land" }
  ];
  const FALLBACK_LABEL = "Commercial";
  const LABEL = {};
  SUBTYPES.forEach((s) => (LABEL[s.k] = s.label));
  const label = (k) => LABEL[k] || FALLBACK_LABEL;

  const IMG = {
    shop: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=720&h=480&fit=crop",
    office: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=720&h=480&fit=crop",
    building: "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=720&h=480&fit=crop",
    warehouse: "https://images.unsplash.com/photo-1553413077-190dd305871c?w=720&h=480&fit=crop",
    // A cleared, kerbed development plot — deliberately NOT green farmland, which
    // would read as Agricultural. No imagery here implies zoning or approval status.
    land: "https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=720&h=480&fit=crop",
    unknown: "https://images.unsplash.com/photo-1497366811353-6870744d04b2?w=720&h=480&fit=crop"
  };

  // Which areas carry which Commercial inventory. Retail on the high streets,
  // offices in the tech corridors, warehouses and land on the industrial edges.
  const SPEC = {
    indiranagar: ["shop", "shop", "shop", "office", "office", "building"],
    jayanagar: ["shop", "shop", "office"],
    jpnagar: ["shop", "shop", "office", "building"],
    shivajinagar: ["shop", "shop", "unknown"],
    rajajinagar: ["shop", "warehouse"],
    domlur: ["office", "office", "building"],
    whitefield: ["office", "office", "office", "building", "warehouse"],
    marathahalli: ["office", "office", "shop"],
    "electronic-city": ["office", "office", "land"],
    krpuram: ["warehouse", "warehouse", "land"],
    budigere: ["land", "land", "warehouse"],
    kengeri: ["warehouse", "land"],
    nagarbhavi: ["shop", "land"],
    vijayanagar: ["shop", "office"],
    hebbal: ["office", "shop", "land"],
    nagawara: ["warehouse", "unknown"],
    thanisandra: ["office", "shop"]
  };
  const DEALS = { shop: ["For Rent", "For Rent", "For Sale"], office: ["For Sale", "For Rent", "For Rent"], building: ["For Sale"], warehouse: ["For Lease", "For Lease", "For Rent"], land: ["For Sale"], unknown: ["For Rent", "For Sale"] };
  const HUBS = ["High-street retail", "Neighbourhood market", "Mall unit", "Commercial complex"];
  const FLOORS = ["Ground", "1st", "2nd", "3rd", "4th"];
  // Readable, non-repetitive card titles — the subtype label and the area both appear
  // elsewhere on the card, so the title carries the phrasing rather than the numbers.
  const TITLE = {
    shop: (a) => "Shop in " + a,
    office: (a) => "Office space in " + a,
    building: (a) => "Commercial building in " + a,
    warehouse: (a) => "Warehouse in " + a,
    land: (a) => "Commercial land in " + a,
    unknown: (a) => "Commercial property in " + a
  };

  function inrShort(p) { return p >= 10000000 ? "₹" + (p / 10000000).toFixed(2).replace(/\.00$/, "") + " Cr" : "₹" + Math.round(p / 100000) + " L"; }
  function money(v) {
    if (v >= 100000) return "₹" + (v / 100000).toFixed(2).replace(/\.00$/, "") + " L";
    return "₹" + v.toLocaleString("en-IN");
  }
  // coarse band around a figure — the anonymous treatment
  function bandOf(l) {
    const v = l.deal === "For Sale" ? l.price : l.rent;
    const lo = v * 0.88, hi = v * 1.14;
    const f = l.deal === "For Sale" ? inrShort : money;
    return f(Math.round(lo / (v > 5000000 ? 100000 : 1000)) * (v > 5000000 ? 100000 : 1000)) + "–" + f(Math.round(hi / (v > 5000000 ? 100000 : 1000)) * (v > 5000000 ? 100000 : 1000)) + (l.deal === "For Sale" ? "" : " / month");
  }
  function exactOf(l) { return l.deal === "For Sale" ? inrShort(l.price) : money(l.rent) + " / month"; }

  // ---- the two card facts per subtype (never more than two) ----------------
  function factsOf(l) {
    const a = l.sqft.toLocaleString("en-IN") + " sq ft";
    if (l.comSub === "shop") return [a, l.floor === "Ground" ? "Ground floor" : l.hub];
    if (l.comSub === "office") return [a, l.seats + " seats"];
    if (l.comSub === "building") return [a, l.floors + " floors"];
    if (l.comSub === "warehouse") return [a, l.clearHt + " ft clear height"];
    if (l.comSub === "land") return [a, l.frontage ? "Main-road frontage" : l.zoning];
    return [a];
  }

  // ---- the compact detail summary: only fields this record actually has ----
  function summaryOf(l) {
    const out = [];
    const size = l.sqft.toLocaleString("en-IN") + " sq ft";
    if (l.comSub === "land") out.push({ icon: "maximize", label: "Land area", value: size });
    else out.push({ icon: "maximize", label: l.comSub === "warehouse" ? "Area" : "Built-up", value: size });
    if (l.floor && l.comSub !== "land" && l.comSub !== "warehouse" && l.comSub !== "building") out.push({ icon: "layers", label: "Floor", value: l.floor + (l.ofFloors ? " of " + l.ofFloors : "") });
    if (l.comSub === "building") out.push({ icon: "layers", label: "Floors", value: String(l.floors) });
    if (l.comSub === "warehouse") out.push({ icon: "layers", label: "Clear height", value: l.clearHt + " ft" });
    if (l.comSub === "shop") out.push({ icon: "map-pin", label: "Hub type", value: l.hub });
    if (l.comSub === "office") out.push({ icon: "users", label: "Seats", value: String(l.seats) });
    if (l.comSub === "building") out.push({ icon: "users", label: "Occupancy", value: l.letFloors + " of " + l.floors + " floors let" });
    if (l.comSub === "land") out.push({ icon: "map-pin", label: "Frontage", value: l.frontage ? l.frontageFt + " ft, main road" : l.frontageFt + " ft" });
    if (l.comSub === "land" || l.comSub === "warehouse") out.push({ icon: "route", label: "Access", value: l.access });
    if (l.parking) out.push({ icon: "route", label: "Parking", value: l.parking });
    if (l.washrooms) out.push({ icon: "bath", label: "Washrooms", value: l.washrooms });
    if (l.available) out.push({ icon: "calendar", label: "Available", value: l.available });
    return out;
  }

  // ---- subtype-aware detail sections; broker:true = boxed disclosure -------
  function sectionsOf(l) {
    const size = l.sqft.toLocaleString("en-IN") + " sq ft";
    const terms = l.deal === "For Sale"
      ? { title: "Sale terms", rows: [["Asking price", inrShort(l.price)], ["Maintenance", l.maint], ["Registration", "Buyer's account"]] }
      : { title: l.deal === "For Lease" ? "Lease terms" : "Rent terms", rows: [[l.deal === "For Lease" ? "Monthly lease" : "Monthly rent", money(l.rent)], ["Deposit", l.deposit], ["Lock-in", l.lockIn], ["Escalation", l.escalation]] };
    if (l.comSub === "shop") {
      return [
        { title: "Shop details", rows: [["Built-up area", size], ["Floor", l.floor], ["Hub type", l.hub], ["Frontage", l.frontageFt + " ft, shutter"], ["Washrooms", l.washrooms], ["Parking", l.parking]] },
        { title: "Facilities & utilities", rows: [["Facilities", l.facilities], ["Utilities", l.utilities], ["Power", l.power]] },
        { title: "Suitable uses", broker: true, rows: [["As described by the broker", l.uses]] },
        terms
      ];
    }
    if (l.comSub === "office") {
      return [
        { title: "Office details", rows: [["Built-up area", size], ["Floor", l.floor + " of " + l.ofFloors], ["Office seats", String(l.seats)], ["Cabins", String(l.cabins)], ["Meeting rooms", String(l.meeting)], ["Washrooms", l.washrooms], ["Parking", l.parking]] },
        { title: "Power & availability", rows: [["Power", l.power], ["Backup", l.backup], ["Availability", l.available]] },
        terms
      ];
    }
    if (l.comSub === "building") {
      return [
        { title: "Building details", rows: [["Built-up area", size], ["Number of floors", String(l.floors)], ["Parking", l.parking], ["Washrooms", l.washrooms], ["Availability", l.available]] },
        { title: "Facilities & utilities", rows: [["Facilities", l.facilities], ["Utilities", l.utilities]] },
        { title: "Income & lease", broker: true, rows: [["Occupancy", l.letFloors + " of " + l.floors + " floors let"], ["Current income", money(l.income) + " / month"], ["Expected yield", l.yield + "% a year"], ["Lease duration", l.leaseYears + " years"], ["Escalation", l.escalation]] },
        terms
      ];
    }
    if (l.comSub === "warehouse") {
      return [
        { title: "Warehouse details", rows: [["Area", size], ["Clear height", l.clearHt + " ft"], ["Loading bays", String(l.bays)], ["Flooring", l.flooring], ["Truck access", l.access], ["Loading yard", l.yard]] },
        { title: "Power & availability", rows: [["Power", l.power], ["Availability", l.available]] },
        terms
      ];
    }
    if (l.comSub === "land") {
      return [
        { title: "Land details", rows: [["Land area", size], ["Frontage", l.frontageFt + " ft" + (l.frontage ? " on the main road" : "")], ["Access", l.access], ["Shape", l.shape]] },
        { title: "Zoning & ownership", broker: true, rows: [["Zoning", l.zoning], ["Ownership", l.ownership], ["Suitable uses", l.uses]] },
        { title: "Utilities", rows: [["Power", l.power], ["Water", l.water]] },
        terms
      ];
    }
    // unrecognised subtype: generic supported facts only, nothing inferred
    return [
      { title: "Property details", rows: [["Built-up area", size], ["Floor", l.floor], ["Availability", l.available]] },
      terms
    ];
  }

  // ---- deterministic build -------------------------------------------------
  function build(areas) {
    let seed = 20260904;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const out = [];
    areas.forEach((a) => {
      const spec = SPEC[a.key];
      if (!spec) return;
      spec.forEach((sub, i) => {
        const deal = pick(DEALS[sub] || DEALS.unknown);
        const sqft = sub === "land" ? 4000 + Math.round(rnd() * 40) * 400
          : sub === "warehouse" ? 2400 + Math.round(rnd() * 30) * 200
            : sub === "building" ? 5000 + Math.round(rnd() * 20) * 400
              : sub === "office" ? 700 + Math.round(rnd() * 30) * 100
                : 380 + Math.round(rnd() * 20) * 60;
        const rate = sub === "land" ? 9000 : sub === "warehouse" ? 3200 : sub === "building" ? 7800 : sub === "office" ? 11000 : 14000;
        const price = Math.round((sqft * rate * (0.85 + rnd() * 0.4)) / 100000) * 100000;
        const rent = Math.round((sqft * (sub === "warehouse" ? 28 : sub === "land" ? 12 : sub === "shop" ? 62 : 55) * (0.85 + rnd() * 0.35)) / 1000) * 1000;
        const floorIdx = sub === "shop" ? (rnd() > 0.35 ? 0 : 1) : Math.floor(rnd() * 5);
        const l = {
          kind: "commercial", comSub: sub, deal,
          id: "com-" + a.key + "-" + i, areaKey: a.key, area: a.name,
          locality: a.name + (i % 3 === 0 ? " Main Road" : i % 3 === 1 ? " Market Road" : " Industrial Layout"),
          lat: a.lat + (rnd() - 0.5) * 0.016, lon: a.lon + (rnd() - 0.5) * 0.018,
          price, rent, forRent: deal !== "For Sale",
          sqft, beds: 0, baths: 0, propType: label(sub),
          image: IMG[sub] || IMG.unknown,
          trustTier: rnd() > 0.6 ? "verified" : rnd() > 0.35 ? "trusted" : "listed",
          ready: true, tag: null,
          floor: FLOORS[floorIdx], ofFloors: 3 + Math.floor(rnd() * 5),
          hub: pick(HUBS), seats: 8 + Math.round(rnd() * 10) * 4, cabins: 1 + Math.floor(rnd() * 4), meeting: 1 + Math.floor(rnd() * 3),
          floors: 2 + Math.floor(rnd() * 3), clearHt: 16 + Math.round(rnd() * 4) * 2, bays: 1 + Math.floor(rnd() * 3),
          frontageFt: 18 + Math.round(rnd() * 10) * 4, frontage: rnd() > 0.4,
          washrooms: 1 + Math.floor(rnd() * 4) + (rnd() > 0.5 ? " private" : " shared"),
          parking: sub === "shop" ? (rnd() > 0.5 ? "Public, on-street" : "2 private") : (1 + Math.floor(rnd() * 5)) + (rnd() > 0.5 ? " reserved" : " covered"),
          power: sub === "land" ? "Line at the plot boundary" : (5 + Math.round(rnd() * 8) * 5) + " kVA sanctioned",
          backup: rnd() > 0.5 ? "Full-floor DG" : "DG for common areas",
          facilities: pick(["Rolling shutter · Signage space", "Passenger lift · Power backup", "Lift · Security cabin", "Signage space · Loading bay"]),
          utilities: pick(["Metered power · Municipal water", "Municipal water · Borewell", "Borewell · 3-phase power"]),
          water: rnd() > 0.5 ? "Borewell on site" : "Municipal connection at the boundary",
          uses: pick(["Retail · Café · Clinic", "Showroom · Warehouse · Office block", "Retail · Services", "Office · Training centre"]),
          zoning: pick(["Commercial", "Mixed use", "Commercial (corner plot)"]),
          ownership: pick(["Single owner", "Two co-owners", "Family-held"]),
          shape: rnd() > 0.5 ? "Corner plot" : "Rectangular",
          access: sub === "warehouse" ? pick(["40 ft container", "Tempo / LCV", "20 ft container"]) : pick(["40 ft tar road", "30 ft tar road", "60 ft main road"]),
          yard: rnd() > 0.5 ? "Space for 2 trucks" : "Shutter-side loading",
          flooring: rnd() > 0.5 ? "Trimix concrete" : "Concrete",
          available: rnd() > 0.55 ? "Ready to occupy" : pick(["From 1 Oct 2026", "From 15 Nov 2026", "From 1 Dec 2026"]),
          maint: pick(["₹4/sq ft each month", "₹1,800 each month", "As per association"]),
          deposit: pick(["3 months", "6 months", "10 months"]),
          lockIn: pick(["11 months", "1 year", "2 years"]),
          escalation: pick(["5% each year", "5% every 2 years", "8% every 3 years"]),
          leaseYears: 3 + Math.floor(rnd() * 4)
        };
        l.letFloors = Math.max(1, l.floors - 1);
        l.income = Math.round((l.sqft * 42) / 1000) * 1000;
        l.yield = (1.2 + rnd() * 1.6).toFixed(1);
        // The area appears in the fact row, so the title must not repeat it.
        l.title = TITLE[sub] ? TITLE[sub](a.name) : "Commercial property in " + a.name;
        l.facts = factsOf(l);
        l.exact = exactOf(l);
        // ~60% carry a coarse band anonymously; the rest show the sign-in gate
        l.band = rnd() > 0.4 ? bandOf(l) : null;
        l.coarse = a.name + ", " + (a.direction === "centre" ? "Central" : a.direction.charAt(0).toUpperCase() + a.direction.slice(1)) + " Bengaluru";
        l.summary = summaryOf(l);
        l.sections = sectionsOf(l);
        out.push(l);
      });
    });
    return out;
  }

  // ---- filtering: only reached for Commercial records or the Commercial family -
  // Buy shows sale stock; Rent shows rent and lease stock (Lease is a deal label,
  // not a third toggle). Bed and budget chips belong to the Residential family.
  function passes(l, f) {
    if (l.kind !== "commercial") return false;      // the Commercial family excludes residential
    if (f.family !== "Commercial") return false;    // Commercial stock is opt-in
    const subs = f.comSubs || [];
    if (subs.length && subs.indexOf(l.comSub) === -1) return false;
    if (f.purpose === "Rent" && l.deal === "For Sale") return false;
    if (f.purpose === "Buy" && l.deal !== "For Sale") return false;
    // Commercial budget — its own field, so it is independent of the Residential one
    // and of the subtype selection.
    if (f.comMaxPrice && (f.purpose === "Rent" ? l.rent : l.price) > f.comMaxPrice) return false;
    // Area — its own field, independent of budget, geography and subtype selection.
    if (f.comArea && l.sqft < f.comArea) return false;
    if (f.verified && l.trustTier !== "verified") return false;
    return true;
  }

  // "All commercial" is a family-local state: no subtype narrowing inside Commercial.
  const labels = (f) => (f.family === "Commercial"
    ? [(f.comSubs || []).length ? "Commercial" : "All commercial"].concat((f.comSubs || []).map(label))
    : []);

  // Trust language states only what the platform actually checks. Nothing here
  // implies verified ownership, approvals, zoning or legal clearance.
  const TIER_TEXT = {
    verified: "Broker identity verified",
    trusted: "Listing details reviewed",
    listed: "Broker-submitted listing"
  };
  const TIER_NOTE = {
    verified: "ReTrends has confirmed who the listing broker is. The property, its ownership and any approvals are not checked.",
    trusted: "A ReTrends reviewer has read this listing for completeness. Nothing about the property itself is checked.",
    listed: "Submitted by the broker and not yet reviewed."
  };

  window.EXP_COM = {
    TIER_TEXT, TIER_NOTE, tierText: (t) => TIER_TEXT[t] || TIER_TEXT.listed, tierNote: (t) => TIER_NOTE[t] || TIER_NOTE.listed,
    SUBTYPES, FALLBACK_LABEL, label, build, passes, labels,
    exactOf, bandOf,
    // the three price presentations, and the only place anonymity is decided
    priceText: (l, signedIn) => (signedIn ? l.exact : l.band ? l.band : null),
    isCom: (l) => !!l && l.kind === "commercial",
    subLabels: () => SUBTYPES.map((s) => s.label)
  };
})();

// ReTrends — Buyer-facing Area Intelligence (#1528): mock data model.
//
// SOURCE OF TRUTH: GET /api/trends/area-intelligence?city={citySlug}&areaKey={full pipe areaKey}
// This mock mirrors only BUYER-SAFE fields the merged API (#1527) returns.
//
// Hard rules baked into this shape (see HANDOFF.md):
//   • mostSearchedBudget may be null  -> render "Not enough data yet"
//   • avgListingQuality  may be null  -> render "Not enough data yet"
//   • values suppressed by k-anon are null, NEVER 0
//   • no demand_score, no raw demand counts, no broker/demand-gap language
//
// `value: null` is the ONLY way a metric is unavailable. We never fall back to 0.

// Buyer-safe confidence labels (the only three the API emits to buyers).
window.RT_CONFIDENCE = {
  enough:  "Enough data",
  limited: "Limited data",
  none:    "Not enough data yet",
};

// Shared area identity. areaKeyFull is the pipe-delimited key the API requires;
// the buyer route today only carries the short slug "malpe" (see areaKey caution).
const AREA = {
  area: "Malpe",
  city: "Udupi",
  citySlug: "udupi",
  context: "Malpe, Udupi district, Karnataka",
  areaSlug: "malpe",                              // what the buyer route has today
  areaKeyFull: "karnataka|udupi|udupi-taluk|malpe", // what the API actually needs
  summary:
    "A fishing town and beach destination on the Karnataka coast, about 5 km from Udupi town. " +
    "Buyers come here mainly for plots near the sea — to build a home or a holiday place. " +
    "Activity has been steady, especially for land under ₹50 lakh.",
  // Descriptive area character (static metadata, not derived metrics) — for the hero quick-facts.
  character: [
    { icon: "map-pin", text: "Coastal · beach town" },
    { icon: "route", text: "~5 km from Udupi town" },
    { icon: "building", text: "Mostly plots & low-rise homes" },
  ],
  // Nearby areas — navigation only, with a short character tag (no fabricated metrics).
  nearby: [
    { name: "Udupi town", tag: "town centre" },
    { name: "Manipal", tag: "student belt" },
    { name: "Kaup", tag: "coastal" },
    { name: "Brahmavar", tag: "town centre" },
  ],
  updated: "16 Jun 2026",
};

// ---- FULL DATA -------------------------------------------------------------
const FULL = {
  ...AREA,
  confidence: "enough",
  metrics: {
    activeListings:     { value: 31 },
    medianPrice:        { value: "₹55L" },
    mostSearchedBudget: { value: "Under ₹50L" },
    avgListingQuality:  { value: 74 },     // out of 100
    freshListings:      { value: 18 },
  },
  good: [
    "Plenty of live plots to choose from near the coast.",
    "The current median price suggests this is a mid-budget area.",
    "Listing details look reasonably complete, so comparing options should be easier.",
  ],
  check: [
    "Verified plots under ₹50L may move quickly.",
    "Some listings may show only an approximate location — confirm the exact spot before visiting.",
    "For land, check road access, water source, and distance from the coast.",
  ],
};

// ---- PARTIAL DATA (two metrics suppressed -> null) -------------------------
const PARTIAL = {
  ...AREA,
  confidence: "limited",
  metrics: {
    activeListings:     { value: 12 },
    medianPrice:        { value: "₹48L" },
    mostSearchedBudget: { value: null },   // not enough searches yet
    avgListingQuality:  { value: null },   // suppressed by k-anon
    freshListings:      { value: 4 },
  },
  good: [
    "A handful of plots are live near the coast right now.",
    "The current median price suggests this is a mid-budget area.",
  ],
  check: [
    "We don't yet have a reliable read on what most buyers here search for.",
    "Confirm location and key details directly with the lister before visiting.",
    "You can still view all live homes in this area below.",
  ],
};

// ---- LOW / LIMITED CONFIDENCE (values shown, flagged as rough) -------------
const LOW = {
  ...AREA,
  confidence: "limited",
  lowConfidence: true,   // metric cards add a "treat as a rough guide" helper
  metrics: {
    activeListings:     { value: 7 },
    medianPrice:        { value: "₹52L" },
    mostSearchedBudget: { value: "₹40L–₹60L" },
    avgListingQuality:  { value: 61 },
    freshListings:      { value: 3 },
  },
  good: [
    "There are a few live plots to look at near the coast.",
  ],
  check: [
    "Figures here are based on limited recent activity — treat them as a rough guide, not a firm picture.",
    "Confirm location, road access and water source before visiting.",
  ],
};

// ---- NO SNAPSHOT (no row for this area) ------------------------------------
const EMPTY = { ...AREA, confidence: "none", metrics: null };

// ---- States the mock can render --------------------------------------------
window.RT_BUYER_STATES = {
  full:    FULL,
  partial: PARTIAL,
  low:     LOW,
  empty:   EMPTY,
  error:   "error",     // handled as a special render path
  loading: "loading",   // handled as a special render path
};

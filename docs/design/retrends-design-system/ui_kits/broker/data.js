// ReTrends — Area Intelligence (selected-area workspace): data model.
// Reusable across city/area. Malpe (Udupi) carries the exact spec copy;
// every other area is generated from a short summary so the dashboard is
// clearly NOT hardcoded to one place. All numbers are stable per area.
//
// This page is the SELECTED-AREA workspace. It does not own the full
// Demand Gaps mechanics or the Listing Quality fix workflow — it only
// previews them and routes out. Keep data shapes lean accordingly.

// --- City + area taxonomy ---------------------------------------------------
window.RT_CITIES = [
  { key: "udupi", name: "Udupi" },
  { key: "bengaluru", name: "Bengaluru" },
  { key: "mumbai", name: "Mumbai" },
  { key: "gurugram", name: "Gurugram" },
  { key: "hyderabad", name: "Hyderabad" },
  { key: "pune", name: "Pune" },
];

window.RT_AREAS = {
  udupi:     [["malpe","Malpe"],["manipal","Manipal"],["brahmavar","Brahmavar"],["karkala","Karkala"]],
  bengaluru: [["whitefield","Whitefield"],["sarjapur-road","Sarjapur Road"],["electronic-city","Electronic City"],["hebbal","Hebbal"]],
  mumbai:    [["andheri-west","Andheri West"],["powai","Powai"],["thane","Thane"],["navi-mumbai","Navi Mumbai"]],
  gurugram:  [["sector-57","Sector 57"],["golf-course-road","Golf Course Road"],["sohna-road","Sohna Road"],["dwarka-expressway","Dwarka Expressway"]],
  hyderabad: [["gachibowli","Gachibowli"],["kondapur","Kondapur"],["hitec-city","Hitec City"],["kokapet","Kokapet"]],
  pune:      [["wakad","Wakad"],["hinjewadi","Hinjewadi"],["baner","Baner"],["kharadi","Kharadi"]],
};

// Short per-area summary — drives the generator.
// { demand: "top buyer need", action: "short broker action" }
window.RT_AREA_SUMMARY = {
  "udupi/malpe":      { demand: "Plots under ₹50L",        action: "Add verified plots under ₹50L" },
  "udupi/manipal":    { demand: "2BHK rentals",            action: "Add furnished listings" },
  "udupi/brahmavar":  { demand: "Plots under ₹40L",        action: "Verify plot locations" },
  "udupi/karkala":    { demand: "Agricultural land",       action: "Add road and water details" },
  "bengaluru/whitefield":      { demand: "3BHK apartments",     action: "Add ready-to-move 3BHKs" },
  "bengaluru/sarjapur-road":   { demand: "Plots & villas",      action: "Verify plot boundaries" },
  "bengaluru/electronic-city": { demand: "2BHK under ₹70L",     action: "Add budget 2BHKs" },
  "bengaluru/hebbal":          { demand: "3BHK near ORR",       action: "Add commute details" },
  "mumbai/andheri-west":  { demand: "2BHK rentals",        action: "Add furnished rentals" },
  "mumbai/powai":         { demand: "3BHK lake-facing",    action: "Upload fresh photos" },
  "mumbai/thane":         { demand: "2BHK under ₹1.2Cr",   action: "Add budget 2BHKs" },
  "mumbai/navi-mumbai":   { demand: "1BHK investment",     action: "Add rental-yield details" },
  "gurugram/sector-57":         { demand: "3BHK builder floors", action: "Add verified floors" },
  "gurugram/golf-course-road":  { demand: "Luxury 4BHK",        action: "Upload premium photos" },
  "gurugram/sohna-road":        { demand: "2BHK under ₹90L",    action: "Add new-launch units" },
  "gurugram/dwarka-expressway": { demand: "New-launch 3BHK",    action: "Add possession details" },
  "hyderabad/gachibowli": { demand: "3BHK gated",          action: "Add gated-community 3BHKs" },
  "hyderabad/kondapur":   { demand: "2BHK rentals",        action: "Add furnished rentals" },
  "hyderabad/hitec-city": { demand: "2BHK under ₹80L",     action: "Add budget 2BHKs" },
  "hyderabad/kokapet":    { demand: "Premium plots",       action: "Verify plot locations" },
  "pune/wakad":     { demand: "2BHK near IT parks",  action: "Add commute details" },
  "pune/hinjewadi": { demand: "1BHK investment",     action: "Add rental-yield details" },
  "pune/baner":     { demand: "3BHK premium",        action: "Upload fresh photos" },
  "pune/kharadi":   { demand: "2BHK rentals",        action: "Add furnished rentals" },
};

// --- Full, hand-written record for the opening example: Udupi / Malpe -------
const MALPE = {
  topNeed: "Plots under ₹50L",
  kpis: [
    { label: "Buyer searches in this area",     value: "41", helper: "ReTrends searches and filters for Malpe this week", confidence: "Enough data" },
    { label: "Enquiries on your area listings", value: "18", helper: "Calls, WhatsApp clicks and forms on your Malpe listings", confidence: "Enough data" },
    { label: "Your live listings",              value: "5",  helper: "Live Malpe listings on ReTrends", confidence: "Enough data" },
    { label: "Listings needing attention",      value: "3",  helper: "Missing location, photos or key details", confidence: "Limited data" },
    { label: "Top buyer need",                  value: "Plots under ₹50L", helper: "41 searches vs 5 matching listings", confidence: "Enough data", highlight: true },
  ],
  insight: {
    text: "Your strongest Malpe opportunity is lower-budget plots. Buyer searches are ahead of visible matching listings, and 3 of your current Malpe listings need location or photo fixes.",
    chips: ["Plots under ₹50L", "Limited matching supply", "3 listings need attention"],
    confidence: "Enough data",
    primary: "demand", // which workspace the single CTA routes to: "demand" | "quality"
  },
  // Area-specific demand PREVIEW only (3–4 rows). Full mechanics live in Demand Gaps.
  demand: [
    { need: "Plots under ₹50L",             searches: 41, matching: 5,  signal: "Searches ahead of supply", next: "Add verified plots under ₹50L" },
    { need: "Plots ₹50L–₹70L",              searches: 28, matching: 12, signal: "Supply appears balanced",   next: "Improve photos & location" },
    { need: "2BHK near schools",            searches: 18, matching: 7,  signal: "Some matching supply",      next: "Add school-distance details" },
    { need: "Agricultural land near Malpe", searches: 8,  matching: 3,  signal: "Limited data",             next: "Add road & water details" },
  ],
  // Compact listing-health SUMMARY only. Full fix workflow lives in Listing Quality.
  health: {
    needFixes: 3,
    commonIssue: "Missing location or photos",
    lowEnquiries: 2,
    previews: [
      { title: "Plot — Malpe, 8 cents",   note: "84 views · 0 enquiries · location not verified" },
      { title: "Plot — Survey No. 142",   note: "41 views · 1 enquiry · photos missing" },
    ],
  },
};

// --- Generator for every other area ----------------------------------------
function hash(str) { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }

function genArea(cityKey, areaKey, areaName) {
  const sum = window.RT_AREA_SUMMARY[cityKey + "/" + areaKey] || { demand: "2BHK homes", action: "Add verified listings" };
  const h = hash(cityKey + areaKey);
  const searches = 24 + (h % 40);          // 24–63
  const enquiries = 8 + (h % 18);          // 8–25
  const live = 3 + (h % 7);                // 3–9
  const fixes = 1 + (h % 4);               // 1–4
  const lowEnq = Math.max(1, fixes - 1);
  const matching = Math.max(3, live);
  const d = sum.demand;
  const lower = d.toLowerCase();
  return {
    topNeed: d,
    kpis: [
      { label: "Buyer searches in this area",     value: String(searches), helper: `ReTrends searches and filters for ${areaName} this week`, confidence: "Enough data" },
      { label: "Enquiries on your area listings", value: String(enquiries), helper: `Calls, WhatsApp clicks and forms on your ${areaName} listings`, confidence: "Enough data" },
      { label: "Your live listings",              value: String(live), helper: `Live ${areaName} listings on ReTrends`, confidence: live >= 4 ? "Enough data" : "Limited data" },
      { label: "Listings needing attention",      value: String(fixes), helper: "Missing location, photos or key details", confidence: "Limited data" },
      { label: "Top buyer need",                  value: d, helper: `${searches} searches vs ${matching} matching listings`, confidence: "Enough data", highlight: true },
    ],
    insight: {
      text: `Your strongest ${areaName} opportunity is ${lower}. Buyer searches are ahead of visible matching listings, and ${fixes} of your current ${areaName} listings need location or photo fixes.`,
      chips: [d, "Limited matching supply", `${fixes} listings need attention`],
      confidence: live >= 4 ? "Enough data" : "Limited data",
      primary: "demand",
    },
    demand: [
      { need: d,                       searches, matching, signal: "Searches ahead of supply", next: sum.action },
      { need: "Resale " + lower,       searches: Math.round(searches * 0.7), matching: live + 6, signal: "Supply appears balanced", next: "Improve photos & location" },
      { need: "Homes near schools",    searches: Math.round(searches * 0.45), matching: live + 2, signal: "Some matching supply", next: "Add school-distance details" },
      { need: "Premium " + lower,      searches: Math.round(searches * 0.2), matching: 3, signal: "Limited data", next: "Add more verified details" },
    ],
    health: {
      needFixes: fixes,
      commonIssue: "Missing location or photos",
      lowEnquiries: lowEnq,
      previews: [
        { title: `Listing 1 — ${areaName}`, note: `${60 + (h % 40)} views · 0 enquiries · location not verified` },
        { title: `Listing 2 — ${areaName}`, note: `${30 + (h % 25)} views · 1 enquiry · photos missing` },
      ],
    },
  };
}

// Resolve full insight data for a city/area pair.
window.RT_getInsights = function (cityKey, areaKey, areaName) {
  if (cityKey === "udupi" && areaKey === "malpe") return MALPE;
  return genArea(cityKey, areaKey, areaName);
};

window.RT_DATA_REFRESHED = "16 Jun 2026";

// ReTrends — Broker Area Insights: data model.
// Reusable across city/area. Malpe (Udupi) carries the exact spec copy;
// every other area is generated from a short summary so the dashboard is
// clearly NOT hardcoded to one place. All numbers are stable per area.

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

// Short per-area summary — drives the comparison strip + the generator.
// { demand: "highest buyer need", action: "short broker action" }
window.RT_AREA_SUMMARY = {
  "udupi/malpe":      { demand: "Plots under ₹50L",        action: "Add lower-budget verified plots" },
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
  supplyGap: "Plots under ₹50L",
  kpis: [
    { label: "Buyer searches for this area", value: "41", helper: "Searches and filters for Malpe this week", confidence: "Enough data" },
    { label: "Enquiries on your area listings", value: "18", helper: "Calls, WhatsApp clicks and forms on your Malpe listings", confidence: "Enough data" },
    { label: "Your live listings", value: "5", helper: "Matching Malpe listings", confidence: "Enough data" },
    { label: "Listings needing fixes", value: "3", helper: "Missing location, photos or key details", confidence: "Limited data" },
    { label: "Biggest supply gap", value: "Plots under ₹50L", helper: "41 searches, 5 matching listings", confidence: "Enough data", highlight: true },
  ],
  insight: {
    text: "Your best opportunity in Malpe is lower-budget plots. Add verified plots under ₹50L if available, and fix location or photo issues on 3 current listings.",
    chips: ["Plots under ₹50L", "Limited matching supply", "3 listings need fixes"],
    confidence: "Enough data",
  },
  demandSupply: [
    { need: "Plots under ₹50L",            searches: 41, matching: 5,  availability: "Limited options", action: "Add lower-budget verified plots" },
    { need: "Plots ₹50L–₹70L",             searches: 28, matching: 12, availability: "Some options",    action: "Improve photos and location accuracy" },
    { need: "2BHK near schools",           searches: 18, matching: 7,  availability: "Some options",    action: "Add school-distance details" },
    { need: "Agricultural land near Malpe", searches: 8,  matching: 3,  availability: "Limited data",    action: "Add road and water details" },
  ],
  listings: [
    { title: "Plot — Malpe, 8 cents", views: 84, enquiries: "0", signal: "Many views, no enquiries", issue: "No exact location",     action: "Verify location so buyers know where the plot is.", cta: "Verify location", icon: "map-pin", severity: "high" },
    { title: "Plot — Survey No. 142", views: 41, enquiries: "1", signal: "Low enquiry response",     issue: "Missing photos",        action: "Upload clear, recent photos.",                     cta: "Upload photos",   icon: "camera",  severity: "med" },
    { title: "2BHK near school",      views: 18, enquiries: "0", signal: "Not enough buyer activity yet", issue: "School distance missing", action: "Add school-distance details.",                 cta: "Add school details", icon: "pencil", severity: "muted" },
  ],
  actions: [
    { title: "Add lower-budget plots if available",   detail: "Plots under ₹50L are the biggest supply gap in Malpe.",                          cta: "Add listing",     icon: "plus",      link: "demand" },
    { title: "Verify location on 3 listings",         detail: "Listings with unclear location are less likely to convert views into enquiries.", cta: "Review listings", icon: "map-pin",   link: "listings" },
    { title: "Upload photos for 1 listing",           detail: "Clear, recent photos help buyers trust the listing.",                            cta: "Upload photos",   icon: "camera",    link: "listings" },
    { title: "Add school, road and access details",   detail: "These details help buyers decide faster.",                                       cta: "Add details",     icon: "file-check", link: "listings" },
  ],
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
  const d = sum.demand;
  const lower = d.toLowerCase();
  return {
    supplyGap: d,
    kpis: [
      { label: "Buyer searches for this area", value: String(searches), helper: `Searches and filters for ${areaName} this week`, confidence: "Enough data" },
      { label: "Enquiries on your area listings", value: String(enquiries), helper: `Calls, WhatsApp clicks and forms on your ${areaName} listings`, confidence: "Enough data" },
      { label: "Your live listings", value: String(live), helper: `Matching ${areaName} listings`, confidence: live >= 4 ? "Enough data" : "Limited data" },
      { label: "Listings needing fixes", value: String(fixes), helper: "Missing location, photos or key details", confidence: "Limited data" },
      { label: "Biggest supply gap", value: d, helper: `${searches} searches, ${Math.max(3, live)} matching listings`, confidence: "Enough data", highlight: true },
    ],
    insight: {
      text: `Your best opportunity in ${areaName} is ${lower}. Add verified ${lower} if available, and fix location or photo issues on ${fixes} current listings.`,
      chips: [d, "Limited matching supply", `${fixes} listings need fixes`],
      confidence: "Enough data",
    },
    demandSupply: [
      { need: d, searches, matching: Math.max(3, live), availability: "Limited options", action: sum.action },
      { need: "Resale " + lower, searches: Math.round(searches * 0.7), matching: live + 6, availability: "Some options", action: "Improve photos and location accuracy" },
      { need: "Homes near schools", searches: Math.round(searches * 0.45), matching: live + 2, availability: "Some options", action: "Add school-distance details" },
      { need: "Premium " + lower, searches: Math.round(searches * 0.2), matching: 3, availability: "Limited data", action: "Add more verified details" },
    ],
    listings: [
      { title: `Listing 1 — ${areaName}`, views: 60 + (h % 40), enquiries: "0", signal: "Many views, no enquiries", issue: "No exact location", action: "Verify location so buyers know where it is.", cta: "Verify location", icon: "map-pin", severity: "high" },
      { title: `Listing 2 — ${areaName}`, views: 30 + (h % 25), enquiries: "1", signal: "Low enquiry response", issue: "Missing photos", action: "Upload clear, recent photos.", cta: "Upload photos", icon: "camera", severity: "med" },
      { title: `Listing 3 — ${areaName}`, views: 12 + (h % 15), enquiries: "0", signal: "Not enough buyer activity yet", issue: "Key details missing", action: "Add the missing property details.", cta: "Add details", icon: "pencil", severity: "muted" },
    ],
    actions: [
      { title: `Add ${lower} if available`, detail: `${d} is the biggest supply gap in ${areaName}.`, cta: "Add listing", icon: "plus", link: "demand" },
      { title: `Verify location on ${fixes} listings`, detail: "Listings with unclear location are less likely to convert views into enquiries.", cta: "Review listings", icon: "map-pin", link: "listings" },
      { title: "Upload photos for 1 listing", detail: "Clear, recent photos help buyers trust the listing.", cta: "Upload photos", icon: "camera", link: "listings" },
      { title: "Add school, road and access details", detail: "These details help buyers decide faster.", cta: "Add details", icon: "file-check", link: "listings" },
    ],
  };
}

// Resolve full insight data for a city/area pair.
window.RT_getInsights = function (cityKey, areaKey, areaName) {
  if (cityKey === "udupi" && areaKey === "malpe") return MALPE;
  return genArea(cityKey, areaKey, areaName);
};

window.RT_DATA_REFRESHED = "16 Jun 2026";

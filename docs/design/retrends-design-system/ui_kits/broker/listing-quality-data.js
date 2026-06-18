// ReTrends — Broker Listing Quality data.
// A broker's own live listings, each with the fix worklist detail, a tailored
// action checklist, and a simple score breakdown. One fixed scenario (Udupi
// portfolio) — not a generator. Exposed on window for the page script.

window.RT_LQ_SUMMARY = [
  {
    icon: "star", tone: "caution",
    title: "Average listing quality", value: "72/100", helper: "Across your live listings",
    status: "Needs improvement", note: "80+ is good",
  },
  {
    icon: "alert-triangle", tone: "negative",
    title: "Urgent fixes", value: "6", helper: "Listings below 60",
    status: "Review first",
  },
  {
    icon: "pencil", tone: "caution",
    title: "Listings needing fixes", value: "18", helper: "Location, photos or key details missing",
    status: "Action needed",
  },
  {
    icon: "shield-check", tone: "positive",
    title: "Fully verified listings", value: "12", helper: "Location and trust details complete",
    status: "Good",
  },
];

// Inline insight strip shown under the summary cards (keeps the row to 4 cards).
window.RT_LQ_TOP_ISSUE = {
  label: "Most common issue",
  value: "Missing exact location",
  helper: "Affects 18 listings",
  cta: "Verify locations",
  href: "/broker/listing-quality?fix=location",
};

window.RT_LQ_FILTERS = [
  { key: "all",       label: "All" },
  { key: "below60",   label: "Below 60" },
  { key: "location",  label: "Missing location" },
  { key: "photos",    label: "Missing photos" },
  { key: "stale",     label: "Stale listings" },
  { key: "agri",      label: "Agri details missing" },
  { key: "price",     label: "Price review needed" },
  { key: "verified",  label: "Fully verified" },
];

// signal tone: "caution" = strong, actionable; "muted" = low data.
window.RT_LQ_LISTINGS = [
  {
    id: "malpe-plot",
    title: "Plot — Malpe, 8 cents",
    area: "Malpe", views: 84, enquiries: 0,
    signal: "Many views, no enquiries", signalTone: "caution",
    quality: 54,
    issue: "No exact location", action: "Verify location", actionIcon: "map-pin",
    tags: ["below60", "location"],
    statusBadge: "Needs fixes", statusTone: "caution",
    updated: "31 days ago",
    confidence: "Enough activity", confidenceTone: "positive",
    locationNote: "Approximate only",
    note: "Enough activity to prioritise fixes.",
    enquiryAlert: true, // strong signal -> show 0 with caution emphasis
    checklist: [
      { title: "Verify exact location", why: "Buyers often skip listings when the location is unclear.", cta: "Verify location", icon: "map-pin", priority: "High" },
      { title: "Upload fresh photos", why: "Clear photos help buyers trust the plot before contacting you.", cta: "Upload photos", icon: "camera", priority: "Medium" },
      { title: "Add road access details", why: "Road access is important for plot buyers.", cta: "Add details", icon: "route", priority: "Medium" },
      { title: "Review price against similar visible listings", why: "Buyers may compare this listing with similar plots nearby.", cta: "Review price", icon: "sliders-horizontal", priority: "Low" },
    ],
    score: [
      { label: "Location confidence", status: "Needs fix",  tone: "negative" },
      { label: "Photos",              status: "Needs improvement", tone: "caution" },
      { label: "Key details",         status: "Partial",     tone: "caution" },
      { label: "Freshness",           status: "Needs refresh", tone: "caution" },
      { label: "Verification",        status: "Incomplete",  tone: "caution" },
    ],
  },
  {
    id: "brahmavar-agri",
    title: "Agri land — Brahmavar, 1.5 acre",
    area: "Brahmavar", views: 112, enquiries: 2,
    signal: "Low enquiry response", signalTone: "caution",
    quality: 61,
    issue: "No photos uploaded", action: "Upload photos", actionIcon: "camera",
    tags: ["photos"],
    statusBadge: "Needs fixes", statusTone: "caution",
    updated: "12 days ago",
    confidence: "Enough activity", confidenceTone: "positive",
    locationNote: "Verified",
    note: "Plenty of views but few enquiries — photos are the most likely blocker.",
    enquiryAlert: false,
    checklist: [
      { title: "Upload fresh photos", why: "Listings with no photos are skipped most often by buyers.", cta: "Upload photos", icon: "camera", priority: "High" },
      { title: "Add water and soil details", why: "Agri buyers compare water access and soil type before enquiring.", cta: "Add agri details", icon: "building", priority: "Medium" },
      { title: "Confirm road access", why: "Access details reassure buyers the land is usable.", cta: "Add details", icon: "route", priority: "Low" },
    ],
    score: [
      { label: "Location confidence", status: "Good",        tone: "positive" },
      { label: "Photos",              status: "Needs fix",   tone: "negative" },
      { label: "Key details",         status: "Partial",     tone: "caution" },
      { label: "Freshness",           status: "Good",        tone: "positive" },
      { label: "Verification",        status: "Complete",    tone: "positive" },
    ],
  },
  {
    id: "manipal-2bhk",
    title: "2BHK flat — Manipal, near MIT",
    area: "Manipal", views: 67, enquiries: 1,
    signal: "Low enquiry response", signalTone: "caution",
    quality: 63,
    issue: "Not updated in 42 days", action: "Refresh listing", actionIcon: "calendar",
    tags: ["stale"],
    statusBadge: "Needs refresh", statusTone: "caution",
    updated: "42 days ago",
    confidence: "Enough activity", confidenceTone: "positive",
    locationNote: "Verified",
    note: "Stale listings drop in buyer trust. A refresh of price and photos usually helps.",
    enquiryAlert: false,
    checklist: [
      { title: "Refresh the listing", why: "Listings not updated recently look inactive to buyers.", cta: "Refresh listing", icon: "calendar", priority: "High" },
      { title: "Re-check the asking price", why: "Confirm the price is still in line with similar flats nearby.", cta: "Review price", icon: "sliders-horizontal", priority: "Medium" },
      { title: "Add recent photos", why: "Current photos reassure buyers the flat is available.", cta: "Upload photos", icon: "camera", priority: "Low" },
    ],
    score: [
      { label: "Location confidence", status: "Good",        tone: "positive" },
      { label: "Photos",              status: "Good",        tone: "positive" },
      { label: "Key details",         status: "Good",        tone: "positive" },
      { label: "Freshness",           status: "Needs refresh", tone: "negative" },
      { label: "Verification",        status: "Complete",    tone: "positive" },
    ],
  },
  {
    id: "udupi-commercial",
    title: "Commercial plot — Udupi town",
    area: "Udupi", views: 45, enquiries: 0,
    signal: "Not enough buyer activity yet", signalTone: "muted",
    quality: 58,
    issue: "Review price", action: "Review price", actionIcon: "sliders-horizontal",
    tags: ["below60", "price"],
    statusBadge: "Review price", statusTone: "caution",
    updated: "20 days ago",
    confidence: "Not enough activity yet", confidenceTone: "muted",
    locationNote: "Verified",
    note: "This listing does not have enough buyer activity yet. Improve the basics first: location, photos and key details.",
    enquiryAlert: false,
    checklist: [
      { title: "Review price against similar listings", why: "Buyers may compare this plot with similar commercial plots nearby.", cta: "Review price", icon: "sliders-horizontal", priority: "Medium" },
      { title: "Add more photos", why: "More photos build trust while buyer activity is still low.", cta: "Upload photos", icon: "camera", priority: "Medium" },
      { title: "Highlight frontage and approvals", why: "Commercial buyers look for frontage and usage approvals.", cta: "Add details", icon: "building", priority: "Low" },
    ],
    score: [
      { label: "Location confidence", status: "Good",        tone: "positive" },
      { label: "Photos",              status: "Partial",     tone: "caution" },
      { label: "Key details",         status: "Partial",     tone: "caution" },
      { label: "Freshness",           status: "Good",        tone: "positive" },
      { label: "Verification",        status: "Partial",     tone: "caution" },
    ],
  },
  {
    id: "karkala-coconut",
    title: "Coconut farm — Karkala",
    area: "Karkala", views: 39, enquiries: 1,
    signal: "Limited data", signalTone: "muted",
    quality: 59,
    issue: "Missing road and water details", action: "Add agri details", actionIcon: "building",
    tags: ["below60", "agri"],
    statusBadge: "Needs fixes", statusTone: "caution",
    updated: "26 days ago",
    confidence: "Not enough activity yet", confidenceTone: "muted",
    locationNote: "Approximate only",
    note: "Limited buyer activity so far. Completing key details is the safest first step.",
    enquiryAlert: false,
    checklist: [
      { title: "Add road and water details", why: "Agri buyers need water access and road details before enquiring.", cta: "Add agri details", icon: "building", priority: "High" },
      { title: "Verify exact location", why: "An approximate location lowers buyer trust in farm listings.", cta: "Verify location", icon: "map-pin", priority: "Medium" },
      { title: "Add photos of the land", why: "Photos of the trees and access help buyers picture the farm.", cta: "Upload photos", icon: "camera", priority: "Low" },
    ],
    score: [
      { label: "Location confidence", status: "Needs fix",   tone: "negative" },
      { label: "Photos",              status: "Partial",     tone: "caution" },
      { label: "Key details",         status: "Needs fix",   tone: "negative" },
      { label: "Freshness",           status: "Good",        tone: "positive" },
      { label: "Verification",        status: "Incomplete",  tone: "caution" },
    ],
  },
];

window.RT_LQ_QUICKFIXES = [
  { label: "Verify locations", icon: "map-pin", count: 18 },
  { label: "Upload missing photos", icon: "camera", count: 9 },
  { label: "Refresh stale listings", icon: "calendar", count: 6 },
  { label: "Add agri details", icon: "building", count: 4 },
];

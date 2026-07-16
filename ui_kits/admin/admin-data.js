// ReTrends Admin — City Launch mock data. No backend; all values are stubs.
//
// The Preview & Validate page reuses the REAL Discover map (window.DPMap) and its
// real data model (window.BLR_DATA from ../discover/src/data.js). The city being
// previewed is that dataset presented as a not-yet-live sandbox revision. This
// file only defines the guided review path + the simulated first listing.

// ---- Guided review path through the real Discover hierarchy ----
// City → Region → Area group → Area → Simulated listing. The simulated listing is
// placed inside the chosen area's geometry (Hebbal centroid), never a random point.
window.RTA_PREVIEW_PATH = {
  regionId: "north", groupId: "airport-belt", areaId: "hebbal",
  reviewLine: ["North", "Airport Belt", "Hebbal", "Simulated listing"],
  sim: {
    id: "sim-hebbal", title: "Simulated first listing", locality: "Hebbal Kempapura",
    area: "Hebbal", areaId: "hebbal", group: "airport-belt", region: "north",
    price: 15000000, beds: 3, baths: 2, sqft: 1500, propType: "Apartment",
    trustTier: "verified", tag: "Simulated listing", simulated: true,
    image: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=720&h=480&fit=crop",
    lat: 13.0362, lon: 77.5975,
  },
};

// ---- The default preparation steps (formerly "pipeline") ----
window.RTA_PREP_STEPS = [
  { key: "candidate", name: "Generate candidate geography", meta: "raw candidate shapes" },
  { key: "canonical", name: "Build canonical areas", meta: "resolve areas" },
  { key: "regions", name: "Generate regions", meta: "cluster areas into regions" },
  { key: "groups", name: "Build area groups", meta: "group areas within regions" },
  { key: "projections", name: "Generate presentation projections", meta: "camera fit · labels · clustering" },
  { key: "ready", name: "Ready for preview", meta: "revision available in a sandbox" },
];

// ---- Simple, reversible validation checklist (the operator checks these manually) ----
window.RTA_VALIDATION = [
  { key: "landing", label: "Landing", note: "Macro-region bubbles fit the whole city." },
  { key: "regions", label: "Regions", note: "Regions read correctly and drill in." },
  { key: "areaGroups", label: "Area Groups", note: "Area groups resolve inside a region." },
  { key: "areas", label: "Areas", note: "Individual areas are visible and legible." },
  { key: "listing", label: "Listing", note: "The simulated listing shows a pin and card." },
];

// ---- Cities in the launch queue ----
window.RTA_CITIES = [
  {
    id: "bengaluru", name: "Bengaluru", region: "KA · metro", status: "ready-preview",
    geoPct: 100, rev: 7, preview: "ready",
    validation: { landing: false, regions: false, areaGroups: false, areas: false, listing: false },
    prep: { state: "done", current: 6, failedAt: null },
  },
  {
    id: "karwar", name: "Karwar", region: "KA · coastal", status: "preparing",
    geoPct: 64, rev: 8, preview: null,
    validation: { landing: false, regions: false, areaGroups: false, areas: false, listing: false },
    prep: { state: "running", current: 5, failedAt: null, startedAt: "14:02" },
  },
  {
    id: "hassan", name: "Hassan", region: "KA · inland", status: "not-started",
    geoPct: 0, rev: null, preview: null,
    validation: { landing: false, regions: false, areaGroups: false, areas: false, listing: false },
    prep: { state: "none", current: 0, failedAt: null },
  },
  {
    id: "kundapura", name: "Kundapura", region: "KA · coastal", status: "ready-launch",
    geoPct: 100, rev: 3, preview: "validated",
    validation: { landing: true, regions: true, areaGroups: true, areas: true, listing: true },
    prep: { state: "done", current: 6, failedAt: null },
  },
  {
    id: "chikkamagaluru", name: "Chikkamagaluru", region: "KA · hill", status: "failed",
    geoPct: 40, rev: 2, preview: null,
    validation: { landing: false, regions: false, areaGroups: false, areas: false, listing: false },
    prep: { state: "failed", current: 3, failedAt: 2, error: "3 areas unassigned to any region" },
  },
];

// Status → badge tone + label (single source of truth for the whole wizard).
window.RTA_STATUS = {
  "not-started": { label: "Not started", tone: "neutral", dot: "var(--grey-400)" },
  "preparing": { label: "Preparing city", tone: "caution", dot: "var(--ochre-600)" },
  "ready-preview": { label: "Ready for preview", tone: "trusted", dot: "var(--navy-700)" },
  "ready-launch": { label: "Validated · ready to launch", tone: "verified", dot: "var(--evergreen-600)" },
  "failed": { label: "Preparation failed", tone: "negative", dot: "var(--brick-600)" },
};

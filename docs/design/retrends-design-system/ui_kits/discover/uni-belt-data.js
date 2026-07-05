// Udupi Property Tracker — AREA-FIRST › University Belt drill-down mock data.
// This is the step AFTER a visitor picked the "University Belt" neighbourhood
// group: choose a LOCALITY inside it before seeing listings.
//
// DATA HONESTY (counts are real records, never invented):
//   group.areas      === localities.length
//   group.properties === sum of localities[].properties
//   Manipal carries all 8 live properties; Katapadi is a real locality with 0
//   verified listings yet — shown muted, never as a broken/error state.
// Buy / Rent is wording-only (same inventory). No agricultural land here —
// area-first is residential/built property only.

window.UPT_UNIBELT = {
  city: { name: "Udupi", lat: 13.3600, lon: 74.7740 },

  group: {
    id: "university-belt",
    name: "University Belt",
    description: "Academic and student housing around Manipal, with strong rental demand and walk-to-campus flats.",
    cue: "Central Udupi",
    areas: 2,
    properties: 8,
    // soft context highlight drawn on the map (subtle, not a hard region)
    center: { lat: 13.3610, lon: 74.7755 }, radiusM: 2600,
  },

  // Localities INSIDE University Belt — the choice on this screen.
  localities: [
    {
      id: "manipal", name: "Manipal", properties: 8,
      blurb: "Academic hub with apartments and student-focused rentals.",
      cue: "Walk to campus", lat: 13.3520, lon: 74.7855,
    },
    {
      id: "katapadi", name: "Katapadi", properties: 0,
      blurb: "No verified properties listed here yet.",
      cue: "NH-66 junction", lat: 13.3720, lon: 74.7635,
    },
  ],

  // Recognisable nearby places (NOT in this group) — faint, for orientation only.
  nearby: [
    { id: "udupi-city", name: "Udupi City", lat: 13.3409, lon: 74.7421 },
    { id: "udyavara", name: "Udyavara", lat: 13.3020, lon: 74.7430 },
    { id: "brahmavar", name: "Brahmavar", lat: 13.4150, lon: 74.7480 },
  ],
};

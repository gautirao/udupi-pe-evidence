// Udupi Property Tracker — Agricultural-land discovery (E towards Manipal) mock data.
// This is the GROUPED AGRICULTURAL REGION RESULT state, after the user picked the
// E / Manipal direction at "Up to 100 km". Coastal-to-Western-Ghats Karnataka context.
//
// DATA HONESTY — nothing here is invented beyond what the current screen shows:
//   • The two groups (Agumbe, Manipal) with their acres + property counts are the
//     real records from the current page.
//   • Totals are simple roll-ups of those two rows (4 properties, 116.28 acres,
//     2 groups) — derived, never fabricated.
//   • "Showing 24 properties" is the map's all-types count, kept as-is.
//   • The region polygon is the existing E-towards-Manipal boundary; coordinates
//     are approximate real places so Leaflet reads as authentic.
//   • No price, photos, owner, soil, water, crop or road data is introduced.

window.AGRI_DATA = {
  city: { name: "Udupi", lat: 13.34119, lon: 74.74205 },

  // The selected direction/region the user chose before this state.
  region: {
    direction: "E",
    label: "E towards Manipal",
    maxKm: 100,
    // Existing region boundary — an eastward wedge from Udupi toward the Ghats.
    polygon: [
      [13.372, 74.728],
      [13.628, 75.292],
      [13.092, 75.214],
    ],
    bounds: [[13.05, 74.70], [13.66, 75.34]],
  },

  // Distance chips. The user is currently on "Up to 100 km".
  distances: [
    { id: "d10", label: "Within 10 km", km: 10 },
    { id: "d25", label: "Up to 25 km", km: 25 },
    { id: "d50", label: "Up to 50 km", km: 50 },
    { id: "d100", label: "Up to 100 km", km: 100 },
  ],
  activeDistance: "d100",

  // Agricultural property groups in this region (the right-panel rows + map clusters).
  groups: [
    {
      id: "agumbe",
      name: "Agumbe",
      acres: 70.85,
      properties: 2,
      lat: 13.5167,
      lon: 75.0917,
    },
    {
      id: "manipal",
      name: "Manipal",
      acres: 45.43,
      properties: 2,
      lat: 13.3525,
      lon: 74.7860,
    },
  ],

  // Map's overall in-view property count (all types) — unchanged from the live page.
  showingTotal: 24,
};

// Roll-ups (derived from the two visible groups — not new data).
window.AGRI_TOTALS = (function () {
  const g = window.AGRI_DATA.groups;
  return {
    properties: g.reduce((s, x) => s + x.properties, 0), // 4
    acres: g.reduce((s, x) => s + x.acres, 0),            // 116.28
    groups: g.length,                                     // 2
  };
})();

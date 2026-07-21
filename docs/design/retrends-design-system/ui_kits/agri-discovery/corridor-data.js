// Udupi Property Tracker — Agricultural-land discovery, CORRIDOR-SELECTION landing state.
// This is the guided landing/selection step BEFORE a corridor is chosen. The user is in
// the "Agricultural land" journey and must pick one of four directional corridors.
//
// DATA HONESTY — nothing here is invented beyond what the current live screen shows:
//   • The four corridors (N/E/S/W towards Brahmavar/Manipal/Padubidri/Malpe, each
//     "Up to 100 km") are exactly the four options already on the page.
//   • "Showing 24 properties" is the map's all-types count, kept verbatim.
//   • Town coordinates are approximate real places (Udupi & neighbours) so Leaflet
//     reads as authentic — they are direction anchors, not new property data.
//   • No price, photos, owner, soil, water, crop, road, count-per-corridor or demand
//     data is introduced. Corridors carry only direction + "Up to 100 km" radius.

window.CORRIDOR_DATA = {
  city: { name: "Udupi", lat: 13.34119, lon: 74.74205 },

  // The four directional corridors — the exact four options on the live page.
  // dir = cardinal letter · town = the named anchor · maxKm = "Up to 100 km".
  corridors: [
    { id: "n", dir: "N", bearing: "North", name: "N towards Brahmavar", town: "Brahmavar", maxKm: 100, lat: 13.4279, lon: 74.7466 },
    { id: "e", dir: "E", bearing: "East",  name: "E towards Manipal",   town: "Manipal",   maxKm: 100, lat: 13.3525, lon: 74.7860 },
    { id: "s", dir: "S", bearing: "South", name: "S towards Padubidri", town: "Padubidri", maxKm: 100, lat: 13.1486, lon: 74.7700 },
    { id: "w", dir: "W", bearing: "West",  name: "W towards Malpe",     town: "Malpe",     maxKm: 100, lat: 13.3494, lon: 74.7050 },
  ],

  // Map's overall in-view property count (all types) — unchanged from the live page.
  showingTotal: 24,

  // Calm regional view that frames Udupi and its four neighbouring directions.
  bounds: [[13.115, 74.655], [13.470, 74.830]],
};

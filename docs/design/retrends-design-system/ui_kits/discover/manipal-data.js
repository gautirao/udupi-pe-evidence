// Udupi Property Tracker — AREA-FIRST › University Belt › Manipal RESULTS data.
// The final step of the area-first journey: the visitor has chosen
// University Belt → Manipal and is now viewing the verified properties there.
//
// DATA HONESTY (counts are real records, never invented):
//   total === properties.length === 8   (matches the map footer + result count)
//   Buy / Rent is wording-only (same inventory). NO agricultural land here —
//   area-first is residential / built property only (apartments, villas, plots).
//   Some listings carry photos; some are verified-but-no-photo yet (premium
//   placeholder, never a broken grey card). Trust tier is a real signal.

window.UPT_MANIPAL = {
  city: { name: "Udupi" },
  group: { id: "university-belt", name: "University Belt" },
  locality: {
    id: "manipal",
    name: "Manipal",
    center: { lat: 13.3520, lon: 74.7855 },
    radiusM: 2050,
    blurb: "Academic hub around Manipal University — apartments, villas and plots with strong walk-to-campus rental demand.",
  },

  // The 8 verified properties shown in the list + on the map.
  // priceLabel is pre-formatted Indian currency; rentLabel is the Rent wording.
  // image: null => premium placeholder card (verified, photo coming soon).
  properties: [
    {
      id: "mp-1", title: "3 BHK near Manipal University", locality: "Eshwar Nagar",
      type: "Apartment", beds: 3, baths: 2, sqft: 1480,
      priceLabel: "\u20b91.35 Cr", rentLabel: "\u20b938,000/mo",
      status: "For sale", posted: "3 days ago", trustTier: "verified",
      image: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=720&h=480&fit=crop",
      lat: 13.3582, lon: 74.7831,
    },
    {
      id: "mp-2", title: "4 BHK villa, End Point Road", locality: "End Point Rd",
      type: "Villa", beds: 4, baths: 4, sqft: 2600,
      priceLabel: "\u20b92.65 Cr", rentLabel: "\u20b985,000/mo",
      status: "For sale", posted: "2 days ago", trustTier: "verified",
      image: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=720&h=480&fit=crop",
      lat: 13.3470, lon: 74.7928,
    },
    {
      id: "mp-3", title: "2 BHK garden flat, Eshwar Nagar", locality: "Eshwar Nagar",
      type: "Apartment", beds: 2, baths: 2, sqft: 1150,
      priceLabel: "\u20b989 L", rentLabel: "\u20b926,000/mo",
      status: "For sale", posted: "1 week ago", trustTier: "verified",
      image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=720&h=480&fit=crop",
      lat: 13.3601, lon: 74.7892,
    },
    {
      id: "mp-4", title: "2 BHK apartment, Tiger Circle", locality: "Tiger Circle",
      type: "Apartment", beds: 2, baths: 2, sqft: 1050,
      priceLabel: "\u20b972 L", rentLabel: "\u20b921,000/mo",
      status: "For sale", posted: "5 days ago", trustTier: "trusted",
      image: null,
      lat: 13.3512, lon: 74.7805,
    },
    {
      id: "mp-5", title: "Residential plot, End Point Road", locality: "End Point Rd",
      type: "Plot", beds: null, baths: null, sqft: 4800,
      priceLabel: "\u20b91.10 Cr", rentLabel: null,
      status: "For sale", posted: "1 month ago", trustTier: "verified",
      image: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=720&h=480&fit=crop",
      lat: 13.3445, lon: 74.7868,
    },
    {
      id: "mp-6", title: "3 BHK apartment, Tiger Circle", locality: "Tiger Circle",
      type: "Apartment", beds: 3, baths: 3, sqft: 1560,
      priceLabel: "\u20b91.05 Cr", rentLabel: "\u20b932,000/mo",
      status: "For sale", posted: "1 week ago", trustTier: "listed",
      image: null,
      lat: 13.3556, lon: 74.7935,
    },
    {
      id: "mp-7", title: "2 BHK flat, Udupi-Manipal Road", locality: "Udupi-Manipal Rd",
      type: "Apartment", beds: 2, baths: 2, sqft: 980,
      priceLabel: "\u20b968 L", rentLabel: "\u20b920,000/mo",
      status: "For sale", posted: "4 days ago", trustTier: "verified",
      image: "https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=720&h=480&fit=crop",
      lat: 13.3614, lon: 74.7842,
    },
    {
      id: "mp-8", title: "Premium villa plot, Manipal centre", locality: "Syndicate Circle",
      type: "Plot", beds: null, baths: null, sqft: 6200,
      priceLabel: "\u20b91.85 Cr", rentLabel: null,
      status: "For sale", posted: "3 weeks ago", trustTier: "trusted",
      image: "https://images.unsplash.com/photo-1416331108676-a22ccb276e35?w=720&h=480&fit=crop",
      lat: 13.3478, lon: 74.7795,
    },
  ],

  // Recognisable nearby places (outside Manipal) — faint orientation only.
  nearby: [
    { id: "parkala", name: "Parkala", lat: 13.3636, lon: 74.7998 },
    { id: "udupi-city", name: "Udupi City", lat: 13.3409, lon: 74.7470 },
    { id: "katapadi", name: "Katapadi", lat: 13.3720, lon: 74.7635 },
  ],
};

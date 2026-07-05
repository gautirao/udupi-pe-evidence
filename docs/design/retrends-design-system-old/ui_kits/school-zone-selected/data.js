// Udupi Property Tracker — School-first SELECTED ZONE state (University Belt).
// Focused mock data: one zone, its two areas (Manipal, Katapadi), the homes in
// each, plus the schools that anchor the zone. Coordinates are real-ish around
// Manipal so the Leaflet map reads as authentic. Prices in ₹.
window.UPTZ_DATA = {
  city: { name: "Udupi", lat: 13.3550, lon: 74.7790, zoom: 13 },

  // ---- The selected zone ----
  zone: {
    id: "university-belt",
    name: "University Belt",
    subtitle: "Academic and student housing",
    blurb:
      "The neighbourhoods around Manipal's universities — strong year-round rental demand, walk-to-campus apartments, and quieter family homes a short drive out. A reliable pick for parents near a school and for investors chasing student tenancy.",
    bestFor: ["Parents near a campus", "Student-let investors", "Walk-to-college living"],
    schools: 16,
    listings: 8,
    areasCount: 2,
    center: { lat: 13.3590, lon: 74.7700 },
    bounds: [[13.3430, 74.7430], [13.3760, 74.8010]],
  },

  // ---- Areas inside the zone ----
  areas: [
    {
      id: "manipal",
      name: "Manipal",
      blurb: "University core with student rentals and family homes within walking distance of campus.",
      schools: 13,
      listings: 8,
      center: { lat: 13.3520, lon: 74.7860 },
      bounds: [[13.3430, 74.7780], [13.3610, 74.8010]],
    },
    {
      id: "katapadi",
      name: "Katapadi",
      blurb: "Calmer residential pocket north of the campus belt — schools and value land, listings still emerging.",
      schools: 3,
      listings: 0,
      center: { lat: 13.3700, lon: 74.7520 },
      bounds: [[13.3620, 74.7430], [13.3760, 74.7640]],
    },
  ],

  // ---- Schools that anchor the zone (for "Popular schools" + zero-state list) ----
  schools: [
    { id: "s-mahe", name: "Manipal Academy of Higher Education", type: "University", area: "Manipal", students: "28,000+", lat: 13.3520, lon: 74.7860 },
    { id: "s-mit", name: "Manipal Institute of Technology", type: "University", area: "Manipal", students: "10,500+", lat: 13.3490, lon: 74.7930 },
    { id: "s-kmc", name: "Kasturba Medical College", type: "College", area: "Manipal", students: "3,200+", lat: 13.3548, lon: 74.7878 },
    { id: "s-tapmi", name: "T.A. Pai Management Institute", type: "B-school", area: "Manipal", students: "1,100+", lat: 13.3618, lon: 74.7905 },
    { id: "s-kat-jc", name: "Katapadi Junior College", type: "PU College", area: "Katapadi", students: "900+", lat: 13.3704, lon: 74.7515 },
    { id: "s-kat-vv", name: "Vidya Vikas Public School", type: "CBSE", area: "Katapadi", students: "1,400+", lat: 13.3690, lon: 74.7548 },
    { id: "s-kat-sm", name: "St. Mary's Higher Primary", type: "ICSE", area: "Katapadi", students: "650+", lat: 13.3722, lon: 74.7498 },
  ],

  // ---- Listings — all 8 sit in Manipal; Katapadi has none ----
  listings: [
    {
      id: "l1", title: "3 BHK near Manipal University", locality: "Eshwar Nagar", area: "Manipal",
      price: 13500000, beds: 3, baths: 2, sqft: 1480, propType: "Apartment", trustTier: "verified",
      image: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=720&h=480&fit=crop",
      walk: "6 min walk to campus", postedDays: 3, lat: 13.3505, lon: 74.7905,
    },
    {
      id: "l2", title: "1 BHK studio, Tiger Circle", locality: "Tiger Circle", area: "Manipal",
      price: 5200000, beds: 1, baths: 1, sqft: 720, propType: "Apartment", trustTier: "trusted",
      image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=720&h=480&fit=crop",
      walk: "Furnished · rental-ready", postedDays: 5, lat: 13.3530, lon: 74.7880,
    },
    {
      id: "l3", title: "4 BHK villa, End Point Road", locality: "End Point Rd", area: "Manipal",
      price: 26500000, beds: 4, baths: 4, sqft: 2600, propType: "Villa", trustTier: "verified",
      image: "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=720&h=480&fit=crop",
      walk: "Gated community", postedDays: 8, lat: 13.3470, lon: 74.7950,
    },
    {
      id: "l4", title: "2 BHK near MIT gate", locality: "Madhav Nagar", area: "Manipal",
      price: 7800000, beds: 2, baths: 2, sqft: 1080, propType: "Apartment", trustTier: "trusted",
      image: "https://images.unsplash.com/photo-1567496898669-ee935f5f647a?w=720&h=480&fit=crop",
      walk: "3 min to MIT gate", postedDays: 6, lat: 13.3496, lon: 74.7912,
    },
    {
      id: "l5", title: "3 BHK family flat, Eshwar Heights", locality: "Eshwar Nagar", area: "Manipal",
      price: 11200000, beds: 3, baths: 3, sqft: 1520, propType: "Apartment", trustTier: "listed",
      image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=720&h=480&fit=crop",
      walk: "Family-friendly block", postedDays: 12, lat: 13.3512, lon: 74.7890,
    },
    {
      id: "l6", title: "Studio, Syndicate Circle", locality: "Syndicate Circle", area: "Manipal",
      price: 4600000, beds: 1, baths: 1, sqft: 640, propType: "Studio", trustTier: "trusted",
      image: "https://images.unsplash.com/photo-1502672023488-70e25813eb80?w=720&h=480&fit=crop",
      walk: "Walk to lecture halls", postedDays: 4, lat: 13.3538, lon: 74.7858,
    },
    {
      id: "l7", title: "2 BHK, Kunjibettu Road", locality: "Kunjibettu Rd", area: "Manipal",
      price: 8500000, beds: 2, baths: 2, sqft: 1150, propType: "Apartment", trustTier: "verified",
      image: "https://images.unsplash.com/photo-1480074568708-e7b720bb3f09?w=720&h=480&fit=crop",
      walk: "Quiet residential lane", postedDays: 16, lat: 13.3560, lon: 74.7838,
    },
    {
      id: "l8", title: "5 BHK villa, Manipal Lake", locality: "End Point", area: "Manipal",
      price: 34000000, beds: 5, baths: 5, sqft: 3200, propType: "Villa", trustTier: "verified",
      image: "https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=720&h=480&fit=crop",
      walk: "Lake view · gated", postedDays: 9, lat: 13.3455, lon: 74.7935,
    },
  ],
};

// ReTrends Admin — Pending Approvals mock data. No backend; all values are stubs.
// Anchor "now" so relative ages ("2 days ago", "3 weeks ago") stay stable across renders.
window.PA_NOW = new Date("2026-08-28T10:00:00");

window.PA_PROPERTY_TYPES = {
  apartment: "Apartment", villa: "Villa", independent_house: "Independent House",
  plot_residential: "Residential Plot", commercial_shop: "Retail Shop",
  commercial_building: "Commercial Building", warehouse: "Warehouse",
  commercial_land: "Commercial Land", agricultural_land: "Agricultural Land",
};

// Flags never rely on red alone — red is reserved for Reject / genuine destructive
// actions. Every review flag here is "needs a human look", not "confirmed fraud".
window.PA_FLAG_META = {
  missing_info: { label: "Missing information", tone: "caution", icon: "file-check" },
  possible_duplicate: { label: "Possible duplicate", tone: "caution", icon: "layers" },
  suspicious_price: { label: "Suspicious price", tone: "caution", icon: "trending-up" },
  location_unverified: { label: "Location needs verification", tone: "caution", icon: "map-pin" },
  broker_unverified: { label: "Unverified broker", tone: "neutral", icon: "shield" },
};

window.PA_BROKERS = {
  sudarshan: { name: "Sudarshan Rao", verification: "verified", memberSince: "Mar 2023", totalSubmissions: 42, phone: "+91 98450 11234", email: "sudarshan.rao@psbrokers.in" },
  anitha: { name: "Anitha D'Souza", verification: "new", memberSince: "Aug 2026", totalSubmissions: 2, phone: "+91 90360 88712", email: "anitha.dsouza@psbrokers.in" },
  ganesh: { name: "Ganesh Kamath", verification: "verified", memberSince: "Jan 2022", totalSubmissions: 67, phone: "+91 94480 22015", email: "ganesh.kamath@psbrokers.in" },
  ramesh: { name: "Ramesh Shetty", verification: "verified", memberSince: "Jun 2024", totalSubmissions: 19, phone: "+91 99000 45521", email: "ramesh.shetty@psbrokers.in" },
  prakash: { name: "Prakash Naik", verification: "unverified", memberSince: "Feb 2025", totalSubmissions: 5, phone: "+91 93430 77890", email: "prakash.naik@psbrokers.in" },
  vikram: { name: "Vikram Hegde", verification: "new", memberSince: "Jul 2026", totalSubmissions: 1, phone: "+91 97400 65123", email: "vikram.hegde@psbrokers.in" },
};

const PHOTOS = [
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=480&h=320&fit=crop",
  "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=480&h=320&fit=crop",
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=480&h=320&fit=crop",
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=480&h=320&fit=crop",
  "https://images.unsplash.com/photo-1494526585095-c41746248156?w=480&h=320&fit=crop",
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=480&h=320&fit=crop",
  "https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=480&h=320&fit=crop",
];
const ago = (days, hours = 0) => new Date(window.PA_NOW - (days * 24 + hours) * 3600000).toISOString();
const photos = (n) => PHOTOS.slice(0, n);

window.PA_LISTINGS = [
  { id: "PS-24681", title: "3 BHK Apartment near Manipal University, Tiger Circle", propertyType: "apartment", locality: "Manipal", area: "1,450 sq ft", price: 6800000, submittedAt: ago(0, 3), broker: "sudarshan", flags: [], photos: photos(6), description: "Well-ventilated 3 BHK on the 4th floor, walking distance to Manipal University and Tiger Circle. South-facing, vaastu compliant, ready to move in.", amenities: ["Lift", "Power backup", "Covered parking", "Gated security"], address: "Tiger Circle Road, Manipal, Udupi District, Karnataka 576104", lat: 13.3492, lon: 74.786, locationConfidence: "high", contact: { name: "Sudarshan Rao", phone: "+91 98450 11234" } },
  { id: "PS-24680", title: "10 Cents Commercial Land on NH66, Near Manipal Lake", propertyType: "commercial_land", locality: "Manipal", area: "10 cents", price: 12000000, submittedAt: ago(0, 6), broker: "anitha", flags: ["broker_unverified"], photos: photos(3), description: "Highway-fronting commercial plot on NH66, high visibility, suited for showroom or fuel outlet.", amenities: ["Highway frontage", "Corner plot"], address: "NH66, Near Manipal Lake, Manipal, Karnataka 576104", lat: 13.353, lon: 74.789, locationConfidence: "medium", contact: { name: "Anitha D'Souza", phone: "+91 90360 88712" } },
  { id: "PS-24675", title: "1,000 sq ft Warehouse, Udupi Industrial Estate", propertyType: "warehouse", locality: "Udupi", area: "1,000 sq ft", price: 8000000, submittedAt: ago(1), broker: "ganesh", flags: ["missing_info"], photos: photos(1), description: "Single-unit warehouse with loading bay inside the Udupi Industrial Estate.", amenities: ["Loading bay", "3-phase power"], address: "Plot 14, Udupi Industrial Estate, Udupi, Karnataka 576101", lat: 13.3409, lon: 74.7421, locationConfidence: "high", contact: { name: "Ganesh Kamath", phone: "+91 94480 22015" }, missingFields: ["Floor plan", "Property tax receipt"] },
  { id: "PS-24672", title: "500 sq ft Retail Shop, Court Road Manipal", propertyType: "commercial_shop", locality: "Manipal", area: "500 sq ft", price: 5000000, submittedAt: ago(2), broker: "anitha", flags: ["broker_unverified", "suspicious_price"], photos: photos(4), description: "Ground-floor retail shop on Court Road with existing rolling shutter and signage frontage.", amenities: ["Rolling shutter", "Signage frontage"], address: "Court Road, Manipal, Karnataka 576104", lat: 13.3505, lon: 74.7889, locationConfidence: "high", contact: { name: "Anitha D'Souza", phone: "+91 90360 88712" }, priceNote: "42% above the median for Court Road retail shops this size." },
  { id: "PS-24671", title: "Independent Commercial Building, Kalsanka Manipal", propertyType: "commercial_building", locality: "Manipal", area: "4,200 sq ft", price: 9000000, submittedAt: ago(2), broker: "ramesh", flags: [], photos: photos(5), description: "Three-floor independent commercial building near Kalsanka junction, currently tenanted on the ground floor.", amenities: ["Lift", "Terrace", "Two-wheeler parking"], address: "Kalsanka Junction, Manipal, Karnataka 576104", lat: 13.3467, lon: 74.7842, locationConfidence: "high", contact: { name: "Ramesh Shetty", phone: "+91 99000 45521" } },
  { id: "PS-24669", title: "2 BHK Independent House, Kalyanpura, Udupi", propertyType: "independent_house", locality: "Kalyanpura", area: "1,800 sq ft", price: 4500000, submittedAt: ago(2, 6), broker: "sudarshan", flags: ["location_unverified"], photos: photos(5), description: "Standalone 2 BHK house with a small front yard in Kalyanpura, close to the bypass road.", amenities: ["Front yard", "Borewell"], address: "Kalyanpura Village, Udupi Taluk, Karnataka 576102", lat: 13.34, lon: 74.75, locationConfidence: "low", contact: { name: "Sudarshan Rao", phone: "+91 98450 11234" } },
  { id: "PS-24660", title: "Compact Office Space for Sale, Overseas Road, Manipal", propertyType: "commercial_shop", locality: "Manipal", area: "380 sq ft", price: 4500000, submittedAt: ago(4), broker: "prakash", flags: ["broker_unverified"], photos: photos(2), description: "Small ground-floor office unit facing Overseas Road, suited for a consultancy or agent office.", amenities: ["Attached washroom"], address: "Overseas Road, Manipal, Karnataka 576104", lat: 13.3486, lon: 74.7911, locationConfidence: "medium", contact: { name: "Prakash Naik", phone: "+91 93430 77890" } },
  { id: "PS-24658", title: "Furnished 2 BHK Apartment, Near KMC Greens, Manipal", propertyType: "apartment", locality: "Manipal", area: "1,120 sq ft", price: 5600000, submittedAt: ago(4, 4), broker: "ramesh", flags: [], photos: photos(7), description: "Fully furnished 2 BHK on the 2nd floor of KMC Greens, popular with visiting faculty and staff.", amenities: ["Furnished", "Lift", "Power backup", "Clubhouse"], address: "Near KMC Greens, Madhav Nagar, Manipal, Karnataka 576104", lat: 13.352, lon: 74.7823, locationConfidence: "high", contact: { name: "Ramesh Shetty", phone: "+91 99000 45521" } },
  { id: "PS-24631", title: "Sea-view Residential Plot, Malpe Beach Road, Udupi", propertyType: "plot_residential", locality: "Malpe", area: "2,400 sq ft", price: 7200000, submittedAt: ago(8), broker: "ganesh", flags: ["possible_duplicate"], photos: photos(3), description: "Residential plot with a partial sea view, five minutes from Malpe Beach Road.", amenities: ["Sea view", "Approach road"], address: "Malpe Beach Road, Udupi, Karnataka 576108", lat: 13.3499, lon: 74.7051, locationConfidence: "high", contact: { name: "Ganesh Kamath", phone: "+91 94480 22015" }, duplicateMatches: [{ id: "PS-24501", title: "Residential Plot, Malpe Beach Road, Udupi", similarity: 92 }] },
  { id: "PS-24629", title: "3 BHK Villa with Garden, Brahmavar", propertyType: "villa", locality: "Brahmavar", area: "2,600 sq ft", price: 9800000, submittedAt: ago(8, 5), broker: "prakash", flags: ["broker_unverified", "missing_info"], photos: [], description: "Independent villa with a private garden on the outskirts of Brahmavar town.", amenities: ["Private garden", "Two-car garage"], address: "Near Brahmavar Bus Stand, Brahmavar, Karnataka 576213", lat: 13.4167, lon: 74.7333, locationConfidence: "medium", contact: { name: "Prakash Naik", phone: "+91 93430 77890" }, missingFields: ["Photos", "Floor plan"], history: [{ ts: ago(6), actor: "admin:Divya", action: "Requested photos and a floor plan over WhatsApp." }] },
  { id: "PS-24590", title: "Agricultural Land, 2 Acres, Padubidri Village", propertyType: "agricultural_land", locality: "Padubidri", area: "2 acres", price: 2500000, submittedAt: ago(12), broker: "ganesh", flags: [], photos: photos(4), description: "Two acres of cultivable agricultural land with an existing borewell, Survey No. 114/1, Padubidri village.", amenities: ["Borewell", "Road access"], address: "Survey No. 114/1, Padubidri Village, Udupi Taluk, Karnataka 574203", lat: 13.1167, lon: 74.75, locationConfidence: "high", contact: { name: "Ganesh Kamath", phone: "+91 94480 22015" } },
  { id: "PS-24588", title: "Agricultural Land, 2 Acres, Padubidri Village (Survey No. 114/2)", propertyType: "agricultural_land", locality: "Padubidri", area: "2 acres", price: 2600000, submittedAt: ago(12, 3), broker: "vikram", flags: ["possible_duplicate", "broker_unverified"], photos: photos(2), description: "Adjacent two-acre agricultural parcel, Survey No. 114/2, Padubidri village.", amenities: ["Road access"], address: "Survey No. 114/2, Padubidri Village, Udupi Taluk, Karnataka 574203", lat: 13.1169, lon: 74.7503, locationConfidence: "medium", contact: { name: "Vikram Hegde", phone: "+91 97400 65123" }, duplicateMatches: [{ id: "PS-24590", title: "Agricultural Land, 2 Acres, Padubidri Village", similarity: 96 }] },
  { id: "PS-24512", title: "Commercial Land Fronting NH66, Kaup Junction", propertyType: "commercial_land", locality: "Kaup", area: "18 cents", price: 18000000, submittedAt: ago(21), broker: "ramesh", flags: ["suspicious_price"], photos: photos(3), description: "Highway-fronting commercial land at Kaup Junction, listed for outright sale.", amenities: ["Highway frontage"], address: "NH66, Kaup Junction, Udupi District, Karnataka 574106", lat: 13.2167, lon: 74.75, locationConfidence: "high", contact: { name: "Ramesh Shetty", phone: "+91 99000 45521" }, priceNote: "58% above comparable NH66 frontage sales in Kaup this year." },
  { id: "PS-24505", title: "1 BHK Studio Apartment, Student Housing near MIT Manipal", propertyType: "apartment", locality: "Manipal", area: "480 sq ft", price: 3200000, submittedAt: ago(21, 4), broker: "sudarshan", flags: [], photos: photos(6), description: "Compact studio apartment aimed at the student-housing market near MIT Manipal.", amenities: ["Lift", "Wi-Fi ready", "Common laundry"], address: "Student Housing Block C, Near MIT Manipal, Karnataka 576104", lat: 13.3557, lon: 74.7929, locationConfidence: "high", contact: { name: "Sudarshan Rao", phone: "+91 98450 11234" } },
  { id: "PS-24501", title: "Residential Plot, Malpe Beach Road, Udupi", propertyType: "plot_residential", locality: "Malpe", area: "2,400 sq ft", price: 6900000, submittedAt: ago(21, 8), broker: "prakash", flags: ["broker_unverified"], photos: photos(2), description: "Residential plot on Malpe Beach Road, five minutes from the beach.", amenities: ["Approach road"], address: "Malpe Beach Road, Udupi, Karnataka 576108", lat: 13.3497, lon: 74.705, locationConfidence: "medium", contact: { name: "Prakash Naik", phone: "+91 93430 77890" } },
  { id: "PS-24470", title: "Large Warehouse & Yard, Kalyanpura Industrial Layout", propertyType: "warehouse", locality: "Kalyanpura", area: "6,000 sq ft", price: 15000000, submittedAt: ago(30), broker: "vikram", flags: ["broker_unverified", "location_unverified"], photos: photos(3), description: "Large warehouse with an open storage yard in Kalyanpura Industrial Layout.", amenities: ["Open yard", "3-phase power", "Truck access"], address: "Plot 7, Kalyanpura Industrial Layout, Udupi Taluk, Karnataka 576102", lat: 13.3378, lon: 74.7466, locationConfidence: "low", contact: { name: "Vikram Hegde", phone: "+91 97400 65123" } },
].map((l) => ({ ...l, status: "pending", history: l.history || [{ ts: l.submittedAt, actor: "broker", action: "Submitted listing" }] }));

window.PA_formatPrice = (n) => {
  if (n >= 1e7) return "\u20B9" + (n / 1e7).toFixed(2).replace(/\.00$/, "") + " Cr";
  const l = (n / 1e5).toFixed(1).replace(/\.0$/, "");
  return "\u20B9" + l + " L";
};

window.PA_ageDays = (iso) => Math.floor((window.PA_NOW - new Date(iso)) / 86400000);

window.PA_formatAge = (iso) => {
  const d = window.PA_ageDays(iso);
  const hrs = (window.PA_NOW - new Date(iso)) / 3600000;
  if (hrs < 20) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return d + " days ago";
  if (d < 14) return "1 week ago";
  if (d < 21) return "2 weeks ago";
  if (d < 30) return "3 weeks ago";
  return Math.round(d / 30) + " month" + (Math.round(d / 30) > 1 ? "s" : "") + " ago";
};

window.PA_formatDateTime = (iso) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

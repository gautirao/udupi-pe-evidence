// ReTrends portal — mock data for the UI kit. Indian real-estate context.
window.RT_DATA = {
  cities: ["Bengaluru", "Mumbai", "Gurugram", "Hyderabad", "Pune"],
  properties: [
    {
      id: "p1", title: "3 BHK in Whitefield", locality: "Whitefield", city: "Bengaluru",
      image: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=700&h=460&fit=crop",
      trustTier: "verified", bedrooms: 3, bathrooms: 2, area: 1450, price: 14200000, postedDays: 4,
      highlights: ["Park-facing", "Modular kitchen", "Covered parking"],
    },
    {
      id: "p2", title: "2 BHK in Wakad", locality: "Wakad", city: "Pune",
      image: "https://images.unsplash.com/photo-1567496898669-ee935f5f647a?w=700&h=460&fit=crop",
      trustTier: "trusted", bedrooms: 2, bathrooms: 2, area: 1080, price: 9800000, postedDays: 11,
      highlights: ["IT-park proximity", "Gym", "Lift"],
    },
    {
      id: "p3", title: "4 BHK villa, Golf Course Ext.", locality: "Golf Course Extn. Rd", city: "Gurugram",
      image: "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?w=700&h=460&fit=crop",
      trustTier: "verified", bedrooms: 4, bathrooms: 4, area: 2400, price: 42500000, postedDays: 2,
      highlights: ["Gated community", "Clubhouse", "East-facing"],
    },
    {
      id: "p4", title: "2 BHK in Gachibowli", locality: "Gachibowli", city: "Hyderabad",
      image: "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=700&h=460&fit=crop",
      trustTier: "listed", bedrooms: 2, bathrooms: 2, area: 1240, price: 9500000, postedDays: 19,
      highlights: ["Financial District", "Clear title"],
    },
    {
      id: "p5", title: "1 BHK in Indiranagar", locality: "Indiranagar", city: "Bengaluru",
      image: "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=700&h=460&fit=crop",
      trustTier: "trusted", bedrooms: 1, bathrooms: 1, area: 720, price: 12500000, postedDays: 6,
      highlights: ["Metro 400m", "Furnished"],
    },
    {
      id: "p6", title: "3 BHK in Powai", locality: "Powai", city: "Mumbai",
      image: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=700&h=460&fit=crop",
      trustTier: "verified", bedrooms: 3, bathrooms: 3, area: 1380, price: 38500000, postedDays: 8,
      highlights: ["Lake-facing", "Power backup", "Covered parking"],
    },
  ],
  localities: [
    { name: "Koramangala", city: "Bengaluru", avgPrice: 16500000, count: 42, trend: "12.4%", tier: "Full data" },
    { name: "Powai", city: "Mumbai", avgPrice: 38500000, count: 88, trend: "9.1%", tier: "Full data" },
    { name: "Golf Course Extn.", city: "Gurugram", avgPrice: 42500000, count: 56, trend: "7.8%", tier: "Full data" },
    { name: "Kondapur", city: "Hyderabad", avgPrice: 9400000, count: 17, trend: "5.2%", tier: "Limited data" },
  ],
  areaStats: [
    { label: "Avg. price", value: "₹1.42", unit: "Cr", delta: "12.4%", hint: "vs last year" },
    { label: "Per sq.ft", value: "₹8,750", delta: "9.1%", hint: "median, 6 mo" },
    { label: "Active listings", value: "88", hint: "42 verified" },
    { label: "Days to sell", value: "37", delta: "-8%", hint: "faster than 2024" },
  ],
  priceSeries: [62, 64, 63, 67, 71, 70, 74, 78, 80, 83, 88, 92], // indexed price trend
};

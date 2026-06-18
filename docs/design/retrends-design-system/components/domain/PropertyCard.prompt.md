One-line: Property listing card — image with trust overlay, specs row, INR price (auto Cr/L), highlight chips.

```jsx
<PropertyCard property={{
  title: "3 BHK in Whitefield", locality: "Whitefield", city: "Bangalore",
  image: "https://…", trustTier: "verified",
  bedrooms: 3, bathrooms: 2, area: 1450, price: 14200000, postedDays: 4,
  highlights: ["Park-facing", "Modular kitchen", "Covered parking"]
}} onClick={goToListing} />
```

Price auto-formats to ₹ Cr / L in Geist Mono. `postedDays ≤ 7` (or `isNew`) shows a copper "New" flag. Composes TrustBadge + Icon. Size ~320–360px wide in a grid.

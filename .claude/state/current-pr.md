# Current PR Capsule

PR: #772
Title: feat(listing): add Listing → Trends deep link on listing cards and detail page

## Acceptance Criteria

- [ ] `PropertyCard` renders "View Area Trends" link when `showTrendsLink=true` AND `listing.areaKey` is non-empty; target: `/trends?city={city}&areaKey={encodeURIComponent(listing.areaKey)}`
- [ ] No link and no crash when `listing.areaKey` is null/undefined/empty or `showTrendsLink=false`
- [ ] `ListingDetail` "Locality Insights" section link updated from `/area-overview` to `/trends?city={city}&areaKey={encodeURIComponent(listing.areaKey)}`; section hidden when `areaKey` absent
- [ ] Both entry points land on Trends with the listing's area already selected
- [ ] No regression on existing listing card actions; no regression on other Listing Detail sections

## Key decisions
- City field: use `listing.city` (not URL city)
- Anonymous teaser `areaKey`: hide trends link when field absent (safe fallback)
- Broker-facing card instances: NOT changed (showTrendsLink=false is the default)

## Out of Scope
- Backend changes to compute areaKey
- Broker-facing card instances

## Touched Files Hint
- src/components/listing/PropertyCard.tsx — add showTrendsLink prop + conditional link
- src/components/listing/ListingDetail.tsx (or similar) — update /area-overview → /trends link

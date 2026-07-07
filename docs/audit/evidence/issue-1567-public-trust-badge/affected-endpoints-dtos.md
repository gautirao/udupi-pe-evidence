# Affected endpoints / DTOs — issue #1567

## In scope (public trust field: raw `trustTier` -> public `trustBadge`)
| DTO | Endpoint | Notes |
|---|---|---|
| `AreaListingCard` | `GET /api/discover/cities/{city}/listings` (`CityAreaListingsService`) | PRIMARY. `permitAll`/anon — the original raw-grade leak. Drives FE `PropertyCard` via `useDiscoverCityListings`. |
| `DiscoverListingResponse` | `GET /api/discover/listings` (`DiscoverListingsService.buildListing`) | Shared funnel; OpenSearch path inherits the projection. No FE render consumer today (hardened for consistency, OQ3). |

## Explicitly UNCHANGED (badge-free by contract — no trust field added)
| DTO | Endpoint | Confirmation (live, 2026-07-06) |
|---|---|---|
| `PublicSchoolRadiusListingCard` | `GET /api/discover/cities/{city}/school-radius-listings` | 9 items, NO `trustTier`, NO `trustBadge` (HTTP 200). |
| `AgriMapListingItem` | `GET /api/discover/agri-map-listings` | 2 items, NO `trustTier`, NO `trustBadge` (HTTP 200). |

## OpenSearch (unchanged)
`backend/.../discover/opensearch/**` — no edits. `OpenSearchHitMapper.toListing` inherits the projection via the shared `buildListing` funnel.

## Frontend consumers
- `src/components/discover/PropertyCard.tsx` — consumes `listing.trustBadge`; the old `TRUST_TIERS` letter map was deleted.
- `src/hooks/useDiscoverCityListings.ts` — `DiscoverCityListingItem.trustBadge` (was `trustTier`).
- `src/hooks/useDiscoverListings.ts` — `DiscoverListingItem.trustBadge` (was `trustTier`); dead-for-render (verified via find_references — set in mappers, never read for render).
- `src/pages/MapDiscovery.tsx` — anon group-results mapper consumes `l.trustBadge`; the authed dealer-sourced mapper sets `trustBadge:null` (dealer `/api/listings` contract is out of scope and still carries a raw letter; a public-safe value is not available there — see follow-up).

# Backend projection decision — issue #1567

## Projector (single choke point)
`backend/src/main/java/com/example/realestate/discover/TrustBadge.java`
`TrustBadge.publicBadge(String rawTier) -> "verified" | "trusted" | "listed" | null` — one allow-list switch, default null. This is the ONLY place the internal letter grade maps to a public word; the FE never does letter→word mapping.

## Applied at exactly two DTO-construction sites
1. `CityAreaListingsService.java:271-273` — `AreaListingCard` built with `TrustBadge.publicBadge(rs.getString("trust_tier"))` (this endpoint is `permitAll` / anon — the original leak).
2. `DiscoverListingsService.buildListing` (~:287) — the shared funnel that constructs `DiscoverListingResponse`. `OpenSearchHitMapper.toListing` routes through this SAME funnel, so the dormant OpenSearch path inherits the projection automatically.

## Why no OpenSearch file changes
`OpenSearchHitMapper` passes the raw `trustTier` INTO `buildListing`, never directly into the DTO. Because the projection happens inside `buildListing`, both the Postgres and OpenSearch paths are covered by construction — verified by security-reviewer. No file under `backend/.../discover/opensearch/**` was edited.

## Why no DB migration
Pure read-time output transform. `property_listings.trust_tier` column, internal trust scoring, and the OpenSearch index mapping are all untouched — internal scoring preserved; only the public projection changed.

## Field rename (not value-only)
Raw `trustTier` was REMOVED from both public DTOs and replaced by the distinct public field `trustBadge`. A distinct field + removal of the raw field prevents a future dev from silently repopulating a public DTO with a letter grade (stronger allow-list posture than reusing the field name).

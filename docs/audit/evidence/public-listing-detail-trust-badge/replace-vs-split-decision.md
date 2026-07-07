# #1786 — Replace-vs-Split decision

**Decision: SPLIT**, not replace. `ListingResponse` gained a new nullable `trustBadge` component
sitting alongside the existing `trustTier` component rather than repurposing/replacing `trustTier`
in place. Internal admin/owner responses (`toResponse`/`toResponseList`) continue to populate the
raw internal letter grade in `trustTier` exactly as before (unchanged behavior, unchanged tests at
`ListingResponseMapperTest` `toResponse_trustTier_propagatedFromEntity` /
`toResponse_trustTier_nullWhenEntityHasNoTier`), while public responses
(`toPublicResponse`/`toPublicResponseList`) null out `trustTier` and populate `trustBadge` with the
projected public-safe word via the single existing allow-listed projector,
`TrustBadge.publicBadge` (`backend/src/main/java/com/example/realestate/discover/TrustBadge.java`,
untouched). A `boolean publicProjection` flag threads through the private `build(...)` overload
chain in `ListingResponseMapper` to select which branch applies, keeping the split explicit at the
single point where the DTO is assembled rather than scattered across call sites.

`toPublicResponseList` (a batch method with no current caller) was **hardened, not deleted** —
it's wired to `publicProjection=true` so it stays public-safe by construction if/when a caller is
added later, matching the same guarantee as the single-listing `toPublicResponse` path.

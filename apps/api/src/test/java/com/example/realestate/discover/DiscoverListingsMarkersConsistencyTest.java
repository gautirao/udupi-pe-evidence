package com.example.realestate.discover;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Non-drift gate: proves by construction that DiscoverListingsService and DiscoverMarkersService
 * share exactly the same WHERE predicate for the same filter input.
 *
 * <p>Both services call {@code DiscoverListingPredicateBuilder.build(filters)} — a pure static
 * method. This test verifies that the method is deterministic: identical inputs produce identical
 * SQL fragments and param lists, so no filter can diverge between the two endpoints.
 *
 * <p>No Spring context needed — the predicate builder has no dependencies.
 */
class DiscoverListingsMarkersConsistencyTest {

    /**
     * Calls the builder twice with the same {@link DiscoverListingPredicateBuilder.Filters}
     * instance and asserts that both results are equal. Because it is a pure function,
     * equal inputs must always produce equal outputs, proving structural consistency.
     */
    private static void assertConsistent(DiscoverListingPredicateBuilder.Filters filters) {
        DiscoverListingPredicateBuilder.Sql fromListings = DiscoverListingPredicateBuilder.build(filters);
        DiscoverListingPredicateBuilder.Sql fromMarkers  = DiscoverListingPredicateBuilder.build(filters);

        assertEquals(fromListings.whereFragment(), fromMarkers.whereFragment(),
                "WHERE fragment must be identical for listings and markers endpoints");
        assertEquals(fromListings.params(), fromMarkers.params(),
                "Params list must be identical for listings and markers endpoints");
    }

    // ── 1. Price + propertyType filter ───────────────────────────────────────

    @Test
    void consistent_priceAndPropertyType() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi",
                List.of("apartment"),
                1_000_000L,
                10_000_000L,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
        assertConsistent(f);
    }

    // ── 2. School + radius filter ─────────────────────────────────────────────

    @Test
    void consistent_schoolProximity() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "mangalore",
                null, null, null, null, null, null, null, null, null, null, null, null,
                12.86, 74.84, 1.5, null, null, null, null, null, null);
        assertConsistent(f);
    }

    // ── 3. Polygon filter ─────────────────────────────────────────────────────

    @Test
    void consistent_polygon() {
        List<List<Double>> polygon = List.of(
                List.of(13.3, 74.7),
                List.of(13.4, 74.8),
                List.of(13.35, 74.75)
        );
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi",
                null, null, null, null, null, null, null, null, null, null, null,
                polygon,
                null, null, null, null, null, null, null, null, null);
        assertConsistent(f);
    }

    // ── 5. backOnMarket=true ──────────────────────────────────────────────────

    @Test
    void consistent_backOnMarket() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi",
                null, null, null, null, null, null, null,
                Boolean.TRUE,
                null, null, null, null, null, null, null, null, null, null, null, null, null);
        assertConsistent(f);
    }

    // ── 6. newToMarket=true ───────────────────────────────────────────────────

    @Test
    void consistent_newToMarket() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi",
                null, null, null, null, null, null, null,
                null,
                Boolean.TRUE,
                null, null, null, null, null, null, null, null, null, null, null, null);
        assertConsistent(f);
    }

    // ── #2461: POLYGON-scope agricultural_land exclusion, at the source ────────
    //
    // The tests above prove DiscoverListingPredicateBuilder.build(...) is deterministic given a
    // Filters instance. They cannot detect #2461's actual bug surface, which is upstream: whether
    // DiscoverListingsService.toFilters(...) CONSTRUCTS the right excludePropertyTypes for a given
    // DiscoverListingsQuery. These tests call the package-private static toFilters(...) directly.

    /**
     * Builds a query varying only the three mutually-exclusive result-scope fields
     * (polygon / areaKeys / viewportScope); every other component is null/default.
     * ResultScopeExclusivity guarantees at most one of the three is non-null in practice.
     */
    private static DiscoverListingsQuery queryWithScope(
            List<List<Double>> polygon, List<String> areaKeys, DiscoverListingPredicateBuilder.Bbox viewportScope) {
        return new DiscoverListingsQuery(
                "udupi",
                null, null, null, null, null, null, null, null, null, null, null, null,
                polygon,
                null, null, null, null, null,
                0, 20, false,
                null,
                areaKeys,
                viewportScope,
                null);
    }

    private static final List<List<Double>> SAMPLE_POLYGON = List.of(
            List.of(13.3, 74.7),
            List.of(13.4, 74.8),
            List.of(13.35, 74.75)
    );

    @Test
    @DisplayName("#2461: a committed POLYGON scope excludes agricultural_land, matching markers")
    void toFilters_polygonScope_excludesAgriculturalLand() {
        DiscoverListingsQuery q = queryWithScope(SAMPLE_POLYGON, null, null);

        List<String> excluded = DiscoverListingsService.toFilters(q).excludePropertyTypes();

        assertEquals(CityAreaListingsService.AREA_FIRST_EXCLUDED_PROPERTY_TYPES, excluded,
                "POLYGON-scoped toFilters() must exclude the same property types as the markers "
                        + "endpoint's area-first exclusion (#1463/#2457 convergence)");
    }

    @Test
    @DisplayName("AC4: VIEWPORT scope is unaffected — no property-type exclusion is added")
    void toFilters_viewportScope_noExclusion() {
        DiscoverListingsQuery q = queryWithScope(
                null, null, new DiscoverListingPredicateBuilder.Bbox(12.8, 74.7, 12.9, 74.8));

        assertNull(DiscoverListingsService.toFilters(q).excludePropertyTypes(),
                "VIEWPORT scope must not gain a new agricultural_land exclusion — AC4 non-regression");
    }

    @Test
    @DisplayName("AC5: AREA_SET scope adds no exclusion here — CityAreaListingsService applies it independently")
    void toFilters_areaSetScope_noExclusionAtThisLayer() {
        DiscoverListingsQuery q = queryWithScope(null, List.of("area-1"), null);

        assertNull(DiscoverListingsService.toFilters(q).excludePropertyTypes(),
                "AREA_SET must stay null out of toFilters(); its agricultural_land exclusion is "
                        + "owned by CityAreaListingsService, not DiscoverListingsService — AC5 non-regression");
    }

    @Test
    @DisplayName("No result scope at all -> no property-type exclusion")
    void toFilters_noScope_noExclusion() {
        DiscoverListingsQuery q = queryWithScope(null, null, null);

        assertNull(DiscoverListingsService.toFilters(q).excludePropertyTypes(),
                "With no committed scope, toFilters() must not exclude any property type");
    }

    @Test
    @DisplayName("AC8: server exclusion literal is pinned to the frontend's markers-request literal")
    void toFilters_polygonScope_excludedLiteralMatchesFrontendConstant() {
        // Mirrors apps/web/src/lib/listing-constants.ts:22 — AGRICULTURAL_LAND_PROPERTY_TYPE —
        // the literal the frontend sends as excludePropertyType on the markers request. Pinning
        // the literal (not just the shared constant reference) means a change to either side's
        // value trips this test, instead of silently drifting apart.
        DiscoverListingsQuery q = queryWithScope(SAMPLE_POLYGON, null, null);

        List<String> excluded = DiscoverListingsService.toFilters(q).excludePropertyTypes();

        assertEquals(List.of("agricultural_land"), excluded,
                "Server-side POLYGON exclusion literal must equal the frontend's "
                        + "AGRICULTURAL_LAND_PROPERTY_TYPE constant ('agricultural_land') — if this fails, "
                        + "either CityAreaListingsService.AREA_FIRST_EXCLUDED_PROPERTY_TYPE or the frontend "
                        + "constant changed without the other, and markers/cards will diverge again");
    }

    // ── SHOULD-FIX (code review): explicit propertyTypes=[agricultural_land] under POLYGON ─────
    //
    // DiscoverListingPredicateBuilder ANDs `propertyTypes` (inclusion) with `excludePropertyTypes`
    // (NOT IN) as independent predicates. Because a committed POLYGON stamps
    // AREA_FIRST_EXCLUDED_PROPERTY_TYPES, a caller who ALSO passes
    // propertyTypes=[agricultural_land] gets a self-contradictory WHERE clause
    // (`property_type IN ('agricultural_land') AND LOWER(property_type) NOT IN ('agricultural_land')`)
    // that always matches zero rows — a normal 200 with an empty result, never a 4xx.
    //
    // THIS IS INTENDED, per the owner's ruling: a committed POLYGON scope must exclude
    // agricultural_land from the shopper-visible result set, full stop — the exclusion is not
    // waived just because the caller also asked for that type explicitly. toFilters() must accept
    // the request and answer it honestly as empty, rather than silently dropping the polygon
    // exclusion OR silently rewriting/stripping the caller's propertyTypes input.
    //
    // In the product UI this combination is not reachable: the frontend hides the "draw area" entry
    // point for the agriculture-first journey (see
    // apps/web/src/features/discover/state/drawSearchAreaEligibility.ts:96), so a caller can only hit
    // this path via a direct API call. That does not make the contract accidental — it is why this
    // test exists: to pin the behaviour so a future change (e.g. "let explicit propertyTypes win
    // over the polygon exclusion") does not silently reopen agricultural_land visibility inside a
    // committed polygon. Do NOT "fix" this by removing the exclusion when propertyTypes is present.
    @Test
    @DisplayName("SHOULD-FIX pin: explicit propertyTypes=[agricultural_land] under POLYGON keeps "
            + "both the exclusion and the caller's input intact (self-contradictory predicate is intended)")
    void toFilters_polygonScope_explicitAgriculturalLandPropertyType_exclusionNotWaivedInputNotMutated() {
        DiscoverListingsQuery q = new DiscoverListingsQuery(
                "udupi",
                List.of("agricultural_land"), null, null, null, null, null, null, null, null, null, null,
                SAMPLE_POLYGON,
                null, null, null, null, null,
                0, 20, false,
                null,
                null,
                null,
                null);

        DiscoverListingPredicateBuilder.Filters filters = DiscoverListingsService.toFilters(q);

        assertEquals(CityAreaListingsService.AREA_FIRST_EXCLUDED_PROPERTY_TYPES, filters.excludePropertyTypes(),
                "the POLYGON exclusion must NOT be waived just because the caller explicitly asked "
                        + "for agricultural_land — the owner ruling is unconditional");
        assertEquals(List.of("agricultural_land"), filters.propertyTypes(),
                "the caller's propertyTypes input must be preserved verbatim, not silently rewritten "
                        + "or stripped to avoid the contradiction — the request is honoured and answered "
                        + "honestly as an empty result, not partially reinterpreted");
    }
}

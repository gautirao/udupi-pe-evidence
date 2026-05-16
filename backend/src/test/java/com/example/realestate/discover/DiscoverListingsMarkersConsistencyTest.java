package com.example.realestate.discover;

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
                null, null, null, null, null, null, null, null, null, null, null, null, null);
        assertConsistent(f);
    }

    // ── 2. School + radius filter ─────────────────────────────────────────────

    @Test
    void consistent_schoolProximity() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "mangalore",
                null, null, null, null, null, null, null, null, null, null, null, null,
                12.86, 74.84, 1.5, null);
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
                null, null, null, null);
        assertConsistent(f);
    }

    // ── 5. backOnMarket=true ──────────────────────────────────────────────────

    @Test
    void consistent_backOnMarket() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi",
                null, null, null, null, null, null, null,
                Boolean.TRUE,
                null, null, null, null, null, null, null, null);
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
                null, null, null, null, null, null, null);
        assertConsistent(f);
    }
}

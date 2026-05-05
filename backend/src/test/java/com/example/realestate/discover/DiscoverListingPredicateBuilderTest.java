package com.example.realestate.discover;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Pure unit tests for DiscoverListingPredicateBuilder — no Spring context.
 * Validates that the correct SQL fragments and params are produced for each filter combination.
 */
class DiscoverListingPredicateBuilderTest {

    private static DiscoverListingPredicateBuilder.Filters minimal(String city) {
        return new DiscoverListingPredicateBuilder.Filters(
                city, null, null, null, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null, null);
    }

    // ── 1. Empty/default filters → base predicate + city only ───────────────

    @Test
    void build_minimalFilters_containsBasePredicateAndCity() {
        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(minimal("udupi"));

        assertTrue(sql.whereFragment().startsWith(
                "pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false"));
        assertTrue(sql.whereFragment().contains("AND pl.area_key IN (SELECT a.area_key"));
        assertTrue(sql.whereFragment().contains("c.slug = ?"));
        assertEquals(1, sql.params().size());
        assertEquals("udupi", sql.params().get(0));
    }

    // ── 2. propertyTypes=["house"] → IN clause ───────────────────────────────

    @Test
    void build_propertyTypes_generatesInClause() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", List.of("house"), null, null, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("AND pl.property_type IN (?)")
                , "Expected IN clause for one property type");
        assertTrue(sql.params().contains("house"));
    }

    // ── 3. bedrooms=[4] → bedrooms >= 4 ─────────────────────────────────────

    @Test
    void build_bedrooms4Only_generatesGte4Clause() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null,
                List.of(4), null, null, null, null, null,
                null, null, null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("AND pl.bedrooms >= 4"));
        // no extra param for the literal 4
        assertFalse(sql.params().contains(4));
    }

    // ── 4. bedrooms=[2,4] → (>= 4 OR IN (2)) ────────────────────────────────

    @Test
    void build_bedrooms2And4_generatesOrClause() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null,
                List.of(2, 4), null, null, null, null, null,
                null, null, null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("pl.bedrooms >= 4"));
        assertTrue(sql.whereFragment().contains("pl.bedrooms IN (?)"));
        assertTrue(sql.params().contains(2));
    }

    // ── 5. priceMin=100 rupees → caller passes 10000L paise ─────────────────

    @Test
    void build_priceMinPaise_generatesGteClause() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, 10_000L, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("AND pl.price_paise >= ?"));
        assertTrue(sql.params().contains(10_000L));
    }

    // ── 6. backOnMarket=true ─────────────────────────────────────────────────

    @Test
    void build_backOnMarketTrue_generatesBackToMarketClause() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null,
                null, null, Boolean.TRUE, null, null, null,
                null, null, null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("back_to_market_at IS NOT NULL"));
        assertTrue(sql.whereFragment().contains("back_to_market_at > NOW() - INTERVAL '30 days'"));
    }

    // ── 7. newToMarket=true ──────────────────────────────────────────────────

    @Test
    void build_newToMarketTrue_generatesFirstPublishedAtClause() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null,
                null, null, null, Boolean.TRUE, null, null,
                null, null, null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("COALESCE(pl.first_published_at::date"));
        assertTrue(sql.whereFragment().contains("INTERVAL '7 days'"));
    }

    // ── 8. polygon with 3 vertices → ST_Contains ────────────────────────────

    @Test
    void build_polygonWith3Vertices_generatesStContains() {
        List<List<Double>> polygon = List.of(
                List.of(13.3, 74.7),
                List.of(13.4, 74.8),
                List.of(13.3, 74.8)
        );
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null,
                null, null, null, null, null, null,
                polygon, null, null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("ST_Contains(ST_GeomFromText(?, 4326)"));
        // WKT param should be in the list
        boolean hasWkt = sql.params().stream()
                .anyMatch(p -> p instanceof String s && s.startsWith("POLYGON(("));
        assertTrue(hasWkt, "Expected WKT polygon param");
    }

    // ── 9. school proximity filter ───────────────────────────────────────────

    @Test
    void build_schoolProximity_generatesStDWithin() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null,
                null, null, null, null, null, null,
                null, 13.0, 74.0, 3.0, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("ST_DWithin("));
        // Must reference the stored pl.geog generated column (V73), not recalculate geography inline
        assertTrue(sql.whereFragment().contains("pl.geog"),
                "Expected predicate to use stored pl.geog generated column, not ST_MakePoint(pl.longitude, pl.latitude)");
        assertFalse(sql.whereFragment().contains("ST_MakePoint(pl.longitude"),
                "Predicate must not recalculate geography from raw columns — use pl.geog instead");
        assertTrue(sql.params().contains(3000.0),
                "Expected radius in metres (3.0 km = 3000.0 m)");
        // lon, lat order in params — ST_MakePoint(lon, lat) for the school point
        int lonIdx = sql.params().indexOf(74.0);
        int latIdx = sql.params().indexOf(13.0);
        assertTrue(lonIdx >= 0, "Longitude 74.0 should be a param");
        assertTrue(latIdx >= 0, "Latitude 13.0 should be a param");
        assertTrue(lonIdx < latIdx, "lon param should appear before lat param per ST_MakePoint(lon, lat)");
    }

    // ── 9b. schoolRadiusKm=null → default 2 km = 2000 m ────────────────────

    @Test
    void build_schoolProximityNullRadius_defaults2km() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null,
                null, null, null, null, null, null,
                null, 13.0, 74.0, null, null); // schoolRadiusKm = null

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("ST_DWithin("),
                "Expected school proximity clause when lat and lon are provided");
        assertTrue(sql.params().contains(2000.0),
                "Expected default radius of 2000 m (2 km) when schoolRadiusKm is null");
    }

    // ── 9c. schoolLon=null → no school proximity clause (silent skip) ────────

    @Test
    void build_schoolProximityMissingLon_noClause() {
        // Documents the contract: both schoolLat AND schoolLon must be non-null
        // to generate the proximity predicate. A partial pair is silently skipped.
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null,
                null, null, null, null, null, null,
                null, 13.0, null, 2.0, null); // schoolLon = null

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertFalse(sql.whereFragment().contains("ST_DWithin("),
                "No proximity clause should be generated when schoolLon is null");
    }

    // ── 10. bbox filter → ST_MakeEnvelope && pl.geog clause ─────────────────

    @Test
    void build_bbox_generatesEnvelopeClause() {
        DiscoverListingPredicateBuilder.Bbox bbox =
                new DiscoverListingPredicateBuilder.Bbox(13.3, 74.7, 13.4, 74.8);
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null, bbox);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("pl.geog && ST_MakeEnvelope(?, ?, ?, ?, 4326)::geography"),
                "Expected GIST-compatible envelope overlap predicate");
        // param order: west, south, east, north
        int wi = sql.params().indexOf(74.7);  // west
        int si = sql.params().indexOf(13.3);  // south
        int ei = sql.params().indexOf(74.8);  // east
        int ni = sql.params().indexOf(13.4);  // north
        assertTrue(wi >= 0 && si >= 0 && ei >= 0 && ni >= 0,
                "All four bbox values must appear in params");
        assertTrue(wi < si && si < ei && ei < ni,
                "Param order must be west, south, east, north per ST_MakeEnvelope signature");
    }

    // ── 10b. bbox=null → no envelope clause ──────────────────────────────────

    @Test
    void build_nullBbox_noEnvelopeClause() {
        DiscoverListingPredicateBuilder.Sql sql =
                DiscoverListingPredicateBuilder.build(minimal("udupi"));

        assertFalse(sql.whereFragment().contains("ST_MakeEnvelope"),
                "No bbox clause should be added when bbox is null");
    }

    // ── 11. reraRegistered=true → PG regex on rera_number ─────────────────

    @Test
    void build_reraRegistered_generatesRegexClause() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null,
                null, null, null, null, Boolean.TRUE, null,
                null, null, null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("pl.rera_number IS NOT NULL"));
        assertTrue(sql.whereFragment().contains("pl.rera_number ~"),
                "Expected PG regex operator ~ on rera_number");
        // must NOT reference a non-existent rera_valid column
        assertFalse(sql.whereFragment().contains("rera_valid"),
                "Predicate must not reference rera_valid (not a DB column)");
    }
}

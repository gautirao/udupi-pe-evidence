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
                city, null, null, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null);
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
                "udupi", List.of("house"), null, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("AND pl.property_type IN (?)")
                , "Expected IN clause for one property type");
        assertTrue(sql.params().contains("house"));
    }

    // ── 3. bedrooms=[4] → bedrooms >= 4 ─────────────────────────────────────

    @Test
    void build_bedrooms4Only_generatesGte4Clause() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null,
                List.of(4), null, null, null, null, null,
                null, null, null, null, null, null, null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("AND pl.bedrooms >= 4"));
        // no extra param for the literal 4
        assertFalse(sql.params().contains(4));
    }

    // ── 4. bedrooms=[2,4] → (>= 4 OR IN (2)) ────────────────────────────────

    @Test
    void build_bedrooms2And4_generatesOrClause() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null,
                List.of(2, 4), null, null, null, null, null,
                null, null, null, null, null, null, null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("pl.bedrooms >= 4"));
        assertTrue(sql.whereFragment().contains("pl.bedrooms IN (?)"));
        assertTrue(sql.params().contains(2));
    }

    // ── 5. priceMin=100 rupees → caller passes 10000L paise ─────────────────

    @Test
    void build_priceMinPaise_generatesGteClause() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, 10_000L, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("AND pl.price_paise >= ?"));
        assertTrue(sql.params().contains(10_000L));
    }

    // ── 6. backOnMarket=true ─────────────────────────────────────────────────

    @Test
    void build_backOnMarketTrue_generatesBackToMarketClause() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null,
                null, null, Boolean.TRUE, null, null, null,
                null, null, null, null, null, null, null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("back_to_market_at IS NOT NULL"));
        assertTrue(sql.whereFragment().contains("back_to_market_at > NOW() - INTERVAL '30 days'"));
    }

    // ── 7. newToMarket=true ──────────────────────────────────────────────────

    @Test
    void build_newToMarketTrue_generatesFirstPublishedAtClause() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null,
                null, null, null, Boolean.TRUE, null, null,
                null, null, null, null, null, null, null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("COALESCE(pl.first_published_at::date"));
        assertTrue(sql.whereFragment().contains("INTERVAL '7 days'"));
    }

    // ── 8. polygon with 3 vertices → two-stage GiST + ST_Contains predicate ──
    //
    // Parity contract:
    //   Stage 1 (prefilter): ST_Intersects(ST_Envelope(polygon)::geography, pl.geog)
    //   Stage 2 (exact):     ST_Contains(polygon, pl.geog::geometry)
    //   The WKT string is bound twice — once per stage.

    @Test
    void build_polygonWith3Vertices_generatesTwoStagePredicate() {
        List<List<Double>> polygon = List.of(
                List.of(13.3, 74.7),
                List.of(13.4, 74.8),
                List.of(13.3, 74.8)
        );
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null,
                null, null, null, null, null, null,
                polygon, null, null, null, null, null, null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        // Stage 1: prefilter uses envelope + pl.geog for GiST index access
        assertTrue(sql.whereFragment().contains(
                "ST_Intersects(ST_Envelope(ST_GeomFromText(?, 4326))::geography, pl.geog)"),
                "Expected GiST prefilter: ST_Intersects(ST_Envelope(...)::geography, pl.geog)");

        // Stage 2: exact point-in-polygon using stored pl.geog column
        assertTrue(sql.whereFragment().contains(
                "ST_Contains(ST_GeomFromText(?, 4326), pl.geog::geometry)"),
                "Expected exact predicate: ST_Contains(polygon, pl.geog::geometry)");

        // WKT string must be bound twice (one param per stage)
        long wktParamCount = sql.params().stream()
                .filter(p -> p instanceof String s && s.startsWith("POLYGON(("))
                .count();
        assertEquals(2, wktParamCount,
                "WKT polygon string must be bound twice — once for prefilter, once for exact predicate");
    }

    // ── 8b. polygon null → no polygon predicates generated ──────────────────

    @Test
    void build_nullPolygon_noPolygonClauses() {
        DiscoverListingPredicateBuilder.Sql sql =
                DiscoverListingPredicateBuilder.build(minimal("udupi"));

        assertFalse(sql.whereFragment().contains("ST_Contains"),
                "No ST_Contains clause when polygon is null");
        assertFalse(sql.whereFragment().contains("ST_Intersects"),
                "No ST_Intersects clause when polygon is null");
        assertFalse(sql.params().stream().anyMatch(p -> p instanceof String s && s.startsWith("POLYGON")),
                "No WKT param when polygon is null");
    }

    // ── 8c. polygon < 3 vertices → no polygon predicates generated ──────────

    @Test
    void build_polygonWith2Vertices_noPolygonClauses() {
        List<List<Double>> twoPoints = List.of(
                List.of(13.3, 74.7),
                List.of(13.4, 74.8)
        );
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null,
                null, null, null, null, null, null,
                twoPoints, null, null, null, null, null, null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertFalse(sql.whereFragment().contains("ST_Contains"),
                "No ST_Contains clause when polygon has fewer than 3 vertices");
        assertFalse(sql.whereFragment().contains("ST_Intersects"),
                "No ST_Intersects clause when polygon has fewer than 3 vertices");
    }

    // ── 8d. WKT coordinate order: vertices converted lon lat (not lat lon) ───

    @Test
    void build_polygonWktCoordinateOrder_isLonLat() {
        // Input is [[lat, lon]] per API contract.
        // PostGIS WKT expects (lon lat), so the WKT param must swap the order.
        List<List<Double>> polygon = List.of(
                List.of(13.3, 74.7),  // lat=13.3, lon=74.7
                List.of(13.4, 74.8),
                List.of(13.3, 74.8)
        );
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null,
                null, null, null, null, null, null,
                polygon, null, null, null, null, null, null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        String wkt = sql.params().stream()
                .filter(p -> p instanceof String s && s.startsWith("POLYGON(("))
                .map(p -> (String) p)
                .findFirst()
                .orElseThrow(() -> new AssertionError("No WKT param found"));

        // First vertex in WKT must be "74.7 13.3" (lon lat), not "13.3 74.7" (lat lon)
        assertTrue(wkt.startsWith("POLYGON((74.7 13.3"),
                "WKT must start with lon lat order. Got: " + wkt);
    }

    // ── 8e. prefilter appears before exact predicate in WHERE fragment ───────

    @Test
    void build_polygonPredicateOrder_prefilterBeforeExact() {
        List<List<Double>> polygon = List.of(
                List.of(13.3, 74.7),
                List.of(13.4, 74.8),
                List.of(13.3, 74.8)
        );
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null,
                null, null, null, null, null, null,
                polygon, null, null, null, null, null, null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        int prefilterPos = sql.whereFragment().indexOf("ST_Intersects(ST_Envelope(");
        int exactPos     = sql.whereFragment().indexOf("ST_Contains(ST_GeomFromText(");
        assertTrue(prefilterPos >= 0, "Prefilter ST_Intersects must be present");
        assertTrue(exactPos >= 0, "Exact ST_Contains must be present");
        assertTrue(prefilterPos < exactPos,
                "Prefilter (envelope intersect) must appear before exact (ST_Contains) in WHERE fragment");
    }

    // ── 9. school proximity filter ───────────────────────────────────────────

    @Test
    void build_schoolProximity_generatesStDWithin() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null,
                null, null, null, null, null, null,
                null, 13.0, 74.0, 3.0, null, null, null, null, null);

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
                "udupi", null, null, null, null, null,
                null, null, null, null, null, null,
                null, 13.0, 74.0, null, null, null, null, null, null); // schoolRadiusKm = null

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
                "udupi", null, null, null, null, null,
                null, null, null, null, null, null,
                null, 13.0, null, 2.0, null, null, null, null, null); // schoolLon = null

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
                "udupi", null, null, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null, bbox, null, null, null, null);

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
                "udupi", null, null, null, null, null,
                null, null, null, null, Boolean.TRUE, null,
                null, null, null, null, null, null, null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("pl.rera_number IS NOT NULL"));
        assertTrue(sql.whereFragment().contains("pl.rera_number ~"),
                "Expected PG regex operator ~ on rera_number");
        // must NOT reference a non-existent rera_valid column
        assertFalse(sql.whereFragment().contains("rera_valid"),
                "Predicate must not reference rera_valid (not a DB column)");
    }

    // ── T1. q=null → no search_vector clause ─────────────────────────────

    @Test
    void build_nullQ_noFtsClause() {
        // q=null (last field) — Filters record has null for q
        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(minimal("udupi"));

        assertFalse(sql.whereFragment().contains("search_vector"),
                "No FTS clause should be generated when q is null");
    }

    // ── T2. q="apartment" → FTS clause + param ───────────────────────────

    @Test
    void build_nonNullQ_generatesFtsClause() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null, null, "apartment", null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains(
                "pl.search_vector @@ websearch_to_tsquery('english', ?)"),
                "Expected FTS clause for non-null q");
        assertTrue(sql.params().contains("apartment"),
                "Expected q value 'apartment' in params");
    }

    // ── T3. q="" (blank) → treated as null, no FTS clause ────────────────
    //
    // Normalisation occurs in DiscoverListingPredicateBuilder.build() itself:
    // blank/whitespace-only q is converted to null before the FTS clause is
    // conditionally appended. The controller only enforces the 500-char limit;
    // it does NOT normalise blank to null — that is the predicate builder's job.

    @Test
    void build_blankQ_noFtsClause() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null, null, "   ", null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertFalse(sql.whereFragment().contains("search_vector"),
                "Blank q must be treated as absent — no FTS clause");
        assertFalse(sql.params().contains("   "),
                "Blank q must not appear in params");
    }

    // ── T4. q + school proximity both non-null → both clauses present, correct param order ──

    @Test
    void build_qAndSchoolProximity_bothClausesCorrectParamOrder() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null,
                null, null, null, null, null, null,
                null, 13.0, 74.0, 2.0, null, "flat", null, null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        // Both clauses present
        assertTrue(sql.whereFragment().contains("ST_DWithin("),
                "Expected school proximity ST_DWithin clause");
        assertTrue(sql.whereFragment().contains(
                "pl.search_vector @@ websearch_to_tsquery('english', ?)"),
                "Expected FTS clause when q is non-null");

        // School proximity must appear before FTS in the WHERE fragment
        int stDWithinPos = sql.whereFragment().indexOf("ST_DWithin(");
        int ftsPos = sql.whereFragment().indexOf("pl.search_vector");
        assertTrue(stDWithinPos < ftsPos,
                "ST_DWithin (school proximity) must appear before search_vector (FTS) in WHERE fragment");

        // Param ordering: city(1) then school lon(2), lat(3), radius_m(4) then q(5)
        // school coords: lon=74.0, lat=13.0, radius=2000.0
        int lonIdx    = sql.params().indexOf(74.0);
        int latIdx    = sql.params().indexOf(13.0);
        int radiusIdx = sql.params().indexOf(2000.0);
        int qIdx      = sql.params().indexOf("flat");
        assertTrue(lonIdx >= 0 && latIdx >= 0 && radiusIdx >= 0 && qIdx >= 0,
                "All expected params must be present");
        assertTrue(radiusIdx < qIdx,
                "School radius param must appear before q param (ST_DWithin before FTS in SQL)");
        assertTrue(lonIdx < latIdx,
                "lon param must appear before lat param per ST_MakePoint(lon, lat)");
        // Exact count guard: city(1) + lon(2) + lat(3) + radius_m(4) + q(5)
        assertEquals(5, sql.params().size(),
                "Expected exactly 5 params: city + lon + lat + radius_m + q");
    }

    // ── T5. listingPurpose="sale" → AND pl.listing_purpose = ? clause + param ─

    @Test
    void build_listingPurposeSale_generatesListingPurposeClause() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null, null, null, "sale", null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("AND pl.listing_purpose = ?"),
                "Expected listing_purpose = ? clause when listingPurpose='sale'");
        assertTrue(sql.params().contains("sale"),
                "Expected 'sale' to appear in params");
    }

    // ── T6. listingPurpose="rent" → same clause with 'rent' param ────────────

    @Test
    void build_listingPurposeRent_generatesListingPurposeClause() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null, null, null, "rent", null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("AND pl.listing_purpose = ?"),
                "Expected listing_purpose = ? clause when listingPurpose='rent'");
        assertTrue(sql.params().contains("rent"),
                "Expected 'rent' to appear in params");
    }

    // ── T7. listingPurpose=null → no listing_purpose clause ──────────────────

    @Test
    void build_listingPurposeNull_noListingPurposeClause() {
        DiscoverListingPredicateBuilder.Sql sql =
                DiscoverListingPredicateBuilder.build(minimal("udupi"));

        assertFalse(sql.whereFragment().contains("pl.listing_purpose"),
                "No listing_purpose clause should be generated when listingPurpose is null");
    }

    // ── T8. listingPurpose="  " (blank) → normalised to null, no clause ──────

    // ── E1. excludePropertyTypes=["AGRICULTURAL_LAND"] → NOT IN clause + lowercased param ─

    @Test
    void build_withExcludePropertyTypes_appendsNotInClause() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null, null, null, null,
                List.of("AGRICULTURAL_LAND"), null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("AND LOWER(pl.property_type) NOT IN (?)"),
                "Expected NOT IN clause for excludePropertyTypes");
        assertTrue(sql.params().contains("agricultural_land"),
                "Expected lowercased 'agricultural_land' in params");
        assertFalse(sql.params().contains("AGRICULTURAL_LAND"),
                "Must NOT have the non-lowercased form in params");
    }

    // ── E2. excludePropertyTypes=null → no NOT IN clause ─────────────────────

    @Test
    void build_withNullExcludePropertyTypes_noExclusionClause() {
        DiscoverListingPredicateBuilder.Sql sql =
                DiscoverListingPredicateBuilder.build(minimal("udupi"));

        assertFalse(sql.whereFragment().contains("NOT IN"),
                "No NOT IN clause when excludePropertyTypes is null");
    }

    @Test
    void build_blankListingPurpose_noListingPurposeClause() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null, null, null, "   ", null, null);

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertFalse(sql.whereFragment().contains("pl.listing_purpose"),
                "Blank listingPurpose must be treated as absent — no listing_purpose clause");
        assertFalse(sql.params().contains("   "),
                "Blank listingPurpose must not appear in params");
    }

    // ── A1. areaKeys=null → no area_key IN clause (backward-compat) ──────────

    @Test
    void build_areaKeysNull_noAreaKeyInClause() {
        // areaKeys absent (null) must not add any extra predicate.
        // Existing journeys pass nothing; this confirms byte-identical WHERE fragment.
        DiscoverListingPredicateBuilder.Sql sql =
                DiscoverListingPredicateBuilder.build(minimal("udupi"));

        assertFalse(sql.whereFragment().contains("AND pl.area_key IN (?)"),
                "No area_key IN clause when areaKeys is null");
        // city subselect (the existing one) must still be present
        assertTrue(sql.whereFragment().contains("AND pl.area_key IN (SELECT a.area_key"),
                "City subselect must still be present when areaKeys is null");
        // Only the city param — no extra params added
        assertEquals(1, sql.params().size(),
                "Only city param expected when areaKeys is null");
    }

    // ── A2. areaKeys present → AND pl.area_key IN (...) clause ANDed after city ─

    @Test
    void build_areaKeysPresent_generatesAreaKeyInClause() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                List.of("IN|KA|Udupi|Manipal", "IN|KA|Udupi|Katapadi"));

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        // Must generate the direct IN clause (not the city subselect)
        assertTrue(sql.whereFragment().contains("AND pl.area_key IN (?, ?)"),
                "Expected AND pl.area_key IN (?, ?) for two area keys");
        // Both area keys must appear in params
        assertTrue(sql.params().contains("IN|KA|Udupi|Manipal"),
                "First area key must appear in params");
        assertTrue(sql.params().contains("IN|KA|Udupi|Katapadi"),
                "Second area key must appear in params");
        // City subselect must also be present (city filter not removed)
        assertTrue(sql.whereFragment().contains("AND pl.area_key IN (SELECT a.area_key"),
                "City subselect must still be present alongside areaKeys filter");
    }

    // ── A3. areaKeys AND city subselect are both ANDed (no leakage) ───────────

    @Test
    void build_areaKeysAndCity_bothPredicatesPresent() {
        // This is the no-leakage test: an area_key not belonging to the city
        // would be filtered out by the city subselect even if it appears in areaKeys.
        // The SQL test confirms both predicates are present; actual leakage
        // is ruled out structurally because both use AND.
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                List.of("IN|KA|Udupi|Manipal"));

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        String frag = sql.whereFragment();

        // City subselect comes first (it was added first in build())
        int cityPos    = frag.indexOf("AND pl.area_key IN (SELECT a.area_key");
        int areaKeyPos = frag.indexOf("AND pl.area_key IN (?");
        assertTrue(cityPos >= 0, "City subselect must be present");
        assertTrue(areaKeyPos >= 0, "areaKeys IN clause must be present");
        // Both appear and both are in the same WHERE fragment (ANDed)
        assertTrue(cityPos < areaKeyPos,
                "City subselect must appear before areaKeys IN clause");

        // params: city slug + area key
        assertEquals(2, sql.params().size(), "Expected exactly 2 params: city + area_key");
        assertEquals("udupi", sql.params().get(0));
        assertEquals("IN|KA|Udupi|Manipal", sql.params().get(1));
    }

    // ── A4. areaKeys empty list → builder skips clause (empty guard is at controller) ─

    @Test
    void build_areaKeysEmptyList_noAreaKeyInClause() {
        // The controller rejects empty lists with 400 before reaching the builder.
        // This test documents the builder's own behaviour for an empty list:
        // it silently skips (identical to null). The authoritative guard is the
        // controller-layer 400 check, not the builder.
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null,
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                List.of()); // empty list — controller would have rejected this

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertFalse(sql.whereFragment().contains("AND pl.area_key IN (?)"),
                "Builder must skip areaKeys IN clause for empty list");
        // city subselect still present
        assertTrue(sql.whereFragment().contains("AND pl.area_key IN (SELECT a.area_key"),
                "City subselect must still be present");
    }

    // ── A5. areaKeys + polygon compose correctly (AND) ────────────────────────

    @Test
    void build_areaKeysAndPolygon_bothClausesPresent() {
        List<List<Double>> polygon = List.of(
                List.of(13.3, 74.7),
                List.of(13.4, 74.8),
                List.of(13.3, 74.8)
        );
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null,
                null, null, null, null, null, null,
                polygon, null, null, null, null, null, null, null,
                List.of("IN|KA|Udupi|Manipal"));

        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);

        assertTrue(sql.whereFragment().contains("ST_Contains("), "Polygon predicate must be present");
        assertTrue(sql.whereFragment().contains("AND pl.area_key IN (?"), "areaKeys predicate must be present");
    }
}

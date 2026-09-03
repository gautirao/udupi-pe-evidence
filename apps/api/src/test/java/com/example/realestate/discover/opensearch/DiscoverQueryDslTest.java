package com.example.realestate.discover.opensearch;

import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import com.example.realestate.discover.DiscoverListingsQuery;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.nio.file.Files;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for {@link DiscoverQueryDsl}.
 *
 * <p>Each test asserts on the serialized Map structure, not string matching.
 */
class DiscoverQueryDslTest {

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    // Compile/wiring fix only (#1945): DiscoverQueryDsl.buildMarkersQuery/buildListingsQuery now
    // require the caller-resolved active-area_key set as an explicit parameter. Pre-existing
    // tests below are updated with this placeholder non-empty set purely so they keep compiling
    // and exercising their original (non-city-gating) assertions; the anti-drift structural test
    // and the dedicated area_key-gating test coverage (including the empty-set case) are added by
    // qa separately, per the approved plan's specialist sequence.
    private static final List<String> ANY_ACTIVE_AREA_KEYS = List.of("any-active-area-key");

    private static DiscoverListingPredicateBuilder.Filters filtersFor(String city) {
        return new DiscoverListingPredicateBuilder.Filters(
                city, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null
        , null);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> getBool(Map<String, Object> body) {
        Map<String, Object> query = (Map<String, Object>) body.get("query");
        return (Map<String, Object>) query.get("bool");
    }

    @SuppressWarnings("unchecked")
    private static List<Object> getFilter(Map<String, Object> bool) {
        return (List<Object>) bool.get("filter");
    }

    @SuppressWarnings("unchecked")
    private static List<Object> getMust(Map<String, Object> bool) {
        Object must = bool.get("must");
        if (must instanceof List<?> list) return (List<Object>) list;
        return List.of();
    }

    /**
     * Counts filter entries shaped exactly {@code {"terms": {"area_key": [...]}}} whose value
     * list equals {@code expectedValues} as a SET (order-independent) — used to identify the
     * #1945 active-area_key gate clause specifically (as opposed to the separate, optional
     * areaKeys-narrowing clause added by {@code f.areaKeys()}, which carries a DIFFERENT value
     * list in every test fixture below).
     */
    @SuppressWarnings("unchecked")
    private static long countAreaKeyTermsClausesMatching(List<Object> filter, Collection<String> expectedValues) {
        java.util.Set<String> expected = new java.util.HashSet<>(expectedValues);
        return filter.stream().filter(f -> {
            if (!(f instanceof Map<?, ?> m)) return false;
            Object termsObj = m.get("terms");
            if (!(termsObj instanceof Map<?, ?> t)) return false;
            Object vals = t.get("area_key");
            if (!(vals instanceof List<?> list)) return false;
            return new java.util.HashSet<>((List<String>) list).equals(expected);
        }).count();
    }

    private static boolean hasAreaKeyTermsClause(List<Object> filter, Collection<String> expectedValues) {
        return countAreaKeyTermsClausesMatching(filter, expectedValues) >= 1;
    }

    /** Counts ALL {@code terms(area_key, ...)} clauses regardless of value — used by the anti-drift test. */
    private static long countAllAreaKeyTermsClauses(List<Object> filter) {
        return filter.stream().filter(f -> {
            if (!(f instanceof Map<?, ?> m)) return false;
            Object termsObj = m.get("terms");
            if (!(termsObj instanceof Map<?, ?> t)) return false;
            return t.containsKey("area_key");
        }).count();
    }

    /** True iff ANY filter entry anywhere is a {@code term(city_slug, ...)} clause (#1945 EC20/AC9). */
    private static boolean hasCitySlugTermClause(List<Object> filter) {
        return filter.stream().anyMatch(f -> {
            if (!(f instanceof Map<?, ?> m)) return false;
            Object termObj = m.get("term");
            if (!(termObj instanceof Map<?, ?> t)) return false;
            return t.containsKey("city_slug");
        });
    }

    // -----------------------------------------------------------------------
    // Test 1: text-only query (q present, no geo, no bbox)
    // -----------------------------------------------------------------------

    @Test
    void textOnlyQuery_emitsMultiMatchMust() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, "apartment", null, null, null
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        Map<String, Object> bool = getBool(body);
        List<Object> must = getMust(bool);

        assertThat(must).hasSize(1);
        @SuppressWarnings("unchecked")
        Map<String, Object> multiMatch = (Map<String, Object>) ((Map<String, Object>) must.get(0)).get("multi_match");
        assertThat(multiMatch).containsEntry("query", "apartment");
        assertThat(multiMatch).containsEntry("operator", "and");
    }

    // -----------------------------------------------------------------------
    // Test 2: bbox-only (no q, no geo)
    // -----------------------------------------------------------------------

    @Test
    void bboxOnly_emitsGeoBoundingBox() {
        DiscoverListingPredicateBuilder.Bbox bbox = new DiscoverListingPredicateBuilder.Bbox(13.0, 74.5, 13.5, 75.0);
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, bbox, null, null, null, null
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        Map<String, Object> bool = getBool(body);
        List<Object> filter = getFilter(bool);
        List<Object> must = getMust(bool);

        // No FTS must clause
        assertThat(must).isEmpty();

        // geo_bounding_box in filter
        boolean hasBboxClause = filter.stream().anyMatch(f -> {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) f;
            return m.containsKey("geo_bounding_box");
        });
        assertThat(hasBboxClause).isTrue();
    }

    // -----------------------------------------------------------------------
    // Test 3: radius-only (no q, no bbox)
    // -----------------------------------------------------------------------

    @Test
    void radiusOnly_emitsGeoDistance() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, 13.3, 74.7, 3.0, null, null, null, null, null
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        Map<String, Object> bool = getBool(body);
        List<Object> filter = getFilter(bool);

        boolean hasGeoDistance = filter.stream().anyMatch(f -> {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) f;
            return m.containsKey("geo_distance");
        });
        assertThat(hasGeoDistance).isTrue();

        @SuppressWarnings("unchecked")
        Map<String, Object> geoDistance = filter.stream()
                .map(f -> (Map<String, Object>) f)
                .filter(m -> m.containsKey("geo_distance"))
                .findFirst()
                .map(m -> (Map<String, Object>) m.get("geo_distance"))
                .orElseThrow();
        assertThat(geoDistance).containsEntry("distance", String.format("%.6fkm", 3.0));
    }

    // -----------------------------------------------------------------------
    // #1956 PR1 review fix B: unsatisfiable narrowing filters must emit an
    // equivalent match-nothing clause, never be silently omitted.
    // -----------------------------------------------------------------------

    @SuppressWarnings("unchecked")
    private static List<Object> termsValuesFor(List<Object> filter, String field) {
        return filter.stream()
                .filter(f -> f instanceof Map<?, ?> m
                        && m.get("terms") instanceof Map<?, ?> t && t.containsKey(field))
                .map(f -> (Map<String, Object>) ((Map<String, Object>) f).get("terms"))
                .map(t -> (List<Object>) t.get(field))
                .findFirst()
                .orElse(null);
    }

    /**
     * The OpenSearch engine must reach the SAME zero as Postgres for a narrowing filter nothing
     * satisfies. Omitting the clause would return the whole city — the exact quietly-wrong outcome
     * the shared normaliser exists to prevent, and it must not reappear on the second engine.
     */
    @Test
    void unsatisfiableNarrowingFilters_emitMatchNothingTermsClauses_neverOmitted() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", List.of("PENTHOUSE"), null, null, null, null, List.of(-5), List.of("landlord"),
                null, null, null, null, null, null, null, null, null, null, null, null, null
        , null);

        List<Object> filter = getFilter(getBool(
                DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS)));

        assertThat(termsValuesFor(filter, "property_type"))
                .as("an unknown property type must still emit a terms clause -- lower-cased, matching "
                        + "nothing -- rather than being dropped so every listing comes back")
                .containsExactly("penthouse");
        assertThat(termsValuesFor(filter, "seller_type"))
                .as("same rule for seller_type")
                .containsExactly("landlord");
        assertThat(filter)
                .as("an all-negative bedrooms list must still constrain the query")
                .anyMatch(f -> f instanceof Map<?, ?> m
                        && (m.containsKey("range") || m.containsKey("terms") || m.containsKey("bool")));
    }

    @Test
    void recognisedNarrowingFilters_areCanonicalisedNotPassedThroughRaw() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", List.of("APARTMENT"), null, null, null, null, null, List.of("OWNER"),
                null, null, null, null, null, null, null, null, null, null, null, null, null
        , null);

        List<Object> filter = getFilter(getBool(
                DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS)));

        assertThat(termsValuesFor(filter, "property_type")).containsExactly("apartment");
        assertThat(termsValuesFor(filter, "seller_type")).containsExactly("owner");
    }

    // -----------------------------------------------------------------------
    // Test 4: combined q + bbox
    // -----------------------------------------------------------------------

    @Test
    void combinedQAndBbox_emitsBothClauses() {
        DiscoverListingPredicateBuilder.Bbox bbox = new DiscoverListingPredicateBuilder.Bbox(13.0, 74.5, 13.5, 75.0);
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, bbox, "villa", null, null, null
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        Map<String, Object> bool = getBool(body);

        // must has multi_match
        List<Object> must = getMust(bool);
        assertThat(must).hasSize(1);

        // filter has geo_bounding_box
        List<Object> filter = getFilter(bool);
        boolean hasBbox = filter.stream().anyMatch(f -> ((Map<?, ?>) f).containsKey("geo_bounding_box"));
        assertThat(hasBbox).isTrue();
    }

    // -----------------------------------------------------------------------
    // Test 5: combined q + radius
    // -----------------------------------------------------------------------

    @Test
    void combinedQAndRadius_emitsBothClauses() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, 13.3, 74.7, 2.0, null, "flat", null, null, null
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        Map<String, Object> bool = getBool(body);

        List<Object> must = getMust(bool);
        assertThat(must).hasSize(1);

        List<Object> filter = getFilter(bool);
        boolean hasGeoDistance = filter.stream().anyMatch(f -> ((Map<?, ?>) f).containsKey("geo_distance"));
        assertThat(hasGeoDistance).isTrue();
    }

    // -----------------------------------------------------------------------
    // Test 6: city filter only (#1945 — gate keys on area_key, not the dead city_slug field)
    // -----------------------------------------------------------------------

    @Test
    void cityFilterOnly_emitsAreaKeyTermsInFilter_neverCitySlugTerm() {
        DiscoverListingPredicateBuilder.Filters filters = filtersFor("udupi");

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        Map<String, Object> bool = getBool(body);
        List<Object> filter = getFilter(bool);

        assertThat(hasAreaKeyTermsClause(filter, ANY_ACTIVE_AREA_KEYS))
                .as("the active-area_key allow-list gate must be present as a terms(area_key,...) clause")
                .isTrue();
        assertThat(hasCitySlugTermClause(filter))
                .as("#1945: city_slug is a dead field on the write path and must NEVER be filtered on")
                .isFalse();
    }

    // -----------------------------------------------------------------------
    // Test 7: bedrooms=[4] → range(gte:4), not terms
    // -----------------------------------------------------------------------

    @Test
    void bedrooms4Only_emitsRangeGte4() {
        Map<String, Object> clause = DiscoverQueryDsl.buildBedroomsClause(List.of(4));
        assertThat(clause).containsKey("range");
        @SuppressWarnings("unchecked")
        Map<String, Object> rangeField = (Map<String, Object>) ((Map<String, Object>) clause.get("range")).get("bedrooms");
        assertThat(rangeField).containsEntry("gte", 4);
        assertThat(clause).doesNotContainKey("terms");
    }

    // -----------------------------------------------------------------------
    // Test 8: bedrooms=[2,3,4] → should with terms([2,3]) + range(gte:4)
    // -----------------------------------------------------------------------

    @Test
    void bedroomsMixed_emitsShouldWithTermsAndRange() {
        Map<String, Object> clause = DiscoverQueryDsl.buildBedroomsClause(List.of(2, 3, 4));
        assertThat(clause).containsKey("bool");
        @SuppressWarnings("unchecked")
        Map<String, Object> bool = (Map<String, Object>) clause.get("bool");
        assertThat(bool).containsKey("should");
        assertThat(bool).containsEntry("minimum_should_match", 1);

        @SuppressWarnings("unchecked")
        List<Object> should = (List<Object>) bool.get("should");
        assertThat(should).hasSize(2);

        // One clause is terms with [2,3], one is range gte:4
        boolean hasTerms = should.stream().anyMatch(s -> ((Map<?, ?>) s).containsKey("terms"));
        boolean hasRange = should.stream().anyMatch(s -> ((Map<?, ?>) s).containsKey("range"));
        assertThat(hasTerms).isTrue();
        assertThat(hasRange).isTrue();
    }

    // -----------------------------------------------------------------------
    // Test 9: backOnMarket=true → exists(back_to_market_at) + range(gte:now-30d)
    // -----------------------------------------------------------------------

    @Test
    void backOnMarket_emitsExistsAndRangeClauses() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                Boolean.TRUE, null, null, null, null, null, null, null, null, null, null, null, null
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        List<Object> filter = getFilter(getBool(body));

        boolean hasExists = filter.stream().anyMatch(f -> {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) f;
            if (!m.containsKey("exists")) return false;
            @SuppressWarnings("unchecked")
            Map<String, Object> exists = (Map<String, Object>) m.get("exists");
            return "back_to_market_at".equals(exists.get("field"));
        });
        boolean hasRange = filter.stream().anyMatch(f -> {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) f;
            if (!m.containsKey("range")) return false;
            @SuppressWarnings("unchecked")
            Map<String, Object> range = (Map<String, Object>) m.get("range");
            return range.containsKey("back_to_market_at");
        });
        assertThat(hasExists).isTrue();
        assertThat(hasRange).isTrue();
    }

    // -----------------------------------------------------------------------
    // Test 10: newToMarket=true → range on first_published_at
    // -----------------------------------------------------------------------

    @Test
    void newToMarket_emitsShouldWithFirstPublishedAtAndCreatedAtBranches() {
        Map<String, Object> clause = DiscoverQueryDsl.buildNewToMarketClause();
        assertThat(clause).containsKey("bool");
        @SuppressWarnings("unchecked")
        Map<String, Object> bool = (Map<String, Object>) clause.get("bool");
        assertThat(bool).containsKey("should");
        assertThat(bool).containsEntry("minimum_should_match", 1);
        @SuppressWarnings("unchecked")
        List<Object> should = (List<Object>) bool.get("should");
        assertThat(should).hasSize(2);
    }

    // -----------------------------------------------------------------------
    // Test 11: reraRegistered=true → exists(rera_number)
    // -----------------------------------------------------------------------

    @Test
    void reraRegistered_emitsExistsReraNumber() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, Boolean.TRUE, null, null, null, null, null, null, null, null, null, null
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        List<Object> filter = getFilter(getBool(body));

        boolean hasExists = filter.stream().anyMatch(f -> {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) f;
            if (!m.containsKey("exists")) return false;
            @SuppressWarnings("unchecked")
            Map<String, Object> exists = (Map<String, Object>) m.get("exists");
            return "rera_number".equals(exists.get("field"));
        });
        assertThat(hasExists).isTrue();
    }

    // -----------------------------------------------------------------------
    // Test 12: readyToMove=true → term(possession_status=READY)
    // -----------------------------------------------------------------------

    @Test
    void readyToMove_emitsTermPossessionStatusReady() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, Boolean.TRUE, null, null, null, null, null, null, null, null, null
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        List<Object> filter = getFilter(getBool(body));

        boolean hasReadyTerm = filter.stream().anyMatch(f -> {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) f;
            if (!m.containsKey("term")) return false;
            @SuppressWarnings("unchecked")
            Map<String, Object> term = (Map<String, Object>) m.get("term");
            return "READY".equals(term.get("possession_status"));
        });
        assertThat(hasReadyTerm).isTrue();
    }

    // -----------------------------------------------------------------------
    // Test 13: blank q → no multi_match clause
    // -----------------------------------------------------------------------

    @Test
    void blankQ_doesNotEmitMultiMatch() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, "   ", null, null, null
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        Map<String, Object> bool = getBool(body);
        List<Object> must = getMust(bool);

        assertThat(must).isEmpty();
    }

    // -----------------------------------------------------------------------
    // Test 14: marker query has size=1001
    // -----------------------------------------------------------------------

    @Test
    void markersQuery_hasSize1001() {
        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filtersFor("udupi"), ANY_ACTIVE_AREA_KEYS);
        assertThat(body).containsEntry("size", 1001);
    }

    // -----------------------------------------------------------------------
    // Test 15: listings query respects page/size params
    // -----------------------------------------------------------------------

    @Test
    void listingsQuery_respectsPageAndSize() {
        DiscoverListingsQuery query = new DiscoverListingsQuery(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, 2, 10, false, null, null
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildListingsQuery(query, ANY_ACTIVE_AREA_KEYS);
        assertThat(body).containsEntry("size", 10);
        assertThat(body).containsEntry("from", 20L); // page=2, size=10 → from=20
    }

    // -----------------------------------------------------------------------
    // Test 16: _source contains exactly the 26 expected fields (no wildcard)
    // -----------------------------------------------------------------------

    @Test
    void markersQuery_sourceContainsExactly27Fields() {
        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filtersFor("udupi"), ANY_ACTIVE_AREA_KEYS);
        @SuppressWarnings("unchecked")
        List<String> source = (List<String>) body.get("_source");

        assertThat(source).doesNotContain("*");
        // Spot-check critical fields present
        assertThat(source).contains("id", "latitude", "longitude", "price_paise", "locality",
                "city_slug", "rera_number", "trust_tier", "possession_status",
                "first_published_at", "back_to_market_at", "hero_image_url");
        // Must not contain PII or internal fields
        assertThat(source).doesNotContain("search_vector", "geog", "archived_at", "user_id",
                "seller_id", "phone", "email");
        assertThat(source).hasSize(DiscoverQueryDsl.SOURCE_FIELDS.size());
    }

    // -----------------------------------------------------------------------
    // Additional: status always LIVE
    // -----------------------------------------------------------------------

    @Test
    void alwaysFiltersStatusLive() {
        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filtersFor("udupi"), ANY_ACTIVE_AREA_KEYS);
        List<Object> filter = getFilter(getBool(body));

        boolean hasStatusLive = filter.stream().anyMatch(f -> {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) f;
            if (!m.containsKey("term")) return false;
            @SuppressWarnings("unchecked")
            Map<String, Object> term = (Map<String, Object>) m.get("term");
            return "LIVE".equals(term.get("status"));
        });
        assertThat(hasStatusLive).isTrue();
    }

    // -----------------------------------------------------------------------
    // Additional: track_total_hits in listings query
    // -----------------------------------------------------------------------

    @Test
    void listingsQuery_hasTrackTotalHits() {
        DiscoverListingsQuery query = new DiscoverListingsQuery(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, 0, 20, false, null, null
        , null);
        Map<String, Object> body = DiscoverQueryDsl.buildListingsQuery(query, ANY_ACTIVE_AREA_KEYS);
        assertThat(body).containsEntry("track_total_hits", true);
    }

    // -----------------------------------------------------------------------
    // Additional: includeAggregates=true → aggs in body
    // -----------------------------------------------------------------------

    @Test
    void listingsQuery_includeAggregates_emitsAggs() {
        DiscoverListingsQuery query = new DiscoverListingsQuery(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, 0, 20, true, null, null
        , null);
        Map<String, Object> body = DiscoverQueryDsl.buildListingsQuery(query, ANY_ACTIVE_AREA_KEYS);
        assertThat(body).containsKey("aggs");
    }

    @Test
    void listingsQuery_noAggregates_noAggsInBody() {
        DiscoverListingsQuery query = new DiscoverListingsQuery(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, 0, 20, false, null, null
        , null);
        Map<String, Object> body = DiscoverQueryDsl.buildListingsQuery(query, ANY_ACTIVE_AREA_KEYS);
        assertThat(body).doesNotContainKey("aggs");
    }

    // -----------------------------------------------------------------------
    // Additional: bedrooms=[2,3] only (no 4) → terms filter
    // -----------------------------------------------------------------------

    @Test
    void bedroomsNoFour_emitsTermsOnly() {
        Map<String, Object> clause = DiscoverQueryDsl.buildBedroomsClause(List.of(2, 3));
        assertThat(clause).containsKey("terms");
        assertThat(clause).doesNotContainKey("bool");
    }

    // -----------------------------------------------------------------------
    // BLOCKING-1: polygon filter throws OpenSearchQueryException
    // -----------------------------------------------------------------------

    @Test
    void polygonFilter_markersQuery_throwsOpenSearchQueryException() {
        List<List<Double>> polygon = List.of(
                List.of(13.3, 74.7),
                List.of(13.4, 74.8),
                List.of(13.3, 74.9)
        );
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, polygon, null, null, null, null, null, null, null, null
        , null);

        assertThatThrownBy(() -> DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS))
                .isInstanceOf(OpenSearchQueryException.class)
                .hasMessageContaining("Polygon filter not supported in OpenSearch path");
    }

    @Test
    void polygonFilter_listingsQuery_throwsOpenSearchQueryException() {
        List<List<Double>> polygon = List.of(
                List.of(13.3, 74.7),
                List.of(13.4, 74.8),
                List.of(13.3, 74.9)
        );
        DiscoverListingsQuery query = new DiscoverListingsQuery(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, polygon, null, null, null,
                null, null, 0, 20, false, null, null
        , null);

        assertThatThrownBy(() -> DiscoverQueryDsl.buildListingsQuery(query, ANY_ACTIVE_AREA_KEYS))
                .isInstanceOf(OpenSearchQueryException.class)
                .hasMessageContaining("Polygon filter not supported in OpenSearch path");
    }

    // -----------------------------------------------------------------------
    // listingPurpose filter tests (#1497 — OpenSearch Buy/Rent intent parity)
    // -----------------------------------------------------------------------

    /** Helper: extract a term value from the filter list by field name. */
    @SuppressWarnings("unchecked")
    private static Object getTermValue(List<Object> filter, String field) {
        return filter.stream()
                .map(f -> (Map<String, Object>) f)
                .filter(m -> m.containsKey("term"))
                .map(m -> (Map<String, Object>) m.get("term"))
                .filter(t -> t.containsKey(field))
                .map(t -> t.get(field))
                .findFirst()
                .orElse(null);
    }

    @Test
    void listingPurpose_sale_addsTermClause() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, "sale", null, null
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        List<Object> filter = getFilter(getBool(body));

        assertThat(getTermValue(filter, "listing_purpose")).isEqualTo("sale");
    }

    @Test
    void listingPurpose_rent_addsTermClause() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, "rent", null, null
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        List<Object> filter = getFilter(getBool(body));

        assertThat(getTermValue(filter, "listing_purpose")).isEqualTo("rent");
    }

    @Test
    void listingPurpose_null_noClause() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        List<Object> filter = getFilter(getBool(body));

        assertThat(getTermValue(filter, "listing_purpose")).isNull();
    }

    @Test
    void listingPurpose_blank_noClause() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, "", null, null
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        List<Object> filter = getFilter(getBool(body));

        assertThat(getTermValue(filter, "listing_purpose")).isNull();
    }

    @Test
    void listingPurpose_whitespace_noClause() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, "  ", null, null
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        List<Object> filter = getFilter(getBool(body));

        assertThat(getTermValue(filter, "listing_purpose")).isNull();
    }

    // -----------------------------------------------------------------------
    // excludePropertyTypes: must_not wrapped as bool filter entry
    // -----------------------------------------------------------------------

    @Test
    @SuppressWarnings("unchecked")
    void buildBoolQuery_withExcludePropertyTypes_addsMustNotClause() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null,
                List.of("AGRICULTURAL_LAND"), null
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        List<Object> filter = getFilter(getBool(body));

        // Expect a filter entry: { "bool": { "must_not": [ { "terms": { "property_type": ["AGRICULTURAL_LAND"] } } ] } }
        boolean hasMustNotEntry = filter.stream().anyMatch(f -> {
            Map<String, Object> m = (Map<String, Object>) f;
            if (!m.containsKey("bool")) return false;
            Map<String, Object> innerBool = (Map<String, Object>) m.get("bool");
            if (!innerBool.containsKey("must_not")) return false;
            List<Object> mustNot = (List<Object>) innerBool.get("must_not");
            if (mustNot.size() != 1) return false;
            Map<String, Object> termsClause = (Map<String, Object>) mustNot.get(0);
            if (!termsClause.containsKey("terms")) return false;
            Map<String, Object> termsMap = (Map<String, Object>) termsClause.get("terms");
            return termsMap.containsKey("property_type");
        });
        assertThat(hasMustNotEntry).isTrue();
    }

    @Test
    @SuppressWarnings("unchecked")
    void buildBoolQuery_withMixedCaseExcludePropertyTypes_lowercasesTermsValues() {
        // Parity guard (#1541): mixed-case input must be lowercased before terms(),
        // mirroring the Postgres LOWER(pl.property_type) NOT IN (...) exclusion.
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null,
                List.of("Agricultural_Land", "PLOT"), null
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        List<Object> filter = getFilter(getBool(body));

        List<String> excludedValues = filter.stream()
                .map(f -> (Map<String, Object>) f)
                .filter(m -> m.containsKey("bool"))
                .map(m -> (Map<String, Object>) m.get("bool"))
                .filter(b -> b.containsKey("must_not"))
                .flatMap(b -> ((List<Object>) b.get("must_not")).stream())
                .map(c -> (Map<String, Object>) c)
                .filter(c -> c.containsKey("terms"))
                .map(c -> (Map<String, Object>) c.get("terms"))
                .filter(t -> t.containsKey("property_type"))
                .flatMap(t -> ((List<String>) t.get("property_type")).stream())
                .toList();

        assertThat(excludedValues).containsExactly("agricultural_land", "plot");
    }

    @Test
    void buildBoolQuery_withNullExcludePropertyTypes_noMustNotClause() {
        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filtersFor("udupi"), ANY_ACTIVE_AREA_KEYS);
        Map<String, Object> bool = getBool(body);

        // There must be no filter entry with a "bool.must_not" wrapping a property_type terms clause
        List<Object> filter = getFilter(bool);
        boolean hasMustNotBoolEntry = filter.stream().anyMatch(f -> {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) f;
            if (!m.containsKey("bool")) return false;
            @SuppressWarnings("unchecked")
            Map<String, Object> innerBool = (Map<String, Object>) m.get("bool");
            return innerBool.containsKey("must_not");
        });
        assertThat(hasMustNotBoolEntry).isFalse();
    }

    @Test
    void toFilters_propagatesListingPurpose() {
        DiscoverListingsQuery query = new DiscoverListingsQuery(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, 0, 20, false, "sale", null
        , null);

        DiscoverListingPredicateBuilder.Filters filters = DiscoverQueryDsl.toFilters(query);

        assertThat(filters.listingPurpose()).isEqualTo("sale");
    }

    @Test
    void listingPurpose_markersPath_addsTermClause() {
        // Confirms shared buildBoolQuery covers the markers path, not just listings
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, "rent", null, null
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        List<Object> filter = getFilter(getBool(body));

        assertThat(getTermValue(filter, "listing_purpose")).isEqualTo("rent");
    }

    @Test
    void listingPurpose_listingsQuery_addsTermClause() {
        // Covers the buildListingsQuery path (closes v1 code-reviewer advisory)
        DiscoverListingsQuery query = new DiscoverListingsQuery(
                null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, 0, 20, false, "sale", null
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildListingsQuery(query, ANY_ACTIVE_AREA_KEYS);
        List<Object> filter = getFilter(getBool(body));

        assertThat(getTermValue(filter, "listing_purpose")).isEqualTo("sale");
    }

    // ── areaKeys filter — OS parity tests ────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void buildBoolQuery_areaKeysPresent_addsTermsClause() {
        // Verifies the areaKeys filter generates a terms clause on area_key,
        // mirroring the Postgres AND pl.area_key IN (...) predicate.
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null,
                List.of("IN|KA|Udupi|Manipal", "IN|KA|Udupi|Katapadi")
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        List<Object> filterList = getFilter(getBool(body));

        // Find the terms clause for area_key
        boolean found = filterList.stream().anyMatch(clause -> {
            if (!(clause instanceof Map<?, ?> m)) return false;
            Object termsObj = m.get("terms");
            if (!(termsObj instanceof Map<?, ?> t)) return false;
            Object vals = t.get("area_key");
            return vals instanceof List<?> list
                    && list.contains("IN|KA|Udupi|Manipal")
                    && list.contains("IN|KA|Udupi|Katapadi");
        });
        assertThat(found)
                .as("Expected terms clause on area_key containing the two area keys")
                .isTrue();
    }

    @Test
    void buildBoolQuery_areaKeysNull_onlyTheGateAreaKeyTermsClausePresent() {
        // areaKeys absent → no SECOND (narrowing) terms clause on area_key (backward-compat);
        // exactly ONE area_key terms clause remains: the #1945 active-area_key gate itself.
        // Never a term(city_slug,...) clause (dead field, deleted per #1945).
        DiscoverListingPredicateBuilder.Filters filters = filtersFor("udupi");

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        List<Object> filterList = getFilter(getBool(body));

        assertThat(countAllAreaKeyTermsClauses(filterList))
                .as("only the gate's area_key terms clause when areaKeys is null")
                .isEqualTo(1);
        assertThat(hasAreaKeyTermsClause(filterList, ANY_ACTIVE_AREA_KEYS)).isTrue();
        assertThat(hasCitySlugTermClause(filterList)).isFalse();
    }

    @Test
    void buildBoolQuery_areaKeysAndGate_bothAreaKeyTermsClausesPresent_neverCitySlug() {
        // No-leakage: the #1945 active-area_key GATE clause and the separate, optional
        // areaKeys-NARROWING clause are both present (ANDed) — two distinct terms(area_key,...)
        // clauses with different value lists. Never a term(city_slug,...) clause.
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null,
                List.of("IN|KA|Udupi|Manipal")
        , null);

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters, ANY_ACTIVE_AREA_KEYS);
        List<Object> filterList = getFilter(getBool(body));

        assertThat(countAllAreaKeyTermsClauses(filterList))
                .as("gate clause + areaKeys-narrowing clause = two distinct terms(area_key,...) entries")
                .isEqualTo(2);
        assertThat(hasAreaKeyTermsClause(filterList, ANY_ACTIVE_AREA_KEYS))
                .as("the active-area_key gate clause must be present")
                .isTrue();
        assertThat(hasAreaKeyTermsClause(filterList, List.of("IN|KA|Udupi|Manipal")))
                .as("the areaKeys-narrowing clause must be present alongside the gate")
                .isTrue();
        assertThat(hasCitySlugTermClause(filterList)).isFalse();
    }

    @Test
    void toFilters_propagatesAreaKeys() {
        // toFilters() correctly threads areaKeys from DiscoverListingsQuery to Filters.
        DiscoverListingsQuery query = new DiscoverListingsQuery(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, 0, 20, false, null,
                List.of("IN|KA|Udupi|Manipal", "IN|KA|Udupi|Katapadi")
        , null);

        DiscoverListingPredicateBuilder.Filters filters = DiscoverQueryDsl.toFilters(query);

        assertThat(filters.areaKeys())
                .containsExactly("IN|KA|Udupi|Manipal", "IN|KA|Udupi|Katapadi");
    }

    // =========================================================================================
    // #1945 ANTI-DRIFT — build-breaking structural/contract test (AC9, EC20; structurally backs
    // EC4/EC6/EC8). Deliberately NOT @Disabled/@Tag(manual) — a future regression that drops the
    // gate clause or reintroduces term(city_slug,...) trips this test in the normal unit tier.
    // =========================================================================================

    private static final List<String> GATE_AREA_KEYS =
            List.of("gate-area-1", "gate-area-2", "gate-area-3");
    private static final List<String> NARROW_AREA_KEYS =
            List.of("narrow-area-only"); // deliberately disjoint from GATE_AREA_KEYS

    /** One representative Filters shape per row of the anti-drift sweep matrix. */
    private static List<DiscoverListingPredicateBuilder.Filters> antiDriftFilterShapes() {
        DiscoverListingPredicateBuilder.Bbox bbox =
                new DiscoverListingPredicateBuilder.Bbox(13.0, 74.5, 13.5, 75.0);
        List<DiscoverListingPredicateBuilder.Filters> shapes = new java.util.ArrayList<>();

        // no-city
        shapes.add(filtersFor(null));
        // city, no other filters ("city-active" / "city-inactive" are indistinguishable at the
        // DSL layer — both are just a resolved activeAreaKeys collection supplied by the caller;
        // the active/inactive DISTINCTION is exercised by the empty-set sweep below and by
        // CityActivationGuardTest / CityActiveGatingOpenSearchIT).
        shapes.add(filtersFor("udupi"));
        // +q
        shapes.add(new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, "apartment", null, null, null, null));
        // +bbox
        shapes.add(new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, bbox, null, null, null, null, null));
        // +areaKeys
        shapes.add(new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null,
                NARROW_AREA_KEYS, null));
        // +propertyTypes
        shapes.add(new DiscoverListingPredicateBuilder.Filters(
                "udupi", List.of("apartment", "villa"), null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null));
        // combo: q + bbox + areaKeys + propertyTypes, no city (blank/absent city case)
        shapes.add(new DiscoverListingPredicateBuilder.Filters(
                null, List.of("plot"), null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, bbox, "villa", null, null,
                NARROW_AREA_KEYS, null));
        // combo: everything at once, with city
        shapes.add(new DiscoverListingPredicateBuilder.Filters(
                "udupi", List.of("apartment"), 1_000_000L, 9_000_000L, "2024-01-01", "2024-12-31",
                List.of(2, 3, 4), List.of("OWNER"), Boolean.TRUE, Boolean.TRUE, Boolean.TRUE,
                Boolean.TRUE, null, 13.3, 74.7, 2.0, bbox, "flat", "sale",
                List.of("agricultural_land"), NARROW_AREA_KEYS, null));

        return shapes;
    }

    @Test
    void antiDrift_everyFilterShape_emitsExactlyOneGateAreaKeyTermsClause_neverEmitsCitySlugTerm() {
        for (DiscoverListingPredicateBuilder.Filters filters : antiDriftFilterShapes()) {
            Map<String, Object> markersBody = DiscoverQueryDsl.buildMarkersQuery(filters, GATE_AREA_KEYS);
            Map<String, Object> listingsBody = DiscoverQueryDsl.buildListingsQuery(
                    new DiscoverListingsQuery(
                            filters.city(), filters.propertyTypes(), filters.priceMinPaise(), filters.priceMaxPaise(),
                            filters.dateFrom(), filters.dateTo(), filters.bedrooms(), filters.sellerTypes(),
                            filters.backOnMarket(), filters.newToMarket(), filters.reraRegistered(), filters.readyToMove(),
                            filters.polygon(), filters.schoolLat(), filters.schoolLon(), filters.schoolRadiusKm(),
                            filters.q(), filters.bbox(), 0, 20, false, filters.listingPurpose(), filters.areaKeys(), null),
                    GATE_AREA_KEYS);

            for (Map<String, Object> body : List.of(markersBody, listingsBody)) {
                List<Object> filterList = getFilter(getBool(body));

                long gateClauseCount = countAreaKeyTermsClausesMatching(filterList, GATE_AREA_KEYS);
                assertThat(gateClauseCount)
                        .as("shape city=%s areaKeys=%s: exactly one terms(area_key, GATE_AREA_KEYS) clause",
                                filters.city(), filters.areaKeys())
                        .isEqualTo(1);

                assertThat(hasCitySlugTermClause(filterList))
                        .as("shape city=%s areaKeys=%s: NO term(city_slug,...) clause anywhere (#1945)",
                                filters.city(), filters.areaKeys())
                        .isFalse();
            }
        }
    }

    @Test
    void antiDrift_emptyActiveAreaKeySet_stillEmitsAreaKeyTermsClause_neverOmitted() {
        // EC20/AC9: an empty active set must emit terms(area_key, []) — matches nothing, but the
        // clause itself must NEVER be omitted (that would silently fall through to all-cities).
        Collection<String> emptySet = List.of();

        for (DiscoverListingPredicateBuilder.Filters filters : antiDriftFilterShapes()) {
            Map<String, Object> markersBody = DiscoverQueryDsl.buildMarkersQuery(filters, emptySet);
            List<Object> filterList = getFilter(getBool(markersBody));

            boolean hasEmptyAreaKeyClause = filterList.stream().anyMatch(f -> {
                if (!(f instanceof Map<?, ?> m)) return false;
                Object termsObj = m.get("terms");
                if (!(termsObj instanceof Map<?, ?> t)) return false;
                Object vals = t.get("area_key");
                return vals instanceof List<?> list && list.isEmpty();
            });
            assertThat(hasEmptyAreaKeyClause)
                    .as("shape city=%s: empty active set must still emit terms(area_key, []), never omit the clause",
                            filters.city())
                    .isTrue();
            assertThat(hasCitySlugTermClause(filterList)).isFalse();
        }
    }

    @Test
    void antiDrift_buildBoolQueryIsSoleChokepoint_sourceNeverReferencesCitySlugTermField() throws java.io.IOException {
        // Structural (source-level) proof that buildBoolQuery is the SOLE place bool.filter is
        // assembled, and that the dead city_slug field is never used as a term()/terms() filter
        // field anywhere in the production file — a future sibling method that builds its own
        // ad-hoc bool.filter (bypassing the chokepoint), or reintroduces a city_slug clause,
        // fails this test.
        File srcFile = findDiscoverQueryDslSource();
        String content = Files.readString(srcFile.toPath());

        // Exactly one buildBoolQuery method DEFINITION (not call sites).
        Matcher defMatcher = Pattern.compile(
                "private static Map<String, Object> buildBoolQuery\\(").matcher(content);
        int defCount = 0;
        while (defMatcher.find()) defCount++;
        assertThat(defCount)
                .as("exactly one buildBoolQuery method definition — the sole chokepoint")
                .isEqualTo(1);

        // Both public builders delegate to it.
        assertThat(content).contains("buildBoolQuery(filters, activeAreaKeys)");
        long callSiteCount = Pattern.compile("buildBoolQuery\\(").matcher(content).results().count();
        assertThat(callSiteCount)
                .as("buildBoolQuery is called by both buildListingsQuery and buildMarkersQuery, "
                        + "plus its own definition = 3 occurrences of the token")
                .isEqualTo(3);

        // The dead city_slug field must never appear as a term()/terms() filter field.
        assertThat(content)
                .as("#1945: city_slug must never be used as a term/terms filter field (dead field on the write path)")
                .doesNotContain("term(\"city_slug\"")
                .doesNotContain("terms(\"city_slug\"")
                .doesNotContain("\"city_slug\", f.city()");
    }

    private static File findDiscoverQueryDslSource() {
        File dir = new File(System.getProperty("user.dir"));
        String relPath = "src/main/java/com/example/realestate/discover/opensearch/DiscoverQueryDsl.java";
        for (int i = 0; i < 6 && dir != null; i++) {
            File candidate = new File(dir, relPath);
            if (candidate.isFile()) {
                return candidate;
            }
            dir = dir.getParentFile();
        }
        throw new IllegalStateException("Could not locate " + relPath + " by walking up from "
                + System.getProperty("user.dir"));
    }
}

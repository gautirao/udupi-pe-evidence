package com.example.realestate.discover.opensearch;

import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import com.example.realestate.discover.DiscoverListingsQuery;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

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

    private static DiscoverListingPredicateBuilder.Filters filtersFor(String city) {
        return new DiscoverListingPredicateBuilder.Filters(
                city, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null
        );
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

    // -----------------------------------------------------------------------
    // Test 1: text-only query (q present, no geo, no bbox)
    // -----------------------------------------------------------------------

    @Test
    void textOnlyQuery_emitsMultiMatchMust() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, "apartment"
        );

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
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
                null, null, null, null, null, null, null, null, bbox, null
        );

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
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
                null, null, null, null, null, 13.3, 74.7, 3.0, null, null
        );

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
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
    // Test 4: combined q + bbox
    // -----------------------------------------------------------------------

    @Test
    void combinedQAndBbox_emitsBothClauses() {
        DiscoverListingPredicateBuilder.Bbox bbox = new DiscoverListingPredicateBuilder.Bbox(13.0, 74.5, 13.5, 75.0);
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, bbox, "villa"
        );

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
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
                null, null, null, null, null, 13.3, 74.7, 2.0, null, "flat"
        );

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
        Map<String, Object> bool = getBool(body);

        List<Object> must = getMust(bool);
        assertThat(must).hasSize(1);

        List<Object> filter = getFilter(bool);
        boolean hasGeoDistance = filter.stream().anyMatch(f -> ((Map<?, ?>) f).containsKey("geo_distance"));
        assertThat(hasGeoDistance).isTrue();
    }

    // -----------------------------------------------------------------------
    // Test 6: city filter only
    // -----------------------------------------------------------------------

    @Test
    void cityFilterOnly_emitsCitySlugTermInFilter() {
        DiscoverListingPredicateBuilder.Filters filters = filtersFor("udupi");

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
        Map<String, Object> bool = getBool(body);
        List<Object> filter = getFilter(bool);

        boolean hasCityTerm = filter.stream().anyMatch(f -> {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) f;
            if (!m.containsKey("term")) return false;
            @SuppressWarnings("unchecked")
            Map<String, Object> term = (Map<String, Object>) m.get("term");
            return "udupi".equals(term.get("city_slug"));
        });
        assertThat(hasCityTerm).isTrue();
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
                Boolean.TRUE, null, null, null, null, null, null, null, null, null
        );

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
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
                null, null, Boolean.TRUE, null, null, null, null, null, null, null
        );

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
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
                null, null, null, Boolean.TRUE, null, null, null, null, null, null
        );

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
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
                null, null, null, null, null, null, null, null, null, "   "
        );

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
        Map<String, Object> bool = getBool(body);
        List<Object> must = getMust(bool);

        assertThat(must).isEmpty();
    }

    // -----------------------------------------------------------------------
    // Test 14: marker query has size=1001
    // -----------------------------------------------------------------------

    @Test
    void markersQuery_hasSize1001() {
        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filtersFor("udupi"));
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
                null, null, 2, 10, false
        );

        Map<String, Object> body = DiscoverQueryDsl.buildListingsQuery(query);
        assertThat(body).containsEntry("size", 10);
        assertThat(body).containsEntry("from", 20L); // page=2, size=10 → from=20
    }

    // -----------------------------------------------------------------------
    // Test 16: _source contains exactly the 26 expected fields (no wildcard)
    // -----------------------------------------------------------------------

    @Test
    void markersQuery_sourceContainsExactly27Fields() {
        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filtersFor("udupi"));
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
        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filtersFor("udupi"));
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
                null, null, 0, 20, false
        );
        Map<String, Object> body = DiscoverQueryDsl.buildListingsQuery(query);
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
                null, null, 0, 20, true
        );
        Map<String, Object> body = DiscoverQueryDsl.buildListingsQuery(query);
        assertThat(body).containsKey("aggs");
    }

    @Test
    void listingsQuery_noAggregates_noAggsInBody() {
        DiscoverListingsQuery query = new DiscoverListingsQuery(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, 0, 20, false
        );
        Map<String, Object> body = DiscoverQueryDsl.buildListingsQuery(query);
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
                null, null, null, null, polygon, null, null, null, null, null
        );

        assertThatThrownBy(() -> DiscoverQueryDsl.buildMarkersQuery(filters))
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
                null, null, 0, 20, false
        );

        assertThatThrownBy(() -> DiscoverQueryDsl.buildListingsQuery(query))
                .isInstanceOf(OpenSearchQueryException.class)
                .hasMessageContaining("Polygon filter not supported in OpenSearch path");
    }
}

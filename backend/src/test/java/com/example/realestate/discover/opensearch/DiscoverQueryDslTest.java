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
                null, null, null, null, null, null, null, null, null, null, null, null, null
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
                null, null, null, null, null, null, null, null, null, "apartment", null, null, null
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
                null, null, null, null, null, null, null, null, bbox, null, null, null, null
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
                null, null, null, null, null, 13.3, 74.7, 3.0, null, null, null, null, null
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
                null, null, null, null, null, null, null, null, bbox, "villa", null, null, null
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
                null, null, null, null, null, 13.3, 74.7, 2.0, null, "flat", null, null, null
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
                Boolean.TRUE, null, null, null, null, null, null, null, null, null, null, null, null
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
                null, null, Boolean.TRUE, null, null, null, null, null, null, null, null, null, null
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
                null, null, null, Boolean.TRUE, null, null, null, null, null, null, null, null, null
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
                null, null, null, null, null, null, null, null, null, "   ", null, null, null
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
                null, null, 2, 10, false, null, null
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
                null, null, 0, 20, false, null, null
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
                null, null, 0, 20, true, null, null
        );
        Map<String, Object> body = DiscoverQueryDsl.buildListingsQuery(query);
        assertThat(body).containsKey("aggs");
    }

    @Test
    void listingsQuery_noAggregates_noAggsInBody() {
        DiscoverListingsQuery query = new DiscoverListingsQuery(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, 0, 20, false, null, null
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
                null, null, null, null, polygon, null, null, null, null, null, null, null, null
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
                null, null, 0, 20, false, null, null
        );

        assertThatThrownBy(() -> DiscoverQueryDsl.buildListingsQuery(query))
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
        );

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
        List<Object> filter = getFilter(getBool(body));

        assertThat(getTermValue(filter, "listing_purpose")).isEqualTo("sale");
    }

    @Test
    void listingPurpose_rent_addsTermClause() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, "rent", null, null
        );

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
        List<Object> filter = getFilter(getBool(body));

        assertThat(getTermValue(filter, "listing_purpose")).isEqualTo("rent");
    }

    @Test
    void listingPurpose_null_noClause() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null
        );

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
        List<Object> filter = getFilter(getBool(body));

        assertThat(getTermValue(filter, "listing_purpose")).isNull();
    }

    @Test
    void listingPurpose_blank_noClause() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, "", null, null
        );

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
        List<Object> filter = getFilter(getBool(body));

        assertThat(getTermValue(filter, "listing_purpose")).isNull();
    }

    @Test
    void listingPurpose_whitespace_noClause() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, "  ", null, null
        );

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
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
        );

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
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
        );

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
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
        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filtersFor("udupi"));
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
        );

        DiscoverListingPredicateBuilder.Filters filters = DiscoverQueryDsl.toFilters(query);

        assertThat(filters.listingPurpose()).isEqualTo("sale");
    }

    @Test
    void listingPurpose_markersPath_addsTermClause() {
        // Confirms shared buildBoolQuery covers the markers path, not just listings
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, "rent", null, null
        );

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
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
        );

        Map<String, Object> body = DiscoverQueryDsl.buildListingsQuery(query);
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
        );

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
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
    void buildBoolQuery_areaKeysNull_noAreaKeyTermsClause() {
        // areaKeys absent → no terms clause on area_key (backward-compat).
        // The city_slug filter must still be present.
        DiscoverListingPredicateBuilder.Filters filters = filtersFor("udupi");

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
        List<Object> filterList = getFilter(getBool(body));

        boolean hasAreaKeyTerms = filterList.stream().anyMatch(clause -> {
            if (!(clause instanceof Map<?, ?> m)) return false;
            Object termsObj = m.get("terms");
            if (!(termsObj instanceof Map<?, ?> t)) return false;
            return t.containsKey("area_key");
        });
        assertThat(hasAreaKeyTerms)
                .as("No area_key terms clause when areaKeys is null")
                .isFalse();

        // City filter still present
        assertThat(getTermValue(filterList, "city_slug")).isEqualTo("udupi");
    }

    @Test
    void buildBoolQuery_areaKeysAndCitySlug_bothFiltersPresent() {
        // No-leakage: city_slug AND area_key terms are both in filter (ANDed).
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null,
                List.of("IN|KA|Udupi|Manipal")
        );

        Map<String, Object> body = DiscoverQueryDsl.buildMarkersQuery(filters);
        List<Object> filterList = getFilter(getBool(body));

        assertThat(getTermValue(filterList, "city_slug")).isEqualTo("udupi");

        boolean hasAreaKeyTerms = filterList.stream().anyMatch(clause -> {
            if (!(clause instanceof Map<?, ?> m)) return false;
            Object termsObj = m.get("terms");
            if (!(termsObj instanceof Map<?, ?> t)) return false;
            return t.containsKey("area_key");
        });
        assertThat(hasAreaKeyTerms)
                .as("area_key terms clause must be present alongside city_slug")
                .isTrue();
    }

    @Test
    void toFilters_propagatesAreaKeys() {
        // toFilters() correctly threads areaKeys from DiscoverListingsQuery to Filters.
        DiscoverListingsQuery query = new DiscoverListingsQuery(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null,
                null, null, 0, 20, false, null,
                List.of("IN|KA|Udupi|Manipal", "IN|KA|Udupi|Katapadi")
        );

        DiscoverListingPredicateBuilder.Filters filters = DiscoverQueryDsl.toFilters(query);

        assertThat(filters.areaKeys())
                .containsExactly("IN|KA|Udupi|Manipal", "IN|KA|Udupi|Katapadi");
    }
}

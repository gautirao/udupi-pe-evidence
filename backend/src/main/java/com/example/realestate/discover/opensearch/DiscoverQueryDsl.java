package com.example.realestate.discover.opensearch;

import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import com.example.realestate.discover.DiscoverListingsQuery;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Static factory that builds OpenSearch query DSL as {@code Map<String, Object>} structures.
 *
 * <p>Never uses string interpolation for user-supplied values — all values are placed
 * inside the map tree which Jackson serializes safely.
 *
 * <p>Correctness rules followed:
 * <ul>
 *   <li>FTS: only adds a {@code multi_match} must clause when {@code q} is non-blank.</li>
 *   <li>bedrooms=4 means "4+" (range gte:4). Mixed lists use a {@code should} with terms
 *       for exact values &lt; 4 and range for ≥ 4, with {@code minimum_should_match: 1}.</li>
 *   <li>city: {@code term} on {@code city_slug}.</li>
 *   <li>backOnMarket: {@code exists(back_to_market_at)} + {@code range(back_to_market_at ≥ now-30d)}.</li>
 *   <li>newToMarket: {@code range} on first_published_at or (should-fallback to) created_at.</li>
 *   <li>reraRegistered: {@code exists(rera_number)} — Java post-fetch validates the regex pattern.</li>
 *   <li>readyToMove: {@code term(possession_status: READY)}.</li>
 *   <li>bbox: {@code geo_bounding_box} on {@code location}.</li>
 *   <li>geo radius: {@code geo_distance} on {@code location}.</li>
 *   <li>status: always {@code term(status: LIVE)}.</li>
 * </ul>
 */
public final class DiscoverQueryDsl {

    /**
     * Explicit _source field list: exactly the 26 fields the adapters need.
     * No wildcard — keeps network payload predictable and prevents leaking PII fields.
     */
    static final List<String> SOURCE_FIELDS = List.of(
            "id", "listing_number", "property_type", "title", "locality", "area_key",
            "price_paise", "land_area", "land_area_unit", "built_area", "built_area_unit",
            "bedrooms", "latitude", "longitude", "hero_image_url",
            "created_at", "updated_at", "first_published_at", "last_updated_at",
            "back_to_market_at", "rera_number", "trust_tier", "possession_status",
            "seller_type", "listing_purpose", "status", "city_slug"
    );

    private static final int MARKERS_FETCH_LIMIT = 1001; // CAP + 1 sentinel

    private DiscoverQueryDsl() {
        // static factory only
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Builds the query body for the markers endpoint.
     *
     * @param filters validated filters from the controller
     * @return query body as a Map suitable for Jackson serialization
     */
    public static Map<String, Object> buildMarkersQuery(DiscoverListingPredicateBuilder.Filters filters) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("_source", SOURCE_FIELDS);
        body.put("size", MARKERS_FETCH_LIMIT);
        body.put("query", buildBoolQuery(filters));
        body.put("sort", List.of(Map.of("created_at", Map.of("order", "desc"))));
        return body;
    }

    /**
     * Builds the query body for the listings endpoint, including pagination and optional aggregations.
     *
     * @param query validated query from the controller
     * @return query body as a Map suitable for Jackson serialization
     */
    public static Map<String, Object> buildListingsQuery(DiscoverListingsQuery query) {
        DiscoverListingPredicateBuilder.Filters filters = toFilters(query);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("_source", SOURCE_FIELDS);
        body.put("size", query.size());
        body.put("from", (long) query.page() * query.size());
        body.put("track_total_hits", true);
        body.put("query", buildBoolQuery(filters));
        body.put("sort", List.of(Map.of("created_at", Map.of("order", "desc"))));

        if (query.includeAggregates()) {
            body.put("aggs", buildAggregations());
        }

        return body;
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    /**
     * Converts a {@link DiscoverListingsQuery} into {@link DiscoverListingPredicateBuilder.Filters}.
     * Package-private for testability; mirrors {@code DiscoverListingsService.toFilters}.
     */
    static DiscoverListingPredicateBuilder.Filters toFilters(DiscoverListingsQuery q) {
        return new DiscoverListingPredicateBuilder.Filters(
                q.city(),
                q.propertyTypes(),
                q.priceMinPaise(),
                q.priceMaxPaise(),
                q.dateFrom(),
                q.dateTo(),
                q.bedrooms(),
                q.sellerTypes(),
                q.backOnMarket(),
                q.newToMarket(),
                q.reraRegistered(),
                q.readyToMove(),
                q.polygon(),
                q.schoolLat(),
                q.schoolLon(),
                q.schoolRadiusKm(),
                q.bbox(),
                q.q(),
                null  // listingPurpose: OpenSearch path does not filter by intent — no term query wired in buildBoolQuery
        );
    }

    private static Map<String, Object> buildBoolQuery(DiscoverListingPredicateBuilder.Filters f) {
        // Polygon filter is not supported in the OpenSearch path. Throwing here causes the
        // routing service to catch and fall back to Postgres, which handles ST_Contains natively.
        if (f.polygon() != null && !f.polygon().isEmpty()) {
            throw new OpenSearchQueryException(
                    "Polygon filter not supported in OpenSearch path — use Postgres path");
        }

        List<Object> must = new ArrayList<>();
        List<Object> filter = new ArrayList<>();

        // Always: status = LIVE
        filter.add(term("status", "LIVE"));

        // city_slug filter
        if (f.city() != null && !f.city().isBlank()) {
            filter.add(term("city_slug", f.city()));
        }

        // FTS: only when q is non-blank
        String normQ = (f.q() != null && !f.q().isBlank()) ? f.q().trim() : null;
        if (normQ != null) {
            must.add(multiMatch(normQ));
        }

        // propertyTypes
        if (f.propertyTypes() != null && !f.propertyTypes().isEmpty()) {
            filter.add(terms("property_type", f.propertyTypes()));
        }

        // sellerTypes
        if (f.sellerTypes() != null && !f.sellerTypes().isEmpty()) {
            filter.add(terms("seller_type", f.sellerTypes()));
        }

        // priceMin / priceMax
        if (f.priceMinPaise() != null || f.priceMaxPaise() != null) {
            Map<String, Object> rangeClause = new LinkedHashMap<>();
            if (f.priceMinPaise() != null) rangeClause.put("gte", f.priceMinPaise());
            if (f.priceMaxPaise() != null) rangeClause.put("lte", f.priceMaxPaise());
            filter.add(range("price_paise", rangeClause));
        }

        // dateFrom / dateTo on created_at
        if (f.dateFrom() != null || f.dateTo() != null) {
            Map<String, Object> rangeClause = new LinkedHashMap<>();
            if (f.dateFrom() != null) rangeClause.put("gte", f.dateFrom());
            if (f.dateTo() != null) rangeClause.put("lte", f.dateTo());
            filter.add(range("created_at", rangeClause));
        }

        // bedrooms: 4 means "4+". Mixed list with 4 → should with terms + range.
        if (f.bedrooms() != null && !f.bedrooms().isEmpty()) {
            filter.add(buildBedroomsClause(f.bedrooms()));
        }

        // backOnMarket: exists(back_to_market_at) AND range(gte: now-30d/d)
        if (Boolean.TRUE.equals(f.backOnMarket())) {
            filter.add(exists("back_to_market_at"));
            filter.add(range("back_to_market_at", Map.of("gte", "now-30d/d")));
        }

        // newToMarket: range on first_published_at, fallback to created_at via should.
        // Use a should with minimum_should_match=1: either first_published_at gte now-7d
        // OR (first_published_at is absent AND created_at gte now-7d).
        if (Boolean.TRUE.equals(f.newToMarket())) {
            filter.add(buildNewToMarketClause());
        }

        // reraRegistered: exists(rera_number). Regex validation is done in Java post-fetch.
        if (Boolean.TRUE.equals(f.reraRegistered())) {
            filter.add(exists("rera_number"));
        }

        // readyToMove: term(possession_status: READY)
        if (Boolean.TRUE.equals(f.readyToMove())) {
            filter.add(term("possession_status", "READY"));
        }

        // bbox: geo_bounding_box on location field
        if (f.bbox() != null) {
            DiscoverListingPredicateBuilder.Bbox b = f.bbox();
            filter.add(Map.of("geo_bounding_box", Map.of("location", Map.of(
                    "top_left", Map.of("lat", b.north(), "lon", b.west()),
                    "bottom_right", Map.of("lat", b.south(), "lon", b.east())
            ))));
        }

        // geo radius (school proximity): geo_distance on location field
        if (f.schoolLat() != null && f.schoolLon() != null) {
            double radiusKm = f.schoolRadiusKm() != null ? f.schoolRadiusKm() : 2.0;
            filter.add(Map.of("geo_distance", Map.of(
                    "distance", String.format("%.6fkm", radiusKm),
                    "location", Map.of("lat", f.schoolLat(), "lon", f.schoolLon())
            )));
        }

        Map<String, Object> bool = new LinkedHashMap<>();
        if (!must.isEmpty()) bool.put("must", must);
        if (!filter.isEmpty()) bool.put("filter", filter);

        return Map.of("bool", bool);
    }

    /**
     * Bedrooms filter: 4 means "4 or more" per the Postgres service contract.
     *
     * <ul>
     *   <li>All values &lt; 4: plain terms filter</li>
     *   <li>Only 4: range(gte: 4)</li>
     *   <li>Mix (some &lt; 4, and 4): should with terms([exact values]) + range(gte: 4),
     *       minimum_should_match: 1</li>
     * </ul>
     */
    static Map<String, Object> buildBedroomsClause(List<Integer> bedrooms) {
        boolean hasFour = bedrooms.contains(4);
        List<Integer> exact = bedrooms.stream().filter(b -> b < 4).toList();

        if (!hasFour) {
            return terms("bedrooms", exact);
        }
        if (exact.isEmpty()) {
            return range("bedrooms", Map.of("gte", 4));
        }
        // Mixed: should with minimum_should_match=1
        List<Object> should = new ArrayList<>();
        should.add(terms("bedrooms", exact));
        should.add(range("bedrooms", Map.of("gte", 4)));
        return Map.of("bool", Map.of("should", should, "minimum_should_match", 1));
    }

    /**
     * newToMarket: listings with first_published_at in the last 7 days, falling back to
     * created_at when first_published_at is absent. Mirrored from the Postgres predicate:
     * {@code COALESCE(first_published_at::date, created_at::date) >= CURRENT_DATE - 7 days}.
     *
     * <p>OpenSearch cannot evaluate COALESCE in a DSL clause, so we use a should with
     * minimum_should_match=1:
     * <ol>
     *   <li>first_published_at exists AND is in range</li>
     *   <li>first_published_at does NOT exist AND created_at is in range</li>
     * </ol>
     */
    static Map<String, Object> buildNewToMarketClause() {
        // branch 1: first_published_at present and in range
        Map<String, Object> branch1 = Map.of("bool", Map.of(
                "filter", List.of(
                        exists("first_published_at"),
                        range("first_published_at", Map.of("gte", "now-7d/d", "lte", "now/d"))
                )
        ));

        // branch 2: first_published_at absent, created_at in range
        Map<String, Object> branch2 = Map.of("bool", Map.of(
                "must_not", List.of(exists("first_published_at")),
                "filter", List.of(range("created_at", Map.of("gte", "now-7d/d", "lte", "now/d")))
        ));

        return Map.of("bool", Map.of(
                "should", List.of(branch1, branch2),
                "minimum_should_match", 1
        ));
    }

    private static Map<String, Object> buildAggregations() {
        return Map.of("locality_agg", Map.of(
                "terms", Map.of("field", "locality.keyword", "size", 6)
        ));
    }

    // -----------------------------------------------------------------------
    // Primitive DSL helpers
    // -----------------------------------------------------------------------

    private static Map<String, Object> term(String field, Object value) {
        return Map.of("term", Map.of(field, value));
    }

    private static Map<String, Object> terms(String field, List<?> values) {
        return Map.of("terms", Map.of(field, values));
    }

    private static Map<String, Object> range(String field, Map<String, Object> bounds) {
        return Map.of("range", Map.of(field, bounds));
    }

    private static Map<String, Object> exists(String field) {
        return Map.of("exists", Map.of("field", field));
    }

    /**
     * Builds the {@code multi_match} clause used for full-text search.
     *
     * <p>NOTE: OpenSearch multi_match(operator=and) is semantically similar to but not identical
     * to the Postgres path which uses {@code pl.search_vector @@ websearch_to_tsquery('english', ?)}.
     * Known differences: (1) Postgres uses an English-stemmed tsvector; OpenSearch uses the
     * 'standard' analyzer on title/locality/description unless re-mapped. (2) BM25 ranking
     * may score results differently. This divergence is an accepted product decision for this
     * phase — full FTS parity is tracked as a follow-up (issue #1317 scope: functional
     * correctness only, not ranking parity).
     */
    private static Map<String, Object> multiMatch(String query) {
        return Map.of("multi_match", Map.of(
                "query", query,
                "fields", List.of("title", "locality", "description"),
                "operator", "and"
        ));
    }
}

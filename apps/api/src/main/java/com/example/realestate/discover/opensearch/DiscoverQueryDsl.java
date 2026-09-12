package com.example.realestate.discover.opensearch;

import com.example.realestate.discover.DiscoverFilterNormalizer;
import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import com.example.realestate.discover.DiscoverListingsQuery;
import com.example.realestate.discover.DiscoverPrimaryArea;
import com.example.realestate.listing.area.AreaNormalizer;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collection;
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
 *   <li>city: active-city allow-list — {@code terms} on {@code area_key}, ALWAYS applied
 *       (never omitted, even when empty), sourced live from {@code CityActivationGuard}
 *       (#1945). {@code city_slug} is a dead field on the write path and is never filtered on.</li>
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
     * Explicit _source field list: exactly the fields the adapters need — no more.
     * No wildcard — keeps network payload predictable and prevents leaking PII fields.
     */
    static final List<String> SOURCE_FIELDS = List.of(
            "id", "listing_number", "property_type", "title", "locality", "area_key",
            "price_paise", "land_area", "land_area_unit", "built_area", "built_area_unit",
            "bedrooms", "latitude", "longitude", "hero_image_url",
            "created_at", "updated_at", "first_published_at", "last_updated_at",
            "back_to_market_at", "rera_number", "trust_tier", "possession_status",
            "seller_type", "listing_purpose", "status", "city_slug",
            // #2431 — required by OpenSearchHitMapper.toListing so the OpenSearch-backed
            // DiscoverListingResponse carries the same commercialSubtype the Postgres-backed one
            // does. Omitting it would make the two engines return DIFFERENT DTOs for the same
            // listing, which is the divergence the shared buildListing funnel exists to prevent.
            "commercial_subtype"
    );

    private static final int MARKERS_FETCH_LIMIT = 1001; // CAP + 1 sentinel

    /** Scale used when expressing a sq-ft bound in a row's own unit (#2459). Fine enough that the
     *  division is EXACT wherever a stored decimal could land on the boundary. */
    private static final int BOUND_CONVERSION_SCALE = 20;

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
     * @param activeAreaKeys the requested city's active {@code area_key} allow-list (from
     *                       {@link com.example.realestate.discover.CityActivationGuard#activeAreaKeysForCity});
     *                       always applied, even when empty
     * @return query body as a Map suitable for Jackson serialization
     */
    public static Map<String, Object> buildMarkersQuery(DiscoverListingPredicateBuilder.Filters filters,
                                                         Collection<String> activeAreaKeys) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("_source", SOURCE_FIELDS);
        body.put("size", MARKERS_FETCH_LIMIT);
        body.put("query", buildBoolQuery(filters, activeAreaKeys));
        body.put("sort", List.of(Map.of("created_at", Map.of("order", "desc"))));
        return body;
    }

    /**
     * Builds the query body for the listings endpoint, including pagination and optional aggregations.
     *
     * @param query validated query from the controller
     * @param activeAreaKeys the requested city's active {@code area_key} allow-list (from
     *                       {@link com.example.realestate.discover.CityActivationGuard#activeAreaKeysForCity});
     *                       always applied, even when empty
     * @return query body as a Map suitable for Jackson serialization
     */
    public static Map<String, Object> buildListingsQuery(DiscoverListingsQuery query,
                                                          Collection<String> activeAreaKeys) {
        DiscoverListingPredicateBuilder.Filters filters = toFilters(query);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("_source", SOURCE_FIELDS);
        body.put("size", query.size());
        body.put("from", (long) query.page() * query.size());
        body.put("track_total_hits", true);
        body.put("query", buildBoolQuery(filters, activeAreaKeys));
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
                q.commercialSubtypes(),
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
                q.listingPurpose(),
                // KNOWN DIVERGENCE (#2461), deliberate while this backend is dormant.
                // DiscoverListingsService.toFilters — the Postgres mirror of this method — now
                // stamps CityAreaListingsService.AREA_FIRST_EXCLUDED_PROPERTY_TYPES when a POLYGON
                // scope is committed, so a Residential shopper who draws a search area is never
                // offered agricultural_land. This method does NOT, so enabling
                // discover.opensearch.enabled would re-leak agricultural_land into polygon-scoped
                // cards and counts. buildBoolQuery below already honours excludePropertyTypes (the
                // #1541 must_not parity filter), so closing this is a one-line change here — it was
                // left out of #2461 only because the flag is a literal false repo-wide. Fix this
                // BEFORE turning that flag on.
                null,      // excludePropertyTypes — OS responses don't carry this input param
                q.areaKeys(),
                q.viewportScope(),
                q.areaMinSqft(),
                q.areaMaxSqft()
        );
    }

    private static Map<String, Object> buildBoolQuery(DiscoverListingPredicateBuilder.Filters rawFilters,
                                                        Collection<String> activeAreaKeys) {
        // #1956 PR1 review fix (AC1.16): canonicalise the filter vocabulary through the SAME
        // normaliser DiscoverListingPredicateBuilder#build applies, so the OpenSearch engine and the
        // Postgres engine behind the same Filters cannot disagree on casing/allowlisting — and
        // neither can disagree with the navigation count computed from the same raw input.
        DiscoverListingPredicateBuilder.Filters f = DiscoverFilterNormalizer.normalize(rawFilters);

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

        // Active-city allow-list (#1945): keyed on area_key (always populated), NOT city_slug
        // (a dead field — the Java indexer hardcodes it null). Mirrors the Postgres invariant
        // in DiscoverListingPredicateBuilder.build exactly: the requested city's active areas,
        // resolved LIVE per request via CityActivationGuard.activeAreaKeysForCity. ALWAYS
        // applied — including when the set is empty (terms(area_key, []) — matches nothing,
        // never omitted — so a blank/unknown/inactive city fails closed instead of falling
        // through to an all-cities result.
        filter.add(terms("area_key", List.copyOf(activeAreaKeys)));

        // FTS: only when q is non-blank
        String normQ = (f.q() != null && !f.q().isBlank()) ? f.q().trim() : null;
        if (normQ != null) {
            must.add(multiMatch(normQ));
        }

        // propertyTypes + commercialSubtypes (#2458) -- the OpenSearch twin of the Postgres union
        // in DiscoverListingPredicateBuilder#appendFamilySubtypeUnion.
        //
        // MEMBERSHIP IS IDENTICAL ON BOTH ENGINES, which is #2458's HOLD condition:
        //   * property_type and commercial_subtype are both `keyword` fields, so `terms` is an
        //     exact non-analysed match -- the same comparison the SQL side performs.
        //   * Both sides receive values from the SAME DiscoverFilterNormalizer.normalize call and
        //     the SAME SUBTYPE_BEARING_PROPERTY_TYPES / impliedPropertyTypes helpers, so neither
        //     the vocabulary nor the bearing/non-bearing split can drift between engines.
        //   * A document with NO commercial_subtype (non-commercial listings, and legacy
        //     property_type='commercial' rows whose subtype was never recorded) does not match a
        //     `terms` clause -- mirroring `NULL IN (...)` being NULL rather than TRUE in Postgres.
        //     Neither engine can fabricate a Shop/Office classification for a NULL row.
        //   * Legacy Building/Warehouse/Land rows carry no subtype on any axis, so BOTH engines
        //     match them through the property_type branch, never the subtype branch.
        //
        // The OR is a NESTED bool/should with minimum_should_match=1 -- the DSL equivalent of the
        // SQL parentheses. Nesting rather than adding `should` to the OUTER bool is what keeps it
        // isolated from sibling filters; a bare outer `should` would not constrain results the same
        // way, which is the DSL-side shape of the #2461/#2475 parenthesisation hazard.
        boolean dslHasTypes = f.propertyTypes() != null && !f.propertyTypes().isEmpty();
        boolean dslHasSubtypes = f.commercialSubtypes() != null && !f.commercialSubtypes().isEmpty();

        if (!dslHasSubtypes) {
            // Byte-identical to the pre-#2458 clause: every Residential, Agricultural and
            // broad-Commercial query takes this branch.
            if (dslHasTypes) {
                filter.add(terms("property_type", f.propertyTypes()));
            }
        } else {
            List<String> dslEffective = dslHasTypes
                    ? f.propertyTypes()
                    : DiscoverFilterNormalizer.impliedPropertyTypes(f.commercialSubtypes());
            List<String> dslNamed =
                    DiscoverFilterNormalizer.impliedPropertyTypes(f.commercialSubtypes());

            List<String> dslBearing = dslEffective.stream()
                    .filter(DiscoverFilterNormalizer.SUBTYPE_BEARING_PROPERTY_TYPES::contains)
                    .toList();
            List<String> dslNonBearing = dslEffective.stream()
                    .filter(t -> !DiscoverFilterNormalizer.SUBTYPE_BEARING_PROPERTY_TYPES.contains(t))
                    .filter(dslNamed::contains)
                    .toList();

            List<Map<String, Object>> unionShould = new ArrayList<>();
            if (!dslNonBearing.isEmpty()) {
                unionShould.add(terms("property_type", dslNonBearing));
            }
            if (!dslBearing.isEmpty()) {
                Map<String, Object> bearingBool = new LinkedHashMap<>();
                bearingBool.put("filter", List.of(
                        terms("property_type", dslBearing),
                        terms("commercial_subtype", f.commercialSubtypes())));
                Map<String, Object> bearingClause = new LinkedHashMap<>();
                bearingClause.put("bool", bearingBool);
                unionShould.add(bearingClause);
            }

            if (unionShould.isEmpty()) {
                // Neither branch satisfiable -- match nothing, rather than omitting the clause and
                // silently widening to every property type.
                filter.add(terms("property_type", List.of()));
            } else {
                Map<String, Object> unionBool = new LinkedHashMap<>();
                unionBool.put("should", unionShould);
                unionBool.put("minimum_should_match", 1);
                Map<String, Object> unionClause = new LinkedHashMap<>();
                unionClause.put("bool", unionBool);
                filter.add(unionClause);
            }
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

        // listing_purpose intent filter — absent/blank = no clause (backward-compat)
        String normPurpose = (f.listingPurpose() != null && !f.listingPurpose().isBlank())
                ? f.listingPurpose().trim() : null;
        if (normPurpose != null) {
            filter.add(term("listing_purpose", normPurpose));
        }

        // excludePropertyTypes — must_not exclusion wrapped as a bool filter entry (backward-compat).
        // Values are lowercased to mirror the Postgres LOWER(pl.property_type) NOT IN (...) parity
        // (DiscoverListingPredicateBuilder), so casing drift between stores cannot diverge (#1541).
        if (f.excludePropertyTypes() != null && !f.excludePropertyTypes().isEmpty()) {
            List<String> excludeLower = f.excludePropertyTypes().stream()
                    .map(String::toLowerCase)
                    .toList();
            filter.add(Map.of("bool", Map.of("must_not", List.of(terms("property_type", excludeLower)))));
        }

        // area bounds (#2459) — the OpenSearch twin of the Postgres primary-area predicate in
        // DiscoverListingPredicateBuilder#build.
        if (f.areaMinSqft() != null || f.areaMaxSqft() != null) {
            filter.add(buildPrimaryAreaClause(f.areaMinSqft(), f.areaMaxSqft()));
        }

        // areaKeys — restrict to specific area_key values (group-scoped browse).
        // null = absent param → no clause (backward-compatible with existing journeys).
        // Empty list is rejected at the controller layer (400), so this only fires for
        // non-empty lists. Mirrors the Postgres AND pl.area_key IN (...) predicate; both
        // apply AND-with the city_slug filter above, so no out-of-group leakage is possible.
        if (f.areaKeys() != null && !f.areaKeys().isEmpty()) {
            filter.add(terms("area_key", f.areaKeys()));
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

    /**
     * The contextual square-foot filter (#2459), mirrored from the Postgres predicate.
     *
     * <h2>Why a should-union of (property types × unit) branches</h2>
     *
     * <p>The DSL has no {@code CASE} and no arithmetic on a stored field, so the Postgres
     * expression — "pick this row's primary-area column pair, convert its value to sq ft, compare"
     * — is inverted: the BOUNDS are converted into each unit, and each
     * {@code (column pair, unit)} combination becomes one {@code should} branch. A document matches
     * iff exactly one branch can apply to it, because a row has one {@code property_type} and one
     * unit value.
     *
     * <p>Both sides enumerate {@link DiscoverPrimaryArea#columnGroups()} and
     * {@link AreaNormalizer.AreaUnit}, so neither the property-type grouping nor the unit
     * vocabulary nor the conversion factors can drift between engines — which is #2459's R2 hold
     * condition. In particular <b>the UNRESOLVED decision is identical by construction</b>: a
     * property type named by no group appears in no branch here and hits {@code ELSE NULL} there; a
     * missing or unrecognised unit matches no branch here and no {@code WHEN} arm there; a
     * non-positive value is excluded by the {@code gt: 0} clause here and by
     * {@code value <= 0 THEN NULL} there.
     *
     * <h2>Two residual, deliberate differences</h2>
     *
     * <ol>
     *   <li><b>Bound conversion vs value conversion.</b> Postgres compares
     *       {@code ROUND(value * factor, 6)} against the bound; this compares {@code value} against
     *       {@code bound / factor} computed at scale 20. Where the quotient terminates within that
     *       scale the two agree exactly, including at an inclusive boundary; where it does not, no
     *       finite stored decimal can land exactly on the boundary anyway, so the difference is not
     *       reachable by a real row.</li>
     *   <li><b>Unit casing.</b> Postgres lower-cases and whitespace-collapses the unit column
     *       row-side; a {@code terms} clause cannot. The aliases emitted here are the canonical
     *       lower-case spellings, which is what every stored row carries (measured: built units are
     *       {@code sqft}×1866 / {@code sqm}×1, land units {@code acre}×86 / {@code cent}×30 /
     *       {@code sqft}×29 — no other spelling and no other casing exists). A hypothetical
     *       {@code "SqFt"} row would be UNRESOLVED here and resolved there. This is stated rather
     *       than hidden; closing it needs an index-side normalizer on the unit fields, which is a
     *       mapping change and out of scope for a predicate-only step.</li>
     * </ol>
     */
    public static Map<String, Object> buildPrimaryAreaClause(Integer areaMinSqft, Integer areaMaxSqft) {
        List<Object> should = new ArrayList<>();

        for (DiscoverPrimaryArea.ColumnGroup group : DiscoverPrimaryArea.columnGroups()) {
            for (AreaNormalizer.AreaUnit unit : AreaNormalizer.AreaUnit.values()) {
                List<Object> branchFilter = new ArrayList<>();
                branchFilter.add(terms("property_type", group.propertyTypes()));
                branchFilter.add(terms(group.unitColumn(), unit.aliases()));
                // value > 0 — the DSL half of AreaNormalizer#toSqft's "non-positive is no area".
                // Emitted unconditionally, so a caller asking for `areaMinSqft=0` does not silently
                // admit zero/negative-area rows the Postgres side rejects.
                branchFilter.add(range(group.areaColumn(), Map.of("gt", 0)));

                Map<String, Object> bounds = new LinkedHashMap<>();
                if (areaMinSqft != null) {
                    bounds.put("gte", inUnit(areaMinSqft, unit));
                }
                if (areaMaxSqft != null) {
                    bounds.put("lte", inUnit(areaMaxSqft, unit));
                }
                branchFilter.add(range(group.areaColumn(), bounds));

                Map<String, Object> branchBool = new LinkedHashMap<>();
                branchBool.put("filter", branchFilter);
                Map<String, Object> branch = new LinkedHashMap<>();
                branch.put("bool", branchBool);
                should.add(branch);
            }
        }

        Map<String, Object> unionBool = new LinkedHashMap<>();
        unionBool.put("should", should);
        unionBool.put("minimum_should_match", 1);
        Map<String, Object> clause = new LinkedHashMap<>();
        clause.put("bool", unionBool);
        return clause;
    }

    /** A sq-ft bound expressed in {@code unit}, at a scale fine enough that the division is exact
     *  wherever a stored value could land on the boundary. */
    private static BigDecimal inUnit(int boundSqft, AreaNormalizer.AreaUnit unit) {
        BigDecimal converted = BigDecimal.valueOf(boundSqft)
                .divide(unit.sqftFactor(), BOUND_CONVERSION_SCALE, RoundingMode.HALF_UP)
                .stripTrailingZeros();
        // stripTrailingZeros turns an integral result into scientific notation (100 -> 1E+2),
        // which is numerically identical but renders unrecognisably in a query body and in a log.
        return converted.scale() < 0 ? converted.setScale(0) : converted;
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

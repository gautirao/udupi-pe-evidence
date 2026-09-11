package com.example.realestate.discover;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Builds the shared WHERE fragment + positional params used by both
 * DiscoverListingsService and DiscoverMarkersService.
 *
 * <p>Having a single static method guarantees that both endpoints filter on
 * exactly the same predicate for the same input — the consistency gate is
 * structural, not behavioural.
 */
public class DiscoverListingPredicateBuilder {

    /**
     * Validated bounding box: south, west, north, east in decimal degrees.
     *
     * <p>All four values are in [-90,90] × [-180,180] with south ≤ north and west ≤ east.
     * Antimeridian-crossing boxes are rejected at the controller layer.
     */
    public record Bbox(double south, double west, double north, double east) {}

    public record Filters(
            String city,
            List<String> propertyTypes,
            /**
             * Commercial subtype narrowing filter (#2431): {@code SHOP} / {@code OFFICE}, the two
             * values {@code property_type = 'commercial'} is ambiguous between. {@code null} or
             * empty = no filter.
             *
             * <p>Canonicalised (upper-cased, allowlisted, deduped, sorted) by
             * {@link DiscoverFilterNormalizer#normalizeCommercialSubtypes} inside {@link #build},
             * exactly like {@code propertyTypes}/{@code sellerTypes} — so no caller can produce a
             * {@code Filters} whose predicate disagrees with the count computed from the same raw
             * input.
             */
            List<String> commercialSubtypes,
            Long priceMinPaise,       // already converted from rupees by caller
            Long priceMaxPaise,
            String dateFrom,          // ISO-8601 date string, nullable
            String dateTo,
            List<Integer> bedrooms,   // 4 means "4+"
            List<String> sellerTypes,
            Boolean backOnMarket,
            Boolean newToMarket,
            Boolean reraRegistered,
            Boolean readyToMove,
            List<List<Double>> polygon,   // [[lat,lon],...] ≥3 vertices, nullable
            Double schoolLat,
            Double schoolLon,
            Double schoolRadiusKm,         // default 2.0 when schoolLat+schoolLon provided
            Bbox bbox,                     // viewport rectangle filter, nullable
            String q,                      // keyword search query; null/blank = no FTS filter
            String listingPurpose,         // 'sale' or 'rent'; null = no filter
            List<String> excludePropertyTypes,  // property types to exclude via NOT IN; null = no exclusion
            List<String> areaKeys,         // restrict to specific area_keys (group members); null = no filter; MUST NOT be empty
            Bbox viewportScope              // #2015 "Search this area" candidate result scope; boundary-inclusive rectangle filter, nullable
    ) {

        /**
         * Backward-compatible constructor for the pre-#2431 22-component shape (no
         * {@code commercialSubtypes}). Defaults the new field to {@code null} — "no subtype
         * filter" — which is byte-for-byte the behaviour every one of these call sites had
         * before the field existed.
         *
         * <p>Kept so that the seven summary/navigation/agri/school call sites that have no
         * concept of a commercial subtype do not have to thread a literal {@code null} through
         * a 23-argument constructor. The two call sites that DO carry the filter
         * ({@code DiscoverListingsService#toFilters}, {@code DiscoverMarkersController}) use the
         * canonical constructor explicitly.
         */
        @SuppressWarnings("java:S107") // mirrors the pre-#2431 record shape verbatim
        public Filters(
                String city,
                List<String> propertyTypes,
                Long priceMinPaise,
                Long priceMaxPaise,
                String dateFrom,
                String dateTo,
                List<Integer> bedrooms,
                List<String> sellerTypes,
                Boolean backOnMarket,
                Boolean newToMarket,
                Boolean reraRegistered,
                Boolean readyToMove,
                List<List<Double>> polygon,
                Double schoolLat,
                Double schoolLon,
                Double schoolRadiusKm,
                Bbox bbox,
                String q,
                String listingPurpose,
                List<String> excludePropertyTypes,
                List<String> areaKeys,
                Bbox viewportScope
        ) {
            this(city, propertyTypes, null, priceMinPaise, priceMaxPaise, dateFrom, dateTo,
                    bedrooms, sellerTypes, backOnMarket, newToMarket, reraRegistered, readyToMove,
                    polygon, schoolLat, schoolLon, schoolRadiusKm, bbox, q, listingPurpose,
                    excludePropertyTypes, areaKeys, viewportScope);
        }
    }

    /**
     * Assembled SQL fragment + bound params + derived flags.
     *
     * <p>{@code bboxApplied} is {@code true} iff a non-null {@link Bbox} was present in the
     * {@link Filters} and the {@code ST_MakeEnvelope} predicate was appended to the WHERE
     * fragment. Callers must derive the response {@code boundsApplied} field from this flag
     * rather than re-inspecting {@code filters.bbox() != null}, so the flag stays correct if
     * the builder ever adds further bbox validity checks.
     */
    public record Sql(String whereFragment, List<Object> params, boolean bboxApplied) {}

    /**
     * Assembles the shared WHERE fragment.
     *
     * <p><b>The filter vocabulary is canonicalised HERE, first thing</b> (#1956 PR1 review fix,
     * AC1.16) — {@code listingPurpose}, {@code propertyTypes}, {@code bedrooms} and
     * {@code sellerTypes} are routed through {@link DiscoverFilterNormalizer#normalize} before a
     * single clause is appended. Doing it inside {@code build} rather than at each call site is what
     * makes it unbypassable: no caller can produce a {@code Filters} whose predicate disagrees with
     * the navigation count computed from the same raw input (which normalises via
     * {@code AreaCountQuery}'s compact constructor, using the SAME helpers). See
     * {@link DiscoverFilterNormalizer}'s class javadoc for the four divergences this closes.
     */
    /**
     * Emits the #2458 family/subtype union as ONE parenthesised clause.
     *
     * <pre>
     *   AND ( pl.property_type IN (&lt;non-bearing selected&gt;)
     *         OR ( pl.property_type IN (&lt;bearing selected&gt;)
     *              AND EXISTS (SELECT 1 FROM listing_commercial_space_details lcsd
     *                          WHERE lcsd.listing_id = pl.id
     *                            AND UPPER(lcsd.commercial_subtype) IN (&lt;subtypes&gt;)) ) )
     * </pre>
     *
     * <h2>Why a union and not an AND (#2458)</h2>
     *
     * <p>The previous shape ANDed the two lists, so an approved MIXED selection such as
     * Shop + Warehouse/Godown was unexpressible: the Warehouse row passed
     * {@code property_type IN ('commercial','warehouse')} and was then eliminated by
     * {@code UPPER(commercial_subtype) IN ('SHOP')}, because it carries no Shop/Office projection.
     * Splitting on {@link DiscoverFilterNormalizer#SUBTYPE_BEARING_PROPERTY_TYPES} lets each
     * selected type be matched the only way it CAN be matched: bearing types by subtype, everything
     * else by {@code property_type}, which is {@code NOT NULL} and always correct.
     *
     * <p><b>This is what keeps legacy inventory visible.</b> Legacy Building/Warehouse/Land rows
     * have NO {@code listing_commercial_space_details} row at all (V102 inserts only
     * {@code WHERE property_type = 'commercial'}), so a subtype-only filter would silently drop
     * every one of them. They are matched here by the left branch instead.
     *
     * <h2>THE PARENTHESES ARE LOAD-BEARING (#2461/#2475)</h2>
     *
     * <p>{@code excludePropertyTypes} emits a sibling {@code AND pl.property_type NOT IN (...)} that
     * removes {@code agricultural_land} from committed POLYGON and VIEWPORT scopes. If this union
     * were emitted unparenthesised, that {@code NOT IN} would bind to the right-hand OR branch only
     * and agricultural land would leak back into those scopes — silently re-breaking #2461 and
     * #2475. The wrapping parentheses are asserted by test, not left to review.
     *
     * <h2>Properties preserved verbatim from #2431</h2>
     *
     * <ol>
     *   <li>A legacy {@code property_type='commercial'} row with {@code commercial_subtype} NULL is
     *       NEVER classified as SHOP or OFFICE — {@code NULL IN ('SHOP')} is NULL, not TRUE. V102
     *       hardcodes NULL precisely because shop-vs-office cannot be recovered from legacy data;
     *       guessing would fabricate it.</li>
     *   <li>{@code UPPER()} on the COLUMN, not on a bind: the write path stamps canonical
     *       upper-case, but no CHECK constraint enforces it, so a lower-case row is representable.</li>
     *   <li>Correlated EXISTS rather than a JOIN, because this fragment is shared verbatim by five
     *       callers whose FROM clauses this builder does not control.</li>
     * </ol>
     *
     * @param hasTypes whether the caller supplied an explicit property-type selection. When it did
     *                 not, the selection is DERIVED from the subtypes via
     *                 {@link DiscoverFilterNormalizer#impliedPropertyTypes} rather than left
     *                 unconstrained — a subtype-only URL must not widen to every property type,
     *                 nor silently drop the legacy rows of the types it names.
     */
    private static void appendFamilySubtypeUnion(
            StringBuilder sb, List<Object> params, Filters f, boolean hasTypes) {

        List<String> effectiveTypes = hasTypes
                ? f.propertyTypes()
                : DiscoverFilterNormalizer.impliedPropertyTypes(f.commercialSubtypes());

        // Types the SUBTYPE SELECTION actually names. A non-bearing type may pass on property_type
        // alone ONLY if it is one of these.
        //
        // Without this intersection the union silently drops the subtype constraint for any
        // unrelated type: propertyTypes=[apartment] + subtypes=[SHOP] would emit
        // `property_type IN ('apartment')` and hand the shopper the city's whole apartment
        // inventory presented as though it matched a Shop filter. That is the exact quiet-wrongness
        // #2458 exists to remove, and the pre-#2458 AND happened to prevent it — so the union has
        // to prevent it deliberately rather than inherit it.
        List<String> namedBySubtypes =
                DiscoverFilterNormalizer.impliedPropertyTypes(f.commercialSubtypes());

        List<String> bearing = effectiveTypes.stream()
                .filter(DiscoverFilterNormalizer.SUBTYPE_BEARING_PROPERTY_TYPES::contains)
                .toList();
        List<String> nonBearing = effectiveTypes.stream()
                .filter(t -> !DiscoverFilterNormalizer.SUBTYPE_BEARING_PROPERTY_TYPES.contains(t))
                .filter(namedBySubtypes::contains)
                .toList();

        // Neither branch satisfiable — the selection names no type that could match. Literal FALSE
        // rather than an empty "( )", which is a syntax error, or a bare TRUE, which would widen.
        if (bearing.isEmpty() && nonBearing.isEmpty()) {
            sb.append(" AND FALSE");
            return;
        }

        sb.append(" AND (");

        if (!nonBearing.isEmpty()) {
            sb.append("pl.property_type IN (");
            for (int i = 0; i < nonBearing.size(); i++) {
                sb.append(i == 0 ? "?" : ",?");
                params.add(nonBearing.get(i));
            }
            sb.append(")");
        }

        if (!bearing.isEmpty()) {
            if (!nonBearing.isEmpty()) {
                sb.append(" OR ");
            }
            sb.append("(pl.property_type IN (");
            for (int i = 0; i < bearing.size(); i++) {
                sb.append(i == 0 ? "?" : ",?");
                params.add(bearing.get(i));
            }
            sb.append(") AND EXISTS (SELECT 1 FROM listing_commercial_space_details lcsd")
              .append(" WHERE lcsd.listing_id = pl.id AND UPPER(lcsd.commercial_subtype) IN (")
              .append(String.join(", ", Collections.nCopies(f.commercialSubtypes().size(), "?")))
              .append(")))");
            params.addAll(f.commercialSubtypes());
        }

        sb.append(")");
    }

    public static Sql build(Filters rawFilters) {
        Filters f = DiscoverFilterNormalizer.normalize(rawFilters);
        StringBuilder sb = new StringBuilder();
        List<Object> params = new ArrayList<>();

        // Base predicate — always present
        sb.append("pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false");

        // city — property_listings has no city column; resolve via areas→cities join
        sb.append(" AND pl.area_key IN (SELECT a.area_key FROM areas a JOIN cities c ON c.id = a.city_id WHERE c.slug = ? AND c.is_active = true)");
        params.add(f.city());

        // propertyTypes — an UNSATISFIABLE list (non-empty, nothing in the CHECK-constrained
        // vocabulary) becomes a literal FALSE rather than an IN list of values that cannot match.
        // Same answer, but Postgres plans it as a One-Time Filter and scans NOTHING, instead of
        // scanning the city's listings to prove the obvious (#1956 PR1 AC1.15 #8). No binds either,
        // so a long garbage list cannot push the statement toward the 65535-parameter ceiling.
        boolean hasTypes = f.propertyTypes() != null && !f.propertyTypes().isEmpty();
        boolean hasSubtypes = f.commercialSubtypes() != null && !f.commercialSubtypes().isEmpty();

        if (hasTypes && DiscoverFilterNormalizer.isUnsatisfiable(
                f.propertyTypes(), DiscoverFilterNormalizer.ALLOWED_PROPERTY_TYPES)) {
            sb.append(" AND FALSE");
        } else if (!hasSubtypes) {
            // NO SUBTYPE FILTER — byte-identical to the pre-#2458 clause. This is the branch every
            // Residential, Agricultural and broad-Commercial query takes, which is why the #2458
            // union cannot regress them: with no subtypes selected the SQL is character-for-
            // character what it was before, so existing tests exercise unchanged text.
            if (hasTypes) {
                sb.append(" AND pl.property_type IN (");
                for (int i = 0; i < f.propertyTypes().size(); i++) {
                    sb.append(i == 0 ? "?" : ",?");
                    params.add(f.propertyTypes().get(i));
                }
                sb.append(")");
            }
        } else {
            appendFamilySubtypeUnion(sb, params, f, hasTypes);
        }

        // (the subtype clause is emitted by appendFamilySubtypeUnion above — see #2458)

        // price range
        if (f.priceMinPaise() != null) {
            sb.append(" AND pl.price_paise >= ?");
            params.add(f.priceMinPaise());
        }
        if (f.priceMaxPaise() != null) {
            sb.append(" AND pl.price_paise <= ?");
            params.add(f.priceMaxPaise());
        }

        // date range on created_at
        if (f.dateFrom() != null) {
            sb.append(" AND pl.created_at >= ?::timestamptz");
            params.add(f.dateFrom());
        }
        if (f.dateTo() != null) {
            sb.append(" AND pl.created_at <= ?::timestamptz");
            params.add(f.dateTo());
        }

        // bedrooms — 4 means "4 or more"
        if (f.bedrooms() != null && !f.bedrooms().isEmpty()) {
            if (f.bedrooms().contains(4)) {
                List<Integer> exact = f.bedrooms().stream().filter(b -> b < 4).toList();
                if (exact.isEmpty()) {
                    sb.append(" AND pl.bedrooms >= 4");
                } else {
                    sb.append(" AND (pl.bedrooms >= 4 OR pl.bedrooms IN (");
                    for (int i = 0; i < exact.size(); i++) {
                        sb.append(i == 0 ? "?" : ",?");
                        params.add(exact.get(i));
                    }
                    sb.append("))");
                }
            } else {
                sb.append(" AND pl.bedrooms IN (");
                for (int i = 0; i < f.bedrooms().size(); i++) {
                    sb.append(i == 0 ? "?" : ",?");
                    params.add(f.bedrooms().get(i));
                }
                sb.append(")");
            }
        }

        // sellerTypes — same unsatisfiable short-circuit as propertyTypes above.
        // NOTE: bedrooms above deliberately has NO such short-circuit — `bedrooms` carries no CHECK
        // constraint, so an out-of-vocabulary value is not provably empty. See
        // DiscoverFilterNormalizer#isProvablyEmpty.
        if (f.sellerTypes() != null && !f.sellerTypes().isEmpty()) {
            if (DiscoverFilterNormalizer.isUnsatisfiable(
                    f.sellerTypes(), DiscoverFilterNormalizer.ALLOWED_SELLER_TYPES)) {
                sb.append(" AND FALSE");
            } else {
                sb.append(" AND pl.seller_type IN (");
                for (int i = 0; i < f.sellerTypes().size(); i++) {
                    sb.append(i == 0 ? "?" : ",?");
                    params.add(f.sellerTypes().get(i));
                }
                sb.append(")");
            }
        }

        // backOnMarket — back_to_market_at is a real column; backOnMarket is Java-derived
        if (Boolean.TRUE.equals(f.backOnMarket())) {
            sb.append(" AND pl.back_to_market_at IS NOT NULL AND pl.back_to_market_at > NOW() - INTERVAL '30 days'");
        }

        // newToMarket — first_published_at is a real column; newToMarket is Java-derived.
        // Upper bound is <= CURRENT_DATE (inclusive) so listings published today are included.
        if (Boolean.TRUE.equals(f.newToMarket())) {
            sb.append(" AND COALESCE(pl.first_published_at::date, pl.created_at::date) >= CURRENT_DATE - INTERVAL '7 days'");
            sb.append(" AND COALESCE(pl.first_published_at::date, pl.created_at::date) <= CURRENT_DATE");
        }

        // reraRegistered — rera_valid is Java-derived; use regex match on the real column
        if (Boolean.TRUE.equals(f.reraRegistered())) {
            sb.append(" AND pl.rera_number IS NOT NULL AND pl.rera_number ~ '^[A-Z]{3}/[A-Z]{2}/[0-9]{4}/[0-9]{4}$'");
        }

        // readyToMove
        if (Boolean.TRUE.equals(f.readyToMove())) {
            sb.append(" AND pl.possession_status = 'READY'");
        }

        // polygon — two-stage PostGIS predicate exploiting the idx_property_listings_geog GiST index.
        //
        // Stage 1 (prefilter): ST_Intersects on the envelope of the polygon against pl.geog.
        //   The GiST index on pl.geog supports geography operators natively; feeding it the
        //   bounding-box envelope of the drawn polygon eliminates rows outside the bounding
        //   rectangle cheaply before the exact containment test runs.
        //
        // Stage 2 (exact): ST_Contains on the full polygon geometry against pl.geog::geometry.
        //   Using pl.geog::geometry (the stored generated column) instead of
        //   ST_SetSRID(ST_Point(pl.longitude, pl.latitude), 4326) avoids recalculating the
        //   point geography per row and is consistent with the school-proximity and bbox predicates.
        //   ST_Contains is boundary-exclusive: points exactly on the polygon edge are excluded.
        //
        // The WKT string is built once and bound twice (once per ? placeholder).
        if (f.polygon() != null && f.polygon().size() >= 3) {
            String wktStr = PolygonWkt.toWkt(f.polygon());
            // Prefilter: envelope intersect via GiST index on pl.geog
            sb.append(" AND ST_Intersects(ST_Envelope(ST_GeomFromText(?, 4326))::geography, pl.geog)");
            params.add(wktStr);
            // Exact: point-in-polygon on the narrowed candidate set
            sb.append(" AND ST_Contains(ST_GeomFromText(?, 4326), pl.geog::geometry)");
            params.add(wktStr);
        }

        // school proximity — PostGIS ST_DWithin on geography
        // pl.geog = property_listings.geog, the stored generated column added by V73.
        // (schools.geog is a separate column added by V75; it is not referenced here.)
        // Using the stored column avoids recalculating ST_MakePoint(pl.longitude, pl.latitude)::geography
        // per row and allows the idx_property_listings_geog GiST index to be used.
        // pl.geog is NULL only if lat/lon were NULL when the row was written; ST_DWithin
        // returns NULL (falsy) for a NULL first argument, so those listings are excluded.
        if (f.schoolLat() != null && f.schoolLon() != null) {
            double radiusKm = f.schoolRadiusKm() != null ? f.schoolRadiusKm() : 2.0;
            sb.append(" AND ST_DWithin(pl.geog, ST_MakePoint(?, ?)::geography, ?)");
            params.add(f.schoolLon());
            params.add(f.schoolLat());
            params.add(radiusKm * 1000.0); // metres
        }

        // bbox — viewport rectangle filter using the GIST-indexed geog column.
        // The && operator (geometry/geography overlap) is supported by the idx_property_listings_geog
        // GiST index and is the correct operator for a rectangular viewport test.
        // ST_MakeEnvelope(west, south, east, north, srid) produces a geometry bounding box;
        // casting to ::geography makes the && operands type-compatible with pl.geog.
        // Antimeridian-crossing boxes (west > east) are rejected at the controller layer.
        boolean bboxApplied = false;
        if (f.bbox() != null) {
            Bbox b = f.bbox();
            sb.append(" AND pl.geog && ST_MakeEnvelope(?, ?, ?, ?, 4326)::geography");
            params.add(b.west());
            params.add(b.south());
            params.add(b.east());
            params.add(b.north());
            bboxApplied = true;
        }

        // viewportScope (#2015) — "Search this area" candidate result scope. Structurally
        // identical predicate to bbox above (same GiST-indexed pl.geog column, same
        // boundary-inclusive && overlap operator, same ST_MakeEnvelope(west, south, east, north,
        // 4326)::geography envelope), but semantically distinct: bbox is the always-on
        // render/perf viewport prefilter, while viewportScope is one of the three mutually
        // exclusive candidate result scopes (AREA_SET/POLYGON/VIEWPORT) enforced by
        // ResultScopeExclusivity at the controller layer before Filters is built. Reuses
        // idx_property_listings_geog — no new index required.
        if (f.viewportScope() != null) {
            Bbox vs = f.viewportScope();
            sb.append(" AND pl.geog && ST_MakeEnvelope(?, ?, ?, ?, 4326)::geography");
            params.add(vs.west());
            params.add(vs.south());
            params.add(vs.east());
            params.add(vs.north());
        }

        // keyword search — FTS via the search_vector generated column added by V18.
        // websearch_to_tsquery accepts natural-language input (quoted phrases, negation, OR).
        // Normalise: blank/whitespace-only q is treated as absent so no FTS clause is added.
        // Malformed input may cause DataAccessException — falls through to the global
        // Exception handler (500 INTERNAL_ERROR); no dedicated handler is needed here.
        String normQ = (f.q() != null && !f.q().isBlank()) ? f.q().trim() : null;
        if (normQ != null) {
            sb.append(" AND pl.search_vector @@ websearch_to_tsquery('english', ?)");
            params.add(normQ);
        }

        // listingPurpose — canonical 'sale'/'rent' or null by this point (DiscoverFilterNormalizer
        // allowlisted it case-insensitively at the top of build); the blank guard is retained as a
        // defensive belt-and-suspenders, not as the normalisation itself.
        String normPurpose = (f.listingPurpose() != null && !f.listingPurpose().isBlank())
                ? f.listingPurpose().trim() : null;
        if (normPurpose != null) {
            sb.append(" AND pl.listing_purpose = ?");
            params.add(normPurpose);
        }

        // excludePropertyTypes — NOT IN exclusion; null/empty = no exclusion (backward-compatible)
        if (f.excludePropertyTypes() != null && !f.excludePropertyTypes().isEmpty()) {
            List<String> placeholders = Collections.nCopies(f.excludePropertyTypes().size(), "?");
            sb.append(" AND LOWER(pl.property_type) NOT IN (")
              .append(String.join(", ", placeholders))
              .append(")");
            for (String t : f.excludePropertyTypes()) {
                params.add(t.toLowerCase());
            }
        }

        // areaKeys — restrict to explicit area_key members (group-scoped browse).
        // null = absent param → no filter (backward-compatible; existing journeys pass nothing).
        // empty list is rejected at the controller layer before reaching here (400 BAD REQUEST),
        // so this block only fires when the list is non-null and non-empty, preserving the
        // city subselect above — both predicates apply via AND.
        if (f.areaKeys() != null && !f.areaKeys().isEmpty()) {
            List<String> placeholders = Collections.nCopies(f.areaKeys().size(), "?");
            sb.append(" AND pl.area_key IN (")
              .append(String.join(", ", placeholders))
              .append(")");
            for (String k : f.areaKeys()) {
                params.add(k);
            }
        }

        return new Sql(sb.toString(), params, bboxApplied);
    }
}

package com.example.realestate.discover;

import com.example.realestate.listing.area.AreaNormalizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * ONE Postgres implementation of {@link AgriDestinationPort} (#2151 PR B, decision.d3).
 *
 * <p>Reads the promoted {@code agri_destination_classification} table (#2151 PR A) for geometry
 * (distance/bearing/direction, precomputed once at City Launch time — never recomputed here) JOIN
 * {@code areas} for display name, and {@code property_listings} for live parcel counts/acreage/
 * content via the SAME shared predicate ({@link #AGRI_BASE_PREDICATE_GUARDS}, built from ONE
 * {@link #buildAgriSql} call) used by both {@link #findDestinations} (bucket counts) and
 * {@link #findParcels} (drill-down) — this is what makes AC7 parity structural rather than
 * coincidental.
 *
 * <p><b>No {@code @Primary}, no routing wrapper, no read of the OpenSearch enablement flag
 * anywhere in this class or file</b> (see {@code AgriDestinationPortStructuralAntiDriftTest},
 * which asserts the literal flag name never appears in this source file). This is a plain
 * {@code @Component}; it is the only bean
 * implementing {@link AgriDestinationPort}, so Spring wires it unambiguously with zero flag logic.
 *
 * <p>Uses {@link JdbcOperations} — the house pattern for every read in this package. Does NOT
 * expose PR A's {@code AgriDestinationClassification} JPA entity through the port; this class talks
 * to the {@code agri_destination_classification} table via plain SQL, matching every sibling class
 * in this package (avoids mixing JPA/Hibernate types into a port designed to stay adapter-agnostic
 * — see {@code AgriDestinationPortStructuralAntiDriftTest}, D3-T1).
 */
@Component
public class AgriDestinationPortPostgresAdapter implements AgriDestinationPort {

    private static final Logger log = LoggerFactory.getLogger(AgriDestinationPortPostgresAdapter.class);

    /**
     * Guards appended to the shared {@link DiscoverListingPredicateBuilder} output so BOTH the
     * destination-count/acreage queries and the parcel drill-down query see byte-identical
     * eligibility rules. #2151 PR B alignment: {@code area_resolution_status = 'RESOLVED'} is now
     * present on BOTH sides (previously only the count/corridor side carried it — see
     * {@code RegionalAreaGroupsService}'s pre-#2151 REGIONAL_GROUPS_SQL comment); a parcel whose
     * area could not be resolved now disappears from the map exactly where it already failed to be
     * counted. Declared as a visible behaviour change in the PR body.
     */
    private static final String AGRI_BASE_PREDICATE_GUARDS =
            " AND pl.area_resolution_status = 'RESOLVED'"
            + " AND array_length(string_to_array(pl.area_key, '|'), 1) = 4";

    private static final String DESTINATION_GEOMETRY_SQL = """
            SELECT adc.area_key, a.name AS display_name, adc.distance_km, adc.bearing_deg, adc.direction_key
            FROM agri_destination_classification adc
            JOIN areas a ON a.area_key = adc.area_key
            WHERE adc.city_id = ?
            """;

    private static final String PARCEL_SELECT_SQL = """
            SELECT
                pl.id,
                pl.title,
                pl.area_key,
                pl.latitude,
                pl.longitude,
                pl.property_type,
                pl.locality,
                CASE WHEN pl.property_type = 'agricultural_land'
                     THEN ST_AsGeoJSON(pl.boundary)
                     END AS boundary_geo_json,
                pl.land_area,
                pl.land_area_unit,
                ROUND(ST_Area(pl.boundary)::numeric / 4046.8564224, 2) AS computed_area_acres,
                pl.price_paise,
                pl.listing_purpose,
                pl.water_source,
                pl.land_category,
                pl.farmhouse_available,
                pl.fencing_done,
                pl.road_access,
                pl.soil_type,
                pl.cultivation_status,
                pl.ownership_type,
                pl.updated_at
            FROM property_listings pl
            """;

    private static final RowMapper<AgriParcel> PARCEL_ROW_MAPPER = (rs, rowNum) -> new AgriParcel(
            rs.getString("id"),
            rs.getString("title"),
            rs.getString("area_key"),
            rs.getObject("latitude") != null ? rs.getDouble("latitude") : null,
            rs.getObject("longitude") != null ? rs.getDouble("longitude") : null,
            rs.getString("property_type"),
            rs.getString("locality"),
            rs.getString("boundary_geo_json"),
            rs.getBigDecimal("land_area"),
            rs.getString("land_area_unit"),
            rs.getBigDecimal("computed_area_acres"),
            rs.getObject("price_paise") != null ? rs.getLong("price_paise") : null,
            rs.getString("listing_purpose"),
            rs.getString("water_source"),
            rs.getString("land_category"),
            rs.getObject("farmhouse_available") != null ? rs.getBoolean("farmhouse_available") : null,
            rs.getObject("fencing_done") != null ? rs.getBoolean("fencing_done") : null,
            rs.getString("road_access"),
            rs.getString("soil_type"),
            rs.getString("cultivation_status"),
            rs.getString("ownership_type"),
            rs.getObject("updated_at", OffsetDateTime.class)
    );

    /** Error code returned in the 503 body when an active city has never been promoted through
     *  Agri City Launch — see {@link #findDestinations} javadoc (#2151 PR B correction pass, B2). */
    static final String AGRI_DESTINATIONS_NOT_YET_PROMOTED = "AGRI_DESTINATIONS_NOT_YET_PROMOTED";

    /** Error code returned in the 503 body when an Admin City Launch PREVIEW revision (see
     *  {@link AgriDestinationPort.DestinationScopeQuery#revisionId()}) has ZERO {@code
     *  sandbox_agri_destination_classification} rows — the preview-domain equivalent of {@link
     *  #AGRI_DESTINATIONS_NOT_YET_PROMOTED}, deliberately a DISTINCT code: the actionable guidance
     *  differs (production: wait for promotion; preview: re-run city preparation so the generator
     *  runs) (#2151 PR B Track 2). */
    static final String AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION = "AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION";

    /**
     * Admin City Launch PREVIEW geometry read — mirrors {@link #DESTINATION_GEOMETRY_SQL} but reads
     * the revision-scoped {@code sandbox_agri_destination_classification} table (V125, #2151 PR A)
     * instead of the promoted production table, and joins {@code areas} with a LEFT JOIN rather than
     * an INNER JOIN.
     *
     * <p>LEFT JOIN is load-bearing (#2151 PR B Track 2 architect ruling): {@code
     * sandbox_agri_destination_classification.area_key} is deliberately NOT FK-constrained to {@code
     * public.areas} (see V125's own table comment) — a sandbox row may describe an area not yet
     * promoted into {@code public.areas} at all (the normal case for a never-launched city). An
     * INNER JOIN here would silently drop exactly those rows from the preview; {@code display_name}
     * is null-checked in the row mapper below and falls back to the area key itself rather than
     * crashing or vanishing the destination.
     */
    private static final String SANDBOX_DESTINATION_GEOMETRY_SQL = """
            SELECT sadc.area_key, a.name AS display_name, sadc.distance_km, sadc.bearing_deg, sadc.direction_key
            FROM sandbox_agri_destination_classification sadc
            LEFT JOIN areas a ON a.area_key = sadc.area_key
            WHERE sadc.revision_id = ?
            """;

    private final JdbcOperations jdbc;
    private final CityActivationGuard cityActivationGuard;
    private final AgriDestinationPortReadinessCheck readinessCheck;

    public AgriDestinationPortPostgresAdapter(JdbcOperations jdbc, CityActivationGuard cityActivationGuard,
                                               AgriDestinationPortReadinessCheck readinessCheck) {
        this.jdbc = jdbc;
        this.cityActivationGuard = cityActivationGuard;
        this.readinessCheck = readinessCheck;
    }

    @Override
    @Transactional(readOnly = true)
    public DestinationScope findDestinations(DestinationScopeQuery query) {
        String citySlug = normalizeCity(query.citySlug());

        // #2151 PR B Track 2: Admin City Launch PREVIEW path — branch out BEFORE any production
        // guard/read below. Everything from here to the end of this method is the UNCHANGED
        // production (revisionId == null) path.
        if (query.revisionId() != null) {
            return findDestinationsForRevision(citySlug, query);
        }

        // #1935 parity: an inactive city must be indistinguishable from an unknown one. This guard
        // MUST run BEFORE any read of agri_destination_classification/areas — cityActivationGuard
        // is the sole authority for this check on the Agri path (#2151 scope item 11).
        if (!cityActivationGuard.isActiveCitySlug(citySlug)) {
            log.debug("findDestinations city={} — inactive or unknown city", citySlug);
            return new DestinationScope(citySlug, List.of());
        }

        Integer cityId = resolveActiveCityId(citySlug);
        if (cityId == null) {
            // Guard said active but the id lookup raced/failed — fail closed, same empty shape.
            return new DestinationScope(citySlug, List.of());
        }

        // #2151 PR B correction pass (B2, BLOCKING review finding on PR #2158): an active city with
        // ZERO agri_destination_classification rows has NEVER been promoted through Agri City
        // Launch — it is NOT the same thing as a promoted city whose current direction/maxKm/filter
        // combination legitimately matches no destinations. Silently returning the same empty
        // DestinationScope for both makes the public regional-area-groups endpoint indistinguishable
        // from a genuine zero-corridor city. Fail closed with a distinguishable signal instead; the
        // legacy regional_area_classifications table is deliberately NOT read here as a fallback —
        // see this class' javadoc and AgriDestinationPortReadinessCheck's javadoc for why.
        if (readinessCheck.cityHasZeroAgriDestinationRows(citySlug)) {
            log.warn("findDestinations city={} — ACTIVE city has ZERO agri_destination_classification "
                    + "rows; failing closed rather than serving an indistinguishable empty result",
                    citySlug);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, AGRI_DESTINATIONS_NOT_YET_PROMOTED);
        }

        StringBuilder sql = new StringBuilder(DESTINATION_GEOMETRY_SQL);
        List<Object> params = new ArrayList<>();
        params.add(cityId);
        if (query.direction() != null) {
            sql.append(" AND adc.direction_key = ?\n");
            params.add(query.direction());
        }
        if (query.maxKm() != null) {
            sql.append(" AND adc.distance_km <= ?\n");
            params.add(query.maxKm());
        }
        sql.append(" ORDER BY adc.area_key");

        List<DestinationRow> rows = jdbc.query(sql.toString(),
                (rs, rowNum) -> new DestinationRow(
                        rs.getString("area_key"),
                        rs.getString("display_name"),
                        rs.getDouble("distance_km"),
                        rs.getDouble("bearing_deg"),
                        rs.getString("direction_key")),
                params.toArray());

        if (rows.isEmpty()) {
            return new DestinationScope(citySlug, List.of());
        }

        Map<String, Long> countByArea = Map.of();
        Map<String, Double> acreageByArea = Map.of();
        if (query.includeParcelCounts()) {
            List<String> areaKeys = rows.stream().map(DestinationRow::areaKey).toList();
            countByArea = countParcelsByArea(citySlug, query.filters(), areaKeys);
            acreageByArea = acreageByArea(citySlug, query.filters(), areaKeys);
        }

        List<DestinationBucket> buckets = new ArrayList<>(rows.size());
        for (DestinationRow r : rows) {
            Long count = query.includeParcelCounts() ? countByArea.getOrDefault(r.areaKey(), 0L) : null;
            Double acreage = query.includeParcelCounts() ? acreageByArea.get(r.areaKey()) : null;
            buckets.add(new DestinationBucket(
                    r.areaKey(), r.displayName(), r.distanceKm(), r.bearingDeg(), r.directionKey(),
                    count, acreage));
        }
        return new DestinationScope(citySlug, List.copyOf(buckets));
    }

    @Override
    @Transactional(readOnly = true)
    public ParcelPage findParcels(ParcelQuery query) {
        String citySlug = normalizeCity(query.citySlug());

        // #2151 PR B Track 2: Admin City Launch PREVIEW path — see findDestinations' equivalent
        // branch. Everything below this block is the UNCHANGED production (revisionId == null) path.
        if (query.revisionId() != null) {
            return findParcelsForRevision(citySlug, query);
        }

        if (!cityActivationGuard.isActiveCitySlug(citySlug)) {
            log.debug("findParcels city={} — inactive or unknown city", citySlug);
            int size = query.page() != null && query.page().size() > 0
                    ? Math.min(query.page().size(), MAX_PARCELS_PER_PAGE) : MAX_PARCELS_PER_PAGE;
            int page = query.page() != null ? Math.max(query.page().page(), 0) : 0;
            return new ParcelPage(List.of(), page, size, 0L, false);
        }

        List<String> areaKeys = query.areaKeys();
        if (areaKeys == null || areaKeys.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "area_keys_must_not_be_empty");
        }
        if (areaKeys.size() > MAX_DESTINATION_AREA_KEYS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "area_keys_exceeds_maximum_of_" + MAX_DESTINATION_AREA_KEYS);
        }

        int size = query.page() != null && query.page().size() > 0
                ? Math.min(query.page().size(), MAX_PARCELS_PER_PAGE) : MAX_PARCELS_PER_PAGE;
        int page = query.page() != null ? Math.max(query.page().page(), 0) : 0;

        DiscoverListingPredicateBuilder.Sql sql = buildAgriSql(citySlug, query.filters(), areaKeys, query.viewport());

        long total = countTotal(sql);

        String selectSql = PARCEL_SELECT_SQL + " WHERE " + sql.whereFragment() + " ORDER BY pl.id LIMIT ? OFFSET ?";
        List<Object> params = new ArrayList<>(sql.params());
        params.add(size);
        params.add((long) page * size);

        List<AgriParcel> content = jdbc.query(selectSql, PARCEL_ROW_MAPPER, params.toArray());

        boolean hasMore = (long) (page + 1) * size < total;
        log.debug("findParcels city={} areaKeys={} page={} size={} total={} hasMore={}",
                citySlug, areaKeys.size(), page, size, total, hasMore);
        return new ParcelPage(content, page, size, total, hasMore);
    }

    // ── Admin City Launch PREVIEW path (#2151 PR B Track 2) ─────────────────────────────────────

    /**
     * Shared fail-closed guard for BOTH preview methods below: throws 503 {@link
     * #AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION} when the given revision has ZERO {@code
     * sandbox_agri_destination_classification} rows — see {@link #findDestinationsForRevision}'s
     * javadoc for why this must be distinguishable from a genuine zero-match scope.
     */
    private void failClosedIfNoSandboxAgriRows(long revisionId, String callerMethodName) {
        Integer totalRows = jdbc.queryForObject(
                "SELECT COUNT(*) FROM sandbox_agri_destination_classification WHERE revision_id = ?",
                Integer.class, revisionId);
        if (totalRows == null || totalRows == 0) {
            log.warn("{}(preview) revisionId={} — ZERO sandbox_agri_destination_classification rows; "
                    + "failing closed rather than serving an indistinguishable/misleading result",
                    callerMethodName, revisionId);
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION);
        }
    }

    /**
     * #2167 review finding (BLOCKING, on top of #2151 PR B Track 2): {@link
     * #failClosedIfNoSandboxAgriRows} only proves the revision has SOME sandbox rows — it does
     * nothing to stop a caller from passing an {@code areaKey} that belongs to a completely
     * unrelated corridor/revision and still getting live {@code property_listings} back for it
     * (as long as this revision happens to have at least one unrelated sandbox row). Preview
     * geography MUST be scoped exactly to the selected revision.
     *
     * <p>Validates EVERY requested {@code areaKeys} entry is present in {@code
     * sandbox_agri_destination_classification} for the EXACT {@code revisionId} supplied, via a
     * single count-match query. Any unmatched key fails closed with the SAME {@link
     * #AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION} signal used by {@link
     * #failClosedIfNoSandboxAgriRows} — that code already means "this revision doesn't have
     * generated Agri destination data for what you're asking about," which is exactly true here
     * too. Nothing is silently dropped; the whole request fails rather than serving a partial,
     * cross-revision result.
     */
    private void failClosedIfAreaKeysNotInRevisionSandbox(long revisionId, List<String> areaKeys) {
        Set<String> distinctKeys = new LinkedHashSet<>(areaKeys);
        String placeholders = String.join(",", Collections.nCopies(distinctKeys.size(), "?"));
        List<Object> params = new ArrayList<>(distinctKeys.size() + 1);
        params.add(revisionId);
        params.addAll(distinctKeys);
        Integer matchedCount = jdbc.queryForObject(
                "SELECT COUNT(DISTINCT area_key) FROM sandbox_agri_destination_classification "
                        + "WHERE revision_id = ? AND area_key IN (" + placeholders + ")",
                Integer.class, params.toArray());
        if (matchedCount == null || matchedCount != distinctKeys.size()) {
            log.warn("findParcels(preview) revisionId={} — one or more requested areaKeys are not "
                    + "present in sandbox_agri_destination_classification for this revision "
                    + "(requested={}, matched={}); failing closed rather than serving live listings "
                    + "for geography this revision never generated",
                    revisionId, distinctKeys.size(), matchedCount);
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, AGRI_DESTINATIONS_NOT_GENERATED_FOR_REVISION);
        }
    }

    /**
     * PREVIEW equivalent of {@link #findDestinations} for a non-null {@code revisionId}. Reads
     * {@code sandbox_agri_destination_classification} instead of the promoted production table, and
     * deliberately does NOT call {@link CityActivationGuard} — an unpromoted/never-launched city is
     * the NORMAL case being previewed, not a fail-closed condition.
     *
     * <p>Fail-closed equivalent of {@link #AGRI_DESTINATIONS_NOT_YET_PROMOTED}: a revision with ZERO
     * sandbox rows has never had {@code AgriDestinationClassificationGenerator} run for it (or it ran
     * and produced nothing) — that is NOT the same thing as a direction/maxKm combination that
     * legitimately matches none of an otherwise-nonempty row set, so the two cases must stay
     * distinguishable exactly as they do on the production path.
     */
    private DestinationScope findDestinationsForRevision(String citySlug, DestinationScopeQuery query) {
        long revisionId = query.revisionId();
        failClosedIfNoSandboxAgriRows(revisionId, "findDestinations");

        StringBuilder sql = new StringBuilder(SANDBOX_DESTINATION_GEOMETRY_SQL);
        List<Object> params = new ArrayList<>();
        params.add(revisionId);
        if (query.direction() != null) {
            sql.append(" AND sadc.direction_key = ?\n");
            params.add(query.direction());
        }
        if (query.maxKm() != null) {
            sql.append(" AND sadc.distance_km <= ?\n");
            params.add(query.maxKm());
        }
        sql.append(" ORDER BY sadc.area_key");

        List<DestinationRow> rows = jdbc.query(sql.toString(),
                (rs, rowNum) -> {
                    String areaKey = rs.getString("area_key");
                    String displayName = rs.getString("display_name");
                    // LEFT JOIN: no public.areas match yet (area not promoted) — degrade to the
                    // area key itself rather than a null display name or a dropped row.
                    return new DestinationRow(
                            areaKey,
                            displayName != null ? displayName : areaKey,
                            rs.getDouble("distance_km"),
                            rs.getDouble("bearing_deg"),
                            rs.getString("direction_key"));
                },
                params.toArray());

        if (rows.isEmpty()) {
            return new DestinationScope(citySlug, List.of());
        }

        Map<String, Long> countByArea = Map.of();
        Map<String, Double> acreageByArea = Map.of();
        if (query.includeParcelCounts()) {
            // #2151 PR B Track 2 (documented, item 1): parcel counts/acreage ALWAYS join the LIVE
            // property_listings table by area_key/citySlug, never a sandbox table — sandbox has no
            // listings equivalent. A revision preview scopes GEOGRAPHY, not inventory.
            List<String> areaKeys = rows.stream().map(DestinationRow::areaKey).toList();
            countByArea = countParcelsByArea(citySlug, query.filters(), areaKeys);
            acreageByArea = acreageByArea(citySlug, query.filters(), areaKeys);
        }

        List<DestinationBucket> buckets = new ArrayList<>(rows.size());
        for (DestinationRow r : rows) {
            Long count = query.includeParcelCounts() ? countByArea.getOrDefault(r.areaKey(), 0L) : null;
            Double acreage = query.includeParcelCounts() ? acreageByArea.get(r.areaKey()) : null;
            buckets.add(new DestinationBucket(
                    r.areaKey(), r.displayName(), r.distanceKm(), r.bearingDeg(), r.directionKey(),
                    count, acreage));
        }
        log.debug("findDestinations(preview) revisionId={} returned {} destinations", revisionId, buckets.size());
        return new DestinationScope(citySlug, List.copyOf(buckets));
    }

    /**
     * PREVIEW equivalent of {@link #findParcels} for a non-null {@code revisionId}. Parcels are
     * ALWAYS read from the LIVE {@code property_listings} table (see class javadoc, item 1) — this
     * method does not touch {@code sandbox_agri_destination_classification} at all; it exists only
     * to skip {@link CityActivationGuard}, which is structurally inapplicable to a preview of a
     * possibly-not-yet-active city.
     *
     * <p>Still fails closed the SAME way as {@link #findDestinationsForRevision} when the revision
     * has zero sandbox Agri rows (#2151 PR B Track 2 — all three preview endpoints share one
     * fail-closed signal): a map-listings drill-down is only ever reachable from a generated
     * destination bucket in the real UI, so a direct/stale hit against a never-generated revision
     * must fail the same way, not silently return live listings that no corridor ever pointed to.
     */
    private ParcelPage findParcelsForRevision(String citySlug, ParcelQuery query) {
        failClosedIfNoSandboxAgriRows(query.revisionId(), "findParcels");

        List<String> areaKeys = query.areaKeys();
        if (areaKeys == null || areaKeys.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "area_keys_must_not_be_empty");
        }
        if (areaKeys.size() > MAX_DESTINATION_AREA_KEYS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "area_keys_exceeds_maximum_of_" + MAX_DESTINATION_AREA_KEYS);
        }

        failClosedIfAreaKeysNotInRevisionSandbox(query.revisionId(), areaKeys);

        int size = query.page() != null && query.page().size() > 0
                ? Math.min(query.page().size(), MAX_PARCELS_PER_PAGE) : MAX_PARCELS_PER_PAGE;
        int page = query.page() != null ? Math.max(query.page().page(), 0) : 0;

        DiscoverListingPredicateBuilder.Sql sql = buildAgriSql(citySlug, query.filters(), areaKeys, query.viewport());

        long total = countTotal(sql);

        String selectSql = PARCEL_SELECT_SQL + " WHERE " + sql.whereFragment() + " ORDER BY pl.id LIMIT ? OFFSET ?";
        List<Object> params = new ArrayList<>(sql.params());
        params.add(size);
        params.add((long) page * size);

        List<AgriParcel> content = jdbc.query(selectSql, PARCEL_ROW_MAPPER, params.toArray());

        boolean hasMore = (long) (page + 1) * size < total;
        log.debug("findParcels(preview) revisionId={} city={} areaKeys={} page={} size={} total={} hasMore={}",
                query.revisionId(), citySlug, areaKeys.size(), page, size, total, hasMore);
        return new ParcelPage(content, page, size, total, hasMore);
    }

    // ── Shared predicate (AC7 parity by construction) ───────────────────────────────────────────

    /**
     * Builds the SINGLE shared predicate used by {@link #countParcelsByArea}, {@link
     * #acreageByArea}, and {@link #findParcels} — {@code toPredicateFilters(...)} called exactly
     * once per invocation, guaranteeing every eligibility rule is textually identical across the
     * count side and the parcel side (#2151 PR B AC7 requirement).
     */
    private static DiscoverListingPredicateBuilder.Sql buildAgriSql(
            String citySlug, AgriDestinationFilters filters, List<String> areaKeys, GeoBox viewport) {
        DiscoverListingPredicateBuilder.Bbox bbox = viewport != null
                ? new DiscoverListingPredicateBuilder.Bbox(
                        viewport.south(), viewport.west(), viewport.north(), viewport.east())
                : null;
        String purpose = filters != null ? filters.listingPurpose() : null;
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                citySlug,
                List.of("agricultural_land"),
                null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,
                bbox, null, purpose, null, areaKeys);
        DiscoverListingPredicateBuilder.Sql base = DiscoverListingPredicateBuilder.build(f);
        return new DiscoverListingPredicateBuilder.Sql(
                base.whereFragment() + AGRI_BASE_PREDICATE_GUARDS, base.params(), base.bboxApplied());
    }

    private Map<String, Long> countParcelsByArea(String citySlug, AgriDestinationFilters filters, List<String> areaKeys) {
        DiscoverListingPredicateBuilder.Sql sql = buildAgriSql(citySlug, filters, areaKeys, null);
        String q = "SELECT pl.area_key, COUNT(*) AS c FROM property_listings pl WHERE "
                + sql.whereFragment() + " GROUP BY pl.area_key";
        Map<String, Long> result = new HashMap<>();
        jdbc.query(q, (org.springframework.jdbc.core.RowCallbackHandler)
                (rs -> result.put(rs.getString("area_key"), rs.getLong("c"))), sql.params().toArray());
        return result;
    }

    /**
     * {@code AreaNormalizer.normalize} is a Java routine over per-row land_area/land_area_unit and
     * cannot run inside a SQL {@code SUM} aggregate — this Postgres adapter therefore fetches raw
     * rows and normalises/sums in Java, exactly as {@code RegionalAreaGroupsService} did before this
     * PR. A future OpenSearch aggregation could NOT reproduce this without a pre-normalised numeric
     * field on the document (documented as known-gap #5 in the query-contract artefact).
     */
    private Map<String, Double> acreageByArea(String citySlug, AgriDestinationFilters filters, List<String> areaKeys) {
        DiscoverListingPredicateBuilder.Sql sql = buildAgriSql(citySlug, filters, areaKeys, null);
        String q = "SELECT pl.area_key, pl.land_area, pl.land_area_unit FROM property_listings pl WHERE "
                + sql.whereFragment();
        Map<String, List<BigDecimal>> acresByArea = new HashMap<>();
        jdbc.query(q, (org.springframework.jdbc.core.RowCallbackHandler) (rs -> {
            String areaKey = rs.getString("area_key");
            BigDecimal landArea = rs.getBigDecimal("land_area");
            String unit = rs.getString("land_area_unit");
            AreaNormalizer.NormalizedArea normalized = AreaNormalizer.normalize(landArea, unit);
            BigDecimal acres = AreaNormalizer.sqmToAcres(normalized.areaSqm());
            if (acres != null) {
                acresByArea.computeIfAbsent(areaKey, k -> new ArrayList<>()).add(acres);
            }
        }), sql.params().toArray());

        Map<String, Double> result = new HashMap<>();
        for (Map.Entry<String, List<BigDecimal>> e : acresByArea.entrySet()) {
            BigDecimal sum = BigDecimal.ZERO;
            for (BigDecimal a : e.getValue()) {
                sum = sum.add(a);
            }
            result.put(e.getKey(), sum.doubleValue());
        }
        return result;
    }

    private long countTotal(DiscoverListingPredicateBuilder.Sql sql) {
        String q = "SELECT COUNT(*) FROM property_listings pl WHERE " + sql.whereFragment();
        Long count = jdbc.queryForObject(q, Long.class, sql.params().toArray());
        return count != null ? count : 0L;
    }

    /**
     * Resolves the active city's integer id. Called ONLY after {@link
     * CityActivationGuard#isActiveCitySlug} has already returned {@code true} in the SAME calling
     * method (defense-in-depth inline {@code is_active} guard retained on the literal itself).
     */
    private Integer resolveActiveCityId(String citySlug) {
        List<Integer> ids = jdbc.queryForList(
                "SELECT id FROM cities WHERE lower(slug) = lower(?) AND is_active = true",
                Integer.class, citySlug);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private static String normalizeCity(String citySlug) {
        return citySlug == null ? null : citySlug.toLowerCase();
    }

    private record DestinationRow(
            String areaKey, String displayName, double distanceKm, double bearingDeg, String directionKey) {}
}

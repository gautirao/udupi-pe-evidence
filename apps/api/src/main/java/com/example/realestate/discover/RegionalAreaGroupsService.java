package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * Computes regional corridor groups (corridor-first cumulative) for a given city and property type.
 *
 * <p><b>#2151 PR B cutover.</b> This service is now a COMPOSER, not a SQL owner. All geography and
 * live-listing aggregation is delegated to {@link AgriDestinationPort} (the single Postgres adapter
 * reading {@code agri_destination_classification}, #2151 PR A). This class is responsible ONLY for:
 * <ul>
 *   <li>reading {@code city_regional_direction_labels} (city display config, unrelated to
 *       {@code regional_area_classifications} — unaffected by the cutover, AC10),</li>
 *   <li>building the {@code TIER_DEFS} cumulative-distance ladder ABOVE the port, and</li>
 *   <li>assembling the UNCHANGED {@link RegionalAreaGroupsResponse}/{@link CorridorGroup}/
 *       {@link AvailableMaxDistance} shape, suppressing zero-count tiers and label-less empty
 *       corridors exactly as before the cutover.</li>
 * </ul>
 *
 * <p><b>Distance tiers (#2151 OQ5 fix).</b> Tier membership is now {@code distanceKm <= maxKm} —
 * evaluated in Java against the precomputed {@code distanceKm} the port returns, NOT recomputed
 * per request (AC6) — instead of legacy band membership. This closes a pre-#2151 defect: the DB's
 * outermost distance band was unbounded ({@code max_km IS NULL}) while the UI labelled it "Up to
 * 100 km", so a listing 400&nbsp;km away was counted under that tier. It is now correctly excluded
 * (a listing is counted in the "Up to 100 km" tier iff {@code distanceKm <= 100}). This is a
 * disclosed, intended behaviour change — see the PR body.
 *
 * <p><b>Ordering (#2151 OQ-1 finding).</b> {@code regional_directions.sort_order} ascending
 * (N=1, NE=2, E=3, SE=4, S=5, SW=6, W=7, NW=8 — V87 seed rows) is IDENTICAL to {@code
 * COMPASS_ORDER} below. Dropping the {@code regional_area_classifications ⋈ regional_directions}
 * join therefore loses no ordering information: {@code COMPASS_ORDER} alone reproduces the exact
 * fallback order the join previously provided, confirmed by reading the V87 seed data rather than
 * assumed.
 *
 * <p>NOTE: This endpoint has no dependency on /api/discover/markers or OpenSearch, and no class on
 * this path reads {@code discover.opensearch.enabled} — see {@link AgriDestinationPort}'s javadoc.
 */
@Service
public class RegionalAreaGroupsService {

    private static final Logger log = LoggerFactory.getLogger(RegionalAreaGroupsService.class);

    // Natural compass order for fallback sorting when a direction has no label row.
    // #2151 OQ-1: verified identical to regional_directions.sort_order ascending (V87 seed rows).
    private static final List<String> COMPASS_ORDER =
            List.of("N", "NE", "E", "SE", "S", "SW", "W", "NW");

    // Cumulative tier definitions: ordered closest-to-furthest. legacyBandCodes is retained
    // ONLY to keep AvailableMaxDistance.includedBandCodes backward-compatible in the JSON
    // response shape — it is a static display list, no longer used to filter membership.
    private record TierDef(int maxKm, String label, List<String> legacyBandCodes) {}

    private static final List<TierDef> TIER_DEFS = List.of(
            new TierDef(10,  "Within 10 km",  List.of("0_10")),
            new TierDef(25,  "Up to 25 km",   List.of("0_10", "10_25")),
            new TierDef(50,  "Up to 50 km",   List.of("0_10", "10_25", "25_50")),
            new TierDef(100, "Up to 100 km",  List.of("0_10", "10_25", "25_50", "50_up"))
    );

    private final JdbcOperations jdbcOperations;
    private final CityActivationGuard cityActivationGuard;
    private final AgriDestinationPort agriDestinationPort;

    public RegionalAreaGroupsService(
            JdbcOperations jdbcOperations,
            CityActivationGuard cityActivationGuard,
            AgriDestinationPort agriDestinationPort) {
        this.jdbcOperations = jdbcOperations;
        this.cityActivationGuard = cityActivationGuard;
        this.agriDestinationPort = agriDestinationPort;
    }

    /**
     * Returns regional corridor groups for the given city and property type, with no intent filter
     * (backward-compatible; identical to pre-#2151 behaviour for callers that don't send one).
     */
    @Transactional(readOnly = true)
    public RegionalAreaGroupsResponse getRegionalGroups(String city, String propertyType) {
        return getRegionalGroups(city, propertyType, null);
    }

    /**
     * Returns regional corridor groups for the given city and property type.
     *
     * @param city            city slug (normalised to lowercase)
     * @param propertyType    property type filter — currently only {@code agricultural_land} is
     *                        classified into {@code agri_destination_classification}; any other
     *                        value yields an empty response (no destinations to bucket)
     * @param listingPurpose  OPTIONAL additive filter (#2151 AC7 ruling): {@code "sale"},
     *                        {@code "rent"}, or {@code null}/blank for no intent filter (today's
     *                        behaviour, unchanged). Reaching the SAME {@link AgriDestinationPort}
     *                        call as the parcel drill-down is what makes AC7 parity reachable once
     *                        a caller sends this param — the frontend does not yet (#2151 PR C
     *                        carry-over, see decisions.pr_b_scope_rulings.oq5_ac7_scope).
     * @return response with ordered corridor groups (only tiers with &gt;= 1 live parcel)
     */
    @Transactional(readOnly = true)
    public RegionalAreaGroupsResponse getRegionalGroups(String city, String propertyType, String listingPurpose) {
        String normalizedCity = city.toLowerCase();
        String normalizedType = propertyType == null ? "" : propertyType.trim().toLowerCase();
        String normalizedPurpose = (listingPurpose != null && !listingPurpose.isBlank())
                ? listingPurpose.trim() : null;
        log.debug("getRegionalGroups city={} propertyType={} listingPurpose={}",
                normalizedCity, normalizedType, normalizedPurpose);

        if (!cityActivationGuard.isActiveCitySlug(normalizedCity)) {
            log.debug("getRegionalGroups city={} — inactive or unknown city", normalizedCity);
            return new RegionalAreaGroupsResponse(normalizedCity, List.of());
        }

        // Only agricultural_land is classified into agri_destination_classification today.
        if (!"agricultural_land".equals(normalizedType)) {
            log.debug("getRegionalGroups city={} propertyType={} — not the Agri classification type",
                    normalizedCity, normalizedType);
            return new RegionalAreaGroupsResponse(normalizedCity, List.of());
        }

        // ── Single port call: ALL destinations for the city, unbounded, with live parcel
        //    counts/acreage under the given filters. Tiers are then bucketed ABOVE the port,
        //    in Java, against the precomputed distanceKm — no per-request geodesic recomputation.
        AgriDestinationPort.DestinationScope scope = agriDestinationPort.findDestinations(
                new AgriDestinationPort.DestinationScopeQuery(
                        normalizedCity, null, null,
                        new AgriDestinationPort.AgriDestinationFilters(normalizedPurpose),
                        true));

        if (scope.destinations().isEmpty()) {
            log.debug("getRegionalGroups city={} — no destinations in scope", normalizedCity);
            return new RegionalAreaGroupsResponse(normalizedCity, List.of());
        }

        return assembleCorridors(normalizedCity, scope);
    }

    /**
     * Revision-scoped overload (#2151 PR B Track 2) backing {@code
     * AdminCityLaunchPreviewController}'s {@code .../preview/regional-area-groups} endpoint.
     *
     * <p>Deliberately does NOT call {@link CityActivationGuard} and does NOT accept a
     * {@code propertyType} param — a revision preview is agri-only by construction (the panel this
     * backs only ever previews Agricultural land corridors) and previewing a not-yet-active city is
     * the normal case, not a fail-closed condition (mirrors {@link AgriDestinationPort}'s preview
     * contract — see {@link AgriDestinationPortPostgresAdapter}).
     *
     * <p>Shares {@link #assembleCorridors} with the production path above, so label-loading and
     * cumulative-tier bucketing are identical code for both — only the port query source differs.
     */
    @Transactional(readOnly = true)
    public RegionalAreaGroupsResponse getRegionalGroupsForRevision(
            String citySlug, String listingPurpose, long revisionId) {
        String normalizedCity = citySlug.toLowerCase();
        String normalizedPurpose = (listingPurpose != null && !listingPurpose.isBlank())
                ? listingPurpose.trim() : null;
        log.debug("getRegionalGroupsForRevision city={} revisionId={} listingPurpose={}",
                normalizedCity, revisionId, normalizedPurpose);

        AgriDestinationPort.DestinationScope scope = agriDestinationPort.findDestinations(
                new AgriDestinationPort.DestinationScopeQuery(
                        normalizedCity, null, null,
                        new AgriDestinationPort.AgriDestinationFilters(normalizedPurpose),
                        true, revisionId));

        if (scope.destinations().isEmpty()) {
            log.debug("getRegionalGroupsForRevision city={} revisionId={} — no destinations in scope",
                    normalizedCity, revisionId);
            return new RegionalAreaGroupsResponse(normalizedCity, List.of());
        }

        return assembleCorridors(normalizedCity, scope);
    }

    // ── Corridor assembly (labels + cumulative tiers), shared by production and preview ─────────

    private RegionalAreaGroupsResponse assembleCorridors(
            String normalizedCity, AgriDestinationPort.DestinationScope scope) {
        // ── Labels: city_regional_direction_labels is city DISPLAY CONFIG, not
        //    regional_area_classifications — unaffected by the cutover (AC10). Also reused as-is by
        //    the preview path (#2151 PR B Track 2 item 2): a never-launched city legitimately has no
        //    label row yet, and the null-check below already degrades gracefully to the raw
        //    direction code — no separate handling needed.
        Map<String, LabelEntry> labelsMap = new LinkedHashMap<>();
        jdbcOperations.query(LABELS_SQL,
                (RowCallbackHandler) rs -> labelsMap.put(
                        rs.getString("direction_code"),
                        new LabelEntry(rs.getString("group_name"), rs.getInt("sort_order"))
                ),
                normalizedCity
        );

        // ── Group destination buckets by direction.
        Map<String, List<AgriDestinationPort.DestinationBucket>> byDirection = new LinkedHashMap<>();
        for (AgriDestinationPort.DestinationBucket bucket : scope.destinations()) {
            byDirection.computeIfAbsent(bucket.direction(), k -> new ArrayList<>()).add(bucket);
        }

        List<CorridorGroup> corridors = new ArrayList<>(byDirection.size());
        for (Map.Entry<String, List<AgriDestinationPort.DestinationBucket>> e : byDirection.entrySet()) {
            List<AvailableMaxDistance> tiers = buildCumulativeTiers(e.getValue());
            if (tiers.isEmpty()) continue; // direction has no live parcels in any tier

            String dirCode = e.getKey();
            LabelEntry labelEntry = labelsMap.get(dirCode);
            String groupName = labelEntry != null ? labelEntry.groupName() : dirCode + " corridor";
            corridors.add(new CorridorGroup(dirCode, groupName, List.copyOf(tiers)));
        }

        corridors.sort((a, b) -> {
            LabelEntry la = labelsMap.get(a.directionCode());
            LabelEntry lb = labelsMap.get(b.directionCode());
            if (la != null && lb != null) return Integer.compare(la.sortOrder(), lb.sortOrder());
            if (la != null) return -1;
            if (lb != null) return 1;
            int ia = COMPASS_ORDER.indexOf(a.directionCode());
            int ib = COMPASS_ORDER.indexOf(b.directionCode());
            if (ia < 0) ia = Integer.MAX_VALUE;
            if (ib < 0) ib = Integer.MAX_VALUE;
            return Integer.compare(ia, ib);
        });

        log.debug("assembleCorridors city={} returned {} corridors", normalizedCity, corridors.size());
        return new RegionalAreaGroupsResponse(normalizedCity, List.copyOf(corridors));
    }

    // ── Tier construction (above the port) ──────────────────────────────────────────────────────

    private static List<AvailableMaxDistance> buildCumulativeTiers(
            List<AgriDestinationPort.DestinationBucket> buckets) {
        List<AvailableMaxDistance> tiers = new ArrayList<>(TIER_DEFS.size());
        for (TierDef tier : TIER_DEFS) {
            long cumCount = 0;
            double acreageSum = 0.0;
            boolean anyAcreage = false;
            LinkedHashSet<String> cumAreaKeys = new LinkedHashSet<>();

            for (AgriDestinationPort.DestinationBucket bucket : buckets) {
                if (bucket.distanceKm() > tier.maxKm()) continue; // #2151 OQ5: strict <=, no unbounded catch-all
                long count = bucket.parcelCount() != null ? bucket.parcelCount() : 0L;
                if (count == 0) continue;
                cumCount += count;
                cumAreaKeys.add(bucket.areaKey());
                if (bucket.parcelAcreage() != null) {
                    acreageSum += bucket.parcelAcreage();
                    anyAcreage = true;
                }
            }

            if (cumCount == 0) continue; // suppress empty tier

            Double acreage = anyAcreage ? acreageSum : null;
            tiers.add(new AvailableMaxDistance(
                    tier.maxKm(),
                    tier.label(),
                    tier.legacyBandCodes(),
                    cumCount,
                    acreage,
                    List.copyOf(cumAreaKeys)
            ));
        }
        return tiers;
    }

    // ── Private row types ────────────────────────────────────────────────────────────────────────

    private record LabelEntry(String groupName, int sortOrder) {}

    // ── SQL ───────────────────────────────────────────────────────────────────

    /**
     * Loads direction labels from city_regional_direction_labels — city display CONFIG, not
     * regional_area_classifications (AC10 unaffected). This table has no FK to {@code cities}, but
     * it is read only AFTER {@link CityActivationGuard#isActiveCitySlug} has already short-circuited
     * an inactive/unknown city in {@link #getRegionalGroups(String, String, String)}, mirroring the
     * pre-#2151 guard placement exactly.
     * Bound arg: [city_key].
     */
    private static final String LABELS_SQL =
            "SELECT direction_code, group_name, sort_order FROM city_regional_direction_labels " +
            "WHERE city_key = ? ORDER BY sort_order ASC";
}

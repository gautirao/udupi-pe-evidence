package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Projects a city's {@code regional_area_classifications} into materialized
 * {@code city_regions} / {@code city_region_memberships} rows, under the city's
 * {@code city_region_policy} (#1882).
 *
 * <p>Mirrors {@link RegionalClassificationBackfillService}'s JdbcOperations +
 * {@code @Transactional} + upsert-idempotency shape. All per-city behaviour is driven
 * entirely by the loaded policy row + {@code regional_area_overrides} rows — there is no
 * city-name/slug conditional anywhere in this class.
 *
 * <h2>dryRun vs apply</h2>
 * {@link #dryRun(int)} performs zero writes: it loads the policy + classifications, projects
 * each eligible area's region via {@link CityRegionProjection}, and categorizes every active
 * {@code area_group} as UNIFIED / SPLIT / DEGENERATE based on that raw (pre-override)
 * projection.
 *
 * <p>{@link #apply(int)} re-derives the same report inside its own transaction, then
 * additionally checks that every non-UNIFIED group has at least one effective region across its
 * members (after applying {@code regional_area_overrides}). A genuine SPLIT group — one whose
 * members legitimately project to two or more regions — is expected and supported (#1910's
 * {@code RegionScopedAreaGroup} projection renders such a group under each of its regions,
 * showing only that region's member subset) and proceeds with each member keeping its own
 * independently-resolved region_key. Only a DEGENERATE group — one where no member has any
 * projected region and no override resolves one either — throws
 * {@link RegionOnboardingBlockedException} and rolls back the transaction — never silently
 * picking a region by first-member, majority, or group focus point.
 *
 * <h2>Region key / area_group slug namespace (#1910)</h2>
 * {@link #apply(int)} also refuses to materialize {@code city_regions} if any region_key about
 * to be written collides with an active {@code area_groups.slug} for the same city — the two
 * identifier spaces must stay disjoint. This is checked here, the single choke point where
 * region keys are ever persisted, so a colliding key can never reach the database in the first
 * place.
 */
@Service
public class CityRegionOnboardingService {

    private static final Logger log = LoggerFactory.getLogger(CityRegionOnboardingService.class);

    private final JdbcOperations jdbcOperations;

    public CityRegionOnboardingService(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /** Read-only preview: no writes, ever. */
    @Transactional(readOnly = true)
    public CityRegionOnboardingReport dryRun(int cityId) {
        return buildReport(cityId);
    }

    /**
     * Materializes {@code city_regions} + {@code city_region_memberships} for a city.
     * Rolls back with {@link RegionOnboardingBlockedException} if prerequisites are missing
     * or any area_group is DEGENERATE (no eligible/overridden member) — a SPLIT area_group
     * (members spanning 2+ regions) is expected and proceeds, each member keeping its own
     * independently-resolved region_key (#1910).
     */
    @Transactional
    public void apply(int cityId) {
        CityRegionOnboardingReport report = buildReport(cityId);

        if (report.regionModel() == null) {
            throw new RegionOnboardingBlockedException(
                    RegionOnboardingBlockedException.Reason.MISSING_POLICY,
                    "No city_region_policy row for city_id=" + cityId
                            + " — assign a region_model before onboarding.");
        }
        if (!report.classificationsPresent()) {
            throw new RegionOnboardingBlockedException(
                    RegionOnboardingBlockedException.Reason.MISSING_CLASSIFICATIONS,
                    "No regional_area_classifications rows for city_id=" + cityId
                            + " (slug=" + report.citySlug() + ") — run RegionalClassificationBackfillService first.");
        }

        Set<String> regionKeys = new LinkedHashSet<>(CityRegionProjection.canonicalRegionOrder(report.regionModel()));
        Set<String> activeGroupSlugs = new LinkedHashSet<>(loadActiveAreaGroupSlugs(cityId));
        Set<String> namespaceCollisions = new LinkedHashSet<>(regionKeys);
        namespaceCollisions.retainAll(activeGroupSlugs);
        if (!namespaceCollisions.isEmpty()) {
            throw new RegionOnboardingBlockedException(
                    RegionOnboardingBlockedException.Reason.NAMESPACE_COLLISION,
                    "city_id=" + cityId + " (slug=" + report.citySlug() + ") has active area_groups.slug "
                            + "value(s) colliding with region_model=" + report.regionModel() + " region keys: "
                            + String.join(", ", namespaceCollisions) + " — region keys and area_group slugs "
                            + "must be disjoint; rename the colliding area_group(s) or choose a different "
                            + "region_model. Refusing to silently let one namespace win.");
        }

        Map<String, String> overrides = loadOverrides(cityId);
        validateOverrideRegionKeys(overrides, report.regionModel());

        List<CityRegionOnboardingReport.GroupCategorization> degenerate = report.groupCategorizations().stream()
                .filter(g -> g.category() != CityRegionOnboardingReport.GroupCategory.UNIFIED)
                .filter(g -> !hasEffectiveRegion(g, report, overrides))
                .toList();

        if (!degenerate.isEmpty()) {
            String groupList = degenerate.stream()
                    .map(g -> g.groupSlug() + "(" + g.category() + ")")
                    .collect(Collectors.joining(", "));
            throw new RegionOnboardingBlockedException(
                    RegionOnboardingBlockedException.Reason.DEGENERATE_GROUP,
                    "city_id=" + cityId + " (slug=" + report.citySlug() + ") has degenerate area_groups (no "
                            + "eligible or overridden member): " + groupList + " — add regional_area_overrides "
                            + "rows to resolve, or fix the underlying curated grouping. SPLIT groups (members "
                            + "spanning 2+ regions) are expected and are not blocked here. Refusing to guess via "
                            + "first-member/majority/focus fallback.");
        }

        // Effective per-area assignment: override wins over the raw projection.
        Map<String, EffectiveAssignment> effective = new LinkedHashMap<>();
        for (CityRegionOnboardingReport.AreaProjection proj : report.areaProjections()) {
            String forced = overrides.get(proj.areaKey());
            effective.put(proj.areaKey(), forced != null
                    ? new EffectiveAssignment(forced, "OVERRIDE")
                    : new EffectiveAssignment(proj.regionKey(), "AUTO"));
        }
        // Overrides may also target areas outside the classified set (e.g. resolving a
        // DEGENERATE group whose member has no classification row) — include those too.
        for (Map.Entry<String, String> ov : overrides.entrySet()) {
            effective.putIfAbsent(ov.getKey(), new EffectiveAssignment(ov.getValue(), "OVERRIDE"));
        }

        for (Map.Entry<String, EffectiveAssignment> e : effective.entrySet()) {
            if (e.getValue().regionKey() == null || e.getValue().regionKey().isBlank()) {
                throw new RegionOnboardingBlockedException(
                        RegionOnboardingBlockedException.Reason.ASSIGNMENT_INTEGRITY_BREACH,
                        "area_key=" + e.getKey() + " resolved to a blank region_key for city_id=" + cityId);
            }
        }

        String fingerprint = computeFingerprint(report.regionModel(), report.centralRadiusKm(), report.citySlug());
        List<ExpectedRegionRow> expectedRows = computeExpectedRegionRows(
                cityId, report.citySlug(), report.regionModel(), effective, report.areaProjections());

        if (isNoOp(cityId, fingerprint, effective, expectedRows)) {
            log.info("CityRegionOnboardingService: apply city_id={} slug={} — no-op (fingerprint + memberships + "
                            + "geometry unchanged)",
                    cityId, report.citySlug());
            return;
        }

        upsertCityRegions(cityId, fingerprint, expectedRows);
        upsertMemberships(cityId, effective);
        deleteStaleAutoMemberships(cityId, effective.keySet());

        log.info("CityRegionOnboardingService: apply city_id={} slug={} regionModel={} — {} regions, {} memberships",
                cityId, report.citySlug(), report.regionModel(),
                CityRegionProjection.canonicalRegionOrder(report.regionModel()).size(), effective.size());
    }

    // ── Report construction (shared by dryRun + apply) ───────────────────────

    private CityRegionOnboardingReport buildReport(int cityId) {
        CitySlugRow city = jdbcOperations.query(CITY_SQL, rs -> rs.next()
                ? new CitySlugRow(rs.getString("slug"), rs.getString("name"))
                : null, cityId);
        String citySlug = city != null ? city.slug() : null;
        String cityName = city != null ? city.name() : null;

        PolicyRow policy = jdbcOperations.query(POLICY_SQL, rs -> rs.next()
                ? new PolicyRow(rs.getString("region_model"), rs.getDouble("central_radius_km"))
                : null, cityId);

        List<CityRegionOnboardingReport.AreaProjection> areaProjections = List.of();
        boolean classificationsPresent = false;

        if (citySlug != null && policy != null) {
            List<ClassificationRow> classifications = jdbcOperations.query(
                    CLASSIFICATIONS_SQL,
                    (rs, rowNum) -> new ClassificationRow(
                            rs.getString("area_key"),
                            rs.getString("direction_key"),
                            rs.getDouble("distance_km"),
                            nullableDouble(rs.getObject("geo_center_lat")),
                            nullableDouble(rs.getObject("geo_center_lon")),
                            nullableDouble(rs.getObject("min_lat")),
                            nullableDouble(rs.getObject("min_lon")),
                            nullableDouble(rs.getObject("max_lat")),
                            nullableDouble(rs.getObject("max_lon"))
                    ),
                    citySlug);

            classificationsPresent = !classifications.isEmpty();

            List<CityRegionOnboardingReport.AreaProjection> projections = new ArrayList<>();
            for (ClassificationRow c : classifications) {
                String regionKey = CityRegionProjection.projectRegionKey(
                        c.distanceKm(), c.directionKey(), policy.regionModel(), policy.centralRadiusKm());
                projections.add(new CityRegionOnboardingReport.AreaProjection(
                        c.areaKey(), regionKey, c.distanceKm(), c.directionKey(),
                        c.geoCenterLat(), c.geoCenterLon(), c.minLat(), c.minLon(), c.maxLat(), c.maxLon()));
            }
            areaProjections = projections;
        }

        Map<String, String> regionByArea = areaProjections.stream()
                .collect(Collectors.toMap(
                        CityRegionOnboardingReport.AreaProjection::areaKey,
                        CityRegionOnboardingReport.AreaProjection::regionKey,
                        (a, b) -> a, LinkedHashMap::new));

        List<CityRegionOnboardingReport.GroupCategorization> groupCategorizations = List.of();
        if (citySlug != null && policy != null) {
            List<GroupMemberRow> groupMembers = jdbcOperations.query(
                    AREA_GROUPS_SQL,
                    (rs, rowNum) -> new GroupMemberRow(
                            rs.getString("slug"), rs.getString("name"), rs.getString("area_key")),
                    cityId);

            Map<String, List<GroupMemberRow>> byGroup = groupMembers.stream()
                    .collect(Collectors.groupingBy(GroupMemberRow::groupSlug, LinkedHashMap::new, Collectors.toList()));

            List<CityRegionOnboardingReport.GroupCategorization> categorizations = new ArrayList<>();
            for (Map.Entry<String, List<GroupMemberRow>> e : byGroup.entrySet()) {
                List<GroupMemberRow> members = e.getValue();
                String groupName = members.get(0).groupName();
                List<String> memberAreaKeys = members.stream().map(GroupMemberRow::areaKey).toList();
                Set<String> eligibleRegions = new LinkedHashSet<>();
                for (String areaKey : memberAreaKeys) {
                    String r = regionByArea.get(areaKey);
                    if (r != null) {
                        eligibleRegions.add(r);
                    }
                }
                CityRegionOnboardingReport.GroupCategory category = eligibleRegions.isEmpty()
                        ? CityRegionOnboardingReport.GroupCategory.DEGENERATE
                        : eligibleRegions.size() == 1
                                ? CityRegionOnboardingReport.GroupCategory.UNIFIED
                                : CityRegionOnboardingReport.GroupCategory.SPLIT;
                categorizations.add(new CityRegionOnboardingReport.GroupCategorization(
                        e.getKey(), groupName, category, List.copyOf(eligibleRegions), memberAreaKeys));
            }
            groupCategorizations = categorizations;
        }

        return new CityRegionOnboardingReport(
                cityId, citySlug, cityName,
                policy != null ? policy.regionModel() : null,
                policy != null ? policy.centralRadiusKm() : 0,
                classificationsPresent,
                areaProjections,
                groupCategorizations);
    }

    /**
     * A non-UNIFIED group is non-degenerate (does not block {@link #apply(int)}) iff, after
     * overriding each member's region with any matching {@code regional_area_overrides} row
     * (falling back to its raw projection), the group's effective member set is non-empty —
     * i.e. at least one member has a projected or overridden region.
     *
     * <p>A group with 2+ distinct effective regions is a genuine SPLIT and is intentionally
     * allowed through: #1910's region-scoped group projection renders such a group under each
     * of its regions, showing only that region's member subset, so members are never forced to
     * collapse onto a single region here. Only an empty effective region set (DEGENERATE) is
     * blocking.
     */
    private boolean hasEffectiveRegion(
            CityRegionOnboardingReport.GroupCategorization group,
            CityRegionOnboardingReport report,
            Map<String, String> overrides) {

        Map<String, String> regionByArea = report.areaProjections().stream()
                .collect(Collectors.toMap(
                        CityRegionOnboardingReport.AreaProjection::areaKey,
                        CityRegionOnboardingReport.AreaProjection::regionKey,
                        (a, b) -> a));

        for (String areaKey : group.memberAreaKeys()) {
            String forced = overrides.get(areaKey);
            String effectiveRegion = forced != null ? forced : regionByArea.get(areaKey);
            if (effectiveRegion != null) {
                return true;
            }
        }
        return false;
    }

    // ── apply() helpers ───────────────────────────────────────────────────────

    private List<String> loadActiveAreaGroupSlugs(int cityId) {
        return jdbcOperations.queryForList(AREA_GROUP_SLUGS_SQL, String.class, cityId);
    }

    private Map<String, String> loadOverrides(int cityId) {
        return jdbcOperations.query(OVERRIDES_SQL,
                        (rs, rowNum) -> Map.entry(rs.getString("area_key"), rs.getString("forced_region_key")),
                        cityId)
                .stream()
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue, (a, b) -> b, LinkedHashMap::new));
    }

    private void validateOverrideRegionKeys(Map<String, String> overrides, String regionModel) {
        List<String> canonical = CityRegionProjection.canonicalRegionOrder(regionModel);
        for (Map.Entry<String, String> e : overrides.entrySet()) {
            if (!canonical.contains(e.getValue())) {
                throw new RegionOnboardingBlockedException(
                        RegionOnboardingBlockedException.Reason.ASSIGNMENT_INTEGRITY_BREACH,
                        "regional_area_overrides.forced_region_key=" + e.getValue()
                                + " for area_key=" + e.getKey()
                                + " is not a valid region for region_model=" + regionModel);
            }
        }
    }

    /**
     * A regeneration is a no-op only when NOTHING that feeds the materialized {@code
     * city_regions} rows has changed: the policy fingerprint, the effective per-area region
     * assignments, AND the fully-derived expected {@code city_regions} rows (centre, bounds,
     * label, display_order) themselves — computed fresh from the current area geometry via
     * {@link #computeExpectedRegionRows}. The last check exists because centre/bounds are
     * derived entirely from per-area {@code geo_center_lat/lon} and
     * {@code min/max_lat/min/max_lon} (see {@link #computeExpectedRegionRows}), which can change
     * independently of the policy and the region assignment (e.g. a bbox correction) — without
     * it, a geometry-only change would be wrongly treated as a no-op and city_regions would keep
     * stale bounds.
     */
    private boolean isNoOp(
            int cityId, String fingerprint, Map<String, EffectiveAssignment> effective,
            List<ExpectedRegionRow> expectedRows) {
        List<String> existingFingerprints = jdbcOperations.queryForList(
                "SELECT DISTINCT policy_fingerprint FROM city_regions WHERE city_id = ?", String.class, cityId);
        if (existingFingerprints.size() != 1 || !fingerprint.equals(existingFingerprints.get(0))) {
            return false;
        }

        Map<String, EffectiveAssignment> existing = jdbcOperations.query(
                        "SELECT area_key, region_key, assignment_source FROM city_region_memberships WHERE city_id = ?",
                        (rs, rowNum) -> Map.entry(rs.getString("area_key"),
                                new EffectiveAssignment(rs.getString("region_key"), rs.getString("assignment_source"))),
                        cityId)
                .stream()
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue, (a, b) -> b, LinkedHashMap::new));

        if (!existing.equals(effective)) {
            return false;
        }

        Map<String, ExpectedRegionRow> storedRows = jdbcOperations.query(
                        """
                        SELECT region_key, display_label, display_order,
                               centre_lat, centre_lon, min_lat, max_lat, min_lon, max_lon
                        FROM city_regions WHERE city_id = ?
                        """,
                        (rs, rowNum) -> new ExpectedRegionRow(
                                rs.getString("region_key"),
                                rs.getString("display_label"),
                                rs.getInt("display_order"),
                                nullableDouble(rs.getObject("centre_lat")),
                                nullableDouble(rs.getObject("centre_lon")),
                                nullableDouble(rs.getObject("min_lat")),
                                nullableDouble(rs.getObject("max_lat")),
                                nullableDouble(rs.getObject("min_lon")),
                                nullableDouble(rs.getObject("max_lon"))),
                        cityId)
                .stream()
                .collect(Collectors.toMap(ExpectedRegionRow::regionKey, r -> r, (a, b) -> b, LinkedHashMap::new));

        if (storedRows.size() != expectedRows.size()) {
            return false;
        }
        for (ExpectedRegionRow expected : expectedRows) {
            ExpectedRegionRow stored = storedRows.get(expected.regionKey());
            if (stored == null || !expected.matches(stored)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Derives, for every canonical region of {@code regionModel}, the expected materialized
     * {@code city_regions} row (label, display_order, centre, bounds) from the CURRENT per-area
     * geometry of its effective members. Computed once and reused by both {@link #isNoOp} (to
     * detect geometry-only drift) and {@link #upsertCityRegions} (to persist it) — never derived
     * twice, to avoid the two falling out of sync.
     */
    private List<ExpectedRegionRow> computeExpectedRegionRows(
            int cityId, String citySlug, String regionModel,
            Map<String, EffectiveAssignment> effective,
            List<CityRegionOnboardingReport.AreaProjection> areaProjections) {

        Map<String, CityRegionOnboardingReport.AreaProjection> byArea = areaProjections.stream()
                .collect(Collectors.toMap(CityRegionOnboardingReport.AreaProjection::areaKey, p -> p, (a, b) -> a));

        Map<String, String> directionLabels = jdbcOperations.query(
                        "SELECT direction_code, group_name FROM city_regional_direction_labels WHERE city_key = ?",
                        (rs, rowNum) -> Map.entry(rs.getString("direction_code"), rs.getString("group_name")),
                        citySlug)
                .stream()
                .collect(Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue, (a, b) -> a));

        String cityName = jdbcOperations.queryForObject(
                "SELECT name FROM cities WHERE id = ?", String.class, cityId);

        List<ExpectedRegionRow> rows = new ArrayList<>();
        for (String regionKey : CityRegionProjection.canonicalRegionOrder(regionModel)) {
            List<CityRegionOnboardingReport.AreaProjection> members = effective.entrySet().stream()
                    .filter(e -> regionKey.equals(e.getValue().regionKey()))
                    .map(e -> byArea.get(e.getKey()))
                    .filter(Objects::nonNull)
                    .toList();

            Double centreLat = average(members.stream().map(CityRegionOnboardingReport.AreaProjection::geoCenterLat).toList());
            Double centreLon = average(members.stream().map(CityRegionOnboardingReport.AreaProjection::geoCenterLon).toList());
            Double minLat = min(members.stream().map(m -> m.minLat() != null ? m.minLat() : m.geoCenterLat()).toList());
            Double maxLat = max(members.stream().map(m -> m.maxLat() != null ? m.maxLat() : m.geoCenterLat()).toList());
            Double minLon = min(members.stream().map(m -> m.minLon() != null ? m.minLon() : m.geoCenterLon()).toList());
            Double maxLon = max(members.stream().map(m -> m.maxLon() != null ? m.maxLon() : m.geoCenterLon()).toList());

            String label = directionLabels.get(regionKey);
            if (label == null) {
                label = fallbackLabel(regionKey, cityName);
            }

            rows.add(new ExpectedRegionRow(
                    regionKey, label, CityRegionProjection.displayOrder(regionKey),
                    centreLat, centreLon, minLat, maxLat, minLon, maxLon));
        }
        return rows;
    }

    private void upsertCityRegions(int cityId, String fingerprint, List<ExpectedRegionRow> expectedRows) {
        for (ExpectedRegionRow row : expectedRows) {
            jdbcOperations.update(UPSERT_CITY_REGION_SQL,
                    cityId, row.regionKey(), row.displayLabel(), row.displayOrder(),
                    row.centreLat(), row.centreLon(), row.minLat(), row.maxLat(), row.minLon(), row.maxLon(),
                    fingerprint);
        }
    }

    private static String fallbackLabel(String regionKey, String cityName) {
        String safeCityName = cityName != null ? cityName : "";
        if (CityRegionProjection.CENTRAL.equals(regionKey)) {
            return ("Central " + safeCityName).trim();
        }
        String directionWord = switch (regionKey) {
            case "N" -> "North";
            case "NE" -> "Northeast";
            case "E" -> "East";
            case "SE" -> "Southeast";
            case "S" -> "South";
            case "SW" -> "Southwest";
            case "W" -> "West";
            case "NW" -> "Northwest";
            default -> regionKey;
        };
        return (directionWord + " " + safeCityName).trim();
    }

    private void upsertMemberships(int cityId, Map<String, EffectiveAssignment> effective) {
        for (Map.Entry<String, EffectiveAssignment> e : effective.entrySet()) {
            jdbcOperations.update(UPSERT_MEMBERSHIP_SQL,
                    cityId, e.getKey(), e.getValue().regionKey(), e.getValue().source());
        }
    }

    private void deleteStaleAutoMemberships(int cityId, Set<String> currentAreaKeys) {
        if (currentAreaKeys.isEmpty()) {
            jdbcOperations.update(
                    "DELETE FROM city_region_memberships WHERE city_id = ? AND assignment_source = 'AUTO'", cityId);
            return;
        }
        List<String> placeholders = Collections.nCopies(currentAreaKeys.size(), "?");
        String sql = "DELETE FROM city_region_memberships WHERE city_id = ? AND assignment_source = 'AUTO' "
                + "AND area_key NOT IN (" + String.join(", ", placeholders) + ")";
        List<Object> params = new ArrayList<>();
        params.add(cityId);
        params.addAll(currentAreaKeys);
        jdbcOperations.update(sql, params.toArray());
    }

    /**
     * sha256 of (region_model | central_radius_km | sorted "direction_code:group_name" pairs
     * for the city). Changing the policy OR a direction label re-stamps every city_regions row
     * on the next apply(); an unrelated re-run with nothing changed is a no-op (see
     * {@link #isNoOp}).
     */
    private String computeFingerprint(String regionModel, double centralRadiusKm, String citySlug) {
        List<String> labelPairs = jdbcOperations.query(
                        "SELECT direction_code, group_name FROM city_regional_direction_labels WHERE city_key = ? ORDER BY direction_code",
                        (rs, rowNum) -> rs.getString("direction_code") + ":" + rs.getString("group_name"),
                        citySlug);

        String canonical = regionModel + "|" + centralRadiusKm + "|" + String.join(",", labelPairs);
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(canonical.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is guaranteed available on every JVM; unreachable in practice.
            return canonical;
        }
    }

    // ── Row types ─────────────────────────────────────────────────────────────

    private record CitySlugRow(String slug, String name) {}

    private record PolicyRow(String regionModel, double centralRadiusKm) {}

    private record ClassificationRow(
            String areaKey, String directionKey, double distanceKm,
            Double geoCenterLat, Double geoCenterLon,
            Double minLat, Double minLon, Double maxLat, Double maxLon) {}

    private record GroupMemberRow(String groupSlug, String groupName, String areaKey) {}

    private record EffectiveAssignment(String regionKey, String source) {}

    /**
     * The fully-derived expected (or stored) {@code city_regions} row for one region_key —
     * everything {@link #upsertCityRegions} writes except {@code city_id}/{@code
     * policy_fingerprint}/{@code generated_at}. Compared field-by-field by {@link #isNoOp}
     * against the currently-stored row, with a small epsilon on the numeric geometry fields to
     * tolerate NUMERIC column round-tripping (Java double -> Postgres NUMERIC -> double).
     */
    private record ExpectedRegionRow(
            String regionKey, String displayLabel, int displayOrder,
            Double centreLat, Double centreLon, Double minLat, Double maxLat, Double minLon, Double maxLon) {

        private static final double EPSILON = 1e-9;

        boolean matches(ExpectedRegionRow other) {
            return Objects.equals(displayLabel, other.displayLabel)
                    && displayOrder == other.displayOrder
                    && numEquals(centreLat, other.centreLat)
                    && numEquals(centreLon, other.centreLon)
                    && numEquals(minLat, other.minLat)
                    && numEquals(maxLat, other.maxLat)
                    && numEquals(minLon, other.minLon)
                    && numEquals(maxLon, other.maxLon);
        }

        private static boolean numEquals(Double a, Double b) {
            if (a == null || b == null) {
                return a == null && b == null;
            }
            return Math.abs(a - b) < EPSILON;
        }
    }

    private static Double nullableDouble(Object val) {
        return val == null ? null : ((Number) val).doubleValue();
    }

    private static Double average(List<Double> values) {
        List<Double> present = values.stream().filter(Objects::nonNull).toList();
        if (present.isEmpty()) return null;
        return present.stream().mapToDouble(Double::doubleValue).average().orElse(0.0);
    }

    private static Double min(List<Double> values) {
        return values.stream().filter(Objects::nonNull).min(Double::compareTo).orElse(null);
    }

    private static Double max(List<Double> values) {
        return values.stream().filter(Objects::nonNull).max(Double::compareTo).orElse(null);
    }

    // ── SQL ───────────────────────────────────────────────────────────────────

    private static final String CITY_SQL = "SELECT slug, name FROM cities WHERE id = ?";

    private static final String POLICY_SQL =
            "SELECT region_model, central_radius_km FROM city_region_policy WHERE city_id = ?";

    /** Mirrors RegionalClassificationBackfillService's 4-segment eligibility guard exactly. */
    private static final String CLASSIFICATIONS_SQL = """
            SELECT rac.area_key, rac.direction_key, rac.distance_km,
                   a.geo_center_lat, a.geo_center_lon,
                   a.min_lat, a.min_lon, a.max_lat, a.max_lon
            FROM regional_area_classifications rac
            JOIN areas a ON a.area_key = rac.area_key
            WHERE rac.city_key = ?
              AND array_length(string_to_array(rac.area_key, '|'), 1) = 4
            ORDER BY rac.area_key
            """;

    private static final String AREA_GROUPS_SQL = """
            SELECT ag.slug AS slug, ag.name AS name, agm.area_key AS area_key
            FROM area_groups ag
            JOIN area_group_members agm ON agm.area_group_id = ag.id
            WHERE ag.city_id = ? AND ag.is_active = true
            ORDER BY ag.slug, agm.display_order
            """;

    private static final String OVERRIDES_SQL =
            "SELECT area_key, forced_region_key FROM regional_area_overrides WHERE city_id = ?";

    /** #1910: namespace-collision guard input — active area_group slugs, mirrors AREA_GROUPS_SQL's filter. */
    private static final String AREA_GROUP_SLUGS_SQL =
            "SELECT slug FROM area_groups WHERE city_id = ? AND is_active = true";

    private static final String UPSERT_CITY_REGION_SQL = """
            INSERT INTO city_regions
                (city_id, region_key, display_label, display_order,
                 centre_lat, centre_lon, min_lat, max_lat, min_lon, max_lon,
                 policy_fingerprint, generated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, now())
            ON CONFLICT (city_id, region_key) DO UPDATE SET
                display_label      = EXCLUDED.display_label,
                display_order      = EXCLUDED.display_order,
                centre_lat          = EXCLUDED.centre_lat,
                centre_lon          = EXCLUDED.centre_lon,
                min_lat             = EXCLUDED.min_lat,
                max_lat             = EXCLUDED.max_lat,
                min_lon             = EXCLUDED.min_lon,
                max_lon             = EXCLUDED.max_lon,
                policy_fingerprint  = EXCLUDED.policy_fingerprint,
                generated_at        = now()
            """;

    private static final String UPSERT_MEMBERSHIP_SQL = """
            INSERT INTO city_region_memberships (city_id, area_key, region_key, assignment_source, generated_at)
            VALUES (?, ?, ?, ?, now())
            ON CONFLICT (city_id, area_key) DO UPDATE SET
                region_key         = EXCLUDED.region_key,
                assignment_source  = EXCLUDED.assignment_source,
                generated_at       = now()
            """;
}

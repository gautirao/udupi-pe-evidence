package com.example.realestate.discover.citylaunch;

import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import com.example.realestate.discover.citylaunch.BoundaryGeometryResult.Reason;
import com.example.realestate.discover.citylaunch.BoundaryGeometryResult.Unavailable;

/**
 * Read-only access to a city's CANONICAL (already-materialized) geography:
 * {@code cities}, {@code areas}, {@code area_alias}, {@code city_regions},
 * {@code city_region_memberships}, {@code area_groups}, {@code area_group_members}.
 *
 * <p>Mirrors the {@code JdbcOperations} SELECT convention used by
 * {@link com.example.realestate.discover.AreaGroupsService} and
 * {@link com.example.realestate.discover.AreaResolutionService} — plain SQL, no ORM mapping, no
 * N+1 (one query per table, in-memory joins done by the caller via the returned key fields).
 *
 * <p><strong>SELECT-only.</strong> This class never calls {@code CityRegionOnboardingService.apply()}
 * or any onboarding/apply write path — it reads whatever is already materialized in the production
 * geography tables at the moment {@link #loadGeography(int)} is called. If a city has not yet been
 * onboarded (empty {@code city_regions}), that is surfaced to the caller as empty lists, not an
 * error — {@link CityLaunchGraphWriter} is responsible for turning "insufficient canonical data"
 * into a {@link GeographyValidationException} (AC4).
 */
@Component
public class CanonicalGeographyReader {

    private final JdbcOperations jdbcOperations;

    public CanonicalGeographyReader(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    @Transactional(readOnly = true)
    public Optional<CanonicalCity> findCity(int cityId) {
        List<CanonicalCity> rows = jdbcOperations.query(
                "SELECT id, slug, name FROM public.cities WHERE id = ?",
                (rs, rowNum) -> new CanonicalCity(rs.getInt("id"), rs.getString("slug"), rs.getString("name")),
                cityId);
        return rows.stream().findFirst();
    }

    /**
     * Loads the full canonical geography graph for one city in six single-table SELECTs (no N+1).
     * Every list may legitimately be empty (e.g. a city that has never been onboarded) — the
     * caller ({@link CityLaunchGraphWriter}) is responsible for deciding whether that is valid.
     */
    @Transactional(readOnly = true)
    public CanonicalGeography loadGeography(int cityId) {
        List<CanonicalArea> areas = jdbcOperations.query(
                "SELECT area_key, name, district, geo_center_lat, geo_center_lon, "
                        + "min_lat, min_lon, max_lat, max_lon, geometry_source, osm_element_type, osm_element_id, "
                        + "lifecycle_status "
                        + "FROM public.areas WHERE city_id = ?",
                (rs, rowNum) -> new CanonicalArea(
                        rs.getString("area_key"),
                        rs.getString("name"),
                        rs.getString("district"),
                        nullableDouble(rs.getObject("geo_center_lat")),
                        nullableDouble(rs.getObject("geo_center_lon")),
                        nullableDouble(rs.getObject("min_lat")),
                        nullableDouble(rs.getObject("min_lon")),
                        nullableDouble(rs.getObject("max_lat")),
                        nullableDouble(rs.getObject("max_lon")),
                        rs.getString("geometry_source"),
                        rs.getString("osm_element_type"),
                        (Long) rs.getObject("osm_element_id"),
                        rs.getString("lifecycle_status")),
                cityId);

        List<CanonicalAreaAlias> aliases = jdbcOperations.query(
                "SELECT area_key, alias, alias_normalised FROM public.area_alias WHERE city_id = ?",
                (rs, rowNum) -> new CanonicalAreaAlias(
                        rs.getString("area_key"), rs.getString("alias"), rs.getString("alias_normalised")),
                cityId);

        List<CanonicalCityRegion> regions = jdbcOperations.query(
                "SELECT region_key, display_label, display_order, centre_lat, centre_lon, "
                        + "min_lat, min_lon, max_lat, max_lon, policy_fingerprint "
                        + "FROM public.city_regions WHERE city_id = ?",
                (rs, rowNum) -> new CanonicalCityRegion(
                        rs.getString("region_key"),
                        rs.getString("display_label"),
                        (Integer) rs.getObject("display_order"),
                        (BigDecimal) rs.getObject("centre_lat"),
                        (BigDecimal) rs.getObject("centre_lon"),
                        (BigDecimal) rs.getObject("min_lat"),
                        (BigDecimal) rs.getObject("min_lon"),
                        (BigDecimal) rs.getObject("max_lat"),
                        (BigDecimal) rs.getObject("max_lon"),
                        rs.getString("policy_fingerprint")),
                cityId);

        List<CanonicalCityRegionMembership> memberships = jdbcOperations.query(
                "SELECT area_key, region_key, assignment_source FROM public.city_region_memberships WHERE city_id = ?",
                (rs, rowNum) -> new CanonicalCityRegionMembership(
                        rs.getString("area_key"), rs.getString("region_key"), rs.getString("assignment_source")),
                cityId);

        List<CanonicalAreaGroup> groups = jdbcOperations.query(
                "SELECT slug, name, subtitle, region_label, display_order, is_active, "
                        + "focus_lat, focus_lon, min_lat, min_lon, max_lat, max_lon "
                        + "FROM public.area_groups WHERE city_id = ?",
                (rs, rowNum) -> new CanonicalAreaGroup(
                        rs.getString("slug"),
                        rs.getString("name"),
                        rs.getString("subtitle"),
                        rs.getString("region_label"),
                        (Integer) rs.getObject("display_order"),
                        rs.getBoolean("is_active"),
                        nullableDouble(rs.getObject("focus_lat")),
                        nullableDouble(rs.getObject("focus_lon")),
                        nullableDouble(rs.getObject("min_lat")),
                        nullableDouble(rs.getObject("min_lon")),
                        nullableDouble(rs.getObject("max_lat")),
                        nullableDouble(rs.getObject("max_lon"))),
                cityId);

        // area_group_members carries no city_id column — scope via a JOIN on area_groups.city_id.
        List<CanonicalAreaGroupMember> groupMembers = jdbcOperations.query(
                "SELECT ag.slug AS group_slug, agm.area_key, agm.display_order "
                        + "FROM public.area_group_members agm "
                        + "JOIN public.area_groups ag ON ag.id = agm.area_group_id "
                        + "WHERE ag.city_id = ?",
                (rs, rowNum) -> new CanonicalAreaGroupMember(
                        rs.getString("group_slug"), rs.getString("area_key"), (Integer) rs.getObject("display_order")),
                cityId);

        return new CanonicalGeography(areas, aliases, regions, memberships, groups, groupMembers);
    }

    // ── Canonical boundary geometry (#2422) ─────────────────────────────────────────────────
    //
    // Additive: reads canonical_boundary_geometry only. Never touches areas.geometry_source or
    // areas.osm_* — those remain GeometryTrust's/AreaOnboardingApplyService's exclusive inputs,
    // untouched by this feature. Fail-closed: a missing/quarantined boundary is surfaced as
    // BoundaryGeometryResult.Unavailable, never approximated from bbox/centroid.

    private static final String BOUNDARY_COLUMNS =
            "status, unavailable_reason, ST_AsGeoJSON(geom) AS geo_json, geometry_source, "
                    + "osm_element_type, osm_element_id, osm_version, osm_extract_date, "
                    + "osm_source_name, osm_source_checksum_sha256, imported_at";

    /**
     * Looks up the authoritative boundary polygon for a city's own outer boundary.
     * Returns {@link Reason#UNKNOWN_ENTITY} if {@code cityId} does not exist in {@code cities} at
     * all, {@link Reason#NOT_IMPORTED} if the city exists but no boundary import has run for it.
     */
    @Transactional(readOnly = true)
    public BoundaryGeometryResult findCityBoundary(int cityId) {
        List<BoundaryGeometryResult> rows = jdbcOperations.query(
                "SELECT " + BOUNDARY_COLUMNS
                        + " FROM public.canonical_boundary_geometry "
                        + "WHERE entity_type = 'CITY' AND city_id = ?",
                (rs, rowNum) -> mapBoundaryRow(rs),
                cityId);
        if (!rows.isEmpty()) {
            return rows.get(0);
        }
        boolean cityExists = findCity(cityId).isPresent();
        return new Unavailable(cityExists ? Reason.NOT_IMPORTED : Reason.UNKNOWN_ENTITY);
    }

    /**
     * Looks up the authoritative boundary polygon for one area within a city.
     * Returns {@link Reason#UNKNOWN_ENTITY} if {@code (cityId, areaKey)} does not exist in
     * {@code areas} at all, {@link Reason#NOT_IMPORTED} if the area exists but no boundary import
     * has run for it.
     */
    @Transactional(readOnly = true)
    public BoundaryGeometryResult findAreaBoundary(int cityId, String areaKey) {
        List<BoundaryGeometryResult> rows = jdbcOperations.query(
                "SELECT " + BOUNDARY_COLUMNS
                        + " FROM public.canonical_boundary_geometry "
                        + "WHERE entity_type = 'AREA' AND city_id = ? AND area_key = ?",
                (rs, rowNum) -> mapBoundaryRow(rs),
                cityId, areaKey);
        if (!rows.isEmpty()) {
            return rows.get(0);
        }
        Integer areaExists = jdbcOperations.queryForObject(
                "SELECT count(*) FROM public.areas WHERE city_id = ? AND area_key = ?",
                Integer.class, cityId, areaKey);
        boolean exists = areaExists != null && areaExists > 0;
        return new Unavailable(exists ? Reason.NOT_IMPORTED : Reason.UNKNOWN_ENTITY);
    }

    private static BoundaryGeometryResult mapBoundaryRow(ResultSet rs) throws SQLException {
        // status is constrained to VALID/QUARANTINED/ABSENT_IN_SOURCE (ck_cbg_status) — it maps
        // directly onto Reason for the two non-VALID cases. unavailable_reason is a free-text
        // explanation for humans (coverage reports), not itself a Reason enum value.
        String status = rs.getString("status");
        if (!"VALID".equals(status)) {
            Reason reason = "ABSENT_IN_SOURCE".equals(status) ? Reason.ABSENT_IN_SOURCE : Reason.QUARANTINED;
            return new Unavailable(reason);
        }
        java.sql.Date extractDate = rs.getDate("osm_extract_date");
        Timestamp importedAt = rs.getTimestamp("imported_at");
        BoundaryProvenance provenance = new BoundaryProvenance(
                rs.getString("geometry_source"),
                rs.getString("osm_element_type"),
                (Long) rs.getObject("osm_element_id"),
                (Long) rs.getObject("osm_version"),
                extractDate == null ? null : extractDate.toLocalDate(),
                rs.getString("osm_source_name"),
                rs.getString("osm_source_checksum_sha256"),
                importedAt == null ? null : importedAt.toInstant().atOffset(OffsetDateTime.now().getOffset()));
        return new BoundaryGeometryResult.Found(provenance, rs.getString("geo_json"));
    }

    private static Double nullableDouble(Object val) {
        return val == null ? null : ((Number) val).doubleValue();
    }

    // ── Canonical read-model records ────────────────────────────────────────────────────────

    public record CanonicalCity(Integer id, String slug, String name) {}

    public record CanonicalArea(
            String areaKey, String name, String district,
            Double geoCenterLat, Double geoCenterLon,
            Double minLat, Double minLon, Double maxLat, Double maxLon,
            String geometrySource, String osmElementType, Long osmElementId,
            String lifecycleStatus) {}

    public record CanonicalAreaAlias(String areaKey, String alias, String aliasNormalised) {}

    public record CanonicalCityRegion(
            String regionKey, String displayLabel, Integer displayOrder,
            BigDecimal centreLat, BigDecimal centreLon,
            BigDecimal minLat, BigDecimal minLon, BigDecimal maxLat, BigDecimal maxLon,
            String policyFingerprint) {}

    public record CanonicalCityRegionMembership(String areaKey, String regionKey, String assignmentSource) {}

    public record CanonicalAreaGroup(
            String slug, String name, String subtitle, String regionLabel, Integer displayOrder, boolean active,
            Double focusLat, Double focusLon, Double minLat, Double minLon, Double maxLat, Double maxLon) {}

    public record CanonicalAreaGroupMember(String groupSlug, String areaKey, Integer displayOrder) {}

    public record CanonicalGeography(
            List<CanonicalArea> areas,
            List<CanonicalAreaAlias> aliases,
            List<CanonicalCityRegion> regions,
            List<CanonicalCityRegionMembership> memberships,
            List<CanonicalAreaGroup> groups,
            List<CanonicalAreaGroupMember> groupMembers) {}
}

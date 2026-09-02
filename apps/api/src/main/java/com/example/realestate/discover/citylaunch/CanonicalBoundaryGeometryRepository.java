package com.example.realestate.discover.citylaunch;

import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.sql.Date;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Write owner for {@code canonical_boundary_geometry} (#2422). The counterpart to
 * {@link CanonicalGeographyReader}'s {@code findCityBoundary}/{@code findAreaBoundary} — this
 * class is the ONLY writer of that table.
 *
 * <p>Additive-only: never touches {@code areas.geometry_source} or any {@code areas.osm_*}
 * column (see {@code V131__canonical_boundary_geometry.sql}'s header comment for why).
 *
 * <p>No automatic repair: callers (the offline OSM ingestion script, via whatever invokes this
 * repository) decide {@code status}; this class never runs {@code ST_MakeValid}/{@code buffer(0)}
 * or otherwise mutates geometry it is given.
 */
@Repository
public class CanonicalBoundaryGeometryRepository {

    private final JdbcOperations jdbcOperations;
    private final TransactionTemplate transactionTemplate;

    public CanonicalBoundaryGeometryRepository(
            JdbcOperations jdbcOperations, PlatformTransactionManager transactionManager) {
        this.jdbcOperations = jdbcOperations;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    /**
     * Idempotent upsert of one CITY or AREA boundary row. Reimporting the identical source
     * (same status/checksum/version/geometry) is a no-op — the guarded {@code WHERE} clause on
     * the {@code DO UPDATE} makes the statement affect zero rows when nothing actually changed,
     * per the reimport-idempotency contract in the approved plan addendum.
     *
     * <p>{@code row.entityType()} determines which partial unique index (
     * {@code uq_cbg_city_boundary} or {@code uq_cbg_area_boundary}) is used as the conflict
     * target — the two are structurally different (CITY has no {@code area_key}), so they are
     * two distinct SQL statements rather than one parameterised on entity type.
     */
    @Transactional
    public void upsert(BoundaryImportRow row) {
        dispatchUpsert(row);
    }

    /**
     * Upserts an entire batch of rows in a single transaction: either every row commits, or (on
     * any failure) none of them do. Used by the batch import path ({@code
     * CanonicalBoundaryGeometryImportRunner}) so that a whole reviewed artifact is applied
     * atomically rather than row-by-row, which would otherwise leave a partially-applied import
     * on any mid-batch failure.
     *
     * <p>Uses an explicit {@link TransactionTemplate} rather than {@code @Transactional} so the
     * transaction boundary is a real property of this method's behaviour regardless of how the
     * repository instance was constructed — {@code @Transactional} only takes effect via Spring
     * AOP proxying of a container-managed bean, which does not apply when this repository is
     * built directly (e.g. {@code new CanonicalBoundaryGeometryRepository(...)} in a test), so an
     * annotation-only approach would silently lose atomicity in exactly that situation.
     */
    public void upsertAll(List<BoundaryImportRow> rows) {
        transactionTemplate.executeWithoutResult(status -> {
            for (BoundaryImportRow row : rows) {
                dispatchUpsert(row);
            }
        });
    }

    private void dispatchUpsert(BoundaryImportRow row) {
        if ("CITY".equals(row.entityType())) {
            upsertCity(row);
        } else if ("AREA".equals(row.entityType())) {
            upsertArea(row);
        } else {
            throw new IllegalArgumentException("Unknown entity_type: " + row.entityType());
        }
    }

    private void upsertCity(BoundaryImportRow row) {
        String geomExpr = row.geometryWkt() == null ? "NULL" : "ST_Multi(ST_GeomFromText(?, 4326))";
        String sql = "INSERT INTO public.canonical_boundary_geometry "
                + "(city_id, entity_type, area_key, status, unavailable_reason, geom, "
                + "geometry_source, osm_element_type, osm_element_id, osm_version, osm_extract_date, "
                + "osm_source_name, osm_source_checksum_sha256, imported_at, updated_at) "
                + "VALUES (?, 'CITY', NULL, ?, ?, " + geomExpr + ", ?, ?, ?, ?, ?, ?, ?, now(), now()) "
                + "ON CONFLICT (city_id) WHERE entity_type = 'CITY' "
                + "DO UPDATE SET " + UPDATE_ASSIGNMENTS
                + "WHERE " + UNCHANGED_GUARD;
        jdbcOperations.update(sql, bindArgs(row, row.cityId()));
    }

    private void upsertArea(BoundaryImportRow row) {
        String geomExpr = row.geometryWkt() == null ? "NULL" : "ST_Multi(ST_GeomFromText(?, 4326))";
        String sql = "INSERT INTO public.canonical_boundary_geometry "
                + "(city_id, entity_type, area_key, status, unavailable_reason, geom, "
                + "geometry_source, osm_element_type, osm_element_id, osm_version, osm_extract_date, "
                + "osm_source_name, osm_source_checksum_sha256, imported_at, updated_at) "
                + "VALUES (?, 'AREA', ?, ?, ?, " + geomExpr + ", ?, ?, ?, ?, ?, ?, ?, now(), now()) "
                + "ON CONFLICT (city_id, area_key) WHERE entity_type = 'AREA' "
                + "DO UPDATE SET " + UPDATE_ASSIGNMENTS
                + "WHERE " + UNCHANGED_GUARD;
        Object[] args = bindArgs(row, row.cityId(), row.areaKey());
        jdbcOperations.update(sql, args);
    }

    private static final String UPDATE_ASSIGNMENTS =
            "status = EXCLUDED.status, "
                    + "unavailable_reason = EXCLUDED.unavailable_reason, "
                    + "geom = EXCLUDED.geom, "
                    + "geometry_source = EXCLUDED.geometry_source, "
                    + "osm_element_type = EXCLUDED.osm_element_type, "
                    + "osm_element_id = EXCLUDED.osm_element_id, "
                    + "osm_version = EXCLUDED.osm_version, "
                    + "osm_extract_date = EXCLUDED.osm_extract_date, "
                    + "osm_source_name = EXCLUDED.osm_source_name, "
                    + "osm_source_checksum_sha256 = EXCLUDED.osm_source_checksum_sha256, "
                    + "updated_at = now() ";

    // Reimport idempotency guard: only actually update when something meaningfully changed.
    // Same checksum + same status + geometrically-identical (ST_OrderingEquals) geometry ->
    // WHERE evaluates false -> the DO UPDATE affects zero rows (a true no-op), matching the
    // "same checksum -> no-op" reimport contract from the approved plan addendum.
    private static final String UNCHANGED_GUARD =
            "canonical_boundary_geometry.status IS DISTINCT FROM EXCLUDED.status "
                    + "OR canonical_boundary_geometry.unavailable_reason IS DISTINCT FROM EXCLUDED.unavailable_reason "
                    + "OR canonical_boundary_geometry.osm_source_checksum_sha256 "
                    + "IS DISTINCT FROM EXCLUDED.osm_source_checksum_sha256 "
                    + "OR canonical_boundary_geometry.osm_version IS DISTINCT FROM EXCLUDED.osm_version "
                    + "OR NOT ( "
                    + "  (canonical_boundary_geometry.geom IS NULL AND EXCLUDED.geom IS NULL) "
                    + "  OR (canonical_boundary_geometry.geom IS NOT NULL AND EXCLUDED.geom IS NOT NULL "
                    + "      AND ST_OrderingEquals(canonical_boundary_geometry.geom, EXCLUDED.geom)) "
                    + ")";

    /**
     * Builds the positional bind args in declared column order, inserting the WKT geometry
     * parameter only when {@code geometryWkt} is non-null (the SQL text itself omits the
     * placeholder for the NULL case, so no arg slot exists for it there).
     */
    private static Object[] bindArgs(BoundaryImportRow row, Object... leadingKeyArgs) {
        List<Object> args = new ArrayList<>();
        for (Object keyArg : leadingKeyArgs) {
            args.add(keyArg);
        }
        args.add(row.status());
        args.add(row.unavailableReason());
        if (row.geometryWkt() != null) {
            args.add(row.geometryWkt());
        }
        args.add(row.geometrySource());
        args.add(row.osmElementType());
        args.add(row.osmElementId());
        args.add(row.osmVersion());
        args.add(row.osmExtractDate() == null ? null : Date.valueOf(row.osmExtractDate()));
        args.add(row.osmSourceName());
        args.add(row.osmSourceChecksumSha256());
        return args.toArray();
    }

    /**
     * Deterministic per-city coverage/readiness report: how many of the city's canonical areas
     * have a VALID boundary, and which specific area_keys are QUARANTINED, ABSENT_IN_SOURCE, or
     * NOT_IMPORTED (never silently dropped from the report). Also carries the OSM
     * provenance/source-extract actually used for every imported (non-NOT_IMPORTED) row, reusing
     * this table's own provenance columns (the same {@code osm_*}/{@code geometry_source}
     * columns V113 established the naming convention for on {@code areas}) rather than a new
     * provenance model.
     */
    @Transactional(readOnly = true)
    public BoundaryCoverageReport coverageReport(int cityId) {
        List<AreaCoverageRow> rows = jdbcOperations.query(
                "SELECT a.area_key, cbg.status, cbg.geometry_source, cbg.osm_element_type, "
                        + "cbg.osm_element_id, cbg.osm_version, cbg.osm_extract_date, "
                        + "cbg.osm_source_name, cbg.osm_source_checksum_sha256 "
                        + "FROM public.areas a "
                        + "LEFT JOIN public.canonical_boundary_geometry cbg "
                        + "  ON cbg.city_id = a.city_id AND cbg.entity_type = 'AREA' AND cbg.area_key = a.area_key "
                        + "WHERE a.city_id = ? "
                        + "ORDER BY a.area_key",
                (rs, rowNum) -> new AreaCoverageRow(
                        rs.getString("area_key"),
                        rs.getString("status"),
                        rs.getString("geometry_source"),
                        rs.getString("osm_element_type"),
                        (Long) rs.getObject("osm_element_id"),
                        (Long) rs.getObject("osm_version"),
                        rs.getDate("osm_extract_date") == null ? null : rs.getDate("osm_extract_date").toLocalDate(),
                        rs.getString("osm_source_name"),
                        rs.getString("osm_source_checksum_sha256")),
                cityId);

        int valid = 0;
        int quarantined = 0;
        int absentInSource = 0;
        int notImported = 0;
        List<String> quarantinedAreaKeys = new ArrayList<>();
        List<String> notImportedAreaKeys = new ArrayList<>();
        List<String> absentInSourceAreaKeys = new ArrayList<>();
        List<BoundaryProvenanceDetail> areaProvenance = new ArrayList<>();
        for (AreaCoverageRow row : rows) {
            if (row.status() == null) {
                notImported++;
                notImportedAreaKeys.add(row.areaKey());
                continue;
            }
            switch (row.status()) {
                case "VALID" -> valid++;
                case "QUARANTINED" -> {
                    quarantined++;
                    quarantinedAreaKeys.add(row.areaKey());
                }
                case "ABSENT_IN_SOURCE" -> {
                    absentInSource++;
                    absentInSourceAreaKeys.add(row.areaKey());
                }
                default -> {
                    notImported++;
                    notImportedAreaKeys.add(row.areaKey());
                }
            }
            if (!"NOT_IMPORTED".equals(row.status())) {
                areaProvenance.add(new BoundaryProvenanceDetail(
                        row.areaKey(),
                        row.status(),
                        row.geometrySource(),
                        row.osmElementType(),
                        row.osmElementId(),
                        row.osmVersion(),
                        row.osmExtractDate(),
                        row.osmSourceName(),
                        row.osmSourceChecksumSha256()));
            }
        }

        List<CityCoverageRow> cityRows = jdbcOperations.query(
                "SELECT status, geometry_source, osm_element_type, osm_element_id, osm_version, "
                        + "osm_extract_date, osm_source_name, osm_source_checksum_sha256 "
                        + "FROM public.canonical_boundary_geometry "
                        + "WHERE city_id = ? AND entity_type = 'CITY'",
                (rs, rowNum) -> new CityCoverageRow(
                        rs.getString("status"),
                        rs.getString("geometry_source"),
                        rs.getString("osm_element_type"),
                        (Long) rs.getObject("osm_element_id"),
                        (Long) rs.getObject("osm_version"),
                        rs.getDate("osm_extract_date") == null ? null : rs.getDate("osm_extract_date").toLocalDate(),
                        rs.getString("osm_source_name"),
                        rs.getString("osm_source_checksum_sha256")),
                cityId);

        CityCoverageRow cityRow = cityRows.stream().findFirst().orElse(null);
        boolean cityBoundaryValid = cityRow != null && "VALID".equals(cityRow.status());
        BoundaryProvenanceDetail cityProvenance = cityRow == null
                ? null
                : new BoundaryProvenanceDetail(
                        null,
                        cityRow.status(),
                        cityRow.geometrySource(),
                        cityRow.osmElementType(),
                        cityRow.osmElementId(),
                        cityRow.osmVersion(),
                        cityRow.osmExtractDate(),
                        cityRow.osmSourceName(),
                        cityRow.osmSourceChecksumSha256());

        return new BoundaryCoverageReport(
                cityId,
                rows.size(),
                valid,
                quarantined,
                absentInSource,
                notImported,
                cityBoundaryValid,
                List.copyOf(quarantinedAreaKeys),
                List.copyOf(notImportedAreaKeys),
                List.copyOf(absentInSourceAreaKeys),
                cityProvenance,
                List.copyOf(areaProvenance));
    }

    private record AreaCoverageRow(
            String areaKey,
            String status,
            String geometrySource,
            String osmElementType,
            Long osmElementId,
            Long osmVersion,
            LocalDate osmExtractDate,
            String osmSourceName,
            String osmSourceChecksumSha256) {}

    private record CityCoverageRow(
            String status,
            String geometrySource,
            String osmElementType,
            Long osmElementId,
            Long osmVersion,
            LocalDate osmExtractDate,
            String osmSourceName,
            String osmSourceChecksumSha256) {}

    /**
     * One CITY or AREA boundary import result. {@code geometryWkt} and {@code status}/
     * {@code unavailableReason} must satisfy the same VALID&lt;=&gt;geometry-present invariant as
     * the {@code ck_cbg_status_geom} CHECK constraint — this repository does not enforce that
     * invariant itself (the database does); callers must supply a consistent row.
     *
     * @param geometryWkt WKT (e.g. {@code MULTIPOLYGON(...)} or {@code POLYGON(...)} — either is
     *     accepted, {@link #upsert} always wraps it in {@code ST_Multi(...)}) in SRID 4326, or
     *     {@code null} for a non-VALID row.
     */
    public record BoundaryImportRow(
            int cityId,
            String entityType,
            String areaKey,
            String status,
            String unavailableReason,
            String geometryWkt,
            String geometrySource,
            String osmElementType,
            Long osmElementId,
            Long osmVersion,
            LocalDate osmExtractDate,
            String osmSourceName,
            String osmSourceChecksumSha256) {}

    /**
     * Deterministic per-city boundary coverage/readiness snapshot.
     *
     * @param absentInSourceAreaKeys exact area_keys whose import was confirmed but never found in
     *     the supplied source extract (never silently dropped, mirrors {@code
     *     quarantinedAreaKeys}/{@code notImportedAreaKeys}).
     * @param cityProvenance which OSM element/source-extract the CITY boundary actually came from
     *     (reusing this table's own {@code osm_*}/{@code geometry_source} columns), or {@code
     *     null} if no CITY row has been imported at all.
     * @param areaProvenance one entry per AREA row that has an import outcome (VALID, QUARANTINED,
     *     or ABSENT_IN_SOURCE) — NOT_IMPORTED areas are intentionally omitted since they have no
     *     provenance to report.
     */
    public record BoundaryCoverageReport(
            int cityId,
            int totalAreas,
            int areasValid,
            int areasQuarantined,
            int areasAbsentInSource,
            int areasNotImported,
            boolean cityBoundaryValid,
            List<String> quarantinedAreaKeys,
            List<String> notImportedAreaKeys,
            List<String> absentInSourceAreaKeys,
            BoundaryProvenanceDetail cityProvenance,
            List<BoundaryProvenanceDetail> areaProvenance) {}

    /**
     * OSM provenance / source-extract-used detail for one imported CITY or AREA boundary row.
     * {@code areaKey} is {@code null} for the CITY row. Reuses {@code canonical_boundary_geometry}'s
     * own provenance columns rather than inventing a new provenance model.
     */
    public record BoundaryProvenanceDetail(
            String areaKey,
            String status,
            String geometrySource,
            String osmElementType,
            Long osmElementId,
            Long osmVersion,
            LocalDate osmExtractDate,
            String osmSourceName,
            String osmSourceChecksumSha256) {}
}

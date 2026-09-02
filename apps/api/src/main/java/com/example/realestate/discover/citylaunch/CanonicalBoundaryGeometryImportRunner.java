package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.citylaunch.CanonicalBoundaryGeometryRepository.BoundaryImportRow;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Operator import command for #2422: reads a reviewed JSONL boundary artifact (the output
 * shape of {@code scripts/geography/extract_osm_boundaries.py}) and applies the whole artifact
 * via {@link CanonicalBoundaryGeometryRepository#upsertAll} — the sole writer of {@code
 * canonical_boundary_geometry}. This class never builds SQL itself.
 *
 * <p>Deterministic and idempotent: every line maps 1:1 onto exactly one {@link BoundaryImportRow},
 * and the repository's own {@code UNCHANGED_GUARD} makes a rerun of an identical artifact a true
 * no-op. This runner adds no idempotency logic of its own beyond passing rows through to {@code
 * upsertAll}.
 *
 * <p>Atomic, two-phase import: the entire artifact is first parsed into an in-memory list of
 * {@link BoundaryImportRow}s (phase 1, no database writes) and only once every line has parsed
 * successfully is that list handed to {@code repository.upsertAll} to be applied inside one
 * database transaction (phase 2). A malformed line anywhere in the artifact aborts phase 1 before
 * any write happens, and a failure during phase 2 rolls back the whole batch — either the entire
 * reviewed artifact commits, or the pre-import canonical state is left completely unchanged.
 * There is no partial-write outcome.
 */
@Component
@ConditionalOnProperty(
        prefix = "app.canonical-boundary-geometry.import",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = false)
public class CanonicalBoundaryGeometryImportRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CanonicalBoundaryGeometryImportRunner.class);

    private final CanonicalBoundaryGeometryRepository repository;
    private final ObjectMapper objectMapper;
    private final ResourceLoader resourceLoader;
    private final String resourceLocation;

    public CanonicalBoundaryGeometryImportRunner(
            CanonicalBoundaryGeometryRepository repository,
            ObjectMapper objectMapper,
            @Value("${app.canonical-boundary-geometry.import.resource:}") String resourceLocation) {
        this.repository = repository;
        this.objectMapper = objectMapper;
        this.resourceLoader = new DefaultResourceLoader();
        this.resourceLocation = resourceLocation;
    }

    @Override
    public void run(ApplicationArguments args) throws IOException {
        if (resourceLocation == null || resourceLocation.isBlank()) {
            throw new IllegalStateException(
                    "app.canonical-boundary-geometry.import.enabled=true requires "
                            + "app.canonical-boundary-geometry.import.resource to be set");
        }

        log.info("Starting canonical boundary geometry import from {}", resourceLocation);

        List<BoundaryImportRow> rows = parseArtifact(resourceLocation);

        repository.upsertAll(rows);

        ImportCounts counts = new ImportCounts();
        for (BoundaryImportRow row : rows) {
            counts.record(row);
        }

        log.info(
                "Canonical boundary geometry import complete: total={} city={} area={} valid={} "
                        + "quarantined={} absentInSource={}",
                counts.total,
                counts.byEntityType.getOrDefault("CITY", 0),
                counts.byEntityType.getOrDefault("AREA", 0),
                counts.byStatus.getOrDefault("VALID", 0),
                counts.byStatus.getOrDefault("QUARANTINED", 0),
                counts.byStatus.getOrDefault("ABSENT_IN_SOURCE", 0));
    }

    /**
     * Phase 1 of the atomic import: reads and parses the entire artifact into rows without
     * touching the database. A malformed line anywhere in the artifact aborts here — before any
     * write has been attempted — rather than being logged-and-skipped, since a reviewed batch
     * artifact is expected to be well-formed and a malformed line is treated as a data-integrity
     * problem the operator must fix and rerun, not a per-row soft failure.
     */
    private List<BoundaryImportRow> parseArtifact(String resourceLocation) throws IOException {
        List<BoundaryImportRow> rows = new ArrayList<>();
        Resource resource = resourceLoader.getResource(resourceLocation);
        try (InputStream in = resource.getInputStream();
                BufferedReader reader = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            String line;
            int lineNumber = 0;
            while ((line = reader.readLine()) != null) {
                lineNumber++;
                if (line.isBlank()) {
                    continue;
                }
                BoundaryImportLine parsed;
                try {
                    parsed = objectMapper.readValue(line, BoundaryImportLine.class);
                } catch (IOException e) {
                    throw new IllegalStateException(
                            "Malformed JSONL at " + resourceLocation + ":" + lineNumber
                                    + " — aborting import (no rows applied; the artifact is "
                                    + "validated in full before any write is attempted)",
                            e);
                }
                rows.add(parsed.toBoundaryImportRow());
            }
        }
        return rows;
    }

    /** Structured import-run summary counts, logged (never silently dropped) at completion. */
    private static final class ImportCounts {
        private int total = 0;
        private final Map<String, Integer> byEntityType = new HashMap<>();
        private final Map<String, Integer> byStatus = new HashMap<>();

        void record(BoundaryImportRow row) {
            total++;
            byEntityType.merge(row.entityType(), 1, Integer::sum);
            byStatus.merge(row.status(), 1, Integer::sum);
        }
    }

    /**
     * One JSONL line as produced by {@code scripts/geography/extract_osm_boundaries.py}.
     * {@code @JsonProperty} explicitly maps every snake_case field — including {@code
     * osm_extract_date}, converted to {@link LocalDate} explicitly in {@link
     * #toBoundaryImportRow()} rather than relying on the injected {@link ObjectMapper} having
     * the JSR-310 module registered.
     */
    record BoundaryImportLine(
            @JsonProperty("city_id") int cityId,
            @JsonProperty("entity_type") String entityType,
            @JsonProperty("area_key") String areaKey,
            @JsonProperty("status") String status,
            @JsonProperty("unavailable_reason") String unavailableReason,
            @JsonProperty("geometry_wkt") String geometryWkt,
            @JsonProperty("geometry_source") String geometrySource,
            @JsonProperty("osm_element_type") String osmElementType,
            @JsonProperty("osm_element_id") Long osmElementId,
            @JsonProperty("osm_version") Long osmVersion,
            @JsonProperty("osm_extract_date") String osmExtractDate,
            @JsonProperty("osm_source_name") String osmSourceName,
            @JsonProperty("osm_source_checksum_sha256") String osmSourceChecksumSha256) {

        BoundaryImportRow toBoundaryImportRow() {
            LocalDate extractDate = osmExtractDate == null || osmExtractDate.isBlank()
                    ? null
                    : LocalDate.parse(osmExtractDate);
            return new BoundaryImportRow(
                    cityId,
                    entityType,
                    areaKey,
                    status,
                    unavailableReason,
                    geometryWkt,
                    geometrySource,
                    osmElementType,
                    osmElementId,
                    osmVersion,
                    extractDate,
                    osmSourceName,
                    osmSourceChecksumSha256);
        }
    }
}

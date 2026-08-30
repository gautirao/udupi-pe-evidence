package com.example.realestate.discover;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Evaluates a batch of candidate areas for a city WITHOUT ever writing to canonical geography
 * (#1887 PR1). Mirrors {@link CityRegionOnboardingService}'s JdbcOperations + record-row shape,
 * but diverges from its {@code @Transactional(readOnly = true)} dryRun on purpose:
 *
 * <h2>Why not readOnly = true (design decision D1)</h2>
 * {@link #dryRun} MUST persist rows into the {@code area_onboarding_batch}/
 * {@code area_onboarding_candidate} STAGING tables — that is the whole point of a reviewable dry
 * run. So this method runs under a normal {@code @Transactional}, not {@code readOnly = true}.
 * The "read-only" guarantee this class provides is scoped to CANONICAL tables ONLY
 * ({@code areas}, {@code area_alias} population, {@code city_regions},
 * {@code city_region_memberships}, {@code regional_area_overrides}): every access to those five
 * is a SELECT, proven with zero exceptions by {@code AreaOnboardingDryRunSafetyIT}'s
 * COUNT-delta-== 0 assertions.
 *
 * <h2>No apply() in PR1 (design decision D6)</h2>
 * There is no canonical write path yet, so there is nothing to guard with a
 * {@code *BlockedException} — {@link AreaOnboardingReport#applyAllowed()} is a signal for a human
 * reviewer, not an enforcement gate (that arrives with the PR2 apply/audit path).
 */
@Service
public class AreaOnboardingService {

    private static final Logger log = LoggerFactory.getLogger(AreaOnboardingService.class);

    /** Outcomes that do NOT block a hypothetical future apply — everything else needs review. */
    private static final Set<CandidateOutcome> CLEAN_OUTCOMES = Set.of(
            CandidateOutcome.READY_TO_CREATE, CandidateOutcome.READY_TO_UPDATE, CandidateOutcome.UNCHANGED);

    /** Conflict types that mark a candidate a likely duplicate — SAME_NAME_DIFFERENT_CITY excluded on purpose. */
    private static final Set<ConflictType> DUPLICATE_CONFLICTS = Set.of(
            ConflictType.CANONICAL_KEY_CONFLICT, ConflictType.NORMALISED_NAME_CONFLICT,
            ConflictType.ALIAS_CONFLICT, ConflictType.DUPLICATE_EXTERNAL_SOURCE_ID,
            ConflictType.SIMILAR_OR_OVERLAPPING);

    private final JdbcOperations jdbcOperations;
    private final ObjectMapper objectMapper;

    public AreaOnboardingService(JdbcOperations jdbcOperations, ObjectMapper objectMapper) {
        this.jdbcOperations = jdbcOperations;
        this.objectMapper = objectMapper;
    }

    /**
     * Candidate area submitted for evaluation. A plain input holder — never persisted verbatim;
     * {@link #dryRun} projects it into a {@link AreaOnboardingReport.CandidateProjection} and a
     * staging row, and ALSO persists an immutable JSON snapshot of this record itself (see
     * {@link #serializeCandidatePayload}) so a future apply step can reconstruct the exact
     * candidate values without rereading any external file (#1887 rework BLOCKING 2).
     */
    public record CandidateInput(
            String areaKey,
            String name,
            Double geoCenterLat,
            Double geoCenterLon,
            Double minLat,
            Double minLon,
            Double maxLat,
            Double maxLon,
            String geometrySource,
            String externalSourceId
    ) {}

    /**
     * Immutable identity of the approved dataset/artifact a batch was sourced from (#1887 rework
     * REQUIRED batch-level fix item). Persisted verbatim on {@code area_onboarding_batch} so a
     * future apply step (PR2) can reproduce the batch without rereading a possibly-changed
     * classpath file.
     *
     * <p>{@link #provider} also implements the provider-namespacing fix item via <b>Option A</b>:
     * every candidate in a single {@link #dryRun} invocation is assumed to originate from exactly
     * this one provider, so {@code external_source_id} deduplication — already scoped to the
     * current batch's candidate list only (see {@link #findDuplicateExternalSourceIds}) — is
     * therefore implicitly provider-scoped too: the same external id under a DIFFERENT provider
     * always lives in a different batch and is never treated as a duplicate. A full multi-provider
     * per-candidate model (Option B) is NOT implemented in PR1.
     *
     * @param datasetId           approved dataset/package identifier (e.g. #1900 artifact id)
     * @param datasetVersion       version of that dataset/artifact
     * @param artifactChecksum     checksum of the source artifact, as supplied by the provider/curator
     * @param provider             single provider identity for every candidate in this batch (Option A)
     * @param inputSchemaVersion   version of the candidate input schema this batch was built against
     * @param sourceExtractedAt    when the source data was extracted/approved, if known
     */
    public record BatchIdentity(
            String datasetId,
            String datasetVersion,
            String artifactChecksum,
            String provider,
            String inputSchemaVersion,
            OffsetDateTime sourceExtractedAt
    ) {
        /** Used by the legacy {@link #dryRun(int, String, List)} 3-arg overload — all fields absent. */
        public static final BatchIdentity EMPTY = new BatchIdentity(null, null, null, null, null, null);
    }

    /**
     * Legacy 3-arg overload retained for existing call sites — delegates with
     * {@link BatchIdentity#EMPTY}. Prefer the 4-arg overload when batch/dataset identity is known.
     */
    @Transactional
    public AreaOnboardingReport dryRun(int cityId, String sourceLabel, List<CandidateInput> candidates) {
        return dryRun(cityId, sourceLabel, BatchIdentity.EMPTY, candidates);
    }

    /**
     * Evaluates {@code candidates} against city_id={@code cityId}'s existing areas. Persists one
     * {@code area_onboarding_batch} row (carrying {@code batchIdentity}) and one
     * {@code area_onboarding_candidate} row per candidate (STAGING writes only — see class
     * javadoc for the canonical-table read-only guarantee this method upholds).
     */
    @Transactional
    public AreaOnboardingReport dryRun(
            int cityId, String sourceLabel, BatchIdentity batchIdentity, List<CandidateInput> candidates) {
        CityBounds city = loadCityBounds(cityId);

        Set<String> duplicateExternalSourceIds = findDuplicateExternalSourceIds(candidates);

        List<AreaOnboardingReport.CandidateProjection> projections = new ArrayList<>();
        List<String> blockingReasons = new ArrayList<>();
        Map<CandidateOutcome, Integer> counts = new EnumMap<>(CandidateOutcome.class);

        for (CandidateInput candidate : candidates) {
            AreaOnboardingReport.CandidateProjection projection =
                    classify(cityId, city, candidate, duplicateExternalSourceIds);
            projections.add(projection);
            counts.merge(projection.outcome(), 1, Integer::sum);
            if (!CLEAN_OUTCOMES.contains(projection.outcome())) {
                blockingReasons.add(candidate.areaKey() + ": " + projection.outcome()
                        + (projection.conflicts().isEmpty() ? "" : " " + projection.conflicts()));
            }
        }

        boolean applyAllowed = blockingReasons.isEmpty();
        long batchId = insertBatch(cityId, sourceLabel, batchIdentity, applyAllowed, blockingReasons);
        for (int i = 0; i < projections.size(); i++) {
            insertCandidate(batchId, candidates.get(i), projections.get(i));
        }

        log.info("AreaOnboardingService: dryRun batchId={} cityId={} sourceLabel={} provider={} candidates={} "
                        + "applyAllowed={} counts={}",
                batchId, cityId, sourceLabel, batchIdentity.provider(), candidates.size(), applyAllowed, counts);

        return new AreaOnboardingReport(
                batchId, cityId, city != null ? city.slug() : null, sourceLabel,
                List.copyOf(projections), counts, applyAllowed, List.copyOf(blockingReasons));
    }

    // ── Classification ───────────────────────────────────────────────────────

    private AreaOnboardingReport.CandidateProjection classify(
            int cityId, CityBounds city, CandidateInput candidate, Set<String> duplicateExternalSourceIds) {

        if (!AreaKeyFormat.isValidFourSegment(candidate.areaKey())) {
            return new AreaOnboardingReport.CandidateProjection(
                    candidate.areaKey(), candidate.areaKey(), null,
                    CandidateOutcome.NEEDS_HUMAN_REVIEW, List.of(),
                    GeometryTrust.classify(candidate.geometrySource(), candidate.geoCenterLat(), candidate.geoCenterLon(),
                            candidate.minLat(), candidate.minLon(), candidate.maxLat(), candidate.maxLon()),
                    candidate.externalSourceId());
        }

        String normalisedAreaKey = AreaKeyFormat.normalise(candidate.areaKey());
        GeometryTrust geometryTrust = GeometryTrust.classify(
                candidate.geometrySource(), candidate.geoCenterLat(), candidate.geoCenterLon(),
                candidate.minLat(), candidate.minLon(), candidate.maxLat(), candidate.maxLon());

        List<ConflictType> conflicts = new ArrayList<>();
        boolean invalidGeometry = hasInvalidGeometry(candidate);
        boolean outsideCity = isOutsideCity(city, candidate);
        if (outsideCity) {
            conflicts.add(ConflictType.OUTSIDE_CITY_BOUNDS);
        }

        ExistingAreaRow matchedByKey = findAreaByKey(normalisedAreaKey);
        String matchedAreaKey = null;
        if (matchedByKey != null) {
            if (matchedByKey.cityId() != cityId) {
                conflicts.add(ConflictType.CANONICAL_KEY_CONFLICT);
            } else {
                matchedAreaKey = matchedByKey.areaKey();
            }
        }

        String normalisedName = normaliseName(candidate.name());
        if (normalisedName != null) {
            if (existsNameConflictInCity(cityId, normalisedName, normalisedAreaKey)) {
                conflicts.add(ConflictType.NORMALISED_NAME_CONFLICT);
            } else if (existsNameInOtherCity(cityId, normalisedName)) {
                conflicts.add(ConflictType.SAME_NAME_DIFFERENT_CITY);
            }
            if (existsAliasConflict(cityId, normalisedName)) {
                conflicts.add(ConflictType.ALIAS_CONFLICT);
            }
        }

        if (candidate.externalSourceId() != null && duplicateExternalSourceIds.contains(candidate.externalSourceId())) {
            conflicts.add(ConflictType.DUPLICATE_EXTERNAL_SOURCE_ID);
        }

        // Only checked for candidates that do NOT already match an existing area by canonical
        // key within this city: a matched candidate's geometry legitimately borders its
        // real-world neighbours (adjacent areas' bboxes commonly touch/overlap at shared edges),
        // so that is not a duplicate signal once the key match itself has resolved identity.
        if (matchedAreaKey == null && geometryTrust != GeometryTrust.MISSING && hasFullBbox(candidate)
                && overlapsExistingArea(cityId, normalisedAreaKey, candidate)) {
            conflicts.add(ConflictType.SIMILAR_OR_OVERLAPPING);
        }

        boolean hasDuplicateConflict = conflicts.stream().anyMatch(DUPLICATE_CONFLICTS::contains);

        CandidateOutcome outcome;
        if (invalidGeometry) {
            outcome = CandidateOutcome.INVALID_GEOMETRY;
        } else if (geometryTrust == GeometryTrust.MISSING) {
            outcome = CandidateOutcome.MISSING_GEOMETRY;
        } else if (outsideCity) {
            outcome = CandidateOutcome.OUTSIDE_CITY;
        } else if (hasDuplicateConflict) {
            outcome = CandidateOutcome.POSSIBLE_DUPLICATE;
        } else if (matchedAreaKey != null) {
            outcome = fieldsIdentical(matchedByKey, candidate)
                    ? CandidateOutcome.UNCHANGED : CandidateOutcome.READY_TO_UPDATE;
        } else {
            outcome = CandidateOutcome.READY_TO_CREATE;
        }

        return new AreaOnboardingReport.CandidateProjection(
                candidate.areaKey(), normalisedAreaKey, matchedAreaKey, outcome,
                List.copyOf(conflicts), geometryTrust, candidate.externalSourceId());
    }

    /** Package-private for direct unit testing (pure logic, no DB dependency). */
    static Set<String> findDuplicateExternalSourceIds(List<CandidateInput> candidates) {
        Set<String> seen = new LinkedHashSet<>();
        Set<String> duplicates = new LinkedHashSet<>();
        for (CandidateInput candidate : candidates) {
            String id = candidate.externalSourceId();
            if (id == null) {
                continue;
            }
            if (!seen.add(id)) {
                duplicates.add(id);
            }
        }
        return duplicates;
    }

    /** Package-private for direct unit testing (pure logic, no DB dependency). */
    static boolean hasInvalidGeometry(CandidateInput candidate) {
        Double lat = candidate.geoCenterLat();
        Double lon = candidate.geoCenterLon();
        if (lat != null && (lat < -90 || lat > 90)) {
            return true;
        }
        if (lon != null && (lon < -180 || lon > 180)) {
            return true;
        }
        if (candidate.minLat() != null && candidate.maxLat() != null && candidate.minLat() > candidate.maxLat()) {
            return true;
        }
        return candidate.minLon() != null && candidate.maxLon() != null && candidate.minLon() > candidate.maxLon();
    }

    /**
     * Package-private (not private) so {@code CityBounds} — otherwise a private nested record —
     * stays package-visible for direct unit testing of this pure predicate.
     */
    static boolean isOutsideCity(CityBounds city, CandidateInput candidate) {
        if (city == null || city.minLat() == null || city.minLon() == null
                || city.maxLat() == null || city.maxLon() == null) {
            return false;
        }
        Double lat = candidate.geoCenterLat();
        Double lon = candidate.geoCenterLon();
        if (lat == null || lon == null) {
            return false;
        }
        return lat < city.minLat() || lat > city.maxLat() || lon < city.minLon() || lon > city.maxLon();
    }

    static boolean hasFullBbox(CandidateInput candidate) {
        return candidate.minLat() != null && candidate.minLon() != null
                && candidate.maxLat() != null && candidate.maxLon() != null;
    }

    static boolean fieldsIdentical(ExistingAreaRow existing, CandidateInput candidate) {
        return Objects.equals(normaliseName(existing.name()), normaliseName(candidate.name()))
                && numEquals(existing.geoCenterLat(), candidate.geoCenterLat())
                && numEquals(existing.geoCenterLon(), candidate.geoCenterLon())
                && numEquals(existing.minLat(), candidate.minLat())
                && numEquals(existing.minLon(), candidate.minLon())
                && numEquals(existing.maxLat(), candidate.maxLat())
                && numEquals(existing.maxLon(), candidate.maxLon())
                && Objects.equals(existing.geometrySource(), candidate.geometrySource());
    }

    private static boolean numEquals(Double a, Double b) {
        if (a == null || b == null) {
            return a == null && b == null;
        }
        return Math.abs(a - b) < 1e-9;
    }

    private static String normaliseName(String name) {
        return name == null ? null : name.trim().toLowerCase();
    }

    // ── Canonical-table reads (SELECT only — never writes; see class javadoc) ──

    private CityBounds loadCityBounds(int cityId) {
        return jdbcOperations.query(CITY_BOUNDS_SQL, rs -> rs.next()
                ? new CityBounds(rs.getString("slug"),
                        nullableDouble(rs.getObject("min_lat")), nullableDouble(rs.getObject("min_lon")),
                        nullableDouble(rs.getObject("max_lat")), nullableDouble(rs.getObject("max_lon")))
                : null, cityId);
    }

    private ExistingAreaRow findAreaByKey(String areaKey) {
        return jdbcOperations.query(AREA_BY_KEY_SQL, rs -> rs.next()
                ? new ExistingAreaRow(rs.getString("area_key"), rs.getInt("city_id"), rs.getString("name"),
                        nullableDouble(rs.getObject("geo_center_lat")), nullableDouble(rs.getObject("geo_center_lon")),
                        nullableDouble(rs.getObject("min_lat")), nullableDouble(rs.getObject("min_lon")),
                        nullableDouble(rs.getObject("max_lat")), nullableDouble(rs.getObject("max_lon")),
                        rs.getString("geometry_source"))
                : null, areaKey);
    }

    private boolean existsNameConflictInCity(int cityId, String normalisedName, String excludeAreaKey) {
        Integer count = jdbcOperations.queryForObject(NAME_CONFLICT_IN_CITY_SQL, Integer.class,
                cityId, normalisedName, excludeAreaKey);
        return count != null && count > 0;
    }

    private boolean existsNameInOtherCity(int cityId, String normalisedName) {
        Integer count = jdbcOperations.queryForObject(NAME_IN_OTHER_CITY_SQL, Integer.class, normalisedName, cityId);
        return count != null && count > 0;
    }

    /**
     * Queries the empty-in-PR1 area_alias table — must not fail even with zero rows (see IT).
     * Scoped to {@code cityId} (#1887 rework BLOCKING 1): an alias belonging to a DIFFERENT city
     * must never conflict with this candidate, matching the non-blocking
     * {@link ConflictType#SAME_NAME_DIFFERENT_CITY} classification.
     */
    private boolean existsAliasConflict(int cityId, String normalisedName) {
        Integer count = jdbcOperations.queryForObject(ALIAS_CONFLICT_SQL, Integer.class, cityId, normalisedName);
        return count != null && count > 0;
    }

    private boolean overlapsExistingArea(int cityId, String excludeAreaKey, CandidateInput candidate) {
        List<ExistingAreaRow> others = jdbcOperations.query(OTHER_AREAS_WITH_BBOX_SQL,
                (rs, rowNum) -> new ExistingAreaRow(rs.getString("area_key"), cityId, null, null, null,
                        nullableDouble(rs.getObject("min_lat")), nullableDouble(rs.getObject("min_lon")),
                        nullableDouble(rs.getObject("max_lat")), nullableDouble(rs.getObject("max_lon")), null),
                cityId, excludeAreaKey);
        for (ExistingAreaRow other : others) {
            boolean overlaps = candidate.minLat() <= other.maxLat() && candidate.maxLat() >= other.minLat()
                    && candidate.minLon() <= other.maxLon() && candidate.maxLon() >= other.minLon();
            if (overlaps) {
                return true;
            }
        }
        return false;
    }

    // ── Staging writes (area_onboarding_batch / area_onboarding_candidate ONLY) ─

    private long insertBatch(
            int cityId, String sourceLabel, BatchIdentity batchIdentity,
            boolean applyAllowed, List<String> blockingReasons) {
        return jdbcOperations.queryForObject(INSERT_BATCH_SQL, Long.class,
                cityId, sourceLabel, applyAllowed, blockingReasons.isEmpty() ? null : String.join("; ", blockingReasons),
                batchIdentity.datasetId(), batchIdentity.datasetVersion(), batchIdentity.artifactChecksum(),
                batchIdentity.provider(), batchIdentity.inputSchemaVersion(), batchIdentity.sourceExtractedAt());
    }

    private void insertCandidate(
            long batchId, CandidateInput candidate, AreaOnboardingReport.CandidateProjection projection) {
        String conflictTypes = projection.conflicts().isEmpty()
                ? null
                : String.join(",", projection.conflicts().stream().map(Enum::name).toList());
        String payloadJson = serializeCandidatePayload(candidate);

        long candidateId = jdbcOperations.queryForObject(INSERT_CANDIDATE_SQL, Long.class,
                batchId, projection.inputAreaKey(), projection.normalisedAreaKey(), projection.matchedAreaKey(),
                projection.outcome().name(), conflictTypes, projection.geometryTrust().name(),
                projection.externalSourceId(), payloadJson);

        // PostgreSQL's jsonb storage re-canonicalizes the JSON text on write (e.g. whitespace),
        // so the checksum MUST be computed over the value as it will actually be retrieved
        // (candidate_payload::text), not over the pre-cast Java string — otherwise a later
        // integrity check against the stored payload would spuriously fail.
        String storedPayloadText = jdbcOperations.queryForObject(
                SELECT_CANDIDATE_PAYLOAD_TEXT_SQL, String.class, candidateId);
        jdbcOperations.update(UPDATE_CANDIDATE_PAYLOAD_CHECKSUM_SQL, sha256Hex(storedPayloadText), candidateId);
    }

    /**
     * Serializes {@code candidate} verbatim to JSON for the immutable {@code candidate_payload}
     * snapshot (#1887 rework BLOCKING 2, Option B). Jackson serializes a record's components in
     * fixed declaration order, so this is deterministic for a given {@link CandidateInput} shape —
     * the same candidate always produces byte-identical JSON, which is what makes
     * {@link #sha256Hex} over the result a stable integrity checksum.
     */
    private String serializeCandidatePayload(CandidateInput candidate) {
        try {
            return objectMapper.writeValueAsString(candidate);
        } catch (JsonProcessingException e) {
            // CandidateInput is a plain record of String/Double fields — Jackson cannot fail to
            // serialize it. Treated as a hard failure (not silently swallowed) since a candidate
            // whose payload can't be captured must not be persisted as if it had been.
            throw new IllegalStateException("Failed to serialize candidate payload for " + candidate.areaKey(), e);
        }
    }

    private static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is guaranteed available on every JVM; unreachable in practice.
            return value;
        }
    }

    private static Double nullableDouble(Object val) {
        return val == null ? null : ((Number) val).doubleValue();
    }

    // ── Row types ─────────────────────────────────────────────────────────────

    record CityBounds(String slug, Double minLat, Double minLon, Double maxLat, Double maxLon) {}

    record ExistingAreaRow(
            String areaKey, int cityId, String name,
            Double geoCenterLat, Double geoCenterLon,
            Double minLat, Double minLon, Double maxLat, Double maxLon,
            String geometrySource) {}

    // ── SQL (canonical tables: SELECT only) ─────────────────────────────────────

    private static final String CITY_BOUNDS_SQL =
            "SELECT slug, min_lat, min_lon, max_lat, max_lon FROM cities WHERE id = ?";

    private static final String AREA_BY_KEY_SQL = """
            SELECT area_key, city_id, name, geo_center_lat, geo_center_lon,
                   min_lat, min_lon, max_lat, max_lon, geometry_source
            FROM areas WHERE area_key = ?
            """;

    private static final String NAME_CONFLICT_IN_CITY_SQL =
            "SELECT COUNT(*) FROM areas WHERE city_id = ? AND LOWER(TRIM(name)) = ? AND area_key <> ?";

    private static final String NAME_IN_OTHER_CITY_SQL =
            "SELECT COUNT(*) FROM areas WHERE LOWER(TRIM(name)) = ? AND city_id <> ?";

    private static final String ALIAS_CONFLICT_SQL =
            "SELECT COUNT(*) FROM area_alias WHERE city_id = ? AND alias_normalised = ?";

    private static final String OTHER_AREAS_WITH_BBOX_SQL = """
            SELECT area_key, min_lat, min_lon, max_lat, max_lon
            FROM areas
            WHERE city_id = ? AND area_key <> ?
              AND min_lat IS NOT NULL AND min_lon IS NOT NULL
              AND max_lat IS NOT NULL AND max_lon IS NOT NULL
            """;

    // ── SQL (staging tables: writes) ────────────────────────────────────────────

    private static final String INSERT_BATCH_SQL = """
            INSERT INTO area_onboarding_batch
                (city_id, source_label, apply_allowed, blocking_reasons,
                 dataset_id, dataset_version, artifact_checksum, provider, input_schema_version,
                 source_extracted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            RETURNING id
            """;

    private static final String INSERT_CANDIDATE_SQL = """
            INSERT INTO area_onboarding_candidate
                (batch_id, input_area_key, normalised_area_key, matched_area_key,
                 outcome, conflict_types, geometry_trust, external_source_id, candidate_payload)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb)
            RETURNING id
            """;

    private static final String SELECT_CANDIDATE_PAYLOAD_TEXT_SQL =
            "SELECT candidate_payload::text FROM area_onboarding_candidate WHERE id = ?";

    private static final String UPDATE_CANDIDATE_PAYLOAD_CHECKSUM_SQL =
            "UPDATE area_onboarding_candidate SET payload_checksum = ? WHERE id = ?";
}

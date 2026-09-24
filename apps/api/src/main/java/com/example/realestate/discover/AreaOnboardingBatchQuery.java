package com.example.realestate.discover;

import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;

/**
 * Read-only query for the #2676 Slice B1b admin {@code GET .../batches/{id}} endpoint.
 *
 * <p>Deliberately separate from {@link AreaOnboardingApplyService} and
 * {@link AreaOnboardingReviewService}: this class never takes the {@code FOR UPDATE} row lock
 * those services take (see {@code SELECT_BATCH_FOR_UPDATE_SQL} in {@link AreaOnboardingApplyService}),
 * so a GET here can run concurrently with an in-flight {@code approve()}/{@code apply()} without
 * blocking on their lock. {@link Isolation#REPEATABLE_READ} is used (rather than the default READ
 * COMMITTED) so that the batch header and its candidate rows are read from a single consistent
 * snapshot — this class reads the batch and its candidates as two separate statements, and without
 * REPEATABLE_READ a concurrent {@code apply()} committing between those two statements could hand
 * back a batch/candidate combination that never coexisted (e.g. {@code applyStatus=APPLIED} paired
 * with pre-apply candidate rows).
 *
 * <p>The candidate SELECT never reads {@code candidate_payload}, {@code payload_checksum}, or any
 * other raw-payload column — see {@link AreaOnboardingBatchDetail}'s javadoc for why.
 */
@Component
class AreaOnboardingBatchQuery {

    private static final String SELECT_BATCH_SQL = """
            SELECT id, city_id, apply_allowed, blocking_reasons, dataset_id, dataset_version, provider,
                   source_extracted_at, review_status, apply_status
            FROM area_onboarding_batch WHERE id = ?
            """;

    private static final String SELECT_CANDIDATES_SQL = """
            SELECT id, input_area_key, normalised_area_key, matched_area_key, outcome, review_decision,
                   conflict_types, geometry_trust, external_source_id
            FROM area_onboarding_candidate
            WHERE batch_id = ?
            ORDER BY id
            """;

    private final JdbcOperations jdbcOperations;

    AreaOnboardingBatchQuery(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    AreaOnboardingBatchDetail findBatchDetail(long batchId) {
        List<BatchHeader> headers = jdbcOperations.query(
                SELECT_BATCH_SQL,
                (rs, rowNum) -> new BatchHeader(
                        rs.getLong("id"),
                        rs.getInt("city_id"),
                        rs.getBoolean("apply_allowed"),
                        splitBlockingReasons(rs.getString("blocking_reasons")),
                        rs.getString("dataset_id"),
                        rs.getString("dataset_version"),
                        rs.getString("provider"),
                        rs.getObject("source_extracted_at", OffsetDateTime.class),
                        rs.getString("review_status"),
                        rs.getString("apply_status")),
                batchId);

        if (headers.isEmpty()) {
            throw new IllegalArgumentException(
                    "AreaOnboardingBatchQuery: no area_onboarding_batch row for id=" + batchId);
        }
        BatchHeader header = headers.get(0);

        List<AreaOnboardingBatchDetail.CandidateSummary> candidates = jdbcOperations.query(
                SELECT_CANDIDATES_SQL,
                (rs, rowNum) -> new AreaOnboardingBatchDetail.CandidateSummary(
                        rs.getLong("id"),
                        rs.getString("input_area_key"),
                        rs.getString("normalised_area_key"),
                        rs.getString("matched_area_key"),
                        rs.getString("outcome"),
                        rs.getString("review_decision"),
                        splitConflictTypes(rs.getString("conflict_types")),
                        rs.getString("geometry_trust"),
                        rs.getString("external_source_id")),
                batchId);

        return new AreaOnboardingBatchDetail(
                header.id(),
                header.cityId(),
                header.datasetId(),
                header.datasetVersion(),
                header.provider(),
                header.sourceExtractedAt(),
                header.applyAllowed(),
                header.blockingReasons(),
                header.reviewStatus(),
                header.applyStatus(),
                candidates);
    }

    private static List<String> splitConflictTypes(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    /**
     * Splits the persisted {@code blocking_reasons} column on {@code "; "} — the same delimiter
     * {@code AreaOnboardingService.insertBatch} joins with ({@code String.join("; ", blockingReasons)}).
     * Deliberately NOT {@link #splitConflictTypes}'s comma delimiter: each reason's own text (e.g.
     * {@code "CITY_BOUNDS_MISSING: city 5 has no min/max lat/lon bounds"}) may itself contain a
     * comma, so splitting on comma would corrupt a reason rather than merely separate reasons.
     */
    private static List<String> splitBlockingReasons(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        return Arrays.stream(raw.split("; "))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }

    private record BatchHeader(
            long id,
            int cityId,
            boolean applyAllowed,
            List<String> blockingReasons,
            String datasetId,
            String datasetVersion,
            String provider,
            OffsetDateTime sourceExtractedAt,
            String reviewStatus,
            String applyStatus) {}
}

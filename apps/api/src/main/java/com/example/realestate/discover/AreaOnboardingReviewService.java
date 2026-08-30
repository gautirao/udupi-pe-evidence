package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Records the explicit human reviewer decision that gates {@link AreaOnboardingApplyService#apply}
 * (#1887 PR2, design decision D1) — a separate, deliberate step so apply() never self-approves.
 *
 * <p>Only sets {@code review_decision = 'APPROVED'} on candidates whose {@code outcome} is one of
 * the three clean outcomes ({@code READY_TO_CREATE}, {@code READY_TO_UPDATE}, {@code UNCHANGED})
 * within an {@code apply_allowed = true} batch, and only those still {@code PENDING} — never
 * downgrades an existing {@code APPROVED}/{@code REJECTED} decision, and never touches a
 * non-clean-outcome candidate (those always need a human decision outside this bulk-approve path).
 *
 * <h2>Decisions are immutable after a successful apply (#1887 rework FIX 1)</h2>
 * Once {@code area_onboarding_batch.apply_status = 'APPLIED'} (set by {@link
 * AreaOnboardingApplyService#apply} on success), {@link #approve} refuses to mutate ANY decision
 * for that batch — a batch can never be incrementally re-reviewed/re-approved after it has already
 * been applied. A fresh dry-run (new batch) is required instead.
 *
 * <h2>FINALIZED review state machine (#1887 rework #4, BLOCKING 1) — closes checksum laundering</h2>
 * A batch starts {@code review_status = 'IN_REVIEW'}. The moment this call drives the batch to zero
 * remaining {@code PENDING} candidates, {@link #approve} transitions it to {@code 'FINALIZED'} in
 * ONE guarded atomic {@code UPDATE ... WHERE review_status = 'IN_REVIEW'} that ALSO stores {@code
 * review_finalized_at} and {@code persisted_batch_checksum} together — see {@link
 * #finalizeReviewIfFullyReviewed}. Critically, {@code persisted_batch_checksum} is written EXACTLY
 * ONCE by that transition and NEVER refreshed again: once {@code review_status = 'FINALIZED'},
 * {@link #approve} REFUSES — before touching anything — any further call on that batch, including
 * one that would approve zero new candidates. This closes a real gap the user's independent review
 * found: previously, EVERY {@link #approve} call unconditionally recomputed and OVERWROTE the
 * stored digest against whatever the batch's CURRENT persisted state happened to be, so tampering a
 * digest-protected field via raw SQL after finalisation and then calling {@link #approve} again (a
 * legitimate, unguarded no-new-approvals call) silently laundered the tamper into a fresh "valid"
 * checksum that {@link AreaOnboardingApplyService#apply} would then accept.
 *
 * <h2>Row-level locking (#1887 rework #4, BLOCKING 1/2)</h2>
 * {@link #approve} takes a {@code SELECT ... FOR UPDATE} lock on the {@code area_onboarding_batch}
 * row FIRST, held for its entire {@code @Transactional} duration — this is also the FIRST lock
 * {@link AreaOnboardingApplyService#apply} takes, in the SAME order, so a concurrent
 * {@code approve()}/{@code apply()} pair on the same batch always serializes at the database level
 * rather than racing. Each per-candidate {@code UPDATE} is additionally conditioned on {@code WHERE
 * review_decision = 'PENDING'} with the affected-row count asserted {@code == 1} — a defensive,
 * self-checking guard against a candidate that was concurrently mutated away from {@code PENDING}.
 *
 * <h2>Canonical-target fingerprint capture, including CREATE-family (#1887 rework FIX 7, widened by
 * rework #4 BLOCKING 3)</h2>
 * For EVERY candidate this approves — including {@code READY_TO_CREATE} ones with no {@code
 * matched_area_key} — {@link #approve} captures a fingerprint of the CURRENT state at the
 * candidate's target key (its {@code matched_area_key} if present, else its own {@code
 * normalised_area_key}) into {@code reviewed_canonical_fingerprint}: the real fingerprint if
 * something already exists there, or the {@link AreaOnboardingApplyService#noExistingAreaFingerprint
 * sentinel} if nothing does. {@code reviewed_canonical_fingerprint} is therefore NEVER {@code null}
 * for a candidate this approves. {@link AreaOnboardingApplyService#apply} later verifies this same
 * fingerprint uniformly for every candidate family — see that class's doc comment for the full
 * sentinel-vs-real verification and self-heal contract.
 *
 * <h2>Review-finalisation checksum (#1887 rework FIX 4b, rework #2, re-scoped by rework #4)</h2>
 * {@code persisted_batch_checksum} is the SAME deterministic digest {@link
 * AreaOnboardingApplyService#computePersistedBatchChecksum} defines, computed over the CURRENT
 * persisted batch identity + candidate rows at the moment of finalisation and stored ONCE as part
 * of the {@code IN_REVIEW -&gt; FINALIZED} transition. {@link AreaOnboardingApplyService#apply}
 * later recomputes this same digest on a batch's FIRST apply and aborts the whole apply on any
 * mismatch (or if this column is still {@code NULL}, meaning review was never finalised) — this is
 * DISTINCT from {@code artifact_checksum}, which remains the UNTOUCHED provider/curator-supplied
 * source-artifact checksum from PR1's dry-run; this class never reads, writes, or validates that
 * column. It is also DISTINCT from {@code applied_batch_checksum} (written once by the first
 * successful apply, read by every re-apply) — see {@link AreaOnboardingApplyService}'s doc comment.
 */
@Service
public class AreaOnboardingReviewService {

    private static final Logger log = LoggerFactory.getLogger(AreaOnboardingReviewService.class);

    private final JdbcOperations jdbcOperations;

    public AreaOnboardingReviewService(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    /**
     * Approves every still-{@code PENDING}, clean-outcome candidate in {@code batchId}, capturing
     * a canonical-target fingerprint for EVERY candidate it approves (FIX 7, widened by rework #4
     * BLOCKING 3 to cover CREATE-family too). Throws if the batch doesn't exist, is not {@code
     * apply_allowed}, has ALREADY been successfully applied (FIX 1), or is already {@code
     * review_status = 'FINALIZED'} (rework #4 BLOCKING 1) — an applied OR finalized batch's
     * decisions and persisted_batch_checksum are immutable. Returns the number of candidate rows
     * newly marked {@code APPROVED}.
     */
    @Transactional
    public int approve(long batchId, String reviewedBy) {
        // #1887 rework #4 BLOCKING 1/2: lock the batch row FIRST, for the whole transaction — the
        // SAME total lock order AreaOnboardingApplyService#apply uses, so a concurrent
        // approve()/apply() pair on the same batch always serializes rather than racing.
        BatchRow batch = loadBatchForUpdate(batchId);
        if (batch == null) {
            throw new IllegalArgumentException(
                    "AreaOnboardingReviewService: no area_onboarding_batch row for id=" + batchId);
        }
        if (!batch.applyAllowed()) {
            throw new IllegalStateException(
                    "AreaOnboardingReviewService: batch_id=" + batchId
                            + " has apply_allowed=false — nothing eligible to approve");
        }
        if ("APPLIED".equals(batch.applyStatus())) {
            throw new IllegalStateException(
                    "AreaOnboardingReviewService: batch_id=" + batchId
                            + " has ALREADY been applied — review decisions are immutable after a "
                            + "successful apply (#1887 rework FIX 1); a fresh dry-run is required");
        }
        // #1887 rework #4 BLOCKING 1: once FINALIZED, decisions AND persisted_batch_checksum are
        // immutable — refuse BEFORE any write, so a repeat call (even one approving zero new
        // candidates) can never launder a tampered field into a freshly "valid" checksum.
        if ("FINALIZED".equals(batch.reviewStatus())) {
            throw new IllegalStateException(
                    "AreaOnboardingReviewService: batch_id=" + batchId
                            + " review_status=FINALIZED — this batch's review was already finalised; "
                            + "decisions and persisted_batch_checksum are immutable from that point on "
                            + "(#1887 rework #4 BLOCKING 1); refusing to mutate anything, no writes performed");
        }

        List<EligibleCandidateRow> eligible = loadEligiblePending(batchId);
        int approvedCount = 0;
        for (EligibleCandidateRow candidate : eligible) {
            String fingerprint = fingerprintFor(candidate);
            int rows = jdbcOperations.update(APPROVE_ONE_SQL, reviewedBy, fingerprint, candidate.id());
            if (rows != 1) {
                // Defensive: under this method's own FOR UPDATE lock on the batch row this should
                // never happen for a candidate row that belongs to this batch, but guard against a
                // stale/duplicate concurrent mutation away from PENDING rather than silently
                // miscounting approvedCount.
                throw new IllegalStateException(
                        "AreaOnboardingReviewService: batch_id=" + batchId + " candidate_id=" + candidate.id()
                                + " expected to approve exactly 1 PENDING row but affected " + rows
                                + " — candidate was concurrently mutated away from PENDING; aborting");
            }
            approvedCount++;
        }

        finalizeReviewIfFullyReviewed(batchId);

        log.info("AreaOnboardingReviewService: approve batchId={} reviewedBy={} — {} candidate(s) approved",
                batchId, reviewedBy, approvedCount);
        return approvedCount;
    }

    /**
     * #1887 rework #4 (BLOCKING 1): if {@code batchId} has zero remaining {@code review_decision =
     * 'PENDING'} candidates, transitions the batch {@code IN_REVIEW -&gt; FINALIZED} in ONE guarded
     * atomic {@code UPDATE ... WHERE review_status = 'IN_REVIEW'}, storing {@code
     * review_finalized_at} and the {@code persisted_batch_checksum} digest (computed over the
     * CURRENT persisted batch + candidate rows) together. A no-op while ANY candidate is still
     * PENDING. Because the batch row is FOR-UPDATE-locked for this whole transaction, and because
     * {@link #approve} above already refuses to run at all once {@code review_status = 'FINALIZED'},
     * this UPDATE always affects exactly 1 row when it runs — asserted defensively.
     */
    private void finalizeReviewIfFullyReviewed(long batchId) {
        Integer pendingCount = jdbcOperations.queryForObject(SELECT_PENDING_COUNT_SQL, Integer.class, batchId);
        if (pendingCount == null || pendingCount > 0) {
            return; // stays IN_REVIEW — no checksum is written.
        }
        AreaOnboardingApplyService.BatchRow fullBatch = loadFullBatch(batchId);
        List<AreaOnboardingApplyService.CandidateRow> candidateRows = loadAllCandidateRows(batchId);
        String checksum = AreaOnboardingApplyService.computePersistedBatchChecksum(fullBatch, candidateRows);
        int rows = jdbcOperations.update(FINALIZE_REVIEW_SQL, checksum, batchId);
        if (rows != 1) {
            throw new IllegalStateException(
                    "AreaOnboardingReviewService: batch_id=" + batchId
                            + " failed to transition IN_REVIEW -> FINALIZED (expected to affect exactly 1 "
                            + "row, affected " + rows + ") — refusing to proceed silently");
        }
        log.info("AreaOnboardingReviewService: batchId={} is now FINALIZED (0 PENDING remain) — "
                + "persisted_batch_checksum computed and stored EXACTLY ONCE", batchId);
    }

    /**
     * Fingerprints the CURRENT state at {@code candidate}'s target key — its {@code
     * matched_area_key} if present, else its own {@code normalised_area_key} — uniformly for every
     * candidate family (#1887 rework #4 BLOCKING 3: CREATE-family candidates used to be left with a
     * {@code null} fingerprint here; they now get the same sentinel-or-real treatment UPDATE-family
     * candidates always got).
     */
    private String fingerprintFor(EligibleCandidateRow candidate) {
        String targetAreaKey = candidate.matchedAreaKey() != null
                ? candidate.matchedAreaKey()
                : candidate.normalisedAreaKey();
        ExistingAreaSnapshot existing = findAreaSnapshot(targetAreaKey);
        if (existing == null) {
            return AreaOnboardingApplyService.noExistingAreaFingerprint();
        }
        return AreaOnboardingApplyService.canonicalFingerprint(
                existing.areaKey(), existing.cityId(), existing.name(), existing.district(),
                existing.geoCenterLat(), existing.geoCenterLon(), existing.minLat(), existing.minLon(),
                existing.maxLat(), existing.maxLon(), existing.geometrySource(), existing.lifecycleStatus());
    }

    // ── Reads ────────────────────────────────────────────────────────────────

    private BatchRow loadBatchForUpdate(long batchId) {
        return jdbcOperations.query(SELECT_BATCH_FOR_UPDATE_SQL, rs -> rs.next()
                ? new BatchRow(rs.getInt("city_id"), rs.getBoolean("apply_allowed"),
                        rs.getString("apply_status"), rs.getString("review_status"))
                : null, batchId);
    }

    private List<EligibleCandidateRow> loadEligiblePending(long batchId) {
        return jdbcOperations.query(SELECT_ELIGIBLE_PENDING_SQL,
                (rs, rowNum) -> new EligibleCandidateRow(
                        rs.getLong("id"), rs.getString("matched_area_key"), rs.getString("normalised_area_key")),
                batchId);
    }

    /**
     * Duplicated (not shared) small canonical-area read, mirroring {@code AreaOnboardingApplyService
     * .findAreaByKey} — same duplication convention already used for {@code sha256Hex} between
     * {@code AreaOnboardingService} and {@code AreaOnboardingApplyService} (#1887 PR2).
     */
    private ExistingAreaSnapshot findAreaSnapshot(String areaKey) {
        return jdbcOperations.query(SELECT_AREA_BY_KEY_SQL, rs -> rs.next()
                ? new ExistingAreaSnapshot(rs.getString("area_key"), rs.getInt("city_id"), rs.getString("name"),
                        rs.getString("district"),
                        nullableDouble(rs.getObject("geo_center_lat")), nullableDouble(rs.getObject("geo_center_lon")),
                        nullableDouble(rs.getObject("min_lat")), nullableDouble(rs.getObject("min_lon")),
                        nullableDouble(rs.getObject("max_lat")), nullableDouble(rs.getObject("max_lon")),
                        rs.getString("geometry_source"), rs.getString("lifecycle_status"))
                : null, areaKey);
    }

    private static Double nullableDouble(Object val) {
        return val == null ? null : ((Number) val).doubleValue();
    }

    /**
     * Duplicated (not shared) full batch-identity read for the FIX 4b digest, mirroring {@link
     * AreaOnboardingApplyService#loadBatch} — same intentional duplication convention as {@link
     * #findAreaSnapshot} above. Returns {@link AreaOnboardingApplyService.BatchRow} so both
     * services compute {@link AreaOnboardingApplyService#computePersistedBatchChecksum} identically.
     * Safe to read without its own FOR UPDATE — the batch row is already locked by {@link #approve}
     * for this whole transaction.
     */
    private AreaOnboardingApplyService.BatchRow loadFullBatch(long batchId) {
        return jdbcOperations.query(SELECT_FULL_BATCH_SQL, rs -> rs.next()
                ? new AreaOnboardingApplyService.BatchRow(rs.getLong("id"), rs.getInt("city_id"),
                        rs.getBoolean("apply_allowed"), rs.getString("dataset_id"), rs.getString("dataset_version"),
                        rs.getString("artifact_checksum"), rs.getString("provider"),
                        rs.getString("input_schema_version"),
                        rs.getObject("source_extracted_at", OffsetDateTime.class),
                        rs.getString("review_status"), rs.getString("persisted_batch_checksum"),
                        rs.getString("applied_batch_checksum"), rs.getString("apply_status"))
                : null, batchId);
    }

    /**
     * Duplicated (not shared) full candidate-row read for the FIX 4b digest, mirroring {@link
     * AreaOnboardingApplyService#loadCandidates} — same duplication convention as {@link
     * #findAreaSnapshot}. Returns EVERY candidate (any decision, any outcome), ordered by id — the
     * digest must cover the whole batch, not just this call's newly-approved subset.
     */
    private List<AreaOnboardingApplyService.CandidateRow> loadAllCandidateRows(long batchId) {
        return jdbcOperations.query(SELECT_ALL_CANDIDATE_ROWS_SQL,
                (rs, rowNum) -> new AreaOnboardingApplyService.CandidateRow(
                        rs.getLong("id"), rs.getString("input_area_key"), rs.getString("normalised_area_key"),
                        rs.getString("matched_area_key"), rs.getString("outcome"), rs.getString("review_decision"),
                        rs.getString("payload_text"), rs.getString("payload_checksum"),
                        rs.getString("external_source_id"), rs.getString("reviewed_canonical_fingerprint")),
                batchId);
    }

    // ── Row types ────────────────────────────────────────────────────────────

    private record BatchRow(int cityId, boolean applyAllowed, String applyStatus, String reviewStatus) {}

    private record EligibleCandidateRow(long id, String matchedAreaKey, String normalisedAreaKey) {}

    private record ExistingAreaSnapshot(
            String areaKey, int cityId, String name, String district,
            Double geoCenterLat, Double geoCenterLon,
            Double minLat, Double minLon, Double maxLat, Double maxLon,
            String geometrySource, String lifecycleStatus) {}

    // ── SQL ──────────────────────────────────────────────────────────────────

    private static final String SELECT_BATCH_FOR_UPDATE_SQL =
            "SELECT city_id, apply_allowed, apply_status, review_status FROM area_onboarding_batch "
                    + "WHERE id = ? FOR UPDATE";

    private static final String SELECT_ELIGIBLE_PENDING_SQL = """
            SELECT id, matched_area_key, normalised_area_key
            FROM area_onboarding_candidate
            WHERE batch_id = ?
              AND review_decision = 'PENDING'
              AND outcome IN ('READY_TO_CREATE', 'READY_TO_UPDATE', 'UNCHANGED')
            ORDER BY id
            """;

    private static final String SELECT_AREA_BY_KEY_SQL = """
            SELECT area_key, city_id, name, district, geo_center_lat, geo_center_lon,
                   min_lat, min_lon, max_lat, max_lon, geometry_source, lifecycle_status
            FROM areas WHERE area_key = ?
            """;

    private static final String APPROVE_ONE_SQL = """
            UPDATE area_onboarding_candidate
            SET review_decision = 'APPROVED', reviewed_by = ?, reviewed_at = now(),
                reviewed_canonical_fingerprint = ?
            WHERE id = ? AND review_decision = 'PENDING'
            """;

    // ── FIX 4b / rework #4 BLOCKING 1: review-finalisation persisted_batch_checksum ────

    private static final String SELECT_PENDING_COUNT_SQL =
            "SELECT COUNT(*) FROM area_onboarding_candidate WHERE batch_id = ? AND review_decision = 'PENDING'";

    private static final String SELECT_FULL_BATCH_SQL = """
            SELECT id, city_id, apply_allowed, dataset_id, dataset_version, artifact_checksum, provider,
                   input_schema_version, source_extracted_at, review_status, persisted_batch_checksum,
                   applied_batch_checksum, apply_status
            FROM area_onboarding_batch WHERE id = ?
            """;

    private static final String SELECT_ALL_CANDIDATE_ROWS_SQL = """
            SELECT id, input_area_key, normalised_area_key, matched_area_key, outcome, review_decision,
                   candidate_payload::text AS payload_text, payload_checksum, external_source_id,
                   reviewed_canonical_fingerprint
            FROM area_onboarding_candidate
            WHERE batch_id = ?
            ORDER BY id
            """;

    /** #1887 rework #4 BLOCKING 1: the ONE guarded atomic IN_REVIEW -> FINALIZED transition. */
    private static final String FINALIZE_REVIEW_SQL = """
            UPDATE area_onboarding_batch
            SET review_status = 'FINALIZED', review_finalized_at = now(), persisted_batch_checksum = ?
            WHERE id = ? AND review_status = 'IN_REVIEW'
            """;
}

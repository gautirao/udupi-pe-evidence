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
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * Transactionally applies a reviewed, apply-allowed {@link AreaOnboardingService} dry-run batch
 * into the canonical {@code areas} model (#1887 PR2).
 *
 * <h2>Checksum-verify-before-write (design decision D7, risk R1)</h2>
 * Every candidate that will be applied has its {@code candidate_payload} reconstructed via
 * Jackson and its {@code payload_checksum} recomputed and compared against the stored value
 * BEFORE any canonical write in this batch happens (see the multi-phase structure of {@link
 * #apply}): a single mismatch throws and aborts the ENTIRE apply — no partial writes.
 *
 * <h2>Single transaction, no synchronous downstream calls (risks R2, R3)</h2>
 * {@link #apply} is one {@code @Transactional} method. Every canonical write — {@code areas},
 * {@code area_onboarding_apply_audit}, {@code area_region_reclass_outbox} — happens on the same
 * connection and commits or rolls back together. This class NEVER calls
 * {@code CityRegionOnboardingService}, {@code RegionalClassificationBackfillService}, or any
 * OpenSearch/indexing code — region reclassification is recorded ONLY as a durable outbox row for
 * a future consumer (PR3+) to drain.
 *
 * <h2>Geometry protection (design decision D4)</h2>
 * On an existing-area match, geometry columns ({@code geo_center_lat/lon}, {@code min/max_lat/lon},
 * {@code geometry_source}) are overwritten by the candidate's values ONLY when the candidate's
 * {@link GeometryTrust} rank is &gt;= the existing area's rank ({@code VERIFIED=3 > PROVISIONAL=2 >
 * MISSING=1}). A downgrade PRESERVES every geometry column unchanged and records a
 * {@link ApplyAction#GEOMETRY_PRESERVED} audit row instead. {@code osm_element_type},
 * {@code osm_element_id}, {@code osm_version}, {@code osm_extract_date} are never touched by this
 * class — no {@link AreaOnboardingService.CandidateInput} carries them.
 *
 * <h2>Stable area identity (design decision, risk R6)</h2>
 * An UPDATE always targets {@code WHERE area_key = <the staging row's matched_area_key>} — an
 * existing area's {@code area_key} primary key is NEVER rewritten in place. A candidate with no
 * {@code matched_area_key} is a CREATE at its own {@code normalised_area_key}, never a rename of
 * an unrelated existing row.
 *
 * <h2>Idempotency (design decision D6, AC4)</h2>
 * Every write is compare-before-write against the CURRENT canonical state (not the staging row's
 * {@code outcome}, which is fixed at dry-run time): a candidate whose target area already has
 * identical values is counted as {@code unchanged} and produces zero area/audit/outbox writes on a
 * second apply of the same batch. {@code area_onboarding_batch.apply_status} is set on every
 * successful apply as an ADVISORY marker only (design OQ2) — it is never read back as a hard skip
 * condition for the apply itself (re-applying is always safe); it IS however read as a hard
 * IMMUTABILITY guard by {@link AreaOnboardingReviewService#approve} (#1887 rework FIX 1): once a
 * batch has been successfully applied, its per-candidate review decisions can never be mutated
 * again. It is ALSO read by THIS class (#1887 rework #4, THE CRUX) to decide which of the two
 * frozen checksums a given apply call must verify against — see below.
 *
 * <h2>Explicit per-candidate approval gating (design decision D1, AC9, #1887 rework FIX 1) +
 * FINALIZED review precondition (#1887 rework #4, BLOCKING 1)</h2>
 * A candidate is applied only when its outcome is one of the three clean outcomes
 * ({@code READY_TO_CREATE}, {@code READY_TO_UPDATE}, {@code UNCHANGED}) AND its
 * {@code review_decision = 'APPROVED'}; a {@code REJECTED} candidate is simply never applied.
 * {@link #apply} itself never self-approves; only {@link AreaOnboardingReviewService#approve}
 * writes {@code APPROVED}. {@link #apply} now requires {@code area_onboarding_batch.review_status =
 * 'FINALIZED'} before any write — this REPLACES the old, weaker "scan candidates for a live {@code
 * PENDING}" check: {@code review_status = 'FINALIZED'} is the ONLY state in which {@link
 * AreaOnboardingReviewService#approve} has ever stored {@code persisted_batch_checksum}, and it is
 * immutable from that point on (that service refuses to mutate a FINALIZED batch at all). The
 * batch-level {@code apply_allowed} flag is a separate, harder precondition: {@code false} refuses
 * the WHOLE apply before any write (see {@link #apply}).
 *
 * <h2>Row-level locking, total order (#1887 rework #4, BLOCKING 1/2)</h2>
 * {@link #apply} takes a {@code SELECT ... FOR UPDATE} lock on the {@code area_onboarding_batch}
 * row FIRST — the SAME first lock {@link AreaOnboardingReviewService#approve} takes, so a
 * concurrent {@code approve()}/{@code apply()} pair on the same batch always serializes rather than
 * racing. It then locks every DISTINCT existing target {@code areas} row this batch's candidates
 * resolve to, in ASCENDING {@code area_key} order (a stable total order, avoiding deadlock against
 * another concurrent {@code apply()} touching an overlapping set of areas), and holds those locks
 * through every Phase-2 write. This closes the Phase-1-to-Phase-2 TOCTOU gap: without it, a
 * concurrent transaction could mutate a target area between this class's Phase-1 fingerprint read
 * and its Phase-2 write, and that write would silently overwrite the concurrent change. Every
 * Phase-2 {@code UPDATE}/{@code INSERT} additionally asserts its own affected-row count, as a second,
 * independent layer of defense.
 *
 * <h2>Production dataset identity (#1887 rework FIX 4a) + persisted-batch integrity (FIX 4b,
 * rework #2, widened by rework #3, re-scoped by rework #4)</h2>
 * Before any write, the batch's PERSISTED identity columns (all already delivered by PR1:
 * {@code dataset_id}, {@code dataset_version}, {@code provider}, {@code input_schema_version},
 * {@code source_extracted_at}, and — as of rework #3 — {@code artifact_checksum}) must all be
 * present (nonblank) and the {@code input_schema_version} must be one this service supports (FIX
 * 4a). {@code artifact_checksum}'s VALUE is still never read, recomputed, reinterpreted, or
 * compared as a digest input anywhere in this class — it remains the provider/curator-supplied
 * source-artifact checksum PR1's dry-run writes verbatim; rework #3 only added a "must be present"
 * completeness requirement for it, as part of requiring complete production source provenance
 * before apply.
 *
 * <h2>Two independently-frozen checksums (#1887 rework #4, THE CRUX)</h2>
 * {@code persisted_batch_checksum} — the "finalisation anchor" — is written EXACTLY ONCE by {@link
 * AreaOnboardingReviewService#approve} as part of the {@code IN_REVIEW -&gt; FINALIZED} transition,
 * over the review-time rows (including each candidate's {@code reviewed_canonical_fingerprint}).
 * This class NEVER writes it. {@code applied_batch_checksum} — the "applied anchor", a DISTINCT
 * column — is written EXACTLY ONCE by the FIRST successful {@link #apply} call, computed AFTER
 * Phase 2's writes (including any CREATE-family self-heal, BLOCKING 3) settle, via an {@code UPDATE
 * ... WHERE applied_batch_checksum IS NULL}. {@link #apply} decides which of the two to verify
 * against based on {@code apply_status} read at the START of the call: NOT {@code 'APPLIED'} (the
 * first apply) recomputes over the CURRENT rows and compares to {@code persisted_batch_checksum};
 * {@code 'APPLIED'} (a re-apply) recomputes over the CURRENT rows and compares to {@code
 * applied_batch_checksum} instead. Neither checksum is ever refreshed after its one write — this
 * reconciles BLOCKING 1's "store once, never launder" requirement for {@code
 * persisted_batch_checksum} with idempotent re-apply (AC4/FIX2): a second apply of a genuinely
 * unchanged batch recomputes the SAME digest it compares against (its own settled state), while any
 * genuinely different out-of-band edit is still caught by either comparison.
 *
 * <h2>Full projection-column verification before any write (#1887 rework FIX 3)</h2>
 * Beyond the payload checksum, every applicable candidate's {@code input_area_key},
 * {@code normalised_area_key}, {@code matched_area_key}, and clean {@code outcome} are
 * cross-verified against a FRESH recomputation via {@link AreaKeyFormat} and the CURRENT canonical
 * state before Phase 2 begins. A target area whose {@code city_id} differs from the batch's
 * {@code city_id} (a cross-city match) also aborts the whole batch.
 *
 * <h2>Canonical-target fingerprint parity, uniform across CREATE and UPDATE families (#1887
 * rework FIX 7, generalised by rework #4 BLOCKING 3)</h2>
 * {@link AreaOnboardingReviewService#approve} captures a fingerprint of the CURRENT state at every
 * approved candidate's target key — the {@link #noExistingAreaFingerprint() sentinel} if nothing
 * exists there yet, or a real {@link #canonicalFingerprint} otherwise — for EVERY candidate family,
 * including {@code READY_TO_CREATE} (previously left {@code null} and unverified — the exact gap
 * BLOCKING 3 closes). {@link #apply} re-verifies this uniformly: if the stored fingerprint is the
 * sentinel, the target key must STILL have no existing area (else abort — an unrelated/conflicting
 * occupant); if it is a real fingerprint, the target key must STILL exist with that EXACT
 * fingerprint (else abort — an external edit or delete since review). A CREATE-family candidate
 * that passes with the sentinel is inserted (its first materialisation); one that passes with a
 * real fingerprint (a re-apply after a prior CREATE, or a candidate that already had an occupant at
 * review time) is routed through the same idempotent {@link #updateAreaIfChanged} UPDATE-family
 * candidates use. Immediately after a CREATE actually inserts a row, {@link #createArea} self-heals
 * {@code reviewed_canonical_fingerprint} from the sentinel to a REAL fingerprint of the just-created
 * area, in the SAME transaction — mirroring the self-heal {@link #updateAreaIfChanged} already
 * performs for UPDATE-family candidates — so a later re-apply of this SAME batch verifies against
 * the actual materialized state instead of the sentinel, while a genuinely different actor's
 * SUBSEQUENT external edit or delete is still caught on the next apply.
 *
 * <h2>Alias population deferred (#1887 rework FIX 5)</h2>
 * PR2 does NOT populate {@code area_alias} at all. The previous automatic alias-creation path
 * (raw {@code input_area_key} + display {@code name}, first-writer-wins on conflict) has been
 * REMOVED — it created unreviewed aliases as an uncontrolled side effect of apply. Alias
 * population is deferred to a future PR (PR3+) once an explicit, reviewed alias contract exists —
 * distinct from mere alias LOOKUP during listing ingestion, which was already independently in
 * PR3's scope (#1887 rework #4, R3 scope clarification: this is the same deferral V115's own
 * comment describes, restated here honestly rather than left to silently contradict PR2's actual
 * behaviour). The {@code area_alias} table itself is untouched (still created empty by PR1, still
 * read during dry-run for {@code ALIAS_CONFLICT} detection).
 *
 * <h2>Provenance in the existing audit trail (#1887 rework FIX 6)</h2>
 * {@code CREATE_AREA}/{@code UPDATE_AREA}/{@code GEOMETRY_PRESERVED} audit rows now also carry the
 * batch's {@code provider} and the candidate's {@code external_source_id} inside their JSON
 * payload (alongside {@code batch_id}/{@code candidate_id}, already columns on the audit row
 * itself). This is deliberately NOT a new provenance subsystem: no durable, cross-batch, canonical
 * provider-ID -&gt; area mapping is introduced here — that lookup is explicitly deferred to PR3
 * (where listing-ingestion source resolution is already in scope).
 *
 * <h2>Idempotent per-action audit rows (#1887 rework FIX 2)</h2>
 * {@code area_onboarding_apply_audit} has a {@code UNIQUE (batch_id, candidate_id, action)}
 * constraint, and {@link AreaOnboardingApplyAudit#record} inserts with
 * {@code ON CONFLICT (batch_id, candidate_id, action) DO NOTHING}. This makes
 * {@link ApplyAction#GEOMETRY_PRESERVED} — which would otherwise re-fire on every unchanged
 * re-apply, since the candidate's (lower-trust) geometry still differs from the existing
 * (higher-trust) geometry every time — a true no-op on a repeat apply. {@code auditRows} in
 * {@link ApplyReport} only counts rows that were ACTUALLY inserted this call.
 */
@Service
public class AreaOnboardingApplyService {

    private static final Logger log = LoggerFactory.getLogger(AreaOnboardingApplyService.class);

    private static final Set<CandidateOutcome> CLEAN_OUTCOMES =
            Set.of(CandidateOutcome.READY_TO_CREATE, CandidateOutcome.READY_TO_UPDATE, CandidateOutcome.UNCHANGED);

    private static final Set<CandidateOutcome> MATCHED_OUTCOMES =
            Set.of(CandidateOutcome.READY_TO_UPDATE, CandidateOutcome.UNCHANGED);

    /**
     * #1887 rework FIX 4: {@code input_schema_version} values this apply path accepts. Grows as
     * #1900's approved input schema evolves; an unsupported/blank version refuses the whole apply
     * rather than guessing compatibility.
     */
    private static final Set<String> SUPPORTED_INPUT_SCHEMA_VERSIONS = Set.of("1");

    /** #1887 rework FIX 7: sentinel fingerprinted when a candidate's target key genuinely has no existing area. */
    private static final String NO_EXISTING_AREA_SENTINEL = "NO_EXISTING_AREA_V1";

    private final JdbcOperations jdbcOperations;
    private final ObjectMapper objectMapper;
    private final AreaOnboardingApplyAudit auditDao;
    private final AreaRegionReclassOutbox outboxDao;

    public AreaOnboardingApplyService(
            JdbcOperations jdbcOperations,
            ObjectMapper objectMapper,
            AreaOnboardingApplyAudit auditDao,
            AreaRegionReclassOutbox outboxDao) {
        this.jdbcOperations = jdbcOperations;
        this.objectMapper = objectMapper;
        this.auditDao = auditDao;
        this.outboxDao = outboxDao;
    }

    /**
     * Applies {@code batchId}'s approved, clean candidates to canonical {@code areas}. Throws
     * (rolling back the whole transaction, zero writes) if: the batch doesn't exist; is not
     * {@code apply_allowed}; is missing/has unsupported production dataset identity (FIX 4a); is
     * not {@code review_status = 'FINALIZED'} (#1887 rework #4 BLOCKING 1, replaces the old
     * per-row PENDING scan); its recomputed checksum (persisted or applied, depending on {@code
     * apply_status} — see this class's doc comment) disagrees with the value stored against it; OR
     * ANY candidate selected for application fails its checksum-reconstruction, projection-column
     * consistency, cross-city, or canonical-fingerprint-parity check (FIX 3, FIX 7/BLOCKING 3).
     */
    @Transactional
    public ApplyReport apply(long batchId, String appliedBy) {
        // #1887 rework #4 BLOCKING 1/2: lock the batch row FIRST — the SAME first lock
        // AreaOnboardingReviewService#approve takes, so a concurrent approve()/apply() pair on the
        // same batch always serializes rather than racing.
        BatchRow batch = loadBatchForUpdate(batchId);
        if (batch == null) {
            throw new IllegalArgumentException(
                    "AreaOnboardingApplyService: no area_onboarding_batch row for id=" + batchId);
        }
        if (!batch.applyAllowed()) {
            throw new IllegalStateException(
                    "AreaOnboardingApplyService: batch_id=" + batchId
                            + " has apply_allowed=false — refusing to apply, no writes performed");
        }

        // ── FIX 4a: production dataset identity must be complete and supported BEFORE any write.
        validateDatasetIdentity(batch);

        // ── #1887 rework #4 BLOCKING 1: review must be FINALIZED before any write. This REPLACES
        // the old "scan for a live PENDING candidate" check — FINALIZED is the only state in which
        // AreaOnboardingReviewService.approve has ever stored persisted_batch_checksum, and that
        // service refuses to mutate a FINALIZED batch's decisions ever again.
        if (!"FINALIZED".equals(batch.reviewStatus())) {
            throw new IllegalStateException(
                    "AreaOnboardingApplyService: batch_id=" + batchId + " review_status=" + batch.reviewStatus()
                            + " — apply requires a FINALIZED review (every candidate must have a final "
                            + "decision AND AreaOnboardingReviewService.approve must have stored "
                            + "persisted_batch_checksum as part of that transition); refusing to apply, no "
                            + "writes performed");
        }

        List<CandidateRow> candidateRows = loadCandidates(batchId);

        // ── Phase 1a: local-only per-candidate validation (payload/keys) — no `areas` reads yet.
        List<PendingCandidate> pending = new ArrayList<>();
        int skippedNotApproved = 0;
        for (CandidateRow row : candidateRows) {
            CandidateOutcome outcome = CandidateOutcome.valueOf(row.outcome());
            if (!CLEAN_OUTCOMES.contains(outcome) || !"APPROVED".equals(row.reviewDecision())) {
                skippedNotApproved++;
                continue;
            }

            String recomputedPayloadChecksum = sha256Hex(row.payloadText());
            if (!recomputedPayloadChecksum.equals(row.payloadChecksum())) {
                throw new IllegalStateException(
                        "AreaOnboardingApplyService: payload_checksum mismatch for candidate_id=" + row.id()
                                + " batch_id=" + batchId + " — aborting apply, no writes committed");
            }
            AreaOnboardingService.CandidateInput input = deserialize(row.payloadText());

            // FIX 3(c): the payload's OWN area key must agree with the staged input_area_key.
            if (!Objects.equals(input.areaKey(), row.inputAreaKey())) {
                throw new IllegalStateException(
                        "AreaOnboardingApplyService: candidate_id=" + row.id() + " batch_id=" + batchId
                                + " candidate_payload areaKey=" + input.areaKey()
                                + " disagrees with staged input_area_key=" + row.inputAreaKey()
                                + " — aborting apply, no writes committed");
            }

            // FIX 3(b)(d): recompute the normalised key via the SAME AreaKeyFormat validator used
            // at dry-run time and verify it still agrees with the staged normalised_area_key.
            if (!AreaKeyFormat.isValidFourSegment(row.inputAreaKey())) {
                throw new IllegalStateException(
                        "AreaOnboardingApplyService: candidate_id=" + row.id() + " batch_id=" + batchId
                                + " input_area_key=" + row.inputAreaKey()
                                + " is not a valid 4-segment key — aborting apply, no writes committed");
            }
            String recomputedNormalisedKey = AreaKeyFormat.normalise(row.inputAreaKey());
            if (!recomputedNormalisedKey.equals(row.normalisedAreaKey())) {
                throw new IllegalStateException(
                        "AreaOnboardingApplyService: candidate_id=" + row.id() + " batch_id=" + batchId
                                + " recomputed normalised_area_key=" + recomputedNormalisedKey
                                + " disagrees with staged normalised_area_key=" + row.normalisedAreaKey()
                                + " — aborting apply, no writes committed");
            }

            // FIX 3(f): matched_area_key, when present, must still be a well-formed 4-segment key.
            if (row.matchedAreaKey() != null && !AreaKeyFormat.isValidFourSegment(row.matchedAreaKey())) {
                throw new IllegalStateException(
                        "AreaOnboardingApplyService: candidate_id=" + row.id() + " batch_id=" + batchId
                                + " matched_area_key=" + row.matchedAreaKey()
                                + " is not a valid 4-segment key — aborting apply, no writes committed");
            }

            String targetAreaKey = row.matchedAreaKey() != null ? row.matchedAreaKey() : recomputedNormalisedKey;
            pending.add(new PendingCandidate(row, outcome, input, targetAreaKey));
        }

        // ── Phase 1b: lock every DISTINCT existing target area_key, ASCENDING order (#1887 rework
        // #4 BLOCKING 1/2) — a stable total lock order (batch row already locked first, above)
        // that avoids deadlock against another concurrent apply() over an overlapping area set, and
        // closes the Phase-1-to-Phase-2 TOCTOU gap: these locks are held through every Phase-2
        // write below, in the SAME transaction.
        List<String> distinctTargetKeys = pending.stream()
                .map(PendingCandidate::targetAreaKey)
                .distinct()
                .sorted()
                .toList();
        Map<String, ExistingAreaRow> lockedAreas = new LinkedHashMap<>();
        for (String targetKey : distinctTargetKeys) {
            ExistingAreaRow existing = findAreaByKeyForUpdate(targetKey);
            if (existing != null) {
                lockedAreas.put(targetKey, existing);
            }
        }

        // ── Phase 1c: outcome consistency, cross-city, and canonical-fingerprint-parity
        // verification against the LOCKED read — BEFORE any write.
        List<ApplicableCandidate> applicable = new ArrayList<>();
        for (PendingCandidate p : pending) {
            CandidateRow row = p.row();
            CandidateOutcome outcome = p.outcome();
            String targetAreaKey = p.targetAreaKey();
            ExistingAreaRow existing = lockedAreas.get(targetAreaKey);

            // FIX 3(e): a READY_TO_UPDATE/UNCHANGED candidate requires the target to still exist.
            if (MATCHED_OUTCOMES.contains(outcome) && existing == null) {
                throw new IllegalStateException(
                        "AreaOnboardingApplyService: candidate_id=" + row.id() + " batch_id=" + batchId
                                + " outcome=" + outcome + " expects an existing area at " + targetAreaKey
                                + " but none was found — stale outcome, aborting apply, no writes committed");
            }

            // FIX 3(g): reject any target area whose city differs from the batch's city.
            if (existing != null && existing.cityId() != batch.cityId()) {
                throw new IllegalStateException(
                        "AreaOnboardingApplyService: candidate_id=" + row.id() + " batch_id=" + batchId
                                + " target area_key=" + targetAreaKey + " has city_id=" + existing.cityId()
                                + " but batch city_id=" + batch.cityId()
                                + " — cross-city target, aborting apply, no writes committed");
            }

            // #1887 rework #4 BLOCKING 3: uniform sentinel-or-real fingerprint parity check, for
            // EVERY candidate family (previously FIX 7 only ran this for matched_area_key != null,
            // leaving CREATE-family candidates protected only by the (now-removed) "prior CREATE
            // audit row" tolerance — a real gap: an external edit/delete since a prior CREATE could
            // be silently reverted or masked on re-apply).
            String reviewedFingerprint = row.reviewedFingerprint();
            if (reviewedFingerprint == null) {
                throw new IllegalStateException(
                        "AreaOnboardingApplyService: candidate_id=" + row.id() + " batch_id=" + batchId
                                + " has a NULL reviewed_canonical_fingerprint — every approved clean-outcome "
                                + "candidate must be fingerprinted at review time; aborting apply defensively, "
                                + "no writes committed");
            }
            if (noExistingAreaFingerprint().equals(reviewedFingerprint)) {
                // Not yet materialized as of review time: the target key must STILL have no area.
                if (existing != null) {
                    throw new IllegalStateException(
                            "AreaOnboardingApplyService: candidate_id=" + row.id() + " batch_id=" + batchId
                                    + " outcome=" + outcome + " was reviewed as NOT YET MATERIALIZED (sentinel "
                                    + "fingerprint) but an area now exists at " + targetAreaKey
                                    + " — stale/conflicting outcome, aborting apply, no writes committed");
                }
            } else {
                // Already-materialized target (matched at review time, or self-healed after a prior
                // apply's CREATE): the target key must STILL exist with this EXACT fingerprint.
                if (existing == null) {
                    throw new IllegalStateException(
                            "AreaOnboardingApplyService: candidate_id=" + row.id() + " batch_id=" + batchId
                                    + " target area_key=" + targetAreaKey + " was reviewed against a real "
                                    + "canonical fingerprint but no area now exists there (external delete "
                                    + "since review/a prior apply?) — aborting apply, no writes committed");
                }
                String currentFingerprint = canonicalFingerprint(existing.areaKey(), existing.cityId(),
                        existing.name(), existing.district(), existing.geoCenterLat(), existing.geoCenterLon(),
                        existing.minLat(), existing.minLon(), existing.maxLat(), existing.maxLon(),
                        existing.geometrySource(), existing.lifecycleStatus());
                if (!currentFingerprint.equals(reviewedFingerprint)) {
                    throw new IllegalStateException(
                            "AreaOnboardingApplyService: candidate_id=" + row.id() + " batch_id=" + batchId
                                    + " target area_key=" + targetAreaKey
                                    + " canonical state has changed since review — requires a fresh dry-run + "
                                    + "review; aborting apply, no writes committed");
                }
            }

            applicable.add(new ApplicableCandidate(row, p.input(), targetAreaKey, existing));
        }

        // ── #1887 rework #4 THE CRUX: verify against whichever of the two frozen checksums this
        // apply call is for. apply_status read at the START of this call (before any Phase-2 write)
        // decides: NOT 'APPLIED' (first apply) compares to persisted_batch_checksum; 'APPLIED' (a
        // re-apply) compares to applied_batch_checksum. Still BEFORE any write, but after the
        // finer-grained per-candidate checks above so a single corrupted/stale candidate is reported
        // with that specific diagnosis rather than this coarser batch-level digest.
        boolean isReapply = "APPLIED".equals(batch.applyStatus());
        String recomputedChecksum = computePersistedBatchChecksum(batch, candidateRows);
        if (!isReapply) {
            if (batch.persistedBatchChecksum() == null
                    || !recomputedChecksum.equals(batch.persistedBatchChecksum())) {
                throw new IllegalStateException(
                        "AreaOnboardingApplyService: batch_id=" + batchId + " persisted_batch_checksum mismatch"
                                + " (recomputed=" + recomputedChecksum
                                + ", stored=" + batch.persistedBatchChecksum()
                                + ") — refusing to apply, no writes performed");
            }
        } else {
            if (batch.appliedBatchChecksum() == null
                    || !recomputedChecksum.equals(batch.appliedBatchChecksum())) {
                throw new IllegalStateException(
                        "AreaOnboardingApplyService: batch_id=" + batchId + " applied_batch_checksum mismatch"
                                + " (recomputed=" + recomputedChecksum
                                + ", stored=" + batch.appliedBatchChecksum()
                                + ") — refusing to re-apply, no writes performed");
            }
        }

        // ── Phase 2: apply every verified candidate.
        int created = 0;
        int updated = 0;
        int unchanged = 0;
        int geometryPreserved = 0;
        int auditRows = 0;
        Set<String> changedAreaKeys = new LinkedHashSet<>();

        for (ApplicableCandidate candidate : applicable) {
            CandidateRow row = candidate.row();
            AreaOnboardingService.CandidateInput input = candidate.input();
            String targetAreaKey = candidate.targetAreaKey();
            String district = districtFromNormalisedKey(row.normalisedAreaKey());

            if (candidate.existing() == null) {
                boolean auditInserted = createArea(batch, row, input, targetAreaKey, district, appliedBy);
                created++;
                if (auditInserted) {
                    auditRows++;
                }
                changedAreaKeys.add(targetAreaKey);
            } else {
                UpdateOutcome outcome =
                        updateAreaIfChanged(batch, row, input, candidate.existing(), district, appliedBy);
                if (outcome.changed()) {
                    updated++;
                    if (outcome.updateAuditInserted()) {
                        auditRows++;
                    }
                    changedAreaKeys.add(targetAreaKey);
                } else {
                    unchanged++;
                }
                if (outcome.geometryPreserved()) {
                    geometryPreserved++;
                    if (outcome.geometryAuditInserted()) {
                        auditRows++;
                    }
                }
            }
        }

        // ── #1887 rework #4 THE CRUX: store applied_batch_checksum EXACTLY ONCE, on the FIRST
        // successful apply only, AFTER Phase 2's writes (incl. CREATE-family self-heal) settle.
        // persisted_batch_checksum is NEVER touched here — it stays byte-identical to what
        // review-finalisation stored, forever. A re-apply (isReapply == true) does not re-store
        // anything: applied_batch_checksum is equally frozen after its one write.
        if (!isReapply) {
            List<CandidateRow> settledCandidateRows = loadCandidates(batchId);
            String settledChecksum = computePersistedBatchChecksum(batch, settledCandidateRows);
            int rows = jdbcOperations.update(STORE_APPLIED_BATCH_CHECKSUM_SQL, settledChecksum, batchId);
            if (rows != 1) {
                throw new IllegalStateException(
                        "AreaOnboardingApplyService: batch_id=" + batchId
                                + " failed to store applied_batch_checksum exactly once (expected to affect "
                                + "1 row, affected " + rows + ") — the batch may have already been applied "
                                + "concurrently; aborting");
            }
        }

        int outboxEnqueued = 0;
        if (!changedAreaKeys.isEmpty()) {
            boolean inserted = outboxDao.enqueue(batch.cityId(), batchId, changedAreaKeys,
                    "AreaOnboardingApplyService.apply created/updated " + changedAreaKeys.size() + " area(s)");
            if (inserted) {
                outboxEnqueued = 1;
                boolean auditInserted = auditDao.record(batchId, null, null, ApplyAction.REGION_RECLASS_ENQUEUED,
                        null, new OutboxAuditPayload(batch.cityId(), changedAreaKeys),
                        "durable region-reclassification signal for a future #1882 consumer "
                                + "(never invoked synchronously from this transaction)",
                        appliedBy);
                if (auditInserted) {
                    auditRows++;
                }
            }
        }

        markApplied(batchId, appliedBy);

        log.info("AreaOnboardingApplyService: apply batchId={} cityId={} created={} updated={} unchanged={} "
                        + "geometryPreserved={} auditRows={} outboxEnqueued={} skippedNotApproved={}",
                batchId, batch.cityId(), created, updated, unchanged, geometryPreserved, auditRows, outboxEnqueued,
                skippedNotApproved);

        return new ApplyReport(batchId, created, updated, unchanged, geometryPreserved,
                auditRows, outboxEnqueued, skippedNotApproved);
    }

    // ── Per-candidate apply logic ────────────────────────────────────────────

    private boolean createArea(
            BatchRow batch, CandidateRow row, AreaOnboardingService.CandidateInput input,
            String areaKey, String district, String appliedBy) {
        // #1887 rework #4 BLOCKING 2: ON CONFLICT DO NOTHING + assert exactly 1 row inserted — a
        // concurrent transaction creating the SAME key first (impossible to prove "ours") aborts
        // the WHOLE apply rather than silently no-op'ing or double-writing.
        int inserted = jdbcOperations.update(INSERT_AREA_SQL,
                areaKey, batch.cityId(), input.name(), district,
                input.geoCenterLat(), input.geoCenterLon(),
                input.minLat(), input.minLon(), input.maxLat(), input.maxLon(),
                input.geometrySource(), AreaLifecycleStatus.ACTIVE.name());
        if (inserted != 1) {
            throw new IllegalStateException(
                    "AreaOnboardingApplyService: candidate_id=" + row.id() + " batch_id=" + batch.id()
                            + " INSERT INTO areas at area_key=" + areaKey + " affected " + inserted
                            + " row(s) (expected 1) — a concurrent process created this key first; aborting "
                            + "the WHOLE apply, no writes committed");
        }

        // #1887 rework #4 BLOCKING 3 self-heal: replace the sentinel reviewed_canonical_fingerprint
        // with a REAL fingerprint of the just-created area, in the SAME transaction — mirrors the
        // self-heal updateAreaIfChanged already performs for UPDATE-family candidates, so a later
        // re-apply of this SAME batch verifies against the actual materialized state.
        String selfHealedFingerprint = canonicalFingerprint(areaKey, batch.cityId(), input.name(), district,
                input.geoCenterLat(), input.geoCenterLon(), input.minLat(), input.minLon(),
                input.maxLat(), input.maxLon(), input.geometrySource(), AreaLifecycleStatus.ACTIVE.name());
        jdbcOperations.update(SELF_HEAL_FINGERPRINT_SQL, selfHealedFingerprint, row.id());

        AreaSnapshotWithProvenance after = new AreaSnapshotWithProvenance(areaKey, input.name(), district,
                input.geoCenterLat(), input.geoCenterLon(), input.minLat(), input.minLon(),
                input.maxLat(), input.maxLon(), input.geometrySource(), AreaLifecycleStatus.ACTIVE.name(),
                batch.provider(), row.externalSourceId());
        return auditDao.record(batch.id(), row.id(), areaKey, ApplyAction.CREATE_AREA,
                null, after, "new canonical area created from candidate_payload", appliedBy);
    }

    /**
     * Compares the candidate's reconstructed values against the CURRENT stored area row and
     * writes only what actually differs (design decision D6). Geometry columns are gated by the
     * {@link GeometryTrust} rank guard (D4); name/district are always eligible for update
     * regardless of geometry trust.
     */
    private UpdateOutcome updateAreaIfChanged(
            BatchRow batch, CandidateRow row, AreaOnboardingService.CandidateInput input,
            ExistingAreaRow existing, String district, String appliedBy) {

        GeometryTrust existingTrust = GeometryTrust.classify(existing.geometrySource(),
                existing.geoCenterLat(), existing.geoCenterLon(),
                existing.minLat(), existing.minLon(), existing.maxLat(), existing.maxLon());
        GeometryTrust candidateTrust = GeometryTrust.classify(input.geometrySource(),
                input.geoCenterLat(), input.geoCenterLon(),
                input.minLat(), input.minLon(), input.maxLat(), input.maxLon());

        boolean geometryDiffers = !numEquals(existing.geoCenterLat(), input.geoCenterLat())
                || !numEquals(existing.geoCenterLon(), input.geoCenterLon())
                || !numEquals(existing.minLat(), input.minLat())
                || !numEquals(existing.minLon(), input.minLon())
                || !numEquals(existing.maxLat(), input.maxLat())
                || !numEquals(existing.maxLon(), input.maxLon())
                || !Objects.equals(existing.geometrySource(), input.geometrySource());

        boolean geometryRankAllows = rank(candidateTrust) >= rank(existingTrust);
        boolean writeGeometry = geometryDiffers && geometryRankAllows;
        boolean geometryPreserved = geometryDiffers && !geometryRankAllows;

        boolean nameChanged = !Objects.equals(existing.name(), input.name());
        boolean districtChanged = !Objects.equals(existing.district(), district);
        boolean changed = nameChanged || districtChanged || writeGeometry;

        boolean updateAuditInserted = false;
        if (changed) {
            Double outLat = writeGeometry ? input.geoCenterLat() : existing.geoCenterLat();
            Double outLon = writeGeometry ? input.geoCenterLon() : existing.geoCenterLon();
            Double outMinLat = writeGeometry ? input.minLat() : existing.minLat();
            Double outMinLon = writeGeometry ? input.minLon() : existing.minLon();
            Double outMaxLat = writeGeometry ? input.maxLat() : existing.maxLat();
            Double outMaxLon = writeGeometry ? input.maxLon() : existing.maxLon();
            String outGeometrySource = writeGeometry ? input.geometrySource() : existing.geometrySource();

            // Always WHERE area_key = existing.areaKey() — the matched key from the staging row.
            // This UPDATE never re-keys an area (#1887 risk R6, AC3). #1887 rework #4 BLOCKING 2:
            // assert exactly 1 row affected — the row is already FOR-UPDATE-locked from Phase 1b,
            // so this is a defensive second layer, not the primary concurrency guard.
            int updatedRows = jdbcOperations.update(UPDATE_AREA_SQL,
                    input.name(), district, outLat, outLon, outMinLat, outMinLon, outMaxLat, outMaxLon,
                    outGeometrySource, existing.areaKey());
            if (updatedRows != 1) {
                throw new IllegalStateException(
                        "AreaOnboardingApplyService: candidate_id=" + row.id() + " batch_id=" + batch.id()
                                + " UPDATE areas at area_key=" + existing.areaKey() + " affected " + updatedRows
                                + " row(s) (expected 1) — aborting the WHOLE apply, no writes committed");
            }

            // FIX 7 self-heal: this write just moved the canonical target AWAY from the state
            // reviewedFingerprint was captured against — re-fingerprint it against the state THIS
            // apply just established, in the SAME transaction, so a later idempotent re-apply of
            // this SAME batch (AC4/FIX2) doesn't spuriously read this as external drift. A
            // genuinely different actor changing the area again afterwards is still caught next
            // apply, since the stored fingerprint always reflects only this candidate's own last
            // successful write.
            String selfHealedFingerprint = canonicalFingerprint(existing.areaKey(), existing.cityId(),
                    input.name(), district, outLat, outLon, outMinLat, outMinLon, outMaxLat, outMaxLon,
                    outGeometrySource, existing.lifecycleStatus());
            jdbcOperations.update(SELF_HEAL_FINGERPRINT_SQL, selfHealedFingerprint, row.id());

            AreaSnapshot before = snapshotOf(existing);
            AreaSnapshotWithProvenance after = new AreaSnapshotWithProvenance(existing.areaKey(), input.name(),
                    district, outLat, outLon, outMinLat, outMinLon, outMaxLat, outMaxLon, outGeometrySource, null,
                    batch.provider(), row.externalSourceId());
            updateAuditInserted = auditDao.record(batch.id(), row.id(), existing.areaKey(), ApplyAction.UPDATE_AREA,
                    before, after, "candidate fields differ from existing area", appliedBy);
        }

        boolean geometryAuditInserted = false;
        if (geometryPreserved) {
            AreaSnapshot preservedBefore = snapshotOf(existing);
            AreaSnapshotWithProvenance rejectedCandidate = new AreaSnapshotWithProvenance(existing.areaKey(),
                    input.name(), district, input.geoCenterLat(), input.geoCenterLon(), input.minLat(),
                    input.minLon(), input.maxLat(), input.maxLon(), input.geometrySource(), null,
                    batch.provider(), row.externalSourceId());
            geometryAuditInserted = auditDao.record(batch.id(), row.id(), existing.areaKey(),
                    ApplyAction.GEOMETRY_PRESERVED, preservedBefore, rejectedCandidate,
                    "candidateTrust=" + candidateTrust + " rank=" + rank(candidateTrust)
                            + " < existingTrust=" + existingTrust + " rank=" + rank(existingTrust)
                            + " — existing geometry preserved, candidate geometry rejected",
                    appliedBy);
        }

        return new UpdateOutcome(changed, updateAuditInserted, geometryPreserved, geometryAuditInserted);
    }

    // ── Reads ─────────────────────────────────────────────────────────────────

    private BatchRow loadBatchForUpdate(long batchId) {
        return jdbcOperations.query(SELECT_BATCH_FOR_UPDATE_SQL, rs -> rs.next()
                ? new BatchRow(rs.getLong("id"), rs.getInt("city_id"), rs.getBoolean("apply_allowed"),
                        rs.getString("dataset_id"), rs.getString("dataset_version"),
                        rs.getString("artifact_checksum"), rs.getString("provider"),
                        rs.getString("input_schema_version"),
                        rs.getObject("source_extracted_at", OffsetDateTime.class),
                        rs.getString("review_status"), rs.getString("persisted_batch_checksum"),
                        rs.getString("applied_batch_checksum"), rs.getString("apply_status"))
                : null, batchId);
    }

    private List<CandidateRow> loadCandidates(long batchId) {
        return jdbcOperations.query(SELECT_CANDIDATES_SQL,
                (rs, rowNum) -> new CandidateRow(
                        rs.getLong("id"), rs.getString("input_area_key"), rs.getString("normalised_area_key"),
                        rs.getString("matched_area_key"), rs.getString("outcome"), rs.getString("review_decision"),
                        rs.getString("payload_text"), rs.getString("payload_checksum"),
                        rs.getString("external_source_id"), rs.getString("reviewed_canonical_fingerprint")),
                batchId);
    }

    private ExistingAreaRow findAreaByKeyForUpdate(String areaKey) {
        return jdbcOperations.query(SELECT_AREA_BY_KEY_FOR_UPDATE_SQL, rs -> rs.next()
                ? new ExistingAreaRow(rs.getString("area_key"), rs.getInt("city_id"), rs.getString("name"),
                        rs.getString("district"),
                        nullableDouble(rs.getObject("geo_center_lat")), nullableDouble(rs.getObject("geo_center_lon")),
                        nullableDouble(rs.getObject("min_lat")), nullableDouble(rs.getObject("min_lon")),
                        nullableDouble(rs.getObject("max_lat")), nullableDouble(rs.getObject("max_lon")),
                        rs.getString("geometry_source"), rs.getString("lifecycle_status"))
                : null, areaKey);
    }

    private void markApplied(long batchId, String appliedBy) {
        jdbcOperations.update(MARK_APPLIED_SQL, appliedBy, batchId);
    }

    private AreaOnboardingService.CandidateInput deserialize(String payloadJson) {
        try {
            return objectMapper.readValue(payloadJson, AreaOnboardingService.CandidateInput.class);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to deserialize candidate_payload", e);
        }
    }

    // ── FIX 4: dataset identity + artifact-checksum verification ───────────────

    private void validateDatasetIdentity(BatchRow batch) {
        List<String> problems = new ArrayList<>();
        if (isBlank(batch.datasetId())) {
            problems.add("dataset_id");
        }
        if (isBlank(batch.datasetVersion())) {
            problems.add("dataset_version");
        }
        // #1887 rework #3: artifact_checksum's VALUE is still never read/compared as a digest input
        // anywhere (it is the provider/curator-supplied source-artifact checksum PR1's dry-run
        // writes verbatim; PR2 never recomputes or validates it). This is purely a "must be
        // present" completeness check, alongside the other production dataset identity columns —
        // apply() should refuse a batch missing ANY piece of its production source provenance.
        // persisted_batch_checksum/applied_batch_checksum (distinct columns, and NOT the same thing
        // as artifact_checksum) are verified separately, later in apply().
        if (isBlank(batch.artifactChecksum())) {
            problems.add("artifact_checksum");
        }
        if (isBlank(batch.provider())) {
            problems.add("provider");
        }
        if (isBlank(batch.inputSchemaVersion()) || !SUPPORTED_INPUT_SCHEMA_VERSIONS.contains(batch.inputSchemaVersion())) {
            problems.add("input_schema_version");
        }
        if (batch.sourceExtractedAt() == null) {
            problems.add("source_extracted_at");
        }
        if (!problems.isEmpty()) {
            throw new IllegalStateException(
                    "AreaOnboardingApplyService: batch_id=" + batch.id()
                            + " missing/unsupported production dataset identity: " + problems
                            + " — refusing to apply, no writes performed");
        }
    }

    /**
     * Deterministically recomputes the checksum digest — persisted or applied, both share this
     * ONE algorithm — over PERSISTED rows ONLY: EVERY batch-level identity field plus EVERY
     * apply-driving and audit/provenance field of every candidate (ordered by id) — NEVER by
     * rereading an external/classpath file (#1887 rework FIX 4, split into 4a/4b by rework #2,
     * per-candidate field set WIDENED by rework #3, batch-level fields + {@code apply_allowed}
     * ADDED by rework #4 REQUIRED fix). Package-private static so both {@link
     * AreaOnboardingApplyService#apply} and {@link AreaOnboardingReviewService#approve} compute the
     * SAME digest, and for direct unit testing.
     *
     * <p>#1887 rework #4 (REQUIRED: batch-metadata injective encoding + apply_allowed): every
     * batch-level field ({@code id}, {@code cityId}, {@code datasetId}, {@code datasetVersion},
     * {@code provider}, {@code inputSchemaVersion}, {@code sourceExtractedAt}, and now {@code
     * applyAllowed}) is routed through the SAME length-prefixed {@link #appendField} encoding the
     * per-candidate fields already used — previously these were plain {@code ";key=value"}
     * concatenation, which (being unconstrained free-text columns) could let a crafted value in one
     * field shift the apparent boundary of an adjacent field and collide. {@code apply_allowed} is
     * now covered because it directly gates whether apply may proceed at all.
     *
     * <p>#1887 rework #3: the per-candidate digest input covers {@code id}, {@code
     * input_area_key}, {@code normalised_area_key}, {@code matched_area_key}, {@code outcome},
     * {@code review_decision}, {@code candidate_payload} (as text), {@code payload_checksum},
     * {@code external_source_id}, and {@code reviewed_canonical_fingerprint} — i.e. every field
     * {@link #apply} actually gates its decisions on. Each field (batch-level and per-candidate) is
     * appended via {@link #appendField}, a length-prefixed, null-distinguishing encoding — so no
     * field's own content (including arbitrary JSON in {@code candidate_payload}) can be mistaken
     * for a delimiter and mask a change in an adjacent field; changing any ONE field always changes
     * the resulting digest.
     *
     * <p>Deliberately does NOT read {@link BatchRow#artifactChecksum()} — that field is unrelated
     * provenance metadata, not an input to this digest (it is instead required merely to be
     * non-blank by {@link #validateDatasetIdentity}). Also does NOT read {@code reviewStatus},
     * {@code persistedBatchChecksum}, {@code appliedBatchChecksum}, or {@code applyStatus} — those
     * are the checksum bookkeeping columns THEMSELVES, not inputs to the algorithm that produces them.
     */
    static String computePersistedBatchChecksum(BatchRow batch, List<CandidateRow> candidates) {
        StringBuilder raw = new StringBuilder();
        raw.append("batch={");
        appendField(raw, Long.toString(batch.id()));
        appendField(raw, Integer.toString(batch.cityId()));
        appendField(raw, batch.datasetId());
        appendField(raw, batch.datasetVersion());
        appendField(raw, batch.provider());
        appendField(raw, batch.inputSchemaVersion());
        appendField(raw, batch.sourceExtractedAt() == null ? null : batch.sourceExtractedAt().toString());
        appendField(raw, Boolean.toString(batch.applyAllowed()));
        raw.append("};candidates=[");
        for (CandidateRow candidate : candidates) {
            raw.append('{');
            appendField(raw, Long.toString(candidate.id()));
            appendField(raw, candidate.inputAreaKey());
            appendField(raw, candidate.normalisedAreaKey());
            appendField(raw, candidate.matchedAreaKey());
            appendField(raw, candidate.outcome());
            appendField(raw, candidate.reviewDecision());
            appendField(raw, candidate.payloadText());
            appendField(raw, candidate.payloadChecksum());
            appendField(raw, candidate.externalSourceId());
            appendField(raw, candidate.reviewedFingerprint());
            raw.append('}');
        }
        raw.append(']');
        return sha256Hex(raw.toString());
    }

    /**
     * Length-prefixed, null-distinguishing field encoding used by {@link
     * #computePersistedBatchChecksum} so the digest is injective over the FULL field tuple —
     * batch-level (#1887 rework #4 REQUIRED fix) and per-candidate (#1887 rework #3): appends the
     * literal {@code "N;"} for a {@code null} value, else the value's UTF-16 char length,
     * {@code ':'}, the raw value, then {@code ';'}. Because the exact length is recorded up front,
     * no character the value itself contains (including {@code ':'}, {@code ';'}, or a JSON blob's
     * own braces/commas) can be misread as a field boundary — reading the declared length always
     * lands exactly at the true end of that field. This guarantees that changing any ONE field's
     * value changes the resulting encoded stream (and therefore the digest), even when adjacent
     * fields are free-text and could otherwise collide under a plain delimiter-only scheme.
     */
    private static void appendField(StringBuilder sb, String value) {
        if (value == null) {
            sb.append("N;");
        } else {
            sb.append(value.length()).append(':').append(value).append(';');
        }
    }

    /**
     * Test-support helper: recomputes the SAME deterministic checksum digest {@link #apply}
     * verifies, from the CURRENTLY PERSISTED batch + candidate rows for {@code batchId} — read-only,
     * does NOT store anything. Lets a test assert on the digest's determinism without duplicating
     * this class's checksum algorithm (#1887 rework FIX 4b). The REAL production write path for
     * {@code persisted_batch_checksum} is {@link AreaOnboardingReviewService#approve}, which stores
     * this same digest at review-finalisation time; for {@code applied_batch_checksum} it is this
     * class's own {@link #apply}. This helper is never used to seed/force a value.
     */
    String recomputePersistedBatchChecksumFromPersisted(long batchId) {
        BatchRow batch = loadBatchForUpdate(batchId);
        if (batch == null) {
            throw new IllegalArgumentException(
                    "AreaOnboardingApplyService: no area_onboarding_batch row for id=" + batchId);
        }
        return computePersistedBatchChecksum(batch, loadCandidates(batchId));
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    // ── FIX 7: canonical-target fingerprint (shared with AreaOnboardingReviewService) ──────────

    /**
     * sha256 fingerprint of a canonical area's identity-bearing fields, captured at review time by
     * {@link AreaOnboardingReviewService#approve} and re-verified at apply time by {@link #apply}
     * (#1887 rework FIX 7). Package-private static so both services use the SAME definition.
     */
    static String canonicalFingerprint(
            String areaKey, int cityId, String name, String district,
            Double geoCenterLat, Double geoCenterLon,
            Double minLat, Double minLon, Double maxLat, Double maxLon,
            String geometrySource, String lifecycleStatus) {
        String raw = "areaKey=" + areaKey
                + ";cityId=" + cityId
                + ";name=" + name
                + ";district=" + district
                + ";geoCenterLat=" + geoCenterLat
                + ";geoCenterLon=" + geoCenterLon
                + ";minLat=" + minLat
                + ";minLon=" + minLon
                + ";maxLat=" + maxLat
                + ";maxLon=" + maxLon
                + ";geometrySource=" + geometrySource
                + ";lifecycleStatus=" + lifecycleStatus;
        return sha256Hex(raw);
    }

    /** Package-private static so both services fingerprint "no existing area" identically. */
    static String noExistingAreaFingerprint() {
        return sha256Hex(NO_EXISTING_AREA_SENTINEL);
    }

    // ── Pure helpers (package-private static for direct unit testing) ──────────

    /** Segment 2 of a normalised 4-segment area_key (e.g. "Bengaluru" from "IN|KA|Bengaluru|Whitefield"). */
    static String districtFromNormalisedKey(String normalisedAreaKey) {
        if (normalisedAreaKey == null) {
            return null;
        }
        String[] segments = normalisedAreaKey.split("\\|", -1);
        return segments.length >= 3 ? segments[2] : null;
    }

    static int rank(GeometryTrust trust) {
        return switch (trust) {
            case VERIFIED -> 3;
            case PROVISIONAL -> 2;
            case MISSING -> 1;
        };
    }

    static boolean numEquals(Double a, Double b) {
        if (a == null || b == null) {
            return a == null && b == null;
        }
        return Math.abs(a - b) < 1e-9;
    }

    /**
     * sha256 hex digest, duplicated (not shared) from {@link AreaOnboardingService}'s identical
     * private helper — mirrors the same duplication already present between
     * {@code AreaOnboardingService} and {@code CityRegionOnboardingService} rather than
     * introducing a new shared utility class outside this PR's allowed file set.
     */
    static String sha256Hex(String value) {
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

    private static AreaSnapshot snapshotOf(ExistingAreaRow row) {
        return new AreaSnapshot(row.areaKey(), row.name(), row.district(),
                row.geoCenterLat(), row.geoCenterLon(), row.minLat(), row.minLon(),
                row.maxLat(), row.maxLon(), row.geometrySource(), null);
    }

    // ── Row / snapshot types ─────────────────────────────────────────────────

    record BatchRow(
            long id, int cityId, boolean applyAllowed,
            String datasetId, String datasetVersion, String artifactChecksum, String provider,
            String inputSchemaVersion, OffsetDateTime sourceExtractedAt,
            String reviewStatus, String persistedBatchChecksum, String appliedBatchChecksum,
            String applyStatus) {}

    record CandidateRow(
            long id, String inputAreaKey, String normalisedAreaKey, String matchedAreaKey,
            String outcome, String reviewDecision, String payloadText, String payloadChecksum,
            String externalSourceId, String reviewedFingerprint) {}

    private record ExistingAreaRow(
            String areaKey, int cityId, String name, String district,
            Double geoCenterLat, Double geoCenterLon,
            Double minLat, Double minLon, Double maxLat, Double maxLon,
            String geometrySource, String lifecycleStatus) {}

    /** #1887 rework #4: the outcome of Phase 1a's local-only validation, before any `areas` read. */
    private record PendingCandidate(
            CandidateRow row, CandidateOutcome outcome, AreaOnboardingService.CandidateInput input,
            String targetAreaKey) {}

    private record ApplicableCandidate(
            CandidateRow row, AreaOnboardingService.CandidateInput input,
            String targetAreaKey, ExistingAreaRow existing) {}

    private record UpdateOutcome(
            boolean changed, boolean updateAuditInserted,
            boolean geometryPreserved, boolean geometryAuditInserted) {}

    /** Audit before/after snapshot — deliberately mirrors areas' own column shape for readability. */
    private record AreaSnapshot(
            String areaKey, String name, String district,
            Double geoCenterLat, Double geoCenterLon,
            Double minLat, Double minLon, Double maxLat, Double maxLon,
            String geometrySource, String lifecycleStatus) {}

    /**
     * Same shape as {@link AreaSnapshot} plus source provenance (#1887 rework FIX 6) — used for
     * candidate-derived "after" audit payloads only (never for a plain "before" existing-area
     * snapshot, which has no candidate provenance of its own).
     */
    private record AreaSnapshotWithProvenance(
            String areaKey, String name, String district,
            Double geoCenterLat, Double geoCenterLon,
            Double minLat, Double minLon, Double maxLat, Double maxLon,
            String geometrySource, String lifecycleStatus,
            String provider, String externalSourceId) {}

    private record OutboxAuditPayload(int cityId, Set<String> affectedAreaKeys) {}

    // ── SQL ───────────────────────────────────────────────────────────────────

    private static final String SELECT_BATCH_FOR_UPDATE_SQL = """
            SELECT id, city_id, apply_allowed, dataset_id, dataset_version, artifact_checksum, provider,
                   input_schema_version, source_extracted_at, review_status, persisted_batch_checksum,
                   applied_batch_checksum, apply_status
            FROM area_onboarding_batch WHERE id = ? FOR UPDATE
            """;

    private static final String SELECT_CANDIDATES_SQL = """
            SELECT id, input_area_key, normalised_area_key, matched_area_key, outcome, review_decision,
                   candidate_payload::text AS payload_text, payload_checksum, external_source_id,
                   reviewed_canonical_fingerprint
            FROM area_onboarding_candidate
            WHERE batch_id = ?
            ORDER BY id
            """;

    private static final String SELECT_AREA_BY_KEY_FOR_UPDATE_SQL = """
            SELECT area_key, city_id, name, district, geo_center_lat, geo_center_lon,
                   min_lat, min_lon, max_lat, max_lon, geometry_source, lifecycle_status
            FROM areas WHERE area_key = ? FOR UPDATE
            """;

    private static final String INSERT_AREA_SQL = """
            INSERT INTO areas
                (area_key, city_id, name, district, geo_center_lat, geo_center_lon,
                 min_lat, min_lon, max_lat, max_lon, geometry_source, lifecycle_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (area_key) DO NOTHING
            """;

    private static final String UPDATE_AREA_SQL = """
            UPDATE areas
            SET name = ?, district = ?, geo_center_lat = ?, geo_center_lon = ?,
                min_lat = ?, min_lon = ?, max_lat = ?, max_lon = ?, geometry_source = ?
            WHERE area_key = ?
            """;

    private static final String MARK_APPLIED_SQL =
            "UPDATE area_onboarding_batch SET apply_status = 'APPLIED', applied_at = now(), applied_by = ? WHERE id = ?";

    /** #1887 rework FIX 7 self-heal — see the comment at its call sites in {@code createArea}/{@code updateAreaIfChanged}. */
    private static final String SELF_HEAL_FINGERPRINT_SQL =
            "UPDATE area_onboarding_candidate SET reviewed_canonical_fingerprint = ? WHERE id = ?";

    /**
     * #1887 rework #4 THE CRUX: stores applied_batch_checksum EXACTLY ONCE — guarded by {@code
     * applied_batch_checksum IS NULL} so this can never overwrite a value a prior apply already
     * stored; see the comment at its call site in {@code apply}.
     */
    private static final String STORE_APPLIED_BATCH_CHECKSUM_SQL =
            "UPDATE area_onboarding_batch SET applied_batch_checksum = ? WHERE id = ? AND applied_batch_checksum IS NULL";
}

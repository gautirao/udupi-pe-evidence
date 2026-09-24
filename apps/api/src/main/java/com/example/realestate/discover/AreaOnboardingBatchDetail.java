package com.example.realestate.discover;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Read-only projection of one {@code area_onboarding_batch} row plus its candidates, returned by
 * {@link AreaOnboardingBatchQuery} for the #2676 Slice B1b admin {@code GET .../batches/{id}}
 * endpoint.
 *
 * <p>Deliberately mirrors {@link AreaOnboardingReport}'s field-shape convention rather than
 * introducing a new one, but with two differences forced by this being a post-hoc admin read
 * (not a dry-run preview): each candidate carries its own {@code candidateId} (the dry-run
 * report never needed per-row identity), and {@code outcome}/{@code reviewDecision}/
 * {@code geometryTrust} are returned as the raw persisted strings rather than re-parsed into
 * their enums, so an admin GET can never fail on a value written by a future, wider vocabulary
 * than this class knows about.
 *
 * <p><b>Never includes {@code candidate_payload} or {@code payload_checksum}.</b> Those columns
 * hold the raw staged candidate JSON and are intentionally excluded from every field here — this
 * is a security constraint (#2676 B1b HIGH review), not an oversight; the columns are not
 * summarised or truncated onto any field, they are simply never read by
 * {@link AreaOnboardingBatchQuery}'s candidate SELECT.
 *
 * @param batchId           the persisted {@code area_onboarding_batch.id}
 * @param cityId            the target city's integer id
 * @param datasetId         operator-supplied dataset identifier for this batch
 * @param datasetVersion    operator-supplied dataset version for this batch
 * @param provider          operator-supplied source provider label
 * @param sourceExtractedAt when the source dataset was extracted, per the batch's own record
 * @param applyAllowed      dry-run-time signal; see {@link AreaOnboardingReport#applyAllowed()}
 * @param blockingReasons   the persisted {@code blocking_reasons} column, split on {@code "; "}
 *                          (empty when {@code applyAllowed} is {@code true}); see
 *                          {@link AreaOnboardingReport#blockingReasons()} for how these are produced
 * @param reviewStatus      current review lifecycle state (e.g. {@code PENDING}, {@code FINALIZED})
 * @param applyStatus       current apply lifecycle state
 * @param candidates        one summary per candidate row in the batch, in id order
 */
record AreaOnboardingBatchDetail(
        long batchId,
        int cityId,
        String datasetId,
        String datasetVersion,
        String provider,
        OffsetDateTime sourceExtractedAt,
        boolean applyAllowed,
        List<String> blockingReasons,
        String reviewStatus,
        String applyStatus,
        List<CandidateSummary> candidates
) {

    /**
     * @param candidateId       the persisted {@code area_onboarding_candidate.id}
     * @param inputAreaKey      the area_key exactly as submitted by the operator/source
     * @param normalisedAreaKey {@link AreaKeyFormat#normalise} applied to inputAreaKey
     * @param matchedAreaKey    the existing {@code areas.area_key} this candidate matches, or {@code null}
     * @param outcome           the persisted {@code outcome} column, verbatim (see class javadoc)
     * @param reviewDecision    the persisted {@code review_decision} column, verbatim
     * @param conflictTypes     the persisted {@code conflict_types} column, split on comma
     * @param geometryTrust     the persisted {@code geometry_trust} column, verbatim
     * @param externalSourceId  operator-supplied external identifier, if any (nullable)
     */
    record CandidateSummary(
            long candidateId,
            String inputAreaKey,
            String normalisedAreaKey,
            String matchedAreaKey,
            String outcome,
            String reviewDecision,
            List<String> conflictTypes,
            String geometryTrust,
            String externalSourceId
    ) {}
}

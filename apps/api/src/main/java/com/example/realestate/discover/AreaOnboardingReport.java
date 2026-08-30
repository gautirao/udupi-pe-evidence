package com.example.realestate.discover;

import java.util.List;
import java.util.Map;

/**
 * Result of {@link AreaOnboardingService#dryRun} (#1887 PR1) — a READ-ONLY preview of how a
 * batch of candidate areas would classify. {@code batchId}/candidate rows ARE persisted to the
 * {@code area_onboarding_batch}/{@code area_onboarding_candidate} STAGING tables (that is the
 * whole point of the dry run: an auditable, re-viewable batch) but nothing in canonical
 * {@code areas}/{@code area_alias}/{@code city_regions}/{@code city_region_memberships}/
 * {@code regional_area_overrides} is ever written by this flow (see
 * AreaOnboardingDryRunSafetyIT).
 *
 * <p>There is no {@code apply()} in PR1 (see design decision D6) — {@link #applyAllowed()} is a
 * signal for a human reviewer, not an enforcement gate. It is {@code false} whenever any
 * candidate's outcome is not one of the three "clean" outcomes ({@code READY_TO_CREATE},
 * {@code READY_TO_UPDATE}, {@code UNCHANGED}), i.e. whenever a candidate needs a human decision.
 *
 * @param batchId          the persisted {@code area_onboarding_batch.id} for this run
 * @param cityId            the target city's integer id
 * @param citySlug          resolved city slug, or {@code null} if the city id doesn't exist
 * @param sourceLabel       operator-supplied label describing where this candidate batch came from
 * @param candidates        one projection per submitted candidate, in submission order
 * @param outcomeCounts     count of candidates per {@link CandidateOutcome}
 * @param applyAllowed      false when any candidate needs human review (see class javadoc)
 * @param blockingReasons   human-readable reasons, one or more per blocking candidate
 */
record AreaOnboardingReport(
        long batchId,
        int cityId,
        String citySlug,
        String sourceLabel,
        List<CandidateProjection> candidates,
        Map<CandidateOutcome, Integer> outcomeCounts,
        boolean applyAllowed,
        List<String> blockingReasons
) {

    /**
     * @param inputAreaKey      the area_key exactly as submitted by the operator/source
     * @param normalisedAreaKey {@link AreaKeyFormat#normalise} applied to inputAreaKey, or the raw
     *                          input unchanged when it fails {@link AreaKeyFormat#isValidFourSegment}
     * @param matchedAreaKey    the existing {@code areas.area_key} this candidate matches within the
     *                          SAME city, or {@code null} if none — deliberately a plain string, not a
     *                          foreign key, so READY_TO_CREATE staging rows are never rejected (D2)
     * @param outcome           this candidate's single classification outcome
     * @param conflicts         zero or more duplicate/conflict signals raised for this candidate
     * @param geometryTrust     computed only from this candidate's own geometry columns, never listings
     * @param externalSourceId  operator-supplied external identifier, if any (nullable)
     */
    record CandidateProjection(
            String inputAreaKey,
            String normalisedAreaKey,
            String matchedAreaKey,
            CandidateOutcome outcome,
            List<ConflictType> conflicts,
            GeometryTrust geometryTrust,
            String externalSourceId
    ) {}
}

package com.example.realestate.discover;

/**
 * Classification outcome for one candidate area in an {@link AreaOnboardingService#dryRun}
 * batch (#1887 PR1). Every candidate is assigned exactly one outcome.
 *
 * <p>Only {@link #READY_TO_CREATE}, {@link #READY_TO_UPDATE}, and {@link #UNCHANGED} are
 * "clean" outcomes; every other value means the candidate needs a human decision before any
 * future apply step (PR2) could act on it. See {@link AreaOnboardingReport#applyAllowed()}.
 */
public enum CandidateOutcome {
    /** Normalised key has no existing match; geometry/city checks pass — safe to create. */
    READY_TO_CREATE,
    /** Matches an existing area by canonical key, and at least one field differs from it. */
    READY_TO_UPDATE,
    /** Matches an existing area by canonical key, and every compared field is identical. */
    UNCHANGED,
    /** A duplicate/conflict signal was raised (see {@link ConflictType}) that needs human review. */
    POSSIBLE_DUPLICATE,
    /** Candidate geometry is present but internally inconsistent (e.g. min &gt; max, out-of-range lat/lon). */
    INVALID_GEOMETRY,
    /** Candidate's geo_center falls outside the target city's bounding box. */
    OUTSIDE_CITY,
    /** Candidate has no geo_center at all — {@link GeometryTrust#MISSING}. */
    MISSING_GEOMETRY,
    /** Catch-all for structurally invalid candidates (e.g. malformed area_key) requiring a human decision. */
    NEEDS_HUMAN_REVIEW
}

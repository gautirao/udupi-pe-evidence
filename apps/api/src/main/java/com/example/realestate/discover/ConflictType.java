package com.example.realestate.discover;

/**
 * A specific duplicate/conflict signal surfaced for a candidate area (#1887 PR1). A candidate
 * may carry zero, one, or several of these — {@link AreaOnboardingService} never silently
 * resolves any of them; they are always reported for human review.
 *
 * <p>{@link #SAME_NAME_DIFFERENT_CITY} is deliberately non-blocking: two cities legitimately
 * having an area with the same display name (e.g. a "Central" locality in both Bangalore and
 * Udupi) is not a duplicate and must never force {@link AreaOnboardingReport#applyAllowed()} to
 * {@code false} or be conflated with {@link #NORMALISED_NAME_CONFLICT}, which is reserved for a
 * same-city name collision.
 */
public enum ConflictType {
    /** normalised area_key collides with an existing area belonging to a DIFFERENT city. */
    CANONICAL_KEY_CONFLICT,
    /** normalised display name collides with a different area's name in the SAME city. */
    NORMALISED_NAME_CONFLICT,
    /** normalised display name collides with an existing area_alias row. */
    ALIAS_CONFLICT,
    /** external_source_id repeated across candidates in the same submitted batch. */
    DUPLICATE_EXTERNAL_SOURCE_ID,
    /** candidate bounding box overlaps an existing area's bounding box in the same city. */
    SIMILAR_OR_OVERLAPPING,
    /** candidate geo_center falls outside the target city's bounding box. */
    OUTSIDE_CITY_BOUNDS,
    /** informational only — same normalised name exists in a different city; never a real duplicate. */
    SAME_NAME_DIFFERENT_CITY
}

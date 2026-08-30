package com.example.realestate.discover.citylaunch;

import java.time.Instant;

/**
 * Response body for the {@code /validation} sub-resource of a {@link CityLaunchRevision}
 * (#1911 PR4). {@code editable} is derived read-side (not persisted) — {@code true} only when the
 * revision is not superseded and its {@code lifecycleStatus} is {@code PREPARED} or
 * {@code VALIDATED}; the write endpoints enforce the same condition atomically in their guarded
 * SQL {@code WHERE} clause, so this flag is informational for the UI, never itself a security
 * boundary.
 *
 * <p>Shape is nested per the approved plan ({@code checks.{landing,regions,areaGroups,areas,
 * listing}}) to match the frontend contract — see team-lead-plan.toml [design.endpoints].
 */
public record ValidationStateDto(
        Long revisionId,
        Integer cityId,
        Integer revisionNumber,
        String lifecycleStatus,
        ValidationChecks checks,
        boolean allValidated,
        boolean editable,
        Instant preparedAt,
        Instant validatedAt,
        Long supersededBy) {

    /**
     * Nested per-section checklist flags, serialized under the {@code checks} JSON key.
     *
     * <p>{@code agriDestinations} (#2151 PR A) is appended as a NEW field rather than inserted
     * among the original five, so any existing frontend/client deserializer that reads this record
     * positionally (rather than by JSON field name) keeps working — this record's fields are
     * serialized by name (Jackson), so ordering is cosmetic, but keeping new fields trailing
     * matches this codebase's other additive-DTO-extension conventions (e.g. {@code
     * RevisionChecksum}'s trailing-section discipline).
     */
    public record ValidationChecks(
            boolean landing,
            boolean regions,
            boolean areaGroups,
            boolean areas,
            boolean listing,
            boolean agriDestinations) {}

    static ValidationStateDto from(CityLaunchRevision revision, boolean editable) {
        ValidationChecks checks = new ValidationChecks(
                revision.isLandingValidated(),
                revision.isRegionsValidated(),
                revision.isAreaGroupsValidated(),
                revision.isAreasValidated(),
                revision.isListingValidated(),
                revision.isAgriValidated());
        boolean allValidated = checks.landing()
                && checks.regions()
                && checks.areaGroups()
                && checks.areas()
                && checks.listing()
                && checks.agriDestinations();
        return new ValidationStateDto(
                revision.getId(),
                revision.getCityId(),
                revision.getRevisionNumber(),
                revision.getLifecycleStatus().name(),
                checks,
                allValidated,
                editable,
                revision.getPreparedAt(),
                revision.getValidatedAt(),
                revision.getSupersededBy());
    }
}

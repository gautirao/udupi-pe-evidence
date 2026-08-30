package com.example.realestate.discover;

/**
 * Lifecycle state of a canonical {@code areas} row (#1887 PR2, design decision D3).
 *
 * <p>Scaffolding only in PR2: {@link AreaOnboardingApplyService#apply} only ever writes
 * {@link #ACTIVE} (on {@link ApplyAction#CREATE_AREA}). No dry-run outcome yet drives an actual
 * {@link #INACTIVE}/{@link #MERGED} write — that arrives in a future PR. {@code areas} is never
 * hard-deleted regardless of lifecycle_status, so schools/area_group_members/
 * city_region_memberships/area_alias foreign keys are never orphaned.
 */
public enum AreaLifecycleStatus {
    ACTIVE,
    INACTIVE,
    MERGED
}

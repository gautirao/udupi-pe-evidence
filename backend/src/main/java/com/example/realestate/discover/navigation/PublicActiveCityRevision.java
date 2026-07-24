package com.example.realestate.discover.navigation;

/**
 * One public-active city's currently PROMOTED navigation revision — the join result {@link
 * PublicActiveCityRevisionReader} resolves, shared by {@code NavigationCachePreloadRunner} (eager
 * startup) and {@code NavigationHierarchySafetyPoller} (30-60s reconciliation) so both use the
 * identical "which revision SHOULD be active" query (#1955 Areas PR A, SLICE 2d).
 */
public record PublicActiveCityRevision(int cityId, String citySlug, long revisionId) {
}

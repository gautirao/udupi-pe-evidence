package com.example.realestate.discover.navigation;

/**
 * Published AFTER_COMMIT by {@code CityLaunchPromotionService.launch} on a genuine (non
 * idempotent-no-op) promotion (#1955 Areas PR A, SLICE 2d) — triggers {@link
 * NavigationGraphRefreshListener}'s load-validate-build-cache-atomic-swap-grace-evict sequence.
 *
 * <p>Deliberately carries only ids, never {@code citySlug}: the promotion write path already pays
 * for exactly the writes {@code AC9}'s single-transaction contract requires, and must not grow an
 * extra read merely to populate this event. {@link NavigationGraphRefreshListener} resolves the
 * slug itself, off the promotion transaction's critical path (it runs AFTER_COMMIT, {@code @Async}).
 */
public record CityNavigationRevisionPromoted(int cityId, long revisionId) {
}

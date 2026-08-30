package com.example.realestate.discover.navigation;

import java.util.Map;

/**
 * Boundary (#1955 Areas PR A, SLICE 2e, AC12) between the navigation-hierarchy read path and the
 * listing-count data source. Returns a WHOLE-CITY {@code area_key -> count} map for one {@link
 * AreaCountQuery} filter context — never node-scoped, never pre-rolled-up — so the caller ({@link
 * AreaCountRollupService}) can fold it through the cached {@link NavigationGraph}'s {@code
 * descendantAreaKeysByNodeKey} into CLUSTER/region totals over UNIQUE leaf areas without a second
 * round trip per node.
 *
 * <p>Implementations: {@link PostgresAreaCountProvider} (production-ready, always present) and
 * {@link OpenSearchAreaCountProvider} (non-blocking stub, guarded by {@code
 * discover.opensearch.enabled=false} — mirrors the {@code DiscoverSummaryPort}/{@code
 * RoutingDiscoverSummaryService} routing convention, never required while disabled).
 */
public interface AreaCountProvider {

    /**
     * Every {@code area_key} in {@code query.citySlug()} with at least one matching listing,
     * mapped to its count. An area with zero matching listings is simply ABSENT from the map —
     * callers must {@code getOrDefault(areaKey, 0L)}, never assume every canonical area_key is a
     * key.
     */
    Map<String, Long> countsByAreaKey(AreaCountQuery query);
}

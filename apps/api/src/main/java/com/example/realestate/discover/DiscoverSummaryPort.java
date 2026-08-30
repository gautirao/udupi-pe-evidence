package com.example.realestate.discover;

/**
 * Port (interface) for the discover summary query (#1745 P5).
 *
 * <p>Implementations: {@link DiscoverSummaryService} (Postgres, always present) and, in future,
 * an OpenSearch adapter conditional on {@code discover.opensearch.enabled=true}.
 *
 * <p>The active implementation is selected by {@link RoutingDiscoverSummaryService}, which is
 * {@code @Primary}.
 */
public interface DiscoverSummaryPort {

    DiscoverSummaryResponse getSummary(SummaryQuery query);
}

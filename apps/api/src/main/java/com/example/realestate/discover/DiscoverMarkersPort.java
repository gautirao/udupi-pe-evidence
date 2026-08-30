package com.example.realestate.discover;

/**
 * Port (interface) for the markers discover query.
 *
 * <p>Implementations: {@link DiscoverMarkersService} (Postgres, always present) and
 * {@link com.example.realestate.discover.opensearch.OpenSearchMarkersAdapter} (OpenSearch,
 * conditional on {@code discover.opensearch.enabled=true}).
 *
 * <p>The active implementation is selected by
 * {@link RoutingDiscoverMarkersService} which is {@code @Primary}.
 */
public interface DiscoverMarkersPort {

    DiscoverMarkersResponse getMarkers(DiscoverListingPredicateBuilder.Filters filters);
}

package com.example.realestate.discover;

/**
 * Port (interface) for the listings discover query.
 *
 * <p>Implementations: {@link DiscoverListingsService} (Postgres, always present) and
 * {@link com.example.realestate.discover.opensearch.OpenSearchListingsAdapter} (OpenSearch,
 * conditional on {@code discover.opensearch.enabled=true}).
 *
 * <p>The active implementation is selected by
 * {@link RoutingDiscoverListingsService} which is {@code @Primary}.
 */
public interface DiscoverListingsPort {

    DiscoverListingsPage getListings(DiscoverListingsQuery query);
}

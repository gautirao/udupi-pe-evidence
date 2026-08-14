package com.example.realestate.discover;

import java.util.List;

/**
 * Top-level response DTO for GET /api/discover/agri-destinations (#2151 PR C, decision D_C1/O2).
 *
 * <p>1:1 mirror of {@link AgriDestinationPort.DestinationScope} — see {@link AgriDestinationsService},
 * which calls {@link AgriDestinationPort#findDestinations} and nothing else.
 */
public record AgriDestinationsResponse(
        /** Normalised city slug, e.g. "udupi". */
        String city,
        /**
         * Destination buckets; empty (never null) — see the three-way city behaviour documented on
         * {@link AgriDestinationsController#getAgriDestinations}.
         */
        List<AgriDestinationBucketResponse> destinations
) {}

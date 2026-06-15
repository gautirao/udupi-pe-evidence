package com.example.realestate.discover;

import java.util.List;

/**
 * Response wrapper for GET /api/discover/agri-map-listings.
 *
 * <p>{@code truncated} is {@code true} when the query matched more than {@code limit} listings
 * and the response has been capped at the first {@code limit} rows (ordered by {@code pl.id}).
 * Callers can use this flag to display a "too many results" hint and narrow their area selection.
 *
 * <p>{@code limit} echoes the server-side cap that was in effect at query time
 * ({@link DiscoverAgriMapListingsService#MAX_LISTINGS_PER_REQUEST}).
 * It is always present (even when {@code truncated=false}) so clients can reason about
 * the maximum they will ever receive without hard-coding the constant on their side.
 */
public record AgriMapListingsResponse(String city, List<AgriMapListingItem> listings,
                                      boolean truncated, int limit) {}

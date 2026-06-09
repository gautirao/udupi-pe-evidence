package com.example.realestate.discover;

import java.util.List;

/**
 * Response wrapper for GET /api/discover/agri-map-listings.
 */
public record AgriMapListingsResponse(String city, List<AgriMapListingItem> listings) {}

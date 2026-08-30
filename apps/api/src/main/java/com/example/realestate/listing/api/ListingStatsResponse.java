package com.example.realestate.listing.api;

public record ListingStatsResponse(
        int draftCount,
        int pendingReviewCount,
        int liveCount,
        int rejectedCount,
        int totalCount
) {}

package com.example.realestate.discover;

import java.util.List;

/** Validated, parsed query object produced by DiscoverListingsController. */
public record DiscoverListingsQuery(
        String city,
        List<String> propertyTypes,
        Long priceMinPaise,
        Long priceMaxPaise,
        String dateFrom,
        String dateTo,
        List<Integer> bedrooms,
        List<String> sellerTypes,
        Boolean backOnMarket,
        Boolean newToMarket,
        Boolean reraRegistered,
        Boolean readyToMove,
        List<List<Double>> polygon,
        Double schoolLat,
        Double schoolLon,
        Double schoolRadiusKm,
        String q,
        DiscoverListingPredicateBuilder.Bbox bbox,
        int page,
        int size,
        boolean includeAggregates,
        String listingPurpose,
        List<String> areaKeys,  // null = no area filter; non-empty = restrict to group members
        /**
         * Opaque client-supplied echo (#2016). Never inspected or interpreted by the server —
         * the frontend uses it to detect and drop stale responses that raced ahead of a
         * result-scope change. Passed straight through to {@link DiscoverListingsPage}.
         */
        String scopeFingerprint
) {

    /**
     * Backward-compatible constructor for callers that predate the #2016 {@code scopeFingerprint}
     * echo (e.g. the OpenSearch DSL builder / shadow-comparison tests). Defaults to null.
     */
    public DiscoverListingsQuery(
            String city,
            List<String> propertyTypes,
            Long priceMinPaise,
            Long priceMaxPaise,
            String dateFrom,
            String dateTo,
            List<Integer> bedrooms,
            List<String> sellerTypes,
            Boolean backOnMarket,
            Boolean newToMarket,
            Boolean reraRegistered,
            Boolean readyToMove,
            List<List<Double>> polygon,
            Double schoolLat,
            Double schoolLon,
            Double schoolRadiusKm,
            String q,
            DiscoverListingPredicateBuilder.Bbox bbox,
            int page,
            int size,
            boolean includeAggregates,
            String listingPurpose,
            List<String> areaKeys
    ) {
        this(city, propertyTypes, priceMinPaise, priceMaxPaise, dateFrom, dateTo, bedrooms,
                sellerTypes, backOnMarket, newToMarket, reraRegistered, readyToMove, polygon,
                schoolLat, schoolLon, schoolRadiusKm, q, bbox, page, size, includeAggregates,
                listingPurpose, areaKeys, null);
    }
}

package com.example.realestate.discover;

import java.util.List;

/** Validated, parsed query object produced by DiscoverListingsController. */
public record DiscoverListingsQuery(
        String city,
        List<String> propertyTypes,
        /** #2431 — SHOP/OFFICE narrowing for the generic Commercial family; null = no filter. */
        List<String> commercialSubtypes,
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
        DiscoverListingPredicateBuilder.Bbox viewportScope,
        /**
         * Opaque client-supplied echo (#2016). Never inspected or interpreted by the server —
         * the frontend uses it to detect and drop stale responses that raced ahead of a
         * result-scope change. Passed straight through to {@link DiscoverListingsPage}.
         */
        String scopeFingerprint,
        /** #2459 — inclusive lower bound on the row's PRIMARY area in sq ft; null = "Any size". */
        Integer areaMinSqft,
        /** #2459 — inclusive upper bound on the row's PRIMARY area in sq ft; null = "Any size". */
        Integer areaMaxSqft,
        /** #2767 — SERVER-DERIVED ONLY (resolved from {@code schoolAreaKey} by
         *  {@link SchoolAreaBoundsParam}); never bound from a request parameter. */
        DiscoverListingPredicateBuilder.Bbox areaBbox
) {

    /**
     * Backward-compatible constructor for callers that predate the #2767 areaBbox. Defaults to null.
     */
    @SuppressWarnings("java:S107")
    public DiscoverListingsQuery(
            String city,
            List<String> propertyTypes,
            List<String> commercialSubtypes,
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
            List<String> areaKeys,
            DiscoverListingPredicateBuilder.Bbox viewportScope,
            String scopeFingerprint,
            Integer areaMinSqft,
            Integer areaMaxSqft
    ) {
        this(city, propertyTypes, commercialSubtypes, priceMinPaise, priceMaxPaise, dateFrom,
                dateTo, bedrooms, sellerTypes, backOnMarket, newToMarket, reraRegistered,
                readyToMove, polygon, schoolLat, schoolLon, schoolRadiusKm, q, bbox, page, size,
                includeAggregates, listingPurpose, areaKeys, viewportScope, scopeFingerprint,
                areaMinSqft, areaMaxSqft, null);
    }

    /**
     * Backward-compatible constructor for callers that predate the #2459 area bounds. Defaults both
     * to {@code null} — "Any size", the behaviour every one of these call sites had before the
     * fields existed.
     */
    @SuppressWarnings("java:S107") // mirrors the pre-#2459 record shape verbatim
    public DiscoverListingsQuery(
            String city,
            List<String> propertyTypes,
            List<String> commercialSubtypes,
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
            List<String> areaKeys,
            DiscoverListingPredicateBuilder.Bbox viewportScope,
            String scopeFingerprint
    ) {
        this(city, propertyTypes, commercialSubtypes, priceMinPaise, priceMaxPaise, dateFrom,
                dateTo, bedrooms, sellerTypes, backOnMarket, newToMarket, reraRegistered,
                readyToMove, polygon, schoolLat, schoolLon, schoolRadiusKm, q, bbox, page, size,
                includeAggregates, listingPurpose, areaKeys, viewportScope, scopeFingerprint,
                null, null, null);
    }

    /**
     * Backward-compatible constructor for callers that predate the #2431
     * {@code commercialSubtypes} filter. Defaults it to {@code null} — no subtype filter, the
     * behaviour every one of these call sites had before the field existed.
     */
    @SuppressWarnings("java:S107") // mirrors the pre-#2431 record shape verbatim
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
            List<String> areaKeys,
            DiscoverListingPredicateBuilder.Bbox viewportScope,
            String scopeFingerprint
    ) {
        this(city, propertyTypes, null, priceMinPaise, priceMaxPaise, dateFrom, dateTo, bedrooms,
                sellerTypes, backOnMarket, newToMarket, reraRegistered, readyToMove, polygon,
                schoolLat, schoolLon, schoolRadiusKm, q, bbox, page, size, includeAggregates,
                listingPurpose, areaKeys, viewportScope, scopeFingerprint);
    }

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
            List<String> areaKeys,
            DiscoverListingPredicateBuilder.Bbox viewportScope
    ) {
        this(city, propertyTypes, priceMinPaise, priceMaxPaise, dateFrom, dateTo, bedrooms,
                sellerTypes, backOnMarket, newToMarket, reraRegistered, readyToMove, polygon,
                schoolLat, schoolLon, schoolRadiusKm, q, bbox, page, size, includeAggregates,
                listingPurpose, areaKeys, viewportScope, null);
    }
}

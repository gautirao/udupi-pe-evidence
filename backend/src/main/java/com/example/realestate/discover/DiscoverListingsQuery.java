package com.example.realestate.discover;

import java.util.List;

/** Validated, parsed query object produced by DiscoverListingsController. */
public record DiscoverListingsQuery(
        String city,
        List<String> propertyTypes,
        List<String> localities,
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
        DiscoverListingPredicateBuilder.Bbox bbox,
        int page,
        int size,
        boolean includeAggregates
) {}

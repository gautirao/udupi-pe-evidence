package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * Per-area result entry in the city-first discover endpoint.
 *
 * @param areaKey  canonical area key (e.g. "IN|KA|Udupi|Malpe")
 * @param areaName human-readable area name from {@code areas.name}, or null when unknown
 * @param unknown  true when the areaKey does not belong to the requested city; omitted otherwise
 * @param listings LIVE listings for this area, capped to limitPerArea, ordered created_at DESC
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AreaListingsEntry(
        String areaKey,
        String areaName,
        Boolean unknown,
        List<AreaListingCard> listings
) {}

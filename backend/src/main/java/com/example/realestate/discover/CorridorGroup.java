package com.example.realestate.discover;

import java.util.List;

/**
 * A single direction corridor returned by GET /api/discover/regional-area-groups.
 *
 * <p>Each corridor aggregates all distance tiers (cumulative) for one compass direction.
 * {@code availableMaxDistances} is ordered from closest to furthest; only tiers with
 * at least one live listing are included.
 */
public record CorridorGroup(
        /** Compass direction code, e.g. "N", "NE", "SW". */
        String directionCode,
        /** Human-readable group name from city_regional_direction_labels,
         *  e.g. "N towards Brahmavar". Falls back to "{directionCode} corridor"
         *  when no label row exists for this (city, direction) pair. */
        String groupName,
        /** Ordered cumulative distance tiers (closest first, empty tiers omitted). */
        List<AvailableMaxDistance> availableMaxDistances
) {}

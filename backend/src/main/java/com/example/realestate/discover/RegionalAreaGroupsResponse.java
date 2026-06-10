package com.example.realestate.discover;

import java.util.List;

/**
 * Top-level response DTO for GET /api/discover/regional-area-groups.
 *
 * <p>Intentionally distinct from {@link AreaGroupsResponse} — do NOT merge or reuse.
 *
 * <p>As of #1435, groups are corridor-first: each {@link CorridorGroup} represents one
 * compass direction and contains cumulative distance tiers within it.
 */
public record RegionalAreaGroupsResponse(
        /** Normalised city slug, e.g. "udupi". */
        String city,
        /**
         * Ordered corridor groups (by label sort_order from city_regional_direction_labels,
         * then natural compass order). Only directions with ≥ 1 live listing are included.
         */
        List<CorridorGroup> groups
) {}

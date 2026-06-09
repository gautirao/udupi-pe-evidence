package com.example.realestate.discover;

import java.util.List;

/**
 * Top-level response DTO for GET /api/discover/regional-area-groups.
 *
 * <p>Intentionally distinct from {@link AreaGroupsResponse} — do NOT merge or reuse.
 */
public record RegionalAreaGroupsResponse(
        /** Normalised city slug, e.g. "udupi". */
        String city,
        /** Ordered groups: sorted by band sort_order, then direction sort_order.
         *  Only groups with ≥ 1 live listing are included. */
        List<RegionalAreaGroup> groups
) {}

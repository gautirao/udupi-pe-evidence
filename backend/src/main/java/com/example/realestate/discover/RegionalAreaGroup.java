package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * DTO for a single regional area group returned by GET /api/discover/regional-area-groups.
 *
 * <p>agriAcreage is omitted from JSON when null ({@code @JsonInclude(NON_NULL)}):
 * null means no parseable acreage was found for any listing in this group
 * (PER-ROW-SKIP rule mirroring AreaSummaryService).
 *
 * <p>This record is intentionally distinct from {@link AreaGroupResponse} — do NOT merge.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record RegionalAreaGroup(
        /** Human-readable label, e.g. "North of Udupi · 10–25 km". */
        String label,
        /** Direction key, e.g. "N", "NE". */
        String directionKey,
        /** Distance band key, e.g. "10_25". */
        String distanceBandKey,
        /** Count of LIVE agri listings in this group (computed live, never stored). */
        long listingCount,
        /** Sum of parseable acreage in acres across all LIVE agri listings in this group.
         *  Null when no parseable land_area row exists (omitted from JSON via NON_NULL). */
        Double agriAcreage,
        /** Ordered list of area_keys that belong to this group. */
        List<String> areaKeys
) {}

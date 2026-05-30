package com.example.realestate.discover;

import java.util.List;

/**
 * Response for GET /api/discover/markers.
 *
 * <p>Fields:
 * <ul>
 *   <li>{@code city} — city slug the query was scoped to (preserved from pre-#944)</li>
 *   <li>{@code markers} — up to {@code limit} marker rows (preserved from pre-#944)</li>
 *   <li>{@code truncated} — true when the filtered result set exceeded {@code limit} (preserved from #943)</li>
 *   <li>{@code returnedElements} — number of markers in this response (== markers.size())</li>
 *   <li>{@code totalFilteredElements} — viewport-scoped count: rows matching ALL filters including
 *       bbox. When {@code truncated==false} this equals {@code returnedElements} (no extra query).
 *       When {@code truncated==true} this is the COUNT(*) of the full matching set.</li>
 *   <li>{@code limit} — the active marker cap constant</li>
 *   <li>{@code boundsApplied} — true only when a valid, non-null bbox was present and applied</li>
 * </ul>
 *
 * <p>The four new fields (returnedElements, totalFilteredElements, limit, boundsApplied) are
 * additive: existing JSON consumers that ignore unknown fields continue to work unchanged.
 */
public record DiscoverMarkersResponse(
        String city,
        List<DiscoverMarker> markers,
        boolean truncated,
        int returnedElements,
        long totalFilteredElements,
        int limit,
        boolean boundsApplied
) {}

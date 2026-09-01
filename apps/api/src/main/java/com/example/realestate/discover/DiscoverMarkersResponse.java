package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;
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
 *   <li>{@code scopeFingerprint} — opaque client-supplied echo (#2016): the {@code
 *       scopeFingerprint} query param the caller sent is returned here UNCHANGED. Pure
 *       passthrough, added at the controller boundary — never computed, validated, or
 *       interpreted by the server. Used by the frontend to detect and discard a response that
 *       raced ahead of a newer result-scope change. Null when the caller did not supply one.</li>
 * </ul>
 *
 * <p>The four #943/#1726-era fields (returnedElements, totalFilteredElements, limit,
 * boundsApplied) and the #2016 scopeFingerprint field are additive: existing JSON consumers
 * that ignore unknown fields continue to work unchanged.
 *
 * <p>{@code @JsonInclude(NON_NULL)} (#2016) so {@code scopeFingerprint} is OMITTED from the
 * wire format — not present as {@code null} — when the caller did not supply one, matching the
 * {@link DiscoverListingsPage} precedent for the same field.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record DiscoverMarkersResponse(
        String city,
        List<DiscoverMarker> markers,
        boolean truncated,
        int returnedElements,
        long totalFilteredElements,
        int limit,
        boolean boundsApplied,
        String scopeFingerprint
) {

    /**
     * Backward-compatible constructor for callers that predate the #2016 {@code scopeFingerprint}
     * echo (e.g. {@code OpenSearchMarkersAdapter}, {@code CityLaunchPreviewService}, shadow-
     * comparison tests). Defaults {@code scopeFingerprint} to null.
     */
    public DiscoverMarkersResponse(String city, List<DiscoverMarker> markers, boolean truncated,
            int returnedElements, long totalFilteredElements, int limit, boolean boundsApplied) {
        this(city, markers, truncated, returnedElements, totalFilteredElements, limit, boundsApplied, null);
    }
}

package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * Response envelope for {@code GET /api/discover/areas/relaxation-previews} (#2018 slice 2) and
 * its authenticated polygon sibling {@code GET /api/discover/listings/relaxation-previews}
 * (#2454).
 *
 * @param city         the requested city slug, echoed back
 * @param scopeKind    which result-scope kind the counts were computed over (#2454). Together
 *                     with {@code areaKeys} this is the server half of the client's stale-response
 *                     guard: a client showing a POLYGON zero state must never render a reply that
 *                     says {@code AREA_SET}.
 * @param areaKeys     the canonical scope keys the counts were computed over, echoed back so a
 *                     client can prove a response belongs to the scope it is currently showing.
 *                     Empty for POLYGON and VIEWPORT, which have no area keys.
 * @param baselineCount matches under the CURRENT, unrelaxed filters. Normally 0 — this endpoint
 *                     exists for the zero-result state — but it is computed and returned rather
 *                     than assumed, so a caller can tell "genuinely zero" from "the client and the
 *                     server disagree about the active filters".
 * @param previews     ordered relaxation offers; empty when no single-filter change yields a match
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record RelaxationPreviewsResponse(
        String city,
        RelaxationScope.Kind scopeKind,
        List<String> areaKeys,
        long baselineCount,
        List<RelaxationPreview> previews
) {
    /** Pre-#2454 shape: an area-keyed reply. Kept so slice-2 callers and tests are unchanged. */
    public RelaxationPreviewsResponse(
            String city, List<String> areaKeys, long baselineCount, List<RelaxationPreview> previews) {
        this(city, RelaxationScope.Kind.AREA_SET, areaKeys, baselineCount, previews);
    }
}

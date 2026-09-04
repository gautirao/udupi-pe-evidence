package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * Response envelope for {@code GET /api/discover/areas/relaxation-previews} (#2018 slice 2).
 *
 * @param city         the requested city slug, echoed back
 * @param areaKeys     the canonical scope keys the counts were computed over, echoed back so a
 *                     client can prove a response belongs to the scope it is currently showing
 *                     (the stale-response guard's server half)
 * @param baselineCount matches under the CURRENT, unrelaxed filters. Normally 0 — this endpoint
 *                     exists for the zero-result state — but it is computed and returned rather
 *                     than assumed, so a caller can tell "genuinely zero" from "the client and the
 *                     server disagree about the active filters".
 * @param previews     ordered relaxation offers; empty when the scope is not AREA/AREA_SET, or
 *                     when no single-filter change yields a match
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record RelaxationPreviewsResponse(
        String city,
        List<String> areaKeys,
        long baselineCount,
        List<RelaxationPreview> previews
) {}

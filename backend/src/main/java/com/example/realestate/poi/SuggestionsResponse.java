package com.example.realestate.poi;

import java.util.List;

/**
 * Response body for {@code GET /api/listings/{listingId}/pois/suggestions}.
 * <p>
 * {@code providerIssue} is {@code true} when at least one Overpass fetch attempted during
 * this request failed (both primary and fallback endpoints unreachable/erroring). It lets the
 * dealer UI distinguish "the provider is currently unavailable" from "the provider genuinely
 * found nothing nearby" — both of which would otherwise present as an empty {@code pois} list.
 */
public record SuggestionsResponse(List<PoiResponse> pois, boolean providerIssue) {
}

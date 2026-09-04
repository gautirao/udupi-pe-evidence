package com.example.realestate.discover;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * Shared result-scope exclusivity check for {@link DiscoverListingsController} and
 * {@link DiscoverMarkersController} (#2016).
 *
 * <p>AREA_SET (areaKeys), POLYGON and VIEWPORT are three mutually exclusive geographic result
 * scopes — at most one may be active per request. {@code bbox} is deliberately EXCLUDED from
 * this check: it is the always-on render/perf viewport prefilter and legitimately combines
 * with any of the three scopes today.
 *
 * <p><b>Callers must pass the resolved {@code effectiveAreaKeys}, not the raw {@code areaKeys}
 * request param.</b> When {@code nodeKey} is supplied, it resolves to a non-null
 * {@code effectiveAreaKeys} list — an AREA_SET scope — even though the raw {@code areaKeys}
 * param was never sent. Checking the raw param instead of the resolved list would let
 * {@code nodeKey} combine silently with {@code polygon}/{@code viewportScope} (#2016 review
 * fix-cycle-1): the two would be ANDed together instead of rejected.
 *
 * <p>Public so {@code com.example.realestate.savedsearch} can reuse this exact "at most one
 * populated scope" check (#2019 Slice A review ruling) instead of re-implementing the count —
 * narrowest-widening reuse rather than a duplicated copy. Saved-search layers its own
 * additional discriminated-union rules (an explicit {@code resultScopeKind} requiring exactly
 * one, not merely at most one) on top of this shared check.
 */
public final class ResultScopeExclusivity {

    private ResultScopeExclusivity() {}

    /**
     * Throws 400 {@code result_scope_must_be_exclusive} when more than one of
     * {@code effectiveAreaKeys} (non-null and non-empty), {@code polygon} (non-null) or
     * {@code viewportScope} (non-null) is present.
     */
    public static void check(List<String> effectiveAreaKeys, List<List<Double>> polygon,
            DiscoverListingPredicateBuilder.Bbox viewportScope) {
        int activeResultScopes = 0;
        if (effectiveAreaKeys != null && !effectiveAreaKeys.isEmpty()) activeResultScopes++;
        if (polygon != null) activeResultScopes++;
        if (viewportScope != null) activeResultScopes++;
        if (activeResultScopes > 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "result_scope_must_be_exclusive");
        }
    }
}

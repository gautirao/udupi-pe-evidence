package com.example.realestate.savedsearch;

import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import com.example.realestate.discover.ResultScopeExclusivity;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Validates that a saved-search request's {@code resultScopeKind} discriminator is
 * consistent with exactly one populated scope payload. Delegates the "more than one
 * populated scope" count to the shared
 * {@code com.example.realestate.discover.ResultScopeExclusivity#check} (#2019 Slice A
 * review ruling — narrowest-widening reuse rather than a duplicated copy), then layers
 * saved-search-specific rules on top that have no Discover equivalent: an explicit
 * {@code resultScopeKind} discriminator is required (Discover's query params are
 * independently nullable with no discriminator), the discriminator must match the
 * populated payload, and a POLYGON scope must have at least 3 vertices.
 */
final class SavedSearchScopeExclusivity {

    private SavedSearchScopeExclusivity() {
    }

    static void check(
            ResultScopeKind kind,
            List<String> areaKeys,
            List<List<Double>> polygon,
            Double viewportSouth,
            Double viewportWest,
            Double viewportNorth,
            Double viewportEast) {
        if (kind == null) {
            throw reject("saved_search_result_scope_kind_required");
        }

        boolean hasAreaSet = areaKeys != null && !areaKeys.isEmpty();
        boolean hasPolygon = polygon != null && !polygon.isEmpty();
        boolean hasViewport = viewportSouth != null || viewportWest != null || viewportNorth != null || viewportEast != null;

        DiscoverListingPredicateBuilder.Bbox viewportScope = hasViewport
                ? new DiscoverListingPredicateBuilder.Bbox(
                        viewportSouth != null ? viewportSouth : 0,
                        viewportWest != null ? viewportWest : 0,
                        viewportNorth != null ? viewportNorth : 0,
                        viewportEast != null ? viewportEast : 0)
                : null;
        try {
            ResultScopeExclusivity.check(hasAreaSet ? areaKeys : null, hasPolygon ? polygon : null, viewportScope);
        } catch (ResponseStatusException e) {
            throw reject("saved_search_result_scope_must_be_exclusive");
        }

        int populatedCount = (hasAreaSet ? 1 : 0) + (hasPolygon ? 1 : 0) + (hasViewport ? 1 : 0);
        if (populatedCount != 1) {
            throw reject("saved_search_result_scope_must_be_exclusive");
        }

        boolean consistent =
                switch (kind) {
                    case AREA_SET -> hasAreaSet;
                    case POLYGON -> hasPolygon;
                    case VIEWPORT -> hasViewport;
                };
        if (!consistent) {
            throw reject("saved_search_result_scope_kind_mismatch");
        }

        if (kind == ResultScopeKind.POLYGON && polygon.size() < 3) {
            throw reject("saved_search_polygon_requires_at_least_3_vertices");
        }
    }

    private static ResponseStatusException reject(String reason) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, reason);
    }
}

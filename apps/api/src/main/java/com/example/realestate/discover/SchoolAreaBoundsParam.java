package com.example.realestate.discover;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

/**
 * Shared resolution of the {@code schoolAreaKey} query param (#2767), called by BOTH
 * {@link DiscoverListingsController} and {@link DiscoverMarkersController} so cards, count and
 * markers go through one resolution path and cannot disagree.
 *
 * <p><b>Trust boundary.</b> The School + Area journey constrains the school radius to the selected
 * canonical Area's rectangle. That rectangle is NEVER taken from the client: the client names a
 * canonical Area ({@code schoolAreaKey}) and the server reads that Area's own bounds from the
 * {@code areas} row via {@link AreaSummaryService#findAreaBounds}. There is deliberately no
 * request parameter that carries coordinates for this constraint, so it cannot be used as an
 * alternate, unvalidated polygon channel around {@link PolygonGeographicSafetyPolicy} (#2420).
 *
 * <p><b>Fail closed.</b> Every unusable input is a 400 — never silently widened to radius-only:
 * <ul>
 *   <li>{@code school_area_key_must_be_single} — blank, or more than one value</li>
 *   <li>{@code school_area_key_requires_school} — no {@code schoolLat}/{@code schoolLon}</li>
 *   <li>{@code school_area_key_excludes_polygon} — combined with a committed {@code polygon}</li>
 *   <li>{@code invalid_school_area_key} — unknown, other-city, inactive-city or non-locality key</li>
 *   <li>{@code school_area_bounds_unavailable} — the Area row has NULL/inverted bounds</li>
 * </ul>
 * A valid key whose rectangle ∩ radius contains no listing is an honest empty 200, not an error.
 *
 * <p>The returned {@link DiscoverListingPredicateBuilder.Bbox} feeds the existing
 * {@code Filters.areaBbox} / {@code DiscoverListingsQuery.areaBbox} component. That component is
 * SERVER-DERIVED ONLY: no controller binds it from the request.
 */
final class SchoolAreaBoundsParam {

    private SchoolAreaBoundsParam() {
    }

    /**
     * @param schoolAreaKeys raw bound values of the {@code schoolAreaKey} param; {@code null} when
     *                       the param is absent
     * @return the server-owned rectangle, or {@code null} when the param is absent (no constraint)
     * @throws ResponseStatusException 400 per the class contract
     */
    static DiscoverListingPredicateBuilder.Bbox resolve(
            AreaSummaryService areaSummaryService,
            String city,
            List<String> schoolAreaKeys,
            Double schoolLat,
            Double schoolLon,
            List<List<Double>> polygon
    ) {
        if (schoolAreaKeys == null) {
            return null;
        }
        if (schoolAreaKeys.size() != 1 || schoolAreaKeys.get(0) == null || schoolAreaKeys.get(0).isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "school_area_key_must_be_single");
        }
        if (schoolLat == null || schoolLon == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "school_area_key_requires_school");
        }
        if (polygon != null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "school_area_key_excludes_polygon");
        }
        AreaSummaryService.AreaBounds bounds = areaSummaryService.findAreaBounds(city, schoolAreaKeys.get(0))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid_school_area_key"));
        if (!bounds.isUsable()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "school_area_bounds_unavailable");
        }
        return new DiscoverListingPredicateBuilder.Bbox(
                bounds.minLat(), bounds.minLon(), bounds.maxLat(), bounds.maxLon());
    }
}

package com.example.realestate.discover;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Boundary validation for the {@code areaMinSqft} / {@code areaMaxSqft} query params (#2459),
 * shared verbatim by the listings and markers endpoints.
 *
 * <p>Exists for the same reason {@link CommercialSubtypeParam} does: two endpoints that accept the
 * same param must reject the same inputs, or a URL the shopper can reach returns cards from one and
 * markers from the other. Sharing the validator makes that structural rather than reviewed.
 *
 * <p><b>Unknown values FAIL here rather than silently widening.</b> These params are brand new — no
 * client emits them and no saved URL contains them — so there is no legacy shape to protect, which
 * is exactly the reasoning that made {@code commercialSubtypes} fail-closed and left
 * {@code propertyTypes} permissive.
 *
 * <p>Deliberately NOT validated here: whether any listing actually falls in the range. An empty
 * result for a legitimate range is an honest answer, not an error.
 */
public final class AreaBoundsParam {

    private AreaBoundsParam() {
    }

    /**
     * Rejects a negative bound, or an inverted range.
     *
     * <p>A negative area is not a narrowing request that happens to match nothing — it is not a
     * request at all, and accepting it would mint a cache key for an impossible question. An
     * inverted range ({@code min > max}) is likewise always a client defect: no row can satisfy it,
     * and returning an empty page would hide the bug rather than surface it.
     *
     * @param areaMinSqft inclusive lower bound in sq ft, or {@code null}
     * @param areaMaxSqft inclusive upper bound in sq ft, or {@code null}
     * @throws ResponseStatusException 400 when either bound is negative or the range is inverted
     */
    public static void validate(Integer areaMinSqft, Integer areaMaxSqft) {
        if (areaMinSqft != null && areaMinSqft < 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "area_min_sqft_must_be_non_negative");
        }
        if (areaMaxSqft != null && areaMaxSqft < 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "area_max_sqft_must_be_non_negative");
        }
        if (areaMinSqft != null && areaMaxSqft != null && areaMinSqft > areaMaxSqft) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "area_min_sqft_exceeds_area_max_sqft");
        }
    }
}

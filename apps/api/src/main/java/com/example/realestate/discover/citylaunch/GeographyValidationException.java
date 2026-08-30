package com.example.realestate.discover.citylaunch;

/**
 * Thrown by {@link CityLaunchGraphWriter} when a city's canonical geography fails a mandatory
 * identifier check (AC4) BEFORE any {@code sandbox_*} row is written for the revision.
 *
 * <p>Reasons include: no ACTIVE areas, an area missing its {@code area_key} or interior point
 * (geo_center_lat/lon), zero {@code city_regions} rows, or a {@code city_region_memberships} /
 * {@code area_group_members} row referencing an area or region that does not resolve within the
 * loaded canonical geography.
 *
 * <p>Mapped to {@code 422 Unprocessable Entity} by
 * {@link com.example.realestate.exception.GlobalExceptionHandler} when it escapes an HTTP request
 * (it normally does not — the background graph writer catches it and records a FAILED revision
 * instead of ever propagating to a controller).
 */
public class GeographyValidationException extends RuntimeException {

    public GeographyValidationException(String message) {
        super(message);
    }
}

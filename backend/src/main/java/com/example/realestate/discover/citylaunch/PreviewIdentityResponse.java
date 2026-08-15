package com.example.realestate.discover.citylaunch;

/**
 * Admin preview of a {@link CityLaunchRevision}'s owning city identity (#2151 Track 1) — GET
 * {@code .../preview/identity}. Lets the admin City Launch preview page resolve the real
 * {@code citySlug}/{@code cityName} for a revision instead of falling back to a default city,
 * since the preview route carries only numeric {@code cityId}/{@code revisionId} path segments.
 *
 * @param cityId    the revision's owning city id (echoes the path variable, for client convenience)
 * @param citySlug  the city's slug, e.g. {@code "udupi"}
 * @param cityName  the city's display name, e.g. {@code "Udupi"}
 */
public record PreviewIdentityResponse(int cityId, String citySlug, String cityName) {
}

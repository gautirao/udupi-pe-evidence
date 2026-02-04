package com.example.realestate.geo;

/**
 * Port interface for geocoding operations.
 * Allows mocking in tests (required for Java 25 Mockito compatibility).
 */
public interface GeocodingPort {

    /**
     * Geocode a locality string to coordinates.
     *
     * @param locality the location string to geocode (e.g., "Udupi", "Manipal")
     * @return GeoResult with coordinates, or null if geocoding fails or locality not found
     */
    GeocodingService.GeoResult geocode(String locality);
}

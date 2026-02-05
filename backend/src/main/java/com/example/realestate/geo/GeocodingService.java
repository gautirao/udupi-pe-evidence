package com.example.realestate.geo;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Geocoding service implementation.
 * Currently a stub that returns null; actual API integration (e.g., Google Maps,
 * Nominatim) will be added in a future PR.
 */
@Service
public class GeocodingService implements GeocodingPort {

    private static final Logger log = LoggerFactory.getLogger(GeocodingService.class);

    /**
     * Result of a geocoding operation, including coordinates and structured address components.
     * Address components are nullable and may not all be populated depending on the geocoding provider.
     *
     * @param latitude     the latitude coordinate
     * @param longitude    the longitude coordinate
     * @param displayName  human-readable address string from the geocoder
     * @param country      country name (e.g., "India")
     * @param region       state/province/region (e.g., "Karnataka")
     * @param city         city/district (e.g., "Udupi")
     * @param locality     locality/village/area (e.g., "Ambalpady")
     * @param neighborhood sub-locality or neighborhood (fallback for locality)
     */
    public record GeoResult(
            double latitude,
            double longitude,
            String displayName,
            String country,
            String region,
            String city,
            String locality,
            String neighborhood) {
    }

    /**
     * Geocode a locality string to coordinates.
     * Currently a stub that returns null.
     */
    public GeoResult geocode(String locality) {
        log.debug("Geocoding not yet implemented for locality={}", locality);
        return null;
    }
}

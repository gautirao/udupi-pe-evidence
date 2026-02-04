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

    public record GeoResult(double latitude, double longitude, String displayName) {
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

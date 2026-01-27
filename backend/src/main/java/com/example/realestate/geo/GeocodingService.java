package com.example.realestate.geo;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Stub for future geocoding implementation.
 * The geocode_cache table exists in the database but is not yet populated
 * by the current system. This service will be implemented when geocoding
 * is added to the ingestion pipeline.
 */
@Service
public class GeocodingService {

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

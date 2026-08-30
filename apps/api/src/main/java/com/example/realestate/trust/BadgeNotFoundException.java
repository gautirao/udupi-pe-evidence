package com.example.realestate.trust;

import java.util.UUID;

/**
 * Thrown when a badge operation (suspend, expire) targets a
 * (listingId, dimensionType) row that does not exist.
 *
 * <p>Maps to 404 Not Found via the global exception handler.
 */
public class BadgeNotFoundException extends RuntimeException {

    public BadgeNotFoundException(UUID listingId, String dimensionType) {
        super(String.format(
                "Badge not found for listing %s dimension %s — cannot mutate a badge that was never granted",
                listingId, dimensionType));
    }
}

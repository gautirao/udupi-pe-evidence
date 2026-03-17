package com.example.realestate.listing.exception;

import java.util.UUID;

/**
 * Thrown when an admin attempts to restore a listing that is not currently archived.
 * Maps to HTTP 409 Conflict.
 */
public class ListingNotArchivedException extends RuntimeException {
    public ListingNotArchivedException(UUID id) {
        super("Listing is not archived: " + id);
    }
}

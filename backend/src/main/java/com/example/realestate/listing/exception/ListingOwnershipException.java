package com.example.realestate.listing.exception;

import java.util.UUID;

public class ListingOwnershipException extends RuntimeException {
    public ListingOwnershipException(UUID id) {
        super("Listing not owned by caller: " + id);
    }
}

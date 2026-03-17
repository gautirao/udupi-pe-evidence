package com.example.realestate.listing.exception;

import java.util.List;
import java.util.Map;

public class ListingValidationException extends RuntimeException {
    private final List<Map<String, String>> errors;

    public ListingValidationException(List<Map<String, String>> errors) {
        super("Listing validation failed");
        this.errors = errors;
    }

    public List<Map<String, String>> getErrors() {
        return errors;
    }
}

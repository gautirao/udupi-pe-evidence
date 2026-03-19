package com.example.realestate.listing.exception;

/**
 * Typed exception for listing lifecycle errors, carrying a structured {@link ListingErrorCode}.
 *
 * <p><strong>Important:</strong> This does NOT extend {@link ListingStatusException}.
 * Existing controllers catch {@code ListingStatusException} inline; extending it would
 * cause those catch blocks to intercept this exception before the global handler sees it.</p>
 */
public class ListingLifecycleException extends RuntimeException {

    private final ListingErrorCode code;

    public ListingLifecycleException(ListingErrorCode code, String message) {
        super(message);
        this.code = code;
    }

    public ListingErrorCode getCode() {
        return code;
    }
}

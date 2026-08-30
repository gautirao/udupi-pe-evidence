package com.example.realestate.listing.exception;

import java.util.List;

/**
 * Typed exception for listing lifecycle errors, carrying a structured {@link ListingErrorCode}.
 *
 * <p><strong>Important:</strong> This does NOT extend {@link ListingStatusException}.
 * Existing controllers catch {@code ListingStatusException} inline; extending it would
 * cause those catch blocks to intercept this exception before the global handler sees it.</p>
 */
public class ListingLifecycleException extends RuntimeException {

    private final ListingErrorCode code;
    private final List<String> changedFields; // null when not applicable

    public ListingLifecycleException(ListingErrorCode code, String message) {
        super(message);
        this.code = code;
        this.changedFields = null;
    }

    public ListingLifecycleException(ListingErrorCode code, String message, List<String> changedFields) {
        super(message);
        this.code = code;
        this.changedFields = changedFields;
    }

    public ListingErrorCode getCode() {
        return code;
    }

    public List<String> getChangedFields() {
        return changedFields;
    }
}

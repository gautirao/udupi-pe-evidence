package com.example.realestate.listing.exception;

/**
 * Structured error codes for listing lifecycle operations (spec §16.3).
 * Each code carries a default HTTP status used by the global exception handler.
 */
public enum ListingErrorCode {

    TRANSITION_NOT_ALLOWED(422),
    STATUS_CONFLICT(409),
    LISTING_INCOMPLETE(422),
    REASON_CODE_REQUIRED(422),
    FAST_RESTORE_NOT_ELIGIBLE(422),
    SUBMISSION_ALREADY_ACTIONED(409),
    RETURN_NOTE_REQUIRED(422),
    ALREADY_CLAIMED(409),
    LISTING_NOT_CLAIMED(422),
    MODERATION_NOTE_REQUIRED(422);

    private final int httpStatus;

    ListingErrorCode(int httpStatus) {
        this.httpStatus = httpStatus;
    }

    public int getHttpStatus() {
        return httpStatus;
    }
}

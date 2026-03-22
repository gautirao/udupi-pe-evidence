package com.example.realestate.trust;

/**
 * Thrown when a photo verification submission is attempted but the PHOTOS badge
 * is already in PENDING or EARNED state for the given listing.
 */
public class PhotoAlreadySubmittedException extends RuntimeException {

    private final String currentState;

    public PhotoAlreadySubmittedException(String currentState) {
        super("PHOTOS badge is already " + currentState);
        this.currentState = currentState;
    }

    public String getCurrentState() {
        return currentState;
    }
}

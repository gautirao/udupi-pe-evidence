package com.example.realestate.trust;

/**
 * Thrown when an authority mandate submission is attempted but the AUTHORITY badge
 * is already in PENDING or EARNED state for the given listing.
 */
public class AuthorityMandateAlreadySubmittedException extends RuntimeException {

    private final String currentState;

    public AuthorityMandateAlreadySubmittedException(String currentState) {
        super("Authority mandate already " + currentState.toLowerCase());
        this.currentState = currentState;
    }

    public String getCurrentState() {
        return currentState;
    }
}

package com.example.realestate.trust;

/**
 * Thrown when an identity verification attempt is made but the IDENTITY badge
 * is already EARNED for the given listing.
 */
public class IdentityAlreadyVerifiedException extends RuntimeException {

    public IdentityAlreadyVerifiedException() {
        super("IDENTITY badge is already EARNED");
    }
}

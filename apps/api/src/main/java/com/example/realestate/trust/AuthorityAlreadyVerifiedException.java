package com.example.realestate.trust;

/**
 * Thrown when an authority verification attempt is made but the AUTHORITY badge
 * is already EARNED for the given listing.
 */
public class AuthorityAlreadyVerifiedException extends RuntimeException {

    public AuthorityAlreadyVerifiedException() {
        super("Authority already verified");
    }
}

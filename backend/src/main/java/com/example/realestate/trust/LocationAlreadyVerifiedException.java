package com.example.realestate.trust;

/**
 * Thrown when a location verification attempt is made but the LOCATION badge
 * is already EARNED for the given listing.
 */
public class LocationAlreadyVerifiedException extends RuntimeException {

    public LocationAlreadyVerifiedException() {
        super("LOCATION badge is already EARNED");
    }
}

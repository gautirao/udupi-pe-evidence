package com.example.realestate.discover.citylaunch;

/** Thrown when a caller attempts to start a new city bootstrap for a name that already has
 *  an in-flight (RESOLVING or DISAMBIGUATION_REQUIRED) job (#2676 Slice A). Mirrors {@link
 *  CityPreparationConflictException}'s 409 shape. */
public class CityBootstrapConflictException extends RuntimeException {
    public CityBootstrapConflictException(String message) {
        super(message);
    }
}

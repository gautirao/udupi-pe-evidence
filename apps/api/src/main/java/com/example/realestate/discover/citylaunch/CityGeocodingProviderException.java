package com.example.realestate.discover.citylaunch;

/** Thrown by a {@link CityGeocodingProvider} when the lookup itself fails (network/5xx/etc.),
 *  as distinct from a successful lookup that simply found zero candidates (#2676 Slice A). */
public class CityGeocodingProviderException extends RuntimeException {
    public CityGeocodingProviderException(String message, Throwable cause) {
        super(message, cause);
    }
}

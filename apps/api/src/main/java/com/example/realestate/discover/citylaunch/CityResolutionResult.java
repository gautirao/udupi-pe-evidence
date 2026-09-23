package com.example.realestate.discover.citylaunch;

import java.util.List;

/**
 * Outcome of {@link CityNameResolutionService#resolve}. Exactly one of the {@code *()}
 * factory methods below produces any given instance; {@link #kind()} tells the caller which
 * fields are populated (#2676 Slice A).
 */
public final class CityResolutionResult {

    public enum Kind { EXISTING_CITY, SINGLE_CANDIDATE, DISAMBIGUATION_REQUIRED, NOT_FOUND, PROVIDER_FAILURE }

    private final Kind kind;
    private final Integer existingCityId;
    private final GeocodeCandidate singleCandidate;
    private final List<GeocodeCandidate> candidates;
    private final String failureMessage;

    private CityResolutionResult(Kind kind, Integer existingCityId, GeocodeCandidate singleCandidate,
                                  List<GeocodeCandidate> candidates, String failureMessage) {
        this.kind = kind;
        this.existingCityId = existingCityId;
        this.singleCandidate = singleCandidate;
        this.candidates = candidates;
        this.failureMessage = failureMessage;
    }

    public static CityResolutionResult existingCity(int cityId) {
        return new CityResolutionResult(Kind.EXISTING_CITY, cityId, null, null, null);
    }

    public static CityResolutionResult singleCandidate(GeocodeCandidate candidate) {
        return new CityResolutionResult(Kind.SINGLE_CANDIDATE, null, candidate, null, null);
    }

    public static CityResolutionResult disambiguationRequired(List<GeocodeCandidate> candidates) {
        return new CityResolutionResult(Kind.DISAMBIGUATION_REQUIRED, null, null, candidates, null);
    }

    public static CityResolutionResult notFound() {
        return new CityResolutionResult(Kind.NOT_FOUND, null, null, null, null);
    }

    public static CityResolutionResult providerFailure(String message) {
        return new CityResolutionResult(Kind.PROVIDER_FAILURE, null, null, null, message);
    }

    public Kind kind() { return kind; }
    public Integer existingCityId() { return existingCityId; }
    public GeocodeCandidate singleCandidate() { return singleCandidate; }
    public List<GeocodeCandidate> candidates() { return candidates; }
    public String failureMessage() { return failureMessage; }
}

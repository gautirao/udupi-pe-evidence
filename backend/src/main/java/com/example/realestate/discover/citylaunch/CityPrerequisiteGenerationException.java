package com.example.realestate.discover.citylaunch;

/**
 * Thrown by {@link CityLaunchPreparationService#prepare} when {@code prepare()} attempts to
 * self-materialize a city's canonical geography prerequisites (#2163) — classification backfill
 * and/or {@code CityRegionOnboardingService.apply()} — and cannot proceed safely.
 *
 * <p>{@code reason} uses the same vocabulary as {@link
 * com.example.realestate.discover.RegionOnboardingBlockedException.Reason} (its {@code name()}),
 * plus one additional value not produced by that exception: {@code "NO_ACTIVE_AREAS"}, used when
 * the city has zero ACTIVE areas and prerequisite generation cannot even begin.
 */
public class CityPrerequisiteGenerationException extends RuntimeException {

    private final String reason;
    private final String remediation;

    public CityPrerequisiteGenerationException(String reason, String message, String remediation) {
        super(message);
        this.reason = reason;
        this.remediation = remediation;
    }

    public String reason() {
        return reason;
    }

    public String remediation() {
        return remediation;
    }
}

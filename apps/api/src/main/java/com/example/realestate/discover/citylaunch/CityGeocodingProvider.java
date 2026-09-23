package com.example.realestate.discover.citylaunch;

import java.util.List;

/**
 * Resolves a free-text city name into zero, one, or many real-world place candidates
 * (#2676 Slice A).
 *
 * <p>Kept as an interface, injected into {@link CityNameResolutionService}, specifically so
 * the concrete provider is swappable without touching orchestration logic — see {@link
 * NominatimGeocodingProvider}'s javadoc for why that default was chosen for Slice A and why
 * it's flagged as a Clarification on the Slice A PR rather than treated as a closed decision.
 */
public interface CityGeocodingProvider {

    /**
     * @param query free-text city name as typed by the admin (already trimmed, not yet
     *              lower-cased/normalized — providers generally want natural casing)
     * @return candidates ordered by the provider's own relevance ranking; empty if nothing
     *     plausible matched. Never throws for "no results" — only for a genuine provider
     *     failure (network/5xx/malformed response), which the caller treats as a workflow
     *     stop with an actionable reason, never as "zero candidates".
     */
    List<GeocodeCandidate> search(String query);
}

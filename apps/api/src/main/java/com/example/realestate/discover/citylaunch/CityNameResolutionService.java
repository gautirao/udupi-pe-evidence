package com.example.realestate.discover.citylaunch;

import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Resolves a free-text city name to either an existing canonical city, a single unambiguous
 * new candidate, a set of candidates requiring explicit operator disambiguation, or "not
 * found" (#2676 Slice A).
 *
 * <p>Existing-city matching is checked FIRST and never triggers a geocoding call — this is
 * the "no duplicate canonical cities" guarantee (#2676 AC) and, incidentally, means resolving
 * an already-known city name (Bangalore/Udupi/Mangalore/Kundapur, or any city created by a
 * previous bootstrap job) never depends on external network access at all.
 */
@Service
public class CityNameResolutionService {

    private static final Pattern NON_ALNUM = Pattern.compile("[^a-z0-9]+");

    private static final String FIND_CITY_BY_SLUG_SQL =
            "SELECT id FROM public.cities WHERE slug = ?";

    private final JdbcOperations jdbcOperations;
    private final CityGeocodingProvider geocodingProvider;

    public CityNameResolutionService(JdbcOperations jdbcOperations, CityGeocodingProvider geocodingProvider) {
        this.jdbcOperations = jdbcOperations;
        this.geocodingProvider = geocodingProvider;
    }

    /** Lower-case, trim, collapse to hyphen-separated tokens — the same shape as this
     *  codebase's existing city slugs (bangalore/mangalore/udupi/kundapur). */
    public static String normalizeToSlug(String rawName) {
        String lower = rawName.trim().toLowerCase(Locale.ROOT);
        String hyphenated = NON_ALNUM.matcher(lower).replaceAll("-");
        return hyphenated.replaceAll("^-+|-+$", "");
    }

    public CityResolutionResult resolve(String rawName) {
        String slug = normalizeToSlug(rawName);
        Optional<Integer> existing = findExistingCityIdBySlug(slug);
        if (existing.isPresent()) {
            return CityResolutionResult.existingCity(existing.get());
        }

        List<GeocodeCandidate> candidates;
        try {
            candidates = geocodingProvider.search(rawName.trim());
        } catch (CityGeocodingProviderException e) {
            return CityResolutionResult.providerFailure(e.getMessage());
        }

        if (candidates.isEmpty()) {
            return CityResolutionResult.notFound();
        }
        if (candidates.size() == 1) {
            return CityResolutionResult.singleCandidate(candidates.get(0));
        }
        return CityResolutionResult.disambiguationRequired(candidates);
    }

    private Optional<Integer> findExistingCityIdBySlug(String slug) {
        List<Integer> ids = jdbcOperations.query(
                FIND_CITY_BY_SLUG_SQL, (rs, rowNum) -> rs.getInt("id"), slug);
        return ids.stream().findFirst();
    }
}

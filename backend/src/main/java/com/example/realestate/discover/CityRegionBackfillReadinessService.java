package com.example.realestate.discover;

import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Read model identifying cities that opted into region onboarding (a {@code city_region_policy}
 * row from V113) but have never had that onboarding applied ({@code city_regions} is empty for
 * that city) — the operational gap behind #1907 (Discover map showing all areas instead of
 * region bubbles because {@link CityRegionOnboardingRunner} was never run for a city).
 *
 * <p>Single shared query, consumed by both {@link CityRegionBackfillReadinessHealthIndicator}
 * (exposes the current list at {@code /actuator/health/cityRegionBackfill}) and
 * {@link CityRegionBackfillReadinessScheduler} (periodic WARN log + Micrometer gauge) so neither
 * caller re-derives the "stale" definition independently.
 *
 * <p>Read-only — never writes to {@code city_regions}/{@code city_region_memberships}. Does not
 * trigger onboarding; see {@code docs/ops/city-region-onboarding-recovery.md} for the manual
 * recovery procedure.
 */
@Service
public class CityRegionBackfillReadinessService {

    private final JdbcOperations jdbcOperations;

    public CityRegionBackfillReadinessService(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    /**
     * Returns the slugs of cities that have a {@code city_region_policy} row (the per-city
     * opt-in signal) but zero {@code city_regions} rows — i.e. the policy was seeded but
     * {@code CityRegionOnboardingService.apply(cityId)} has never successfully run for that
     * city. Empty list means every opted-in city has been onboarded.
     */
    @Transactional(readOnly = true)
    public List<String> findCitiesPendingBackfill() {
        return jdbcOperations.queryForList("""
                SELECT c.slug
                FROM city_region_policy p
                JOIN cities c ON c.id = p.city_id
                LEFT JOIN city_regions cr ON cr.city_id = p.city_id
                WHERE cr.city_id IS NULL
                ORDER BY c.slug
                """, String.class);
    }
}

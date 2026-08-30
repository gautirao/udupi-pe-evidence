package com.example.realestate.discover;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Periodic operational check for #1907: cities whose {@code city_region_policy} row (V113) was
 * seeded but were never onboarded ({@code city_regions} still empty for that city), using the
 * same {@link CityRegionBackfillReadinessService} query as
 * {@link CityRegionBackfillReadinessHealthIndicator}.
 *
 * <p>Runs every 6 hours (00:00/06:00/12:00/18:00 UTC) — this is a low-urgency, human-remediated
 * gap (see {@code docs/ops/city-region-onboarding-recovery.md}), not a fast-changing signal, so a
 * frequent schedule adds no value.
 *
 * <p>{@code @EnableScheduling} is already present on
 * {@link com.example.realestate.RealEstateApplication}; no duplicate needed.
 *
 * <p>DB errors are logged and swallowed, never rethrown — mirrors
 * {@link CityRegionOnboardingRunner}'s "log and continue" convention; a failed readiness check
 * must not affect application health. On failure, the {@code discover.city_region_backfill.stale_cities}
 * gauge is deliberately left at its last-known value rather than reset to 0 — a query failure is
 * not evidence that the stale-city count is zero.
 *
 * <p>Also runs once at application startup (on {@link ApplicationReadyEvent}), in addition to the
 * 6-hourly cron schedule. Without this, the gauge sits at its initial value of 0 — i.e. reports
 * "healthy" — for up to 6 hours after every deploy/restart, even when cities are genuinely stale.
 * The gauge is the primary alerting signal for this feature (unlike
 * {@link CityRegionBackfillReadinessHealthIndicator}, which queries live on every health check),
 * so it must reflect reality immediately after startup, not just after the first cron fire.
 */
@Component
public class CityRegionBackfillReadinessScheduler {

    private static final Logger log = LoggerFactory.getLogger(CityRegionBackfillReadinessScheduler.class);

    /**
     * Metric name. Type: gauge. Tags: (none — low cardinality, no per-city tags). Reports the
     * count of cities currently pending city-region backfill, as of the last successful run.
     */
    static final String STALE_CITIES_METRIC = "discover.city_region_backfill.stale_cities";

    private final CityRegionBackfillReadinessService readinessService;
    private final AtomicInteger staleCityCount = new AtomicInteger(0);

    public CityRegionBackfillReadinessScheduler(CityRegionBackfillReadinessService readinessService,
                                                 MeterRegistry meterRegistry) {
        this.readinessService = readinessService;
        Gauge.builder(STALE_CITIES_METRIC, staleCityCount, AtomicInteger::get)
                .description("Cities with a city_region_policy row but zero city_regions rows (#1907) — "
                        + "map falls back to showing individual areas instead of region bubbles for these "
                        + "cities. Recovery: docs/ops/city-region-onboarding-recovery.md. Must stay at 0 in "
                        + "steady state; left at its last-known value if a readiness check fails.")
                .register(meterRegistry);
    }

    @EventListener(ApplicationReadyEvent.class)
    @Scheduled(cron = "0 0 */6 * * *", zone = "UTC")
    public void checkBackfillReadiness() {
        try {
            List<String> staleCities = readinessService.findCitiesPendingBackfill();
            staleCityCount.set(staleCities.size());
            for (String citySlug : staleCities) {
                log.warn("CityRegionBackfillReadinessScheduler: citySlug={} has a city_region_policy row but "
                                + "zero city_regions rows — Discover map falls back to individual areas instead of "
                                + "region bubbles for this city. Recovery procedure: "
                                + "docs/ops/city-region-onboarding-recovery.md",
                        citySlug);
            }
        } catch (Exception e) {
            log.error("CityRegionBackfillReadinessScheduler: readiness check failed — leaving stale-city "
                    + "gauge at last-known value ({})", staleCityCount.get(), e);
        }
    }
}

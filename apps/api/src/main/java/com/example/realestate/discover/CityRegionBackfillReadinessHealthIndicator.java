package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Exposes {@link CityRegionBackfillReadinessService}'s stale-city list at a stable, queryable
 * endpoint ({@code /actuator/health/cityRegionBackfill}, see {@code application.yml}'s
 * {@code management.endpoint.health.group.cityRegionBackfill} config) for #1907.
 *
 * <p><b>{@link #health()} ALWAYS returns {@link Health#up()} — never {@code down()} — even when
 * the underlying query throws.</b> This is deliberate, not an oversight. Spring Boot does not
 * cleanly support excluding a registered {@link HealthIndicator} from the root
 * {@code /actuator/health} aggregate via configuration alone: any contributor that reports
 * {@code DOWN} pulls the aggregate status down with it, which would make a historical,
 * human-remediated data gap look like a liveness/readiness failure. Always-UP is the structural
 * guarantee that this signal can never affect the aggregate status — it exists purely to expose
 * queryable detail (the {@code staleCities} list) at a stable path. Real alerting on this signal
 * happens via the {@code discover.city_region_backfill.stale_cities} Micrometer gauge and the
 * periodic WARN log emitted by {@link CityRegionBackfillReadinessScheduler}, both of which are
 * designed for threshold-based alerting — not this indicator's health status.
 *
 * <p>Bean name resolves to the {@code cityRegionBackfillReadiness} contributor id via Spring
 * Boot's default class-name-stripping convention ({@code HealthContributorNameFactory} strips the
 * {@code HealthIndicator} suffix from the bean name {@code cityRegionBackfillReadinessHealthIndicator}
 * and decapitalizes the remainder) — no explicit bean name needed.
 */
@Component
public class CityRegionBackfillReadinessHealthIndicator implements HealthIndicator {

    private static final Logger log = LoggerFactory.getLogger(CityRegionBackfillReadinessHealthIndicator.class);

    private final CityRegionBackfillReadinessService readinessService;

    public CityRegionBackfillReadinessHealthIndicator(CityRegionBackfillReadinessService readinessService) {
        this.readinessService = readinessService;
    }

    @Override
    public Health health() {
        try {
            List<String> staleCities = readinessService.findCitiesPendingBackfill();
            return Health.up()
                    .withDetail("checkStatus", "OK")
                    .withDetail("staleCities", staleCities)
                    .withDetail("staleCityCount", staleCities.size())
                    .build();
        } catch (Exception e) {
            // Never propagate or report DOWN — see class Javadoc. checkStatus="ERROR" is the
            // explicit signal that the readiness query itself failed (count unknown) —
            // distinct from a genuine checkStatus="OK"/staleCityCount=0 (no backfill needed).
            // staleCityCount=-1 is kept alongside as a legacy sentinel for existing consumers,
            // but checkStatus is the field to check first: it doesn't require knowing that -1
            // means "failed" as tribal knowledge.
            log.error("CityRegionBackfillReadinessHealthIndicator: readiness query failed — "
                    + "reporting UP with unknown detail (never DOWN)", e);
            return Health.up()
                    .withDetail("checkStatus", "ERROR")
                    .withDetail("staleCities", List.of())
                    .withDetail("staleCityCount", -1)
                    .withDetail("error", "readiness query failed — see application logs")
                    .build();
        }
    }
}

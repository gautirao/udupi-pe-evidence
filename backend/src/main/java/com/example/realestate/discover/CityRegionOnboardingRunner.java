package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Component;

/**
 * ApplicationRunner that triggers city-region onboarding (dry-run or apply) on startup (#1882).
 *
 * <p>Gated by {@code app.city-region-onboarding.enabled=true} (default: false). The bean is not
 * created at all when the property is absent or false, so there is zero startup overhead in
 * normal operation — mirrors {@link RegionalClassificationBackfillRunner}.
 *
 * <p>Configuration:
 * <ul>
 *   <li>{@code app.city-region-onboarding.mode} — {@code "dry-run"} (default) or {@code "apply"}.</li>
 *   <li>{@code app.city-region-onboarding.city-slug} — the target city's slug (required).</li>
 * </ul>
 *
 * <p>There is NO HTTP endpoint for this runner. Errors are logged, never rethrown — a failed
 * onboarding attempt must not prevent the application from starting.
 */
@Component
@ConditionalOnProperty(
        prefix = "app.city-region-onboarding",
        name = "enabled",
        havingValue = "true",
        matchIfMissing = false
)
public class CityRegionOnboardingRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(CityRegionOnboardingRunner.class);

    private final CityRegionOnboardingService onboardingService;
    private final JdbcOperations jdbcOperations;
    private final String mode;
    private final String citySlug;

    public CityRegionOnboardingRunner(
            CityRegionOnboardingService onboardingService,
            JdbcOperations jdbcOperations,
            @Value("${app.city-region-onboarding.mode:dry-run}") String mode,
            @Value("${app.city-region-onboarding.city-slug:}") String citySlug) {
        this.onboardingService = onboardingService;
        this.jdbcOperations = jdbcOperations;
        this.mode = mode;
        this.citySlug = citySlug;
    }

    @Override
    public void run(ApplicationArguments args) {
        log.info("CityRegionOnboardingRunner: app.city-region-onboarding.enabled=true mode={} citySlug={} — starting",
                mode, citySlug);
        try {
            if (citySlug == null || citySlug.isBlank()) {
                log.error("CityRegionOnboardingRunner: app.city-region-onboarding.city-slug is required — skipping");
                return;
            }

            Integer cityId = jdbcOperations.query(
                    "SELECT id FROM cities WHERE slug = ?",
                    rs -> rs.next() ? rs.getInt("id") : null,
                    citySlug);

            if (cityId == null) {
                log.error("CityRegionOnboardingRunner: no city found for slug={} — skipping", citySlug);
                return;
            }

            if ("apply".equalsIgnoreCase(mode)) {
                onboardingService.apply(cityId);
                log.info("CityRegionOnboardingRunner: apply completed cityId={} slug={}", cityId, citySlug);
            } else {
                CityRegionOnboardingReport report = onboardingService.dryRun(cityId);
                log.info("CityRegionOnboardingRunner: dry-run cityId={} slug={} regionModel={} "
                                + "classificationsPresent={} areaProjections={} groups={}",
                        cityId, citySlug, report.regionModel(), report.classificationsPresent(),
                        report.areaProjections().size(), report.groupCategorizations().size());
                report.groupCategorizations().stream()
                        .filter(g -> g.category() != CityRegionOnboardingReport.GroupCategory.UNIFIED)
                        .forEach(g -> log.warn("CityRegionOnboardingRunner: dry-run group={} category={} regions={}",
                                g.groupSlug(), g.category(), g.distinctRegionKeys()));
            }
        } catch (Exception e) {
            // Log and allow application to continue — onboarding failure is not fatal.
            log.error("CityRegionOnboardingRunner: onboarding failed for slug={} mode={} — application continues",
                    citySlug, mode, e);
        }
    }
}

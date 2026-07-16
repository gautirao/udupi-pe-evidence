package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * ApplicationRunner that triggers the regional classification backfill on startup.
 *
 * <p>Gated by {@code app.regional-classification.backfill-enabled=true} (default: false).
 * The bean is not created at all when the property is absent or false, so there is
 * zero startup overhead in normal operation.
 *
 * <p>Optionally scoped to a single city via {@code app.regional-classification.city-slug}
 * (default: empty/unset, which processes all active cities). Set this when running the
 * backfill against production to fix a specific city's stale classifications without
 * touching every other city.
 *
 * <p>There is NO HTTP endpoint for this runner. To trigger a backfill, set the
 * property to true and restart the application (or use an admin tool outside this
 * service — an admin endpoint would require auth hardening out of scope here).
 */
@Component
@ConditionalOnProperty(
        prefix = "app.regional-classification",
        name = "backfill-enabled",
        havingValue = "true",
        matchIfMissing = false
)
public class RegionalClassificationBackfillRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(RegionalClassificationBackfillRunner.class);

    private final RegionalClassificationBackfillService backfillService;
    private final String citySlug;

    public RegionalClassificationBackfillRunner(
            RegionalClassificationBackfillService backfillService,
            @Value("${app.regional-classification.city-slug:}") String citySlug) {
        this.backfillService = backfillService;
        this.citySlug = citySlug;
    }

    @Override
    public void run(ApplicationArguments args) {
        boolean scoped = citySlug != null && !citySlug.isBlank();
        if (scoped) {
            log.info("RegionalClassificationBackfillRunner: app.regional-classification.backfill-enabled=true — "
                    + "starting, scoped to city={}", citySlug);
        } else {
            log.info("RegionalClassificationBackfillRunner: app.regional-classification.backfill-enabled=true — "
                    + "starting, processing all active cities");
        }
        try {
            int upserted = backfillService.runBackfill(citySlug);
            log.info("RegionalClassificationBackfillRunner: completed upserted={}", upserted);
        } catch (Exception e) {
            // Log and allow application to continue — backfill failure is not fatal.
            log.error("RegionalClassificationBackfillRunner: backfill failed — application continues", e);
        }
    }
}

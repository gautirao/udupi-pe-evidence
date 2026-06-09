package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

    public RegionalClassificationBackfillRunner(RegionalClassificationBackfillService backfillService) {
        this.backfillService = backfillService;
    }

    @Override
    public void run(ApplicationArguments args) {
        log.info("RegionalClassificationBackfillRunner: app.regional-classification.backfill-enabled=true — starting");
        try {
            int upserted = backfillService.runBackfill();
            log.info("RegionalClassificationBackfillRunner: completed upserted={}", upserted);
        } catch (Exception e) {
            // Log and allow application to continue — backfill failure is not fatal.
            log.error("RegionalClassificationBackfillRunner: backfill failed — application continues", e);
        }
    }
}

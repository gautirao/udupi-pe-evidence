package com.example.realestate.analytics;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.time.LocalDate;

/**
 * One-shot backfill runner activated via {@code --spring.profiles.active=backfill}.
 * Recomputes all rollup rows from 2020-01-01 onward so that existing data
 * gains property_type-segmented rows after the V21 migration.
 *
 * Run once: {@code mvn spring-boot:run -Dspring-boot.run.profiles=backfill}
 */
@Component
@Profile("backfill")
public class BackfillRollupRunner implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(BackfillRollupRunner.class);

    private static final LocalDate BACKFILL_FROM = LocalDate.of(2020, 1, 1);

    private final AreaPriceWeeklyRollupJob weeklyRollupJob;
    private final AreaStatsLatestRollupJob statsRollupJob;

    public BackfillRollupRunner(AreaPriceWeeklyRollupJob weeklyRollupJob,
                                AreaStatsLatestRollupJob statsRollupJob) {
        this.weeklyRollupJob = weeklyRollupJob;
        this.statsRollupJob = statsRollupJob;
    }

    @Override
    public void run(String... args) {
        log.info("BackfillRollupRunner starting — recomputing property_type rollups from {}", BACKFILL_FROM);
        int weeklyRows = weeklyRollupJob.computeRollupsFromDate(BACKFILL_FROM);
        int statsRows = statsRollupJob.computeStatsFromDate(BACKFILL_FROM);
        log.info("BackfillRollupRunner complete weeklyRows={} statsRows={}", weeklyRows, statsRows);
    }
}

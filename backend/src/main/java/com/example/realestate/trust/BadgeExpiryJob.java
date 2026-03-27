package com.example.realestate.trust;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;

/**
 * Nightly scheduled job that revokes trust badges whose TTL has elapsed.
 *
 * <p>Runs daily at 02:00 UTC. TTL rules by dimension type:
 * <ul>
 *   <li>LOCATION  — expires after 548 days (18 months)</li>
 *   <li>PHOTOS    — expires after 548 days (18 months)</li>
 *   <li>AUTHORITY — expires after 365 days (12 months)</li>
 *   <li>IDENTITY  — never expires (excluded from all queries)</li>
 * </ul>
 *
 * <p>Only EARNED badges are considered; badges already in EXPIRED, SUSPENDED,
 * PENDING, FAILED, or AVAILABLE state are unaffected.
 *
 * <p>The update is idempotent: running the job twice within the same day has
 * the same net effect as running it once, because the second run finds no
 * EARNED rows past the cutoff (they were already flipped to EXPIRED).
 */
@Component
public class BadgeExpiryJob {

    private static final Logger log = LoggerFactory.getLogger(BadgeExpiryJob.class);

    /** Days after grant_at after which LOCATION badges expire. */
    static final int LOCATION_TTL_DAYS = 548;

    /** Days after grant_at after which PHOTOS badges expire. */
    static final int PHOTOS_TTL_DAYS = 548;

    /** Days after grant_at after which AUTHORITY badges expire. */
    static final int AUTHORITY_TTL_DAYS = 365;

    private final ListingVerificationDimensionRepository dimensionRepository;

    public BadgeExpiryJob(ListingVerificationDimensionRepository dimensionRepository) {
        this.dimensionRepository = dimensionRepository;
    }

    /**
     * Executes the badge expiry sweep.
     *
     * <p>Runs in a single transaction so all three dimension updates share the same
     * commit point. A failure in any update rolls back all three, leaving the table
     * in a consistent state for the next run.
     */
    @Scheduled(cron = "0 0 2 * * *")
    @Transactional
    public void expireOverdueBadges() {
        OffsetDateTime now = OffsetDateTime.now();

        int locationExpired = dimensionRepository.expireEarnedBadgesOlderThan(
                "LOCATION",
                now.minusDays(LOCATION_TTL_DAYS),
                now);

        int photosExpired = dimensionRepository.expireEarnedBadgesOlderThan(
                "PHOTOS",
                now.minusDays(PHOTOS_TTL_DAYS),
                now);

        int authorityExpired = dimensionRepository.expireEarnedBadgesOlderThan(
                "AUTHORITY",
                now.minusDays(AUTHORITY_TTL_DAYS),
                now);

        log.info("BadgeExpiryJob: expired {} LOCATION, {} PHOTOS, {} AUTHORITY badges",
                locationExpired, photosExpired, authorityExpired);
    }
}

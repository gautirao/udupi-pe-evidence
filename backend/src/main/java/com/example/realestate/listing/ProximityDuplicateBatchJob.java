package com.example.realestate.listing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Nightly scheduled job that backfills proximity duplicate detection for LIVE listings
 * that existed before {@link ProximityDuplicateService} was introduced.
 *
 * <p>The {@code approveListing} hook covers all new approvals going forward.
 * This job handles the historical backlog: LIVE listings approved before that hook shipped.
 *
 * <p>Listings are fetched in pages of {@value #PAGE_SIZE} to avoid materialising an
 * unbounded result set in heap. Each listing is processed in its own
 * {@link Propagation#REQUIRES_NEW} transaction (owned by
 * {@link ProximityDuplicateService#detectAndRecord}). Failures on individual listings
 * are caught and logged; processing continues to the next listing.
 *
 * <p>{@link Propagation#NEVER} on {@link #runBatch()} enforces that this method must not
 * be called from within an active transaction — doing so would conflict with the
 * {@code REQUIRES_NEW} propagation inside {@code detectAndRecord}.
 */
@Component
public class ProximityDuplicateBatchJob {

    private static final Logger log = LoggerFactory.getLogger(ProximityDuplicateBatchJob.class);

    static final int PAGE_SIZE = 500;

    private final ListingRepository listingRepository;
    private final ProximityDuplicateService proximityDuplicateService;

    public ProximityDuplicateBatchJob(
            ListingRepository listingRepository,
            ProximityDuplicateService proximityDuplicateService) {
        this.listingRepository = listingRepository;
        this.proximityDuplicateService = proximityDuplicateService;
    }

    /**
     * Runs nightly at 02:00 UTC by default; override via {@code proximity.batch.cron} property.
     *
     * <p>Fetches all LIVE, non-archived, geo-coded, non-duplicate listings in pages and calls
     * {@link ProximityDuplicateService#detectAndRecord(Listing)} for each one.
     * Exceptions from individual listings are caught, logged at WARN, and skipped —
     * the job continues to process the remaining listings.
     *
     * <p>Must NOT be called from within an active transaction ({@link Propagation#NEVER}).
     */
    @Scheduled(cron = "${proximity.batch.cron:0 0 2 * * *}")
    @Transactional(propagation = Propagation.NEVER)
    public void runBatch() {
        long startMs = System.currentTimeMillis();
        log.info("ProximityDuplicateBatchJob starting");

        int processed = 0;
        int skipped = 0;
        int pageNum = 0;

        try {
            Page<Listing> page;
            do {
                page = listingRepository.findAllLiveWithCoordinates(
                        PageRequest.of(pageNum, PAGE_SIZE));

                if (pageNum == 0) {
                    log.info("ProximityDuplicateBatchJob: {} total LIVE listings to scan",
                            page.getTotalElements());
                }

                for (Listing listing : page.getContent()) {
                    try {
                        proximityDuplicateService.detectAndRecord(listing);
                        processed++;
                    } catch (Exception e) {
                        skipped++;
                        log.warn("ProximityDuplicateBatchJob: detection failed for listingId={}, skipping",
                                listing.getId(), e);
                    }
                }
                pageNum++;
            } while (page.hasNext());

        } catch (Exception e) {
            log.error("ProximityDuplicateBatchJob: failed to fetch listings page={}, aborting run — elapsedMs={}",
                    pageNum, System.currentTimeMillis() - startMs, e);
            return;
        }

        log.info("ProximityDuplicateBatchJob complete: processed={} skipped={} elapsedMs={}",
                processed, skipped, System.currentTimeMillis() - startMs);
    }
}

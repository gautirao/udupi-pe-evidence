package com.example.realestate.quality;

import com.example.realestate.broker.dto.ListingQualityItem;
import com.example.realestate.broker.dto.ListingQualityResponse;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Service for the broker listing-quality page.
 *
 * <p>Reads quality data from the already-persisted columns
 * ({@code quality_score}, {@code quality_breakdown}, {@code quality_computed_at})
 * for <em>all</em> non-archived listings owned by the calling broker. Never recomputes
 * quality — this is a read-only consumer.
 *
 * <h3>Ownership boundary</h3>
 * Uses {@link ListingRepository#findByCreatedByAndArchivedAtIsNullOrderByCreatedAtDesc}
 * which filters by {@code created_by = :userId AND archived_at IS NULL}. The caller
 * must pass their own {@code userId} from the JWT — never a user-supplied ID.
 *
 * <h3>Aggregation</h3>
 * All aggregates span the full non-archived set (not a page). The listing list in the
 * response is also the full set ordered by {@code createdAt DESC}.
 */
@Service
public class ListingQualityService {

    private static final Logger log = LoggerFactory.getLogger(ListingQualityService.class);

    /**
     * Pageable used to fetch all non-archived listings for a broker.
     * Spring Data requires a Pageable even for unbounded queries via
     * {@code findByCreatedByAndArchivedAtIsNullOrderByCreatedAtDesc}.
     * 10 000 is a safe upper-bound for a single broker's listing portfolio.
     */
    private static final Pageable ALL_LISTINGS = PageRequest.of(0, 10_000);

    private final ListingRepository listingRepository;
    private final ListingQualityViewMapper mapper;

    public ListingQualityService(ListingRepository listingRepository,
                                  ListingQualityViewMapper mapper) {
        this.listingRepository = listingRepository;
        this.mapper = mapper;
    }

    /**
     * Builds the full listing-quality response for the given owner.
     *
     * @param ownerId The broker's user ID — must come from the JWT, never from a request param.
     * @return Fully-assembled {@link ListingQualityResponse}.
     */
    @Transactional(readOnly = true)
    public ListingQualityResponse getQualityPage(UUID ownerId) {
        List<Listing> rawListings = listingRepository
                .findByCreatedByAndArchivedAtIsNullOrderByCreatedAtDesc(ownerId, ALL_LISTINGS)
                .getContent();

        log.debug("getQualityPage ownerId={} listingCount={}", ownerId, rawListings.size());

        List<ListingQualityItem> items = new ArrayList<>(rawListings.size());
        for (Listing l : rawListings) {
            items.add(mapper.map(
                    l.getId(),
                    l.getTitle(),
                    l.getStatus(),
                    l.getQualityScore(),
                    l.getQualityBreakdown(),
                    l.getQualityComputedAt()
            ));
        }

        return buildResponse(items);
    }

    // -----------------------------------------------------------------------
    // Response assembly
    // -----------------------------------------------------------------------

    private static ListingQualityResponse buildResponse(List<ListingQualityItem> items) {
        int total = items.size();
        int scoredCount = 0;
        int buyerReady = 0;
        int needsImprovement = 0;
        int priorityFixBand = 0; // raw band count for filterCounts.priorityFix
        int notScored = 0;
        long scoreSum = 0L;
        int priorityFixDistinct = 0; // DISTINCT: band==PRIORITY_FIX OR >=1 HIGH fix

        for (ListingQualityItem item : items) {
            String band = item.band();
            switch (band) {
                case "BUYER_READY"       -> buyerReady++;
                case "NEEDS_IMPROVEMENT" -> needsImprovement++;
                case "PRIORITY_FIX"      -> priorityFixBand++;
                case "UNSCORED"          -> notScored++;
                default -> { /* defensive — no-op */ }
            }

            if ("SCORED".equals(item.scoreStatus())) {
                scoredCount++;
                scoreSum += item.qualityScore(); // qualityScore != null when SCORED
            }

            if (ListingQualityViewMapper.isPriorityFix(item)) {
                priorityFixDistinct++;
            }
        }

        // averageQuality: null when zero scored (never 0 or NaN)
        Double averageQuality = scoredCount > 0
                ? (double) scoreSum / scoredCount
                : null;

        String backfillStatus = (scoredCount == total) ? "COMPLETE" : "INCOMPLETE";

        ListingQualityResponse.BackfillStatus backfill =
                new ListingQualityResponse.BackfillStatus(backfillStatus, scoredCount, total);

        ListingQualityResponse.FilterCounts filterCounts =
                new ListingQualityResponse.FilterCounts(total, buyerReady, needsImprovement, priorityFixBand, notScored);

        ListingQualityResponse.Aggregates aggregates =
                new ListingQualityResponse.Aggregates(
                        averageQuality, buyerReady, needsImprovement, priorityFixDistinct, filterCounts);

        return new ListingQualityResponse(Instant.now(), backfill, aggregates, List.copyOf(items));
    }
}

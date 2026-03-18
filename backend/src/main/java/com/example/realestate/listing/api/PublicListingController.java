package com.example.realestate.listing.api;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.pricing.PriceChangeLog;
import com.example.realestate.listing.pricing.PriceChangeLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Public (unauthenticated) listing endpoints.
 * These paths are explicitly permitted in JwtConfig — no JWT is required.
 *
 * <p>CRITICAL: Only LIVE listings are exposed. Any other status returns 404
 * to prevent leaking DRAFT / PENDING_REVIEW / REJECTED / ARCHIVED data.
 */
@RestController
@RequestMapping("/api/public/listings")
public class PublicListingController {

    private static final Logger log = LoggerFactory.getLogger(PublicListingController.class);

    private final ListingRepository listingRepository;
    private final ListingResponseMapper listingResponseMapper;
    private final PriceChangeLogRepository priceChangeLogRepository;

    public PublicListingController(ListingRepository listingRepository,
                                   ListingResponseMapper listingResponseMapper,
                                   PriceChangeLogRepository priceChangeLogRepository) {
        this.listingRepository = listingRepository;
        this.listingResponseMapper = listingResponseMapper;
        this.priceChangeLogRepository = priceChangeLogRepository;
    }

    /**
     * Returns a LIVE listing by ID.
     * Returns 404 for any non-LIVE status (DRAFT, PENDING_REVIEW, REJECTED, ARCHIVED) or unknown ID.
     */
    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable UUID id) {
        Listing listing = listingRepository.findById(id).orElse(null);
        if (listing == null || !ListingStatus.LIVE.toDbValue().equals(listing.getStatus())) {
            return notFound();
        }

        log.debug("GET /api/public/listings/{} -> 200", id);
        return ResponseEntity.ok(listingResponseMapper.toPublicResponse(listing));
    }

    /**
     * Returns the price history for a LIVE listing, sorted oldest-first.
     * Returns 404 for unknown IDs, soft-deleted listings, or any non-LIVE status
     * (DRAFT, PENDING_REVIEW, REJECTED, ARCHIVED) — consistent with the detail endpoint.
     * Returns an empty array when no price changes have been recorded for the listing.
     */
    @GetMapping("/{id}/price-history")
    public ResponseEntity<?> getPriceHistory(@PathVariable UUID id) {
        Listing listing = listingRepository.findById(id).orElse(null);
        if (listing == null || !ListingStatus.LIVE.toDbValue().equals(listing.getStatus())) {
            return notFound();
        }

        List<PriceChangeLog> logs = priceChangeLogRepository.findByListingIdOrderByChangedAtAsc(id);
        List<PriceHistoryEntry> entries = buildPriceHistory(logs);
        return ResponseEntity.ok(entries);
    }

    // ===== Helpers =====

    private static ResponseEntity<Map<String, String>> notFound() {
        return ResponseEntity.status(404).body(Map.of("error", "Listing not found"));
    }

    private List<PriceHistoryEntry> buildPriceHistory(List<PriceChangeLog> logs) {
        List<PriceHistoryEntry> entries = new ArrayList<>(logs.size());
        for (PriceChangeLog pcl : logs) {
            BigDecimal newPriceRupees = paiseToRupees(pcl.getNewPricePaise());
            BigDecimal oldPriceRupees = paiseToRupees(pcl.getOldPricePaise());
            BigDecimal delta = (newPriceRupees != null && oldPriceRupees != null)
                    ? newPriceRupees.subtract(oldPriceRupees)
                    : null;
            entries.add(new PriceHistoryEntry(pcl.getChangedAt(), newPriceRupees, delta));
        }
        return entries;
    }

    /** Convert a paise value to rupees with 2 decimal places, or null if input is null. */
    private static BigDecimal paiseToRupees(Long paise) {
        if (paise == null) {
            return null;
        }
        return new BigDecimal(paise).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
    }

    // ===== DTOs =====

    /**
     * A single price change event.
     *
     * @param date  when the price changed
     * @param price the new price after the change
     * @param delta newPrice - oldPrice (positive = increase, negative = reduction, null if either price is null)
     */
    public record PriceHistoryEntry(
            OffsetDateTime date,
            BigDecimal price,
            BigDecimal delta
    ) {}
}

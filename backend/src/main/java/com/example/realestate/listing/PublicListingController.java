package com.example.realestate.listing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
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

    /** Number of days within which a back-to-market listing is still badged. */
    private static final int BACK_ON_MARKET_WINDOW_DAYS = 30;

    private final ListingService listingService;
    private final ListingRepository listingRepository;
    private final ListingImageRepository listingImageRepository;
    private final PriceChangeLogRepository priceChangeLogRepository;

    public PublicListingController(ListingService listingService,
                                   ListingRepository listingRepository,
                                   ListingImageRepository listingImageRepository,
                                   PriceChangeLogRepository priceChangeLogRepository) {
        this.listingService = listingService;
        this.listingRepository = listingRepository;
        this.listingImageRepository = listingImageRepository;
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
        return ResponseEntity.ok(toResponse(listing));
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

    private ListingController.ListingResponse toResponse(Listing l) {
        int imageCount = (int) listingImageRepository.countByListingId(l.getId());
        String firstImageUrl = listingImageRepository
                .findByListingIdOrderByPositionAsc(l.getId())
                .stream().findFirst()
                .map(ListingImage::getUrl)
                .orElse(null);

        LocalDate referenceDate = l.getFirstPublishedAt() != null
                ? l.getFirstPublishedAt().toLocalDate()
                : (l.getCreatedAt() != null ? l.getCreatedAt().toLocalDate() : LocalDate.now());
        int daysOnMarket = (int) ChronoUnit.DAYS.between(referenceDate, LocalDate.now());

        boolean backOnMarket = l.getBackToMarketAt() != null
                && l.getBackToMarketAt().isAfter(OffsetDateTime.now().minusDays(BACK_ON_MARKET_WINDOW_DAYS));

        OffsetDateTime lastUpdatedAt = l.getLastUpdatedAt() != null
                ? l.getLastUpdatedAt()
                : l.getUpdatedAt();

        boolean reraValid = l.getReraNumber() != null
                && ListingController.RERA_PATTERN.matcher(l.getReraNumber()).matches();

        // rejectionReason is an internal moderation note — never expose it to unauthenticated callers.
        return new ListingController.ListingResponse(
                l.getId(), l.getListingNumber(), l.getDisplayId(),
                l.getStatus(), l.getPropertyType(), l.getTitle(),
                l.getLocality(), l.getPrice(), l.getDescription(),
                l.getLandArea(), l.getBedrooms(), l.getBuiltArea(),
                l.getLandAreaUnit(), l.getBuiltAreaUnit(),
                l.getLatitude(), l.getLongitude(),
                l.isAddressConfirmed(), null,
                l.getCreatedAt(), l.getUpdatedAt(),
                imageCount, firstImageUrl, l.getVideoUrl(),
                l.getReraNumber(),
                l.getListingPurpose(),
                l.getCarpetArea(), l.getCarpetAreaUnit(),
                l.getFloorNumber(), l.getTotalFloors(),
                l.getFurnishingStatus(), l.getWashrooms(), l.getParkingCount(),
                l.getRoadFrontageFt(), l.getCommercialUsage(), l.getNumberOfUnits(),
                l.getMonthlyRent(), l.getSecurityDepositMonths(), l.getLockInMonths(),
                l.getSellerType(),
                daysOnMarket, backOnMarket, lastUpdatedAt, l.getFirstPublishedAt(),
                l.getPossessionStatus(), l.getExpectedPossessionDate(),
                l.getApprovalsDeclared(), reraValid);
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

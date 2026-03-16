package com.example.realestate.listing;

import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;

/**
 * Maps a {@link Listing} entity to {@link ListingController.ListingResponse}.
 *
 * <p>Two variants are provided:
 * <ul>
 *   <li>{@link #toResponse(Listing)} — full response, including rejectionReason. Use for
 *       authenticated dealer / admin endpoints.</li>
 *   <li>{@link #toPublicResponse(Listing)} — identical to toResponse but always returns
 *       {@code null} for rejectionReason. Use for unauthenticated public endpoints.</li>
 * </ul>
 */
@Component
public class ListingResponseMapper {

    /** Number of days within which a back-to-market listing is still badged. */
    private static final int BACK_ON_MARKET_WINDOW_DAYS = 30;

    private final ListingImageRepository listingImageRepository;

    public ListingResponseMapper(ListingImageRepository listingImageRepository) {
        this.listingImageRepository = listingImageRepository;
    }

    /**
     * Full response including rejectionReason. For dealer/admin-facing endpoints only.
     */
    public ListingController.ListingResponse toResponse(Listing l) {
        return build(l, l.getRejectionReason());
    }

    /**
     * Public response with rejectionReason always null.
     * rejectionReason is an internal moderation note — never expose it to unauthenticated callers.
     */
    public ListingController.ListingResponse toPublicResponse(Listing l) {
        return build(l, null);
    }

    private ListingController.ListingResponse build(Listing l, String rejectionReason) {
        var images = listingImageRepository.findByListingIdOrderByPositionAsc(l.getId());
        int imageCount = images.size();
        String firstImageUrl = images.stream().findFirst()
                .map(ListingImage::getUrl)
                .orElse(null);

        // daysOnMarket: days since first publish; fall back to createdAt when never published
        LocalDate referenceDate = l.getFirstPublishedAt() != null
                ? l.getFirstPublishedAt().toLocalDate()
                : (l.getCreatedAt() != null ? l.getCreatedAt().toLocalDate() : LocalDate.now());
        int daysOnMarket = (int) ChronoUnit.DAYS.between(referenceDate, LocalDate.now());

        // backOnMarket: true only when back_to_market_at is within the last BACK_ON_MARKET_WINDOW_DAYS days
        boolean backOnMarket = l.getBackToMarketAt() != null
                && l.getBackToMarketAt().isAfter(OffsetDateTime.now().minusDays(BACK_ON_MARKET_WINDOW_DAYS));

        // lastUpdatedAt: use explicit transparency column; fall back to updatedAt
        OffsetDateTime lastUpdatedAt = l.getLastUpdatedAt() != null
                ? l.getLastUpdatedAt()
                : l.getUpdatedAt();

        boolean reraValid = l.getReraNumber() != null
                && ListingController.RERA_PATTERN.matcher(l.getReraNumber()).matches();

        return new ListingController.ListingResponse(
                l.getId(), l.getListingNumber(), l.getDisplayId(),
                l.getStatus(), l.getPropertyType(), l.getTitle(),
                l.getLocality(), l.getPrice(), l.getDescription(),
                l.getLandArea(), l.getBedrooms(), l.getBuiltArea(),
                l.getLandAreaUnit(), l.getBuiltAreaUnit(),
                l.getLatitude(), l.getLongitude(),
                l.isAddressConfirmed(), rejectionReason,
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
}

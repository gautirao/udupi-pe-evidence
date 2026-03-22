package com.example.realestate.listing.api;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.image.ListingImage;
import com.example.realestate.listing.image.ListingImageRepository;
import com.example.realestate.trust.ListingVerificationDimensionRepository;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Maps a {@link Listing} entity to {@link ListingResponse}.
 *
 * <p>Two variants are provided:
 * <ul>
 *   <li>{@link #toResponse(Listing)} — full response, including rejectionReason. Use for
 *       authenticated broker / admin endpoints.</li>
 *   <li>{@link #toPublicResponse(Listing)} — identical to toResponse but always returns
 *       {@code null} for rejectionReason. Use for unauthenticated public endpoints.</li>
 * </ul>
 */
@Component
public class ListingResponseMapper {

    /** Number of days within which a back-to-market listing is still badged. */
    private static final int BACK_ON_MARKET_WINDOW_DAYS = 30;

    private final ListingImageRepository listingImageRepository;
    private final ListingVerificationDimensionRepository dimensionRepository;

    public ListingResponseMapper(ListingImageRepository listingImageRepository,
                                 ListingVerificationDimensionRepository dimensionRepository) {
        this.listingImageRepository = listingImageRepository;
        this.dimensionRepository = dimensionRepository;
    }

    /**
     * Full response including rejectionReason. For broker/admin-facing endpoints only.
     */
    public ListingResponse toResponse(Listing l) {
        return build(l, l.getRejectionReason());
    }

    /**
     * Public response with rejectionReason always null.
     * rejectionReason is an internal moderation note — never expose it to unauthenticated callers.
     */
    public ListingResponse toPublicResponse(Listing l) {
        return build(l, null);
    }

    /**
     * Batch variant for broker/admin list endpoints. Fires a single image query for all listings.
     */
    public List<ListingResponse> toResponseList(List<Listing> listings) {
        return toBatchResponseList(listings, true);
    }

    /**
     * Batch variant for public list endpoints. Fires a single image query; always omits rejectionReason.
     */
    public List<ListingResponse> toPublicResponseList(List<Listing> listings) {
        return toBatchResponseList(listings, false);
    }

    private List<ListingResponse> toBatchResponseList(List<Listing> listings, boolean includeRejectionReason) {
        if (listings.isEmpty()) return List.of();

        List<UUID> ids = listings.stream().map(Listing::getId).toList();
        Map<UUID, List<ListingImage>> imagesByListing = listingImageRepository
                .findByListingIdInOrderByListingIdAscPositionAsc(ids)
                .stream()
                .collect(Collectors.groupingBy(ListingImage::getListingId));

        Map<UUID, Long> earnedCountByListing = dimensionRepository
                .findAllByListingIdInAndBadgeState(ids, "EARNED")
                .stream()
                .collect(Collectors.groupingBy(
                        d -> d.getListingId(),
                        Collectors.counting()));

        return listings.stream()
                .map(l -> build(l,
                        includeRejectionReason ? l.getRejectionReason() : null,
                        imagesByListing.getOrDefault(l.getId(), List.of()),
                        earnedCountByListing.getOrDefault(l.getId(), 0L).intValue()))
                .toList();
    }

    private ListingResponse build(Listing l, String rejectionReason) {
        var images = listingImageRepository.findByListingIdOrderByPositionAsc(l.getId());
        int earnedBadgeCount = (int) dimensionRepository.countByListingIdAndBadgeState(l.getId(), "EARNED");
        return build(l, rejectionReason, images, earnedBadgeCount);
    }

    private ListingResponse build(Listing l, String rejectionReason, List<ListingImage> images, int earnedBadgeCount) {
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
                && ListingResponse.RERA_PATTERN.matcher(l.getReraNumber()).matches();

        return new ListingResponse(
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
                l.getApprovalsDeclared(), reraValid, earnedBadgeCount);
    }
}

package com.example.realestate.listing.api;

import com.example.realestate.listing.area.AreaNormalizer;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.image.ListingImage;
import com.example.realestate.listing.image.ListingImageRepository;
import com.example.realestate.trust.ListingVerificationDimensionRepository;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
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
    private final ListingRepository listingRepository;

    public ListingResponseMapper(ListingImageRepository listingImageRepository,
                                 ListingVerificationDimensionRepository dimensionRepository,
                                 ListingRepository listingRepository) {
        this.listingImageRepository = listingImageRepository;
        this.dimensionRepository = dimensionRepository;
        this.listingRepository = listingRepository;
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

    /**
     * Anonymous teaser — single listing variant.
     * Loads only the first image URL; all sensitive fields are absent.
     */
    public ListingTeaserResponse toTeaserResponse(Listing l) {
        var images = listingImageRepository.findByListingIdOrderByPositionAsc(l.getId());
        String primaryImageUrl = images.stream().findFirst()
                .map(ListingImage::getUrl)
                .orElse(null);
        return new ListingTeaserResponse(
                l.getId(), primaryImageUrl, images.size(), l.getPrice(),
                l.getPropertyType(), l.getLocality(), l.getListingPurpose());
    }

    /**
     * Anonymous teaser — batch variant.
     * Fires a single image query for all listings; all sensitive fields are absent.
     */
    public List<ListingTeaserResponse> toTeaserResponseList(List<Listing> listings) {
        if (listings.isEmpty()) return List.of();

        List<UUID> ids = listings.stream().map(Listing::getId).toList();
        List<ListingImage> allImages = listingImageRepository
                .findByListingIdInOrderByListingIdAscPositionAsc(ids);

        Map<UUID, String> firstImageByListing = allImages.stream()
                .collect(Collectors.toMap(
                        ListingImage::getListingId,
                        ListingImage::getUrl,
                        (existing, replacement) -> existing)); // keep first (lowest position)

        Map<UUID, Long> imageCountByListing = allImages.stream()
                .collect(Collectors.groupingBy(ListingImage::getListingId, Collectors.counting()));

        return listings.stream()
                .map(l -> new ListingTeaserResponse(
                        l.getId(),
                        firstImageByListing.get(l.getId()),
                        imageCountByListing.getOrDefault(l.getId(), 0L).intValue(),
                        l.getPrice(),
                        l.getPropertyType(),
                        l.getLocality(),
                        l.getListingPurpose()))
                .toList();
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
        // Single-listing path: use the gallery-ordering query (position ASC, id ASC tiebreaker,
        // plus url-not-null filter) so the detail-page gallery is deterministic (#758).
        var images = listingImageRepository.findGalleryByListingId(l.getId());
        int earnedBadgeCount = (int) dimensionRepository.countByListingIdAndBadgeState(l.getId(), "EARNED");
        List<ListingImageDTO> gallery = images.stream()
                .map(i -> new ListingImageDTO(i.getUrl(), null, i.getPosition()))
                .toList();
        // Fetch boundary GeoJSON for single-listing path only; skip DB call for non-agri listings
        // to avoid an unconditional round-trip on the hot single-listing detail path (#1366).
        boolean isAgri = "agricultural_land".equals(l.getPropertyType());
        String boundary = isAgri
                ? listingRepository.findBoundaryGeoJson(l.getId()).orElse(null)
                : null;
        // Derive approximate acreage from the saved boundary geography under the SAME agri +
        // single-listing gate (#1367). Pure read: distinct from the broker-declared landArea,
        // never reads or mutates it. ST_Area on the geography column returns m² directly.
        BigDecimal computedAreaAcres = isAgri
                ? AreaNormalizer.sqmToAcres(
                        listingRepository.findBoundaryAreaSqm(l.getId())
                                .map(BigDecimal::valueOf)
                                .orElse(null))
                : null;
        return build(l, rejectionReason, images, earnedBadgeCount, gallery, boundary, computedAreaAcres);
    }

    private ListingResponse build(Listing l, String rejectionReason, List<ListingImage> images, int earnedBadgeCount) {
        // Batch/list path: keep payload unchanged — images[] stays empty so list endpoints do
        // not balloon in size. List views render from firstImageUrl + imageCount (#758).
        // computedAreaAcres stays null so the hot list path takes NO extra DB call (#1367).
        return build(l, rejectionReason, images, earnedBadgeCount, List.of(), null, null);
    }

    private ListingResponse build(Listing l, String rejectionReason, List<ListingImage> images,
                                  int earnedBadgeCount, List<ListingImageDTO> gallery, String boundary,
                                  BigDecimal computedAreaAcres) {
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
                l.getApprovalsDeclared(), reraValid, earnedBadgeCount,
                l.getTrustTier(), l.getAreaKey(), gallery,
                l.getWaterSource(), l.getSoilType(), l.getRoadAccess(),
                l.getCultivationStatus(), l.getOwnershipType(), l.getSurveyNumber(),
                boundary, computedAreaAcres);
    }
}

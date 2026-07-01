package com.example.realestate.listing.api;

import com.example.realestate.listing.area.AreaNormalizer;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.image.ListingImage;
import com.example.realestate.listing.image.ListingImageRepository;
import com.example.realestate.listing.residential.ListingAmenity;
import com.example.realestate.listing.residential.ListingAmenityRepository;
import com.example.realestate.listing.residential.ListingLocationFeature;
import com.example.realestate.listing.residential.ListingLocationFeatureRepository;
import com.example.realestate.listing.residential.ListingPreferredTenant;
import com.example.realestate.listing.residential.ListingPreferredTenantRepository;
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

    /** Residential-family property types whose child sets are worth a detail-path lookup. */
    private static final java.util.Set<String> RESIDENTIAL_PROPERTY_TYPES =
            java.util.Set.of("house", "apartment", "villa", "residential_plot");

    private final ListingImageRepository listingImageRepository;
    private final ListingVerificationDimensionRepository dimensionRepository;
    private final ListingRepository listingRepository;
    private final ListingAmenityRepository listingAmenityRepository;
    private final ListingLocationFeatureRepository listingLocationFeatureRepository;
    private final ListingPreferredTenantRepository listingPreferredTenantRepository;

    public ListingResponseMapper(ListingImageRepository listingImageRepository,
                                 ListingVerificationDimensionRepository dimensionRepository,
                                 ListingRepository listingRepository,
                                 ListingAmenityRepository listingAmenityRepository,
                                 ListingLocationFeatureRepository listingLocationFeatureRepository,
                                 ListingPreferredTenantRepository listingPreferredTenantRepository) {
        this.listingImageRepository = listingImageRepository;
        this.dimensionRepository = dimensionRepository;
        this.listingRepository = listingRepository;
        this.listingAmenityRepository = listingAmenityRepository;
        this.listingLocationFeatureRepository = listingLocationFeatureRepository;
        this.listingPreferredTenantRepository = listingPreferredTenantRepository;
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
        // IC-3: literal-on-left null-safe check for agri gate (#1407)
        boolean isAgri = "agricultural_land".equals(l.getPropertyType());
        // Boundary: DB call only on agri path; null for all other property types (no N+1 on batch)
        String boundary = isAgri
                ? listingRepository.findBoundaryGeoJson(l.getId()).orElse(null)
                : null;
        // computedAreaAcres: ST_Area-derived acreage; null for non-agri + when no boundary saved
        BigDecimal computedAreaAcres = isAgri
                ? AreaNormalizer.sqmToAcres(
                        listingRepository.findBoundaryAreaSqm(l.getId())
                                .map(BigDecimal::valueOf)
                                .orElse(null))
                : null;
        // #1454: ANON agri gating. Anonymous callers must NOT receive price, survey number,
        // or EXACT location for agricultural land. This teaser path is the anonymous-only
        // variant (authenticated callers go through toPublicResponse/build, which is untouched),
        // so masking here gates anon agri without affecting authed/dealer/admin responses.
        // Residential/non-agri pricing is preserved: price/pricePaise are nulled ONLY for agri.
        BigDecimal price = isAgri ? null : l.getPrice();
        Long pricePaise = isAgri ? null : l.getPricePaise();
        return new ListingTeaserResponse(
                l.getId(), primaryImageUrl, images.size(), price, pricePaise,
                l.getPropertyType(), l.getLocality(), l.getListingPurpose(),
                boundary,
                // #1454: anon agri receives COARSENED lat/lng (~1.1 km, 2 dp) — not exact, not null.
                // Algorithm is kept identical to DiscoverAgriMapListingsService.coarsen() (parity is a
                // security requirement so both anon agri surfaces leak the same precision).
                isAgri ? coarsen(l.getLatitude()) : null,
                isAgri ? coarsen(l.getLongitude()) : null,
                isAgri ? l.getLandArea() : null,
                isAgri ? l.getLandAreaUnit() : null,
                computedAreaAcres,
                isAgri ? l.getWaterSource() : null,
                isAgri ? l.getSoilType() : null,
                isAgri ? l.getRoadAccess() : null,
                isAgri ? l.getCultivationStatus() : null,
                isAgri ? l.getOwnershipType() : null,
                // #1454: survey number withheld from anon agri.
                null,
                isAgri ? l.getLandCategory() : null,
                isAgri ? l.getFarmhouseAvailable() : null,
                isAgri ? l.getFencingDone() : null);
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
                .map(l -> {
                    // #1454: anon agri price gating on the batch teaser path too — null price/pricePaise
                    // for agri rows; residential/non-agri pricing unchanged.
                    boolean isAgri = "agricultural_land".equals(l.getPropertyType());
                    return new ListingTeaserResponse(
                            l.getId(),
                            firstImageByListing.get(l.getId()),
                            imageCountByListing.getOrDefault(l.getId(), 0L).intValue(),
                            isAgri ? null : l.getPrice(),
                            isAgri ? null : l.getPricePaise(),
                            l.getPropertyType(),
                            l.getLocality(),
                            l.getListingPurpose(),
                            // IC-3: batch path — null-pass for all 15 agri fields (no DB call; N+1 guard)
                            null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
                })
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
        // Residential child sets (amenities / special-location views / preferred tenants) —
        // single-listing detail path only (mirrors images-on-detail, #1626). Gated to residential
        // property types so non-residential listings take no extra DB round trips.
        boolean isResidential = RESIDENTIAL_PROPERTY_TYPES.contains(l.getPropertyType());
        List<String> amenities = isResidential
                ? listingAmenityRepository.findByListingIdOrderByCodeAsc(l.getId()).stream()
                        .map(ListingAmenity::getCode).toList()
                : List.of();
        List<String> specialLocationViews = isResidential
                ? listingLocationFeatureRepository.findByListingIdOrderByCodeAsc(l.getId()).stream()
                        .map(ListingLocationFeature::getCode).toList()
                : List.of();
        List<String> preferredTenants = isResidential
                ? listingPreferredTenantRepository.findByListingIdOrderByCodeAsc(l.getId()).stream()
                        .map(ListingPreferredTenant::getCode).toList()
                : List.of();
        return build(l, rejectionReason, images, earnedBadgeCount, gallery, boundary, computedAreaAcres,
                amenities, specialLocationViews, preferredTenants);
    }

    private ListingResponse build(Listing l, String rejectionReason, List<ListingImage> images, int earnedBadgeCount) {
        // Batch/list path: keep payload unchanged — images[] stays empty so list endpoints do
        // not balloon in size. List views render from firstImageUrl + imageCount (#758).
        // computedAreaAcres stays null and residential child sets stay empty so the hot list
        // path takes NO extra DB calls (#1367, #1626).
        return build(l, rejectionReason, images, earnedBadgeCount, List.of(), null, null,
                List.of(), List.of(), List.of());
    }

    @SuppressWarnings("java:S107") // mirrors existing build() overload chain shape
    private ListingResponse build(Listing l, String rejectionReason, List<ListingImage> images,
                                  int earnedBadgeCount, List<ListingImageDTO> gallery, String boundary,
                                  BigDecimal computedAreaAcres, List<String> amenities,
                                  List<String> specialLocationViews, List<String> preferredTenants) {
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
                l.getLocality(), l.getPrice(), l.getPricePaise(), l.getDescription(),
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
                l.getLandCategory(), l.getFarmhouseAvailable(), l.getFencingDone(),
                boundary, computedAreaAcres,
                l.getBathrooms(), l.getBalconies(), l.getFacing(), l.getAvailabilityTimeline(),
                l.getSuperBuiltArea(), l.getSuperBuiltAreaUnit(), l.getPropertyAge(), l.getResidentialWaterSource(),
                l.getParking2wCount(), l.getParking4wCount(), l.getRoadWidthFt(), l.getPlotDimensions(),
                l.getConversionStatus(), l.getKhataNumber(), l.getPropertyTaxPid(), l.getApprovingAuthority(),
                l.getProjectName(), l.getBuilderName(), l.getMaintenancePaise(),
                l.getHasLift(), l.getHasPowerBackup(), l.getIsGated(), l.getHasGarden(), l.getHasTerrace(),
                l.getHasCompound(), l.getHasServantRoom(), l.getIsCornerPlot(), l.getHasBoundaryWall(),
                l.getIsGatedLayout(), l.getHasWaterConnection(), l.getHasElectricityConnection(), l.getHasDrainage(),
                l.getPriceNegotiable(), l.getRentNegotiable(), l.getPetsAllowed(), l.getMaintenanceIncluded(),
                amenities, specialLocationViews, preferredTenants);
    }

    /**
     * Coarsens a coordinate to 2 decimal places (~1.1 km granularity) by truncating toward zero.
     * Null-safe: null input stays null (never coerced to 0.0, which would place a marker at (0,0)).
     * Algorithm MUST remain identical to DiscoverAgriMapListingsService.coarsen() (#1454).
     */
    private static Double coarsen(Double coord) {
        if (coord == null) {
            return null;
        }
        double factor = Math.pow(10, 2); // 2 decimal places ≈ 1.1 km granularity
        // Truncate toward zero so sign is preserved symmetrically for +/- values.
        return (coord < 0 ? Math.ceil(coord * factor) : Math.floor(coord * factor)) / factor;
    }
}

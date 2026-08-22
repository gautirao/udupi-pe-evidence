package com.example.realestate.listing.api;

import com.example.realestate.listing.area.AreaNormalizer;
import com.example.realestate.listing.commercial.ListingSuitableUseRepository;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.image.ListingImage;
import com.example.realestate.listing.image.ListingImageRepository;
import com.example.realestate.listing.residential.ListingAmenityRepository;
import com.example.realestate.listing.residential.ListingLocationFeatureRepository;
import com.example.realestate.listing.residential.ListingPreferredTenantRepository;
import com.example.realestate.trust.ListingVerificationDimensionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for ListingResponseMapper.
 * Verifies security invariant (rejectionReason hidden on public response),
 * image resolution, daysOnMarket fallback, and reraValid computation.
 */
class ListingResponseMapperTest {

    private ListingImageRepository listingImageRepository;
    private ListingVerificationDimensionRepository dimensionRepository;
    private ListingRepository listingRepository;
    private ListingAmenityRepository listingAmenityRepository;
    private ListingLocationFeatureRepository listingLocationFeatureRepository;
    private ListingPreferredTenantRepository listingPreferredTenantRepository;
    private ListingSuitableUseRepository listingSuitableUseRepository;
    private com.example.realestate.listing.agricultural.ListingAgriCropRepository listingAgriCropRepository;
    private ListingResponseMapper mapper;

    @BeforeEach
    void setUp() {
        listingImageRepository = mock(ListingImageRepository.class);
        dimensionRepository = mock(ListingVerificationDimensionRepository.class);
        listingRepository = mock(ListingRepository.class);
        listingAmenityRepository = mock(ListingAmenityRepository.class);
        listingLocationFeatureRepository = mock(ListingLocationFeatureRepository.class);
        listingPreferredTenantRepository = mock(ListingPreferredTenantRepository.class);
        listingSuitableUseRepository = mock(ListingSuitableUseRepository.class);
        listingAgriCropRepository = mock(com.example.realestate.listing.agricultural.ListingAgriCropRepository.class);
        mapper = new ListingResponseMapper(listingImageRepository, dimensionRepository, listingRepository,
                listingAmenityRepository, listingLocationFeatureRepository, listingPreferredTenantRepository,
                listingSuitableUseRepository, listingAgriCropRepository);

        // Default: no images
        when(listingImageRepository.findByListingIdOrderByPositionAsc(any())).thenReturn(List.of());
        when(listingImageRepository.findGalleryByListingId(any())).thenReturn(List.of());
        // Default: no earned badges
        when(dimensionRepository.countByListingIdAndBadgeState(any(), anyString())).thenReturn(0L);
        when(dimensionRepository.findAllByListingIdInAndBadgeState(anyList(), anyString())).thenReturn(List.of());
        // Default: no boundary (single-listing path calls findBoundaryGeoJson)
        when(listingRepository.findBoundaryGeoJson(any())).thenReturn(Optional.empty());
        // Default: no boundary area (single-listing agri path calls findBoundaryAreaSqm)
        when(listingRepository.findBoundaryAreaSqm(any())).thenReturn(Optional.empty());
        // Default: no residential child-set rows
        when(listingAmenityRepository.findByListingIdOrderByCodeAsc(any())).thenReturn(List.of());
        when(listingLocationFeatureRepository.findByListingIdOrderByCodeAsc(any())).thenReturn(List.of());
        when(listingPreferredTenantRepository.findByListingIdOrderByCodeAsc(any())).thenReturn(List.of());
        // Default: no commercial child-set rows
        when(listingSuitableUseRepository.findByListingIdOrderByCodeAsc(any())).thenReturn(List.of());
    }

    // ==================== toResponse includes rejectionReason ====================

    @Test
    void toResponse_includesRejectionReason() {
        Listing l = buildListing("REJECTED");
        l.setRejectionReason("Blurry images");

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.rejectionReason()).isEqualTo("Blurry images");
    }

    // ==================== toPublicResponse hides rejectionReason ====================

    @Test
    void toPublicResponse_rejectionReasonIsAlwaysNull() {
        Listing l = buildListing("LIVE");
        l.setRejectionReason("Internal moderation note");

        ListingResponse response = mapper.toPublicResponse(l, true);

        assertThat(response.rejectionReason()).isNull();
    }

    @Test
    void toPublicResponse_rejectionReasonNullWhenListingHasNone() {
        Listing l = buildListing("LIVE");
        l.setRejectionReason(null);

        ListingResponse response = mapper.toPublicResponse(l, true);

        assertThat(response.rejectionReason()).isNull();
    }

    // ==================== firstImageUrl is null when no images ====================

    @Test
    void toResponse_firstImageUrlIsNullWhenNoImages() {
        Listing l = buildListing("DRAFT");

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.firstImageUrl()).isNull();
        assertThat(response.imageCount()).isZero();
    }

    // ==================== firstImageUrl from first image ====================

    @Test
    void toResponse_firstImageUrlFromFirstImage() {
        Listing l = buildListing("DRAFT");

        ListingImage img = new ListingImage();
        img.setUrl("https://example.com/photo.jpg");
        when(listingImageRepository.findGalleryByListingId(l.getId()))
                .thenReturn(List.of(img));

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.firstImageUrl()).isEqualTo("https://example.com/photo.jpg");
        assertThat(response.imageCount()).isEqualTo(1);
    }

    // ==================== daysOnMarket uses firstPublishedAt when set ====================

    @Test
    void toResponse_daysOnMarket_usesFirstPublishedAt() {
        Listing l = buildListing("LIVE");
        l.setFirstPublishedAt(OffsetDateTime.now().minusDays(10));

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.daysOnMarket()).isEqualTo(10);
    }

    // ==================== daysOnMarket falls back to createdAt ====================

    @Test
    void toResponse_daysOnMarket_fallsBackToCreatedAt() {
        Listing l = buildListing("DRAFT");
        l.setFirstPublishedAt(null);
        l.setCreatedAt(OffsetDateTime.now().minusDays(7));

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.daysOnMarket()).isEqualTo(7);
    }

    // ==================== #1794 Phase 1: confirmedAt mapped from lastConfirmedAt ====================

    @Test
    void toResponse_confirmedAt_mappedFromLastConfirmedAt() {
        Listing l = buildListing("LIVE");
        OffsetDateTime confirmedAt = OffsetDateTime.now().minusDays(3);
        l.setLastConfirmedAt(confirmedAt);

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.confirmedAt()).isEqualTo(confirmedAt);
    }

    @Test
    void toResponse_confirmedAt_nullWhenEntityNeverConfirmed_honestAbsence() {
        Listing l = buildListing("DRAFT");
        // lastConfirmedAt left unset (null) — never confirmed

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.confirmedAt()).isNull();
    }

    @Test
    void toPublicResponse_confirmedAt_alsoMappedFromLastConfirmedAt() {
        Listing l = buildListing("LIVE");
        OffsetDateTime confirmedAt = OffsetDateTime.now().minusDays(1);
        l.setLastConfirmedAt(confirmedAt);

        ListingResponse response = mapper.toPublicResponse(l, true);

        assertThat(response.confirmedAt()).isEqualTo(confirmedAt);
    }

    // ==================== core fields are mapped ====================

    @Test
    void toResponse_mapsCoreListingFields() {
        Listing l = buildListing("DRAFT");
        l.setTitle("Test Plot");
        l.setLocality("Manipal");
        l.setStatus("DRAFT");

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.id()).isEqualTo(l.getId());
        assertThat(response.status()).isEqualTo("DRAFT");
        assertThat(response.title()).isEqualTo("Test Plot");
        assertThat(response.locality()).isEqualTo("Manipal");
    }

    // ==================== reraValid: valid RERA number ====================

    @Test
    void toResponse_reraValid_trueForValidReraNumber() {
        Listing l = buildListing("DRAFT");
        l.setReraNumber("PRM/KA/2023/0042");

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.reraValid()).isTrue();
    }

    // ==================== reraValid: invalid RERA number ====================

    @Test
    void toResponse_reraValid_falseForInvalidReraNumber() {
        Listing l = buildListing("DRAFT");
        l.setReraNumber("INVALID-RERA");

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.reraValid()).isFalse();
    }

    // ==================== reraValid: null RERA number ====================

    @Test
    void toResponse_reraValid_falseWhenReraNumberIsNull() {
        Listing l = buildListing("DRAFT");
        l.setReraNumber(null);

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.reraValid()).isFalse();
    }

    // ==================== daysOnMarket: both dates null falls back to today (0 days) ====================

    @Test
    void toResponse_daysOnMarket_bothDatesNullReturnsZero() {
        Listing l = buildListing("DRAFT");
        l.setFirstPublishedAt(null);
        l.setCreatedAt(null);

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.daysOnMarket()).isEqualTo(0);
    }

    // ==================== backOnMarket: within window ====================

    @Test
    void toResponse_backOnMarket_trueWhenWithinWindow() {
        Listing l = buildListing("LIVE");
        l.setBackToMarketAt(OffsetDateTime.now().minusDays(10));

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.backOnMarket()).isTrue();
    }

    // ==================== backOnMarket: outside window ====================

    @Test
    void toResponse_backOnMarket_falseWhenOutsideWindow() {
        Listing l = buildListing("LIVE");
        l.setBackToMarketAt(OffsetDateTime.now().minusDays(31));

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.backOnMarket()).isFalse();
    }

    // ==================== toResponseList batch: two listings get correct image data ====================

    @Test
    void toResponseList_twoListings_correctImageCountAndFirstUrl() {
        Listing l1 = buildListing("LIVE");
        Listing l2 = buildListing("DRAFT");

        ListingImage img1a = new ListingImage();
        img1a.setListingId(l1.getId());
        img1a.setUrl("https://example.com/l1-first.jpg");
        img1a.setPosition(0);

        ListingImage img1b = new ListingImage();
        img1b.setListingId(l1.getId());
        img1b.setUrl("https://example.com/l1-second.jpg");
        img1b.setPosition(1);

        ListingImage img2a = new ListingImage();
        img2a.setListingId(l2.getId());
        img2a.setUrl("https://example.com/l2-only.jpg");
        img2a.setPosition(0);

        when(listingImageRepository.findByListingIdInOrderByListingIdAscPositionAsc(anyList()))
                .thenReturn(List.of(img1a, img1b, img2a));

        List<ListingResponse> responses = mapper.toResponseList(List.of(l1, l2));

        assertThat(responses).hasSize(2);

        ListingResponse r1 = responses.stream().filter(r -> r.id().equals(l1.getId())).findFirst().orElseThrow();
        assertThat(r1.imageCount()).isEqualTo(2);
        assertThat(r1.firstImageUrl()).isEqualTo("https://example.com/l1-first.jpg");

        ListingResponse r2 = responses.stream().filter(r -> r.id().equals(l2.getId())).findFirst().orElseThrow();
        assertThat(r2.imageCount()).isEqualTo(1);
        assertThat(r2.firstImageUrl()).isEqualTo("https://example.com/l2-only.jpg");
    }

    // ==================== toResponseList batch: listing with no images ====================

    @Test
    void toResponseList_listingWithNoImages_imageCountZeroAndFirstUrlNull() {
        Listing l = buildListing("DRAFT");

        when(listingImageRepository.findByListingIdInOrderByListingIdAscPositionAsc(anyList()))
                .thenReturn(List.of());

        List<ListingResponse> responses = mapper.toResponseList(List.of(l));

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).imageCount()).isZero();
        assertThat(responses.get(0).firstImageUrl()).isNull();
    }

    // ==================== single-listing path still uses findByListingIdOrderByPositionAsc ====================

    @Test
    void toResponse_singleListing_stillUsesPerListingQuery() {
        Listing l = buildListing("DRAFT");

        ListingImage img = new ListingImage();
        img.setUrl("https://example.com/single.jpg");
        when(listingImageRepository.findGalleryByListingId(l.getId()))
                .thenReturn(List.of(img));

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.imageCount()).isEqualTo(1);
        assertThat(response.firstImageUrl()).isEqualTo("https://example.com/single.jpg");
    }

    // ==================== #758: single-listing response hydrates images[] =====

    @Test
    void toResponse_populatesImagesArray_withUrlAltPositionOnly() {
        Listing l = buildListing("LIVE");

        ListingImage img0 = new ListingImage();
        img0.setId(UUID.randomUUID());
        img0.setListingId(l.getId());
        img0.setUrl("https://cdn.example.com/a.jpg");
        img0.setPosition(0);
        img0.setStoragePath("listing/a.jpg"); // must NOT leak into the response DTO

        ListingImage img1 = new ListingImage();
        img1.setId(UUID.randomUUID());
        img1.setListingId(l.getId());
        img1.setUrl("https://cdn.example.com/b.jpg");
        img1.setPosition(1);
        img1.setStoragePath("listing/b.jpg");

        ListingImage img2 = new ListingImage();
        img2.setId(UUID.randomUUID());
        img2.setListingId(l.getId());
        img2.setUrl("https://cdn.example.com/c.jpg");
        img2.setPosition(2);
        img2.setStoragePath("listing/c.jpg");

        when(listingImageRepository.findGalleryByListingId(l.getId()))
                .thenReturn(List.of(img0, img1, img2));

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.images()).hasSize(3);
        assertThat(response.images().get(0).url()).isEqualTo("https://cdn.example.com/a.jpg");
        assertThat(response.images().get(0).position()).isZero();
        assertThat(response.images().get(0).alt()).isNull();
        assertThat(response.images().get(1).url()).isEqualTo("https://cdn.example.com/b.jpg");
        assertThat(response.images().get(1).position()).isEqualTo(1);
        assertThat(response.images().get(2).url()).isEqualTo("https://cdn.example.com/c.jpg");
        assertThat(response.images().get(2).position()).isEqualTo(2);
        // Ordering is preserved end-to-end (positions ascend).
        assertThat(response.images())
                .extracting(ListingImageDTO::url)
                .containsExactly(
                        "https://cdn.example.com/a.jpg",
                        "https://cdn.example.com/b.jpg",
                        "https://cdn.example.com/c.jpg");
        // Whitelist: ListingImageDTO must expose only url, alt, position — no storage_path, id, listing_id.
        assertThat(ListingImageDTO.class.getRecordComponents()).hasSize(3);
        var componentNames = java.util.Arrays.stream(ListingImageDTO.class.getRecordComponents())
                .map(java.lang.reflect.RecordComponent::getName)
                .toList();
        assertThat(componentNames).containsExactlyInAnyOrder("url", "alt", "position");
    }

    @Test
    void toPublicResponse_populatesImagesArray() {
        Listing l = buildListing("LIVE");
        ListingImage img = new ListingImage();
        img.setId(UUID.randomUUID());
        img.setListingId(l.getId());
        img.setUrl("https://cdn.example.com/only.jpg");
        img.setPosition(0);
        when(listingImageRepository.findGalleryByListingId(l.getId())).thenReturn(List.of(img));

        ListingResponse response = mapper.toPublicResponse(l, true);

        assertThat(response.images()).hasSize(1);
        assertThat(response.images().get(0).url()).isEqualTo("https://cdn.example.com/only.jpg");
    }

    @Test
    void toResponse_noImages_returnsEmptyImagesList() {
        Listing l = buildListing("DRAFT");

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.images()).isEmpty();
    }

    // ==================== #758: list/batch paths keep images empty =====

    @Test
    void toResponseList_batchPath_leavesImagesEmptyToKeepListPayloadUnchanged() {
        Listing l1 = buildListing("LIVE");
        Listing l2 = buildListing("DRAFT");

        ListingImage img1 = new ListingImage();
        img1.setListingId(l1.getId());
        img1.setUrl("https://example.com/l1.jpg");
        img1.setPosition(0);

        when(listingImageRepository.findByListingIdInOrderByListingIdAscPositionAsc(anyList()))
                .thenReturn(List.of(img1));

        List<ListingResponse> responses = mapper.toResponseList(List.of(l1, l2));

        assertThat(responses).hasSize(2);
        // firstImageUrl / imageCount still populated for list views — no regression.
        ListingResponse r1 = responses.stream().filter(r -> r.id().equals(l1.getId())).findFirst().orElseThrow();
        assertThat(r1.firstImageUrl()).isEqualTo("https://example.com/l1.jpg");
        assertThat(r1.imageCount()).isEqualTo(1);
        // But images[] is empty on list payloads — list endpoints stay lean.
        assertThat(r1.images()).isEmpty();

        ListingResponse r2 = responses.stream().filter(r -> r.id().equals(l2.getId())).findFirst().orElseThrow();
        assertThat(r2.images()).isEmpty();
    }

    // ==================== trustTier is propagated ====================

    @Test
    void toResponse_trustTier_propagatedFromEntity() {
        Listing l = buildListing("LIVE");
        l.setTrustTier("A");

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.trustTier()).isEqualTo("A");
    }

    @Test
    void toResponse_trustTier_nullWhenEntityHasNoTier() {
        Listing l = buildListing("DRAFT");
        l.setTrustTier(null);

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.trustTier()).isNull();
    }

    // ==================== #1786: internal toResponse never sets trustBadge ====================

    @Test
    void toResponse_trustBadge_alwaysNullOnInternalResponse() {
        Listing l = buildListing("LIVE");
        l.setTrustTier("A");

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.trustTier()).isEqualTo("A");
        assertThat(response.trustBadge()).isNull();
    }

    // ==================== #1786: public toPublicResponse projects trustBadge, hides trustTier ====================

    @Test
    void toPublicResponse_trustTierA_projectsVerifiedBadgeAndHidesRawTier() {
        Listing l = buildListing("LIVE");
        l.setTrustTier("A");

        ListingResponse response = mapper.toPublicResponse(l, true);

        assertThat(response.trustBadge()).isEqualTo("verified");
        assertThat(response.trustTier()).isNull();
    }

    @Test
    void toPublicResponse_trustTierB_projectsTrustedBadgeAndHidesRawTier() {
        Listing l = buildListing("LIVE");
        l.setTrustTier("B");

        ListingResponse response = mapper.toPublicResponse(l, true);

        assertThat(response.trustBadge()).isEqualTo("trusted");
        assertThat(response.trustTier()).isNull();
    }

    @Test
    void toPublicResponse_trustTierC_projectsListedBadgeAndHidesRawTier() {
        Listing l = buildListing("LIVE");
        l.setTrustTier("C");

        ListingResponse response = mapper.toPublicResponse(l, true);

        assertThat(response.trustBadge()).isEqualTo("listed");
        assertThat(response.trustTier()).isNull();
    }

    @Test
    void toPublicResponse_trustTierD_noBadgeAndHidesRawTier() {
        Listing l = buildListing("LIVE");
        l.setTrustTier("D");

        ListingResponse response = mapper.toPublicResponse(l, true);

        assertThat(response.trustBadge()).isNull();
        assertThat(response.trustTier()).isNull();
    }

    @Test
    void toPublicResponse_trustTierNull_noBadgeAndTierStaysNull() {
        Listing l = buildListing("LIVE");
        l.setTrustTier(null);

        ListingResponse response = mapper.toPublicResponse(l, true);

        assertThat(response.trustBadge()).isNull();
        assertThat(response.trustTier()).isNull();
    }

    // ==================== #1786: toPublicResponseList (batch) is public-safe by construction ====================

    @Test
    void toPublicResponseList_projectsBadgeAndNullsRawTierOnBatchPath() {
        Listing l1 = buildListing("LIVE");
        l1.setTrustTier("A");
        Listing l2 = buildListing("LIVE");
        l2.setTrustTier("D");

        when(listingImageRepository.findByListingIdInOrderByListingIdAscPositionAsc(anyList()))
                .thenReturn(List.of());

        List<ListingResponse> responses = mapper.toPublicResponseList(List.of(l1, l2));

        ListingResponse r1 = responses.stream().filter(r -> r.id().equals(l1.getId())).findFirst().orElseThrow();
        assertThat(r1.trustTier()).isNull();
        assertThat(r1.trustBadge()).isEqualTo("verified");

        ListingResponse r2 = responses.stream().filter(r -> r.id().equals(l2.getId())).findFirst().orElseThrow();
        assertThat(r2.trustTier()).isNull();
        assertThat(r2.trustBadge()).isNull();
    }

    @Test
    void toResponseList_internalBatchPath_preservesRawTierAndNullsBadge() {
        Listing l = buildListing("LIVE");
        l.setTrustTier("A");

        when(listingImageRepository.findByListingIdInOrderByListingIdAscPositionAsc(anyList()))
                .thenReturn(List.of());

        List<ListingResponse> responses = mapper.toResponseList(List.of(l));

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).trustTier()).isEqualTo("A");
        assertThat(responses.get(0).trustBadge()).isNull();
    }

    // ==================== toTeaserResponse — core 7 fields populated, correct values ====================

    @Test
    void toTeaserResponse_coreFieldsPopulated() {
        Listing l = buildListing("LIVE");
        l.setListingPurpose("SALE");

        ListingTeaserResponse teaser = mapper.toTeaserResponse(l);

        assertThat(teaser.id()).isEqualTo(l.getId());
        assertThat(teaser.primaryImageUrl()).isNull(); // no images set up
        assertThat(teaser.imageCount()).isEqualTo(0);  // no images set up
        // #1941: exact price is withheld from all anon teaser callers; buildListing() sets a
        // positive price, so priceBand must be populated instead (see dedicated band tests below).
        assertThat(teaser.price()).isNull();
        assertThat(teaser.pricePaise()).isNull();
        assertThat(teaser.propertyType()).isEqualTo(l.getPropertyType());
        assertThat(teaser.locality()).isEqualTo(l.getLocality());
        assertThat(teaser.listingPurpose()).isEqualTo("SALE");
        // #1452/#1458/#1941/#2043: record now has 25 components (9 base + 16 agri-only); priceBand
        // added in #1941, agriConversionStatus added in #2043.
        assertThat(ListingTeaserResponse.class.getRecordComponents()).hasSize(25);
    }

    @Test
    void toTeaserResponse_contractFields() {
        Listing l = buildListing("LIVE");

        ListingTeaserResponse teaser = mapper.toTeaserResponse(l);

        // #1452/#1941/#2043: record now has 25 components (9 base + 16 agri-only fields); priceBand
        // added in #1941, agriConversionStatus added in #2043.
        assertThat(ListingTeaserResponse.class.getRecordComponents()).hasSize(25);
        var componentNames = java.util.Arrays.stream(ListingTeaserResponse.class.getRecordComponents())
                .map(java.lang.reflect.RecordComponent::getName)
                .toList();
        // Base 9 fields always present (pricePaise added in #1452, priceBand added in #1941)
        assertThat(componentNames).contains(
                "id", "primaryImageUrl", "imageCount", "price", "pricePaise", "priceBand",
                "propertyType", "locality", "listingPurpose");
        // 16 agri-only fields present in record definition (null for non-agri via @JsonInclude(NON_NULL))
        assertThat(componentNames).contains(
                "boundary", "latitude", "longitude", "landArea", "landAreaUnit",
                "computedAreaAcres", "waterSource", "soilType", "roadAccess",
                "cultivationStatus", "ownershipType", "surveyNumber",
                "landCategory", "agriConversionStatus", "farmhouseAvailable", "fencingDone");
        // Truly sensitive names must not appear
        assertThat(componentNames).doesNotContain(
                "address", "description", "sellerType", "bedrooms", "builtArea",
                "reraNumber", "contactPhone", "createdBy");
    }

    // ==================== #1367: computedAreaAcres (derive-on-read) ====================

    @Test
    void toResponse_agriWithBoundary_setsComputedAreaAcresAt2dp() {
        Listing l = buildAgriListing("LIVE");
        // 10000 m² -> 10000 / 4046.8564224 = 2.471... acres -> 2.47 @ 2dp
        when(listingRepository.findBoundaryAreaSqm(l.getId()))
                .thenReturn(Optional.of(10000.0));

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.computedAreaAcres()).isEqualByComparingTo(new BigDecimal("2.47"));
        assertThat(response.computedAreaAcres().scale()).isEqualTo(2);
    }

    @Test
    void toResponse_agriWithoutBoundary_computedAreaAcresIsNull() {
        Listing l = buildAgriListing("LIVE");
        when(listingRepository.findBoundaryAreaSqm(l.getId()))
                .thenReturn(Optional.empty());

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.computedAreaAcres()).isNull();
    }

    @Test
    void toResponse_nonAgri_computedAreaAcresNull_andAreaReadNeverInvoked() {
        Listing l = buildListing("LIVE"); // propertyType = "land" (non-agri)

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.computedAreaAcres()).isNull();
        // Hot path must take NO extra DB call for non-agri listings.
        verify(listingRepository, never()).findBoundaryAreaSqm(any());
    }

    @Test
    void toResponseList_batchPath_computedAreaAcresAlwaysNull() {
        Listing agri = buildAgriListing("LIVE");
        // Even if a boundary area exists, the batch path must not fetch or populate it.
        when(listingRepository.findBoundaryAreaSqm(any()))
                .thenReturn(Optional.of(10000.0));

        List<ListingResponse> responses = mapper.toResponseList(List.of(agri));

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).computedAreaAcres()).isNull();
        // List/batch path must take NO extra DB call.
        verify(listingRepository, never()).findBoundaryAreaSqm(any());
    }

    @Test
    void toResponse_singleListingPath_agriListing_populatesCrops() {
        Listing agri = buildAgriListing("LIVE");
        com.example.realestate.listing.agricultural.ListingAgriCrop crop =
                new com.example.realestate.listing.agricultural.ListingAgriCrop();
        crop.setCode("PADDY");
        when(listingAgriCropRepository.findByListingIdOrderByCodeAsc(agri.getId()))
                .thenReturn(List.of(crop));

        ListingResponse response = mapper.toResponse(agri);

        assertThat(response.crops()).containsExactly("PADDY");
    }

    @Test
    void toResponse_singleListingPath_nonAgriListing_cropsEmpty_noDbCall() {
        Listing l = buildListing("LIVE");

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.crops()).isEmpty();
        verify(listingAgriCropRepository, never()).findByListingIdOrderByCodeAsc(any());
    }

    @Test
    void toResponseList_batchPath_cropsAlwaysEmpty_noExtraDbCall() {
        // AC10 (#2044): the batch/list path must NOT fetch crops, even for an agri listing —
        // this is a deliberate N+1 guard (documented decision), mirroring the identical
        // computedAreaAcres/amenities/suitableUses batch-path guards above.
        Listing agri = buildAgriListing("LIVE");
        when(listingAgriCropRepository.findByListingIdOrderByCodeAsc(any()))
                .thenReturn(List.of(new com.example.realestate.listing.agricultural.ListingAgriCrop()));

        List<ListingResponse> responses = mapper.toResponseList(List.of(agri));

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).crops()).isEmpty();
        verify(listingAgriCropRepository, never()).findByListingIdOrderByCodeAsc(any());
    }

    @Test
    void toResponse_computedAreaAcres_isDistinctFromDeclaredLandArea_andDoesNotMutateListing() {
        Listing l = buildAgriListing("LIVE");
        // Broker-declared landArea (independent of the boundary-derived value).
        l.setLandArea(new BigDecimal("3.50"));
        l.setLandAreaUnit("acre");
        BigDecimal declaredBefore = l.getLandArea();
        String declaredUnitBefore = l.getLandAreaUnit();
        // 4046.8564224 m² -> exactly 1.00 acre computed; clearly != declared 3.50.
        when(listingRepository.findBoundaryAreaSqm(l.getId()))
                .thenReturn(Optional.of(4046.8564224));

        ListingResponse response = mapper.toResponse(l);

        // Declared and computed are distinct numeric fields, side by side.
        assertThat(response.landArea()).isEqualByComparingTo(new BigDecimal("3.50"));
        assertThat(response.computedAreaAcres()).isEqualByComparingTo(new BigDecimal("1.00"));
        assertThat(response.computedAreaAcres()).isNotEqualByComparingTo(response.landArea());
        // The mapper must NOT mutate the declared landArea / unit on the entity.
        assertThat(l.getLandArea()).isEqualByComparingTo(declaredBefore);
        assertThat(l.getLandAreaUnit()).isEqualTo(declaredUnitBefore);
    }

    // ==================== T6 (#1454): anon agri teaser → context fields present, gated fields ABSENT ===

    @Test
    @org.junit.jupiter.api.DisplayName("#1454 anon agri teaser: boundary/landArea/computedAcres/agri-context present; price/survey/lat/lng ABSENT")
    void toTeaserResponse_agri_contextPresent_gatedFieldsMasked() {
        Listing l = buildAgriListing("LIVE");
        l.setLatitude(13.3409);
        l.setLongitude(74.7421);
        l.setPrice(new BigDecimal("12500000"));
        l.setPricePaise(12500000L);
        l.setLandArea(new BigDecimal("2.50"));
        l.setLandAreaUnit("acres");
        l.setWaterSource("Borewell");
        l.setSoilType("Red laterite");
        l.setRoadAccess("Tar road");
        l.setCultivationStatus("Fallow");
        l.setOwnershipType("Freehold");
        l.setSurveyNumber("SY-101/2");
        l.setLandCategory("FARMLAND");
        l.setAgriConversionStatus("CONVERSION_APPLIED");

        String geojson = "{\"type\":\"Polygon\",\"coordinates\":[]}";
        double areaSqm = 4046.856; // ~1 acre

        when(listingImageRepository.findByListingIdOrderByPositionAsc(l.getId())).thenReturn(List.of());
        when(listingRepository.findBoundaryGeoJson(l.getId())).thenReturn(Optional.of(geojson));
        when(listingRepository.findBoundaryAreaSqm(l.getId())).thenReturn(Optional.of(areaSqm));

        ListingTeaserResponse result = mapper.toTeaserResponse(l);

        // #1454 GATED FIELDS — must be null (NON_NULL omits the JSON key)
        assertThat(result.price()).as("anon agri price gated").isNull();
        assertThat(result.pricePaise()).as("anon agri pricePaise gated").isNull();
        assertThat(result.latitude()).as("anon agri lat coarsened for anon").isEqualTo(13.34);
        assertThat(result.longitude()).as("anon agri lng coarsened for anon").isEqualTo(74.74);
        assertThat(result.surveyNumber()).as("anon agri survey number gated").isNull();

        // Agri CONTEXT fields still present (boundary polygon is out of scope, unchanged)
        assertThat(result.boundary()).isEqualTo(geojson);
        assertThat(result.landArea()).isEqualByComparingTo(new BigDecimal("2.50"));
        assertThat(result.landAreaUnit()).isEqualTo("acres");
        assertThat(result.computedAreaAcres())
                .as("computedAreaAcres must not be null when area sqm is present")
                .isNotNull();
        BigDecimal expected = AreaNormalizer.sqmToAcres(BigDecimal.valueOf(areaSqm));
        assertThat(result.computedAreaAcres()).isEqualByComparingTo(expected);
        assertThat(result.waterSource()).isEqualTo("Borewell");
        assertThat(result.soilType()).isEqualTo("Red laterite");
        assertThat(result.roadAccess()).isEqualTo("Tar road");
        assertThat(result.cultivationStatus()).isEqualTo("Fallow");
        assertThat(result.ownershipType()).isEqualTo("Freehold");
        assertThat(result.landCategory()).isEqualTo("FARMLAND");
        assertThat(result.agriConversionStatus()).isEqualTo("CONVERSION_APPLIED");
    }

    // ==================== T7: real non-agri teaser → all 12 agri fields NULL ====================

    @Test
    void toTeaserResponse_nonAgri_allAgriFieldsNull() {
        Listing l = buildListing("LIVE"); // propertyType = "land"
        // Real non-null coordinates so the isAgri null-guard is exercised:
        // coarsen(null)==null would let the buggy unconditional-coarsen code pass.
        // With real coords set, lat/lng must still be null for non-agri (gate is real).
        l.setLatitude(13.34091);
        l.setLongitude(74.74215);

        // setUp() already stubs findByListingIdOrderByPositionAsc(any()) → List.of()
        // findBoundaryGeoJson / findBoundaryAreaSqm must NOT be called — verified by T8/T9
        ListingTeaserResponse result = mapper.toTeaserResponse(l);

        assertThat(result.boundary()).isNull();
        // Non-agri anon teaser must NOT leak coordinates, even coarsened (regression guard #1454).
        assertThat(result.latitude()).isNull();
        assertThat(result.longitude()).isNull();
        assertThat(result.landArea()).isNull();
        assertThat(result.landAreaUnit()).isNull();
        assertThat(result.computedAreaAcres()).isNull();
        assertThat(result.waterSource()).isNull();
        assertThat(result.soilType()).isNull();
        assertThat(result.roadAccess()).isNull();
        assertThat(result.cultivationStatus()).isNull();
        assertThat(result.ownershipType()).isNull();
        assertThat(result.surveyNumber()).isNull();
        assertThat(result.landCategory()).isNull();
        assertThat(result.agriConversionStatus()).isNull();
    }

    // ==================== T8: findBoundaryGeoJson called once for agri, never for non-agri ====================

    @Test
    void toTeaserResponse_agri_callsFindBoundaryGeoJsonExactlyOnce() {
        Listing l = buildAgriListing("LIVE");
        when(listingImageRepository.findByListingIdOrderByPositionAsc(l.getId())).thenReturn(List.of());
        when(listingRepository.findBoundaryGeoJson(l.getId())).thenReturn(Optional.empty());
        when(listingRepository.findBoundaryAreaSqm(l.getId())).thenReturn(Optional.empty());

        mapper.toTeaserResponse(l);

        verify(listingRepository, org.mockito.Mockito.times(1)).findBoundaryGeoJson(l.getId());
    }

    @Test
    void toTeaserResponse_nonAgri_neverCallsFindBoundaryGeoJson() {
        Listing l = buildListing("LIVE"); // propertyType = "land"
        // setUp() default stubs cover all needed calls

        mapper.toTeaserResponse(l);

        verify(listingRepository, never()).findBoundaryGeoJson(any());
    }

    // ==================== T9: findBoundaryAreaSqm called once for agri, never for non-agri ====================

    @Test
    void toTeaserResponse_agri_callsFindBoundaryAreaSqmExactlyOnce() {
        Listing l = buildAgriListing("LIVE");
        when(listingImageRepository.findByListingIdOrderByPositionAsc(l.getId())).thenReturn(List.of());
        when(listingRepository.findBoundaryGeoJson(l.getId())).thenReturn(Optional.empty());
        when(listingRepository.findBoundaryAreaSqm(l.getId())).thenReturn(Optional.empty());

        mapper.toTeaserResponse(l);

        verify(listingRepository, org.mockito.Mockito.times(1)).findBoundaryAreaSqm(l.getId());
    }

    @Test
    void toTeaserResponse_nonAgri_neverCallsFindBoundaryAreaSqm() {
        Listing l = buildListing("LIVE"); // propertyType = "land"

        mapper.toTeaserResponse(l);

        verify(listingRepository, never()).findBoundaryAreaSqm(any());
    }

    // ==================== T10: batch toTeaserResponseList → ZERO boundary/area DB calls ====================

    @Test
    void toTeaserResponseList_neverCallsBoundaryOrAreaRepo() {
        Listing agri = buildAgriListing("LIVE");
        Listing house = buildListing("LIVE");
        house.setPropertyType("house");

        when(listingImageRepository.findByListingIdInOrderByListingIdAscPositionAsc(anyList()))
                .thenReturn(List.of());

        List<ListingTeaserResponse> results = mapper.toTeaserResponseList(List.of(agri, house));

        verify(listingRepository, never()).findBoundaryGeoJson(any());
        verify(listingRepository, never()).findBoundaryAreaSqm(any());
        assertThat(results).hasSize(2);

        // N+1 guard: even the agri entry must have null for all 12 agri fields on the batch path
        ListingTeaserResponse agriResult = results.stream()
                .filter(r -> "agricultural_land".equals(r.propertyType()))
                .findFirst().orElseThrow();
        assertThat(agriResult.boundary()).as("batch path must not populate boundary (N+1 guard)").isNull();
        assertThat(agriResult.latitude()).as("batch path must not populate latitude (N+1 guard)").isNull();
        assertThat(agriResult.computedAreaAcres())
                .as("batch path must not populate computedAreaAcres (N+1 guard)").isNull();
    }

    // ==================== T11: null propertyType → no throw, all agri fields null ====================

    @Test
    void toTeaserResponse_nullPropertyType_doesNotThrowAndAgriFieldsNull() {
        Listing l = new Listing();
        UUID nullTypeId = UUID.randomUUID();
        l.setId(nullTypeId);
        l.setPropertyType(null);
        l.setLocality("Udupi");

        when(listingImageRepository.findByListingIdOrderByPositionAsc(nullTypeId))
                .thenReturn(List.of());

        ListingTeaserResponse result = null;
        try {
            result = mapper.toTeaserResponse(l);
        } catch (Exception e) {
            org.junit.jupiter.api.Assertions.fail("toTeaserResponse must not throw for null propertyType: " + e);
        }

        assertThat(result.boundary()).isNull();
        assertThat(result.latitude()).isNull();
        verify(listingRepository, never()).findBoundaryGeoJson(any());
        verify(listingRepository, never()).findBoundaryAreaSqm(any());
    }

    // ==================== #1452: pricePaise single-source-of-truth ====================

    @Test
    void agriListing_pricePaise_mappedToListingResponse() {
        // Agri seed condition: pricePaise populated, deprecated price column is null
        Listing l = buildAgriListing("LIVE");
        l.setPricePaise(12500000L);
        l.setPrice(null);

        ListingResponse response = mapper.toPublicResponse(l, true);

        assertThat(response.pricePaise()).isEqualTo(12500000L);
        // price may be null — must not throw
        assertThat(response.price()).isNull();
    }

    @Test
    void residentialListing_priceUnchanged_pricePaiseNull() {
        Listing l = buildListing("LIVE");
        l.setPrice(new BigDecimal("750000"));
        l.setPricePaise(null);

        ListingResponse response = mapper.toPublicResponse(l, true);

        assertThat(response.price()).isEqualByComparingTo(new BigDecimal("750000"));
        assertThat(response.pricePaise()).isNull();
    }

    @Test
    void agriListing_bothPriceFieldsNull_degradesSafely() {
        Listing l = buildAgriListing("LIVE");
        l.setPrice(null);
        l.setPricePaise(null);

        ListingResponse response = mapper.toPublicResponse(l, true);

        assertThat(response.price()).isNull();
        assertThat(response.pricePaise()).isNull();
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#1454: anon agri teaser pricePaise is gated (null) — but canonical entity value untouched")
    void teaserBuilder_agriListing_pricePaiseGatedForAnon() {
        Listing l = buildAgriListing("LIVE");
        l.setPricePaise(12500000L);

        ListingTeaserResponse teaser = mapper.toTeaserResponse(l);

        // #1454: anonymous agri callers must NOT receive price/pricePaise.
        assertThat(teaser.pricePaise()).isNull();
        assertThat(teaser.price()).isNull();
        // #1452 guard: entity source-of-truth is NOT mutated by the mask.
        assertThat(l.getPricePaise()).isEqualTo(12500000L);
    }

    // ==================== #1454: anon agri gating (detail teaser) ====================

    @Test
    @org.junit.jupiter.api.DisplayName("#1454 BE-TC1: anon agri teaser coarsens lat/lng + masks price+pricePaise+survey")
    void toTeaserResponse_anonAgri_masksPriceSurveyAndExactLocation() {
        Listing l = buildAgriListing("LIVE");
        l.setPrice(new BigDecimal("12500000"));
        l.setPricePaise(12500000L);
        l.setLatitude(13.34091);
        l.setLongitude(74.74215);
        l.setSurveyNumber("SY-101/2");
        l.setLandArea(new BigDecimal("2.50"));
        l.setLandAreaUnit("acres");
        l.setWaterSource("Borewell");

        when(listingRepository.findBoundaryGeoJson(l.getId()))
                .thenReturn(Optional.of("{\"type\":\"Polygon\"}"));

        ListingTeaserResponse teaser = mapper.toTeaserResponse(l);

        // 5 gated fields ABSENT (null → omitted by @JsonInclude(NON_NULL))
        assertThat(teaser.price()).isNull();
        assertThat(teaser.pricePaise()).isNull();
        assertThat(teaser.latitude()).as("anon agri lat coarsened").isEqualTo(13.34);
        assertThat(teaser.longitude()).as("anon agri lng coarsened").isEqualTo(74.74);
        assertThat(teaser.surveyNumber()).isNull();
        // agri context still present
        assertThat(teaser.boundary()).isEqualTo("{\"type\":\"Polygon\"}");
        assertThat(teaser.landArea()).isEqualByComparingTo(new BigDecimal("2.50"));
        assertThat(teaser.waterSource()).isEqualTo("Borewell");
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#1454 BE-TC2: authed agri detail (toPublicResponse) keeps price+pricePaise+survey+lat/lng")
    void toPublicResponse_authedAgri_keepsPriceSurveyAndExactLocation() {
        Listing l = buildAgriListing("LIVE");
        l.setPrice(null);
        l.setPricePaise(12500000L);
        l.setLatitude(13.34091);
        l.setLongitude(74.74215);
        l.setSurveyNumber("SY-101/2");

        ListingResponse response = mapper.toPublicResponse(l, true);

        // #1452 canonical pricePaise intact for authed callers
        assertThat(response.pricePaise()).isEqualTo(12500000L);
        assertThat(response.surveyNumber()).isEqualTo("SY-101/2");
        assertThat(response.latitude()).isEqualTo(13.34091);
        assertThat(response.longitude()).isEqualTo(74.74215);
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#1454 BE-TC3: dealer/admin agri (toResponse) keeps price+survey+lat/lng (no over-masking)")
    void toResponse_dealerAdminAgri_keepsAllSensitiveFields() {
        Listing l = buildAgriListing("LIVE");
        l.setPrice(new BigDecimal("12500000"));
        l.setPricePaise(12500000L);
        l.setLatitude(13.34091);
        l.setLongitude(74.74215);
        l.setSurveyNumber("SY-101/2");

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.price()).isEqualByComparingTo(new BigDecimal("12500000"));
        assertThat(response.pricePaise()).isEqualTo(12500000L);
        assertThat(response.surveyNumber()).isEqualTo("SY-101/2");
        assertThat(response.latitude()).isEqualTo(13.34091);
        assertThat(response.longitude()).isEqualTo(74.74215);
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#1941: residential anon teaser masks exact price and emits a priceBand instead")
    void toTeaserResponse_residentialAnon_priceMaskedBandEmitted() {
        Listing l = buildListing("LIVE"); // propertyType = "land" (non-agri)
        l.setPrice(new BigDecimal("750000"));
        l.setPricePaise(75000000L); // ₹7.5 L -> "₹0–25L" band

        ListingTeaserResponse teaser = mapper.toTeaserResponse(l);

        assertThat(teaser.price()).isNull();
        assertThat(teaser.pricePaise()).isNull();
        assertThat(teaser.priceBand()).isEqualTo(com.example.realestate.discover.PriceBand.of(75000000L));
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#1454 BE-TC5: anon agri teaser lat/lng coarsened to 2dp (not exact, not null)")
    void toTeaserResponse_anonAgri_latLngCoarsenedTo2dp() {
        Listing l = buildAgriListing("LIVE");
        l.setLatitude(13.34091);
        l.setLongitude(74.74215);

        when(listingRepository.findBoundaryGeoJson(l.getId())).thenReturn(Optional.empty());

        ListingTeaserResponse teaser = mapper.toTeaserResponse(l);

        // Coarsened to 2dp: truncate toward zero
        assertThat(teaser.latitude()).as("must be coarsened, not exact").isEqualTo(13.34);
        assertThat(teaser.longitude()).as("must be coarsened, not exact").isEqualTo(74.74);
        // Not exact
        assertThat(teaser.latitude()).isNotEqualTo(13.34091);
        assertThat(teaser.longitude()).isNotEqualTo(74.74215);
        // Not null — anon should see an approximate marker
        assertThat(teaser.latitude()).isNotNull();
        assertThat(teaser.longitude()).isNotNull();
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#1454 BE-TC6: anon agri teaser null lat/lng stays null (no 0.0 marker)")
    void toTeaserResponse_anonAgri_nullLatLng_staysNull() {
        Listing l = buildAgriListing("LIVE");
        l.setLatitude(null);
        l.setLongitude(null);

        when(listingRepository.findBoundaryGeoJson(l.getId())).thenReturn(Optional.empty());

        ListingTeaserResponse teaser = mapper.toTeaserResponse(l);

        // null-guard: coarsen(null) must return null, not 0.0
        assertThat(teaser.latitude()).as("null coord must not become 0.0").isNull();
        assertThat(teaser.longitude()).as("null coord must not become 0.0").isNull();
    }

    // ==================== #1726: toPublicResponse exact-pin gate ====================

    @Test
    @org.junit.jupiter.api.DisplayName("#1726: allowExactPin=false coarsens lat/lng to 2dp (non-owner buyer)")
    void toPublicResponse_allowExactPinFalse_coarsensLatLng() {
        Listing l = buildListing("LIVE");
        l.setLatitude(13.34091);
        l.setLongitude(74.74215);

        ListingResponse response = mapper.toPublicResponse(l, false);

        assertThat(response.latitude()).isEqualTo(13.34);
        assertThat(response.longitude()).isEqualTo(74.74);
        assertThat(response.latitude()).isNotEqualTo(13.34091);
        assertThat(response.longitude()).isNotEqualTo(74.74215);
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#1726: allowExactPin=true (owner/admin) keeps exact lat/lng")
    void toPublicResponse_allowExactPinTrue_keepsExactLatLng() {
        Listing l = buildListing("LIVE");
        l.setLatitude(13.34091);
        l.setLongitude(74.74215);

        ListingResponse response = mapper.toPublicResponse(l, true);

        assertThat(response.latitude()).isEqualTo(13.34091);
        assertThat(response.longitude()).isEqualTo(74.74215);
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#1726: allowExactPin=false + null lat/lng stays null (no (0,0) marker)")
    void toPublicResponse_allowExactPinFalse_nullLatLngStaysNull() {
        Listing l = buildListing("LIVE");
        l.setLatitude(null);
        l.setLongitude(null);

        ListingResponse response = mapper.toPublicResponse(l, false);

        assertThat(response.latitude()).isNull();
        assertThat(response.longitude()).isNull();
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#1726: toResponse (broker/admin management path) always keeps exact lat/lng")
    void toResponse_alwaysKeepsExactLatLng() {
        Listing l = buildListing("LIVE");
        l.setLatitude(13.34091);
        l.setLongitude(74.74215);

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.latitude()).isEqualTo(13.34091);
        assertThat(response.longitude()).isEqualTo(74.74215);
    }

    // ==================== #1941: anon residential priceBand (single-listing teaser) ====================

    @Test
    @org.junit.jupiter.api.DisplayName("#1941: anon residential with positive pricePaise -> priceBand set, price/pricePaise null")
    void toTeaserResponse_anonResidential_pricePresent_bandSetNoExactPrice() {
        Listing l = buildListing("LIVE"); // propertyType = "land" (non-agri)
        l.setPricePaise(75_000_000L); // ₹7.5 L

        ListingTeaserResponse teaser = mapper.toTeaserResponse(l);

        assertThat(teaser.priceBand()).isEqualTo(com.example.realestate.discover.PriceBand.of(75_000_000L));
        assertThat(teaser.price()).isNull();
        assertThat(teaser.pricePaise()).isNull();
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#1941: anon residential with pricePaise=0 -> priceBand null (no fabricated band)")
    void toTeaserResponse_anonResidential_priceZero_bandNullNotFabricated() {
        Listing l = buildListing("LIVE");
        l.setPricePaise(0L);

        ListingTeaserResponse teaser = mapper.toTeaserResponse(l);

        assertThat(teaser.priceBand()).isNull();
        assertThat(teaser.price()).isNull();
        assertThat(teaser.pricePaise()).isNull();
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#1941: anon residential with null pricePaise -> price/pricePaise/priceBand all null")
    void toTeaserResponse_anonResidential_priceNull_allThreeNull() {
        Listing l = buildListing("LIVE");
        l.setPricePaise(null);

        ListingTeaserResponse teaser = mapper.toTeaserResponse(l);

        assertThat(teaser.priceBand()).isNull();
        assertThat(teaser.price()).isNull();
        assertThat(teaser.pricePaise()).isNull();
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#1941: anon residential pricePaise exactly at a PriceBand boundary lands in the upper bucket")
    void toTeaserResponse_anonResidential_atBandBoundary_landsInUpperBucket() {
        Listing l = buildListing("LIVE");
        // PriceBand.BAND_25L_PAISE boundary: exactly ₹25L must land in the "₹25–50L" bucket
        // (PriceBand.of uses strict `<`, so the boundary value itself is NOT in the lower bucket).
        l.setPricePaise(2_500_000_00L);

        ListingTeaserResponse teaser = mapper.toTeaserResponse(l);

        assertThat(teaser.priceBand()).isEqualTo(com.example.realestate.discover.PriceBand.of(2_500_000_00L));
        assertThat(teaser.priceBand()).isEqualTo("₹25–50L");
        assertThat(teaser.price()).isNull();
        assertThat(teaser.pricePaise()).isNull();
    }

    @Test
    @org.junit.jupiter.api.DisplayName("#1941: anon agri teaser byte-identical — price/pricePaise/priceBand all null, agri fields unaffected")
    void toTeaserResponse_anonAgri_byteIdentical_noBandEitherEvenWithPositivePrice() {
        Listing l = buildAgriListing("LIVE");
        l.setPricePaise(75_000_000L); // positive price — must still yield a null band for agri
        l.setWaterSource("Borewell");

        ListingTeaserResponse teaser = mapper.toTeaserResponse(l);

        assertThat(teaser.price()).isNull();
        assertThat(teaser.pricePaise()).isNull();
        assertThat(teaser.priceBand()).as("agri stays fully price-silent — no band either").isNull();
        // Agri-context fields untouched by the #1941 change.
        assertThat(teaser.waterSource()).isEqualTo("Borewell");
    }

    // ==================== #1941: anon residential priceBand (BATCH teaser) ====================

    @Test
    @org.junit.jupiter.api.DisplayName("#1941: toTeaserResponseList — mixed batch, band/no-exact-price/agri-null all correct per-row")
    void toTeaserResponseList_mixedBatch_perRowPriceBandCorrect() {
        Listing residentialWithPrice = buildListing("LIVE");
        residentialWithPrice.setPricePaise(75_000_000L); // ₹7.5L
        Listing residentialNullPrice = buildListing("LIVE");
        residentialNullPrice.setPricePaise(null);
        Listing agri = buildAgriListing("LIVE");
        agri.setPricePaise(75_000_000L); // positive — must still be masked with no band

        when(listingImageRepository.findByListingIdInOrderByListingIdAscPositionAsc(anyList()))
                .thenReturn(List.of());

        List<ListingTeaserResponse> results = mapper.toTeaserResponseList(
                List.of(residentialWithPrice, residentialNullPrice, agri));

        ListingTeaserResponse r1 = results.stream()
                .filter(r -> r.id().equals(residentialWithPrice.getId())).findFirst().orElseThrow();
        assertThat(r1.price()).isNull();
        assertThat(r1.pricePaise()).isNull();
        assertThat(r1.priceBand()).isEqualTo(com.example.realestate.discover.PriceBand.of(75_000_000L));

        ListingTeaserResponse r2 = results.stream()
                .filter(r -> r.id().equals(residentialNullPrice.getId())).findFirst().orElseThrow();
        assertThat(r2.price()).isNull();
        assertThat(r2.pricePaise()).isNull();
        assertThat(r2.priceBand()).isNull();

        ListingTeaserResponse r3 = results.stream()
                .filter(r -> r.id().equals(agri.getId())).findFirst().orElseThrow();
        assertThat(r3.price()).isNull();
        assertThat(r3.pricePaise()).isNull();
        assertThat(r3.priceBand()).as("agri batch row stays fully price-silent — no band either").isNull();
    }

    // ==================== #1941 F2: anon band coverage is "every family except agri", not residential-only ====================

    @Test
    @org.junit.jupiter.api.DisplayName("#1941 F2: commercial_building anon teaser gets the same priceBand treatment as residential (not agri-negation-by-accident)")
    void toTeaserResponse_commercialBuilding_getsBandSameAsResidential_priceAbsent() {
        Listing commercial = buildListing("LIVE");
        commercial.setPropertyType("commercial_building");
        commercial.setPricePaise(75_000_000L); // ₹7.5L

        Listing residential = buildListing("LIVE");
        residential.setPropertyType("apartment");
        residential.setPricePaise(75_000_000L); // same price -> must yield the same band

        ListingTeaserResponse commercialTeaser = mapper.toTeaserResponse(commercial);
        ListingTeaserResponse residentialTeaser = mapper.toTeaserResponse(residential);

        // Non-agri commercial family gets a real band, never a fabricated exact price.
        assertThat(commercialTeaser.priceBand())
                .as("commercial_building must receive an anon priceBand like any other non-agri family")
                .isEqualTo(com.example.realestate.discover.PriceBand.of(75_000_000L));
        assertThat(commercialTeaser.price()).isNull();
        assertThat(commercialTeaser.pricePaise()).isNull();

        // Parity: same pricePaise on commercial_building and a residential type yields the SAME
        // band value — proving the coverage is a deliberate "every family except agri" policy,
        // not a residential-only accident of the old isAgri negation.
        assertThat(commercialTeaser.priceBand()).isEqualTo(residentialTeaser.priceBand());
    }

    // ==================== Helper ====================

    private Listing buildListing(String status) {
        Listing l = new Listing();
        l.setId(UUID.randomUUID());
        l.setStatus(status);
        l.setPropertyType("land");
        l.setTitle("A Listing");
        l.setLocality("Udupi");
        l.setPrice(new BigDecimal("5000000"));
        l.setCreatedAt(OffsetDateTime.now().minusDays(5));
        l.setUpdatedAt(OffsetDateTime.now().minusDays(1));
        return l;
    }

    private Listing buildAgriListing(String status) {
        Listing l = buildListing(status);
        l.setPropertyType("agricultural_land");
        return l;
    }
}

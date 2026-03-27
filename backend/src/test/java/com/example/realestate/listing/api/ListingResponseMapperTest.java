package com.example.realestate.listing.api;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.image.ListingImage;
import com.example.realestate.listing.image.ListingImageRepository;
import com.example.realestate.trust.ListingVerificationDimensionRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for ListingResponseMapper.
 * Verifies security invariant (rejectionReason hidden on public response),
 * image resolution, daysOnMarket fallback, and reraValid computation.
 */
class ListingResponseMapperTest {

    private ListingImageRepository listingImageRepository;
    private ListingVerificationDimensionRepository dimensionRepository;
    private ListingResponseMapper mapper;

    @BeforeEach
    void setUp() {
        listingImageRepository = mock(ListingImageRepository.class);
        dimensionRepository = mock(ListingVerificationDimensionRepository.class);
        mapper = new ListingResponseMapper(listingImageRepository, dimensionRepository);

        // Default: no images
        when(listingImageRepository.findByListingIdOrderByPositionAsc(any())).thenReturn(List.of());
        // Default: no earned badges
        when(dimensionRepository.countByListingIdAndBadgeState(any(), anyString())).thenReturn(0L);
        when(dimensionRepository.findAllByListingIdInAndBadgeState(anyList(), anyString())).thenReturn(List.of());
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

        ListingResponse response = mapper.toPublicResponse(l);

        assertThat(response.rejectionReason()).isNull();
    }

    @Test
    void toPublicResponse_rejectionReasonNullWhenListingHasNone() {
        Listing l = buildListing("LIVE");
        l.setRejectionReason(null);

        ListingResponse response = mapper.toPublicResponse(l);

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
        when(listingImageRepository.findByListingIdOrderByPositionAsc(l.getId()))
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
        when(listingImageRepository.findByListingIdOrderByPositionAsc(l.getId()))
                .thenReturn(List.of(img));

        ListingResponse response = mapper.toResponse(l);

        assertThat(response.imageCount()).isEqualTo(1);
        assertThat(response.firstImageUrl()).isEqualTo("https://example.com/single.jpg");
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
}

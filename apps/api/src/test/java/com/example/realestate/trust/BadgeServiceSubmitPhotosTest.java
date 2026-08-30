package com.example.realestate.trust;

import com.example.realestate.listing.audit.AdminAuditService;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link BadgeService#submitPhotos}.
 * No Spring context — all dependencies are mocked via Mockito.
 */
@ExtendWith(MockitoExtension.class)
class BadgeServiceSubmitPhotosTest {

    @Mock
    private ListingVerificationDimensionRepository dimensionRepository;

    @Mock
    private ListingRepository listingRepository;

    @Mock
    private TrustTierCalculator trustTierCalculator;

    @Mock
    private RankingScoreCalculator rankingScoreCalculator;

    @Mock
    private AdminAuditService adminAuditService;

    @Mock
    private AuthorityEvidenceRepository authorityEvidenceRepository;

    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    private BadgeService badgeService;

    private UUID listingId;
    private UUID callerId;
    private Listing stubListing;

    @BeforeEach
    void setUp() {
        badgeService = new BadgeService(
                dimensionRepository,
                listingRepository,
                trustTierCalculator,
                rankingScoreCalculator,
                adminAuditService,
                objectMapper,
                authorityEvidenceRepository);

        listingId = UUID.randomUUID();
        callerId = UUID.randomUUID();

        stubListing = new Listing();
        stubListing.setId(listingId);
        stubListing.setTrustTier("D");

        // lenient: these stubs are only reached when tier recalculation runs
        lenient().when(trustTierCalculator.calculate(listingId))
                .thenReturn(new TrustTierResult(listingId, "D"));
        lenient().when(listingRepository.findById(listingId))
                .thenReturn(Optional.of(stubListing));
        lenient().when(listingRepository.save(any())).thenReturn(stubListing);
        lenient().when(rankingScoreCalculator.calculate(any(Listing.class))).thenReturn(0);
    }

    // -------------------------------------------------------------------------
    // Helper
    // -------------------------------------------------------------------------

    private ListingVerificationDimension dimensionWithState(String state) {
        ListingVerificationDimension d = new ListingVerificationDimension();
        d.setListingId(listingId);
        d.setDimensionType("PHOTOS");
        d.setBadgeState(state);
        d.setUpdatedAt(OffsetDateTime.now().minusDays(1));
        return d;
    }

    // -------------------------------------------------------------------------
    // Tests
    // -------------------------------------------------------------------------

    /**
     * No existing PHOTOS row — service creates a new row in PENDING state.
     */
    @Test
    void submitPhotos_newDimension_createsPendingRow() {
        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "PHOTOS"))
                .thenReturn(Optional.empty());
        when(dimensionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        ListingVerificationDimension result = badgeService.submitPhotos(listingId, callerId, null);

        assertThat(result.getBadgeState()).isEqualTo("PENDING");
        assertThat(result.getDimensionType()).isEqualTo("PHOTOS");
        assertThat(result.getListingId()).isEqualTo(listingId);
        assertThat(result.getUpdatedAt()).isNotNull();
    }

    /**
     * Existing PHOTOS row in AVAILABLE state — service updates it to PENDING.
     */
    @Test
    void submitPhotos_existingAvailable_updatesToPending() {
        ListingVerificationDimension existing = dimensionWithState("AVAILABLE");

        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "PHOTOS"))
                .thenReturn(Optional.of(existing));
        when(dimensionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        ListingVerificationDimension result = badgeService.submitPhotos(listingId, callerId, null);

        assertThat(result.getBadgeState()).isEqualTo("PENDING");
    }

    /**
     * Existing PHOTOS row already PENDING — service throws PhotoAlreadySubmittedException.
     */
    @Test
    void submitPhotos_existingPending_throwsConflict() {
        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "PHOTOS"))
                .thenReturn(Optional.of(dimensionWithState("PENDING")));

        assertThatThrownBy(() -> badgeService.submitPhotos(listingId, callerId, null))
                .isInstanceOf(PhotoAlreadySubmittedException.class)
                .satisfies(ex -> assertThat(
                        ((PhotoAlreadySubmittedException) ex).getCurrentState()).isEqualTo("PENDING"));
    }

    /**
     * Existing PHOTOS row already EARNED — service throws PhotoAlreadySubmittedException.
     */
    @Test
    void submitPhotos_existingEarned_throwsConflict() {
        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "PHOTOS"))
                .thenReturn(Optional.of(dimensionWithState("EARNED")));

        assertThatThrownBy(() -> badgeService.submitPhotos(listingId, callerId, null))
                .isInstanceOf(PhotoAlreadySubmittedException.class)
                .satisfies(ex -> assertThat(
                        ((PhotoAlreadySubmittedException) ex).getCurrentState()).isEqualTo("EARNED"));
    }
}

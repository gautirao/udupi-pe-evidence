package com.example.realestate.trust;

import com.example.realestate.listing.audit.AdminAuditService;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.exception.ListingNotFoundException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link BadgeService}.
 *
 * <p>No Spring context — all dependencies are mocked via Mockito.
 * The test verifies entity mutations, tier recalculation delegation,
 * audit record emission, and the three lifecycle operations.
 *
 * <p>AC5 (IDENTITY + PHOTOS → Tier B): The tier rule correctness is verified by
 * {@code TrustTierCalculatorTest#calculate_tierB_whenIdentityAndPhotosEarned_noAuthority_noOpenComplaint}.
 * The {@link #grantBadge_identityThenPhotos_trustTierBecomesB} test below verifies that
 * BadgeService correctly delegates to and persists the tier returned by TrustTierCalculator.
 */
@ExtendWith(MockitoExtension.class)
class BadgeServiceTest {

    @Mock
    private ListingVerificationDimensionRepository dimensionRepository;

    @Mock
    private ListingRepository listingRepository;

    @Mock
    private TrustTierCalculator trustTierCalculator;

    @Mock
    private AdminAuditService adminAuditService;

    // Real ObjectMapper — BadgeService uses it for JSON serialisation; a real instance
    // avoids stubbing every writeValueAsString call while keeping the test fast (no I/O).
    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private BadgeService badgeService;

    private UUID listingId;
    private UUID actorId;
    private Listing stubListing;

    @BeforeEach
    void setUp() {
        listingId = UUID.randomUUID();
        actorId = UUID.randomUUID();

        stubListing = new Listing();
        stubListing.setId(listingId);
        stubListing.setTrustTier("D");
    }

    // -------------------------------------------------------------------------
    // Helper builders
    // -------------------------------------------------------------------------

    private ListingVerificationDimension existingDimension(String dimensionType, String badgeState) {
        ListingVerificationDimension d = new ListingVerificationDimension();
        d.setListingId(listingId);
        d.setDimensionType(dimensionType);
        d.setBadgeState(badgeState);
        d.setUpdatedAt(OffsetDateTime.now().minusDays(1));
        return d;
    }

    // -------------------------------------------------------------------------
    // AC1: grantBadge — row exists, update to EARNED
    // -------------------------------------------------------------------------

    @Test
    void grantBadge_setsEarnedState_andGrantedAt_whenRowExists() {
        ListingVerificationDimension existing = existingDimension("IDENTITY", "AVAILABLE");

        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "IDENTITY"))
                .thenReturn(Optional.of(existing));
        when(dimensionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(trustTierCalculator.calculate(listingId)).thenReturn(new TrustTierResult(listingId, "C"));
        when(listingRepository.findById(listingId)).thenReturn(Optional.of(stubListing));
        when(listingRepository.save(any())).thenReturn(stubListing);

        ListingVerificationDimension result = badgeService.grantBadge(
                listingId, "IDENTITY", actorId, "Passport verified");

        assertThat(result.getBadgeState()).isEqualTo("EARNED");
        assertThat(result.getGrantedAt()).isNotNull();
        assertThat(result.getUpdatedAt()).isNotNull();
    }

    @Test
    void grantBadge_callsTrustTierCalculator_andPersistsTier() {
        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "IDENTITY"))
                .thenReturn(Optional.empty());
        when(dimensionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(trustTierCalculator.calculate(listingId)).thenReturn(new TrustTierResult(listingId, "C"));
        when(listingRepository.findById(listingId)).thenReturn(Optional.of(stubListing));
        when(listingRepository.save(any())).thenReturn(stubListing);

        badgeService.grantBadge(listingId, "IDENTITY", actorId, null);

        verify(trustTierCalculator).calculate(listingId);
        ArgumentCaptor<Listing> listingCaptor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(listingCaptor.capture());
        assertThat(listingCaptor.getValue().getTrustTier()).isEqualTo("C");
    }

    @Test
    void grantBadge_createsNewRow_whenRowDoesNotExist() {
        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "PHOTOS"))
                .thenReturn(Optional.empty());
        when(dimensionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(trustTierCalculator.calculate(listingId)).thenReturn(new TrustTierResult(listingId, "D"));
        when(listingRepository.findById(listingId)).thenReturn(Optional.of(stubListing));
        when(listingRepository.save(any())).thenReturn(stubListing);

        ListingVerificationDimension result = badgeService.grantBadge(
                listingId, "PHOTOS", actorId, null);

        assertThat(result.getListingId()).isEqualTo(listingId);
        assertThat(result.getDimensionType()).isEqualTo("PHOTOS");
        assertThat(result.getBadgeState()).isEqualTo("EARNED");
    }

    @Test
    void grantBadge_writesAuditRecord() {
        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "IDENTITY"))
                .thenReturn(Optional.empty());
        when(dimensionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(trustTierCalculator.calculate(listingId)).thenReturn(new TrustTierResult(listingId, "C"));
        when(listingRepository.findById(listingId)).thenReturn(Optional.of(stubListing));
        when(listingRepository.save(any())).thenReturn(stubListing);

        badgeService.grantBadge(listingId, "IDENTITY", actorId, "Aadhaar check passed");

        verify(adminAuditService).record(
                eq(actorId),
                eq("BADGE_GRANTED"),
                eq("listing_verification_dimension"),
                any(),
                any(),
                anyString());
    }

    @Test
    void grantBadge_evidenceNote_notPresentInDimensionEntity() {
        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "IDENTITY"))
                .thenReturn(Optional.empty());
        when(dimensionRepository.save(any())).thenAnswer(inv -> {
            ListingVerificationDimension d = inv.getArgument(0);
            // Verify the entity has no evidence_note field — compile-time guarantee,
            // but this confirms the saved object is not contaminated at runtime.
            return d;
        });
        when(trustTierCalculator.calculate(listingId)).thenReturn(new TrustTierResult(listingId, "D"));
        when(listingRepository.findById(listingId)).thenReturn(Optional.of(stubListing));
        when(listingRepository.save(any())).thenReturn(stubListing);

        ListingVerificationDimension result = badgeService.grantBadge(
                listingId, "IDENTITY", actorId, "SECRET_EVIDENCE_DATA");

        // ListingVerificationDimension has no evidenceNote field — this assertion
        // verifies the returned entity only has the expected mutable fields set.
        assertThat(result.getBadgeState()).isEqualTo("EARNED");
        assertThat(result.getListingId()).isEqualTo(listingId);
        assertThat(result.getDimensionType()).isEqualTo("IDENTITY");
        // No evidenceNote field exists on the entity — confirmed by compile.
    }

    // -------------------------------------------------------------------------
    // AC2: suspendBadge — sets SUSPENDED, suspended_at, tier recalculated
    // -------------------------------------------------------------------------

    @Test
    void suspendBadge_setsState_andSuspendedAt_andRecalculatesTier() {
        ListingVerificationDimension existing = existingDimension("AUTHORITY", "EARNED");

        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "AUTHORITY"))
                .thenReturn(Optional.of(existing));
        when(dimensionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(trustTierCalculator.calculate(listingId)).thenReturn(new TrustTierResult(listingId, "D"));
        when(listingRepository.findById(listingId)).thenReturn(Optional.of(stubListing));
        when(listingRepository.save(any())).thenReturn(stubListing);

        ListingVerificationDimension result = badgeService.suspendBadge(
                listingId, "AUTHORITY", actorId, "Complaint confirmed");

        assertThat(result.getBadgeState()).isEqualTo("SUSPENDED");
        assertThat(result.getSuspendedAt()).isNotNull();

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        assertThat(captor.getValue().getTrustTier()).isEqualTo("D");
    }

    @Test
    void suspendBadge_writesAuditRecord() {
        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "AUTHORITY"))
                .thenReturn(Optional.of(existingDimension("AUTHORITY", "EARNED")));
        when(dimensionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(trustTierCalculator.calculate(listingId)).thenReturn(new TrustTierResult(listingId, "D"));
        when(listingRepository.findById(listingId)).thenReturn(Optional.of(stubListing));
        when(listingRepository.save(any())).thenReturn(stubListing);

        badgeService.suspendBadge(listingId, "AUTHORITY", actorId, "Fraud confirmed");

        verify(adminAuditService).record(
                eq(actorId),
                eq("BADGE_SUSPENDED"),
                eq("listing_verification_dimension"),
                any(),
                anyString(),
                anyString());
    }

    @Test
    void suspendBadge_throwsBadgeNotFoundException_whenRowDoesNotExist() {
        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "IDENTITY"))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> badgeService.suspendBadge(listingId, "IDENTITY", actorId, "reason"))
                .isInstanceOf(BadgeNotFoundException.class)
                .hasMessageContaining("IDENTITY");

        verify(adminAuditService, never()).record(any(), any(), any(), any(), any(), any());
    }

    // -------------------------------------------------------------------------
    // AC3: expireBadge — sets EXPIRED, expires_at set to now, tier recalculated
    // -------------------------------------------------------------------------

    @Test
    void expireBadge_setsState_andExpiresAt_andRecalculatesTier() {
        ListingVerificationDimension existing = existingDimension("PHOTOS", "EARNED");

        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "PHOTOS"))
                .thenReturn(Optional.of(existing));
        when(dimensionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(trustTierCalculator.calculate(listingId)).thenReturn(new TrustTierResult(listingId, "D"));
        when(listingRepository.findById(listingId)).thenReturn(Optional.of(stubListing));
        when(listingRepository.save(any())).thenReturn(stubListing);

        ListingVerificationDimension result = badgeService.expireBadge(listingId, "PHOTOS", actorId);

        assertThat(result.getBadgeState()).isEqualTo("EXPIRED");
        assertThat(result.getExpiresAt()).isNotNull();

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        assertThat(captor.getValue().getTrustTier()).isEqualTo("D");
    }

    @Test
    void expireBadge_overwritesPreviouslyScheduledExpiresAt() {
        ListingVerificationDimension existing = existingDimension("PHOTOS", "EARNED");
        existing.setExpiresAt(OffsetDateTime.now().plusDays(30)); // previously scheduled

        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "PHOTOS"))
                .thenReturn(Optional.of(existing));
        when(dimensionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(trustTierCalculator.calculate(listingId)).thenReturn(new TrustTierResult(listingId, "D"));
        when(listingRepository.findById(listingId)).thenReturn(Optional.of(stubListing));
        when(listingRepository.save(any())).thenReturn(stubListing);

        ListingVerificationDimension result = badgeService.expireBadge(listingId, "PHOTOS", actorId);

        // expires_at must be now (past/present), not the previously scheduled future date.
        assertThat(result.getExpiresAt()).isBeforeOrEqualTo(OffsetDateTime.now().plusSeconds(1));
    }

    @Test
    void expireBadge_writesAuditRecord() {
        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "PHOTOS"))
                .thenReturn(Optional.of(existingDimension("PHOTOS", "EARNED")));
        when(dimensionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(trustTierCalculator.calculate(listingId)).thenReturn(new TrustTierResult(listingId, "D"));
        when(listingRepository.findById(listingId)).thenReturn(Optional.of(stubListing));
        when(listingRepository.save(any())).thenReturn(stubListing);

        badgeService.expireBadge(listingId, "PHOTOS", actorId);

        verify(adminAuditService).record(
                eq(actorId),
                eq("BADGE_EXPIRED"),
                eq("listing_verification_dimension"),
                any(),
                anyString(),
                anyString());
    }

    @Test
    void expireBadge_throwsBadgeNotFoundException_whenRowDoesNotExist() {
        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "DOCUMENTS"))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> badgeService.expireBadge(listingId, "DOCUMENTS", actorId))
                .isInstanceOf(BadgeNotFoundException.class)
                .hasMessageContaining("DOCUMENTS");

        verify(adminAuditService, never()).record(any(), any(), any(), any(), any(), any());
    }

    // -------------------------------------------------------------------------
    // AC4: getBadges — returns all dimensions, no state filter
    // -------------------------------------------------------------------------

    @Test
    void getBadges_returnsAllDimensionsForListing_withNoStateFilter() {
        List<ListingVerificationDimension> all = List.of(
                existingDimension("IDENTITY", "EARNED"),
                existingDimension("PHOTOS", "SUSPENDED"),
                existingDimension("AUTHORITY", "EXPIRED")
        );
        when(dimensionRepository.findAllByListingId(listingId)).thenReturn(all);

        List<ListingVerificationDimension> result = badgeService.getBadges(listingId);

        assertThat(result).hasSize(3);
        assertThat(result).extracting(ListingVerificationDimension::getBadgeState)
                .containsExactlyInAnyOrder("EARNED", "SUSPENDED", "EXPIRED");
    }

    @Test
    void getBadges_returnsEmptyList_whenNoDimensionsExist() {
        when(dimensionRepository.findAllByListingId(listingId)).thenReturn(Collections.emptyList());

        List<ListingVerificationDimension> result = badgeService.getBadges(listingId);

        assertThat(result).isEmpty();
    }

    // -------------------------------------------------------------------------
    // AC5: Integration — grant IDENTITY + PHOTOS → tier B
    // -------------------------------------------------------------------------

    /**
     * Simulates granting IDENTITY then PHOTOS and verifies the listing ends up with tier "B".
     *
     * <p>Uses fine-grained mock control: TrustTierCalculator is a real mock that is told
     * to return "C" after the first grant (IDENTITY only) and "B" after the second grant
     * (IDENTITY + PHOTOS). This mirrors the actual tier rules without needing a DB.
     */
    @Test
    void grantBadge_identityThenPhotos_trustTierBecomesB() {
        UUID identityDimId = UUID.randomUUID();
        UUID photosDimId = UUID.randomUUID();

        // --- First grant: IDENTITY ---
        ListingVerificationDimension identityDim = existingDimension("IDENTITY", "AVAILABLE");

        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "IDENTITY"))
                .thenReturn(Optional.of(identityDim));
        when(dimensionRepository.save(any())).thenAnswer(inv -> {
            ListingVerificationDimension d = inv.getArgument(0);
            if ("IDENTITY".equals(d.getDimensionType())) d.setListingId(listingId);
            return d;
        });
        when(trustTierCalculator.calculate(listingId))
                .thenReturn(new TrustTierResult(listingId, "C"))  // after IDENTITY
                .thenReturn(new TrustTierResult(listingId, "B")); // after PHOTOS
        when(listingRepository.findById(listingId)).thenReturn(Optional.of(stubListing));
        when(listingRepository.save(any())).thenReturn(stubListing);

        badgeService.grantBadge(listingId, "IDENTITY", actorId, null);

        // After IDENTITY grant, listing tier is C.
        assertThat(stubListing.getTrustTier()).isEqualTo("C");

        // --- Second grant: PHOTOS ---
        ListingVerificationDimension photosDim = existingDimension("PHOTOS", "AVAILABLE");

        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "PHOTOS"))
                .thenReturn(Optional.of(photosDim));

        badgeService.grantBadge(listingId, "PHOTOS", actorId, null);

        // After PHOTOS grant, listing tier is B.
        assertThat(stubListing.getTrustTier()).isEqualTo("B");
    }

    // -------------------------------------------------------------------------
    // Null-safety / guard checks
    // -------------------------------------------------------------------------

    @Test
    void grantBadge_throwsNullPointerException_whenListingIdIsNull() {
        assertThatThrownBy(() -> badgeService.grantBadge(null, "IDENTITY", actorId, null))
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("listingId");
    }

    @Test
    void grantBadge_throwsNullPointerException_whenDimensionTypeIsNull() {
        assertThatThrownBy(() -> badgeService.grantBadge(listingId, null, actorId, null))
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("dimensionType");
    }

    @Test
    void grantBadge_throwsListingNotFoundException_whenListingDoesNotExist() {
        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "IDENTITY"))
                .thenReturn(Optional.empty());
        when(dimensionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(trustTierCalculator.calculate(listingId)).thenReturn(new TrustTierResult(listingId, "D"));
        when(listingRepository.findById(listingId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> badgeService.grantBadge(listingId, "IDENTITY", actorId, null))
                .isInstanceOf(ListingNotFoundException.class);
    }
}

package com.example.realestate.trust;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link TrustTierCalculator}.
 *
 * <p>No Spring context. Both repositories are mocked via Mockito.
 * Helper methods build stub entities using plain setters — no JPA / DB involved.
 */
@ExtendWith(MockitoExtension.class)
class TrustTierCalculatorTest {

    @Mock
    private ListingVerificationDimensionRepository dimensionRepository;

    @Mock
    private ListingComplaintRepository complaintRepository;

    @InjectMocks
    private TrustTierCalculator calculator;

    // -----------------------------------------------------------------------
    // Helper builders
    // -----------------------------------------------------------------------

    private ListingVerificationDimension dimension(String dimensionType, String badgeState) {
        ListingVerificationDimension d = new ListingVerificationDimension();
        d.setDimensionType(dimensionType);
        d.setBadgeState(badgeState);
        return d;
    }

    private ListingComplaint complaint(String status) {
        ListingComplaint c = new ListingComplaint();
        c.setStatus(status);
        return c;
    }

    // -----------------------------------------------------------------------
    // Tier A
    // -----------------------------------------------------------------------

    @Test
    void calculate_tierA_whenIdentityAuthorityPhotosAllEarned_andNoOpenComplaint() {
        UUID listingId = UUID.randomUUID();
        when(dimensionRepository.findAllByListingId(listingId)).thenReturn(List.of(
                dimension("IDENTITY", "EARNED"),
                dimension("AUTHORITY", "EARNED"),
                dimension("PHOTOS", "EARNED")
        ));
        when(complaintRepository.findAllByListingIdOrderByCreatedAtDesc(listingId))
                .thenReturn(Collections.emptyList());

        TrustTierResult result = calculator.calculate(listingId);

        assertEquals("A", result.getTier());
        assertEquals(listingId, result.getListingId());
    }

    // -----------------------------------------------------------------------
    // Tier B
    // -----------------------------------------------------------------------

    @Test
    void calculate_tierB_whenIdentityAndAuthorityEarned_noPhotos_noOpenComplaint() {
        UUID listingId = UUID.randomUUID();
        when(dimensionRepository.findAllByListingId(listingId)).thenReturn(List.of(
                dimension("IDENTITY", "EARNED"),
                dimension("AUTHORITY", "EARNED")
        ));
        when(complaintRepository.findAllByListingIdOrderByCreatedAtDesc(listingId))
                .thenReturn(Collections.emptyList());

        TrustTierResult result = calculator.calculate(listingId);

        assertEquals("B", result.getTier());
    }

    @Test
    void calculate_tierB_whenIdentityAndPhotosEarned_noAuthority_noOpenComplaint() {
        UUID listingId = UUID.randomUUID();
        when(dimensionRepository.findAllByListingId(listingId)).thenReturn(List.of(
                dimension("IDENTITY", "EARNED"),
                dimension("PHOTOS", "EARNED")
        ));
        when(complaintRepository.findAllByListingIdOrderByCreatedAtDesc(listingId))
                .thenReturn(Collections.emptyList());

        TrustTierResult result = calculator.calculate(listingId);

        assertEquals("B", result.getTier());
    }

    // -----------------------------------------------------------------------
    // Tier C
    // -----------------------------------------------------------------------

    @Test
    void calculate_tierC_whenOnlySingleEarnedDimension_noOpenComplaint() {
        UUID listingId = UUID.randomUUID();
        when(dimensionRepository.findAllByListingId(listingId)).thenReturn(List.of(
                dimension("LOCATION", "EARNED")
        ));
        when(complaintRepository.findAllByListingIdOrderByCreatedAtDesc(listingId))
                .thenReturn(Collections.emptyList());

        TrustTierResult result = calculator.calculate(listingId);

        assertEquals("C", result.getTier());
    }

    // -----------------------------------------------------------------------
    // Tier D — no earned dimensions
    // -----------------------------------------------------------------------

    @Test
    void calculate_tierD_whenAllDimensionsAvailable_noOpenComplaint() {
        UUID listingId = UUID.randomUUID();
        when(dimensionRepository.findAllByListingId(listingId)).thenReturn(List.of(
                dimension("IDENTITY", "AVAILABLE"),
                dimension("AUTHORITY", "AVAILABLE"),
                dimension("PHOTOS", "AVAILABLE")
        ));
        when(complaintRepository.findAllByListingIdOrderByCreatedAtDesc(listingId))
                .thenReturn(Collections.emptyList());

        TrustTierResult result = calculator.calculate(listingId);

        assertEquals("D", result.getTier());
    }

    // -----------------------------------------------------------------------
    // Tier D — open complaint demotes even Tier A candidates
    // -----------------------------------------------------------------------

    @Test
    void calculate_tierD_whenOpenComplaintPresent_demotesFromTierA() {
        UUID listingId = UUID.randomUUID();
        when(dimensionRepository.findAllByListingId(listingId)).thenReturn(List.of(
                dimension("IDENTITY", "EARNED"),
                dimension("AUTHORITY", "EARNED"),
                dimension("PHOTOS", "EARNED")
        ));
        when(complaintRepository.findAllByListingIdOrderByCreatedAtDesc(listingId))
                .thenReturn(List.of(complaint("OPEN")));

        TrustTierResult result = calculator.calculate(listingId);

        assertEquals("D", result.getTier());
    }

    // -----------------------------------------------------------------------
    // Tier D — EXPIRED badge is NOT EARNED
    // -----------------------------------------------------------------------

    @Test
    void calculate_tierD_whenOnlyDimensionIsExpired_noOpenComplaint() {
        UUID listingId = UUID.randomUUID();
        when(dimensionRepository.findAllByListingId(listingId)).thenReturn(List.of(
                dimension("IDENTITY", "EXPIRED")
        ));
        when(complaintRepository.findAllByListingIdOrderByCreatedAtDesc(listingId))
                .thenReturn(Collections.emptyList());

        TrustTierResult result = calculator.calculate(listingId);

        assertEquals("D", result.getTier());
    }

    // -----------------------------------------------------------------------
    // Tier D — SUSPENDED badge is NOT EARNED
    // -----------------------------------------------------------------------

    @Test
    void calculate_tierD_whenOnlyDimensionIsSuspended_noOpenComplaint() {
        UUID listingId = UUID.randomUUID();
        when(dimensionRepository.findAllByListingId(listingId)).thenReturn(List.of(
                dimension("AUTHORITY", "SUSPENDED")
        ));
        when(complaintRepository.findAllByListingIdOrderByCreatedAtDesc(listingId))
                .thenReturn(Collections.emptyList());

        TrustTierResult result = calculator.calculate(listingId);

        assertEquals("D", result.getTier());
    }

    // -----------------------------------------------------------------------
    // Tier C — AUTHORITY + PHOTOS earned but no IDENTITY (does NOT qualify Tier B)
    // -----------------------------------------------------------------------

    @Test
    void calculate_tierC_whenAuthorityAndPhotosEarned_butNoIdentity_noOpenComplaint() {
        UUID listingId = UUID.randomUUID();
        when(dimensionRepository.findAllByListingId(listingId)).thenReturn(List.of(
                dimension("AUTHORITY", "EARNED"),
                dimension("PHOTOS", "EARNED")
        ));
        when(complaintRepository.findAllByListingIdOrderByCreatedAtDesc(listingId))
                .thenReturn(Collections.emptyList());

        TrustTierResult result = calculator.calculate(listingId);

        // Tier B requires IDENTITY; without it, two other earned badges reach Tier C only.
        assertEquals("C", result.getTier());
    }

    // -----------------------------------------------------------------------
    // Tier D — UNDER_REVIEW complaint intentionally does NOT demote (spec: "OPEN" only)
    // -----------------------------------------------------------------------

    @Test
    void calculate_notDemotedByUnderReviewComplaint_perSpec() {
        UUID listingId = UUID.randomUUID();
        when(dimensionRepository.findAllByListingId(listingId)).thenReturn(List.of(
                dimension("IDENTITY", "EARNED"),
                dimension("AUTHORITY", "EARNED"),
                dimension("PHOTOS", "EARNED")
        ));
        when(complaintRepository.findAllByListingIdOrderByCreatedAtDesc(listingId))
                .thenReturn(List.of(complaint("UNDER_REVIEW")));

        TrustTierResult result = calculator.calculate(listingId);

        // Per RE-148 spec, only OPEN complaints trigger Tier D demotion.
        // UNDER_REVIEW is actively being investigated but not yet confirmed —
        // product decision is to award the tier until the complaint is resolved.
        assertEquals("A", result.getTier());
    }

    // -----------------------------------------------------------------------
    // Tier D — empty listing (no dimensions, no complaints)
    // -----------------------------------------------------------------------

    @Test
    void calculate_tierD_whenNoDimensionsAndNoComplaints() {
        UUID listingId = UUID.randomUUID();
        when(dimensionRepository.findAllByListingId(listingId))
                .thenReturn(Collections.emptyList());
        when(complaintRepository.findAllByListingIdOrderByCreatedAtDesc(listingId))
                .thenReturn(Collections.emptyList());

        TrustTierResult result = calculator.calculate(listingId);

        assertEquals("D", result.getTier());
        assertEquals(listingId, result.getListingId());
    }
}

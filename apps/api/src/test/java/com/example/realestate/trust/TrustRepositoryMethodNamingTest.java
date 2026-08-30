package com.example.realestate.trust;

import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Lightweight compile-time / getter-setter contract tests for trust entities.
 *
 * <p>No Spring context, no DB, no Mockito. These tests exist to verify that
 * each entity class compiles correctly and that every getter returns the value
 * set by its corresponding setter. Any rename or removal of a field/method
 * immediately causes a compile failure that surfaces in CI before a PR merges.
 */
class TrustRepositoryMethodNamingTest {

    // -----------------------------------------------------------------------
    // ListingVerificationDimension
    // -----------------------------------------------------------------------

    @Test
    void listingVerificationDimension_settersAndGettersRoundTrip() {
        UUID listingId = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();

        ListingVerificationDimension dim = new ListingVerificationDimension();
        dim.setListingId(listingId);
        dim.setDimensionType("IDENTITY");
        dim.setBadgeState("EARNED");
        dim.setGrantedAt(now);
        dim.setExpiresAt(now.plusDays(90));
        dim.setSuspendedAt(null);
        dim.setUpdatedAt(now);

        assertEquals(listingId, dim.getListingId());
        assertEquals("IDENTITY", dim.getDimensionType());
        assertEquals("EARNED", dim.getBadgeState());
        assertEquals(now, dim.getGrantedAt());
        assertEquals(now.plusDays(90), dim.getExpiresAt());
        assertNull(dim.getSuspendedAt());
        assertEquals(now, dim.getUpdatedAt());
        // id and createdAt are set by JPA / DB — null before persist
        assertNull(dim.getId());
        assertNull(dim.getCreatedAt());
    }

    @Test
    void listingVerificationDimension_allValidDimensionTypes_accepted() {
        String[] types = {"IDENTITY", "LOCATION", "PHOTOS", "AUTHORITY", "DOCUMENTS", "FIELD"};
        for (String type : types) {
            ListingVerificationDimension dim = new ListingVerificationDimension();
            dim.setDimensionType(type);
            assertEquals(type, dim.getDimensionType());
        }
    }

    @Test
    void listingVerificationDimension_allValidBadgeStates_accepted() {
        String[] states = {"AVAILABLE", "PENDING", "EARNED", "EXPIRED", "SUSPENDED"};
        for (String state : states) {
            ListingVerificationDimension dim = new ListingVerificationDimension();
            dim.setBadgeState(state);
            assertEquals(state, dim.getBadgeState());
        }
    }

    // -----------------------------------------------------------------------
    // AuthorityEvidence
    // -----------------------------------------------------------------------

    @Test
    void authorityEvidence_settersAndGettersRoundTrip() {
        UUID listingId = UUID.randomUUID();
        UUID verifiedBy = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();

        AuthorityEvidence evidence = new AuthorityEvidence();
        evidence.setListingId(listingId);
        evidence.setEvidenceType("RERA_NUMBER");
        evidence.setEvidenceValue("KAR/AGENT/12345/2025");
        evidence.setVerifiedAt(now);
        evidence.setVerifiedBy(verifiedBy);
        evidence.setReviewState("APPROVED");
        evidence.setUpdatedAt(now);

        assertEquals(listingId, evidence.getListingId());
        assertEquals("RERA_NUMBER", evidence.getEvidenceType());
        assertEquals("KAR/AGENT/12345/2025", evidence.getEvidenceValue());
        assertEquals(now, evidence.getVerifiedAt());
        assertEquals(verifiedBy, evidence.getVerifiedBy());
        assertEquals("APPROVED", evidence.getReviewState());
        assertEquals(now, evidence.getUpdatedAt());
        // id and createdAt are set by JPA / DB — null before persist
        assertNull(evidence.getId());
        assertNull(evidence.getCreatedAt());
    }

    @Test
    void authorityEvidence_allValidEvidenceTypes_accepted() {
        String[] types = {"OWNER_OTP", "MANDATE_DOCUMENT", "RERA_NUMBER"};
        for (String type : types) {
            AuthorityEvidence evidence = new AuthorityEvidence();
            evidence.setEvidenceType(type);
            assertEquals(type, evidence.getEvidenceType());
        }
    }

    @Test
    void authorityEvidence_allValidReviewStates_accepted() {
        String[] states = {"PENDING", "APPROVED", "REJECTED", "EXPIRED"};
        for (String state : states) {
            AuthorityEvidence evidence = new AuthorityEvidence();
            evidence.setReviewState(state);
            assertEquals(state, evidence.getReviewState());
        }
    }

    @Test
    void authorityEvidence_nullEvidenceValue_accepted() {
        AuthorityEvidence evidence = new AuthorityEvidence();
        evidence.setEvidenceValue(null);
        assertNull(evidence.getEvidenceValue());
    }

    // -----------------------------------------------------------------------
    // ListingComplaint
    // -----------------------------------------------------------------------

    @Test
    void listingComplaint_settersAndGettersRoundTrip() {
        UUID listingId = UUID.randomUUID();
        UUID complainantId = UUID.randomUUID();
        UUID resolvedBy = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();

        ListingComplaint complaint = new ListingComplaint();
        complaint.setListingId(listingId);
        complaint.setComplainantId(complainantId);
        complaint.setComplaintType("FAKE_LISTING");
        complaint.setDescription("This property does not exist at the stated address.");
        complaint.setStatus("OPEN");
        complaint.setResolvedAt(null);
        complaint.setResolvedBy(resolvedBy);
        complaint.setUpdatedAt(now);

        assertEquals(listingId, complaint.getListingId());
        assertEquals(complainantId, complaint.getComplainantId());
        assertEquals("FAKE_LISTING", complaint.getComplaintType());
        assertEquals("This property does not exist at the stated address.", complaint.getDescription());
        assertEquals("OPEN", complaint.getStatus());
        assertNull(complaint.getResolvedAt());
        assertEquals(resolvedBy, complaint.getResolvedBy());
        assertEquals(now, complaint.getUpdatedAt());
        // id and createdAt are set by JPA / DB — null before persist
        assertNull(complaint.getId());
        assertNull(complaint.getCreatedAt());
    }

    @Test
    void listingComplaint_allValidComplaintTypes_accepted() {
        String[] types = {"FAKE_LISTING", "WRONG_PRICE", "UNAVAILABLE", "OTHER"};
        for (String type : types) {
            ListingComplaint complaint = new ListingComplaint();
            complaint.setComplaintType(type);
            assertEquals(type, complaint.getComplaintType());
        }
    }

    @Test
    void listingComplaint_allValidStatuses_accepted() {
        String[] statuses = {"OPEN", "UNDER_REVIEW", "RESOLVED", "DISMISSED"};
        for (String status : statuses) {
            ListingComplaint complaint = new ListingComplaint();
            complaint.setStatus(status);
            assertEquals(status, complaint.getStatus());
        }
    }

    @Test
    void listingComplaint_nullDescription_accepted() {
        ListingComplaint complaint = new ListingComplaint();
        complaint.setDescription(null);
        assertNull(complaint.getDescription());
    }
}

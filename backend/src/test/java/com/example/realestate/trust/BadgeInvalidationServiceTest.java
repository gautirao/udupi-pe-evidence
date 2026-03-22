package com.example.realestate.trust;

import com.example.realestate.listing.audit.AdminAuditService;
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
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link BadgeInvalidationService}.
 *
 * <p>No Spring context — all dependencies are mocked via Mockito.
 * Verifies that badge revocation fires only for EARNED badges on material field changes,
 * and that audit records and tier recalculation happen correctly.
 */
@ExtendWith(MockitoExtension.class)
class BadgeInvalidationServiceTest {

    @Mock
    private ListingVerificationDimensionRepository dimensionRepository;

    @Mock
    private BadgeService badgeService;

    @Mock
    private AdminAuditService adminAuditService;

    // Real ObjectMapper — serialization must succeed in happy-path tests.
    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();

    @InjectMocks
    private BadgeInvalidationService service;

    private UUID listingId;

    @BeforeEach
    void setUp() {
        listingId = UUID.randomUUID();
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private ListingVerificationDimension earnedBadge(String dimensionType) {
        ListingVerificationDimension d = new ListingVerificationDimension();
        d.setListingId(listingId);
        d.setDimensionType(dimensionType);
        d.setBadgeState("EARNED");
        d.setGrantedAt(OffsetDateTime.now().minusDays(1));
        d.setUpdatedAt(OffsetDateTime.now().minusDays(1));
        return d;
    }

    private ListingVerificationDimension badgeWithState(String dimensionType, String state) {
        ListingVerificationDimension d = new ListingVerificationDimension();
        d.setListingId(listingId);
        d.setDimensionType(dimensionType);
        d.setBadgeState(state);
        d.setUpdatedAt(OffsetDateTime.now().minusDays(1));
        return d;
    }

    private Map<String, Object> baseSnapshot() {
        Map<String, Object> m = new HashMap<>();
        m.put("latitude", 13.0);;
        m.put("longitude", 74.0);
        m.put("locality", "Udupi");
        m.put("areaKey", "udupi-town");
        m.put("propertyType", "house");
        return m;
    }

    // -------------------------------------------------------------------------
    // Test 1: latitude change → LOCATION badge revoked, PHOTOS untouched
    // -------------------------------------------------------------------------

    @Test
    void latitudeChange_revokesLocationBadge_photosUntouched() {
        ListingVerificationDimension locationBadge = earnedBadge("LOCATION");
        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "LOCATION"))
                .thenReturn(Optional.of(locationBadge));
        when(dimensionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Map<String, Object> prev = baseSnapshot();
        Map<String, Object> next = baseSnapshot();
        next.put("latitude", 13.5);  // changed

        service.invalidateOnEdit(listingId, prev, next);

        assertThat(locationBadge.getBadgeState()).isEqualTo("AVAILABLE");
        assertThat(locationBadge.getGrantedAt()).isNull();

        // PHOTOS should not be touched — no lookup for PHOTOS dimension
        verify(dimensionRepository, never())
                .findByListingIdAndDimensionType(listingId, "PHOTOS");

        verify(badgeService).recalculateAndPersistTier(listingId);
    }

    // -------------------------------------------------------------------------
    // Test 2: longitude change → LOCATION badge revoked
    // -------------------------------------------------------------------------

    @Test
    void longitudeChange_revokesLocationBadge() {
        ListingVerificationDimension locationBadge = earnedBadge("LOCATION");
        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "LOCATION"))
                .thenReturn(Optional.of(locationBadge));
        when(dimensionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Map<String, Object> prev = baseSnapshot();
        Map<String, Object> next = baseSnapshot();
        next.put("longitude", 74.9);  // changed

        service.invalidateOnEdit(listingId, prev, next);

        assertThat(locationBadge.getBadgeState()).isEqualTo("AVAILABLE");
        verify(badgeService).recalculateAndPersistTier(listingId);
    }

    // -------------------------------------------------------------------------
    // Test 3: areaKey change → LOCATION badge revoked
    // -------------------------------------------------------------------------

    @Test
    void areaKeyChange_revokesLocationBadge() {
        ListingVerificationDimension locationBadge = earnedBadge("LOCATION");
        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "LOCATION"))
                .thenReturn(Optional.of(locationBadge));
        when(dimensionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Map<String, Object> prev = baseSnapshot();
        Map<String, Object> next = baseSnapshot();
        next.put("areaKey", "manipal");  // changed

        service.invalidateOnEdit(listingId, prev, next);

        assertThat(locationBadge.getBadgeState()).isEqualTo("AVAILABLE");
        verify(badgeService).recalculateAndPersistTier(listingId);
    }

    // -------------------------------------------------------------------------
    // Test 4: propertyType change → PHOTOS badge revoked, LOCATION untouched
    // -------------------------------------------------------------------------

    @Test
    void propertyTypeChange_revokesPhotosBadge_locationUntouched() {
        ListingVerificationDimension photosBadge = earnedBadge("PHOTOS");
        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "PHOTOS"))
                .thenReturn(Optional.of(photosBadge));
        when(dimensionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Map<String, Object> prev = baseSnapshot();
        Map<String, Object> next = baseSnapshot();
        next.put("propertyType", "land");  // changed

        service.invalidateOnEdit(listingId, prev, next);

        assertThat(photosBadge.getBadgeState()).isEqualTo("AVAILABLE");
        assertThat(photosBadge.getGrantedAt()).isNull();

        // LOCATION should not be touched — no location fields changed
        verify(dimensionRepository, never())
                .findByListingIdAndDimensionType(listingId, "LOCATION");

        verify(badgeService).recalculateAndPersistTier(listingId);
    }

    // -------------------------------------------------------------------------
    // Test 5: no material field change → no badges revoked
    // -------------------------------------------------------------------------

    @Test
    void noMaterialFieldChange_noBadgesRevoked() {
        Map<String, Object> prev = baseSnapshot();
        Map<String, Object> next = baseSnapshot();  // identical

        service.invalidateOnEdit(listingId, prev, next);

        verify(dimensionRepository, never())
                .findByListingIdAndDimensionType(any(), any());
        verify(badgeService, never()).recalculateAndPersistTier(any());
        verify(adminAuditService, never()).record(any(), any(), any(), any(), any(), any());
    }

    // -------------------------------------------------------------------------
    // Test 6: LOCATION badge in AVAILABLE state → not revoked
    // -------------------------------------------------------------------------

    @Test
    void locationBadgeNotEarned_notRevoked() {
        ListingVerificationDimension availableBadge = badgeWithState("LOCATION", "AVAILABLE");
        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "LOCATION"))
                .thenReturn(Optional.of(availableBadge));

        Map<String, Object> prev = baseSnapshot();
        Map<String, Object> next = baseSnapshot();
        next.put("latitude", 13.9);  // location field changed

        service.invalidateOnEdit(listingId, prev, next);

        // Badge was found but was not EARNED — no save, no tier recalc
        assertThat(availableBadge.getBadgeState()).isEqualTo("AVAILABLE");  // unchanged
        verify(dimensionRepository, never()).save(any());
        verify(badgeService, never()).recalculateAndPersistTier(any());
    }

    // -------------------------------------------------------------------------
    // Test 7: Multiple material fields change in one edit → all relevant badges revoked
    // -------------------------------------------------------------------------

    @Test
    void multipleMaterialFieldsChange_allRelevantBadgesRevoked() {
        ListingVerificationDimension locationBadge = earnedBadge("LOCATION");
        ListingVerificationDimension photosBadge = earnedBadge("PHOTOS");

        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "LOCATION"))
                .thenReturn(Optional.of(locationBadge));
        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "PHOTOS"))
                .thenReturn(Optional.of(photosBadge));
        when(dimensionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Map<String, Object> prev = baseSnapshot();
        Map<String, Object> next = baseSnapshot();
        next.put("latitude", 12.0);         // location change
        next.put("propertyType", "apartment");  // photos change

        service.invalidateOnEdit(listingId, prev, next);

        assertThat(locationBadge.getBadgeState()).isEqualTo("AVAILABLE");
        assertThat(locationBadge.getGrantedAt()).isNull();
        assertThat(photosBadge.getBadgeState()).isEqualTo("AVAILABLE");
        assertThat(photosBadge.getGrantedAt()).isNull();

        // Tier recalculated exactly once even though two badges were revoked
        verify(badgeService, times(1)).recalculateAndPersistTier(listingId);
    }

    // -------------------------------------------------------------------------
    // Test 8: Audit records written for each revocation
    // -------------------------------------------------------------------------

    @Test
    void revocation_writesAuditRecordPerBadge() {
        ListingVerificationDimension locationBadge = earnedBadge("LOCATION");
        ListingVerificationDimension photosBadge = earnedBadge("PHOTOS");

        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "LOCATION"))
                .thenReturn(Optional.of(locationBadge));
        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "PHOTOS"))
                .thenReturn(Optional.of(photosBadge));
        when(dimensionRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Map<String, Object> prev = baseSnapshot();
        Map<String, Object> next = baseSnapshot();
        next.put("locality", "Manipal");      // location field
        next.put("propertyType", "land");     // photos field

        service.invalidateOnEdit(listingId, prev, next);

        // One audit record per revoked badge
        ArgumentCaptor<String> actionCaptor = ArgumentCaptor.forClass(String.class);
        verify(adminAuditService, times(2)).record(
                eq(BadgeInvalidationService.SYSTEM_ACTOR),
                actionCaptor.capture(),
                eq("listing_verification_dimension"),
                any(),
                any(),
                any());

        assertThat(actionCaptor.getAllValues())
                .containsOnly("BADGE_INVALIDATED");
    }

    // -------------------------------------------------------------------------
    // Test 9: LOCATION badge absent (no row) → no revocation, no error
    // -------------------------------------------------------------------------

    @Test
    void locationBadgeAbsent_noRevocation() {
        when(dimensionRepository.findByListingIdAndDimensionType(listingId, "LOCATION"))
                .thenReturn(Optional.empty());

        Map<String, Object> prev = baseSnapshot();
        Map<String, Object> next = baseSnapshot();
        next.put("latitude", 14.0);

        service.invalidateOnEdit(listingId, prev, next);

        verify(dimensionRepository, never()).save(any());
        verify(badgeService, never()).recalculateAndPersistTier(any());
    }
}

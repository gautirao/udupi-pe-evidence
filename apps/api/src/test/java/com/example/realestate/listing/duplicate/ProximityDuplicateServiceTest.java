package com.example.realestate.listing.duplicate;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProximityDuplicateServiceTest {

    @Mock
    private ListingRepository listingRepository;

    @Mock
    private DuplicateCandidateRepository duplicateCandidateRepo;

    private ProximityDuplicateService service;

    // Udupi city centre coordinates used as base for all tests
    private static final double BASE_LAT = 13.3409;
    private static final double BASE_LON = 74.7421;

    @BeforeEach
    void setUp() {
        service = new ProximityDuplicateService(listingRepository, duplicateCandidateRepo);
    }

    // -----------------------------------------------------------------------
    // Helper factories
    // -----------------------------------------------------------------------

    /**
     * Creates a Listing with the given id, lat, lon, price and areaSqm.
     * createdAt is set to a fixed past time.
     */
    private Listing makeListing(UUID id, Double lat, Double lon,
                                Long pricePaise, BigDecimal areaSqm) {
        Listing l = new Listing();
        l.setId(id);
        l.setLatitude(lat);
        l.setLongitude(lon);
        l.setPricePaise(pricePaise);
        l.setAreaSqm(areaSqm);
        l.setPropertyType("house");
        l.setStatus("LIVE");
        l.setCreatedAt(OffsetDateTime.now().minusDays(1));
        return l;
    }

    /**
     * Moves a coordinate by approximately {@code meters} metres north along latitude.
     * Accurate enough for the small offsets used in these tests.
     */
    private double offsetLat(double baseLat, double meters) {
        return baseLat + meters * ProximityDuplicateService.DEGREES_PER_METER;
    }

    // -----------------------------------------------------------------------
    // Test 1: null lat/lon — no query fired
    // -----------------------------------------------------------------------

    @Test
    void detectAndRecord_nullLatLon_returnsWithoutQuery() {
        Listing newListing = makeListing(UUID.randomUUID(), null, null, 500_000_00L, null);

        service.detectAndRecord(newListing);

        verify(listingRepository, never())
                .findLiveListingsInBoundingBox(anyDouble(), anyDouble(), anyDouble(), anyDouble(),
                        anyString(), any(UUID.class));
    }

    // -----------------------------------------------------------------------
    // Test 2: no candidates returned for either radius — no save
    // -----------------------------------------------------------------------

    @Test
    void detectAndRecord_noCandidates_noInsert() {
        Listing newListing = makeListing(UUID.randomUUID(), BASE_LAT, BASE_LON, 500_000_00L, null);

        when(listingRepository.findLiveListingsInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyString(), any(UUID.class)))
                .thenReturn(List.of());

        service.detectAndRecord(newListing);

        verify(duplicateCandidateRepo, never()).save(any());
    }

    // -----------------------------------------------------------------------
    // Test 3: fewer than 2 at 50 m → expands to 100 m
    // -----------------------------------------------------------------------

    @Test
    void detectAndRecord_fewerThan2At50m_expandsTo100m() {
        UUID newId = UUID.randomUUID();
        Listing newListing = makeListing(newId, BASE_LAT, BASE_LON, 500_000_00L, null);

        // Single candidate 40 m away — within 50 m, so first query returns 1 result
        Listing nearCandidate = makeListing(UUID.randomUUID(),
                offsetLat(BASE_LAT, 40), BASE_LON, 700_000_00L, null);

        // First call (50 m box): returns 1 result
        // Second call (100 m box): returns empty (we just want to verify it was called)
        when(listingRepository.findLiveListingsInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyString(), eq(newId)))
                .thenReturn(List.of(nearCandidate))   // 50 m box
                .thenReturn(List.of());               // 100 m box

        service.detectAndRecord(newListing);

        // Must be called exactly twice: once for 50 m, once for 100 m
        verify(listingRepository, times(2))
                .findLiveListingsInBoundingBox(anyDouble(), anyDouble(), anyDouble(), anyDouble(),
                        anyString(), eq(newId));
    }

    // -----------------------------------------------------------------------
    // Test 4: HIGH confidence — close pair (distance ≤ 25 m, price ≤ 15%)
    //         → inserts candidate and sets isSuspectedDuplicate on newer listing
    // -----------------------------------------------------------------------

    @Test
    void detectAndRecord_highConfidence_closePair_insertsCandidateAndSetsSuspectedFlag() {
        UUID newId  = UUID.randomUUID();
        UUID candId = UUID.randomUUID();

        // Ensure a deterministic "newer" — newListing is newer
        Listing newListing  = makeListing(newId,  BASE_LAT, BASE_LON, 500_000_00L, null);
        newListing.setCreatedAt(OffsetDateTime.now());

        // Candidate is 20 m north, price 10% lower
        Listing candidate = makeListing(candId,
                offsetLat(BASE_LAT, 20), BASE_LON,
                450_000_00L, null);
        candidate.setCreatedAt(OffsetDateTime.now().minusDays(2));

        when(listingRepository.findLiveListingsInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyString(), eq(newId)))
                .thenReturn(List.of(candidate));

        when(duplicateCandidateRepo.countByListingIdAndStatus(any(), any())).thenReturn(0L);
        when(duplicateCandidateRepo.existsByListingIdAAndListingIdB(any(), any())).thenReturn(false);
        when(listingRepository.save(any(Listing.class))).thenAnswer(inv -> inv.getArgument(0));
        when(duplicateCandidateRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.detectAndRecord(newListing);

        // A DuplicateCandidate must have been saved
        ArgumentCaptor<DuplicateCandidate> dcCaptor = ArgumentCaptor.forClass(DuplicateCandidate.class);
        verify(duplicateCandidateRepo).save(dcCaptor.capture());
        DuplicateCandidate saved = dcCaptor.getValue();
        assertThat(saved.getStatus()).isEqualTo(DuplicateCandidateStatus.PENDING);
        assertThat(saved.getSimilarityScore()).isNotNull();
        assertThat(saved.getDistanceMeters()).isGreaterThan(BigDecimal.ZERO);

        // The newer listing (newListing) must have isSuspectedDuplicate set
        ArgumentCaptor<Listing> listingCaptor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(listingCaptor.capture());
        assertThat(listingCaptor.getValue().isSuspectedDuplicate()).isTrue();
    }

    // -----------------------------------------------------------------------
    // Test 5: HIGH confidence — within 50 m, price ≤ 12%, area ≤ 15%
    // -----------------------------------------------------------------------

    @Test
    void detectAndRecord_highConfidence_withArea_insertsCandidate() {
        UUID newId  = UUID.randomUUID();
        UUID candId = UUID.randomUUID();

        // 40 m apart, price delta 10%, area delta 12%
        Listing newListing = makeListing(newId, BASE_LAT, BASE_LON,
                500_000_00L, new BigDecimal("100.0"));
        newListing.setCreatedAt(OffsetDateTime.now());

        Listing candidate = makeListing(candId,
                offsetLat(BASE_LAT, 40), BASE_LON,
                450_000_00L, new BigDecimal("112.0")); // area delta = 12/112 ≈ 10.7% ≤ 15%
        candidate.setCreatedAt(OffsetDateTime.now().minusDays(1));

        when(listingRepository.findLiveListingsInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyString(), eq(newId)))
                .thenReturn(List.of(candidate));

        when(duplicateCandidateRepo.countByListingIdAndStatus(any(), any())).thenReturn(0L);
        when(duplicateCandidateRepo.existsByListingIdAAndListingIdB(any(), any())).thenReturn(false);
        when(listingRepository.save(any(Listing.class))).thenAnswer(inv -> inv.getArgument(0));
        when(duplicateCandidateRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.detectAndRecord(newListing);

        verify(duplicateCandidateRepo).save(any(DuplicateCandidate.class));
        // isSuspectedDuplicate must be set (HIGH confidence)
        ArgumentCaptor<Listing> listingCaptor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(listingCaptor.capture());
        assertThat(listingCaptor.getValue().isSuspectedDuplicate()).isTrue();
    }

    // -----------------------------------------------------------------------
    // Test 6: MEDIUM confidence — null area, price ≤ 8%
    //         → saves candidate but does NOT set isSuspectedDuplicate
    // -----------------------------------------------------------------------

    @Test
    void detectAndRecord_mediumConfidence_nullArea_insertsWithoutSuspectedFlag() {
        UUID newId  = UUID.randomUUID();
        UUID candId = UUID.randomUUID();

        // 40 m apart, price delta 7%, no area
        Listing newListing = makeListing(newId, BASE_LAT, BASE_LON, 500_000_00L, null);
        Listing candidate  = makeListing(candId, offsetLat(BASE_LAT, 40), BASE_LON,
                465_000_00L, null); // delta = 35/500 = 7% ≤ 8%

        when(listingRepository.findLiveListingsInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyString(), eq(newId)))
                .thenReturn(List.of(candidate));

        when(duplicateCandidateRepo.countByListingIdAndStatus(any(), any())).thenReturn(0L);
        when(duplicateCandidateRepo.existsByListingIdAAndListingIdB(any(), any())).thenReturn(false);
        when(duplicateCandidateRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.detectAndRecord(newListing);

        verify(duplicateCandidateRepo).save(any(DuplicateCandidate.class));
        // listingRepository.save must NOT be called (isSuspectedDuplicate not set for MEDIUM)
        verify(listingRepository, never()).save(any(Listing.class));
    }

    // -----------------------------------------------------------------------
    // Test 7: BELOW threshold — price delta 20%, no area → no insert
    // -----------------------------------------------------------------------

    @Test
    void detectAndRecord_belowThreshold_noInsert() {
        UUID newId  = UUID.randomUUID();
        UUID candId = UUID.randomUUID();

        // 40 m apart, price delta 20% — MEDIUM requires ≤ 8% (no area), so BELOW
        Listing newListing = makeListing(newId, BASE_LAT, BASE_LON, 500_000_00L, null);
        Listing candidate  = makeListing(candId, offsetLat(BASE_LAT, 40), BASE_LON,
                400_000_00L, null); // delta = 100/500 = 20%

        when(listingRepository.findLiveListingsInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyString(), eq(newId)))
                .thenReturn(List.of(candidate));

        service.detectAndRecord(newListing);

        verify(duplicateCandidateRepo, never()).save(any());
        verify(listingRepository, never()).save(any(Listing.class));
    }

    // -----------------------------------------------------------------------
    // Test 8: pair cap reached → no insert
    // -----------------------------------------------------------------------

    @Test
    void detectAndRecord_pairCapReached_skipsInsert() {
        UUID newId  = UUID.randomUUID();
        UUID candId = UUID.randomUUID();

        // HIGH confidence pair (20 m, 10% price delta)
        Listing newListing = makeListing(newId, BASE_LAT, BASE_LON, 500_000_00L, null);
        Listing candidate  = makeListing(candId, offsetLat(BASE_LAT, 20), BASE_LON, 450_000_00L, null);

        when(listingRepository.findLiveListingsInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyString(), eq(newId)))
                .thenReturn(List.of(candidate));

        // Cap already reached for newListing
        when(duplicateCandidateRepo.countByListingIdAndStatus(eq(newId), any()))
                .thenReturn((long) ProximityDuplicateService.PAIR_CAP);
        when(duplicateCandidateRepo.countByListingIdAndStatus(eq(candId), any()))
                .thenReturn(0L);

        service.detectAndRecord(newListing);

        verify(duplicateCandidateRepo, never()).save(any());
    }

    // -----------------------------------------------------------------------
    // Test 9: idempotent — pair already exists → no insert
    // -----------------------------------------------------------------------

    @Test
    void detectAndRecord_idempotent_skipIfExists() {
        UUID newId  = UUID.randomUUID();
        UUID candId = UUID.randomUUID();

        Listing newListing = makeListing(newId, BASE_LAT, BASE_LON, 500_000_00L, null);
        Listing candidate  = makeListing(candId, offsetLat(BASE_LAT, 20), BASE_LON, 450_000_00L, null);

        when(listingRepository.findLiveListingsInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyString(), eq(newId)))
                .thenReturn(List.of(candidate));

        // Pair already exists — idempotency guard returns early before cap check
        when(duplicateCandidateRepo.existsByListingIdAAndListingIdB(any(), any())).thenReturn(true);

        service.detectAndRecord(newListing);

        verify(duplicateCandidateRepo, never()).save(any());
    }

    // -----------------------------------------------------------------------
    // Test 10: self-pair guard — candidate has same id as new listing
    // -----------------------------------------------------------------------

    @Test
    void detectAndRecord_selfPairGuard() {
        UUID newId = UUID.randomUUID();
        Listing newListing = makeListing(newId, BASE_LAT, BASE_LON, 500_000_00L, null);

        // Candidate with the same id — simulates a defensive scenario
        Listing selfCandidate = makeListing(newId, offsetLat(BASE_LAT, 5), BASE_LON, 500_000_00L, null);

        when(listingRepository.findLiveListingsInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyString(), eq(newId)))
                .thenReturn(List.of(selfCandidate));

        service.detectAndRecord(newListing);

        verify(duplicateCandidateRepo, never()).save(any());
    }

    // -----------------------------------------------------------------------
    // Test 11: null createdAt on newListing → flag goes on newListing (default)
    // -----------------------------------------------------------------------

    @Test
    void detectAndRecord_nullCreatedAt_flagGoesOnNewListing() {
        UUID newId  = UUID.randomUUID();
        UUID candId = UUID.randomUUID();

        // newListing has null createdAt; candidate has a real timestamp
        Listing newListing = makeListing(newId, BASE_LAT, BASE_LON, 500_000_00L, null);
        newListing.setCreatedAt(null);

        Listing candidate = makeListing(candId, offsetLat(BASE_LAT, 20), BASE_LON, 450_000_00L, null);
        candidate.setCreatedAt(OffsetDateTime.now().minusDays(1));

        when(listingRepository.findLiveListingsInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyString(), eq(newId)))
                .thenReturn(List.of(candidate));

        when(duplicateCandidateRepo.countByListingIdAndStatus(any(), any())).thenReturn(0L);
        when(duplicateCandidateRepo.existsByListingIdAAndListingIdB(any(), any())).thenReturn(false);
        when(listingRepository.save(any(Listing.class))).thenAnswer(inv -> inv.getArgument(0));
        when(duplicateCandidateRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.detectAndRecord(newListing);

        // HIGH confidence pair (20 m, 10% price delta) — isSuspectedDuplicate must be set
        // Null createdAt → determineNewer defaults to newListing
        ArgumentCaptor<Listing> listingCaptor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(listingCaptor.capture());
        assertThat(listingCaptor.getValue().getId()).isEqualTo(newId);
        assertThat(listingCaptor.getValue().isSuspectedDuplicate()).isTrue();
    }

    // -----------------------------------------------------------------------
    // Test 12 (was 11): candidate has pricePaise == 0 → pair skipped
    // -----------------------------------------------------------------------

    @Test
    void detectAndRecord_zeroPricePaise_skipsPair() {
        UUID newId  = UUID.randomUUID();
        UUID candId = UUID.randomUUID();

        Listing newListing = makeListing(newId, BASE_LAT, BASE_LON, 500_000_00L, null);
        Listing candidate  = makeListing(candId, offsetLat(BASE_LAT, 10), BASE_LON,
                0L, null); // price = 0 → invalid

        when(listingRepository.findLiveListingsInBoundingBox(
                anyDouble(), anyDouble(), anyDouble(), anyDouble(), anyString(), eq(newId)))
                .thenReturn(List.of(candidate));

        service.detectAndRecord(newListing);

        verify(duplicateCandidateRepo, never()).save(any());
    }
}

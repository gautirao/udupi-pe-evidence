package com.example.realestate.listing;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProximityDuplicateBatchJobTest {

    @Mock
    private ListingRepository listingRepository;

    @Mock
    private ProximityDuplicateService proximityDuplicateService;

    private ProximityDuplicateBatchJob job;

    @BeforeEach
    void setUp() {
        job = new ProximityDuplicateBatchJob(listingRepository, proximityDuplicateService);
    }

    // -----------------------------------------------------------------------
    // Test 1: empty repo — detectAndRecord never called
    // -----------------------------------------------------------------------

    @Test
    void runBatch_noListings_doesNotCallDetect() {
        when(listingRepository.findAllLiveWithCoordinates(any(Pageable.class)))
                .thenReturn(Page.empty());

        job.runBatch();

        verify(proximityDuplicateService, never()).detectAndRecord(any(Listing.class));
    }

    // -----------------------------------------------------------------------
    // Test 2: two listings in one page — detectAndRecord called once per listing
    // -----------------------------------------------------------------------

    @Test
    void runBatch_twoListings_callsDetectForEach() {
        Listing listingA = listingWithId(UUID.randomUUID());
        Listing listingB = listingWithId(UUID.randomUUID());

        when(listingRepository.findAllLiveWithCoordinates(any(Pageable.class)))
                .thenReturn(singlePage(listingA, listingB));

        job.runBatch();

        verify(proximityDuplicateService, times(1)).detectAndRecord(listingA);
        verify(proximityDuplicateService, times(1)).detectAndRecord(listingB);
    }

    // -----------------------------------------------------------------------
    // Test 3: detection throws on 2nd listing — job continues, no exception
    //         propagated, detectAndRecord called for all 3 listings
    // -----------------------------------------------------------------------

    @Test
    void runBatch_detectionThrows_continuesAndCountsSkip() {
        Listing listingA = listingWithId(UUID.randomUUID());
        Listing listingB = listingWithId(UUID.randomUUID());
        Listing listingC = listingWithId(UUID.randomUUID());

        when(listingRepository.findAllLiveWithCoordinates(any(Pageable.class)))
                .thenReturn(singlePage(listingA, listingB, listingC));

        // 2nd listing throws — job must continue to 3rd
        doNothing().when(proximityDuplicateService).detectAndRecord(listingA);
        doThrow(new RuntimeException("simulated detection failure"))
                .when(proximityDuplicateService).detectAndRecord(listingB);
        doNothing().when(proximityDuplicateService).detectAndRecord(listingC);

        assertDoesNotThrow(() -> job.runBatch());

        verify(proximityDuplicateService, times(1)).detectAndRecord(listingA);
        verify(proximityDuplicateService, times(1)).detectAndRecord(listingB);
        verify(proximityDuplicateService, times(1)).detectAndRecord(listingC);
    }

    // -----------------------------------------------------------------------
    // Test 4: repo throws on page fetch — job aborts cleanly, no exception propagated
    // -----------------------------------------------------------------------

    @Test
    void runBatch_repoThrows_abortsCleanlyWithoutPropagating() {
        when(listingRepository.findAllLiveWithCoordinates(any(Pageable.class)))
                .thenThrow(new DataAccessException("DB connection lost") {});

        assertDoesNotThrow(() -> job.runBatch());

        verify(proximityDuplicateService, never()).detectAndRecord(any(Listing.class));
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private Listing listingWithId(UUID id) {
        Listing l = new Listing();
        l.setId(id);
        l.setLatitude(13.3409);
        l.setLongitude(74.7421);
        l.setStatus("LIVE");
        return l;
    }

    /** Wraps listings in a single-page {@link PageImpl} with no next page. */
    private Page<Listing> singlePage(Listing... listings) {
        List<Listing> content = List.of(listings);
        return new PageImpl<>(content);
    }
}

package com.example.realestate.listing.crud;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingDeduplicationService;
import com.example.realestate.listing.core.ListingOwnershipGuard;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.pricing.PriceChangeLog;
import com.example.realestate.listing.pricing.PriceChangeLogRepository;
import com.example.realestate.listing.api.BulkDeleteResult;
import com.example.realestate.listing.api.ListingStatsResponse;
import com.example.realestate.listing.event.SettlementEnrichmentRequestedEvent;
import com.example.realestate.trust.BadgeInvalidationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ListingCrudServiceTest {

    @Mock
    private ListingRepository listingRepository;

    @Mock
    private ApplicationEventPublisher applicationEventPublisher;

    @Mock
    private ListingOwnershipGuard listingOwnershipGuard;

    @Mock
    private ListingDeduplicationService listingDeduplicationService;

    @Mock
    private PriceChangeLogRepository priceChangeLogRepository;

    @Mock
    private BadgeInvalidationService badgeInvalidationService;

    private ListingCrudService crudService;

    @BeforeEach
    void setUp() {
        crudService = new ListingCrudService(
                listingRepository, applicationEventPublisher, listingOwnershipGuard,
                listingDeduplicationService, priceChangeLogRepository,
                badgeInvalidationService);
    }

    // --- RE-83: createDraft sets dedupe hash and flags duplicates ---

    @Test
    void createDraft_setsDedupeHash() {
        UUID userId = UUID.randomUUID();
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Simulate deduplication service setting a hash on the listing
        org.mockito.Mockito.doAnswer(inv -> {
            Listing l = inv.getArgument(0);
            l.setDedupeHash("somehash");
            return null;
        }).when(listingDeduplicationService).computeAndSetDedupeHash(any(), any(), any(), any());

        Listing draft = crudService.createDraft(userId, "land", "Plot", "Manipal",
                new BigDecimal("5000000"), "Nice plot");

        assertThat(draft.getDedupeHash()).isNotNull();
        assertThat(draft.getDedupeHash()).isNotEmpty();
    }

    @Test
    void createDraft_populatesPricePaise() {
        UUID userId = UUID.randomUUID();
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing draft = crudService.createDraft(userId, "house", "Test House", "Udupi",
                new BigDecimal("5000000"), "A nice house");

        assertThat(draft.getPricePaise()).isEqualTo(500_000_000L); // 5,000,000 * 100
    }

    @Test
    void createDraft_duplicateInputs_secondDraftFlaggedAsDuplicate() {
        UUID userId = UUID.randomUUID();

        // First draft — deduplication service marks as not duplicate
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing first = crudService.createDraft(userId, "land", "Plot", "Manipal",
                new BigDecimal("5000000"), "Nice plot");
        assertThat(first.isDuplicate()).isFalse();

        // Second draft — deduplication service marks as duplicate
        org.mockito.Mockito.doAnswer(inv -> {
            Listing l = inv.getArgument(0);
            l.setDuplicate(true);
            l.setRepostCount(1);
            return null;
        }).when(listingDeduplicationService).checkAndMarkDuplicate(any(Listing.class));

        Listing second = crudService.createDraft(userId, "land", "Plot", "Manipal",
                new BigDecimal("5000000"), "Nice plot");
        assertThat(second.isDuplicate()).isTrue();
        assertThat(second.getRepostCount()).isEqualTo(1);
    }

    // --- updateListing ---

    @Test
    void updateListing_latLonPresent_savedToListing() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setLatitude(12.0);
        existing.setLongitude(75.0);

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = crudService.updateListing(
                listingId, userId, false,
                null, null, null, null, null,
                null, null, null, null,
                13.3409, 74.7421,
                null, null,
                null, false, null);

        assertThat(result.getLatitude()).isEqualTo(13.3409);
        assertThat(result.getLongitude()).isEqualTo(74.7421);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        assertThat(captor.getValue().getLatitude()).isEqualTo(13.3409);
        assertThat(captor.getValue().getLongitude()).isEqualTo(74.7421);
    }

    @Test
    void updateListing_latLonAbsent_existingCoordsPreserved() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setLatitude(13.3409);
        existing.setLongitude(74.7421);

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // PUT with no lat/lon (null) — must not zero out existing coordinates
        Listing result = crudService.updateListing(
                listingId, userId, false,
                null, null, null, null, null,
                null, null, null, null,
                null, null,
                null, null,
                null, false, null);

        assertThat(result.getLatitude()).isEqualTo(13.3409);
        assertThat(result.getLongitude()).isEqualTo(74.7421);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        assertThat(captor.getValue().getLatitude()).isEqualTo(13.3409);
        assertThat(captor.getValue().getLongitude()).isEqualTo(74.7421);
    }

    @Test
    void updateListing_areaUnitsPresent_savedToListing() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = crudService.updateListing(
                listingId, userId, false,
                null, null, null, null, null,
                new BigDecimal("10"), null, null, null,
                null, null,
                "cent", "sqft",
                null, false, null);

        assertThat(result.getLandAreaUnit()).isEqualTo("cent");
        assertThat(result.getBuiltAreaUnit()).isEqualTo("sqft");

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        assertThat(captor.getValue().getLandAreaUnit()).isEqualTo("cent");
        assertThat(captor.getValue().getBuiltAreaUnit()).isEqualTo("sqft");
        // AreaNormalizer should have populated derived fields (10 cents = 4356 sqft)
        assertThat(captor.getValue().getAreaSqft()).isNotNull();
    }

    @Test
    void updateListing_areaUnitsAbsent_existingUnitsPreserved() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setLandAreaUnit("sqft");
        existing.setBuiltAreaUnit("sqm");

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // PUT with no unit fields (null) — must not zero out existing units
        Listing result = crudService.updateListing(
                listingId, userId, false,
                null, null, null, null, null,
                null, null, null, null,
                null, null,
                null, null,
                null, false, null);

        assertThat(result.getLandAreaUnit()).isEqualTo("sqft");
        assertThat(result.getBuiltAreaUnit()).isEqualTo("sqm");

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        assertThat(captor.getValue().getLandAreaUnit()).isEqualTo("sqft");
        assertThat(captor.getValue().getBuiltAreaUnit()).isEqualTo("sqm");
    }

    // --- RE-70: settlement enrichment event published on address confirmation ---

    @Test
    void updateListing_addressConfirmedWithCoordsAndLandType_publishesSettlementEvent() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPropertyType("land");
        existing.setLatitude(13.3409);
        existing.setLongitude(74.7421);

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        crudService.updateListing(
                listingId, userId, false,
                null, null, null, null, null,
                null, null, null, true,   // addressConfirmed = true
                null, null, null, null, null, false, null);

        ArgumentCaptor<Object> eventCaptor = ArgumentCaptor.forClass(Object.class);
        verify(applicationEventPublisher).publishEvent(eventCaptor.capture());
        assertThat(eventCaptor.getValue())
                .isInstanceOf(SettlementEnrichmentRequestedEvent.class);
        SettlementEnrichmentRequestedEvent event =
                (SettlementEnrichmentRequestedEvent) eventCaptor.getValue();
        assertThat(event.listingId()).isEqualTo(listingId);
        assertThat(event.propertyType()).isEqualTo("land");
    }

    @Test
    void updateListing_addressConfirmedButApartmentType_doesNotPublishSettlementEvent() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPropertyType("apartment");
        existing.setLatitude(13.3409);
        existing.setLongitude(74.7421);

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        crudService.updateListing(
                listingId, userId, false,
                null, null, null, null, null,
                null, null, null, true,   // addressConfirmed = true
                null, null, null, null, null, false, null);

        verify(applicationEventPublisher, never()).publishEvent(
                any(SettlementEnrichmentRequestedEvent.class));
    }

    @Test
    void updateListing_addressNotConfirmed_doesNotPublishSettlementEvent() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPropertyType("land");
        existing.setLatitude(13.3409);
        existing.setLongitude(74.7421);

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // addressConfirmed = null (not set in this request)
        crudService.updateListing(
                listingId, userId, false,
                null, null, null, null, null,
                null, null, null, null,
                null, null, null, null, null, false, null);

        verify(applicationEventPublisher, never()).publishEvent(
                any(SettlementEnrichmentRequestedEvent.class));
    }

    // --- RE-83: updateListing recomputes hash, excludes self ---

    @Test
    void updateListing_priceChange_recomputesHash() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setDescription("Nice plot");
        existing.setLocality("Manipal");
        existing.setPrice(new BigDecimal("5000000"));
        existing.setDedupeHash("original-hash");

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Simulate deduplication service setting a new hash after update
        org.mockito.Mockito.doAnswer(inv -> {
            Listing l = inv.getArgument(0);
            l.setDedupeHash("new-hash-after-price-change");
            return null;
        }).when(listingDeduplicationService).computeAndSetDedupeHash(any(), any(), any(), any());

        Listing result = crudService.updateListing(
                listingId, userId, false,
                null, null, null, new BigDecimal("6000000"), null,
                null, null, null, null,
                null, null, null, null, null, false, null);

        assertThat(result.getDedupeHash()).isEqualTo("new-hash-after-price-change");
        assertThat(result.getDedupeHash()).isNotEqualTo("original-hash");
    }

    @Test
    void updateListing_selfMatchDoesNotFlagDuplicate() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setDescription("Nice plot");
        existing.setLocality("Manipal");
        existing.setPrice(new BigDecimal("5000000"));

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        // deduplicationService.checkAndMarkDuplicateExcludingSelf does nothing → isDuplicate=false
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = crudService.updateListing(
                listingId, userId, false,
                null, null, null, null, "Updated description",
                null, null, null, null,
                null, null, null, null, null, false, null);

        assertThat(result.isDuplicate()).isFalse();
        assertThat(result.getRepostCount()).isEqualTo(0);
    }

    @Test
    void updateListing_otherMatchFlagsDuplicate() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setDescription("Nice plot");
        existing.setLocality("Manipal");
        existing.setPrice(new BigDecimal("5000000"));

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Simulate deduplication service flagging as duplicate (another listing matched)
        org.mockito.Mockito.doAnswer(inv -> {
            Listing l = inv.getArgument(0);
            l.setDuplicate(true);
            l.setRepostCount(1);
            return null;
        }).when(listingDeduplicationService).checkAndMarkDuplicateExcludingSelf(any(Listing.class));

        Listing result = crudService.updateListing(
                listingId, userId, false,
                null, null, null, null, "Same as another listing",
                null, null, null, null,
                null, null, null, null, null, false, null);

        assertThat(result.isDuplicate()).isTrue();
        assertThat(result.getRepostCount()).isEqualTo(1);
    }

    // ==================== RE-72: getListingsByOwner with status filter ====================

    @Test
    void getListingsByOwner_withNullStatus_callsFindByCreatedByAndArchivedAtIsNull() {
        UUID userId = UUID.randomUUID();
        Pageable pageable = PageRequest.of(0, 20, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<Listing> expected = new PageImpl<>(List.of());
        when(listingRepository.findByCreatedByAndArchivedAtIsNullOrderByCreatedAtDesc(userId, pageable))
                .thenReturn(expected);

        Page<Listing> result = crudService.getListingsByOwner(userId, null, pageable);

        assertThat(result).isSameAs(expected);
        verify(listingRepository).findByCreatedByAndArchivedAtIsNullOrderByCreatedAtDesc(userId, pageable);
        verify(listingRepository, never()).findByCreatedByAndStatusAndArchivedAtIsNull(any(), any(), any());
    }

    @Test
    void getListingsByOwner_withBlankStatus_callsFindByCreatedByAndArchivedAtIsNull() {
        UUID userId = UUID.randomUUID();
        Pageable pageable = PageRequest.of(0, 20);
        Page<Listing> expected = new PageImpl<>(List.of());
        when(listingRepository.findByCreatedByAndArchivedAtIsNullOrderByCreatedAtDesc(userId, pageable))
                .thenReturn(expected);

        Page<Listing> result = crudService.getListingsByOwner(userId, "  ", pageable);

        assertThat(result).isSameAs(expected);
        verify(listingRepository).findByCreatedByAndArchivedAtIsNullOrderByCreatedAtDesc(userId, pageable);
        verify(listingRepository, never()).findByCreatedByAndStatusAndArchivedAtIsNull(any(), any(), any());
    }

    @Test
    void getListingsByOwner_withDraftStatus_callsFindByCreatedByAndStatusAndArchivedAtIsNull() {
        UUID userId = UUID.randomUUID();
        Pageable pageable = PageRequest.of(0, 20, Sort.by(Sort.Direction.DESC, "createdAt"));
        Page<Listing> expected = new PageImpl<>(List.of());
        when(listingRepository.findByCreatedByAndStatusAndArchivedAtIsNull(userId, "DRAFT", pageable))
                .thenReturn(expected);

        Page<Listing> result = crudService.getListingsByOwner(userId, "DRAFT", pageable);

        assertThat(result).isSameAs(expected);
        verify(listingRepository).findByCreatedByAndStatusAndArchivedAtIsNull(userId, "DRAFT", pageable);
        verify(listingRepository, never())
                .findByCreatedByAndArchivedAtIsNullOrderByCreatedAtDesc(any(), any());
    }

    // --- RE-75: getListingStats ---

    @Test
    void getListingStats_mixedStatuses_returnsCorrectCounts() {
        UUID userId = UUID.randomUUID();
        java.util.List<Object[]> rows = java.util.Arrays.asList(
                new Object[]{"DRAFT", 2L},
                new Object[]{"PENDING_REVIEW", 1L},
                new Object[]{"LIVE", 3L},
                new Object[]{"REJECTED", 1L}
        );
        when(listingRepository.countByStatusForUser(userId)).thenReturn(rows);

        ListingStatsResponse stats = crudService.getListingStats(userId);

        assertThat(stats.draftCount()).isEqualTo(2);
        assertThat(stats.pendingReviewCount()).isEqualTo(1);
        assertThat(stats.liveCount()).isEqualTo(3);
        assertThat(stats.rejectedCount()).isEqualTo(1);
        assertThat(stats.totalCount()).isEqualTo(7);
    }

    @Test
    void getListingStats_noListings_returnsAllZeros() {
        UUID userId = UUID.randomUUID();
        when(listingRepository.countByStatusForUser(userId)).thenReturn(java.util.List.of());

        ListingStatsResponse stats = crudService.getListingStats(userId);

        assertThat(stats.draftCount()).isEqualTo(0);
        assertThat(stats.pendingReviewCount()).isEqualTo(0);
        assertThat(stats.liveCount()).isEqualTo(0);
        assertThat(stats.rejectedCount()).isEqualTo(0);
        assertThat(stats.totalCount()).isEqualTo(0);
    }

    @Test
    void getListingStats_onlyDrafts_otherCountsZero() {
        UUID userId = UUID.randomUUID();
        java.util.List<Object[]> rows = java.util.Collections.singletonList(
                new Object[]{"DRAFT", 5L}
        );
        when(listingRepository.countByStatusForUser(userId)).thenReturn(rows);

        ListingStatsResponse stats = crudService.getListingStats(userId);

        assertThat(stats.draftCount()).isEqualTo(5);
        assertThat(stats.pendingReviewCount()).isEqualTo(0);
        assertThat(stats.liveCount()).isEqualTo(0);
        assertThat(stats.rejectedCount()).isEqualTo(0);
        assertThat(stats.totalCount()).isEqualTo(5);
    }

    // ==================== RE-89: Soft delete ====================

    @Test
    void deleteListing_draftListing_setsArchivedAtAndStatusArchived() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setCreatedBy(userId);
        listing.setStatus(ListingStatus.DRAFT.toDbValue());

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(listing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        crudService.deleteListing(listingId, userId, false);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        Listing saved = captor.getValue();
        assertThat(saved.getArchivedAt()).isNotNull();
        assertThat(saved.getStatus()).isEqualTo(ListingStatus.ARCHIVED.toDbValue());
        // Must NOT call delete() — this is the critical invariant
        verify(listingRepository, never()).delete(any());
    }

    @Test
    void deleteListing_rejectedListing_setsArchivedAtAndStatusArchived() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setCreatedBy(userId);
        listing.setStatus(ListingStatus.REJECTED.toDbValue());

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(listing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        crudService.deleteListing(listingId, userId, false);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(ListingStatus.ARCHIVED.toDbValue());
        assertThat(captor.getValue().getArchivedAt()).isNotNull();
        verify(listingRepository, never()).delete(any());
    }

    @Test
    void deleteListing_liveListing_throwsListingStatusException() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setCreatedBy(userId);
        listing.setStatus(ListingStatus.LIVE.toDbValue());

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(listing);

        org.junit.jupiter.api.Assertions.assertThrows(
                com.example.realestate.listing.exception.ListingStatusException.class,
                () -> crudService.deleteListing(listingId, userId, false));

        verify(listingRepository, never()).save(any());
        verify(listingRepository, never()).delete(any());
    }

    // ===== bulkDeleteListings =====

    @Test
    void bulkDeleteListings_mixedBatch_returnsCorrectCounts() {
        UUID userId = UUID.randomUUID();
        UUID draftId = UUID.randomUUID();
        UUID liveId = UUID.randomUUID();
        UUID notFoundId = UUID.randomUUID();

        Listing draftListing = new Listing();
        draftListing.setId(draftId);
        draftListing.setCreatedBy(userId);
        draftListing.setStatus(ListingStatus.DRAFT.toDbValue());

        Listing liveListing = new Listing();
        liveListing.setId(liveId);
        liveListing.setCreatedBy(userId);
        liveListing.setStatus(ListingStatus.LIVE.toDbValue());

        when(listingOwnershipGuard.findOwned(eq(draftId), eq(userId), eq(false))).thenReturn(draftListing);
        when(listingOwnershipGuard.findOwned(eq(liveId), eq(userId), eq(false))).thenReturn(liveListing);
        when(listingOwnershipGuard.findOwned(eq(notFoundId), eq(userId), eq(false)))
                .thenThrow(new com.example.realestate.listing.exception.ListingNotFoundException(notFoundId));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        BulkDeleteResult result = crudService.bulkDeleteListings(
                java.util.List.of(draftId, liveId, notFoundId), userId, false);

        assertThat(result.deleted()).isEqualTo(1);
        assertThat(result.skipped()).isEqualTo(2);
        assertThat(result.errors()).hasSize(2);

        // draft was soft-deleted
        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository, times(1)).save(captor.capture());
        assertThat(captor.getValue().getArchivedAt()).isNotNull();
        assertThat(captor.getValue().getStatus()).isEqualTo(ListingStatus.ARCHIVED.toDbValue());
    }

    @Test
    void bulkDeleteListings_allArchived_returnsZeroDeleted() {
        UUID userId = UUID.randomUUID();
        UUID id1 = UUID.randomUUID();
        UUID id2 = UUID.randomUUID();

        Listing l1 = new Listing();
        l1.setId(id1);
        l1.setCreatedBy(userId);
        l1.setStatus(ListingStatus.LIVE.toDbValue());

        Listing l2 = new Listing();
        l2.setId(id2);
        l2.setCreatedBy(userId);
        l2.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());

        when(listingOwnershipGuard.findOwned(eq(id1), eq(userId), eq(false))).thenReturn(l1);
        when(listingOwnershipGuard.findOwned(eq(id2), eq(userId), eq(false))).thenReturn(l2);

        BulkDeleteResult result = crudService.bulkDeleteListings(
                java.util.List.of(id1, id2), userId, false);

        assertThat(result.deleted()).isEqualTo(0);
        assertThat(result.skipped()).isEqualTo(2);
        verify(listingRepository, never()).save(any());
    }

    // ===== RE-94: updateListing — price change logging =====

    @Test
    void updateListing_priceChanged_rejectedListing_insertsPriceChangeLog() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.REJECTED.toDbValue());
        // 5,000,000 rupees → 500,000,000 paise
        existing.setPrice(new java.math.BigDecimal("5000000"));

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(priceChangeLogRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // 6,000,000 rupees → 600,000,000 paise
        crudService.updateListing(
                listingId, userId, false,
                null, null, null, new java.math.BigDecimal("6000000"), null,
                null, null, null, null,
                null, null, null, null, null, false, null);

        ArgumentCaptor<PriceChangeLog> logCaptor = ArgumentCaptor.forClass(PriceChangeLog.class);
        verify(priceChangeLogRepository).save(logCaptor.capture());
        PriceChangeLog logged = logCaptor.getValue();
        assertThat(logged.getListingId()).isEqualTo(listingId);
        assertThat(logged.getOldPricePaise()).isEqualTo(500_000_000L);  // 5,000,000 rupees in paise
        assertThat(logged.getNewPricePaise()).isEqualTo(600_000_000L);  // 6,000,000 rupees in paise
        assertThat(logged.getChangedAt()).isNotNull();
    }

    @Test
    void updateListing_priceUnchanged_doesNotInsertPriceChangeLog() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.REJECTED.toDbValue());
        existing.setPrice(new java.math.BigDecimal("5000000"));

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Update with same price
        crudService.updateListing(
                listingId, userId, false,
                null, null, null, new java.math.BigDecimal("5000000"), null,
                null, null, null, null,
                null, null, null, null, null, false, null);

        verify(priceChangeLogRepository, never()).save(any());
    }

    @Test
    void updateListing_draftListing_priceChanged_doesNotInsertPriceChangeLog() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPrice(new java.math.BigDecimal("5000000"));

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // DRAFT listing — price change should NOT be logged
        crudService.updateListing(
                listingId, userId, false,
                null, null, null, new java.math.BigDecimal("7000000"), null,
                null, null, null, null,
                null, null, null, null, null, false, null);

        verify(priceChangeLogRepository, never()).save(any());
    }

    // ===== RE-171: updateListing keeps pricePaise consistent with price =====

    @Test
    void updateListing_priceUpdated_pricePaiseReflectsNewPrice() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPrice(new BigDecimal("5000000"));
        existing.setPricePaise(500_000_000L);

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = crudService.updateListing(
                listingId, userId, false,
                null, null, null, new BigDecimal("6000000"), null,
                null, null, null, null,
                null, null, null, null, null, false, null);

        assertThat(result.getPricePaise()).isEqualTo(600_000_000L); // 6,000,000 * 100
    }
}

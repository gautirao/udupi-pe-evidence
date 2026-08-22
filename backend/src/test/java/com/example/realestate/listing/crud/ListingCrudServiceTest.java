package com.example.realestate.listing.crud;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingDeduplicationService;
import com.example.realestate.listing.core.ListingOwnershipGuard;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.geometry.PolygonBoundaryValidator;
import com.example.realestate.listing.pricing.PriceChangeLog;
import com.example.realestate.listing.pricing.PriceChangeLogRepository;
import com.example.realestate.listing.api.BulkDeleteResult;
import com.example.realestate.listing.api.ListingStatsResponse;
import com.example.realestate.listing.event.SettlementEnrichmentRequestedEvent;
import com.example.realestate.quality.QualityRecomputeService;
import com.example.realestate.search.outbox.SearchOutboxWriter;
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
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doNothing;
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

    @Mock
    private SearchOutboxWriter searchOutboxWriter;

    @Mock
    private PolygonBoundaryValidator polygonBoundaryValidator;

    @Mock
    private QualityRecomputeService qualityRecomputeService;

    @Mock
    private com.example.realestate.listing.residential.ListingAmenityRepository listingAmenityRepository;

    @Mock
    private com.example.realestate.listing.residential.ListingLocationFeatureRepository listingLocationFeatureRepository;

    @Mock
    private com.example.realestate.listing.residential.ListingPreferredTenantRepository listingPreferredTenantRepository;

    @Mock
    private com.example.realestate.listing.commercial.ListingSuitableUseRepository listingSuitableUseRepository;

    @Mock
    private com.example.realestate.listing.typed.CommercialSpaceDetailRepository commercialSpaceDetailRepository;

    @Mock
    private com.example.realestate.listing.typed.ResidentialUnitDetailRepository residentialUnitDetailRepository;

    @Mock
    private com.example.realestate.listing.agricultural.ListingAgriCropRepository listingAgriCropRepository;

    private ListingCrudService crudService;

    @BeforeEach
    void setUp() {
        crudService = new ListingCrudService(
                listingRepository, applicationEventPublisher, listingOwnershipGuard,
                listingDeduplicationService, priceChangeLogRepository,
                badgeInvalidationService, searchOutboxWriter, polygonBoundaryValidator,
                qualityRecomputeService, listingAmenityRepository, listingLocationFeatureRepository,
                listingPreferredTenantRepository, listingSuitableUseRepository,
                commercialSpaceDetailRepository, residentialUnitDetailRepository, listingAgriCropRepository);
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

    // ===== Agricultural land fields =====

    @Test
    void createDraft_agriculturalFields_persistedCorrectly() {
        UUID userId = UUID.randomUUID();
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing draft = crudService.createDraft(
                userId, "agricultural_land", "Farm Plot", "Udupi",
                new BigDecimal("2000000"), "Rich red soil plot",
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer",
                "Borewell", "Red laterite", "Tar road", "Cultivated", "Freehold", "SRV/123/456",
                null, null, null, null);

        assertThat(draft.getWaterSource()).isEqualTo("Borewell");
        assertThat(draft.getSoilType()).isEqualTo("Red laterite");
        assertThat(draft.getRoadAccess()).isEqualTo("Tar road");
        assertThat(draft.getCultivationStatus()).isEqualTo("Cultivated");
        assertThat(draft.getOwnershipType()).isEqualTo("Freehold");
        assertThat(draft.getSurveyNumber()).isEqualTo("SRV/123/456");
    }

    @Test
    void updateListing_agriculturalFields_updatedCorrectly() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPropertyType("agricultural_land");
        existing.setSoilType("Black soil");

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = crudService.updateListing(
                listingId, userId, false,
                null, null, null, null, null,
                null, null, null, null,
                null, null, null, null, null, false, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null,
                null, "Red laterite", null, null, null, "SRV/789", null, null, null, null, null);

        assertThat(result.getSoilType()).isEqualTo("Red laterite");
        assertThat(result.getSurveyNumber()).isEqualTo("SRV/789");
        // Unchanged fields: waterSource, roadAccess, cultivationStatus, ownershipType remain null
        assertThat(result.getWaterSource()).isNull();
        assertThat(result.getRoadAccess()).isNull();
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

    // ===== #1366: Polygon boundary persistence =====

    @Test
    void updateListing_withBoundary_callsUpdateBoundary() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPropertyType("agricultural_land");

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        doNothing().when(polygonBoundaryValidator).validate(anyString(), anyString());

        String validGeoJson = "{\"type\":\"Polygon\",\"coordinates\":[[[74.0,13.0],[74.1,13.0],[74.1,13.1],[74.0,13.1],[74.0,13.0]]]}";

        crudService.updateListing(
                listingId, userId, false,
                "agricultural_land", null, null,
                null, null,
                null, null, null, null,
                null, null, null, null, null, false, null,
                null,
                null, null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                validGeoJson);

        verify(listingRepository).updateBoundary(eq(listingId), eq(validGeoJson));
    }

    @Test
    void updateListing_nullBoundary_doesNotCallUpdateBoundary() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPropertyType("house");

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        crudService.updateListing(
                listingId, userId, false,
                "house", null, null,
                null, null,
                null, null, null, null,
                null, null, null, null, null, false, null,
                null,
                null, null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null);  // null boundary

        verify(listingRepository, never()).updateBoundary(any(), any());
    }

    // ===== #1458: land_category / farmhouse_available / fencing_done =====

    @Test
    void createDraft_persists_agriStructuredFields() {
        UUID userId = UUID.randomUUID();
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing draft = crudService.createDraft(
                userId, "agricultural_land", "Wetland Farm", "Udupi",
                new BigDecimal("3000000"), "Fertile wetland",
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer",
                null, null, null, null, null, null,
                "wetland", null, true, false);

        assertThat(draft.getLandCategory()).isEqualTo("wetland");
        assertThat(draft.getFarmhouseAvailable()).isTrue();
        assertThat(draft.getFencingDone()).isFalse();
        // agriConversionStatus was not supplied → remains null
        assertThat(draft.getAgriConversionStatus()).isNull();
    }

    @Test
    void createDraft_farmhouseAvailableFalse_storedAsFalse() {
        // Boolean false must be persisted as false, not confused with null
        UUID userId = UUID.randomUUID();
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing draft = crudService.createDraft(
                userId, "agricultural_land", "Dry Farm", "Kundapur",
                new BigDecimal("1500000"), "Dry land plot",
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer",
                null, null, null, null, null, null,
                null, null, false, null);

        assertThat(draft.getFarmhouseAvailable()).isFalse();
        // landCategory and fencingDone were not supplied → remain null
        assertThat(draft.getLandCategory()).isNull();
        assertThat(draft.getFencingDone()).isNull();
    }

    // ===== #2043: agri_conversion_status =====

    @Test
    void createDraft_persists_agriConversionStatus() {
        UUID userId = UUID.randomUUID();
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing draft = crudService.createDraft(
                userId, "agricultural_land", "Converted Plot", "Udupi",
                new BigDecimal("2500000"), "Converted for residential use",
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer",
                null, null, null, null, null, null,
                null, "CONVERSION_APPLIED", null, null);

        assertThat(draft.getAgriConversionStatus()).isEqualTo("CONVERSION_APPLIED");
    }

    @Test
    void updateListing_agriConversionStatus_updatedCorrectly() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPropertyType("agricultural_land");
        existing.setAgriConversionStatus("NOT_CONVERTED");

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = crudService.updateListing(
                listingId, userId, false,
                null, null, null, null, null,
                null, null, null, null,
                null, null, null, null, null, false, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null,
                null, null, null, null, null, null, null, "APPROVED_FOR_CONVERSION", null, null, null);

        assertThat(result.getAgriConversionStatus()).isEqualTo("APPROVED_FOR_CONVERSION");
    }

    // ==================== Residential typed listing fields (M38-13A / #1626) ====================

    private static com.example.realestate.listing.residential.ResidentialListingFields residentialFields(
            Integer bathrooms, Integer balconies, Boolean hasGarden, Boolean hasLift,
            List<String> amenities, List<String> specialLocationViews, List<String> preferredTenants) {
        return new com.example.realestate.listing.residential.ResidentialListingFields(
                bathrooms, balconies, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null,
                hasLift, null, null, hasGarden, null, null, null, null, null, null,
                null, null, null, null, null, null, null,
                amenities, specialLocationViews, preferredTenants);
    }

    @Test
    void createDraft_villa_stampsListingFamilyResidential() {
        UUID userId = UUID.randomUUID();
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing draft = crudService.createDraft(
                userId, "villa", "Nice Villa", "Manipal",
                new BigDecimal("9000000"), "desc",
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null, null,
                residentialFields(3, 2, true, true, null, null, null));

        assertThat(draft.getListingFamily())
                .as("villa must stamp listing_family=RESIDENTIAL (architect d6)")
                .isEqualTo("RESIDENTIAL");
        assertThat(draft.getBathrooms()).isEqualTo(3);
        assertThat(draft.getBalconies()).isEqualTo(2);
        assertThat(draft.getHasGarden()).isTrue();
        assertThat(draft.getHasLift()).isTrue();
    }

    @Test
    void createDraft_residentialPlot_stampsListingFamilyResidential_notPlot() {
        UUID userId = UUID.randomUUID();
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing draft = crudService.createDraft(
                userId, "residential_plot", "Plot for sale", "Udupi",
                new BigDecimal("3000000"), "desc",
                new BigDecimal("2400"), null, null, "sqft", null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null, null,
                ResidentialListingFieldsEmpty());

        assertThat(draft.getListingFamily())
                .as("residential_plot DB stamp is RESIDENTIAL — chk_listing_listing_family has no 'PLOT' value")
                .isEqualTo("RESIDENTIAL")
                .isNotEqualTo("PLOT");
    }

    @Test
    void createDraft_houseAndApartment_alsoStampListingFamilyResidential() {
        UUID userId = UUID.randomUUID();
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing house = crudService.createDraft(
                userId, "house", "House", "Udupi", new BigDecimal("1000000"), "desc",
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null, null,
                ResidentialListingFieldsEmpty());
        Listing apartment = crudService.createDraft(
                userId, "apartment", "Flat", "Udupi", new BigDecimal("2000000"), "desc",
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null, null,
                ResidentialListingFieldsEmpty());

        assertThat(house.getListingFamily()).isEqualTo("RESIDENTIAL");
        assertThat(apartment.getListingFamily()).isEqualTo("RESIDENTIAL");
    }

    @Test
    void createDraft_commercial_stampsCommercialListingFamily() {
        // M38-FU2 / #1730 (approved-plan.toml [design_decision].subtype_non_null_mechanism):
        // the service stamps listing_family='COMMERCIAL' on create for every commercial-family
        // propertyType, mirroring the M38-13A residential stamp. Superseded pre-#1730 expectation
        // (no stamp at all) — this is the plan-mandated AC-2 behavior, not a regression.
        UUID userId = UUID.randomUUID();
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing draft = crudService.createDraft(
                userId, "commercial", "Shop", "Udupi", new BigDecimal("4000000"), "desc",
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null, null,
                ResidentialListingFieldsEmpty());

        assertThat(draft.getListingFamily())
                .as("commercial listings must be stamped with listing_family='COMMERCIAL' (M38-FU2 / #1730)")
                .isEqualTo("COMMERCIAL");
    }

    @Test
    void createDraft_petsAllowedFalse_persistsExplicitFalse_notNull() {
        UUID userId = UUID.randomUUID();
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        var fields = new com.example.realestate.listing.residential.ResidentialListingFields(
                null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, false, null,
                null, null, null);

        Listing draft = crudService.createDraft(
                userId, "apartment", "Flat", "Udupi", new BigDecimal("2000000"), "desc",
                null, null, null, null, null, null,
                "rent", null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null, null,
                fields);

        assertThat(draft.getPetsAllowed())
                .as("explicit false must be persisted, never coerced to/confused with null")
                .isFalse();
    }

    @Test
    void createDraft_petsAllowedOmitted_persistsNull_notDefaultedToFalse() {
        UUID userId = UUID.randomUUID();
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing draft = crudService.createDraft(
                userId, "apartment", "Flat", "Udupi", new BigDecimal("2000000"), "desc",
                null, null, null, null, null, null,
                "rent", null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null, null,
                ResidentialListingFieldsEmpty());

        assertThat(draft.getPetsAllowed())
                .as("an omitted boolean must stay NULL, never fabricated to false")
                .isNull();
    }

    @Test
    void createDraft_amenities_insertsChildRowsAndDeduplicates() {
        UUID userId = UUID.randomUUID();
        UUID listingId = UUID.randomUUID();
        when(listingRepository.save(any())).thenAnswer(inv -> {
            Listing l = inv.getArgument(0);
            l.setId(listingId);
            return l;
        });

        crudService.createDraft(
                userId, "apartment", "Flat", "Udupi", new BigDecimal("2000000"), "desc",
                null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null, null,
                residentialFields(null, null, null, null,
                        List.of("LIFT", "GYM", "LIFT"), // duplicate code must be deduplicated
                        null, null));

        ArgumentCaptor<com.example.realestate.listing.residential.ListingAmenity> captor =
                ArgumentCaptor.forClass(com.example.realestate.listing.residential.ListingAmenity.class);
        verify(listingAmenityRepository, times(2)).save(captor.capture());
        assertThat(captor.getAllValues())
                .extracting(com.example.realestate.listing.residential.ListingAmenity::getCode)
                .containsExactlyInAnyOrder("LIFT", "GYM");
        assertThat(captor.getAllValues())
                .allMatch(a -> a.getListingId().equals(listingId));
    }

    @Test
    void updateListing_childSetReplace_deletesBeforeInserting_noStaleCodes() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPropertyType("apartment");
        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        crudService.updateListing(
                listingId, userId, false,
                null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, false, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null, null,
                residentialFields(null, null, null, null,
                        null, List.of("PARK_FACING"), List.of("FAMILY", "STUDENTS")));

        // Child-set REPLACE semantics: delete-then-insert, never a bare upsert.
        verify(listingLocationFeatureRepository).deleteByListingId(listingId);
        verify(listingPreferredTenantRepository).deleteByListingId(listingId);
        // amenities list was null in this call → must NOT be touched at all.
        verify(listingAmenityRepository, never()).deleteByListingId(any());
        verify(listingAmenityRepository, never()).save(any());

        ArgumentCaptor<com.example.realestate.listing.residential.ListingPreferredTenant> tenantCaptor =
                ArgumentCaptor.forClass(com.example.realestate.listing.residential.ListingPreferredTenant.class);
        verify(listingPreferredTenantRepository, times(2)).save(tenantCaptor.capture());
        assertThat(tenantCaptor.getAllValues())
                .extracting(com.example.realestate.listing.residential.ListingPreferredTenant::getCode)
                .containsExactlyInAnyOrder("FAMILY", "STUDENTS");
    }

    @Test
    void updateListing_emptyListClearsChildSet() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPropertyType("apartment");
        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        crudService.updateListing(
                listingId, userId, false,
                null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, false, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null, null,
                residentialFields(null, null, null, null, List.of(), null, null));

        verify(listingAmenityRepository).deleteByListingId(listingId);
        verify(listingAmenityRepository, never()).save(any());
    }

    // --- #2038 (fixed, PR_REVIEW rework cycle 1): shared listing_amenities table, cross-family
    // scenario. listing_amenities is written by BOTH writeResidentialChildSets (amenities) and
    // writeCommercialChildSets (utilities) — see ListingCrudService.writeCommercialChildSets,
    // which reuses the same table for the "utilities" multi-select. This test pins the
    // ALWAYS-SAFE case: a residential update whose CommercialListingFields carries a NULL
    // utilities list (i.e. CommercialListingFields.EMPTY) never runs writeCommercialChildSets'
    // delete/insert at all — writeCommercialChildSets only acts when f.utilities() != null, so
    // this specific null-utilities case was never actually hazardous, even before #2038.
    //
    // The GENUINELY hazardous case — a non-null EMPTY utilities list (an accepted "not
    // applicable" sentinel per ListingController's rejectIfNonEmpty) silently wiping residential
    // amenities on a residential listing — was the real #2038 defect. The first rework attempt
    // traded the reported HTTP 500 for exactly this: SILENT DATA LOSS. It is now fixed by the
    // family gate in ListingCrudService.updateListing/createDraft: writeCommercialChildSets only
    // runs when the effective property type belongs to COMMERCIAL_PROPERTY_TYPES, so an empty
    // utilities list on a residential listing can no longer reach it at all. See
    // updateListing_residentialWithEmptyCommercialUtilities_deletesAmenitiesOnlyOnce immediately
    // below for the mockito-level regression guard pinning that fix (asserts the delete happens
    // exactly once — from the residential pass only — never twice).
    @Test
    void updateListing_residentialWithNullCommercialFields_doesNotClearListingAmenities() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPropertyType("apartment");
        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        crudService.updateListing(
                listingId, userId, false,
                null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, false, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null, null,
                // amenities IS supplied here (non-null, non-empty) — this pins the interesting
                // boundary: writeResidentialChildSets DOES run its delete-then-insert against
                // listing_amenities, and it is the commercial side (utilities=null/EMPTY below)
                // that leaves that write untouched by writeCommercialChildSets.
                residentialFields(null, null, null, null, List.of("LIFT", "GYM"), null, null),
                // commercialFields is fully NULL/EMPTY, including utilities=null — the "not supplied"
                // sentinel writeCommercialChildSets checks before touching listing_amenities
                com.example.realestate.listing.commercial.CommercialListingFields.EMPTY);

        verify(listingAmenityRepository, times(1)).deleteByListingId(listingId);
        verify(listingAmenityRepository, times(2)).save(any());
    }

    // --- #2038 (PR_REVIEW rework cycle 1, Part B mockito twin of T3): pins the fix for the
    // GENUINELY hazardous cross-family scenario at the mockito level. Pre-fix,
    // writeCommercialChildSets ran unconditionally whenever commercialFields.utilities() was
    // non-null (even an empty list), calling listingAmenityRepository.deleteByListingId a SECOND
    // time on the SAME listing_id — once from the residential pass (amenities non-empty, a real
    // delete-then-insert) and once more from the commercial pass (utilities=[], a spurious wipe).
    // Post-fix, the family gate means writeCommercialChildSets never runs at all for a residential
    // "apartment" listing, so deleteByListingId must be invoked exactly ONCE — from the
    // residential pass only, never twice.
    @Test
    void updateListing_residentialWithEmptyCommercialUtilities_deletesAmenitiesOnlyOnce() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPropertyType("apartment");
        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        com.example.realestate.listing.commercial.CommercialListingFields commercialFieldsWithEmptyUtilities =
                new com.example.realestate.listing.commercial.CommercialListingFields(
                        null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                        null, null, null, null, null, null, null, null, null, null, null, null, null,
                        /* suitableUses */ null,
                        /* utilities */ List.of());

        crudService.updateListing(
                listingId, userId, false,
                null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, false, null,
                null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                null, null,
                // amenities non-empty → the residential pass performs a real delete-then-insert.
                residentialFields(null, null, null, null, List.of("LIFT"), null, null),
                // utilities=[] (non-null empty) — the "not applicable" masking sentinel that pre-fix
                // ALSO ran writeCommercialChildSets' delete against listing_amenities, on top of the
                // residential pass above. The family gate must suppress this second call entirely.
                commercialFieldsWithEmptyUtilities);

        verify(listingAmenityRepository, times(1)).deleteByListingId(listingId);
        verify(listingAmenityRepository, times(1)).save(any());
    }

    private static com.example.realestate.listing.residential.ResidentialListingFields ResidentialListingFieldsEmpty() {
        return com.example.realestate.listing.residential.ResidentialListingFields.EMPTY;
    }

    private static com.example.realestate.listing.commercial.CommercialListingFields commercialFields(
            String commercialSubtype) {
        return new com.example.realestate.listing.commercial.CommercialListingFields(
                commercialSubtype,
                null, null, null, null, null, null, null,
                null, null, null, null, null, null, null,
                null, null, null, null, null, null, null,
                null, null, null, null, null, null, null);
    }

    // --- #1734: typed detail projection refresh (refreshTypedProjections) ---

    @Test
    void createDraft_commercialListing_upsertsCommercialProjection_deletesStaleResidentialRow() {
        UUID userId = UUID.randomUUID();
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        crudService.createDraft(
                userId, "commercial", "Shop near market", "Udupi",
                new BigDecimal("2000000"), "Retail shop", null, null, null, null, null, null,
                null, null, null, 1, 3, "FURNISHED", 2, 1, new BigDecimal("30"), "RETAIL",
                null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null, null,
                ResidentialListingFieldsEmpty(), commercialFields("SHOP"));

        verify(commercialSpaceDetailRepository).upsertFromListing(
                isNull(), eq("SHOP"), eq(1), eq(3), eq("FURNISHED"), eq(2), eq(1),
                eq(new BigDecimal("30")), eq("RETAIL"));
        verify(residentialUnitDetailRepository).deleteByListingId(isNull());
        verify(residentialUnitDetailRepository, never()).upsertFromListing(
                any(), any(), any(), any(), any(), any());
    }

    @Test
    void createDraft_residentialListing_upsertsResidentialProjection_deletesStaleCommercialRow() {
        UUID userId = UUID.randomUUID();
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        crudService.createDraft(
                userId, "apartment", "Flat", "Udupi",
                new BigDecimal("3000000"), "Nice flat", null, 3, null, null, null, null,
                null, null, null, 2, 10, "SEMI_FURNISHED", null, null, null, null,
                null, null, null, null,
                "dealer", null, null, null, null, null, null, null, null, null, null,
                residentialFields(2, null, null, null, null, null, null),
                com.example.realestate.listing.commercial.CommercialListingFields.EMPTY);

        verify(residentialUnitDetailRepository).upsertFromListing(
                isNull(), eq(3), eq(2), eq(2), eq(10), eq("SEMI_FURNISHED"));
        verify(commercialSpaceDetailRepository).deleteByListingId(isNull());
        verify(commercialSpaceDetailRepository, never()).upsertFromListing(
                any(), any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void createDraft_untypedFamily_deletesBothProjections_neverUpserts() {
        UUID userId = UUID.randomUUID();
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        crudService.createDraft(userId, "land", "Plot", "Manipal",
                new BigDecimal("5000000"), "Nice plot");

        verify(commercialSpaceDetailRepository).deleteByListingId(isNull());
        verify(residentialUnitDetailRepository).deleteByListingId(isNull());
        verify(commercialSpaceDetailRepository, never()).upsertFromListing(
                any(), any(), any(), any(), any(), any(), any(), any(), any());
        verify(residentialUnitDetailRepository, never()).upsertFromListing(
                any(), any(), any(), any(), any(), any());
    }

    @Test
    void updateListing_familySwitchCommercialToResidential_upsertsResidential_deletesStaleCommercial() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPropertyType("commercial");
        existing.setListingFamily("COMMERCIAL");

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        crudService.updateListing(
                listingId, userId, false,
                "apartment", null, null,
                null, null,
                null, 3, null,
                null, null, null,
                null, null,
                null, false, null,
                null, null, null,
                2, 10,
                "SEMI_FURNISHED", null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null,
                residentialFields(2, null, null, null, null, null, null),
                com.example.realestate.listing.commercial.CommercialListingFields.EMPTY);

        verify(residentialUnitDetailRepository).upsertFromListing(
                eq(listingId), eq(3), eq(2), eq(2), eq(10), eq("SEMI_FURNISHED"));
        verify(commercialSpaceDetailRepository).deleteByListingId(listingId);
        verify(commercialSpaceDetailRepository, never()).upsertFromListing(
                any(), any(), any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void updateListing_sameFamily_refreshInvokedExactlyOnce_notDoubleInvoked() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPropertyType("commercial");
        existing.setListingFamily("COMMERCIAL");

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        crudService.updateListing(
                listingId, userId, false,
                null, "Updated title", null,
                null, null,
                null, null, null,
                null, null, null,
                null, null,
                null, false, null,
                null, null, null,
                null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null,
                ResidentialListingFieldsEmpty(),
                com.example.realestate.listing.commercial.CommercialListingFields.EMPTY);

        verify(commercialSpaceDetailRepository, times(1)).upsertFromListing(
                any(), any(), any(), any(), any(), any(), any(), any(), any());
        verify(residentialUnitDetailRepository, times(1)).deleteByListingId(any());
        verify(residentialUnitDetailRepository, never()).upsertFromListing(
                any(), any(), any(), any(), any(), any());
    }

    // --- Cycle-2 fix: listingFamily must not remain stale on a switch to an untyped property type ---

    @Test
    void updateListing_houseToLand_clearsStaleResidentialFamilyStamp_deletesBothProjections() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPropertyType("house");
        existing.setListingFamily("RESIDENTIAL");

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = crudService.updateListing(
                listingId, userId, false,
                "land", null, null,
                null, null,
                null, null, null,
                null, null, null,
                null, null,
                null, false, null,
                null, null, null,
                null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null,
                ResidentialListingFieldsEmpty(),
                com.example.realestate.listing.commercial.CommercialListingFields.EMPTY);

        assertThat(result.getListingFamily())
                .as("switching away from a typed property type must clear the stale RESIDENTIAL stamp")
                .isNull();
        verify(commercialSpaceDetailRepository).deleteByListingId(listingId);
        verify(residentialUnitDetailRepository).deleteByListingId(listingId);
        verify(commercialSpaceDetailRepository, never()).upsertFromListing(
                any(), any(), any(), any(), any(), any(), any(), any(), any());
        verify(residentialUnitDetailRepository, never()).upsertFromListing(
                any(), any(), any(), any(), any(), any());
    }

    @Test
    void updateListing_commercialToAgriculturalLand_clearsStaleCommercialFamilyStamp() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPropertyType("commercial");
        existing.setListingFamily("COMMERCIAL");

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = crudService.updateListing(
                listingId, userId, false,
                "agricultural_land", null, null,
                null, null,
                null, null, null,
                null, null, null,
                null, null,
                null, false, null,
                null, null, null,
                null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null,
                ResidentialListingFieldsEmpty(),
                com.example.realestate.listing.commercial.CommercialListingFields.EMPTY);

        assertThat(result.getListingFamily())
                .as("AGRICULTURAL family population is out of scope for #1734 — the stale "
                        + "COMMERCIAL stamp must still be cleared rather than left behind")
                .isNull();
        verify(commercialSpaceDetailRepository).deleteByListingId(listingId);
        verify(residentialUnitDetailRepository).deleteByListingId(listingId);
    }

    @Test
    void updateListing_titleOnlyEditOfAgriculturalListing_preservesExistingAgriculturalFamilyStamp() {
        // Regression test (cycle-3 fix): an agricultural_land listing stamped listingFamily=
        // 'AGRICULTURAL' by the one-time V102 backfill DML (never written by this class) must
        // keep that stamp across an ordinary title/price-only edit. propertyType is not supplied
        // (null) — the effective propertyType stays 'agricultural_land', which matches neither
        // RESIDENTIAL_PROPERTY_TYPES nor COMMERCIAL_PROPERTY_TYPES. The first version of the
        // cycle-2 fix incorrectly nulled the stamp in exactly this scenario because it reset on
        // "propertyType matches neither typed set" alone, without checking whether the PRIOR
        // stamp was one this class actually owns.
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Listing existing = new Listing();
        existing.setId(listingId);
        existing.setCreatedBy(userId);
        existing.setStatus(ListingStatus.DRAFT.toDbValue());
        existing.setPropertyType("agricultural_land");
        existing.setListingFamily("AGRICULTURAL");

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(existing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = crudService.updateListing(
                listingId, userId, false,
                null, "Updated title only", null,
                null, null,
                null, null, null,
                null, null, null,
                null, null,
                null, false, null,
                null, null, null,
                null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null, null,
                null, null,
                ResidentialListingFieldsEmpty(),
                com.example.realestate.listing.commercial.CommercialListingFields.EMPTY);

        assertThat(result.getTitle()).isEqualTo("Updated title only");
        assertThat(result.getListingFamily())
                .as("a pre-existing AGRICULTURAL stamp (owned by V102 backfill, not this class) "
                        + "must survive an unrelated title-only edit")
                .isEqualTo("AGRICULTURAL");
        // AGRICULTURAL projection population is out of scope for #1734 — both typed tables are
        // still cleaned up (idempotent no-op if no row exists), but the family stamp itself must
        // not be touched.
        verify(commercialSpaceDetailRepository).deleteByListingId(listingId);
        verify(residentialUnitDetailRepository).deleteByListingId(listingId);
    }
}

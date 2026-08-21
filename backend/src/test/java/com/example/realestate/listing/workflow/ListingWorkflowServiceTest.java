package com.example.realestate.listing.workflow;

import com.example.realestate.listing.audit.ListingStatusHistory;
import com.example.realestate.listing.audit.ListingStatusHistoryRepository;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingOwnershipGuard;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.area.ListingAreaResolutionService;
import com.example.realestate.listing.duplicate.ProximityDuplicateService;
import com.example.realestate.listing.event.ListingApprovedEvent;
import com.example.realestate.listing.event.ListingRejectedEvent;
import com.example.realestate.listing.event.ListingSubmittedEvent;
import com.example.realestate.listing.event.NewListingInAreaEvent;
import com.example.realestate.listing.exception.ListingErrorCode;
import com.example.realestate.listing.exception.ListingLifecycleException;
import com.example.realestate.listing.exception.ListingOwnershipException;
import com.example.realestate.listing.exception.ListingStatusException;
import com.example.realestate.listing.exception.ListingValidationException;
import com.example.realestate.booking.BookingCascadeService;
import com.example.realestate.listing.image.ListingImage;
import com.example.realestate.listing.image.ListingImageRepository;
import com.example.realestate.quality.QualityRecomputeService;
import com.example.realestate.search.outbox.SearchOutboxWriter;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ListingWorkflowServiceTest {

    @Mock
    private ListingRepository listingRepository;

    @Mock
    private ApplicationEventPublisher applicationEventPublisher;

    @Mock
    private ListingOwnershipGuard listingOwnershipGuard;

    @Mock
    private ProximityDuplicateService proximityDuplicateService;

    @Mock
    private ListingTransitionPolicy policy;

    @Mock
    private ListingStatusHistoryRepository statusHistoryRepository;

    @Mock
    private ListingImageRepository imageRepository;

    @Mock
    private BookingCascadeService bookingCascadeService;

    @Mock
    private SearchOutboxWriter searchOutboxWriter;

    @Mock
    private QualityRecomputeService qualityRecomputeService;

    @Mock
    private ListingAreaResolutionService listingAreaResolutionService;

    // Real ObjectMapper — buildSnapshot exercises actual JSON serialisation
    private final ObjectMapper objectMapper = new ObjectMapper();

    private ListingWorkflowService workflowService;

    @BeforeEach
    void setUp() {
        // saveAndFlush delegates to identity in mocks — needed because archiveListing/rejectListing
        // use saveAndFlush to flush before @Modifying(clearAutomatically=true) cascade queries.
        lenient().when(listingRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        lenient().when(statusHistoryRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));
        workflowService = new ListingWorkflowService(
                listingRepository, applicationEventPublisher, listingOwnershipGuard,
                proximityDuplicateService, policy, statusHistoryRepository,
                imageRepository, objectMapper, bookingCascadeService, false, searchOutboxWriter,
                qualityRecomputeService, listingAreaResolutionService);
    }

    private ListingWorkflowService workflowServiceCascadeEnabled() {
        return new ListingWorkflowService(
                listingRepository, applicationEventPublisher, listingOwnershipGuard,
                proximityDuplicateService, policy, statusHistoryRepository,
                imageRepository, objectMapper, bookingCascadeService, true, searchOutboxWriter,
                qualityRecomputeService, listingAreaResolutionService);
    }

    // --- Notification decoupling tests ---

    @Test
    void approveListing_savesListingAndPublishesEvent_doesNotCallInsertNotification() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setCreatedBy(ownerId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setTitle("Test Property");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenReturn(listing);

        workflowService.approveListing(listingId, adminId);

        // Listing must be saved with LIVE status
        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());

        // Event must be published (notification is now async/decoupled)
        verify(applicationEventPublisher).publishEvent(any(ListingApprovedEvent.class));
    }

    @Test
    void rejectListing_savesListingAndPublishesEvent_doesNotCallInsertNotification() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setCreatedBy(ownerId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setTitle("Test Property");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.saveAndFlush(any())).thenReturn(listing);

        workflowService.rejectListing(listingId, adminId, "Poor quality images");

        // Listing must be saved with REJECTED status
        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).saveAndFlush(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(ListingStatus.REJECTED.toDbValue());

        // Event must be published (notification is now async/decoupled)
        verify(applicationEventPublisher).publishEvent(any(ListingRejectedEvent.class));
    }

    // --- approveListing — detection failure does not roll back the approval ---

    @Test
    void approveListing_detectionFailure_doesNotRollback() {
        UUID listingId = UUID.randomUUID();
        UUID adminId   = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setTitle("Test Property");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenReturn(listing);

        // Simulate detection throwing an exception
        doThrow(new RuntimeException("Detection DB error"))
                .when(proximityDuplicateService).detectAndRecord(any(Listing.class));

        // approveListing must still succeed and return the saved listing
        Listing result = workflowService.approveListing(listingId, adminId);

        assertThat(result).isNotNull();
        // Listing must have been saved (approval went through)
        verify(listingRepository).save(any(Listing.class));
        // Detection was attempted on the LIVE listing
        verify(proximityDuplicateService).detectAndRecord(
                argThat(l -> ListingStatus.LIVE.toDbValue().equals(l.getStatus())));
    }

    // ===== #2263 review-cycle fix: approveListing's safety net must retry on a non-RESOLVED
    // area_key, not just a null one — a non-null UNRESOLVED fallback key (e.g. left behind by a
    // transient AreaResolutionService failure at submit time, which defensively degrades to
    // UNRESOLVED rather than throwing) never matches any real areas.area_key row, so it fails
    // PublicListingController.getById's area-key join exactly like a null key does. =====

    @Test
    void approveListing_unresolvedFallbackAreaKey_safetyNetRetriesAndResolves() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setTitle("Test Property");
        // Non-null but non-canonical fallback key + UNRESOLVED status, as submitListing would
        // leave it after a transient resolver failure.
        listing.setAreaKey("in|ka|some-fallback|key");
        listing.setAreaResolutionStatus("UNRESOLVED");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenReturn(listing);

        // Simulate the retry succeeding this time (the transient outage cleared).
        doAnswer(invocation -> {
            Listing l = invocation.getArgument(0);
            l.setAreaKey("IN|KA|Udupi|Manipal");
            l.setAreaResolutionStatus("RESOLVED");
            l.setAreaResolutionMethod("ALIAS");
            return null;
        }).when(listingAreaResolutionService).resolveAndApply(any(Listing.class));

        Listing result = workflowService.approveListing(listingId, adminId);

        assertThat(result.getAreaKey()).isEqualTo("IN|KA|Udupi|Manipal");
        assertThat(result.getAreaResolutionStatus()).isEqualTo("RESOLVED");
        verify(listingAreaResolutionService).resolveAndApply(any(Listing.class));
        // Saved twice: once for the LIVE transition, once to persist the safety net's re-resolution.
        verify(listingRepository, times(2)).save(any(Listing.class));
        verify(applicationEventPublisher).publishEvent(any(NewListingInAreaEvent.class));
    }

    @Test
    void approveListing_unresolvedFallbackAreaKey_retryStillFails_logsButNeverPublishesAreaEvent() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setTitle("Test Property");
        listing.setAreaKey("in|ka|some-fallback|key");
        listing.setAreaResolutionStatus("UNRESOLVED");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenReturn(listing);
        // listingAreaResolutionService.resolveAndApply is a no-op mock by default — simulates a
        // resolver that still can't resolve it on retry.

        Listing result = workflowService.approveListing(listingId, adminId);

        assertThat(result.getAreaKey()).isEqualTo("in|ka|some-fallback|key");
        assertThat(result.getAreaResolutionStatus()).isEqualTo("UNRESOLVED");
        verify(listingAreaResolutionService).resolveAndApply(any(Listing.class));
        // Only the LIVE-transition save — no second save since resolution didn't improve anything.
        verify(listingRepository, times(1)).save(any(Listing.class));
        verify(applicationEventPublisher, never()).publishEvent(any(NewListingInAreaEvent.class));
    }

    // ===== RE-125: approveListing — policy delegation, history, lifecycle fields =====

    @Test
    void approveListing_writesHistoryRow() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setTitle("Test");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.approveListing(listingId, adminId);

        ArgumentCaptor<ListingStatusHistory> captor = ArgumentCaptor.forClass(ListingStatusHistory.class);
        verify(statusHistoryRepository).save(captor.capture());
        ListingStatusHistory history = captor.getValue();

        assertThat(history.getListingId()).isEqualTo(listingId);
        assertThat(history.getFromStatus()).isEqualTo(ListingStatus.PENDING_REVIEW.toDbValue());
        assertThat(history.getToStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());
        assertThat(history.getActorType()).isEqualTo(ActorType.ADMIN);
        assertThat(history.getActorId()).isEqualTo(adminId);
    }

    @Test
    void approveListing_setsApprovedAtAndStatusChangedFields() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setTitle("Test");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.approveListing(listingId, adminId);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        Listing saved = captor.getValue();

        assertThat(saved.getApprovedAt()).isNotNull();
        assertThat(saved.getStatusChangedAt()).isNotNull();
        assertThat(saved.getStatusChangedByActorType()).isEqualTo(ActorType.ADMIN);
        assertThat(saved.getStatusChangedByActorId()).isEqualTo(adminId);
    }

    // ===== RE-125: rejectListing — policy delegation, history, lifecycle fields =====

    @Test
    void rejectListing_writesHistoryRow() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setTitle("Test");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.rejectListing(listingId, adminId, "Poor quality images");

        ArgumentCaptor<ListingStatusHistory> captor = ArgumentCaptor.forClass(ListingStatusHistory.class);
        verify(statusHistoryRepository).saveAndFlush(captor.capture());
        ListingStatusHistory history = captor.getValue();

        assertThat(history.getListingId()).isEqualTo(listingId);
        assertThat(history.getFromStatus()).isEqualTo(ListingStatus.PENDING_REVIEW.toDbValue());
        assertThat(history.getToStatus()).isEqualTo(ListingStatus.REJECTED.toDbValue());
        assertThat(history.getActorType()).isEqualTo(ActorType.ADMIN);
        assertThat(history.getActorId()).isEqualTo(adminId);
        assertThat(history.getReasonCode()).isEqualTo("Poor quality images");
        assertThat(history.getNote()).isEqualTo("Poor quality images");
    }

    @Test
    void rejectListing_setsRejectedAtAndStatusChangedFields() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setTitle("Test");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.rejectListing(listingId, adminId, "Incomplete info");

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).saveAndFlush(captor.capture());
        Listing saved = captor.getValue();

        assertThat(saved.getRejectedAt()).isNotNull();
        assertThat(saved.getStatusReasonCode()).isEqualTo("Incomplete info");
        assertThat(saved.getStatusReasonNote()).isEqualTo("Incomplete info");
        assertThat(saved.getStatusChangedAt()).isNotNull();
        assertThat(saved.getStatusChangedByActorType()).isEqualTo(ActorType.ADMIN);
        assertThat(saved.getStatusChangedByActorId()).isEqualTo(adminId);
        // Backward compat: rejectionReason still set
        assertThat(saved.getRejectionReason()).isEqualTo("Incomplete info");
        // #1794 Phase 1: rejectListing is a non-LIVE transition — lastConfirmedAt must NOT be touched
        assertThat(saved.getLastConfirmedAt()).isNull();
    }

    @Test
    void rejectListing_nullReason_throwsReasonCodeRequired() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        // guardReasonCodeRequired is now implemented in the policy; stub the mock to throw
        doThrow(new ListingLifecycleException(ListingErrorCode.REASON_CODE_REQUIRED, "Rejection reason is required"))
                .when(policy).guardReasonCodeRequired(null);

        assertThatThrownBy(() -> workflowService.rejectListing(listingId, adminId, null))
                .isInstanceOf(ListingLifecycleException.class)
                .satisfies(ex -> assertThat(((ListingLifecycleException) ex).getCode())
                        .isEqualTo(ListingErrorCode.REASON_CODE_REQUIRED));

        verify(listingRepository, never()).saveAndFlush(any());
        verify(statusHistoryRepository, never()).saveAndFlush(any());
    }

    @Test
    void rejectListing_fromLive_writesHistory() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.LIVE.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setTitle("Test");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.rejectListing(listingId, adminId, "Policy violation");

        verify(policy).validate(ListingStatus.LIVE, ListingStatus.REJECTED, ActorType.ADMIN);

        ArgumentCaptor<ListingStatusHistory> captor = ArgumentCaptor.forClass(ListingStatusHistory.class);
        verify(statusHistoryRepository).saveAndFlush(captor.capture());
        ListingStatusHistory history = captor.getValue();

        assertThat(history.getFromStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());
        assertThat(history.getToStatus()).isEqualTo(ListingStatus.REJECTED.toDbValue());
        assertThat(history.getActorType()).isEqualTo(ActorType.ADMIN);
        assertThat(history.getActorId()).isEqualTo(adminId);
        assertThat(history.getReasonCode()).isEqualTo("Policy violation");
    }

    // ===== RE-94: approveListing — transparency timestamps =====

    @Test
    void approveListing_firstApproval_setsFirstPublishedAtAndLastLiveAt() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setTitle("Test");
        // firstPublishedAt is null — first-time approval

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.approveListing(listingId, adminId);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        Listing saved = captor.getValue();

        assertThat(saved.getFirstPublishedAt()).isNotNull();
        assertThat(saved.getLastLiveAt()).isNotNull();
        // Both should be set on first approval; values should be very close
        assertThat(saved.getFirstPublishedAt()).isEqualTo(saved.getLastLiveAt());
        // #1794 Phase 1: lastConfirmedAt is set on every LIVE transition, incl. first approval
        assertThat(saved.getLastConfirmedAt()).isNotNull();
        assertThat(saved.getLastConfirmedAt()).isEqualTo(saved.getLastLiveAt());
    }

    @Test
    void approveListing_secondApproval_preservesFirstPublishedAtAndUpdatesLastLiveAt()
            throws InterruptedException {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        java.time.OffsetDateTime originalFirstPublished =
                java.time.OffsetDateTime.now().minusDays(10);

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setTitle("Test");
        listing.setFirstPublishedAt(originalFirstPublished);  // already set from first approval

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.approveListing(listingId, adminId);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        Listing saved = captor.getValue();

        // firstPublishedAt must NOT be overwritten on re-approval
        assertThat(saved.getFirstPublishedAt()).isEqualTo(originalFirstPublished);
        // lastLiveAt must be updated to now
        assertThat(saved.getLastLiveAt()).isNotNull();
        assertThat(saved.getLastLiveAt()).isAfter(originalFirstPublished);
        // #1794 Phase 1: lastConfirmedAt refreshes on every LIVE transition, including re-approval
        assertThat(saved.getLastConfirmedAt()).isNotNull();
        assertThat(saved.getLastConfirmedAt()).isEqualTo(saved.getLastLiveAt());
    }

    // ===== restoreListing =====

    @Test
    void restoreListing_archivedListing_clearsArchivedAtAndSetsDraft() {
        UUID listingId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.ARCHIVED.toDbValue());
        listing.setArchivedAt(java.time.Instant.now());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing restored = workflowService.restoreListing(listingId, UUID.randomUUID());

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        Listing saved = captor.getValue();
        assertThat(saved.getArchivedAt()).isNull();
        assertThat(saved.getStatus()).isEqualTo(ListingStatus.DRAFT.toDbValue());
    }

    @Test
    void restoreListing_activeListing_throwsListingNotArchivedException() {
        UUID listingId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.DRAFT.toDbValue());
        // archivedAt is null — listing is active

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        org.junit.jupiter.api.Assertions.assertThrows(
                com.example.realestate.listing.exception.ListingNotArchivedException.class,
                () -> workflowService.restoreListing(listingId, UUID.randomUUID()));

        verify(listingRepository, never()).save(any());
    }

    @Test
    void restoreListing_notFound_throwsListingNotFoundException() {
        UUID listingId = UUID.randomUUID();

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.empty());

        org.junit.jupiter.api.Assertions.assertThrows(
                com.example.realestate.listing.exception.ListingNotFoundException.class,
                () -> workflowService.restoreListing(listingId, UUID.randomUUID()));
    }

    // ===== adminForceDelete =====

    @Test
    void adminForceDelete_liveListing_returnsTrue() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.LIVE.toDbValue());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        boolean result = workflowService.adminForceDelete(listingId, adminId);

        assertThat(result).isTrue();
        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        Listing saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(ListingStatus.ARCHIVED.toDbValue());
        assertThat(saved.getArchivedAt()).isNotNull();
        assertThat(saved.getUpdatedAt()).isNotNull();
    }

    @Test
    void adminForceDelete_alreadyArchived_isIdempotent() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.ARCHIVED.toDbValue());
        listing.setArchivedAt(java.time.Instant.now());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        boolean result = workflowService.adminForceDelete(listingId, adminId);

        assertThat(result).isFalse();
        verify(listingRepository, never()).save(any());
    }

    @Test
    void adminForceDelete_notFound_throws() {
        UUID listingId = UUID.randomUUID();

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.empty());

        org.junit.jupiter.api.Assertions.assertThrows(
                com.example.realestate.listing.exception.ListingNotFoundException.class,
                () -> workflowService.adminForceDelete(listingId, UUID.randomUUID()));

        verify(listingRepository, never()).save(any());
    }

    // ===== approveScrapedListing — search outbox event =====

    @Test
    void approveScrapedListing_writesSearchOutboxEvent() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setCreatedBy(ownerId);
        listing.setStatus(ListingStatus.SCRAPED.toDbValue());
        listing.setPropertyType("house");
        listing.setLocality("Udupi");
        listing.setPrice(new BigDecimal("1000000"));
        listing.setPricePaise(100_000_000L);
        listing.setAddressConfirmed(true);
        listing.setUpdatedAt(OffsetDateTime.now());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> {
            Listing l = inv.getArgument(0);
            l.setStatus(ListingStatus.LIVE.toDbValue());
            return l;
        });
        lenient().when(imageRepository.findByListingIdOrderByPositionAsc(any())).thenReturn(List.of());

        workflowService.approveScrapedListing(listingId, adminId);

        ArgumentCaptor<com.example.realestate.search.outbox.SearchOutboxEventType> eventTypeCaptor =
                ArgumentCaptor.forClass(com.example.realestate.search.outbox.SearchOutboxEventType.class);
        ArgumentCaptor<com.example.realestate.search.outbox.SearchOutboxOperation> operationCaptor =
                ArgumentCaptor.forClass(com.example.realestate.search.outbox.SearchOutboxOperation.class);
        ArgumentCaptor<UUID> idCaptor = ArgumentCaptor.forClass(UUID.class);

        verify(searchOutboxWriter).writeEvent(
                idCaptor.capture(),
                eventTypeCaptor.capture(),
                operationCaptor.capture(),
                any(),
                any());

        assertThat(idCaptor.getValue()).isEqualTo(listingId);
        assertThat(eventTypeCaptor.getValue())
                .isEqualTo(com.example.realestate.search.outbox.SearchOutboxEventType.LISTING_APPROVED);
        assertThat(operationCaptor.getValue())
                .isEqualTo(com.example.realestate.search.outbox.SearchOutboxOperation.INDEX);
    }

    // ===== RE-124: submitListing — policy delegation, history writing, lifecycle fields =====

    /**
     * Creates a listing that passes validateForSubmission checks.
     * Uses property type "house" which has no additional required fields.
     */
    private Listing createSubmittableListing(UUID listingId, UUID userId, String statusDbValue) {
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setCreatedBy(userId);
        listing.setStatus(statusDbValue);
        listing.setPropertyType("house");
        listing.setLocality("Udupi");
        listing.setAddressConfirmed(true);
        listing.setPrice(BigDecimal.valueOf(1000000));
        listing.setTitle("Test Property");
        return listing;
    }

    private void stubForSubmit(UUID listingId, UUID userId, Listing listing) {
        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(listing);
        // countImagesByListingId is now called inside policy.guardCompleteness (mocked); stub lenient to avoid UnnecessaryStubbingException
        lenient().when(listingRepository.countImagesByListingId(listingId)).thenReturn(3L);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(statusHistoryRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void submitListing_fromDraft_delegatesToPolicyAndSaves() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Listing listing = createSubmittableListing(listingId, userId, ListingStatus.DRAFT.toDbValue());
        stubForSubmit(listingId, userId, listing);

        Listing result = workflowService.submitListing(listingId, userId, false);

        verify(policy).validate(ListingStatus.DRAFT, ListingStatus.PENDING_REVIEW, ActorType.BROKER);
        assertThat(result.getStatus()).isEqualTo(ListingStatus.PENDING_REVIEW.toDbValue());
    }

    @Test
    void submitListing_policyRejects_throwsWithoutSaving() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Listing listing = createSubmittableListing(listingId, userId, ListingStatus.LIVE.toDbValue());
        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(listing);

        doThrow(new ListingStatusException("Transition not allowed: from=LIVE to=PENDING_REVIEW actor=BROKER"))
                .when(policy).validate(ListingStatus.LIVE, ListingStatus.PENDING_REVIEW, ActorType.BROKER);

        assertThatThrownBy(() -> workflowService.submitListing(listingId, userId, false))
                .isInstanceOf(ListingStatusException.class);

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    @Test
    void submitListing_writesHistoryRow() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Listing listing = createSubmittableListing(listingId, userId, ListingStatus.DRAFT.toDbValue());
        stubForSubmit(listingId, userId, listing);

        workflowService.submitListing(listingId, userId, false);

        ArgumentCaptor<ListingStatusHistory> captor = ArgumentCaptor.forClass(ListingStatusHistory.class);
        verify(statusHistoryRepository).save(captor.capture());
        ListingStatusHistory history = captor.getValue();

        assertThat(history.getListingId()).isEqualTo(listingId);
        assertThat(history.getFromStatus()).isEqualTo(ListingStatus.DRAFT.toDbValue());
        assertThat(history.getToStatus()).isEqualTo(ListingStatus.PENDING_REVIEW.toDbValue());
        assertThat(history.getActorType()).isEqualTo(ActorType.BROKER);
        assertThat(history.getActorId()).isEqualTo(userId);
        assertThat(history.getActionedSubmissionCount()).isEqualTo(1);
    }

    @Test
    void submitListing_publishesListingSubmittedEvent() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Listing listing = createSubmittableListing(listingId, userId, ListingStatus.DRAFT.toDbValue());
        stubForSubmit(listingId, userId, listing);

        workflowService.submitListing(listingId, userId, false);

        verify(applicationEventPublisher).publishEvent(any(ListingSubmittedEvent.class));
    }

    @Test
    void submitListing_incrementsSubmissionCount() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Listing listing = createSubmittableListing(listingId, userId, ListingStatus.DRAFT.toDbValue());
        listing.setSubmissionCount(0);
        stubForSubmit(listingId, userId, listing);

        workflowService.submitListing(listingId, userId, false);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        assertThat(captor.getValue().getSubmissionCount()).isEqualTo(1);
    }

    @Test
    void submitListing_setsReviewSubmittedAt() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Listing listing = createSubmittableListing(listingId, userId, ListingStatus.DRAFT.toDbValue());
        stubForSubmit(listingId, userId, listing);

        workflowService.submitListing(listingId, userId, false);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        assertThat(captor.getValue().getReviewSubmittedAt()).isNotNull();
    }

    @Test
    void submitListing_setsStatusChangedFields() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Listing listing = createSubmittableListing(listingId, userId, ListingStatus.DRAFT.toDbValue());
        stubForSubmit(listingId, userId, listing);

        workflowService.submitListing(listingId, userId, false);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        Listing saved = captor.getValue();
        assertThat(saved.getStatusChangedAt()).isNotNull();
        assertThat(saved.getStatusChangedByActorType()).isEqualTo(ActorType.BROKER);
        assertThat(saved.getStatusChangedByActorId()).isEqualTo(userId);
    }

    @Test
    void submitListing_fromRejected_writesHistoryWithCorrectFromStatus() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Listing listing = createSubmittableListing(listingId, userId, ListingStatus.REJECTED.toDbValue());
        listing.setSubmissionCount(1); // already submitted once before
        stubForSubmit(listingId, userId, listing);

        workflowService.submitListing(listingId, userId, false);

        verify(policy).validate(ListingStatus.REJECTED, ListingStatus.PENDING_REVIEW, ActorType.BROKER);

        ArgumentCaptor<ListingStatusHistory> captor = ArgumentCaptor.forClass(ListingStatusHistory.class);
        verify(statusHistoryRepository).save(captor.capture());
        ListingStatusHistory history = captor.getValue();

        assertThat(history.getFromStatus()).isEqualTo(ListingStatus.REJECTED.toDbValue());
        assertThat(history.getToStatus()).isEqualTo(ListingStatus.PENDING_REVIEW.toDbValue());
        assertThat(history.getActionedSubmissionCount()).isEqualTo(2);
    }

    @Test
    void submitListing_fromArchived_writesHistory() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Listing listing = createSubmittableListing(listingId, userId, ListingStatus.ARCHIVED.toDbValue());
        stubForSubmit(listingId, userId, listing);

        workflowService.submitListing(listingId, userId, false);

        verify(policy).validate(ListingStatus.ARCHIVED, ListingStatus.PENDING_REVIEW, ActorType.BROKER);

        ArgumentCaptor<ListingStatusHistory> captor = ArgumentCaptor.forClass(ListingStatusHistory.class);
        verify(statusHistoryRepository).save(captor.capture());
        ListingStatusHistory history = captor.getValue();

        assertThat(history.getFromStatus()).isEqualTo(ListingStatus.ARCHIVED.toDbValue());
        assertThat(history.getToStatus()).isEqualTo(ListingStatus.PENDING_REVIEW.toDbValue());
        assertThat(history.getActorType()).isEqualTo(ActorType.BROKER);
        assertThat(history.getActorId()).isEqualTo(userId);
    }

    @Test
    void submitListing_preservesSubmittedAt() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Listing listing = createSubmittableListing(listingId, userId, ListingStatus.DRAFT.toDbValue());
        stubForSubmit(listingId, userId, listing);

        workflowService.submitListing(listingId, userId, false);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        // submittedAt (OffsetDateTime) must still be set for backward compat
        assertThat(captor.getValue().getSubmittedAt()).isNotNull();
    }

    // ===== RE-127: archiveListing — dealer archives own listing =====

    private Listing createOwnedListing(UUID listingId, UUID userId, String statusDbValue) {
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setCreatedBy(userId);
        listing.setStatus(statusDbValue);
        listing.setTitle("Test Property");
        return listing;
    }

    @Test
    void archiveListing_fromLive_setsArchivedAtAndWritesHistory() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.LIVE.toDbValue());

        when(listingOwnershipGuard.findOwned(listingId, actorId, false)).thenReturn(listing);
        when(listingRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.archiveListing(listingId, actorId, null);

        verify(policy).validate(ListingStatus.LIVE, ListingStatus.ARCHIVED, ActorType.BROKER);

        ArgumentCaptor<Listing> listingCaptor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).saveAndFlush(listingCaptor.capture());
        Listing saved = listingCaptor.getValue();
        assertThat(saved.getStatus()).isEqualTo(ListingStatus.ARCHIVED.toDbValue());
        assertThat(saved.getArchivedAt()).isNotNull();
        assertThat(saved.getUpdatedAt()).isNotNull();

        ArgumentCaptor<ListingStatusHistory> historyCaptor = ArgumentCaptor.forClass(ListingStatusHistory.class);
        verify(statusHistoryRepository).saveAndFlush(historyCaptor.capture());
        ListingStatusHistory history = historyCaptor.getValue();
        assertThat(history.getListingId()).isEqualTo(listingId);
        assertThat(history.getFromStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());
        assertThat(history.getToStatus()).isEqualTo(ListingStatus.ARCHIVED.toDbValue());
        assertThat(history.getActorType()).isEqualTo(ActorType.BROKER);
        assertThat(history.getActorId()).isEqualTo(actorId);
        assertThat(history.getNote()).isNull();
    }

    @Test
    void archiveListing_fromDraft_works() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.DRAFT.toDbValue());

        when(listingOwnershipGuard.findOwned(listingId, actorId, false)).thenReturn(listing);
        when(listingRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.archiveListing(listingId, actorId, null);

        verify(policy).validate(ListingStatus.DRAFT, ListingStatus.ARCHIVED, ActorType.BROKER);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).saveAndFlush(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(ListingStatus.ARCHIVED.toDbValue());
        assertThat(captor.getValue().getArchivedAt()).isNotNull();
    }

    @Test
    void archiveListing_fromRejected_setsReasonNoteAndWritesHistory() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.REJECTED.toDbValue());

        when(listingOwnershipGuard.findOwned(listingId, actorId, false)).thenReturn(listing);
        when(listingRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.archiveListing(listingId, actorId, "No longer selling");

        verify(policy).validate(ListingStatus.REJECTED, ListingStatus.ARCHIVED, ActorType.BROKER);

        ArgumentCaptor<Listing> listingCaptor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).saveAndFlush(listingCaptor.capture());
        Listing saved = listingCaptor.getValue();
        assertThat(saved.getStatus()).isEqualTo(ListingStatus.ARCHIVED.toDbValue());
        assertThat(saved.getStatusReasonNote()).isEqualTo("No longer selling");

        ArgumentCaptor<ListingStatusHistory> historyCaptor = ArgumentCaptor.forClass(ListingStatusHistory.class);
        verify(statusHistoryRepository).saveAndFlush(historyCaptor.capture());
        ListingStatusHistory history = historyCaptor.getValue();
        assertThat(history.getFromStatus()).isEqualTo(ListingStatus.REJECTED.toDbValue());
        assertThat(history.getToStatus()).isEqualTo(ListingStatus.ARCHIVED.toDbValue());
        assertThat(history.getNote()).isEqualTo("No longer selling");
    }

    @Test
    void archiveListing_pendingReview_throwsPolicyException() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.PENDING_REVIEW.toDbValue());

        when(listingOwnershipGuard.findOwned(listingId, actorId, false)).thenReturn(listing);

        doThrow(new ListingStatusException("Transition not allowed: from=PENDING_REVIEW to=ARCHIVED actor=BROKER"))
                .when(policy).validate(ListingStatus.PENDING_REVIEW, ListingStatus.ARCHIVED, ActorType.BROKER);

        assertThatThrownBy(() -> workflowService.archiveListing(listingId, actorId, null))
                .isInstanceOf(ListingStatusException.class);

        verify(listingRepository, never()).saveAndFlush(any());
        verify(statusHistoryRepository, never()).saveAndFlush(any());
    }

    @Test
    void archiveListing_setsStatusChangedFields() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.LIVE.toDbValue());

        when(listingOwnershipGuard.findOwned(listingId, actorId, false)).thenReturn(listing);
        when(listingRepository.saveAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.archiveListing(listingId, actorId, null);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).saveAndFlush(captor.capture());
        Listing saved = captor.getValue();
        assertThat(saved.getStatusChangedAt()).isNotNull();
        assertThat(saved.getStatusChangedByActorType()).isEqualTo(ActorType.BROKER);
        assertThat(saved.getStatusChangedByActorId()).isEqualTo(actorId);
    }

    // ===== RE-129: reopenRejectedListing — dealer reopens rejected listing to DRAFT =====

    @Test
    void reopenRejectedListing_toDraft_preservesRejectedAtAndWritesHistory() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.REJECTED.toDbValue());
        listing.setRejectedAt(java.time.Instant.now().minusSeconds(3600));

        when(listingOwnershipGuard.findOwned(listingId, actorId, false)).thenReturn(listing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.reopenRejectedListing(listingId, actorId);

        verify(policy).validate(ListingStatus.REJECTED, ListingStatus.DRAFT, ActorType.BROKER);

        ArgumentCaptor<Listing> listingCaptor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(listingCaptor.capture());
        Listing saved = listingCaptor.getValue();
        assertThat(saved.getStatus()).isEqualTo(ListingStatus.DRAFT.toDbValue());
        assertThat(saved.getRejectedAt()).isNotNull(); // preserved, NOT cleared

        ArgumentCaptor<ListingStatusHistory> historyCaptor = ArgumentCaptor.forClass(ListingStatusHistory.class);
        verify(statusHistoryRepository).save(historyCaptor.capture());
        ListingStatusHistory history = historyCaptor.getValue();
        assertThat(history.getListingId()).isEqualTo(listingId);
        assertThat(history.getFromStatus()).isEqualTo(ListingStatus.REJECTED.toDbValue());
        assertThat(history.getToStatus()).isEqualTo(ListingStatus.DRAFT.toDbValue());
        assertThat(history.getActorType()).isEqualTo(ActorType.BROKER);
        assertThat(history.getActorId()).isEqualTo(actorId);
    }

    @Test
    void reopenRejectedListing_setsStatusChangedFields() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.REJECTED.toDbValue());

        when(listingOwnershipGuard.findOwned(listingId, actorId, false)).thenReturn(listing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.reopenRejectedListing(listingId, actorId);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        Listing saved = captor.getValue();
        assertThat(saved.getStatusChangedAt()).isNotNull();
        assertThat(saved.getStatusChangedByActorType()).isEqualTo(ActorType.BROKER);
        assertThat(saved.getStatusChangedByActorId()).isEqualTo(actorId);
        assertThat(saved.getUpdatedAt()).isNotNull();
    }

    @Test
    void reopenRejectedListing_wrongStatus_throwsPolicyException() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.LIVE.toDbValue());

        when(listingOwnershipGuard.findOwned(listingId, actorId, false)).thenReturn(listing);

        doThrow(new ListingStatusException("Transition not allowed: from=LIVE to=DRAFT actor=BROKER"))
                .when(policy).validate(ListingStatus.LIVE, ListingStatus.DRAFT, ActorType.BROKER);

        assertThatThrownBy(() -> workflowService.reopenRejectedListing(listingId, actorId))
                .isInstanceOf(ListingStatusException.class);

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    // ===== RE-129: reopenArchivedListingAsDraft — dealer reopens archived listing to DRAFT =====

    @Test
    void reopenArchivedListingAsDraft_clearsArchivedAtAndWritesHistory() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.ARCHIVED.toDbValue());
        listing.setArchivedAt(java.time.Instant.now().minusSeconds(3600));

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.reopenArchivedListingAsDraft(listingId, actorId);

        verify(policy).validate(ListingStatus.ARCHIVED, ListingStatus.DRAFT, ActorType.BROKER);

        ArgumentCaptor<Listing> listingCaptor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(listingCaptor.capture());
        Listing saved = listingCaptor.getValue();
        assertThat(saved.getStatus()).isEqualTo(ListingStatus.DRAFT.toDbValue());
        assertThat(saved.getArchivedAt()).isNull(); // cleared

        ArgumentCaptor<ListingStatusHistory> historyCaptor = ArgumentCaptor.forClass(ListingStatusHistory.class);
        verify(statusHistoryRepository).save(historyCaptor.capture());
        ListingStatusHistory history = historyCaptor.getValue();
        assertThat(history.getListingId()).isEqualTo(listingId);
        assertThat(history.getFromStatus()).isEqualTo(ListingStatus.ARCHIVED.toDbValue());
        assertThat(history.getToStatus()).isEqualTo(ListingStatus.DRAFT.toDbValue());
        assertThat(history.getActorType()).isEqualTo(ActorType.BROKER);
        assertThat(history.getActorId()).isEqualTo(actorId);
    }

    @Test
    void reopenArchivedListingAsDraft_setsStatusChangedFields() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.ARCHIVED.toDbValue());
        listing.setArchivedAt(java.time.Instant.now());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.reopenArchivedListingAsDraft(listingId, actorId);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        Listing saved = captor.getValue();
        assertThat(saved.getStatusChangedAt()).isNotNull();
        assertThat(saved.getStatusChangedByActorType()).isEqualTo(ActorType.BROKER);
        assertThat(saved.getStatusChangedByActorId()).isEqualTo(actorId);
        assertThat(saved.getUpdatedAt()).isNotNull();
    }

    @Test
    void reopenArchivedListingAsDraft_notOwner_throwsOwnershipException() {
        UUID listingId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        UUID differentActorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, ownerId, ListingStatus.ARCHIVED.toDbValue());
        listing.setArchivedAt(java.time.Instant.now());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        assertThatThrownBy(() -> workflowService.reopenArchivedListingAsDraft(listingId, differentActorId))
                .isInstanceOf(ListingOwnershipException.class);

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    @Test
    void reopenArchivedListingAsDraft_wrongStatus_throwsPolicyException() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.DRAFT.toDbValue());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        doThrow(new ListingStatusException("Transition not allowed: from=DRAFT to=DRAFT actor=BROKER"))
                .when(policy).validate(ListingStatus.DRAFT, ListingStatus.DRAFT, ActorType.BROKER);

        assertThatThrownBy(() -> workflowService.reopenArchivedListingAsDraft(listingId, actorId))
                .isInstanceOf(ListingStatusException.class);

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    // ===== RE-130: restoreArchivedListing — dealer fast-restores archived listing to LIVE =====

    @Test
    void restoreArchivedListing_eligible_setsLiveAndClearsArchivedAt() throws Exception {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.ARCHIVED.toDbValue());
        listing.setArchivedAt(java.time.Instant.now().minusSeconds(3600));
        listing.setFirstPublishedAt(java.time.OffsetDateTime.now().minusDays(30));
        java.time.OffsetDateTime originalFirstPublished = listing.getFirstPublishedAt();
        listing.setLastApprovedSnapshot(buildSnapshotJson(listing, List.of()));
        // imageRepository stub removed — guardFastRestore is mocked; image fetch is now in the policy

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = workflowService.restoreArchivedListing(listingId, actorId);

        verify(policy).validate(ListingStatus.ARCHIVED, ListingStatus.LIVE, ActorType.BROKER);

        ArgumentCaptor<Listing> listingCaptor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(listingCaptor.capture());
        Listing saved = listingCaptor.getValue();
        assertThat(saved.getStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());
        assertThat(saved.getArchivedAt()).isNull(); // cleared
        assertThat(saved.getLastLiveAt()).isNotNull(); // refreshed
        assertThat(saved.getFirstPublishedAt()).isEqualTo(originalFirstPublished); // preserved (write-once)
        // #1794 Phase 1: lastConfirmedAt is set on this manual set-point (bypasses the shared
        // helper); firstPublishedAt must remain untouched (asserted above).
        assertThat(saved.getLastConfirmedAt()).isNotNull();
        assertThat(saved.getLastConfirmedAt()).isEqualTo(saved.getLastLiveAt());
    }

    @Test
    void restoreArchivedListing_neverPublished_throws422() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.ARCHIVED.toDbValue());
        listing.setArchivedAt(java.time.Instant.now());
        // firstPublishedAt is null — never published; guard rejects it

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        // guardFastRestore now owns eligibility; stub the mock to throw (real behaviour tested in ListingTransitionPolicyTest)
        doThrow(new ListingLifecycleException(ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE,
                "No approved snapshot on record — fast restore requires a prior approved snapshot"))
                .when(policy).guardFastRestore(listing);

        assertThatThrownBy(() -> workflowService.restoreArchivedListing(listingId, actorId))
                .isInstanceOf(ListingLifecycleException.class)
                .satisfies(ex -> assertThat(((ListingLifecycleException) ex).getCode())
                        .isEqualTo(ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE));

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    @Test
    void restoreArchivedListing_nonArchived_throwsPolicyException() throws Exception {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.DRAFT.toDbValue());
        listing.setFirstPublishedAt(java.time.OffsetDateTime.now().minusDays(10)); // was published
        // guardFastRestore is mocked (no-op); we want to test the policy transition-matrix check
        listing.setLastApprovedSnapshot(buildSnapshotJson(listing, List.of()));
        // imageRepository stub removed — guardFastRestore is mocked; image fetch is now in the policy

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        doThrow(new ListingStatusException("Transition not allowed: from=DRAFT to=LIVE actor=BROKER"))
                .when(policy).validate(ListingStatus.DRAFT, ListingStatus.LIVE, ActorType.BROKER);

        assertThatThrownBy(() -> workflowService.restoreArchivedListing(listingId, actorId))
                .isInstanceOf(ListingStatusException.class);

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    @Test
    void restoreArchivedListing_notOwner_throwsOwnershipException() {
        UUID listingId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        UUID differentActorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, ownerId, ListingStatus.ARCHIVED.toDbValue());
        listing.setArchivedAt(java.time.Instant.now());
        listing.setFirstPublishedAt(java.time.OffsetDateTime.now().minusDays(10));

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        assertThatThrownBy(() -> workflowService.restoreArchivedListing(listingId, differentActorId))
                .isInstanceOf(ListingOwnershipException.class);

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    @Test
    void restoreArchivedListing_writesHistoryRow() throws Exception {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.ARCHIVED.toDbValue());
        listing.setArchivedAt(java.time.Instant.now());
        listing.setFirstPublishedAt(java.time.OffsetDateTime.now().minusDays(30));
        listing.setLastApprovedSnapshot(buildSnapshotJson(listing, List.of()));
        // imageRepository stub removed — guardFastRestore is mocked; image fetch is now in the policy

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.restoreArchivedListing(listingId, actorId);

        ArgumentCaptor<ListingStatusHistory> historyCaptor = ArgumentCaptor.forClass(ListingStatusHistory.class);
        verify(statusHistoryRepository).save(historyCaptor.capture());
        ListingStatusHistory history = historyCaptor.getValue();
        assertThat(history.getListingId()).isEqualTo(listingId);
        assertThat(history.getFromStatus()).isEqualTo(ListingStatus.ARCHIVED.toDbValue());
        assertThat(history.getToStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());
        assertThat(history.getActorType()).isEqualTo(ActorType.BROKER);
        assertThat(history.getActorId()).isEqualTo(actorId);
    }

    @Test
    void restoreArchivedListing_setsStatusChangedFields() throws Exception {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.ARCHIVED.toDbValue());
        listing.setArchivedAt(java.time.Instant.now());
        listing.setFirstPublishedAt(java.time.OffsetDateTime.now().minusDays(30));
        listing.setLastApprovedSnapshot(buildSnapshotJson(listing, List.of()));
        // imageRepository stub removed — guardFastRestore is mocked; image fetch is now in the policy

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.restoreArchivedListing(listingId, actorId);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        Listing saved = captor.getValue();
        assertThat(saved.getStatusChangedAt()).isNotNull();
        assertThat(saved.getStatusChangedByActorType()).isEqualTo(ActorType.BROKER);
        assertThat(saved.getStatusChangedByActorId()).isEqualTo(actorId);
        assertThat(saved.getUpdatedAt()).isNotNull();
    }

    @Test
    void restoreArchivedListing_notFound_throwsListingNotFoundException() {
        UUID listingId = UUID.randomUUID();

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.empty());

        org.junit.jupiter.api.Assertions.assertThrows(
                com.example.realestate.listing.exception.ListingNotFoundException.class,
                () -> workflowService.restoreArchivedListing(listingId, UUID.randomUUID()));
    }

    // ===== RE-128: withdrawListingFromReview — dealer withdraws PENDING_REVIEW listing to DRAFT =====

    @Test
    void withdrawListingFromReview_happyPath_setsDraftAndClearsReviewSubmittedAt() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setReviewSubmittedAt(java.time.Instant.now().minusSeconds(60));

        when(listingOwnershipGuard.findOwned(listingId, actorId, false)).thenReturn(listing);
        when(statusHistoryRepository.existsAdminActionAfter(any(UUID.class), any(java.time.Instant.class)))
                .thenReturn(false);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.withdrawListingFromReview(listingId, actorId);

        verify(policy).validate(ListingStatus.PENDING_REVIEW, ListingStatus.DRAFT, ActorType.BROKER);

        ArgumentCaptor<Listing> listingCaptor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(listingCaptor.capture());
        Listing saved = listingCaptor.getValue();
        assertThat(saved.getStatus()).isEqualTo(ListingStatus.DRAFT.toDbValue());
        assertThat(saved.getReviewSubmittedAt()).isNull();

        ArgumentCaptor<ListingStatusHistory> historyCaptor = ArgumentCaptor.forClass(ListingStatusHistory.class);
        verify(statusHistoryRepository).save(historyCaptor.capture());
        ListingStatusHistory history = historyCaptor.getValue();
        assertThat(history.getListingId()).isEqualTo(listingId);
        assertThat(history.getFromStatus()).isEqualTo(ListingStatus.PENDING_REVIEW.toDbValue());
        assertThat(history.getToStatus()).isEqualTo(ListingStatus.DRAFT.toDbValue());
        assertThat(history.getActorType()).isEqualTo(ActorType.BROKER);
        assertThat(history.getActorId()).isEqualTo(actorId);
    }

    @Test
    void withdrawListingFromReview_adminAlreadyApproved_throwsSubmissionAlreadyActioned() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setReviewSubmittedAt(java.time.Instant.now().minusSeconds(60));

        when(listingOwnershipGuard.findOwned(listingId, actorId, false)).thenReturn(listing);
        when(statusHistoryRepository.existsAdminActionAfter(any(UUID.class), any(java.time.Instant.class)))
                .thenReturn(true);

        assertThatThrownBy(() -> workflowService.withdrawListingFromReview(listingId, actorId))
                .isInstanceOf(ListingLifecycleException.class)
                .satisfies(ex -> assertThat(((ListingLifecycleException) ex).getCode())
                        .isEqualTo(ListingErrorCode.SUBMISSION_ALREADY_ACTIONED));

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any(ListingStatusHistory.class));
    }

    @Test
    void withdrawListingFromReview_adminAlreadyRejected_throwsSubmissionAlreadyActioned() {
        // Same guard covers both approve and reject — the repository query checks
        // for any terminal action (LIVE or REJECTED) after reviewSubmittedAt
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setReviewSubmittedAt(java.time.Instant.now().minusSeconds(60));

        when(listingOwnershipGuard.findOwned(listingId, actorId, false)).thenReturn(listing);
        when(statusHistoryRepository.existsAdminActionAfter(any(UUID.class), any(java.time.Instant.class)))
                .thenReturn(true); // admin already rejected

        assertThatThrownBy(() -> workflowService.withdrawListingFromReview(listingId, actorId))
                .isInstanceOf(ListingLifecycleException.class)
                .satisfies(ex -> assertThat(((ListingLifecycleException) ex).getCode())
                        .isEqualTo(ListingErrorCode.SUBMISSION_ALREADY_ACTIONED));

        verify(listingRepository, never()).save(any());
    }

    @Test
    void withdrawListingFromReview_notOwner_throwsOwnershipException() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();

        when(listingOwnershipGuard.findOwned(listingId, actorId, false))
                .thenThrow(new ListingOwnershipException(listingId));

        assertThatThrownBy(() -> workflowService.withdrawListingFromReview(listingId, actorId))
                .isInstanceOf(ListingOwnershipException.class);

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any(ListingStatusHistory.class));
    }

    @Test
    void withdrawListingFromReview_wrongStatus_throwsPolicyException() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.LIVE.toDbValue());

        when(listingOwnershipGuard.findOwned(listingId, actorId, false)).thenReturn(listing);

        doThrow(new ListingStatusException("Transition not allowed: from=LIVE to=DRAFT actor=BROKER"))
                .when(policy).validate(ListingStatus.LIVE, ListingStatus.DRAFT, ActorType.BROKER);

        assertThatThrownBy(() -> workflowService.withdrawListingFromReview(listingId, actorId))
                .isInstanceOf(ListingStatusException.class);

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any(ListingStatusHistory.class));
    }

    @Test
    void withdrawListingFromReview_notFound_throwsListingNotFoundException() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();

        when(listingOwnershipGuard.findOwned(listingId, actorId, false))
                .thenThrow(new com.example.realestate.listing.exception.ListingNotFoundException(listingId));

        org.junit.jupiter.api.Assertions.assertThrows(
                com.example.realestate.listing.exception.ListingNotFoundException.class,
                () -> workflowService.withdrawListingFromReview(listingId, actorId));
    }

    @Test
    void withdrawListingFromReview_setsStatusChangedFields() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setReviewSubmittedAt(java.time.Instant.now().minusSeconds(60));

        when(listingOwnershipGuard.findOwned(listingId, actorId, false)).thenReturn(listing);
        when(statusHistoryRepository.existsAdminActionAfter(any(UUID.class), any(java.time.Instant.class)))
                .thenReturn(false);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.withdrawListingFromReview(listingId, actorId);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        Listing saved = captor.getValue();
        assertThat(saved.getStatusChangedAt()).isNotNull();
        assertThat(saved.getStatusChangedByActorType()).isEqualTo(ActorType.BROKER);
        assertThat(saved.getStatusChangedByActorId()).isEqualTo(actorId);
        assertThat(saved.getUpdatedAt()).isNotNull();
    }

    @Test
    void withdrawListingFromReview_nullReviewSubmittedAt_skipsGuardAndSucceeds() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setReviewSubmittedAt(null);

        when(listingOwnershipGuard.findOwned(listingId, actorId, false)).thenReturn(listing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.withdrawListingFromReview(listingId, actorId);

        verify(statusHistoryRepository, never()).existsAdminActionAfter(any(), any());
        verify(listingRepository).save(any());
    }

    // ===== RE-83: getDisplayId() — tested on Listing entity =====

    @Test
    void getDisplayId_1_returnsPROPDash00001() {
        Listing listing = new Listing();
        listing.setListingNumber(1);
        assertThat(listing.getDisplayId()).isEqualTo("PROP-00001");
    }

    @Test
    void getDisplayId_42_returnsPROPDash00042() {
        Listing listing = new Listing();
        listing.setListingNumber(42);
        assertThat(listing.getDisplayId()).isEqualTo("PROP-00042");
    }

    @Test
    void getDisplayId_99999_returnsPROPDash99999() {
        Listing listing = new Listing();
        listing.setListingNumber(99999);
        assertThat(listing.getDisplayId()).isEqualTo("PROP-99999");
    }

    @Test
    void getDisplayId_nullListingNumber_returnsNull() {
        Listing listing = new Listing();
        assertThat(listing.getDisplayId()).isNull();
    }

    // ===== RE-131: returnForEdits — admin returns PENDING_REVIEW listing to DRAFT with note =====

    @Test
    void returnForEdits_happyPath_setsDraftWithNoteAndClearsReviewSubmittedAt() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setReviewSubmittedAt(java.time.Instant.now().minusSeconds(60));

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = workflowService.returnForEdits(listingId, adminId, "Please add more photos");

        verify(policy).validate(ListingStatus.PENDING_REVIEW, ListingStatus.DRAFT, ActorType.ADMIN);

        ArgumentCaptor<Listing> listingCaptor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(listingCaptor.capture());
        Listing saved = listingCaptor.getValue();
        assertThat(saved.getStatus()).isEqualTo(ListingStatus.DRAFT.toDbValue());
        assertThat(saved.getStatusReasonNote()).isEqualTo("Please add more photos");
        assertThat(saved.getReviewSubmittedAt()).isNull();
        // rejectedAt must NOT be set — this is not a rejection
        assertThat(saved.getRejectedAt()).isNull();
    }

    @Test
    void returnForEdits_blankNote_throwsReturnNoteRequired() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        assertThatThrownBy(() -> workflowService.returnForEdits(listingId, adminId, "   "))
                .isInstanceOf(ListingLifecycleException.class)
                .satisfies(ex -> assertThat(((ListingLifecycleException) ex).getCode())
                        .isEqualTo(ListingErrorCode.RETURN_NOTE_REQUIRED));

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    @Test
    void returnForEdits_nullNote_throwsReturnNoteRequired() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        assertThatThrownBy(() -> workflowService.returnForEdits(listingId, adminId, null))
                .isInstanceOf(ListingLifecycleException.class)
                .satisfies(ex -> assertThat(((ListingLifecycleException) ex).getCode())
                        .isEqualTo(ListingErrorCode.RETURN_NOTE_REQUIRED));

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    @Test
    void returnForEdits_notPendingReview_throwsPolicyException() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.LIVE.toDbValue());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        doThrow(new ListingStatusException("Transition not allowed: from=LIVE to=DRAFT actor=ADMIN"))
                .when(policy).validate(ListingStatus.LIVE, ListingStatus.DRAFT, ActorType.ADMIN);

        assertThatThrownBy(() -> workflowService.returnForEdits(listingId, adminId, "Fix photos"))
                .isInstanceOf(ListingStatusException.class);

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    @Test
    void returnForEdits_notFound_throwsListingNotFoundException() {
        UUID listingId = UUID.randomUUID();

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.empty());

        org.junit.jupiter.api.Assertions.assertThrows(
                com.example.realestate.listing.exception.ListingNotFoundException.class,
                () -> workflowService.returnForEdits(listingId, UUID.randomUUID(), "Fix photos"));
    }

    @Test
    void returnForEdits_writesHistoryRowWithNote() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setReviewSubmittedAt(java.time.Instant.now());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.returnForEdits(listingId, adminId, "Address is unclear");

        ArgumentCaptor<ListingStatusHistory> historyCaptor = ArgumentCaptor.forClass(ListingStatusHistory.class);
        verify(statusHistoryRepository).save(historyCaptor.capture());
        ListingStatusHistory history = historyCaptor.getValue();

        assertThat(history.getListingId()).isEqualTo(listingId);
        assertThat(history.getFromStatus()).isEqualTo(ListingStatus.PENDING_REVIEW.toDbValue());
        assertThat(history.getToStatus()).isEqualTo(ListingStatus.DRAFT.toDbValue());
        assertThat(history.getActorType()).isEqualTo(ActorType.ADMIN);
        assertThat(history.getActorId()).isEqualTo(adminId);
        assertThat(history.getNote()).isEqualTo("Address is unclear");
    }

    @Test
    void returnForEdits_setsStatusChangedFieldsAndClearsReviewSubmittedAt() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setReviewSubmittedAt(java.time.Instant.now().minusSeconds(120));

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.returnForEdits(listingId, adminId, "Need better description");

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        Listing saved = captor.getValue();
        assertThat(saved.getStatusChangedAt()).isNotNull();
        assertThat(saved.getStatusChangedByActorType()).isEqualTo(ActorType.ADMIN);
        assertThat(saved.getStatusChangedByActorId()).isEqualTo(adminId);
        assertThat(saved.getUpdatedAt()).isNotNull();
        assertThat(saved.getStatusReasonNote()).isEqualTo("Need better description");
        assertThat(saved.getReviewSubmittedAt()).isNull();
    }

    // ===== RE-132: claimScrapedListing — admin claims scraped listing with owner assignment =====

    @Test
    void claimScrapedListing_happyPath_setsDraftAndAssignsOwner() {
        UUID listingId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.SCRAPED.toDbValue());
        // createdBy is null — SCRAPED listing has no owner

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = workflowService.claimScrapedListing(listingId, ownerId, adminId);

        verify(policy).validate(ListingStatus.SCRAPED, ListingStatus.DRAFT, ActorType.ADMIN);

        ArgumentCaptor<Listing> listingCaptor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(listingCaptor.capture());
        Listing saved = listingCaptor.getValue();
        assertThat(saved.getStatus()).isEqualTo(ListingStatus.DRAFT.toDbValue());
        assertThat(saved.getCreatedBy()).isEqualTo(ownerId);
        assertThat(saved.getStatusChangedAt()).isNotNull();
        assertThat(saved.getStatusChangedByActorType()).isEqualTo(ActorType.ADMIN);
        assertThat(saved.getStatusChangedByActorId()).isEqualTo(adminId);
        assertThat(saved.getUpdatedAt()).isNotNull();
    }

    @Test
    void claimScrapedListing_alreadyClaimed_throwsAlreadyClaimed() {
        UUID listingId = UUID.randomUUID();
        UUID existingOwnerId = UUID.randomUUID();
        UUID newOwnerId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.SCRAPED.toDbValue());
        listing.setCreatedBy(existingOwnerId); // already has an owner

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        assertThatThrownBy(() -> workflowService.claimScrapedListing(listingId, newOwnerId, adminId))
                .isInstanceOf(ListingLifecycleException.class)
                .satisfies(ex -> assertThat(((ListingLifecycleException) ex).getCode())
                        .isEqualTo(ListingErrorCode.ALREADY_CLAIMED));

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    @Test
    void claimScrapedListing_wrongStatus_throwsPolicyException() {
        UUID listingId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.DRAFT.toDbValue());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        doThrow(new ListingStatusException("Transition not allowed: from=DRAFT to=DRAFT actor=ADMIN"))
                .when(policy).validate(ListingStatus.DRAFT, ListingStatus.DRAFT, ActorType.ADMIN);

        assertThatThrownBy(() -> workflowService.claimScrapedListing(listingId, ownerId, adminId))
                .isInstanceOf(ListingStatusException.class);

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    @Test
    void claimScrapedListing_notFound_throwsListingNotFoundException() {
        UUID listingId = UUID.randomUUID();

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.empty());

        org.junit.jupiter.api.Assertions.assertThrows(
                com.example.realestate.listing.exception.ListingNotFoundException.class,
                () -> workflowService.claimScrapedListing(listingId, UUID.randomUUID(), UUID.randomUUID()));
    }

    @Test
    void claimScrapedListing_nullOwnerId_throws() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        assertThatThrownBy(() -> workflowService.claimScrapedListing(listingId, null, adminId))
                .isInstanceOf(NullPointerException.class)
                .hasMessageContaining("ownerId must not be null");

        verify(listingRepository, never()).findById(any());
        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    @Test
    void claimScrapedListing_writesHistoryRow() {
        UUID listingId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.SCRAPED.toDbValue());
        // createdBy is null

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.claimScrapedListing(listingId, ownerId, adminId);

        ArgumentCaptor<ListingStatusHistory> historyCaptor = ArgumentCaptor.forClass(ListingStatusHistory.class);
        verify(statusHistoryRepository).save(historyCaptor.capture());
        ListingStatusHistory history = historyCaptor.getValue();

        assertThat(history.getListingId()).isEqualTo(listingId);
        assertThat(history.getFromStatus()).isEqualTo(ListingStatus.SCRAPED.toDbValue());
        assertThat(history.getToStatus()).isEqualTo(ListingStatus.DRAFT.toDbValue());
        assertThat(history.getActorType()).isEqualTo(ActorType.ADMIN);
        assertThat(history.getActorId()).isEqualTo(adminId);
    }

    // ===== RE-132: approveScrapedListing — admin approves scraped listing directly to LIVE =====

    private Listing createCompleteListing(UUID listingId, UUID ownerId) {
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.SCRAPED.toDbValue());
        listing.setCreatedBy(ownerId);
        listing.setPropertyType("house");
        listing.setLocality("Udupi");
        listing.setAddressConfirmed(true);
        listing.setPrice(BigDecimal.valueOf(1000000));
        listing.setTitle("Test Property");
        return listing;
    }

    @Test
    void approveScrapedListing_happyPath_setsLiveWithAllTimestamps() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();

        Listing listing = createCompleteListing(listingId, ownerId);

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = workflowService.approveScrapedListing(listingId, adminId);

        verify(policy).validate(ListingStatus.SCRAPED, ListingStatus.LIVE, ActorType.ADMIN);

        ArgumentCaptor<Listing> listingCaptor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(listingCaptor.capture());
        Listing saved = listingCaptor.getValue();
        assertThat(saved.getStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());
        assertThat(saved.getReviewedAt()).isNotNull();
        assertThat(saved.getReviewedBy()).isEqualTo(adminId);
        assertThat(saved.getApprovedAt()).isNotNull();
        assertThat(saved.getFirstPublishedAt()).isNotNull();
        assertThat(saved.getLastLiveAt()).isNotNull();
        assertThat(saved.getStatusChangedAt()).isNotNull();
        assertThat(saved.getStatusChangedByActorType()).isEqualTo(ActorType.ADMIN);
        assertThat(saved.getStatusChangedByActorId()).isEqualTo(adminId);
        assertThat(saved.getUpdatedAt()).isNotNull();
        // #1794 Phase 1: lastConfirmedAt is set on every LIVE transition, incl. approveScrapedListing
        assertThat(saved.getLastConfirmedAt()).isNotNull();
        assertThat(saved.getLastConfirmedAt()).isEqualTo(saved.getLastLiveAt());
    }

    @Test
    void approveScrapedListing_notClaimed_throwsListingNotClaimed() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.SCRAPED.toDbValue());
        // createdBy is null — not claimed

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        assertThatThrownBy(() -> workflowService.approveScrapedListing(listingId, adminId))
                .isInstanceOf(ListingLifecycleException.class)
                .satisfies(ex -> assertThat(((ListingLifecycleException) ex).getCode())
                        .isEqualTo(ListingErrorCode.LISTING_NOT_CLAIMED));

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    @Test
    void approveScrapedListing_incompleteListing_throwsListingIncomplete() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.SCRAPED.toDbValue());
        listing.setCreatedBy(ownerId);
        // Missing required fields: property_type is "other" (not submittable), no locality, etc.

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        assertThatThrownBy(() -> workflowService.approveScrapedListing(listingId, adminId))
                .isInstanceOf(ListingLifecycleException.class)
                .satisfies(ex -> assertThat(((ListingLifecycleException) ex).getCode())
                        .isEqualTo(ListingErrorCode.LISTING_INCOMPLETE));

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    // ===== #1368: agricultural_land submit-gate (mirror of ListingTransitionPolicy) =====
    // policy is mocked here, so these exercise ListingWorkflowService's OWN
    // validateForSubmission (the mirror file under test) via approveScrapedListing.

    @Test
    void approveScrapedListing_completeAgriculturalLand_succeeds() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();

        Listing listing = createCompleteListing(listingId, ownerId);
        listing.setPropertyType("agricultural_land");
        listing.setLandArea(BigDecimal.valueOf(5));
        listing.setLandAreaUnit("acre");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = workflowService.approveScrapedListing(listingId, adminId);

        assertThat(result.getStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());
    }

    @Test
    void approveScrapedListing_agriculturalLandMissingLandArea_throwsListingIncomplete() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();

        Listing listing = createCompleteListing(listingId, ownerId);
        listing.setPropertyType("agricultural_land");
        // landArea + landAreaUnit deliberately omitted

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        assertThatThrownBy(() -> workflowService.approveScrapedListing(listingId, adminId))
                .isInstanceOf(ListingLifecycleException.class)
                .satisfies(ex -> assertThat(((ListingLifecycleException) ex).getCode())
                        .isEqualTo(ListingErrorCode.LISTING_INCOMPLETE));

        verify(listingRepository, never()).save(any());
    }

    @Test
    void approveScrapedListing_priorType_house_stillSubmittable() {
        // Guard against accidental replacement of the SUBMITTABLE set: a prior
        // type (house) must still approve through the same code path.
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();

        Listing listing = createCompleteListing(listingId, ownerId); // house
        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = workflowService.approveScrapedListing(listingId, adminId);

        assertThat(result.getStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());
    }

    @Test
    void approveScrapedListing_priorType_land_stillSubmittable() {
        // land is a prior submittable type with the same land-area rule agri now mirrors.
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();

        Listing listing = createCompleteListing(listingId, ownerId);
        listing.setPropertyType("land");
        listing.setLandArea(BigDecimal.valueOf(5));
        listing.setLandAreaUnit("acre");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = workflowService.approveScrapedListing(listingId, adminId);

        assertThat(result.getStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());
    }

    @Test
    void approveScrapedListing_wrongStatus_throwsPolicyException() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.DRAFT.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        doThrow(new ListingStatusException("Transition not allowed: from=DRAFT to=LIVE actor=ADMIN"))
                .when(policy).validate(ListingStatus.DRAFT, ListingStatus.LIVE, ActorType.ADMIN);

        assertThatThrownBy(() -> workflowService.approveScrapedListing(listingId, adminId))
                .isInstanceOf(ListingStatusException.class);

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    @Test
    void approveScrapedListing_preservesFirstPublishedAtIfAlreadySet() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();

        Listing listing = createCompleteListing(listingId, ownerId);
        java.time.OffsetDateTime originalFirstPublished = java.time.OffsetDateTime.now().minusDays(30);
        listing.setFirstPublishedAt(originalFirstPublished);

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.approveScrapedListing(listingId, adminId);

        ArgumentCaptor<Listing> listingCaptor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(listingCaptor.capture());
        Listing saved = listingCaptor.getValue();

        // firstPublishedAt must NOT be overwritten
        assertThat(saved.getFirstPublishedAt()).isEqualTo(originalFirstPublished);
        // lastLiveAt must be updated
        assertThat(saved.getLastLiveAt()).isNotNull();
        assertThat(saved.getLastLiveAt()).isAfter(originalFirstPublished);
    }

    // ===== RE-186: approveScrapedListing bypasses image minimum =====

    @Test
    void approveScrapedListing_oneImage_succeeds() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();

        Listing listing = createCompleteListing(listingId, ownerId);

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        // countImagesByListingId deliberately NOT stubbed — must never be called on the scraped path.

        Listing result = workflowService.approveScrapedListing(listingId, adminId);

        assertThat(result.getStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());
        verify(listingRepository, never()).countImagesByListingId(any());
    }

    @Test
    void approveScrapedListing_zeroImages_succeeds() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();

        Listing listing = createCompleteListing(listingId, ownerId);

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        // countImagesByListingId deliberately NOT stubbed — must never be called.

        Listing result = workflowService.approveScrapedListing(listingId, adminId);

        assertThat(result.getStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());
        verify(listingRepository, never()).countImagesByListingId(any());
    }

    @Test
    void submitListing_fewerThanThreeImages_throwsValidationException() {
        UUID listingId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();
        Listing listing = createSubmittableListing(listingId, userId, ListingStatus.DRAFT.toDbValue());

        when(listingOwnershipGuard.findOwned(listingId, userId, false)).thenReturn(listing);
        // guardCompleteness now owns image-count validation; stub the mock to throw (real behaviour tested in ListingTransitionPolicyTest)
        doThrow(new ListingValidationException(List.of(Map.of("field", "images",
                "message", "At least 3 images required (found 2)"))))
                .when(policy).guardCompleteness(listing);

        assertThatThrownBy(() -> workflowService.submitListing(listingId, userId, false))
                .isInstanceOf(ListingValidationException.class);

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    // ===== RE-133: restoreRejectedListing — admin restores REJECTED→LIVE with moderation note =====

    @Test
    void restoreRejectedListing_happyPath_setsLiveWithAllTimestamps() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.REJECTED.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setTitle("Test");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = workflowService.restoreRejectedListing(listingId, adminId, "Admin override: listing is valid");

        verify(policy).validate(ListingStatus.REJECTED, ListingStatus.LIVE, ActorType.ADMIN);

        ArgumentCaptor<Listing> listingCaptor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(listingCaptor.capture());
        Listing saved = listingCaptor.getValue();
        assertThat(saved.getStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());
        assertThat(saved.getApprovedAt()).isNotNull();
        assertThat(saved.getLastLiveAt()).isNotNull();
        assertThat(saved.getFirstPublishedAt()).isNotNull();
        assertThat(saved.getStatusReasonNote()).isEqualTo("Admin override: listing is valid");
        assertThat(saved.getReviewedAt()).isNotNull();
        assertThat(saved.getReviewedBy()).isEqualTo(adminId);
        assertThat(saved.getStatusChangedAt()).isNotNull();
        assertThat(saved.getStatusChangedByActorType()).isEqualTo(ActorType.ADMIN);
        assertThat(saved.getStatusChangedByActorId()).isEqualTo(adminId);
        assertThat(saved.getUpdatedAt()).isNotNull();
        // #1794 Phase 1: lastConfirmedAt is set on every LIVE transition, incl. restoreRejectedListing
        assertThat(saved.getLastConfirmedAt()).isNotNull();
        assertThat(saved.getLastConfirmedAt()).isEqualTo(saved.getLastLiveAt());
    }

    @Test
    void restoreRejectedListing_blankNote_throwsModerationNoteRequired() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.REJECTED.toDbValue());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        assertThatThrownBy(() -> workflowService.restoreRejectedListing(listingId, adminId, "   "))
                .isInstanceOf(ListingLifecycleException.class)
                .satisfies(ex -> assertThat(((ListingLifecycleException) ex).getCode())
                        .isEqualTo(ListingErrorCode.MODERATION_NOTE_REQUIRED));

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    @Test
    void restoreRejectedListing_nullNote_throwsModerationNoteRequired() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.REJECTED.toDbValue());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        assertThatThrownBy(() -> workflowService.restoreRejectedListing(listingId, adminId, null))
                .isInstanceOf(ListingLifecycleException.class)
                .satisfies(ex -> assertThat(((ListingLifecycleException) ex).getCode())
                        .isEqualTo(ListingErrorCode.MODERATION_NOTE_REQUIRED));

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    @Test
    void restoreRejectedListing_wrongStatus_throwsListingStatusException_policyNeverCalled() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.DRAFT.toDbValue());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        assertThatThrownBy(() -> workflowService.restoreRejectedListing(listingId, adminId, "Some note"))
                .isInstanceOf(ListingStatusException.class)
                .hasMessageContaining("restoreRejectedListing requires REJECTED status, found DRAFT");

        // The key assertion: policy.validate must NEVER be called because
        // DRAFT→LIVE is allowed by policy for ADMIN, but the explicit guard catches it
        verify(policy, never()).validate(any(), any(), any());
        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    @Test
    void restoreRejectedListing_notFound_throwsListingNotFoundException() {
        UUID listingId = UUID.randomUUID();

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.empty());

        org.junit.jupiter.api.Assertions.assertThrows(
                com.example.realestate.listing.exception.ListingNotFoundException.class,
                () -> workflowService.restoreRejectedListing(listingId, UUID.randomUUID(), "Some note"));
    }

    @Test
    void restoreRejectedListing_writesHistoryRowWithNote() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.REJECTED.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setTitle("Test");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.restoreRejectedListing(listingId, adminId, "Restored after appeal");

        ArgumentCaptor<ListingStatusHistory> historyCaptor = ArgumentCaptor.forClass(ListingStatusHistory.class);
        verify(statusHistoryRepository).save(historyCaptor.capture());
        ListingStatusHistory history = historyCaptor.getValue();

        assertThat(history.getListingId()).isEqualTo(listingId);
        assertThat(history.getFromStatus()).isEqualTo(ListingStatus.REJECTED.toDbValue());
        assertThat(history.getToStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());
        assertThat(history.getActorType()).isEqualTo(ActorType.ADMIN);
        assertThat(history.getActorId()).isEqualTo(adminId);
        assertThat(history.getNote()).isEqualTo("Restored after appeal");
    }

    @Test
    void restoreRejectedListing_preservesFirstPublishedAtIfAlreadySet() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.REJECTED.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setTitle("Test");
        java.time.OffsetDateTime originalFirstPublished = java.time.OffsetDateTime.now().minusDays(30);
        listing.setFirstPublishedAt(originalFirstPublished);

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.restoreRejectedListing(listingId, adminId, "Restored after review");

        ArgumentCaptor<Listing> listingCaptor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(listingCaptor.capture());
        Listing saved = listingCaptor.getValue();

        // firstPublishedAt must NOT be overwritten (write-once)
        assertThat(saved.getFirstPublishedAt()).isEqualTo(originalFirstPublished);
        // lastLiveAt must be updated
        assertThat(saved.getLastLiveAt()).isNotNull();
        assertThat(saved.getLastLiveAt()).isAfter(originalFirstPublished);
    }

    @Test
    void restoreRejectedListing_setsReviewedAtAndReviewedBy() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.REJECTED.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setTitle("Test");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.restoreRejectedListing(listingId, adminId, "Admin override");

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        Listing saved = captor.getValue();

        assertThat(saved.getReviewedAt()).isNotNull();
        assertThat(saved.getReviewedBy()).isEqualTo(adminId);
    }

    @Test
    void restoreRejectedListing_noEventsPublished() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.REJECTED.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setTitle("Test");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.restoreRejectedListing(listingId, adminId, "Admin override");

        // No events must be published — this is an exceptional admin override
        verify(applicationEventPublisher, never()).publishEvent(any());
    }

    // ===== RE-185: approveScrapedListing — event publishing and duplicate detection =====

    @Test
    void approveScrapedListing_publishesBothEvents() {
        UUID listingId = UUID.randomUUID();
        UUID adminId   = UUID.randomUUID();
        UUID ownerId   = UUID.randomUUID();

        Listing listing = createCompleteListing(listingId, ownerId);
        listing.setAreaKey("udupi-city");
        listing.setAreaLabel("Udupi City");
        listing.setPricePaise(100_000_00L);

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.approveScrapedListing(listingId, adminId);

        // Proximity duplicate detection must have been attempted on the saved (LIVE) listing
        verify(proximityDuplicateService).detectAndRecord(
                argThat(l -> ListingStatus.LIVE.toDbValue().equals(l.getStatus())));

        // ListingApprovedEvent must be published for the owner
        ArgumentCaptor<Object> eventCaptor = ArgumentCaptor.forClass(Object.class);
        verify(applicationEventPublisher, org.mockito.Mockito.times(2)).publishEvent(eventCaptor.capture());

        java.util.List<Object> events = eventCaptor.getAllValues();
        assertThat(events).anyMatch(e -> e instanceof ListingApprovedEvent lae
                && lae.ownerId().equals(ownerId));
        assertThat(events).anyMatch(e -> e instanceof NewListingInAreaEvent nae
                && "udupi-city".equals(nae.areaKey()));
    }

    @Test
    void approveScrapedListing_detectionFailure_doesNotRollback() {
        UUID listingId = UUID.randomUUID();
        UUID adminId   = UUID.randomUUID();
        UUID ownerId   = UUID.randomUUID();

        Listing listing = createCompleteListing(listingId, ownerId);
        listing.setAreaKey("udupi-city");
        listing.setAreaLabel("Udupi City");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Simulate detection throwing — must not propagate
        doThrow(new RuntimeException("Detection DB error"))
                .when(proximityDuplicateService).detectAndRecord(any(Listing.class));

        // approveScrapedListing must still succeed
        Listing result = workflowService.approveScrapedListing(listingId, adminId);

        assertThat(result.getStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());

        // Listing must have been persisted
        verify(listingRepository).save(any(Listing.class));

        // Events must still have been published despite the detection failure
        verify(applicationEventPublisher, org.mockito.Mockito.atLeastOnce())
                .publishEvent(any(ListingApprovedEvent.class));
    }

    // ===== RE-140: buildSnapshot — last_approved_snapshot captured on approval =====

    @Test
    void buildSnapshot_allSixteenFieldsPresent() throws Exception {
        UUID listingId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();
        UUID imageId1 = UUID.randomUUID();
        UUID imageId2 = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setCreatedBy(ownerId);
        listing.setTitle("Beachside Villa");
        listing.setDescription("A beautiful villa");
        listing.setPricePaise(50_000_00L);
        listing.setSellerType("broker");
        listing.setLocality("Udupi Beach");
        listing.setLatitude(13.3409);
        listing.setLongitude(74.7421);
        listing.setAreaKey("udupi-beach");
        listing.setAreaLabel("Udupi Beach");
        listing.setAreaSqft(BigDecimal.valueOf(1200));
        listing.setBedrooms(3);
        listing.setBathrooms(2);
        listing.setLandArea(BigDecimal.valueOf(500));
        listing.setPropertyType("house");
        listing.setVideoUrl("https://example.com/video.mp4");

        ListingImage img1 = new ListingImage();
        img1.setId(imageId1);
        img1.setPosition(0);
        ListingImage img2 = new ListingImage();
        img2.setId(imageId2);
        img2.setPosition(1);
        when(imageRepository.findByListingIdOrderByPositionAsc(listingId))
                .thenReturn(List.of(img1, img2));
        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.approveListing(listingId, UUID.randomUUID());

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        String snapshotJson = captor.getValue().getLastApprovedSnapshot();
        assertThat(snapshotJson).isNotNull();

        @SuppressWarnings("unchecked")
        Map<String, Object> parsed = objectMapper.readValue(snapshotJson, Map.class);
        assertThat(parsed).containsKeys(
                "title", "description", "pricePaise", "sellerType", "locality",
                "latitude", "longitude", "areaKey", "areaLabel", "areaSqft",
                "bedrooms", "bathrooms", "landArea", "propertyType", "videoUrl", "imageIds");
        assertThat(parsed.get("title")).isEqualTo("Beachside Villa");
        assertThat(parsed.get("imageIds")).isInstanceOf(List.class);
        @SuppressWarnings("unchecked")
        List<String> ids = (List<String>) parsed.get("imageIds");
        assertThat(ids).containsExactly(imageId1.toString(), imageId2.toString());
    }

    @Test
    void buildSnapshot_nullFieldsSerializeAsJsonNull_notMissingKey() throws Exception {
        UUID listingId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setTitle(null);
        listing.setDescription(null);
        listing.setPricePaise(null);
        listing.setVideoUrl(null);
        listing.setAreaKey(null);
        listing.setPropertyType("house");

        when(imageRepository.findByListingIdOrderByPositionAsc(listingId))
                .thenReturn(List.of());
        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.approveListing(listingId, UUID.randomUUID());

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        String snapshotJson = captor.getValue().getLastApprovedSnapshot();

        // All 16 keys must be present — null fields become JSON null, not absent
        @SuppressWarnings("unchecked")
        Map<String, Object> parsed = objectMapper.readValue(snapshotJson, Map.class);
        assertThat(parsed).containsKeys(
                "title", "description", "pricePaise", "sellerType", "locality",
                "latitude", "longitude", "areaKey", "areaLabel", "areaSqft",
                "bedrooms", "bathrooms", "landArea", "propertyType", "videoUrl", "imageIds");
        // Null fields serialize as JSON null (key present, value null)
        assertThat(parsed.get("title")).isNull();
        assertThat(parsed.get("description")).isNull();
        assertThat(parsed.get("pricePaise")).isNull();
        assertThat(parsed.get("videoUrl")).isNull();
        assertThat(parsed.get("areaKey")).isNull();
    }

    @Test
    void buildSnapshot_emptyImageList_serializesAsEmptyArray() throws Exception {
        UUID listingId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setPropertyType("house");

        when(imageRepository.findByListingIdOrderByPositionAsc(listingId))
                .thenReturn(List.of());
        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.approveListing(listingId, UUID.randomUUID());

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        String snapshotJson = captor.getValue().getLastApprovedSnapshot();
        assertThat(snapshotJson).contains("\"imageIds\":[]");
    }

    @Test
    void approveListing_snapshotWrittenBeforeSave() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setPropertyType("house");
        listing.setTitle("Some Property");

        when(imageRepository.findByListingIdOrderByPositionAsc(listingId))
                .thenReturn(List.of());
        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = workflowService.approveListing(listingId, adminId);

        // Snapshot must be populated on the entity passed to save
        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        assertThat(captor.getValue().getLastApprovedSnapshot()).isNotNull();
        // The returned listing must also carry the snapshot
        assertThat(result.getLastApprovedSnapshot()).isNotNull();
    }

    @Test
    void restoreRejectedListing_snapshotWrittenBeforeSave() throws Exception {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.REJECTED.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setPropertyType("house");

        when(imageRepository.findByListingIdOrderByPositionAsc(listingId))
                .thenReturn(List.of());
        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = workflowService.restoreRejectedListing(listingId, adminId, "Valid listing");

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        String snapshotJson = captor.getValue().getLastApprovedSnapshot();
        assertThat(snapshotJson).isNotNull();
        assertThat(result.getLastApprovedSnapshot()).isNotNull();
        @SuppressWarnings("unchecked")
        Map<String, Object> parsed = objectMapper.readValue(snapshotJson, Map.class);
        assertThat(parsed).containsKeys(
                "title", "description", "pricePaise", "sellerType", "locality",
                "latitude", "longitude", "areaKey", "areaLabel", "areaSqft",
                "bedrooms", "bathrooms", "landArea", "propertyType", "videoUrl", "imageIds");
    }

    @Test
    void approveScrapedListing_snapshotWrittenBeforeSave() throws Exception {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        UUID ownerId = UUID.randomUUID();

        Listing listing = createCompleteListing(listingId, ownerId);

        when(imageRepository.findByListingIdOrderByPositionAsc(listingId))
                .thenReturn(List.of());
        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Listing result = workflowService.approveScrapedListing(listingId, adminId);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        String snapshotJson = captor.getValue().getLastApprovedSnapshot();
        assertThat(snapshotJson).isNotNull();
        assertThat(result.getLastApprovedSnapshot()).isNotNull();
        @SuppressWarnings("unchecked")
        Map<String, Object> parsed = objectMapper.readValue(snapshotJson, Map.class);
        assertThat(parsed).containsKeys(
                "title", "description", "pricePaise", "sellerType", "locality",
                "latitude", "longitude", "areaKey", "areaLabel", "areaSqft",
                "bedrooms", "bathrooms", "landArea", "propertyType", "videoUrl", "imageIds");
    }

    // ===== RE-139: BookingCascadeService wired into workflow transitions =====

    @Test
    void archiveListing_cascadeEnabled_cancelsPendingAndFreezesConfirmed() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.LIVE.toDbValue());

        when(listingOwnershipGuard.findOwned(listingId, actorId, false)).thenReturn(listing);
        when(listingRepository.saveAndFlush(any())).thenReturn(listing);

        workflowServiceCascadeEnabled().archiveListing(listingId, actorId, null);

        verify(bookingCascadeService).cancelPendingBookings(listingId, "LISTING_ARCHIVED");
        verify(bookingCascadeService).freezeConfirmedBookings(listingId, "LISTING_ARCHIVED");
    }

    @Test
    void archiveListing_cascadeDisabled_noCascade() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.LIVE.toDbValue());

        when(listingOwnershipGuard.findOwned(listingId, actorId, false)).thenReturn(listing);
        when(listingRepository.saveAndFlush(any())).thenReturn(listing);

        workflowService.archiveListing(listingId, actorId, null);

        verify(bookingCascadeService, never()).cancelPendingBookings(any(), any());
        verify(bookingCascadeService, never()).freezeConfirmedBookings(any(), any());
    }

    @Test
    void rejectListing_cascadeEnabled_fromLive_cascadesBookings() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setCreatedBy(UUID.randomUUID());
        listing.setTitle("Test");
        listing.setStatus(ListingStatus.LIVE.toDbValue());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.saveAndFlush(any())).thenReturn(listing);

        workflowServiceCascadeEnabled().rejectListing(listingId, adminId, "Reason");

        verify(bookingCascadeService).cancelPendingBookings(listingId, "LISTING_REJECTED");
        verify(bookingCascadeService).freezeConfirmedBookings(listingId, "LISTING_REJECTED");
    }

    @Test
    void rejectListing_cascadeEnabled_fromPendingReview_noCascade() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setCreatedBy(UUID.randomUUID());
        listing.setTitle("Test");
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.saveAndFlush(any())).thenReturn(listing);

        workflowServiceCascadeEnabled().rejectListing(listingId, adminId, "Reason");

        verify(bookingCascadeService, never()).cancelPendingBookings(any(), any());
        verify(bookingCascadeService, never()).freezeConfirmedBookings(any(), any());
    }

    @Test
    void restoreArchivedListing_cascadeEnabled_unfreezesBookings() throws Exception {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.ARCHIVED.toDbValue());
        listing.setFirstPublishedAt(java.time.OffsetDateTime.now().minusDays(30));
        listing.setLastApprovedSnapshot(buildSnapshotJson(listing, List.of()));
        // imageRepository stub removed — guardFastRestore is mocked; image fetch is now in the policy

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenReturn(listing);

        workflowServiceCascadeEnabled().restoreArchivedListing(listingId, actorId);

        verify(bookingCascadeService).unfreezeBookings(listingId);
    }

    @Test
    void restoreRejectedListing_cascadeEnabled_unfreezesBookings() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.REJECTED.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setTitle("Test");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenReturn(listing);

        workflowServiceCascadeEnabled().restoreRejectedListing(listingId, adminId, "Admin override");

        verify(bookingCascadeService).unfreezeBookings(listingId);
    }

    @Test
    void restoreArchivedListing_cascadeDisabled_noUnfreeze() throws Exception {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.ARCHIVED.toDbValue());
        listing.setFirstPublishedAt(java.time.OffsetDateTime.now().minusDays(30));
        listing.setLastApprovedSnapshot(buildSnapshotJson(listing, List.of()));
        // imageRepository stub removed — guardFastRestore is mocked; image fetch is now in the policy

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenReturn(listing);

        workflowService.restoreArchivedListing(listingId, actorId);

        verify(bookingCascadeService, never()).unfreezeBookings(any());
    }

    @Test
    void restoreRejectedListing_cascadeDisabled_noUnfreeze() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.REJECTED.toDbValue());
        listing.setCreatedBy(UUID.randomUUID());
        listing.setTitle("Test");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenReturn(listing);

        workflowService.restoreRejectedListing(listingId, adminId, "Admin override");

        verify(bookingCascadeService, never()).unfreezeBookings(any());
    }

    @Test
    void archiveListing_cascadeEnabled_fromDraft_cancelsPendingAndFreezesConfirmed() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.DRAFT.toDbValue());

        when(listingOwnershipGuard.findOwned(listingId, actorId, false)).thenReturn(listing);
        when(listingRepository.saveAndFlush(any())).thenReturn(listing);

        workflowServiceCascadeEnabled().archiveListing(listingId, actorId, null);

        verify(bookingCascadeService).cancelPendingBookings(listingId, "LISTING_ARCHIVED");
        verify(bookingCascadeService).freezeConfirmedBookings(listingId, "LISTING_ARCHIVED");
    }

    // ===== RE-141: snapshot eligibility guard for restoreArchivedListing =====

    @Test
    void restoreArchivedListing_snapshotMatches_proceedsToLive() throws Exception {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        UUID imageId1 = UUID.randomUUID();
        UUID imageId2 = UUID.randomUUID();
        List<UUID> imageIds = List.of(imageId1, imageId2);

        Listing listing = archivedListingWithMatchingSnapshot(listingId, actorId, imageIds);
        // imageRepository stub removed — guardFastRestore is mocked; image fetch is now in the policy

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.restoreArchivedListing(listingId, actorId);

        verify(listingRepository).save(any());
    }

    @Test
    void restoreArchivedListing_snapshotNull_throws422() throws Exception {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();

        Listing listing = archivedListingWithMatchingSnapshot(listingId, actorId, List.of());
        listing.setLastApprovedSnapshot(null); // override to null

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        // guardFastRestore now owns eligibility; stub the mock to throw (real behaviour tested in ListingTransitionPolicyTest)
        doThrow(new ListingLifecycleException(ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE,
                "No approved snapshot on record — fast restore requires a prior approved snapshot"))
                .when(policy).guardFastRestore(listing);

        assertThatThrownBy(() -> workflowService.restoreArchivedListing(listingId, actorId))
                .isInstanceOf(ListingLifecycleException.class)
                .satisfies(ex -> assertThat(((ListingLifecycleException) ex).getCode())
                        .isEqualTo(ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE));

        verify(listingRepository, never()).save(any());
    }

    @Test
    void restoreArchivedListing_titleChanged_throws422WithFieldDiff() throws Exception {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();

        Listing listing = archivedListingWithMatchingSnapshot(listingId, actorId, List.of());
        listing.setTitle("Changed Title");

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        // guardFastRestore now owns eligibility; stub the mock to throw with the expected field diff
        doThrow(new ListingLifecycleException(ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE,
                "Listing has material changes since last approval — use submit-for-review instead",
                List.of("title")))
                .when(policy).guardFastRestore(listing);

        assertThatThrownBy(() -> workflowService.restoreArchivedListing(listingId, actorId))
                .isInstanceOf(ListingLifecycleException.class)
                .satisfies(ex -> {
                    ListingLifecycleException life = (ListingLifecycleException) ex;
                    assertThat(life.getCode()).isEqualTo(ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE);
                    assertThat(life.getChangedFields()).contains("title");
                });

        verify(listingRepository, never()).save(any());
    }

    @Test
    void restoreArchivedListing_priceChanged_throws422WithFieldDiff() throws Exception {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();

        Listing listing = archivedListingWithMatchingSnapshot(listingId, actorId, List.of());
        listing.setPricePaise(99_999_00L);

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        // guardFastRestore now owns eligibility; stub the mock to throw with the expected field diff
        doThrow(new ListingLifecycleException(ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE,
                "Listing has material changes since last approval — use submit-for-review instead",
                List.of("pricePaise")))
                .when(policy).guardFastRestore(listing);

        assertThatThrownBy(() -> workflowService.restoreArchivedListing(listingId, actorId))
                .isInstanceOf(ListingLifecycleException.class)
                .satisfies(ex -> {
                    ListingLifecycleException life = (ListingLifecycleException) ex;
                    assertThat(life.getCode()).isEqualTo(ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE);
                    assertThat(life.getChangedFields()).contains("pricePaise");
                });

        verify(listingRepository, never()).save(any());
    }

    @Test
    void restoreArchivedListing_imageAdded_throws422WithFieldDiff() throws Exception {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        UUID imageId1 = UUID.randomUUID();
        UUID imageId2 = UUID.randomUUID();
        UUID imageId3 = UUID.randomUUID();

        // Snapshot has 2 images; listing now has 3
        Listing listing = archivedListingWithMatchingSnapshot(listingId, actorId,
                List.of(imageId1, imageId2));

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        // guardFastRestore now owns eligibility; stub the mock to throw with the expected field diff
        doThrow(new ListingLifecycleException(ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE,
                "Listing has material changes since last approval — use submit-for-review instead",
                List.of("imageIds")))
                .when(policy).guardFastRestore(listing);

        assertThatThrownBy(() -> workflowService.restoreArchivedListing(listingId, actorId))
                .isInstanceOf(ListingLifecycleException.class)
                .satisfies(ex -> {
                    ListingLifecycleException life = (ListingLifecycleException) ex;
                    assertThat(life.getCode()).isEqualTo(ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE);
                    assertThat(life.getChangedFields()).contains("imageIds");
                });

        verify(listingRepository, never()).save(any());
    }

    @Test
    void restoreArchivedListing_imageRemoved_throws422WithFieldDiff() throws Exception {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        UUID imageId1 = UUID.randomUUID();
        UUID imageId2 = UUID.randomUUID();

        // Snapshot has 2 images; listing now has only 1
        Listing listing = archivedListingWithMatchingSnapshot(listingId, actorId,
                List.of(imageId1, imageId2));

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        // guardFastRestore now owns eligibility; stub the mock to throw with the expected field diff
        doThrow(new ListingLifecycleException(ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE,
                "Listing has material changes since last approval — use submit-for-review instead",
                List.of("imageIds")))
                .when(policy).guardFastRestore(listing);

        assertThatThrownBy(() -> workflowService.restoreArchivedListing(listingId, actorId))
                .isInstanceOf(ListingLifecycleException.class)
                .satisfies(ex -> {
                    ListingLifecycleException life = (ListingLifecycleException) ex;
                    assertThat(life.getCode()).isEqualTo(ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE);
                    assertThat(life.getChangedFields()).contains("imageIds");
                });

        verify(listingRepository, never()).save(any());
    }

    @Test
    void restoreArchivedListing_imageReordered_doesNotBlock() throws Exception {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        UUID imageId1 = UUID.randomUUID();
        UUID imageId2 = UUID.randomUUID();

        // Snapshot has [imageId1, imageId2]; current order is [imageId2, imageId1]
        Listing listing = archivedListingWithMatchingSnapshot(listingId, actorId,
                List.of(imageId1, imageId2));
        // imageRepository stub removed — guardFastRestore is mocked (reorder-tolerance is tested in ListingTransitionPolicyTest)

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Must not throw — guardFastRestore mock is a no-op (passes)
        workflowService.restoreArchivedListing(listingId, actorId);

        verify(listingRepository).save(any());
    }

    // ===== RE-141: test helpers =====

    /**
     * Builds the snapshot JSON string that matches the given listing and image IDs.
     * Mirrors the structure of {@code ListingWorkflowService.buildSnapshotMap}.
     */
    private String buildSnapshotJson(Listing listing, List<UUID> imageIds) throws Exception {
        Map<String, Object> snap = new LinkedHashMap<>();
        snap.put("title", listing.getTitle());
        snap.put("description", listing.getDescription());
        snap.put("pricePaise", listing.getPricePaise());
        snap.put("sellerType", listing.getSellerType());
        snap.put("locality", listing.getLocality());
        snap.put("latitude", listing.getLatitude());
        snap.put("longitude", listing.getLongitude());
        snap.put("areaKey", listing.getAreaKey());
        snap.put("areaLabel", listing.getAreaLabel());
        snap.put("areaSqft", listing.getAreaSqft());
        snap.put("bedrooms", listing.getBedrooms());
        snap.put("bathrooms", listing.getBathrooms());
        snap.put("landArea", listing.getLandArea());
        snap.put("propertyType", listing.getPropertyType());
        snap.put("videoUrl", listing.getVideoUrl());
        snap.put("imageIds", imageIds.stream().map(UUID::toString).collect(Collectors.toList()));
        return objectMapper.copy()
                .setSerializationInclusion(com.fasterxml.jackson.annotation.JsonInclude.Include.ALWAYS)
                .writeValueAsString(snap);
    }

    /**
     * Creates a fully-populated ARCHIVED listing whose lastApprovedSnapshot matches its
     * current field state for the given image IDs. Use this as the baseline for
     * RE-141 snapshot eligibility tests.
     */
    private Listing archivedListingWithMatchingSnapshot(UUID listingId, UUID actorId,
            List<UUID> imageIds) throws Exception {
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.ARCHIVED.toDbValue());
        listing.setCreatedBy(actorId);
        listing.setTitle("Test Property");
        listing.setDescription("A test property");
        listing.setPricePaise(50_000_00L);
        listing.setSellerType("broker");
        listing.setLocality("Udupi Beach");
        listing.setLatitude(13.34);
        listing.setLongitude(74.74);
        listing.setAreaKey("udupi-beach");
        listing.setAreaLabel("Udupi Beach");
        listing.setAreaSqft(BigDecimal.valueOf(1200));
        listing.setBedrooms(3);
        listing.setBathrooms(2);
        listing.setLandArea(BigDecimal.valueOf(500));
        listing.setPropertyType("house");
        listing.setVideoUrl("https://example.com/v.mp4");
        listing.setFirstPublishedAt(OffsetDateTime.now().minusDays(30));
        listing.setLastApprovedSnapshot(buildSnapshotJson(listing, imageIds));
        return listing;
    }
}

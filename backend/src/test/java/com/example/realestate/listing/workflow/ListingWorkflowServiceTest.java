package com.example.realestate.listing.workflow;

import com.example.realestate.listing.audit.ListingStatusHistory;
import com.example.realestate.listing.audit.ListingStatusHistoryRepository;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingOwnershipGuard;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.duplicate.ProximityDuplicateService;
import com.example.realestate.listing.event.ListingApprovedEvent;
import com.example.realestate.listing.event.ListingRejectedEvent;
import com.example.realestate.listing.exception.ListingErrorCode;
import com.example.realestate.listing.exception.ListingLifecycleException;
import com.example.realestate.listing.exception.ListingOwnershipException;
import com.example.realestate.listing.exception.ListingStatusException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;

import java.math.BigDecimal;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
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

    private ListingWorkflowService workflowService;

    @BeforeEach
    void setUp() {
        workflowService = new ListingWorkflowService(
                listingRepository, applicationEventPublisher, listingOwnershipGuard,
                proximityDuplicateService, policy, statusHistoryRepository);
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
        when(listingRepository.save(any())).thenReturn(listing);

        workflowService.rejectListing(listingId, adminId, "Poor quality images");

        // Listing must be saved with REJECTED status
        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
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
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.rejectListing(listingId, adminId, "Poor quality images");

        ArgumentCaptor<ListingStatusHistory> captor = ArgumentCaptor.forClass(ListingStatusHistory.class);
        verify(statusHistoryRepository).save(captor.capture());
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
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.rejectListing(listingId, adminId, "Incomplete info");

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        Listing saved = captor.getValue();

        assertThat(saved.getRejectedAt()).isNotNull();
        assertThat(saved.getStatusReasonCode()).isEqualTo("Incomplete info");
        assertThat(saved.getStatusReasonNote()).isEqualTo("Incomplete info");
        assertThat(saved.getStatusChangedAt()).isNotNull();
        assertThat(saved.getStatusChangedByActorType()).isEqualTo(ActorType.ADMIN);
        assertThat(saved.getStatusChangedByActorId()).isEqualTo(adminId);
        // Backward compat: rejectionReason still set
        assertThat(saved.getRejectionReason()).isEqualTo("Incomplete info");
    }

    @Test
    void rejectListing_nullReason_throwsReasonCodeRequired() {
        UUID listingId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();

        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.PENDING_REVIEW.toDbValue());

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        assertThatThrownBy(() -> workflowService.rejectListing(listingId, adminId, null))
                .isInstanceOf(ListingLifecycleException.class)
                .satisfies(ex -> assertThat(((ListingLifecycleException) ex).getCode())
                        .isEqualTo(ListingErrorCode.REASON_CODE_REQUIRED));

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
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
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.rejectListing(listingId, adminId, "Policy violation");

        verify(policy).validate(ListingStatus.LIVE, ListingStatus.REJECTED, ActorType.ADMIN);

        ArgumentCaptor<ListingStatusHistory> captor = ArgumentCaptor.forClass(ListingStatusHistory.class);
        verify(statusHistoryRepository).save(captor.capture());
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
        when(listingRepository.countImagesByListingId(listingId)).thenReturn(3L);
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
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.archiveListing(listingId, actorId, null);

        verify(policy).validate(ListingStatus.LIVE, ListingStatus.ARCHIVED, ActorType.BROKER);

        ArgumentCaptor<Listing> listingCaptor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(listingCaptor.capture());
        Listing saved = listingCaptor.getValue();
        assertThat(saved.getStatus()).isEqualTo(ListingStatus.ARCHIVED.toDbValue());
        assertThat(saved.getArchivedAt()).isNotNull();
        assertThat(saved.getUpdatedAt()).isNotNull();

        ArgumentCaptor<ListingStatusHistory> historyCaptor = ArgumentCaptor.forClass(ListingStatusHistory.class);
        verify(statusHistoryRepository).save(historyCaptor.capture());
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
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.archiveListing(listingId, actorId, null);

        verify(policy).validate(ListingStatus.DRAFT, ListingStatus.ARCHIVED, ActorType.BROKER);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(ListingStatus.ARCHIVED.toDbValue());
        assertThat(captor.getValue().getArchivedAt()).isNotNull();
    }

    @Test
    void archiveListing_fromRejected_setsReasonNoteAndWritesHistory() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.REJECTED.toDbValue());

        when(listingOwnershipGuard.findOwned(listingId, actorId, false)).thenReturn(listing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.archiveListing(listingId, actorId, "No longer selling");

        verify(policy).validate(ListingStatus.REJECTED, ListingStatus.ARCHIVED, ActorType.BROKER);

        ArgumentCaptor<Listing> listingCaptor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(listingCaptor.capture());
        Listing saved = listingCaptor.getValue();
        assertThat(saved.getStatus()).isEqualTo(ListingStatus.ARCHIVED.toDbValue());
        assertThat(saved.getStatusReasonNote()).isEqualTo("No longer selling");

        ArgumentCaptor<ListingStatusHistory> historyCaptor = ArgumentCaptor.forClass(ListingStatusHistory.class);
        verify(statusHistoryRepository).save(historyCaptor.capture());
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

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    @Test
    void archiveListing_setsStatusChangedFields() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.LIVE.toDbValue());

        when(listingOwnershipGuard.findOwned(listingId, actorId, false)).thenReturn(listing);
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        workflowService.archiveListing(listingId, actorId, null);

        ArgumentCaptor<Listing> captor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(captor.capture());
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
    void restoreArchivedListing_eligible_setsLiveAndClearsArchivedAt() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.ARCHIVED.toDbValue());
        listing.setArchivedAt(java.time.Instant.now().minusSeconds(3600));
        listing.setFirstPublishedAt(java.time.OffsetDateTime.now().minusDays(30));
        java.time.OffsetDateTime originalFirstPublished = listing.getFirstPublishedAt();

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
    }

    @Test
    void restoreArchivedListing_neverPublished_throws422() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.ARCHIVED.toDbValue());
        listing.setArchivedAt(java.time.Instant.now());
        // firstPublishedAt is null — never published

        when(listingRepository.findById(listingId)).thenReturn(java.util.Optional.of(listing));

        assertThatThrownBy(() -> workflowService.restoreArchivedListing(listingId, actorId))
                .isInstanceOf(ListingLifecycleException.class)
                .satisfies(ex -> assertThat(((ListingLifecycleException) ex).getCode())
                        .isEqualTo(ListingErrorCode.FAST_RESTORE_NOT_ELIGIBLE));

        verify(listingRepository, never()).save(any());
        verify(statusHistoryRepository, never()).save(any());
    }

    @Test
    void restoreArchivedListing_nonArchived_throwsPolicyException() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.DRAFT.toDbValue());
        listing.setFirstPublishedAt(java.time.OffsetDateTime.now().minusDays(10)); // was published

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
    void restoreArchivedListing_writesHistoryRow() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.ARCHIVED.toDbValue());
        listing.setArchivedAt(java.time.Instant.now());
        listing.setFirstPublishedAt(java.time.OffsetDateTime.now().minusDays(30));

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
    void restoreArchivedListing_setsStatusChangedFields() {
        UUID listingId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        Listing listing = createOwnedListing(listingId, actorId, ListingStatus.ARCHIVED.toDbValue());
        listing.setArchivedAt(java.time.Instant.now());
        listing.setFirstPublishedAt(java.time.OffsetDateTime.now().minusDays(30));

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
        when(listingRepository.countImagesByListingId(listingId)).thenReturn(3L);
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
        when(listingRepository.countImagesByListingId(listingId)).thenReturn(3L);
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
}

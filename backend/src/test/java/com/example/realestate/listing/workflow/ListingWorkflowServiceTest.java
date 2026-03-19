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
}

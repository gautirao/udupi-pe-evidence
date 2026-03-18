package com.example.realestate.listing.duplicate;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Collections;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Unit tests for DuplicateCandidateService business logic.
 * No Spring context — Mockito only.
 */
@ExtendWith(MockitoExtension.class)
class DuplicateCandidateServiceTest {

    private static final UUID ADMIN_ID    = UUID.fromString("00000000-0000-0000-0000-000000000010");
    private static final UUID CANDIDATE_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID LISTING_A_ID = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID LISTING_B_ID = UUID.fromString("00000000-0000-0000-0000-000000000003");

    @Mock
    private DuplicateCandidateRepository candidateRepository;

    @Mock
    private ListingRepository listingRepository;

    @InjectMocks
    private DuplicateCandidateService service;

    private DuplicateCandidate pendingCandidate;
    private Listing listingA;
    private Listing listingB;

    @BeforeEach
    void setUp() {
        pendingCandidate = buildCandidate(CANDIDATE_ID, LISTING_A_ID, LISTING_B_ID,
                DuplicateCandidateStatus.PENDING);

        listingA = buildListing(LISTING_A_ID, "LIVE",
                OffsetDateTime.now().minusDays(2));
        listingB = buildListing(LISTING_B_ID, "LIVE",
                OffsetDateTime.now().minusDays(1));
    }

    // ==================== confirm ====================

    @Test
    void confirm_pendingCandidate_archivesNewerListingAndSetsConfirmed() {
        when(candidateRepository.findById(CANDIDATE_ID)).thenReturn(Optional.of(pendingCandidate));
        when(listingRepository.findById(LISTING_A_ID)).thenReturn(Optional.of(listingA));
        when(listingRepository.findById(LISTING_B_ID)).thenReturn(Optional.of(listingB));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(candidateRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.confirm(CANDIDATE_ID, ADMIN_ID);

        // listingB is newer (createdAt is more recent)
        ArgumentCaptor<Listing> listingCaptor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(listingCaptor.capture());
        Listing archived = listingCaptor.getValue();
        assertThat(archived.getId()).isEqualTo(LISTING_B_ID);
        assertThat(archived.isDuplicate()).isTrue();
        assertThat(archived.getArchivedAt()).isNotNull();
        assertThat(archived.getStatus()).isEqualTo(ListingStatus.ARCHIVED.toDbValue());

        ArgumentCaptor<DuplicateCandidate> candidateCaptor =
                ArgumentCaptor.forClass(DuplicateCandidate.class);
        verify(candidateRepository).save(candidateCaptor.capture());
        DuplicateCandidate saved = candidateCaptor.getValue();
        assertThat(saved.getStatus()).isEqualTo(DuplicateCandidateStatus.CONFIRMED);
        assertThat(saved.getReviewedBy()).isEqualTo(ADMIN_ID);
        assertThat(saved.getReviewedAt()).isNotNull();
    }

    @Test
    void confirm_notPending_throwsIllegalStateException() {
        DuplicateCandidate confirmed = buildCandidate(CANDIDATE_ID, LISTING_A_ID, LISTING_B_ID,
                DuplicateCandidateStatus.CONFIRMED);
        when(candidateRepository.findById(CANDIDATE_ID)).thenReturn(Optional.of(confirmed));

        assertThatThrownBy(() -> service.confirm(CANDIDATE_ID, ADMIN_ID))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Candidate is not PENDING");

        verify(listingRepository, never()).findById(any());
        verify(candidateRepository, never()).save(any());
    }

    @Test
    void confirm_notFound_throwsDuplicateCandidateNotFoundException() {
        when(candidateRepository.findById(CANDIDATE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.confirm(CANDIDATE_ID, ADMIN_ID))
                .isInstanceOf(DuplicateCandidateService.DuplicateCandidateNotFoundException.class);

        verify(listingRepository, never()).findById(any());
    }

    // ==================== dismiss ====================

    @Test
    void dismiss_pendingCandidate_setsDismissed() {
        when(candidateRepository.findById(CANDIDATE_ID)).thenReturn(Optional.of(pendingCandidate));
        when(candidateRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.dismiss(CANDIDATE_ID, ADMIN_ID);

        ArgumentCaptor<DuplicateCandidate> captor = ArgumentCaptor.forClass(DuplicateCandidate.class);
        verify(candidateRepository).save(captor.capture());
        DuplicateCandidate saved = captor.getValue();
        assertThat(saved.getStatus()).isEqualTo(DuplicateCandidateStatus.DISMISSED);
        assertThat(saved.getReviewedBy()).isEqualTo(ADMIN_ID);
        assertThat(saved.getReviewedAt()).isNotNull();

        verify(listingRepository, never()).save(any());
    }

    // ==================== undo ====================

    @Test
    void undo_confirmedCandidate_restoresArchivedListingAndResetsPending() {
        DuplicateCandidate confirmed = buildCandidate(CANDIDATE_ID, LISTING_A_ID, LISTING_B_ID,
                DuplicateCandidateStatus.CONFIRMED);

        // listingB was archived (isDuplicate=true)
        listingB.setDuplicate(true);
        listingB.setArchivedAt(Instant.now());
        listingB.setStatus(ListingStatus.ARCHIVED.toDbValue());

        when(candidateRepository.findById(CANDIDATE_ID)).thenReturn(Optional.of(confirmed));
        when(listingRepository.findById(LISTING_A_ID)).thenReturn(Optional.of(listingA));
        when(listingRepository.findById(LISTING_B_ID)).thenReturn(Optional.of(listingB));
        when(listingRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(candidateRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        service.undo(CANDIDATE_ID, ADMIN_ID);

        // The archived listing (B) should be restored
        ArgumentCaptor<Listing> listingCaptor = ArgumentCaptor.forClass(Listing.class);
        verify(listingRepository).save(listingCaptor.capture());
        Listing restored = listingCaptor.getValue();
        assertThat(restored.getId()).isEqualTo(LISTING_B_ID);
        assertThat(restored.isDuplicate()).isFalse();
        assertThat(restored.isSuspectedDuplicate()).isFalse();
        assertThat(restored.getArchivedAt()).isNull();
        assertThat(restored.getStatus()).isEqualTo(ListingStatus.LIVE.toDbValue());

        // Candidate reset to PENDING
        ArgumentCaptor<DuplicateCandidate> candidateCaptor =
                ArgumentCaptor.forClass(DuplicateCandidate.class);
        verify(candidateRepository).save(candidateCaptor.capture());
        DuplicateCandidate saved = candidateCaptor.getValue();
        assertThat(saved.getStatus()).isEqualTo(DuplicateCandidateStatus.PENDING);
        assertThat(saved.getReviewedBy()).isNull();
        assertThat(saved.getReviewedAt()).isNull();
    }

    @Test
    void undo_alreadyPending_throwsIllegalStateException() {
        when(candidateRepository.findById(CANDIDATE_ID)).thenReturn(Optional.of(pendingCandidate));

        assertThatThrownBy(() -> service.undo(CANDIDATE_ID, ADMIN_ID))
                .isInstanceOf(IllegalStateException.class)
                .hasMessage("Candidate is already PENDING");

        verify(candidateRepository, never()).save(any());
    }

    // ==================== getPage ====================

    @Test
    void getPage_sizeExceedsMax_clampsTo100() {
        Page<DuplicateCandidate> emptyPage = new PageImpl<>(Collections.emptyList());
        when(candidateRepository.findByStatusOrderBySimilarityScoreDesc(
                eq(DuplicateCandidateStatus.PENDING), any(Pageable.class)))
                .thenReturn(emptyPage);

        service.getPage(0, 200);

        ArgumentCaptor<Pageable> pageableCaptor = ArgumentCaptor.forClass(Pageable.class);
        verify(candidateRepository).findByStatusOrderBySimilarityScoreDesc(
                eq(DuplicateCandidateStatus.PENDING), pageableCaptor.capture());
        assertThat(pageableCaptor.getValue().getPageSize()).isEqualTo(100);
    }

    // ==================== undo — warn-and-continue ====================

    @Test
    void undo_confirmedCandidate_noArchivedListingFound_resetsTopending_noListingSave() {
        DuplicateCandidate confirmed = buildCandidate(CANDIDATE_ID, LISTING_A_ID, LISTING_B_ID,
                DuplicateCandidateStatus.CONFIRMED);

        // Both listings have isDuplicate=false, so neither qualifies as the archived listing
        listingA.setDuplicate(false);
        listingB.setDuplicate(false);

        when(candidateRepository.findById(CANDIDATE_ID)).thenReturn(Optional.of(confirmed));
        when(listingRepository.findById(LISTING_A_ID)).thenReturn(Optional.of(listingA));
        when(listingRepository.findById(LISTING_B_ID)).thenReturn(Optional.of(listingB));
        when(candidateRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        assertDoesNotThrow(() -> service.undo(CANDIDATE_ID, ADMIN_ID));

        // Candidate must be reset to PENDING
        ArgumentCaptor<DuplicateCandidate> candidateCaptor =
                ArgumentCaptor.forClass(DuplicateCandidate.class);
        verify(candidateRepository).save(candidateCaptor.capture());
        assertThat(candidateCaptor.getValue().getStatus()).isEqualTo(DuplicateCandidateStatus.PENDING);

        // No listing save should occur
        verify(listingRepository, never()).save(any(Listing.class));
    }

    // ==================== Helpers ====================

    private static DuplicateCandidate buildCandidate(UUID id, UUID listingIdA, UUID listingIdB,
                                                      DuplicateCandidateStatus status) {
        DuplicateCandidate c = new DuplicateCandidate();
        // Use reflection-free approach: set via setters and force id via the package-visible
        // setter by setting it directly. Since id has no public setter, use the prePersist flow
        // substitute: we just need a test object — set all public fields.
        c.setListingIdA(listingIdA);
        c.setListingIdB(listingIdB);
        c.setSimilarityScore(new BigDecimal("0.92"));
        c.setDistanceMeters(new BigDecimal("45.00"));
        c.setStatus(status);
        // Force id using a field-level trick: since getId() is used in assertions
        // and the id is set by JPA normally, we use a workaround to set it for tests.
        setIdViaReflection(c, id);
        return c;
    }

    private static Listing buildListing(UUID id, String status, OffsetDateTime createdAt) {
        Listing l = new Listing();
        l.setId(id);
        l.setStatus(status);
        l.setCreatedAt(createdAt);
        l.setUpdatedAt(OffsetDateTime.now());
        return l;
    }

    private static void setIdViaReflection(DuplicateCandidate candidate, UUID id) {
        try {
            java.lang.reflect.Field field = DuplicateCandidate.class.getDeclaredField("id");
            field.setAccessible(true);
            field.set(candidate, id);
        } catch (Exception e) {
            throw new RuntimeException("Failed to set id via reflection in test", e);
        }
    }
}

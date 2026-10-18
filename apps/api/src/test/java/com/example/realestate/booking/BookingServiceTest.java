package com.example.realestate.booking;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.DataIntegrityViolationException;

import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Issue #2837 (#2750 PR-6 batch C) — drives the REAL {@link BookingService#createBooking}
 * (no mocked service). Only its collaborators are test doubles: the two repositories and the
 * event publisher. This is service-level coverage for the legacy
 * e2e/journey/booking-journey.spec.ts rows (that spec is KEPT pending the real-DB follow-up #2844):
 *   UB2-a/b  a duplicate active booking surfaces as BookingConflictException (the real
 *            DataIntegrityViolationException -> BookingConflictException translation, which the
 *            controller maps to 409);
 *   UB1-d    the requesterMessage is assigned to the entity that is SAVED.
 *
 * LIMIT (disclosed): the repository is a Mockito double, so the DB unique constraint itself is NOT
 * exercised here; the test proves the service translates the persistence-layer constraint failure
 * and persists the message on the saved entity, not that Postgres raises the failure.
 */
@ExtendWith(MockitoExtension.class)
class BookingServiceTest {

    private static final String MESSAGE = "Please call before arriving";
    private static final String SLOT = "10:00-11:00";

    @Mock
    private ViewingRequestRepository viewingRequestRepository;

    @Mock
    private ListingRepository listingRepository;

    @Mock
    private ApplicationEventPublisher eventPublisher;

    private BookingService service;

    private final UUID listingId = UUID.randomUUID();
    private final UUID requesterId = UUID.randomUUID();
    private final UUID brokerId = UUID.randomUUID();
    private final LocalDate date = LocalDate.now().plusDays(3);

    @BeforeEach
    void setUp() {
        service = new BookingService(viewingRequestRepository, listingRepository, eventPublisher);
        Listing listing = new Listing();
        listing.setId(listingId);
        listing.setStatus(ListingStatus.LIVE.toDbValue());
        listing.setCreatedBy(brokerId);
        when(listingRepository.findById(listingId)).thenReturn(Optional.of(listing));
    }

    @Test
    @DisplayName("UB2: a constraint failure on the second active booking is translated to BookingConflictException and no event is published")
    void duplicateActiveBooking_translatesConstraintFailureToConflict() {
        when(viewingRequestRepository.saveAndFlush(any(ViewingRequest.class)))
                .thenThrow(new DataIntegrityViolationException("unique constraint violation (simulated)"));

        assertThatThrownBy(() -> service.createBooking(requesterId, listingId, date, SLOT, MESSAGE))
                .isInstanceOf(BookingService.BookingConflictException.class)
                .hasMessageContaining("already have an active booking");
        verify(eventPublisher, never()).publishEvent(any(Object.class));
    }

    @Test
    @DisplayName("UB2 control: the first booking (no constraint failure) saves, returns and publishes - so the conflict test cannot pass for an unrelated reason")
    void firstBooking_savesAndPublishes() {
        when(viewingRequestRepository.saveAndFlush(any(ViewingRequest.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        ViewingRequest saved = service.createBooking(requesterId, listingId, date, SLOT, MESSAGE);

        assertThat(saved.getListingId()).isEqualTo(listingId);
        assertThat(saved.getRequesterId()).isEqualTo(requesterId);
        assertThat(saved.getBrokerId()).isEqualTo(brokerId);
        assertThat(saved.getStatus()).isEqualTo("REQUESTED");
        verify(eventPublisher).publishEvent(any(Object.class));
    }

    @Test
    @DisplayName("UB1-d: the requesterMessage is assigned to the entity handed to the repository and returned (null stays null)")
    void requesterMessage_isPersistedOnTheSavedEntity() {
        when(viewingRequestRepository.saveAndFlush(any(ViewingRequest.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        ViewingRequest returned = service.createBooking(requesterId, listingId, date, SLOT, MESSAGE);

        ArgumentCaptor<ViewingRequest> captor = ArgumentCaptor.forClass(ViewingRequest.class);
        verify(viewingRequestRepository).saveAndFlush(captor.capture());
        assertThat(captor.getValue().getRequesterMessage()).isEqualTo(MESSAGE);
        assertThat(returned.getRequesterMessage()).isEqualTo(MESSAGE);
        assertThat(captor.getValue().getRequestedTimeSlot()).isEqualTo(SLOT);
        assertThat(captor.getValue().getRequestedDate()).isEqualTo(date);

        ViewingRequest noMessage = service.createBooking(requesterId, listingId, date, SLOT, null);
        assertThat(noMessage.getRequesterMessage()).isNull();
    }
}

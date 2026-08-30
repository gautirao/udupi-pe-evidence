package com.example.realestate.booking;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for BookingCascadeService.
 *
 * Repository is mocked; row counts are controlled via stubs.
 * AC coverage: AC-C1 through AC-C9 (see table in PR).
 */
class BookingCascadeServiceTest {

    private static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");
    private static final String VALID_REASON = "Listing withdrawn by owner";

    private ViewingRequestRepository repository;
    private BookingCascadeService service;

    @BeforeEach
    void setUp() {
        repository = mock(ViewingRequestRepository.class);
        service = new BookingCascadeService(repository);
    }

    // ==================== cancelPendingBookings ====================

    // AC-C1: REQUESTED bookings are bulk-cancelled with reason and cancelledBy="system"
    @Test
    void cancelPendingBookings_delegatesToRepository() {
        when(repository.bulkCancelRequested(eq(LISTING_ID), eq(VALID_REASON), any(OffsetDateTime.class)))
                .thenReturn(3);

        int rows = service.cancelPendingBookings(LISTING_ID, VALID_REASON);

        assertThat(rows).isEqualTo(3);
        verify(repository).bulkCancelRequested(eq(LISTING_ID), eq(VALID_REASON), any(OffsetDateTime.class));
    }

    // AC-C2: zero rows does not throw
    @Test
    void cancelPendingBookings_zeroRows_doesNotThrow() {
        when(repository.bulkCancelRequested(eq(LISTING_ID), eq(VALID_REASON), any(OffsetDateTime.class)))
                .thenReturn(0);

        int rows = service.cancelPendingBookings(LISTING_ID, VALID_REASON);

        assertThat(rows).isEqualTo(0);
    }

    // AC-C3a: null cancellationReason throws IllegalArgumentException before reaching repo
    @Test
    void cancelPendingBookings_nullReason_throwsIllegalArgument() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> service.cancelPendingBookings(LISTING_ID, null))
                .withMessageContaining("cancellationReason must not be null or blank");

        verify(repository, never()).bulkCancelRequested(any(), any(), any());
    }

    // AC-C3b: blank cancellationReason throws IllegalArgumentException before reaching repo
    @Test
    void cancelPendingBookings_blankReason_throwsIllegalArgument() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> service.cancelPendingBookings(LISTING_ID, "   "))
                .withMessageContaining("cancellationReason must not be null or blank");

        verify(repository, never()).bulkCancelRequested(any(), any(), any());
    }

    // AC-C3c: cancellationReason > 100 chars throws IllegalArgumentException before reaching repo
    @Test
    void cancelPendingBookings_reasonTooLong_throwsIllegalArgument() {
        String tooLong = "x".repeat(101);

        assertThatIllegalArgumentException()
                .isThrownBy(() -> service.cancelPendingBookings(LISTING_ID, tooLong))
                .withMessageContaining("100");

        verify(repository, never()).bulkCancelRequested(any(), any(), any());
    }

    // AC-C3d: cancellationReason exactly 100 chars is accepted
    @Test
    void cancelPendingBookings_reasonExactly100Chars_accepted() {
        String exactly100 = "x".repeat(100);
        when(repository.bulkCancelRequested(eq(LISTING_ID), eq(exactly100), any(OffsetDateTime.class)))
                .thenReturn(1);

        int rows = service.cancelPendingBookings(LISTING_ID, exactly100);

        assertThat(rows).isEqualTo(1);
        verify(repository).bulkCancelRequested(eq(LISTING_ID), eq(exactly100), any(OffsetDateTime.class));
    }

    // ==================== freezeConfirmedBookings ====================

    // AC-C4: CONFIRMED bookings are frozen to NEEDS_RESOLUTION with reason
    @Test
    void freezeConfirmedBookings_delegatesToRepository() {
        when(repository.bulkFreezeConfirmed(eq(LISTING_ID), eq(VALID_REASON), any(OffsetDateTime.class)))
                .thenReturn(2);

        int rows = service.freezeConfirmedBookings(LISTING_ID, VALID_REASON);

        assertThat(rows).isEqualTo(2);
        verify(repository).bulkFreezeConfirmed(eq(LISTING_ID), eq(VALID_REASON), any(OffsetDateTime.class));
    }

    // AC-C5: zero rows does not throw
    @Test
    void freezeConfirmedBookings_zeroRows_doesNotThrow() {
        when(repository.bulkFreezeConfirmed(eq(LISTING_ID), eq(VALID_REASON), any(OffsetDateTime.class)))
                .thenReturn(0);

        int rows = service.freezeConfirmedBookings(LISTING_ID, VALID_REASON);

        assertThat(rows).isEqualTo(0);
    }

    // AC-C6a: null cancellationReason throws IllegalArgumentException before reaching repo
    @Test
    void freezeConfirmedBookings_nullReason_throwsIllegalArgument() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> service.freezeConfirmedBookings(LISTING_ID, null))
                .withMessageContaining("cancellationReason must not be null or blank");

        verify(repository, never()).bulkFreezeConfirmed(any(), any(), any());
    }

    // AC-C6b: blank cancellationReason throws IllegalArgumentException before reaching repo
    @Test
    void freezeConfirmedBookings_blankReason_throwsIllegalArgument() {
        assertThatIllegalArgumentException()
                .isThrownBy(() -> service.freezeConfirmedBookings(LISTING_ID, "   "))
                .withMessageContaining("cancellationReason must not be null or blank");

        verify(repository, never()).bulkFreezeConfirmed(any(), any(), any());
    }

    // AC-C6c: cancellationReason > 100 chars throws IllegalArgumentException before reaching repo
    @Test
    void freezeConfirmedBookings_reasonTooLong_throwsIllegalArgument() {
        String tooLong = "x".repeat(101);

        assertThatIllegalArgumentException()
                .isThrownBy(() -> service.freezeConfirmedBookings(LISTING_ID, tooLong))
                .withMessageContaining("100");

        verify(repository, never()).bulkFreezeConfirmed(any(), any(), any());
    }

    // ==================== unfreezeBookings ====================

    // AC-C7: NEEDS_RESOLUTION bookings are unfrozen back to CONFIRMED with reason cleared
    @Test
    void unfreezeBookings_delegatesToRepository() {
        when(repository.bulkUnfreeze(eq(LISTING_ID), any(OffsetDateTime.class))).thenReturn(4);

        int rows = service.unfreezeBookings(LISTING_ID);

        assertThat(rows).isEqualTo(4);
        verify(repository).bulkUnfreeze(eq(LISTING_ID), any(OffsetDateTime.class));
    }

    // AC-C8: zero rows does not throw
    @Test
    void unfreezeBookings_zeroRows_doesNotThrow() {
        when(repository.bulkUnfreeze(eq(LISTING_ID), any(OffsetDateTime.class))).thenReturn(0);

        int rows = service.unfreezeBookings(LISTING_ID);

        assertThat(rows).isEqualTo(0);
    }

}

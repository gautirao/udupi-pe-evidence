package com.example.realestate.booking;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;

import java.time.LocalDate;
import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BookingSchedulerTest {

    @Mock
    private ViewingRequestRepository repository;

    private BookingScheduler scheduler;

    @BeforeEach
    void setUp() {
        scheduler = new BookingScheduler(repository);
    }

    @Test
    void transitionCompletedBookings_callsRepository() {
        when(repository.transitionExpiredConfirmedToCompleted(any(OffsetDateTime.class), any(LocalDate.class)))
                .thenReturn(3);

        scheduler.transitionCompletedBookings();

        verify(repository).transitionExpiredConfirmedToCompleted(any(OffsetDateTime.class), any(LocalDate.class));
    }

    @Test
    void transitionCompletedBookings_zeroRows_doesNotThrow() {
        when(repository.transitionExpiredConfirmedToCompleted(any(OffsetDateTime.class), any(LocalDate.class)))
                .thenReturn(0);

        assertThatNoException().isThrownBy(() -> scheduler.transitionCompletedBookings());
    }

    @Test
    void transitionCompletedBookings_positiveRows_logsCount() {
        when(repository.transitionExpiredConfirmedToCompleted(any(OffsetDateTime.class), any(LocalDate.class)))
                .thenReturn(5);

        Logger logger = (Logger) LoggerFactory.getLogger(BookingScheduler.class);
        ListAppender<ILoggingEvent> listAppender = new ListAppender<>();
        listAppender.start();
        logger.addAppender(listAppender);

        try {
            scheduler.transitionCompletedBookings();
        } finally {
            logger.detachAppender(listAppender);
        }

        assertThat(listAppender.list)
                .extracting(ILoggingEvent::getFormattedMessage)
                .anyMatch(msg -> msg.contains("5"));
    }

    @Test
    void scheduledAnnotation_hasDailyAt2amCron() throws NoSuchMethodException {
        var method = BookingScheduler.class.getMethod("transitionCompletedBookings");
        var scheduled = method.getAnnotation(Scheduled.class);
        assertNotNull(scheduled);
        assertEquals("0 0 2 * * *", scheduled.cron());
    }
}

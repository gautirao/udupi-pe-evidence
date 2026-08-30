package com.example.realestate.booking;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.OffsetDateTime;

@Component
public class BookingScheduler {

    private static final Logger log = LoggerFactory.getLogger(BookingScheduler.class);

    private final ViewingRequestRepository repository;

    public BookingScheduler(ViewingRequestRepository repository) {
        this.repository = repository;
    }

    @Scheduled(cron = "0 0 2 * * *")
    public void transitionCompletedBookings() {
        int count = repository.transitionExpiredConfirmedToCompleted(
                OffsetDateTime.now(), LocalDate.now());
        log.info("Transitioned {} CONFIRMED bookings to COMPLETED", count);
    }
}

package com.example.realestate.booking;

import com.example.realestate.listing.ListingRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * AFTER_COMMIT listener for booking domain events.
 * Inserts notifications for the 4 booking types defined in spec §8:
 *   viewing_requested  → dealer
 *   viewing_confirmed  → requester
 *   viewing_declined   → requester
 *   viewing_cancelled  → counterparty (user → dealer; dealer → requester)
 *
 * Never rethrows — notification failures must not affect committed booking state.
 */
@Component
public class BookingEventListener {

    private static final Logger log = LoggerFactory.getLogger(BookingEventListener.class);

    private final ListingRepository listingRepository;
    private final ObjectMapper objectMapper;

    public BookingEventListener(ListingRepository listingRepository, ObjectMapper objectMapper) {
        this.listingRepository = listingRepository;
        this.objectMapper = objectMapper;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onViewingRequested(BookingService.ViewingRequestedEvent event) {
        ViewingRequest booking = event.booking();
        try {
            String metadata = buildMetadata(booking);
            listingRepository.insertNotification(
                    booking.getDealerId(),
                    "viewing_requested",
                    "New viewing request",
                    "A viewing has been requested for your listing.",
                    metadata);
            log.info("viewing_requested notification sent bookingId={} dealerId={}",
                    booking.getId(), booking.getDealerId());
        } catch (Exception e) {
            log.error("Failed to send viewing_requested notification bookingId={}",
                    booking.getId(), e);
        }
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onViewingConfirmed(BookingService.ViewingConfirmedEvent event) {
        ViewingRequest booking = event.booking();
        try {
            String metadata = buildMetadata(booking);
            listingRepository.insertNotification(
                    booking.getRequesterId(),
                    "viewing_confirmed",
                    "Viewing confirmed",
                    "Your viewing request has been confirmed.",
                    metadata);
            log.info("viewing_confirmed notification sent bookingId={} requesterId={}",
                    booking.getId(), booking.getRequesterId());
        } catch (Exception e) {
            log.error("Failed to send viewing_confirmed notification bookingId={}",
                    booking.getId(), e);
        }
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onViewingDeclined(BookingService.ViewingDeclinedEvent event) {
        ViewingRequest booking = event.booking();
        try {
            String metadata = buildMetadata(booking);
            listingRepository.insertNotification(
                    booking.getRequesterId(),
                    "viewing_declined",
                    "Viewing declined",
                    "Your viewing request has been declined.",
                    metadata);
            log.info("viewing_declined notification sent bookingId={} requesterId={}",
                    booking.getId(), booking.getRequesterId());
        } catch (Exception e) {
            log.error("Failed to send viewing_declined notification bookingId={}",
                    booking.getId(), e);
        }
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onViewingCancelled(BookingService.ViewingCancelledEvent event) {
        ViewingRequest booking = event.booking();
        try {
            String metadata = buildMetadata(booking);
            // Notify the counterparty: user cancelled → notify dealer; dealer cancelled → notify requester
            boolean cancelledByUser = "user".equals(booking.getCancelledBy());
            java.util.UUID recipientId = cancelledByUser ? booking.getDealerId() : booking.getRequesterId();

            listingRepository.insertNotification(
                    recipientId,
                    "viewing_cancelled",
                    "Viewing cancelled",
                    "A viewing has been cancelled.",
                    metadata);
            log.info("viewing_cancelled notification sent bookingId={} cancelledBy={} recipientId={}",
                    booking.getId(), booking.getCancelledBy(), recipientId);
        } catch (Exception e) {
            log.error("Failed to send viewing_cancelled notification bookingId={}",
                    booking.getId(), e);
        }
    }

    private String buildMetadata(ViewingRequest booking) throws Exception {
        ObjectNode metadata = objectMapper.createObjectNode();
        metadata.put("booking_id", booking.getId().toString());
        metadata.put("listing_id", booking.getListingId().toString());
        return objectMapper.writeValueAsString(metadata);
    }
}

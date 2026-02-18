package com.example.realestate.notification;

import com.example.realestate.listing.ListingService.ListingApprovedEvent;
import com.example.realestate.listing.ListingService.ListingRejectedEvent;
import com.example.realestate.listing.ListingRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
public class NotificationEventListener {

    private static final Logger log = LoggerFactory.getLogger(NotificationEventListener.class);

    private final ListingRepository listingRepository;
    private final ObjectMapper objectMapper;

    public NotificationEventListener(ListingRepository listingRepository, ObjectMapper objectMapper) {
        this.listingRepository = listingRepository;
        this.objectMapper = objectMapper;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onListingApproved(ListingApprovedEvent event) {
        try {
            ObjectNode metadata = objectMapper.createObjectNode();
            metadata.put("listing_id", event.listing().getId().toString());
            String metadataJson = objectMapper.writeValueAsString(metadata);
            listingRepository.insertNotification(
                    event.ownerId(),
                    "listing_approved",
                    "Listing approved",
                    "Your listing '" + event.title() + "' has been approved and is now live.",
                    metadataJson);
            log.info("Approval notification sent listingId={}", event.listing().getId());
        } catch (Exception e) {
            log.error("Failed to send approval notification listingId={}", event.listing().getId(), e);
            // Do NOT rethrow — notification failure must not affect already-committed listing status
        }
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onListingRejected(ListingRejectedEvent event) {
        try {
            ObjectNode metadata = objectMapper.createObjectNode();
            metadata.put("listing_id", event.listing().getId().toString());
            metadata.put("reason", event.reason());
            String metadataJson = objectMapper.writeValueAsString(metadata);
            listingRepository.insertNotification(
                    event.ownerId(),
                    "listing_rejected",
                    "Listing rejected",
                    "Your listing '" + event.title() + "' was rejected. Reason: " + event.reason(),
                    metadataJson);
            log.info("Rejection notification sent listingId={}", event.listing().getId());
        } catch (Exception e) {
            log.error("Failed to send rejection notification listingId={}", event.listing().getId(), e);
            // Do NOT rethrow — notification failure must not affect already-committed listing status
        }
    }
}

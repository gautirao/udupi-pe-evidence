package com.example.realestate.poi;

import com.example.realestate.listing.event.SettlementEnrichmentRequestedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * AFTER_COMMIT listener that triggers Overpass settlement enrichment for listings whose
 * address has just been confirmed.
 *
 * <p>Fires asynchronously after the listing update commits so that the Overpass HTTP call
 * does not block the broker's request. Settlement enrichment failures are logged but never
 * propagated to the caller — they are silently retried on the next suggestions fetch.
 */
@Component
public class SettlementEnrichmentListener {

    private static final Logger log = LoggerFactory.getLogger(SettlementEnrichmentListener.class);

    private final OverpassService overpassService;

    public SettlementEnrichmentListener(OverpassService overpassService) {
        this.overpassService = overpassService;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onSettlementEnrichmentRequested(SettlementEnrichmentRequestedEvent event) {
        try {
            overpassService.enrichSettlement(
                    event.listingId(), event.lat(), event.lon(), event.propertyType());
            log.info("Settlement enrichment completed listingId={} propertyType={}",
                    event.listingId(), event.propertyType());
        } catch (Exception e) {
            log.error("Settlement enrichment failed listingId={} — will retry on next suggestions fetch",
                    event.listingId(), e);
        }
    }
}

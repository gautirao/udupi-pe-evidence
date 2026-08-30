package com.example.realestate.listing.event;

import java.util.UUID;

/**
 * Fired after a broker confirms the address on a listing that has coordinates and a
 * settlement-enrichment-eligible property type (land, house, commercial).
 * Consumed by {@code SettlementEnrichmentListener} to trigger Overpass settlement fetch.
 */
public record SettlementEnrichmentRequestedEvent(UUID listingId, double lat, double lon,
                                                 String propertyType) {}

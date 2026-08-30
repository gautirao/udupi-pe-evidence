package com.example.realestate.broker.focus;

import java.time.Instant;

/**
 * Read-side DTO for a single {@code broker_market_focus} row.
 *
 * <p>Returned as elements of the {@code GET /api/broker/market-focus} response list.
 * All fields are derived from persisted columns; no computed fields.
 *
 * <p>source is always one of {@code "seeded"} or {@code "manual"} (enforced by DB CHECK).
 */
public record BrokerMarketFocusRow(
        String citySlug,
        String areaKey,
        String propertyType,
        String listingPurpose,
        String source,
        Instant createdAt
) {}

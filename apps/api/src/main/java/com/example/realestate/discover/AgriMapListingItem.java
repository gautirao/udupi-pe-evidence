package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.math.BigDecimal;
import java.time.OffsetDateTime;

/**
 * Immutable DTO for a single item in the public agri-map endpoint response.
 *
 * <p>Only fields safe for public anonymous access are included.
 * Seller identity, rejection reason, internal admin fields, status, and
 * surveyNumber are intentionally excluded.
 *
 * <p>Auth-aware gating (applied by {@code DiscoverAgriMapListingsService.toAnonItem()}):
 * <ul>
 *   <li>{@code pricePaise} — null for anonymous callers</li>
 *   <li>{@code latitude}/{@code longitude} — coarsened to 2 dp for anonymous callers</li>
 *   <li>All other fields (including the canonical agri fields added in #1459) are
 *       non-PII / non-price / non-coordinate and pass through unchanged for both anon
 *       and authenticated callers.</li>
 * </ul>
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AgriMapListingItem(
        // ── Core identity / spatial ───────────────────────────────────────────
        String id,
        String title,
        String areaKey,
        Double latitude,
        Double longitude,
        String propertyType,
        String locality,
        String boundaryGeoJson,
        // ── Land dimensions ───────────────────────────────────────────────────
        BigDecimal landArea,
        String landAreaUnit,
        BigDecimal computedAreaAcres,
        // ── Price (auth-gated: null for anon) ────────────────────────────────
        Long pricePaise,
        // ── Intent / basic agri attributes (#1458/#1494) ─────────────────────
        String listingPurpose,
        String waterSource,
        String landCategory,
        Boolean farmhouseAvailable,
        Boolean fencingDone,
        // ── Canonical agri fields added in #1459 (non-PII; pass through for anon) ──
        String roadAccess,
        String soilType,
        String cultivationStatus,
        String ownershipType,
        // ── Temporal metadata ─────────────────────────────────────────────────
        OffsetDateTime updatedAt
) {}

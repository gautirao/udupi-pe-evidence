package com.example.realestate.discover.event;

import java.util.Set;

/**
 * Canonical allow-lists for the discover_event ingest endpoint.
 *
 * <p>ALL validation decisions in {@link DiscoverEventService} derive from these constants.
 * There must be exactly ONE place where allowed keys and price bands are defined.
 *
 * <p>PII GUARANTEE: none of these keys or values can encode personal data.
 * Raw prices are forbidden — only coarse band labels are allowed.
 */
public final class DiscoverEventAllowList {

    private DiscoverEventAllowList() {}

    // ── Event types ────────────────────────────────────────────────────────────

    public static final Set<String> EVENT_TYPES = Set.of(
            "FILTER_APPLY",
            "PANEL_OPEN",
            "LEAD_INTENT"
    );

    // ── filters_jsonb allowed keys ─────────────────────────────────────────────
    //
    // These are the ONLY keys that may appear inside filters_jsonb.
    // Any key not in this set causes the entire batch to be rejected (400).

    public static final Set<String> ALLOWED_FILTER_KEYS = Set.of(
            "area_key",
            "property_type",
            "listing_purpose",
            "price_band",
            "sort_by",
            "page"
    );

    // ── Coarse price band labels ───────────────────────────────────────────────
    //
    // Raw numeric prices are NEVER accepted. Callers must map prices to one of
    // these coarse labels before submitting. This prevents reverse-engineering
    // individual pricing from telemetry.

    public static final Set<String> ALLOWED_PRICE_BANDS = Set.of(
            "UNDER_5L",
            "5L_20L",
            "20L_50L",
            "50L_1CR",
            "1CR_2CR",
            "ABOVE_2CR",
            "UNSPECIFIED"
    );

    // ── Batch size cap ─────────────────────────────────────────────────────────
    //
    // Maximum number of events per single POST request.
    // Chosen to bound payload size (~50 × ~500B = ~25 KB max) and prevent
    // a single client from monopolising the ingest path.

    public static final int MAX_BATCH_SIZE = 50;

    // ── Free-text field length cap ─────────────────────────────────────────────
    //
    // areaKey, propertyType, and listingPurpose are optional coarse tokens
    // (e.g. "IN|KA|Udupi|Manipal", "agricultural_land", "sale").
    // A hard length cap prevents unbounded free-text / PII smuggling into these
    // text columns. Values exceeding this limit are rejected with 400.
    // Null/absent values are always allowed (fields are optional).

    public static final int MAX_FIELD_LENGTH = 100;
}

package com.example.realestate.intelligence;

/**
 * Buyer-facing area-slug resolution response DTO.
 *
 * <p>Returned by {@link BuyerAreaIntelligenceController} for
 * {@code GET /api/trends/resolve-area?city=X&slug=Y}.
 *
 * <p>IDENTIFIER FIELDS ONLY — buyer-facing, no broker metrics, no counts, no price data.
 * This is intentionally k-anon-safe: knowing that an area exists does not reveal its
 * suppressed metric values.
 *
 * <p>When {@code matched} is {@code false}, {@code areaKey} and {@code areaLabel} are
 * {@code null}. The echoed {@code citySlug} and {@code areaSlug} allow the caller to
 * correlate the response with the request without re-examining query params.
 */
public record ResolveAreaResponse(
        /** The city slug echo from the request (e.g. "udupi"). */
        String citySlug,
        /** The area slug echo from the request (e.g. "malpe"). */
        String areaSlug,
        /**
         * The exact stored area key (e.g. "IN|KA|Udupi|Malpe") when matched; null otherwise.
         * Pipe-delimited, non-null and unique within a city when present.
         */
        String areaKey,
        /**
         * The stored area label (e.g. "Malpe") when matched; null otherwise.
         * May itself be null in the DB when the area has no display label — in that
         * case the slug was derived from the area key last segment.
         */
        String areaLabel,
        /** True when the slug matched an area in the given city; false otherwise. */
        boolean matched
) {}

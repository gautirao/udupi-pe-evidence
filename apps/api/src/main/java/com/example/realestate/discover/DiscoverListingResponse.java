package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.time.OffsetDateTime;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record DiscoverListingResponse(
        String id,
        String listingNumber,
        String propertyType,
        String title,
        String locality,
        String areaKey,
        Long pricePaise,
        Double landArea,
        String landAreaUnit,
        Double builtArea,
        String builtAreaUnit,
        Integer bedrooms,
        Double latitude,
        Double longitude,
        String heroImageUrl,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        OffsetDateTime firstPublishedAt,
        OffsetDateTime lastUpdatedAt,
        // #1794 Phase 1: set to the transition timestamp every time the listing enters LIVE
        // (publish or reconfirm). Null when never confirmed since this column was introduced —
        // honest absence, never backfilled/fabricated.
        OffsetDateTime confirmedAt,
        Integer daysOnMarket,
        Boolean backOnMarket,
        String reraNumber,
        Boolean reraValid,
        // Public-safe trust badge word ("verified"/"trusted"/"listed"), or null when the
        // listing has no badge. Never the raw internal letter grade — see TrustBadge.
        String trustBadge,
        String possessionStatus,
        String sellerType,
        String listingPurpose,
        String status,
        /**
         * #2431 — {@code SHOP} or {@code OFFICE} for a commercial listing whose subtype has been
         * declared; {@code null} otherwise.
         *
         * <p>{@code null} carries real information and must NOT be rendered as a subtype: it means
         * either "not a commercial listing" or "a legacy {@code property_type='commercial'} row
         * whose shop-vs-office distinction was never recorded". V102's backfill left the column
         * NULL for every pre-existing commercial row deliberately, because that distinction cannot
         * be recovered from legacy data. Consumers must fall back to the broad Commercial label
         * rather than guessing. The record is {@code NON_NULL}-serialised, so the field is simply
         * absent from the JSON in those cases.
         */
        String commercialSubtype,
        /**
         * The resolved buyer peer this listing belongs to (#2458):
         * {@code SHOP | OFFICE | BUILDING | WAREHOUSE | LAND}, or {@code null}.
         *
         * <p>The DISPLAY direction of the same mapping the Discover predicate uses in the QUERY
         * direction. Projected here so consumers do not each re-derive the taxonomy -- a second
         * translation next to this one is the drift #2458 exists to prevent.
         *
         * <p><b>Not a second source of truth.</b> It is a pure function of {@code propertyType} and
         * {@code commercialSubtype}, both already on this record, computed server-side in the ONE
         * shared funnel. No client can desynchronise it -- which is the difference between a
         * derived RESPONSE field and an asserted REQUEST field.
         *
         * <p><b>{@code null} is honest absence, never a guess</b>, and carries TWO distinct cases
         * that the consumer separates using {@code propertyType} (NOT NULL, always correct):
         * {@code propertyType='commercial'} with null here is a LEGACY generic commercial row --
         * render the generic "Commercial" branch; any other {@code propertyType} with null is not
         * a commercial row at all. Do NOT mint a sixth value to distinguish them: storage has no
         * such value.
         *
         * <p>Legacy Building/Warehouse/Land rows carry no subtype on any axis, so this resolves
         * from {@code propertyType} alone for them and they are never lost.
         */
        String buyerCommercialSubtype,
        /**
         * #2433 — the compact, allowlisted Commercial fact set a result card may
         * summarise, or {@code null} when the listing carries none of them (which
         * includes every non-Commercial listing).
         *
         * <p>APPENDED LAST, and it stays last. {@code commercialSubtype} is still exactly
         * where #2444 put it; {@code buyerCommercialSubtype} was appended by #2458 on main
         * and now sits between the two, which is why this component is no longer adjacent
         * to the subtype it summarises facts for. That ordering is deliberate — main's
         * components stay contiguous and in their merged positions, so a later rebase of
         * anything built on main does not shift them again. The detail surface and the
         * Postgres/OpenSearch parity tests read this record POSITIONALLY, so the order is
         * load-bearing and is pinned by
         * {@code DiscoverCommercialFactsTest#commercialFactsIsAppendedAfterSubtype}.
         *
         * <p>This carries FACTS only. It deliberately holds no subtype or family
         * decision — the canonical taxonomy translation is owned in exactly one place
         * ({@code buyerCommercialSubtype} above, #2458), and a second one riding along on
         * the card's fact payload is precisely what that ownership exists to prevent. The
         * two are not alternatives: one is a resolved taxonomy value, the other a fact
         * payload, and neither substitutes for the other.
         */
        DiscoverCommercialFacts commercialFacts
) {}

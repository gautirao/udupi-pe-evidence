package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.OffsetDateTime;

/**
 * Anon-safe projection for one listing in a school-radius result.
 *
 * <p>This endpoint is anon-only (no authed variant). Exact price is never exposed:
 * {@code pricePaise} is always null/absent; {@code priceBand} carries the coarse label
 * from {@link PriceBand}. A listing with null price_paise yields priceBand=null (omitted)
 * — price is never fabricated.
 *
 * <p>Contains the 20 originally-approved public fields plus, as of #2516, the two
 * allowlisted Commercial identity/fact fields ({@code commercialSubtype} /
 * {@code commercialFacts}) already carried by the City/Area feed's {@code AreaListingCard}
 * (#2433/#2586). Excluded fields (trustTier, reraNumber, reraValid, sellerType, status,
 * updatedAt, lastUpdatedAt, firstPublishedAt) are not declared in this record and are
 * never selected or serialized.
 *
 * <p>trustTier is deliberately excluded from this record (#1239/#1551 — anon-safe exclusion).
 * Do NOT add it here.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record PublicSchoolRadiusListingCard(
        String id,
        String listingNumber,
        String propertyType,
        String title,
        String locality,
        String areaKey,
        String priceBand,
        Double landArea,
        String landAreaUnit,
        Double builtArea,
        String builtAreaUnit,
        Integer bedrooms,
        Double latitude,
        Double longitude,
        String heroImageUrl,
        String listingPurpose,
        String possessionStatus,
        Integer daysOnMarket,
        Boolean backOnMarket,
        OffsetDateTime createdAt,
        /**
         * #2516 — {@code SHOP} or {@code OFFICE} for a commercial listing whose subtype has
         * been declared; {@code null} otherwise. Canonicalised to UPPER case, matching
         * {@code AreaListingCard#commercialSubtype} and {@code DiscoverListingsService}'s
         * shared funnel so all three Discover read paths report the same spelling for the
         * same listing.
         *
         * <p>Before this field existed, this endpoint was the one path
         * ({@code useDiscoverCityListings.ts}'s doc comment named it explicitly) that carried
         * neither the subtype nor the fact columns — a Commercial listing reached through the
         * School-radius journey lost its facts entirely, even though the same listing showed
         * them on the City/Area journey (#2586).
         *
         * <p>APPEND ONLY — this record is deserialised positionally in
         * {@code PublicSchoolRadiusListingsServiceTest} and {@code
         * PublicSchoolRadiusListingsControllerTest}.
         */
        String commercialSubtype,
        /**
         * #2516 — the allowlisted Commercial facts, populated ONLY for a Commercial-family
         * listing and {@code null} for every other row (omitted by {@code NON_NULL}).
         *
         * <p>Read through {@link CommercialFactAuthority#readFrom}, the SAME reader
         * {@code AreaListingCard} and {@code DiscoverListingResponse} use, so this
         * anon-only feed cannot report a different fact for a listing than the other two
         * feeds do. No auth-gating is needed here: this endpoint is permitAll with no
         * authenticated variant, and {@code DiscoverCommercialFacts} is already served to
         * anon callers on the City/Area feed.
         *
         * <p>APPEND ONLY — see the note on {@code commercialSubtype} above.
         */
        DiscoverCommercialFacts commercialFacts
) {}

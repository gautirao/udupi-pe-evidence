package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.UUID;

/**
 * Slim listing card returned per area in the city-first discover endpoint.
 *
 * <p>Auth-aware price projection:
 * <ul>
 *   <li>Authenticated callers: {@code pricePaise} populated, {@code priceBand} null (omitted by NON_NULL).</li>
 *   <li>Anonymous callers: {@code pricePaise} null (omitted), {@code priceBand} populated with
 *       a coarse band label from {@link PriceBand}.</li>
 *   <li>Null price_paise in DB: both fields null/absent for all callers — price is never fabricated.</li>
 * </ul>
 *
 * @param id              listing UUID
 * @param pricePaise      exact asking price in paise (authenticated callers only); null for anon
 * @param priceBand       coarse price band label (anonymous callers only, e.g. "₹50L–1Cr"); null for authed
 * @param propertyType    e.g. "house", "apartment", "land"
 * @param locality        locality label from the listing record
 * @param primaryImageUrl URL of the lowest-position image, or null if none uploaded
 * @param listingPurpose  "sale" or "rent"
 * @param bedrooms        bedroom count, or null when not set
 * @param title             listing title, or null
 * @param bathrooms         bathroom count, or null. RESIDENTIAL-ONLY (#2516): always null for a
 *                          Commercial listing. {@code property_listings.bathrooms} is not nullable
 *                          in practice for commercial inventory — it stores {@code 0} — so passing
 *                          it through rendered "0 bathrooms" on a live Showroom card. A commercial
 *                          space has washrooms, not bathrooms, and the two are different facts;
 *                          projecting one as the other is a Residential semantic leaking into
 *                          Commercial. Washrooms are NOT substituted here: they are not in the
 *                          #2433 allowlist that {@link DiscoverCommercialFacts} carries, and
 *                          widening that allowlist is a privacy-review decision, not a bug fix.
 * @param builtArea         built-up area value, or null
 * @param builtAreaUnit     unit for builtArea (e.g. "sq ft"), or null
 * @param landArea          land area value, or null (agricultural / land plots)
 * @param landAreaUnit      unit for landArea (e.g. "cent", "acre"), or null
 * @param totalFloors       total floors in building, or null (commercial)
 * @param parkingCount      parking spots, or null (commercial)
 * @param furnishingStatus  "furnished", "semi-furnished", "unfurnished", or null (residential rent)
 * @param createdAt         ISO-8601 timestamp when listing was first saved, or null
 * @param trustBadge        public-safe trust badge word ("verified"/"trusted"/"listed"), or null
 *                          when the listing has no badge (D tier, legacy rows, or unknown grade).
 *                          Never the raw internal letter grade — see {@link TrustBadge}.
 * @param latitude          geo-coordinate latitude, or null when not geocoded
 * @param longitude         geo-coordinate longitude, or null when not geocoded
 * @param monthlyRentRupees exact monthly rent in RUPEES (issue #2051) — NOT paise, unlike the
 *                          sibling {@code pricePaise}; authenticated callers only, null for anon.
 *                          Populated only for listingPurpose "rent"/"lease"; always null for "sale".
 * @param monthlyRentBand   coarse monthly-rent band label (e.g. "₹10–20K") from
 *                          {@link MonthlyRentBand}; anonymous callers only, null for authed.
 *                          Populated only for listingPurpose "rent"/"lease"; always null for "sale".
 *                          Mutually exclusive with monthlyRentRupees, mirroring the pricePaise/
 *                          priceBand contract.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AreaListingCard(
        UUID id,
        Long pricePaise,
        String priceBand,
        String propertyType,
        String locality,
        String primaryImageUrl,
        String listingPurpose,
        Integer bedrooms,
        String title,
        Integer bathrooms,
        Double builtArea,
        String builtAreaUnit,
        Double landArea,
        String landAreaUnit,
        Integer totalFloors,
        Integer parkingCount,
        String furnishingStatus,
        String createdAt,
        String trustBadge,
        Double latitude,
        Double longitude,
        Long monthlyRentRupees,
        String monthlyRentBand,
        /**
         * #2433 — {@code SHOP} or {@code OFFICE} for a commercial listing whose subtype has
         * been declared; {@code null} otherwise. Canonicalised to UPPER case, mirroring
         * {@code DiscoverListingsService}'s shared funnel so the two Discover read paths
         * cannot emit different spellings of the same subtype for the same listing.
         *
         * <p><b>Why this endpoint carries it at all.</b> This is the read-model counterpart of
         * #2509, which covers only the QUERY direction (this endpoint cannot be FILTERED by
         * subtype). Without this field the result card could not DISPLAY one either, and that
         * is not merely an omission: {@code buildCommercialSummary}'s legacy-generic branch
         * asserts a claim about the DATA — "this row's Shop-vs-Office was never recorded" —
         * so a card reached through this endpoint would state that falsely for a listing whose
         * subtype IS recorded, indistinguishable from a genuine V102 legacy row. Honest
         * absence requires that absence actually mean absence.
         *
         * <p>APPEND ONLY. Every field above keeps its position; the frontend and the
         * OpenSearch/Postgres parity tests read this record positionally.
         */
        String commercialSubtype,
        /**
         * #2516 — the allowlisted Commercial facts, populated ONLY for a Commercial-family
         * listing and {@code null} for every other row (omitted by {@code NON_NULL}).
         *
         * <p><b>Why this is the same record the authenticated feed uses.</b> Before this
         * field existed, {@code PropertyCard} was fed by two backends that converge on one
         * component: {@code DiscoverListingResponse} (facts) and this card (identity only).
         * In {@code DiscoverRightPanel}, {@code areaListings}, {@code schoolListings},
         * {@code authViewportListings} and {@code polygonListings} are ALL typed
         * {@code DiscoverCityListingItem}, so a signed-in shopper saw Commercial facts on one
         * panel and a thinner card on another — same session, same listing. Sharing the
         * record rather than mirroring its fields is what makes that divergence
         * unrepresentable instead of merely tested for.
         *
         * <p>Both feeds populate it through {@link CommercialFactAuthority#readFrom}, which
         * is also where the V102-vs-V104 source precedence lives (#2506).
         *
         * <p>APPEND ONLY — see the note on {@code commercialSubtype} above.
         */
        DiscoverCommercialFacts commercialFacts
) {}

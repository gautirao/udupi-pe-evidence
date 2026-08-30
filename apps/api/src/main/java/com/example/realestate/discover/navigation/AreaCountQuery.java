package com.example.realestate.discover.navigation;

import com.example.realestate.ai.PropertyType;
import com.example.realestate.discover.DiscoverFilterNormalizer;
import com.example.realestate.discover.DiscoverListingPredicateBuilder;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Filter context for {@link AreaCountProvider} (#1955 Areas PR A, SLICE 2e, AC12; widened #1956
 * PR1 Decision 2).
 *
 * <p><b>ALL normalisation is APPLIED in the compact constructor</b> — allowlisting, casing
 * canonicalisation, dedupe, sort, {@code FALSE}-&gt;{@code null} tri-state collapse, and the
 * "every property type selected" -&gt; blended collapse. This placement is deliberate, not
 * incidental: {@link com.example.realestate.discover.DiscoverSummaryService} constructs this record
 * DIRECTLY (never through {@link NavigationController}), so pushing normalisation into the
 * controller would leave that call site both unguarded (an unrecognised value would reach SQL raw)
 * and its cache key un-normalised (two equivalent-but-differently-cased requests would mint two
 * cache entries instead of colliding onto one).
 *
 * <p><b>The RULES themselves live in {@link DiscoverFilterNormalizer}</b>, not here (#1956 PR1
 * review fix): {@link DiscoverListingPredicateBuilder#build} invokes the very same helpers on every
 * {@code Filters} it is handed, so there is exactly ONE implementation of each rule and the counts
 * path cannot drift from the cards/markers path. This record keeps calling them from the compact
 * constructor purely so the normalisation stays unbypassable for direct constructors.
 *
 * <p><b>Casing bug fix (#1956 PR1).</b> Before this change, the counts path matched {@code
 * propertyType} case-INSENSITIVELY ({@code LOWER(pl.property_type) = LOWER(?)}) while the
 * cards/markers path ({@link DiscoverListingPredicateBuilder}'s {@code propertyTypes IN (?)})
 * matched case-SENSITIVELY against the lower-case stored value — so {@code ?propertyType=APARTMENT}
 * could report a non-zero count next to an empty result list. Canonicalising every {@code
 * propertyTypes} entry to its {@link PropertyType} enum value (always lower-case, matching the
 * stored column) here, then routing BOTH paths through the SAME {@link
 * DiscoverListingPredicateBuilder#build} predicate via {@link #toPredicateFilters()}, closes the
 * gap structurally — there is only one case-sensitivity behaviour in the system, not two.
 *
 * <p><b>Unknown values drop to blended</b> (never throw), mirroring the existing {@code
 * normalizePurpose} precedent: an unrecognised {@code listingPurpose}/{@code propertyTypes}/{@code
 * sellerTypes} entry is silently dropped rather than 400ing — avoids breaking a URL shape the
 * frontend may already emit.
 *
 * <p><b>Applicable filters</b> (mirrors {@link DiscoverListingPredicateBuilder.Filters}' surface,
 * narrowed to what is safe/meaningful for a whole-city aggregate): {@code listingPurpose}, {@code
 * propertyTypes}, price min/max, {@code bedrooms} (upper-clamped to {@code 4}, meaning "4+"), {@code
 * sellerTypes}, the four tri-state booleans ({@code readyToMove}, {@code reraRegistered}, {@code
 * newToMarket}, {@code backOnMarket}), and {@code exposure}.
 *
 * <p><b>Deliberately excluded — contract, not oversight</b>: {@code bbox}, {@code polygon}, {@code
 * q}, school lat/lon/radius, {@code dateFrom}/{@code dateTo}, and {@code areaKeys}. The first group
 * is unbounded-cardinality or viewport-scoped (meaningless against a whole-city aggregate, and a
 * poor cache-key candidate). {@code areaKeys} specifically would make a whole-city aggregate
 * node-scoped, breaking {@link AreaCountProvider}'s "never node-scoped" invariant (see its
 * javadoc) — a node-scoped area-count map could no longer be rolled up through {@link
 * NavigationGraph#descendantAreaKeysOf} by the caller.
 *
 * <p><b>Construction.</b> A 12-component positional constructor is a real hazard (this codebase
 * has a documented near-miss of exactly that shape elsewhere) — prefer {@link #blended(String)}
 * plus the {@code withX(...)} fluent methods. The canonical constructor stays public (existing and
 * new tests construct fixtures directly), but production call sites should use the builder-style
 * API below.
 *
 * @param citySlug        city slug (required)
 * @param listingPurpose  {@code "sale"}/{@code "rent"}, or {@code null} for blended
 * @param propertyTypes   canonical (lower-case, {@link PropertyType}-valid) property types; empty
 *                        list = blended (also reached when every known type was selected)
 * @param priceMinPaise   inclusive lower price bound in paise, or {@code null}
 * @param priceMaxPaise   inclusive upper price bound in paise, or {@code null}
 * @param bedrooms        upper-clamped to {@code 4} ("4 or more"); {@code 0} (studio) is preserved
 *                        and negatives are dropped; empty = no filter
 * @param sellerTypes     canonical (lower-case, allowlisted) seller types; empty = no filter
 * @param readyToMove     {@code null} or {@code true}; {@code false} collapses to {@code null}
 * @param reraRegistered  {@code null} or {@code true}; {@code false} collapses to {@code null}
 * @param newToMarket     {@code null} or {@code true}; {@code false} collapses to {@code null}
 * @param backOnMarket    {@code null} or {@code true}; {@code false} collapses to {@code null}
 * @param exposure        reserved public/anon-teaser vs authenticated tiering tag; never {@code
 *                        null} — defaults to {@code "public"}
 */
public record AreaCountQuery(
        String citySlug,
        String listingPurpose,
        List<String> propertyTypes,
        Long priceMinPaise,
        Long priceMaxPaise,
        List<Integer> bedrooms,
        List<String> sellerTypes,
        Boolean readyToMove,
        Boolean reraRegistered,
        Boolean newToMarket,
        Boolean backOnMarket,
        String exposure) {

    public AreaCountQuery {
        listingPurpose = DiscoverFilterNormalizer.normalizePurpose(listingPurpose);
        propertyTypes = DiscoverFilterNormalizer.normalizePropertyTypes(propertyTypes);
        bedrooms = DiscoverFilterNormalizer.normalizeBedrooms(bedrooms);
        sellerTypes = DiscoverFilterNormalizer.normalizeSellerTypes(sellerTypes);
        readyToMove = collapseFalseToNull(readyToMove);
        reraRegistered = collapseFalseToNull(reraRegistered);
        newToMarket = collapseFalseToNull(newToMarket);
        backOnMarket = collapseFalseToNull(backOnMarket);
        if (exposure == null || exposure.isBlank()) {
            exposure = "public";
        }
    }

    /** Fully-blended (no filter) query for {@code citySlug} — the safe default every caller that
     *  omits every optional filter param should reproduce byte-for-byte. */
    public static AreaCountQuery blended(String citySlug) {
        return new AreaCountQuery(citySlug, null, null, null, null, null, null, null, null, null, null, "public");
    }

    public AreaCountQuery withListingPurpose(String listingPurpose) {
        return new AreaCountQuery(citySlug, listingPurpose, propertyTypes, priceMinPaise, priceMaxPaise,
                bedrooms, sellerTypes, readyToMove, reraRegistered, newToMarket, backOnMarket, exposure);
    }

    public AreaCountQuery withPropertyTypes(List<String> propertyTypes) {
        return new AreaCountQuery(citySlug, listingPurpose, propertyTypes, priceMinPaise, priceMaxPaise,
                bedrooms, sellerTypes, readyToMove, reraRegistered, newToMarket, backOnMarket, exposure);
    }

    public AreaCountQuery withPriceRange(Long priceMinPaise, Long priceMaxPaise) {
        return new AreaCountQuery(citySlug, listingPurpose, propertyTypes, priceMinPaise, priceMaxPaise,
                bedrooms, sellerTypes, readyToMove, reraRegistered, newToMarket, backOnMarket, exposure);
    }

    public AreaCountQuery withBedrooms(List<Integer> bedrooms) {
        return new AreaCountQuery(citySlug, listingPurpose, propertyTypes, priceMinPaise, priceMaxPaise,
                bedrooms, sellerTypes, readyToMove, reraRegistered, newToMarket, backOnMarket, exposure);
    }

    public AreaCountQuery withSellerTypes(List<String> sellerTypes) {
        return new AreaCountQuery(citySlug, listingPurpose, propertyTypes, priceMinPaise, priceMaxPaise,
                bedrooms, sellerTypes, readyToMove, reraRegistered, newToMarket, backOnMarket, exposure);
    }

    public AreaCountQuery withReadyToMove(Boolean readyToMove) {
        return new AreaCountQuery(citySlug, listingPurpose, propertyTypes, priceMinPaise, priceMaxPaise,
                bedrooms, sellerTypes, readyToMove, reraRegistered, newToMarket, backOnMarket, exposure);
    }

    public AreaCountQuery withReraRegistered(Boolean reraRegistered) {
        return new AreaCountQuery(citySlug, listingPurpose, propertyTypes, priceMinPaise, priceMaxPaise,
                bedrooms, sellerTypes, readyToMove, reraRegistered, newToMarket, backOnMarket, exposure);
    }

    public AreaCountQuery withNewToMarket(Boolean newToMarket) {
        return new AreaCountQuery(citySlug, listingPurpose, propertyTypes, priceMinPaise, priceMaxPaise,
                bedrooms, sellerTypes, readyToMove, reraRegistered, newToMarket, backOnMarket, exposure);
    }

    public AreaCountQuery withBackOnMarket(Boolean backOnMarket) {
        return new AreaCountQuery(citySlug, listingPurpose, propertyTypes, priceMinPaise, priceMaxPaise,
                bedrooms, sellerTypes, readyToMove, reraRegistered, newToMarket, backOnMarket, exposure);
    }

    public AreaCountQuery withExposure(String exposure) {
        return new AreaCountQuery(citySlug, listingPurpose, propertyTypes, priceMinPaise, priceMaxPaise,
                bedrooms, sellerTypes, readyToMove, reraRegistered, newToMarket, backOnMarket, exposure);
    }

    /**
     * The ONE {@link DiscoverListingPredicateBuilder.Filters} this query maps to — the same shared
     * predicate every cards/markers read path uses, so a whole-city count and its corresponding
     * card/marker list can never disagree on what counts as a match (#1956 PR1 casing-bug fix).
     * Every deliberately-excluded field (see class javadoc) is passed as {@code null}.
     */
    public DiscoverListingPredicateBuilder.Filters toPredicateFilters() {
        return new DiscoverListingPredicateBuilder.Filters(
                citySlug,
                propertyTypes.isEmpty() ? null : propertyTypes,
                priceMinPaise,
                priceMaxPaise,
                null, // dateFrom — deliberately excluded
                null, // dateTo — deliberately excluded
                bedrooms.isEmpty() ? null : bedrooms,
                sellerTypes.isEmpty() ? null : sellerTypes,
                backOnMarket,
                newToMarket,
                reraRegistered,
                readyToMove,
                null, // polygon — deliberately excluded
                null, // schoolLat — deliberately excluded
                null, // schoolLon — deliberately excluded
                null, // schoolRadiusKm — deliberately excluded
                null, // bbox — deliberately excluded
                null, // q — deliberately excluded
                listingPurpose,
                null, // excludePropertyTypes — not an applicable filter for this query
                null  // areaKeys — deliberately excluded; would break the whole-city invariant
        );
    }

    /**
     * {@code true} when this filter set provably matches nothing, so callers may return an empty
     * count map WITHOUT running SQL and WITHOUT minting a cache entry (#1956 PR1 AC1.15 #7/#8).
     * Delegates to {@link DiscoverFilterNormalizer#isProvablyEmpty} — see there for exactly which
     * filters can prove emptiness and why {@code bedrooms} cannot.
     */
    public boolean isProvablyEmpty() {
        return DiscoverFilterNormalizer.isProvablyEmpty(toPredicateFilters());
    }

    /**
     * Deterministic digest of every non-city dimension — used as part of {@link
     * AreaCountRollupService}'s short-TTL cache key. {@code citySlug} and (for the rollup) {@code
     * revisionId} are folded in separately by the caller, not here. Hashes the CANONICAL
     * (post-normalisation) form, so two requests that normalise to the same filters always collide
     * onto the same cache entry regardless of how the raw input was cased/ordered/duplicated.
     */
    public String normalizedFilterHash() {
        // LENGTH-PREFIXED encoding, not a bare "|" join (#1956 PR1 AC1.15 hardening). Two of these
        // components carry arbitrary user-supplied strings — propertyTypes and sellerTypes now
        // PRESERVE unrecognised values so an impossible filter narrows honestly to zero, and those
        // values can contain the delimiter itself. A bare join was unambiguous only by accident of
        // FIELD ORDERING (the two free-text components happen to be separated by numeric-only
        // fields); reordering the components later would silently make two different filter sets
        // hash identically and share a cached count — a wrong-answer bug with no compile-time
        // signal. Prefixing each component with its own length makes the encoding self-delimiting,
        // so no content and no future reordering can create an ambiguous basis.
        StringBuilder basis = new StringBuilder();
        appendLengthPrefixed(basis, nullToEmpty(listingPurpose));
        appendLengthPrefixed(basis, String.join(",", propertyTypes));
        appendLengthPrefixed(basis, priceMinPaise == null ? "" : priceMinPaise.toString());
        appendLengthPrefixed(basis, priceMaxPaise == null ? "" : priceMaxPaise.toString());
        appendLengthPrefixed(basis, bedrooms.stream().map(String::valueOf).collect(Collectors.joining(",")));
        appendLengthPrefixed(basis, String.join(",", sellerTypes));
        appendLengthPrefixed(basis, boolToken(readyToMove));
        appendLengthPrefixed(basis, boolToken(reraRegistered));
        appendLengthPrefixed(basis, boolToken(newToMarket));
        appendLengthPrefixed(basis, boolToken(backOnMarket));
        appendLengthPrefixed(basis, exposure);
        String raw = basis.toString();
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is guaranteed available on every JVM (JLS/JCA mandated), so this is
            // unreachable. Falling back to `raw` would be WORSE than failing: it returns a value of
            // a completely different shape (variable-length, un-hashed, carrying the literal filter
            // values) into a cache key, which would silently change cache-key semantics rather than
            // surface the impossible-JVM condition. Fail loudly instead.
            throw new IllegalStateException(e);
        }
    }

    // ── Normalisation helpers (compact-constructor only) ────────────────────────────────────────
    //
    // The four vocabulary normalisers (purpose / propertyTypes / bedrooms / sellerTypes) deliberately
    // live in DiscoverFilterNormalizer, NOT here: DiscoverListingPredicateBuilder#build calls the
    // very same helpers, so the counts path and the cards/markers path cannot drift (#1956 PR1
    // review fix, AC1.16). Only the tri-state collapse below is specific to this record's cache-key
    // contract and stays local.

    private static Boolean collapseFalseToNull(Boolean value) {
        return Boolean.TRUE.equals(value) ? Boolean.TRUE : null;
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }

    /**
     * Appends {@code <charLength>:<value>|} — a self-delimiting component encoding. The trailing
     * {@code |} is cosmetic (readability in a debugger); the LENGTH is what makes the basis
     * unambiguous, so a value containing {@code |} or {@code :} cannot be misread as a component
     * boundary. See {@link #normalizedFilterHash} for why a bare join was unsafe.
     */
    private static void appendLengthPrefixed(StringBuilder basis, String value) {
        basis.append(value.length()).append(':').append(value).append('|');
    }

    private static String boolToken(Boolean value) {
        return Boolean.TRUE.equals(value) ? "true" : "";
    }
}

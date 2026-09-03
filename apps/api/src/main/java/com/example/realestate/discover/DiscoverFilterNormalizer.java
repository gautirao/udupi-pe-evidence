package com.example.realestate.discover;

import com.example.realestate.ai.PropertyType;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The ONE place the Discover filter vocabulary is canonicalised (#1956 PR1 review fix, AC1.16).
 *
 * <p><b>Why this exists.</b> Before this class, {@code AreaCountQuery}'s compact constructor
 * canonicalised {@code listingPurpose}/{@code propertyTypes}/{@code bedrooms}/{@code sellerTypes}
 * for the navigation COUNTS path, while the cards/markers path fed the raw, controller-supplied
 * values straight into {@link DiscoverListingPredicateBuilder.Filters} — whose SQL is
 * case-SENSITIVE ({@code pl.property_type IN (?)}, {@code pl.listing_purpose = ?}) against
 * lower-case stored values. That produced four reachable count-vs-list divergences on live URLs:
 *
 * <ul>
 *   <li>{@code propertyTypes=APARTMENT} — counts canonicalised to {@code apartment} and returned a
 *       real number; the listings query matched zero rows.</li>
 *   <li>{@code listingPurpose=SALE} — the counts path's exact-match allowlist DROPPED the value and
 *       returned a BLENDED whole-city count; the listings query ran {@code listing_purpose = 'SALE'}
 *       and matched zero rows. (Worst of the four: a whole-city number beside an empty list.)</li>
 *   <li>{@code sellerTypes=OWNER} — counts canonicalised to {@code owner}; listings matched zero.</li>
 *   <li>{@code bedrooms=9} — counts clamped to {@code >= 4}; listings ran {@code bedrooms IN (9)}.</li>
 * </ul>
 *
 * <p><b>The fix is structural, not a second copy of the rules.</b> {@link #normalize} is invoked by
 * {@link DiscoverListingPredicateBuilder#build} itself, so NO caller can construct a {@code Filters}
 * whose SQL behaves differently from the corresponding count — including callers that never see this
 * class. {@code AreaCountQuery}'s compact constructor calls the SAME per-field helpers below (its
 * normalisation deliberately stays in the compact constructor, where it is unbypassable for
 * {@link DiscoverSummaryService}, which constructs that record directly), so the two paths cannot
 * drift: there is exactly one implementation of each rule.
 *
 * <p><b>Unrecognised values never 400 — but a SCALAR SCOPE and a NARROWING MULTI-SELECT resolve
 * differently, and the distinction is deliberate.</b>
 *
 * <ul>
 *   <li><b>{@code listingPurpose} — optional scalar scope selector.</b> Unknown drops to blended
 *       (all purposes). Omitting a scope is the natural reading of "I did not pick one", and it
 *       matches the pre-existing {@code normalizeListingPurpose} precedent in
 *       {@link DiscoverSummaryService}/{@code RegionSummaryService}.</li>
 *   <li><b>{@code propertyTypes} / {@code sellerTypes} / {@code bedrooms} — narrowing
 *       multi-selects.</b> If the request carries a NON-EMPTY list and NOTHING in it survives
 *       allowlisting, the filter is UNSATISFIABLE and BOTH the count and the result list must be
 *       zero. Emitting "no clause" there would hand a shopper who asked for one property type the
 *       ENTIRE city, presented as if it matched — quietly wrong, and a bigger shopper-visible
 *       change than the honest empty state it would replace. Returning an empty result still
 *       avoids inventing a 400 on a URL shape the frontend may already emit; it simply does not
 *       lie about what matched.</li>
 * </ul>
 *
 * <p>Unsatisfiability is encoded WITHOUT any extra state on {@link
 * DiscoverListingPredicateBuilder.Filters}: the requested values are preserved (trimmed,
 * lower-cased, deduped, sorted) instead of dropped, so the predicate becomes {@code
 * property_type IN ('penthouse')} — which matches nothing, because the column is CHECK-constrained
 * to the known vocabulary. Every engine and every endpoint inherits the behaviour for free, and the
 * count and the list run the identical predicate by construction.
 *
 * <p><b>Not to be confused with the exhaustive-selection collapse.</b> "Every known property type
 * selected" ALSO normalises to an empty list, but that is a provably equivalent no-clause case (all
 * values valid, set exhaustive, column {@code NOT NULL} and constrained to exactly that set), not an
 * unsatisfiable one. The two are separated explicitly in {@link #normalizePropertyTypes}.
 *
 * <p><b>Deliberately NOT normalised here</b>: {@code excludePropertyTypes} (already lower-cased
 * inside {@code build} against {@code LOWER(pl.property_type)}, a different and independently-tested
 * contract), {@code areaKeys} (opaque hierarchy identifiers, case-significant), {@code q}, and every
 * geometry/date field.
 */
public final class DiscoverFilterNormalizer {

    /** Mirrors {@code property_listings.listing_purpose}'s stored (lower-case) vocabulary. */
    static final Set<String> ALLOWED_LISTING_PURPOSES = Set.of("sale", "rent");

    /**
     * The stored (lower-case) {@code property_type} vocabulary, sourced from {@link PropertyType} —
     * which is exactly the {@code chk_listing_property_type} CHECK constraint set as of V103 (11
     * values). Because the column is {@code NOT NULL} and constrained to this same set, "every known
     * type selected" is EXACTLY equivalent to "no type filter", which is why
     * {@link #normalizePropertyTypes} collapses that case to blended.
     */
    static final Set<String> ALLOWED_PROPERTY_TYPES = List.of(PropertyType.values()).stream()
            .map(PropertyType::getValue)
            .collect(Collectors.toUnmodifiableSet());

    /** Mirrors V42's {@code chk_seller_type} CHECK constraint exactly (owner/dealer/broker/builder;
     *  {@code dealer} is legacy but still a valid stored value — see V33/V42). */
    static final Set<String> ALLOWED_SELLER_TYPES = Set.of("owner", "dealer", "broker", "builder");

    /** Smallest MEANINGFUL bedroom count: {@code 0} = studio. Values below this are nonsensical and
     *  are dropped — this is a validity floor, NOT a clamp target (see
     *  {@link #normalizeBedrooms}). */
    static final int MIN_BEDROOMS = 0;

    /** Upper bucket: {@code 4} means "4 or more". Values above collapse onto it. */
    static final int MAX_BEDROOMS = 4;

    // ── Repetition caps for public, unauthenticated query params (#1956 PR1 AC1.15 #5) ──────────
    //
    // These filters accept REPEATED query params, so `?propertyTypes=a&propertyTypes=b&...` is
    // unbounded by default. Since an all-unrecognised list is now PRESERVED rather than dropped
    // (see the unsatisfiability rules above), every repetition would otherwise become one more `?`
    // placeholder and one more bind parameter — reaching PostgreSQL's 65535-bind ceiling as a 500
    // rather than a clean 400, and minting one distinct cache key per distinct list. Callers on
    // public endpoints must reject beyond these caps.

    /** No request can meaningfully name more distinct property types than exist. Derived from
     *  {@link PropertyType}, never hardcoded, so a new enum value raises the cap automatically. */
    public static final int MAX_PROPERTY_TYPE_VALUES = ALLOWED_PROPERTY_TYPES.size();

    /** Likewise for the seller-type vocabulary. */
    public static final int MAX_SELLER_TYPE_VALUES = ALLOWED_SELLER_TYPES.size();

    /**
     * Distinct meaningful bedroom values are {@code 0..4} inclusive — five — since everything above
     * {@code 4} collapses into the "4+" bucket. The cap is {@code 6} rather than {@code 5} to leave
     * one slot of headroom, so a client that harmlessly repeats a value or sends a redundant
     * above-bucket number is not 400'd for it.
     */
    public static final int MAX_BEDROOM_VALUES = (MAX_BEDROOMS - MIN_BEDROOMS + 1) + 1;

    private DiscoverFilterNormalizer() {
    }

    /**
     * Returns {@code f} with its four vocabulary-bearing fields canonicalised; every other field is
     * passed through byte-for-byte. Empty post-normalisation lists become {@code null} so
     * {@link DiscoverListingPredicateBuilder#build} emits NO clause for them (the same "absent"
     * shape a caller that omitted the param would have produced).
     *
     * <p>Idempotent: normalising an already-normalised {@code Filters} returns an equal record, so
     * {@code AreaCountQuery#toPredicateFilters()} passing through {@code build} is a no-op.
     */
    public static DiscoverListingPredicateBuilder.Filters normalize(
            DiscoverListingPredicateBuilder.Filters f) {
        if (f == null) {
            return null;
        }
        List<String> propertyTypes = normalizePropertyTypes(f.propertyTypes());
        List<Integer> bedrooms = normalizeBedrooms(f.bedrooms());
        List<String> sellerTypes = normalizeSellerTypes(f.sellerTypes());
        String listingPurpose = normalizePurpose(f.listingPurpose());

        return new DiscoverListingPredicateBuilder.Filters(
                f.city(),
                propertyTypes.isEmpty() ? null : propertyTypes,
                f.priceMinPaise(),
                f.priceMaxPaise(),
                f.dateFrom(),
                f.dateTo(),
                bedrooms.isEmpty() ? null : bedrooms,
                sellerTypes.isEmpty() ? null : sellerTypes,
                f.backOnMarket(),
                f.newToMarket(),
                f.reraRegistered(),
                f.readyToMove(),
                f.polygon(),
                f.schoolLat(),
                f.schoolLon(),
                f.schoolRadiusKm(),
                f.bbox(),
                f.q(),
                listingPurpose,
                f.excludePropertyTypes(),
                f.areaKeys(),
                f.viewportScope());
    }

    /**
     * {@code true} when the filter set is PROVABLY EMPTY — the whole AND-ed predicate cannot match a
     * single row, so callers may skip the query (and the cache entry) entirely and return zero
     * (#1956 PR1 AC1.15 #7/#8).
     *
     * <p>Holds exactly when {@code propertyTypes} or {@code sellerTypes} is unsatisfiable: a
     * non-empty request in which no value belongs to the stored vocabulary. Both columns are CHECK
     * constrained ({@code chk_listing_property_type}, {@code chk_seller_type}), so a value outside
     * the constraint set provably matches nothing, whatever the other filters say. AND-ing anything
     * onto an already-empty set stays empty, so no other filter can rescue it.
     *
     * <p><b>{@code bedrooms} is deliberately EXCLUDED from this test.</b> No migration establishes a
     * CHECK constraint bounding {@code property_listings.bedrooms} (it is a plain nullable
     * {@code INTEGER} — V0:87), so {@code bedrooms IN (-5)} and {@code bedrooms IN (-7)} are NOT
     * provably empty and are NOT provably equal to each other. Short-circuiting them to a shared
     * zero would be wrong-answer cache poisoning rather than an optimisation. Public callers reject
     * negative bedrooms with a 400 instead — see {@code NavigationController#getCounts}.
     *
     * <p>This is a COST optimisation only: the observable answer is identical to running the query,
     * because the query would have returned nothing.
     */
    public static boolean isProvablyEmpty(DiscoverListingPredicateBuilder.Filters filters) {
        DiscoverListingPredicateBuilder.Filters f = normalize(filters);
        return f != null
                && (isUnsatisfiable(f.propertyTypes(), ALLOWED_PROPERTY_TYPES)
                        || isUnsatisfiable(f.sellerTypes(), ALLOWED_SELLER_TYPES));
    }

    /**
     * {@code true} when a NORMALISED list is non-empty yet shares no value with the stored
     * vocabulary — the shape {@link #preserveUnsatisfiable} produces. A list that kept even one
     * recognised value contains ONLY recognised values (unrecognised siblings are dropped), so a
     * single allowlist hit is enough to prove satisfiability.
     */
    static boolean isUnsatisfiable(List<String> normalized, Set<String> vocabulary) {
        return normalized != null && !normalized.isEmpty() && normalized.stream().noneMatch(vocabulary::contains);
    }

    /**
     * Allowlists {@code listingPurpose} against the stored vocabulary CASE-INSENSITIVELY and returns
     * the canonical (lower-case) form; anything else — including blank — returns {@code null}
     * (blended, all purposes).
     *
     * <p>Case-insensitivity is the #1956 PR1 review fix: this helper used to be exact-match while its
     * {@code propertyTypes}/{@code sellerTypes} siblings were already case-insensitive, so
     * {@code ?purpose=SALE} silently produced a BLENDED count beside a zero-row list.
     */
    public static String normalizePurpose(String listingPurpose) {
        if (listingPurpose == null) {
            return null;
        }
        String trimmed = listingPurpose.trim();
        for (String allowed : ALLOWED_LISTING_PURPOSES) {
            if (allowed.equalsIgnoreCase(trimmed)) {
                return allowed;
            }
        }
        return null;
    }

    /**
     * Allowlists each entry against {@link PropertyType} and canonicalises to its stored (lower-case)
     * value, deduped + sorted.
     *
     * <p>Two distinct empty-ish outcomes, which must NOT be conflated:
     * <ul>
     *   <li><b>Exhaustive selection → {@code List.of()} (no clause).</b> Every known type was
     *       selected; since {@code property_type} is {@code NOT NULL} and CHECK-constrained to
     *       exactly this set, filtering on all of them is provably equivalent to not filtering.</li>
     *   <li><b>Nothing recognised → the requested values, PRESERVED.</b> The request narrowed to
     *       something that cannot exist, so the predicate must match nothing. See
     *       {@link #preserveUnsatisfiable}.</li>
     * </ul>
     */
    public static List<String> normalizePropertyTypes(List<String> propertyTypes) {
        if (propertyTypes == null || propertyTypes.isEmpty()) {
            return List.of();
        }
        Set<String> canonical = new LinkedHashSet<>();
        for (String raw : propertyTypes) {
            if (raw == null) {
                continue;
            }
            String trimmed = raw.trim();
            for (String allowed : ALLOWED_PROPERTY_TYPES) {
                if (allowed.equalsIgnoreCase(trimmed)) {
                    canonical.add(allowed);
                    break;
                }
            }
        }
        if (canonical.isEmpty()) {
            // UNSATISFIABLE — a narrowing request nothing can satisfy. Distinct from the
            // exhaustive-selection collapse immediately below.
            return preserveUnsatisfiable(propertyTypes);
        }
        if (canonical.size() == ALLOWED_PROPERTY_TYPES.size()) {
            // EXHAUSTIVE — provably equivalent to no clause. Never reached via the branch above.
            return List.of();
        }
        List<String> sorted = new ArrayList<>(canonical);
        sorted.sort(String::compareTo);
        return List.copyOf(sorted);
    }

    /**
     * Encodes "this narrowing filter cannot be satisfied" as data rather than as extra state on
     * {@link DiscoverListingPredicateBuilder.Filters}: the caller's own values are kept (trimmed,
     * lower-cased, deduped, sorted) so the emitted predicate — {@code IN ('penthouse')} in Postgres,
     * {@code terms(field, ["penthouse"])} in OpenSearch — matches nothing on both engines, and the
     * count and the result list run the IDENTICAL predicate by construction.
     *
     * <p>Lower-casing is what makes two spellings of the same impossible request
     * ({@code PENTHOUSE} / {@code penthouse}) collapse onto ONE cache entry instead of two.
     *
     * <p>A list containing only {@code null}/blank entries is NOT unsatisfiable — it carries no
     * request at all — so it returns {@code List.of()} (no clause), matching an omitted param.
     */
    private static List<String> preserveUnsatisfiable(List<String> requested) {
        Set<String> kept = new LinkedHashSet<>();
        for (String raw : requested) {
            if (raw == null || raw.isBlank()) {
                continue;
            }
            kept.add(raw.trim().toLowerCase(Locale.ROOT));
        }
        if (kept.isEmpty()) {
            return List.of();
        }
        List<String> sorted = new ArrayList<>(kept);
        sorted.sort(String::compareTo);
        return List.copyOf(sorted);
    }

    /**
     * Normalises bedroom counts: UPPER bound only, then dedupe + sort.
     *
     * <ul>
     *   <li>{@code b > 4} collapses to {@code 4} — the meaningful "4 or more" bucket, and the reason
     *       {@code bedrooms=9} no longer means one thing to a count and another to a listing.</li>
     *   <li>{@code b < 0} is DROPPED as nonsensical input.</li>
     *   <li>Everything else, <b>including {@code 0}</b>, passes through unchanged.</li>
     *   <li>If EVERY value in a non-empty list is dropped (all negative), the filter is
     *       UNSATISFIABLE: the requested values are preserved so {@code bedrooms IN (-5)} matches
     *       nothing, rather than widening to every listing in the city.</li>
     * </ul>
     *
     * <p><b>Why there is no lower clamp</b> (#1956 PR1 review correction). An earlier revision
     * clamped into {@code [1,4]}, which silently rewrote {@code bedrooms=0} (a studio query) into
     * {@code bedrooms=1}. Both endpoints agreed on that answer, but it was the WRONG answer: the
     * results would not match the request — the same "the number does not describe what you are
     * looking at" class of defect AC1.16 exists to prevent. Dropping {@code 0} instead is no better,
     * because an all-dropped list widens to "no bedroom constraint" (an even larger overstatement).
     * Preserving {@code 0} lets the count and the list agree on the HONEST answer.
     */
    public static List<Integer> normalizeBedrooms(List<Integer> bedrooms) {
        if (bedrooms == null || bedrooms.isEmpty()) {
            return List.of();
        }
        Set<Integer> clamped = new LinkedHashSet<>();
        for (Integer b : bedrooms) {
            if (b == null || b < MIN_BEDROOMS) {
                continue;
            }
            clamped.add(Math.min(MAX_BEDROOMS, b));
        }
        if (clamped.isEmpty()) {
            // UNSATISFIABLE — every requested value was negative. Preserve them (deduped + sorted)
            // so `bedrooms IN (-5)` matches nothing instead of widening to the whole city.
            Set<Integer> kept = new LinkedHashSet<>();
            for (Integer b : bedrooms) {
                if (b != null) {
                    kept.add(b);
                }
            }
            if (kept.isEmpty()) {
                return List.of(); // all-null list carries no request at all
            }
            List<Integer> keptSorted = new ArrayList<>(kept);
            keptSorted.sort(Integer::compareTo);
            return List.copyOf(keptSorted);
        }
        List<Integer> sorted = new ArrayList<>(clamped);
        sorted.sort(Integer::compareTo);
        return List.copyOf(sorted);
    }

    /**
     * Allowlists each entry against the stored {@code seller_type} vocabulary case-insensitively,
     * canonicalises to lower case, dedupes + sorts.
     *
     * <p>A non-empty list where nothing is recognised is UNSATISFIABLE, not blended — see
     * {@link #preserveUnsatisfiable}. There is no exhaustive-selection collapse here: unlike
     * {@code property_type}, selecting all four seller types is not provably equivalent to no
     * filter, because {@code seller_type} is nullable.
     */
    public static List<String> normalizeSellerTypes(List<String> sellerTypes) {
        if (sellerTypes == null || sellerTypes.isEmpty()) {
            return List.of();
        }
        Set<String> canonical = new LinkedHashSet<>();
        for (String raw : sellerTypes) {
            if (raw == null) {
                continue;
            }
            String trimmed = raw.trim();
            for (String allowed : ALLOWED_SELLER_TYPES) {
                if (allowed.equalsIgnoreCase(trimmed)) {
                    canonical.add(allowed);
                    break;
                }
            }
        }
        if (canonical.isEmpty()) {
            return preserveUnsatisfiable(sellerTypes);
        }
        List<String> sorted = new ArrayList<>(canonical);
        sorted.sort(String::compareTo);
        return List.copyOf(sorted);
    }
}

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

    /**
     * The {@link DiscoverListingPredicateBuilder.Filters} component names whose VALUES this
     * normaliser canonicalises in {@link #normalize} — the authoritative "vocabulary-bearing
     * filter key" contract that downstream persisted-filter consumers (saved searches, #2019)
     * bind to. {@code DiscoverFilterNormalizerTest}/{@code SavedSearchFilterAllowlistParityTest}
     * prove by construction that {@link #normalize} changes exactly these components and no
     * others, so adding a normalised field here without teaching every consumer about it fails
     * a test rather than silently drifting.
     */
    public static final Set<String> VOCABULARY_FILTER_KEYS =
            Set.of("listingPurpose", "propertyTypes", "commercialSubtypes", "bedrooms", "sellerTypes");

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

    /**
     * The Discover-facing buyer subtype vocabulary (#2458): the five Commercial peers the approved
     * #2429 buyer model exposes.
     *
     * <h2>#2458 — DELIBERATE REVERSAL of the #2431 narrowing. Read this before narrowing it again.</h2>
     *
     * <p>This set previously held only {@code SHOP} and {@code OFFICE}, and the reasoning was
     * recorded here as: BUILDING/WAREHOUSE/LAND "are not ambiguous and are already addressable
     * through their own {@code property_type} tokens", so offering them again as a Discover subtype
     * filter "would create two spellings of one query and a second place for the taxonomy to drift".
     *
     * <p><b>That argument holds only if {@code property_type} alone can express every buyer
     * selection. Under #2429 it cannot.</b> An approved MIXED selection — Shop + Warehouse/Godown —
     * needs ONE predicate spanning BOTH axes. While the two lists were ANDed, the Warehouse row
     * passed {@code property_type IN (...)} and was then eliminated by
     * {@code UPPER(commercial_subtype) IN ('SHOP')}, because it has no Shop/Office projection. The
     * approved selection was therefore unexpressible, which is what #2458 exists to correct.
     *
     * <p><b>The original objection is answered, not overridden.</b> There is still exactly ONE query
     * spelling — a single predicate in {@link DiscoverListingPredicateBuilder#build}, mirrored once
     * in {@code DiscoverQueryDsl} — and ONE vocabulary declaration, this one. The subtype axis is
     * not a second addressing scheme; it is the disambiguator for the property types that need it,
     * which is precisely what {@link #SUBTYPE_BEARING_PROPERTY_TYPES} names.
     *
     * <p>Stored UPPER-case by the write path; the predicate normalises the column with
     * {@code UPPER()} rather than trusting that, since no CHECK constraint enforces it.
     *
     * @see #SUBTYPE_BEARING_PROPERTY_TYPES
     */
    static final Set<String> ALLOWED_COMMERCIAL_SUBTYPES =
            Set.of("SHOP", "OFFICE", "BUILDING", "WAREHOUSE", "LAND");

    /**
     * The {@code property_type} values whose subtype is SUPPLIED by the author rather than DERIVED
     * from the property type — i.e. the types the subtype axis must disambiguate (#2458).
     *
     * <p>This is the read-side projection of a distinction the WRITE path already makes:
     * {@code ListingController#resolveCommercialSubtype} DERIVES the subtype for
     * {@code commercial_building}/{@code warehouse}/{@code commercial_land} and ACCEPTS it only for
     * {@code commercial}. This set is exactly that ACCEPTS branch. It is NOT a second source of
     * truth — {@code DiscoverFilterNormalizerAuthorityParityTest} asserts the two agree, and fails
     * the build if a type becomes subtype-bearing on the write path without entering this set.
     *
     * <p><b>Cardinality is not assumed anywhere.</b> {@link DiscoverListingPredicateBuilder#build}
     * is written against this SET, not against the literal {@code 'commercial'}, so introducing a
     * second subtype-bearing type is a one-line addition here with NO predicate change. An earlier
     * draft of #2458 encoded "commercial is the unique ambiguous token" into the predicate and
     * merely documented the liability; PLAN_REVIEW correctly rejected that, on the grounds that a
     * disclosed liability is still a liability.
     *
     * <p><b>lcsd is NOT authoritative for all five peers — a correction worth stating.</b> It is the
     * read-model source for the SHOP/OFFICE discrimination WITHIN {@code property_type='commercial'},
     * and for nothing else. BUILDING, WAREHOUSE and LAND are discriminated by {@code property_type}
     * ITSELF: those rows have no {@code listing_commercial_space_details} row at all, because their
     * detail lives in their own child tables, which carry no {@code commercial_subtype} column. A
     * predicate that resolved subtype through the lcsd join alone would silently miss exactly those
     * three — which is why the non-bearing branch never consults it.
     *
     * <p><b>Failure direction, by construction:</b> a subtype-bearing type missing from this set is
     * matched by {@code property_type} alone and ignores subtype narrowing — OVER-inclusive and
     * visible, never silently under-inclusive. A filter that shows too much is a visible bug; one
     * that quietly hides inventory is the harm #2458 exists to remove.
     *
     * <p><b>Public deliberately</b>, unlike most constants here: {@code DiscoverQueryDsl} lives in
     * the {@code .opensearch} subpackage and is the OpenSearch half of this contract. Both engines
     * MUST split bearing from non-bearing identically or membership diverges, which is #2458's HOLD
     * condition — so they share this one declaration rather than each keeping a copy. Narrowing it
     * back to package-private would force the DSL to duplicate the set, which is the exact drift
     * this contract exists to prevent.
     */
    public static final Set<String> SUBTYPE_BEARING_PROPERTY_TYPES = Set.of("commercial");

    /**
     * The canonical buyer-subtype → stored {@code property_type} mapping (#2458). The SINGLE
     * declaration of the Commercial taxonomy on the server; every other use derives from it.
     *
     * <p>Read in the forward direction it answers "which stored type does this buyer peer live in";
     * inverted it answers "which peer does this row belong to". Those are the query direction and
     * the display direction of ONE function, which is why they must not be declared twice — the
     * whole point of #2458 is that the storage taxonomy is translated exactly once.
     *
     * <p>SHOP and OFFICE both map to {@code commercial} because that is the one stored type the
     * subtype axis has to disambiguate; the other three are self-describing, which is precisely the
     * asymmetry {@link #SUBTYPE_BEARING_PROPERTY_TYPES} names.
     */
    static final java.util.Map<String, String> BUYER_SUBTYPE_TO_PROPERTY_TYPE = java.util.Map.of(
            "SHOP", "commercial",
            "OFFICE", "commercial",
            "BUILDING", "commercial_building",
            "WAREHOUSE", "warehouse",
            "LAND", "commercial_land");

    /**
     * The property types implied by a buyer subtype selection, for the case where a request carries
     * subtypes but NO explicit property types (#2458).
     *
     * <p>Not reachable from the UI — the frontend adds the family token whenever a subtype is
     * picked — but reachable from a hand-edited URL, which is exactly why it needs a defined answer
     * rather than whatever falls out. The two wrong answers are both silent:
     *
     * <ul>
     *   <li>leaving the property type unconstrained WIDENS the result to every type, which #2458's
     *       AC11 forbids ("unknown URL values must never widen results silently");</li>
     *   <li>matching on the subtype axis alone DROPS the legacy Building/Warehouse/Land rows, which
     *       carry no {@code listing_commercial_space_details} row — the exact defect this contract
     *       exists to remove.</li>
     * </ul>
     *
     * <p>Deriving the implied types avoids both: {@code ?subtype=WAREHOUSE} means the same set of
     * rows as {@code ?type=warehouse&subtype=WAREHOUSE}, legacy rows included.
     *
     * <p>Returns a deduped, sorted list so the emitted SQL and its bind order are deterministic —
     * two requests naming the same subtypes must produce one cache key, not several.
     */
    public static List<String> impliedPropertyTypes(List<String> commercialSubtypes) {
        if (commercialSubtypes == null || commercialSubtypes.isEmpty()) {
            return List.of();
        }
        return commercialSubtypes.stream()
                .map(s -> s == null ? null : BUYER_SUBTYPE_TO_PROPERTY_TYPE.get(
                        s.trim().toUpperCase(Locale.ROOT)))
                .filter(java.util.Objects::nonNull)
                .distinct()
                .sorted()
                .toList();
    }


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

    /** Likewise for the Discover buyer subtype vocabulary (#2458) — derived from the set, never
     *  hardcoded, so widening the vocabulary raises the cap automatically (it went 2 -> 5 with the
     *  #2431 reversal without this line changing). */
    public static final int MAX_COMMERCIAL_SUBTYPE_VALUES = ALLOWED_COMMERCIAL_SUBTYPES.size();

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
        List<String> commercialSubtypes = normalizeCommercialSubtypes(f.commercialSubtypes());

        return new DiscoverListingPredicateBuilder.Filters(
                f.city(),
                propertyTypes.isEmpty() ? null : propertyTypes,
                commercialSubtypes.isEmpty() ? null : commercialSubtypes,
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
                f.viewportScope(),
                // #2459 area bounds are NOT vocabulary-bearing — they are numeric, carry no
                // allowlist and no casing, and are passed through byte-for-byte. They are absent
                // from VOCABULARY_FILTER_KEYS for exactly that reason.
                f.areaMinSqft(),
                f.areaMaxSqft());
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
     * Allowlists each entry against {@link #ALLOWED_COMMERCIAL_SUBTYPES} case-insensitively and
     * canonicalises to the stored UPPER-case form, deduped + sorted (#2431).
     *
     * <p><b>No exhaustive-selection collapse.</b> Selecting BOTH Shop and Office is NOT equivalent
     * to no filter, because {@code commercial_subtype} is nullable and legacy V102-backfilled
     * commercial rows carry NULL. Collapsing would silently readmit those un-disambiguated rows
     * into a result set the buyer explicitly narrowed to "Shop or Office" — fabricating a
     * classification the data does not support. Same reasoning as {@link #normalizeSellerTypes},
     * and the opposite of {@link #normalizePropertyTypes}, whose column is {@code NOT NULL} and
     * CHECK-constrained.
     *
     * <p>A non-empty list where nothing is recognised is UNSATISFIABLE, not blended: the requested
     * values are preserved (upper-cased, deduped, sorted) so the predicate matches nothing rather
     * than widening to every listing in the city. Public callers reject unknown values with a 400
     * BEFORE reaching here (the issue's "unknown values fail deterministically" contract — a new
     * param has no legacy URL shape to protect, unlike {@code propertyTypes}); this branch is the
     * fail-closed backstop for any non-controller caller.
     */
    public static List<String> normalizeCommercialSubtypes(List<String> commercialSubtypes) {
        if (commercialSubtypes == null || commercialSubtypes.isEmpty()) {
            return List.of();
        }
        Set<String> canonical = new LinkedHashSet<>();
        for (String raw : commercialSubtypes) {
            if (raw == null) {
                continue;
            }
            String trimmed = raw.trim();
            for (String allowed : ALLOWED_COMMERCIAL_SUBTYPES) {
                if (allowed.equalsIgnoreCase(trimmed)) {
                    canonical.add(allowed);
                    break;
                }
            }
        }
        if (canonical.isEmpty()) {
            return preserveUnsatisfiableUpper(commercialSubtypes);
        }
        List<String> sorted = new ArrayList<>(canonical);
        sorted.sort(String::compareTo);
        return List.copyOf(sorted);
    }

    /**
     * {@link #preserveUnsatisfiable}'s UPPER-case twin, for the one filter whose stored vocabulary
     * is upper-case rather than lower-case. Same contract: keep the caller's own values so the
     * emitted predicate matches nothing, and collapse spelling variants of the same impossible
     * request onto ONE cache entry.
     */
    private static List<String> preserveUnsatisfiableUpper(List<String> requested) {
        Set<String> kept = new LinkedHashSet<>();
        for (String raw : requested) {
            if (raw == null || raw.isBlank()) {
                continue;
            }
            kept.add(raw.trim().toUpperCase(Locale.ROOT));
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

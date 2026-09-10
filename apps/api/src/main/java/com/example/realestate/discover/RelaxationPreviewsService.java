package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * Backs {@code GET /api/discover/areas/relaxation-previews} — deterministic, real-count previews of
 * single-filter relaxations for the zero-result recovery panel (#2018 slice 2).
 *
 * <p>Mock parity: {@code ui_kits/new_discover/src/exp-data.js}'s {@code relaxations(keys, f)}
 * (L259-278) — same vocabulary, same "first candidate with a non-zero count wins" rule per filter,
 * same fixed ordering, same cap. The mock's fifth row ({@code verified} → "Include Trusted and
 * Listed homes") is deliberately NOT implemented: it has no production filter to map onto
 * (trust tier is not an active discover filter), and inventing one would produce a row whose count
 * means nothing.
 *
 * <h2>Honesty rules this class enforces structurally</h2>
 * <ul>
 *   <li><b>Real counts, one predicate source.</b> Every count comes from
 *       {@link DiscoverListingPredicateBuilder#build} — the SAME builder the listings and markers
 *       endpoints use — applied to a Filters value that differs from the active one in exactly one
 *       component. No count is estimated, extrapolated or computed by a second code path, so a
 *       preview cannot disagree with what the shopper sees after applying it.</li>
 *   <li><b>One change at a time.</b> Each candidate is produced by a single {@code with*} copy of
 *       the active filters. There is no code path that varies two components at once.</li>
 *   <li><b>No unbounded broadening.</b> Price is capped at {@link #PRICE_MULTIPLIERS}' largest
 *       multiplier; geography, purpose, city and category are never touched — {@code city},
 *       {@code listingPurpose}, {@code areaKeys}, {@code polygon}, {@code viewportScope} and
 *       {@code bbox} are copied through every candidate unchanged.</li>
 *   <li><b>Deterministic.</b> Output order is {@link RelaxationPreview.Kind}'s declaration order,
 *       not count order and not query order. Identical input always yields byte-identical output.</li>
 *   <li><b>No N+1.</b> All candidate counts plus the baseline are computed in ONE statement by
 *       conditional aggregation ({@code COUNT(*) FILTER (WHERE …)}), over a single bounded scan.</li>
 * </ul>
 *
 * <h2>Why the outer WHERE is safe</h2>
 * The statement is
 * {@code SELECT COUNT(*) FILTER (WHERE <candidate_i>) … FROM property_listings pl WHERE <envelope>},
 * where {@code <envelope>} is the predicate built from ONLY the never-relaxed components
 * (city, listingPurpose and the committed {@link RelaxationScope} — area keys, polygon or viewport
 * (#2454) — plus the builder's always-on LIVE/not-archived/not-duplicate base clause). Every
 * candidate predicate retains all three of those components and only removes or widens others, so
 * every candidate's row set is a SUBSET of the envelope's: filtering the scan by the envelope cannot
 * drop a row any candidate would have counted. The envelope also keeps the scan index-eligible and
 * bounded to the committed scope rather than the whole city.
 */
@Service
public class RelaxationPreviewsService {

    private static final Logger log = LoggerFactory.getLogger(RelaxationPreviewsService.class);

    /**
     * Price ladder, mirroring the mock ({@code exp-data.js} L261): try the active maximum times
     * each multiplier in turn, rounded to the nearest ₹1 lakh, and offer the FIRST that yields a
     * match. 3× is the hard ceiling — the issue forbids "unsafe/unbounded broadening", so there is
     * no fallback beyond this ladder.
     */
    static final double[] PRICE_MULTIPLIERS = {1.2, 1.6, 2.0, 3.0};

    /** Rounding granularity for a proposed maximum price, in rupees (₹1 lakh). */
    static final long PRICE_ROUNDING_RUPEES = 100_000L;

    /** Bedroom values below this are not proposed; 0 BHK is not a thing shoppers ask for. */
    static final int MIN_BEDROOM_CANDIDATE = 1;

    static final int MIN_LIMIT = 1;
    static final int MAX_LIMIT = 6;
    /** Mock parity ({@code exp-data.js} L277: {@code out.slice(0, 4)}). */
    static final int DEFAULT_LIMIT = 4;

    /** Defense in depth: refuse to build a query over an unbounded scope key list. */
    static final int MAX_AREA_KEYS = 25;

    private final JdbcOperations jdbcOperations;

    public RelaxationPreviewsService(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    /**
     * @param rawAreaKeys the committed AREA / AREA_SET canonical keys. Null or empty yields an
     *                    empty preview list rather than a city-wide answer — silently answering for
     *                    the whole city would be the exact unrequested broadening the issue forbids.
     *                    VIEWPORT and POLYGON scopes use {@link #findPreviewsForScope} (#2454).
     * @param rawLimit    max previews to return; clamped to [{@value #MIN_LIMIT}, {@value #MAX_LIMIT}]
     * @param filters     the ACTIVE discover filters; {@code filters.city()} must equal {@code city}
     */
    public RelaxationPreviewsResponse findPreviews(
            String city,
            List<String> rawAreaKeys,
            Integer rawLimit,
            DiscoverListingPredicateBuilder.Filters filters) {

        List<String> areaKeys = dedupeAndCap(rawAreaKeys);

        if (areaKeys.isEmpty()) {
            // Not an error: an area-keyed request with no keys gets an honest empty list, which
            // the panel renders as "no single filter change helps here" — never a city-wide answer.
            return new RelaxationPreviewsResponse(city, areaKeys, 0L, List.of());
        }

        return findPreviewsForScope(city, new RelaxationScope.AreaKeys(areaKeys), rawLimit, filters);
    }

    /**
     * #2454 — the scope-aware entry point. The area-keyed overload above delegates here; the
     * POLYGON and VIEWPORT variants call it directly with a scope their controller has already
     * validated ({@link PolygonGeographicSafetyPolicy} / {@link BboxParser} respectively).
     *
     * <p>The parity invariant is unchanged by the scope kind: every count comes from
     * {@link DiscoverListingPredicateBuilder#build} applied to the active filters re-scoped to
     * {@code scope} — the same {@code polygon} / {@code viewportScope} / {@code areaKeys} clause the
     * listings query applies — so a preview under any scope equals what the shopper gets after
     * applying it.
     *
     * @param scope    the committed result scope; never null (a null scope is a caller bug, not a
     *                 request to answer city-wide)
     * @param rawLimit max previews to return; clamped to [{@value #MIN_LIMIT}, {@value #MAX_LIMIT}]
     * @param filters  the ACTIVE discover filters; {@code filters.city()} must equal {@code city}
     */
    public RelaxationPreviewsResponse findPreviewsForScope(
            String city,
            RelaxationScope scope,
            Integer rawLimit,
            DiscoverListingPredicateBuilder.Filters filters) {

        if (scope == null) {
            throw new IllegalArgumentException("relaxation scope must not be null");
        }
        int limit = clampLimit(rawLimit);
        List<String> areaKeys = scope instanceof RelaxationScope.AreaKeys a ? a.areaKeys() : List.of();

        // The active filters, re-scoped to exactly the committed scope. This is the baseline
        // every candidate is a one-component variation of.
        DiscoverListingPredicateBuilder.Filters active = withScope(filters, scope);

        List<Candidate> candidates = buildCandidates(active);

        // Slot 0 is always the baseline; candidate i lands in slot i+1.
        List<DiscoverListingPredicateBuilder.Sql> fragments = new ArrayList<>();
        fragments.add(DiscoverListingPredicateBuilder.build(active));
        for (Candidate c : candidates) {
            fragments.add(DiscoverListingPredicateBuilder.build(c.filters()));
        }

        DiscoverListingPredicateBuilder.Sql envelope =
                DiscoverListingPredicateBuilder.build(envelopeFilters(active, scope));

        StringBuilder select = new StringBuilder("SELECT ");
        List<Object> args = new ArrayList<>();
        for (int i = 0; i < fragments.size(); i++) {
            if (i > 0) {
                select.append(", ");
            }
            select.append("COUNT(*) FILTER (WHERE ").append(fragments.get(i).whereFragment())
                  .append(") AS c").append(i);
            args.addAll(fragments.get(i).params());
        }
        select.append(" FROM property_listings pl WHERE ").append(envelope.whereFragment());
        args.addAll(envelope.params());

        String sql = select.toString();

        long[] counts = jdbcOperations.queryForObject(sql, (rs, rowNum) -> {
            long[] row = new long[fragments.size()];
            for (int i = 0; i < row.length; i++) {
                row[i] = rs.getLong("c" + i);
            }
            return row;
        }, args.toArray());

        long baselineCount = counts != null && counts.length > 0 ? counts[0] : 0L;

        // First non-zero candidate WINS PER KIND, in candidate order — the mock's `break` after a
        // successful probe. A kind with no non-zero candidate contributes no row at all rather than
        // a "→ 0 listings" row, which would be a suggestion that demonstrably does not help.
        Map<RelaxationPreview.Kind, RelaxationPreview> chosen =
                new EnumMap<>(RelaxationPreview.Kind.class);
        for (int i = 0; i < candidates.size(); i++) {
            Candidate c = candidates.get(i);
            long count = counts != null ? counts[i + 1] : 0L;
            if (count > 0 && !chosen.containsKey(c.kind())) {
                chosen.put(c.kind(), c.toPreview(count));
            }
        }

        // Deterministic output order: the Kind enum's declaration order, independent of how many
        // probes each kind needed and independent of the counts themselves.
        List<RelaxationPreview> previews = chosen.entrySet().stream()
                .sorted(Comparator.comparing(Map.Entry::getKey))
                .map(Map.Entry::getValue)
                .limit(limit)
                .toList();

        log.debug("findPreviews city={} scope={} areaKeys={} baseline={} probes={} previews={}",
                city, scope.kind(), areaKeys, baselineCount, candidates.size(), previews.size());

        return new RelaxationPreviewsResponse(city, scope.kind(), areaKeys, baselineCount, previews);
    }

    /**
     * The ordered probe list. Within a kind, probes run widest-last: the first one that matches
     * anything is the SMALLEST change that helps, which is what the shopper is offered.
     */
    private static List<Candidate> buildCandidates(DiscoverListingPredicateBuilder.Filters active) {
        List<Candidate> out = new ArrayList<>();

        // 1. PRICE_MAX — raise the ceiling one band at a time. Only offered when a ceiling is set;
        //    with no maximum there is nothing to raise.
        if (active.priceMaxPaise() != null && active.priceMaxPaise() > 0) {
            long currentRupees = active.priceMaxPaise() / 100L;
            Set<Long> seen = new LinkedHashSet<>();
            for (double multiplier : PRICE_MULTIPLIERS) {
                long next = roundToLakh(Math.round(currentRupees * multiplier));
                if (next <= currentRupees || !seen.add(next)) {
                    continue; // rounding collapsed this rung onto the current or a previous one
                }
                out.add(Candidate.priceMax(withPriceMaxPaise(active, next * 100L), next));
            }
        }

        // 2. READY_TO_MOVE — drop the possession constraint. Never inverted to "under construction
        //    only": that is a different search, not a relaxation of this one.
        if (Boolean.TRUE.equals(active.readyToMove())) {
            out.add(Candidate.readyToMove(withReadyToMove(active, null)));
        }

        // 3. BEDROOMS — include the adjacent (next lower) count, then the one below that, and only
        //    as a last resort drop the constraint entirely.
        List<Integer> beds = active.bedrooms();
        if (beds != null && !beds.isEmpty()) {
            int min = beds.stream().mapToInt(Integer::intValue).min().orElse(MIN_BEDROOM_CANDIDATE);
            for (int b = min - 1; b >= MIN_BEDROOM_CANDIDATE; b--) {
                List<Integer> widened = new ArrayList<>(new TreeSet<>(beds));
                widened.add(b);
                widened.sort(Comparator.naturalOrder());
                out.add(Candidate.bedrooms(withBedrooms(active, widened), widened));
            }
            out.add(Candidate.bedrooms(withBedrooms(active, null), List.of()));
        }

        // 4. PROPERTY_TYPES — drop the type restriction. A partial widening would need a canonical
        //    "adjacent type" notion, which does not exist; clearing is the only honest offer.
        if (active.propertyTypes() != null && !active.propertyTypes().isEmpty()) {
            out.add(Candidate.propertyTypes(withPropertyTypes(active, null), List.of()));
        }

        return out;
    }

    /**
     * The never-relaxed core: city, purpose and the committed scope (area keys, polygon or
     * viewport), plus the builder's always-on base clause. Deliberately built from a Filters with
     * every other component null, so adding a new relaxable filter later cannot silently narrow
     * the envelope and corrupt the candidate counts.
     */
    private static DiscoverListingPredicateBuilder.Filters envelopeFilters(
            DiscoverListingPredicateBuilder.Filters active, RelaxationScope scope) {
        return withScope(new DiscoverListingPredicateBuilder.Filters(
                active.city(),
                null, null, null, null, null, null, null,
                null, null, null, null,
                null, null, null, null,
                null, null,
                active.listingPurpose(),
                null,
                null,
                null), scope);
    }

    /**
     * Re-scopes {@code f} to exactly {@code scope}: the matching component is set and the other
     * two scope components are cleared, so the committed scope is authoritative over anything a
     * client may have left in the filter set (#2016 exclusivity, enforced structurally here as
     * well as at the controllers).
     *
     * <p><b>Surface parity (#2457).</b> An AREA / AREA_SET preview promises what the area-first
     * panel ({@code GET /api/discover/cities/{city}/listings?areaKeys=…}, {@link
     * CityAreaListingsService}) will render, and that panel excludes
     * {@link CityAreaListingsService#AREA_FIRST_EXCLUDED_PROPERTY_TYPES} unconditionally. The same
     * exclusion is therefore stamped here — the ONE place the scope is committed — so the
     * baseline, every candidate (each a verbatim {@code with*} copy of this result) and the
     * envelope all inherit it, and a preview can never count agricultural inventory the
     * Residential results panel will not display. POLYGON and VIEWPORT are deliberately NOT
     * touched: their listings paths go through {@code DiscoverListingPredicateBuilder} with the
     * caller's own {@code excludePropertyTypes}, which is what {@code f} already carries.
     */
    private static DiscoverListingPredicateBuilder.Filters withScope(
            DiscoverListingPredicateBuilder.Filters f, RelaxationScope scope) {
        List<String> areaKeys = scope instanceof RelaxationScope.AreaKeys a ? a.areaKeys() : null;
        List<List<Double>> polygon = scope instanceof RelaxationScope.Polygon p ? p.polygon() : null;
        DiscoverListingPredicateBuilder.Bbox viewport =
                scope instanceof RelaxationScope.Viewport v ? v.bounds() : null;
        List<String> excludePropertyTypes = areaKeys != null
                ? CityAreaListingsService.AREA_FIRST_EXCLUDED_PROPERTY_TYPES
                : f.excludePropertyTypes();
        return new DiscoverListingPredicateBuilder.Filters(
                f.city(), f.propertyTypes(), f.priceMinPaise(), f.priceMaxPaise(), f.dateFrom(),
                f.dateTo(), f.bedrooms(), f.sellerTypes(), f.backOnMarket(), f.newToMarket(),
                f.reraRegistered(), f.readyToMove(), polygon, f.schoolLat(), f.schoolLon(),
                f.schoolRadiusKm(), f.bbox(), f.q(), f.listingPurpose(), excludePropertyTypes,
                areaKeys, viewport);
    }

    private static long roundToLakh(long rupees) {
        return Math.round((double) rupees / PRICE_ROUNDING_RUPEES) * PRICE_ROUNDING_RUPEES;
    }

    private static List<String> dedupeAndCap(List<String> raw) {
        if (raw == null || raw.isEmpty()) {
            return List.of();
        }
        Set<String> seen = new LinkedHashSet<>();
        for (String key : raw) {
            if (key != null && !key.isBlank()) {
                seen.add(key.trim());
            }
            if (seen.size() == MAX_AREA_KEYS) {
                break;
            }
        }
        return List.copyOf(seen);
    }

    private static int clampLimit(Integer rawLimit) {
        int value = rawLimit != null ? rawLimit : DEFAULT_LIMIT;
        return Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, value));
    }

    // ---- single-component copies -------------------------------------------------------------
    // Records have no wither syntax, so each variation is spelled out. Every one of these copies
    // ALL other components verbatim — that is what makes "one change at a time" structural.

    private static DiscoverListingPredicateBuilder.Filters withPriceMaxPaise(
            DiscoverListingPredicateBuilder.Filters f, Long priceMaxPaise) {
        return new DiscoverListingPredicateBuilder.Filters(
                f.city(), f.propertyTypes(), f.priceMinPaise(), priceMaxPaise, f.dateFrom(),
                f.dateTo(), f.bedrooms(), f.sellerTypes(), f.backOnMarket(), f.newToMarket(),
                f.reraRegistered(), f.readyToMove(), f.polygon(), f.schoolLat(), f.schoolLon(),
                f.schoolRadiusKm(), f.bbox(), f.q(), f.listingPurpose(), f.excludePropertyTypes(),
                f.areaKeys(), f.viewportScope());
    }

    private static DiscoverListingPredicateBuilder.Filters withReadyToMove(
            DiscoverListingPredicateBuilder.Filters f, Boolean readyToMove) {
        return new DiscoverListingPredicateBuilder.Filters(
                f.city(), f.propertyTypes(), f.priceMinPaise(), f.priceMaxPaise(), f.dateFrom(),
                f.dateTo(), f.bedrooms(), f.sellerTypes(), f.backOnMarket(), f.newToMarket(),
                f.reraRegistered(), readyToMove, f.polygon(), f.schoolLat(), f.schoolLon(),
                f.schoolRadiusKm(), f.bbox(), f.q(), f.listingPurpose(), f.excludePropertyTypes(),
                f.areaKeys(), f.viewportScope());
    }

    private static DiscoverListingPredicateBuilder.Filters withBedrooms(
            DiscoverListingPredicateBuilder.Filters f, List<Integer> bedrooms) {
        return new DiscoverListingPredicateBuilder.Filters(
                f.city(), f.propertyTypes(), f.priceMinPaise(), f.priceMaxPaise(), f.dateFrom(),
                f.dateTo(), bedrooms, f.sellerTypes(), f.backOnMarket(), f.newToMarket(),
                f.reraRegistered(), f.readyToMove(), f.polygon(), f.schoolLat(), f.schoolLon(),
                f.schoolRadiusKm(), f.bbox(), f.q(), f.listingPurpose(), f.excludePropertyTypes(),
                f.areaKeys(), f.viewportScope());
    }

    private static DiscoverListingPredicateBuilder.Filters withPropertyTypes(
            DiscoverListingPredicateBuilder.Filters f, List<String> propertyTypes) {
        return new DiscoverListingPredicateBuilder.Filters(
                f.city(), propertyTypes, f.priceMinPaise(), f.priceMaxPaise(), f.dateFrom(),
                f.dateTo(), f.bedrooms(), f.sellerTypes(), f.backOnMarket(), f.newToMarket(),
                f.reraRegistered(), f.readyToMove(), f.polygon(), f.schoolLat(), f.schoolLon(),
                f.schoolRadiusKm(), f.bbox(), f.q(), f.listingPurpose(), f.excludePropertyTypes(),
                f.areaKeys(), f.viewportScope());
    }

    /** One probe: the filters to count, plus how to describe the change if it wins. */
    private record Candidate(
            RelaxationPreview.Kind kind,
            DiscoverListingPredicateBuilder.Filters filters,
            Long priceMaxRupees,
            List<Integer> bedrooms,
            List<String> propertyTypes) {

        static Candidate priceMax(DiscoverListingPredicateBuilder.Filters f, long rupees) {
            return new Candidate(RelaxationPreview.Kind.PRICE_MAX, f, rupees, null, null);
        }

        static Candidate readyToMove(DiscoverListingPredicateBuilder.Filters f) {
            return new Candidate(RelaxationPreview.Kind.READY_TO_MOVE, f, null, null, null);
        }

        static Candidate bedrooms(DiscoverListingPredicateBuilder.Filters f, List<Integer> next) {
            return new Candidate(RelaxationPreview.Kind.BEDROOMS, f, null, next, null);
        }

        static Candidate propertyTypes(DiscoverListingPredicateBuilder.Filters f, List<String> next) {
            return new Candidate(RelaxationPreview.Kind.PROPERTY_TYPES, f, null, null, next);
        }

        RelaxationPreview toPreview(long count) {
            return switch (kind) {
                case PRICE_MAX -> RelaxationPreview.priceMax(priceMaxRupees, count);
                case READY_TO_MOVE -> RelaxationPreview.readyToMove(count);
                case BEDROOMS -> RelaxationPreview.bedrooms(bedrooms, count);
                case PROPERTY_TYPES -> RelaxationPreview.propertyTypes(propertyTypes, count);
            };
        }
    }
}

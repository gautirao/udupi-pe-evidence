package com.example.realestate.discover;

import com.example.realestate.ai.PropertyType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for the shared filter normaliser introduced by the #1956 PR1 review fix (AC1.16).
 *
 * <p>These pin the rules themselves. The cross-endpoint consequence — that a mis-cased filter
 * produces the SAME number on the navigation-counts endpoint and the discover-listings endpoint —
 * is pinned against a real Postgres by {@code
 * NavigationCountParityAndScaleIT#crossEndpointParity_misCasedAndOutOfRangeFilters_countEqualsListingsTotal}.
 */
class DiscoverFilterNormalizerTest {

    private static DiscoverListingPredicateBuilder.Filters filters(
            List<String> propertyTypes, List<Integer> bedrooms, List<String> sellerTypes, String purpose) {
        return new DiscoverListingPredicateBuilder.Filters(
                "udupi", propertyTypes, null, null, null, null, bedrooms, sellerTypes,
                null, null, null, null, null, null, null, null, null, null, purpose, null, null);
    }

    // ── listingPurpose ──────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("purpose is allowlisted CASE-INSENSITIVELY and canonicalised to lower case")
    void normalizePurpose_isCaseInsensitive() {
        assertThat(DiscoverFilterNormalizer.normalizePurpose("SALE")).isEqualTo("sale");
        assertThat(DiscoverFilterNormalizer.normalizePurpose("  Rent ")).isEqualTo("rent");
        assertThat(DiscoverFilterNormalizer.normalizePurpose("sale")).isEqualTo("sale");
    }

    @Test
    @DisplayName("an unrecognised or blank purpose drops to blended (null), never throws")
    void normalizePurpose_unknownDropsToBlended() {
        assertThat(DiscoverFilterNormalizer.normalizePurpose("lease")).isNull();
        assertThat(DiscoverFilterNormalizer.normalizePurpose("   ")).isNull();
        assertThat(DiscoverFilterNormalizer.normalizePurpose(null)).isNull();
    }

    // ── propertyTypes ───────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("propertyTypes are canonicalised, deduped and sorted")
    void normalizePropertyTypes_canonicalisesDedupesSorts() {
        assertThat(DiscoverFilterNormalizer.normalizePropertyTypes(
                List.of("VILLA", "Apartment", "apartment", " HOUSE ")))
                .containsExactly("apartment", "house", "villa");
    }

    @Test
    @DisplayName("an unknown propertyType is dropped when at least one sibling is valid")
    void normalizePropertyTypes_unknownDroppedWhenSiblingSurvives() {
        assertThat(DiscoverFilterNormalizer.normalizePropertyTypes(List.of("plot", "house")))
                .containsExactly("house");
    }

    /**
     * NOTE — DELIBERATE RULE CHANGE, not a weakened assertion. An earlier revision asserted
     * {@code ["not-a-real-type"] -> []} (drop to blended). That was overturned: emitting no clause
     * hands a shopper who narrowed to one property type the ENTIRE city, presented as if it matched.
     * A narrowing multi-select that nothing satisfies must return zero on BOTH the count and the
     * list. Still no 400 — an honest empty result, not an invented error.
     */
    @Test
    @DisplayName("a NON-EMPTY propertyTypes list where nothing is recognised is UNSATISFIABLE: the "
            + "requested values are preserved so the predicate matches nothing — never widened to "
            + "the whole city")
    void normalizePropertyTypes_allUnknown_isUnsatisfiableNotBlended() {
        assertThat(DiscoverFilterNormalizer.normalizePropertyTypes(List.of("penthouse")))
                .containsExactly("penthouse");
        assertThat(DiscoverFilterNormalizer.normalizePropertyTypes(List.of("PENTHOUSE", "Bungalow")))
                .as("lower-cased + sorted so two spellings of the same impossible request share one "
                        + "cache entry")
                .containsExactly("bungalow", "penthouse");
    }

    @Test
    @DisplayName("a list of only null/blank entries carries no request at all — no clause, not "
            + "unsatisfiable")
    void normalizePropertyTypes_onlyBlanks_isAbsentNotUnsatisfiable() {
        assertThat(DiscoverFilterNormalizer.normalizePropertyTypes(Arrays.asList("  ", null))).isEmpty();
    }

    @Test
    @DisplayName("selecting EVERY known property type collapses to blended — exactly equivalent, "
            + "because property_type is NOT NULL and CHECK-constrained to this same set")
    void normalizePropertyTypes_allSelectedCollapsesToBlended() {
        List<String> everyType = List.of(PropertyType.values()).stream().map(PropertyType::getValue).toList();
        assertThat(DiscoverFilterNormalizer.normalizePropertyTypes(everyType)).isEmpty();
    }

    // ── bedrooms ────────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("bedrooms are clamped at the UPPER bound only (4 meaning '4 or more'), deduped and "
            + "sorted")
    void normalizeBedrooms_clampsUpperBoundDedupesSorts() {
        assertThat(DiscoverFilterNormalizer.normalizeBedrooms(List.of(9, 2, 7, 2))).containsExactly(2, 4);
    }

    /**
     * NOTE — this is a DELIBERATE RULE CHANGE, not a weakened assertion. The first revision of this
     * class clamped into {@code [1,4]}, and an earlier version of this very test asserted
     * {@code [0] -> [1]}. That rule was wrong: it rewrote a studio query into a 1-BHK query, so the
     * results did not match the request — the same class of defect AC1.16 exists to prevent, merely
     * made symmetric across the two endpoints. The rule now clamps only the upper bound.
     */
    @Test
    @DisplayName("0 (studio) survives unchanged while 9 still collapses to the '4+' bucket — "
            + "supersedes the earlier [1,4] clamp, which silently turned a studio query into 1-BHK")
    void normalizeBedrooms_zeroSurvives_upperBoundStillCollapses() {
        assertThat(DiscoverFilterNormalizer.normalizeBedrooms(List.of(0)))
                .as("a studio query must stay a studio query")
                .containsExactly(0);
        assertThat(DiscoverFilterNormalizer.normalizeBedrooms(List.of(9)))
                .as("the 4+ bucket collapse is what closes the bedrooms=9 count/list divergence")
                .containsExactly(4);
        assertThat(DiscoverFilterNormalizer.normalizeBedrooms(List.of(0, 9)))
                .containsExactly(0, 4);
    }

    @Test
    @DisplayName("a negative bedroom count is dropped when at least one sibling is valid")
    void normalizeBedrooms_negativeDroppedWhenSiblingSurvives() {
        assertThat(DiscoverFilterNormalizer.normalizeBedrooms(List.of(-1, 3))).containsExactly(3);
    }

    // ── sellerTypes ─────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("sellerTypes are allowlisted case-insensitively and canonicalised to lower case")
    void normalizeSellerTypes_canonicalises() {
        assertThat(DiscoverFilterNormalizer.normalizeSellerTypes(List.of("OWNER", "Broker", "landlord")))
                .containsExactly("broker", "owner");
    }

    @Test
    @DisplayName("an all-unknown sellerTypes list is UNSATISFIABLE, mirroring propertyTypes")
    void normalizeSellerTypes_allUnknown_isUnsatisfiableNotBlended() {
        assertThat(DiscoverFilterNormalizer.normalizeSellerTypes(List.of("LANDLORD")))
                .containsExactly("landlord");
    }

    @Test
    @DisplayName("an all-negative bedrooms list is UNSATISFIABLE, mirroring the two string filters")
    void normalizeBedrooms_allNegative_isUnsatisfiableNotBlended() {
        assertThat(DiscoverFilterNormalizer.normalizeBedrooms(List.of(-5, -1)))
                .containsExactly(-5, -1);
    }

    @Test
    @DisplayName("listingPurpose is a SCALAR SCOPE, not a narrowing multi-select: unknown still "
            + "drops to blended — the distinction is deliberate")
    void normalizePurpose_unknownStillBlended_unlikeTheNarrowingFilters() {
        assertThat(DiscoverFilterNormalizer.normalizePurpose("lease")).isNull();
    }

    // ── normalize(Filters) ──────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("normalize(Filters) canonicalises all four fields and maps emptied lists to null "
            + "so build() emits no clause for them")
    void normalizeFilters_canonicalisesAllFourAndNullsEmptied() {
        DiscoverListingPredicateBuilder.Filters out = DiscoverFilterNormalizer.normalize(
                filters(List.of("APARTMENT"), List.of(9), List.of("OWNER"), "SALE"));

        assertThat(out.propertyTypes()).containsExactly("apartment");
        assertThat(out.bedrooms()).containsExactly(4);
        assertThat(out.sellerTypes()).containsExactly("owner");
        assertThat(out.listingPurpose()).isEqualTo("sale");

        // Narrowing multi-selects stay UNSATISFIABLE (preserved, so the predicate matches nothing);
        // only the scalar scope selector drops to blended.
        DiscoverListingPredicateBuilder.Filters allUnknown = DiscoverFilterNormalizer.normalize(
                filters(List.of("nope"), null, List.of("landlord"), "lease"));
        assertThat(allUnknown.propertyTypes()).containsExactly("nope");
        assertThat(allUnknown.sellerTypes()).containsExactly("landlord");
        assertThat(allUnknown.bedrooms()).as("absent, not unsatisfiable").isNull();
        assertThat(allUnknown.listingPurpose()).as("scalar scope drops to blended").isNull();
    }

    @Test
    @DisplayName("normalize is idempotent — an already-normalised Filters round-trips unchanged")
    void normalizeFilters_isIdempotent() {
        DiscoverListingPredicateBuilder.Filters once = DiscoverFilterNormalizer.normalize(
                filters(List.of("APARTMENT", "villa"), List.of(9, 2), List.of("OWNER"), "SALE"));
        assertThat(DiscoverFilterNormalizer.normalize(once)).isEqualTo(once);
    }

    @Test
    @DisplayName("every field outside the four normalised ones is passed through untouched")
    void normalizeFilters_passesThroughEverythingElse() {
        DiscoverListingPredicateBuilder.Bbox bbox =
                new DiscoverListingPredicateBuilder.Bbox(13.3, 74.7, 13.4, 74.8);
        List<List<Double>> polygon = List.of(List.of(13.3, 74.7), List.of(13.4, 74.8), List.of(13.3, 74.8));
        DiscoverListingPredicateBuilder.Filters in = new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, 100L, 200L, "2024-01-01", "2024-12-31", null, null,
                Boolean.TRUE, Boolean.TRUE, Boolean.TRUE, Boolean.TRUE, polygon,
                13.0, 74.0, 3.0, bbox, "Flat  ", null,
                List.of("AGRICULTURAL_LAND"), List.of("IN|KA|Udupi|Manipal"));

        assertThat(DiscoverFilterNormalizer.normalize(in)).isEqualTo(in);
    }

    // ── build() applies it — the structural guarantee ────────────────────────────────────────

    @Test
    @DisplayName("build() itself normalises, so no caller can construct a Filters whose SQL "
            + "disagrees with the count computed from the same raw input")
    void build_normalisesMisCasedInputsStructurally() {
        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(
                filters(List.of("APARTMENT"), List.of(9), List.of("OWNER"), "SALE"));

        assertThat(sql.params()).contains("apartment", "owner", "sale");
        assertThat(sql.params()).doesNotContain("APARTMENT", "OWNER", "SALE", 9);
        assertThat(sql.whereFragment()).contains("pl.bedrooms >= 4");
    }
}

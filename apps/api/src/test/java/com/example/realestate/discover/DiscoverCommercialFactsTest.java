package com.example.realestate.discover;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * #2433 — Commercial summary facts: allowlist discipline, honest absence, and
 * Postgres/OpenSearch parity.
 */
class DiscoverCommercialFactsTest {

    private static DiscoverCommercialFacts facts(
            String floorChoice, String floorMode, Integer floorNumber, Integer totalFloors,
            String hubType, Integer officeSeats, String occupancyStatus,
            Double clearHeight, Integer loadingBays, Double roadFrontage, String zoning) {
        return new DiscoverCommercialFacts(floorChoice, floorMode, floorNumber, totalFloors,
                hubType, officeSeats, occupancyStatus, clearHeight, loadingBays, roadFrontage, zoning);
    }

    private static DiscoverCommercialFacts empty() {
        return facts(null, null, null, null, null, null, null, null, null, null, null);
    }

    @Nested
    @DisplayName("honest absence")
    class HonestAbsence {

        @Test
        @DisplayName("an all-absent fact set collapses to null so the DTO omits it entirely")
        void allAbsentCollapsesToNull() {
            assertThat(DiscoverCommercialFacts.orNullIfEmpty(empty())).isNull();
            assertThat(DiscoverCommercialFacts.orNullIfEmpty(null)).isNull();
            assertThat(empty().isEmpty()).isTrue();
        }

        @Test
        @DisplayName("a blank string is absence, not a fact")
        void blankStringsAreAbsent() {
            assertThat(facts("   ", "", null, null, "  ", null, "", null, null, null, " ").isEmpty())
                    .isTrue();
        }

        @Test
        @DisplayName("ONE populated fact is enough to survive — absence collapsing must not eat real data")
        void singlePopulatedFactSurvives() {
            // Paired positive case for the two tests above: if orNullIfEmpty were
            // over-eager, these would silently drop real facts.
            assertThat(DiscoverCommercialFacts.orNullIfEmpty(
                    facts(null, null, null, null, null, 12, null, null, null, null, null)))
                    .isNotNull()
                    .extracting(DiscoverCommercialFacts::officeSeats).isEqualTo(12);

            assertThat(DiscoverCommercialFacts.orNullIfEmpty(
                    facts(null, null, 0, null, null, null, null, null, null, null, null)))
                    .as("floor 0 is the ground floor — a real fact, not absence")
                    .isNotNull();
        }
    }

    @Nested
    @DisplayName("allowlist discipline")
    class AllowlistDiscipline {

        /**
         * Guards the deliberate allowlist. If someone later splats the commercial columns
         * onto this record, this fails and names the offending component — rather than the
         * ROI, lease or approvals data quietly reaching a public card.
         */
        @Test
        @DisplayName("the record carries exactly the approved facts and nothing else")
        void recordCarriesOnlyApprovedFacts() {
            Set<String> actual = Stream.of(DiscoverCommercialFacts.class.getRecordComponents())
                    .map(c -> c.getName())
                    .collect(Collectors.toSet());

            assertThat(actual).containsExactlyInAnyOrder(
                    "floorChoice", "floorMode", "floorNumber", "totalFloors", "hubType",
                    "officeSeats", "occupancyStatus", "warehouseClearHeightFt",
                    "warehouseLoadingBays", "roadFrontageFt", "commercialZoning");
        }

        @Test
        @DisplayName("no ROI, lease, power, approvals or ownership fact is reachable")
        void excludedFactsAreAbsent() {
            Set<String> actual = Stream.of(DiscoverCommercialFacts.class.getRecordComponents())
                    .map(c -> c.getName().toLowerCase())
                    .collect(Collectors.toSet());

            assertThat(actual).noneSatisfy(name -> assertThat(name)
                    .containsAnyOf("yield", "income", "lease", "power", "approval", "ownership"));
        }

        /**
         * The record's trailing three components are read POSITIONALLY by the detail surface
         * and by the Postgres/OpenSearch parity tests, so their order is load-bearing and is
         * pinned here rather than promised in a comment.
         *
         * <p><b>Updated by the #2458 merge, deliberately and not silently.</b> This assertion
         * previously required {@code commercialSubtype} at {@code n-2} and failed the moment
         * main's {@code buyerCommercialSubtype} landed between the two components it asserted
         * about. That failure was the test doing its job: an append at the same insertion point
         * is exactly what it exists to catch. It was re-pointed at the merged order in the
         * resolving commit rather than deleted — deleting it would have converted an enforced
         * guarantee back into a promise, which is the reason it was written.
         *
         * <p>All three positions are now pinned, not just the outer two. Asserting only the
         * ends would let a future component be inserted in the middle without failing, which is
         * precisely the change that just happened.
         */
        @Test
        @DisplayName("trailing order is commercialSubtype, then buyerCommercialSubtype, then commercialFacts last")
        void commercialFactsIsAppendedAfterSubtype() {
            var components = DiscoverListingResponse.class.getRecordComponents();
            int n = components.length;

            assertThat(components[n - 3].getName()).isEqualTo("commercialSubtype");
            assertThat(components[n - 2].getName()).isEqualTo("buyerCommercialSubtype");
            assertThat(components[n - 1].getName()).isEqualTo("commercialFacts");
            assertThat(components[n - 1].getType()).isEqualTo(DiscoverCommercialFacts.class);
        }
    }

}

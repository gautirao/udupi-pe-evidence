package com.example.realestate.discover;

import com.example.realestate.ai.PropertyType;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit proof for {@link BedroomApplicability} (#2537).
 *
 * <p>The load-bearing arm is {@link #everyKnownPropertyTypeHasAPinnedAnswer}: it enumerates
 * {@link PropertyType#values()} rather than a hand-written list, so a property type ADDED to the
 * taxonomy fails here loudly instead of silently inheriting the "capable" default and quietly
 * changing what a mixed selection returns. That is the failure mode a spot-check of three types
 * would miss entirely.
 */
class BedroomApplicabilityTest {

    /**
     * The complete expected answer for every stored type in the taxonomy TODAY. Written out in full
     * — not derived — because a test that recomputes the implementation's own derivation would pass
     * for any derivation, including a wrong one.
     */
    // Map.ofEntries rather than Map.of: the taxonomy has 11 members and Map.of caps at 10 pairs.
    private static final Map<String, Boolean> EXPECTED_CAPABILITY = Map.ofEntries(
            Map.entry("apartment", true),
            Map.entry("house", true),
            Map.entry("villa", true),
            Map.entry("other", true),
            Map.entry("residential_plot", false),
            Map.entry("land", false),
            Map.entry("agricultural_land", false),
            Map.entry("commercial", false),
            Map.entry("commercial_building", false),
            Map.entry("warehouse", false),
            Map.entry("commercial_land", false));

    @Test
    @DisplayName("#2537: every value in PropertyType has a pinned capability answer — a type added "
            + "to the taxonomy must fail here rather than silently default to bedroom-capable")
    void everyKnownPropertyTypeHasAPinnedAnswer() {
        List<String> taxonomy = List.of(PropertyType.values()).stream()
                .map(PropertyType::getValue)
                .toList();

        // The seal: the expectation table and the enum must name exactly the same set. Without this,
        // adding a type to the enum would leave the table a strict subset and every assertion below
        // would still pass while the new type went unexamined.
        assertThat(EXPECTED_CAPABILITY.keySet())
                .as("the expectation table must cover the whole PropertyType taxonomy, exactly")
                .containsExactlyInAnyOrderElementsOf(taxonomy);

        Map<String, Boolean> actual = taxonomy.stream()
                .collect(Collectors.toMap(type -> type, BedroomApplicability::isBedroomCapable));

        assertThat(actual).isEqualTo(EXPECTED_CAPABILITY);
    }

    @ParameterizedTest
    @ValueSource(strings = {"APARTMENT", "  villa  ", "House"})
    @DisplayName("#2537: capability is case- and whitespace-insensitive, so a caller that has not "
            + "normalised cannot get a silently different answer")
    void capabilityIsCaseAndWhitespaceInsensitive(String raw) {
        assertThat(BedroomApplicability.isBedroomCapable(raw)).isTrue();
    }

    @Test
    @DisplayName("#2537: an unrecognised shape is CAPABLE — dropping a constraint the buyer set is "
            + "the more damaging error, so the shrug keeps the predicate rather than widening")
    void unrecognisedShapeIsTreatedAsCapable() {
        assertThat(BedroomApplicability.isBedroomCapable("zzz_not_a_type")).isTrue();
    }

    @Test
    @DisplayName("#2537: null/blank is answered false — the direction that cannot widen a result")
    void nullOrBlankCannotWiden() {
        assertThat(BedroomApplicability.isBedroomCapable(null)).isFalse();
        assertThat(BedroomApplicability.isBedroomCapable("   ")).isFalse();
    }

    @Test
    @DisplayName("#2537: nonBedroomCapable selects exactly the incapable shapes, preserving order")
    void nonBedroomCapableSelectsTheIncapableShapesInOrder() {
        assertThat(BedroomApplicability.nonBedroomCapable(
                List.of("apartment", "commercial", "villa", "residential_plot")))
                .containsExactly("commercial", "residential_plot");

        // A wholly-capable selection yields an EMPTY arm, which is what makes the emitter fall back
        // to the unwrapped clause and keeps the #2533 byte-identical baseline arms passing.
        assertThat(BedroomApplicability.nonBedroomCapable(List.of("apartment", "villa"))).isEmpty();
        assertThat(BedroomApplicability.nonBedroomCapable(null)).isEmpty();
        assertThat(BedroomApplicability.nonBedroomCapable(List.of())).isEmpty();
    }
}

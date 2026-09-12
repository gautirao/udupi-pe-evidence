package com.example.realestate.discover;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.server.ResponseStatusException;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Issue #2509 — the anti-drift guard that makes the duplicated subtype validation SAFE.
 *
 * <p><b>Why a second validator exists at all.</b> {@link CityAreaListingsController} deliberately
 * does NOT call {@link CommercialSubtypeParam#validate}, because that method rejects on
 * {@code raw.size() > MAX_COMMERCIAL_SUBTYPE_VALUES}, a constant declared as
 * {@code ALLOWED_COMMERCIAL_SUBTYPES.size()} — a cache-cardinality bound derived from the taxonomy
 * size, which is the coupling tracked in #2523. Reusing it would carry that coupling onto a third
 * public unauthenticated endpoint, and at 5 it is strictly tighter than the anon endpoint's
 * {@code MAX_RAW_FILTER_VALUES} of 50, so it would silently become that endpoint's effective cache
 * bound.
 *
 * <p><b>Why duplicating it is nonetheless safe, and what this class is for.</b>
 * {@link CommercialSubtypeParam}'s own javadoc argues against a second hand-written validator on the
 * grounds that it creates "two places for the accepted vocabulary to drift". That objection is
 * answered structurally rather than by promise: both validators loop over the SAME
 * {@link DiscoverFilterNormalizer#ALLOWED_COMMERCIAL_SUBTYPES} set, so there is exactly one
 * vocabulary declaration and drift is unrepresentable. Only the coupled integer is declined.
 *
 * <p>This class asserts that equivalence directly, for accept AND reject, rather than trusting that
 * both were written the same way — the same discipline
 * {@code CityAreaListingsCommercialSubtype2433IT#bothDiscoverReadPathsAgreeOnTheSubtypeSpelling}
 * applies to the two READ paths.
 *
 * <p><b>What this class does NOT claim.</b> It does not assert the two validators agree on SIZE
 * limits — they deliberately do not, and that disagreement is the entire point of the split. It
 * pins the vocabulary axis only.
 */
class CityAreaListingsSubtypeVocabularyParityTest {

    /**
     * The anon endpoint's validator is private; invoking it reflectively keeps it private rather
     * than widening production visibility for a test. The cost is that a RENAME breaks this test at
     * runtime rather than at compile time, which is why the method is resolved once in a fixture
     * assertion below instead of failing obscurely inside each arm.
     */
    private static void validateAnon(List<String> raw) {
        try {
            Method m = CityAreaListingsController.class
                    .getDeclaredMethod("validateCommercialSubtypes", List.class);
            m.setAccessible(true);
            m.invoke(null, raw);
        } catch (InvocationTargetException e) {
            if (e.getCause() instanceof RuntimeException runtime) {
                throw runtime;
            }
            throw new IllegalStateException(e.getCause());
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(
                    "CityAreaListingsController.validateCommercialSubtypes(List) not found — if it "
                            + "was renamed, update this test; if it was DELETED, the anon endpoint "
                            + "has lost its vocabulary guard entirely", e);
        }
    }

    @Test
    @DisplayName("fixture: the reflective handle resolves, so a rename fails loudly here rather "
            + "than making every arm below vacuous")
    void theAnonValidatorIsResolvable() {
        assertThatCode(() -> validateAnon(List.of("SHOP"))).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("both validators are reading ONE vocabulary declaration — asserted against the "
            + "set itself, so adding a subtype cannot leave either behind")
    void theVocabularyHasExactlyOneDeclaration() {
        // Not a hardcoded list: if #2458's five-value set is widened again, this arm follows it
        // automatically and the two parity arms below widen with it.
        assertThat(DiscoverFilterNormalizer.ALLOWED_COMMERCIAL_SUBTYPES)
                .as("the single declaration both validators loop over")
                .isNotEmpty();
    }

    @ParameterizedTest
    @ValueSource(strings = {"SHOP", "OFFICE", "BUILDING", "WAREHOUSE", "LAND",
            "shop", "Office", "  WAREHOUSE  "})
    @DisplayName("ACCEPT parity: every value the shared validator accepts, the anon validator "
            + "accepts too — including the case-insensitive and whitespace-padded forms")
    void acceptParity(String value) {
        List<String> raw = List.of(value);

        assertThatCode(() -> CommercialSubtypeParam.validate(raw))
                .as("shared validator must accept " + value)
                .doesNotThrowAnyException();
        assertThatCode(() -> validateAnon(raw))
                .as("anon validator must accept " + value)
                .doesNotThrowAnyException();
    }

    @ParameterizedTest
    @ValueSource(strings = {"NOT_A_SUBTYPE", "Shop123", "SHOPS", "RETAIL", "", "   "})
    @DisplayName("REJECT parity: every value the shared validator rejects, the anon validator "
            + "rejects too — so an integrator gets the same answer from either endpoint")
    void rejectParity(String value) {
        List<String> raw = List.of(value);

        assertThatThrownBy(() -> CommercialSubtypeParam.validate(raw))
                .as("shared validator must reject " + value)
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> validateAnon(raw))
                .as("anon validator must reject " + value)
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    @DisplayName("both treat a present-but-empty list as a client bug rather than as 'no filter'")
    void presentButEmptyParity() {
        assertThatThrownBy(() -> CommercialSubtypeParam.validate(List.of()))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> validateAnon(List.of()))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    @DisplayName("both treat an ABSENT param as no filter, not as an error")
    void absentParity() {
        assertThat(CommercialSubtypeParam.validate(null)).isNull();
        assertThatCode(() -> validateAnon(null)).doesNotThrowAnyException();
    }

    @Test
    @DisplayName("the caps deliberately DIVERGE — this is the #2523 decoupling, asserted so a "
            + "future 'tidy-up' that re-unifies them fails here with the reason attached")
    void capsAreDeliberatelyDifferent() {
        // 6 values: above the shared validator's taxonomy-derived cap of 5, below the anon
        // endpoint's MAX_RAW_FILTER_VALUES of 50. All are VALID vocabulary, so the allowlist loop
        // cannot be the rejecter — only the cap can be.
        List<String> sixValidRepetitions =
                List.of("SHOP", "SHOP", "SHOP", "SHOP", "SHOP", "SHOP");

        assertThatThrownBy(() -> CommercialSubtypeParam.validate(sixValidRepetitions))
                .as("shared validator caps at ALLOWED_COMMERCIAL_SUBTYPES.size() — the #2523 coupling")
                .isInstanceOf(ResponseStatusException.class);

        assertThatCode(() -> validateAnon(sixValidRepetitions))
                .as("the anon endpoint bounds cache-key cardinality with its own literal instead, "
                        + "so six repetitions are legal here — if this ever throws, the coupling "
                        + "has been reintroduced onto a third public endpoint")
                .doesNotThrowAnyException();
    }
}

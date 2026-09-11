package com.example.realestate.discover;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * #2458 — the JAVA half of the cross-language mapping parity check.
 *
 * <p>The Commercial buyer-subtype mapping is implemented twice, because it is needed on both sides
 * of the language boundary: here, and in {@code resolveBuyerCommercialSubtype} in
 * {@code apps/web/src/lib/propertyTypeConfig.ts}. The duplication is unavoidable. Leaving it
 * unchecked is not.
 *
 * <p><b>Neither side's own suite can detect one-sided drift.</b> The server membership tests prove
 * the SQL predicate is self-consistent; the frontend vocabulary and URL tests prove the TypeScript
 * side is self-consistent. Both stay green while the five-value vocabulary is identical on both
 * sides and the two resolvers disagree about what a given row maps to. That is the gap this test
 * closes, and it was raised in four consecutive reviews before it was written.
 *
 * <p>The sibling test is {@code apps/web/src/lib/__tests__/commercialSubtypeMappingParity.test.ts}.
 * Both read {@code contracts/commercial-subtype-mapping.json}, so changing either implementation
 * alone turns that side RED.
 *
 * <p><b>Falsifiability:</b> this is an assertion against expected values, not a fixture both sides
 * merely read. A fixture without an assertion that breaks on one-sided drift would be the same
 * unfalsifiability shape as the tautological T10 this PR already had to repair — correct-looking
 * and incapable of failing.
 */
class CommercialSubtypeMappingParityTest {

    /**
     * Resolved from the module directory, which is the surefire working directory. Kept as a
     * constant so the TypeScript sibling can be pointed at the same literal path in review.
     */
    private static final Path FIXTURE = Path.of("../../contracts/commercial-subtype-mapping.json");

    @Test
    @DisplayName("the Java resolver matches the shared cross-language mapping fixture exactly")
    void javaResolverMatchesSharedFixture() throws Exception {
        assertThat(Files.exists(FIXTURE))
                .as("the shared fixture must be readable from the module working directory — if "
                        + "this path breaks, the test silently stops protecting anything, so it "
                        + "fails loudly rather than skipping")
                .isTrue();

        JsonNode cases = new ObjectMapper().readTree(Files.readString(FIXTURE)).get("cases");

        assertThat(cases).isNotNull();
        assertThat(cases.size())
                .as("guard: an empty or truncated fixture would make every assertion below vacuous")
                .isGreaterThanOrEqualTo(10);

        List<String> mismatches = new ArrayList<>();
        for (JsonNode c : cases) {
            String propertyType = c.get("propertyType").isNull() ? null : c.get("propertyType").asText();
            String subtype = c.get("commercialSubtype").isNull() ? null : c.get("commercialSubtype").asText();
            String expected = c.get("expected").isNull() ? null : c.get("expected").asText();

            String actual = DiscoverListingsService.resolveBuyerCommercialSubtype(propertyType, subtype);

            if (!java.util.Objects.equals(expected, actual)) {
                mismatches.add(String.format(
                        "%s: (%s, %s) expected %s but was %s",
                        c.get("name").asText(), propertyType, subtype, expected, actual));
            }
        }

        assertThat(mismatches)
                .as("every mismatch here is a DIVERGENCE FROM THE TYPESCRIPT RESOLVER, not merely a "
                        + "failed expectation: the fixture is the shared contract both sides assert "
                        + "against. Fix the mapping or change the contract deliberately on BOTH "
                        + "sides — never edit this fixture to match one implementation.")
                .isEmpty();
    }

    @Test
    @DisplayName("the fixture covers every buyer peer, both null cases, and the precedence case")
    void fixtureCoversTheContractSurface() throws Exception {
        JsonNode cases = new ObjectMapper().readTree(Files.readString(FIXTURE)).get("cases");

        List<String> expectations = new ArrayList<>();
        List<String> names = new ArrayList<>();
        for (JsonNode c : cases) {
            expectations.add(c.get("expected").isNull() ? "null" : c.get("expected").asText());
            names.add(c.get("name").asText());
        }

        // Without this, a future edit could delete the cases that discriminate and leave the parity
        // test passing over a trivial subset -- green, and protecting nothing.
        assertThat(expectations)
                .as("all five peers must be represented, or the parity check does not cover the "
                        + "vocabulary it claims to")
                .contains("SHOP", "OFFICE", "BUILDING", "WAREHOUSE", "LAND", "null");

        assertThat(names)
                .as("the two structurally distinct null cases and the precedence case are the ones "
                        + "most likely to drift between implementations")
                .contains("legacy-generic-commercial", "non-commercial",
                        "self-describing-type-ignores-a-conflicting-subtype");
    }
}

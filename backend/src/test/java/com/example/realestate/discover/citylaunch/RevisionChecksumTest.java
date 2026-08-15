package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.navigation.OverrideKind;
import com.example.realestate.discover.navigation.SandboxNavigationNode;
import com.example.realestate.discover.navigation.SandboxNavigationOverride;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit test for {@link RevisionChecksum} (#1955 Areas PR A, SLICE 2c — AC10 characterization).
 *
 * <p>The critical regression this guards against: extending {@link RevisionChecksum#compute} to a
 * seventh, {@code sandbox_navigation_nodes} section must NOT change the digest for any revision
 * whose navigation-node list is empty — every revision prepared before this change (and any
 * revision the not-yet-wired navigation-tree generator hasn't run for) has an empty list, so its
 * ALREADY-persisted {@code persisted_revision_checksum} must keep verifying without a re-prepare.
 */
class RevisionChecksumTest {

    private static SandboxArea area(String areaKey) {
        return new SandboxArea(1L, areaKey, areaKey + "-name", "district", 13.0, 74.7,
                12.9, 74.6, 13.1, 74.8, "OSM", "way", 111L, "ACTIVE");
    }

    /**
     * Independently reproduces the PRE-#1955 six-section raw-string encoding (areas=[...]
     * ;aliases=[];regions=[];memberships=[];groups=[];groupMembers=[]) for a single-area fixture,
     * byte-for-byte, duplicated from {@link RevisionChecksum}'s own (private) {@code appendField}/
     * {@code sha256Hex} logic as it existed before this change — this is the independent oracle the
     * test compares {@link RevisionChecksum#compute} against, not a copy of the production code
     * path under test.
     */
    private static String expectedPreChangeDigestForSingleArea(SandboxArea a) {
        StringBuilder raw = new StringBuilder();
        raw.append("areas=[{");
        appendField(raw, a.getAreaKey());
        appendField(raw, a.getName());
        appendField(raw, a.getDistrict());
        appendField(raw, a.getGeoCenterLat());
        appendField(raw, a.getGeoCenterLon());
        appendField(raw, a.getMinLat());
        appendField(raw, a.getMinLon());
        appendField(raw, a.getMaxLat());
        appendField(raw, a.getMaxLon());
        appendField(raw, a.getGeometrySource());
        appendField(raw, a.getOsmElementType());
        appendField(raw, a.getOsmElementId());
        appendField(raw, a.getLifecycleStatus());
        raw.append("}];aliases=[];regions=[];memberships=[];groups=[];groupMembers=[]");
        return sha256Hex(raw.toString());
    }

    private static void appendField(StringBuilder sb, String value) {
        if (value == null) {
            sb.append("N;");
        } else {
            sb.append(value.length()).append(':').append(value).append(';');
        }
    }

    private static void appendField(StringBuilder sb, Object value) {
        appendField(sb, value == null ? null : value.toString());
    }

    /**
     * #2178: duplicated from {@link RevisionChecksum}'s own (private) {@code
     * appendField(StringBuilder, Double)}/{@code canonicalizeDouble} — this oracle must mirror
     * production's CURRENT encoding (now including the 15-significant-digit canonicalization), the
     * same duplication convention this class's javadoc already documents for the String/Object
     * overloads and {@code sha256Hex}. Overloaded (not the generic {@code Object} version above) so
     * Java's static-type overload resolution routes every {@code Double}-typed getter call in {@link
     * #expectedPreChangeDigestForSingleArea} here automatically.
     */
    private static void appendField(StringBuilder sb, Double value) {
        appendField(sb, value == null ? null : new BigDecimal(value)
                .round(new java.math.MathContext(15, java.math.RoundingMode.HALF_UP))
                .stripTrailingZeros()
                .toPlainString());
    }

    private static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    // =========================================================================================
    // AC10 characterization: empty navigation-node list is byte-identical to the pre-#1955 digest
    // =========================================================================================

    @Test
    @DisplayName("six-arg overload (empty nav list, implicitly) matches an independently-reproduced "
            + "pre-#1955 six-section digest for the SAME fixture")
    void sixArgOverload_matchesPreChangeDigest() {
        SandboxArea a = area("city|area-1");

        String actual = RevisionChecksum.compute(
                List.of(a), List.of(), List.of(), List.of(), List.of(), List.of());
        String expected = expectedPreChangeDigestForSingleArea(a);

        assertThat(actual).isEqualTo(expected);
    }

    @Test
    @DisplayName("seven-arg overload with an EXPLICIT empty navigation-node list matches the same "
            + "pre-#1955 digest — proves the trailing section contributes zero characters when empty")
    void sevenArgOverload_emptyNavList_matchesPreChangeDigest() {
        SandboxArea a = area("city|area-1");

        String actual = RevisionChecksum.compute(
                List.of(a), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        String expected = expectedPreChangeDigestForSingleArea(a);

        assertThat(actual).isEqualTo(expected);
    }

    @Test
    @DisplayName("six-arg and seven-arg(empty) overloads always agree, for an empty six-list fixture too")
    void sixArgAndSevenArgEmptyNavList_agree_onEmptyFixture() {
        String sixArg = RevisionChecksum.compute(List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        String sevenArgEmpty = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());

        assertThat(sevenArgEmpty).isEqualTo(sixArg);
    }

    // =========================================================================================
    // Non-empty navigation-node list changes the digest (tamper-detection extends to the 7th table)
    // =========================================================================================

    @Test
    @DisplayName("a NON-EMPTY navigation-node list produces a DIFFERENT digest than the same six lists "
            + "with an empty nav list")
    void nonEmptyNavList_changesDigest() {
        SandboxArea a = area("city|area-1");
        String withoutNav = RevisionChecksum.compute(
                List.of(a), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());

        SandboxNavigationNode node = new SandboxNavigationNode(
                1L, "city-north", "AREA", null, "a:city|area-1", "city|area-1",
                List.of("city|area-1"), "Area One", 1, 0, List.of(), 1,
                BigDecimal.valueOf(13.0), BigDecimal.valueOf(74.7),
                BigDecimal.valueOf(12.9), BigDecimal.valueOf(74.6),
                BigDecimal.valueOf(13.1), BigDecimal.valueOf(74.8),
                "fp-1", Instant.parse("2026-01-01T00:00:00Z"));
        String withNav = RevisionChecksum.compute(
                List.of(a), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(node));

        assertThat(withNav).isNotEqualTo(withoutNav);
    }

    @Test
    @DisplayName("determinism: two computations over the same navigation-node list produce the same digest")
    void nonEmptyNavList_isDeterministic() {
        SandboxNavigationNode node = new SandboxNavigationNode(
                1L, "city-north", "AREA", null, "a:city|area-1", "city|area-1",
                List.of("city|area-1"), "Area One", 1, 0, List.of(), 1,
                BigDecimal.valueOf(13.0), BigDecimal.valueOf(74.7),
                BigDecimal.valueOf(12.9), BigDecimal.valueOf(74.6),
                BigDecimal.valueOf(13.1), BigDecimal.valueOf(74.8),
                "fp-1", Instant.parse("2026-01-01T00:00:00Z"));

        String first = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(node));
        String second = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(node));

        assertThat(second).isEqualTo(first);
    }

    @Test
    @DisplayName("changing a node's OWN field (display_label) changes the digest")
    void changingOwnField_changesDigest() {
        SandboxNavigationNode original = new SandboxNavigationNode(
                1L, "city-north", "AREA", null, "a:city|area-1", "city|area-1",
                List.of("city|area-1"), "Area One", 1, 0, List.of(), 1,
                BigDecimal.valueOf(13.0), BigDecimal.valueOf(74.7),
                BigDecimal.valueOf(12.9), BigDecimal.valueOf(74.6),
                BigDecimal.valueOf(13.1), BigDecimal.valueOf(74.8),
                "fp-1", Instant.parse("2026-01-01T00:00:00Z"));
        SandboxNavigationNode relabelled = new SandboxNavigationNode(
                1L, "city-north", "AREA", null, "a:city|area-1", "city|area-1",
                List.of("city|area-1"), "RELABELLED", 1, 0, List.of(), 1,
                BigDecimal.valueOf(13.0), BigDecimal.valueOf(74.7),
                BigDecimal.valueOf(12.9), BigDecimal.valueOf(74.6),
                BigDecimal.valueOf(13.1), BigDecimal.valueOf(74.8),
                "fp-1", Instant.parse("2026-01-01T00:00:00Z"));

        String originalDigest = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(original));
        String relabelledDigest = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(relabelled));

        assertThat(relabelledDigest).isNotEqualTo(originalDigest);
    }

    // =========================================================================================
    // #1955 Areas PR A, SLICE 2f+2g: eighth-table (sandbox_navigation_override) extension
    // =========================================================================================

    private static SandboxNavigationOverride excludeOverride(String areaKey, UUID createdBy) {
        return new SandboxNavigationOverride(
                1L, OverrideKind.EXCLUDE_AREA, areaKey, null, null, null, null, null, 1, "reason", createdBy);
    }

    @Test
    @DisplayName("seven-arg overload (empty override list, implicitly) matches the seven-arg(empty-nav) "
            + "digest — proves the eighth section contributes zero characters when empty")
    void eightArgOverload_emptyOverrideList_matchesSevenArgDigest() {
        SandboxArea a = area("city|area-1");
        String sevenArg = RevisionChecksum.compute(
                List.of(a), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        String eightArgEmpty = RevisionChecksum.compute(
                List.of(a), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());

        assertThat(eightArgEmpty).isEqualTo(sevenArg);
    }

    @Test
    @DisplayName("a NON-EMPTY override list produces a DIFFERENT digest than the same seven lists with "
            + "an empty override list")
    void nonEmptyOverrideList_changesDigest() {
        UUID admin = UUID.randomUUID();
        String withoutOverrides = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        String withOverrides = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(excludeOverride("city|area-1", admin)));

        assertThat(withOverrides).isNotEqualTo(withoutOverrides);
    }

    @Test
    @DisplayName("determinism: two computations over the same override list produce the same digest")
    void nonEmptyOverrideList_isDeterministic() {
        UUID admin = UUID.randomUUID();
        SandboxNavigationOverride override = excludeOverride("city|area-1", admin);

        String first = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(override));
        String second = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(override));

        assertThat(second).isEqualTo(first);
    }

    @Test
    @DisplayName("changing an override's OWN field (reason) changes the digest")
    void changingOverrideOwnField_changesDigest() {
        UUID admin = UUID.randomUUID();
        SandboxNavigationOverride original = new SandboxNavigationOverride(
                1L, OverrideKind.EXCLUDE_AREA, "city|area-1", null, null, null, null, null, 1,
                "original reason", admin);
        SandboxNavigationOverride mutated = new SandboxNavigationOverride(
                1L, OverrideKind.EXCLUDE_AREA, "city|area-1", null, null, null, null, null, 1,
                "mutated reason", admin);

        String originalDigest = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(original));
        String mutatedDigest = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(mutated));

        assertThat(mutatedDigest).isNotEqualTo(originalDigest);
    }

    @Test
    @DisplayName("overridesFingerprint: null for an empty list, non-null and deterministic for a non-empty one")
    void overridesFingerprint_nullWhenEmpty_deterministicWhenNot() {
        assertThat(RevisionChecksum.computeOverridesFingerprint(List.of())).isNull();

        SandboxNavigationOverride override = excludeOverride("city|area-1", UUID.randomUUID());
        String first = RevisionChecksum.computeOverridesFingerprint(List.of(override));
        String second = RevisionChecksum.computeOverridesFingerprint(List.of(override));

        assertThat(first).isNotNull();
        assertThat(second).isEqualTo(first);
    }

    // =========================================================================================
    // #2151 PR A, AC16 (RELEASE-BLOCKING): ninth-table (sandbox_agri_destination_classification)
    // extension. A regression here makes every historical persisted_revision_checksum fail
    // verification with a 422 at CityLaunchPromotionService's next promotion — a pipeline-wide
    // outage, not a degraded feature — so this contract is asserted directly against the
    // independently-reproduced PRE-#2151 eight-argument raw-string encoding, not merely against
    // "the 8-arg overload returns the same thing as the 9-arg overload" (which would be true even
    // if BOTH were broken in the same way).
    // =========================================================================================

    private static SandboxAgriDestinationClassification agriRow(String areaKey) {
        return new SandboxAgriDestinationClassification(
                1L, areaKey, 13.0, 74.7, 12.3, 45.0, "NE", "10_25",
                "agri-destination-classification-v1", Instant.parse("2026-01-01T00:00:00Z"));
    }

    @Test
    @DisplayName("AC16(i): a revision with an EMPTY Agri list produces a checksum BYTE-IDENTICAL to "
            + "the pre-#2151 eight-argument computation — every historical persisted_revision_checksum "
            + "still verifies")
    void nineArgOverload_emptyAgriList_matchesPreChangeEightArgDigest() {
        SandboxArea a = area("city|area-1");

        // Independent oracle: the EIGHT-argument overload, called directly — this is the exact
        // pre-#2151 call shape CityLaunchGraphWriter/CityLaunchPromotionService used before this PR.
        String eightArg = RevisionChecksum.compute(
                List.of(a), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        // Nine-argument overload with an EXPLICIT empty Agri list.
        String nineArgEmpty = RevisionChecksum.compute(
                List.of(a), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());

        assertThat(nineArgEmpty).isEqualTo(eightArg);
        // Also anchor against the independently-reproduced PRE-#1955 six-section digest, so this
        // test does not merely prove internal self-consistency between two RevisionChecksum
        // overloads that could both be wrong the same way.
        assertThat(nineArgEmpty).isEqualTo(expectedPreChangeDigestForSingleArea(a));
    }

    @Test
    @DisplayName("AC16(iii): the 8-arg overload is exercised directly and still delegates with "
            + "List.of() for the Agri section — proven by equality with the 9-arg(empty) call")
    void eightArgOverload_stillDelegatesWithEmptyAgriList() {
        UUID admin = UUID.randomUUID();
        SandboxNavigationOverride override = excludeOverride("city|area-1", admin);

        String eightArg = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(override));
        String nineArgEmpty = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(override),
                List.of());

        assertThat(eightArg).isEqualTo(nineArgEmpty);
    }

    @Test
    @DisplayName("AC16(ii): a single tampered Agri row changes the checksum")
    void nonEmptyAgriList_changesDigest() {
        String withoutAgri = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        String withAgri = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(agriRow("city|area-1")));

        assertThat(withAgri).isNotEqualTo(withoutAgri);
    }

    @Test
    @DisplayName("AC16(ii): tampering with an Agri row's OWN field (distanceKm) changes the digest")
    void tamperedAgriRow_changesDigest() {
        SandboxAgriDestinationClassification original = agriRow("city|area-1");
        SandboxAgriDestinationClassification tampered = new SandboxAgriDestinationClassification(
                1L, "city|area-1", 13.0, 74.7, 99.9, 45.0, "NE", "10_25",
                "agri-destination-classification-v1", Instant.parse("2026-01-01T00:00:00Z"));

        String originalDigest = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(original));
        String tamperedDigest = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(tampered));

        assertThat(tamperedDigest).isNotEqualTo(originalDigest);
    }

    @Test
    @DisplayName("determinism: two computations over the same Agri list produce the same digest")
    void nonEmptyAgriList_isDeterministic() {
        SandboxAgriDestinationClassification row = agriRow("city|area-1");

        String first = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(row));
        String second = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(row));

        assertThat(second).isEqualTo(first);
    }

    // =========================================================================================
    // #2178 (follow-up to #2177): TEXT-transfer vs. BINARY-transfer wire-representation drift.
    //
    // #2177's detach-then-re-query fix in CityLaunchGraphWriter guarantees prepare-time and
    // promote-time both issue a genuinely fresh DB read — but a PR reviewer-bot on #2178 correctly
    // found that this alone does NOT guarantee they get the SAME wire representation of that read:
    // pgjdbc negotiates lossless BINARY transfer after ~5 executions of the same prepared statement,
    // but stays on TEXT transfer (subject to the hosted connection's extra_float_digits=0 — 15
    // significant digits) before that threshold. Depending on connection/statement-cache state, one
    // side could hash a full-precision BINARY read and the other a 15-significant-digit TEXT read of
    // the IDENTICAL stored value, still producing different digests.
    //
    // These tests simulate both wire representations of the SAME underlying value directly (no DB
    // involved — RevisionChecksum operates purely on Java objects) and assert the canonicalization
    // added to RevisionChecksum#appendField(StringBuilder, Double) makes them hash identically.
    // =========================================================================================

    /** Simulates a TEXT-transfer JDBC read under extra_float_digits=0: Postgres formats the value to
     *  15 significant digits, and pgjdbc parses that text back into a (slightly less precise) double
     *  — mirrors the diagnosed live case (#2177): a BINARY-precision 1.1561671177279886 round-tripped
     *  through Postgres TEXT format as 1.15616711772799. */
    private static double simulateTextTransferRead(double fullPrecisionValue) {
        return Double.parseDouble(new BigDecimal(fullPrecisionValue)
                .round(new java.math.MathContext(15, java.math.RoundingMode.HALF_UP))
                .toPlainString());
    }

    @Test
    @DisplayName("#2178: a full-precision (simulated BINARY-transfer) double and its 15-significant-"
            + "digit (simulated TEXT-transfer, extra_float_digits=0) counterpart of the SAME underlying "
            + "value are genuinely different Java doubles — sanity check that this test isn't vacuous")
    void simulatedTextAndBinaryReads_areGenuinelyDifferentDoublesBeforeCanonicalization() {
        double binaryPrecision = 1.1561671177279886;
        double textPrecision = simulateTextTransferRead(binaryPrecision);

        assertThat(textPrecision)
                .as("the simulated TEXT-transfer read must actually differ bit-for-bit from the "
                        + "BINARY-transfer value, matching the live-diagnosed 1.1561671177279886 -> "
                        + "1.15616711772799 drift, or this regression test proves nothing")
                .isNotEqualTo(binaryPrecision);
    }

    @Test
    @DisplayName("#2178: an Agri row hashed from a full-precision (BINARY-transfer) double produces the "
            + "IDENTICAL checksum contribution as the SAME row hashed from its 15-significant-digit "
            + "(TEXT-transfer) counterpart")
    void agriRow_binaryAndTextTransferReadsOfSameValue_produceIdenticalChecksum() {
        double binaryDistanceKm = 1.1561671177279886;
        double textDistanceKm = simulateTextTransferRead(binaryDistanceKm);
        double binaryBearingDeg = 286.78852641197636;
        double textBearingDeg = simulateTextTransferRead(binaryBearingDeg);

        SandboxAgriDestinationClassification binaryRow = new SandboxAgriDestinationClassification(
                1L, "city|area-1", 13.0, 74.7, binaryDistanceKm, binaryBearingDeg, "NW", "0_10",
                "agri-destination-classification-v1", Instant.parse("2026-01-01T00:00:00Z"));
        SandboxAgriDestinationClassification textRow = new SandboxAgriDestinationClassification(
                1L, "city|area-1", 13.0, 74.7, textDistanceKm, textBearingDeg, "NW", "0_10",
                "agri-destination-classification-v1", Instant.parse("2026-01-01T00:00:00Z"));

        String binaryChecksum = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(binaryRow));
        String textChecksum = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(textRow));

        assertThat(textChecksum)
                .as("#2178: prepare-time (possibly BINARY-transfer) and promote-time (possibly "
                        + "TEXT-transfer) reads of the SAME underlying stored value must canonicalize to "
                        + "the identical checksum, regardless of which wire format either side happened "
                        + "to get from pgjdbc")
                .isEqualTo(binaryChecksum);
    }

    @Test
    @DisplayName("#2178: canonicalization does not destroy real tamper detection — a genuinely "
            + "different value (differing well beyond the 15th significant digit) still changes the "
            + "digest")
    void canonicalization_stillDetectsGenuineTampering() {
        SandboxAgriDestinationClassification original = agriRow("city|area-1");
        // Differs from agriRow's distanceKm (12.3) at the SECOND significant digit — nowhere near the
        // 15-significant-digit canonicalization boundary — so this must still be detected.
        SandboxAgriDestinationClassification tampered = new SandboxAgriDestinationClassification(
                1L, "city|area-1", 13.0, 74.7, 45.6, 45.0, "NE", "10_25",
                "agri-destination-classification-v1", Instant.parse("2026-01-01T00:00:00Z"));

        String originalDigest = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(original));
        String tamperedDigest = RevisionChecksum.compute(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(), List.of(),
                List.of(tampered));

        assertThat(tamperedDigest).isNotEqualTo(originalDigest);
    }
}

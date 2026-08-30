package com.example.realestate.discover;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Pure-logic unit tests for {@link AreaOnboardingApplyService} and its DAO helpers (#1887 PR2) —
 * no Spring context, no database. Covers the qa_requirements unit-test scope: candidate_payload
 * Jackson round-trip + checksum recomputation fidelity, {@link GeometryTrust} rank ordering used
 * by the geometry-protection guard, and deterministic {@code event_id} derivation.
 */
class AreaOnboardingApplyServiceLogicTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    // ── candidate_payload round-trip + checksum recomputation (risk R1) ────────

    @Test
    @DisplayName("a full CandidateInput round-trips through Jackson and its sha256 checksum is reproducible")
    void candidateInputRoundTripsAndChecksumIsReproducible() throws Exception {
        AreaOnboardingService.CandidateInput original = new AreaOnboardingService.CandidateInput(
                "IN|KA|Udupi|PayloadFixture", "Payload Fixture", 13.30, 74.75,
                13.29, 74.74, 13.31, 74.76, "OSM", "ext-1");

        String json = objectMapper.writeValueAsString(original);
        String checksum1 = AreaOnboardingApplyService.sha256Hex(json);
        String checksum2 = AreaOnboardingApplyService.sha256Hex(json);

        AreaOnboardingService.CandidateInput reconstructed =
                objectMapper.readValue(json, AreaOnboardingService.CandidateInput.class);

        assertThat(reconstructed).isEqualTo(original);
        assertThat(checksum1).isEqualTo(checksum2);
        assertThat(checksum1).hasSize(64); // hex-encoded SHA-256
    }

    @Test
    @DisplayName("a CandidateInput with a null/partial bbox still round-trips and produces a stable checksum")
    void candidateInputWithPartialBboxRoundTrips() throws Exception {
        AreaOnboardingService.CandidateInput original = new AreaOnboardingService.CandidateInput(
                "IN|KA|Udupi|ZeroListingArea", "Zero Listing Area", 13.00, 74.75,
                null, null, null, null, null, null);

        String json = objectMapper.writeValueAsString(original);
        AreaOnboardingService.CandidateInput reconstructed =
                objectMapper.readValue(json, AreaOnboardingService.CandidateInput.class);

        assertThat(reconstructed).isEqualTo(original);
        assertThat(AreaOnboardingApplyService.sha256Hex(json)).isEqualTo(AreaOnboardingApplyService.sha256Hex(json));
    }

    @Test
    @DisplayName("changing even one field of a serialized payload changes the recomputed checksum (tamper detection)")
    void tamperedPayloadProducesDifferentChecksum() {
        String original = "{\"areaKey\":\"IN|KA|Udupi|X\",\"name\":\"X\"}";
        String tampered = "{\"areaKey\":\"IN|KA|Udupi|X\",\"name\":\"Y\"}";

        assertThat(AreaOnboardingApplyService.sha256Hex(original))
                .isNotEqualTo(AreaOnboardingApplyService.sha256Hex(tampered));
    }

    // ── GeometryTrust rank ordering used by the D4 protection guard ────────────

    @Test
    @DisplayName("GeometryTrust rank strictly orders VERIFIED > PROVISIONAL > MISSING")
    void geometryTrustRankOrdering() {
        assertThat(AreaOnboardingApplyService.rank(GeometryTrust.VERIFIED))
                .isGreaterThan(AreaOnboardingApplyService.rank(GeometryTrust.PROVISIONAL));
        assertThat(AreaOnboardingApplyService.rank(GeometryTrust.PROVISIONAL))
                .isGreaterThan(AreaOnboardingApplyService.rank(GeometryTrust.MISSING));
    }

    // ── numEquals epsilon compare-before-write helper ───────────────────────────

    @Test
    @DisplayName("numEquals treats sub-epsilon float differences as equal, and both-null as equal")
    void numEqualsEpsilonBehaviour() {
        assertThat(AreaOnboardingApplyService.numEquals(13.0451, 13.0451000001)).isTrue();
        assertThat(AreaOnboardingApplyService.numEquals(13.0451, 13.05)).isFalse();
        assertThat(AreaOnboardingApplyService.numEquals(null, null)).isTrue();
        assertThat(AreaOnboardingApplyService.numEquals(13.0, null)).isFalse();
        assertThat(AreaOnboardingApplyService.numEquals(null, 13.0)).isFalse();
    }

    // ── district derivation from a normalised 4-segment area_key ────────────────

    @Test
    @DisplayName("districtFromNormalisedKey extracts segment 2 of a normalised 4-segment area_key")
    void districtFromNormalisedKeyExtractsSegmentTwo() {
        assertThat(AreaOnboardingApplyService.districtFromNormalisedKey("IN|KA|Bengaluru|Whitefield"))
                .isEqualTo("Bengaluru");
        assertThat(AreaOnboardingApplyService.districtFromNormalisedKey("IN|KA|Udupi|Manipal"))
                .isEqualTo("Udupi");
    }

    // ── deterministic event_id derivation (#1887 D5, AC4 idempotency) ───────────

    @Test
    @DisplayName("deterministicEventId is stable for the same (batchId, cityId) and differs across either")
    void deterministicEventIdIsStableAndDiscriminating() {
        UUID first = AreaRegionReclassOutbox.deterministicEventId(42L, 7);
        UUID again = AreaRegionReclassOutbox.deterministicEventId(42L, 7);
        UUID differentBatch = AreaRegionReclassOutbox.deterministicEventId(43L, 7);
        UUID differentCity = AreaRegionReclassOutbox.deterministicEventId(42L, 8);

        assertThat(first).isEqualTo(again);
        assertThat(first).isNotEqualTo(differentBatch);
        assertThat(first).isNotEqualTo(differentCity);
    }

    // ── FIX 1: runner startup-ordering fail-fast (no Spring context needed — plain constructor call) ──

    @Test
    @DisplayName("FIX 1: AreaOnboardingApplyRunner fails fast, before doing any work, if the review "
            + "runner is ALSO enabled in the same startup")
    void applyRunnerFailsFastWhenReviewAlsoEnabled() {
        AreaOnboardingApplyRunner runner = new AreaOnboardingApplyRunner(null, 1L, "system", true);
        assertThatThrownBy(() -> runner.run(null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("review.enabled=true");
    }

    @Test
    @DisplayName("FIX 1: AreaOnboardingReviewRunner fails fast, before doing any work, if the apply "
            + "runner is ALSO enabled in the same startup")
    void reviewRunnerFailsFastWhenApplyAlsoEnabled() {
        AreaOnboardingReviewRunner runner = new AreaOnboardingReviewRunner(null, 1L, "system", true);
        assertThatThrownBy(() -> runner.run(null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("apply.enabled=true");
    }

    @Test
    @DisplayName("FIX 1: neither runner fails fast when only its own property is enabled "
            + "(the other runner's flag defaults to false)")
    void runnersDoNotFailFastWhenOnlyOneIsEnabled() {
        // batchId <= 0 makes each runner log-and-return before doing any real work, without a
        // Spring-wired service — proves the ordering guard itself doesn't fire spuriously.
        AreaOnboardingApplyRunner applyRunner = new AreaOnboardingApplyRunner(null, -1L, "system", false);
        AreaOnboardingReviewRunner reviewRunner = new AreaOnboardingReviewRunner(null, -1L, "system", false);

        applyRunner.run(null);
        reviewRunner.run(null);
        // No exception -> both runners proceeded (and then no-op'd on the invalid batchId).
    }

    // ── FIX 7: canonical fingerprint is deterministic and discriminates on every field ──────────

    @Test
    @DisplayName("FIX 7: canonicalFingerprint is stable for identical inputs and changes if ANY field differs")
    void canonicalFingerprintIsStableAndDiscriminating() {
        String base = AreaOnboardingApplyService.canonicalFingerprint(
                "IN|KA|Udupi|FingerprintFixture", 7, "Fingerprint Fixture", "Udupi",
                13.30, 74.75, 13.29, 74.74, 13.31, 74.76, "OSM", "ACTIVE");
        String same = AreaOnboardingApplyService.canonicalFingerprint(
                "IN|KA|Udupi|FingerprintFixture", 7, "Fingerprint Fixture", "Udupi",
                13.30, 74.75, 13.29, 74.74, 13.31, 74.76, "OSM", "ACTIVE");
        String nameDiffers = AreaOnboardingApplyService.canonicalFingerprint(
                "IN|KA|Udupi|FingerprintFixture", 7, "Different Name", "Udupi",
                13.30, 74.75, 13.29, 74.74, 13.31, 74.76, "OSM", "ACTIVE");
        String cityDiffers = AreaOnboardingApplyService.canonicalFingerprint(
                "IN|KA|Udupi|FingerprintFixture", 8, "Fingerprint Fixture", "Udupi",
                13.30, 74.75, 13.29, 74.74, 13.31, 74.76, "OSM", "ACTIVE");

        assertThat(base).isEqualTo(same);
        assertThat(base).isNotEqualTo(nameDiffers);
        assertThat(base).isNotEqualTo(cityDiffers);
        assertThat(AreaOnboardingApplyService.noExistingAreaFingerprint())
                .isEqualTo(AreaOnboardingApplyService.noExistingAreaFingerprint())
                .isNotEqualTo(base);
    }

    // ── FIX 4b: persisted_batch_checksum is deterministic over persisted rows and detects tampering ──

    @Test
    @DisplayName("FIX 4b: computePersistedBatchChecksum is deterministic for identical persisted rows "
            + "and changes if the batch identity or ANY candidate row differs — and never reads "
            + "artifact_checksum, which is unrelated provenance metadata")
    void persistedBatchChecksumIsDeterministicAndDetectsTampering() {
        OffsetDateTime extractedAt = OffsetDateTime.parse("2026-01-01T00:00:00Z");
        AreaOnboardingApplyService.BatchRow batch = new AreaOnboardingApplyService.BatchRow(
                1L, 7, true, "dataset-1", "v1", "irrelevant-for-this-digest", "test-provider", "1", extractedAt,
                "IN_REVIEW", null, null, null);
        AreaOnboardingApplyService.CandidateRow candidate1 = new AreaOnboardingApplyService.CandidateRow(
                10L, "IN|KA|Udupi|X", "IN|KA|Udupi|X", null, "READY_TO_CREATE", "APPROVED",
                "{\"areaKey\":\"IN|KA|Udupi|X\"}", "checksum-1", "ext-1", null);
        AreaOnboardingApplyService.CandidateRow candidate2 = new AreaOnboardingApplyService.CandidateRow(
                11L, "IN|KA|Udupi|Y", "IN|KA|Udupi|Y", null, "READY_TO_CREATE", "APPROVED",
                "{\"areaKey\":\"IN|KA|Udupi|Y\"}", "checksum-2", "ext-2", null);

        String checksum1 =
                AreaOnboardingApplyService.computePersistedBatchChecksum(batch, List.of(candidate1, candidate2));
        String checksum2 =
                AreaOnboardingApplyService.computePersistedBatchChecksum(batch, List.of(candidate1, candidate2));
        assertThat(checksum1).isEqualTo(checksum2);

        AreaOnboardingApplyService.CandidateRow tamperedCandidate2 = new AreaOnboardingApplyService.CandidateRow(
                11L, "IN|KA|Udupi|Y", "IN|KA|Udupi|Y", null, "READY_TO_CREATE", "APPROVED",
                "{\"areaKey\":\"IN|KA|Udupi|Y\"}", "TAMPERED-checksum-2", "ext-2", null);
        String tamperedChecksum = AreaOnboardingApplyService.computePersistedBatchChecksum(
                batch, List.of(candidate1, tamperedCandidate2));
        assertThat(tamperedChecksum).isNotEqualTo(checksum1);

        AreaOnboardingApplyService.BatchRow differentProviderBatch = new AreaOnboardingApplyService.BatchRow(
                1L, 7, true, "dataset-1", "v1", "irrelevant-for-this-digest", "different-provider", "1", extractedAt,
                "IN_REVIEW", null, null, null);
        String differentProviderChecksum = AreaOnboardingApplyService.computePersistedBatchChecksum(
                differentProviderBatch, List.of(candidate1, candidate2));
        assertThat(differentProviderChecksum).isNotEqualTo(checksum1);

        // A batch differing ONLY in artifact_checksum (provenance metadata) produces the SAME
        // digest — this column is never read by the algorithm (#1887 rework #2, FIX 4a/4b split).
        AreaOnboardingApplyService.BatchRow differentArtifactChecksumBatch = new AreaOnboardingApplyService.BatchRow(
                1L, 7, true, "dataset-1", "v1", "a-totally-different-provider-checksum", "test-provider", "1",
                extractedAt, "IN_REVIEW", null, null, null);
        String differentArtifactChecksumDigest = AreaOnboardingApplyService.computePersistedBatchChecksum(
                differentArtifactChecksumBatch, List.of(candidate1, candidate2));
        assertThat(differentArtifactChecksumDigest).isEqualTo(checksum1);
    }

    // ── #1887 rework #4 REQUIRED: batch-metadata now routed through the SAME injective encoding,
    // and apply_allowed is now covered by the digest ──────────────────────────────────────────

    @Test
    @DisplayName("REWORK #4 T6: two batch-metadata field-value tuples that would collide under naive "
            + "';key=value' concatenation produce DISTINCT digests once batch-level fields are routed "
            + "through the injective appendField encoding (mirrors the existing per-candidate "
            + "boundary-shift test), and flipping apply_allowed alone changes the digest")
    void batchMetadataEncodingIsInjectiveAndCoversApplyAllowed() {
        OffsetDateTime extractedAt = OffsetDateTime.parse("2026-01-01T00:00:00Z");
        AreaOnboardingApplyService.CandidateRow candidate = new AreaOnboardingApplyService.CandidateRow(
                10L, "IN|KA|Udupi|X", "IN|KA|Udupi|X", null, "READY_TO_CREATE", "APPROVED",
                "{}", "checksum-1", "ext-1", null);

        // datasetId="a;datasetVersion=b", datasetVersion="c" — vs — datasetId="a", datasetVersion="b;datasetVersion=c"
        // Under naive delimiter concatenation these could shift the apparent field boundary; under
        // the injective length-prefixed encoding they must never collide.
        AreaOnboardingApplyService.BatchRow boundaryA = new AreaOnboardingApplyService.BatchRow(
                1L, 7, true, "a;datasetVersion=b", "c", "irrelevant", "test-provider", "1", extractedAt,
                "IN_REVIEW", null, null, null);
        AreaOnboardingApplyService.BatchRow boundaryB = new AreaOnboardingApplyService.BatchRow(
                1L, 7, true, "a", "b;datasetVersion=c", "irrelevant", "test-provider", "1", extractedAt,
                "IN_REVIEW", null, null, null);

        String digestA = AreaOnboardingApplyService.computePersistedBatchChecksum(boundaryA, List.of(candidate));
        String digestB = AreaOnboardingApplyService.computePersistedBatchChecksum(boundaryB, List.of(candidate));
        assertThat(digestA).isNotEqualTo(digestB);

        // Flipping ONLY apply_allowed changes the digest — it now gates whether apply may proceed
        // at all and must be covered (#1887 rework #4 REQUIRED).
        AreaOnboardingApplyService.BatchRow applyAllowedTrue = new AreaOnboardingApplyService.BatchRow(
                1L, 7, true, "dataset-1", "v1", "irrelevant", "test-provider", "1", extractedAt,
                "IN_REVIEW", null, null, null);
        AreaOnboardingApplyService.BatchRow applyAllowedFalse = new AreaOnboardingApplyService.BatchRow(
                1L, 7, false, "dataset-1", "v1", "irrelevant", "test-provider", "1", extractedAt,
                "IN_REVIEW", null, null, null);
        String applyAllowedTrueDigest =
                AreaOnboardingApplyService.computePersistedBatchChecksum(applyAllowedTrue, List.of(candidate));
        String applyAllowedFalseDigest =
                AreaOnboardingApplyService.computePersistedBatchChecksum(applyAllowedFalse, List.of(candidate));
        assertThat(applyAllowedTrueDigest).isNotEqualTo(applyAllowedFalseDigest);
    }

    // ── #1887 rework #3: the digest is now widened to cover EVERY apply-driving/provenance field ──

    @Test
    @DisplayName("REWORK #3: computePersistedBatchChecksum changes when ANY of the newly-covered "
            + "candidate fields differs — input_area_key, normalised_area_key, matched_area_key, "
            + "outcome, review_decision, external_source_id, reviewed_canonical_fingerprint — not "
            + "just id/candidate_payload/payload_checksum")
    void persistedBatchChecksumCoversEveryWidenedCandidateField() {
        OffsetDateTime extractedAt = OffsetDateTime.parse("2026-01-01T00:00:00Z");
        AreaOnboardingApplyService.BatchRow batch = new AreaOnboardingApplyService.BatchRow(
                1L, 7, true, "dataset-1", "v1", "irrelevant-for-this-digest", "test-provider", "1", extractedAt,
                "IN_REVIEW", null, null, null);
        AreaOnboardingApplyService.CandidateRow base = new AreaOnboardingApplyService.CandidateRow(
                10L, "IN|KA|Udupi|X", "IN|KA|Udupi|X", "IN|KA|Udupi|X", "READY_TO_UPDATE", "APPROVED",
                "{\"areaKey\":\"IN|KA|Udupi|X\"}", "checksum-1", "ext-1", "fingerprint-1");
        String baseline = AreaOnboardingApplyService.computePersistedBatchChecksum(batch, List.of(base));

        AreaOnboardingApplyService.CandidateRow inputAreaKeyDiffers = new AreaOnboardingApplyService.CandidateRow(
                10L, "IN|KA|Udupi|DIFFERENT", "IN|KA|Udupi|X", "IN|KA|Udupi|X", "READY_TO_UPDATE", "APPROVED",
                "{\"areaKey\":\"IN|KA|Udupi|X\"}", "checksum-1", "ext-1", "fingerprint-1");
        AreaOnboardingApplyService.CandidateRow normalisedAreaKeyDiffers = new AreaOnboardingApplyService.CandidateRow(
                10L, "IN|KA|Udupi|X", "IN|KA|Udupi|DIFFERENT", "IN|KA|Udupi|X", "READY_TO_UPDATE", "APPROVED",
                "{\"areaKey\":\"IN|KA|Udupi|X\"}", "checksum-1", "ext-1", "fingerprint-1");
        AreaOnboardingApplyService.CandidateRow matchedAreaKeyDiffers = new AreaOnboardingApplyService.CandidateRow(
                10L, "IN|KA|Udupi|X", "IN|KA|Udupi|X", null, "READY_TO_UPDATE", "APPROVED",
                "{\"areaKey\":\"IN|KA|Udupi|X\"}", "checksum-1", "ext-1", "fingerprint-1");
        AreaOnboardingApplyService.CandidateRow outcomeDiffers = new AreaOnboardingApplyService.CandidateRow(
                10L, "IN|KA|Udupi|X", "IN|KA|Udupi|X", "IN|KA|Udupi|X", "UNCHANGED", "APPROVED",
                "{\"areaKey\":\"IN|KA|Udupi|X\"}", "checksum-1", "ext-1", "fingerprint-1");
        AreaOnboardingApplyService.CandidateRow reviewDecisionDiffers = new AreaOnboardingApplyService.CandidateRow(
                10L, "IN|KA|Udupi|X", "IN|KA|Udupi|X", "IN|KA|Udupi|X", "READY_TO_UPDATE", "REJECTED",
                "{\"areaKey\":\"IN|KA|Udupi|X\"}", "checksum-1", "ext-1", "fingerprint-1");
        AreaOnboardingApplyService.CandidateRow externalSourceIdDiffers = new AreaOnboardingApplyService.CandidateRow(
                10L, "IN|KA|Udupi|X", "IN|KA|Udupi|X", "IN|KA|Udupi|X", "READY_TO_UPDATE", "APPROVED",
                "{\"areaKey\":\"IN|KA|Udupi|X\"}", "checksum-1", "ext-DIFFERENT", "fingerprint-1");
        AreaOnboardingApplyService.CandidateRow reviewedFingerprintDiffers = new AreaOnboardingApplyService.CandidateRow(
                10L, "IN|KA|Udupi|X", "IN|KA|Udupi|X", "IN|KA|Udupi|X", "READY_TO_UPDATE", "APPROVED",
                "{\"areaKey\":\"IN|KA|Udupi|X\"}", "checksum-1", "ext-1", "fingerprint-DIFFERENT");
        AreaOnboardingApplyService.CandidateRow reviewedFingerprintNull = new AreaOnboardingApplyService.CandidateRow(
                10L, "IN|KA|Udupi|X", "IN|KA|Udupi|X", "IN|KA|Udupi|X", "READY_TO_UPDATE", "APPROVED",
                "{\"areaKey\":\"IN|KA|Udupi|X\"}", "checksum-1", "ext-1", null);

        assertThat(AreaOnboardingApplyService.computePersistedBatchChecksum(batch, List.of(inputAreaKeyDiffers)))
                .isNotEqualTo(baseline);
        assertThat(AreaOnboardingApplyService.computePersistedBatchChecksum(batch, List.of(normalisedAreaKeyDiffers)))
                .isNotEqualTo(baseline);
        assertThat(AreaOnboardingApplyService.computePersistedBatchChecksum(batch, List.of(matchedAreaKeyDiffers)))
                .isNotEqualTo(baseline);
        assertThat(AreaOnboardingApplyService.computePersistedBatchChecksum(batch, List.of(outcomeDiffers)))
                .isNotEqualTo(baseline);
        assertThat(AreaOnboardingApplyService.computePersistedBatchChecksum(batch, List.of(reviewDecisionDiffers)))
                .isNotEqualTo(baseline);
        assertThat(AreaOnboardingApplyService.computePersistedBatchChecksum(batch, List.of(externalSourceIdDiffers)))
                .isNotEqualTo(baseline);
        assertThat(AreaOnboardingApplyService.computePersistedBatchChecksum(batch, List.of(reviewedFingerprintDiffers)))
                .isNotEqualTo(baseline);
        assertThat(AreaOnboardingApplyService.computePersistedBatchChecksum(batch, List.of(reviewedFingerprintNull)))
                .isNotEqualTo(baseline);

        // Recomputing over the UNCHANGED base row is still stable/deterministic.
        assertThat(AreaOnboardingApplyService.computePersistedBatchChecksum(batch, List.of(base)))
                .isEqualTo(baseline);
    }

    @Test
    @DisplayName("REWORK #3: the length-prefixed field encoding is injective across a field boundary — "
            + "shifting where one field ends and the next begins (e.g. \"ab\"+\"c\" vs \"a\"+\"bc\") "
            + "still produces a DIFFERENT digest, unlike naive delimiter-only concatenation")
    void persistedBatchChecksumEncodingIsInjectiveAcrossFieldBoundary() {
        OffsetDateTime extractedAt = OffsetDateTime.parse("2026-01-01T00:00:00Z");
        AreaOnboardingApplyService.BatchRow batch = new AreaOnboardingApplyService.BatchRow(
                1L, 7, true, "dataset-1", "v1", "irrelevant-for-this-digest", "test-provider", "1", extractedAt,
                "IN_REVIEW", null, null, null);

        // external_source_id="ab", reviewed_canonical_fingerprint="c"
        AreaOnboardingApplyService.CandidateRow boundaryA = new AreaOnboardingApplyService.CandidateRow(
                10L, "IN|KA|Udupi|X", "IN|KA|Udupi|X", null, "READY_TO_CREATE", "APPROVED",
                "{}", "checksum-1", "ab", "c");
        // external_source_id="a", reviewed_canonical_fingerprint="bc" — same concatenation "abc" if
        // the encoding were naive, but a DIFFERENT field-length tuple.
        AreaOnboardingApplyService.CandidateRow boundaryB = new AreaOnboardingApplyService.CandidateRow(
                10L, "IN|KA|Udupi|X", "IN|KA|Udupi|X", null, "READY_TO_CREATE", "APPROVED",
                "{}", "checksum-1", "a", "bc");

        String digestA = AreaOnboardingApplyService.computePersistedBatchChecksum(batch, List.of(boundaryA));
        String digestB = AreaOnboardingApplyService.computePersistedBatchChecksum(batch, List.of(boundaryB));

        assertThat(digestA).isNotEqualTo(digestB);
    }
}

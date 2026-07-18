package com.example.realestate.intelligence;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import org.springframework.jdbc.core.JdbcOperations;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link BuyerAreaIntelligenceService}.
 *
 * <p>Tests are isolated (Mockito only; no Spring context, no DB). The repository is mocked
 * so that k-anonymity suppression, confidence mapping, forbidden-language, and
 * no-row fallback logic can be verified independently.
 *
 * <p>Key invariants verified:
 * <ul>
 *   <li>T1  – Full-confidence snapshot: all metrics exposed, overall label "Enough data".</li>
 *   <li>T2  – Limited-confidence snapshot: overall label "Limited data".</li>
 *   <li>T3  – Insufficient/suppressed: median/dominant null, label "Not enough data yet".</li>
 *   <li>T4  – No-row: available=false, all metric values null, service does NOT throw.</li>
 *   <li>T5  – Below-k-anon: count fields null, priceComparison.wording null.</li>
 *   <li>T5b – Above-k-anon: count fields expose exact int.</li>
 *   <li>T6  – No-fake-zero: suppressed + null-avgQuality rows never emit 0 or "".</li>
 *   <li>T7  – Forbidden language: JSON must not contain "demand", broker/agent language, etc.</li>
 *   <li>T8  – Soft price wording: exact string when supported; null when not.</li>
 *   <li>T9  – mostSearchedBudget: always null value + "Not enough data yet".</li>
 *   <li>T10 – avgListingQuality: non-null value exposed; null entity value → null metric value.</li>
 *   <li>T_confidence_drift – null/unexpected confidence string: no exception, fallback label.</li>
 *   <li>T13 – City-aware lookup: repository.findById called with both citySlug AND areaKey.</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class BuyerAreaIntelligenceServiceTest {

    @Mock
    private AreaIntelligenceSnapshotRepository repository;

    @Mock
    private JdbcOperations jdbcOperations;

    @Mock
    private com.example.realestate.discover.CityActivationGuard cityActivationGuard;

    private BuyerAreaIntelligenceService service;

    /** Shared Jackson mapper for T7 JSON serialisation tests. */
    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        // #1935: getAreaIntelligence(citySlug, areaKey) short-circuits to the UNAVAILABLE
        // response when cityActivationGuard.isActiveCitySlug(citySlug) is false, before ever
        // calling repository.findById. Every test in this file exercises "udupi"/"mangalore"
        // expecting the repository lookup to actually run, so stub the guard true to preserve
        // pre-#1935 behaviour.
        org.mockito.Mockito.lenient().when(cityActivationGuard.isActiveCitySlug(org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(true);
        service = new BuyerAreaIntelligenceService(repository, jdbcOperations, cityActivationGuard);
    }

    // ── T1: Full-confidence snapshot ──────────────────────────────────────────

    @Test
    @DisplayName("T1: full confidence, priceComparisonSupported=true → overall 'Enough data', all metrics populated")
    void getAreaIntelligence_fullConfidence_allMetricsPopulated() {
        AreaIntelligenceSnapshot snap = snapshot(
                "udupi", "IN|KA|Udupi|Malpe", "Malpe",
                "full", true,
                10_000_000L, "apartment",
                30, 8,
                new BigDecimal("82.50")
        );
        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|Malpe")))
                .thenReturn(Optional.of(snap));

        BuyerAreaIntelligenceResponse resp = service.getAreaIntelligence("udupi", "IN|KA|Udupi|Malpe");

        assertThat(resp.available()).isTrue();
        assertThat(resp.confidenceLabel()).isEqualTo("Enough data");
        assertThat(resp.metrics().medianPricePaise().value()).isEqualTo(10_000_000L);
        assertThat(resp.metrics().medianPricePaise().confidenceLabel()).isEqualTo("Enough data");
        assertThat(resp.metrics().dominantPropertyType().value()).isEqualTo("apartment");
        assertThat(resp.metrics().dominantPropertyType().confidenceLabel()).isEqualTo("Enough data");
        assertThat(resp.metrics().activeListingCount().value()).isEqualTo(30);
        assertThat(resp.metrics().freshListingCount().value()).isEqualTo(8);
        assertThat(resp.metrics().avgListingQuality().value()).isEqualByComparingTo(new BigDecimal("82.50"));
        assertThat(resp.metrics().avgListingQuality().confidenceLabel()).isEqualTo("Enough data");
    }

    // ── T2: Limited confidence ────────────────────────────────────────────────

    @Test
    @DisplayName("T2: limited confidence → overall 'Limited data'")
    void getAreaIntelligence_limitedConfidence_overallLabelLimitedData() {
        AreaIntelligenceSnapshot snap = snapshot(
                "udupi", "IN|KA|Udupi|Kunjibettu", "Kunjibettu",
                "limited", true,
                7_000_000L, "house",
                15, 4,
                new BigDecimal("75.00")
        );
        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|Kunjibettu")))
                .thenReturn(Optional.of(snap));

        BuyerAreaIntelligenceResponse resp = service.getAreaIntelligence("udupi", "IN|KA|Udupi|Kunjibettu");

        assertThat(resp.available()).isTrue();
        assertThat(resp.confidenceLabel()).isEqualTo("Limited data");
    }

    // ── T3: Insufficient / suppressed ────────────────────────────────────────

    @Test
    @DisplayName("T3: insufficient confidence, priceComparisonSupported=false → overall 'Not enough data yet', median/dominant null")
    void getAreaIntelligence_insufficientSuppressed_metricsNull() {
        AreaIntelligenceSnapshot snap = snapshot(
                "udupi", "IN|KA|Udupi|TinyVillage", "TinyVillage",
                "insufficient", false,
                null, null,
                5, 1,
                null
        );
        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|TinyVillage")))
                .thenReturn(Optional.of(snap));

        BuyerAreaIntelligenceResponse resp = service.getAreaIntelligence("udupi", "IN|KA|Udupi|TinyVillage");

        assertThat(resp.available()).isTrue();
        assertThat(resp.confidenceLabel()).isEqualTo("Not enough data yet");
        assertThat(resp.metrics().medianPricePaise().value()).isNull();
        assertThat(resp.metrics().medianPricePaise().confidenceLabel()).isEqualTo("Not enough data yet");
        assertThat(resp.metrics().dominantPropertyType().value()).isNull();
        assertThat(resp.metrics().dominantPropertyType().confidenceLabel()).isEqualTo("Not enough data yet");
    }

    // ── T4: No-row (repository returns empty) ────────────────────────────────

    @Test
    @DisplayName("T4: no snapshot row → available=false, ALL metric values null, service does NOT throw")
    void getAreaIntelligence_noRow_unavailableResponse() {
        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|NoWhere")))
                .thenReturn(Optional.empty());

        BuyerAreaIntelligenceResponse resp = service.getAreaIntelligence("udupi", "IN|KA|Udupi|NoWhere");

        assertThat(resp.available()).isFalse();
        assertThat(resp.confidenceLabel()).isEqualTo("Not enough data yet");
        assertThat(resp.metrics().medianPricePaise().value()).isNull();
        assertThat(resp.metrics().dominantPropertyType().value()).isNull();
        assertThat(resp.metrics().activeListingCount().value()).isNull();
        assertThat(resp.metrics().freshListingCount().value()).isNull();
        assertThat(resp.metrics().avgListingQuality().value()).isNull();
        assertThat(resp.metrics().mostSearchedBudget().value()).isNull();
    }

    // ── T5: Count suppression below k-anon ───────────────────────────────────

    @Test
    @DisplayName("T5: priceComparisonSupported=false → activeListingCount and freshListingCount null, wording null")
    void getAreaIntelligence_belowKAnon_countsAndWordingNull() {
        AreaIntelligenceSnapshot snap = snapshot(
                "udupi", "IN|KA|Udupi|Sparse", "Sparse",
                "insufficient", false,
                null, null,
                7, 2,
                null
        );
        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|Sparse")))
                .thenReturn(Optional.of(snap));

        BuyerAreaIntelligenceResponse resp = service.getAreaIntelligence("udupi", "IN|KA|Udupi|Sparse");

        assertThat(resp.metrics().activeListingCount().value()).isNull();
        assertThat(resp.metrics().activeListingCount().confidenceLabel()).isEqualTo("Not enough data yet");
        assertThat(resp.metrics().freshListingCount().value()).isNull();
        assertThat(resp.metrics().freshListingCount().confidenceLabel()).isEqualTo("Not enough data yet");
        assertThat(resp.priceComparison().supported()).isFalse();
        assertThat(resp.priceComparison().wording()).isNull();
    }

    // ── T5b: Counts exposed above k-anon ─────────────────────────────────────

    @Test
    @DisplayName("T5b: priceComparisonSupported=true → activeListingCount and freshListingCount expose exact int")
    void getAreaIntelligence_aboveKAnon_countsExposed() {
        AreaIntelligenceSnapshot snap = snapshot(
                "udupi", "IN|KA|Udupi|Malpe", "Malpe",
                "full", true,
                12_000_000L, "apartment",
                35, 12,
                new BigDecimal("88.00")
        );
        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|Malpe")))
                .thenReturn(Optional.of(snap));

        BuyerAreaIntelligenceResponse resp = service.getAreaIntelligence("udupi", "IN|KA|Udupi|Malpe");

        assertThat(resp.metrics().activeListingCount().value()).isEqualTo(35);
        assertThat(resp.metrics().freshListingCount().value()).isEqualTo(12);
    }

    // ── T6: No fake-zero ──────────────────────────────────────────────────────

    @Test
    @DisplayName("T6: suppressed snapshot → all suppressed metric values are null, NOT 0 or empty string")
    void getAreaIntelligence_suppressed_noFakeZero() {
        AreaIntelligenceSnapshot snap = snapshot(
                "udupi", "IN|KA|Udupi|FakeZeroCheck", "FakeZeroCheck",
                "insufficient", false,
                null, null,
                4, 0,
                null
        );
        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|FakeZeroCheck")))
                .thenReturn(Optional.of(snap));

        BuyerAreaIntelligenceResponse resp = service.getAreaIntelligence("udupi", "IN|KA|Udupi|FakeZeroCheck");

        // None of the suppressed/null values should be 0, "" or false disguised as data
        assertThat(resp.metrics().medianPricePaise().value()).isNull();
        assertThat(resp.metrics().dominantPropertyType().value()).isNull();
        assertThat(resp.metrics().activeListingCount().value()).isNull();
        assertThat(resp.metrics().freshListingCount().value()).isNull();
        assertThat(resp.metrics().avgListingQuality().value()).isNull();
        assertThat(resp.metrics().mostSearchedBudget().value()).isNull();
    }

    @Test
    @DisplayName("T6b: null avgListingQuality entity field → avgListingQuality metric value is null")
    void getAreaIntelligence_nullAvgQualityRow_metricValueNull() {
        AreaIntelligenceSnapshot snap = snapshot(
                "udupi", "IN|KA|Udupi|Malpe", "Malpe",
                "full", true,
                10_000_000L, "apartment",
                30, 8,
                null  // avgListingQuality intentionally null
        );
        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|Malpe")))
                .thenReturn(Optional.of(snap));

        BuyerAreaIntelligenceResponse resp = service.getAreaIntelligence("udupi", "IN|KA|Udupi|Malpe");

        assertThat(resp.metrics().avgListingQuality().value()).isNull();
        assertThat(resp.metrics().avgListingQuality().confidenceLabel()).isEqualTo("Not enough data yet");
    }

    // ── T7: Forbidden language (JSON serialisation) ───────────────────────────

    @Test
    @DisplayName("T7: JSON output contains no forbidden language (demand, broker, agent, guaranteed, outperform, etc.)")
    void getAreaIntelligence_fullData_jsonContainsNoForbiddenLanguage() throws Exception {
        AreaIntelligenceSnapshot snap = snapshot(
                "udupi", "IN|KA|Udupi|Malpe", "Malpe",
                "full", true,
                10_000_000L, "apartment",
                30, 8,
                new BigDecimal("82.50")
        );
        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|Malpe")))
                .thenReturn(Optional.of(snap));

        BuyerAreaIntelligenceResponse resp = service.getAreaIntelligence("udupi", "IN|KA|Udupi|Malpe");
        String json = objectMapper.writeValueAsString(resp);
        String lowerJson = json.toLowerCase();

        assertThat(lowerJson).doesNotContain("demand");
        assertThat(lowerJson).doesNotContain("demandscore");
        assertThat(lowerJson).doesNotContain("missed lead");
        assertThat(lowerJson).doesNotContain("broker");
        assertThat(lowerJson).doesNotContain("agent action");
        assertThat(lowerJson).doesNotContain("opportunity");
        assertThat(lowerJson).doesNotContain("outperform");
        assertThat(lowerJson).doesNotContain("is above");
        assertThat(lowerJson).doesNotContain("below average");
        assertThat(lowerJson).doesNotContain("guaranteed");
    }

    @Test
    @DisplayName("T7 no-row: JSON for unavailable response also contains no forbidden language")
    void getAreaIntelligence_noRow_jsonContainsNoForbiddenLanguage() throws Exception {
        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|NoWhere")))
                .thenReturn(Optional.empty());

        BuyerAreaIntelligenceResponse resp = service.getAreaIntelligence("udupi", "IN|KA|Udupi|NoWhere");
        String json = objectMapper.writeValueAsString(resp);
        String lowerJson = json.toLowerCase();

        assertThat(lowerJson).doesNotContain("demand");
        assertThat(lowerJson).doesNotContain("broker");
        assertThat(lowerJson).doesNotContain("guaranteed");
        assertThat(lowerJson).doesNotContain("outperform");
    }

    // ── T8: Soft price wording ────────────────────────────────────────────────

    @Test
    @DisplayName("T8a: priceComparisonSupported=true → wording is exactly the soft-form phrase")
    void getAreaIntelligence_priceSupported_softWordingPresent() {
        AreaIntelligenceSnapshot snap = snapshot(
                "udupi", "IN|KA|Udupi|Malpe", "Malpe",
                "full", true,
                10_000_000L, "apartment",
                30, 8,
                new BigDecimal("82.50")
        );
        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|Malpe")))
                .thenReturn(Optional.of(snap));

        BuyerAreaIntelligenceResponse resp = service.getAreaIntelligence("udupi", "IN|KA|Udupi|Malpe");

        assertThat(resp.priceComparison().supported()).isTrue();
        assertThat(resp.priceComparison().wording())
                .isEqualTo("This area may be above similar visible listings");
    }

    @Test
    @DisplayName("T8b: priceComparisonSupported=false → wording is null")
    void getAreaIntelligence_priceNotSupported_wordingNull() {
        AreaIntelligenceSnapshot snap = snapshot(
                "udupi", "IN|KA|Udupi|Sparse", "Sparse",
                "insufficient", false,
                null, null,
                5, 1,
                null
        );
        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|Sparse")))
                .thenReturn(Optional.of(snap));

        BuyerAreaIntelligenceResponse resp = service.getAreaIntelligence("udupi", "IN|KA|Udupi|Sparse");

        assertThat(resp.priceComparison().supported()).isFalse();
        assertThat(resp.priceComparison().wording()).isNull();
    }

    // ── T9: mostSearchedBudget always null ───────────────────────────────────

    @Test
    @DisplayName("T9a: full-data row → mostSearchedBudget value always null + 'Not enough data yet'")
    void getAreaIntelligence_fullData_mostSearchedBudgetAlwaysNull() {
        AreaIntelligenceSnapshot snap = snapshot(
                "udupi", "IN|KA|Udupi|Malpe", "Malpe",
                "full", true,
                10_000_000L, "apartment",
                30, 8,
                new BigDecimal("82.50")
        );
        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|Malpe")))
                .thenReturn(Optional.of(snap));

        BuyerAreaIntelligenceResponse resp = service.getAreaIntelligence("udupi", "IN|KA|Udupi|Malpe");

        assertThat(resp.metrics().mostSearchedBudget().value()).isNull();
        assertThat(resp.metrics().mostSearchedBudget().confidenceLabel()).isEqualTo("Not enough data yet");
    }

    @Test
    @DisplayName("T9b: no-row case → mostSearchedBudget value null + 'Not enough data yet'")
    void getAreaIntelligence_noRow_mostSearchedBudgetAlwaysNull() {
        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|NoWhere")))
                .thenReturn(Optional.empty());

        BuyerAreaIntelligenceResponse resp = service.getAreaIntelligence("udupi", "IN|KA|Udupi|NoWhere");

        assertThat(resp.metrics().mostSearchedBudget().value()).isNull();
        assertThat(resp.metrics().mostSearchedBudget().confidenceLabel()).isEqualTo("Not enough data yet");
    }

    // ── T10: avgListingQuality ────────────────────────────────────────────────

    @Test
    @DisplayName("T10a: non-null avgListingQuality → value present in metric + overall label")
    void getAreaIntelligence_nonNullAvgQuality_valueAndLabelPresent() {
        AreaIntelligenceSnapshot snap = snapshot(
                "udupi", "IN|KA|Udupi|Malpe", "Malpe",
                "full", true,
                10_000_000L, "apartment",
                30, 8,
                new BigDecimal("79.25")
        );
        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|Malpe")))
                .thenReturn(Optional.of(snap));

        BuyerAreaIntelligenceResponse resp = service.getAreaIntelligence("udupi", "IN|KA|Udupi|Malpe");

        assertThat(resp.metrics().avgListingQuality().value()).isEqualByComparingTo(new BigDecimal("79.25"));
        assertThat(resp.metrics().avgListingQuality().confidenceLabel()).isEqualTo("Enough data");
    }

    @Test
    @DisplayName("T10b: null avgListingQuality entity → value null + 'Not enough data yet'")
    void getAreaIntelligence_nullAvgQuality_metricLabelNotEnoughData() {
        AreaIntelligenceSnapshot snap = snapshot(
                "udupi", "IN|KA|Udupi|Malpe", "Malpe",
                "full", true,
                10_000_000L, "apartment",
                30, 8,
                null
        );
        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|Malpe")))
                .thenReturn(Optional.of(snap));

        BuyerAreaIntelligenceResponse resp = service.getAreaIntelligence("udupi", "IN|KA|Udupi|Malpe");

        assertThat(resp.metrics().avgListingQuality().value()).isNull();
        assertThat(resp.metrics().avgListingQuality().confidenceLabel()).isEqualTo("Not enough data yet");
    }

    // ── T_confidence_drift: null / unexpected confidence string ───────────────

    @Test
    @DisplayName("T_confidence_drift null: confidence=null in snapshot → no exception, overall 'Not enough data yet', available=true")
    void getAreaIntelligence_confidenceNull_fallsBackGracefully() {
        AreaIntelligenceSnapshot snap = snapshot(
                "udupi", "IN|KA|Udupi|Malpe", "Malpe",
                null, true,
                10_000_000L, "apartment",
                30, 8,
                new BigDecimal("82.50")
        );
        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|Malpe")))
                .thenReturn(Optional.of(snap));

        BuyerAreaIntelligenceResponse resp = service.getAreaIntelligence("udupi", "IN|KA|Udupi|Malpe");

        assertThat(resp.available()).isTrue();
        assertThat(resp.confidenceLabel()).isEqualTo("Not enough data yet");
    }

    @Test
    @DisplayName("T_confidence_drift weird: confidence='WEIRD' → no exception, overall 'Not enough data yet', available=true")
    void getAreaIntelligence_confidenceWeird_fallsBackGracefully() {
        AreaIntelligenceSnapshot snap = snapshot(
                "udupi", "IN|KA|Udupi|Malpe", "Malpe",
                "WEIRD", true,
                10_000_000L, "apartment",
                30, 8,
                new BigDecimal("82.50")
        );
        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|Malpe")))
                .thenReturn(Optional.of(snap));

        BuyerAreaIntelligenceResponse resp = service.getAreaIntelligence("udupi", "IN|KA|Udupi|Malpe");

        assertThat(resp.available()).isTrue();
        assertThat(resp.confidenceLabel()).isEqualTo("Not enough data yet");
    }

    // ── T13: City-aware lookup ────────────────────────────────────────────────

    @Test
    @DisplayName("T13a: service calls findById with AreaIntelligenceSnapshotId(citySlug, areaKey)")
    void getAreaIntelligence_cityAwareLookup_findByIdUsesCorrectCompositeKey() {
        ArgumentCaptor<AreaIntelligenceSnapshotId> captor =
                ArgumentCaptor.forClass(AreaIntelligenceSnapshotId.class);

        when(repository.findById(captor.capture())).thenReturn(Optional.empty());

        service.getAreaIntelligence("mangalore", "IN|KA|Mangalore|Kadri");

        AreaIntelligenceSnapshotId usedId = captor.getValue();
        assertThat(usedId.getCitySlug()).isEqualTo("mangalore");
        assertThat(usedId.getAreaKey()).isEqualTo("IN|KA|Mangalore|Kadri");
    }

    @Test
    @DisplayName("T13b: mismatched citySlug yields no-row/unavailable path (repository returns empty)")
    void getAreaIntelligence_mismatchedCitySlug_returnsUnavailable() {
        // repository returns empty for the mismatched composite key
        when(repository.findById(new AreaIntelligenceSnapshotId("bangalore", "IN|KA|Udupi|Malpe")))
                .thenReturn(Optional.empty());

        BuyerAreaIntelligenceResponse resp = service.getAreaIntelligence("bangalore", "IN|KA|Udupi|Malpe");

        assertThat(resp.available()).isFalse();
        assertThat(resp.confidenceLabel()).isEqualTo("Not enough data yet");

        // verify the exact composite key used
        verify(repository).findById(new AreaIntelligenceSnapshotId("bangalore", "IN|KA|Udupi|Malpe"));
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    /**
     * Builds an {@link AreaIntelligenceSnapshot} with all fields set via setters.
     *
     * <p>activeListingCount and freshListingCount are primitive ints; the entity uses boxed
     * getters only for medianPricePaise (Long), dominantPropertyType (String), and
     * avgListingQuality (BigDecimal).
     */
    private static AreaIntelligenceSnapshot snapshot(
            String citySlug, String areaKey, String areaLabel,
            String confidence, boolean priceComparisonSupported,
            Long medianPricePaise, String dominantPropertyType,
            int activeListingCount, int freshListingCount,
            BigDecimal avgListingQuality) {

        AreaIntelligenceSnapshot s = new AreaIntelligenceSnapshot();
        s.setCitySlug(citySlug);
        s.setAreaKey(areaKey);
        s.setAreaLabel(areaLabel);
        s.setComputedAt(Instant.parse("2026-06-21T00:00:00Z"));
        s.setConfidence(confidence);
        s.setPriceComparisonSupported(priceComparisonSupported);
        s.setMedianPricePaise(medianPricePaise);
        s.setDominantPropertyType(dominantPropertyType);
        s.setActiveListingCount(activeListingCount);
        s.setFreshListingCount(freshListingCount);
        s.setAvgListingQuality(avgListingQuality);
        s.setPriceComparisonSampleCount(activeListingCount);
        // demandScore stays null — always
        return s;
    }
}

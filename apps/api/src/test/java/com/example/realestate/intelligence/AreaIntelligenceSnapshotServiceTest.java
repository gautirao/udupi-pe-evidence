package com.example.realestate.intelligence;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link AreaIntelligenceSnapshotService}.
 *
 * <p>Tests are isolated (Mockito only; no Spring context). The repository is mocked
 * so that k-anonymity suppression, confidence classification, and field mapping logic
 * can be verified independently of the database.
 *
 * <p>Key invariants verified:
 * <ul>
 *   <li>k-anonymity: activeListingCount < K_ANON_MIN → median/dominant suppressed (NULL, not 0).</li>
 *   <li>k-anonymity boundary at exactly 9 and 10.</li>
 *   <li>avg_listing_quality: null (not 0) when scoredCount=0.</li>
 *   <li>demand_score: always null.</li>
 *   <li>confidence: lowercase enum name from AreaConfidence.classify.</li>
 *   <li>price_comparison_sample_count: equals activeListingCount.</li>
 *   <li>fresh_listing_count: passed through from query row.</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class AreaIntelligenceSnapshotServiceTest {

    @Mock
    private AreaIntelligenceSnapshotRepository snapshotRepository;

    private AreaIntelligenceSnapshotService service;

    @BeforeEach
    void setUp() {
        service = new AreaIntelligenceSnapshotService(snapshotRepository);
    }

    // ── toSnapshot: k-anonymity suppression ───────────────────────────────────

    @Test
    @DisplayName("activeCount=9 (below K_ANON_MIN=10): median and dominant suppressed, supported=false")
    void toSnapshot_belowKanonMin_suppressesPreciseValues() {
        AreaIntelligenceSnapshotRow row = rowWith("udupi", "IN|KA|Udupi|Manipal", "Manipal",
                9L,   // activeListingCount — exactly 1 below K_ANON_MIN
                3L,   // freshListingCount
                5_000_000.0,  // medianPricePaise (Double — PERCENTILE_CONT returns float8) — must be suppressed
                "apartment",  // dominantPropertyType — must be suppressed
                2L,   // scoredCount
                78.5  // avgQuality
        );
        Instant now = Instant.now();

        AreaIntelligenceSnapshot snap = service.toSnapshot(row, now);

        assertThat(snap.getMedianPricePaise()).isNull();
        assertThat(snap.getDominantPropertyType()).isNull();
        assertThat(snap.isPriceComparisonSupported()).isFalse();
        assertThat(snap.getPriceComparisonSampleCount()).isEqualTo(9);
        assertThat(snap.getConfidence()).isEqualTo("insufficient");
        // avg_listing_quality still passes through (not a precise stat subject to k-anon)
        // setScale(2, HALF_UP) is applied in toSnapshot: 78.5 → 78.50 (scale=2).
        assertThat(snap.getAvgListingQuality()).isEqualByComparingTo(new BigDecimal("78.50"));
        assertThat(snap.getAvgListingQuality().scale())
                .as("avgListingQuality must have scale=2 after setScale(2, HALF_UP)")
                .isEqualTo(2);
        // demand_score always null
        assertThat(snap.getDemandScore()).isNull();
    }

    @Test
    @DisplayName("activeCount=10 (exactly K_ANON_MIN): median and dominant exposed, supported=true")
    void toSnapshot_atKanonMin_exposesPreciseValues() {
        AreaIntelligenceSnapshotRow row = rowWith("udupi", "IN|KA|Udupi|Kunjibettu", "Kunjibettu",
                10L, 4L, 6_500_000.0, "house", 8L, 82.0);
        Instant now = Instant.now();

        AreaIntelligenceSnapshot snap = service.toSnapshot(row, now);

        assertThat(snap.getMedianPricePaise()).isEqualTo(6_500_000L);
        assertThat(snap.getDominantPropertyType()).isEqualTo("house");
        assertThat(snap.isPriceComparisonSupported()).isTrue();
        assertThat(snap.getPriceComparisonSampleCount()).isEqualTo(10);
        assertThat(snap.getConfidence()).isEqualTo("limited");
        assertThat(snap.getDemandScore()).isNull();
    }

    @Test
    @DisplayName("activeCount=30 (exactly FULL threshold): confidence=full, values exposed")
    void toSnapshot_atFullThreshold_confidenceFull() {
        AreaIntelligenceSnapshotRow row = rowWith("bangalore", "IN|KA|Bengaluru|Koramangala", "Koramangala",
                30L, 10L, 15_000_000.0, "apartment", 25L, 91.0);

        AreaIntelligenceSnapshot snap = service.toSnapshot(row, Instant.now());

        assertThat(snap.getConfidence()).isEqualTo("full");
        assertThat(snap.isPriceComparisonSupported()).isTrue();
        assertThat(snap.getMedianPricePaise()).isEqualTo(15_000_000L);
        assertThat(snap.getDemandScore()).isNull();
    }

    @Test
    @DisplayName("activeCount=29 (below FULL threshold): confidence=limited")
    void toSnapshot_justBelowFullThreshold_confidenceLimited() {
        AreaIntelligenceSnapshotRow row = rowWith("mangalore", "IN|KA|Mangalore|Kadri", "Kadri",
                29L, 5L, 8_000_000.0, "plot", 20L, 75.0);

        AreaIntelligenceSnapshot snap = service.toSnapshot(row, Instant.now());

        assertThat(snap.getConfidence()).isEqualTo("limited");
    }

    // ── toSnapshot: avg_listing_quality scale and HALF_UP rounding ───────────

    @Test
    @DisplayName("avgQuality with fractional third decimal: setScale(2, HALF_UP) rounds correctly, scale=2")
    void toSnapshot_avgQuality_halfUpRounding_scaleTwo() {
        // 70.555 → HALF_UP at 2dp → 70.56
        AreaIntelligenceSnapshotRow row = rowWith("udupi", "IN|KA|Udupi|Malpe", "Malpe",
                12L, 3L, 8_000_000.0, "house",
                12L, 70.555);

        AreaIntelligenceSnapshot snap = service.toSnapshot(row, Instant.now());

        assertThat(snap.getAvgListingQuality())
                .as("avgListingQuality: 70.555 rounded HALF_UP to 2dp must be 70.56")
                .isNotNull()
                .isEqualByComparingTo(new BigDecimal("70.56"));

        assertThat(snap.getAvgListingQuality().scale())
                .as("avgListingQuality must have scale=2 after setScale(2, HALF_UP)")
                .isEqualTo(2);
    }

    @Test
    @DisplayName("avgQuality=70.5: HALF_UP rounds to 70.50, scale=2")
    void toSnapshot_avgQuality_halfExactly_scaleTwo() {
        // 70.5 → HALF_UP at 2dp → 70.50
        AreaIntelligenceSnapshotRow row = rowWith("udupi", "IN|KA|Udupi|Kunjibettu", "Kunjibettu",
                10L, 2L, 7_000_000.0, "house",
                10L, 70.5);

        AreaIntelligenceSnapshot snap = service.toSnapshot(row, Instant.now());

        assertThat(snap.getAvgListingQuality())
                .as("avgListingQuality: 70.5 → 70.50 at scale=2")
                .isNotNull()
                .isEqualByComparingTo(new BigDecimal("70.50"));

        assertThat(snap.getAvgListingQuality().scale())
                .as("scale must be 2")
                .isEqualTo(2);
    }

    // ── toSnapshot: avg_listing_quality null safety ────────────────────────────

    @Test
    @DisplayName("avgQuality=null (no scored rows): avgListingQuality stays null, not 0")
    void toSnapshot_noScoredRows_avgQualityStaysNull() {
        AreaIntelligenceSnapshotRow row = rowWith("udupi", "IN|KA|Udupi|Malpe", "Malpe",
                15L, 2L, 7_000_000.0, "plot",
                0L,   // scoredCount=0
                null  // avgQuality=null — backfill-incomplete
        );

        AreaIntelligenceSnapshot snap = service.toSnapshot(row, Instant.now());

        assertThat(snap.getAvgListingQuality()).isNull();
        // demand_score always null regardless of scored count
        assertThat(snap.getDemandScore()).isNull();
    }

    // ── toSnapshot: field passthrough ─────────────────────────────────────────

    @Test
    @DisplayName("citySlug, areaKey, areaLabel, computedAt, freshListingCount are passed through correctly")
    void toSnapshot_fieldPassthrough() {
        Instant fixedNow = Instant.parse("2026-06-21T10:00:00Z");
        AreaIntelligenceSnapshotRow row = rowWith("kundapur", "IN|KA|Udupi|Kundapura", "Kundapura",
                12L, 5L, 9_000_000.0, "house", 10L, 88.0);

        AreaIntelligenceSnapshot snap = service.toSnapshot(row, fixedNow);

        assertThat(snap.getCitySlug()).isEqualTo("kundapur");
        assertThat(snap.getAreaKey()).isEqualTo("IN|KA|Udupi|Kundapura");
        assertThat(snap.getAreaLabel()).isEqualTo("Kundapura");
        assertThat(snap.getComputedAt()).isEqualTo(fixedNow);
        assertThat(snap.getFreshListingCount()).isEqualTo(5);
        assertThat(snap.getActiveListingCount()).isEqualTo(12);
    }

    // ── buildSnapshots: integration smoke ─────────────────────────────────────

    @Test
    @DisplayName("buildSnapshots: calls findRawAggregates with FRESH_WINDOW_DAYS and saveAllAndFlush")
    void buildSnapshots_callsRepositoryCorrectly() {
        AreaIntelligenceSnapshotRow row = rowWith("udupi", "IN|KA|Udupi|Manipal", "Manipal",
                20L, 8L, 10_000_000.0, "apartment", 15L, 85.0);
        when(snapshotRepository.findRawAggregates(AggregationConstants.FRESH_WINDOW_DAYS))
                .thenReturn(List.of(row));
        when(snapshotRepository.saveAllAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        int count = service.buildSnapshots();

        assertThat(count).isEqualTo(1);
        verify(snapshotRepository).findRawAggregates(AggregationConstants.FRESH_WINDOW_DAYS);
        verify(snapshotRepository).saveAllAndFlush(any());
    }

    @Test
    @DisplayName("buildSnapshots: empty aggregate result → saveAllAndFlush called with empty list, returns 0")
    void buildSnapshots_emptyAggregates_returnsZero() {
        when(snapshotRepository.findRawAggregates(AggregationConstants.FRESH_WINDOW_DAYS))
                .thenReturn(List.of());
        when(snapshotRepository.saveAllAndFlush(any())).thenAnswer(inv -> inv.getArgument(0));

        int count = service.buildSnapshots();

        assertThat(count).isEqualTo(0);
    }

    // ── BuyerConfidenceLabel: boundary mapping ─────────────────────────────────

    @Test
    @DisplayName("BuyerConfidenceLabel.of(FULL) returns ENOUGH_DATA")
    void buyerLabel_full_returnsEnoughData() {
        assertThat(BuyerConfidenceLabel.of(AreaConfidence.FULL))
                .isEqualTo(BuyerConfidenceLabel.ENOUGH_DATA);
        assertThat(BuyerConfidenceLabel.ENOUGH_DATA.getDisplayLabel()).isEqualTo("Enough data");
    }

    @Test
    @DisplayName("BuyerConfidenceLabel.of(LIMITED) returns LIMITED_DATA")
    void buyerLabel_limited_returnsLimitedData() {
        assertThat(BuyerConfidenceLabel.of(AreaConfidence.LIMITED))
                .isEqualTo(BuyerConfidenceLabel.LIMITED_DATA);
        assertThat(BuyerConfidenceLabel.LIMITED_DATA.getDisplayLabel()).isEqualTo("Limited data");
    }

    @Test
    @DisplayName("BuyerConfidenceLabel.of(INSUFFICIENT) returns NOT_ENOUGH_DATA")
    void buyerLabel_insufficient_returnsNotEnoughData() {
        assertThat(BuyerConfidenceLabel.of(AreaConfidence.INSUFFICIENT))
                .isEqualTo(BuyerConfidenceLabel.NOT_ENOUGH_DATA);
        assertThat(BuyerConfidenceLabel.NOT_ENOUGH_DATA.getDisplayLabel()).isEqualTo("Not enough data yet");
    }

    @Test
    @DisplayName("BuyerConfidenceLabel.ofLabel(String) works for all three lowercase values")
    void buyerLabel_ofLabel_allValues() {
        assertThat(BuyerConfidenceLabel.ofLabel("full")).isEqualTo(BuyerConfidenceLabel.ENOUGH_DATA);
        assertThat(BuyerConfidenceLabel.ofLabel("limited")).isEqualTo(BuyerConfidenceLabel.LIMITED_DATA);
        assertThat(BuyerConfidenceLabel.ofLabel("insufficient")).isEqualTo(BuyerConfidenceLabel.NOT_ENOUGH_DATA);
    }

    @Test
    @DisplayName("BuyerConfidenceLabel.of(null) throws IllegalArgumentException")
    void buyerLabel_ofNull_throwsIllegalArgument() {
        org.junit.jupiter.api.Assertions.assertThrows(
                IllegalArgumentException.class,
                () -> BuyerConfidenceLabel.of(null),
                "BuyerConfidenceLabel.of(null) must throw IllegalArgumentException");
    }

    @Test
    @DisplayName("BuyerConfidenceLabel.ofLabel(null) throws IllegalArgumentException")
    void buyerLabel_ofLabelNull_throwsIllegalArgument() {
        org.junit.jupiter.api.Assertions.assertThrows(
                IllegalArgumentException.class,
                () -> BuyerConfidenceLabel.ofLabel(null),
                "BuyerConfidenceLabel.ofLabel(null) must throw IllegalArgumentException");
    }

    @Test
    @DisplayName("BuyerConfidenceLabel.ofLabel(invalid) throws IllegalArgumentException")
    void buyerLabel_ofLabelInvalid_throwsIllegalArgument() {
        org.junit.jupiter.api.Assertions.assertThrows(
                IllegalArgumentException.class,
                () -> BuyerConfidenceLabel.ofLabel("unknown"),
                "BuyerConfidenceLabel.ofLabel('unknown') must throw IllegalArgumentException");
    }

    // ── T4: AggregationConstants values ───────────────────────────────────────

    @Test
    @DisplayName("AggregationConstants.K_ANON_MIN == 10")
    void aggregationConstants_kAnonMin_is10() {
        assertThat(AggregationConstants.K_ANON_MIN)
                .as("K_ANON_MIN must be exactly 10 — changing it alters privacy guarantees")
                .isEqualTo(10);
    }

    @Test
    @DisplayName("AggregationConstants.FRESH_WINDOW_DAYS == 30")
    void aggregationConstants_freshWindowDays_is30() {
        assertThat(AggregationConstants.FRESH_WINDOW_DAYS)
                .as("FRESH_WINDOW_DAYS must be exactly 30")
                .isEqualTo(30);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    /**
     * Create a stub {@link AreaIntelligenceSnapshotRow} backed by anonymous class.
     *
     * <p>{@code medianPricePaise} is {@code Double} — matching the JDBC type returned by
     * PostgreSQL's {@code PERCENTILE_CONT} over a {@code BIGINT} column (returns float8).
     * The service converts to {@code Long} via {@code Math.round()} before writing to the entity.
     */
    private static AreaIntelligenceSnapshotRow rowWith(
            String citySlug, String areaKey, String areaLabel,
            Long activeListingCount, Long freshListingCount,
            Double medianPricePaise, String dominantPropertyType,
            Long scoredCount, Double avgQuality) {

        return new AreaIntelligenceSnapshotRow() {
            @Override public String getCitySlug()             { return citySlug; }
            @Override public String getAreaKey()              { return areaKey; }
            @Override public String getAreaLabel()            { return areaLabel; }
            @Override public Long   getActiveListingCount()   { return activeListingCount; }
            @Override public Long   getFreshListingCount()    { return freshListingCount; }
            @Override public Double getMedianPricePaise()     { return medianPricePaise; }
            @Override public String getDominantPropertyType() { return dominantPropertyType; }
            @Override public Long   getScoredCount()          { return scoredCount; }
            @Override public Double getAvgQuality()           { return avgQuality; }
        };
    }
}

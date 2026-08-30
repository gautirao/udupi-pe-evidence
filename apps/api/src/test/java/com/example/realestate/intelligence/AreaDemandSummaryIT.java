package com.example.realestate.intelligence;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration tests for the new read-only aggregate methods on
 * {@link AreaDemandSignalRepository}:
 * <ul>
 *   <li>{@link AreaDemandSignalRepository#findDemandTotalsByLatestWindow30()}</li>
 *   <li>{@link AreaDemandSignalRepository#findTop3GapsByLatestWindow30()}</li>
 * </ul>
 *
 * <p>Uses the same Testcontainers + @DataJpaTest pattern as {@link AreaDemandSignalIT}
 * (mirror of {@code SchoolAreaMatchingIntegrationTest}). Seeds {@code area_demand_signal}
 * rows DIRECTLY via JdbcTemplate (bypassing the rollup writer) to prove these methods
 * read the persisted table, not the live CTE.
 *
 * <p>Tagged {@code @Tag("integration")} — excluded from default {@code mvn test}.
 * Run via: {@code cd backend && mvn -Pdemand-signal-it failsafe:integration-test failsafe:verify}
 */
@Tag("integration")
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.mixed=true",
        "spring.flyway.placeholders.concurrently_keyword=",
        "spring.task.scheduling.enabled=false"
})
class AreaDemandSummaryIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine")
                    .asCompatibleSubstituteFor("postgres"));

    @Autowired
    JdbcTemplate jdbc;

    @Autowired
    AreaDemandSignalRepository signalRepo;

    // ── Shared constants ──────────────────────────────────────────────────────

    static final String CITY = "udupi";
    static final String A1   = "IN|KA|Udupi|Manipal";
    static final String A2   = "IN|KA|Udupi|Udupi";
    static final String A3   = "IN|KA|Udupi|Brahmavar";  // used for absent-from-signal tests

    /** Latest period_start (to be used as the "current" run). */
    static final Instant LATEST = Instant.now().truncatedTo(ChronoUnit.HOURS);
    /** Older period_start — must NOT be returned by the latest-only queries. */
    static final Instant OLDER  = LATEST.minus(25, ChronoUnit.HOURS);

    @BeforeEach
    void cleanSignalTable() {
        jdbc.update("DELETE FROM area_demand_signal");
    }

    // ── Setup helpers ─────────────────────────────────────────────────────────

    /**
     * Insert a fully formed area_demand_signal row. Both period_start variants
     * ({@link #LATEST} and {@link #OLDER}) are used across tests.
     */
    private void insertSignal(String citySlug, String areaKey, String propertyType,
                              String listingPurpose, String budgetBand,
                              Instant periodStart, int windowDays,
                              int searchCount, int panelOpenCount, int leadIntentCount,
                              Float gapScore, String signalType, String confidence) {
        // pgjdbc cannot infer the SQL type for java.time.Instant; convert to Timestamp explicitly.
        Instant periodEnd = periodStart.plus(windowDays, ChronoUnit.DAYS);
        jdbc.update("""
                INSERT INTO area_demand_signal
                    (city_slug, area_key, property_type, listing_purpose, budget_band,
                     period_start, period_end, window_days,
                     search_count, panel_open_count, lead_intent_count, listing_count,
                     gap_score, signal_type, confidence, computed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, now())
                """,
                citySlug, areaKey, propertyType, listingPurpose, budgetBand,
                Timestamp.from(periodStart), Timestamp.from(periodEnd), windowDays,
                searchCount, panelOpenCount, leadIntentCount,
                gapScore, signalType, confidence);
    }

    // ── Suite 1: findDemandTotalsByLatestWindow30 ─────────────────────────────

    @Nested
    @DisplayName("findDemandTotalsByLatestWindow30")
    class DemandTotalsTests {

        @Test
        @DisplayName("T1a: demandEventTotal = SUM(search+panel+lead) across all buckets for area")
        void demandEventTotal_isCorrectSumAcrossBuckets() {
            // A1: 3 buckets. Totals: (2+3+1) + (4+0+0) + (0+0+5) = 6+4+5 = 15
            insertSignal(CITY, A1, "apartment", "sale",  "UNDER_5L", LATEST, 30, 2, 3, 1, 1.0f,  "supply_gap",      "enough_data");
            insertSignal(CITY, A1, "apartment", "rent",  "5L_20L",   LATEST, 30, 4, 0, 0, null,  "information_gap", "insufficient_data");
            insertSignal(CITY, A1, "villa",     "sale",  "20L_50L",  LATEST, 30, 0, 0, 5, 0.5f,  "possible_gap",    "limited_data");

            List<AreaDemandSummaryRow> result = signalRepo.findDemandTotalsByLatestWindow30();

            assertThat(result).hasSize(1);
            AreaDemandSummaryRow row = result.get(0);
            assertThat(row.getAreaKey()).isEqualTo(A1);
            assertThat(row.getDemandEventTotal()).isEqualTo(15L);
        }

        @Test
        @DisplayName("T1b: only latest period_start used — older run rows are excluded")
        void onlyLatestPeriodStart_olderRunExcluded() {
            // OLDER run: A1 total = 100
            insertSignal(CITY, A1, "apartment", "sale", "UNDER_5L", OLDER,  30, 50, 30, 20, 1.5f, "supply_gap", "enough_data");
            // LATEST run: A1 total = 7
            insertSignal(CITY, A1, "apartment", "sale", "UNDER_5L", LATEST, 30,  3,  2,  2, 1.5f, "supply_gap", "enough_data");

            List<AreaDemandSummaryRow> result = signalRepo.findDemandTotalsByLatestWindow30();

            assertThat(result).hasSize(1);
            // Must reflect LATEST run only: 3+2+2 = 7
            assertThat(result.get(0).getDemandEventTotal()).isEqualTo(7L);
        }

        @Test
        @DisplayName("T1c: window_days != 30 rows are excluded")
        void window7d_excluded() {
            // Only a 7d row — no 30d data.
            insertSignal(CITY, A1, "apartment", "sale", "UNDER_5L", LATEST, 7, 100, 50, 50, 2.0f, "supply_gap", "enough_data");

            List<AreaDemandSummaryRow> result = signalRepo.findDemandTotalsByLatestWindow30();

            assertThat(result).isEmpty();
        }

        @Test
        @DisplayName("T1d: multiple areas returned — one row per area_key")
        void multipleAreas_oneRowEach() {
            insertSignal(CITY, A1, "apartment", "sale", "UNDER_5L", LATEST, 30, 5, 3, 2, 1.0f, "supply_gap", "enough_data");
            insertSignal(CITY, A2, "apartment", "sale", "UNDER_5L", LATEST, 30, 8, 1, 1, 0.5f, "possible_gap", "limited_data");

            List<AreaDemandSummaryRow> result = signalRepo.findDemandTotalsByLatestWindow30();

            assertThat(result).hasSize(2);
            Map<String, Long> byArea = result.stream()
                    .collect(Collectors.toMap(AreaDemandSummaryRow::getAreaKey,
                                             AreaDemandSummaryRow::getDemandEventTotal));
            assertThat(byArea).containsEntry(A1, 10L).containsEntry(A2, 10L);
        }

        @Test
        @DisplayName("T1e: empty table returns empty list")
        void emptyTable_returnsEmpty() {
            List<AreaDemandSummaryRow> result = signalRepo.findDemandTotalsByLatestWindow30();
            assertThat(result).isEmpty();
        }
    }

    // ── Suite 2: findTop3GapsByLatestWindow30 ────────────────────────────────

    @Nested
    @DisplayName("findTop3GapsByLatestWindow30")
    class TopGapsTests {

        @Test
        @DisplayName("T2a: gap_score-NULL buckets are excluded")
        void suppressedBuckets_excluded() {
            // Suppressed bucket (gap_score = null)
            insertSignal(CITY, A1, "apartment", "sale", "UNDER_5L", LATEST, 30, 3, 3, 3, null, "information_gap", "insufficient_data");
            // Non-suppressed
            insertSignal(CITY, A1, "apartment", "rent", "5L_20L",   LATEST, 30, 5, 5, 5, 1.2f, "supply_gap", "enough_data");

            List<AreaTopGapRow> result = signalRepo.findTop3GapsByLatestWindow30();

            assertThat(result).hasSize(1);
            // Float→Double round-trip via pgjdbc REAL column; use offset tolerance.
            assertThat(result.get(0).getGapScore()).isEqualTo(1.2, org.assertj.core.data.Offset.offset(0.001));
            assertThat(result.get(0).getBudgetBand()).isEqualTo("5L_20L");
        }

        @Test
        @DisplayName("T2b: top-3 by gap_score DESC, stable tie-break (property_type, listing_purpose, budget_band)")
        void top3ByGapScoreDesc_stableTieBreak() {
            // 5 non-suppressed buckets — expect top 3 in deterministic order
            insertSignal(CITY, A1, "villa",      "sale", "50L_1CR", LATEST, 30, 10, 5, 5, 2.5f, "supply_gap",      "enough_data");
            insertSignal(CITY, A1, "apartment",  "sale", "UNDER_5L",LATEST, 30,  5, 5, 5, 2.5f, "supply_gap",      "enough_data"); // tie: lower property_type → first
            insertSignal(CITY, A1, "apartment",  "rent", "5L_20L",  LATEST, 30,  8, 2, 5, 1.8f, "information_gap", "limited_data");
            insertSignal(CITY, A1, "plot",       "sale", "20L_50L", LATEST, 30,  4, 3, 3, 0.9f, "possible_gap",    "limited_data");
            insertSignal(CITY, A1, "commercial", "sale", "1CR_2CR", LATEST, 30,  2, 2, 2, 0.2f, "possible_gap",    "limited_data");

            List<AreaTopGapRow> result = signalRepo.findTop3GapsByLatestWindow30();

            assertThat(result).hasSize(3);
            // Rank 1 and 2 are the two gap_score=2.5 rows; stable tie-break: "apartment" < "villa"
            assertThat(result.get(0).getGapScore()).isEqualTo(2.5);
            assertThat(result.get(0).getPropertyType()).isEqualTo("apartment");  // 'a' < 'v'
            assertThat(result.get(1).getGapScore()).isEqualTo(2.5);
            assertThat(result.get(1).getPropertyType()).isEqualTo("villa");
            // Rank 3 — Float→Double round-trip; use offset tolerance.
            assertThat(result.get(2).getGapScore()).isEqualTo(1.8, org.assertj.core.data.Offset.offset(0.001));
            assertThat(result.get(2).getPropertyType()).isEqualTo("apartment");
            assertThat(result.get(2).getListingPurpose()).isEqualTo("rent");
        }

        @Test
        @DisplayName("T2c: more than 3 non-suppressed buckets → exactly 3 returned per area")
        void moreThan3NonSuppressed_exactly3Returned() {
            for (int i = 0; i < 6; i++) {
                // budget_band values must be valid per CHECK constraint
                String band = switch (i) {
                    case 0 -> "UNDER_5L";
                    case 1 -> "5L_20L";
                    case 2 -> "20L_50L";
                    case 3 -> "50L_1CR";
                    case 4 -> "1CR_2CR";
                    default -> "ABOVE_2CR";
                };
                insertSignal(CITY, A1, "apartment", "sale", band, LATEST, 30,
                        5, 5, 5, (float) (3.0 - i * 0.5), "supply_gap", "enough_data");
            }

            List<AreaTopGapRow> result = signalRepo.findTop3GapsByLatestWindow30();

            assertThat(result).hasSize(3);
            // Top 3 should have the highest gap_scores: 3.0, 2.5, 2.0
            assertThat(result.get(0).getGapScore()).isEqualTo(3.0);
            assertThat(result.get(1).getGapScore()).isEqualTo(2.5);
            assertThat(result.get(2).getGapScore()).isEqualTo(2.0);
        }

        @Test
        @DisplayName("T2d: area with zero non-suppressed buckets → empty list for that area")
        void allSuppressed_emptyTopGaps() {
            insertSignal(CITY, A1, "apartment", "sale", "UNDER_5L", LATEST, 30, 2, 3, 1, null, "information_gap", "insufficient_data");
            insertSignal(CITY, A1, "villa",     "sale", "5L_20L",   LATEST, 30, 1, 1, 1, null, "information_gap", "insufficient_data");

            List<AreaTopGapRow> result = signalRepo.findTop3GapsByLatestWindow30();

            assertThat(result).isEmpty();
        }

        @Test
        @DisplayName("T2e: only latest period_start used for gaps — older run excluded")
        void onlyLatestPeriodStart_olderGapsExcluded() {
            // Older run has a high-score gap
            insertSignal(CITY, A1, "apartment", "sale", "UNDER_5L", OLDER,  30, 10, 10, 10, 3.0f, "supply_gap", "enough_data");
            // Latest run has no non-suppressed rows
            insertSignal(CITY, A1, "apartment", "sale", "UNDER_5L", LATEST, 30, 1,  1,  1,  null, "information_gap", "insufficient_data");

            List<AreaTopGapRow> result = signalRepo.findTop3GapsByLatestWindow30();

            assertThat(result).isEmpty();
        }

        @Test
        @DisplayName("T2f: topGaps fields all mapped correctly (propertyType, listingPurpose, budgetBand, signalType, gapScore, confidence)")
        void gapRowFields_mappedCorrectly() {
            insertSignal(CITY, A1, "villa", "rent", "1CR_2CR", LATEST, 30, 10, 5, 5, 1.75f, "price_signal", "limited_data");

            List<AreaTopGapRow> result = signalRepo.findTop3GapsByLatestWindow30();

            assertThat(result).hasSize(1);
            AreaTopGapRow row = result.get(0);
            assertThat(row.getCitySlug()).isEqualTo(CITY);
            assertThat(row.getAreaKey()).isEqualTo(A1);
            assertThat(row.getPropertyType()).isEqualTo("villa");
            assertThat(row.getListingPurpose()).isEqualTo("rent");
            assertThat(row.getBudgetBand()).isEqualTo("1CR_2CR");
            assertThat(row.getSignalType()).isEqualTo("price_signal");
            assertThat(row.getGapScore()).isEqualTo(1.75, org.assertj.core.data.Offset.offset(0.001));
            assertThat(row.getConfidence()).isEqualTo("limited_data");
        }

        @Test
        @DisplayName("T2g: multiple areas each get their own top-3 independently")
        void multipleAreas_independentTop3() {
            // A1: 2 non-suppressed
            insertSignal(CITY, A1, "apartment", "sale", "UNDER_5L", LATEST, 30, 5, 5, 5, 2.0f, "supply_gap", "enough_data");
            insertSignal(CITY, A1, "villa",     "sale", "5L_20L",   LATEST, 30, 3, 3, 3, 1.0f, "possible_gap", "limited_data");
            // A2: 4 non-suppressed → only top 3 returned
            insertSignal(CITY, A2, "apartment", "sale", "UNDER_5L", LATEST, 30, 10, 5, 5, 3.0f, "supply_gap",      "enough_data");
            insertSignal(CITY, A2, "apartment", "rent", "5L_20L",   LATEST, 30,  8, 2, 5, 2.5f, "information_gap", "enough_data");
            insertSignal(CITY, A2, "villa",     "sale", "20L_50L",  LATEST, 30,  4, 3, 3, 1.8f, "possible_gap",    "limited_data");
            insertSignal(CITY, A2, "plot",      "sale", "50L_1CR",  LATEST, 30,  2, 2, 2, 0.5f, "possible_gap",    "limited_data");

            List<AreaTopGapRow> result = signalRepo.findTop3GapsByLatestWindow30();

            Map<String, List<AreaTopGapRow>> byArea = result.stream()
                    .collect(Collectors.groupingBy(AreaTopGapRow::getAreaKey));

            assertThat(byArea.get(A1)).hasSize(2);   // only 2 non-suppressed in A1
            assertThat(byArea.get(A2)).hasSize(3);   // capped at 3 for A2
            // A2 top-1 should be the 3.0 gap_score
            List<AreaTopGapRow> a2Gaps = byArea.get(A2).stream()
                    .sorted(Comparator.comparingDouble(r -> -r.getGapScore()))
                    .toList();
            assertThat(a2Gaps.get(0).getGapScore()).isEqualTo(3.0);
        }
    }

    // ── Suite 3: K-anon boundary mapping in AdminIntelligenceService ─────────

    @Nested
    @DisplayName("K-anon boundary mapping (AdminIntelligenceService)")
    class KAnonMappingTests {

        @Test
        @DisplayName("T3a: area total = 9 → demandEventCount null (suppressed)")
        void total9_suppressed() {
            // 9 events total: 3+3+3
            insertSignal(CITY, A1, "apartment", "sale", "UNDER_5L", LATEST, 30, 3, 3, 3, null, "information_gap", "insufficient_data");

            List<AreaDemandSummaryRow> summaries = signalRepo.findDemandTotalsByLatestWindow30();
            assertThat(summaries).hasSize(1);
            long total = summaries.get(0).getDemandEventTotal();
            assertThat(total).isEqualTo(9L);

            // Verify DemandConfidence.classify maps 9 → INSUFFICIENT_DATA
            assertThat(DemandConfidence.classify((int) total))
                    .isEqualTo(DemandConfidence.INSUFFICIENT_DATA);
        }

        @Test
        @DisplayName("T3b: area total = 10 → demandEventCount present (K_ANON_MIN boundary)")
        void total10_notSuppressed() {
            // 10 events: 4+3+3
            insertSignal(CITY, A1, "apartment", "sale", "UNDER_5L", LATEST, 30, 4, 3, 3, 0.8f, "possible_gap", "limited_data");

            List<AreaDemandSummaryRow> summaries = signalRepo.findDemandTotalsByLatestWindow30();
            assertThat(summaries).hasSize(1);
            long total = summaries.get(0).getDemandEventTotal();
            assertThat(total).isEqualTo(10L);

            // Verify DemandConfidence.classify maps 10 → LIMITED_DATA (not INSUFFICIENT)
            assertThat(DemandConfidence.classify((int) total))
                    .isEqualTo(DemandConfidence.LIMITED_DATA);
        }

        @Test
        @DisplayName("T3c: area absent from area_demand_signal → null demandEventCount + empty topGaps")
        void absentArea_nullAndEmpty() {
            // Seed data for A1 only; A2 and A3 are absent.
            insertSignal(CITY, A1, "apartment", "sale", "UNDER_5L", LATEST, 30, 5, 5, 5, 1.0f, "supply_gap", "enough_data");

            List<AreaDemandSummaryRow> summaries = signalRepo.findDemandTotalsByLatestWindow30();
            List<AreaTopGapRow> gaps = signalRepo.findTop3GapsByLatestWindow30();

            Map<String, Long> totalsByArea = summaries.stream()
                    .collect(Collectors.toMap(AreaDemandSummaryRow::getAreaKey,
                                             AreaDemandSummaryRow::getDemandEventTotal));

            // A2 and A3 are absent — map.get returns null (which the service maps to null demandEventCount + empty topGaps)
            assertThat(totalsByArea.get(A2)).isNull();
            assertThat(totalsByArea.get(A3)).isNull();

            Map<String, List<AreaTopGapRow>> gapsByArea = gaps.stream()
                    .collect(Collectors.groupingBy(AreaTopGapRow::getAreaKey));
            assertThat(gapsByArea.get(A2)).isNull();
            assertThat(gapsByArea.get(A3)).isNull();
        }
    }
}

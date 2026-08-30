package com.example.realestate.analytics;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcOperations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AreaOverviewRollupJobTest {

    @Mock
    private JdbcOperations jdbcOperations;

    private AreaOverviewRollupJob job;

    @BeforeEach
    void setUp() {
        job = new AreaOverviewRollupJob(jdbcOperations);
    }

    // -------------------------------------------------------------------------
    // deriveDistrictKey
    // -------------------------------------------------------------------------

    @Nested
    class DeriveDistrictKeyTests {

        @Test
        void fourSegmentKey_returnsThreeSegmentPrefix() {
            assertThat(AreaOverviewRollupJob.deriveDistrictKey("IN|KA|Udupi|Manipal"))
                    .isEqualTo("IN|KA|Udupi");
        }

        @Test
        void threeSegmentKey_returnsNull() {
            assertThat(AreaOverviewRollupJob.deriveDistrictKey("IN|KA|Udupi"))
                    .isNull();
        }

        @Test
        void twoSegmentKey_returnsNull() {
            assertThat(AreaOverviewRollupJob.deriveDistrictKey("IN|KA"))
                    .isNull();
        }

        @Test
        void nullInput_returnsNull() {
            assertThat(AreaOverviewRollupJob.deriveDistrictKey(null))
                    .isNull();
        }

        @Test
        void fiveSegmentKey_returnsNull() {
            assertThat(AreaOverviewRollupJob.deriveDistrictKey("IN|KA|Udupi|Manipal|Extra"))
                    .isNull();
        }
    }

    // -------------------------------------------------------------------------
    // confidenceTier
    // -------------------------------------------------------------------------

    @Nested
    class ConfidenceTierTests {

        @Test
        void count4_returnsFallback() {
            assertThat(AreaOverviewRollupJob.confidenceTier(4)).isEqualTo("fallback");
        }

        @Test
        void count5_returnsLimited() {
            assertThat(AreaOverviewRollupJob.confidenceTier(5)).isEqualTo("limited");
        }

        @Test
        void count19_returnsLimited() {
            assertThat(AreaOverviewRollupJob.confidenceTier(19)).isEqualTo("limited");
        }

        @Test
        void count20_returnsFull() {
            assertThat(AreaOverviewRollupJob.confidenceTier(20)).isEqualTo("full");
        }

        @Test
        void count0_returnsFallback() {
            assertThat(AreaOverviewRollupJob.confidenceTier(0)).isEqualTo("fallback");
        }

        @Test
        void count100_returnsFull() {
            assertThat(AreaOverviewRollupJob.confidenceTier(100)).isEqualTo("full");
        }
    }

    // -------------------------------------------------------------------------
    // trendDirection
    // -------------------------------------------------------------------------

    @Nested
    class TrendDirectionTests {

        @Test
        void prevCountLessThan3_returnsNull() {
            assertThat(AreaOverviewRollupJob.trendDirection(500_000, 400_000, 2))
                    .isNull();
        }

        @Test
        void prevCountZero_returnsNull() {
            assertThat(AreaOverviewRollupJob.trendDirection(500_000, 400_000, 0))
                    .isNull();
        }

        @Test
        void deltaPlus6Pct_returnsRising() {
            // +6%: current = 106, prev = 100
            assertThat(AreaOverviewRollupJob.trendDirection(106_000, 100_000, 5))
                    .isEqualTo("rising");
        }

        @Test
        void deltaMinus6Pct_returnsFalling() {
            // -6%: current = 94, prev = 100
            assertThat(AreaOverviewRollupJob.trendDirection(94_000, 100_000, 5))
                    .isEqualTo("falling");
        }

        @Test
        void deltaPlus3Pct_returnsStable() {
            // +3%: within 5% threshold
            assertThat(AreaOverviewRollupJob.trendDirection(103_000, 100_000, 5))
                    .isEqualTo("stable");
        }

        @Test
        void deltaExactly5Pct_returnsStable() {
            // boundary: exactly 5% is NOT > 5, so stable
            assertThat(AreaOverviewRollupJob.trendDirection(105_000, 100_000, 5))
                    .isEqualTo("stable");
        }

        @Test
        void prevMedianZero_returnsStable() {
            // Guard against division by zero
            assertThat(AreaOverviewRollupJob.trendDirection(100_000, 0, 5))
                    .isEqualTo("stable");
        }

        @Test
        void prevCountExactly3_risingDetected() {
            // prevCount == 3 is sufficient (>= 3 is the threshold expressed as < 3 returns null)
            assertThat(AreaOverviewRollupJob.trendDirection(110_000, 100_000, 3))
                    .isEqualTo("rising");
        }
    }

    // -------------------------------------------------------------------------
    // run() — verifies all 7 SQL statements are executed
    // -------------------------------------------------------------------------

    @Nested
    class RunTests {

        @Test
        void run_executesAllSevenStatements() {
            when(jdbcOperations.update(anyString())).thenReturn(0);

            job.run();

            // 4 locality statements + 3 district statements = 7
            verify(jdbcOperations, times(7)).update(anyString());
        }
    }
}

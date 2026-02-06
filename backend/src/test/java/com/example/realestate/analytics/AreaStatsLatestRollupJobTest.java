package com.example.realestate.analytics;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcOperations;

import java.time.LocalDate;
import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AreaStatsLatestRollupJobTest {

    @Mock
    private JdbcOperations jdbcOperations;

    private AreaStatsLatestRollupJob rollupJob;

    @BeforeEach
    void setUp() {
        rollupJob = new AreaStatsLatestRollupJob(jdbcOperations);
    }

    @Nested
    class ExecutionTests {

        @Test
        void computeStatsFromDate_executesUpsertQuery() {
            LocalDate fromDate = LocalDate.of(2024, 1, 1);
            when(jdbcOperations.update(anyString(), any(), any(), any())).thenReturn(5);

            int result = rollupJob.computeStatsFromDate(fromDate);

            assertThat(result).isEqualTo(5);
            verify(jdbcOperations).update(anyString(), any(OffsetDateTime.class), any(OffsetDateTime.class), any(OffsetDateTime.class));
        }

        @Test
        void computeStatsFromDate_returnsRowCount() {
            LocalDate fromDate = LocalDate.of(2024, 1, 1);
            when(jdbcOperations.update(anyString(), any(), any(), any())).thenReturn(42);

            int result = rollupJob.computeStatsFromDate(fromDate);

            assertThat(result).isEqualTo(42);
        }

        @Test
        void computeStatsFromDate_zeroRowsWhenNoMatchingListings() {
            LocalDate fromDate = LocalDate.of(2024, 1, 1);
            when(jdbcOperations.update(anyString(), any(), any(), any())).thenReturn(0);

            int result = rollupJob.computeStatsFromDate(fromDate);

            assertThat(result).isEqualTo(0);
        }
    }

    @Nested
    class FilterTests {

        @Test
        void sqlExcludesDuplicates() {
            LocalDate fromDate = LocalDate.of(2024, 1, 1);
            ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
            when(jdbcOperations.update(sqlCaptor.capture(), any(), any(), any())).thenReturn(0);

            rollupJob.computeStatsFromDate(fromDate);

            String sql = sqlCaptor.getValue();
            assertThat(sql).contains("is_duplicate = false");
        }

        @Test
        void sqlExcludesNullAreaKey() {
            LocalDate fromDate = LocalDate.of(2024, 1, 1);
            ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
            when(jdbcOperations.update(sqlCaptor.capture(), any(), any(), any())).thenReturn(0);

            rollupJob.computeStatsFromDate(fromDate);

            String sql = sqlCaptor.getValue();
            assertThat(sql).contains("area_key IS NOT NULL");
        }

        @Test
        void sqlExcludesNullPricePerCentPaise() {
            LocalDate fromDate = LocalDate.of(2024, 1, 1);
            ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
            when(jdbcOperations.update(sqlCaptor.capture(), any(), any(), any())).thenReturn(0);

            rollupJob.computeStatsFromDate(fromDate);

            String sql = sqlCaptor.getValue();
            assertThat(sql).contains("price_per_cent_paise IS NOT NULL");
        }

        @Test
        void sqlFiltersOnCreatedAt() {
            LocalDate fromDate = LocalDate.of(2024, 1, 1);
            ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
            when(jdbcOperations.update(sqlCaptor.capture(), any(), any(), any())).thenReturn(0);

            rollupJob.computeStatsFromDate(fromDate);

            String sql = sqlCaptor.getValue();
            assertThat(sql).contains("created_at >=");
        }
    }

    @Nested
    class MedianComputationTests {

        @Test
        void sqlUsesPercentileCont() {
            LocalDate fromDate = LocalDate.of(2024, 1, 1);
            ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
            when(jdbcOperations.update(sqlCaptor.capture(), any(), any(), any())).thenReturn(0);

            rollupJob.computeStatsFromDate(fromDate);

            String sql = sqlCaptor.getValue();
            assertThat(sql).contains("PERCENTILE_CONT(0.5)");
            assertThat(sql).contains("WITHIN GROUP (ORDER BY price_per_cent_paise)");
        }

        @Test
        void sqlRoundsMedianToBigint() {
            LocalDate fromDate = LocalDate.of(2024, 1, 1);
            ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
            when(jdbcOperations.update(sqlCaptor.capture(), any(), any(), any())).thenReturn(0);

            rollupJob.computeStatsFromDate(fromDate);

            String sql = sqlCaptor.getValue();
            assertThat(sql).contains("ROUND(PERCENTILE_CONT(0.5)");
            assertThat(sql).contains("::BIGINT");
        }
    }

    @Nested
    class CityDerivationTests {

        @Test
        void sqlDerivesCtiyKeyFromAreaKey() {
            LocalDate fromDate = LocalDate.of(2024, 1, 1);
            ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
            when(jdbcOperations.update(sqlCaptor.capture(), any(), any(), any())).thenReturn(0);

            rollupJob.computeStatsFromDate(fromDate);

            String sql = sqlCaptor.getValue();
            // Check that city_key is derived from first 3 parts of area_key
            assertThat(sql).contains("string_to_array(area_key, '|')");
            assertThat(sql).contains("array_length");
            assertThat(sql).contains("= 4");
        }

        @Test
        void sqlComputesCityMedian() {
            LocalDate fromDate = LocalDate.of(2024, 1, 1);
            ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
            when(jdbcOperations.update(sqlCaptor.capture(), any(), any(), any())).thenReturn(0);

            rollupJob.computeStatsFromDate(fromDate);

            String sql = sqlCaptor.getValue();
            assertThat(sql).contains("city_medians");
            assertThat(sql).contains("city_median_price_per_cent_paise");
        }

        @Test
        void sqlComputesPriceIndex() {
            LocalDate fromDate = LocalDate.of(2024, 1, 1);
            ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
            when(jdbcOperations.update(sqlCaptor.capture(), any(), any(), any())).thenReturn(0);

            rollupJob.computeStatsFromDate(fromDate);

            String sql = sqlCaptor.getValue();
            // price_index = area_median / city_median
            assertThat(sql).contains("price_index");
            assertThat(sql).contains("median_price_per_cent_paise::NUMERIC / cm.city_median_price_per_cent_paise");
        }

        @Test
        void sqlHandlesNullCityMedianGracefully() {
            LocalDate fromDate = LocalDate.of(2024, 1, 1);
            ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
            when(jdbcOperations.update(sqlCaptor.capture(), any(), any(), any())).thenReturn(0);

            rollupJob.computeStatsFromDate(fromDate);

            String sql = sqlCaptor.getValue();
            // Should use LEFT JOIN so areas without valid city_key still appear
            assertThat(sql).contains("LEFT JOIN city_keys");
            assertThat(sql).contains("LEFT JOIN city_medians");
            // Should handle null/zero city median
            assertThat(sql).contains("WHEN cm.city_median_price_per_cent_paise IS NOT NULL");
            assertThat(sql).contains("cm.city_median_price_per_cent_paise > 0");
        }
    }

    @Nested
    class UpsertTests {

        @Test
        void sqlUsesOnConflictUpsert() {
            LocalDate fromDate = LocalDate.of(2024, 1, 1);
            ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
            when(jdbcOperations.update(sqlCaptor.capture(), any(), any(), any())).thenReturn(0);

            rollupJob.computeStatsFromDate(fromDate);

            String sql = sqlCaptor.getValue();
            assertThat(sql).contains("ON CONFLICT (area_key)");
            assertThat(sql).contains("DO UPDATE SET");
        }

        @Test
        void sqlUpdatesAllFieldsOnConflict() {
            LocalDate fromDate = LocalDate.of(2024, 1, 1);
            ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
            when(jdbcOperations.update(sqlCaptor.capture(), any(), any(), any())).thenReturn(0);

            rollupJob.computeStatsFromDate(fromDate);

            String sql = sqlCaptor.getValue();
            assertThat(sql).contains("listing_count = EXCLUDED.listing_count");
            assertThat(sql).contains("median_price_per_cent_paise = EXCLUDED.median_price_per_cent_paise");
            assertThat(sql).contains("city_median_price_per_cent_paise = EXCLUDED.city_median_price_per_cent_paise");
            assertThat(sql).contains("price_index = EXCLUDED.price_index");
            assertThat(sql).contains("updated_at = EXCLUDED.updated_at");
        }
    }

    @Nested
    class ScheduledJobTests {

        @Test
        void computeAreaStats_usesRollingWindow() {
            when(jdbcOperations.update(anyString(), any(), any(), any())).thenReturn(0);

            rollupJob.computeAreaStats();

            ArgumentCaptor<OffsetDateTime> dateCaptor = ArgumentCaptor.forClass(OffsetDateTime.class);
            verify(jdbcOperations).update(anyString(), dateCaptor.capture(), any(), any());

            OffsetDateTime capturedDate = dateCaptor.getValue();
            LocalDate expectedCutoff = LocalDate.now().minusWeeks(12);
            assertThat(capturedDate.toLocalDate()).isEqualTo(expectedCutoff);
        }
    }
}

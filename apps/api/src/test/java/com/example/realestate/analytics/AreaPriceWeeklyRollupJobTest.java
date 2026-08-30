package com.example.realestate.analytics;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
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
class AreaPriceWeeklyRollupJobTest {

    @Mock
    private JdbcOperations jdbcOperations;

    @Captor
    private ArgumentCaptor<Object[]> argsCaptor;

    private AreaPriceWeeklyRollupJob rollupJob;

    @BeforeEach
    void setUp() {
        rollupJob = new AreaPriceWeeklyRollupJob(jdbcOperations);
    }

    // --- Test: rows created ---

    @Test
    void computeRollupsFromDate_executesUpsertQuery() {
        LocalDate fromDate = LocalDate.of(2024, 1, 1);
        when(jdbcOperations.update(anyString(), any(), any(), any())).thenReturn(5);

        int result = rollupJob.computeRollupsFromDate(fromDate);

        // Four queries: 'all', per-type, per-bedrooms, per-type-per-bedrooms; returns combined row count
        assertThat(result).isEqualTo(20);
        verify(jdbcOperations, times(4)).update(anyString(), any(OffsetDateTime.class), any(OffsetDateTime.class), eq(fromDate));
    }

    @Test
    void computeRollupsFromDate_sqlIncludesCorrectFilters() {
        LocalDate fromDate = LocalDate.of(2024, 1, 1);
        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        when(jdbcOperations.update(sqlCaptor.capture(), any(), any(), any())).thenReturn(0);

        rollupJob.computeRollupsFromDate(fromDate);

        // First captured value is the 'all' aggregate SQL
        String sql = sqlCaptor.getValue();
        assertThat(sql).contains("is_duplicate = false");
        assertThat(sql).contains("area_key IS NOT NULL");
        assertThat(sql).contains("price_per_cent_paise IS NOT NULL");
        assertThat(sql).contains("status IN ('SCRAPED', 'LIVE')");
        assertThat(sql).contains("DATE_TRUNC('week', created_at)");
        assertThat(sql).contains("ON CONFLICT (area_key, week_start_date, property_type, bedrooms)");
        assertThat(sql).contains("DO UPDATE SET");
    }

    // --- Test: duplicates excluded ---

    @Test
    void computeRollupsFromDate_sqlExcludesDuplicates() {
        LocalDate fromDate = LocalDate.of(2024, 1, 1);
        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        when(jdbcOperations.update(sqlCaptor.capture(), any(), any(), any())).thenReturn(0);

        rollupJob.computeRollupsFromDate(fromDate);

        String sql = sqlCaptor.getValue();
        assertThat(sql).contains("is_duplicate = false");
    }

    // --- Test: null areaKey excluded ---

    @Test
    void computeRollupsFromDate_sqlExcludesNullAreaKey() {
        LocalDate fromDate = LocalDate.of(2024, 1, 1);
        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        when(jdbcOperations.update(sqlCaptor.capture(), any(), any(), any())).thenReturn(0);

        rollupJob.computeRollupsFromDate(fromDate);

        String sql = sqlCaptor.getValue();
        assertThat(sql).contains("area_key IS NOT NULL");
    }

    // --- Test: recompute updates existing rows (idempotency) ---

    @Test
    void computeRollupsFromDate_upsertUpdatesExistingRows() {
        LocalDate fromDate = LocalDate.of(2024, 1, 1);
        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        when(jdbcOperations.update(sqlCaptor.capture(), any(), any(), any())).thenReturn(3);

        rollupJob.computeRollupsFromDate(fromDate);

        String sql = sqlCaptor.getValue();
        assertThat(sql).contains("ON CONFLICT (area_key, week_start_date, property_type, bedrooms)");
        assertThat(sql).contains("listing_count = EXCLUDED.listing_count");
        assertThat(sql).contains("median_price_per_cent_paise = EXCLUDED.median_price_per_cent_paise");
        assertThat(sql).contains("p25_price_per_cent_paise = EXCLUDED.p25_price_per_cent_paise");
        assertThat(sql).contains("p75_price_per_cent_paise = EXCLUDED.p75_price_per_cent_paise");
        assertThat(sql).contains("updated_at = EXCLUDED.updated_at");
    }

    // --- Test: scheduled job uses 12-week rolling window ---

    @Test
    void computeWeeklyRollups_usesRollingWindow() {
        when(jdbcOperations.update(anyString(), any(), any(), any())).thenReturn(0);

        rollupJob.computeWeeklyRollups();

        ArgumentCaptor<LocalDate> dateCaptor = ArgumentCaptor.forClass(LocalDate.class);
        verify(jdbcOperations, times(4)).update(anyString(), any(), any(), dateCaptor.capture());

        LocalDate capturedDate = dateCaptor.getValue();
        LocalDate expectedCutoff = LocalDate.now().minusWeeks(12);
        assertThat(capturedDate).isEqualTo(expectedCutoff);
    }

    // --- Test: price fields use PERCENTILE_CONT ---

    @Test
    void computeRollupsFromDate_priceFieldsUsePercentileCont() {
        LocalDate fromDate = LocalDate.of(2024, 1, 1);
        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        when(jdbcOperations.update(sqlCaptor.capture(), any(), any(), any())).thenReturn(0);

        rollupJob.computeRollupsFromDate(fromDate);

        String sql = sqlCaptor.getValue();
        assertThat(sql).contains("PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_per_cent_paise)");
        assertThat(sql).contains("PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY price_per_cent_paise)");
        assertThat(sql).contains("PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY price_per_cent_paise)");
        assertThat(sql).contains("::BIGINT");
    }

    // --- Test: returns count of affected rows ---

    @Test
    void computeRollupsFromDate_returnsRowCount() {
        LocalDate fromDate = LocalDate.of(2024, 1, 1);
        // Four calls: 'all' returns 10, per-type 32, per-bedrooms 5, per-type-per-bedrooms 7
        when(jdbcOperations.update(anyString(), any(), any(), any())).thenReturn(10, 32, 5, 7);

        int result = rollupJob.computeRollupsFromDate(fromDate);

        assertThat(result).isEqualTo(54);
    }

    // --- Test: zero rows when no matching listings ---

    @Test
    void computeRollupsFromDate_zeroRowsWhenNoMatchingListings() {
        LocalDate fromDate = LocalDate.of(2024, 1, 1);
        when(jdbcOperations.update(anyString(), any(), any(), any())).thenReturn(0);

        int result = rollupJob.computeRollupsFromDate(fromDate);

        assertThat(result).isEqualTo(0);
    }
}

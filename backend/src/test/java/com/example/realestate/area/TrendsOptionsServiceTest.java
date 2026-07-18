package com.example.realestate.area;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link AreaOverviewService#getOptions(String, int)}.
 * Does not start the Spring context — Mockito only.
 */
@ExtendWith(MockitoExtension.class)
class TrendsOptionsServiceTest {

    @Mock
    private JdbcOperations jdbcOperations;

    @Mock
    private NamedParameterJdbcTemplate namedJdbcTemplate;

    @Mock
    private com.example.realestate.school.SchoolService schoolService;

    @Mock
    private com.example.realestate.discover.CityActivationGuard cityActivationGuard;

    private AreaOverviewService service;

    @BeforeEach
    void setUp() {
        // #1935: getOptions(city, limit) gates on cityActivationGuard.isActiveCitySlug(city)
        // before querying area_overview_stats. Every existing test in this file exercises a
        // "real" city (udupi/mangalore) expecting the query to actually run, so the guard must
        // return true here to preserve pre-#1935 behaviour for this test file.
        when(cityActivationGuard.isActiveCitySlug(anyString())).thenReturn(true);
        service = new AreaOverviewService(
                jdbcOperations, namedJdbcTemplate, schoolService, new ObjectMapper(), cityActivationGuard);
    }

    // ==================== limit clamping ====================

    @Test
    void getOptions_limitAboveMax_isClampedTo50() {
        when(jdbcOperations.query(anyString(), any(RowMapper.class), anyString(), eq(50)))
                .thenReturn(List.of());

        service.getOptions("udupi", 100);

        verify(jdbcOperations).query(anyString(), any(RowMapper.class), eq("udupi"), eq(50));
    }

    @Test
    void getOptions_limitZero_isClampedTo1() {
        when(jdbcOperations.query(anyString(), any(RowMapper.class), anyString(), eq(1)))
                .thenReturn(List.of());

        service.getOptions("udupi", 0);

        verify(jdbcOperations).query(anyString(), any(RowMapper.class), eq("udupi"), eq(1));
    }

    @Test
    void getOptions_defaultLimit3_isPassedThrough() {
        when(jdbcOperations.query(anyString(), any(RowMapper.class), anyString(), eq(3)))
                .thenReturn(List.of());

        service.getOptions("udupi", 3);

        verify(jdbcOperations).query(anyString(), any(RowMapper.class), eq("udupi"), eq(3));
    }

    // ==================== response shape ====================

    @Test
    void getOptions_emptyResult_returnsResponseWithCityAndEmptyList() {
        when(jdbcOperations.query(anyString(), any(RowMapper.class), anyString(), anyInt()))
                .thenReturn(List.of());

        TrendsOptionsResponse response = service.getOptions("mangalore", 3);

        assertThat(response).isNotNull();
        assertThat(response.city()).isEqualTo("mangalore");
        assertThat(response.defaultAreas()).isEmpty();
    }

    // ==================== SQL correctness ====================

    @Test
    void getOptions_sqlFiltersLocalityLevelAndPositiveCount() {
        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        when(jdbcOperations.query(sqlCaptor.capture(), any(RowMapper.class), anyString(), anyInt()))
                .thenReturn(List.of());

        service.getOptions("udupi", 3);

        String sql = sqlCaptor.getValue();
        assertThat(sql).containsIgnoringCase("area_level = 'locality'");
        assertThat(sql).containsIgnoringCase("listing_count_90d > 0");
        assertThat(sql).containsIgnoringCase("split_part");
        assertThat(sql).containsIgnoringCase("order by listing_count_90d desc");
    }
}

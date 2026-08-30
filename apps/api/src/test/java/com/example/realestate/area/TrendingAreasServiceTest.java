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

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link AreaOverviewService#getTrending(int)}.
 *
 * <p>Does not start the Spring context — Mockito only.
 */
@ExtendWith(MockitoExtension.class)
class TrendingAreasServiceTest {

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
        // #1935: getTrending(int) under test here has no city parameter and never calls the
        // guard — the mock is required only to satisfy the constructor signature.
        service = new AreaOverviewService(
                jdbcOperations, namedJdbcTemplate, schoolService, new ObjectMapper(), cityActivationGuard);
    }

    // ==================== limit clamping ====================

    @Test
    void getTrending_limitAboveMax_isClampedTo12() {
        when(jdbcOperations.query(anyString(), any(RowMapper.class), eq(12)))
                .thenReturn(List.of());

        service.getTrending(100);

        // verify the clamped value (12) was passed to JDBC as the LIMIT parameter
        verify(jdbcOperations).query(anyString(), any(RowMapper.class), eq(12));
    }

    @Test
    void getTrending_limitZero_isClampedTo1() {
        when(jdbcOperations.query(anyString(), any(RowMapper.class), eq(1)))
                .thenReturn(List.of());

        service.getTrending(0);

        verify(jdbcOperations).query(anyString(), any(RowMapper.class), eq(1));
    }

    @Test
    void getTrending_limitNegative_isClampedTo1() {
        when(jdbcOperations.query(anyString(), any(RowMapper.class), eq(1)))
                .thenReturn(List.of());

        service.getTrending(-5);

        verify(jdbcOperations).query(anyString(), any(RowMapper.class), eq(1));
    }

    @Test
    void getTrending_limitWithinRange_isPassedThrough() {
        when(jdbcOperations.query(anyString(), any(RowMapper.class), eq(6)))
                .thenReturn(List.of());

        service.getTrending(6);

        verify(jdbcOperations).query(anyString(), any(RowMapper.class), eq(6));
    }

    @Test
    void getTrending_limitAtMax_isNotClamped() {
        when(jdbcOperations.query(anyString(), any(RowMapper.class), eq(12)))
                .thenReturn(List.of());

        service.getTrending(12);

        verify(jdbcOperations).query(anyString(), any(RowMapper.class), eq(12));
    }

    // ==================== empty result ====================

    @Test
    void getTrending_emptyResult_returnsResponseWithEmptyList() {
        when(jdbcOperations.query(anyString(), any(RowMapper.class), eq(6)))
                .thenReturn(List.of());

        TrendingAreasResponse response = service.getTrending(6);

        assertThat(response).isNotNull();
        assertThat(response.areas()).isEmpty();
    }

    // ==================== query includes exclusion filter ====================

    @Test
    void getTrending_sqlContainsExclusionCondition() {
        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        when(jdbcOperations.query(sqlCaptor.capture(), any(RowMapper.class), eq(6)))
                .thenReturn(List.of());

        service.getTrending(6);

        String sql = sqlCaptor.getValue();
        // Must exclude zero/null listing_count_90d rows
        assertThat(sql).containsIgnoringCase("listing_count_90d > 0");
        // Must sort descending
        assertThat(sql).containsIgnoringCase("listing_count_90d DESC");
    }

    // ==================== RowMapper — 5-segment areaKey with null district_area_key ====================

    /**
     * A 5-segment areaKey (e.g. "IN|KA|Bengaluru|Whitefield|Block1") where
     * {@code district_area_key} is NULL in the ResultSet.
     * <p>
     * The RowMapper must derive districtLabel from the first 3 pipe segments
     * ("IN|KA|Bengaluru" → "Bengaluru"), not return null or emit "".
     */
    @Test
    @SuppressWarnings("unchecked")
    void getTrending_fiveSegmentAreaKey_nullDistrictAreaKey_derivesDistrictLabelFromThreeSegments()
            throws SQLException {
        // Capture the RowMapper passed to jdbcOperations.query(...)
        ArgumentCaptor<RowMapper<TrendingAreasResponse.TrendingAreaDto>> mapperCaptor =
                ArgumentCaptor.forClass(RowMapper.class);
        when(jdbcOperations.query(anyString(), mapperCaptor.capture(), eq(6)))
                .thenReturn(List.of()); // return value unused; we invoke the mapper directly below

        service.getTrending(6);

        RowMapper<TrendingAreasResponse.TrendingAreaDto> mapper = mapperCaptor.getValue();

        // Build a mock ResultSet representing a 5-segment locality row
        ResultSet rs = mock(ResultSet.class);
        when(rs.getString("area_key")).thenReturn("IN|KA|Bengaluru|Whitefield|Block1");
        when(rs.getString("district_area_key")).thenReturn(null); // NULL in DB
        when(rs.getLong("median_price_paise")).thenReturn(75000000L);
        when(rs.wasNull()).thenReturn(false);
        when(rs.getInt("listing_count_90d")).thenReturn(25);

        TrendingAreasResponse.TrendingAreaDto dto = mapper.mapRow(rs, 0);

        assertThat(dto).isNotNull();
        // areaLabel is the last segment of the 5-segment key
        assertThat(dto.areaLabel()).isEqualTo("Block1");
        // districtLabel must be the 3rd segment, derived from first 3 parts of areaKey
        assertThat(dto.districtLabel()).isEqualTo("Bengaluru");
        // medianPricePaise and listingCount90d pass through correctly
        assertThat(dto.medianPricePaise()).isEqualTo(75000000L);
        assertThat(dto.listingCount90d()).isEqualTo(25);
    }
}

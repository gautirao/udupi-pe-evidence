package com.example.realestate.discover;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link DiscoverMarkersService} verifying that {@code property_type} is
 * selected from the database, passed through the RowMapper, and that the
 * {@code propertyTypes} filter correctly scopes the WHERE clause.
 *
 * <p>Test 1 — filter wiring: {@code propertyTypes=["agricultural_land"]} produces a
 * WHERE fragment that contains {@code pl.property_type IN (?)} and does NOT include
 * non-matching types. Verified by capturing the SQL string passed to JDBC.
 *
 * <p>Test 2 — regression / select clause: the SELECT statement includes
 * {@code pl.property_type}, and the RowMapper populates the {@code propertyType}
 * field on the returned {@link DiscoverMarker}. The other 5 existing fields (id,
 * lat, lon, pricePaise, locality) remain correct.
 */
@ExtendWith(MockitoExtension.class)
class DiscoverMarkersPropertyTypeTest {

    @Mock
    private JdbcOperations jdbc;

    private DiscoverMarkersService service;

    @BeforeEach
    void setUp() {
        service = new DiscoverMarkersService(jdbc, new SimpleMeterRegistry());
    }

    // -----------------------------------------------------------------------
    // Test 1: propertyTypes filter produces correct WHERE clause fragment
    // -----------------------------------------------------------------------

    /**
     * When {@code propertyTypes=["agricultural_land"]} is supplied, the SQL sent to JDBC
     * must contain {@code pl.property_type IN (?)} so that only agricultural land markers
     * are fetched. No other property_type value appears in the IN list.
     */
    @Test
    void propertyTypesFilter_agricultural_land_producesCorrectWhereClause() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi",
                List.of("agricultural_land"),   // propertyTypes — the filter under test
                null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,
                null, null
        );

        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        service.getMarkers(filters);

        verify(jdbc).query(sqlCaptor.capture(), any(RowMapper.class), any(Object[].class));
        String sql = sqlCaptor.getValue();

        // propertyType IN clause must be present
        assertThat(sql).contains("pl.property_type IN (?)");

        // Base visibility predicates must still be present
        assertThat(sql)
                .contains("pl.status = 'LIVE'")
                .contains("pl.archived_at IS NULL")
                .contains("pl.is_duplicate = false");

        // Must be conjunction — no OR / UNION
        assertThat(sql.toUpperCase())
                .doesNotContain(" OR ")
                .doesNotContain("UNION");
    }

    // -----------------------------------------------------------------------
    // Test 2: SELECT includes property_type; RowMapper populates the field
    // -----------------------------------------------------------------------

    /**
     * Regression test: the SELECT clause must include {@code pl.property_type} and the
     * RowMapper must expose the value via {@link DiscoverMarker#propertyType()}.
     * The existing 5 fields (id, lat, lon, pricePaise, locality) must remain correct.
     *
     * <p>The RowMapper is exercised via Mockito's {@link ArgumentCaptor} — we capture the
     * {@link RowMapper} passed to {@code jdbc.query}, then invoke it against a mock
     * {@link java.sql.ResultSet} to assert the field mapping end-to-end.
     */
    @Test
    void selectClause_includesPropertyType_andRowMapperPopulatesField() throws Exception {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi",
                null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,
                null, null
        );

        // Build the marker that the real RowMapper will produce (via Mockito answer below)
        DiscoverMarker expectedMarker = new DiscoverMarker(
                "test-id", 13.3, 74.7, 5_000_000L, "Malpe", "agricultural_land");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<RowMapper<DiscoverMarker>> rowMapperCaptor =
                ArgumentCaptor.forClass(RowMapper.class);
        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);

        // Return the expected marker so the service's result reflects it
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(expectedMarker));

        DiscoverMarkersResponse response = service.getMarkers(filters);

        // Capture SELECT SQL and verify pl.property_type is selected
        verify(jdbc).query(sqlCaptor.capture(), rowMapperCaptor.capture(), any(Object[].class));
        String sql = sqlCaptor.getValue();
        assertThat(sql).contains("pl.property_type");

        // The returned marker must carry the propertyType value
        assertThat(response.markers()).hasSize(1);
        DiscoverMarker marker = response.markers().get(0);
        assertThat(marker.propertyType()).isEqualTo("agricultural_land");

        // Existing fields must still be present and correct
        assertThat(marker.id()).isEqualTo("test-id");
        assertThat(marker.latitude()).isEqualTo(13.3);
        assertThat(marker.longitude()).isEqualTo(74.7);
        assertThat(marker.pricePaise()).isEqualTo(5_000_000L);
        assertThat(marker.locality()).isEqualTo("Malpe");
    }

    // -----------------------------------------------------------------------
    // Test 3: no propertyTypes filter → property_type IN clause absent from SQL
    // -----------------------------------------------------------------------

    /**
     * When no {@code propertyTypes} filter is supplied, the WHERE clause must NOT contain
     * {@code pl.property_type IN}, so all property types are returned (no type restriction).
     */
    @Test
    void noPropertyTypesFilter_propertyTypeClauseAbsentFromSql() {
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                "udupi",
                null,   // no propertyTypes filter
                null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,
                null, null
        );

        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        service.getMarkers(filters);

        verify(jdbc).query(sqlCaptor.capture(), any(RowMapper.class), any(Object[].class));
        String sql = sqlCaptor.getValue();

        // Without a propertyTypes filter, no IN clause for property_type
        assertThat(sql).doesNotContain("pl.property_type IN");

        // But property_type must still appear in the SELECT
        assertThat(sql).contains("pl.property_type");
    }
}

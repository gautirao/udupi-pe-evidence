package com.example.realestate.discover;

import io.micrometer.core.instrument.Tags;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * Unit tests verifying that {@link DiscoverListingsService#getListings} emits a
 * {@code discover.listings.query.latency.seconds} Timer with the correct tags for
 * the radius query path (success, empty-result, and DataAccessException).
 */
@ExtendWith(MockitoExtension.class)
class DiscoverListingsServiceMetricsTest {

    @Mock
    private JdbcOperations jdbc;

    private SimpleMeterRegistry registry;
    private DiscoverListingsService service;

    /** Minimal bbox query — no schoolLat/schoolLon/schoolRadiusKm, no q. */
    private static DiscoverListingsQuery bboxQuery() {
        return new DiscoverListingsQuery(
                "udupi",
                null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,    // no schoolLat/schoolLon/schoolRadiusKm
                null,                // no q
                null,                // bbox
                0, 20, false, null, null
        );
    }

    /** radius_search query — schoolLat/schoolLon/schoolRadiusKm all set AND q set. */
    private static DiscoverListingsQuery radiusSearchQuery() {
        return new DiscoverListingsQuery(
                "udupi",
                null, null, null, null, null, null, null,
                null, null, null, null, null,
                13.3409, 74.7421, 2.0,   // schoolLat, schoolLon, schoolRadiusKm
                "sea view",              // q
                null,                    // bbox
                0, 20, false, null, null
        );
    }

    /** Minimal radius query — schoolLat/schoolLon/schoolRadiusKm all set, no q. */
    private static DiscoverListingsQuery radiusQuery() {
        return new DiscoverListingsQuery(
                "udupi",
                null, null, null, null, null, null, null,
                null, null, null, null, null,
                13.3409, 74.7421, 2.0,   // schoolLat, schoolLon, schoolRadiusKm
                null,                     // q
                null,                     // bbox
                0, 20, false, null, null
        );
    }

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
        service = new DiscoverListingsService(jdbc, registry);
    }

    @Test
    @SuppressWarnings("unchecked")
    void getListings_radiusPath_success_emitsTimer() {
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(Object[].class)))
                .thenReturn(1L);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(stubResponse()));

        service.getListings(radiusQuery());

        long count = registry.get("discover.listings.query.latency.seconds")
                .tags(Tags.of("query_path", "radius", "result_status", "success"))
                .timer()
                .count();
        assertThat(count).isEqualTo(1);
    }

    @Test
    @SuppressWarnings("unchecked")
    void getListings_radiusPath_emptyResult_emitsEmptyTag() {
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(Object[].class)))
                .thenReturn(0L);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        service.getListings(radiusQuery());

        long count = registry.get("discover.listings.query.latency.seconds")
                .tags(Tags.of("query_path", "radius", "result_status", "empty"))
                .timer()
                .count();
        assertThat(count).isEqualTo(1);
    }

    @Test
    @SuppressWarnings("unchecked")
    void getListings_radiusPath_dataAccessException_emitsErrorTag() {
        DataAccessException dae = new QueryTimeoutException("timeout");
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(Object[].class)))
                .thenThrow(dae);

        assertThatThrownBy(() -> service.getListings(radiusQuery()))
                .isInstanceOf(DataAccessException.class);

        long count = registry.get("discover.listings.query.latency.seconds")
                .tags(Tags.of("query_path", "radius", "result_status", "error"))
                .timer()
                .count();
        assertThat(count).isEqualTo(1);
    }

    @Test
    @SuppressWarnings("unchecked")
    void getListings_bboxPath_success_emitsTimer() {
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(Object[].class)))
                .thenReturn(1L);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(stubResponse()));

        service.getListings(bboxQuery());

        long count = registry.get("discover.listings.query.latency.seconds")
                .tags(Tags.of("query_path", "bbox", "result_status", "success"))
                .timer()
                .count();
        assertThat(count).isEqualTo(1);
    }

    @Test
    @SuppressWarnings("unchecked")
    void getListings_radiusSearchPath_success_emitsTimer() {
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(Object[].class)))
                .thenReturn(1L);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(stubResponse()));

        service.getListings(radiusSearchQuery());

        long count = registry.get("discover.listings.query.latency.seconds")
                .tags(Tags.of("query_path", "radius_search", "result_status", "success"))
                .timer()
                .count();
        assertThat(count).isEqualTo(1);
    }

    private static DiscoverListingResponse stubResponse() {
        return new DiscoverListingResponse(
                "id1", "L-001", "house", "Title", "Malpe",
                "IN|KA|Udupi|Malpe", 5_000_000L,
                null, null, 100.0, "sq m", 3,
                13.3, 74.7, null,
                null, null, null, null,
                5, false,
                null, false,
                "A", "READY", "owner", "sale", "LIVE"
        );
    }
}

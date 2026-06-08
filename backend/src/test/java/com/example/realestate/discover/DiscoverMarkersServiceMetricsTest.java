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
import static org.mockito.Mockito.when;

/**
 * Unit tests verifying that {@link DiscoverMarkersService#getMarkers} emits a
 * {@code discover.markers.query.latency.seconds} Timer with the correct tags for
 * success, empty-result, and DataAccessException paths.
 */
@ExtendWith(MockitoExtension.class)
class DiscoverMarkersServiceMetricsTest {

    @Mock
    private JdbcOperations jdbc;

    private SimpleMeterRegistry registry;
    private DiscoverMarkersService service;

    private static final DiscoverListingPredicateBuilder.Filters MINIMAL_FILTERS =
            new DiscoverListingPredicateBuilder.Filters(
                    "udupi",
                    null, null, null, null, null, null, null,
                    null, null, null, null, null,
                    null, null, null,
                    null, null
            );

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
        service = new DiscoverMarkersService(jdbc, registry);
    }

    @Test
    void getMarkers_success_emitsTimerWithSuccessTag() {
        DiscoverMarker marker = new DiscoverMarker("id1", 13.3, 74.7, 5_000_000L, "Malpe", null, null);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(marker));

        service.getMarkers(MINIMAL_FILTERS);

        long count = registry.get("discover.markers.query.latency.seconds")
                .tags(Tags.of("query_path", "bbox", "result_status", "success"))
                .timer()
                .count();
        assertThat(count).isEqualTo(1);
    }

    @Test
    void getMarkers_emptyResult_emitsTimerWithEmptyTag() {
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        service.getMarkers(MINIMAL_FILTERS);

        long count = registry.get("discover.markers.query.latency.seconds")
                .tags(Tags.of("query_path", "bbox", "result_status", "empty"))
                .timer()
                .count();
        assertThat(count).isEqualTo(1);
    }

    @Test
    void getMarkers_dataAccessException_emitsTimerWithErrorTag() {
        DataAccessException dae = new QueryTimeoutException("timeout");
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenThrow(dae);

        assertThatThrownBy(() -> service.getMarkers(MINIMAL_FILTERS))
                .isInstanceOf(DataAccessException.class);

        long count = registry.get("discover.markers.query.latency.seconds")
                .tags(Tags.of("query_path", "bbox", "result_status", "error"))
                .timer()
                .count();
        assertThat(count).isEqualTo(1);
    }
}

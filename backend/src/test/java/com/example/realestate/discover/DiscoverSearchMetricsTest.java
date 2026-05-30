package com.example.realestate.discover;

import io.micrometer.core.instrument.Tags;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;

import java.sql.SQLException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * Unit tests verifying that {@link DiscoverListingsService#getListings} emits the correct
 * Timer tags for the FTS/search query path, including the {@code malformed_fts} error tag
 * when a DataAccessException message contains "tsquery".
 */
@ExtendWith(MockitoExtension.class)
class DiscoverSearchMetricsTest {

    @Mock
    private JdbcOperations jdbc;

    private SimpleMeterRegistry registry;
    private DiscoverListingsService service;

    /** Minimal FTS query — q is set, no school radius. */
    private static DiscoverListingsQuery searchQuery() {
        return new DiscoverListingsQuery(
                "udupi",
                null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,    // no schoolLat/schoolLon/schoolRadiusKm
                "sea view",          // q
                null,                // bbox
                0, 20, false
        );
    }

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
        service = new DiscoverListingsService(jdbc, registry);
    }

    @Test
    @SuppressWarnings("unchecked")
    void search_success_emitsTimer() {
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(Object[].class)))
                .thenReturn(1L);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of(stubResponse()));

        service.getListings(searchQuery());

        long count = registry.get("discover.listings.query.latency.seconds")
                .tags(Tags.of("query_path", "search", "result_status", "success"))
                .timer()
                .count();
        assertThat(count).isEqualTo(1);
    }

    @Test
    @SuppressWarnings("unchecked")
    void search_malformedFts_emitsErrorTag() {
        // Simulate a PostgreSQL FTS syntax error — message contains "tsquery"
        DataAccessException dae = new BadSqlGrammarException(
                "queryForObject",
                "SELECT COUNT(*) ...",
                new SQLException("ERROR: syntax error in tsquery: \"&&sea\"")
        );
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(Object[].class)))
                .thenThrow(dae);

        assertThatThrownBy(() -> service.getListings(searchQuery()))
                .isInstanceOf(DataAccessException.class);

        long count = registry.get("discover.listings.query.latency.seconds")
                .tags(Tags.of("query_path", "search", "result_status", "malformed_fts"))
                .timer()
                .count();
        assertThat(count).isEqualTo(1);
    }

    @Test
    void search_nonFtsSyntaxError_emitsErrorNotMalformedFts() {
        // Simulate a non-FTS SQL bug: message has "syntax error" but NOT "tsquery".
        // isFtsSyntaxError must NOT match this — it must remain "error", not "malformed_fts".
        DataAccessException dae = new BadSqlGrammarException(
                "queryForObject",
                "SELECT COUNT(*) ...",
                new SQLException("ERROR: syntax error at or near \"FROM\"")
        );
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(Object[].class)))
                .thenThrow(dae);

        assertThatThrownBy(() -> service.getListings(searchQuery()))
                .isInstanceOf(DataAccessException.class);

        long count = registry.get("discover.listings.query.latency.seconds")
                .tags(Tags.of("query_path", "search", "result_status", "error"))
                .timer()
                .count();
        assertThat(count).isEqualTo(1);
    }

    private static DiscoverListingResponse stubResponse() {
        return new DiscoverListingResponse(
                "id1", "L-001", "house", "Sea View Villa", "Malpe",
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

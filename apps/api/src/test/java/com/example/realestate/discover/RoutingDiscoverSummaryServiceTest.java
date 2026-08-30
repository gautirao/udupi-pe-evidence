package com.example.realestate.discover;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.client.ResourceAccessException;

import java.net.SocketTimeoutException;
import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link RoutingDiscoverSummaryService} (#1745 P5).
 * Mirrors {@link RoutingDiscoverMarkersServiceTest}.
 */
@ExtendWith(MockitoExtension.class)
class RoutingDiscoverSummaryServiceTest {

    @Mock
    private DiscoverSummaryService postgresService;

    @Mock
    private DiscoverSummaryPort openSearchAdapter;

    private SimpleMeterRegistry meterRegistry;

    private static final SummaryQuery QUERY = new SummaryQuery("udupi", null, "area_group", 8);

    private static final DiscoverSummaryResponse POSTGRES_RESPONSE = new DiscoverSummaryResponse(
            "udupi", null, "area_group", 0L, List.of(), List.of(), Instant.now());

    private static final DiscoverSummaryResponse OS_RESPONSE = new DiscoverSummaryResponse(
            "udupi", null, "area_group", 5L,
            List.of(new DiscoverSummaryResponse.RegionCount("university-belt", "University Belt", 5L)),
            List.of(), Instant.now());

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
    }

    private RoutingDiscoverSummaryService routing(boolean enabled, DiscoverSummaryPort osAdapter) {
        return new RoutingDiscoverSummaryService(postgresService, osAdapter, meterRegistry, enabled, null);
    }

    // -----------------------------------------------------------------------
    // Test 1: enabled=false → postgres called, OS never called
    // -----------------------------------------------------------------------

    @Test
    void disabled_delegatesToPostgres() {
        when(postgresService.getSummary(any())).thenReturn(POSTGRES_RESPONSE);

        RoutingDiscoverSummaryService service = routing(false, openSearchAdapter);
        DiscoverSummaryResponse result = service.getSummary(QUERY);

        assertThat(result).isSameAs(POSTGRES_RESPONSE);
        verify(postgresService).getSummary(QUERY);
        verify(openSearchAdapter, never()).getSummary(any());
    }

    // -----------------------------------------------------------------------
    // Test 2: enabled=true, no adapter (null) → postgres called
    // -----------------------------------------------------------------------

    @Test
    void enabled_nullOsAdapter_delegatesToPostgres() {
        when(postgresService.getSummary(any())).thenReturn(POSTGRES_RESPONSE);

        RoutingDiscoverSummaryService service = routing(true, null);
        DiscoverSummaryResponse result = service.getSummary(QUERY);

        assertThat(result).isSameAs(POSTGRES_RESPONSE);
        verify(postgresService).getSummary(QUERY);
    }

    // -----------------------------------------------------------------------
    // Test 3: enabled=true, OS succeeds → OS result returned, postgres never called
    // -----------------------------------------------------------------------

    @Test
    void enabled_osSucceeds_returnsOsResult() {
        when(openSearchAdapter.getSummary(any())).thenReturn(OS_RESPONSE);

        RoutingDiscoverSummaryService service = routing(true, openSearchAdapter);
        DiscoverSummaryResponse result = service.getSummary(QUERY);

        assertThat(result).isSameAs(OS_RESPONSE);
        verify(postgresService, never()).getSummary(any());
    }

    // -----------------------------------------------------------------------
    // Test 4: enabled=true, OS throws generic error → fallback, reason=error, endpoint=summary
    // -----------------------------------------------------------------------

    @Test
    void enabled_osThrowsResourceAccessException_fallsBackToPostgres_reasonError() {
        when(openSearchAdapter.getSummary(any()))
                .thenThrow(new ResourceAccessException("connection refused"));
        when(postgresService.getSummary(any())).thenReturn(POSTGRES_RESPONSE);

        RoutingDiscoverSummaryService service = routing(true, openSearchAdapter);
        DiscoverSummaryResponse result = service.getSummary(QUERY);

        assertThat(result).isSameAs(POSTGRES_RESPONSE);
        verify(postgresService).getSummary(QUERY);

        double errorCount = meterRegistry.counter("discover.opensearch.fallback.count",
                "endpoint", "summary", "reason", "error").count();
        assertThat(errorCount).isEqualTo(1.0);

        double timeoutCount = meterRegistry.counter("discover.opensearch.fallback.count",
                "endpoint", "summary", "reason", "timeout").count();
        assertThat(timeoutCount).isEqualTo(0.0);
    }

    // -----------------------------------------------------------------------
    // Test 5: enabled=true, OS throws SocketTimeoutException-wrapped error → reason=timeout
    // -----------------------------------------------------------------------

    @Test
    void enabled_osThrowsSocketTimeout_fallsBackWithTimeoutReason() {
        ResourceAccessException timeoutException =
                new ResourceAccessException("read timeout", new SocketTimeoutException("Read timed out"));
        when(openSearchAdapter.getSummary(any())).thenThrow(timeoutException);
        when(postgresService.getSummary(any())).thenReturn(POSTGRES_RESPONSE);

        RoutingDiscoverSummaryService service = routing(true, openSearchAdapter);
        DiscoverSummaryResponse result = service.getSummary(QUERY);

        assertThat(result).isSameAs(POSTGRES_RESPONSE);

        double timeoutCount = meterRegistry.counter("discover.opensearch.fallback.count",
                "endpoint", "summary", "reason", "timeout").count();
        assertThat(timeoutCount).isEqualTo(1.0);

        double errorCount = meterRegistry.counter("discover.opensearch.fallback.count",
                "endpoint", "summary", "reason", "error").count();
        assertThat(errorCount).isEqualTo(0.0);
    }
}

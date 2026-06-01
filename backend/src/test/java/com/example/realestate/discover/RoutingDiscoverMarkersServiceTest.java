package com.example.realestate.discover;

import com.example.realestate.discover.opensearch.OpenSearchQueryException;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.client.ResourceAccessException;

import java.net.SocketTimeoutException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link RoutingDiscoverMarkersService}.
 */
@ExtendWith(MockitoExtension.class)
class RoutingDiscoverMarkersServiceTest {

    @Mock
    private DiscoverMarkersService postgresService;

    @Mock
    private DiscoverMarkersPort openSearchAdapter;

    private SimpleMeterRegistry meterRegistry;

    private static final DiscoverListingPredicateBuilder.Filters FILTERS =
            new DiscoverListingPredicateBuilder.Filters(
                    "udupi", null, null, null, null, null, null, null,
                    null, null, null, null, null, null, null, null, null, null
            );

    private static final DiscoverMarkersResponse POSTGRES_RESPONSE = new DiscoverMarkersResponse(
            "udupi", List.of(), false, 0, 0L, 1000, false
    );

    private static final DiscoverMarkersResponse OS_RESPONSE = new DiscoverMarkersResponse(
            "udupi", List.of(new DiscoverMarker("id1", 13.3, 74.7, 5000000L, "Locality")),
            false, 1, 1L, 1000, false
    );

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
    }

    private RoutingDiscoverMarkersService routing(boolean enabled, DiscoverMarkersPort osAdapter) {
        return new RoutingDiscoverMarkersService(postgresService, osAdapter, meterRegistry, enabled);
    }

    // -----------------------------------------------------------------------
    // Test 1: enabled=false → postgres called, OS never called
    // -----------------------------------------------------------------------

    @Test
    void disabled_delegatesToPostgres() {
        when(postgresService.getMarkers(any())).thenReturn(POSTGRES_RESPONSE);

        RoutingDiscoverMarkersService service = routing(false, openSearchAdapter);
        DiscoverMarkersResponse result = service.getMarkers(FILTERS);

        assertThat(result).isSameAs(POSTGRES_RESPONSE);
        verify(postgresService).getMarkers(FILTERS);
        verify(openSearchAdapter, never()).getMarkers(any());
    }

    // -----------------------------------------------------------------------
    // Test 2: enabled=true, OS succeeds → OS result returned
    // -----------------------------------------------------------------------

    @Test
    void enabled_osSucceeds_returnsOsResult() {
        when(openSearchAdapter.getMarkers(any())).thenReturn(OS_RESPONSE);

        RoutingDiscoverMarkersService service = routing(true, openSearchAdapter);
        DiscoverMarkersResponse result = service.getMarkers(FILTERS);

        assertThat(result).isSameAs(OS_RESPONSE);
        verify(postgresService, never()).getMarkers(any());
    }

    // -----------------------------------------------------------------------
    // Test 3: enabled=true, OS throws ResourceAccessException → fallback, reason=error
    // -----------------------------------------------------------------------

    @Test
    void enabled_osThrowsResourceAccessException_fallsBackToPostgres() {
        when(openSearchAdapter.getMarkers(any()))
                .thenThrow(new ResourceAccessException("connection refused"));
        when(postgresService.getMarkers(any())).thenReturn(POSTGRES_RESPONSE);

        RoutingDiscoverMarkersService service = routing(true, openSearchAdapter);
        DiscoverMarkersResponse result = service.getMarkers(FILTERS);

        assertThat(result).isSameAs(POSTGRES_RESPONSE);
        verify(postgresService).getMarkers(FILTERS);

        // reason=error counter incremented
        double errorCount = meterRegistry.counter("discover.opensearch.fallback.count",
                "endpoint", "markers", "reason", "error").count();
        assertThat(errorCount).isEqualTo(1.0);

        // reason=timeout counter NOT incremented
        double timeoutCount = meterRegistry.counter("discover.opensearch.fallback.count",
                "endpoint", "markers", "reason", "timeout").count();
        assertThat(timeoutCount).isEqualTo(0.0);
    }

    // -----------------------------------------------------------------------
    // Test 4: enabled=true, OS throws ResourceAccessException(SocketTimeoutException) → reason=timeout
    // -----------------------------------------------------------------------

    @Test
    void enabled_osThrowsSocketTimeout_fallsBackWithTimeoutReason() {
        ResourceAccessException timeoutException =
                new ResourceAccessException("read timeout", new SocketTimeoutException("Read timed out"));
        when(openSearchAdapter.getMarkers(any())).thenThrow(timeoutException);
        when(postgresService.getMarkers(any())).thenReturn(POSTGRES_RESPONSE);

        RoutingDiscoverMarkersService service = routing(true, openSearchAdapter);
        DiscoverMarkersResponse result = service.getMarkers(FILTERS);

        assertThat(result).isSameAs(POSTGRES_RESPONSE);

        double timeoutCount = meterRegistry.counter("discover.opensearch.fallback.count",
                "endpoint", "markers", "reason", "timeout").count();
        assertThat(timeoutCount).isEqualTo(1.0);

        double errorCount = meterRegistry.counter("discover.opensearch.fallback.count",
                "endpoint", "markers", "reason", "error").count();
        assertThat(errorCount).isEqualTo(0.0);
    }

    // -----------------------------------------------------------------------
    // Additional: enabled=true, no OS adapter → postgres called
    // -----------------------------------------------------------------------

    @Test
    void enabled_nullOsAdapter_delegatesToPostgres() {
        when(postgresService.getMarkers(any())).thenReturn(POSTGRES_RESPONSE);

        RoutingDiscoverMarkersService service = routing(true, null);
        DiscoverMarkersResponse result = service.getMarkers(FILTERS);

        assertThat(result).isSameAs(POSTGRES_RESPONSE);
    }

    // -----------------------------------------------------------------------
    // BLOCKING-1: OS adapter throws OpenSearchQueryException (polygon) → fallback, reason=error
    // -----------------------------------------------------------------------

    @Test
    void enabled_osThrowsPolygonException_fallsBackToPostgres() {
        when(openSearchAdapter.getMarkers(any()))
                .thenThrow(new OpenSearchQueryException(
                        "Polygon filter not supported in OpenSearch path — use Postgres path"));
        when(postgresService.getMarkers(any())).thenReturn(POSTGRES_RESPONSE);

        RoutingDiscoverMarkersService service = routing(true, openSearchAdapter);
        DiscoverMarkersResponse result = service.getMarkers(FILTERS);

        assertThat(result).isSameAs(POSTGRES_RESPONSE);
        verify(postgresService).getMarkers(FILTERS);

        double errorCount = meterRegistry.counter("discover.opensearch.fallback.count",
                "endpoint", "markers", "reason", "error").count();
        assertThat(errorCount).isEqualTo(1.0);
    }

    // -----------------------------------------------------------------------
    // ADVISORY-2: OS adapter throws AND Postgres throws → Postgres exception propagates,
    // fallback counter incremented exactly once.
    // -----------------------------------------------------------------------

    @Test
    void enabled_osThenPostgresBothThrow_postgresExceptionPropagates() {
        RuntimeException osException = new OpenSearchQueryException(
                "Polygon filter not supported in OpenSearch path — use Postgres path");
        RuntimeException pgException = new RuntimeException("Postgres unavailable");

        when(openSearchAdapter.getMarkers(any())).thenThrow(osException);
        when(postgresService.getMarkers(any())).thenThrow(pgException);

        RoutingDiscoverMarkersService service = routing(true, openSearchAdapter);

        assertThatThrownBy(() -> service.getMarkers(FILTERS))
                .isSameAs(pgException);

        // Fallback counter incremented exactly once (for the OS failure)
        double errorCount = meterRegistry.counter("discover.opensearch.fallback.count",
                "endpoint", "markers", "reason", "error").count();
        assertThat(errorCount).isEqualTo(1.0);
    }
}

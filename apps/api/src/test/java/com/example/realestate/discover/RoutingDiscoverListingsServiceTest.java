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
 * Unit tests for {@link RoutingDiscoverListingsService}.
 */
@ExtendWith(MockitoExtension.class)
class RoutingDiscoverListingsServiceTest {

    @Mock
    private DiscoverListingsService postgresService;

    @Mock
    private DiscoverListingsPort openSearchAdapter;

    private SimpleMeterRegistry meterRegistry;

    private static final DiscoverListingsQuery QUERY = new DiscoverListingsQuery(
            "udupi", null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null,
            null, null, 0, 20, false, null, null
    , null);

    private static final DiscoverListingsPage POSTGRES_PAGE =
            new DiscoverListingsPage(List.of(), 0, 20, 0L, 0, null);

    private static final DiscoverListingsPage OS_PAGE =
            new DiscoverListingsPage(List.of(), 0, 20, 42L, 3, null);

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
    }

    private RoutingDiscoverListingsService routing(boolean enabled, DiscoverListingsPort osAdapter) {
        return new RoutingDiscoverListingsService(postgresService, osAdapter, meterRegistry, enabled, null);
    }

    // -----------------------------------------------------------------------
    // Test 1: enabled=false → postgres called, OS never called
    // -----------------------------------------------------------------------

    @Test
    void disabled_delegatesToPostgres() {
        when(postgresService.getListings(any())).thenReturn(POSTGRES_PAGE);

        RoutingDiscoverListingsService service = routing(false, openSearchAdapter);
        DiscoverListingsPage result = service.getListings(QUERY);

        assertThat(result).isSameAs(POSTGRES_PAGE);
        verify(postgresService).getListings(QUERY);
        verify(openSearchAdapter, never()).getListings(any());
    }

    // -----------------------------------------------------------------------
    // Test 2: enabled=true, OS succeeds → OS result returned
    // -----------------------------------------------------------------------

    @Test
    void enabled_osSucceeds_returnsOsResult() {
        when(openSearchAdapter.getListings(any())).thenReturn(OS_PAGE);

        RoutingDiscoverListingsService service = routing(true, openSearchAdapter);
        DiscoverListingsPage result = service.getListings(QUERY);

        assertThat(result).isSameAs(OS_PAGE);
        verify(postgresService, never()).getListings(any());
    }

    // -----------------------------------------------------------------------
    // Test 3: enabled=true, OS throws ResourceAccessException → fallback, reason=error
    // -----------------------------------------------------------------------

    @Test
    void enabled_osThrowsResourceAccessException_fallsBackToPostgres() {
        when(openSearchAdapter.getListings(any()))
                .thenThrow(new ResourceAccessException("connection refused"));
        when(postgresService.getListings(any())).thenReturn(POSTGRES_PAGE);

        RoutingDiscoverListingsService service = routing(true, openSearchAdapter);
        DiscoverListingsPage result = service.getListings(QUERY);

        assertThat(result).isSameAs(POSTGRES_PAGE);

        double errorCount = meterRegistry.counter("discover.opensearch.fallback.count",
                "endpoint", "listings", "reason", "error").count();
        assertThat(errorCount).isEqualTo(1.0);

        double timeoutCount = meterRegistry.counter("discover.opensearch.fallback.count",
                "endpoint", "listings", "reason", "timeout").count();
        assertThat(timeoutCount).isEqualTo(0.0);
    }

    // -----------------------------------------------------------------------
    // Test 4: enabled=true, OS throws SocketTimeoutException → reason=timeout
    // -----------------------------------------------------------------------

    @Test
    void enabled_osThrowsSocketTimeout_fallsBackWithTimeoutReason() {
        ResourceAccessException timeoutException =
                new ResourceAccessException("read timeout", new SocketTimeoutException("Read timed out"));
        when(openSearchAdapter.getListings(any())).thenThrow(timeoutException);
        when(postgresService.getListings(any())).thenReturn(POSTGRES_PAGE);

        RoutingDiscoverListingsService service = routing(true, openSearchAdapter);
        DiscoverListingsPage result = service.getListings(QUERY);

        assertThat(result).isSameAs(POSTGRES_PAGE);

        double timeoutCount = meterRegistry.counter("discover.opensearch.fallback.count",
                "endpoint", "listings", "reason", "timeout").count();
        assertThat(timeoutCount).isEqualTo(1.0);

        double errorCount = meterRegistry.counter("discover.opensearch.fallback.count",
                "endpoint", "listings", "reason", "error").count();
        assertThat(errorCount).isEqualTo(0.0);
    }

    // -----------------------------------------------------------------------
    // Additional: enabled=true, null OS adapter → postgres called
    // -----------------------------------------------------------------------

    @Test
    void enabled_nullOsAdapter_delegatesToPostgres() {
        when(postgresService.getListings(any())).thenReturn(POSTGRES_PAGE);

        RoutingDiscoverListingsService service = routing(true, null);
        DiscoverListingsPage result = service.getListings(QUERY);

        assertThat(result).isSameAs(POSTGRES_PAGE);
    }

    // -----------------------------------------------------------------------
    // BLOCKING-1: OS adapter throws OpenSearchQueryException (polygon) → fallback, reason=error
    // -----------------------------------------------------------------------

    @Test
    void enabled_osThrowsPolygonException_fallsBackToPostgres() {
        when(openSearchAdapter.getListings(any()))
                .thenThrow(new OpenSearchQueryException(
                        "Polygon filter not supported in OpenSearch path — use Postgres path"));
        when(postgresService.getListings(any())).thenReturn(POSTGRES_PAGE);

        RoutingDiscoverListingsService service = routing(true, openSearchAdapter);
        DiscoverListingsPage result = service.getListings(QUERY);

        assertThat(result).isSameAs(POSTGRES_PAGE);
        verify(postgresService).getListings(QUERY);

        double errorCount = meterRegistry.counter("discover.opensearch.fallback.count",
                "endpoint", "listings", "reason", "error").count();
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

        when(openSearchAdapter.getListings(any())).thenThrow(osException);
        when(postgresService.getListings(any())).thenThrow(pgException);

        RoutingDiscoverListingsService service = routing(true, openSearchAdapter);

        assertThatThrownBy(() -> service.getListings(QUERY))
                .isSameAs(pgException);

        // Fallback counter incremented exactly once (for the OS failure)
        double errorCount = meterRegistry.counter("discover.opensearch.fallback.count",
                "endpoint", "listings", "reason", "error").count();
        assertThat(errorCount).isEqualTo(1.0);
    }
}

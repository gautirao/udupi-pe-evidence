package com.example.realestate.discover.shadow;

import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import com.example.realestate.discover.DiscoverListingResponse;
import com.example.realestate.discover.DiscoverListingsPage;
import com.example.realestate.discover.DiscoverListingsPort;
import com.example.realestate.discover.DiscoverListingsQuery;
import com.example.realestate.discover.DiscoverMarker;
import com.example.realestate.discover.DiscoverMarkersPort;
import com.example.realestate.discover.DiscoverMarkersResponse;
import com.example.realestate.discover.opensearch.OpenSearchProperties;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.concurrent.Executor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNoException;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link ShadowComparisonRunner}.
 *
 * <p>Uses a synchronous {@link Executor} so that async tasks run on the test thread
 * and can be asserted deterministically.
 */
@ExtendWith(MockitoExtension.class)
class ShadowComparisonRunnerTest {

    /** Synchronous executor — runs tasks immediately on the calling thread. */
    private static final Executor SYNC_EXECUTOR = Runnable::run;

    @Mock
    private DiscoverListingsPort listingsAdapter;
    @Mock
    private DiscoverMarkersPort markersAdapter;
    @Mock
    private ParityComparator comparator;

    private MeterRegistry registry;

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
    }

    // ---- TC1: shadowEnabled=false → no submit ----

    @Test
    void shadowDisabled_noAdapterCall() {
        ShadowComparisonRunner runner = runner(props(false, false));
        runner.submitListingsShadow(query(), emptyPage(), listingsAdapter);
        verify(listingsAdapter, never()).getListings(any());
    }

    // ---- TC2: opensearchEnabled=true → no submit (O3: shadow only on !enabled path) ----

    @Test
    void opensearchEnabled_noShadow() {
        // enabled=true, shadowEnabled=true → shadow must NOT fire
        ShadowComparisonRunner runner = runner(props(true, true));
        runner.submitListingsShadow(query(), emptyPage(), listingsAdapter);
        verify(listingsAdapter, never()).getListings(any());
    }

    // ---- TC3: adapter=null → no submit ----

    @Test
    void adapterNull_noSubmit() {
        ShadowComparisonRunner runner = new ShadowComparisonRunner(
                props(false, true),
                SYNC_EXECUTOR,
                registry,
                comparator,
                ShadowComparisonRunner.SamplingPredicate.alwaysSample());

        runner.submitListingsShadow(query(), emptyPage(), null /* listingsAdapter = null */);
        verify(comparator, never()).compare(any(), any(), any());
    }

    // ---- TC4: sampling=0 → SKIPPED counter incremented, no shadow call ----

    @Test
    void neverSample_skippedCounterIncremented() {
        ShadowComparisonRunner runner = runner(props(false, true),
                ShadowComparisonRunner.SamplingPredicate.neverSample());

        runner.submitListingsShadow(query(), emptyPage(), listingsAdapter);

        verify(listingsAdapter, never()).getListings(any());

        Counter skipped = registry.find("discover.opensearch.shadow.count")
                .tag("comparison_status", "SKIPPED")
                .counter();
        assertThat(skipped).isNotNull();
        assertThat(skipped.count()).isGreaterThanOrEqualTo(1.0);
    }

    // ---- TC5: adapter throws → Postgres result content unchanged, ERROR metric emitted ----

    @Test
    void adapterThrows_postgresResultUnchangedAndErrorMetricEmitted() {
        when(listingsAdapter.getListings(any())).thenThrow(new RuntimeException("OS down"));

        ShadowComparisonRunner runner = runner(props(false, true));
        DiscoverListingsPage postgresResult = emptyPage();

        // Must not throw
        assertThatNoException().isThrownBy(() ->
                runner.submitListingsShadow(query(), postgresResult, listingsAdapter));

        // Postgres result content is unmodified (empty list, 0 total)
        assertThat(postgresResult.content()).isEmpty();
        assertThat(postgresResult.totalElements()).isZero();

        // ERROR counter must be present
        Counter errorCounter = registry.find("discover.opensearch.shadow.count")
                .tag("comparison_status", "ERROR")
                .counter();
        assertThat(errorCounter).isNotNull();
        assertThat(errorCounter.count()).isGreaterThanOrEqualTo(1.0);
    }

    // ---- TC6: alwaysSample → shadow runs deterministically ----

    @Test
    void alwaysSample_shadowRuns() {
        DiscoverListingsPage osPage = emptyPage();
        when(listingsAdapter.getListings(any())).thenReturn(osPage);

        ShadowComparisonRunner runner = runner(props(false, true));
        runner.submitListingsShadow(query(), emptyPage(), listingsAdapter);

        verify(listingsAdapter).getListings(any());
        // compare() now takes 3 args (resultStatus removed — always POSTGRES_SHADOW_OK on success path)
        verify(comparator).compare(any(), any(), any());
    }

    // ---- TC7: markers — shadow disabled → no submit ----

    @Test
    void markers_shadowDisabled_noAdapterCall() {
        ShadowComparisonRunner runner = runner(props(false, false));
        runner.submitMarkersShadow(markersFilters(), emptyMarkersResponse(), markersAdapter);
        verify(markersAdapter, never()).getMarkers(any());
    }

    // ---- TC8: markers — adapter throws → no exception propagates, ERROR metric emitted ----

    @Test
    void markers_adapterThrows_noExceptionAndErrorMetric() {
        when(markersAdapter.getMarkers(any())).thenThrow(new RuntimeException("OS markers down"));

        ShadowComparisonRunner runner = runner(props(false, true));
        DiscoverMarkersResponse postgresResponse = emptyMarkersResponse();

        assertThatNoException().isThrownBy(() ->
                runner.submitMarkersShadow(markersFilters(), postgresResponse, markersAdapter));

        Counter errorCounter = registry.find("discover.opensearch.shadow.count")
                .tag("comparison_status", "ERROR")
                .counter();
        assertThat(errorCounter).isNotNull();
        assertThat(errorCounter.count()).isGreaterThanOrEqualTo(1.0);
    }

    // ---- TC9: markers happy path — shadow runs and comparator invoked ----

    @Test
    void markers_happyPath_comparatorInvoked() {
        when(markersAdapter.getMarkers(any())).thenReturn(emptyMarkersResponse());

        ShadowComparisonRunner runner = runner(props(false, true));
        runner.submitMarkersShadow(markersFilters(), emptyMarkersResponse(), markersAdapter);

        verify(markersAdapter).getMarkers(any());
        verify(comparator).compare(any(), any(), any());
    }

    // ---- helpers ----

    private ShadowComparisonRunner runner(OpenSearchProperties p) {
        return runner(p, ShadowComparisonRunner.SamplingPredicate.alwaysSample());
    }

    private ShadowComparisonRunner runner(OpenSearchProperties p,
                                          ShadowComparisonRunner.SamplingPredicate predicate) {
        return new ShadowComparisonRunner(
                p,
                SYNC_EXECUTOR,
                registry,
                comparator,
                predicate);
    }

    private static OpenSearchProperties props(boolean enabled, boolean shadowEnabled) {
        return new OpenSearchProperties(
                enabled,
                "http://localhost:9200",
                "listings_read",
                500,
                1000,
                "", "", "",
                shadowEnabled,
                500,
                1.0,
                10);
    }

    private static DiscoverListingsQuery query() {
        return new DiscoverListingsQuery(
                "udupi", null, null, null, null, null, null, null,
                null, null, null, null,
                null, null, null, null,
                null, null, 0, 20, false);
    }

    private static DiscoverListingsPage emptyPage() {
        return new DiscoverListingsPage(List.of(), 0, 20, 0L, 0, null);
    }

    private static DiscoverListingPredicateBuilder.Filters markersFilters() {
        return new DiscoverListingPredicateBuilder.Filters(
                "udupi",  // city
                null,     // propertyTypes
                null,     // priceMinPaise
                null,     // priceMaxPaise
                null,     // dateFrom
                null,     // dateTo
                null,     // bedrooms
                null,     // sellerTypes
                null,     // backOnMarket
                null,     // newToMarket
                null,     // reraRegistered
                null,     // readyToMove
                null,     // polygon
                null,     // schoolLat
                null,     // schoolLon
                null,     // schoolRadiusKm
                null,     // bbox
                null);    // q
    }

    private static DiscoverMarkersResponse emptyMarkersResponse() {
        return new DiscoverMarkersResponse(
                "udupi",       // city
                List.of(),     // markers
                false,         // truncated
                0,             // returnedElements
                0L,            // totalFilteredElements
                1000,          // limit
                false);        // boundsApplied
    }
}

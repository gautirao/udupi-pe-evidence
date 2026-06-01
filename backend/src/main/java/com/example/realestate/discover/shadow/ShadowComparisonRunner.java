package com.example.realestate.discover.shadow;

import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import com.example.realestate.discover.DiscoverListingsPage;
import com.example.realestate.discover.DiscoverListingsPort;
import com.example.realestate.discover.DiscoverListingsQuery;
import com.example.realestate.discover.DiscoverMarkersPort;
import com.example.realestate.discover.DiscoverMarkersResponse;
import com.example.realestate.discover.opensearch.OpenSearchProperties;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;

/**
 * Fires fire-and-forget shadow OpenSearch comparisons alongside the Postgres-primary path.
 *
 * <p>Shadow mode is ONLY active when:
 * <ul>
 *   <li>{@code discover.opensearch.shadow-enabled=true}, AND
 *   <li>{@code discover.opensearch.enabled=false} (Postgres is the primary path)
 * </ul>
 *
 * <p>The Postgres result is returned to the caller immediately — the shadow task runs
 * asynchronously on the {@code shadowExecutor} thread pool and never blocks the HTTP response.
 *
 * <h3>Sampling predicate</h3>
 * {@link SamplingPredicate} is injectable so tests can use {@code alwaysSample()} or
 * {@code neverSample()} for deterministic coverage without touching random state.
 */
@Component
public class ShadowComparisonRunner {

    private static final Logger log = LoggerFactory.getLogger(ShadowComparisonRunner.class);

    /**
     * Functional interface for the sampling gate. Production code uses
     * {@link SamplingPredicate#random()} which compares against a {@link java.util.concurrent.ThreadLocalRandom}.
     * Tests inject {@code alwaysSample()} or {@code neverSample()} for determinism.
     */
    @FunctionalInterface
    public interface SamplingPredicate {
        boolean shouldSample(double sampleRate);

        static SamplingPredicate random() {
            return rate -> java.util.concurrent.ThreadLocalRandom.current().nextDouble() < rate;
        }

        static SamplingPredicate alwaysSample() {
            return rate -> true;
        }

        static SamplingPredicate neverSample() {
            return rate -> false;
        }
    }

    private final OpenSearchProperties props;
    private final DiscoverListingsPort listingsAdapter;
    private final DiscoverMarkersPort markersAdapter;
    private final Executor shadowExecutor;
    private final MeterRegistry meterRegistry;
    private final ParityComparator comparator;
    private final SamplingPredicate samplingPredicate;

    /**
     * Primary constructor — used by Spring. Adapters are optional (absent when OpenSearch is
     * not configured at all); shadow mode is effectively disabled in that case.
     */
    @Autowired
    public ShadowComparisonRunner(
            OpenSearchProperties props,
            @Autowired(required = false) DiscoverListingsPort listingsAdapter,
            @Autowired(required = false) DiscoverMarkersPort markersAdapter,
            @Qualifier("shadowExecutor") Executor shadowExecutor,
            MeterRegistry meterRegistry,
            ParityComparator comparator) {
        this.props = props;
        // Guard against self-injection: if no separate adapter bean exists, Spring may inject
        // the @Primary RoutingDiscoverListingsService back. Detect and nullify.
        this.listingsAdapter = isSelf(listingsAdapter) ? null : listingsAdapter;
        this.markersAdapter = isSelf(markersAdapter) ? null : markersAdapter;
        this.shadowExecutor = shadowExecutor;
        this.meterRegistry = meterRegistry;
        this.comparator = comparator;
        this.samplingPredicate = SamplingPredicate.random();
    }

    /**
     * Test-friendly constructor that accepts an explicit {@link SamplingPredicate}.
     */
    public ShadowComparisonRunner(
            OpenSearchProperties props,
            DiscoverListingsPort listingsAdapter,
            DiscoverMarkersPort markersAdapter,
            Executor shadowExecutor,
            MeterRegistry meterRegistry,
            ParityComparator comparator,
            SamplingPredicate samplingPredicate) {
        this.props = props;
        this.listingsAdapter = listingsAdapter;
        this.markersAdapter = markersAdapter;
        this.shadowExecutor = shadowExecutor;
        this.meterRegistry = meterRegistry;
        this.comparator = comparator;
        this.samplingPredicate = samplingPredicate;
    }

    /**
     * Submits a fire-and-forget shadow comparison for a listings query.
     *
     * <p>Guards (evaluated in order):
     * <ol>
     *   <li>Shadow disabled or OS primary enabled → return immediately (no-op)
     *   <li>Listings adapter absent → return (bean not wired)
     *   <li>Sampling gate fails → increment SKIPPED counter, return
     *   <li>Submit async task; RejectedExecutionException → swallowed (executor's discard policy
     *       already increments SKIPPED)
     * </ol>
     *
     * @param query         the listings query that was just served by Postgres
     * @param postgresPage  the Postgres result (not modified)
     */
    public void submitListingsShadow(DiscoverListingsQuery query, DiscoverListingsPage postgresPage) {
        // O3: shadow only on !enabled && shadowEnabled
        if (!props.shadowEnabled() || props.enabled()) {
            return;
        }
        if (listingsAdapter == null) {
            return;
        }
        if (!samplingPredicate.shouldSample(props.shadowSampleRate())) {
            emitSkippedCounter(ShadowQueryType.fromListingsQuery(query).name());
            return;
        }

        // Capture immutable data BEFORE submit (defensive copy — postgresPage is alive on
        // the request thread; the shadow task runs on a different thread).
        List<String> capturedPostgresIds = List.copyOf(
                postgresPage.content().stream().map(r -> r.id()).toList());
        ShadowQueryType queryType = ShadowQueryType.fromListingsQuery(query);

        try {
            CompletableFuture.runAsync(() -> {
                Timer.Sample timerSample = Timer.start(meterRegistry);
                String compStatus = "ERROR";
                String resStatus = "POSTGRES_SHADOW_ERROR";
                try {
                    DiscoverListingsPage osResult = listingsAdapter.getListings(query);
                    List<String> osIds = osResult.content().stream().map(r -> r.id()).toList();
                    // compare() always records result_status=POSTGRES_SHADOW_OK and returns comparisonStatus
                    compStatus = comparator.compare(capturedPostgresIds, osIds, queryType);
                    resStatus = "POSTGRES_SHADOW_OK";
                } catch (Throwable t) {
                    boolean isTimeout = isTimeoutException(t);
                    compStatus = isTimeout ? "TIMEOUT" : "ERROR";
                    resStatus = isTimeout ? "POSTGRES_SHADOW_TIMEOUT" : "POSTGRES_SHADOW_ERROR";
                    emitErrorCounter(queryType.name(), compStatus, resStatus);
                    log.debug("Shadow comparison error (non-fatal) queryType={}: {}",
                            queryType.name(), t.getMessage());
                } finally {
                    String finalResStatus = resStatus;
                    String finalCompStatus = compStatus;
                    timerSample.stop(Timer.builder("discover.opensearch.shadow.latency")
                            .tag("query_type", queryType.name())
                            .tag("comparison_status", finalCompStatus)
                            .tag("result_status", finalResStatus)
                            .register(meterRegistry));
                }
            }, shadowExecutor);
        } catch (RejectedExecutionException e) {
            // The custom discard policy in ShadowExecutorConfig should handle rejection before
            // reaching here, but guard defensively.
            log.debug("Shadow task rejected by executor (queue full) — discarding");
        }
    }

    /**
     * Submits a fire-and-forget shadow comparison for a markers query.
     *
     * <p>Uses the same guard order as {@link #submitListingsShadow}.
     *
     * @param filters         the markers filters that were just served by Postgres
     * @param postgresResponse the Postgres result (not modified)
     */
    public void submitMarkersShadow(
            DiscoverListingPredicateBuilder.Filters filters,
            DiscoverMarkersResponse postgresResponse) {

        if (!props.shadowEnabled() || props.enabled()) {
            return;
        }
        if (markersAdapter == null) {
            return;
        }
        if (!samplingPredicate.shouldSample(props.shadowSampleRate())) {
            emitSkippedCounter(ShadowQueryType.MARKERS.name());
            return;
        }

        // Capture immutable data
        List<String> capturedPostgresIds = List.copyOf(
                postgresResponse.markers().stream().map(m -> m.id()).toList());

        try {
            CompletableFuture.runAsync(() -> {
                Timer.Sample timerSample = Timer.start(meterRegistry);
                String compStatus = "ERROR";
                String resStatus = "POSTGRES_SHADOW_ERROR";
                try {
                    DiscoverMarkersResponse osResult = markersAdapter.getMarkers(filters);
                    List<String> osIds = osResult.markers().stream().map(m -> m.id()).toList();
                    compStatus = comparator.compare(capturedPostgresIds, osIds, ShadowQueryType.MARKERS);
                    resStatus = "POSTGRES_SHADOW_OK";
                } catch (Throwable t) {
                    boolean isTimeout = isTimeoutException(t);
                    compStatus = isTimeout ? "TIMEOUT" : "ERROR";
                    resStatus = isTimeout ? "POSTGRES_SHADOW_TIMEOUT" : "POSTGRES_SHADOW_ERROR";
                    emitErrorCounter(ShadowQueryType.MARKERS.name(), compStatus, resStatus);
                    log.debug("Shadow markers comparison error (non-fatal): {}", t.getMessage());
                } finally {
                    String finalResStatus = resStatus;
                    String finalCompStatus = compStatus;
                    timerSample.stop(Timer.builder("discover.opensearch.shadow.latency")
                            .tag("query_type", ShadowQueryType.MARKERS.name())
                            .tag("comparison_status", finalCompStatus)
                            .tag("result_status", finalResStatus)
                            .register(meterRegistry));
                }
            }, shadowExecutor);
        } catch (RejectedExecutionException e) {
            log.debug("Shadow markers task rejected by executor (queue full) — discarding");
        }
    }

    // ---- private helpers ----

    private void emitSkippedCounter(String queryTypeName) {
        Counter.builder("discover.opensearch.shadow.count")
                .tag("query_type", queryTypeName)
                .tag("comparison_status", "SKIPPED")
                .tag("result_status", "POSTGRES_SHADOW_SKIPPED")
                .register(meterRegistry)
                .increment();
    }

    private void emitErrorCounter(String queryTypeName, String compStatus, String resStatus) {
        Counter.builder("discover.opensearch.shadow.count")
                .tag("query_type", queryTypeName)
                .tag("comparison_status", compStatus)
                .tag("result_status", resStatus)
                .register(meterRegistry)
                .increment();
    }

    private static boolean isTimeoutException(Throwable t) {
        if (t instanceof java.util.concurrent.TimeoutException) return true;
        if (t instanceof org.springframework.web.client.ResourceAccessException) {
            Throwable cause = t.getCause();
            return cause instanceof java.net.SocketTimeoutException;
        }
        return false;
    }

    /** Returns true if the injected bean is "this" (self-injection guard). */
    private boolean isSelf(Object bean) {
        return bean == this;
    }
}

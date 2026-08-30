package com.example.realestate.discover.shadow;

import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import com.example.realestate.discover.DiscoverListingsPage;
import com.example.realestate.discover.DiscoverListingsPort;
import com.example.realestate.discover.DiscoverListingsQuery;
import com.example.realestate.discover.DiscoverMarkersPort;
import com.example.realestate.discover.DiscoverMarkersResponse;
import com.example.realestate.discover.opensearch.OpenSearchProperties;
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

import static com.example.realestate.discover.shadow.ShadowQueryMetrics.ComparisonStatus;

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
    private final Executor shadowExecutor;
    private final ParityComparator comparator;
    private final ShadowQueryMetrics shadowQueryMetrics;
    private final SamplingPredicate samplingPredicate;

    /**
     * Primary constructor — used by Spring.
     *
     * <p>Adapters are passed per-call (see {@link #submitListingsShadow} and
     * {@link #submitMarkersShadow}) to avoid a circular bean dependency:
     * {@code RoutingDiscoverListingsService} and {@code RoutingDiscoverMarkersService} are the
     * {@code @Primary} implementations of the adapter ports, and they hold a reference to this
     * bean. Injecting the ports here would form a cycle Spring cannot resolve at startup.
     */
    @Autowired
    public ShadowComparisonRunner(
            OpenSearchProperties props,
            @Qualifier("shadowExecutor") Executor shadowExecutor,
            ParityComparator comparator,
            ShadowQueryMetrics shadowQueryMetrics) {
        this.props = props;
        this.shadowExecutor = shadowExecutor;
        this.comparator = comparator;
        this.shadowQueryMetrics = shadowQueryMetrics;
        this.samplingPredicate = SamplingPredicate.random();
    }

    /**
     * Test-friendly constructor that accepts an explicit {@link SamplingPredicate}.
     */
    public ShadowComparisonRunner(
            OpenSearchProperties props,
            Executor shadowExecutor,
            ParityComparator comparator,
            ShadowQueryMetrics shadowQueryMetrics,
            SamplingPredicate samplingPredicate) {
        this.props = props;
        this.shadowExecutor = shadowExecutor;
        this.comparator = comparator;
        this.shadowQueryMetrics = shadowQueryMetrics;
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
     * @param query           the listings query that was just served by Postgres
     * @param postgresPage    the Postgres result (not modified)
     * @param listingsAdapter the OpenSearch listings adapter (may be null when OS is not configured)
     */
    public void submitListingsShadow(DiscoverListingsQuery query, DiscoverListingsPage postgresPage,
                                     DiscoverListingsPort listingsAdapter) {
        // O3: shadow only on !enabled && shadowEnabled
        if (!props.shadowEnabled() || props.enabled()) {
            return;
        }
        if (listingsAdapter == null) {
            return;
        }
        if (!samplingPredicate.shouldSample(props.shadowSampleRate())) {
            shadowQueryMetrics.recordSkipped(ShadowQueryType.fromListingsQuery(query));
            return;
        }

        // Capture immutable data BEFORE submit (defensive copy — postgresPage is alive on
        // the request thread; the shadow task runs on a different thread).
        List<String> capturedPostgresIds = List.copyOf(
                postgresPage.content().stream().map(r -> r.id()).toList());
        ShadowQueryType queryType = ShadowQueryType.fromListingsQuery(query);

        try {
            CompletableFuture.runAsync(() -> {
                Timer.Sample timerSample = shadowQueryMetrics.startSample();
                ComparisonStatus comparisonStatus = ComparisonStatus.ERROR;
                try {
                    DiscoverListingsPage osResult = listingsAdapter.getListings(query);
                    List<String> osIds = osResult.content().stream().map(r -> r.id()).toList();
                    // compare() records parity distribution summaries and returns MATCH or MISMATCH
                    String rawStatus = comparator.compare(capturedPostgresIds, osIds, queryType);
                    comparisonStatus = "MATCH".equals(rawStatus)
                            ? ComparisonStatus.MATCH
                            : ComparisonStatus.COUNT_MISMATCH;
                } catch (Throwable t) {
                    boolean isTimeout = isTimeoutException(t);
                    comparisonStatus = isTimeout ? ComparisonStatus.TIMEOUT : ComparisonStatus.ERROR;
                    log.debug("Shadow comparison error (non-fatal) queryType={}: {}",
                            queryType.name(), t.getMessage());
                } finally {
                    shadowQueryMetrics.recordComparison(queryType, comparisonStatus,
                            0L, 0L, 0L, 0L, timerSample);
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
     * @param filters          the markers filters that were just served by Postgres
     * @param postgresResponse the Postgres result (not modified)
     * @param markersAdapter   the OpenSearch markers adapter (may be null when OS is not configured)
     */
    public void submitMarkersShadow(
            DiscoverListingPredicateBuilder.Filters filters,
            DiscoverMarkersResponse postgresResponse,
            DiscoverMarkersPort markersAdapter) {

        if (!props.shadowEnabled() || props.enabled()) {
            return;
        }
        if (markersAdapter == null) {
            return;
        }
        if (!samplingPredicate.shouldSample(props.shadowSampleRate())) {
            shadowQueryMetrics.recordSkipped(ShadowQueryType.MARKERS);
            return;
        }

        // Capture immutable data
        List<String> capturedPostgresIds = List.copyOf(
                postgresResponse.markers().stream().map(m -> m.id()).toList());

        try {
            CompletableFuture.runAsync(() -> {
                Timer.Sample timerSample = shadowQueryMetrics.startSample();
                ComparisonStatus comparisonStatus = ComparisonStatus.ERROR;
                try {
                    DiscoverMarkersResponse osResult = markersAdapter.getMarkers(filters);
                    List<String> osIds = osResult.markers().stream().map(m -> m.id()).toList();
                    String rawStatus = comparator.compare(capturedPostgresIds, osIds, ShadowQueryType.MARKERS);
                    comparisonStatus = "MATCH".equals(rawStatus)
                            ? ComparisonStatus.MATCH
                            : ComparisonStatus.COUNT_MISMATCH;
                } catch (Throwable t) {
                    boolean isTimeout = isTimeoutException(t);
                    comparisonStatus = isTimeout ? ComparisonStatus.TIMEOUT : ComparisonStatus.ERROR;
                    log.debug("Shadow markers comparison error (non-fatal): {}", t.getMessage());
                } finally {
                    shadowQueryMetrics.recordComparison(ShadowQueryType.MARKERS, comparisonStatus,
                            0L, 0L, 0L, 0L, timerSample);
                }
            }, shadowExecutor);
        } catch (RejectedExecutionException e) {
            log.debug("Shadow markers task rejected by executor (queue full) — discarding");
        }
    }

    // ---- private helpers ----

    private static boolean isTimeoutException(Throwable t) {
        if (t instanceof java.util.concurrent.TimeoutException) return true;
        if (t instanceof org.springframework.web.client.ResourceAccessException) {
            Throwable cause = t.getCause();
            return cause instanceof java.net.SocketTimeoutException;
        }
        return false;
    }

}

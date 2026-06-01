package com.example.realestate.discover.opensearch;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

/**
 * Pre-registered Micrometer metrics for the OpenSearch query path.
 *
 * <p>All timers are pre-registered in the constructor so Prometheus scrapes see every
 * combination from startup (not only after the first request). Tag values are enum-derived
 * only — no user input (query strings, IDs, coordinates) is ever used as a tag value.
 *
 * <p>Cardinality:
 * <ul>
 *   <li>listings timer: {@link QueryType} (4) × {@link ResultStatus} (5) = 20 series</li>
 *   <li>markers timer: {@link ResultStatus} (5) = 5 series (query_type always BBOX)</li>
 *   <li>fallback counter: {@link FallbackReason} (4) = 4 series</li>
 * </ul>
 */
@Component
public class OpenSearchQueryMetrics {

    /** Structural shape of the OpenSearch query. Derived from field PRESENCE only. */
    public enum QueryType {
        TEXT, BBOX, RADIUS, COMBINED
    }

    /** Outcome of the OpenSearch query attempt. */
    public enum ResultStatus {
        SUCCESS, EMPTY, ERROR, TIMEOUT, FALLBACK
    }

    /** Reason the primary path fell back to Postgres (emitted by the adapter, not the router). */
    public enum FallbackReason {
        ERROR, TIMEOUT, DISABLED, UNAVAILABLE
    }

    private static final String LISTINGS_METRIC = "discover.opensearch.listings.query.latency.seconds";
    private static final String MARKERS_METRIC  = "discover.opensearch.markers.query.latency.seconds";
    private static final String FALLBACK_METRIC = "discover.opensearch.fallback.total";

    private final MeterRegistry registry;

    /** listings timers keyed by (QueryType, ResultStatus) pair string "TYPE:STATUS". */
    private final Map<String, Timer> listingsTimers;

    /** markers timers keyed by ResultStatus name (query_type is always BBOX for markers). */
    private final Map<String, Timer> markersTimers;

    /** fallback counters keyed by FallbackReason name. */
    private final Map<String, Counter> fallbackCounters;

    public OpenSearchQueryMetrics(MeterRegistry registry) {
        this.registry = registry;
        this.listingsTimers  = buildListingsTimers(registry);
        this.markersTimers   = buildMarkersTimers(registry);
        this.fallbackCounters = buildFallbackCounters(registry);
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /** Start a latency measurement. Call before issuing the OpenSearch request. */
    public Timer.Sample startSample() {
        return Timer.start(registry);
    }

    /**
     * Record a completed listings query.
     *
     * @param qt     structural shape of the query (enum — never raw user input)
     * @param rs     outcome of the query (enum — never raw user input)
     * @param sample the sample started by {@link #startSample()}
     */
    public void recordListingsQuery(QueryType qt, ResultStatus rs, Timer.Sample sample) {
        Timer timer = Objects.requireNonNull(listingsTimers.get(qt.name() + ":" + rs.name()),
                "pre-registration missed key: " + qt.name() + ":" + rs.name());
        sample.stop(timer);
    }

    /**
     * Record a completed markers query. Query type is always BBOX for the markers adapter.
     *
     * @param rs     outcome of the query
     * @param sample the sample started by {@link #startSample()}
     */
    public void recordMarkersQuery(ResultStatus rs, Timer.Sample sample) {
        Timer timer = Objects.requireNonNull(markersTimers.get(rs.name()),
                "pre-registration missed key: " + rs.name());
        sample.stop(timer);
    }

    /**
     * Record a fallback from the OpenSearch path to Postgres.
     *
     * <p>This counter is adapter-level (complements the router-level
     * {@code discover.opensearch.fallback.count} counter with different tag structure).
     *
     * @param reason why the primary OS path was not used
     */
    public void recordFallback(FallbackReason reason) {
        Counter counter = Objects.requireNonNull(fallbackCounters.get(reason.name()),
                "pre-registration missed key: " + reason.name());
        counter.increment();
    }

    // -----------------------------------------------------------------------
    // Pre-registration helpers
    // -----------------------------------------------------------------------

    private static Map<String, Timer> buildListingsTimers(MeterRegistry registry) {
        Map<String, Timer> map = new HashMap<>();
        for (QueryType qt : QueryType.values()) {
            for (ResultStatus rs : ResultStatus.values()) {
                String key = qt.name() + ":" + rs.name();
                map.put(key, Timer.builder(LISTINGS_METRIC)
                        .tag("query_type", qt.name().toLowerCase())
                        .tag("result_status", rs.name().toLowerCase())
                        .publishPercentileHistogram(true)
                        .register(registry));
            }
        }
        return Map.copyOf(map);
    }

    private static Map<String, Timer> buildMarkersTimers(MeterRegistry registry) {
        Map<String, Timer> map = new HashMap<>();
        for (ResultStatus rs : ResultStatus.values()) {
            map.put(rs.name(), Timer.builder(MARKERS_METRIC)
                    .tag("query_type", "bbox")
                    .tag("result_status", rs.name().toLowerCase())
                    .publishPercentileHistogram(true)
                    .register(registry));
        }
        return Map.copyOf(map);
    }

    private static Map<String, Counter> buildFallbackCounters(MeterRegistry registry) {
        Map<String, Counter> map = new HashMap<>();
        for (FallbackReason reason : FallbackReason.values()) {
            map.put(reason.name(), Counter.builder(FALLBACK_METRIC)
                    .tag("fallback_reason", reason.name().toLowerCase())
                    .register(registry));
        }
        return Map.copyOf(map);
    }
}

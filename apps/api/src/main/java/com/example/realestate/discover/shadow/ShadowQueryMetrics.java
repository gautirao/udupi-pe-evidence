package com.example.realestate.discover.shadow;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

/**
 * Pre-registered Micrometer metrics for the OpenSearch shadow/parity comparison path.
 *
 * <p>{@link ShadowComparisonRunner} is the primary live call site for this class.
 * {@link ParityComparator} also uses the registry directly for distribution summaries.
 *
 * <p>All tag values are enum-derived constants. No user input (query text, listing IDs,
 * coordinates) is ever used as a tag value — cardinality is strictly bounded.
 *
 * <p>Cardinality per metric (worst-case):
 * <ul>
 *   <li>comparison counter: {@link ShadowQueryType} (6) × {@link ComparisonStatus} (6) = 36 series</li>
 *   <li>count_delta / missing_docs / extra_docs / top_n_overlap: 6 × 6 = 36 series each</li>
 *   <li>latency timer: 6 × 6 = 36 series</li>
 * </ul>
 */
@Component
public class ShadowQueryMetrics {

    /** Outcome of a shadow parity comparison. */
    public enum ComparisonStatus {
        MATCH, COUNT_MISMATCH, CONTENT_MISMATCH, TIMEOUT, ERROR, SKIPPED
    }

    private static final String COMPARISON_METRIC    = "discover.opensearch.shadow.comparison.total";
    private static final String COUNT_DELTA_METRIC   = "discover.opensearch.shadow.count_delta";
    private static final String MISSING_DOCS_METRIC  = "discover.opensearch.shadow.missing_docs";
    private static final String EXTRA_DOCS_METRIC    = "discover.opensearch.shadow.extra_docs";
    private static final String TOP_N_OVERLAP_METRIC = "discover.opensearch.shadow.top_n_overlap";
    private static final String LATENCY_METRIC       = "discover.opensearch.shadow.latency.seconds";

    private final MeterRegistry registry;

    /** Comparison counters keyed by "QueryType:ComparisonStatus". */
    private final Map<String, Counter> comparisonCounters;

    /** DistributionSummary maps keyed by "QueryType:ComparisonStatus". */
    private final Map<String, DistributionSummary> countDeltaSummaries;
    private final Map<String, DistributionSummary> missingDocsSummaries;
    private final Map<String, DistributionSummary> extraDocsSummaries;
    private final Map<String, DistributionSummary> topNOverlapSummaries;

    /** Latency timers keyed by "QueryType:ComparisonStatus". */
    private final Map<String, Timer> latencyTimers;

    public ShadowQueryMetrics(MeterRegistry registry) {
        this.registry = registry;
        this.comparisonCounters   = buildComparisonCounters(registry);
        this.countDeltaSummaries  = buildDistributionSummaries(registry, COUNT_DELTA_METRIC);
        this.missingDocsSummaries = buildDistributionSummaries(registry, MISSING_DOCS_METRIC);
        this.extraDocsSummaries   = buildDistributionSummaries(registry, EXTRA_DOCS_METRIC);
        this.topNOverlapSummaries = buildDistributionSummaries(registry, TOP_N_OVERLAP_METRIC);
        this.latencyTimers        = buildLatencyTimers(registry);
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /** Start a latency measurement for the shadow comparison. */
    public Timer.Sample startSample() {
        return Timer.start(registry);
    }

    /**
     * Record a completed shadow parity comparison atomically.
     *
     * <p>All numeric values must be counts derived from result sets — never listing IDs,
     * query strings, or any user-supplied value.
     *
     * @param queryType        structural shape of the query (enum only)
     * @param comparisonStatus outcome of the comparison (enum only)
     * @param countDelta       absolute difference in result counts: {@code abs(pgCount - osCount)}
     * @param missingDocs      count of IDs present in Postgres but absent from OpenSearch
     * @param extraDocs        count of IDs present in OpenSearch but absent from Postgres
     * @param topNOverlap      count of IDs in the intersection of the top-N ordered results (0..N)
     * @param sample           the sample started by {@link #startSample()}
     */
    public void recordComparison(
            ShadowQueryType queryType,
            ComparisonStatus comparisonStatus,
            long countDelta,
            long missingDocs,
            long extraDocs,
            long topNOverlap,
            Timer.Sample sample) {

        String key = queryType.name() + ":" + comparisonStatus.name();

        Objects.requireNonNull(comparisonCounters.get(key),
                "pre-registration missed key: " + key).increment();

        Objects.requireNonNull(countDeltaSummaries.get(key),
                "pre-registration missed key: " + key).record(countDelta);

        Objects.requireNonNull(missingDocsSummaries.get(key),
                "pre-registration missed key: " + key).record(missingDocs);

        Objects.requireNonNull(extraDocsSummaries.get(key),
                "pre-registration missed key: " + key).record(extraDocs);

        Objects.requireNonNull(topNOverlapSummaries.get(key),
                "pre-registration missed key: " + key).record(topNOverlap);

        sample.stop(Objects.requireNonNull(latencyTimers.get(key),
                "pre-registration missed key: " + key));
    }

    /**
     * Record a shadow comparison that was skipped by the sampling gate.
     *
     * <p>Increments {@code discover.opensearch.shadow.comparison.total} with
     * {@code comparison_status=skipped}. No distribution summaries or latency timer
     * are recorded — there is no completed comparison to measure.
     *
     * @param queryType structural shape of the query that was skipped (enum only)
     */
    public void recordSkipped(ShadowQueryType queryType) {
        String key = queryType.name() + ":" + ComparisonStatus.SKIPPED.name();
        Objects.requireNonNull(comparisonCounters.get(key),
                "pre-registration missed key: " + key).increment();
    }

    // -----------------------------------------------------------------------
    // Pre-registration helpers
    // -----------------------------------------------------------------------

    private static Map<String, Counter> buildComparisonCounters(MeterRegistry registry) {
        Map<String, Counter> map = new HashMap<>();
        for (ShadowQueryType qt : ShadowQueryType.values()) {
            for (ComparisonStatus cs : ComparisonStatus.values()) {
                String key = qt.name() + ":" + cs.name();
                map.put(key, Counter.builder(COMPARISON_METRIC)
                        .tag("query_type", qt.name().toLowerCase())
                        .tag("comparison_status", cs.name().toLowerCase())
                        .register(registry));
            }
        }
        return Map.copyOf(map);
    }

    private static Map<String, DistributionSummary> buildDistributionSummaries(
            MeterRegistry registry, String metricName) {
        Map<String, DistributionSummary> map = new HashMap<>();
        for (ShadowQueryType qt : ShadowQueryType.values()) {
            for (ComparisonStatus cs : ComparisonStatus.values()) {
                String key = qt.name() + ":" + cs.name();
                map.put(key, DistributionSummary.builder(metricName)
                        .tag("query_type", qt.name().toLowerCase())
                        .tag("comparison_status", cs.name().toLowerCase())
                        .register(registry));
            }
        }
        return Map.copyOf(map);
    }

    private static Map<String, Timer> buildLatencyTimers(MeterRegistry registry) {
        Map<String, Timer> map = new HashMap<>();
        for (ShadowQueryType qt : ShadowQueryType.values()) {
            for (ComparisonStatus cs : ComparisonStatus.values()) {
                String key = qt.name() + ":" + cs.name();
                map.put(key, Timer.builder(LATENCY_METRIC)
                        .tag("query_type", qt.name().toLowerCase())
                        .tag("comparison_status", cs.name().toLowerCase())
                        .publishPercentileHistogram(true)
                        .register(registry));
            }
        }
        return Map.copyOf(map);
    }
}

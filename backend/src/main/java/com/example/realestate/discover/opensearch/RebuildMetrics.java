package com.example.realestate.discover.opensearch;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

/**
 * Rebuild pipeline metrics placeholder.
 * The current rebuild executor is scripts/opensearch_rebuild.py (Python-only) and does NOT
 * call these Java methods. These metrics will be populated when a Java rebuild
 * trigger/orchestration service is implemented.
 *
 * <p>Index lag metric: deferred — no reliable indexed_at timestamp exists in the current
 * OpenSearch document schema. See docs/architecture/opensearch-observability-and-cutover-metrics.md §2.
 */
@Component
public class RebuildMetrics {

    /** Stage in the per-document rebuild pipeline. */
    public enum PipelineStage {
        READ, INDEXED, SKIPPED, FAILED
    }

    /** Overall outcome of a rebuild run. */
    public enum RebuildResult {
        SUCCESS, FAILURE
    }

    private static final String DOCUMENTS_METRIC    = "discover.opensearch.rebuild.documents.total";
    private static final String DURATION_METRIC     = "discover.opensearch.rebuild.duration.seconds";
    private static final String ALIAS_SWAP_METRIC   = "discover.opensearch.rebuild.alias_swap.total";

    private final MeterRegistry registry;

    /** Document counters keyed by PipelineStage name. */
    private final Map<String, Counter> documentCounters;

    /** Duration timers keyed by RebuildResult name. */
    private final Map<String, Timer> durationTimers;

    /** Alias-swap counters keyed by RebuildResult name. */
    private final Map<String, Counter> aliasSwapCounters;

    public RebuildMetrics(MeterRegistry registry) {
        this.registry          = registry;
        this.documentCounters  = buildDocumentCounters(registry);
        this.durationTimers    = buildDurationTimers(registry);
        this.aliasSwapCounters = buildAliasSwapCounters(registry);
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Record that {@code count} documents transitioned through the given pipeline stage.
     *
     * @param stage the pipeline stage (enum only — never raw status string)
     * @param count number of documents (must be a positive integer count)
     */
    public void recordDocuments(PipelineStage stage, long count) {
        Objects.requireNonNull(documentCounters.get(stage.name()),
                "pre-registration missed key: " + stage.name()).increment(count);
    }

    /** Start a rebuild duration measurement. Call before the rebuild run begins. */
    public Timer.Sample startRebuild() {
        return Timer.start(registry);
    }

    /**
     * Record the wall-clock duration of a completed rebuild run.
     *
     * @param result SUCCESS or FAILURE
     * @param sample the sample started by {@link #startRebuild()}
     */
    public void recordRebuildDuration(RebuildResult result, Timer.Sample sample) {
        sample.stop(Objects.requireNonNull(durationTimers.get(result.name()),
                "pre-registration missed key: " + result.name()));
    }

    /**
     * Record an alias-swap operation outcome.
     *
     * @param result SUCCESS or FAILURE
     */
    public void recordAliasSwap(RebuildResult result) {
        Objects.requireNonNull(aliasSwapCounters.get(result.name()),
                "pre-registration missed key: " + result.name()).increment();
    }

    // -----------------------------------------------------------------------
    // Pre-registration helpers
    // -----------------------------------------------------------------------

    private static Map<String, Counter> buildDocumentCounters(MeterRegistry registry) {
        Map<String, Counter> map = new HashMap<>();
        for (PipelineStage stage : PipelineStage.values()) {
            map.put(stage.name(), Counter.builder(DOCUMENTS_METRIC)
                    .tag("pipeline_stage", stage.name().toLowerCase())
                    .description("Number of documents processed at the given pipeline stage.")
                    .register(registry));
        }
        return Map.copyOf(map);
    }

    private static Map<String, Timer> buildDurationTimers(MeterRegistry registry) {
        Map<String, Timer> map = new HashMap<>();
        for (RebuildResult result : RebuildResult.values()) {
            map.put(result.name(), Timer.builder(DURATION_METRIC)
                    .tag("result", result.name().toLowerCase())
                    .publishPercentileHistogram(true)
                    .description("Wall-clock duration of a full rebuild run.")
                    .register(registry));
        }
        return Map.copyOf(map);
    }

    private static Map<String, Counter> buildAliasSwapCounters(MeterRegistry registry) {
        Map<String, Counter> map = new HashMap<>();
        for (RebuildResult result : RebuildResult.values()) {
            map.put(result.name(), Counter.builder(ALIAS_SWAP_METRIC)
                    .tag("result", result.name().toLowerCase())
                    .description("Number of alias-swap operations by outcome.")
                    .register(registry));
        }
        return Map.copyOf(map);
    }
}

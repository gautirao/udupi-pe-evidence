package com.example.realestate.discover.opensearch;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link RebuildMetrics}.
 *
 * Uses {@link SimpleMeterRegistry} (not mocked).
 * Note: the actual rebuild pipeline is Python-only (scripts/opensearch_rebuild.py);
 * these tests verify the Java placeholder API behaves correctly.
 */
class RebuildMetricsTest {

    private SimpleMeterRegistry registry;
    private RebuildMetrics rebuildMetrics;

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
        rebuildMetrics = new RebuildMetrics(registry);
    }

    // -----------------------------------------------------------------------
    // Pre-registration
    // -----------------------------------------------------------------------

    @Test
    void documentCounters_allStagesPreRegistered() {
        long count = registry.getMeters().stream()
                .filter(m -> m.getId().getName().equals("discover.opensearch.rebuild.documents.total"))
                .count();
        // 4 PipelineStage values
        assertThat(count).isEqualTo(4);
    }

    @Test
    void durationTimers_allResultsPreRegistered() {
        long count = registry.getMeters().stream()
                .filter(m -> m.getId().getName().equals("discover.opensearch.rebuild.duration.seconds"))
                .count();
        // 2 RebuildResult values
        assertThat(count).isEqualTo(2);
    }

    @Test
    void aliasSwapCounters_allResultsPreRegistered() {
        long count = registry.getMeters().stream()
                .filter(m -> m.getId().getName().equals("discover.opensearch.rebuild.alias_swap.total"))
                .count();
        // 2 RebuildResult values
        assertThat(count).isEqualTo(2);
    }

    // -----------------------------------------------------------------------
    // recordDocuments
    // -----------------------------------------------------------------------

    @Test
    void recordDocuments_read_incrementsByCount() {
        rebuildMetrics.recordDocuments(RebuildMetrics.PipelineStage.READ, 100);

        Counter counter = registry.find("discover.opensearch.rebuild.documents.total")
                .tag("pipeline_stage", "read")
                .counter();

        assertThat(counter).isNotNull();
        assertThat(counter.count()).isEqualTo(100.0);
    }

    @Test
    void recordDocuments_indexed_incrementsByCount() {
        rebuildMetrics.recordDocuments(RebuildMetrics.PipelineStage.INDEXED, 95);

        Counter counter = registry.find("discover.opensearch.rebuild.documents.total")
                .tag("pipeline_stage", "indexed")
                .counter();

        assertThat(counter).isNotNull();
        assertThat(counter.count()).isEqualTo(95.0);
    }

    @Test
    void recordDocuments_failed_incrementsByCount() {
        rebuildMetrics.recordDocuments(RebuildMetrics.PipelineStage.FAILED, 5);

        Counter counter = registry.find("discover.opensearch.rebuild.documents.total")
                .tag("pipeline_stage", "failed")
                .counter();

        assertThat(counter).isNotNull();
        assertThat(counter.count()).isEqualTo(5.0);
    }

    @Test
    void recordDocuments_skipped_incrementsByCount() {
        rebuildMetrics.recordDocuments(RebuildMetrics.PipelineStage.SKIPPED, 2);

        Counter counter = registry.find("discover.opensearch.rebuild.documents.total")
                .tag("pipeline_stage", "skipped")
                .counter();

        assertThat(counter).isNotNull();
        assertThat(counter.count()).isEqualTo(2.0);
    }

    @Test
    void recordDocuments_stagesAreIndependent() {
        rebuildMetrics.recordDocuments(RebuildMetrics.PipelineStage.READ, 100);
        rebuildMetrics.recordDocuments(RebuildMetrics.PipelineStage.INDEXED, 90);
        rebuildMetrics.recordDocuments(RebuildMetrics.PipelineStage.SKIPPED, 8);
        rebuildMetrics.recordDocuments(RebuildMetrics.PipelineStage.FAILED, 2);

        assertThat(registry.find("discover.opensearch.rebuild.documents.total")
                .tag("pipeline_stage", "read").counter().count()).isEqualTo(100.0);
        assertThat(registry.find("discover.opensearch.rebuild.documents.total")
                .tag("pipeline_stage", "indexed").counter().count()).isEqualTo(90.0);
        assertThat(registry.find("discover.opensearch.rebuild.documents.total")
                .tag("pipeline_stage", "skipped").counter().count()).isEqualTo(8.0);
        assertThat(registry.find("discover.opensearch.rebuild.documents.total")
                .tag("pipeline_stage", "failed").counter().count()).isEqualTo(2.0);
    }

    // -----------------------------------------------------------------------
    // recordRebuildDuration
    // -----------------------------------------------------------------------

    @Test
    void recordRebuildDuration_success_recordsTimer() {
        Timer.Sample sample = rebuildMetrics.startRebuild();
        rebuildMetrics.recordRebuildDuration(RebuildMetrics.RebuildResult.SUCCESS, sample);

        Timer timer = registry.find("discover.opensearch.rebuild.duration.seconds")
                .tag("result", "success")
                .timer();

        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    @Test
    void recordRebuildDuration_failure_recordsTimer() {
        Timer.Sample sample = rebuildMetrics.startRebuild();
        rebuildMetrics.recordRebuildDuration(RebuildMetrics.RebuildResult.FAILURE, sample);

        Timer timer = registry.find("discover.opensearch.rebuild.duration.seconds")
                .tag("result", "failure")
                .timer();

        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    // -----------------------------------------------------------------------
    // recordAliasSwap
    // -----------------------------------------------------------------------

    @Test
    void recordAliasSwap_success_incrementsSuccessCounter() {
        rebuildMetrics.recordAliasSwap(RebuildMetrics.RebuildResult.SUCCESS);

        Counter counter = registry.find("discover.opensearch.rebuild.alias_swap.total")
                .tag("result", "success")
                .counter();

        assertThat(counter).isNotNull();
        assertThat(counter.count()).isEqualTo(1.0);
    }

    @Test
    void recordAliasSwap_failure_incrementsFailureCounter() {
        rebuildMetrics.recordAliasSwap(RebuildMetrics.RebuildResult.FAILURE);

        Counter counter = registry.find("discover.opensearch.rebuild.alias_swap.total")
                .tag("result", "failure")
                .counter();

        assertThat(counter).isNotNull();
        assertThat(counter.count()).isEqualTo(1.0);
    }

    @Test
    void recordAliasSwap_resultsAreIndependent() {
        rebuildMetrics.recordAliasSwap(RebuildMetrics.RebuildResult.SUCCESS);
        rebuildMetrics.recordAliasSwap(RebuildMetrics.RebuildResult.SUCCESS);
        rebuildMetrics.recordAliasSwap(RebuildMetrics.RebuildResult.FAILURE);

        assertThat(registry.find("discover.opensearch.rebuild.alias_swap.total")
                .tag("result", "success").counter().count()).isEqualTo(2.0);
        assertThat(registry.find("discover.opensearch.rebuild.alias_swap.total")
                .tag("result", "failure").counter().count()).isEqualTo(1.0);
    }
}

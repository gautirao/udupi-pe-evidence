package com.example.realestate.discover.shadow;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.Tag;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link ShadowQueryMetrics}.
 *
 * Uses {@link SimpleMeterRegistry} (not mocked).
 * Verifies that all 6 metric types are recorded correctly per comparison result,
 * and that no listing IDs, query strings, or other PII appear in tag values.
 */
class ShadowQueryMetricsTest {

    private SimpleMeterRegistry registry;
    private ShadowQueryMetrics shadowMetrics;

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
        shadowMetrics = new ShadowQueryMetrics(registry);
    }

    // -----------------------------------------------------------------------
    // Pre-registration: all combinations must exist at startup
    // -----------------------------------------------------------------------

    @Test
    void comparisonCounters_allCombinationsPreRegistered() {
        long count = registry.getMeters().stream()
                .filter(m -> m.getId().getName().equals("discover.opensearch.shadow.comparison.total"))
                .count();
        // 6 ShadowQueryType × 6 ComparisonStatus (MATCH, COUNT_MISMATCH, CONTENT_MISMATCH, TIMEOUT, ERROR, SKIPPED) = 36
        assertThat(count).isEqualTo(36);
    }

    @Test
    void latencyTimers_allCombinationsPreRegistered() {
        long count = registry.getMeters().stream()
                .filter(m -> m.getId().getName().equals("discover.opensearch.shadow.latency.seconds"))
                .count();
        // 6 ShadowQueryType × 6 ComparisonStatus = 36
        assertThat(count).isEqualTo(36);
    }

    // -----------------------------------------------------------------------
    // recordComparison: MATCH
    // -----------------------------------------------------------------------

    @Test
    void recordComparison_match_allSixMetricsRecorded() {
        Timer.Sample sample = shadowMetrics.startSample();
        shadowMetrics.recordComparison(
                ShadowQueryType.BBOX,
                ShadowQueryMetrics.ComparisonStatus.MATCH,
                0L, 0L, 0L, 10L,
                sample);

        Counter counter = registry.find("discover.opensearch.shadow.comparison.total")
                .tag("query_type", "bbox")
                .tag("comparison_status", "match")
                .counter();
        assertThat(counter).isNotNull();
        assertThat(counter.count()).isEqualTo(1.0);

        DistributionSummary countDelta = registry.find("discover.opensearch.shadow.count_delta")
                .tag("query_type", "bbox")
                .tag("comparison_status", "match")
                .summary();
        assertThat(countDelta).isNotNull();
        assertThat(countDelta.totalAmount()).isEqualTo(0.0);

        DistributionSummary missingDocs = registry.find("discover.opensearch.shadow.missing_docs")
                .tag("query_type", "bbox")
                .tag("comparison_status", "match")
                .summary();
        assertThat(missingDocs).isNotNull();
        assertThat(missingDocs.totalAmount()).isEqualTo(0.0);

        DistributionSummary extraDocs = registry.find("discover.opensearch.shadow.extra_docs")
                .tag("query_type", "bbox")
                .tag("comparison_status", "match")
                .summary();
        assertThat(extraDocs).isNotNull();
        assertThat(extraDocs.totalAmount()).isEqualTo(0.0);

        DistributionSummary topNOverlap = registry.find("discover.opensearch.shadow.top_n_overlap")
                .tag("query_type", "bbox")
                .tag("comparison_status", "match")
                .summary();
        assertThat(topNOverlap).isNotNull();
        assertThat(topNOverlap.totalAmount()).isEqualTo(10.0);

        Timer timer = registry.find("discover.opensearch.shadow.latency.seconds")
                .tag("query_type", "bbox")
                .tag("comparison_status", "match")
                .timer();
        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    // -----------------------------------------------------------------------
    // recordComparison: COUNT_MISMATCH
    // -----------------------------------------------------------------------

    @Test
    void recordComparison_countMismatch_recordsCorrectDelta() {
        Timer.Sample sample = shadowMetrics.startSample();
        shadowMetrics.recordComparison(
                ShadowQueryType.KEYWORD,
                ShadowQueryMetrics.ComparisonStatus.COUNT_MISMATCH,
                5L, 3L, 2L, 7L,
                sample);

        Counter counter = registry.find("discover.opensearch.shadow.comparison.total")
                .tag("query_type", "keyword")
                .tag("comparison_status", "count_mismatch")
                .counter();
        assertThat(counter.count()).isEqualTo(1.0);

        DistributionSummary countDelta = registry.find("discover.opensearch.shadow.count_delta")
                .tag("query_type", "keyword")
                .tag("comparison_status", "count_mismatch")
                .summary();
        assertThat(countDelta.totalAmount()).isEqualTo(5.0);

        DistributionSummary missingDocs = registry.find("discover.opensearch.shadow.missing_docs")
                .tag("query_type", "keyword")
                .tag("comparison_status", "count_mismatch")
                .summary();
        assertThat(missingDocs.totalAmount()).isEqualTo(3.0);

        DistributionSummary extraDocs = registry.find("discover.opensearch.shadow.extra_docs")
                .tag("query_type", "keyword")
                .tag("comparison_status", "count_mismatch")
                .summary();
        assertThat(extraDocs.totalAmount()).isEqualTo(2.0);
    }

    // -----------------------------------------------------------------------
    // recordComparison: CONTENT_MISMATCH
    // -----------------------------------------------------------------------

    @Test
    void recordComparison_contentMismatch_incrementsCounter() {
        Timer.Sample sample = shadowMetrics.startSample();
        shadowMetrics.recordComparison(
                ShadowQueryType.SCHOOL_RADIUS,
                ShadowQueryMetrics.ComparisonStatus.CONTENT_MISMATCH,
                0L, 2L, 2L, 8L,
                sample);

        Counter counter = registry.find("discover.opensearch.shadow.comparison.total")
                .tag("query_type", "school_radius")
                .tag("comparison_status", "content_mismatch")
                .counter();
        assertThat(counter.count()).isEqualTo(1.0);
    }

    // -----------------------------------------------------------------------
    // recordComparison: TIMEOUT
    // -----------------------------------------------------------------------

    @Test
    void recordComparison_timeout_incrementsTimeoutCounter() {
        Timer.Sample sample = shadowMetrics.startSample();
        shadowMetrics.recordComparison(
                ShadowQueryType.MARKERS,
                ShadowQueryMetrics.ComparisonStatus.TIMEOUT,
                0L, 0L, 0L, 0L,
                sample);

        Counter counter = registry.find("discover.opensearch.shadow.comparison.total")
                .tag("query_type", "markers")
                .tag("comparison_status", "timeout")
                .counter();
        assertThat(counter.count()).isEqualTo(1.0);

        Timer timer = registry.find("discover.opensearch.shadow.latency.seconds")
                .tag("query_type", "markers")
                .tag("comparison_status", "timeout")
                .timer();
        assertThat(timer.count()).isEqualTo(1);
    }

    // -----------------------------------------------------------------------
    // recordComparison: ERROR
    // -----------------------------------------------------------------------

    @Test
    void recordComparison_error_incrementsErrorCounter() {
        Timer.Sample sample = shadowMetrics.startSample();
        shadowMetrics.recordComparison(
                ShadowQueryType.CITY_BROWSE,
                ShadowQueryMetrics.ComparisonStatus.ERROR,
                0L, 0L, 0L, 0L,
                sample);

        Counter counter = registry.find("discover.opensearch.shadow.comparison.total")
                .tag("query_type", "city_browse")
                .tag("comparison_status", "error")
                .counter();
        assertThat(counter.count()).isEqualTo(1.0);
    }

    // -----------------------------------------------------------------------
    // Multiple calls accumulate correctly
    // -----------------------------------------------------------------------

    @Test
    void multipleComparisons_accumulateCounterAndSummary() {
        for (int i = 0; i < 3; i++) {
            Timer.Sample sample = shadowMetrics.startSample();
            shadowMetrics.recordComparison(
                    ShadowQueryType.BBOX,
                    ShadowQueryMetrics.ComparisonStatus.MATCH,
                    0L, 0L, 0L, 10L,
                    sample);
        }

        Counter counter = registry.find("discover.opensearch.shadow.comparison.total")
                .tag("query_type", "bbox")
                .tag("comparison_status", "match")
                .counter();
        assertThat(counter.count()).isEqualTo(3.0);

        Timer timer = registry.find("discover.opensearch.shadow.latency.seconds")
                .tag("query_type", "bbox")
                .tag("comparison_status", "match")
                .timer();
        assertThat(timer.count()).isEqualTo(3);
    }

    // -----------------------------------------------------------------------
    // PRIVACY: no listing IDs, query text, or coordinates in tag values
    // -----------------------------------------------------------------------

    @Test
    void noTagValue_containsUserInputOrListingIds() {
        // Simulate comparisons — the numeric values here are counts, not IDs
        Timer.Sample sample = shadowMetrics.startSample();
        shadowMetrics.recordComparison(
                ShadowQueryType.KEYWORD,
                ShadowQueryMetrics.ComparisonStatus.MATCH,
                0L, 0L, 0L, 5L,
                sample);

        Set<String> allTagValues = registry.getMeters().stream()
                .flatMap(m -> m.getId().getTags().stream())
                .map(Tag::getValue)
                .collect(Collectors.toSet());

        // Verify known-sensitive values are absent
        assertThat(allTagValues).doesNotContain("pg-listing-uuid-123");
        assertThat(allTagValues).doesNotContain("os-listing-uuid-456");
        assertThat(allTagValues).doesNotContain("sea view apartment");
        assertThat(allTagValues).doesNotContain("13.34");
        assertThat(allTagValues).doesNotContain("74.74");

        // All tag values must be lowercase enum-derived constants or app name
        for (String value : allTagValues) {
            assertThat(value)
                    .as("Tag value '%s' should be a known enum-derived constant", value)
                    .matches("[a-z0-9_. -]+");
        }
    }
}

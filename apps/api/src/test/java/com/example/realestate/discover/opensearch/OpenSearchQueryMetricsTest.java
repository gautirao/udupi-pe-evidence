package com.example.realestate.discover.opensearch;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link OpenSearchQueryMetrics}.
 *
 * Uses {@link SimpleMeterRegistry} (not mocked) — pre-registration and recording
 * behaviour is verified against the real Micrometer in-memory registry.
 */
class OpenSearchQueryMetricsTest {

    private SimpleMeterRegistry registry;
    private OpenSearchQueryMetrics metrics;

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
        metrics = new OpenSearchQueryMetrics(registry);
    }

    // -----------------------------------------------------------------------
    // Pre-registration: all combinations must be registered at startup
    // -----------------------------------------------------------------------

    @Test
    void listingsTimers_allCombinationsPreRegistered() {
        long listingsTimerCount = registry.getMeters().stream()
                .filter(m -> m.getId().getName().equals("discover.opensearch.listings.query.latency.seconds"))
                .count();
        // 4 QueryType × 5 ResultStatus = 20
        assertThat(listingsTimerCount).isEqualTo(20);
    }

    @Test
    void markersTimers_allResultStatusesPreRegistered() {
        long markersTimerCount = registry.getMeters().stream()
                .filter(m -> m.getId().getName().equals("discover.opensearch.markers.query.latency.seconds"))
                .count();
        // 5 ResultStatus (query_type always bbox)
        assertThat(markersTimerCount).isEqualTo(5);
    }

    @Test
    void fallbackCounters_allReasonsPreRegistered() {
        long fallbackCounterCount = registry.getMeters().stream()
                .filter(m -> m.getId().getName().equals("discover.opensearch.fallback.total"))
                .count();
        // 4 FallbackReason
        assertThat(fallbackCounterCount).isEqualTo(4);
    }

    // -----------------------------------------------------------------------
    // recordListingsQuery: timer recorded for correct combination
    // -----------------------------------------------------------------------

    @Test
    void recordListingsQuery_success_bbox_incrementsCorrectTimer() {
        Timer.Sample sample = metrics.startSample();
        metrics.recordListingsQuery(OpenSearchQueryMetrics.QueryType.BBOX,
                OpenSearchQueryMetrics.ResultStatus.SUCCESS, sample);

        Timer timer = registry.find("discover.opensearch.listings.query.latency.seconds")
                .tag("query_type", "bbox")
                .tag("result_status", "success")
                .timer();

        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    @Test
    void recordListingsQuery_empty_text_incrementsCorrectTimer() {
        Timer.Sample sample = metrics.startSample();
        metrics.recordListingsQuery(OpenSearchQueryMetrics.QueryType.TEXT,
                OpenSearchQueryMetrics.ResultStatus.EMPTY, sample);

        Timer timer = registry.find("discover.opensearch.listings.query.latency.seconds")
                .tag("query_type", "text")
                .tag("result_status", "empty")
                .timer();

        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    @Test
    void recordListingsQuery_timeout_combined_incrementsCorrectTimer() {
        Timer.Sample sample = metrics.startSample();
        metrics.recordListingsQuery(OpenSearchQueryMetrics.QueryType.COMBINED,
                OpenSearchQueryMetrics.ResultStatus.TIMEOUT, sample);

        Timer timer = registry.find("discover.opensearch.listings.query.latency.seconds")
                .tag("query_type", "combined")
                .tag("result_status", "timeout")
                .timer();

        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    @Test
    void recordListingsQuery_error_radius_incrementsCorrectTimer() {
        Timer.Sample sample = metrics.startSample();
        metrics.recordListingsQuery(OpenSearchQueryMetrics.QueryType.RADIUS,
                OpenSearchQueryMetrics.ResultStatus.ERROR, sample);

        Timer timer = registry.find("discover.opensearch.listings.query.latency.seconds")
                .tag("query_type", "radius")
                .tag("result_status", "error")
                .timer();

        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    // -----------------------------------------------------------------------
    // recordMarkersQuery
    // -----------------------------------------------------------------------

    @Test
    void recordMarkersQuery_success_incrementsCorrectTimer() {
        Timer.Sample sample = metrics.startSample();
        metrics.recordMarkersQuery(OpenSearchQueryMetrics.ResultStatus.SUCCESS, sample);

        Timer timer = registry.find("discover.opensearch.markers.query.latency.seconds")
                .tag("query_type", "bbox")
                .tag("result_status", "success")
                .timer();

        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    @Test
    void recordMarkersQuery_alwaysTaggedBbox() {
        Timer.Sample sample = metrics.startSample();
        metrics.recordMarkersQuery(OpenSearchQueryMetrics.ResultStatus.EMPTY, sample);

        // Verify query_type tag is always "bbox"
        Timer timer = registry.find("discover.opensearch.markers.query.latency.seconds")
                .tag("query_type", "bbox")
                .tag("result_status", "empty")
                .timer();
        assertThat(timer).isNotNull();
        assertThat(timer.count()).isEqualTo(1);
    }

    // -----------------------------------------------------------------------
    // recordFallback
    // -----------------------------------------------------------------------

    @Test
    void recordFallback_timeout_incrementsTimeoutCounter() {
        metrics.recordFallback(OpenSearchQueryMetrics.FallbackReason.TIMEOUT);

        Counter counter = registry.find("discover.opensearch.fallback.total")
                .tag("fallback_reason", "timeout")
                .counter();

        assertThat(counter).isNotNull();
        assertThat(counter.count()).isEqualTo(1.0);
    }

    @Test
    void recordFallback_error_incrementsErrorCounter() {
        metrics.recordFallback(OpenSearchQueryMetrics.FallbackReason.ERROR);

        Counter counter = registry.find("discover.opensearch.fallback.total")
                .tag("fallback_reason", "error")
                .counter();

        assertThat(counter).isNotNull();
        assertThat(counter.count()).isEqualTo(1.0);
    }

    @Test
    void recordFallback_disabled_incrementsDisabledCounter() {
        metrics.recordFallback(OpenSearchQueryMetrics.FallbackReason.DISABLED);

        Counter counter = registry.find("discover.opensearch.fallback.total")
                .tag("fallback_reason", "disabled")
                .counter();

        assertThat(counter).isNotNull();
        assertThat(counter.count()).isEqualTo(1.0);
    }

    @Test
    void recordFallback_countersAreIndependent() {
        metrics.recordFallback(OpenSearchQueryMetrics.FallbackReason.ERROR);
        metrics.recordFallback(OpenSearchQueryMetrics.FallbackReason.ERROR);
        metrics.recordFallback(OpenSearchQueryMetrics.FallbackReason.TIMEOUT);

        assertThat(registry.find("discover.opensearch.fallback.total")
                .tag("fallback_reason", "error").counter().count()).isEqualTo(2.0);
        assertThat(registry.find("discover.opensearch.fallback.total")
                .tag("fallback_reason", "timeout").counter().count()).isEqualTo(1.0);
        assertThat(registry.find("discover.opensearch.fallback.total")
                .tag("fallback_reason", "disabled").counter().count()).isEqualTo(0.0);
    }

    // -----------------------------------------------------------------------
    // PRIVACY: no raw user input in tag values
    // -----------------------------------------------------------------------

    @Test
    void noTagValue_containsUserInputStrings() {
        // Simulate a query cycle with a "sea view apartment" text search
        Timer.Sample sample1 = metrics.startSample();
        metrics.recordListingsQuery(OpenSearchQueryMetrics.QueryType.TEXT,
                OpenSearchQueryMetrics.ResultStatus.SUCCESS, sample1);
        metrics.recordFallback(OpenSearchQueryMetrics.FallbackReason.ERROR);

        Set<String> allTagValues = registry.getMeters().stream()
                .flatMap(m -> m.getId().getTags().stream())
                .map(io.micrometer.core.instrument.Tag::getValue)
                .collect(Collectors.toSet());

        // Banned values: raw query strings, IDs, coordinates
        assertThat(allTagValues).doesNotContain("sea view apartment");
        assertThat(allTagValues).doesNotContain("listing-123");
        assertThat(allTagValues).doesNotContain("13.3412,74.7443");
        assertThat(allTagValues).doesNotContain("user-abc");

        // All tag values must be lowercase enum-derived strings or application name
        for (String value : allTagValues) {
            assertThat(value)
                    .as("Tag value '%s' should be a known enum-derived constant", value)
                    .matches("[a-z0-9_. -]+");
        }
    }

    // -----------------------------------------------------------------------
    // Unrelated timers are not incremented
    // -----------------------------------------------------------------------

    @Test
    void recordListingsQuery_doesNotIncrementMarkersTimers() {
        Timer.Sample sample = metrics.startSample();
        metrics.recordListingsQuery(OpenSearchQueryMetrics.QueryType.BBOX,
                OpenSearchQueryMetrics.ResultStatus.SUCCESS, sample);

        // All markers timers should still be at 0
        registry.getMeters().stream()
                .filter(m -> m.getId().getName().equals("discover.opensearch.markers.query.latency.seconds"))
                .map(m -> (Timer) m)
                .forEach(t -> assertThat(t.count()).isZero());
    }
}

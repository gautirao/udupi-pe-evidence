package com.example.realestate.discover.shadow;

import com.example.realestate.discover.opensearch.OpenSearchProperties;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tag;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Collection;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link ParityComparator}.
 */
class ParityComparatorTest {

    private MeterRegistry registry;
    private ParityComparator comparator;

    /** Minimal OpenSearchProperties with shadow fields only (rest are defaults). */
    private static OpenSearchProperties props(int topN) {
        return new OpenSearchProperties(
                false,               // enabled
                "http://localhost:9200",
                "listings_read",
                500,
                1000,
                "",
                "",
                "",
                false,               // shadowEnabled
                500,                 // shadowTimeoutMs
                1.0,                 // shadowSampleRate
                topN                 // shadowTopN
        );
    }

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
        comparator = new ParityComparator(registry, props(10));
    }

    // ---- TC1: identical sets → MATCH ----

    @Test
    void match_identicalSets() {
        List<String> ids = List.of("a", "b", "c");
        comparator.compare(ids, ids, ShadowQueryType.CITY_BROWSE);

        assertCounter("MATCH", "POSTGRES_SHADOW_OK", "CITY_BROWSE", 1.0);
        assertDistribution("discover.opensearch.shadow.count_delta", "MATCH", 0.0);
        assertDistribution("discover.opensearch.shadow.mismatch_pct", "MATCH", 0.0);
        assertDistribution("discover.opensearch.shadow.missing_count", "MATCH", 0.0);
        assertDistribution("discover.opensearch.shadow.extra_count", "MATCH", 0.0);
    }

    // ---- TC2: Postgres has extra → MISMATCH ----

    @Test
    void mismatch_postgresHasExtra() {
        comparator.compare(
                List.of("1", "2", "3"),
                List.of("1", "2"),
                ShadowQueryType.CITY_BROWSE);

        assertCounter("MISMATCH", "POSTGRES_SHADOW_OK", "CITY_BROWSE", 1.0);
        assertDistribution("discover.opensearch.shadow.missing_count", "MISMATCH", 1.0);
        assertDistribution("discover.opensearch.shadow.extra_count", "MISMATCH", 0.0);
    }

    // ---- TC3: OS has extra → MISMATCH ----

    @Test
    void mismatch_opensearchHasExtra() {
        comparator.compare(
                List.of("1", "2"),
                List.of("1", "2", "3"),
                ShadowQueryType.CITY_BROWSE);

        assertCounter("MISMATCH", "POSTGRES_SHADOW_OK", "CITY_BROWSE", 1.0);
        assertDistribution("discover.opensearch.shadow.missing_count", "MISMATCH", 0.0);
        assertDistribution("discover.opensearch.shadow.extra_count", "MISMATCH", 1.0);
    }

    // ---- TC4: ordered=true → top_n_overlap emitted ----

    @Test
    void topNOverlap_emittedForOrderedQueryType() {
        List<String> pg = List.of("a", "b", "c", "d", "e");
        List<String> os = List.of("a", "b", "c", "x", "y");
        comparator.compare(pg, os, ShadowQueryType.KEYWORD);

        // top-5 overlap: a,b,c match = 3/5 = 0.6
        DistributionSummary summary = registry.find("discover.opensearch.shadow.top_n_overlap")
                .tag("query_type", "KEYWORD")
                .summary();
        assertThat(summary).as("top_n_overlap summary must exist for KEYWORD").isNotNull();
        assertThat(summary.totalAmount() / summary.count()).isCloseTo(0.6, org.assertj.core.data.Offset.offset(0.01));
    }

    // ---- TC5: ordered=false (MARKERS) → top_n_overlap NOT emitted ----

    @Test
    void topNOverlap_notEmittedForMarkers() {
        comparator.compare(
                List.of("a", "b", "c"),
                List.of("a", "b", "c"),
                ShadowQueryType.MARKERS);

        DistributionSummary summary = registry.find("discover.opensearch.shadow.top_n_overlap")
                .tag("query_type", "MARKERS")
                .summary();
        assertThat(summary)
                .as("top_n_overlap must NOT be emitted for MARKERS (ordered=false)")
                .isNull();
    }

    // ---- TC6: empty Postgres list → no NPE, denom guard works ----

    @Test
    void emptyPostgres_denomGuard_noException() {
        // pgCount=0 → denom=1 → mismatch_pct = extraCount/1*100
        comparator.compare(List.of(), List.of("a"), ShadowQueryType.CITY_BROWSE);

        // Should still emit a MISMATCH counter (extra=1, missing=0)
        assertCounter("MISMATCH", "POSTGRES_SHADOW_OK", "CITY_BROWSE", 1.0);
        assertDistribution("discover.opensearch.shadow.mismatch_pct", "MISMATCH", 100.0);
    }

    // ---- TC7/TC8: tag cardinality assertion ----

    @Test
    void tagNames_areExactlyQueryTypeComparisonStatusResultStatus() {
        comparator.compare(List.of("a"), List.of("a"), ShadowQueryType.KEYWORD);

        // Collect all tag names from all shadow meters registered in this run
        Set<String> forbiddenTagNames = Set.of("id", "lat", "lon", "q", "polygon", "user_id");
        Set<String> allowedTagNames   = Set.of("query_type", "comparison_status", "result_status");

        for (Meter meter : registry.getMeters()) {
            String metricName = meter.getId().getName();
            if (!metricName.startsWith("discover.opensearch.shadow")) continue;

            Set<String> tagNames = meter.getId().getTags().stream()
                    .map(Tag::getKey)
                    .collect(Collectors.toSet());

            // Must NOT contain any forbidden PII-like tag
            for (String forbidden : forbiddenTagNames) {
                assertThat(tagNames)
                        .as("Metric %s must not use PII tag '%s'", metricName, forbidden)
                        .doesNotContain(forbidden);
            }

            // Must contain only the three approved tag keys
            for (String tagName : tagNames) {
                assertThat(allowedTagNames)
                        .as("Metric %s has unexpected tag key '%s'", metricName, tagName)
                        .contains(tagName);
            }
        }
    }

    // ---- helpers ----

    private void assertCounter(String compStatus, String resStatus, String queryType, double expected) {
        Counter counter = registry.find("discover.opensearch.shadow.count")
                .tag("comparison_status", compStatus)
                .tag("result_status", resStatus)
                .tag("query_type", queryType)
                .counter();
        assertThat(counter)
                .as("Counter discover.opensearch.shadow.count[comparison_status=%s] must exist", compStatus)
                .isNotNull();
        assertThat(counter.count()).isCloseTo(expected, org.assertj.core.data.Offset.offset(0.001));
    }

    private void assertDistribution(String name, String compStatus, double expectedRecorded) {
        DistributionSummary summary = registry.find(name)
                .tag("comparison_status", compStatus)
                .summary();
        assertThat(summary).as("DistributionSummary %s[%s] must exist", name, compStatus).isNotNull();
        // totalAmount() / count() gives the mean — but for a single recording it equals the value
        double actualValue = summary.totalAmount() / Math.max(summary.count(), 1);
        assertThat(actualValue).isCloseTo(expectedRecorded, org.assertj.core.data.Offset.offset(0.001));
    }
}

package com.example.realestate.discover.shadow;

import com.example.realestate.discover.opensearch.OpenSearchProperties;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Performs parity comparison between Postgres and OpenSearch result sets and records
 * Micrometer metrics for each comparison.
 *
 * <h3>Cardinality policy</h3>
 * All tag values are enum-derived string constants. No user-supplied text (query strings,
 * IDs, coordinates, polygon, user IDs) is ever used as a tag value.
 *
 * <h3>Tag names (exactly three)</h3>
 * <ul>
 *   <li>{@code query_type} — ShadowQueryType enum name
 *   <li>{@code comparison_status} — MATCH | MISMATCH | TIMEOUT | ERROR | SKIPPED
 *   <li>{@code result_status} — POSTGRES_ONLY | POSTGRES_SHADOW_OK | POSTGRES_SHADOW_TIMEOUT |
 *       POSTGRES_SHADOW_ERROR | POSTGRES_SHADOW_SKIPPED
 * </ul>
 */
@Component
public class ParityComparator {

    private static final Logger log = LoggerFactory.getLogger(ParityComparator.class);

    private final MeterRegistry meterRegistry;
    private final OpenSearchProperties props;

    public ParityComparator(MeterRegistry meterRegistry, OpenSearchProperties props) {
        this.meterRegistry = meterRegistry;
        this.props = props;
    }

    /**
     * Compares two ID lists and records all parity metrics.
     *
     * <p>{@code result_status} is always {@code POSTGRES_SHADOW_OK} — this method is only
     * called on the success path. Error/timeout/skipped paths emit their own counters via
     * {@link com.example.realestate.discover.shadow.ShadowComparisonRunner} directly, keeping
     * the result_status tag closed and enum-safe at the call site.
     *
     * @param postgresIds    ordered list of listing IDs from Postgres
     * @param opensearchIds  ordered list of listing IDs from OpenSearch
     * @param queryType      shape of the query — drives {@code query_type} tag and ordered check
     * @return the {@code comparison_status} string (MATCH or MISMATCH) for use in the caller's timer tag
     */
    public String compare(
            List<String> postgresIds,
            List<String> opensearchIds,
            ShadowQueryType queryType) {

        // result_status is always POSTGRES_SHADOW_OK on the success path
        final String resultStatus = "POSTGRES_SHADOW_OK";

        // Deduplicate while preserving order for top-N check
        LinkedHashSet<String> pgSet = new LinkedHashSet<>(postgresIds);
        LinkedHashSet<String> osSet = new LinkedHashSet<>(opensearchIds);

        int pgCount = pgSet.size();
        int osCount = osSet.size();
        int countDelta = pgCount - osCount;   // signed

        // Set difference: present in Postgres but absent from OpenSearch
        Set<String> missingInOs = new LinkedHashSet<>(pgSet);
        missingInOs.removeAll(osSet);
        int missingCount = missingInOs.size();

        // Set difference: present in OpenSearch but absent from Postgres
        Set<String> extraInOs = new LinkedHashSet<>(osSet);
        extraInOs.removeAll(pgSet);
        int extraCount = extraInOs.size();

        // Guard against empty Postgres result (denominator must be >= 1)
        double denom = Math.max(pgCount, 1);
        double mismatchPct = (missingCount + extraCount) / denom * 100.0;

        String comparisonStatus = (missingCount == 0 && extraCount == 0) ? "MATCH" : "MISMATCH";
        String queryTypeName = queryType.name();

        log.debug("Shadow parity queryType={} comparisonStatus={} pgCount={} osCount={} " +
                  "missing={} extra={} mismatchPct={}",
                queryTypeName, comparisonStatus, pgCount, osCount,
                missingCount, extraCount, String.format("%.2f", mismatchPct));

        // --- Counters ---
        Counter.builder("discover.opensearch.shadow.count")
                .tag("query_type", queryTypeName)
                .tag("comparison_status", comparisonStatus)
                .tag("result_status", resultStatus)
                .register(meterRegistry)
                .increment();

        // --- Distribution summaries (MATCH and MISMATCH only) ---
        DistributionSummary.builder("discover.opensearch.shadow.count_delta")
                .tag("query_type", queryTypeName)
                .tag("comparison_status", comparisonStatus)
                .tag("result_status", resultStatus)
                .register(meterRegistry)
                .record(Math.abs(countDelta));

        DistributionSummary.builder("discover.opensearch.shadow.mismatch_pct")
                .tag("query_type", queryTypeName)
                .tag("comparison_status", comparisonStatus)
                .tag("result_status", resultStatus)
                .register(meterRegistry)
                .record(mismatchPct);

        DistributionSummary.builder("discover.opensearch.shadow.missing_count")
                .tag("query_type", queryTypeName)
                .tag("comparison_status", comparisonStatus)
                .tag("result_status", resultStatus)
                .register(meterRegistry)
                .record(missingCount);

        DistributionSummary.builder("discover.opensearch.shadow.extra_count")
                .tag("query_type", queryTypeName)
                .tag("comparison_status", comparisonStatus)
                .tag("result_status", resultStatus)
                .register(meterRegistry)
                .record(extraCount);

        // --- Top-N overlap: only when sort orders match ---
        if (queryType.isOrdered()) {
            int n = Math.min(props.shadowTopN(), Math.min(pgCount, osCount));
            if (n > 0) {
                List<String> pgTopN = postgresIds.stream().limit(n).toList();
                List<String> osTopN = opensearchIds.stream().limit(n).toList();

                Set<String> pgTopSet = new LinkedHashSet<>(pgTopN);
                Set<String> osTopSet = new LinkedHashSet<>(osTopN);
                pgTopSet.retainAll(osTopSet);
                int overlap = pgTopSet.size();
                double topNOverlapFraction = (double) overlap / n;

                DistributionSummary.builder("discover.opensearch.shadow.top_n_overlap")
                        .tag("query_type", queryTypeName)
                        .tag("comparison_status", comparisonStatus)
                        .tag("result_status", resultStatus)
                        .register(meterRegistry)
                        .record(topNOverlapFraction);
            }
        }

        return comparisonStatus;
    }
}

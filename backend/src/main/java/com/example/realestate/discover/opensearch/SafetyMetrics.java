package com.example.realestate.discover.opensearch;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

/**
 * Safety signal counters for the OpenSearch indexing pipeline.
 * All counters MUST remain at zero in production. Any nonzero value
 * is a cutover-blocking incident per opensearch-observability-and-cutover-metrics.md §8.
 *
 * <p>IMPORTANT: The rebuild pipeline is currently Python-only (scripts/opensearch_rebuild.py)
 * and does not call these Java methods. These counters are placeholders for when a Java
 * rebuild/indexing service is implemented. Until then, call sites exist only in tests.
 */
@Component
public class SafetyMetrics {

    static final String NON_PUBLIC_INDEXED_METRIC       = "discover.opensearch.safety.non_public_indexed";
    static final String WHITELIST_VIOLATION_METRIC      = "discover.opensearch.safety.whitelist_violation";
    static final String SCHEMA_VALIDATION_FAILURE_METRIC = "discover.opensearch.safety.schema_validation_failure";

    private final Counter nonPublicIndexedCounter;
    private final Counter whitelistViolationCounter;
    private final Counter schemaValidationFailureCounter;

    public SafetyMetrics(MeterRegistry registry) {
        this.nonPublicIndexedCounter = Counter.builder(NON_PUBLIC_INDEXED_METRIC)
                .description("Documents with non-LIVE status that were indexed into OpenSearch. Must stay zero.")
                .register(registry);

        this.whitelistViolationCounter = Counter.builder(WHITELIST_VIOLATION_METRIC)
                .description("Index operations that included fields outside the allowed field whitelist. Must stay zero.")
                .register(registry);

        this.schemaValidationFailureCounter = Counter.builder(SCHEMA_VALIDATION_FAILURE_METRIC)
                .description("Documents that failed OpenSearch schema validation at index time. Must stay zero.")
                .register(registry);
    }

    /**
     * Increment when a document with non-LIVE status (e.g. DRAFT, REJECTED, PENDING_APPROVAL)
     * is detected in the indexing pipeline.
     */
    public void recordNonPublicIndexed() {
        nonPublicIndexedCounter.increment();
    }

    /**
     * Increment when an index operation attempts to write a field not in the approved whitelist.
     */
    public void recordWhitelistViolation() {
        whitelistViolationCounter.increment();
    }

    /**
     * Increment when a document fails OpenSearch mapping/schema validation at index time.
     */
    public void recordSchemaValidationFailure() {
        schemaValidationFailureCounter.increment();
    }
}

package com.example.realestate.search.indexer;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.stereotype.Component;

/**
 * Micrometer metrics for the search outbox retry mechanism.
 *
 * <p>Counters are pre-registered in the constructor (same pattern as
 * {@link com.example.realestate.discover.opensearch.RebuildMetrics}) so they appear in
 * Prometheus output at zero even before the first event fires.
 *
 * <p>Registered metrics:
 * <ul>
 *   <li>{@code discover.opensearch.outbox.retry.total} — incremented every time a failed entry
 *       is re-armed for a future attempt (i.e. NOT yet terminal).</li>
 *   <li>{@code discover.opensearch.outbox.terminal.total} — incremented every time an entry
 *       exhausts its max retry attempts and transitions to DEAD.</li>
 * </ul>
 */
@Component
public class SearchOutboxMetrics {

    public static final String RETRY_METRIC    = "discover.opensearch.outbox.retry.total";
    public static final String TERMINAL_METRIC = "discover.opensearch.outbox.terminal.total";

    private final Counter retryCounter;
    private final Counter terminalCounter;

    public SearchOutboxMetrics(MeterRegistry registry) {
        this.retryCounter = Counter.builder(RETRY_METRIC)
                .description("Number of search outbox entries re-armed for retry after a processing failure.")
                .register(registry);
        this.terminalCounter = Counter.builder(TERMINAL_METRIC)
                .description("Number of search outbox entries that exhausted max retry attempts and became DEAD.")
                .register(registry);
    }

    /** Record one retry re-arm (entry stays retryable, next_attempt_at set to the future). */
    public void recordRetry() {
        retryCounter.increment();
    }

    /** Record one terminal transition (entry moves to DEAD, will never be re-polled). */
    public void recordTerminal() {
        terminalCounter.increment();
    }
}

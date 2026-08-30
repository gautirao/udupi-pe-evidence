package com.example.realestate.search;

import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.search.indexer.OpenSearchIndexingAdapter;
import com.example.realestate.search.indexer.SearchIndexerProperties;
import com.example.realestate.search.indexer.SearchOutboxMetrics;
import com.example.realestate.search.indexer.SearchOutboxPoller;
import com.example.realestate.search.outbox.ListingSearchOutboxEntry;
import com.example.realestate.search.outbox.ListingSearchOutboxRepository;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageRequest;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for the retry mechanism in {@link SearchOutboxPoller}.
 *
 * <p>Covers AC1–AC7 of issue #1345:
 * <ul>
 *   <li>AC1: retry_count increments; next_attempt_at set; eventually publishes on success.</li>
 *   <li>AC2: max-attempts exhaustion → DEAD, never re-polled.</li>
 *   <li>AC3: retry-delay: just-failed entry NOT eligible until next_attempt_at elapses.</li>
 *   <li>AC4: one failing entry does not abort/starve the rest of the batch.</li>
 *   <li>AC5: retry counter and terminal counter increment correctly (SimpleMeterRegistry).</li>
 *   <li>AC6: disabled-by-default via search.indexer.enabled=false (structural — poller is
 *            @ConditionalOnProperty; not testable at unit level without Spring context;
 *            covered by existing ConditionalOnProperty annotation and app-context boot).</li>
 *   <li>AC7: tests use Mockito (no Testcontainers).</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class SearchOutboxPollerRetryTest {

    @Mock
    private ListingSearchOutboxRepository repository;
    @Mock
    private OpenSearchIndexingAdapter indexingAdapter;
    @Mock
    private ListingRepository listingRepository;

    private SimpleMeterRegistry meterRegistry;
    private SearchOutboxMetrics metrics;
    private SearchIndexerProperties props;
    private SearchOutboxPoller poller;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        metrics = new SearchOutboxMetrics(meterRegistry);

        props = new SearchIndexerProperties();
        props.getOutbox().setBatchSize(10);
        props.getOutbox().setMinEventAgeSeconds(0);
        props.getOutbox().setMaxRetryAttempts(3);
        props.getOutbox().setRetryDelaySeconds(60);

        poller = new SearchOutboxPoller(repository, indexingAdapter, props, listingRepository, metrics);
    }

    private ListingSearchOutboxEntry makeDeleteEntry() {
        ListingSearchOutboxEntry entry = new ListingSearchOutboxEntry();
        entry.setEventId(UUID.randomUUID());
        entry.setListingId(UUID.randomUUID().toString());
        entry.setOperation("DELETE");
        entry.setStatus("ARCHIVED");
        entry.setOccurredAt(Instant.now().minusSeconds(60));
        entry.setRetryCount(0);
        return entry;
    }

    // -----------------------------------------------------------------------
    // AC1 — retry_count increments; next_attempt_at set; success on later attempt
    // -----------------------------------------------------------------------

    @Test
    void ac1_firstFailureIncrementsRetryCountAndSetsNextAttemptAt() {
        // maxRetryAttempts=3; one failure → retryCount=1 < 3 → re-armed
        ListingSearchOutboxEntry entry = makeDeleteEntry();
        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any()))
                .thenReturn(List.of(entry));
        doThrow(new RuntimeException("timeout")).when(indexingAdapter).deleteListing(any());

        poller.pollAndPublish();

        assertThat(entry.getRetryCount()).isEqualTo(1);
        assertThat(entry.getNextAttemptAt()).isNotNull();
        assertThat(entry.getNextAttemptAt()).isAfter(Instant.now().minusSeconds(5));
        assertThat(entry.getPublishedAt()).isNull();
        assertThat(entry.getStatus()).isNotEqualTo("DEAD");
        assertThat(entry.getErrorMessage()).contains("timeout");
        assertThat(entry.getFailedAt()).isNotNull();
    }

    @Test
    void ac1_secondFailureIncrementsRetryCountAgain() {
        // Simulate an entry that already failed once (retryCount=1).
        ListingSearchOutboxEntry entry = makeDeleteEntry();
        entry.setRetryCount(1);
        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any()))
                .thenReturn(List.of(entry));
        doThrow(new RuntimeException("again")).when(indexingAdapter).deleteListing(any());

        poller.pollAndPublish();

        // retryCount=2 < 3 → still re-armed, not DEAD
        assertThat(entry.getRetryCount()).isEqualTo(2);
        assertThat(entry.getNextAttemptAt()).isNotNull();
        assertThat(entry.getStatus()).isNotEqualTo("DEAD");
    }

    @Test
    void ac1_entryPublishesSuccessfullyAfterPriorFailure() {
        // Simulate an entry that previously failed once; now succeeds.
        ListingSearchOutboxEntry entry = makeDeleteEntry();
        entry.setRetryCount(1);
        entry.setNextAttemptAt(Instant.now().minusSeconds(30)); // delay elapsed
        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any()))
                .thenReturn(List.of(entry));
        // No exception → success path

        poller.pollAndPublish();

        assertThat(entry.getPublishedAt()).isNotNull();
        // retryCount must NOT be touched by the success path
        assertThat(entry.getRetryCount()).isEqualTo(1);
        // nextAttemptAt must be cleared to null on success so published rows carry no
        // stale future timestamp (Fix 3 — diagnostic hygiene).
        assertThat(entry.getNextAttemptAt()).isNull();
        verify(repository).save(entry);
    }

    // -----------------------------------------------------------------------
    // AC2 — max-attempts exhaustion → DEAD, never re-polled
    // -----------------------------------------------------------------------

    @Test
    void ac2_thirdFailureGoesDeadWhenMaxAttemptsIs3() {
        // Entry already failed twice; third failure should go DEAD.
        ListingSearchOutboxEntry entry = makeDeleteEntry();
        entry.setRetryCount(2);
        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any()))
                .thenReturn(List.of(entry));
        doThrow(new RuntimeException("final failure")).when(indexingAdapter).deleteListing(any());

        poller.pollAndPublish();

        assertThat(entry.getRetryCount()).isEqualTo(3);
        assertThat(entry.getStatus()).isEqualTo("DEAD");
        assertThat(entry.getNextAttemptAt()).isNull(); // cleared on DEAD
        assertThat(entry.getPublishedAt()).isNull();
    }

    @Test
    void ac2_maxAttemptsEqualOneGoesDeadOnFirstFailure() {
        props.getOutbox().setMaxRetryAttempts(1);
        ListingSearchOutboxEntry entry = makeDeleteEntry();
        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any()))
                .thenReturn(List.of(entry));
        doThrow(new RuntimeException("instant-dead")).when(indexingAdapter).deleteListing(any());

        poller.pollAndPublish();

        assertThat(entry.getRetryCount()).isEqualTo(1);
        assertThat(entry.getStatus()).isEqualTo("DEAD");
    }

    // -----------------------------------------------------------------------
    // AC3 — retry-delay: query filters out entries where nextAttemptAt > now
    // -----------------------------------------------------------------------

    @Test
    void ac3_retryDelayIsSetToNowPlusRetryDelaySeconds() {
        // After a failure the nextAttemptAt must be approximately now + retryDelaySeconds.
        props.getOutbox().setRetryDelaySeconds(120);
        ListingSearchOutboxEntry entry = makeDeleteEntry();
        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any()))
                .thenReturn(List.of(entry));
        doThrow(new RuntimeException("delayed")).when(indexingAdapter).deleteListing(any());

        Instant before = Instant.now();
        poller.pollAndPublish();
        Instant after = Instant.now();

        Instant nextAttempt = entry.getNextAttemptAt();
        assertThat(nextAttempt).isNotNull();
        // now is captured once at poll-cycle start (≈ before) and passed directly to
        // handleFailure, so nextAttemptAt = now + 120s. Tolerance is ±2s to absorb
        // scheduling jitter between `before` capture and the poller's internal `now`.
        assertThat(nextAttempt).isAfterOrEqualTo(before.plusSeconds(118));
        assertThat(nextAttempt).isBeforeOrEqualTo(before.plusSeconds(122));
    }

    @Test
    void ac3_nowParamPassedToRepositoryQueryForDelayFiltering() {
        // The poller must pass a consistent 'now' to the repository so the DB-level
        // nextAttemptAt filter works correctly (AC3 — no hot-loop).
        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any()))
                .thenReturn(List.of());

        poller.pollAndPublish();

        // Verify two Instant params were passed: maxAge and now.
        // The second Instant (now) must be after or equal to maxAge.
        var captor = org.mockito.ArgumentCaptor.forClass(Instant.class);
        verify(repository).findUnpublishedBatch(captor.capture(), captor.capture(), any(PageRequest.class));
        List<Instant> instants = captor.getAllValues();
        Instant maxAge = instants.get(0); // now - minEventAgeSeconds (=0 here, so ≈ now)
        Instant nowParam = instants.get(1);
        // Both should be very recent; nowParam >= maxAge (since minEventAge=0, now-0 == now)
        assertThat(nowParam).isAfterOrEqualTo(maxAge.minusSeconds(1));
    }

    // -----------------------------------------------------------------------
    // AC4 — poison-event isolation: one failing entry does not abort the batch
    // -----------------------------------------------------------------------

    @Test
    void ac4_poisonEntryDoesNotBlockSuccessfulBatchMembers() {
        ListingSearchOutboxEntry poison = makeDeleteEntry();
        ListingSearchOutboxEntry ok1 = makeDeleteEntry();
        ListingSearchOutboxEntry ok2 = makeDeleteEntry();
        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any()))
                .thenReturn(List.of(poison, ok1, ok2));
        doThrow(new RuntimeException("poison"))
                .when(indexingAdapter).deleteListing(eq(poison.getListingId()));

        poller.pollAndPublish();

        assertThat(poison.getPublishedAt()).isNull();
        assertThat(poison.getRetryCount()).isEqualTo(1);
        assertThat(ok1.getPublishedAt()).isNotNull();
        assertThat(ok2.getPublishedAt()).isNotNull();
        verify(repository, times(3)).save(any(ListingSearchOutboxEntry.class));
    }

    // -----------------------------------------------------------------------
    // AC5 — metrics counters increment correctly
    // -----------------------------------------------------------------------

    @Test
    void ac5_retryCounterIncrementsOnRetryableFailure() {
        ListingSearchOutboxEntry entry = makeDeleteEntry();
        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any()))
                .thenReturn(List.of(entry));
        doThrow(new RuntimeException("err")).when(indexingAdapter).deleteListing(any());

        poller.pollAndPublish();

        // retryCount=1 < maxRetryAttempts=3 → retry counter incremented, terminal counter at 0
        double retryCount = meterRegistry.counter(SearchOutboxMetrics.RETRY_METRIC).count();
        double terminalCount = meterRegistry.counter(SearchOutboxMetrics.TERMINAL_METRIC).count();
        assertThat(retryCount).isEqualTo(1.0);
        assertThat(terminalCount).isEqualTo(0.0);
    }

    @Test
    void ac5_terminalCounterIncrementsOnDeadTransition() {
        // Pre-load entry at retryCount=2; one more failure → DEAD
        ListingSearchOutboxEntry entry = makeDeleteEntry();
        entry.setRetryCount(2);
        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any()))
                .thenReturn(List.of(entry));
        doThrow(new RuntimeException("dead")).when(indexingAdapter).deleteListing(any());

        poller.pollAndPublish();

        double retryCount = meterRegistry.counter(SearchOutboxMetrics.RETRY_METRIC).count();
        double terminalCount = meterRegistry.counter(SearchOutboxMetrics.TERMINAL_METRIC).count();
        assertThat(retryCount).isEqualTo(0.0);
        assertThat(terminalCount).isEqualTo(1.0);
    }

    @Test
    void ac5_countersPreRegisteredAtZeroBeforeAnyEvent() {
        // Counters must appear in Prometheus output immediately (pre-registered in ctor).
        double retryCount = meterRegistry.counter(SearchOutboxMetrics.RETRY_METRIC).count();
        double terminalCount = meterRegistry.counter(SearchOutboxMetrics.TERMINAL_METRIC).count();
        assertThat(retryCount).isEqualTo(0.0);
        assertThat(terminalCount).isEqualTo(0.0);
    }

    @Test
    void ac5_successPathDoesNotIncrementEitherCounter() {
        ListingSearchOutboxEntry entry = makeDeleteEntry();
        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any()))
                .thenReturn(List.of(entry));
        // No exception thrown → success

        poller.pollAndPublish();

        assertThat(entry.getPublishedAt()).isNotNull();
        double retryCount = meterRegistry.counter(SearchOutboxMetrics.RETRY_METRIC).count();
        double terminalCount = meterRegistry.counter(SearchOutboxMetrics.TERMINAL_METRIC).count();
        assertThat(retryCount).isEqualTo(0.0);
        assertThat(terminalCount).isEqualTo(0.0);
    }

    @Test
    void ac5_multipleFailuresAccumulateCounters() {
        // Two entries: one re-arms, one goes DEAD. Counters must each see 1.
        ListingSearchOutboxEntry retryEntry = makeDeleteEntry(); // retryCount=0 → becomes 1 → re-arm
        ListingSearchOutboxEntry deadEntry = makeDeleteEntry();
        deadEntry.setRetryCount(2); // one more failure → DEAD

        when(repository.findUnpublishedBatch(any(Instant.class), any(Instant.class), any()))
                .thenReturn(List.of(retryEntry, deadEntry));
        doThrow(new RuntimeException("fail"))
                .when(indexingAdapter).deleteListing(any());

        poller.pollAndPublish();

        assertThat(meterRegistry.counter(SearchOutboxMetrics.RETRY_METRIC).count()).isEqualTo(1.0);
        assertThat(meterRegistry.counter(SearchOutboxMetrics.TERMINAL_METRIC).count()).isEqualTo(1.0);
    }
}

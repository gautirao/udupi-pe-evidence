package com.example.realestate.search.outbox;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

/**
 * Repository for the listing_search_outbox table.
 * The primary query ({@link #findUnpublishedBatch}) is used by the poller to
 * fetch the oldest unpublished events that are old enough to be processed and
 * whose retry delay (if any) has elapsed.
 */
public interface ListingSearchOutboxRepository extends JpaRepository<ListingSearchOutboxEntry, Long> {

    /**
     * Finds unpublished, non-DEAD outbox entries that are eligible for processing.
     *
     * <p>Eligibility rules (all must hold):
     * <ul>
     *   <li>{@code publishedAt IS NULL} — not yet successfully processed.</li>
     *   <li>{@code occurredAt <= maxOccurredAt} — old enough (enforces minimum event age).</li>
     *   <li>{@code status NOT IN ('DEAD','FAILED')} — not in a terminal state. DEAD is the
     *       primary terminal state written by the poller since V83. FAILED is excluded
     *       defensively to guard against any legacy, manual, or future rows carrying that
     *       value (V82 wrote FAILED; V83 backfill converts existing ones). The predicate
     *       matches the V83 partial index predicate exactly so the index is fully utilized.</li>
     *   <li>{@code nextAttemptAt IS NULL OR nextAttemptAt <= now} — retry delay has elapsed;
     *       NULL means the entry has never failed and is immediately eligible.</li>
     * </ul>
     *
     * <p>Results are ordered by id ASC (oldest first). The result size is bounded by
     * the supplied {@link Pageable} (use
     * {@link org.springframework.data.domain.PageRequest#of(int, int) PageRequest.of(0, batchSize)}).
     *
     * @param maxOccurredAt upper bound on occurredAt (inclusive); events newer than this are skipped
     * @param now           current instant; entries with nextAttemptAt after this are skipped
     * @param pageable      limits the number of rows returned
     * @return up to batchSize eligible entries ordered by id ASC
     */
    @Query("SELECT e FROM ListingSearchOutboxEntry e " +
           "WHERE e.publishedAt IS NULL " +
           "AND e.occurredAt <= :maxOccurredAt " +
           "AND (e.status IS NULL OR (e.status <> 'DEAD' AND e.status <> 'FAILED')) " +
           "AND (e.nextAttemptAt IS NULL OR e.nextAttemptAt <= :now) " +
           "ORDER BY e.id ASC")
    List<ListingSearchOutboxEntry> findUnpublishedBatch(
            @Param("maxOccurredAt") Instant maxOccurredAt,
            @Param("now") Instant now,
            Pageable pageable);
}

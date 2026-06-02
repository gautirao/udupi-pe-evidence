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
 * fetch the oldest unpublished events that are old enough to be processed.
 */
public interface ListingSearchOutboxRepository extends JpaRepository<ListingSearchOutboxEntry, Long> {

    /**
     * Finds unpublished, non-FAILED outbox entries ordered by id ascending (oldest first).
     * Only returns entries whose {@code occurredAt} is at or before {@code maxOccurredAt},
     * which is used to enforce a minimum event age before processing.
     *
     * <p>Entries with {@code status = 'FAILED'} are permanently excluded from this query.
     * A failed entry will not re-enter the poll loop — it requires manual intervention
     * or a dedicated retry mechanism to reprocess.
     *
     * <p>The result size is limited by the supplied {@link Pageable} (use
     * {@link org.springframework.data.domain.PageRequest#of(int, int) PageRequest.of(0, batchSize)}).
     *
     * @param maxOccurredAt upper bound on occurredAt (inclusive); events newer than this are skipped
     * @param pageable      limits the number of rows returned (use PageRequest.of(0, batchSize))
     * @return up to batchSize eligible entries ordered by id ASC
     */
    @Query("SELECT e FROM ListingSearchOutboxEntry e " +
           "WHERE e.publishedAt IS NULL " +
           "AND e.occurredAt <= :maxOccurredAt " +
           "AND (e.status IS NULL OR e.status <> 'FAILED') " +
           "ORDER BY e.id ASC")
    List<ListingSearchOutboxEntry> findUnpublishedBatch(
            @Param("maxOccurredAt") Instant maxOccurredAt,
            Pageable pageable);
}

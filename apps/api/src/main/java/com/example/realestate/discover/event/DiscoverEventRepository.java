package com.example.realestate.discover.event;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;

@Repository
public interface DiscoverEventRepository extends JpaRepository<DiscoverEvent, Long> {

    /**
     * Delete a bounded batch of rows older than {@code cutoff}, returning the number deleted.
     *
     * <p>Uses a native query with a sub-select + LIMIT so each call deletes at most
     * {@code batchSize} rows, avoiding long table locks on large tables.
     *
     * <p>Idempotent: repeated calls with the same cutoff delete at most {@code batchSize}
     * rows per call and eventually delete 0 rows when no eligible rows remain.
     */
    @Modifying(clearAutomatically = true)
    @Query(value = """
            DELETE FROM discover_event
            WHERE id IN (
                SELECT id FROM discover_event
                WHERE ts < :cutoff
                LIMIT :batchSize
            )
            """, nativeQuery = true)
    int deleteBatchOlderThan(@Param("cutoff") OffsetDateTime cutoff,
                             @Param("batchSize") int batchSize);
}

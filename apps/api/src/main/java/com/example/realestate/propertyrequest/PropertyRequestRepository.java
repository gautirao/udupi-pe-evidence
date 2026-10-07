package com.example.realestate.propertyrequest;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface PropertyRequestRepository extends JpaRepository<PropertyRequest, UUID> {

    List<PropertyRequest> findAllByOrderByCreatedAtDesc(Pageable pageable);

    /**
     * Hard-delete a bounded batch of rows whose {@code retain_until} is strictly before
     * {@code cutoff}, returning the number deleted (#2792). The boundary is exclusive:
     * a row with {@code retain_until == cutoff} is kept.
     *
     * <p>Each call is its own transaction so row locks are bounded to one batch. Set-based and
     * stateless: a deleted row cannot match again, so re-runs and concurrent runs only find fewer rows.
     * Returns a count only; no row content is ever loaded.
     */
    @Transactional
    @Modifying(clearAutomatically = true)
    @Query(value = """
            DELETE FROM property_requests
            WHERE id IN (
                SELECT id FROM property_requests
                WHERE retain_until < :cutoff
                LIMIT :batchSize
            )
            """, nativeQuery = true)
    int deleteBatchExpired(@Param("cutoff") OffsetDateTime cutoff,
                           @Param("batchSize") int batchSize);
}

package com.example.realestate.ingestion;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface RawPostRepository extends JpaRepository<RawPost, UUID> {

    @Query(value = "SELECT * FROM public.raw_posts WHERE is_processed = false "
            + "ORDER BY created_at ASC LIMIT :limit", nativeQuery = true)
    List<RawPost> findUnprocessed(int limit);

    @Query(value = "SELECT * FROM public.raw_posts WHERE is_processed = false "
            + "AND feed_run_id = :feedRunId ORDER BY created_at ASC LIMIT :limit",
            nativeQuery = true)
    List<RawPost> findUnprocessedByFeedRunId(UUID feedRunId, int limit);

    @Modifying
    @Query("UPDATE RawPost r SET r.isProcessed = true WHERE r.id = :id")
    void markProcessed(UUID id);
}

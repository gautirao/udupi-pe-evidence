package com.example.realestate.insights;

import com.example.realestate.listing.core.Listing;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface InsightsRepository extends JpaRepository<Listing, UUID> {

    /**
     * Find LIVE listings in given area keys created after a cutoff date.
     * Offset/limit are driven by the supplied {@link Pageable}; no hardcoded LIMIT.
     * Count query is required by Spring Data for native pagination.
     */
    @Query(value = """
            SELECT * FROM public.property_listings
            WHERE status = 'LIVE'
              AND area_key IN (:areaKeys)
              AND created_at >= :cutoff
            ORDER BY created_at DESC
            """,
            countQuery = """
            SELECT COUNT(*) FROM public.property_listings
            WHERE status = 'LIVE'
              AND area_key IN (:areaKeys)
              AND created_at >= :cutoff
            """,
            nativeQuery = true)
    Page<Listing> findNewListingsInAreas(
            @Param("areaKeys") List<String> areaKeys,
            @Param("cutoff") OffsetDateTime cutoff,
            Pageable pageable);
}

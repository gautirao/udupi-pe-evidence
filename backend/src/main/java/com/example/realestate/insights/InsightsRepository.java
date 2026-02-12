package com.example.realestate.insights;

import com.example.realestate.listing.Listing;
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
     * Used by the new-listings endpoint to show recent activity in saved areas.
     */
    @Query(value = """
            SELECT * FROM public.property_listings
            WHERE status = 'LIVE'
              AND area_key IN (:areaKeys)
              AND created_at >= :cutoff
            ORDER BY created_at DESC
            LIMIT 50
            """, nativeQuery = true)
    List<Listing> findNewListingsInAreas(
            @Param("areaKeys") List<String> areaKeys,
            @Param("cutoff") OffsetDateTime cutoff);
}

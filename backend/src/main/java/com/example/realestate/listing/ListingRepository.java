package com.example.realestate.listing;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface ListingRepository extends JpaRepository<Listing, UUID> {

    boolean existsByRawPostId(UUID rawPostId);

    boolean existsByDedupeHash(String dedupeHash);

    long countByDedupeHash(String dedupeHash);

    @Query(value = """
            SELECT * FROM public.property_listings
            WHERE latitude BETWEEN :minLat AND :maxLat
              AND longitude BETWEEN :minLng AND :maxLng
              AND is_duplicate = false
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND area_key IS NOT NULL
              AND (CAST(:minPpc AS bigint) IS NULL OR price_per_cent_paise >= :minPpc)
              AND (CAST(:maxPpc AS bigint) IS NULL OR price_per_cent_paise <= :maxPpc)
              AND (CAST(:createdAfter AS timestamptz) IS NULL OR created_at >= :createdAfter)
            ORDER BY created_at DESC
            LIMIT :limit
            """, nativeQuery = true)
    List<Listing> findInBoundingBox(
            @Param("minLat") double minLat,
            @Param("minLng") double minLng,
            @Param("maxLat") double maxLat,
            @Param("maxLng") double maxLng,
            @Param("minPpc") Long minPpc,
            @Param("maxPpc") Long maxPpc,
            @Param("createdAfter") OffsetDateTime createdAfter,
            @Param("limit") int limit);
}

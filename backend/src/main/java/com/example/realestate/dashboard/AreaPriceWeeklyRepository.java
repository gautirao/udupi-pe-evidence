package com.example.realestate.dashboard;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface AreaPriceWeeklyRepository extends JpaRepository<AreaPriceWeekly, UUID> {

    /**
     * Finds the most recent N weeks of price history for a given area,
     * ordered by week_start_date descending (most recent first).
     *
     * @param areaKey the area identifier
     * @param limit   maximum number of weeks to return
     * @return list of weekly price records, most recent first
     */
    @Query(value = """
            SELECT * FROM public.area_price_weekly
            WHERE area_key = :areaKey
            ORDER BY week_start_date DESC
            LIMIT :limit
            """, nativeQuery = true)
    List<AreaPriceWeekly> findRecentByAreaKey(@Param("areaKey") String areaKey, @Param("limit") int limit);
}

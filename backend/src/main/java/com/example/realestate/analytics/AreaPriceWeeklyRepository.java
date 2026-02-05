package com.example.realestate.analytics;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;

@Repository
public interface AreaPriceWeeklyRepository
        extends JpaRepository<AreaPriceWeekly, AreaPriceWeekly.AreaPriceWeeklyId> {

    /**
     * Find all weekly rollups for a given area, ordered by week descending.
     */
    List<AreaPriceWeekly> findByAreaKeyOrderByWeekStartDateDesc(String areaKey);

    /**
     * Find all weekly rollups for a given area within a date range.
     */
    List<AreaPriceWeekly> findByAreaKeyAndWeekStartDateBetweenOrderByWeekStartDateAsc(
            String areaKey, LocalDate startDate, LocalDate endDate);

    /**
     * Find all rollups for a specific week across all areas.
     */
    List<AreaPriceWeekly> findByWeekStartDate(LocalDate weekStartDate);
}

package com.example.realestate.insights;

import com.example.realestate.dashboard.AreaInsightsDao;
import com.example.realestate.dashboard.AreaPriceWeekly;
import com.example.realestate.dashboard.AreaPriceWeeklyRepository;
import com.example.realestate.listing.Listing;
import com.example.realestate.listing.ListingRepository;
import com.example.realestate.listing.ListingRepository.OpportunityProjection;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class InsightsService {

    private static final int DEFAULT_WEEKS = 52;
    private static final double RECOMMENDATION_THRESHOLD = 0.8;
    private static final int RECOMMENDATION_FRESH_DAYS = 30;
    private static final int RECOMMENDATION_LIMIT = 20;

    private final AreaInsightsDao areaInsightsDao;
    private final AreaPriceWeeklyRepository areaPriceWeeklyRepository;
    private final InsightsRepository insightsRepository;
    private final ListingRepository listingRepository;
    private final SavedAreaRepository savedAreaRepository;

    public InsightsService(AreaInsightsDao areaInsightsDao,
                           AreaPriceWeeklyRepository areaPriceWeeklyRepository,
                           InsightsRepository insightsRepository,
                           ListingRepository listingRepository,
                           SavedAreaRepository savedAreaRepository) {
        this.areaInsightsDao = areaInsightsDao;
        this.areaPriceWeeklyRepository = areaPriceWeeklyRepository;
        this.insightsRepository = insightsRepository;
        this.listingRepository = listingRepository;
        this.savedAreaRepository = savedAreaRepository;
    }

    /**
     * Average price by area from area_stats_latest.
     */
    public List<AreaInsightsDao.AreaInsightRow> getAvgPriceByArea() {
        return areaInsightsDao.findInsights("median_desc", 100, 1);
    }

    /**
     * Weekly price trend for a specific area.
     * Returns empty list if area has no data.
     */
    public List<AreaPriceWeekly> getPriceTrend(String areaKey) {
        return areaPriceWeeklyRepository.findRecentByAreaKey(areaKey, DEFAULT_WEEKS);
    }

    /**
     * New LIVE listings in user's saved areas within the last N days.
     * Returns empty list if user has no saved areas.
     */
    public List<Listing> getNewListings(UUID userId, int days) {
        List<SavedArea> savedAreas = savedAreaRepository.findByUserIdOrderByCreatedAtDesc(userId);
        if (savedAreas.isEmpty()) {
            return List.of();
        }

        List<String> areaKeys = savedAreas.stream()
                .map(SavedArea::getAreaKey)
                .toList();

        OffsetDateTime cutoff = OffsetDateTime.now().minusDays(days);
        return insightsRepository.findNewListingsInAreas(areaKeys, cutoff);
    }

    /**
     * Deterministic recommendations based on undervaluation score.
     * If user has saved areas, returns recommendations filtered to those areas.
     * If no saved areas, returns general recommendations (all areas).
     * No AI calls. No randomness.
     * Uses batch query to eliminate N+1 pattern (2 queries total instead of 1+N).
     */
    public List<OpportunityProjection> getRecommendations(UUID userId) {
        List<SavedArea> savedAreas = savedAreaRepository.findByUserIdOrderByCreatedAtDesc(userId);

        if (savedAreas.isEmpty()) {
            // General recommendations across all areas (null = no area filter)
            return listingRepository.findOpportunitiesByAreaKeys(
                    null, RECOMMENDATION_THRESHOLD, RECOMMENDATION_FRESH_DAYS, RECOMMENDATION_LIMIT);
        }

        // Batch fetch opportunities for all saved areas in a single query
        List<String> areaKeys = savedAreas.stream()
                .map(SavedArea::getAreaKey)
                .toList();

        return listingRepository.findOpportunitiesByAreaKeys(
                areaKeys, RECOMMENDATION_THRESHOLD, RECOMMENDATION_FRESH_DAYS, RECOMMENDATION_LIMIT);
    }
}

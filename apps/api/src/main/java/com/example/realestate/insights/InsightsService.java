package com.example.realestate.insights;

import com.example.realestate.dashboard.AreaInsightsDao;
import com.example.realestate.dashboard.AreaPriceWeekly;
import com.example.realestate.dashboard.AreaPriceWeeklyRepository;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingRepository.OpportunityProjection;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
public class InsightsService {

    private static final int DEFAULT_WEEKS = 52;
    private static final double RECOMMENDATION_THRESHOLD = 0.8;
    private static final int RECOMMENDATION_FRESH_DAYS = 30;

    private final AreaInsightsDao areaInsightsDao;
    private final AreaPriceWeeklyRepository areaPriceWeeklyRepository;
    private final InsightsRepository insightsRepository;
    private final ListingRepository listingRepository;
    private final SavedAreaRepository savedAreaRepository;
    private final JdbcTemplate jdbcTemplate;

    public InsightsService(AreaInsightsDao areaInsightsDao,
                           AreaPriceWeeklyRepository areaPriceWeeklyRepository,
                           InsightsRepository insightsRepository,
                           ListingRepository listingRepository,
                           SavedAreaRepository savedAreaRepository,
                           JdbcTemplate jdbcTemplate) {
        this.areaInsightsDao = areaInsightsDao;
        this.areaPriceWeeklyRepository = areaPriceWeeklyRepository;
        this.insightsRepository = insightsRepository;
        this.listingRepository = listingRepository;
        this.savedAreaRepository = savedAreaRepository;
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Average price by area from area_stats_latest, filtered by property type and bedroom count.
     * @param bedrooms 0 = aggregate (all bedrooms)
     */
    public List<AreaInsightsDao.AreaInsightRow> getAvgPriceByArea(String propertyType, int bedrooms) {
        return areaInsightsDao.findInsights("median_desc", 100, 1, propertyType, bedrooms);
    }

    /**
     * Weekly price trend for a specific area, property type, and bedroom count.
     * @param bedrooms 0 = aggregate (all bedrooms)
     * Returns empty list if area has no data.
     */
    public List<AreaPriceWeekly> getPriceTrend(String areaKey, String propertyType, int bedrooms) {
        return areaPriceWeeklyRepository.findRecentByAreaKey(areaKey, propertyType, bedrooms, DEFAULT_WEEKS);
    }

    /**
     * New LIVE listings in user's saved areas within the last N days.
     * Returns an empty page if user has no saved areas.
     */
    public Page<Listing> getNewListings(UUID userId, int days, Pageable pageable) {
        List<SavedArea> savedAreas = savedAreaRepository.findByUserIdOrderByCreatedAtDesc(userId);
        if (savedAreas.isEmpty()) {
            return Page.empty(pageable);
        }

        List<String> areaKeys = savedAreas.stream()
                .map(SavedArea::getAreaKey)
                .toList();

        OffsetDateTime cutoff = OffsetDateTime.now().minusDays(days);
        return insightsRepository.findNewListingsInAreas(areaKeys, cutoff, pageable);
    }

    /**
     * Deterministic recommendations based on undervaluation score.
     * If user has saved areas, returns recommendations filtered to those areas.
     * If no saved areas, returns general recommendations (all areas).
     * No AI calls. No randomness.
     * Uses batch query to eliminate N+1 pattern (2 queries total instead of 1+N).
     */
    public Page<OpportunityProjection> getRecommendations(UUID userId, Pageable pageable) {
        List<SavedArea> savedAreas = savedAreaRepository.findByUserIdOrderByCreatedAtDesc(userId);

        if (savedAreas.isEmpty()) {
            // General recommendations across all areas (null = no area filter)
            return listingRepository.findOpportunitiesByAreaKeys(
                    null, RECOMMENDATION_THRESHOLD, RECOMMENDATION_FRESH_DAYS, pageable);
        }

        // Batch fetch opportunities for all saved areas in a single query
        List<String> areaKeys = savedAreas.stream()
                .map(SavedArea::getAreaKey)
                .toList();

        return listingRepository.findOpportunitiesByAreaKeys(
                areaKeys, RECOMMENDATION_THRESHOLD, RECOMMENDATION_FRESH_DAYS, pageable);
    }

    /**
     * Checks that the given user has active insights access.
     * Reads profiles.insights_access_until via the JDBC service-account connection (bypasses RLS).
     *
     * @throws InsightsAccessExpiredException if access is null or expired
     */
    public void checkInsightsAccess(UUID userId) {
        List<OffsetDateTime> results = jdbcTemplate.query(
                "SELECT insights_access_until FROM public.profiles WHERE user_id = ?",
                (rs, rowNum) -> rs.getObject("insights_access_until", OffsetDateTime.class),
                userId);

        // No profile row → no access
        OffsetDateTime accessUntil = results.isEmpty() ? null : results.get(0);

        if (accessUntil == null || accessUntil.isBefore(OffsetDateTime.now())) {
            throw new InsightsAccessExpiredException(accessUntil);
        }
    }

    // ===== Exception =====

    public static class InsightsAccessExpiredException extends RuntimeException {
        private final OffsetDateTime expiresAt;

        public InsightsAccessExpiredException(OffsetDateTime expiresAt) {
            super("Insights access expired");
            this.expiresAt = expiresAt;
        }

        public OffsetDateTime getExpiresAt() {
            return expiresAt;
        }
    }
}

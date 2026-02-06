package com.example.realestate.dashboard;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * Dashboard API for querying pre-aggregated statistics.
 * All endpoints require JWT authentication (enforced via SecurityFilterChain).
 */
@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {

    private static final Logger log = LoggerFactory.getLogger(DashboardController.class);
    private static final BigDecimal PAISE_TO_RUPEES = new BigDecimal("100");
    private static final int DEFAULT_WEEKS = 52;
    private static final int MAX_WEEKS = 520; // ~10 years
    private static final int MAX_LIMIT = 200;

    private final AreaPriceWeeklyRepository areaPriceWeeklyRepository;
    private final AreaInsightsDao areaInsightsDao;

    public DashboardController(AreaPriceWeeklyRepository areaPriceWeeklyRepository,
                               AreaInsightsDao areaInsightsDao) {
        this.areaPriceWeeklyRepository = areaPriceWeeklyRepository;
        this.areaInsightsDao = areaInsightsDao;
    }

    @GetMapping("/areas/{areaKey}/price-history")
    public ResponseEntity<List<PriceHistoryResponse>> getPriceHistory(
            @PathVariable String areaKey,
            @RequestParam(name = "weeks", defaultValue = "52") int weeks) {

        int effectiveWeeks = Math.min(Math.max(weeks, 1), MAX_WEEKS);
        log.info("Fetching price history areaKey={} weeks={}", areaKey, effectiveWeeks);

        List<AreaPriceWeekly> data = areaPriceWeeklyRepository.findRecentByAreaKey(areaKey, effectiveWeeks);

        List<PriceHistoryResponse> response = data.stream()
                .map(this::toResponse)
                .toList();

        log.debug("Returning {} weeks of price history for areaKey={}", response.size(), areaKey);
        return ResponseEntity.ok(response);
    }

    private PriceHistoryResponse toResponse(AreaPriceWeekly entity) {
        return new PriceHistoryResponse(
                entity.getWeekStartDate(),
                entity.getListingCount(),
                paiseToRupees(entity.getMedianPricePerCentPaise()),
                paiseToRupees(entity.getP25PricePerCentPaise()),
                paiseToRupees(entity.getP75PricePerCentPaise())
        );
    }

    private BigDecimal paiseToRupees(Long paise) {
        if (paise == null) {
            return null;
        }
        return new BigDecimal(paise).divide(PAISE_TO_RUPEES, 2, RoundingMode.HALF_UP);
    }

    /**
     * Response DTO for price history endpoint.
     * Prices are in rupees (converted from paise stored in DB).
     */
    public record PriceHistoryResponse(
            LocalDate weekStartDate,
            int listingCount,
            BigDecimal medianPricePerCentRupees,
            BigDecimal p25PricePerCentRupees,
            BigDecimal p75PricePerCentRupees
    ) {
    }

    @GetMapping("/areas/insights")
    public ResponseEntity<List<AreaInsightsResponse>> getAreaInsights(
            @RequestParam(name = "sort", defaultValue = "median_desc") String sort,
            @RequestParam(name = "limit", defaultValue = "50") int limit,
            @RequestParam(name = "minCount", defaultValue = "5") int minCount) {

        if (!AreaInsightsDao.isValidSort(sort)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown sort: " + sort);
        }

        int effectiveLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
        int effectiveMinCount = Math.max(minCount, 0);

        log.info("Fetching area insights sort={} limit={} minCount={}", sort, effectiveLimit, effectiveMinCount);

        List<AreaInsightsResponse> response = areaInsightsDao.findInsights(sort, effectiveLimit, effectiveMinCount)
                .stream()
                .map(row -> new AreaInsightsResponse(
                        row.areaKey(),
                        row.listingCount(),
                        paiseToRupees(row.medianPricePerCentPaise()),
                        paiseToRupees(row.cityMedianPricePerCentPaise()),
                        row.priceIndex(),
                        row.updatedAt()
                ))
                .toList();

        log.debug("Returning {} area insights", response.size());
        return ResponseEntity.ok(response);
    }

    public record AreaInsightsResponse(
            String areaKey,
            int listingCount,
            BigDecimal medianPricePerCentRupees,
            BigDecimal cityMedianPricePerCentRupees,
            BigDecimal priceIndex,
            OffsetDateTime updatedAt
    ) {
    }
}

package com.example.realestate.dashboard;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
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

    private final AreaPriceWeeklyRepository areaPriceWeeklyRepository;

    public DashboardController(AreaPriceWeeklyRepository areaPriceWeeklyRepository) {
        this.areaPriceWeeklyRepository = areaPriceWeeklyRepository;
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
}

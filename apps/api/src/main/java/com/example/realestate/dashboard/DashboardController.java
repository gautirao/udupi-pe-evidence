package com.example.realestate.dashboard;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingRepository.OpportunityProjection;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
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
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

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
    private static final Pattern PROP_ID_PATTERN = Pattern.compile("(?i)^PROP[- ]?(\\d+)$");

    private final AreaPriceWeeklyRepository areaPriceWeeklyRepository;
    private final AreaInsightsDao areaInsightsDao;
    private final ListingRepository listingRepository;

    public DashboardController(AreaPriceWeeklyRepository areaPriceWeeklyRepository,
                               AreaInsightsDao areaInsightsDao,
                               ListingRepository listingRepository) {
        this.areaPriceWeeklyRepository = areaPriceWeeklyRepository;
        this.areaInsightsDao = areaInsightsDao;
        this.listingRepository = listingRepository;
    }

    @GetMapping("/areas/{areaKey}/price-history")
    public ResponseEntity<List<PriceHistoryResponse>> getPriceHistory(
            @PathVariable String areaKey,
            @RequestParam(name = "weeks", defaultValue = "52") int weeks) {

        int effectiveWeeks = Math.min(Math.max(weeks, 1), MAX_WEEKS);
        log.info("Fetching price history areaKey={} weeks={}", areaKey, effectiveWeeks);

        List<AreaPriceWeekly> data = areaPriceWeeklyRepository.findRecentByAreaKey(areaKey, "all", 0, effectiveWeeks);

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

    // ==================== Listing Search Endpoint ====================

    @GetMapping("/listings/search")
    public ResponseEntity<Page<SearchListingResponse>> searchListings(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String locality,
            @RequestParam(required = false) String propertyType,
            @RequestParam(required = false) Integer bedrooms,
            @PageableDefault(size = 50) Pageable pageable) {

        String effectiveQ = (q != null && !q.isBlank()) ? q.trim() : null;

        // PROP-XXXXX pattern detection: if query matches, look up by listing_number directly
        if (effectiveQ != null) {
            Matcher matcher = PROP_ID_PATTERN.matcher(effectiveQ);
            if (matcher.matches()) {
                try {
                    int listingNumber = Integer.parseInt(matcher.group(1));
                    var found = listingRepository.findByListingNumber(listingNumber);
                    if (found.isPresent()) {
                        Listing l = found.get();
                        Page<SearchListingResponse> result = new PageImpl<>(
                                List.of(toSearchListingResponse(l)));
                        log.info("PROP-ID search matched listingNumber={} listingId={}", listingNumber, l.getId());
                        return ResponseEntity.ok(result);
                    }
                    // No match for that number — fall through to FTS
                    log.debug("PROP-ID search no match for listingNumber={}, falling through to FTS", listingNumber);
                } catch (NumberFormatException e) {
                    // Number too large or invalid — fall through to FTS
                    log.debug("PROP-ID pattern matched but number parse failed q={}, falling through to FTS", effectiveQ);
                }
            }
        }

        // Strip any Sort from the Pageable: the native SQL already owns ORDER BY.
        // Passing a sorted Pageable to a native query causes a duplicate ORDER BY crash in PostgreSQL.
        Pageable unsorted = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());

        log.info("GET /api/dashboard/listings/search q={} locality={} propertyType={} bedrooms={} page={} size={}",
                effectiveQ, locality, propertyType, bedrooms,
                unsorted.getPageNumber(), unsorted.getPageSize());

        Page<SearchListingResponse> response = listingRepository
                .findBySearch(effectiveQ, locality, propertyType, bedrooms, unsorted)
                .map(this::toSearchListingResponse);

        return ResponseEntity.ok(response);
    }

    private SearchListingResponse toSearchListingResponse(Listing l) {
        return new SearchListingResponse(
                l.getId(),
                l.getListingNumber(),
                l.getDisplayId(),
                l.getTitle(),
                l.getLocality(),
                l.getPropertyType(),
                l.getBedrooms(),
                paiseToRupees(l.getPricePaise()),
                l.getAreaKey(),
                l.getAreaLabel(),
                l.getLatitude(),
                l.getLongitude(),
                l.getCreatedAt());
    }

    // ==================== Map Listings Endpoint ====================

    @GetMapping("/map/listings")
    public ResponseEntity<?> getMapListings(
            @RequestParam double minLat,
            @RequestParam double minLng,
            @RequestParam double maxLat,
            @RequestParam double maxLng,
            @RequestParam(required = false) BigDecimal minPpc,
            @RequestParam(required = false) BigDecimal maxPpc,
            @RequestParam(name = "freshDays", defaultValue = "7") int freshDays,
            @PageableDefault(size = 200) Pageable pageable) {

        if (minLat > maxLat || minLng > maxLng) {
            return ResponseEntity.badRequest().body("Invalid bounding box: min must be <= max");
        }

        Long minPpcPaise = minPpc != null ? minPpc.multiply(PAISE_TO_RUPEES).longValue() : null;
        Long maxPpcPaise = maxPpc != null ? maxPpc.multiply(PAISE_TO_RUPEES).longValue() : null;

        OffsetDateTime createdAfter = freshDays > 0
                ? OffsetDateTime.now().minusDays(freshDays)
                : null;

        // Strip any Sort — native SQL owns ORDER BY (created_at DESC).
        Pageable unsorted = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());

        log.info("Map listings query bbox=[{},{} -> {},{}] ppc=[{},{}] freshDays={} page={} size={}",
                minLat, minLng, maxLat, maxLng, minPpcPaise, maxPpcPaise, freshDays,
                unsorted.getPageNumber(), unsorted.getPageSize());

        Page<Listing> listings = listingRepository.findInBoundingBox(
                minLat, minLng, maxLat, maxLng,
                minPpcPaise, maxPpcPaise,
                createdAfter, unsorted);

        Page<MapListingResponse> response = listings.map(this::toMapListingResponse);

        log.debug("Returning {} map listings (page {} of {})",
                response.getNumberOfElements(), response.getNumber() + 1, response.getTotalPages());
        return ResponseEntity.ok(response);
    }

    private MapListingResponse toMapListingResponse(Listing listing) {
        return new MapListingResponse(
                listing.getId(),
                listing.getListingNumber(),
                listing.getDisplayId(),
                listing.getDescription(),
                paiseToRupees(listing.getPricePaise()),
                paiseToRupees(listing.getPricePerCentPaise()),
                listing.getAreaKey(),
                listing.getAreaLabel(),
                listing.getLatitude(),
                listing.getLongitude(),
                listing.getCreatedAt());
    }

    // ==================== Area Insights Endpoint ====================

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

        List<AreaInsightsResponse> response = areaInsightsDao.findInsights(sort, effectiveLimit, effectiveMinCount, "all", 0)
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

    public record MapListingResponse(
            UUID id,
            Integer listingNumber,
            String displayId,
            String title,
            BigDecimal priceRupees,
            BigDecimal pricePerCentRupees,
            String areaKey,
            String areaLabel,
            Double latitude,
            Double longitude,
            OffsetDateTime createdAt
    ) {
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

    public record SearchListingResponse(
            UUID id,
            Integer listingNumber,
            String displayId,
            String title,
            String locality,
            String propertyType,
            Integer bedrooms,
            BigDecimal priceRupees,
            String areaKey,
            String areaLabel,
            Double latitude,
            Double longitude,
            OffsetDateTime createdAt
    ) {
    }

    // ==================== Opportunity Finder ====================

    @GetMapping("/opportunities")
    public ResponseEntity<?> getOpportunities(
            @RequestParam(name = "areaKey", required = false) String areaKey,
            @RequestParam(name = "threshold", defaultValue = "0.80") double threshold,
            @RequestParam(name = "limit", defaultValue = "50") int limit,
            @RequestParam(name = "freshDays", defaultValue = "14") int freshDays) {

        if (threshold < 0.1 || threshold > 1.0) {
            return ResponseEntity.badRequest()
                    .body(Map.of("error", "threshold must be between 0.1 and 1.0"));
        }

        int effectiveLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);

        log.info("Fetching opportunities areaKey={} threshold={} limit={} freshDays={}",
                areaKey, threshold, effectiveLimit, freshDays);

        List<OpportunityProjection> data = listingRepository.findOpportunities(
                areaKey, threshold, freshDays, effectiveLimit);

        List<OpportunityResponse> response = data.stream()
                .map(this::toOpportunityResponse)
                .toList();

        log.debug("Returning {} opportunities", response.size());
        return ResponseEntity.ok(response);
    }

    private OpportunityResponse toOpportunityResponse(OpportunityProjection p) {
        return new OpportunityResponse(
                p.getId(),
                computeTitle(p.getPropertyType(), p.getLocality(), p.getAreaLabel()),
                p.getPropertyType(),
                paiseToRupees(p.getPricePaise()),
                paiseToRupees(p.getPricePerCentPaise()),
                p.getAreaCent(),
                p.getAreaKey(),
                p.getAreaLabel(),
                p.getLatitude(),
                p.getLongitude(),
                p.getCreatedAt(),
                paiseToRupees(p.getMedianPricePerCentPaise()),
                p.getUndervaluationScore()
        );
    }

    private String computeTitle(String propertyType, String locality, String areaLabel) {
        String location = locality != null ? locality : areaLabel;
        if (location == null) {
            return null;
        }
        if (propertyType == null || propertyType.isEmpty()) {
            return "Property in " + location;
        }
        return propertyType.substring(0, 1).toUpperCase() + propertyType.substring(1) + " in " + location;
    }

    /**
     * Response DTO for opportunity finder endpoint.
     * Prices are in rupees (converted from paise stored in DB).
     */
    public record OpportunityResponse(
            UUID id,
            String title,
            String propertyType,
            BigDecimal priceRupees,
            BigDecimal pricePerCentRupees,
            BigDecimal areaCent,
            String areaKey,
            String areaLabel,
            Double lat,
            Double lng,
            OffsetDateTime createdAt,
            BigDecimal areaMedianPricePerCentRupees,
            Double undervaluationScore
    ) {
    }
}

package com.example.realestate.discover;

import com.example.realestate.geo.GeoCoarsener;
import com.example.realestate.listing.api.ListingResponse;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Service for GET /api/discover/listings.
 *
 * <p>Uses {@link DiscoverListingPredicateBuilder} to build the shared WHERE fragment so that
 * the result set is structurally identical to what {@link DiscoverMarkersService} would return
 * for the same filters.
 */
@Service
public class DiscoverListingsService implements DiscoverListingsPort {

    private static final Logger log = LoggerFactory.getLogger(DiscoverListingsService.class);

    /** Days within which back_to_market_at is considered "back on market". */
    private static final int BACK_ON_MARKET_WINDOW_DAYS = 30;

    private static final String METRIC_NAME = "discover.listings.query.latency.seconds";
    private static final String[] QUERY_PATHS    = {"bbox", "radius", "search", "radius_search"};
    private static final String[] RESULT_STATUSES = {"success", "empty", "error", "malformed_fts"};

    private final JdbcOperations jdbc;
    private final MeterRegistry meterRegistry;
    /** Pre-registered timers keyed by "queryPath:resultStatus" to avoid per-request builder allocation. */
    private final Map<String, Timer> timers;

    public DiscoverListingsService(JdbcOperations jdbc, MeterRegistry meterRegistry) {
        this.jdbc = jdbc;
        this.meterRegistry = meterRegistry;
        this.timers = buildTimers(meterRegistry);
    }

    private static Map<String, Timer> buildTimers(MeterRegistry registry) {
        Map<String, Timer> map = new java.util.HashMap<>();
        for (String queryPath : QUERY_PATHS) {
            for (String resultStatus : RESULT_STATUSES) {
                String key = queryPath + ":" + resultStatus;
                map.put(key, Timer.builder(METRIC_NAME)
                        .tag("query_path", queryPath)
                        .tag("result_status", resultStatus)
                        .publishPercentileHistogram(true)
                        .register(registry));
            }
        }
        return Map.copyOf(map);
    }

    @Transactional(readOnly = true)
    public DiscoverListingsPage getListings(DiscoverListingsQuery query) {
        DiscoverListingPredicateBuilder.Filters filters = toFilters(query);
        DiscoverListingPredicateBuilder.Sql predicate = DiscoverListingPredicateBuilder.build(filters);

        String whereFragment = predicate.whereFragment();
        List<Object> baseParams = predicate.params();

        // Determine query_path tag from filter shape — enum-only, no user data in tags
        final String queryPath;
        boolean hasSchoolRadius = query.schoolLat() != null && query.schoolLon() != null && query.schoolRadiusKm() != null;
        boolean hasFts = query.q() != null && !query.q().isBlank();
        if (hasSchoolRadius && hasFts) {
            queryPath = "radius_search";
        } else if (hasSchoolRadius) {
            queryPath = "radius";
        } else if (hasFts) {
            queryPath = "search";
        } else {
            queryPath = "bbox";
        }

        Timer.Sample sample = Timer.start(meterRegistry);
        String resultStatus = "success";
        try {
            // COUNT query — same WHERE, no pagination
            String countSql = "SELECT COUNT(*) FROM property_listings pl WHERE " + whereFragment;
            Long total = jdbc.queryForObject(countSql, Long.class, baseParams.toArray());
            long totalElements = total != null ? total : 0L;

            int effectiveSize = query.size();
            int totalPages = effectiveSize > 0 ? (int) Math.ceil((double) totalElements / effectiveSize) : 0;

            // Main SELECT with lateral hero-image subquery
            String selectSql = """
                    SELECT
                        pl.id,
                        pl.listing_number,
                        pl.property_type,
                        pl.title,
                        pl.locality,
                        pl.area_key,
                        pl.price_paise,
                        pl.land_area,
                        pl.land_area_unit,
                        pl.built_area,
                        pl.built_area_unit,
                        pl.bedrooms,
                        pl.latitude,
                        pl.longitude,
                        (SELECT li.url
                         FROM listing_images li
                         WHERE li.listing_id = pl.id
                         ORDER BY li.position ASC, li.id ASC
                         LIMIT 1) AS hero_image_url,
                        pl.created_at,
                        pl.updated_at,
                        pl.first_published_at,
                        pl.last_updated_at,
                        pl.back_to_market_at,
                        pl.rera_number,
                        pl.trust_tier,
                        pl.possession_status,
                        pl.seller_type,
                        pl.listing_purpose,
                        pl.status
                    FROM property_listings pl
                    WHERE \s""" + whereFragment + """

                    ORDER BY pl.created_at DESC
                    LIMIT ? OFFSET ?
                    """;

            List<Object> pageParams = new ArrayList<>(baseParams);
            pageParams.add(effectiveSize);
            pageParams.add((long) query.page() * effectiveSize);

            List<DiscoverListingResponse> content = jdbc.query(selectSql, (rs, rowNum) -> {
                Timestamp createdTs = rs.getTimestamp("created_at");
                Timestamp updatedTs = rs.getTimestamp("updated_at");
                Timestamp firstPublishedTs = rs.getTimestamp("first_published_at");
                Timestamp lastUpdatedTs = rs.getTimestamp("last_updated_at");
                Timestamp backToMarketTs = rs.getTimestamp("back_to_market_at");

                OffsetDateTime createdAt = toOffsetDateTime(createdTs);
                OffsetDateTime updatedAt = toOffsetDateTime(updatedTs);
                OffsetDateTime firstPublishedAt = toOffsetDateTime(firstPublishedTs);
                OffsetDateTime lastUpdatedAt = toOffsetDateTime(lastUpdatedTs);

                // daysOnMarket: days since first publish; fall back to createdAt
                LocalDate referenceDate = firstPublishedAt != null
                        ? firstPublishedAt.toLocalDate()
                        : (createdAt != null ? createdAt.toLocalDate() : LocalDate.now());
                int daysOnMarket = (int) ChronoUnit.DAYS.between(referenceDate, LocalDate.now());

                // backOnMarket: back_to_market_at within the last 30 days
                OffsetDateTime backToMarketAt = toOffsetDateTime(backToMarketTs);
                boolean backOnMarket = backToMarketAt != null
                        && backToMarketAt.isAfter(OffsetDateTime.now().minusDays(BACK_ON_MARKET_WINDOW_DAYS));

                return buildListing(
                        rs.getString("id"),
                        rs.getString("listing_number"),
                        rs.getString("property_type"),
                        rs.getString("title"),
                        rs.getString("locality"),
                        rs.getString("area_key"),
                        rs.getObject("price_paise") != null ? rs.getLong("price_paise") : null,
                        rs.getObject("land_area") != null ? rs.getDouble("land_area") : null,
                        rs.getString("land_area_unit"),
                        rs.getObject("built_area") != null ? rs.getDouble("built_area") : null,
                        rs.getString("built_area_unit"),
                        rs.getObject("bedrooms") != null ? rs.getInt("bedrooms") : null,
                        rs.getObject("latitude") != null ? rs.getDouble("latitude") : null,
                        rs.getObject("longitude") != null ? rs.getDouble("longitude") : null,
                        rs.getString("hero_image_url"),
                        createdAt,
                        updatedAt,
                        firstPublishedAt,
                        lastUpdatedAt,
                        daysOnMarket,
                        backOnMarket,
                        rs.getString("rera_number"),
                        reraValidFrom(rs.getString("rera_number")),
                        rs.getString("trust_tier"),
                        rs.getString("possession_status"),
                        rs.getString("seller_type"),
                        rs.getString("listing_purpose"),
                        rs.getString("status")
                );
            }, pageParams.toArray());

            if (content.isEmpty()) {
                resultStatus = "empty";
            }

            DiscoverListingsAggregates aggregates = null;
            if (query.includeAggregates()) {
                aggregates = buildAggregates(whereFragment, baseParams);
            }

            log.debug("getListings city={} page={} size={} total={}", query.city(), query.page(), effectiveSize, totalElements);
            return new DiscoverListingsPage(content, query.page(), effectiveSize, totalElements, totalPages, aggregates);
        } catch (DataAccessException ex) {
            if (hasFts && isFtsSyntaxError(ex)) {
                resultStatus = "malformed_fts";
            } else {
                resultStatus = "error";
            }
            throw ex;
        } finally {
            sample.stop(timers.get(queryPath + ":" + resultStatus));
        }
    }

    /**
     * Returns true when a DataAccessException looks like a PostgreSQL FTS syntax error.
     * Checks both the exception message and the root-cause message because Spring wraps
     * the underlying {@link java.sql.SQLException} message inside its own message text
     * (e.g. {@code BadSqlGrammarException} prepends the task string before the SQL text).
     */
    private static boolean isFtsSyntaxError(DataAccessException ex) {
        if (containsFtsKeyword(ex.getMessage())) return true;
        Throwable cause = ex.getCause();
        return cause != null && containsFtsKeyword(cause.getMessage());
    }

    private static boolean containsFtsKeyword(String message) {
        return message != null && message.contains("tsquery");
    }

    private DiscoverListingsAggregates buildAggregates(String whereFragment, List<Object> baseParams) {
        String aggSql = """
                SELECT pl.locality, COUNT(*) AS cnt
                FROM property_listings pl
                WHERE \s""" + whereFragment + """

                GROUP BY pl.locality
                ORDER BY cnt DESC
                LIMIT 6
                """;

        List<DiscoverListingsAggregates.LocalityCount> topLocalities = jdbc.query(
                aggSql,
                (rs, rowNum) -> new DiscoverListingsAggregates.LocalityCount(
                        rs.getString("locality"),
                        rs.getInt("cnt")
                ),
                baseParams.toArray()
        );

        return new DiscoverListingsAggregates(topLocalities);
    }

    /**
     * Shared DTO-construction funnel for {@link DiscoverListingResponse} (#1726). Used by both
     * this Postgres row-mapper and {@code OpenSearchHitMapper.toListing} so the dormant
     * {@code discover.opensearch.enabled} path cannot reintroduce the exact-pin leak if ever
     * turned on — both backends for GET /api/discover/listings apply the same coarsening.
     */
    @SuppressWarnings("java:S107") // mirrors the DiscoverListingResponse record's field count
    public static DiscoverListingResponse buildListing(
            String id, String listingNumber, String propertyType, String title, String locality,
            String areaKey, Long pricePaise, Double landArea, String landAreaUnit,
            Double builtArea, String builtAreaUnit, Integer bedrooms, Double latitude, Double longitude,
            String heroImageUrl, OffsetDateTime createdAt, OffsetDateTime updatedAt,
            OffsetDateTime firstPublishedAt, OffsetDateTime lastUpdatedAt, int daysOnMarket,
            boolean backOnMarket, String reraNumber, boolean reraValid, String trustTier,
            String possessionStatus, String sellerType, String listingPurpose, String status) {
        return new DiscoverListingResponse(
                id, listingNumber, propertyType, title, locality, areaKey, pricePaise,
                landArea, landAreaUnit, builtArea, builtAreaUnit, bedrooms,
                GeoCoarsener.coarsen(latitude), GeoCoarsener.coarsen(longitude),
                heroImageUrl, createdAt, updatedAt, firstPublishedAt, lastUpdatedAt,
                daysOnMarket, backOnMarket, reraNumber, reraValid, trustTier,
                possessionStatus, sellerType, listingPurpose, status);
    }

    private static boolean reraValidFrom(String reraNumber) {
        return reraNumber != null && ListingResponse.RERA_PATTERN.matcher(reraNumber).matches();
    }

    private static OffsetDateTime toOffsetDateTime(Timestamp ts) {
        if (ts == null) return null;
        return ts.toInstant().atOffset(ZoneOffset.UTC);
    }

    /** Converts the query record into a Filters record for the predicate builder. */
    static DiscoverListingPredicateBuilder.Filters toFilters(DiscoverListingsQuery q) {
        return new DiscoverListingPredicateBuilder.Filters(
                q.city(),
                q.propertyTypes(),
                q.priceMinPaise(),
                q.priceMaxPaise(),
                q.dateFrom(),
                q.dateTo(),
                q.bedrooms(),
                q.sellerTypes(),
                q.backOnMarket(),
                q.newToMarket(),
                q.reraRegistered(),
                q.readyToMove(),
                q.polygon(),
                q.schoolLat(),
                q.schoolLon(),
                q.schoolRadiusKm(),
                q.bbox(),
                q.q(),
                q.listingPurpose(),
                null,      // excludePropertyTypes — listings path does not apply type exclusion
                q.areaKeys()
        );
    }
}

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

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
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
                        pl.last_confirmed_at,
                        pl.back_to_market_at,
                        pl.rera_number,
                        pl.trust_tier,
                        pl.possession_status,
                        pl.seller_type,
                        pl.listing_purpose,
                        pl.status,
                        lcsd.commercial_subtype,
                        -- #2433 Commercial summary facts. Explicit allowlist; NOT a
                        -- SELECT * of the commercial columns. See DiscoverCommercialFacts
                        -- for what is deliberately excluded (ROI, lease, power, approvals).
                        pl.floor_choice,
                        pl.floor_mode,
                        pl.hub_type,
                        pl.office_seats,
                        pl.occupancy_status,
                        pl.warehouse_clear_height_ft,
                        pl.warehouse_loading_bays,
                        pl.commercial_zoning,
                        lcsd.floor_number,
                        -- Coalesced across the per-family V102 projections. A listing is
                        -- keyed into at most ONE of these tables (each PK is listing_id and
                        -- V102 backfilled them by property_type), so this cannot merge two
                        -- listings' values — it selects whichever single projection exists.
                        COALESCE(lcsd.total_floors, lcbd.total_floors, lwd.total_floors)
                            AS total_floors,
                        COALESCE(lcsd.road_frontage_ft, lcbd.road_frontage_ft,
                                 lwd.road_frontage_ft, lcld.road_frontage_ft)
                            AS road_frontage_ft
                    FROM property_listings pl
                    -- #2431: LEFT JOIN, not a correlated subselect, because the FROM clause of
                    -- THIS query is ours to shape. listing_id is the PK of the projection table,
                    -- so the join is 1:0..1 and cannot duplicate a listing row or change the
                    -- page's cardinality. LEFT (not INNER) keeps non-commercial listings — and
                    -- legacy commercial rows that have no projection row — in the result with a
                    -- NULL subtype. The shared WHERE fragment still references only `pl`, so
                    -- adding this join does not alter which rows match.
                    LEFT JOIN listing_commercial_space_details lcsd ON lcsd.listing_id = pl.id
                    -- #2433: the same 1:0..1 PK join argument as #2431's above applies to
                    -- each of these. They carry the Building / Warehouse / Commercial-Land
                    -- facts that listing_commercial_space_details does not hold, and LEFT
                    -- keeps every non-matching listing in the page with NULL facts.
                    LEFT JOIN listing_commercial_building_details lcbd ON lcbd.listing_id = pl.id
                    LEFT JOIN listing_warehouse_details lwd ON lwd.listing_id = pl.id
                    LEFT JOIN listing_commercial_land_details lcld ON lcld.listing_id = pl.id
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
                Timestamp confirmedTs = rs.getTimestamp("last_confirmed_at");
                Timestamp backToMarketTs = rs.getTimestamp("back_to_market_at");

                OffsetDateTime createdAt = toOffsetDateTime(createdTs);
                OffsetDateTime updatedAt = toOffsetDateTime(updatedTs);
                OffsetDateTime firstPublishedAt = toOffsetDateTime(firstPublishedTs);
                OffsetDateTime lastUpdatedAt = toOffsetDateTime(lastUpdatedTs);
                OffsetDateTime confirmedAt = toOffsetDateTime(confirmedTs);

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
                        confirmedAt,
                        daysOnMarket,
                        backOnMarket,
                        rs.getString("rera_number"),
                        reraValidFrom(rs.getString("rera_number")),
                        rs.getString("trust_tier"),
                        rs.getString("possession_status"),
                        rs.getString("seller_type"),
                        rs.getString("listing_purpose"),
                        rs.getString("status"),
                        rs.getString("commercial_subtype"),
                        // getObject(..., Class) — NOT getInt/getDouble, which return 0.0
                        // for a SQL NULL and would turn "no seats recorded" into
                        // "0 seats", fabricating a fact the row does not carry.
                        // The two `numeric` columns go through nullableDouble() instead:
                        // pgjdbc REJECTS getObject(col, Double.class) on a numeric column
                        // ("conversion to class java.lang.Double from numeric not
                        // supported") — see nullableDouble's javadoc.
                        DiscoverCommercialFacts.orNullIfEmpty(new DiscoverCommercialFacts(
                                rs.getString("floor_choice"),
                                rs.getString("floor_mode"),
                                rs.getObject("floor_number", Integer.class),
                                rs.getObject("total_floors", Integer.class),
                                rs.getString("hub_type"),
                                rs.getObject("office_seats", Integer.class),
                                rs.getString("occupancy_status"),
                                nullableDouble(rs, "warehouse_clear_height_ft"),
                                rs.getObject("warehouse_loading_bays", Integer.class),
                                nullableDouble(rs, "road_frontage_ft"),
                                rs.getString("commercial_zoning")))
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
            return new DiscoverListingsPage(content, query.page(), effectiveSize, totalElements, totalPages, aggregates, query.scopeFingerprint());
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
    /**
     * Reads a nullable SQL {@code numeric} column as a {@link Double}, preserving SQL NULL
     * as Java {@code null}.
     *
     * <p>{@code rs.getObject(col, Double.class)} is NOT usable here. pgjdbc's
     * {@code PgResultSet.getObject(String, Class)} has no numeric-to-Double conversion and
     * throws {@code PSQLException: conversion to class java.lang.Double from numeric not
     * supported} on the FIRST row it reaches, aborting the whole query. That is how #2433's
     * first cut of this projection turned every authenticated {@code GET
     * /api/discover/listings} into a 500 — {@code warehouse_clear_height_ft} (V104) and
     * {@code road_frontage_ft} (V32 / V102) are both {@code numeric}, not {@code float8}.
     *
     * <p>{@code BigDecimal.class} IS supported for numeric, so read that and narrow. The
     * null check is what keeps "no clear height recorded" from becoming "0.0 ft" — the same
     * discipline the {@code Integer} columns get from {@code getObject(..., Integer.class)}.
     */
    private static Double nullableDouble(ResultSet rs, String column) throws SQLException {
        BigDecimal value = rs.getObject(column, BigDecimal.class);
        return value == null ? null : value.doubleValue();
    }

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
     * Shared DTO-construction funnel for {@link DiscoverListingResponse} (#1726/#1567). Used by
     * both this Postgres row-mapper and {@code OpenSearchHitMapper.toListing} so the dormant
     * {@code discover.opensearch.enabled} path cannot reintroduce the exact-pin leak (or a raw
     * trust-tier leak) if ever turned on — both backends for GET /api/discover/listings apply
     * the same coarsening and the same public trust-badge projection.
     *
     * @param rawTrustTier internal trust tier letter grade (A/B/C/D) as stored in the DB or
     *                     OpenSearch index; projected to a public badge word via
     *                     {@link TrustBadge#publicBadge(String)} before it ever leaves the server
     */
    @SuppressWarnings("java:S107") // mirrors the DiscoverListingResponse record's field count
    public static DiscoverListingResponse buildListing(
            String id, String listingNumber, String propertyType, String title, String locality,
            String areaKey, Long pricePaise, Double landArea, String landAreaUnit,
            Double builtArea, String builtAreaUnit, Integer bedrooms, Double latitude, Double longitude,
            String heroImageUrl, OffsetDateTime createdAt, OffsetDateTime updatedAt,
            OffsetDateTime firstPublishedAt, OffsetDateTime lastUpdatedAt, OffsetDateTime confirmedAt,
            int daysOnMarket,
            boolean backOnMarket, String reraNumber, boolean reraValid, String rawTrustTier,
            String possessionStatus, String sellerType, String listingPurpose, String status,
            String commercialSubtype, DiscoverCommercialFacts commercialFacts) {
        // Normalised ONCE and reused by both consumers below. See the commit that
        // introduced this local for why the two must not be independently computed.
        String normalisedSubtype = normalizeCommercialSubtype(commercialSubtype);
        return new DiscoverListingResponse(
                id, listingNumber, propertyType, title, locality, areaKey, pricePaise,
                landArea, landAreaUnit, builtArea, builtAreaUnit, bedrooms,
                GeoCoarsener.coarsen(latitude), GeoCoarsener.coarsen(longitude),
                heroImageUrl, createdAt, updatedAt, firstPublishedAt, lastUpdatedAt, confirmedAt,
                daysOnMarket, backOnMarket, reraNumber, reraValid, TrustBadge.publicBadge(rawTrustTier),
                possessionStatus, sellerType, listingPurpose, status,
                normalisedSubtype,
                // #2458 — the resolved taxonomy value. #2433's fact payload follows it and
                // carries no taxonomy decision of its own; see DiscoverListingResponse.
                resolveBuyerCommercialSubtype(propertyType, normalisedSubtype),
                DiscoverCommercialFacts.orNullIfEmpty(commercialFacts));
    }

    /**
     * Resolves the two raw storage axes to the single buyer peer (#2458) -- the server half of the
     * contract whose client half is {@code resolveBuyerCommercialSubtype} in
     * {@code propertyTypeConfig.ts}. The two are held in step by the cross-language mapping parity
     * test; they are two implementations of ONE mapping, which is unavoidable across the boundary
     * and therefore pinned rather than trusted.
     *
     * <p>Computed in the SHARED funnel, so the Postgres row-mapper and {@code OpenSearchHitMapper}
     * cannot emit different peers for the same listing -- the identical reason
     * {@code normalizeCommercialSubtype} and {@code TrustBadge.publicBadge} live here.
     *
     * <p><b>Adds no join and touches no new table.</b> Both inputs are already in hand at this
     * point, so this projection cannot be filtered away by a grant or row-level policy on the
     * commercial detail tables -- a hazard that matters because {@code V128} revokes grants on
     * exactly those tables, and a join that eliminates the outer row fails as an empty 200 rather
     * than as a SQL error.
     *
     * <p>Self-describing property types are consulted FIRST, which is what keeps legacy
     * Building/Warehouse/Land rows resolvable: V102 backfilled
     * {@code listing_commercial_space_details} only for {@code property_type = 'commercial'}, so
     * those rows have no subtype on any axis to consult.
     */
    public static String resolveBuyerCommercialSubtype(String propertyType, String normalisedSubtype) {
        if (propertyType == null) {
            return null;
        }
        String type = propertyType.trim().toLowerCase(Locale.ROOT);
        switch (type) {
            case "commercial_building":
                return "BUILDING";
            case "warehouse":
                return "WAREHOUSE";
            case "commercial_land":
                return "LAND";
            case "commercial":
                // The ONLY ambiguous type, and only between SHOP and OFFICE. A legacy row whose
                // subtype was never recorded stays null -- honest absence, never inferred.
                return ("SHOP".equals(normalisedSubtype) || "OFFICE".equals(normalisedSubtype))
                        ? normalisedSubtype : null;
            default:
                return null;
        }
    }

    /**
     * Canonicalises the stored subtype to UPPER case, and maps blank to {@code null} (#2431).
     *
     * <p>Applied in the SHARED funnel so the Postgres row-mapper and {@code OpenSearchHitMapper}
     * cannot emit different spellings of the same subtype for the same listing — the identical
     * reason {@code TrustBadge.publicBadge} and {@code GeoCoarsener.coarsen} live here rather than
     * at each call site. The column carries no CHECK constraint (V102 L82-92), so a lower-case or
     * whitespace-only value is representable even though the write path never produces one; this
     * is the read-side counterpart of the {@code UPPER()} in the predicate builder.
     */
    private static String normalizeCommercialSubtype(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        return raw.trim().toUpperCase(Locale.ROOT);
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
                q.commercialSubtypes(),
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
                // #2461/#2475: a committed POLYGON or VIEWPORT must exclude agricultural_land
                // from the shopper-visible result set so cards+count converge with markers
                // (#1463) and relaxation (#2457). ResultScopeExclusivity guarantees polygon and
                // viewportScope cannot both be set, and neither can coexist with areaKeys, so
                // this cannot leak into AREA_SET. Signed-in VIEWPORT is served by this service,
                // while anonymous VIEWPORT is served by CityAreaListingsService's bbox-only path,
                // which already excludes the same type unconditionally — the two audiences must
                // agree because RelaxationPreviewsService publishes ONE public cached preview
                // (#2475). AREA_SET is excluded independently via CityAreaListingsService itself.
                q.polygon() != null || q.viewportScope() != null
                        ? CityAreaListingsService.AREA_FIRST_EXCLUDED_PROPERTY_TYPES : null,
                q.areaKeys(),
                q.viewportScope(),
                q.areaMinSqft(),
                q.areaMaxSqft()
        );
    }
}

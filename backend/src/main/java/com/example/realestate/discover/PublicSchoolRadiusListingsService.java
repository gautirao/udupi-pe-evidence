package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
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

/**
 * Service for GET /api/discover/cities/{city}/school-radius-listings.
 *
 * <p>Reuses {@link DiscoverListingPredicateBuilder} unchanged to build the WHERE fragment.
 * Filters are city + school coordinates/radius only; all other filter fields are null so that
 * DRAFT/REJECTED/archived/null-geog listings are excluded by the builder's base predicate.
 *
 * <p>Returns only the 20 approved public fields (see {@link PublicSchoolRadiusListingCard}).
 * Uses size+1 probe pagination to determine {@code hasMore} without a COUNT query.
 */
@Service
public class PublicSchoolRadiusListingsService {

    private static final Logger log = LoggerFactory.getLogger(PublicSchoolRadiusListingsService.class);

    private static final int BACK_ON_MARKET_WINDOW_DAYS = 30;

    private final JdbcOperations jdbc;

    public PublicSchoolRadiusListingsService(JdbcOperations jdbc) {
        this.jdbc = jdbc;
    }

    @Transactional(readOnly = true)
    public PublicSchoolRadiusListingsPage getListings(
            String city,
            double schoolLat,
            double schoolLon,
            double schoolRadiusKm,
            int page,
            int size,
            String listingPurpose
    ) {
        // Normalise listingPurpose: blank → absent
        String normPurpose = (listingPurpose != null && !listingPurpose.isBlank())
                ? listingPurpose.trim() : null;

        // Build predicate: city + school proximity only; all other filters null.
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                city,
                null,   // propertyTypes
                null,   // priceMinPaise
                null,   // priceMaxPaise
                null,   // dateFrom
                null,   // dateTo
                null,   // bedrooms
                null,   // sellerTypes
                null,   // backOnMarket
                null,   // newToMarket
                null,   // reraRegistered
                null,   // readyToMove
                null,   // polygon
                schoolLat,
                schoolLon,
                schoolRadiusKm,
                null,   // bbox
                null,   // q
                normPurpose,
                List.of("AGRICULTURAL_LAND")  // excludePropertyTypes — school-first never shows agri
        );

        DiscoverListingPredicateBuilder.Sql predicate = DiscoverListingPredicateBuilder.build(filters);
        String whereFragment = predicate.whereFragment();
        List<Object> baseParams = predicate.params();

        // size+1 probe to determine hasMore without a COUNT query
        int probeSize = size + 1;

        // SELECT only the 20 approved public columns — never SELECT *
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
                    pl.listing_purpose,
                    pl.possession_status,
                    pl.created_at,
                    pl.first_published_at,
                    pl.back_to_market_at
                FROM property_listings pl
                WHERE \s""" + whereFragment + """

                ORDER BY pl.created_at DESC
                LIMIT ? OFFSET ?
                """;

        List<Object> pageParams = new ArrayList<>(baseParams);
        pageParams.add(probeSize);
        pageParams.add((long) page * size);

        List<PublicSchoolRadiusListingCard> probeResults = jdbc.query(selectSql, (rs, rowNum) -> {
            Timestamp createdTs = rs.getTimestamp("created_at");
            Timestamp firstPublishedTs = rs.getTimestamp("first_published_at");
            Timestamp backToMarketTs = rs.getTimestamp("back_to_market_at");

            OffsetDateTime createdAt = toOffsetDateTime(createdTs);
            OffsetDateTime firstPublishedAt = toOffsetDateTime(firstPublishedTs);

            // daysOnMarket: days since first publish; fall back to createdAt
            LocalDate referenceDate = firstPublishedAt != null
                    ? firstPublishedAt.toLocalDate()
                    : (createdAt != null ? createdAt.toLocalDate() : LocalDate.now());
            int daysOnMarket = (int) ChronoUnit.DAYS.between(referenceDate, LocalDate.now());

            // backOnMarket: back_to_market_at within the last 30 days
            OffsetDateTime backToMarketAt = toOffsetDateTime(backToMarketTs);
            boolean backOnMarket = backToMarketAt != null
                    && backToMarketAt.isAfter(OffsetDateTime.now().minusDays(BACK_ON_MARKET_WINDOW_DAYS));

            return new PublicSchoolRadiusListingCard(
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
                    rs.getString("listing_purpose"),
                    rs.getString("possession_status"),
                    daysOnMarket,
                    backOnMarket,
                    createdAt
            );
        }, pageParams.toArray());

        boolean hasMore = probeResults.size() > size;
        List<PublicSchoolRadiusListingCard> content = hasMore
                ? probeResults.subList(0, size)
                : probeResults;

        log.debug("getSchoolRadiusListings city={} schoolLat={} schoolLon={} radiusKm={} page={} size={} results={}",
                city, schoolLat, schoolLon, schoolRadiusKm, page, size, content.size());

        return new PublicSchoolRadiusListingsPage(content, page, size, hasMore);
    }

    private static OffsetDateTime toOffsetDateTime(Timestamp ts) {
        if (ts == null) return null;
        return ts.toInstant().atOffset(ZoneOffset.UTC);
    }
}

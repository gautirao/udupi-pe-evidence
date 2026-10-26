package com.example.realestate.discover;

import com.example.realestate.ai.PropertyType;
import com.example.realestate.geo.GeoCoarsener;
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
import java.util.Locale;

/**
 * Service for GET /api/discover/cities/{city}/school-radius-listings.
 *
 * <p>Reuses {@link DiscoverListingPredicateBuilder} unchanged to build the WHERE fragment.
 * Filters are city + school coordinates/radius only; all other filter fields are null so that
 * DRAFT/REJECTED/archived/null-geog listings are excluded by the builder's base predicate.
 *
 * <p>Returns the approved public fields (see {@link PublicSchoolRadiusListingCard}), including
 * the #2516 allowlisted Commercial {@code commercialSubtype}/{@code commercialFacts} pair —
 * this was, until now, the one Discover read path that carried neither (the City/Area feed's
 * {@code AreaListingCard} got them in #2433/#2586). Read through the same
 * {@link CommercialFactAuthority#readFrom} the other two feeds use, so a Commercial listing
 * cannot report different facts depending on which of the three journeys reached it.
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
        return getListings(city, schoolLat, schoolLon, schoolRadiusKm, page, size, listingPurpose, null);
    }

    @Transactional(readOnly = true)
    public PublicSchoolRadiusListingsPage getListings(
            String city,
            double schoolLat,
            double schoolLon,
            double schoolRadiusKm,
            int page,
            int size,
            String listingPurpose,
            DiscoverListingPredicateBuilder.Bbox areaBbox
    ) {
        // Normalise listingPurpose: blank → absent
        String normPurpose = (listingPurpose != null && !listingPurpose.isBlank())
                ? listingPurpose.trim() : null;

        // Build predicate: city + school proximity (+ optional server-derived Area bounds); all other filters null.
        DiscoverListingPredicateBuilder.Filters filters = new DiscoverListingPredicateBuilder.Filters(
                city,
                null,   // propertyTypes
                null,   // commercialSubtypes
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
                List.of(PropertyType.AGRICULTURAL_LAND.getValue()),  // excludePropertyTypes — school-first never shows agri
                null,   // areaKeys — school-radius path does not apply group filtering
                null,   // viewportScope — school-radius path does not apply a viewport scope
                null,   // areaMinSqft
                null,   // areaMaxSqft
                areaBbox // #2806 / #2767 server-derived Area bounds when schoolAreaKey is supplied
        );

        DiscoverListingPredicateBuilder.Sql predicate = DiscoverListingPredicateBuilder.build(filters);
        String whereFragment = predicate.whereFragment();
        List<Object> baseParams = predicate.params();

        // size+1 probe to determine hasMore without a COUNT query
        int probeSize = size + 1;

        // #2806: When areaBbox != null (Area-scoped public branch), order by distance from the
        // school first (then created_at DESC, id ASC) so that expanding 3 km -> 5 km -> 10 km
        // keeps closer listings ahead of farther listings even when >50 in-Area rows match.
        // Keep the unscoped public branch (areaBbox == null) on ORDER BY pl.created_at DESC.
        String orderByClause = areaBbox != null
                ? "ORDER BY ST_Distance(pl.geog, ST_MakePoint(?, ?)::geography) ASC, pl.created_at DESC, pl.id ASC"
                : "ORDER BY pl.created_at DESC";

        // SELECT only the approved public columns — never SELECT *. Beyond the original 20,
        // this now carries the #2516 allowlisted Commercial subtype + fact columns, read
        // through the CommercialFactAuthority.readFrom alias contract (identical alias set to
        // the City/Area and authenticated feeds — see CommercialFactAuthority for why the
        // three typed-projection joins and the V32 legacy fallbacks are both present).
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
                    pl.back_to_market_at,
                    lcsd.commercial_subtype,
                    -- #2516 Commercial summary facts — CommercialFactAuthority.readFrom's alias
                    -- contract. V104 flat columns straight off property_listings:
                    pl.floor_choice,
                    pl.floor_mode,
                    pl.hub_type,
                    pl.office_seats,
                    pl.occupancy_status,
                    pl.warehouse_clear_height_ft,
                    pl.warehouse_loading_bays,
                    pl.commercial_zoning,
                    -- V102 typed child, coalesced across the per-family projections (same
                    -- lcsd-first ordering rationale as CityAreaListingsService: lcsd is the
                    -- only one the write path keeps current; lcbd/lwd/lcld are V102 backfill
                    -- remnants). Each join is 1:0..1 on the projection table's listing_id PK.
                    lcsd.floor_number AS commercial_floor_number,
                    pl.floor_number AS legacy_floor_number,
                    COALESCE(lcsd.total_floors, lcbd.total_floors, lwd.total_floors) AS typed_total_floors,
                    pl.total_floors AS legacy_total_floors,
                    COALESCE(lcsd.road_frontage_ft, lcbd.road_frontage_ft,
                             lwd.road_frontage_ft, lcld.road_frontage_ft) AS typed_road_frontage_ft,
                    pl.road_frontage_ft AS legacy_road_frontage_ft
                FROM property_listings pl
                LEFT JOIN listing_commercial_space_details lcsd
                    ON lcsd.listing_id = pl.id
                LEFT JOIN listing_commercial_building_details lcbd
                    ON lcbd.listing_id = pl.id
                LEFT JOIN listing_warehouse_details lwd
                    ON lwd.listing_id = pl.id
                LEFT JOIN listing_commercial_land_details lcld
                    ON lcld.listing_id = pl.id
                WHERE \s""" + whereFragment + "\n\n                " + orderByClause + """

                LIMIT ? OFFSET ?
                """;

        List<Object> pageParams = new ArrayList<>(baseParams);
        if (areaBbox != null) {
            // ST_MakePoint(lon, lat) in ORDER BY
            pageParams.add(schoolLon);
            pageParams.add(schoolLat);
        }
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

            // This endpoint is anon-only: price_paise is never returned in the response.
            // Apply PriceBand coarsening. Null price_paise → priceBand null (omitted by NON_NULL).
            Long rawPricePaise = rs.getObject("price_paise") != null ? rs.getLong("price_paise") : null;

            // #2516 — the Commercial projection, decided ONCE per row, keyed on property_type
            // rather than on whether a subtype resolved (same rationale as the other two feeds:
            // a legacy `commercial` row with no recorded Shop-vs-Office is still Commercial).
            String propertyType = rs.getString("property_type");
            boolean isCommercial = CommercialFactAuthority.isCommercialFamily(propertyType);
            String rawSubtype = rs.getString("commercial_subtype");
            String commercialSubtype = (rawSubtype == null || rawSubtype.isBlank())
                    ? null : rawSubtype.trim().toUpperCase(Locale.ROOT);

            return new PublicSchoolRadiusListingCard(
                    rs.getString("id"),
                    rs.getString("listing_number"),
                    rs.getString("property_type"),
                    rs.getString("title"),
                    rs.getString("locality"),
                    rs.getString("area_key"),
                    PriceBand.of(rawPricePaise),
                    rs.getObject("land_area") != null ? rs.getDouble("land_area") : null,
                    rs.getString("land_area_unit"),
                    rs.getObject("built_area") != null ? rs.getDouble("built_area") : null,
                    rs.getString("built_area_unit"),
                    rs.getObject("bedrooms") != null ? rs.getInt("bedrooms") : null,
                    // #1726: this endpoint is anon-only (permitAll) — always coarsen.
                    GeoCoarsener.coarsen(rs.getObject("latitude") != null ? rs.getDouble("latitude") : null),
                    GeoCoarsener.coarsen(rs.getObject("longitude") != null ? rs.getDouble("longitude") : null),
                    rs.getString("hero_image_url"),
                    rs.getString("listing_purpose"),
                    rs.getString("possession_status"),
                    daysOnMarket,
                    backOnMarket,
                    createdAt,
                    commercialSubtype,
                    // #2506/#2516: the SAME reader the other two Discover feeds use, so this
                    // endpoint cannot report different facts for the same listing. Gated on
                    // the Commercial family for the same reason as CityAreaListingsService —
                    // an ungated call would give a Residential row a commercialFacts object.
                    isCommercial ? CommercialFactAuthority.readFrom(rs) : null
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

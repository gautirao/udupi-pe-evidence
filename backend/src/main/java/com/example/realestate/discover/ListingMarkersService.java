package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Service
public class ListingMarkersService {

    private static final Logger log = LoggerFactory.getLogger(ListingMarkersService.class);

    private final JdbcOperations jdbcOperations;

    public ListingMarkersService(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    public ListingMarkersResponse getMarkersForCity(String city) {
        log.debug("getMarkersForCity city={}", city);

        List<ListingMarker> markers = jdbcOperations.query(MARKERS_SQL,
                (rs, rowNum) -> new ListingMarker(
                        UUID.fromString(rs.getString("id")),
                        rs.getDouble("latitude"),
                        rs.getDouble("longitude"),
                        rs.getObject("price_paise") != null ? rs.getLong("price_paise") : null
                ),
                city);

        log.debug("getMarkersForCity city={} returned {} markers", city, markers.size());
        return new ListingMarkersResponse(city, markers);
    }

    private static final String MARKERS_SQL = """
            SELECT pl.id, pl.latitude, pl.longitude, pl.price_paise
            FROM property_listings pl
            JOIN areas a ON a.area_key = pl.area_key
            JOIN cities c ON c.id = a.city_id
            WHERE c.slug = ?
              AND pl.status IN ('SCRAPED', 'LIVE')
              AND pl.is_duplicate = false
              AND pl.latitude IS NOT NULL
              AND pl.longitude IS NOT NULL
            ORDER BY pl.created_at DESC
            """;
}

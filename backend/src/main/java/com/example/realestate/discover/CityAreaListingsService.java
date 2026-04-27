package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Service for GET /api/discover/cities/{city}/listings.
 *
 * <p>Validation:
 * <ul>
 *   <li>Unknown city slug → 400 {@code {"error":"unknown_city"}}</li>
 *   <li>Empty/absent areaKeys → 400 {@code {"error":"areaKeys_required"}} (enforced at controller)</li>
 *   <li>limitPerArea clamped server-side to min(requested, 20), default 5</li>
 * </ul>
 *
 * <p>Query strategy: one SQL round-trip per call using IN (...) on areaKeys.
 * For each areaKey not belonging to the city, the service produces an entry with
 * {@code unknown=true} and {@code listings=[]}.
 */
@Service
public class CityAreaListingsService {

    private static final Logger log = LoggerFactory.getLogger(CityAreaListingsService.class);

    static final int DEFAULT_LIMIT = 5;
    static final int MAX_LIMIT = 20;

    private final JdbcOperations jdbc;

    public CityAreaListingsService(JdbcOperations jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Returns the city-first area listings response.
     *
     * @param city         city slug (case-insensitive)
     * @param areaKeys     requested area keys, must be non-empty (caller enforces)
     * @param rawLimit     client-requested limit per area (may be null → default 5)
     * @throws ResponseStatusException 400 "unknown_city" when city slug is not in cities table
     */
    @Transactional(readOnly = true)
    public CityAreaListingsResponse getAreaListings(String city,
                                                    List<String> areaKeys,
                                                    Integer rawLimit) {

        int limit = clampLimit(rawLimit);

        // Validate city exists
        Integer cityCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM cities WHERE slug = ?",
                Integer.class,
                city.toLowerCase());
        if (cityCount == null || cityCount == 0) {
            log.debug("getAreaListings: unknown city slug={}", city);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown_city");
        }

        // Build IN-clause placeholders
        String placeholders = String.join(", ", Collections.nCopies(areaKeys.size(), "?"));

        // Single query: join areas → cities to enforce city ownership, lateral join to listing_images
        // Row shape: area_key, area_name, listing_id (nullable), price_paise, property_type,
        //            locality, primary_image_url, listing_purpose
        //
        // The LEFT JOIN on property_listings means an area with no LIVE listings still returns
        // one row with listing_id = NULL. The LATERAL join for image is a correlated subquery
        // that returns NULL when no image exists.
        //
        // ROW_NUMBER() OVER (PARTITION BY a.area_key ORDER BY pl.created_at DESC) is used to
        // limit listings per area without a separate round-trip.
        String sql = """
                SELECT
                    sub.area_key,
                    sub.area_name,
                    sub.listing_id,
                    sub.price_paise,
                    sub.property_type,
                    sub.locality,
                    sub.primary_image_url,
                    sub.listing_purpose
                FROM (
                    SELECT
                        a.area_key,
                        a.name                                                                  AS area_name,
                        pl.id                                                                   AS listing_id,
                        pl.price_paise,
                        pl.property_type,
                        pl.locality,
                        (SELECT li.url
                         FROM listing_images li
                         WHERE li.listing_id = pl.id
                         ORDER BY li.position ASC, li.id ASC
                         LIMIT 1)                                                               AS primary_image_url,
                        pl.listing_purpose,
                        ROW_NUMBER() OVER (PARTITION BY a.area_key ORDER BY pl.created_at DESC) AS rn
                    FROM areas a
                    JOIN cities c ON c.id = a.city_id
                    LEFT JOIN property_listings pl
                        ON  pl.area_key = a.area_key
                        AND pl.status   = 'LIVE'
                    WHERE c.slug    = ?
                      AND a.area_key IN (""" + placeholders + """
                )
                ) sub
                WHERE sub.rn <= ? OR sub.listing_id IS NULL
                ORDER BY sub.area_key, sub.rn
                """;

        // Parameters: city, areaKey×N, limit
        Object[] params = buildParams(city.toLowerCase(), areaKeys, limit);

        // area_key → list of cards; LinkedHashMap preserves insertion (sorted) order per key
        Map<String, List<AreaListingCard>> cardsByArea = new LinkedHashMap<>();
        Map<String, String> nameByArea = new LinkedHashMap<>();

        jdbc.query(sql, rs -> {
            String areaKey = rs.getString("area_key");
            String areaName = rs.getString("area_name");
            nameByArea.putIfAbsent(areaKey, areaName);
            cardsByArea.computeIfAbsent(areaKey, k -> new ArrayList<>());

            String rawId = rs.getString("listing_id");
            if (rawId != null) {
                // listing row present
                Long pricePaise = rs.getObject("price_paise") != null
                        ? rs.getLong("price_paise") : null;
                cardsByArea.get(areaKey).add(new AreaListingCard(
                        UUID.fromString(rawId),
                        pricePaise,
                        rs.getString("property_type"),
                        rs.getString("locality"),
                        rs.getString("primary_image_url"),
                        rs.getString("listing_purpose")
                ));
            }
            // if rawId is null: area exists but has no LIVE listings — leave the list empty
        }, params);

        log.debug("getAreaListings city={} areaKeys={} limit={} knownAreas={}",
                city, areaKeys.size(), limit, nameByArea.size());

        // Build response in the same order as the requested areaKeys list
        List<AreaListingsEntry> entries = new ArrayList<>(areaKeys.size());
        for (String key : areaKeys) {
            if (nameByArea.containsKey(key)) {
                entries.add(new AreaListingsEntry(
                        key,
                        nameByArea.get(key),
                        null,                        // known area — omit "unknown" field
                        cardsByArea.getOrDefault(key, List.of())
                ));
            } else {
                // areaKey not found for this city
                entries.add(new AreaListingsEntry(key, null, Boolean.TRUE, List.of()));
            }
        }

        return new CityAreaListingsResponse(city.toLowerCase(), limit, entries);
    }

    // ── helpers ─────────────────────────────────────────────────────────────────

    static int clampLimit(Integer raw) {
        if (raw == null || raw < 1) return DEFAULT_LIMIT;
        return Math.min(raw, MAX_LIMIT);
    }

    private static Object[] buildParams(String city, List<String> areaKeys, int limit) {
        Object[] params = new Object[1 + areaKeys.size() + 1];
        params[0] = city;
        for (int i = 0; i < areaKeys.size(); i++) {
            params[1 + i] = areaKeys.get(i);
        }
        params[1 + areaKeys.size()] = limit;
        return params;
    }
}

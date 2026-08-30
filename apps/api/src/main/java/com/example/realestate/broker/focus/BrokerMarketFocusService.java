package com.example.realestate.broker.focus;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.UUID;

/**
 * Service for the broker market-focus feature.
 *
 * <h3>Ownership contract</h3>
 * <ul>
 *   <li>broker_id is always the JWT-resolved {@code userId} passed by the controller.
 *       No client-supplied broker identity is ever accepted.</li>
 *   <li>Every read and write path has {@code broker_id = :userId} in the WHERE
 *       clause — SQL-layer enforcement, not application-layer filtering after the fact.</li>
 * </ul>
 *
 * <h3>Idempotency</h3>
 * <ul>
 *   <li>Add: {@code INSERT ... ON CONFLICT DO NOTHING} — re-adding an existing tuple
 *       is a no-op; source is never changed by add.</li>
 *   <li>Seed: same {@code INSERT ... ON CONFLICT DO NOTHING} — re-seeding produces no
 *       duplicates and never clobbers existing {@code source='manual'} rows.</li>
 * </ul>
 *
 * <h3>city_slug resolution</h3>
 * city_slug is resolved exclusively via the {@code areas → cities} join
 * ({@code areas.area_key → areas.city_id → cities.id → cities.slug}).
 * String-splitting of area_key is never used (Kundapur rule: area_key district
 * segment is 'Udupi' but city slug is 'kundapur').
 */
@Service
public class BrokerMarketFocusService {

    private static final Logger log = LoggerFactory.getLogger(BrokerMarketFocusService.class);

    // -----------------------------------------------------------------------
    // SQL constants
    // -----------------------------------------------------------------------

    /**
     * Returns all focus rows for the calling broker, ordered by insertion time.
     * Filtered at the SQL layer — broker_id = :userId — not post-query in Java.
     */
    private static final String LIST_SQL = """
            SELECT city_slug, area_key, property_type, listing_purpose, source, created_at
            FROM broker_market_focus
            WHERE broker_id = ?
            ORDER BY created_at DESC
            """;

    /**
     * Resolves the authoritative city_slug for a given area_key via the areas→cities join.
     * Returns null when no areas row exists for the key (area unknown).
     * This is the same join used by SEED_SQL — ensures add and seed always produce
     * the identical city_slug for the same real area (Kundapur rule).
     */
    private static final String RESOLVE_CITY_SLUG_SQL = """
            SELECT c.slug
            FROM areas  a
            JOIN cities c ON c.id = a.city_id
            WHERE a.area_key = ?
            LIMIT 1
            """;

    /**
     * Inserts one row with source='manual'. Composite PK conflict = no-op.
     * Source is never changed if the row already exists (DO NOTHING, not DO UPDATE).
     * city_slug is always the server-resolved value from RESOLVE_CITY_SLUG_SQL —
     * never client-supplied.
     */
    private static final String ADD_MANUAL_SQL = """
            INSERT INTO broker_market_focus
                (broker_id, city_slug, area_key, property_type, listing_purpose, source)
            VALUES (?, ?, ?, ?, ?, 'manual')
            ON CONFLICT (broker_id, city_slug, area_key, property_type, listing_purpose)
            DO NOTHING
            """;

    /**
     * Removes a row owned by the calling broker.
     * Returns the number of rows deleted (0 = not found or not owned).
     * Uses broker_id AND the full tuple so a broker cannot delete another broker's row.
     */
    private static final String REMOVE_SQL = """
            DELETE FROM broker_market_focus
            WHERE broker_id       = ?
              AND city_slug       = ?
              AND area_key        = ?
              AND property_type   = ?
              AND listing_purpose = ?
            """;

    /**
     * Seed query: derives distinct (broker_id, city_slug, area_key, property_type,
     * listing_purpose) buckets from LIVE listings owned by the caller and inserts them
     * with source='seeded'. city_slug comes from the authoritative areas→cities join.
     *
     * <p>Constraints enforced here:
     * <ul>
     *   <li>status = 'LIVE' — only LIVE listings contribute (archived/draft excluded)</li>
     *   <li>area_key IS NOT NULL — listings with null area_key are skipped</li>
     *   <li>INNER JOIN on areas — listings whose area_key has no areas row are skipped
     *       (acceptable; the join produces no row for them)</li>
     *   <li>ON CONFLICT DO NOTHING — re-seeding is idempotent; manual rows are preserved</li>
     * </ul>
     */
    private static final String SEED_SQL = """
            INSERT INTO broker_market_focus
                (broker_id, city_slug, area_key, property_type, listing_purpose, source)
            SELECT DISTINCT
                pl.created_by           AS broker_id,
                c.slug                  AS city_slug,
                pl.area_key,
                pl.property_type,
                pl.listing_purpose
            ,   'seeded'
            FROM property_listings pl
            JOIN areas  a ON a.area_key  = pl.area_key
            JOIN cities c ON c.id        = a.city_id
            WHERE pl.created_by      = ?
              AND pl.status          = 'LIVE'
              AND pl.area_key        IS NOT NULL
              AND pl.listing_purpose IS NOT NULL
              AND pl.property_type   IS NOT NULL
            ON CONFLICT (broker_id, city_slug, area_key, property_type, listing_purpose)
            DO NOTHING
            """;

    // -----------------------------------------------------------------------
    // Row mapper
    // -----------------------------------------------------------------------

    private static final RowMapper<BrokerMarketFocusRow> ROW_MAPPER = new RowMapper<>() {
        @Override
        public BrokerMarketFocusRow mapRow(ResultSet rs, int rowNum) throws SQLException {
            Timestamp ts = rs.getTimestamp("created_at");
            return new BrokerMarketFocusRow(
                    rs.getString("city_slug"),
                    rs.getString("area_key"),
                    rs.getString("property_type"),
                    rs.getString("listing_purpose"),
                    rs.getString("source"),
                    ts != null ? ts.toInstant() : null
            );
        }
    };

    // -----------------------------------------------------------------------
    // Constructor injection
    // -----------------------------------------------------------------------

    private final JdbcOperations jdbcOperations;

    public BrokerMarketFocusService(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Returns all focus rows for the given broker, newest first.
     *
     * @param userId JWT-resolved broker UUID; never client-supplied
     * @return list of rows; empty list when none exist (never null)
     */
    @Transactional(readOnly = true)
    public List<BrokerMarketFocusRow> listFocus(UUID userId) {
        log.debug("listFocus userId={}", userId);
        List<BrokerMarketFocusRow> rows = jdbcOperations.query(LIST_SQL, ROW_MAPPER, userId);
        log.debug("listFocus userId={} returned {} rows", userId, rows.size());
        return rows;
    }

    /**
     * Adds a manual focus row for the given broker. Re-adding an existing tuple is a no-op
     * (idempotent via ON CONFLICT DO NOTHING). Source is never overwritten.
     *
     * <p>city_slug is resolved server-side via the same {@code areas → cities} join used
     * by {@link #seedFocus}. If the supplied {@code areaKey} has no matching {@code areas}
     * row, the add is rejected with HTTP 422 — no row with a null or guessed slug is
     * ever inserted. This guarantees that a manual add and a seed for the same
     * {@code (areaKey, propertyType, listingPurpose)} produce the identical composite-PK
     * bucket (AC4 idempotency-consistency).
     *
     * @param userId  JWT-resolved broker UUID; never client-supplied
     * @param request tuple to add — citySlug is absent; it is derived here
     * @throws ResponseStatusException HTTP 422 when areaKey has no matching areas row
     */
    @Transactional
    public void addFocus(UUID userId, AddFocusRequest request) {
        log.debug("addFocus userId={} areaKey={} propertyType={} listingPurpose={}",
                userId, request.areaKey(), request.propertyType(), request.listingPurpose());

        List<String> slugs = jdbcOperations.queryForList(
                RESOLVE_CITY_SLUG_SQL, String.class, request.areaKey());
        if (slugs.isEmpty()) {
            log.warn("addFocus rejected: areaKey='{}' has no matching areas row", request.areaKey());
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Area not found: " + request.areaKey());
        }
        String citySlug = slugs.get(0);

        log.debug("addFocus resolved citySlug={} for areaKey={}", citySlug, request.areaKey());
        jdbcOperations.update(ADD_MANUAL_SQL,
                userId,
                citySlug,
                request.areaKey(),
                request.propertyType(),
                request.listingPurpose());
    }

    /**
     * Removes a focus row owned by the calling broker. Returns normally if the row was deleted.
     * Throws 404 if the row does not exist or is not owned by the caller — no enumeration
     * of other brokers' rows.
     *
     * @param userId  JWT-resolved broker UUID; never client-supplied
     * @param request tuple to remove
     * @throws ResponseStatusException 404 when no matching row exists for this broker
     */
    @Transactional
    public void removeFocus(UUID userId, RemoveFocusRequest request) {
        log.debug("removeFocus userId={} citySlug={} areaKey={} propertyType={} listingPurpose={}",
                userId, request.citySlug(), request.areaKey(),
                request.propertyType(), request.listingPurpose());

        int deleted = jdbcOperations.update(REMOVE_SQL,
                userId,
                request.citySlug(),
                request.areaKey(),
                request.propertyType(),
                request.listingPurpose());

        if (deleted == 0) {
            log.warn("removeFocus not found userId={} citySlug={} areaKey={}",
                    userId, request.citySlug(), request.areaKey());
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "Market focus entry not found");
        }
    }

    /**
     * Seeds focus rows from the calling broker's LIVE listings.
     * city_slug is resolved via the areas→cities join (never by string-splitting area_key).
     * Re-seeding is idempotent: existing rows (seeded or manual) are never replaced.
     * Listings with null area_key, null property_type, or null listing_purpose are skipped.
     * Listings whose area_key has no matching areas row are silently skipped (INNER JOIN).
     *
     * @param userId JWT-resolved broker UUID; never client-supplied
     * @return number of new rows inserted (0 when already up-to-date or no LIVE listings)
     */
    @Transactional
    public int seedFocus(UUID userId) {
        log.debug("seedFocus userId={}", userId);
        int inserted = jdbcOperations.update(SEED_SQL, userId);
        log.info("seedFocus userId={} inserted={}", userId, inserted);
        return inserted;
    }
}

package com.example.realestate.savedlistings;

import com.example.realestate.listing.core.ListingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Save/unsave/list operations for a user's bookmarked listings (#1566).
 *
 * <p>{@code userId} is always supplied by the controller from the JWT subject —
 * never accepted from the client body — so every method here is scoped to the
 * caller's own rows by construction.
 */
@Service
public class SavedListingsService {

    private static final Logger log = LoggerFactory.getLogger(SavedListingsService.class);

    private final SavedListingRepository savedListingRepository;
    private final ListingRepository listingRepository;
    private final JdbcOperations jdbc;

    public SavedListingsService(SavedListingRepository savedListingRepository,
                                ListingRepository listingRepository,
                                JdbcOperations jdbc) {
        this.savedListingRepository = savedListingRepository;
        this.listingRepository = listingRepository;
        this.jdbc = jdbc;
    }

    /** Outcome of {@link #save(UUID, UUID)}; the controller maps this to an HTTP status. */
    public enum SaveOutcome {
        CREATED,
        ALREADY_SAVED,
        LISTING_NOT_FOUND
    }

    /**
     * Saves {@code listingId} for {@code userId}. Idempotent: saving an already-saved
     * listing is a no-op that reports {@link SaveOutcome#ALREADY_SAVED} rather than a
     * duplicate row or an error.
     */
    @Transactional
    public SaveOutcome save(UUID userId, UUID listingId) {
        if (!listingRepository.existsById(listingId)) {
            log.info("save: listing not found listingId={} userId={}", listingId, userId);
            return SaveOutcome.LISTING_NOT_FOUND;
        }

        if (savedListingRepository.existsByUserIdAndListingId(userId, listingId)) {
            log.debug("save: already saved listingId={} userId={}", listingId, userId);
            return SaveOutcome.ALREADY_SAVED;
        }

        SavedListing entity = new SavedListing();
        entity.setUserId(userId);
        entity.setListingId(listingId);
        entity.setCreatedAt(OffsetDateTime.now());

        try {
            savedListingRepository.save(entity);
            log.info("save: created listingId={} userId={}", listingId, userId);
            return SaveOutcome.CREATED;
        } catch (DataIntegrityViolationException e) {
            // Concurrent save raced us past the existsByUserIdAndListingId check above;
            // the unique(user_id, listing_id) constraint caught it — treat as idempotent.
            log.debug("save: race lost to concurrent save, treating as already-saved "
                    + "listingId={} userId={}", listingId, userId);
            return SaveOutcome.ALREADY_SAVED;
        }
    }

    /**
     * Unsaves {@code listingId} for {@code userId}. Always idempotent — deleting a
     * listing that was never saved (or was already unsaved) is a harmless no-op.
     * Scoped by (userId, listingId) together, so this can never delete another
     * user's row.
     */
    @Transactional
    public void unsave(UUID userId, UUID listingId) {
        long deleted = savedListingRepository.deleteByUserIdAndListingId(userId, listingId);
        log.info("unsave: deletedRows={} listingId={} userId={}", deleted, listingId, userId);
    }

    @Transactional(readOnly = true)
    public List<UUID> listSavedIds(UUID userId) {
        return savedListingRepository.findListingIdsByUserId(userId);
    }

    /**
     * Returns the caller's saved listings as compact cards, most-recently-saved first.
     * Includes archived listings (badged via {@code status}/{@code available}) rather
     * than silently dropping or 500ing on them.
     */
    @Transactional(readOnly = true)
    public List<SavedListingCard> listSaved(UUID userId) {
        String sql = """
                SELECT
                    sl.id                AS saved_id,
                    sl.listing_id        AS listing_id,
                    sl.created_at        AS saved_at,
                    pl.title             AS title,
                    pl.price_paise       AS price_paise,
                    pl.property_type     AS property_type,
                    pl.locality          AS locality,
                    (SELECT li.url
                     FROM listing_images li
                     WHERE li.listing_id = pl.id
                     ORDER BY li.position ASC, li.id ASC
                     LIMIT 1)            AS primary_image_url,
                    pl.listing_purpose   AS listing_purpose,
                    pl.bedrooms          AS bedrooms,
                    pl.bathrooms         AS bathrooms,
                    pl.built_area        AS built_area,
                    pl.built_area_unit   AS built_area_unit,
                    pl.land_area         AS land_area,
                    pl.land_area_unit    AS land_area_unit,
                    pl.status            AS status,
                    pl.archived_at       AS archived_at
                FROM public.saved_listings sl
                JOIN public.property_listings pl ON pl.id = sl.listing_id
                WHERE sl.user_id = ?
                ORDER BY sl.created_at DESC
                """;

        List<SavedListingCard> cards = new ArrayList<>();
        jdbc.query(sql, rs -> {
            Timestamp savedTs = rs.getTimestamp("saved_at");
            String status = rs.getString("status");
            boolean archived = rs.getTimestamp("archived_at") != null;
            boolean available = "LIVE".equals(status) && !archived;

            cards.add(new SavedListingCard(
                    UUID.fromString(rs.getString("saved_id")),
                    UUID.fromString(rs.getString("listing_id")),
                    savedTs != null ? savedTs.toInstant().toString() : null,
                    rs.getString("title"),
                    rs.getObject("price_paise") != null ? rs.getLong("price_paise") : null,
                    rs.getString("property_type"),
                    rs.getString("locality"),
                    rs.getString("primary_image_url"),
                    rs.getString("listing_purpose"),
                    rs.getObject("bedrooms") != null ? rs.getInt("bedrooms") : null,
                    rs.getObject("bathrooms") != null ? rs.getInt("bathrooms") : null,
                    rs.getObject("built_area") != null ? rs.getDouble("built_area") : null,
                    rs.getString("built_area_unit"),
                    rs.getObject("land_area") != null ? rs.getDouble("land_area") : null,
                    rs.getString("land_area_unit"),
                    status,
                    available
            ));
        }, userId);

        log.debug("listSaved: userId={} count={}", userId, cards.size());
        return cards;
    }
}

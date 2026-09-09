package com.example.realestate.savedsearch.alert;

import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import com.example.realestate.savedsearch.SavedSearch;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * #2019 Slice B: finds the listings that are NEW for a saved search.
 *
 * <p>Predicate = {@link DiscoverListingPredicateBuilder#build} over
 * {@link SavedSearchFiltersMapper#toFilters} (identical to the live Discover query: trust,
 * visibility, active-city, purpose, scope and every saved filter) AND two matcher-only clauses:
 * <ul>
 *   <li>the lexicographic cursor {@code (COALESCE(pl.first_published_at, pl.created_at), pl.id)
 *       > (cursorAt, cursorListingId)} — "newly LIVE since the delivery cursor". Pairing the
 *       timestamp with the listing id is what makes paging exact: a page that fills on rows
 *       sharing one timestamp resumes at the next id, so nothing on that timestamp is skipped;</li>
 *   <li>no {@code saved_search_alert_deliveries} row exists for (search, listing) — the
 *       once-per-search guard, so reruns and overlapping area associations never re-deliver.</li>
 * </ul>
 *
 * <p>Deterministic: ordered by that same {@code (eligible_at, id)} key, capped at {@code limit}
 * (overflow is picked up by the next run because the cursor only advances to the last row
 * actually recorded). A listing has exactly one {@code area_key}, so an AREA_SET scope with
 * overlapping area associations still yields each listing once.
 */
@Component
public class SavedSearchAlertMatcher {

    /** Id half of the cursor for a search no run has advanced yet (sorts before every real id). */
    public static final UUID ZERO_UUID = new UUID(0L, 0L);

    /** A newly matching listing and the instant it became eligible (the cursor candidate). */
    public record Match(UUID listingId, OffsetDateTime eligibleAt) {
    }

    private final JdbcTemplate jdbcTemplate;

    public SavedSearchAlertMatcher(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * @param savedSearch     the ACTIVE saved search to evaluate
     * @param cursorAt        {@code alert_watermark}, or the search's {@code created_at} when no
     *                        run has advanced it yet (see {@link SavedSearchAlertDeliveryService})
     * @param cursorListingId {@code alert_watermark_listing_id}; {@code null} means {@link #ZERO_UUID}
     * @param limit           maximum matches returned (owner decision: 200 per run)
     */
    public List<Match> findNewMatches(SavedSearch savedSearch, OffsetDateTime cursorAt, UUID cursorListingId, int limit) {
        DiscoverListingPredicateBuilder.Sql sql =
                DiscoverListingPredicateBuilder.build(SavedSearchFiltersMapper.toFilters(savedSearch));

        String query = "SELECT pl.id, COALESCE(pl.first_published_at, pl.created_at) AS eligible_at"
                + " FROM property_listings pl WHERE " + sql.whereFragment()
                + " AND (COALESCE(pl.first_published_at, pl.created_at), pl.id) > (?, ?)"
                + " AND NOT EXISTS (SELECT 1 FROM saved_search_alert_deliveries d"
                + "   WHERE d.saved_search_id = ? AND d.listing_id = pl.id)"
                + " ORDER BY eligible_at ASC, pl.id ASC LIMIT ?";

        List<Object> params = new ArrayList<>(sql.params());
        params.add(cursorAt);
        params.add(cursorListingId == null ? ZERO_UUID : cursorListingId);
        params.add(savedSearch.getId());
        params.add(limit);

        return jdbcTemplate.query(
                query,
                (rs, i) -> new Match(
                        rs.getObject("id", UUID.class),
                        rs.getObject("eligible_at", OffsetDateTime.class)),
                params.toArray());
    }
}

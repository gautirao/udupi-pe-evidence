package com.example.realestate.discover.navigation;

import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Set-based (never per-city) read of "every public-active city's currently PROMOTED navigation
 * revision" (#1955 Areas PR A, SLICE 2d). A city with {@code is_active=false} (disabled), or with
 * no row satisfying {@code lifecycle_status='PROMOTED' AND superseded_by IS NULL} (never launched,
 * "Soon", mid-preview, or superseded), is simply absent from the result — never an error, never a
 * partial/placeholder row. This is query #1 of the two set-based queries {@code
 * NavigationCachePreloadRunner}'s eager preload performs (query #2 is the cross-city {@code
 * navigation_nodes} load via {@link NavigationNodeRepository
 * #findByCityIdInOrderByCityIdAscDepthAscDisplayOrderAsc}), and is re-run at each {@code
 * NavigationHierarchySafetyPoller} tick to detect drift between the cache's active pointer and the
 * database's authoritative PROMOTED revision.
 */
@Component
public class PublicActiveCityRevisionReader {

    private static final String SELECT_SQL = """
            SELECT c.id AS city_id, c.slug AS city_slug, r.id AS revision_id
            FROM public.cities c
            JOIN public.city_launch_revision r ON r.city_id = c.id
            WHERE c.is_active = true
              AND r.lifecycle_status = 'PROMOTED'
              AND r.superseded_by IS NULL
            ORDER BY c.id
            """;

    private final JdbcOperations jdbcOperations;

    public PublicActiveCityRevisionReader(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    public List<PublicActiveCityRevision> findAll() {
        return jdbcOperations.query(SELECT_SQL, (rs, rowNum) -> new PublicActiveCityRevision(
                rs.getInt("city_id"), rs.getString("city_slug"), rs.getLong("revision_id")));
    }
}

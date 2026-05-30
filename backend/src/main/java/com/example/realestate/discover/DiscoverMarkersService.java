package com.example.realestate.discover;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

/**
 * Service for GET /api/discover/markers.
 *
 * <p>Uses {@link DiscoverListingPredicateBuilder} to build the shared WHERE fragment so that
 * the result set is structurally identical to what {@link DiscoverListingsService} would return
 * for the same filters — by construction, not by agreement.
 */
@Service
public class DiscoverMarkersService {

    private static final Logger log = LoggerFactory.getLogger(DiscoverMarkersService.class);

    /** Hard cap: fetch one extra row to detect overflow, then trim. */
    private static final int CAP = 1000;
    private static final int FETCH_LIMIT = CAP + 1;

    private static final String METRIC_NAME = "discover.markers.query.latency.seconds";

    private final JdbcOperations jdbc;
    private final MeterRegistry meterRegistry;
    /** Pre-registered timers keyed by result_status to avoid per-request builder allocation. */
    private final Map<String, Timer> timers;

    public DiscoverMarkersService(JdbcOperations jdbc, MeterRegistry meterRegistry) {
        this.jdbc = jdbc;
        this.meterRegistry = meterRegistry;
        this.timers = Map.of(
                "success", buildTimer("success", meterRegistry),
                "empty",   buildTimer("empty",   meterRegistry),
                "error",   buildTimer("error",   meterRegistry)
        );
    }

    private static Timer buildTimer(String resultStatus, MeterRegistry registry) {
        return Timer.builder(METRIC_NAME)
                .tag("query_path", "bbox")
                .tag("result_status", resultStatus)
                .publishPercentileHistogram(true)
                .register(registry);
    }

    @Transactional(readOnly = true)
    public DiscoverMarkersResponse getMarkers(DiscoverListingPredicateBuilder.Filters filters) {
        // Build the WHERE fragment once — shared by the main SELECT and the conditional COUNT.
        // bboxApplied is authoritative: set inside build() when the ST_MakeEnvelope clause was
        // actually appended, so it stays correct if the builder ever adds further bbox validity
        // checks beyond the null guard.
        DiscoverListingPredicateBuilder.Sql predicate = DiscoverListingPredicateBuilder.build(filters);
        boolean boundsApplied = predicate.bboxApplied();

        String sql = "SELECT pl.id, pl.latitude, pl.longitude, pl.price_paise, pl.locality"
                + " FROM property_listings pl"
                + " WHERE " + predicate.whereFragment()
                + " ORDER BY pl.id"
                + " LIMIT " + FETCH_LIMIT;

        // Materialise params to a single array shared by both JDBC call sites (SELECT + COUNT).
        // Avoids any risk of the two calls receiving divergent arrays after a future refactor.
        final Object[] paramArray = predicate.params().toArray();

        Timer.Sample sample = Timer.start(meterRegistry);
        String resultStatus = "success";
        try {
            List<DiscoverMarker> markers = jdbc.query(
                    sql,
                    (rs, rowNum) -> new DiscoverMarker(
                            rs.getString("id"),
                            rs.getDouble("latitude"),
                            rs.getDouble("longitude"),
                            rs.getObject("price_paise") != null ? rs.getLong("price_paise") : null,
                            rs.getString("locality")
                    ),
                    paramArray
            );

            boolean truncated = markers.size() > CAP;
            if (truncated) {
                log.warn("Discover markers cap hit for city {}: {} rows (capped at {})", filters.city(), markers.size(), CAP);
                markers = markers.subList(0, CAP);
            }
            if (markers.isEmpty()) {
                resultStatus = "empty";
            }

            int returnedElements = markers.size();

            // totalFilteredElements — viewport-scoped (Option A: same WHERE including bbox).
            //
            // Performance contract: COUNT(*) runs ONLY on the truncated path.
            //   - Truncated: fetch returned FETCH_LIMIT rows, meaning more rows match than CAP.
            //     Run COUNT(*) with the same WHERE fragment to report the full matching set size.
            //     The geog GiST index (idx_property_listings_geog) is reused by the COUNT query
            //     because it references the same pl.geog predicates (ST_MakeEnvelope && pl.geog,
            //     ST_DWithin, etc.) from the shared predicate.whereFragment().
            //   - Not truncated: all matching rows were already fetched. totalFilteredElements
            //     equals returnedElements — no extra query issued.
            long totalFilteredElements;
            if (truncated) {
                String countSql = "SELECT COUNT(*) FROM property_listings pl WHERE " + predicate.whereFragment();
                Long countResult = jdbc.queryForObject(countSql, Long.class, paramArray);
                totalFilteredElements = countResult != null ? countResult : returnedElements;
                log.debug("getMarkers city={} truncated, totalFilteredElements={}", filters.city(), totalFilteredElements);
            } else {
                totalFilteredElements = returnedElements;
            }

            log.debug("getMarkers city={} returned={} total={} truncated={} boundsApplied={}",
                    filters.city(), returnedElements, totalFilteredElements, truncated, boundsApplied);

            return new DiscoverMarkersResponse(
                    filters.city(),
                    markers,
                    truncated,
                    returnedElements,
                    totalFilteredElements,
                    CAP,
                    boundsApplied
            );
        } catch (DataAccessException ex) {
            resultStatus = "error";
            throw ex;
        } finally {
            sample.stop(timers.get(resultStatus));
        }
    }
}

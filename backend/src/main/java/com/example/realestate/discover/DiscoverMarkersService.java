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
        DiscoverListingPredicateBuilder.Sql predicate = DiscoverListingPredicateBuilder.build(filters);

        String sql = "SELECT pl.id, pl.latitude, pl.longitude, pl.price_paise, pl.locality"
                + " FROM property_listings pl"
                + " WHERE " + predicate.whereFragment()
                + " ORDER BY pl.id"
                + " LIMIT " + FETCH_LIMIT;

        List<Object> params = predicate.params();

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
                    params.toArray()
            );

            boolean truncated = markers.size() > CAP;
            if (truncated) {
                log.warn("Discover markers cap hit for city {}: {} rows (capped at {})", filters.city(), markers.size(), CAP);
                markers = markers.subList(0, CAP);
            }
            if (markers.isEmpty()) {
                resultStatus = "empty";
            }
            log.debug("getMarkers city={} returned {} markers (truncated={})", filters.city(), markers.size(), truncated);
            return new DiscoverMarkersResponse(filters.city(), markers, truncated);
        } catch (DataAccessException ex) {
            resultStatus = "error";
            throw ex;
        } finally {
            sample.stop(timers.get(resultStatus));
        }
    }
}

package com.example.realestate.discover.navigation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * AFTER_COMMIT handler for {@link CityNavigationRevisionPromoted} (#1955 Areas PR A, SLICE 2d).
 * {@code @Async} (mirrors {@code BookingEventListener}'s convention) so the promotion HTTP call
 * never waits on this refresh — the caller already sees the new revision reflected in {@code
 * public.navigation_nodes} regardless of when this listener runs; only the IN-PROCESS cache lags
 * momentarily, and {@code NavigationHierarchySafetyPoller} repairs any drift this listener fails
 * to apply (e.g. this instance crashes mid-refresh, or the exception path below is hit).
 *
 * <p>Never rethrows — a refresh failure here must not surface anywhere the caller can observe (the
 * transaction already committed); {@link NavigationGraphCache#refreshActiveRevision}'s
 * load-before-swap contract means a thrown load/validate failure leaves the OLD revision serving,
 * so failing closed here is always safe.
 */
@Component
public class NavigationGraphRefreshListener {

    private static final Logger log = LoggerFactory.getLogger(NavigationGraphRefreshListener.class);

    private final NavigationGraphCache cache;
    private final NavigationCacheProperties props;
    private final JdbcOperations jdbcOperations;

    public NavigationGraphRefreshListener(
            NavigationGraphCache cache, NavigationCacheProperties props, JdbcOperations jdbcOperations) {
        this.cache = cache;
        this.props = props;
        this.jdbcOperations = jdbcOperations;
    }

    @Async
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onCityNavigationRevisionPromoted(CityNavigationRevisionPromoted event) {
        try {
            String citySlug = jdbcOperations.queryForObject(
                    "SELECT slug FROM public.cities WHERE id = ?", String.class, event.cityId());
            cache.refreshActiveRevision(citySlug, event.cityId(), event.revisionId());
        } catch (Exception e) {
            log.error("NavigationGraphRefreshListener: refresh failed cityId={} revisionId={} — the OLD "
                            + "revision keeps serving from cache; the {}s safety poll will repair this",
                    event.cityId(), event.revisionId(), props.getPollIntervalSeconds(), e);
        }
    }
}

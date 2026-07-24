package com.example.realestate.discover.navigation;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.OptionalLong;

/**
 * 30-60s safety-net poll (#1955 Areas PR A, SLICE 2d), mirroring {@code
 * AreaRegionReclassOutboxPoller}'s single-instance {@code @Scheduled(fixedDelay)} discipline —
 * re-reads the database's authoritative PROMOTED revision per public-active city and refreshes the
 * cache only on a mismatch against the cache's active pointer. Covers:
 * <ul>
 *   <li>a missed/failed {@link CityNavigationRevisionPromoted} AFTER_COMMIT event (e.g. this
 *       instance was down or {@link NavigationGraphRefreshListener} hit an exception);</li>
 *   <li>a second application instance that has not yet processed the same event (each instance
 *       runs its own poller and its own in-process cache).</li>
 * </ul>
 * An unchanged revision is a true no-op — no cache read/write, no log line above DEBUG.
 *
 * <p><b>Concurrency invariant (LOAD-BEARING, mirrors {@code AreaRegionReclassOutboxPoller}):</b>
 * correct only with a single active instance of the scheduler thread per process; safe across
 * MULTIPLE application instances specifically because each instance's poller only ever mutates its
 * OWN in-process cache — there is no shared/distributed state to race on.
 */
@Component
public class NavigationHierarchySafetyPoller {

    private static final Logger log = LoggerFactory.getLogger(NavigationHierarchySafetyPoller.class);

    private final PublicActiveCityRevisionReader reader;
    private final NavigationGraphCache cache;
    private final Counter repairCounter;
    private final Counter repairFailedCounter;

    public NavigationHierarchySafetyPoller(
            PublicActiveCityRevisionReader reader, NavigationGraphCache cache, MeterRegistry meterRegistry) {
        this.reader = reader;
        this.cache = cache;
        this.repairCounter = Counter.builder("discover.navigation.cache.safety_poll.repaired")
                .description("Navigation-hierarchy cache refreshes triggered by the safety poll detecting "
                        + "drift between the cached active pointer and the DB's PROMOTED revision.")
                .register(meterRegistry);
        this.repairFailedCounter = Counter.builder("discover.navigation.cache.safety_poll.repair_failed")
                .description("Safety-poll-triggered refresh attempts that themselves failed (load/validate "
                        + "error) — the previously-active revision keeps serving.")
                .register(meterRegistry);
    }

    @Scheduled(fixedDelayString = "${discover.navigation.cache.poll-interval-seconds:45}000")
    public void reconcile() {
        List<PublicActiveCityRevision> targets = reader.findAll();
        for (PublicActiveCityRevision target : targets) {
            OptionalLong active = cache.activeRevisionId(target.citySlug());
            if (active.isPresent() && active.getAsLong() == target.revisionId()) {
                continue; // unchanged — true no-op, no cache write
            }
            try {
                Object cachedRevision = active.isPresent() ? active.getAsLong() : "none";
                cache.refreshActiveRevision(target.citySlug(), target.cityId(), target.revisionId());
                repairCounter.increment();
                log.info("NavigationHierarchySafetyPoller: repaired drift citySlug={} cachedRevision={} "
                                + "-> dbRevision={}",
                        target.citySlug(), cachedRevision, target.revisionId());
            } catch (Exception e) {
                repairFailedCounter.increment();
                log.error("NavigationHierarchySafetyPoller: repair failed citySlug={} targetRevisionId={} — "
                                + "previously-active revision (if any) keeps serving; will retry next poll",
                        target.citySlug(), target.revisionId(), e);
            }
        }
    }
}

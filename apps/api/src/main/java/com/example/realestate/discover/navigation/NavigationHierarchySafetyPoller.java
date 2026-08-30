package com.example.realestate.discover.navigation;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.List;
import java.util.OptionalLong;
import java.util.Set;

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
    private final Counter evictedCounter;

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
        this.evictedCounter = Counter.builder("discover.navigation.cache.safety_poll.evicted")
                .description("Navigation-hierarchy cache evictions triggered by the safety poll detecting a "
                        + "cached city with NO PROMOTED revision left in the DB at all (de-promoted, rolled "
                        + "back, or deactivated) — #1956 D11, the gap that let a de-promoted city's stale "
                        + "graph keep serving forever.")
                .register(meterRegistry);
    }

    @Scheduled(fixedDelayString = "${discover.navigation.cache.poll-interval-seconds:45}000")
    public void reconcile() {
        // Concurrency ordering (LOAD-BEARING): snapshot the cache's slug set BEFORE reading the DB,
        // not after. A promotion's AFTER_COMMIT listener calls cache.refreshActiveRevision(...) on the
        // committing thread, independently of this poller thread. If we read the DB first and the
        // cache second, a promotion landing in that window would make the newly-promoted city visible
        // in the (later) cache snapshot but absent from the (earlier) targetSlugs set built from the DB
        // read — and the eviction pass below would then wrongly evict the graph the promotion just
        // installed. Reading the cache snapshot first guarantees the DB read is strictly newer, so any
        // promotion in the interleaving window is guaranteed to also appear in targets/targetSlugs. The
        // residual race then degrades to a harmless redundant repair on the next poll, never a
        // wrongful eviction.
        //
        // That still leaves a SECOND, narrower window (#2028): a promotion can land AFTER this DB
        // read but BEFORE the eviction pass below calls cache.evictIfActiveRevision(...) for a city
        // absent from targetSlugs. Snapshotting each cached city's revisionId here (not just its
        // slug) lets that call compare against the exact stale revision observed at this point,
        // rather than removing whatever is active at eviction time — see
        // NavigationGraphCache#evictIfActiveRevision for the compare-and-remove itself.
        Set<NavigationGraphCache.CachedCityRevision> cachedRevisionsBefore = cache.cachedCityRevisions();
        List<PublicActiveCityRevision> targets = reader.findAll();
        Set<String> targetSlugs = new HashSet<>();
        for (PublicActiveCityRevision target : targets) {
            targetSlugs.add(target.citySlug());
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

        // #1956 D11: reader.findAll() only ever returns cities that CURRENTLY have a PROMOTED
        // revision — a de-promoted/rolled-back/deactivated city simply falls out of that result
        // set, so the loop above never even considers it. Without this second pass, such a city's
        // cache entry is refreshed toward nothing and keeps serving its stale graph forever. Every
        // cached slug absent from this poll's target set is evicted here instead.
        for (NavigationGraphCache.CachedCityRevision cachedRevision : cachedRevisionsBefore) {
            if (!targetSlugs.contains(cachedRevision.citySlug())) {
                boolean evicted = cache.evictIfActiveRevision(
                        cachedRevision.citySlug(), cachedRevision.revisionId());
                if (evicted) {
                    evictedCounter.increment();
                    log.info("NavigationHierarchySafetyPoller: evicted cache for citySlug={} — no PROMOTED "
                                    + "revision found for it (de-promoted, rolled back, or deactivated)",
                            cachedRevision.citySlug());
                } else {
                    log.debug("NavigationHierarchySafetyPoller: skipped eviction for citySlug={} — active "
                                    + "revision changed since this poll's snapshot (likely a concurrent "
                                    + "promotion); leaving the newer revision untouched",
                            cachedRevision.citySlug());
                }
            }
        }
    }
}

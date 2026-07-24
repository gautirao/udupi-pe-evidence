package com.example.realestate.discover.navigation;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * Eager startup preload of every public-active city's navigation graph (#1955 Areas PR A, SLICE
 * 2d). Exactly TWO set-based queries total, regardless of how many cities exist:
 * <ol>
 *   <li>{@link PublicActiveCityRevisionReader#findAll()} — public-active cities joined to their
 *       PROMOTED revision (skips disabled, never-launched/"Soon", mid-preview, and superseded
 *       cities simply by not matching the join's WHERE clause — never a separate branch);</li>
 *   <li>{@link NavigationNodeRepository#findByCityIdInOrderByCityIdAscDepthAscDisplayOrderAsc} —
 *       every targeted city's {@code navigation_nodes} rows in ONE query, split by {@code city_id}
 *       in memory afterward. Never one query per city.</li>
 * </ol>
 *
 * <p>{@code @Async} (requires {@code @EnableAsync}, already enabled app-wide via {@code
 * AppConfig}): {@link #run} returns immediately so a slow/large preload never blocks {@code
 * SpringApplication.run()} / application startup — {@link NavigationHierarchyReadinessState}'s own
 * elapsed-time timeout (independent of this thread) is what bounds how long readiness stays
 * NOT-READY.
 *
 * <p>Per-city bounded retries: a city that fails to load/validate is retried up to {@code
 * preloadMaxRetries} times with exponential backoff + jitter, re-querying just that one city each
 * retry (the first attempt reuses the batch query's rows; only a retry re-reads). Exhausting
 * retries leaves that city uncached (and, if it is required for readiness, keeps the overall
 * readiness NOT-READY/eventually-degraded) — it is never silently marked ready.
 */
@Component
public class NavigationCachePreloadRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(NavigationCachePreloadRunner.class);

    private final PublicActiveCityRevisionReader reader;
    private final NavigationNodeRepository navigationNodeRepository;
    private final NavigationGraphLoader loader;
    private final NavigationGraphCache cache;
    private final NavigationCacheProperties props;
    private final NavigationHierarchyReadinessState readinessState;
    private final Counter preloadFailedCounter;

    public NavigationCachePreloadRunner(
            PublicActiveCityRevisionReader reader,
            NavigationNodeRepository navigationNodeRepository,
            NavigationGraphLoader loader,
            NavigationGraphCache cache,
            NavigationCacheProperties props,
            NavigationHierarchyReadinessState readinessState,
            MeterRegistry meterRegistry) {
        this.reader = reader;
        this.navigationNodeRepository = navigationNodeRepository;
        this.loader = loader;
        this.cache = cache;
        this.props = props;
        this.readinessState = readinessState;
        this.preloadFailedCounter = Counter.builder("discover.navigation.cache.preload.attempt_failed")
                .description("Navigation-hierarchy eager-preload attempts (including retries) that failed "
                        + "to load/validate a public-active city's tree.")
                .register(meterRegistry);
    }

    @Async
    @Override
    public void run(ApplicationArguments args) {
        try {
            List<PublicActiveCityRevision> targets = reader.findAll(); // query #1

            if (targets.isEmpty()) {
                log.info("NavigationCachePreloadRunner: no public-active city has a PROMOTED navigation "
                        + "revision — readiness READY (nothing required)");
                readinessState.markReady();
                return;
            }

            List<Integer> cityIds = new ArrayList<>(targets.size());
            for (PublicActiveCityRevision t : targets) {
                cityIds.add(t.cityId());
            }
            List<NavigationNode> allNodes =
                    navigationNodeRepository.findByCityIdInOrderByCityIdAscDepthAscDisplayOrderAsc(cityIds); // query #2

            Map<Integer, List<NavigationNode>> nodesByCityId = new LinkedHashMap<>();
            for (NavigationNode n : allNodes) {
                nodesByCityId.computeIfAbsent(n.getCityId(), k -> new ArrayList<>()).add(n);
            }

            boolean allLoaded = true;
            for (PublicActiveCityRevision target : targets) {
                boolean ok = loadWithRetries(target, nodesByCityId.getOrDefault(target.cityId(), List.of()));
                allLoaded = allLoaded && ok;
            }

            if (allLoaded) {
                readinessState.markReady();
                log.info("NavigationCachePreloadRunner: preloaded {} public-active cit{} — readiness READY",
                        targets.size(), targets.size() == 1 ? "y" : "ies");
            } else {
                log.error("NavigationCachePreloadRunner: one or more public-active cities failed to preload "
                        + "after {} attempts each — readiness stays NOT-READY until the configured timeout "
                        + "degrades it to lazy-load", props.getPreloadMaxRetries());
            }
        } catch (Exception e) {
            log.error("NavigationCachePreloadRunner: preload failed unexpectedly — readiness stays "
                    + "NOT-READY until the configured timeout degrades it to lazy-load", e);
        }
    }

    /** @return true iff the city loaded successfully (first attempt or a retry). */
    private boolean loadWithRetries(PublicActiveCityRevision target, List<NavigationNode> firstAttemptNodes) {
        int maxAttempts = props.getPreloadMaxRetries();
        Exception lastError = null;
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                List<NavigationNode> nodes = attempt == 1
                        ? firstAttemptNodes
                        : navigationNodeRepository.findByCityIdOrderByDepthAscDisplayOrderAsc(target.cityId());
                NavigationGraph graph =
                        loader.validateAndBuild(target.citySlug(), target.cityId(), target.revisionId(), nodes);
                cache.seed(target.citySlug(), target.cityId(), target.revisionId(), graph);
                log.info("NavigationCachePreloadRunner: preloaded citySlug={} revisionId={} nodeCount={} "
                                + "attempt={}",
                        target.citySlug(), target.revisionId(), nodes.size(), attempt);
                return true;
            } catch (Exception e) {
                lastError = e;
                preloadFailedCounter.increment();
                if (attempt < maxAttempts) {
                    long backoffMillis = jitteredBackoffMillis(attempt);
                    log.warn("NavigationCachePreloadRunner: preload attempt {}/{} failed citySlug={} "
                                    + "revisionId={} — retrying in {}ms: {}",
                            attempt, maxAttempts, target.citySlug(), target.revisionId(), backoffMillis,
                            e.getMessage());
                    sleep(backoffMillis);
                }
            }
        }
        log.error("NavigationCachePreloadRunner: citySlug={} revisionId={} exhausted {} preload attempts — "
                        + "this public-active city stays uncached",
                target.citySlug(), target.revisionId(), maxAttempts, lastError);
        return false;
    }

    private long jitteredBackoffMillis(int attempt) {
        long base = props.getPreloadRetryBackoffMillis() * (1L << (attempt - 1));
        long jitter = ThreadLocalRandom.current().nextLong(0, Math.max(1, base / 2));
        return base + jitter;
    }

    private void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
    }
}

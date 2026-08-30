package com.example.realestate.discover.navigation;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Ticker;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
import java.util.OptionalLong;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/**
 * Caffeine-backed cache holder for {@link NavigationGraph}s, plus the ONLY mutable state in the
 * cache lifecycle — a per-city active-revision pointer (#1955 Areas PR A, SLICE 2d). Mirrors
 * {@code CachingDiscoverSummaryService}'s single-cache-field Caffeine style, extended with a
 * second (preview) cache and the pointer map this slice's atomic-swap/grace-eviction contract
 * requires.
 *
 * <h2>Two independent caches (preview isolation, AC8)</h2>
 * {@code productionCache} backs every real city's active graph; {@code previewCache} backs
 * sandbox/preview graphs loaded on demand by a future admin-preview slice. They are structurally
 * separate {@link Cache} instances with separate size/TTL bounds — a preview graph can NEVER be
 * read through {@link #getActiveGraph}, and {@link #activePointers} (production only) is never
 * consulted or mutated by {@link #getOrLoadPreview}.
 *
 * <h2>Refresh order is LOAD-BEARING (never evict-then-load)</h2>
 * See {@link #refreshActiveRevision} javadoc.
 */
@Component
@EnableConfigurationProperties(NavigationCacheProperties.class)
public class NavigationGraphCache {

    private static final Logger log = LoggerFactory.getLogger(NavigationGraphCache.class);

    private final NavigationGraphLoader loader;
    private final NavigationCacheProperties props;
    private final Cache<NavigationGraphKey, NavigationGraph> productionCache;
    private final Cache<NavigationGraphKey, NavigationGraph> previewCache;
    private final ConcurrentHashMap<String, ActivePointer> activePointers = new ConcurrentHashMap<>();
    private final ScheduledExecutorService graceScheduler;

    @Autowired
    public NavigationGraphCache(NavigationGraphLoader loader, NavigationCacheProperties props) {
        this(loader, props, Ticker.systemTicker());
    }

    /** Package-private constructor with an injectable {@link Ticker} for deterministic tests. */
    NavigationGraphCache(NavigationGraphLoader loader, NavigationCacheProperties props, Ticker ticker) {
        this.loader = loader;
        this.props = props;
        this.productionCache = Caffeine.newBuilder()
                .maximumSize(props.getMaxSize())
                .expireAfterAccess(Duration.ofSeconds(props.getTtlSeconds()))
                .ticker(ticker)
                .build();
        this.previewCache = Caffeine.newBuilder()
                .maximumSize(props.getPreviewMaxSize())
                .expireAfterWrite(Duration.ofSeconds(props.getPreviewTtlSeconds()))
                .ticker(ticker)
                .build();
        ThreadFactory graceThreadFactory = r -> {
            Thread t = new Thread(r, "navigation-cache-grace-evict");
            t.setDaemon(true);
            return t;
        };
        this.graceScheduler = Executors.newSingleThreadScheduledExecutor(graceThreadFactory);
    }

    /** (cityId, revisionId) pointer — the only mutable state this class holds. */
    private record ActivePointer(int cityId, long revisionId) {
    }

    /**
     * (#2028) A cached city paired with the revisionId that was active for it at snapshot time —
     * returned by {@link #cachedCityRevisions()} so a caller can later perform a revision-aware
     * compare-and-remove via {@link #evictIfActiveRevision} instead of an unconditional evict.
     */
    public record CachedCityRevision(String citySlug, long revisionId) {
    }

    /**
     * Seeds the cache + active pointer for a city — used ONLY by the eager startup preload (never
     * mid-flight; a running instance always goes through {@link #refreshActiveRevision} instead,
     * which enforces load-before-swap).
     */
    public void seed(String citySlug, int cityId, long revisionId, NavigationGraph graph) {
        productionCache.put(new NavigationGraphKey(citySlug, revisionId), graph);
        activePointers.put(citySlug, new ActivePointer(cityId, revisionId));
    }

    /**
     * Resolves the active graph for a city. Empty if the city has never been seeded/refreshed (no
     * PROMOTED revision known yet). On a cache miss for a known pointer, loads via {@link
     * NavigationGraphLoader#loadValidated} inside Caffeine's atomic {@code get(key, mappingFn)} —
     * concurrent callers for the same key coalesce onto one load (request-time single-flight,
     * AC7), and a thrown validation failure is never cached (Caffeine never inserts when the
     * mapping function throws).
     */
    public Optional<NavigationGraph> getActiveGraph(String citySlug) {
        ActivePointer pointer = activePointers.get(citySlug);
        if (pointer == null) {
            return Optional.empty();
        }
        NavigationGraphKey key = new NavigationGraphKey(citySlug, pointer.revisionId());
        NavigationGraph graph = productionCache.get(
                key, k -> loader.loadValidated(citySlug, pointer.cityId(), pointer.revisionId()));
        return Optional.ofNullable(graph);
    }

    /** The revisionId the cache currently believes is active for a city, or empty if unknown. */
    public OptionalLong activeRevisionId(String citySlug) {
        ActivePointer pointer = activePointers.get(citySlug);
        return pointer == null ? OptionalLong.empty() : OptionalLong.of(pointer.revisionId());
    }

    /**
     * (#1956 D11, revised #2028) Every city slug this cache currently believes has an active
     * pointer, PAIRED WITH the revisionId active for it at snapshot time — used by {@code
     * NavigationHierarchySafetyPoller} to find a cached city the DB no longer reports a PROMOTED
     * revision for (de-promoted/rolled back/deactivated), so it can be {@link
     * #evictIfActiveRevision evicted} rather than serving a stale graph forever. Capturing the
     * revisionId alongside the slug (rather than the slug alone) is what lets the caller later
     * evict conditionally: a promotion can land after this snapshot but before the caller's
     * eviction call, and only a revision-aware compare-and-remove can tell "still the stale
     * revision I saw" apart from "already replaced by a newer one." A defensive copy — never the
     * live entry set — so a caller iterating it is unaffected by a concurrent {@link
     * #refreshActiveRevision} or {@link #evictIfActiveRevision}.
     */
    public Set<CachedCityRevision> cachedCityRevisions() {
        Set<CachedCityRevision> snapshot = new HashSet<>();
        for (Map.Entry<String, ActivePointer> entry : activePointers.entrySet()) {
            snapshot.add(new CachedCityRevision(entry.getKey(), entry.getValue().revisionId()));
        }
        return Set.copyOf(snapshot);
    }

    /**
     * (#1956 D11, revised #2028) Evicts {@code citySlug}'s active pointer and cached graph ONLY IF
     * the cache's current active revision for that city is still {@code expectedRevisionId} —
     * called when the database no longer has ANY PROMOTED revision for this city (de-promotion,
     * rollback, or deactivation), the gap {@link #refreshActiveRevision} does not cover.
     *
     * <p><b>Why the compare is load-bearing:</b> the caller (the safety poller) reads the DB's
     * promoted-revision set, finds this city absent, and only THEN calls this method. A promotion
     * can land — via the AFTER_COMMIT listener calling {@link #refreshActiveRevision} on a
     * completely different thread — in the window between that DB read and this call, installing
     * a NEWER active pointer for the same {@code citySlug}. An unconditional {@code remove(key)}
     * would delete that freshly-promoted pointer along with its cache entry, wiping out a
     * hierarchy that was just made active. Comparing against the exact {@link ActivePointer}
     * observed at snapshot time turns the removal into a true CAS: it only succeeds if nothing
     * changed the pointer in between. {@link ActivePointer} is a record (value equality), so
     * {@code ConcurrentHashMap.remove(key, expectedValue)} performs this atomically in one call —
     * a get-then-remove sequence would reopen exactly the race this method exists to close, since
     * another thread's swap could land between the get and the remove.
     *
     * @return true if the pointer/graph were actually removed; false if no pointer was cached, or
     *     a different/newer revision is now active (a no-op in that case — the newer revision is
     *     left untouched).
     */
    public boolean evictIfActiveRevision(String citySlug, long expectedRevisionId) {
        ActivePointer current = activePointers.get(citySlug);
        if (current == null || current.revisionId() != expectedRevisionId) {
            return false;
        }
        boolean removed = activePointers.remove(citySlug, current);
        if (removed) {
            productionCache.invalidate(new NavigationGraphKey(citySlug, expectedRevisionId));
        }
        return removed;
    }

    /**
     * Refreshes a city onto {@code newRevisionId} — called by the AFTER_COMMIT promotion listener
     * and by the safety poller on drift. STRICT order (LOAD-BEARING — never evict-then-load):
     * <ol>
     *   <li>load + validate + build the NEW revision's graph ({@link
     *       NavigationGraphLoader#loadValidated}) — if this throws, this method propagates the
     *       exception WITHOUT touching the cache or the pointer, so the OLD revision keeps serving
     *       untouched;</li>
     *   <li>cache the new graph under its own key;</li>
     *   <li>ATOMIC active-pointer swap (a single {@code ConcurrentHashMap.put});</li>
     *   <li>retain the OLD graph's cache entry for {@code gracePeriodSeconds} (a scheduled
     *       one-shot eviction), never evicted synchronously in this call — an in-flight request
     *       that resolved the old pointer a moment before the swap can still complete against a
     *       coherent graph.</li>
     * </ol>
     * A no-op (returns immediately) when the requested revision is already active.
     */
    public void refreshActiveRevision(String citySlug, int cityId, long newRevisionId) {
        ActivePointer previous = activePointers.get(citySlug);
        if (previous != null && previous.revisionId() == newRevisionId) {
            log.debug("NavigationGraphCache: citySlug={} already active at revisionId={} — no-op",
                    citySlug, newRevisionId);
            return;
        }

        NavigationGraph newGraph = loader.loadValidated(citySlug, cityId, newRevisionId); // (1) may throw — old stays active

        NavigationGraphKey newKey = new NavigationGraphKey(citySlug, newRevisionId);
        productionCache.put(newKey, newGraph); // (2)

        activePointers.put(citySlug, new ActivePointer(cityId, newRevisionId)); // (3) atomic swap

        if (previous != null) {
            NavigationGraphKey oldKey = new NavigationGraphKey(citySlug, previous.revisionId());
            long graceSeconds = props.getGracePeriodSeconds();
            graceScheduler.schedule(() -> productionCache.invalidate(oldKey), graceSeconds, TimeUnit.SECONDS); // (4)
            log.info("NavigationGraphCache: citySlug={} refreshed revisionId {} -> {} (old evicted in {}s)",
                    citySlug, previous.revisionId(), newRevisionId, graceSeconds);
        } else {
            log.info("NavigationGraphCache: citySlug={} activated at revisionId={} (first load)",
                    citySlug, newRevisionId);
        }
    }

    /**
     * Preview/sandbox namespace — structurally separate from {@link #productionCache} and {@link
     * #activePointers}. {@code previewKey} MUST be caller-namespaced (e.g. prefixed) so it can
     * never collide with a real {@code citySlug}; this class does not enforce that prefix itself,
     * but never reads or writes {@link #activePointers} from this method, so even a colliding key
     * could not affect production routing.
     */
    public NavigationGraph getOrLoadPreview(String previewKey, long revisionId, Supplier<NavigationGraph> loaderFn) {
        NavigationGraphKey key = new NavigationGraphKey(previewKey, revisionId);
        return previewCache.get(key, k -> loaderFn.get());
    }

    /** Exposed for tests only. */
    long estimatedProductionSize() {
        return productionCache.estimatedSize();
    }

    /** Exposed for tests only. */
    long estimatedPreviewSize() {
        return previewCache.estimatedSize();
    }

    @PreDestroy
    void shutdown() {
        graceScheduler.shutdownNow();
    }
}

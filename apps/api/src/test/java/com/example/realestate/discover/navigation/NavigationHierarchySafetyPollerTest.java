package com.example.realestate.discover.navigation;

import com.github.benmanes.caffeine.cache.Ticker;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.OptionalLong;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit test for {@link NavigationHierarchySafetyPoller} (#1956 D11, revised #2028) — the exact bug
 * that reached production: a de-promoted city (withdrawn PROMOTED revision) kept serving its stale
 * cached graph forever because {@code reconcile()} only ever iterated cities the DB CURRENTLY
 * reports as PROMOTED. This test proves the second pass — eviction of any cached city absent from
 * that result set — while also pinning down the pre-existing repair/no-op paths so they don't
 * regress.
 *
 * <p>#2028 closes a second, narrower race left by the #1956 D11 fix: a promotion can land AFTER
 * the poller's DB read but BEFORE the eviction pass calls into the cache, and an unconditional
 * evict would wipe out the revision that promotion just installed. {@link
 * NavigationGraphCache#evictIfActiveRevision} makes that removal a compare-and-remove; most tests
 * here use a mocked {@link NavigationGraphCache} and assert the poller calls/interprets that API
 * correctly, but {@link #reconcile_promotionLandsBetweenDbReadAndEvictCall_leavesNewlyPromotedRevisionActive()}
 * wires a REAL {@link NavigationGraphCache} so the actual compare-and-remove executes, not a stub.
 *
 * <p>Mirrors {@code AreaRegionReclassOutboxPollerTest}'s style: mocked collaborators
 * ({@link PublicActiveCityRevisionReader}, {@link NavigationGraphCache}) and a real {@link
 * SimpleMeterRegistry} so the poller's self-registered counters work without additional mocking.
 */
@ExtendWith(MockitoExtension.class)
class NavigationHierarchySafetyPollerTest {

    @Mock
    private PublicActiveCityRevisionReader reader;

    @Mock
    private NavigationGraphCache cache;

    private SimpleMeterRegistry meterRegistry;
    private NavigationHierarchySafetyPoller poller;

    @BeforeEach
    void setUp() {
        meterRegistry = new SimpleMeterRegistry();
        poller = new NavigationHierarchySafetyPoller(reader, cache, meterRegistry);
    }

    private double evictedCount() {
        return meterRegistry.get("discover.navigation.cache.safety_poll.evicted").counter().count();
    }

    @Test
    void reconcile_cachedCityAbsentFromPromotedSet_evictsIt() {
        // DB reports no promoted revision at all (de-promoted/rolled-back city 'udupi'), and the
        // cache's compare-and-remove confirms revision 5 (the snapshotted one) is still active —
        // a genuinely stale entry, so it IS evicted. Cycle-1 baseline behaviour, preserved.
        when(reader.findAll()).thenReturn(List.of());
        when(cache.cachedCityRevisions())
                .thenReturn(Set.of(new NavigationGraphCache.CachedCityRevision("udupi", 5L)));
        when(cache.evictIfActiveRevision("udupi", 5L)).thenReturn(true);

        poller.reconcile();

        verify(cache).evictIfActiveRevision("udupi", 5L);
        verify(cache, never()).refreshActiveRevision(anyString(), anyInt(), anyLong());
        assertThat(evictedCount()).isEqualTo(1.0);
    }

    @Test
    void reconcile_cachedRevisionMatchesPromoted_trueNoop() {
        PublicActiveCityRevision target = new PublicActiveCityRevision(1, "bengaluru", 42L);
        when(reader.findAll()).thenReturn(List.of(target));
        when(cache.activeRevisionId("bengaluru")).thenReturn(OptionalLong.of(42L));
        when(cache.cachedCityRevisions())
                .thenReturn(Set.of(new NavigationGraphCache.CachedCityRevision("bengaluru", 42L)));

        poller.reconcile();

        verify(cache, never()).refreshActiveRevision(anyString(), anyInt(), anyLong());
        verify(cache, never()).evictIfActiveRevision(anyString(), anyLong());
        assertThat(evictedCount()).isEqualTo(0.0);
    }

    @Test
    void reconcile_cachedRevisionDiffersFromPromoted_refreshesDrift() {
        PublicActiveCityRevision target = new PublicActiveCityRevision(1, "bengaluru", 43L);
        when(reader.findAll()).thenReturn(List.of(target));
        when(cache.activeRevisionId("bengaluru")).thenReturn(OptionalLong.of(42L));
        when(cache.cachedCityRevisions())
                .thenReturn(Set.of(new NavigationGraphCache.CachedCityRevision("bengaluru", 42L)));

        poller.reconcile();

        verify(cache).refreshActiveRevision("bengaluru", 1, 43L);
        verify(cache, never()).evictIfActiveRevision(anyString(), anyLong());
    }

    @Test
    void reconcile_promotedButNotCached_refreshesFirstLoad() {
        PublicActiveCityRevision target = new PublicActiveCityRevision(2, "manipal", 7L);
        when(reader.findAll()).thenReturn(List.of(target));
        when(cache.activeRevisionId("manipal")).thenReturn(OptionalLong.empty());
        when(cache.cachedCityRevisions()).thenReturn(Set.of());

        poller.reconcile();

        verify(cache).refreshActiveRevision("manipal", 2, 7L);
        verify(cache, never()).evictIfActiveRevision(anyString(), anyLong());
    }

    /**
     * (#2028) The newer-revision case: by the time the eviction pass runs, the cache's active
     * revision for the (still DB-absent) city no longer matches what was snapshotted — modelling
     * {@code evictIfActiveRevision} correctly returning false because something else (a concurrent
     * promotion) changed the pointer first. The poller must NOT count this as an eviction or log it
     * as one; it must simply trust the boolean.
     */
    @Test
    void reconcile_cacheReportsRevisionAlreadyChanged_doesNotCountAsEviction() {
        when(reader.findAll()).thenReturn(List.of());
        when(cache.cachedCityRevisions())
                .thenReturn(Set.of(new NavigationGraphCache.CachedCityRevision("manipal", 7L)));
        when(cache.evictIfActiveRevision("manipal", 7L)).thenReturn(false);

        poller.reconcile();

        verify(cache).evictIfActiveRevision("manipal", 7L);
        assertThat(evictedCount()).isEqualTo(0.0);
    }

    /**
     * (#2028) The exact race this cycle closes, exercised against a REAL {@link
     * NavigationGraphCache} (not a mock) so the actual {@code ConcurrentHashMap.remove(key, value)}
     * compare-and-remove runs: a promotion's {@code AFTER_COMMIT} listener calls {@code
     * cache.refreshActiveRevision(...)} on a different thread, landing strictly AFTER this poll's
     * {@code reader.findAll()} DB read (which still reflects "no promoted revision for manipal")
     * but BEFORE the poller's later eviction-pass call into the cache. Modelled here via a {@code
     * thenAnswer} on {@code reader.findAll()} that performs the concurrent refresh as a side effect
     * of returning the DB read's result — i.e. exactly in the window between the DB read and the
     * eviction pass, since nothing else runs in between in this single-threaded poll.
     *
     * <p>Asserts the newly-promoted revision (8) is still active afterwards and the old graph was
     * never wiped — the failure mode of an unconditional {@code evict(citySlug)}, which would have
     * removed whatever the CURRENT pointer was (revision 8, the freshly-promoted one) instead of
     * the stale revision 7 the poller actually meant to remove.
     */
    @Test
    void reconcile_promotionLandsBetweenDbReadAndEvictCall_leavesNewlyPromotedRevisionActive() {
        NavigationCacheProperties props = new NavigationCacheProperties();
        props.setGracePeriodSeconds(30);
        props.setMaxSize(100);
        props.setTtlSeconds(3600);
        props.setPreviewMaxSize(10);
        props.setPreviewTtlSeconds(60);

        NavigationGraphLoader loader = mock(NavigationGraphLoader.class);
        NavigationGraphCache realCache = new NavigationGraphCache(loader, props, Ticker.systemTicker());

        NavigationGraph staleGraph = NavigationGraph.build("manipal", 7L, List.of());
        realCache.seed("manipal", 2, 7L, staleGraph);

        NavigationGraph promotedGraph = NavigationGraph.build("manipal", 8L, List.of());
        when(loader.loadValidated("manipal", 2, 8L)).thenReturn(promotedGraph);

        SimpleMeterRegistry realMeterRegistry = new SimpleMeterRegistry();
        NavigationHierarchySafetyPoller realPoller =
                new NavigationHierarchySafetyPoller(reader, realCache, realMeterRegistry);

        // As a side effect of this poll's DB read completing, a concurrent promotion commits and
        // refreshes the cache directly — landing after cachedCityRevisions()/findAll() were read
        // by this poll, but before the eviction pass below calls evictIfActiveRevision.
        when(reader.findAll()).thenAnswer(invocation -> {
            realCache.refreshActiveRevision("manipal", 2, 8L);
            return List.of(); // this poll's own DB read still saw no promoted revision for manipal
        });

        realPoller.reconcile();

        assertThat(realCache.activeRevisionId("manipal")).hasValue(8L);
        assertThat(realCache.getActiveGraph("manipal")).contains(promotedGraph);
        assertThat(realMeterRegistry.get("discover.navigation.cache.safety_poll.evicted")
                .counter().count()).isEqualTo(0.0);
    }

    /**
     * Regression test for the cycle-1 false-eviction race: a promotion's {@code AFTER_COMMIT}
     * listener calls {@code cache.refreshActiveRevision(...)} on the COMMITTING thread,
     * independently of this poller's thread, so a promotion can land in the gap between the
     * poller's two snapshot reads. Unlike the other tests here (which stub two mutually-consistent
     * static snapshots), this test makes the read ORDER itself observable: whichever of {@code
     * reader.findAll()} / {@code cache.cachedCityRevisions()} is invoked FIRST sees the
     * pre-promotion state (city not yet promoted / not yet cached); whichever is invoked SECOND
     * sees the post-promotion state (promoted in the DB / refreshed into the cache by the
     * concurrent AFTER_COMMIT listener) — modelling a promotion committing exactly in the
     * interleaving window between the two reads, regardless of which read happens first.
     *
     * <p>With the buggy DB-first/cache-second read order, {@code reader.findAll()} (called
     * first) misses the promotion and returns no targets, while {@code cache.cachedCityRevisions()}
     * (called second) already reflects the concurrently-refreshed cache — so the eviction pass
     * wrongly evicts the city whose graph the promotion just installed. With the fixed
     * cache-first/DB-second order, the cache snapshot (taken first) is guaranteed older than the
     * DB read (taken second), so the DB read cannot miss any promotion the cache snapshot missed
     * — the promoted city always appears in {@code targetSlugs} too, and eviction never fires for
     * it.
     */
    @Test
    void reconcile_promotionCommitsBetweenCacheAndDbReads_neverEvictsNewlyPromotedCity() {
        AtomicInteger callOrder = new AtomicInteger(0);
        PublicActiveCityRevision target = new PublicActiveCityRevision(2, "manipal", 7L);

        when(cache.cachedCityRevisions()).thenAnswer(invocation ->
                callOrder.incrementAndGet() == 1
                        ? Set.<NavigationGraphCache.CachedCityRevision>of()
                        : Set.of(new NavigationGraphCache.CachedCityRevision("manipal", 7L)));
        when(reader.findAll()).thenAnswer(invocation ->
                callOrder.incrementAndGet() == 1 ? List.of() : List.of(target));
        when(cache.activeRevisionId("manipal")).thenReturn(OptionalLong.empty());

        poller.reconcile();

        verify(cache, never()).evictIfActiveRevision(anyString(), anyLong());
    }
}

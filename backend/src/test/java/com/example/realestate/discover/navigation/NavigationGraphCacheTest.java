package com.example.realestate.discover.navigation;

import com.github.benmanes.caffeine.cache.Ticker;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Pure unit test (mocked {@link NavigationGraphLoader}, no Spring, no DB) for {@link
 * NavigationGraphCache}'s lifecycle mechanics (#1955 Areas PR A, SLICE 2d): seed/resolve,
 * load-before-swap refresh (success + failure), grace-period eviction, preview isolation, and
 * concurrent-miss coalescing. DB-integration correctness (real preload queries, event/poller
 * wiring) is covered separately by {@code NavigationGraphCacheLifecycleIT}.
 */
class NavigationGraphCacheTest {

    private static NavigationCacheProperties props(int gracePeriodSeconds) {
        NavigationCacheProperties p = new NavigationCacheProperties();
        p.setGracePeriodSeconds(gracePeriodSeconds);
        p.setMaxSize(100);
        p.setTtlSeconds(3600);
        p.setPreviewMaxSize(10);
        p.setPreviewTtlSeconds(60);
        return p;
    }

    private static NavigationGraph fakeGraph(String citySlug, long revisionId) {
        return NavigationGraph.build(citySlug, revisionId, List.of());
    }

    @Test
    @DisplayName("seed + getActiveGraph: resolves the seeded graph without invoking the loader")
    void seedThenGetActiveGraph_doesNotInvokeLoader() {
        NavigationGraphLoader loader = mock(NavigationGraphLoader.class);
        NavigationGraphCache cache = new NavigationGraphCache(loader, props(30), Ticker.systemTicker());

        NavigationGraph seeded = fakeGraph("city-a", 1L);
        cache.seed("city-a", 42, 1L, seeded);

        assertThat(cache.getActiveGraph("city-a")).contains(seeded);
        verify(loader, times(0)).loadValidated(anyString(), anyInt(), anyLong());
    }

    @Test
    @DisplayName("getActiveGraph: unknown city returns empty without invoking the loader")
    void getActiveGraph_unknownCity_returnsEmpty() {
        NavigationGraphLoader loader = mock(NavigationGraphLoader.class);
        NavigationGraphCache cache = new NavigationGraphCache(loader, props(30), Ticker.systemTicker());

        assertThat(cache.getActiveGraph("never-seeded")).isEmpty();
        verify(loader, times(0)).loadValidated(anyString(), anyInt(), anyLong());
    }

    @Test
    @DisplayName("refreshActiveRevision: load-before-swap — a failed load throws and leaves the "
            + "old pointer/graph completely untouched")
    void refresh_failedLoad_leavesOldPointerUntouched() {
        NavigationGraphLoader loader = mock(NavigationGraphLoader.class);
        NavigationGraphCache cache = new NavigationGraphCache(loader, props(30), Ticker.systemTicker());

        NavigationGraph oldGraph = fakeGraph("city-b", 1L);
        cache.seed("city-b", 7, 1L, oldGraph);

        when(loader.loadValidated("city-b", 7, 2L))
                .thenThrow(new NavigationTreeValidationException(new ValidationReport(List.of(
                        new ValidationError("EMPTY_TREE", "boom", null)))));

        assertThatThrownBy(() -> cache.refreshActiveRevision("city-b", 7, 2L))
                .isInstanceOf(NavigationTreeValidationException.class);

        assertThat(cache.activeRevisionId("city-b")).hasValue(1L);
        assertThat(cache.getActiveGraph("city-b")).contains(oldGraph);
    }

    @Test
    @DisplayName("refreshActiveRevision: successful load atomically swaps the pointer to the new "
            + "revision")
    void refresh_success_swapsPointer() {
        NavigationGraphLoader loader = mock(NavigationGraphLoader.class);
        NavigationGraphCache cache = new NavigationGraphCache(loader, props(30), Ticker.systemTicker());

        cache.seed("city-c", 9, 1L, fakeGraph("city-c", 1L));
        NavigationGraph newGraph = fakeGraph("city-c", 2L);
        when(loader.loadValidated("city-c", 9, 2L)).thenReturn(newGraph);

        cache.refreshActiveRevision("city-c", 9, 2L);

        assertThat(cache.activeRevisionId("city-c")).hasValue(2L);
        assertThat(cache.getActiveGraph("city-c")).contains(newGraph);
    }

    @Test
    @DisplayName("refreshActiveRevision: requesting the already-active revision is a true no-op — "
            + "the loader is never invoked")
    void refresh_alreadyActive_isNoOp() {
        NavigationGraphLoader loader = mock(NavigationGraphLoader.class);
        NavigationGraphCache cache = new NavigationGraphCache(loader, props(30), Ticker.systemTicker());
        cache.seed("city-d", 11, 1L, fakeGraph("city-d", 1L));

        cache.refreshActiveRevision("city-d", 11, 1L);

        verify(loader, times(0)).loadValidated(anyString(), anyInt(), anyLong());
        assertThat(cache.activeRevisionId("city-d")).hasValue(1L);
    }

    @Test
    @DisplayName("refreshActiveRevision: the OLD revision's cache entry is evicted only after the "
            + "configured grace period")
    void refresh_evictsOldEntryAfterGracePeriod() throws InterruptedException {
        NavigationGraphLoader loader = mock(NavigationGraphLoader.class);
        NavigationGraphCache cache = new NavigationGraphCache(loader, props(1), Ticker.systemTicker());

        cache.seed("city-e", 13, 1L, fakeGraph("city-e", 1L));
        NavigationGraph newGraph = fakeGraph("city-e", 2L);
        when(loader.loadValidated("city-e", 13, 2L)).thenReturn(newGraph);
        cache.refreshActiveRevision("city-e", 13, 2L);

        assertThat(cache.estimatedProductionSize()).isEqualTo(2); // old (rev1) + new (rev2) coexist

        long deadline = System.currentTimeMillis() + 5000;
        while (cache.estimatedProductionSize() > 1 && System.currentTimeMillis() < deadline) {
            Thread.sleep(100);
        }
        assertThat(cache.estimatedProductionSize()).isEqualTo(1); // rev1 evicted post-grace
    }

    @Test
    @DisplayName("preview isolation: getOrLoadPreview never affects the production active pointer")
    void previewNamespace_neverTouchesProductionPointer() {
        NavigationGraphLoader loader = mock(NavigationGraphLoader.class);
        NavigationGraphCache cache = new NavigationGraphCache(loader, props(30), Ticker.systemTicker());
        cache.seed("city-f", 15, 1L, fakeGraph("city-f", 1L));

        NavigationGraph preview = cache.getOrLoadPreview("preview:city-f", 99L,
                () -> fakeGraph("preview:city-f", 99L));

        assertThat(preview.revisionId()).isEqualTo(99L);
        assertThat(cache.activeRevisionId("city-f")).hasValue(1L);
        assertThat(cache.getActiveGraph("city-f").orElseThrow().revisionId()).isEqualTo(1L);
    }

    @Test
    @DisplayName("request-time single-flight: concurrent getActiveGraph misses for the SAME "
            + "known-pointer-but-uncached key coalesce onto exactly one loader invocation")
    void concurrentMisses_coalesceOntoSingleLoaderCall() throws Exception {
        NavigationGraphLoader loader = mock(NavigationGraphLoader.class);
        NavigationGraphCache cache = new NavigationGraphCache(loader, props(30), Ticker.systemTicker());

        AtomicInteger invocationCount = new AtomicInteger();
        CountDownLatch releaseLoader = new CountDownLatch(1);
        when(loader.loadValidated("city-g", 21, 1L)).thenAnswer(invocation -> {
            invocationCount.incrementAndGet();
            releaseLoader.await(5, TimeUnit.SECONDS);
            return fakeGraph("city-g", 1L);
        });

        // Sets the active pointer directly (bypassing seed(), which always caches a graph too) —
        // the ONLY way to reach the genuine "pointer known, cache entry absent" state getActiveGraph
        // 's single-flight fallback exists for (the real-world trigger is a TTL/size eviction).
        setPointerDirectly(cache, "city-g", 21, 1L);

        int threadCount = 8;
        ExecutorService pool = Executors.newFixedThreadPool(threadCount);
        try {
            CountDownLatch ready = new CountDownLatch(threadCount);
            CountDownLatch go = new CountDownLatch(1);
            List<Future<Optional<NavigationGraph>>> futures = new ArrayList<>();
            for (int i = 0; i < threadCount; i++) {
                futures.add(pool.submit(() -> {
                    ready.countDown();
                    go.await(5, TimeUnit.SECONDS);
                    return cache.getActiveGraph("city-g");
                }));
            }
            ready.await(5, TimeUnit.SECONDS);
            go.countDown();
            Thread.sleep(100); // let every thread enter Caffeine.get(key, mappingFn) before releasing it
            releaseLoader.countDown();

            for (Future<Optional<NavigationGraph>> f : futures) {
                assertThat(f.get(10, TimeUnit.SECONDS)).isPresent();
            }
        } finally {
            pool.shutdownNow();
        }

        assertThat(invocationCount.get()).isEqualTo(1);
    }

    @Test
    @DisplayName("evictIfActiveRevision: matching stale revision IS evicted — pointer and cache "
            + "entry both removed")
    void evictIfActiveRevision_matchingRevision_evicts() {
        NavigationGraphLoader loader = mock(NavigationGraphLoader.class);
        NavigationGraphCache cache = new NavigationGraphCache(loader, props(30), Ticker.systemTicker());
        cache.seed("city-h", 17, 1L, fakeGraph("city-h", 1L));

        boolean evicted = cache.evictIfActiveRevision("city-h", 1L);

        assertThat(evicted).isTrue();
        assertThat(cache.activeRevisionId("city-h")).isEmpty();
        assertThat(cache.estimatedProductionSize()).isZero();
    }

    @Test
    @DisplayName("evictIfActiveRevision: a NEWER revision than expected is NOT evicted — the "
            + "compare fails and the current pointer/graph are left untouched")
    void evictIfActiveRevision_newerRevisionActive_doesNotEvict() {
        NavigationGraphLoader loader = mock(NavigationGraphLoader.class);
        NavigationGraphCache cache = new NavigationGraphCache(loader, props(30), Ticker.systemTicker());
        cache.seed("city-i", 19, 1L, fakeGraph("city-i", 1L));

        NavigationGraph newGraph = fakeGraph("city-i", 2L);
        when(loader.loadValidated("city-i", 19, 2L)).thenReturn(newGraph);
        cache.refreshActiveRevision("city-i", 19, 2L); // simulates a promotion that landed first

        boolean evicted = cache.evictIfActiveRevision("city-i", 1L); // stale caller-observed revision

        assertThat(evicted).isFalse();
        assertThat(cache.activeRevisionId("city-i")).hasValue(2L);
        assertThat(cache.getActiveGraph("city-i")).contains(newGraph);
    }

    @Test
    @DisplayName("evictIfActiveRevision: unknown city is a no-op — returns false, invokes nothing")
    void evictIfActiveRevision_unknownCity_returnsFalse() {
        NavigationGraphLoader loader = mock(NavigationGraphLoader.class);
        NavigationGraphCache cache = new NavigationGraphCache(loader, props(30), Ticker.systemTicker());

        assertThat(cache.evictIfActiveRevision("never-seeded", 1L)).isFalse();
    }

    /** Reflection-only test hook: sets {@code NavigationGraphCache}'s private active-pointer map
     *  directly, bypassing {@code seed()} (which always caches a graph too) — see the coalescing
     *  test's javadoc for why this is the only way to reach a genuine miss state in a unit test. */
    @SuppressWarnings("unchecked")
    private static void setPointerDirectly(NavigationGraphCache cache, String citySlug, int cityId, long revisionId) {
        try {
            Field pointersField = NavigationGraphCache.class.getDeclaredField("activePointers");
            pointersField.setAccessible(true);
            ConcurrentHashMap<String, Object> pointers = (ConcurrentHashMap<String, Object>) pointersField.get(cache);

            Class<?> pointerClass = Class.forName(NavigationGraphCache.class.getName() + "$ActivePointer");
            Constructor<?> ctor = pointerClass.getDeclaredConstructor(int.class, long.class);
            ctor.setAccessible(true);
            Object pointer = ctor.newInstance(cityId, revisionId);

            pointers.put(citySlug, pointer);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException(e);
        }
    }
}

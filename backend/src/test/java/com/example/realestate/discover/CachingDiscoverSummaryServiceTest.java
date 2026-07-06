package com.example.realestate.discover;

import com.github.benmanes.caffeine.cache.Ticker;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link CachingDiscoverSummaryService} (#1760).
 *
 * <p>Uses a real {@link RoutingDiscoverSummaryService} instance (constructed with a mocked
 * {@link DiscoverSummaryService}, matching {@link RoutingDiscoverSummaryServiceTest}'s pattern)
 * as the delegate so tests exercise the actual dependency-injection shape the decorator will see
 * in production: {@code CachingDiscoverSummaryService} wraps {@code RoutingDiscoverSummaryService}
 * by concrete type, not the {@link DiscoverSummaryPort} interface.
 */
@ExtendWith(MockitoExtension.class)
class CachingDiscoverSummaryServiceTest {

    @Mock
    private DiscoverSummaryService postgresService;

    private RoutingDiscoverSummaryService routingDelegate;
    private FakeTicker ticker;

    private static final long TTL_SECONDS = 120;
    private static final long MAX_SIZE = 1000;

    @BeforeEach
    void setUp() {
        // enabled=false, osAdapter=null, shadowRunner=null → RoutingDiscoverSummaryService always
        // delegates straight to postgresService with zero routing overhead, mirroring production
        // defaults (discover.opensearch.enabled=false).
        routingDelegate = new RoutingDiscoverSummaryService(
                postgresService, null, new SimpleMeterRegistry(), false, null);
        ticker = new FakeTicker();
    }

    private CachingDiscoverSummaryService cachingService(boolean enabled) {
        return new CachingDiscoverSummaryService(routingDelegate, enabled, TTL_SECONDS, MAX_SIZE, ticker);
    }

    private static DiscoverSummaryResponse response(long total) {
        return new DiscoverSummaryResponse(
                "udupi", null, "area_group", total, List.of(), List.of(), Instant.now());
    }

    // ── Cache hit collapses delegate calls ─────────────────────────────────────

    @Test
    void repeatedIdenticalQuery_hitsCache_delegateCalledOnce() {
        when(postgresService.getSummary(any())).thenReturn(response(5L));
        CachingDiscoverSummaryService service = cachingService(true);
        SummaryQuery query = new SummaryQuery("udupi", null, "area_group", 8, null);

        DiscoverSummaryResponse first = service.getSummary(query);
        DiscoverSummaryResponse second = service.getSummary(query);
        DiscoverSummaryResponse third = service.getSummary(query);

        assertThat(second).isSameAs(first);
        assertThat(third).isSameAs(first);
        verify(postgresService, times(1)).getSummary(any());
    }

    // ── TTL expiry via fake Ticker ───────────────────────────────────────────────

    @Test
    void afterTtlExpiry_delegateCalledAgain_freshResponseReturned() {
        when(postgresService.getSummary(any()))
                .thenReturn(response(5L))
                .thenReturn(response(9L));
        CachingDiscoverSummaryService service = cachingService(true);
        SummaryQuery query = new SummaryQuery("udupi", null, "area_group", 8, null);

        DiscoverSummaryResponse first = service.getSummary(query);
        assertThat(first.totalActiveListings()).isEqualTo(5L);

        // Still within TTL — cache hit, no second delegate call.
        ticker.advance(Duration.ofSeconds(TTL_SECONDS - 1));
        DiscoverSummaryResponse stillCached = service.getSummary(query);
        assertThat(stillCached).isSameAs(first);

        // Past TTL — must recompute.
        ticker.advance(Duration.ofSeconds(5));
        DiscoverSummaryResponse afterExpiry = service.getSummary(query);
        assertThat(afterExpiry.totalActiveListings()).isEqualTo(9L);

        verify(postgresService, times(2)).getSummary(any());
    }

    // ── Key isolation: city ──────────────────────────────────────────────────────

    @Test
    void differentCity_isDistinctCacheEntry() {
        when(postgresService.getSummary(any())).thenReturn(response(1L), response(2L));
        CachingDiscoverSummaryService service = cachingService(true);

        service.getSummary(new SummaryQuery("udupi", null, "area_group", 8, null));
        service.getSummary(new SummaryQuery("bangalore", null, "area_group", 8, null));

        verify(postgresService, times(2)).getSummary(any());
    }

    // ── Key isolation: listingPurpose sale vs rent vs blended (null) ─────────────

    @Test
    void listingPurpose_saleRentAndBlended_areThreeDistinctCacheEntries() {
        when(postgresService.getSummary(any())).thenReturn(response(1L), response(2L), response(3L));
        CachingDiscoverSummaryService service = cachingService(true);

        service.getSummary(new SummaryQuery("udupi", null, "area_group", 8, "sale"));
        service.getSummary(new SummaryQuery("udupi", null, "area_group", 8, "rent"));
        service.getSummary(new SummaryQuery("udupi", null, "area_group", 8, null));

        verify(postgresService, times(3)).getSummary(any());
    }

    // ── Key isolation: listingPurpose blank/whitespace canonicalises to null (same key) ──

    @Test
    void listingPurpose_blankAndWhitespace_canonicaliseToSameKeyAsNull() {
        when(postgresService.getSummary(any())).thenReturn(response(5L));
        CachingDiscoverSummaryService service = cachingService(true);

        DiscoverSummaryResponse omitted = service.getSummary(
                new SummaryQuery("udupi", null, "area_group", 8, null));
        DiscoverSummaryResponse blank = service.getSummary(
                new SummaryQuery("udupi", null, "area_group", 8, ""));
        DiscoverSummaryResponse whitespace = service.getSummary(
                new SummaryQuery("udupi", null, "area_group", 8, "   "));

        assertThat(blank).isSameAs(omitted);
        assertThat(whitespace).isSameAs(omitted);
        verify(postgresService, times(1)).getSummary(any());
    }

    // ── Key isolation: listingPurpose invalid value also canonicalises to null ──

    @Test
    void listingPurpose_invalidValue_canonicalisesToSameKeyAsNull() {
        when(postgresService.getSummary(any())).thenReturn(response(5L));
        CachingDiscoverSummaryService service = cachingService(true);

        DiscoverSummaryResponse omitted = service.getSummary(
                new SummaryQuery("udupi", null, "area_group", 8, null));
        DiscoverSummaryResponse bogus = service.getSummary(
                new SummaryQuery("udupi", null, "area_group", 8, "bogus"));

        assertThat(bogus).isSameAs(omitted);
        verify(postgresService, times(1)).getSummary(any());
    }

    // ── Key isolation: propertyType (case preserved — NOT folded) ────────────────

    @Test
    void propertyType_differentCaseVariants_areDistinctCacheEntries() {
        when(postgresService.getSummary(any())).thenReturn(response(1L), response(2L));
        CachingDiscoverSummaryService service = cachingService(true);

        service.getSummary(new SummaryQuery("udupi", "house", "area_group", 8, null));
        service.getSummary(new SummaryQuery("udupi", "HOUSE", "area_group", 8, null));

        // Distinct entries even though the underlying SQL is case-insensitive: the response
        // echoes back the caller's exact-case propertyType, so case must not be folded in the key.
        verify(postgresService, times(2)).getSummary(any());
    }

    @Test
    void propertyType_blankAndWhitespace_canonicaliseToSameKeyAsNull() {
        when(postgresService.getSummary(any())).thenReturn(response(5L));
        CachingDiscoverSummaryService service = cachingService(true);

        DiscoverSummaryResponse omitted = service.getSummary(
                new SummaryQuery("udupi", null, "area_group", 8, null));
        DiscoverSummaryResponse blank = service.getSummary(
                new SummaryQuery("udupi", "", "area_group", 8, null));
        DiscoverSummaryResponse whitespace = service.getSummary(
                new SummaryQuery("udupi", "   ", "area_group", 8, null));

        assertThat(blank).isSameAs(omitted);
        assertThat(whitespace).isSameAs(omitted);
        verify(postgresService, times(1)).getSummary(any());
    }

    // ── Key isolation: groupBy ────────────────────────────────────────────────────

    @Test
    void differentGroupBy_isDistinctCacheEntry() {
        when(postgresService.getSummary(any())).thenReturn(response(1L), response(2L));
        CachingDiscoverSummaryService service = cachingService(true);

        service.getSummary(new SummaryQuery("udupi", null, "area_group", 8, null));
        service.getSummary(new SummaryQuery("udupi", null, "corridor", 8, null));

        verify(postgresService, times(2)).getSummary(any());
    }

    // ── Key isolation: hotspotLimit ───────────────────────────────────────────────

    @Test
    void differentHotspotLimit_isDistinctCacheEntry() {
        when(postgresService.getSummary(any())).thenReturn(response(1L), response(2L));
        CachingDiscoverSummaryService service = cachingService(true);

        service.getSummary(new SummaryQuery("udupi", null, "area_group", 8, null));
        service.getSummary(new SummaryQuery("udupi", null, "area_group", 5, null));

        verify(postgresService, times(2)).getSummary(any());
    }

    // ── Flag-off passthrough: delegate called every time, no caching ────────────

    @Test
    void cacheDisabled_delegateCalledEveryTime_noCaching() {
        when(postgresService.getSummary(any())).thenReturn(response(5L));
        CachingDiscoverSummaryService service = cachingService(false);
        SummaryQuery query = new SummaryQuery("udupi", null, "area_group", 8, null);

        service.getSummary(query);
        service.getSummary(query);
        service.getSummary(query);

        verify(postgresService, times(3)).getSummary(any());
        assertThat(service.estimatedCacheSize()).isZero();
    }

    // ── Atomicity: assembled response cached as one object, same instance on hit ──

    @Test
    void cacheHit_returnsSameInstance_assembledResponseNotMutatedOrRebuilt() {
        DiscoverSummaryResponse canonical = response(5L);
        when(postgresService.getSummary(any())).thenReturn(canonical);
        CachingDiscoverSummaryService service = cachingService(true);
        SummaryQuery query = new SummaryQuery("udupi", null, "area_group", 8, null);

        DiscoverSummaryResponse first = service.getSummary(query);
        DiscoverSummaryResponse second = service.getSummary(query);

        // The cached instance is a defensive immutable-list copy taken at insertion (see
        // #1760 immutability addendum), not the delegate's raw response object — but every
        // cache hit for this key returns the SAME copy, and its content matches the delegate's.
        assertThat(first).isSameAs(second);
        assertThat(first.totalActiveListings()).isEqualTo(canonical.totalActiveListings());
        assertThat(first.city()).isEqualTo(canonical.city());
        assertThat(first.groupBy()).isEqualTo(canonical.groupBy());
    }

    // ── Defensive immutability: cached regions/hotspots reject mutation, content preserved ──

    @Test
    void cachedResponse_regionsAndHotspotsAreImmutableCopies_contentPreservedAndIsolatedFromOriginal() {
        List<DiscoverSummaryResponse.RegionCount> mutableRegions = new ArrayList<>();
        mutableRegions.add(new DiscoverSummaryResponse.RegionCount("north", "North", 3L));
        List<DiscoverSummaryResponse.Hotspot> mutableHotspots = new ArrayList<>();
        mutableHotspots.add(new DiscoverSummaryResponse.Hotspot("area-1", "Area One", 3L, 13.34, 74.74));

        DiscoverSummaryResponse delegateResponse = new DiscoverSummaryResponse(
                "udupi", null, "area_group", 3L, mutableRegions, mutableHotspots, Instant.now());
        when(postgresService.getSummary(any())).thenReturn(delegateResponse);
        CachingDiscoverSummaryService service = cachingService(true);
        SummaryQuery query = new SummaryQuery("udupi", null, "area_group", 8, null);

        DiscoverSummaryResponse cached = service.getSummary(query);

        // Content preserved.
        assertThat(cached.regions()).hasSize(1);
        assertThat(cached.regions().get(0).regionKey()).isEqualTo("north");
        assertThat(cached.hotspots()).hasSize(1);
        assertThat(cached.hotspots().get(0).areaKey()).isEqualTo("area-1");

        // Cached lists reject in-place mutation.
        assertThatThrownBy(() -> cached.regions()
                .add(new DiscoverSummaryResponse.RegionCount("south", "South", 1L)))
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> cached.hotspots()
                .add(new DiscoverSummaryResponse.Hotspot("area-2", "Area Two", 1L, null, null)))
                .isInstanceOf(UnsupportedOperationException.class);

        // Mutating the delegate's ORIGINAL list after the copy was taken must not leak into the
        // cached entry — proving the copy was taken at insertion, not aliased to the delegate's list.
        mutableRegions.add(new DiscoverSummaryResponse.RegionCount("south", "South", 1L));
        mutableHotspots.add(new DiscoverSummaryResponse.Hotspot("area-2", "Area Two", 1L, null, null));
        assertThat(cached.regions()).hasSize(1);
        assertThat(cached.hotspots()).hasSize(1);
    }

    /** Deterministic {@link Ticker} for TTL tests — manually advanced, no wall-clock dependency. */
    private static final class FakeTicker implements Ticker {
        private final AtomicLong nanos = new AtomicLong();

        @Override
        public long read() {
            return nanos.get();
        }

        void advance(Duration duration) {
            nanos.addAndGet(duration.toNanos());
        }
    }
}

package com.example.realestate.discover;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.github.benmanes.caffeine.cache.Ticker;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.List;
import java.util.Set;

/**
 * {@code @Primary} in-process Caffeine TTL cache decorator for discover summary (#1760).
 *
 * <p>Wraps {@link RoutingDiscoverSummaryService} (injected by concrete type, not
 * {@link DiscoverSummaryPort} — this class is itself a {@code DiscoverSummaryPort} bean, so
 * asking Spring for the interface would create an ambiguous/self-referential candidate set).
 * Collapses repeated identical queries within {@code discover.summary.cache.ttl-seconds} into a
 * single origin computation, bounded by {@code discover.summary.cache.max-size} entries.
 *
 * <p><b>Cache key.</b> Five independent dimensions: {@code city}, {@code listingPurpose},
 * {@code propertyType}, {@code groupBy}, {@code hotspotLimit}. {@code listingPurpose} and
 * {@code propertyType} are canonicalised with the SAME normalisation
 * {@link DiscoverSummaryService} applies internally ({@link DiscoverSummaryService#getSummary}
 * around L231-252), so a blank/whitespace/invalid variant collapses onto the same key as an
 * omitted filter — otherwise a cache hit could serve a wrong-shaped response for what the
 * delegate would treat as an equivalent (blended) query.
 *
 * <p>{@code propertyType} is deliberately NOT case-folded here even though the underlying SQL
 * matches case-insensitively ({@code LOWER(pl.property_type) = LOWER(?)}): the assembled
 * {@link DiscoverSummaryResponse#propertyType()} echoes back the caller's exact-case input
 * (see {@code DiscoverSummaryServiceIT#propertyTypeFilter_caseInsensitive_countsThree}), so
 * {@code "house"} and {@code "HOUSE"} are genuinely distinct cache entries even though they
 * would count identically.
 *
 * <p><b>Atomicity.</b> {@link Cache#get(Object, java.util.function.Function)} computes and
 * inserts the assembled response for a given key exactly once, even under concurrent callers —
 * so {@code sum(regions[].listingCount) == totalActiveListings} is always read from a single
 * atomically-cached response object, never a partially-updated one.
 *
 * <p><b>Kill switch.</b> {@code discover.summary.cache.enabled=false} bypasses the cache
 * entirely — the delegate is called on every request, zero behavioural change from pre-#1760.
 */
@Service
@Primary
public class CachingDiscoverSummaryService implements DiscoverSummaryPort {

    /** Mirrors {@link DiscoverSummaryService}'s {@code ALLOWED_LISTING_PURPOSES}. */
    private static final Set<String> ALLOWED_LISTING_PURPOSES = Set.of("sale", "rent");

    private final RoutingDiscoverSummaryService delegate;
    private final boolean cacheEnabled;
    private final Cache<CacheKey, DiscoverSummaryResponse> cache;

    // Explicit @Autowired: this class declares a second (package-private, test-only) constructor,
    // so Spring cannot infer which constructor to use from "single constructor" heuristics alone.
    @Autowired
    public CachingDiscoverSummaryService(
            RoutingDiscoverSummaryService delegate,
            @Value("${discover.summary.cache.enabled:true}") boolean cacheEnabled,
            @Value("${discover.summary.cache.ttl-seconds:120}") long ttlSeconds,
            @Value("${discover.summary.cache.max-size:1000}") long maxSize) {
        this(delegate, cacheEnabled, ttlSeconds, maxSize, Ticker.systemTicker());
    }

    /** Package-private constructor with an injectable {@link Ticker} for deterministic tests. */
    CachingDiscoverSummaryService(
            RoutingDiscoverSummaryService delegate,
            boolean cacheEnabled,
            long ttlSeconds,
            long maxSize,
            Ticker ticker) {
        this.delegate = delegate;
        this.cacheEnabled = cacheEnabled;
        this.cache = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofSeconds(ttlSeconds))
                .maximumSize(maxSize)
                .ticker(ticker)
                .build();
    }

    @Override
    public DiscoverSummaryResponse getSummary(SummaryQuery query) {
        if (!cacheEnabled) {
            return delegate.getSummary(query);
        }
        CacheKey key = CacheKey.from(query);
        return cache.get(key, k -> toImmutableCopy(delegate.getSummary(query)));
    }

    /** Exposed for tests only — number of entries currently held (post-cleanup estimate). */
    long estimatedCacheSize() {
        return cache.estimatedSize();
    }

    /**
     * Returns a defensive copy of {@code response} whose {@code regions}/{@code hotspots} lists
     * are immutable ({@link List#copyOf}), taken once at cache-insertion time.
     *
     * <p>{@link DiscoverSummaryResponse} itself holds whatever list type the delegate handed it
     * (e.g. {@link DiscoverSummaryService} returns plain {@code ArrayList}s from JDBC row
     * mapping) and is out of scope for this class to change. Without this copy, the single
     * cached instance is shared across every concurrent caller for up to
     * {@code discover.summary.cache.ttl-seconds} — any future in-place mutation of a caller's
     * reference (e.g. {@code response.regions().add(...)}) would corrupt every other hit for
     * that key. Copying at insertion (not on every read) keeps cache hits allocation-free.
     */
    private static DiscoverSummaryResponse toImmutableCopy(DiscoverSummaryResponse response) {
        List<DiscoverSummaryResponse.RegionCount> regions =
                response.regions() == null ? List.of() : List.copyOf(response.regions());
        List<DiscoverSummaryResponse.Hotspot> hotspots =
                response.hotspots() == null ? List.of() : List.copyOf(response.hotspots());
        return new DiscoverSummaryResponse(
                response.city(),
                response.propertyType(),
                response.groupBy(),
                response.totalActiveListings(),
                regions,
                hotspots,
                response.generatedAt());
    }

    /**
     * 5-dim immutable cache key. See class-level javadoc for the canonicalisation contract.
     */
    private record CacheKey(
            String city,
            String listingPurpose,
            String propertyType,
            String groupBy,
            int hotspotLimit) {

        static CacheKey from(SummaryQuery query) {
            return new CacheKey(
                    query.city(),
                    normalizeListingPurpose(query.listingPurpose()),
                    normalizePropertyType(query.propertyType()),
                    query.groupBy(),
                    query.hotspotLimit());
        }
    }

    /**
     * Mirrors {@link DiscoverSummaryService}'s private {@code normalizeFilter(String)} exactly:
     * trims and collapses blank/whitespace-only to {@code null}; case is preserved.
     */
    private static String normalizePropertyType(String propertyType) {
        if (propertyType == null) {
            return null;
        }
        String trimmed = propertyType.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * Mirrors {@link DiscoverSummaryService}'s private {@code normalizeListingPurpose(String)}
     * exactly: trims, then only an exact-case {@code "sale"}/{@code "rent"} match is kept —
     * everything else (blank, whitespace, invalid values, wrong case) normalises to {@code null}
     * (blended), matching the delegate's fallback-to-blended behaviour.
     */
    private static String normalizeListingPurpose(String listingPurpose) {
        if (listingPurpose == null) {
            return null;
        }
        String trimmed = listingPurpose.trim();
        return ALLOWED_LISTING_PURPOSES.contains(trimmed) ? trimmed : null;
    }
}

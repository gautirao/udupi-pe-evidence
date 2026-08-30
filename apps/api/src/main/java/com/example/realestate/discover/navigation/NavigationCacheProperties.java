package com.example.realestate.discover.navigation;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuration for the navigation-hierarchy cache lifecycle (#1955 Areas PR A, SLICE 2d). Bound
 * from the {@code discover.navigation.cache} prefix in application.yml.
 */
@ConfigurationProperties("discover.navigation.cache")
public class NavigationCacheProperties {

    /** Production graph cache: max distinct (city, revision) entries held at once. Small in
     * practice — a handful of cities, each usually with only its current + one grace-period-old
     * revision alive at a time. */
    private long maxSize = 200;

    /** Production graph entries are evicted after this long without an access — a graph that is
     * genuinely still serving traffic never expires; one nobody has read in this long is safe to
     * drop, and will be reloaded (single-flight) on the next request if it's ever needed again. */
    private long ttlSeconds = 3600;

    /** Preview/sandbox namespace: kept small and short-lived — previews are an admin-tooling
     * concern, not a production traffic path. */
    private long previewMaxSize = 50;
    private long previewTtlSeconds = 900;

    /** How long a just-superseded revision's graph is kept servable after a refresh before its
     * cache entry is evicted — covers an in-flight request that resolved the OLD pointer a moment
     * before the atomic swap. */
    private int gracePeriodSeconds = 30;

    /** Startup readiness gate: how long {@code NavigationHierarchyReadinessHealthIndicator} keeps
     * reporting NOT-READY while the eager preload is still in flight, before degrading to
     * lazy-load-on-first-request so a slow/stuck preload can never hang the app forever. */
    private int preloadTimeoutSeconds = 60;

    /** Bounded per-city retry count for a startup preload failure. */
    private int preloadMaxRetries = 3;

    /** Base backoff between preload retries (exponential, plus jitter) — see
     * {@code NavigationCachePreloadRunner#jitteredBackoffMillis}. */
    private long preloadRetryBackoffMillis = 200;

    /** Safety-poll cadence: re-checks the DB's authoritative PROMOTED revision per public-active
     * city against the cache's active pointer, repairing any drift (a missed AFTER_COMMIT event,
     * or a second instance that hasn't yet processed it). */
    private int pollIntervalSeconds = 45;

    public long getMaxSize() {
        return maxSize;
    }

    public void setMaxSize(long maxSize) {
        this.maxSize = maxSize;
    }

    public long getTtlSeconds() {
        return ttlSeconds;
    }

    public void setTtlSeconds(long ttlSeconds) {
        this.ttlSeconds = ttlSeconds;
    }

    public long getPreviewMaxSize() {
        return previewMaxSize;
    }

    public void setPreviewMaxSize(long previewMaxSize) {
        this.previewMaxSize = previewMaxSize;
    }

    public long getPreviewTtlSeconds() {
        return previewTtlSeconds;
    }

    public void setPreviewTtlSeconds(long previewTtlSeconds) {
        this.previewTtlSeconds = previewTtlSeconds;
    }

    public int getGracePeriodSeconds() {
        return gracePeriodSeconds;
    }

    public void setGracePeriodSeconds(int gracePeriodSeconds) {
        this.gracePeriodSeconds = gracePeriodSeconds;
    }

    public int getPreloadTimeoutSeconds() {
        return preloadTimeoutSeconds;
    }

    public void setPreloadTimeoutSeconds(int preloadTimeoutSeconds) {
        this.preloadTimeoutSeconds = preloadTimeoutSeconds;
    }

    public int getPreloadMaxRetries() {
        return preloadMaxRetries;
    }

    public void setPreloadMaxRetries(int preloadMaxRetries) {
        this.preloadMaxRetries = preloadMaxRetries;
    }

    public long getPreloadRetryBackoffMillis() {
        return preloadRetryBackoffMillis;
    }

    public void setPreloadRetryBackoffMillis(long preloadRetryBackoffMillis) {
        this.preloadRetryBackoffMillis = preloadRetryBackoffMillis;
    }

    public int getPollIntervalSeconds() {
        return pollIntervalSeconds;
    }

    public void setPollIntervalSeconds(int pollIntervalSeconds) {
        this.pollIntervalSeconds = pollIntervalSeconds;
    }
}

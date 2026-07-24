package com.example.realestate.discover.navigation;

import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Shared readiness state for the navigation-hierarchy cache preload (#1955 Areas PR A, SLICE 2d).
 * {@code NavigationCachePreloadRunner} transitions this to {@link Status#READY} once every
 * required public-active city's graph has loaded successfully; {@link
 * NavigationHierarchyReadinessHealthIndicator} reads it on every health check and — independently
 * of whether the preload thread is still running — degrades {@link Status#LOADING} to {@link
 * Status#DEGRADED_LAZY} once {@code preloadTimeoutSeconds} has elapsed since application start, so
 * a slow/stuck preload can never hang readiness (or startup) forever. Once degraded, request-time
 * traffic falls back to {@link NavigationGraphCache#getActiveGraph}'s single-flight lazy load.
 */
@Component
public class NavigationHierarchyReadinessState {

    public enum Status {
        /** Preload still in flight (or not yet timed out). */
        LOADING,
        /** Every required public-active city's graph loaded and validated successfully. */
        READY,
        /** Preload timeout exceeded before completing — serving via request-time lazy load. */
        DEGRADED_LAZY
    }

    private final NavigationCacheProperties props;
    private final Instant startedAt = Instant.now();
    private final AtomicReference<Status> status = new AtomicReference<>(Status.LOADING);

    public NavigationHierarchyReadinessState(NavigationCacheProperties props) {
        this.props = props;
    }

    /** Called by the preload runner once every required public-active city has loaded. */
    public void markReady() {
        status.set(Status.READY);
    }

    /**
     * Returns the current status, applying the timeout-based LOADING -&gt; DEGRADED_LAZY
     * transition inline (never a separate timer thread — the health indicator's own poll cadence
     * is the only clock this needs).
     */
    public Status currentStatus() {
        Status current = status.get();
        if (current == Status.LOADING
                && Duration.between(startedAt, Instant.now()).getSeconds() >= props.getPreloadTimeoutSeconds()) {
            status.compareAndSet(Status.LOADING, Status.DEGRADED_LAZY);
            return status.get();
        }
        return current;
    }
}

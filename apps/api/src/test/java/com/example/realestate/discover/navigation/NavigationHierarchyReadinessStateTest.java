package com.example.realestate.discover.navigation;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure unit test for {@link NavigationHierarchyReadinessState}'s LOADING -&gt; READY /
 * LOADING -&gt; DEGRADED_LAZY transitions (#1955 Areas PR A, SLICE 2d).
 */
class NavigationHierarchyReadinessStateTest {

    @Test
    void startsLoading_thenMarkReadyTransitionsToReady() {
        NavigationCacheProperties props = new NavigationCacheProperties();
        props.setPreloadTimeoutSeconds(3600); // never times out during this test
        NavigationHierarchyReadinessState state = new NavigationHierarchyReadinessState(props);

        assertThat(state.currentStatus()).isEqualTo(NavigationHierarchyReadinessState.Status.LOADING);

        state.markReady();

        assertThat(state.currentStatus()).isEqualTo(NavigationHierarchyReadinessState.Status.READY);
    }

    @Test
    void neverMarkedReady_degradesToLazyOncePreloadTimeoutElapses() throws InterruptedException {
        NavigationCacheProperties props = new NavigationCacheProperties();
        props.setPreloadTimeoutSeconds(0); // "already timed out" from the instant of construction
        NavigationHierarchyReadinessState state = new NavigationHierarchyReadinessState(props);

        // A tiny real sleep so Duration.between(startedAt, now) is unambiguously >= 0s.
        Thread.sleep(50);

        assertThat(state.currentStatus()).isEqualTo(NavigationHierarchyReadinessState.Status.DEGRADED_LAZY);
    }

    @Test
    void onceReady_stableEvenPastTheTimeout() throws InterruptedException {
        NavigationCacheProperties props = new NavigationCacheProperties();
        props.setPreloadTimeoutSeconds(0);
        NavigationHierarchyReadinessState state = new NavigationHierarchyReadinessState(props);

        state.markReady();
        Thread.sleep(50);

        assertThat(state.currentStatus()).isEqualTo(NavigationHierarchyReadinessState.Status.READY);
    }
}

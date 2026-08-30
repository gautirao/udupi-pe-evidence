package com.example.realestate.discover.navigation;

import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.stereotype.Component;

/**
 * Exposes {@link NavigationHierarchyReadinessState} at {@code /actuator/health/navigationHierarchy}
 * (see {@code application.yml}'s {@code management.endpoint.health.group.navigationHierarchy})
 * (#1955 Areas PR A, SLICE 2d).
 *
 * <p>Unlike {@code CityRegionBackfillReadinessHealthIndicator}, this indicator DOES contribute a
 * genuine DOWN to the aggregate health status while {@link
 * NavigationHierarchyReadinessState.Status#LOADING}: it is a real readiness gate, not a
 * detail-only signal — a load balancer / orchestrator should not route production discover
 * traffic to an instance whose required public-active navigation graphs have not finished
 * preloading and have not yet timed out into degraded lazy-load mode either.
 */
@Component
public class NavigationHierarchyReadinessHealthIndicator implements HealthIndicator {

    private final NavigationHierarchyReadinessState state;

    public NavigationHierarchyReadinessHealthIndicator(NavigationHierarchyReadinessState state) {
        this.state = state;
    }

    @Override
    public Health health() {
        NavigationHierarchyReadinessState.Status status = state.currentStatus();
        return switch (status) {
            case READY -> Health.up()
                    .withDetail("status", "READY")
                    .build();
            case DEGRADED_LAZY -> Health.up()
                    .withDetail("status", "DEGRADED_LAZY")
                    .withDetail("note", "preload timeout exceeded — serving via request-time lazy load")
                    .build();
            case LOADING -> Health.down()
                    .withDetail("status", "LOADING")
                    .build();
        };
    }
}

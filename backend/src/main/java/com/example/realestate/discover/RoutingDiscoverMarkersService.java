package com.example.realestate.discover;

import com.example.realestate.discover.shadow.ShadowComparisonRunner;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;

import java.net.SocketTimeoutException;

/**
 * {@code @Primary} routing service for markers discover.
 *
 * <p>When {@code discover.opensearch.enabled=true} and the OpenSearch adapter is available,
 * delegates to the OpenSearch adapter. On any exception, increments a fallback counter
 * and falls back to the Postgres service.
 *
 * <p>When OpenSearch is disabled (the default), always delegates to the Postgres service
 * with zero overhead.
 */
@Service
@Primary
public class RoutingDiscoverMarkersService implements DiscoverMarkersPort {

    private static final Logger log = LoggerFactory.getLogger(RoutingDiscoverMarkersService.class);

    private static final String FALLBACK_COUNTER_NAME = "discover.opensearch.fallback.count";

    private final DiscoverMarkersService postgresService;
    private final DiscoverMarkersPort openSearchAdapter;
    private final boolean enabled;
    private final Counter fallbackErrorCounter;
    private final Counter fallbackTimeoutCounter;

    // Field injection (not constructor) — avoids a circular dependency: ShadowComparisonRunner
    // injects DiscoverMarkersPort (the @Primary bean = this class). Constructor injection here
    // would force Spring to instantiate both at the same time.
    @Autowired(required = false)
    private ShadowComparisonRunner shadowRunner;

    public RoutingDiscoverMarkersService(
            DiscoverMarkersService postgresService,
            @Autowired(required = false) DiscoverMarkersPort openSearchAdapter,
            MeterRegistry meterRegistry,
            @Value("${discover.opensearch.enabled:false}") boolean enabled) {
        this.postgresService = postgresService;
        // Avoid self-reference: if the only available DiscoverMarkersPort bean is this
        // service itself (when OS adapter is absent), Spring would inject us back. Guard
        // by checking whether the injected bean is a different instance.
        this.openSearchAdapter = (openSearchAdapter == this) ? null : openSearchAdapter;
        this.enabled = enabled;
        this.fallbackErrorCounter = Counter.builder(FALLBACK_COUNTER_NAME)
                .tag("endpoint", "markers")
                .tag("reason", "error")
                .register(meterRegistry);
        this.fallbackTimeoutCounter = Counter.builder(FALLBACK_COUNTER_NAME)
                .tag("endpoint", "markers")
                .tag("reason", "timeout")
                .register(meterRegistry);
    }

    @Override
    public DiscoverMarkersResponse getMarkers(DiscoverListingPredicateBuilder.Filters filters) {
        if (!enabled || openSearchAdapter == null) {
            DiscoverMarkersResponse markersResponse = postgresService.getMarkers(filters);
            if (shadowRunner != null) {
                shadowRunner.submitMarkersShadow(filters, markersResponse);
            }
            return markersResponse;
        }
        try {
            return openSearchAdapter.getMarkers(filters);
        } catch (Exception e) {
            if (isTimeout(e)) {
                fallbackTimeoutCounter.increment();
            } else {
                fallbackErrorCounter.increment();
            }
            log.warn("OpenSearch markers query failed, falling back to Postgres: {}", e.getMessage());
            return postgresService.getMarkers(filters);
        }
    }

    private static boolean isTimeout(Exception e) {
        if (!(e instanceof ResourceAccessException)) return false;
        Throwable cause = e.getCause();
        return cause instanceof SocketTimeoutException;
    }
}

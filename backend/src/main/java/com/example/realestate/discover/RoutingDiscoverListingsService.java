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
 * {@code @Primary} routing service for listings discover.
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
public class RoutingDiscoverListingsService implements DiscoverListingsPort {

    private static final Logger log = LoggerFactory.getLogger(RoutingDiscoverListingsService.class);

    private static final String FALLBACK_COUNTER_NAME = "discover.opensearch.fallback.count";

    private final DiscoverListingsService postgresService;
    private final DiscoverListingsPort openSearchAdapter;
    private final boolean enabled;
    private final Counter fallbackErrorCounter;
    private final Counter fallbackTimeoutCounter;

    private final ShadowComparisonRunner shadowRunner;

    public RoutingDiscoverListingsService(
            DiscoverListingsService postgresService,
            @Autowired(required = false) DiscoverListingsPort openSearchAdapter,
            MeterRegistry meterRegistry,
            @Value("${discover.opensearch.enabled:false}") boolean enabled,
            @Autowired(required = false) ShadowComparisonRunner shadowRunner) {
        this.postgresService = postgresService;
        // Avoid self-reference: if the only available DiscoverListingsPort bean is this
        // service itself (when OS adapter is absent), Spring would inject us back. Guard
        // by checking whether the injected bean is a different instance.
        this.openSearchAdapter = (openSearchAdapter == this) ? null : openSearchAdapter;
        this.enabled = enabled;
        this.shadowRunner = shadowRunner;
        this.fallbackErrorCounter = Counter.builder(FALLBACK_COUNTER_NAME)
                .tag("endpoint", "listings")
                .tag("reason", "error")
                .register(meterRegistry);
        this.fallbackTimeoutCounter = Counter.builder(FALLBACK_COUNTER_NAME)
                .tag("endpoint", "listings")
                .tag("reason", "timeout")
                .register(meterRegistry);
    }

    @Override
    public DiscoverListingsPage getListings(DiscoverListingsQuery query) {
        if (!enabled || openSearchAdapter == null) {
            DiscoverListingsPage listingsPage = postgresService.getListings(query);
            if (shadowRunner != null) {
                shadowRunner.submitListingsShadow(query, listingsPage, openSearchAdapter);
            }
            return listingsPage;
        }
        try {
            return openSearchAdapter.getListings(query);
        } catch (Exception e) {
            if (isTimeout(e)) {
                fallbackTimeoutCounter.increment();
            } else {
                fallbackErrorCounter.increment();
            }
            log.warn("OpenSearch listings query failed, falling back to Postgres: {}", e.getMessage());
            return postgresService.getListings(query);
        }
    }

    private static boolean isTimeout(Exception e) {
        if (!(e instanceof ResourceAccessException)) return false;
        Throwable cause = e.getCause();
        return cause instanceof SocketTimeoutException;
    }
}

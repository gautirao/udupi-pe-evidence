package com.example.realestate.discover;

import com.example.realestate.discover.shadow.ShadowComparisonRunner;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;
import org.springframework.web.client.ResourceAccessException;

import java.net.SocketTimeoutException;

/**
 * Routing service for discover summary (#1745 P5).
 *
 * <p>Mirrors {@link RoutingDiscoverMarkersService}: when {@code discover.opensearch.enabled=true}
 * and an OpenSearch summary adapter is available, delegates to it and falls back to Postgres on
 * any exception (incrementing a fallback counter tagged {@code endpoint=summary}). When disabled
 * (the default) or no adapter is wired, always delegates to Postgres with zero overhead.
 *
 * <p>The {@code openSearchSummaryAdapter} qualifier is not bound to any bean this slice — no
 * OpenSearch summary adapter exists yet, so {@code osAdapter} is always {@code null} and this
 * service always takes the Postgres path. The constructor shape (including the
 * {@link ShadowComparisonRunner} seam) is kept identical to the markers routing service so a
 * future OpenSearch summary adapter + shadow-comparison method can be wired in without changing
 * this class's shape.
 *
 * <p>{@code @Primary} restored here (#1955 Areas PR A, SLICE 2e, D6) — {@code
 * CachingDiscoverSummaryService}, the whole-response 120s TTL Caffeine decorator that used to hold
 * {@code @Primary} (#1760), is retired: {@link DiscoverSummaryService}'s region/hotspot queries are
 * now backed by ONE shared area-level aggregation (see that class's javadoc) rather than three, so
 * the per-region SQL cost the old cache amortised no longer exists to amortise.
 */
@Service
@Primary
public class RoutingDiscoverSummaryService implements DiscoverSummaryPort {

    private static final Logger log = LoggerFactory.getLogger(RoutingDiscoverSummaryService.class);

    private static final String FALLBACK_COUNTER_NAME = "discover.opensearch.fallback.count";

    private final DiscoverSummaryService postgresService;
    private final DiscoverSummaryPort openSearchAdapter;
    private final boolean enabled;
    private final Counter fallbackErrorCounter;
    private final Counter fallbackTimeoutCounter;

    // Dormant seam — no OpenSearch summary shadow-comparison method exists yet. Retained (unused)
    // so a future slice can add one without changing this constructor's shape.
    private final ShadowComparisonRunner shadowRunner;

    public RoutingDiscoverSummaryService(
            DiscoverSummaryService postgresService,
            @Qualifier("openSearchSummaryAdapter") @Autowired(required = false) DiscoverSummaryPort osAdapter,
            MeterRegistry meterRegistry,
            @Value("${discover.opensearch.enabled:false}") boolean enabled,
            @Autowired(required = false) ShadowComparisonRunner shadowRunner) {
        this.postgresService = postgresService;
        this.openSearchAdapter = osAdapter;
        this.enabled = enabled;
        this.shadowRunner = shadowRunner;
        this.fallbackErrorCounter = Counter.builder(FALLBACK_COUNTER_NAME)
                .tag("endpoint", "summary")
                .tag("reason", "error")
                .register(meterRegistry);
        this.fallbackTimeoutCounter = Counter.builder(FALLBACK_COUNTER_NAME)
                .tag("endpoint", "summary")
                .tag("reason", "timeout")
                .register(meterRegistry);
    }

    @Override
    public DiscoverSummaryResponse getSummary(SummaryQuery query) {
        if (!enabled || openSearchAdapter == null) {
            return postgresService.getSummary(query);
        }
        try {
            return openSearchAdapter.getSummary(query);
        } catch (Exception e) {
            if (isTimeout(e)) {
                fallbackTimeoutCounter.increment();
            } else {
                fallbackErrorCounter.increment();
            }
            log.warn("OpenSearch summary query failed, falling back to Postgres: {}", e.getMessage());
            return postgresService.getSummary(query);
        }
    }

    private static boolean isTimeout(Exception e) {
        if (!(e instanceof ResourceAccessException)) return false;
        Throwable cause = e.getCause();
        return cause instanceof SocketTimeoutException;
    }
}

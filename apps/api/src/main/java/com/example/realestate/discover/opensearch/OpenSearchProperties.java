package com.example.realestate.discover.opensearch;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuration properties for the OpenSearch discover adapter.
 *
 * <p>Bound from the {@code discover.opensearch.*} prefix in application.yml.
 * All values have safe defaults so the application starts cleanly when OpenSearch
 * is not configured ({@code enabled=false}).
 */
@ConfigurationProperties(prefix = "discover.opensearch")
public record OpenSearchProperties(
        boolean enabled,
        String url,
        String indexAlias,
        int timeoutMs,
        int connectTimeoutMs,
        /** Optional HTTP Basic username. Leave blank for unauthenticated (dev/local) clusters. */
        String username,
        /** Optional HTTP Basic password. Leave blank for unauthenticated (dev/local) clusters. */
        String password,
        /** Optional bearer token / API key. Takes precedence over username+password when non-blank. */
        String apiKey,
        /**
         * When true, fires a shadow OpenSearch query on every Postgres-primary request and
         * records parity metrics. Has no effect when {@code enabled=true} (shadow is for the
         * Postgres-primary path only). Default: false.
         */
        boolean shadowEnabled,
        /**
         * Wall-clock budget (ms) for the shadow OpenSearch call. The shadow future is cancelled
         * after this timeout but the Postgres result is already returned. Default: 500.
         */
        int shadowTimeoutMs,
        /**
         * Fraction of requests to sample for shadow comparison (0.0–1.0). Default: 1.0 (all).
         */
        double shadowSampleRate,
        /**
         * Number of top results to compare for order overlap when {@code isOrdered()=true}.
         * Default: 10.
         */
        int shadowTopN
) {}

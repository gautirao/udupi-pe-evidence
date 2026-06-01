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
        String apiKey
) {}

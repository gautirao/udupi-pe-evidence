package com.example.realestate.discover;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuration properties for {@link AreaRegionReclassOutboxPoller} (#1887 PR3). Bound from the
 * {@code area.region-reclass} prefix in application.yml.
 *
 * <p>{@code area.region-reclass.enabled=false} (default) keeps the poller bean out of the
 * application context entirely — mirrors {@code search.indexer.enabled}'s
 * {@link com.example.realestate.search.indexer.SearchIndexerProperties} shape, but this is a
 * DISTINCT property namespace: {@code area_region_reclass_outbox} is never cross-wired with
 * {@code listing_search_outbox}/{@code search.indexer.enabled}.
 */
@ConfigurationProperties("area.region-reclass")
public class AreaRegionReclassProperties {

    private boolean enabled = false;
    private int pollIntervalSeconds = 30;
    private int batchSize = 50;
    private int maxRetryAttempts = 3;
    private long retryDelaySeconds = 60;
    private long maxBackoffSeconds = 3600;
    private int minEventAgeSeconds = 0;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public int getPollIntervalSeconds() {
        return pollIntervalSeconds;
    }

    public void setPollIntervalSeconds(int pollIntervalSeconds) {
        this.pollIntervalSeconds = pollIntervalSeconds;
    }

    public int getBatchSize() {
        return batchSize;
    }

    public void setBatchSize(int batchSize) {
        this.batchSize = batchSize;
    }

    public int getMaxRetryAttempts() {
        return maxRetryAttempts;
    }

    public void setMaxRetryAttempts(int maxRetryAttempts) {
        this.maxRetryAttempts = maxRetryAttempts;
    }

    public long getRetryDelaySeconds() {
        return retryDelaySeconds;
    }

    public void setRetryDelaySeconds(long retryDelaySeconds) {
        this.retryDelaySeconds = retryDelaySeconds;
    }

    public long getMaxBackoffSeconds() {
        return maxBackoffSeconds;
    }

    public void setMaxBackoffSeconds(long maxBackoffSeconds) {
        this.maxBackoffSeconds = maxBackoffSeconds;
    }

    public int getMinEventAgeSeconds() {
        return minEventAgeSeconds;
    }

    public void setMinEventAgeSeconds(int minEventAgeSeconds) {
        this.minEventAgeSeconds = minEventAgeSeconds;
    }
}

package com.example.realestate.search.indexer;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Configuration properties for the search indexer and outbox poller.
 * Bound from the {@code search.*} prefix in application.yml.
 *
 * <p>{@code search.indexer.enabled=false} (default) keeps the poller and
 * OpenSearch client beans out of the application context entirely.
 */
@ConfigurationProperties("search")
public class SearchIndexerProperties {

    private Indexer indexer = new Indexer();
    private Outbox outbox = new Outbox();

    public Indexer getIndexer() {
        return indexer;
    }

    public void setIndexer(Indexer indexer) {
        this.indexer = indexer;
    }

    public Outbox getOutbox() {
        return outbox;
    }

    public void setOutbox(Outbox outbox) {
        this.outbox = outbox;
    }

    public static class Indexer {
        private boolean enabled = false;

        public boolean isEnabled() {
            return enabled;
        }

        public void setEnabled(boolean enabled) {
            this.enabled = enabled;
        }
    }

    public static class Outbox {
        private int pollIntervalSeconds = 30;
        private int batchSize = 100;
        private int minEventAgeSeconds = 0;

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

        public int getMinEventAgeSeconds() {
            return minEventAgeSeconds;
        }

        public void setMinEventAgeSeconds(int minEventAgeSeconds) {
            this.minEventAgeSeconds = minEventAgeSeconds;
        }
    }
}

package com.example.realestate.search.indexer;

import com.example.realestate.discover.opensearch.OpenSearchProperties;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Creates the {@link RestClient} bean used by the search indexer adapters.
 *
 * <p>The bean is only created when {@code search.indexer.enabled=true}.
 * It reuses {@link OpenSearchProperties} (bound to {@code discover.opensearch.*})
 * for the URL and credentials — the indexer writes to the same cluster that the
 * discover read path queries.
 *
 * <p>The bean is named {@code searchIndexerRestClient} to avoid conflicting with
 * the {@code discoverOpenSearchRestClient} bean in {@code OpenSearchClientConfig}.
 */
@Configuration
@EnableConfigurationProperties({SearchIndexerProperties.class, OpenSearchProperties.class})
@ConditionalOnProperty(name = "search.indexer.enabled", havingValue = "true")
public class SearchIndexerClientConfig {

    /**
     * RestClient pre-configured with the OpenSearch base URL and credentials.
     * Uses the same OpenSearchProperties as the discover read path so that the
     * indexer and reader target the same cluster without duplicating config.
     */
    @Bean("searchIndexerRestClient")
    public RestClient searchIndexerRestClient(OpenSearchProperties props) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(props.connectTimeoutMs());
        factory.setReadTimeout(props.timeoutMs());

        RestClient.Builder builder = RestClient.builder()
                .baseUrl(props.url())
                .requestFactory(factory);

        // Optional auth: API key takes precedence over Basic auth when both are configured.
        if (props.apiKey() != null && !props.apiKey().isBlank()) {
            builder.defaultHeader("Authorization", "ApiKey " + props.apiKey());
        } else if (props.username() != null && !props.username().isBlank()) {
            String credentials = props.username() + ":" + (props.password() != null ? props.password() : "");
            String encoded = Base64.getEncoder().encodeToString(credentials.getBytes(StandardCharsets.UTF_8));
            builder.defaultHeader("Authorization", "Basic " + encoded);
        }

        return builder.build();
    }
}

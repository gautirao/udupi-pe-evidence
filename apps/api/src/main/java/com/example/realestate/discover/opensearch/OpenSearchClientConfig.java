package com.example.realestate.discover.opensearch;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.Base64;

/**
 * Creates the {@link RestClient} bean used by the OpenSearch adapters.
 *
 * <p>The bean is only created when {@code discover.opensearch.enabled=true}.
 * When disabled (the default) no HTTP connection is opened and the adapters
 * are not instantiated.
 */
@Configuration
@EnableConfigurationProperties(OpenSearchProperties.class)
public class OpenSearchClientConfig {

    /**
     * RestClient pre-configured with the OpenSearch base URL and per-call timeouts.
     *
     * <p>Named {@code discoverOpenSearchRestClient} to avoid conflicting with any
     * other RestClient bean that may exist in the application context.
     */
    @Bean
    @ConditionalOnProperty(name = "discover.opensearch.enabled", havingValue = "true", matchIfMissing = false)
    public RestClient discoverOpenSearchRestClient(OpenSearchProperties props) {
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

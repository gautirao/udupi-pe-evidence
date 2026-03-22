package com.example.realestate.trust;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Spring configuration for the trust domain.
 *
 * <p>Registers {@link RankingProperties} via {@code @EnableConfigurationProperties}
 * so that YAML binding failures are detected at startup and reported as
 * {@code BindException}, rather than being silently swallowed as happens when
 * {@code @Component} is used alongside {@code @ConfigurationProperties}.
 */
@Configuration
@EnableConfigurationProperties(RankingProperties.class)
public class TrustConfig {
}

package com.example.realestate.discover;

import com.example.realestate.discover.navigation.PostgresAreaCountProvider;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcOperations;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * DI regression guard for the discover summary {@code @Primary} port wiring (#1955 Areas PR A,
 * SLICE 2e, D6).
 *
 * <p>{@code CachingDiscoverSummaryService} (the whole-response 120s TTL Caffeine decorator that
 * used to hold {@code @Primary}, #1760) was retired in this slice — {@link
 * RoutingDiscoverSummaryService} is {@code @Primary} again. Mirrors {@link
 * DiscoverRoutingDiTest}'s {@link ApplicationContextRunner} slice pattern — no live DB, OpenSearch,
 * or full {@code @SpringBootTest} context required.
 *
 * <p>If a future change reintroduces a second {@link DiscoverSummaryPort} bean with no {@code
 * @Primary} disambiguation, any other component autowiring the port interface (e.g. the discover
 * summary controller) fails to start with {@code NoUniqueBeanDefinitionException}. This test
 * resolves the port interface directly and asserts it is the routing service, catching that
 * regression at the DI-wiring level rather than relying on the controller slice alone.
 */
class DiscoverSummaryCacheWiringTest {

    @Configuration
    static class SummaryInfraConfig {
        @Bean
        MeterRegistry meterRegistry() {
            return new SimpleMeterRegistry();
        }

        @Bean
        JdbcOperations jdbcOperations() {
            return mock(JdbcOperations.class);
        }
    }

    @Test
    void discoverSummaryPort_resolvesToRoutingService_exactlyOnePrimaryBean() {
        new ApplicationContextRunner()
                .withUserConfiguration(SummaryInfraConfig.class)
                .withPropertyValues("discover.opensearch.enabled=false")
                .withBean(CityActivationGuard.class)
                .withBean(PostgresAreaCountProvider.class)
                .withBean(DiscoverSummaryService.class)
                .withBean(RoutingDiscoverSummaryService.class)
                .run(context -> {
                    assertThat(context).hasNotFailed();

                    // Resolving the PORT interface (not a concrete type) must be unambiguous —
                    // this is exactly what breaks with two @Primary (or zero @Primary) candidates.
                    DiscoverSummaryPort port = context.getBean(DiscoverSummaryPort.class);
                    assertThat(port).isInstanceOf(RoutingDiscoverSummaryService.class);
                    assertThat(context.getBean(RoutingDiscoverSummaryService.class)).isSameAs(port);
                });
    }
}

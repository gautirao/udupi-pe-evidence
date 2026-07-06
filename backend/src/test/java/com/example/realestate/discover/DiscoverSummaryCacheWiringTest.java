package com.example.realestate.discover;

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
 * DI regression guard for the discover summary {@code @Primary} port wiring (#1760).
 *
 * <p>Mirrors {@link DiscoverRoutingDiTest}'s {@link ApplicationContextRunner} slice pattern —
 * no live DB, OpenSearch, or full {@code @SpringBootTest} context required. Lets Spring construct
 * {@link DiscoverSummaryService}, {@link RoutingDiscoverSummaryService}, and
 * {@link CachingDiscoverSummaryService} via their real {@code @Autowired} constructors with only
 * their infrastructure dependencies ({@link JdbcOperations}, {@link MeterRegistry}) mocked/stubbed.
 *
 * <p>{@code @Primary} moved from {@link RoutingDiscoverSummaryService} to
 * {@link CachingDiscoverSummaryService} in this slice (#1760). If a future rebase reintroduces
 * {@code @Primary} on {@link RoutingDiscoverSummaryService} (or removes it from the caching
 * decorator), exactly two {@link DiscoverSummaryPort} beans exist with no unambiguous default —
 * any other component autowiring the port interface (e.g. the discover summary controller) would
 * fail to start with {@code NoUniqueBeanDefinitionException}. This test resolves the port
 * interface directly and asserts it is the caching decorator, catching that regression at the
 * DI-wiring level rather than relying on the controller slice alone.
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
    void discoverSummaryPort_resolvesToCachingDecorator_exactlyOnePrimaryBean() {
        new ApplicationContextRunner()
                .withUserConfiguration(SummaryInfraConfig.class)
                .withPropertyValues(
                        "discover.opensearch.enabled=false",
                        "discover.summary.cache.enabled=true")
                .withBean(DiscoverSummaryService.class)
                .withBean(RoutingDiscoverSummaryService.class)
                .withBean(CachingDiscoverSummaryService.class)
                .run(context -> {
                    assertThat(context).hasNotFailed();

                    // Resolving the PORT interface (not a concrete type) must be unambiguous —
                    // this is exactly what breaks with two @Primary (or zero @Primary) candidates.
                    DiscoverSummaryPort port = context.getBean(DiscoverSummaryPort.class);
                    assertThat(port).isInstanceOf(CachingDiscoverSummaryService.class);

                    // Both concrete beans are still present in the context (routing service is
                    // wired into the decorator by concrete type, not removed from the context).
                    assertThat(context.getBean(RoutingDiscoverSummaryService.class)).isNotNull();
                    assertThat(context.getBean(CachingDiscoverSummaryService.class)).isSameAs(port);
                });
    }
}

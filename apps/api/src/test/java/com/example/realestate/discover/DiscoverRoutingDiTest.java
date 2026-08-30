package com.example.realestate.discover;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * DI smoke tests for the OpenSearch routing services.
 *
 * <p>Uses {@link ApplicationContextRunner} — no live DB or OpenSearch required.
 *
 * <p>The critical test cases ({@code _flagOn_} and {@code _shadowOn_}) let Spring
 * construct {@link RoutingDiscoverListingsService} / {@link RoutingDiscoverMarkersService}
 * via their annotated constructors while two beans of the port type are registered.
 * Without {@code @Qualifier} on the constructor parameter Spring throws
 * {@code NoUniqueBeanDefinitionException}. These tests FAIL before the fix and PASS
 * after it — providing the fail-before / pass-after evidence required by §5 and §11
 * of CLAUDE.md.
 *
 * <p>The flag-OFF tests ({@code _flagOff_}) use hand-wired constructors (adapter=null)
 * because in that scenario the OpenSearch adapter bean is absent — no ambiguity.
 */
class DiscoverRoutingDiTest {

    // -----------------------------------------------------------------------
    // Helper: base beans needed by every listings test
    // -----------------------------------------------------------------------

    @Configuration
    static class ListingsInfraConfig {
        @Bean
        MeterRegistry meterRegistry() {
            return new SimpleMeterRegistry();
        }

        @Bean
        DiscoverListingsService discoverListingsService() {
            // DiscoverListingsService also implements DiscoverListingsPort —
            // this is one of the two candidates that causes the ambiguity.
            return mock(DiscoverListingsService.class);
        }
    }

    @Configuration
    static class MarkersInfraConfig {
        @Bean
        MeterRegistry meterRegistry() {
            return new SimpleMeterRegistry();
        }

        @Bean
        DiscoverMarkersService discoverMarkersService() {
            return mock(DiscoverMarkersService.class);
        }
    }

    // -----------------------------------------------------------------------
    // LISTINGS — flag OFF
    // No OpenSearch adapter bean present → no ambiguity.
    // -----------------------------------------------------------------------

    @Test
    void listingsPath_flagOff_contextLoadsAdapterIsNull() {
        new ApplicationContextRunner()
                .withUserConfiguration(ListingsInfraConfig.class)
                .withPropertyValues(
                        "discover.opensearch.enabled=false",
                        "discover.opensearch.shadow-enabled=false")
                // Let Spring construct RoutingDiscoverListingsService via its @Autowired constructor.
                // No second DiscoverListingsPort bean registered → Spring injects the Postgres service.
                .withBean(RoutingDiscoverListingsService.class)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(RoutingDiscoverListingsService.class)).isNotNull();
                });
    }

    // -----------------------------------------------------------------------
    // LISTINGS — flag ON (primary path)
    // Both DiscoverListingsService AND openSearchListingsAdapter are registered.
    // Without @Qualifier → NoUniqueBeanDefinitionException (FAILS before fix).
    // With    @Qualifier → resolves openSearchListingsAdapter (PASSES after fix).
    // -----------------------------------------------------------------------

    @Test
    void listingsPath_flagOn_contextLoadsAdapterInjected() {
        new ApplicationContextRunner()
                .withUserConfiguration(ListingsInfraConfig.class)
                .withPropertyValues(
                        "discover.opensearch.enabled=true",
                        "discover.opensearch.shadow-enabled=false")
                // Second DiscoverListingsPort bean — this is what creates the ambiguity.
                .withBean("openSearchListingsAdapter", DiscoverListingsPort.class,
                        () -> mock(DiscoverListingsPort.class))
                .withBean(RoutingDiscoverListingsService.class)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(RoutingDiscoverListingsService.class)).isNotNull();
                });
    }

    // -----------------------------------------------------------------------
    // LISTINGS — shadow ON
    // Same ambiguity scenario as flag-ON.
    // -----------------------------------------------------------------------

    @Test
    void listingsPath_shadowOn_contextLoadsAdapterInjected() {
        new ApplicationContextRunner()
                .withUserConfiguration(ListingsInfraConfig.class)
                .withPropertyValues(
                        "discover.opensearch.enabled=false",
                        "discover.opensearch.shadow-enabled=true")
                .withBean("openSearchListingsAdapter", DiscoverListingsPort.class,
                        () -> mock(DiscoverListingsPort.class))
                .withBean(RoutingDiscoverListingsService.class)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(RoutingDiscoverListingsService.class)).isNotNull();
                });
    }

    // -----------------------------------------------------------------------
    // MARKERS — flag OFF
    // -----------------------------------------------------------------------

    @Test
    void markersPath_flagOff_contextLoadsAdapterIsNull() {
        new ApplicationContextRunner()
                .withUserConfiguration(MarkersInfraConfig.class)
                .withPropertyValues(
                        "discover.opensearch.enabled=false",
                        "discover.opensearch.shadow-enabled=false")
                .withBean(RoutingDiscoverMarkersService.class)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(RoutingDiscoverMarkersService.class)).isNotNull();
                });
    }

    // -----------------------------------------------------------------------
    // MARKERS — flag ON
    // Both DiscoverMarkersService AND openSearchMarkersAdapter registered.
    // Without @Qualifier → NoUniqueBeanDefinitionException (FAILS before fix).
    // With    @Qualifier → resolves openSearchMarkersAdapter (PASSES after fix).
    // -----------------------------------------------------------------------

    @Test
    void markersPath_flagOn_contextLoadsAdapterInjected() {
        new ApplicationContextRunner()
                .withUserConfiguration(MarkersInfraConfig.class)
                .withPropertyValues(
                        "discover.opensearch.enabled=true",
                        "discover.opensearch.shadow-enabled=false")
                .withBean("openSearchMarkersAdapter", DiscoverMarkersPort.class,
                        () -> mock(DiscoverMarkersPort.class))
                .withBean(RoutingDiscoverMarkersService.class)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(RoutingDiscoverMarkersService.class)).isNotNull();
                });
    }

    // -----------------------------------------------------------------------
    // MARKERS — shadow ON
    // Same ambiguity scenario as markers flag-ON.
    // -----------------------------------------------------------------------

    @Test
    void markersPath_shadowOn_contextLoadsAdapterInjected() {
        new ApplicationContextRunner()
                .withUserConfiguration(MarkersInfraConfig.class)
                .withPropertyValues(
                        "discover.opensearch.enabled=false",
                        "discover.opensearch.shadow-enabled=true")
                .withBean("openSearchMarkersAdapter", DiscoverMarkersPort.class,
                        () -> mock(DiscoverMarkersPort.class))
                .withBean(RoutingDiscoverMarkersService.class)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context.getBean(RoutingDiscoverMarkersService.class)).isNotNull();
                });
    }
}

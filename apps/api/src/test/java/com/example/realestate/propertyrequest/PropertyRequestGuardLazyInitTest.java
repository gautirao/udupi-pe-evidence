package com.example.realestate.propertyrequest;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.boot.LazyInitializationBeanFactoryPostProcessor;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * L2 (#1793): the key guard must be unskippable. Under {@code spring.main.lazy-initialization=true}
 * a bean nobody depends on is never created, so the controller must depend on the guard: creating
 * the controller then always runs the guard. The lazy post-processor is applied explicitly because
 * {@link ApplicationContextRunner} does not apply the {@code SpringApplication} lazy flag.
 */
class PropertyRequestGuardLazyInitTest {

    private static final String ENV = "PHONE_ENCRYPTION_KEY";
    private static final String FLAG = "app.property-requests.enabled";

    private static ApplicationContextRunner lazyRunner(String spring, Map<String, String> env, String flag) {
        return new ApplicationContextRunner()
                .withInitializer(ctx -> ctx.addBeanFactoryPostProcessor(new LazyInitializationBeanFactoryPostProcessor()))
                .withPropertyValues(FLAG + "=" + flag)
                .withBean(PhoneKeyResolver.class,
                        () -> PropertyRequestEncryptionKeyGuardTest.resolver(spring, env, Map.of()))
                .withBean(PropertyRequestEncryptionKeyGuard.class)
                .withBean(PropertyRequestService.class, () -> Mockito.mock(PropertyRequestService.class))
                .withBean(PropertyRequestRateLimiter.class, () -> Mockito.mock(PropertyRequestRateLimiter.class))
                .withBean(PublicPropertyRequestController.class);
    }

    @Test
    @DisplayName("L2: lazy-init + enabled + absent key -> creating the controller FAILS (value-free)")
    void lazyEnabledAbsentKey_controllerCreationFails() throws Exception {
        String dev = PropertyRequestEncryptionKeyGuardTest.devKey();
        lazyRunner(dev, Map.of(), "true").run(ctx -> {
            assertThat(ctx).hasNotFailed(); // lazy: nothing created yet
            assertThatThrownBy(() -> ctx.getBean(PublicPropertyRequestController.class))
                    .hasStackTraceContaining(ENV)
                    .satisfies(t -> assertThat(String.valueOf(t.getMessage())).doesNotContain(dev));
        });
    }

    @Test
    @DisplayName("L2: lazy-init + enabled + dev key in env -> creating the controller FAILS (value-free)")
    void lazyEnabledDevKey_controllerCreationFails() throws Exception {
        String dev = PropertyRequestEncryptionKeyGuardTest.devKey();
        lazyRunner(dev, Map.of(ENV, dev), "true").run(ctx ->
                assertThatThrownBy(() -> ctx.getBean(PublicPropertyRequestController.class))
                        .isInstanceOf(Exception.class)
                        .satisfies(t -> assertThat(String.valueOf(t.getMessage())).doesNotContain(dev)));
    }

    @Test
    @DisplayName("L2: lazy-init + enabled + real key -> the controller is created")
    void lazyEnabledRealKey_ok() {
        String real = PropertyRequestEncryptionKeyGuardTest.realKey();
        lazyRunner(real, Map.of(ENV, real), "true").run(ctx -> {
            assertThat(ctx).hasNotFailed();
            assertThat(ctx.getBean(PublicPropertyRequestController.class)).isNotNull();
        });
    }

    @Test
    @DisplayName("L2: flag off + lazy-init + dev/absent key -> nothing is wired, no failure")
    void flagOff_unaffected() throws Exception {
        lazyRunner(PropertyRequestEncryptionKeyGuardTest.devKey(), Map.of(), "false").run(ctx -> {
            assertThat(ctx).hasNotFailed();
            assertThat(ctx).doesNotHaveBean(PublicPropertyRequestController.class);
            assertThat(ctx).doesNotHaveBean(PropertyRequestEncryptionKeyGuard.class);
        });
    }
}

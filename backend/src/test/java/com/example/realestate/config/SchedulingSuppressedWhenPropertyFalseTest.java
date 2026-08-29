package com.example.realestate.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.test.context.TestPropertySource;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regression coverage for issue #2114, scenario (b) + (c): with the property explicitly
 * false and {@link SchedulingSuppressionConfig} wired in, a {@code @Scheduled} method with
 * a 100ms fixed delay must NOT fire within a generous 2s window &mdash; proving scheduling
 * is genuinely disabled for tests that opt in, so background jobs cannot interfere with
 * test execution or Testcontainers teardown.
 *
 * <p>{@code spring.task.scheduling.enabled=false} is NOT a Spring Boot-recognized property.
 * Setting it via {@code @TestPropertySource} (as ~27 city-launch / navigation integration
 * tests in this repo do) previously had ZERO effect on whether {@code @Scheduled} methods
 * actually fired &mdash; nothing in {@code backend/src/main} ever read that key.
 * {@link SchedulingSuppressionConfig} fixes this by repurposing the same property key as a
 * real suppression switch: when it is explicitly {@code false}, a no-op
 * {@link org.springframework.scheduling.TaskScheduler} bean is published as {@code @Primary},
 * so Spring's scheduled-method infrastructure never actually invokes any {@code @Scheduled}
 * method body.
 */
@SpringBootTest(classes = SchedulingSuppressedWhenPropertyFalseTest.SuppressedSchedulingContext.class)
@TestPropertySource(properties = "spring.task.scheduling.enabled=false")
class SchedulingSuppressedWhenPropertyFalseTest {

    @Autowired
    private ProbeJob probeJob;

    @Test
    void scheduledMethodDoesNotFireWhenSchedulingDisabled() throws InterruptedException {
        boolean fired = probeJob.latch.await(2, TimeUnit.SECONDS);

        assertThat(fired)
                .as("a @Scheduled method must NOT execute once spring.task.scheduling.enabled=false "
                        + "activates the no-op TaskScheduler (issue #2114)")
                .isFalse();
        assertThat(probeJob.invocationCount.get()).isZero();
    }

    @EnableScheduling
    @Import(SchedulingSuppressionConfig.class)
    @Configuration
    static class SuppressedSchedulingContext {
        @Bean
        ProbeJob probeJob() {
            return new ProbeJob();
        }
    }

    static class ProbeJob {
        final AtomicInteger invocationCount = new AtomicInteger();
        final CountDownLatch latch = new CountDownLatch(1);

        @Scheduled(fixedDelay = 100)
        void tick() {
            invocationCount.incrementAndGet();
            latch.countDown();
        }
    }
}

package com.example.realestate.config;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regression coverage for issue #2114, scenario (a): with the property absent (the real
 * production default &mdash; prod never sets this key), {@link SchedulingSuppressionConfig}'s
 * {@code @ConditionalOnProperty} must NOT activate, so the normal Boot-autoconfigured
 * scheduling path keeps firing {@code @Scheduled} methods exactly as before this change.
 */
@SpringBootTest(classes = SchedulingRemainsEnabledByDefaultTest.NormalSchedulingContext.class)
class SchedulingRemainsEnabledByDefaultTest {

    @Autowired
    private ProbeJob probeJob;

    @Test
    void scheduledMethodFiresWhenPropertyIsAbsent() throws InterruptedException {
        boolean fired = probeJob.latch.await(2, TimeUnit.SECONDS);

        assertThat(fired)
                .as("production scheduling behaviour must be unchanged when "
                        + "spring.task.scheduling.enabled is not set")
                .isTrue();
        assertThat(probeJob.invocationCount.get()).isGreaterThanOrEqualTo(1);
    }

    @EnableScheduling
    @Import(SchedulingSuppressionConfig.class)
    @Configuration
    static class NormalSchedulingContext {
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

package com.example.realestate.config;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.lang.Nullable;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.Trigger;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.Delayed;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * Test-only scheduling suppression (issue #2114).
 *
 * <p>{@code spring.task.scheduling.enabled=false} is NOT a Spring Boot-recognized
 * property &mdash; {@code TaskSchedulingAutoConfiguration} has no such switch, and
 * nothing in this codebase previously honored it. ~27 integration tests set it via
 * {@code @TestPropertySource} believing it disabled background {@code @Scheduled}
 * jobs (e.g. {@code AreaPriceWeeklyRollupJob}, {@code AreaStatsLatestRollupJob},
 * {@code IngestionJobRunner.pollUnprocessedPosts}) for test isolation. It didn't:
 * those jobs kept firing during test execution, and under Surefire's
 * {@code reuseForks=true} could keep running in the shared JVM after a test
 * class's Testcontainers database was torn down.
 *
 * <p>This configuration repurposes the same property key as a real suppression
 * switch. When it is explicitly set to {@code false}, it publishes a no-op
 * {@link TaskScheduler} as {@code @Primary}. Spring's
 * {@code ScheduledAnnotationBeanPostProcessor} always prefers an application-supplied
 * {@code TaskScheduler} bean over the Boot-autoconfigured default, so every
 * {@code @Scheduled} method in the context is registered against this scheduler
 * instead &mdash; and the no-op scheduler accepts every {@code schedule(...)} call
 * but never invokes the submitted {@link Runnable}, so no scheduled method body
 * ever executes.
 *
 * <p>This deliberately does NOT touch any of the individual {@code @Scheduled}
 * job classes: it is a single, centralized suppression point rather than ~17
 * scattered per-job {@code @ConditionalOnProperty} additions.
 *
 * <p>In production this property is never set, so {@code matchIfMissing} defaults
 * to {@code false} and this configuration stays inactive: the normal
 * Boot-autoconfigured scheduler runs jobs exactly as before.
 */
@Configuration
@ConditionalOnProperty(name = "spring.task.scheduling.enabled", havingValue = "false")
public class SchedulingSuppressionConfig {

    @Bean
    @Primary
    public TaskScheduler noOpTaskScheduler() {
        return new NoOpTaskScheduler();
    }

    /**
     * A {@link TaskScheduler} that accepts every scheduling request but never runs the
     * submitted task. Each {@code schedule*} call immediately returns an already-cancelled,
     * already-done {@link ScheduledFuture} without spawning any thread or invoking the
     * {@link Runnable}.
     */
    static final class NoOpTaskScheduler implements TaskScheduler {

        @Override
        @Nullable
        public ScheduledFuture<?> schedule(Runnable task, Trigger trigger) {
            return NO_OP_FUTURE;
        }

        @Override
        @Nullable
        public ScheduledFuture<?> schedule(Runnable task, Instant startTime) {
            return NO_OP_FUTURE;
        }

        @Override
        @Nullable
        public ScheduledFuture<?> scheduleAtFixedRate(Runnable task, Instant startTime, Duration period) {
            return NO_OP_FUTURE;
        }

        @Override
        @Nullable
        public ScheduledFuture<?> scheduleAtFixedRate(Runnable task, Duration period) {
            return NO_OP_FUTURE;
        }

        @Override
        @Nullable
        public ScheduledFuture<?> scheduleWithFixedDelay(Runnable task, Instant startTime, Duration delay) {
            return NO_OP_FUTURE;
        }

        @Override
        @Nullable
        public ScheduledFuture<?> scheduleWithFixedDelay(Runnable task, Duration delay) {
            return NO_OP_FUTURE;
        }

        private static final ScheduledFuture<Object> NO_OP_FUTURE = new AlreadyCancelledScheduledFuture();

        /**
         * A {@link ScheduledFuture} that is permanently cancelled/done and was never
         * associated with a running task.
         */
        private static final class AlreadyCancelledScheduledFuture implements ScheduledFuture<Object> {
            @Override
            public long getDelay(TimeUnit unit) {
                return 0L;
            }

            @Override
            public int compareTo(Delayed other) {
                return Long.compare(getDelay(TimeUnit.NANOSECONDS), other.getDelay(TimeUnit.NANOSECONDS));
            }

            @Override
            public boolean cancel(boolean mayInterruptIfRunning) {
                return false;
            }

            @Override
            public boolean isCancelled() {
                return true;
            }

            @Override
            public boolean isDone() {
                return true;
            }

            @Override
            public Object get() {
                return null;
            }

            @Override
            public Object get(long timeout, TimeUnit unit) {
                return null;
            }
        }
    }
}

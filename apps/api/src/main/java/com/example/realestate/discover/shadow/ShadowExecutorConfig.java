package com.example.realestate.discover.shadow;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;

/**
 * Configures the bounded thread pool used for shadow OpenSearch comparisons.
 *
 * <p>The pool is deliberately small (core=2, max=4, queue=50) so that a slow or
 * unavailable OpenSearch cluster cannot exhaust Tomcat request threads. Tasks
 * rejected when the queue is full are discarded (with a SKIPPED metric) rather
 * than run on the calling thread, which would block the HTTP response.
 */
@Configuration
public class ShadowExecutorConfig {

    private static final Logger log = LoggerFactory.getLogger(ShadowExecutorConfig.class);

    /**
     * Creates the shadow executor bean and pre-initialises the SKIPPED counter so that
     * the rejection handler never races to register the same metric key concurrently.
     */
    @Bean(name = "shadowExecutor")
    public Executor shadowExecutor(MeterRegistry meterRegistry) {
        // Pre-register the SKIPPED counter before the rejection handler could race to create it.
        Counter skippedCounter = Counter.builder("discover.opensearch.shadow.count")
                .tag("comparison_status", "SKIPPED")
                .tag("result_status", "POSTGRES_SHADOW_SKIPPED")
                .tag("query_type", "UNKNOWN")
                .register(meterRegistry);

        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(4);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("os-shadow-");
        executor.setKeepAliveSeconds(60);
        executor.setAllowCoreThreadTimeOut(true);
        executor.setWaitForTasksToCompleteOnShutdown(false);

        // Custom discard policy: increment SKIPPED counter and drop the task.
        // CallerRunsPolicy is explicitly NOT used — it would run the shadow task on the
        // Tomcat request thread, violating the isolation invariant.
        executor.setRejectedExecutionHandler((runnable, threadPoolExecutor) -> {
            log.debug("Shadow task rejected (queue full) — discarding");
            try {
                skippedCounter.increment();
            } catch (Exception e) {
                log.warn("Failed to increment shadow SKIPPED counter on rejection", e);
            }
            // Task is intentionally discarded — do NOT re-throw RejectedExecutionException
            // so the caller's try/catch around the submit is not required for correctness.
        });

        executor.initialize();
        return executor;
    }
}

package com.example.realestate.discover.citylaunch.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

/**
 * Bounded thread pool backing {@link com.example.realestate.discover.citylaunch.CityLaunchGraphWriter}'s
 * {@code @Async} background graph write (#1911 PR2).
 *
 * <p>core=2, max=8, queue=50 — deliberately bounded so a burst of admin "prepare" calls cannot
 * spawn unbounded threads. Uses the executor's DEFAULT rejection policy
 * ({@link java.util.concurrent.ThreadPoolExecutor.AbortPolicy}) rather than {@code CallerRunsPolicy}:
 * {@link com.example.realestate.discover.citylaunch.CityLaunchPreparationService#prepare} kicks the
 * async writer from an {@code afterCommit} transaction-synchronization callback, so if the
 * submission throws {@link java.util.concurrent.RejectedExecutionException} on saturation, the
 * admission transaction has ALREADY committed (the caller already received 202) — running the
 * graph write on the calling thread at that point would defeat the "genuine async" contract this
 * pipeline is built on. Instead the caller catches the rejection and synchronously marks the
 * revision FAILED via {@code CityLaunchGraphWriter#markFailed} (REQUIRES_NEW), so a saturated
 * executor never leaves a revision silently stuck in PREPARING.
 */
@Configuration
@EnableAsync
public class CityLaunchAsyncConfig {

    /** Bean name referenced by {@code @Async("cityLaunchGraphWriterExecutor")}. */
    public static final String EXECUTOR_NAME = "cityLaunchGraphWriterExecutor";

    @Bean(name = EXECUTOR_NAME)
    public Executor cityLaunchGraphWriterExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(8);
        executor.setQueueCapacity(50);
        executor.setThreadNamePrefix("city-launch-graph-");
        executor.setWaitForTasksToCompleteOnShutdown(false);
        executor.initialize();
        return executor;
    }
}

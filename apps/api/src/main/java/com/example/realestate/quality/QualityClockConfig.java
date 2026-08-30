package com.example.realestate.quality;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.time.Clock;

/**
 * Provides the {@link Clock} bean used by {@link QualityRecomputeService}.
 *
 * <p>Kept in the quality package so the Clock dependency is co-located with
 * its sole consumer. Tests inject a fixed-instant Clock directly into
 * {@link QualityRecomputeService}'s constructor.
 */
@Configuration
public class QualityClockConfig {

    @Bean
    public Clock clock() {
        return Clock.systemUTC();
    }
}

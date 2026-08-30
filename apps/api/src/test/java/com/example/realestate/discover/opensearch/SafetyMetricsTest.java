package com.example.realestate.discover.opensearch;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Unit tests for {@link SafetyMetrics}.
 *
 * Verifies each counter increments independently and stays at zero when not triggered.
 * Uses {@link SimpleMeterRegistry} (not mocked).
 */
class SafetyMetricsTest {

    private SimpleMeterRegistry registry;
    private SafetyMetrics safetyMetrics;

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
        safetyMetrics = new SafetyMetrics(registry);
    }

    @Test
    void recordNonPublicIndexed_incrementsNonPublicCounter() {
        safetyMetrics.recordNonPublicIndexed();

        Counter counter = registry.find(SafetyMetrics.NON_PUBLIC_INDEXED_METRIC).counter();
        assertThat(counter).isNotNull();
        assertThat(counter.count()).isEqualTo(1.0);
    }

    @Test
    void recordWhitelistViolation_incrementsWhitelistCounter() {
        safetyMetrics.recordWhitelistViolation();

        Counter counter = registry.find(SafetyMetrics.WHITELIST_VIOLATION_METRIC).counter();
        assertThat(counter).isNotNull();
        assertThat(counter.count()).isEqualTo(1.0);
    }

    @Test
    void recordSchemaValidationFailure_incrementsSchemaCounter() {
        safetyMetrics.recordSchemaValidationFailure();

        Counter counter = registry.find(SafetyMetrics.SCHEMA_VALIDATION_FAILURE_METRIC).counter();
        assertThat(counter).isNotNull();
        assertThat(counter.count()).isEqualTo(1.0);
    }

    @Test
    void counters_areIndependent_noSideEffects() {
        // Only trigger non-public counter
        safetyMetrics.recordNonPublicIndexed();
        safetyMetrics.recordNonPublicIndexed();

        assertThat(registry.find(SafetyMetrics.NON_PUBLIC_INDEXED_METRIC)
                .counter().count()).isEqualTo(2.0);
        assertThat(registry.find(SafetyMetrics.WHITELIST_VIOLATION_METRIC)
                .counter().count()).isEqualTo(0.0);
        assertThat(registry.find(SafetyMetrics.SCHEMA_VALIDATION_FAILURE_METRIC)
                .counter().count()).isEqualTo(0.0);
    }

    @Test
    void allCounters_startAtZero() {
        // No calls made — all must be zero in production steady-state
        assertThat(registry.find(SafetyMetrics.NON_PUBLIC_INDEXED_METRIC)
                .counter().count()).isEqualTo(0.0);
        assertThat(registry.find(SafetyMetrics.WHITELIST_VIOLATION_METRIC)
                .counter().count()).isEqualTo(0.0);
        assertThat(registry.find(SafetyMetrics.SCHEMA_VALIDATION_FAILURE_METRIC)
                .counter().count()).isEqualTo(0.0);
    }

    @Test
    void multipleIncrements_accumulateCorrectly() {
        for (int i = 0; i < 5; i++) safetyMetrics.recordNonPublicIndexed();
        for (int i = 0; i < 3; i++) safetyMetrics.recordWhitelistViolation();
        safetyMetrics.recordSchemaValidationFailure();

        assertThat(registry.find(SafetyMetrics.NON_PUBLIC_INDEXED_METRIC)
                .counter().count()).isEqualTo(5.0);
        assertThat(registry.find(SafetyMetrics.WHITELIST_VIOLATION_METRIC)
                .counter().count()).isEqualTo(3.0);
        assertThat(registry.find(SafetyMetrics.SCHEMA_VALIDATION_FAILURE_METRIC)
                .counter().count()).isEqualTo(1.0);
    }
}

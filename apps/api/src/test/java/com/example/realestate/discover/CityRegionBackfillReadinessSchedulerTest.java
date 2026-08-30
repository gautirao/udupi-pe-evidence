package com.example.realestate.discover;

import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link CityRegionBackfillReadinessScheduler} (#1907).
 *
 * <p>Uses a real {@link SimpleMeterRegistry} (not a mock) so the gauge value under test is read
 * back through Micrometer exactly as an operator/Prometheus scrape would see it, rather than
 * asserting on an internal field.
 */
@ExtendWith(MockitoExtension.class)
class CityRegionBackfillReadinessSchedulerTest {

    @Mock
    private CityRegionBackfillReadinessService readinessService;

    @Test
    void checkBackfillReadiness_setsGaugeToStaleCityCount_onSuccessfulRun() {
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        when(readinessService.findCitiesPendingBackfill()).thenReturn(List.of("bangalore", "udupi"));

        CityRegionBackfillReadinessScheduler scheduler =
                new CityRegionBackfillReadinessScheduler(readinessService, meterRegistry);

        scheduler.checkBackfillReadiness();

        assertThat(gaugeValue(meterRegistry)).isEqualTo(2.0);
    }

    /**
     * The exact "freeze on failure" contract the class documents: a failed check must leave the
     * gauge at its last-known-good value, not reset it to 0. If a future change simplifies the
     * catch block to reset the counter, this test must fail.
     */
    @Test
    void checkBackfillReadiness_leavesGaugeAtLastKnownValue_whenSubsequentRunThrows() {
        SimpleMeterRegistry meterRegistry = new SimpleMeterRegistry();
        when(readinessService.findCitiesPendingBackfill())
                .thenReturn(List.of("bangalore", "udupi", "mangalore"))
                .thenThrow(new RuntimeException("db unavailable"));

        CityRegionBackfillReadinessScheduler scheduler =
                new CityRegionBackfillReadinessScheduler(readinessService, meterRegistry);

        scheduler.checkBackfillReadiness();
        assertThat(gaugeValue(meterRegistry)).isEqualTo(3.0);

        scheduler.checkBackfillReadiness();

        assertThat(gaugeValue(meterRegistry)).isEqualTo(3.0);
    }

    private static double gaugeValue(SimpleMeterRegistry meterRegistry) {
        Gauge gauge = meterRegistry.get(CityRegionBackfillReadinessScheduler.STALE_CITIES_METRIC).gauge();
        return gauge.value();
    }
}

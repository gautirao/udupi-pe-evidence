package com.example.realestate.discover;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.Status;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link CityRegionBackfillReadinessHealthIndicator} (#1907).
 *
 * <p>Mocks {@link CityRegionBackfillReadinessService} — no DB required. Covers all three
 * distinguishable states in the {@code details} payload: healthy (no stale cities), stale
 * (non-empty stale city list), and query-failed (explicit {@code checkStatus=ERROR}). In every
 * case, {@link CityRegionBackfillReadinessHealthIndicator#health()} must ALWAYS return
 * {@link Status#UP}, even when the underlying query throws.
 */
@ExtendWith(MockitoExtension.class)
class CityRegionBackfillReadinessHealthIndicatorTest {

    @Mock
    private CityRegionBackfillReadinessService readinessService;

    @Test
    void health_returnsUp_withStaleCitiesAndCountDetails() {
        when(readinessService.findCitiesPendingBackfill()).thenReturn(List.of("bangalore"));

        CityRegionBackfillReadinessHealthIndicator indicator =
                new CityRegionBackfillReadinessHealthIndicator(readinessService);

        Health health = indicator.health();

        assertThat(health.getStatus()).isEqualTo(Status.UP);
        assertThat(health.getDetails()).containsEntry("checkStatus", "OK");
        assertThat(health.getDetails()).containsEntry("staleCities", List.of("bangalore"));
        assertThat(health.getDetails()).containsEntry("staleCityCount", 1);
        assertThat(health.getDetails()).doesNotContainKey("error");
    }

    @Test
    void health_returnsUp_withEmptyDetails_whenNoCitiesPending() {
        when(readinessService.findCitiesPendingBackfill()).thenReturn(List.of());

        CityRegionBackfillReadinessHealthIndicator indicator =
                new CityRegionBackfillReadinessHealthIndicator(readinessService);

        Health health = indicator.health();

        assertThat(health.getStatus()).isEqualTo(Status.UP);
        assertThat(health.getDetails()).containsEntry("checkStatus", "OK");
        assertThat(health.getDetails()).containsEntry("staleCities", List.of());
        assertThat(health.getDetails()).containsEntry("staleCityCount", 0);
        assertThat(health.getDetails()).doesNotContainKey("error");
    }

    @Test
    void health_returnsUp_neverDown_whenServiceThrows() {
        when(readinessService.findCitiesPendingBackfill()).thenThrow(new RuntimeException("db unavailable"));

        CityRegionBackfillReadinessHealthIndicator indicator =
                new CityRegionBackfillReadinessHealthIndicator(readinessService);

        Health health = indicator.health();

        assertThat(health.getStatus()).isEqualTo(Status.UP);
        assertThat(health.getDetails()).containsEntry("checkStatus", "ERROR");
        assertThat(health.getDetails()).containsEntry("staleCityCount", -1);
        assertThat(health.getDetails()).containsKey("error");
    }
}

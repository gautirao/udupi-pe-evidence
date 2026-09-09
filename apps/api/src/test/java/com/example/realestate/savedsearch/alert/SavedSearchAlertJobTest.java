package com.example.realestate.savedsearch.alert;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.example.realestate.savedsearch.SavedSearchRepository;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;

/** #2019 Slice B: scheduling contract + lock-skip path (mirrors {@code BookingSchedulerTest}). */
class SavedSearchAlertJobTest {

    @Test
    @DisplayName("scheduled hourly at :17 UTC")
    void scheduledAnnotation_hourlyUtc() throws NoSuchMethodException {
        Scheduled scheduled = SavedSearchAlertJob.class.getMethod("run").getAnnotation(Scheduled.class);
        assertThat(scheduled).isNotNull();
        assertThat(scheduled.cron()).isEqualTo("0 17 * * * *");
        assertThat(scheduled.zone()).isEqualTo("UTC");
    }

    @Test
    @DisplayName("when the advisory lock is held elsewhere the run evaluates nothing")
    void lockHeld_skipsRun() {
        SavedSearchRepository repo = mock(SavedSearchRepository.class);
        SavedSearchAlertDeliveryService delivery = mock(SavedSearchAlertDeliveryService.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(any(String.class), eq(Boolean.class), anyInt())).thenReturn(false);

        SavedSearchAlertJob.RunSummary summary =
                new SavedSearchAlertJob(repo, delivery, jdbc).runNow(OffsetDateTime.now());

        assertThat(summary.lockAcquired()).isFalse();
        assertThat(summary.evaluated()).isZero();
        verifyNoInteractions(repo, delivery);
    }
}

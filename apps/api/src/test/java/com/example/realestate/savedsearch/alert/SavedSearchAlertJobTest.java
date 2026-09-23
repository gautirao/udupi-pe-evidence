package com.example.realestate.savedsearch.alert;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.example.realestate.savedsearch.SavedSearch;
import com.example.realestate.savedsearch.SavedSearchRepository;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

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
                new SavedSearchAlertJob(repo, delivery, jdbc, recordingTransactionManager())
                        .runNow(OffsetDateTime.now());

        assertThat(summary.lockAcquired()).isFalse();
        assertThat(summary.evaluated()).isZero();
        verifyNoInteractions(repo, delivery);
    }

    @Test
    @DisplayName("#2482: the email send happens only AFTER the claim transaction has committed")
    void emailSend_happensAfterClaimTransactionCommits() {
        SavedSearchRepository repo = mock(SavedSearchRepository.class);
        SavedSearchAlertDeliveryService delivery = mock(SavedSearchAlertDeliveryService.class);
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(any(String.class), eq(Boolean.class), anyInt())).thenReturn(true);

        SavedSearch due = mock(SavedSearch.class);
        when(repo.findDueForAlertEvaluation(any())).thenReturn(List.of(due));

        SavedSearchAlertDeliveryService.PendingEmail pending = new SavedSearchAlertDeliveryService.PendingEmail(
                UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                "label", "scope", "filters", 1, "https://example.test/discover");
        when(delivery.evaluate(eq(due), any())).thenReturn(new SavedSearchAlertDeliveryService.Claim(
                new SavedSearchAlertDeliveryService.Outcome(1, true, Optional.empty()), Optional.of(pending)));

        // The ordered log of transaction-manager events and send calls. A regression that put the
        // send back inside the transaction would interleave "deliver" before "commit" here.
        List<String> events = new ArrayList<>();
        doAnswer(inv -> {
            events.add("deliver");
            return null;
        }).when(delivery).deliver(eq(pending), any());

        SavedSearchAlertJob.RunSummary summary =
                new SavedSearchAlertJob(repo, delivery, jdbc, recordingTransactionManager(events))
                        .runNow(OffsetDateTime.now());

        assertThat(summary.lockAcquired()).isTrue();
        assertThat(summary.delivered()).isEqualTo(1);
        assertThat(events)
                .as("the claim transaction must be committed before the outbound send is attempted")
                .containsExactly("getTransaction", "commit", "deliver");
    }

    private static PlatformTransactionManager recordingTransactionManager() {
        return recordingTransactionManager(new ArrayList<>());
    }

    /**
     * A minimal real {@link PlatformTransactionManager} that appends each lifecycle call to
     * {@code events}, so a test can assert the ORDER of commit versus the outbound send rather
     * than merely that both happened.
     */
    private static PlatformTransactionManager recordingTransactionManager(List<String> events) {
        return new PlatformTransactionManager() {
            @Override
            public TransactionStatus getTransaction(TransactionDefinition definition) {
                events.add("getTransaction");
                return new SimpleTransactionStatus();
            }

            @Override
            public void commit(TransactionStatus status) {
                events.add("commit");
            }

            @Override
            public void rollback(TransactionStatus status) {
                events.add("rollback");
            }
        };
    }
}

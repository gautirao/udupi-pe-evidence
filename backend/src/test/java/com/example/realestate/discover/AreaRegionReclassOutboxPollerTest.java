package com.example.realestate.discover;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Mockito unit test for {@link AreaRegionReclassOutboxPoller} (#1887 PR3). Mirrors
 * {@code SearchOutboxPollerTest}'s style: mocked {@link JdbcOperations} and
 * {@link CityRegionOnboardingService}, a real {@link SimpleMeterRegistry} so the poller's
 * self-registered counters work without additional mocking.
 */
@ExtendWith(MockitoExtension.class)
class AreaRegionReclassOutboxPollerTest {

    @Mock
    private JdbcOperations jdbcOperations;

    @Mock
    private CityRegionOnboardingService cityRegionOnboardingService;

    private AreaRegionReclassProperties props;
    private AreaRegionReclassOutboxPoller poller;

    @BeforeEach
    void setUp() {
        props = new AreaRegionReclassProperties();
        props.setBatchSize(10);
        props.setMaxRetryAttempts(3);
        props.setRetryDelaySeconds(60);
        props.setMaxBackoffSeconds(3600);
        poller = new AreaRegionReclassOutboxPoller(
                jdbcOperations, cityRegionOnboardingService, props, new SimpleMeterRegistry());
    }

    @SuppressWarnings("unchecked")
    private void stubPendingBatch(List<Map<String, Object>> rows) {
        when(jdbcOperations.query(any(String.class), any(RowMapper.class), any(), any(), anyInt()))
                .thenAnswer(invocation -> {
                    RowMapper<Object> mapper = invocation.getArgument(1);
                    List<Object> results = new java.util.ArrayList<>();
                    int rowNum = 0;
                    for (Map<String, Object> row : rows) {
                        ResultSet rs = mockResultSet(row);
                        results.add(mapper.mapRow(rs, rowNum++));
                    }
                    return results;
                });
    }

    private static ResultSet mockResultSet(Map<String, Object> row) throws SQLException {
        ResultSet rs = org.mockito.Mockito.mock(ResultSet.class);
        when(rs.getLong("id")).thenReturn(((Number) row.get("id")).longValue());
        when(rs.getInt("city_id")).thenReturn(((Number) row.get("city_id")).intValue());
        when(rs.getInt("retry_count")).thenReturn(((Number) row.getOrDefault("retry_count", 0)).intValue());
        return rs;
    }

    @Test
    void pollAndPublish_success_marksPublished() {
        stubPendingBatch(List.of(Map.of("id", 1L, "city_id", 42, "retry_count", 0)));

        poller.pollAndPublish();

        verify(cityRegionOnboardingService).apply(42);
        verify(jdbcOperations).update(
                org.mockito.ArgumentMatchers.contains("SET published_at"),
                any(Timestamp.class), eq("PUBLISHED"), eq(1L));
    }

    @Test
    void pollAndPublish_emptyBatch_noopNoUpdate() {
        stubPendingBatch(List.of());

        poller.pollAndPublish();

        verify(cityRegionOnboardingService, never()).apply(anyInt());
        verify(jdbcOperations, never()).update(any(String.class), any(), any(), any());
    }

    @Test
    void pollAndPublish_unexpectedException_rearmsBelowMaxAttempts() {
        stubPendingBatch(List.of(Map.of("id", 2L, "city_id", 7, "retry_count", 0)));
        doThrow(new RuntimeException("db timeout")).when(cityRegionOnboardingService).apply(7);

        poller.pollAndPublish();

        ArgumentCaptor<Integer> retryCaptor = ArgumentCaptor.forClass(Integer.class);
        verify(jdbcOperations).update(
                org.mockito.ArgumentMatchers.contains("SET retry_count = ?, next_attempt_at = ?"),
                retryCaptor.capture(), any(Timestamp.class), any(), any(Timestamp.class), eq(2L));
        assertThat(retryCaptor.getValue()).isEqualTo(1);
    }

    @Test
    void pollAndPublish_unexpectedException_marksDeadAtMaxAttempts() {
        stubPendingBatch(List.of(Map.of("id", 3L, "city_id", 9, "retry_count", 2)));
        doThrow(new RuntimeException("db timeout")).when(cityRegionOnboardingService).apply(9);

        poller.pollAndPublish();

        // retry_count was 2, this is the 3rd attempt (2+1=3 >= maxRetryAttempts=3) -> DEAD.
        verify(jdbcOperations).update(
                org.mockito.ArgumentMatchers.contains("status = 'DEAD'"),
                eq(3), any(), any(Timestamp.class), eq(3L));
    }

    @Test
    void pollAndPublish_regionOnboardingBlockedException_rearmsNeverDead() {
        stubPendingBatch(List.of(Map.of("id", 4L, "city_id", 11, "retry_count", 10)));
        doThrow(new RegionOnboardingBlockedException(
                RegionOnboardingBlockedException.Reason.MISSING_POLICY, "no policy"))
                .when(cityRegionOnboardingService).apply(11);

        poller.pollAndPublish();

        // Even at a high retry_count, a blocked exception NEVER marks DEAD — always re-arms.
        verify(jdbcOperations, never()).update(org.mockito.ArgumentMatchers.contains("status = 'DEAD'"),
                any(), any(), any(), any());
        verify(jdbcOperations).update(
                org.mockito.ArgumentMatchers.contains("SET retry_count = ?, next_attempt_at = ?"),
                eq(11), any(Timestamp.class), any(), any(Timestamp.class), eq(4L));
    }

    @Test
    void pollAndPublish_blockedExceptionBackoff_capsAtMaxBackoffSeconds() {
        props.setRetryDelaySeconds(60);
        props.setMaxBackoffSeconds(300);
        // retry_count=10 -> newRetryCount=11 -> 60 * 2^10 would massively exceed the 300s cap.
        stubPendingBatch(List.of(Map.of("id", 5L, "city_id", 13, "retry_count", 10)));
        doThrow(new RegionOnboardingBlockedException(
                RegionOnboardingBlockedException.Reason.MISSING_CLASSIFICATIONS, "no classifications"))
                .when(cityRegionOnboardingService).apply(13);

        Instant before = Instant.now();
        poller.pollAndPublish();

        ArgumentCaptor<Timestamp> nextAttemptCaptor = ArgumentCaptor.forClass(Timestamp.class);
        verify(jdbcOperations).update(
                org.mockito.ArgumentMatchers.contains("SET retry_count = ?, next_attempt_at = ?"),
                eq(11), nextAttemptCaptor.capture(), any(), any(Timestamp.class), eq(5L));

        // Backoff must never exceed maxBackoffSeconds (300s) beyond the poll-cycle start `now`.
        assertThat(nextAttemptCaptor.getValue().toInstant()).isBeforeOrEqualTo(before.plusSeconds(301));
    }

    @Test
    void pollAndPublish_poisonIsolation_oneFailureDoesNotAbortBatch() {
        stubPendingBatch(List.of(
                Map.of("id", 6L, "city_id", 20, "retry_count", 0),
                Map.of("id", 7L, "city_id", 21, "retry_count", 0)));
        doThrow(new RuntimeException("boom")).when(cityRegionOnboardingService).apply(20);

        poller.pollAndPublish();

        verify(cityRegionOnboardingService).apply(20);
        verify(cityRegionOnboardingService).apply(21);
        // The second (healthy) event still gets published despite the first's failure.
        verify(jdbcOperations).update(
                org.mockito.ArgumentMatchers.contains("SET published_at"),
                any(Timestamp.class), eq("PUBLISHED"), eq(7L));
        verify(jdbcOperations, times(1)).update(
                org.mockito.ArgumentMatchers.contains("SET retry_count = ?, next_attempt_at = ?"),
                any(), any(), any(), any(), eq(6L));
    }
}

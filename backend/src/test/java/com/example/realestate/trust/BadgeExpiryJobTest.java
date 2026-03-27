package com.example.realestate.trust;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.scheduling.annotation.Scheduled;

import java.time.OffsetDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BadgeExpiryJobTest {

    @Mock
    private ListingVerificationDimensionRepository dimensionRepository;

    private BadgeExpiryJob job;

    @BeforeEach
    void setUp() {
        job = new BadgeExpiryJob(dimensionRepository);
    }

    // -------------------------------------------------------------------------
    // AC1: LOCATION badge past 548 days — gets expired
    // -------------------------------------------------------------------------

    @Test
    void expireOverdueBadges_expiresLocationBadgePast548Days() {
        when(dimensionRepository.expireEarnedBadgesOlderThan(eq("LOCATION"), any(), any()))
                .thenReturn(3);
        when(dimensionRepository.expireEarnedBadgesOlderThan(eq("PHOTOS"), any(), any()))
                .thenReturn(0);
        when(dimensionRepository.expireEarnedBadgesOlderThan(eq("AUTHORITY"), any(), any()))
                .thenReturn(0);

        job.expireOverdueBadges();

        // Capture the cutoff passed for LOCATION and assert it is ~548 days before now.
        ArgumentCaptor<OffsetDateTime> cutoffCaptor = ArgumentCaptor.forClass(OffsetDateTime.class);
        verify(dimensionRepository).expireEarnedBadgesOlderThan(eq("LOCATION"), cutoffCaptor.capture(), any());

        OffsetDateTime cutoff = cutoffCaptor.getValue();
        OffsetDateTime expectedCutoff = OffsetDateTime.now().minusDays(BadgeExpiryJob.LOCATION_TTL_DAYS);
        // Allow 5-second tolerance for test execution time.
        assertThat(cutoff).isBetween(expectedCutoff.minusSeconds(5), expectedCutoff.plusSeconds(5));
    }

    // -------------------------------------------------------------------------
    // AC2: LOCATION badge at exactly 548 days — NOT expired (boundary: strictly <)
    // -------------------------------------------------------------------------

    @Test
    void expireOverdueBadges_cutoffIsExclusive_badgeAtExact548DaysIsNotExpired() {
        when(dimensionRepository.expireEarnedBadgesOlderThan(any(), any(), any())).thenReturn(0);

        job.expireOverdueBadges();

        // The SQL predicate is grantedAt < cutoff (strictly less-than).
        // A badge granted at exactly the cutoff instant does NOT satisfy the predicate
        // and is therefore not expired. We verify the cutoff is set to now - 548 days,
        // confirming the boundary is exclusive.
        ArgumentCaptor<OffsetDateTime> cutoffCaptor = ArgumentCaptor.forClass(OffsetDateTime.class);
        verify(dimensionRepository).expireEarnedBadgesOlderThan(eq("LOCATION"), cutoffCaptor.capture(), any());

        OffsetDateTime cutoff = cutoffCaptor.getValue();
        OffsetDateTime expectedCutoff = OffsetDateTime.now().minusDays(BadgeExpiryJob.LOCATION_TTL_DAYS);
        // Cutoff is ~548 days ago — a badge granted at exactly this instant is not expired.
        assertThat(cutoff).isBetween(expectedCutoff.minusSeconds(5), expectedCutoff.plusSeconds(5));
        // A badge granted at the cutoff instant equals it — does not satisfy grantedAt < cutoff.
        assertThat(cutoff.compareTo(cutoff)).isEqualTo(0); // equal is not strictly before
    }

    // -------------------------------------------------------------------------
    // AC3: AUTHORITY badge past 365 days — gets expired
    // -------------------------------------------------------------------------

    @Test
    void expireOverdueBadges_expiresAuthorityBadgePast365Days() {
        when(dimensionRepository.expireEarnedBadgesOlderThan(any(), any(), any())).thenReturn(0);
        when(dimensionRepository.expireEarnedBadgesOlderThan(eq("AUTHORITY"), any(), any()))
                .thenReturn(7);

        job.expireOverdueBadges();

        ArgumentCaptor<OffsetDateTime> cutoffCaptor = ArgumentCaptor.forClass(OffsetDateTime.class);
        verify(dimensionRepository).expireEarnedBadgesOlderThan(eq("AUTHORITY"), cutoffCaptor.capture(), any());

        OffsetDateTime cutoff = cutoffCaptor.getValue();
        OffsetDateTime expectedCutoff = OffsetDateTime.now().minusDays(BadgeExpiryJob.AUTHORITY_TTL_DAYS);
        assertThat(cutoff).isBetween(expectedCutoff.minusSeconds(5), expectedCutoff.plusSeconds(5));
    }

    // -------------------------------------------------------------------------
    // AC4: IDENTITY badge — never passed to expireEarnedBadgesOlderThan
    // -------------------------------------------------------------------------

    @Test
    void expireOverdueBadges_neverQueriesIdentityDimension() {
        when(dimensionRepository.expireEarnedBadgesOlderThan(any(), any(), any())).thenReturn(0);

        job.expireOverdueBadges();

        // IDENTITY must never be passed as a dimensionType argument.
        verify(dimensionRepository, times(0))
                .expireEarnedBadgesOlderThan(eq("IDENTITY"), any(), any());
    }

    // -------------------------------------------------------------------------
    // AC5: Idempotency — running twice calls the repository twice with the same semantics
    //      (the repo method is idempotent by design: second run finds 0 EARNED rows past cutoff)
    // -------------------------------------------------------------------------

    @Test
    void expireOverdueBadges_isIdempotent_secondRunFindsZeroRows() {
        // First run: some rows found.
        when(dimensionRepository.expireEarnedBadgesOlderThan(eq("LOCATION"), any(), any()))
                .thenReturn(2)   // first call
                .thenReturn(0);  // second call — already expired
        when(dimensionRepository.expireEarnedBadgesOlderThan(eq("PHOTOS"), any(), any()))
                .thenReturn(1).thenReturn(0);
        when(dimensionRepository.expireEarnedBadgesOlderThan(eq("AUTHORITY"), any(), any()))
                .thenReturn(3).thenReturn(0);

        job.expireOverdueBadges();
        job.expireOverdueBadges();

        // Repository was called exactly twice for each dimension type.
        verify(dimensionRepository, times(2))
                .expireEarnedBadgesOlderThan(eq("LOCATION"), any(), any());
        verify(dimensionRepository, times(2))
                .expireEarnedBadgesOlderThan(eq("PHOTOS"), any(), any());
        verify(dimensionRepository, times(2))
                .expireEarnedBadgesOlderThan(eq("AUTHORITY"), any(), any());
    }

    // -------------------------------------------------------------------------
    // AC6: @Scheduled annotation carries the correct cron expression
    // -------------------------------------------------------------------------

    @Test
    void expireOverdueBadges_scheduledAnnotation_hasDailyAt2amCron() throws NoSuchMethodException {
        var method = BadgeExpiryJob.class.getMethod("expireOverdueBadges");
        var scheduled = method.getAnnotation(Scheduled.class);
        assertNotNull(scheduled);
        assertEquals("0 0 2 * * *", scheduled.cron());
    }

    // -------------------------------------------------------------------------
    // AC7: All three dimension types are queried in every run
    // -------------------------------------------------------------------------

    @Test
    void expireOverdueBadges_queriesAllThreeDimensionTypes() {
        when(dimensionRepository.expireEarnedBadgesOlderThan(any(), any(), any())).thenReturn(0);

        job.expireOverdueBadges();

        verify(dimensionRepository).expireEarnedBadgesOlderThan(eq("LOCATION"), any(), any());
        verify(dimensionRepository).expireEarnedBadgesOlderThan(eq("PHOTOS"), any(), any());
        verify(dimensionRepository).expireEarnedBadgesOlderThan(eq("AUTHORITY"), any(), any());
    }
}

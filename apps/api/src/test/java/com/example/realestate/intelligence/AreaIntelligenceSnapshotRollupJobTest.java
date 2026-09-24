package com.example.realestate.intelligence;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link AreaIntelligenceSnapshotRollupJob}.
 *
 * <p>Mirrors the mocked-collaborator pattern in {@code AreaOverviewRollupJobTest} /
 * {@code AreaDemandSignalRollupJob}: verify the job's entry points delegate to the injected
 * service exactly once, without exercising the real snapshot build pipeline (covered by
 * {@code AreaIntelligenceSnapshotIT}).
 */
@ExtendWith(MockitoExtension.class)
class AreaIntelligenceSnapshotRollupJobTest {

    @Mock
    private AreaIntelligenceSnapshotService snapshotService;

    private AreaIntelligenceSnapshotRollupJob job;

    @BeforeEach
    void setUp() {
        job = new AreaIntelligenceSnapshotRollupJob(snapshotService);
    }

    @Nested
    class RunTests {

        @Test
        void run_callsBuildSnapshotsExactlyOnce() {
            when(snapshotService.buildSnapshots()).thenReturn(5);

            job.run();

            verify(snapshotService, times(1)).buildSnapshots();
        }
    }

    @Nested
    class RunScheduledTests {

        @Test
        void runScheduled_delegatesToRun_callsBuildSnapshotsExactlyOnce() {
            when(snapshotService.buildSnapshots()).thenReturn(3);

            job.runScheduled();

            verify(snapshotService, times(1)).buildSnapshots();
        }
    }
}

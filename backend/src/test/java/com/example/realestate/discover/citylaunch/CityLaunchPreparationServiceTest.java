package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.CityRegionOnboardingService;
import com.example.realestate.discover.RegionOnboardingBlockedException;
import com.example.realestate.discover.RegionalClassificationBackfillService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.ResultSetExtractor;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Mockito unit tests for {@link CityLaunchPreparationService#prepare}'s #2163
 * self-materialization orchestration ({@code ensureCanonicalGeography}), isolated from real
 * Postgres — complements the Testcontainers coverage in {@link CityLaunchPreparationServiceIT}.
 */
@ExtendWith(MockitoExtension.class)
class CityLaunchPreparationServiceTest {

    @Mock private CityLaunchRevisionRepository revisionRepository;
    @Mock private CanonicalGeographyReader geographyReader;
    @Mock private CityLaunchGraphWriter graphWriter;
    @Mock private CityLaunchSseService sseService;
    @Mock private CityRegionOnboardingService cityRegionOnboardingService;
    @Mock private RegionalClassificationBackfillService regionalClassificationBackfillService;
    @Mock private JdbcOperations jdbcOperations;

    private CityLaunchPreparationService service;

    private static final int CITY_ID = 42;
    private static final UUID CALLER_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        service = new CityLaunchPreparationService(
                revisionRepository, geographyReader, graphWriter, sseService,
                cityRegionOnboardingService, regionalClassificationBackfillService, jdbcOperations);
    }

    private CanonicalGeographyReader.CanonicalCity city() {
        return new CanonicalGeographyReader.CanonicalCity(CITY_ID, "citytest", "City Test");
    }

    private CanonicalGeographyReader.CanonicalArea activeArea(String areaKey) {
        return new CanonicalGeographyReader.CanonicalArea(
                areaKey, "Area", "district", 13.0, 74.7, null, null, null, null,
                null, null, null, "ACTIVE");
    }

    @SuppressWarnings("unchecked")
    private void stubAdvisoryLock() {
        when(jdbcOperations.query(anyString(), any(ResultSetExtractor.class), any(), any()))
                .thenReturn(null);
    }

    @Test
    @DisplayName("prepare() delegates region materialization to CityRegionOnboardingService.apply() "
            + "rather than reimplementing onboarding logic inline")
    void prepare_delegatesToCityRegionOnboardingService() {
        stubAdvisoryLock();
        when(geographyReader.findCity(CITY_ID)).thenReturn(Optional.of(city()));
        CanonicalGeographyReader.CanonicalGeography geography = new CanonicalGeographyReader.CanonicalGeography(
                List.of(activeArea("citytest|d|g|a1")), List.of(),
                List.of(new CanonicalGeographyReader.CanonicalCityRegion(
                        "CENTRAL", "Central", 1, null, null, null, null, null, null, null)),
                List.of(), List.of(), List.of());
        when(geographyReader.loadGeography(CITY_ID)).thenReturn(geography);
        when(jdbcOperations.queryForObject(anyString(), eq(Integer.class), any())).thenReturn(1);
        when(revisionRepository.findByCityId(CITY_ID)).thenReturn(List.of());
        CityLaunchRevision saved = new CityLaunchRevision(CITY_ID, 1, CALLER_ID);
        when(revisionRepository.saveAndFlush(any())).thenReturn(saved);

        service.prepare(CITY_ID, CALLER_ID);

        verify(cityRegionOnboardingService, times(1)).apply(CITY_ID);
        verify(regionalClassificationBackfillService, never()).runBackfill(anyString());
    }

    @Test
    @DisplayName("prepare() converts a RegionOnboardingBlockedException/NAMESPACE_COLLISION from "
            + "apply() into CityPrerequisiteGenerationException with the same reason name")
    void prepare_namespaceCollision_convertsToCityPrerequisiteGenerationException() {
        stubAdvisoryLock();
        when(geographyReader.findCity(CITY_ID)).thenReturn(Optional.of(city()));
        CanonicalGeographyReader.CanonicalGeography geography = new CanonicalGeographyReader.CanonicalGeography(
                List.of(activeArea("citytest|d|g|a1")), List.of(), List.of(), List.of(), List.of(), List.of());
        when(geographyReader.loadGeography(CITY_ID)).thenReturn(geography);
        when(jdbcOperations.queryForObject(anyString(), eq(Integer.class), any())).thenReturn(1);
        org.mockito.Mockito.doThrow(new RegionOnboardingBlockedException(
                        RegionOnboardingBlockedException.Reason.NAMESPACE_COLLISION, "collision detail"))
                .when(cityRegionOnboardingService).apply(CITY_ID);

        assertThatThrownBy(() -> service.prepare(CITY_ID, CALLER_ID))
                .isInstanceOf(CityPrerequisiteGenerationException.class)
                .satisfies(ex -> {
                    CityPrerequisiteGenerationException cpe = (CityPrerequisiteGenerationException) ex;
                    assertThat(cpe.reason()).isEqualTo("NAMESPACE_COLLISION");
                    assertThat(cpe.getMessage()).isEqualTo("collision detail");
                    assertThat(cpe.remediation()).isNotBlank();
                });

        verify(revisionRepository, never()).saveAndFlush(any());
    }

    @Test
    @DisplayName("prepare() on a city with zero ACTIVE areas fails fast with "
            + "CityPrerequisiteGenerationException/NO_ACTIVE_AREAS, WITHOUT ever invoking the "
            + "backfill or onboarding services")
    void prepare_noActiveAreas_failsFast_withoutInvokingDownstreamServices() {
        stubAdvisoryLock();
        when(geographyReader.findCity(CITY_ID)).thenReturn(Optional.of(city()));
        CanonicalGeographyReader.CanonicalGeography geography = new CanonicalGeographyReader.CanonicalGeography(
                List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        when(geographyReader.loadGeography(CITY_ID)).thenReturn(geography);

        assertThatThrownBy(() -> service.prepare(CITY_ID, CALLER_ID))
                .isInstanceOf(CityPrerequisiteGenerationException.class)
                .satisfies(ex -> assertThat(((CityPrerequisiteGenerationException) ex).reason())
                        .isEqualTo("NO_ACTIVE_AREAS"));

        verifyNoInteractions(regionalClassificationBackfillService, cityRegionOnboardingService);
        verify(revisionRepository, never()).saveAndFlush(any());
    }
}

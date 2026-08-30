package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.navigation.NavigationTreeGenerationService;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * Testcontainers integration test (real Postgres) for #2157 AC3: {@link CityLaunchGraphWriter}'s
 * initial-generation "prepare" flow must perform EXACTLY ONE canonical-geography read for the
 * whole flow — {@link CanonicalGeographyReader#loadGeography(int)} is called by {@code
 * writeGraphTransactional} itself and NOWHERE else (in particular, {@link
 * NavigationTreeGenerationService} must never call it again for the same revision).
 *
 * <p>Mirrors {@link CityLaunchNavigationOverrideServiceIT}'s harness (same Testcontainers image,
 * Flyway locations, JWT stub, cleanup shape).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.mixed=true",
        "spring.flyway.placeholders.concurrently_keyword=",
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://test.example.com/auth/v1",
        "AI_API_KEY=test-dummy-not-used-in-city-launch-it",
        "spring.task.scheduling.enabled=false"
})
class CityLaunchGraphWriterNavigationSnapshotIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine").asCompatibleSubstituteFor("postgres"));

    @TestConfiguration
    static class TestJwtDecoderConfig {
        @Bean
        @Primary
        public JwtDecoder testJwtDecoder() {
            return token -> Jwt.withTokenValue(token)
                    .header("alg", "none")
                    .subject(token)
                    .issuedAt(Instant.now())
                    .expiresAt(Instant.now().plusSeconds(3600))
                    .build();
        }
    }

    @Autowired private CityLaunchPreparationService preparationService;
    @Autowired private CityLaunchRevisionRepository revisionRepository;
    @Autowired private JdbcTemplate jdbc;

    /**
     * Spy on the REAL {@link CanonicalGeographyReader} bean — all calls still hit the real DB, but
     * every invocation is recorded for verification. This is the class {@link
     * CityLaunchGraphWriter#writeGraphTransactional} reads canonical geography through; before
     * #2157, {@link NavigationTreeGenerationService} ALSO held one and called {@code
     * loadGeography(cityId)} a second time inside the same transaction — the exact double-read
     * this test guards against regressing.
     */
    @MockitoSpyBean
    private CanonicalGeographyReader geographyReader;

    private static final UUID ADMIN_ID = UUID.randomUUID();
    private final List<String> testCitySlugs = new ArrayList<>();

    @BeforeEach
    void setUp() {
        testCitySlugs.clear();
    }

    @AfterEach
    void cleanup() {
        for (String slug : testCitySlugs) {
            Integer cityId = jdbc.queryForObject("SELECT id FROM public.cities WHERE slug = ?", Integer.class, slug);
            if (cityId == null) {
                continue;
            }
            jdbc.update("DELETE FROM public.city_launch_revision WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.navigation_nodes WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_region_policy WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_region_memberships WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.city_regions WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.regional_area_classifications WHERE city_key = ?", slug);
            jdbc.update("DELETE FROM public.areas WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.cities WHERE id = ?", cityId);
        }
    }

    private static void pollUntil(Runnable assertion) {
        long deadline = System.currentTimeMillis() + 15_000;
        AssertionError lastError;
        do {
            try {
                assertion.run();
                return;
            } catch (AssertionError e) {
                lastError = e;
                try {
                    Thread.sleep(100);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw e;
                }
            }
        } while (System.currentTimeMillis() < deadline);
        throw lastError;
    }

    /** 4 areas / 1 region / a real city_region_policy row, plus the #2163 decoy classified area
     *  CityRegionOnboardingService.apply() requires — mirrors CityLaunchNavigationOverrideServiceIT's
     *  seedCityWithTwoClusters, trimmed to what AC3 needs (no clustering assertions here). */
    private int seedCity(String slug) {
        testCitySlugs.add(slug);
        int cityId = jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.7, false) RETURNING id",
                Integer.class, slug, slug + "-test-city");

        jdbc.update("INSERT INTO public.city_region_policy "
                        + "(city_id, region_model, central_radius_km, max_direct_children, min_areas_per_cluster, "
                        + " max_safety_depth, one_child_prevention, compactness_threshold, separation_threshold, "
                        + " partition_method, representative_selection, outlier_rule, centre_treatment) "
                        + "VALUES (?, 'CENTRAL_CARDINAL_8', 3.0, 3, 1, 6, false, 0.35, 0.5, "
                        + " 'GEOMETRIC_BISECTION', 'CENTROID_NEAREST', 'ATTACH_NEAREST_CLUSTER', 'AREA_CENTROID_MEAN')",
                cityId);

        String decoyAreaKey = slug + "|d|g|decoy-2163";
        jdbc.update(
                "INSERT INTO public.areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon, "
                        + "lifecycle_status) VALUES (?, ?, ?, ?, ?, ?, 'INACTIVE')",
                decoyAreaKey, cityId, decoyAreaKey, slug + "-district", 13.0, 74.7);
        jdbc.update(
                "INSERT INTO public.regional_area_classifications "
                        + "(city_key, area_key, direction_key, distance_band_key, bearing_deg, distance_km, computed_at) "
                        + "VALUES (?, ?, 'N', '0_10', 0.0, 5.0, now())",
                slug, decoyAreaKey);

        for (int i = 1; i <= 4; i++) {
            double lat = 13.0 + i * 0.1;
            double lon = 74.7;
            jdbc.update(
                    "INSERT INTO public.areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon, "
                            + " min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    slug + "|d|g|area-" + i, cityId, "Area " + i, slug + "-district", lat, lon,
                    lat - 0.001, lon - 0.001, lat + 0.001, lon + 0.001);
        }

        jdbc.update("INSERT INTO public.city_regions (city_id, region_key, display_label, display_order) "
                + "VALUES (?, ?, ?, 1)", cityId, slug + "-north", slug + "-north");
        for (int i = 1; i <= 4; i++) {
            jdbc.update("INSERT INTO public.city_region_memberships "
                            + "(city_id, area_key, region_key, assignment_source) VALUES (?, ?, ?, 'OVERRIDE')",
                    cityId, slug + "|d|g|area-" + i, slug + "-north");
        }

        return cityId;
    }

    @Test
    @DisplayName("[#2157 AC3] the async graph-write phase (CityLaunchGraphWriter.writeGraphTransactional, "
            + "including navigation-tree generation) performs EXACTLY ONE CanonicalGeographyReader."
            + "loadGeography call — no second, independent read from NavigationTreeGenerationService. "
            + "Scoped to AFTER prepare()'s own synchronous admission phase returns: prepare() itself "
            + "legitimately calls loadGeography twice before admission (#2163's ensureCanonicalGeography "
            + "+ validateCanonicalGeographyReady, both pre-existing and out of #2157's scope) — counting "
            + "those here would conflate an unrelated pre-existing double-read with the ONE this fix "
            + "actually targets: the second read writeGraphTransactional's OWN transaction used to take, "
            + "via NavigationTreeGenerationService's now-removed CanonicalGeographyReader dependency")
    void writeGraphTransactionalPhase_readsCanonicalGeographyExactlyOnce() {
        int cityId = seedCity("ac3snap1");

        PrepareResponse prep = preparationService.prepare(cityId, ADMIN_ID);
        // prepare()'s own synchronous admission phase (ensureCanonicalGeography +
        // validateCanonicalGeographyReady) has already run and returned at this point — clear those
        // pre-existing, out-of-scope invocations so the verification below is scoped exactly to the
        // async writeGraphTransactional phase this AC targets.
        clearInvocations(geographyReader);

        pollUntil(() -> assertThat(revisionRepository.findById(prep.revisionId()).orElseThrow().getLifecycleStatus())
                .isEqualTo(LifecycleStatus.PREPARED));

        verify(geographyReader, times(1)).loadGeography(cityId);
    }

    @Test
    @DisplayName("[#2157 AC3, structural] NavigationTreeGenerationService holds NO CanonicalGeographyReader "
            + "field and accepts NO CanonicalGeographyReader constructor parameter — reintroducing either "
            + "would restore the double-read snapshot-divergence defect even if no test happened to catch "
            + "the extra invocation count")
    void navigationTreeGenerationService_hasNoCanonicalGeographyReaderDependency() {
        boolean hasField = Arrays.stream(NavigationTreeGenerationService.class.getDeclaredFields())
                .map(Field::getType)
                .anyMatch(t -> t.equals(CanonicalGeographyReader.class));
        assertThat(hasField)
                .as("NavigationTreeGenerationService must not hold a CanonicalGeographyReader field (#2157)")
                .isFalse();

        boolean hasConstructorParam = Arrays.stream(NavigationTreeGenerationService.class.getDeclaredConstructors())
                .flatMap(c -> Arrays.stream(((Constructor<?>) c).getParameterTypes()))
                .anyMatch(t -> t.equals(CanonicalGeographyReader.class));
        assertThat(hasConstructorParam)
                .as("NavigationTreeGenerationService's constructor must not accept a CanonicalGeographyReader (#2157)")
                .isFalse();
    }

    @Test
    @DisplayName("[#2157 AC3, control] cleanup safety net — this class's own fixture never left "
            + "cross-test state that would make the exactly-once count above a false positive from a "
            + "PRIOR test's leaked invocation")
    void spyInvocationCountResetsBetweenTests() {
        // No loadGeography call has happened yet in THIS test method at this point — Spring resets
        // @MockitoSpyBean interaction history between test methods by default.
        verify(geographyReader, never()).loadGeography(anyInt());
    }
}

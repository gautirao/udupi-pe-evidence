package com.example.realestate.discover.citylaunch;

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
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Testcontainers integration test (real Postgres, real async resolution pipeline) for #2676
 * Slice A: {@link CityBootstrapService}.
 *
 * <p>The {@link CityGeocodingProvider} bean is overridden with an in-memory fake (never a
 * mock of the SERVICE under test) so these tests are deterministic and hit no real network —
 * the fake's own call count is asserted where the point of a scenario IS "no external call
 * happened" (the existing-city dedup path).
 *
 * <p>Covers the issue's own "explicit regression test" requirement at Slice A's scope: a
 * brand-new fixture city with NO pre-existing {@code cities} row, driven from {@link
 * CityBootstrapService#startBootstrap} (never pre-seeded), proving idempotent creation,
 * disambiguation, and duplicate prevention — not the full bootstrap-to-Preview E2E, which is
 * Slice D's job.
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
class CityBootstrapServiceIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine").asCompatibleSubstituteFor("postgres"));

    @TestConfiguration
    static class TestConfig {
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

        @Bean
        @Primary
        public CityGeocodingProvider fakeGeocodingProvider() {
            return new FakeGeocodingProvider();
        }
    }

    /** Deterministic, network-free stand-in for {@link NominatimGeocodingProvider}. */
    static final class FakeGeocodingProvider implements CityGeocodingProvider {
        final Map<String, List<GeocodeCandidate>> responses = new ConcurrentHashMap<>();
        final AtomicInteger callCount = new AtomicInteger();

        @Override
        public List<GeocodeCandidate> search(String query) {
            callCount.incrementAndGet();
            return responses.getOrDefault(query, List.of());
        }
    }

    @Autowired private CityBootstrapService bootstrapService;
    @Autowired private FakeGeocodingProvider fakeProvider;
    @Autowired private JdbcTemplate jdbc;

    private static final UUID ADMIN_ID = UUID.randomUUID();
    private final List<String> testCitySlugs = new ArrayList<>();

    @BeforeEach
    void setUp() {
        testCitySlugs.clear();
        fakeProvider.responses.clear();
        fakeProvider.callCount.set(0);
    }

    @AfterEach
    void cleanup() {
        for (String slug : testCitySlugs) {
            Integer cityId = jdbc.queryForObject(
                    "SELECT id FROM public.cities WHERE slug = ?", Integer.class, slug);
            jdbc.update("DELETE FROM public.city_bootstrap_job WHERE normalized_name = ?", slug);
            if (cityId != null) {
                jdbc.update("DELETE FROM public.cities WHERE id = ?", cityId);
            }
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

    private GeocodeCandidate candidate(String displayName, double lat, double lon) {
        return new GeocodeCandidate(displayName, "in", "city", lat, lon, lat - 0.1, lon - 0.1, lat + 0.1, lon + 0.1);
    }

    @Test
    @DisplayName("brand-new fixture city, single unambiguous candidate -> idempotent CITY_CREATED, no pre-existing rows")
    void newFixtureCity_singleCandidate_createsCityIdempotently() {
        String name = "Mysore-IT-" + System.nanoTime();
        String slug = CityNameResolutionService.normalizeToSlug(name);
        testCitySlugs.add(slug);
        fakeProvider.responses.put(name, List.of(candidate("Mysuru, Karnataka, India", 12.29, 76.63)));

        // Precondition: genuinely no pre-existing cities/job row for this fixture name.
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM public.cities WHERE slug = ?", Integer.class, slug)).isZero();

        CityBootstrapJobDto started = bootstrapService.startBootstrap(name, ADMIN_ID);
        assertThat(started.status()).isEqualTo(BootstrapJobStatus.RESOLVING);

        pollUntil(() -> assertThat(bootstrapService.getJob(started.jobId()).status())
                .isEqualTo(BootstrapJobStatus.CITY_CREATED));

        CityBootstrapJobDto done = bootstrapService.getJob(started.jobId());
        assertThat(done.resolvedCityId()).isNotNull();

        Map<String, Object> row = jdbc.queryForMap(
                "SELECT slug, name, geo_center_lat, geo_center_lon, is_active FROM public.cities WHERE id = ?",
                done.resolvedCityId());
        assertThat(row.get("slug")).isEqualTo(slug);
        assertThat(row.get("geo_center_lat")).isEqualTo(12.29);
        assertThat(row.get("geo_center_lon")).isEqualTo(76.63);
        assertThat(row.get("is_active")).isEqualTo(true);
    }

    @Test
    @DisplayName("existing city name resolves without any geocoding call and without a duplicate row (idempotent)")
    void existingCity_matchesWithoutProviderCall_idempotent() {
        String slug = "existing-it-" + System.nanoTime();
        testCitySlugs.add(slug);
        Integer existingCityId = jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.7, true) RETURNING id",
                Integer.class, slug, slug);

        CityBootstrapJobDto started = bootstrapService.startBootstrap(slug, ADMIN_ID);

        pollUntil(() -> assertThat(bootstrapService.getJob(started.jobId()).status())
                .isEqualTo(BootstrapJobStatus.CITY_CREATED));

        CityBootstrapJobDto done = bootstrapService.getJob(started.jobId());
        assertThat(done.resolvedCityId()).isEqualTo(existingCityId);
        assertThat(fakeProvider.callCount.get())
                .as("existing-city match must never call the geocoding provider")
                .isZero();
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM public.cities WHERE slug = ?", Integer.class, slug)).isEqualTo(1);
    }

    @Test
    @DisplayName("multiple candidates require explicit disambiguation; confirm creates the CHOSEN candidate's city")
    void multipleCandidates_requiresDisambiguation_confirmCreatesChosenCity() {
        String name = "Springfield-IT-" + System.nanoTime();
        String slug = CityNameResolutionService.normalizeToSlug(name);
        testCitySlugs.add(slug);
        fakeProvider.responses.put(name, List.of(
                candidate("Springfield, Illinois, USA", 39.78, -89.65),
                candidate("Springfield, Massachusetts, USA", 42.10, -72.59)));

        CityBootstrapJobDto started = bootstrapService.startBootstrap(name, ADMIN_ID);
        pollUntil(() -> assertThat(bootstrapService.getJob(started.jobId()).status())
                .isEqualTo(BootstrapJobStatus.DISAMBIGUATION_REQUIRED));

        CityBootstrapJobDto awaiting = bootstrapService.getJob(started.jobId());
        assertThat(awaiting.candidates()).hasSize(2);
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM public.cities WHERE slug = ?", Integer.class, slug)).isZero();

        CityBootstrapJobDto confirmed = bootstrapService.confirmDisambiguation(started.jobId(), 1, ADMIN_ID);
        assertThat(confirmed.status()).isEqualTo(BootstrapJobStatus.CITY_CREATED);

        Map<String, Object> row = jdbc.queryForMap(
                "SELECT geo_center_lat, geo_center_lon FROM public.cities WHERE id = ?", confirmed.resolvedCityId());
        assertThat(row.get("geo_center_lat")).isEqualTo(42.10);
    }

    @Test
    @DisplayName("submitting an already-bootstrapped name again resolves to the SAME city, never a duplicate")
    void duplicateSubmission_afterCityCreated_resolvesToExistingCityNotDuplicate() {
        String name = "Duplicate-IT-" + System.nanoTime();
        String slug = CityNameResolutionService.normalizeToSlug(name);
        testCitySlugs.add(slug);
        fakeProvider.responses.put(name, List.of(candidate("Duplicate City, Test, India", 10.0, 20.0)));

        CityBootstrapJobDto first = bootstrapService.startBootstrap(name, ADMIN_ID);
        pollUntil(() -> assertThat(bootstrapService.getJob(first.jobId()).status())
                .isEqualTo(BootstrapJobStatus.CITY_CREATED));
        Integer firstCityId = bootstrapService.getJob(first.jobId()).resolvedCityId();

        CityBootstrapJobDto second = bootstrapService.startBootstrap(name, ADMIN_ID);
        pollUntil(() -> assertThat(bootstrapService.getJob(second.jobId()).status())
                .isEqualTo(BootstrapJobStatus.CITY_CREATED));
        Integer secondCityId = bootstrapService.getJob(second.jobId()).resolvedCityId();

        assertThat(secondCityId).isEqualTo(firstCityId);
        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM public.cities WHERE slug = ?", Integer.class, slug)).isEqualTo(1);
    }

    @Test
    @DisplayName("two concurrent submissions for the SAME name -> exactly one admits, the other gets a 409 conflict")
    void concurrentSubmissionsSameName_oneConflicts() throws Exception {
        String name = "Concurrent-IT-" + System.nanoTime();
        String slug = CityNameResolutionService.normalizeToSlug(name);
        testCitySlugs.add(slug);
        fakeProvider.responses.put(name, List.of(candidate("Concurrent City, Test, India", 11.0, 21.0)));

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch go = new CountDownLatch(1);
        AtomicInteger successes = new AtomicInteger();
        AtomicInteger conflicts = new AtomicInteger();

        Runnable attempt = () -> {
            ready.countDown();
            try {
                go.await(5, TimeUnit.SECONDS);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            try {
                bootstrapService.startBootstrap(name, ADMIN_ID);
                successes.incrementAndGet();
            } catch (CityBootstrapConflictException e) {
                conflicts.incrementAndGet();
            }
        };

        var f1 = pool.submit(attempt);
        var f2 = pool.submit(attempt);
        ready.await(5, TimeUnit.SECONDS);
        go.countDown();
        f1.get(10, TimeUnit.SECONDS);
        f2.get(10, TimeUnit.SECONDS);
        pool.shutdown();

        assertThat(successes.get()).isEqualTo(1);
        assertThat(conflicts.get()).isEqualTo(1);
    }
}

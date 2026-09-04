package com.example.realestate.discover;

import org.junit.jupiter.api.AfterEach;
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
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Testcontainers integration test (real Postgres) for {@link NearbyAreaCandidatesService} (#2017):
 * the bounded, filter-aware "nearby area" suggestion query backing the AREA_SET chip strip.
 *
 * <p>Boilerplate (container, JWT test config, trigger-disable dance, seeding/cleanup shape) mirrors
 * {@code com.example.realestate.discover.navigation.NavigationCountsFilterAndSchoolCountIT}. Unlike
 * that suite's {@code seedArea} (which hardcodes one lat/lon for every area), this test needs
 * DISTINCT per-area coordinates to prove centroid-distance ranking, so it seeds coordinates directly.
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
        "AI_API_KEY=test-dummy-not-used-in-nearby-area-candidates-it",
        "spring.task.scheduling.enabled=false"
})
class NearbyAreaCandidatesServiceIT {

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

    @Autowired private JdbcTemplate jdbc;
    @Autowired private NearbyAreaCandidatesService service;

    private static final String COVERAGE_TRIGGER_INSERT = "trg_sync_school_discover_area_coverage_insert";
    private static final String COVERAGE_TRIGGER_UPDATE = "trg_sync_school_discover_area_coverage_update";
    private static final String AREA_KEY_TRIGGER = "trg_school_area_key";

    private final List<String> testCitySlugs = new ArrayList<>();

    @org.junit.jupiter.api.BeforeEach
    void disableSchoolTriggersForIsolatedCoverageControl() {
        jdbc.execute("ALTER TABLE public.schools DISABLE TRIGGER " + COVERAGE_TRIGGER_INSERT);
        jdbc.execute("ALTER TABLE public.schools DISABLE TRIGGER " + COVERAGE_TRIGGER_UPDATE);
        jdbc.execute("ALTER TABLE public.schools DISABLE TRIGGER " + AREA_KEY_TRIGGER);
    }

    @AfterEach
    void reenableSchoolTriggers() {
        jdbc.execute("ALTER TABLE public.schools ENABLE TRIGGER " + COVERAGE_TRIGGER_INSERT);
        jdbc.execute("ALTER TABLE public.schools ENABLE TRIGGER " + COVERAGE_TRIGGER_UPDATE);
        jdbc.execute("ALTER TABLE public.schools ENABLE TRIGGER " + AREA_KEY_TRIGGER);
    }

    @AfterEach
    void cleanup() {
        for (String slug : testCitySlugs) {
            Integer cityId = jdbc.queryForObject("SELECT id FROM public.cities WHERE slug = ?", Integer.class, slug);
            if (cityId == null) {
                continue;
            }
            jdbc.update("DELETE FROM public.school_discover_area_coverage WHERE curated_area_key LIKE ?",
                    "IN|KA|" + slug + "|%");
            jdbc.update("DELETE FROM public.schools WHERE area_key LIKE ?", "IN|KA|" + slug + "|%");
            jdbc.update("DELETE FROM public.property_listings WHERE area_key LIKE ?", "IN|KA|" + slug + "|%");
            jdbc.update("DELETE FROM public.areas WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.cities WHERE id = ?", cityId);
        }
        testCitySlugs.clear();
    }

    // ── Fixtures ─────────────────────────────────────────────────────────────────────────────

    private int seedCity(String slug) {
        testCitySlugs.add(slug);
        return jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.7, true) RETURNING id",
                Integer.class, slug, slug + "-test-city");
    }

    /** Unlike {@code NavigationCountsFilterAndSchoolCountIT#seedArea}, accepts DISTINCT per-area
     *  coordinates -- required to make centroid-distance ranking deterministic and provable. */
    private void seedAreaAt(int cityId, String areaKey, double lat, double lon) {
        jdbc.update("INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon) "
                + "VALUES (?, ?, ?, ?, ?)", areaKey, cityId, areaKey, lat, lon);
    }

    private void insertListing(String areaKey, String propertyType, String purpose) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbc.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, listing_purpose, latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, ?, ?, 13.35, 74.79, ?, ?)",
                UUID.randomUUID(), areaKey, propertyType, purpose, now, now);
    }

    private UUID insertSchoolNoAreaKey(String name) {
        jdbc.update(
                "INSERT INTO public.schools (name, board_type, latitude, longitude, district, source) "
                        + "VALUES (?, 'CBSE', 13.35, 74.79, 'Test fixture district', 'TEST_FIXTURE')",
                name);
        return jdbc.queryForObject("SELECT id FROM public.schools WHERE name = ?", UUID.class, name);
    }

    private void insertCoverage(UUID schoolId, String areaKey, String relationshipType) {
        jdbc.update(
                "INSERT INTO public.school_discover_area_coverage "
                        + "(school_id, curated_area_key, relationship_type, source) "
                        + "VALUES (?, ?, ?, 'manual_review')",
                schoolId, areaKey, relationshipType);
    }

    private static DiscoverListingPredicateBuilder.Filters filtersFor(String city) {
        return new DiscoverListingPredicateBuilder.Filters(
                city, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null);
    }

    private static DiscoverListingPredicateBuilder.Filters filtersFor(String city, List<String> propertyTypes) {
        return new DiscoverListingPredicateBuilder.Filters(
                city, propertyTypes, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null);
    }

    // =========================================================================================

    @Test
    @DisplayName("selected areas are excluded from candidates")
    void selectedAreas_excludedFromCandidates() {
        String slug = "nac1";
        int cityId = seedCity(slug);
        String selectedKey = "IN|KA|" + slug + "|selected-area";
        String otherKey = "IN|KA|" + slug + "|other-area";
        seedAreaAt(cityId, selectedKey, 13.05, 74.70);
        seedAreaAt(cityId, otherKey, 13.06, 74.71);
        insertListing(selectedKey, "house", "sale");
        insertListing(otherKey, "house", "sale");

        NearbyAreaCandidatesResponse response =
                service.findCandidates(slug, List.of(selectedKey), null, filtersFor(slug));

        assertThat(response.selectedAreaKeys()).containsExactly(selectedKey);
        assertThat(response.candidates())
                .as("the selected area must never appear as a candidate for itself")
                .extracting(NearbyAreaCandidate::areaKey)
                .doesNotContain(selectedKey)
                .containsExactly(otherKey);
    }

    @Test
    @DisplayName("with a selection, candidates rank by squared distance to the selected centroid")
    void withSelection_ranksByDistanceToCentroid() {
        String slug = "nac2";
        int cityId = seedCity(slug);
        String selectedKey = "IN|KA|" + slug + "|selected-area";
        String nearKey = "IN|KA|" + slug + "|near-area";
        String farKey = "IN|KA|" + slug + "|far-area";
        seedAreaAt(cityId, selectedKey, 13.00, 74.70);
        seedAreaAt(cityId, nearKey, 13.01, 74.70);   // ~0.01 deg away
        seedAreaAt(cityId, farKey, 14.00, 75.70);    // ~1 deg away
        insertListing(selectedKey, "house", "sale");
        insertListing(nearKey, "house", "sale");
        insertListing(farKey, "house", "sale");

        NearbyAreaCandidatesResponse response =
                service.findCandidates(slug, List.of(selectedKey), null, filtersFor(slug));

        assertThat(response.candidates())
                .extracting(NearbyAreaCandidate::areaKey)
                .as("the closer area must rank first")
                .containsExactly(nearKey, farKey);
    }

    @Test
    @DisplayName("with no selection, ranking falls back to eligibleListingCount DESC, name ASC")
    void noSelection_fallsBackToCountThenName() {
        String slug = "nac3";
        int cityId = seedCity(slug);
        String lowKey = "IN|KA|" + slug + "|low-count-area";
        String highKey = "IN|KA|" + slug + "|high-count-area";
        seedAreaAt(cityId, lowKey, 13.05, 74.70);
        seedAreaAt(cityId, highKey, 13.06, 74.71);
        insertListing(lowKey, "house", "sale");
        insertListing(highKey, "house", "sale");
        insertListing(highKey, "apartment", "sale");

        NearbyAreaCandidatesResponse response =
                service.findCandidates(slug, List.of(), null, filtersFor(slug));

        assertThat(response.candidates())
                .extracting(NearbyAreaCandidate::areaKey)
                .as("higher eligible-listing count must rank first when there is no selection")
                .containsExactly(highKey, lowKey);
    }

    @Test
    @DisplayName("an area with zero eligible listings AND zero schools is dropped from candidates")
    void zeroListingsAndZeroSchools_dropped() {
        String slug = "nac4";
        int cityId = seedCity(slug);
        String emptyKey = "IN|KA|" + slug + "|empty-area";
        String nonEmptyKey = "IN|KA|" + slug + "|non-empty-area";
        seedAreaAt(cityId, emptyKey, 13.05, 74.70);
        seedAreaAt(cityId, nonEmptyKey, 13.06, 74.71);
        insertListing(nonEmptyKey, "house", "sale");

        NearbyAreaCandidatesResponse response =
                service.findCandidates(slug, List.of(), null, filtersFor(slug));

        assertThat(response.candidates())
                .extracting(NearbyAreaCandidate::areaKey)
                .as("an area with 0 eligible listings and 0 schools must not appear")
                .containsExactly(nonEmptyKey);
    }

    @Test
    @DisplayName("an area with zero eligible listings but a qualifying school is kept")
    void zeroListingsButHasSchool_kept() {
        String slug = "nac5";
        int cityId = seedCity(slug);
        String schoolOnlyKey = "IN|KA|" + slug + "|school-only-area";
        seedAreaAt(cityId, schoolOnlyKey, 13.05, 74.70);
        UUID school = insertSchoolNoAreaKey("Nearby Candidate School");
        insertCoverage(school, schoolOnlyKey, "contained");

        NearbyAreaCandidatesResponse response =
                service.findCandidates(slug, List.of(), null, filtersFor(slug));

        assertThat(response.candidates())
                .extracting(NearbyAreaCandidate::areaKey, NearbyAreaCandidate::schoolCount)
                .as("zero listings but a real school must still surface as a candidate")
                .containsExactly(org.assertj.core.groups.Tuple.tuple(schoolOnlyKey, 1L));
    }

    @Test
    @DisplayName("eligibleListingCount reflects the active filter predicate, not the raw listing total")
    void eligibleListingCount_reflectsActiveFilters() {
        String slug = "nac6";
        int cityId = seedCity(slug);
        String areaKey = "IN|KA|" + slug + "|mixed-type-area";
        seedAreaAt(cityId, areaKey, 13.05, 74.70);
        insertListing(areaKey, "house", "sale");
        insertListing(areaKey, "apartment", "sale");

        NearbyAreaCandidatesResponse unfiltered =
                service.findCandidates(slug, List.of(), null, filtersFor(slug));
        NearbyAreaCandidatesResponse houseOnly =
                service.findCandidates(slug, List.of(), null, filtersFor(slug, List.of("house")));

        assertThat(unfiltered.candidates())
                .filteredOn(c -> c.areaKey().equals(areaKey))
                .extracting(NearbyAreaCandidate::eligibleListingCount)
                .as("unfiltered count includes both listings")
                .containsExactly(2L);
        assertThat(houseOnly.candidates())
                .filteredOn(c -> c.areaKey().equals(areaKey))
                .extracting(NearbyAreaCandidate::eligibleListingCount)
                .as("propertyTypes=house must narrow the count to 1")
                .containsExactly(1L);
    }

    @Test
    @DisplayName("an unknown/nonexistent city returns 200 with an empty candidate list, never an error")
    void unknownCity_returnsEmptyCandidates() {
        NearbyAreaCandidatesResponse response =
                service.findCandidates("no-such-city-xyz", List.of(), null, filtersFor("no-such-city-xyz"));

        assertThat(response.city()).isEqualTo("no-such-city-xyz");
        assertThat(response.candidates()).isEmpty();
    }
}

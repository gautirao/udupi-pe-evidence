package com.example.realestate.discover;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D3-T3 (#2151 PR B, AC15(b) — determinism half): Testcontainers-backed proof that {@link
 * AgriDestinationPortPostgresAdapter} is deterministic and free of request-to-request side effects.
 *
 * <p><b>#2151 PR B correction pass (B4) — relocation, not a new rewrite.</b> This class previously
 * also carried the production-bean-graph guard ("exactly one {@link AgriDestinationPort}
 * implementation, none {@code @Primary}"). That assertion needed no database and no Spring context
 * at all — it is a pure classpath scan — yet it lived inside this {@code @DataJpaTest}+{@code
 * @Testcontainers(disabledWithoutDocker = true)} class, so on any runner without Docker the whole
 * class, guard included, was silently SKIPPED rather than run: AC15(b)'s headline structural guard
 * reported nothing on such a runner. That guard has been MOVED to {@link
 * AgriDestinationPortStructuralAntiDriftTest} (D3-T1's plain-JUnit home, alongside its own static
 * structural walk), where it now runs unconditionally, with or without Docker. See that class'
 * javadoc and {@code productionBeanGraph_exactlyOneAgriDestinationPortImplementation_noPrimary()}'s
 * own javadoc there for the re-run deliberate-failure evidence in its new location.
 *
 * <p><b>What remains here, and why it is honestly scoped.</b> {@link
 * #findDestinationsAndFindParcels_areDeterministic_acrossRepeatedCallsOnTheSameSeededData()} is the
 * ONE assertion in this class that genuinely needs the real Testcontainers Postgres/PostGIS
 * database — it proves {@link AgriDestinationPortPostgresAdapter} is deterministic: calling {@code
 * findDestinations}/{@code findParcels} twice against the same seeded rows returns byte-identical
 * results both times. It claims nothing about {@code discover.opensearch.enabled} or any flag flip
 * — no surviving test in this class touches that property, so despite the historical
 * {@code FlagFlipSafetyIT} name, "flag flip safety" is no longer this class' claim. Renaming the
 * class/file was left undone in this pass: it would require a filesystem rename that ripples beyond
 * this PR's two allowed files (this file and {@code AgriDestinationPortStructuralAntiDriftTest.java}),
 * so it is called out here rather than done silently.
 */
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.placeholders.concurrently_keyword="
})
class AgriDestinationPortFlagFlipSafetyIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY = "flagflip2151";
    private static final String AREA_KEY = "IN|KA|FlagFlip2151|North";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private int cityId;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM property_listings");
        jdbcTemplate.update("DELETE FROM agri_destination_classification");
        jdbcTemplate.update("DELETE FROM areas WHERE city_id IN (SELECT id FROM cities WHERE slug = ?)", CITY);
        jdbcTemplate.update("DELETE FROM cities WHERE slug = ?", CITY);

        cityId = jdbcTemplate.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.0, true) RETURNING id",
                Integer.class, CITY, CITY);
        jdbcTemplate.update(
                "INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon, lifecycle_status) "
                        + "VALUES (?, ?, ?, 13.02, 74.0, 'ACTIVE')",
                AREA_KEY, cityId, AREA_KEY);
        jdbcTemplate.update(
                "INSERT INTO public.agri_destination_classification "
                        + "(city_id, area_key, origin_lat, origin_lon, distance_km, bearing_deg, "
                        + " direction_key, distance_band_key, generator_version, generated_at) "
                        + "VALUES (?, ?, 13.0, 74.0, 5.0, 0.0, 'N', '0_10', 'test-generator-v1', now())",
                cityId, AREA_KEY);

        UUID listingId = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, land_area, land_area_unit, listing_purpose, price_paise, "
                        + " latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, 'agricultural_land', 3, 'acre', "
                        + " 'sale', 5000000, 13.0, 74.0, ?, ?)",
                listingId, AREA_KEY, now, now);
    }

    @Test
    @DisplayName("findDestinations/findParcels are deterministic: two calls against the SAME real "
            + "Testcontainers DB with the SAME seeded rows return byte-identical results")
    void findDestinationsAndFindParcels_areDeterministic_acrossRepeatedCallsOnTheSameSeededData() {
        CityActivationGuard guard = new CityActivationGuard(jdbcTemplate);
        AgriDestinationPort port = new AgriDestinationPortPostgresAdapter(jdbcTemplate, guard);

        AgriDestinationPort.DestinationScopeQuery destinationQuery = new AgriDestinationPort.DestinationScopeQuery(
                CITY, null, null, new AgriDestinationPort.AgriDestinationFilters(null), true);
        AgriDestinationPort.ParcelQuery parcelQuery = new AgriDestinationPort.ParcelQuery(
                CITY, List.of(AREA_KEY), new AgriDestinationPort.AgriDestinationFilters(null),
                new AgriDestinationPort.PageSpec(0, 10), null);

        AgriDestinationPort.DestinationScope destinationsRun1 = port.findDestinations(destinationQuery);
        AgriDestinationPort.DestinationScope destinationsRun2 = port.findDestinations(destinationQuery);
        assertThat(destinationsRun1.destinations()).isNotEmpty();
        assertThat(destinationsRun2)
                .as("repeated calls with identical inputs against the same unchanged data must be "
                        + "byte-identical — the adapter must carry no hidden mutable state")
                .isEqualTo(destinationsRun1);

        AgriDestinationPort.ParcelPage parcelsRun1 = port.findParcels(parcelQuery);
        AgriDestinationPort.ParcelPage parcelsRun2 = port.findParcels(parcelQuery);
        assertThat(parcelsRun1.content()).isNotEmpty();
        assertThat(parcelsRun2)
                .as("repeated parcel-page calls with identical inputs must also be byte-identical")
                .isEqualTo(parcelsRun1);
    }
}

package com.example.realestate.discover;

import com.example.realestate.ai.ClassificationResult;
import com.example.realestate.ai.PropertyType;
import com.example.realestate.geo.GeocodingPort;
import com.example.realestate.geo.GeocodingService;
import com.example.realestate.ingestion.RawPost;
import com.example.realestate.ingestion.RawPostRepository;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingDeduplicationService;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.ingestion.ListingIngestionService;
import com.example.realestate.quality.QualityRecomputeService;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Testcontainers integration test proving {@code ListingIngestionService.createFrom}'s #1887 PR3
 * area-resolution wiring end-to-end against a real Postgres instance: RESOLVED overwrites
 * {@code area_key} and stamps status/method; UNRESOLVED keeps the geocoded key and flags the
 * listing; region tables are provably UNTOUCHED at ingest time (no synchronous region regen —
 * that remains the poller's job, see {@link AreaRegionReclassOutboxPollerIT}).
 *
 * <p><b>Fixture note:</b> the RESOLVED fixture area below is seeded in
 * {@code ListingIngestionService.computeAreaKey}'s own vocabulary (lowercase, full country/state
 * names, e.g. {@code "india|karnataka|Udupi|manipal"}) rather than the
 * {@code "IN|KA|District|Area"} abbreviated convention used by {@code AreaOnboardingService}'s
 * canonical seed data. This intentionally demonstrates that the wiring is format-agnostic (any
 * string in {@code areas.area_key} can be matched), but ALSO surfaces a pre-existing vocabulary
 * mismatch: real ingested listings computed via {@code computeAreaKey} will rarely, if ever,
 * exact-match the {@code "IN|KA|..."}-format canonical seed data from V71 without a locality/area
 * ALIAS row bridging the two. ALIAS and PROVIDER_ID resolution are unaffected by this gap.
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
class ListingIngestionAreaResolutionIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private ListingRepository listingRepository;

    @Autowired
    private RawPostRepository rawPostRepository;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private GeocodingPort geocodingPort;
    private ListingIngestionService listingIngestionService;
    private SimpleMeterRegistry meterRegistry;
    private int udupiCityId;

    @BeforeEach
    void setUp() {
        geocodingPort = mock(GeocodingPort.class);
        ApplicationEventPublisher eventPublisher = mock(ApplicationEventPublisher.class);
        QualityRecomputeService qualityRecomputeService = mock(QualityRecomputeService.class);
        AreaResolutionService areaResolutionService = new AreaResolutionService(jdbcTemplate);
        meterRegistry = new SimpleMeterRegistry();

        listingIngestionService = new ListingIngestionService(
                listingRepository, rawPostRepository, geocodingPort, new ObjectMapper(),
                eventPublisher, new ListingDeduplicationService(listingRepository),
                qualityRecomputeService, areaResolutionService, jdbcTemplate, meterRegistry);

        udupiCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'udupi'", Integer.class);
    }

    private double areaUnresolvedCounterCount() {
        io.micrometer.core.instrument.Counter counter =
                meterRegistry.find("listing.ingestion.area_unresolved").counter();
        return counter == null ? 0.0 : counter.count();
    }

    private RawPost persistRawPost(String content) {
        RawPost post = new RawPost();
        post.setContent(content);
        post.setCreatedAt(java.time.OffsetDateTime.now());
        return rawPostRepository.saveAndFlush(post);
    }

    private ClassificationResult makeResult(String locality) {
        return new ClassificationResult(
                true, PropertyType.HOUSE, java.math.BigDecimal.valueOf(5_000_000),
                locality, 3, null, null,
                null, null, null, null, "Test listing " + locality, 80);
    }

    private long regionTableRowCounts() {
        Long regions = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM city_regions", Long.class);
        Long memberships = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM city_region_memberships", Long.class);
        return regions + memberships;
    }

    @Test
    @DisplayName("RESOLVED: geocoded area matches a canonical area — area_key is overwritten with "
            + "the canonical key, areaLabel kept, status/method stamped")
    void createFrom_resolvedCanonicalKey_overwritesAreaKeyAndStampsResolution() {
        String canonicalKey = "india|karnataka|Udupi|manipal-it-fixture";
        jdbcTemplate.update("""
                INSERT INTO areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon)
                VALUES (?, ?, 'Manipal IT Fixture', 'Udupi', 13.35, 74.79)
                """, canonicalKey, udupiCityId);

        long regionCountBefore = regionTableRowCounts();

        RawPost post = persistRawPost("House in Manipal IT Fixture");
        when(geocodingPort.geocode("Manipal-IT-Fixture")).thenReturn(new GeocodingService.GeoResult(
                13.35, 74.79, "Manipal, Udupi, Karnataka, India",
                "India", "Karnataka", "Udupi", "Manipal-IT-Fixture", null));

        Listing listing = listingIngestionService.createFrom(post, makeResult("Manipal-IT-Fixture"), "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.getAreaKey()).isEqualTo(canonicalKey);
        assertThat(listing.getAreaLabel()).isEqualTo("Manipal-IT-Fixture, Udupi");
        assertThat(listing.getAreaResolutionStatus()).isEqualTo("RESOLVED");
        assertThat(listing.getAreaResolutionMethod()).isEqualTo("CANONICAL_KEY");

        // Re-read from the DB to prove the resolution was actually persisted, not just in-memory.
        Listing reloaded = listingRepository.findById(listing.getId()).orElseThrow();
        assertThat(reloaded.getAreaKey()).isEqualTo(canonicalKey);
        assertThat(reloaded.getAreaResolutionStatus()).isEqualTo("RESOLVED");
        assertThat(reloaded.getAreaResolutionMethod()).isEqualTo("CANONICAL_KEY");

        assertThat(regionTableRowCounts())
                .as("no synchronous region regen at ingest time")
                .isEqualTo(regionCountBefore);
    }

    @Test
    @DisplayName("UNRESOLVED: geocoded area matches nothing canonical — area_key kept as geocoded, "
            + "flagged UNRESOLVED with no method, zero areas/area_alias row deltas")
    void createFrom_unresolved_keepsGeocodedAreaKeyAndFlagsUnresolved() {
        long areasBefore = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM areas", Long.class);
        long aliasBefore = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM area_alias", Long.class);
        long regionCountBefore = regionTableRowCounts();

        RawPost post = persistRawPost("House in Totally Unknown Locality");
        when(geocodingPort.geocode("TotallyUnknownLocalityXyz")).thenReturn(new GeocodingService.GeoResult(
                13.35, 74.79, "Totally Unknown, Udupi, Karnataka, India",
                "India", "Karnataka", "Udupi", "TotallyUnknownLocalityXyz", null));

        Listing listing = listingIngestionService.createFrom(
                post, makeResult("TotallyUnknownLocalityXyz"), "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.getAreaKey()).isEqualTo("india|karnataka|udupi|totallyunknownlocalityxyz");
        assertThat(listing.getAreaResolutionStatus()).isEqualTo("UNRESOLVED");
        assertThat(listing.getAreaResolutionMethod()).isNull();

        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM areas", Long.class)).isEqualTo(areasBefore);
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM area_alias", Long.class)).isEqualTo(aliasBefore);
        assertThat(regionTableRowCounts())
                .as("no synchronous region regen at ingest time")
                .isEqualTo(regionCountBefore);
    }

    @Test
    @DisplayName("B3: geocoded city has NO matching cities row — listing is stamped UNRESOLVED "
            + "(never left at the entity-default RESOLVED) and the area_unresolved counter increments")
    void createFrom_noCityMatch_stampsUnresolvedAndIncrementsCounter() {
        double counterBefore = areaUnresolvedCounterCount();

        RawPost post = persistRawPost("House in a place with no matching city row");
        when(geocodingPort.geocode("SomeLocalityInAnUnknownCity")).thenReturn(new GeocodingService.GeoResult(
                13.35, 74.79, "Some Locality, Nowhereland, Nowhereland, Nowhereland",
                "Nowhereland", "Nowhereland", "Nowhereland City That Does Not Exist",
                "SomeLocalityInAnUnknownCity", null));

        Listing listing = listingIngestionService.createFrom(
                post, makeResult("SomeLocalityInAnUnknownCity"), "test-model");

        assertThat(listing).isNotNull();
        assertThat(listing.getAreaResolutionStatus()).isEqualTo("UNRESOLVED");
        assertThat(listing.getAreaResolutionMethod()).isNull();
        assertThat(areaUnresolvedCounterCount()).isEqualTo(counterBefore + 1.0);

        // Re-read from the DB to prove the UNRESOLVED stamp was actually persisted.
        Listing reloaded = listingRepository.findById(listing.getId()).orElseThrow();
        assertThat(reloaded.getAreaResolutionStatus()).isEqualTo("UNRESOLVED");
        assertThat(reloaded.getAreaResolutionMethod()).isNull();
    }
}

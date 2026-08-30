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

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Testcontainers integration test proving {@link AreaResolutionService}'s READ-ONLY resolution
 * order (#1887 PR3, approved OQ1 provider-first contract): PROVIDER_ID, then CANONICAL_KEY, then
 * ALIAS, defaulting to UNRESOLVED. Every case additionally asserts zero row-count deltas on
 * {@code areas} and {@code area_alias} — this service is a LOOKUP, never an onboarding write path.
 *
 * <p>Each {@code @DataJpaTest} test method runs in its own rolled-back transaction, so per-test
 * fixture rows (batches/candidates/aliases/areas) never leak across tests or mutate the V71 seed
 * data used as shared fixtures ({@code IN|KA|Udupi|Manipal} etc., mirroring
 * {@code CityRegionOnboardingRegenerationIT}'s fixture style).
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
class AreaResolutionServiceIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String MANIPAL = "IN|KA|Udupi|Manipal";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private AreaResolutionService resolutionService;
    private int udupiCityId;
    private int bangaloreCityId;

    @BeforeEach
    void setUp() {
        resolutionService = new AreaResolutionService(jdbcTemplate);
        udupiCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'udupi'", Integer.class);
        bangaloreCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'bangalore'", Integer.class);
    }

    private long areasCount() {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM areas", Long.class);
    }

    private long aliasCount() {
        return jdbcTemplate.queryForObject("SELECT COUNT(*) FROM area_alias", Long.class);
    }

    /** Inserts a FINALIZED+APPLIED batch and returns its id. */
    private int insertFinalizedAppliedBatch(int cityId, String provider) {
        return jdbcTemplate.queryForObject("""
                INSERT INTO area_onboarding_batch
                    (city_id, source_label, apply_allowed, provider, review_status,
                     apply_status, applied_batch_checksum)
                VALUES (?, 'it-fixture', true, ?, 'FINALIZED', 'APPLIED', 'test-checksum')
                RETURNING id
                """, Integer.class, cityId, provider);
    }

    private void insertCandidate(
            int batchId, String matchedAreaKey, String externalSourceId, String reviewDecision) {
        jdbcTemplate.update("""
                INSERT INTO area_onboarding_candidate
                    (batch_id, input_area_key, normalised_area_key, matched_area_key,
                     outcome, geometry_trust, external_source_id, review_decision)
                VALUES (?, ?, ?, ?, 'READY_TO_UPDATE', 'BBOX', ?, ?)
                """, batchId, matchedAreaKey, matchedAreaKey, matchedAreaKey, externalSourceId, reviewDecision);
    }

    // ── Step 2: CANONICAL_KEY ───────────────────────────────────────────────────

    @Test
    @DisplayName("exact canonical-key match on an ACTIVE area resolves RESOLVED/CANONICAL_KEY")
    void exactCanonicalKeyHit_resolvesCanonicalKey() {
        long areasBefore = areasCount();
        long aliasBefore = aliasCount();

        AreaResolution resolution = resolutionService.resolve(
                udupiCityId, null, null, MANIPAL, "Manipal");

        assertThat(resolution.status()).isEqualTo(AreaResolution.Status.RESOLVED);
        assertThat(resolution.method()).isEqualTo(AreaResolution.Method.CANONICAL_KEY);
        assertThat(resolution.canonicalAreaKey()).isEqualTo(MANIPAL);
        assertThat(areasCount()).isEqualTo(areasBefore);
        assertThat(aliasCount()).isEqualTo(aliasBefore);
    }

    @Test
    @DisplayName("an INACTIVE area with a matching key is skipped (falls through, never matched)")
    void inactiveAreaMatchingKey_fallsThrough() {
        String inactiveKey = "IN|KA|Udupi|ItFixtureInactive";
        jdbcTemplate.update("""
                INSERT INTO areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon, lifecycle_status)
                VALUES (?, ?, 'It Fixture Inactive', 'Udupi', 13.35, 74.75, 'INACTIVE')
                """, inactiveKey, udupiCityId);

        AreaResolution resolution = resolutionService.resolve(
                udupiCityId, null, null, inactiveKey, "It Fixture Inactive Locality");

        assertThat(resolution.status()).isEqualTo(AreaResolution.Status.UNRESOLVED);
    }

    @Test
    @DisplayName("a malformed (non-4-segment) geocoded key never throws — falls through to ALIAS/UNRESOLVED")
    void malformedGeocodedKey_fallsThroughWithoutThrowing() {
        AreaResolution resolution = resolutionService.resolve(
                udupiCityId, null, null, "not-a-valid-key", "Some Unmatched Locality Xyz");

        assertThat(resolution.status()).isEqualTo(AreaResolution.Status.UNRESOLVED);
    }

    // ── Step 3: ALIAS ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("a city-scoped reviewed alias resolves RESOLVED/ALIAS")
    void aliasHit_resolvesAlias() {
        jdbcTemplate.update("""
                INSERT INTO area_alias (city_id, area_key, alias, alias_normalised, source)
                VALUES (?, ?, 'Manipal Town', 'manipal town', 'it-fixture')
                """, udupiCityId, MANIPAL);

        // geocodedAreaKey deliberately does NOT match any canonical area, so CANONICAL_KEY falls
        // through and ALIAS is what resolves this — proving step ordering, not just step 3 alone.
        AreaResolution resolution = resolutionService.resolve(
                udupiCityId, null, null, "in|ka|udupi|unmatched-alias-test", "  Manipal Town  ");

        assertThat(resolution.status()).isEqualTo(AreaResolution.Status.RESOLVED);
        assertThat(resolution.method()).isEqualTo(AreaResolution.Method.ALIAS);
        assertThat(resolution.canonicalAreaKey()).isEqualTo(MANIPAL);
    }

    @Test
    @DisplayName("an alias registered for a DIFFERENT city never matches — falls through to UNRESOLVED")
    void aliasWrongCity_noMatch() {
        jdbcTemplate.update("""
                INSERT INTO area_alias (city_id, area_key, alias, alias_normalised, source)
                VALUES (?, ?, 'Manipal Town', 'manipal town', 'it-fixture')
                """, udupiCityId, MANIPAL);

        AreaResolution resolution = resolutionService.resolve(
                bangaloreCityId, null, null, "in|ka|bangalore|unmatched-alias-test", "Manipal Town");

        assertThat(resolution.status()).isEqualTo(AreaResolution.Status.UNRESOLVED);
    }

    // ── Step 1: PROVIDER_ID ──────────────────────────────────────────────────────

    @Test
    @DisplayName("a single distinct provider-id match resolves RESOLVED/PROVIDER_ID, taking "
            + "priority over a CANONICAL_KEY match")
    void providerIdSingleMatch_resolvesProviderId() {
        int batchId = insertFinalizedAppliedBatch(udupiCityId, "acme-provider");
        insertCandidate(batchId, MANIPAL, "ext-123", "APPROVED");

        // geocodedAreaKey intentionally points at a DIFFERENT (also valid+ACTIVE) area to prove
        // PROVIDER_ID is checked FIRST and wins over CANONICAL_KEY (approved OQ1).
        AreaResolution resolution = resolutionService.resolve(
                udupiCityId, "acme-provider", "ext-123", "IN|KA|Udupi|Kunjibettu", "Manipal");

        assertThat(resolution.status()).isEqualTo(AreaResolution.Status.RESOLVED);
        assertThat(resolution.method()).isEqualTo(AreaResolution.Method.PROVIDER_ID);
        assertThat(resolution.canonicalAreaKey()).isEqualTo(MANIPAL);
    }

    @Test
    @DisplayName("provider-id with zero matching candidate rows falls through to CANONICAL_KEY")
    void providerIdNoMatch_fallsThroughToCanonicalKey() {
        AreaResolution resolution = resolutionService.resolve(
                udupiCityId, "unknown-provider", "ext-does-not-exist", MANIPAL, "Manipal");

        assertThat(resolution.status()).isEqualTo(AreaResolution.Status.RESOLVED);
        assertThat(resolution.method()).isEqualTo(AreaResolution.Method.CANONICAL_KEY);
    }

    @Test
    @DisplayName("2+ distinct matched_area_key values for the same provider/external-source-id "
            + "is ambiguous — UNRESOLVED immediately, never falls through to CANONICAL_KEY/ALIAS")
    void providerIdAmbiguousMatch_resolvesUnresolvedImmediately() {
        int batch1 = insertFinalizedAppliedBatch(udupiCityId, "acme-provider");
        insertCandidate(batch1, "IN|KA|Udupi|Kunjibettu", "ext-ambiguous", "APPROVED");
        int batch2 = insertFinalizedAppliedBatch(udupiCityId, "acme-provider");
        insertCandidate(batch2, "IN|KA|Udupi|Brahmavar", "ext-ambiguous", "APPROVED");

        // geocodedAreaKey points at a real, resolvable ACTIVE area — proving the ambiguity is a
        // hard stop, not merely "skip provider-id and try the next step".
        AreaResolution resolution = resolutionService.resolve(
                udupiCityId, "acme-provider", "ext-ambiguous", MANIPAL, "Manipal");

        assertThat(resolution.status()).isEqualTo(AreaResolution.Status.UNRESOLVED);
        assertThat(resolution.canonicalAreaKey()).isNull();
    }

    @Test
    @DisplayName("a provider-id candidate whose batch is still IN_REVIEW (not FINALIZED/APPLIED) "
            + "is never matched — falls through to CANONICAL_KEY")
    void providerIdBatchNotFinalized_fallsThrough() {
        int batchId = jdbcTemplate.queryForObject("""
                INSERT INTO area_onboarding_batch (city_id, source_label, apply_allowed, provider)
                VALUES (?, 'it-fixture-unfinalized', true, 'acme-provider')
                RETURNING id
                """, Integer.class, udupiCityId);
        insertCandidate(batchId, MANIPAL, "ext-unfinalized", "APPROVED");

        AreaResolution resolution = resolutionService.resolve(
                udupiCityId, "acme-provider", "ext-unfinalized", MANIPAL, "Manipal");

        assertThat(resolution.status()).isEqualTo(AreaResolution.Status.RESOLVED);
        assertThat(resolution.method()).isEqualTo(AreaResolution.Method.CANONICAL_KEY);
    }

    @Test
    @DisplayName("a provider-id match belonging to a DIFFERENT city never resolves for this city's "
            + "listing — city-B lookup with city-A's (provider, externalSourceId) is UNRESOLVED")
    void providerIdCrossCity_neverResolvesToOtherCitysArea() {
        int batchId = insertFinalizedAppliedBatch(udupiCityId, "acme-provider");
        insertCandidate(batchId, MANIPAL, "ext-cross-city", "APPROVED");

        // Same (provider, externalSourceId) pair, but resolving for a DIFFERENT city (Bangalore)
        // than the one the candidate batch belongs to (Udupi) — must never leak Udupi's area.
        AreaResolution resolution = resolutionService.resolve(
                bangaloreCityId, "acme-provider", "ext-cross-city",
                "in|ka|bangalore|unmatched-cross-city-test", "Some Bangalore Locality");

        assertThat(resolution.status()).isEqualTo(AreaResolution.Status.UNRESOLVED);
        assertThat(resolution.canonicalAreaKey()).isNull();
    }

    @Test
    @DisplayName("a same-city provider-id lookup still resolves after the city predicate was added "
            + "— proves the added city scoping didn't break the happy path")
    void providerIdSameCity_stillResolves() {
        int batchId = insertFinalizedAppliedBatch(udupiCityId, "acme-provider");
        insertCandidate(batchId, MANIPAL, "ext-same-city", "APPROVED");

        AreaResolution resolution = resolutionService.resolve(
                udupiCityId, "acme-provider", "ext-same-city", "IN|KA|Udupi|Kunjibettu", "Manipal");

        assertThat(resolution.status()).isEqualTo(AreaResolution.Status.RESOLVED);
        assertThat(resolution.method()).isEqualTo(AreaResolution.Method.PROVIDER_ID);
        assertThat(resolution.canonicalAreaKey()).isEqualTo(MANIPAL);
    }

    // ── B2: ALIAS lifecycle/city-consistency guards ─────────────────────────────

    @Test
    @DisplayName("an alias whose target area is INACTIVE/MERGED never resolves — falls through to "
            + "UNRESOLVED even though the alias row itself matches city+name")
    void aliasTargetAreaInactive_neverResolves() {
        String inactiveKey = "IN|KA|Udupi|ItFixtureAliasInactive";
        jdbcTemplate.update("""
                INSERT INTO areas (area_key, city_id, name, district, geo_center_lat, geo_center_lon, lifecycle_status)
                VALUES (?, ?, 'It Fixture Alias Inactive', 'Udupi', 13.35, 74.75, 'INACTIVE')
                """, inactiveKey, udupiCityId);
        jdbcTemplate.update("""
                INSERT INTO area_alias (city_id, area_key, alias, alias_normalised, source)
                VALUES (?, ?, 'Inactive Alias Target', 'inactive alias target', 'it-fixture')
                """, udupiCityId, inactiveKey);

        AreaResolution resolution = resolutionService.resolve(
                udupiCityId, null, null, "in|ka|udupi|unmatched-inactive-alias-test", "Inactive Alias Target");

        assertThat(resolution.status()).isEqualTo(AreaResolution.Status.UNRESOLVED);
        assertThat(resolution.canonicalAreaKey()).isNull();
    }

    @Test
    @DisplayName("an alias row whose aa.city_id differs from its target area's a.city_id never "
            + "resolves — the areas join must agree on city, not just the alias row's own city_id")
    void aliasCityMismatchWithTargetArea_neverResolves() {
        // Alias row claims city_id=bangaloreCityId, but its area_key points at a Udupi-owned area.
        jdbcTemplate.update("""
                INSERT INTO area_alias (city_id, area_key, alias, alias_normalised, source)
                VALUES (?, ?, 'Manipal Mismatch', 'manipal mismatch', 'it-fixture')
                """, bangaloreCityId, MANIPAL);

        AreaResolution resolution = resolutionService.resolve(
                bangaloreCityId, null, null, "in|ka|bangalore|unmatched-mismatch-test", "Manipal Mismatch");

        assertThat(resolution.status()).isEqualTo(AreaResolution.Status.UNRESOLVED);
        assertThat(resolution.canonicalAreaKey()).isNull();
    }

    // ── #2268: resolveByAliasAnyCity (city-less ALIAS rescue) ───────────────────

    @Test
    @DisplayName("#2268: Manipal resolves via the city-less alias-first path to its canonical area")
    void resolveByAliasAnyCity_manipal_resolvesToCanonicalArea() {
        AreaResolution resolution = resolutionService.resolveByAliasAnyCity("Manipal");

        assertThat(resolution.status()).isEqualTo(AreaResolution.Status.RESOLVED);
        assertThat(resolution.method()).isEqualTo(AreaResolution.Method.ALIAS);
        assertThat(resolution.canonicalAreaKey()).isEqualTo(MANIPAL);
    }

    @Test
    @DisplayName("#2268: resolveByAliasAnyCity with zero matches falls through to UNRESOLVED")
    void resolveByAliasAnyCity_noMatch_resolvesUnresolved() {
        AreaResolution resolution = resolutionService.resolveByAliasAnyCity("Totally Unmatched Locality Xyz");

        assertThat(resolution.status()).isEqualTo(AreaResolution.Status.UNRESOLVED);
        assertThat(resolution.canonicalAreaKey()).isNull();
    }

    @Test
    @DisplayName("#2268: blank/null locality resolves UNRESOLVED without querying")
    void resolveByAliasAnyCity_blankLocality_resolvesUnresolved() {
        assertThat(resolutionService.resolveByAliasAnyCity(null).status())
                .isEqualTo(AreaResolution.Status.UNRESOLVED);
        assertThat(resolutionService.resolveByAliasAnyCity("   ").status())
                .isEqualTo(AreaResolution.Status.UNRESOLVED);
    }

    @Test
    @DisplayName("#2268: same normalised alias matching areas in 2+ DISTINCT cities fails closed to "
            + "UNRESOLVED — never guesses which city's area to return")
    void resolveByAliasAnyCity_sameAliasDifferentCities_failsClosedToUnresolved() {
        // Same alias text ("Gandhi Nagar" per V115's own example) registered for two DIFFERENT
        // cities, pointing at two DIFFERENT canonical areas.
        jdbcTemplate.update("""
                INSERT INTO area_alias (city_id, area_key, alias, alias_normalised, source)
                VALUES (?, ?, 'Gandhi Nagar', 'gandhi nagar', 'it-fixture')
                """, udupiCityId, MANIPAL);
        jdbcTemplate.update("""
                INSERT INTO area_alias (city_id, area_key, alias, alias_normalised, source)
                VALUES (?, ?, 'Gandhi Nagar', 'gandhi nagar', 'it-fixture')
                """, bangaloreCityId, "IN|KA|Bengaluru|Indiranagar");

        AreaResolution resolution = resolutionService.resolveByAliasAnyCity("Gandhi Nagar");

        assertThat(resolution.status()).isEqualTo(AreaResolution.Status.UNRESOLVED);
        assertThat(resolution.canonicalAreaKey()).isNull();
    }

    // ── #2268: areaLabelForKey ───────────────────────────────────────────────────

    @Test
    @DisplayName("#2268: areaLabelForKey builds \"AreaName, CityName\" for a resolved area_key")
    void areaLabelForKey_manipal_buildsAreaNameCommaCityName() {
        String label = resolutionService.areaLabelForKey(MANIPAL);

        assertThat(label).isEqualTo("Manipal, Udupi");
    }

    @Test
    @DisplayName("#2268: areaLabelForKey returns null for an unknown area_key")
    void areaLabelForKey_unknownKey_returnsNull() {
        assertThat(resolutionService.areaLabelForKey("in|ka|udupi|totally-unmatched-locality")).isNull();
    }

    @Test
    @DisplayName("#2268: areaLabelForKey returns null for blank input without querying")
    void areaLabelForKey_blankKey_returnsNull() {
        assertThat(resolutionService.areaLabelForKey(null)).isNull();
        assertThat(resolutionService.areaLabelForKey("  ")).isNull();
    }

    // ── UNRESOLVED terminal case, read-only proof ───────────────────────────────

    @Test
    @DisplayName("a listing matching nothing resolves UNRESOLVED with zero areas/area_alias row deltas")
    void noMatchAnywhere_resolvesUnresolvedWithZeroWrites() {
        long areasBefore = areasCount();
        long aliasBefore = aliasCount();

        AreaResolution resolution = resolutionService.resolve(
                udupiCityId, null, null, "in|ka|udupi|totally-unmatched-locality", "Totally Unmatched Locality");

        assertThat(resolution.status()).isEqualTo(AreaResolution.Status.UNRESOLVED);
        assertThat(resolution.method()).isNull();
        assertThat(resolution.canonicalAreaKey()).isNull();
        assertThat(areasCount()).as("resolve() never writes to areas").isEqualTo(areasBefore);
        assertThat(aliasCount()).as("resolve() never writes to area_alias").isEqualTo(aliasBefore);
    }
}

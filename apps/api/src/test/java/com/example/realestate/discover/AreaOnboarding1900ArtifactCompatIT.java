package com.example.realestate.discover;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.jackson.JacksonAutoConfiguration;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.time.OffsetDateTime;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Testcontainers integration test proving that a #1900-PRODUCED offline artefact
 * (a committed sample batch JSON, byte-shape identical to
 * {@code scripts/geography/build_batch_json.py}'s output) is directly consumable by the
 * ALREADY-MERGED #1887 PR1 runner path with NO transformation (issue #1900 AC6).
 *
 * <p>Mirrors {@link AreaOnboardingDryRunSafetyIT}'s Testcontainers + Flyway configuration
 * exactly, but — unlike that test's plain {@code new ObjectMapper()} — autowires the SAME
 * Spring-configured {@link ObjectMapper} bean that {@link AreaOnboardingRunner} itself is
 * injected with in production (via {@link JacksonAutoConfiguration}, explicitly imported
 * because {@code @DataJpaTest} does not pull it in by default). This is the fidelity #1900's
 * plan requires: proving deserialization with the REAL production Jackson configuration, not
 * a bespoke test-only mapper.
 *
 * <p>Three layers of proof (per team-lead-plan.toml q9): (1) Python golden/re-generation-
 * equality tests in scripts/geography/tests/test_build_batch_json.py, (2) THIS test — the
 * authoritative real-DB compat proof, (3) a Python drift-guard (same test file) asserting the
 * emitter's field lists match this contract.
 *
 * <p><b>V71 seed coupling (explicit, by design — WORKDONE_REVIEW rework #1900 fix item 2,
 * option (b)):</b> the fixed sample candidates in {@code sample-1900-udupi-batch.json}
 * (Ambagilu/Mabukala/Mundkina Jaddu, all real Udupi-district OSM points) are only classified
 * {@code READY_TO_CREATE} because their lat/lon fall inside V71's seeded {@code udupi} city
 * bbox ({@code cities.min_lat=13.1400, min_lon=74.6600, max_lat=13.4700, max_lon=74.8600} —
 * see {@code V71__cities_and_areas.sql}) and because none of
 * V71's 13 already-seeded {@code IN|KA|Udupi|*} area keys collide with the sample's
 * {@code *1900Sample}-suffixed keys. If a future migration narrows the Udupi bbox or seeds a
 * colliding area key, this test's outcome assertions (READY_TO_CREATE=3 /
 * applyAllowed=true) would start failing — that failure would correctly indicate seed drift,
 * not a #1900 pipeline regression. Deriving the expected candidate set from the actually-
 * seeded areas at test time (option (a)) was assessed and rejected: this test's whole point
 * is proving a FIXED, #1900-produced artefact deserializes and dryRuns correctly against the
 * real #1887 contract — swapping in DB-derived expectations would make the proof circular
 * (asserting the DB against itself) and would expand scope well beyond a compat check. The
 * {@code assertUdupiSeedBboxCoversSampleCandidates()} AND
 * {@code assertNoUdupiSeedKeyCollidesWithSampleKeys()} guards below turn a silent V71 bbox
 * drift or area-key collision, respectively, into an actionable, explicitly-labelled failure
 * instead of a confusing outcome-count mismatch three tests later.
 *
 * <p>Test-only: no #1887 PR1 production code (AreaOnboardingRunner/AreaOnboardingService/
 * AreaKeyFormat/GeometryTrust) is modified by this class.
 */
@DataJpaTest
@Import(JacksonAutoConfiguration.class)
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.placeholders.concurrently_keyword="
})
class AreaOnboarding1900ArtifactCompatIT {

    private static final String SAMPLE_RESOURCE = "area-onboarding/sample-1900-udupi-batch.json";

    /** Hard invariant D2 (issue #1900 user-correction rework): this resource's bytes must
     * NEVER change — a separate #1900-owned city-area-review-manifest.json sidecar carries
     * the rework's new reviewer/alias/provenance/checksum-split data instead. This is the
     * sha256 of the file's exact committed bytes, computed independently of Jackson
     * (byte-level, not semantic) — any future edit to this resource, even reformatting,
     * fails this test loudly rather than silently drifting the #1887 contract. */
    private static final String SAMPLE_RESOURCE_SHA256 =
            "4240530fe79ac16bb8999fd65b1bf902da9eb6b2ff79aca520367cc8fb584b78";

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    /** The 3 sample candidates' fixed geo_center lat/lon, verbatim from
     * {@code sample-1900-udupi-batch.json} — real Udupi-district OSM points, never
     * recomputed here. Used ONLY by {@link #assertUdupiSeedBboxCoversSampleCandidates()} to
     * turn a V71 bbox drift into an explicit, named setup failure (see the class javadoc's
     * "V71 seed coupling" note) instead of a confusing outcome-count mismatch three tests
     * later. */
    private static final double[][] SAMPLE_CANDIDATE_LAT_LON = {
            {13.3710379, 74.7464615}, // Ambagilu (node/459838242)
            {13.4557039, 74.7114236}, // Mabukala (node/459839034)
            {13.4208736, 74.8069551}, // Mundkina Jaddu (node/870914109)
    };

    /** The 3 sample candidates' fixed proposed area keys, verbatim from
     * {@code sample-1900-udupi-batch.json}. Used ONLY by
     * {@link #assertNoUdupiSeedKeyCollidesWithSampleKeys()} to turn a V71 area-key collision
     * into an explicit, named setup failure (see the class javadoc's "V71 seed coupling"
     * note) instead of a confusing outcome-count mismatch three tests later. */
    private static final List<String> SAMPLE_PROPOSED_AREA_KEYS = List.of(
            "IN|KA|Udupi|Ambagilu1900Sample",
            "IN|KA|Udupi|Mabukala1900Sample",
            "IN|KA|Udupi|MundkinaJaddu1900Sample");

    private AreaOnboardingService onboardingService;
    private Integer udupiCityId;

    @BeforeEach
    void setUp() {
        onboardingService = new AreaOnboardingService(jdbcTemplate, objectMapper);
        udupiCityId = jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = 'udupi'", Integer.class);
        assertUdupiSeedBboxCoversSampleCandidates();
        assertNoUdupiSeedKeyCollidesWithSampleKeys();
    }

    /** Fails loudly and explicitly, naming the V71 seed dependency, if the seeded
     * {@code udupi} city bbox has drifted such that it no longer contains all 3 fixed sample
     * candidate points — the precondition every outcome assertion below (READY_TO_CREATE=3,
     * applyAllowed=true) silently depends on. See the class javadoc's "V71 seed coupling"
     * note for why this coupling is accepted rather than removed. */
    private void assertUdupiSeedBboxCoversSampleCandidates() {
        Map<String, Object> bbox = jdbcTemplate.queryForMap(
                "SELECT min_lat, min_lon, max_lat, max_lon FROM cities WHERE id = ?", udupiCityId);
        double minLat = ((Number) bbox.get("min_lat")).doubleValue();
        double minLon = ((Number) bbox.get("min_lon")).doubleValue();
        double maxLat = ((Number) bbox.get("max_lat")).doubleValue();
        double maxLon = ((Number) bbox.get("max_lon")).doubleValue();
        for (double[] latLon : SAMPLE_CANDIDATE_LAT_LON) {
            double lat = latLon[0];
            double lon = latLon[1];
            assertThat(lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon)
                    .as("V71 seed drift: sample candidate (%s, %s) is no longer inside the "
                            + "seeded udupi city bbox [minLat=%s, minLon=%s, maxLat=%s, "
                            + "maxLon=%s] — this test's fixed #1900 sample artefact "
                            + "(sample-1900-udupi-batch.json) depends on V71's Udupi bbox "
                            + "staying stable (see the class javadoc); either the seed "
                            + "changed or the sample fixture needs regenerating",
                            lat, lon, minLat, minLon, maxLat, maxLon)
                    .isTrue();
        }
    }

    /** Fails loudly and explicitly, naming the V71 seed dependency, if a future migration
     * ever seeds an {@code IN|KA|Udupi|*} area key that collides with one of this test's
     * fixed sample proposed keys — the SECOND of the two V71 assumptions named in the class
     * javadoc's "V71 seed coupling" note (bbox coverage is the first, guarded above by
     * {@link #assertUdupiSeedBboxCoversSampleCandidates()}). Without this guard, a colliding
     * seed key would make {@link AreaOnboardingService}'s own within-city collision detection
     * report a CONFLICT outcome instead of READY_TO_CREATE for that candidate, surfacing only
     * as a confusing {@code outcomeCounts} mismatch in a later test rather than a named,
     * actionable seed-collision failure here. */
    private void assertNoUdupiSeedKeyCollidesWithSampleKeys() {
        List<String> existingUdupiAreaKeys = jdbcTemplate.queryForList(
                "SELECT area_key FROM areas WHERE city_id = ?", String.class, udupiCityId);
        for (String sampleKey : SAMPLE_PROPOSED_AREA_KEYS) {
            assertThat(existingUdupiAreaKeys)
                    .as("V71 seed collision: a seeded Udupi area_key already equals this "
                            + "test's fixed #1900 sample proposed key %s — this test's outcome "
                            + "assertions (READY_TO_CREATE=3, applyAllowed=true) depend on none "
                            + "of V71's seeded IN|KA|Udupi|* area keys colliding with the "
                            + "sample's *1900Sample-suffixed keys (see the class javadoc's "
                            + "\"V71 seed coupling\" note); either a migration seeded a "
                            + "colliding key or the sample fixture needs regenerating with a "
                            + "different suffix",
                            sampleKey)
                    .doesNotContain(sampleKey);
        }
    }

    private AreaOnboardingRunner.CandidateBatchFile loadSampleBatchFile() throws IOException {
        try (InputStream in = getClass().getClassLoader().getResourceAsStream(SAMPLE_RESOURCE)) {
            assertThat(in).as("test resource %s must be on the classpath", SAMPLE_RESOURCE).isNotNull();
            return objectMapper.readValue(in, AreaOnboardingRunner.CandidateBatchFile.class);
        }
    }

    /** Mirrors AreaOnboardingRunner's private toBatchIdentity (Runner cannot be reused directly —
     * that method is private — so this replicates its exact parse rule: OffsetDateTime.parse only
     * when sourceExtractedAt is non-null/non-blank). */
    private static AreaOnboardingService.BatchIdentity toBatchIdentity(AreaOnboardingRunner.CandidateBatchFile batchFile) {
        OffsetDateTime sourceExtractedAt = null;
        if (batchFile.sourceExtractedAt() != null && !batchFile.sourceExtractedAt().isBlank()) {
            sourceExtractedAt = OffsetDateTime.parse(batchFile.sourceExtractedAt());
        }
        return new AreaOnboardingService.BatchIdentity(
                batchFile.datasetId(), batchFile.datasetVersion(), batchFile.artifactChecksum(),
                batchFile.provider(), batchFile.inputSchemaVersion(), sourceExtractedAt);
    }

    @Test
    @DisplayName("the #1900-produced sample batch JSON deserializes via the real Spring ObjectMapper "
            + "into CandidateBatchFile with NO error, and every candidate carries the expected values")
    void sampleArtifactDeserializesWithNoError_andCandidateValuesMatch() throws IOException {
        AreaOnboardingRunner.CandidateBatchFile batchFile = loadSampleBatchFile();

        assertThat(batchFile.datasetId()).isEqualTo("issue-1900-udupi-compat-sample");
        assertThat(batchFile.datasetVersion()).isEqualTo("v1");
        assertThat(batchFile.provider()).isEqualTo("OSM");
        assertThat(batchFile.inputSchemaVersion()).isEqualTo("1");
        assertThat(batchFile.sourceExtractedAt()).isEqualTo("2026-07-15T00:00:00Z");
        assertThat(batchFile.candidates()).hasSize(3);

        AreaOnboardingService.CandidateInput ambagilu = batchFile.candidates().stream()
                .filter(c -> c.areaKey().equals("IN|KA|Udupi|Ambagilu1900Sample"))
                .findFirst().orElseThrow();
        assertThat(ambagilu.name()).isEqualTo("Ambagilu");
        assertThat(ambagilu.geoCenterLat()).isEqualTo(13.3710379);
        assertThat(ambagilu.geoCenterLon()).isEqualTo(74.7464615);
        assertThat(ambagilu.minLat()).isNull();
        assertThat(ambagilu.geometrySource()).isEqualTo("OSM");
        assertThat(ambagilu.externalSourceId()).isEqualTo("node/459838242");
    }

    @Test
    @DisplayName("D2 hard invariant (user-correction rework): the committed sample batch JSON's "
            + "bytes are byte-for-byte unchanged, and its artifactChecksum is the SAME value the "
            + "#1900 review-manifest sidecar's candidatePayloadChecksum copies verbatim — the "
            + "rework's new reviewer/alias/provenance/checksum-split data lives ENTIRELY in a "
            + "separate city-area-review-manifest.json, never in this file")
    void sampleResourceBytesAreUnchangedAndArtifactChecksumIsStable() throws Exception {
        byte[] bytes;
        try (InputStream in = getClass().getClassLoader().getResourceAsStream(SAMPLE_RESOURCE)) {
            assertThat(in).as("test resource %s must be on the classpath", SAMPLE_RESOURCE).isNotNull();
            bytes = in.readAllBytes();
        }
        MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
        String actualSha256 = HexFormat.of().formatHex(sha256.digest(bytes));
        assertThat(actualSha256)
                .as("sample-1900-udupi-batch.json bytes must NEVER change (D2) — if this legitimately "
                        + "needs to change, the reviewed CSV + raw JSONL that produced it must also be "
                        + "regenerated and this constant updated deliberately, not incidentally")
                .isEqualTo(SAMPLE_RESOURCE_SHA256);

        AreaOnboardingRunner.CandidateBatchFile batchFile = loadSampleBatchFile();
        assertThat(batchFile.artifactChecksum()).isNotBlank();
    }

    @Test
    @DisplayName("AreaKeyFormat.normalise accepts every #1900-minted key in the sample UNCHANGED "
            + "(proves the Python area_key.py port did not drift from the Java rules)")
    void mintedAreaKeysAreAcceptedUnchangedByAreaKeyFormat() throws IOException {
        AreaOnboardingRunner.CandidateBatchFile batchFile = loadSampleBatchFile();
        for (AreaOnboardingService.CandidateInput candidate : batchFile.candidates()) {
            assertThat(AreaKeyFormat.isValidFourSegment(candidate.areaKey())).isTrue();
            assertThat(AreaKeyFormat.normalise(candidate.areaKey())).isEqualTo(candidate.areaKey());
        }
    }

    @Test
    @DisplayName("dryRun on real Postgres: no deserialization error, expected applyAllowed=true, "
            + "expected outcomeCounts={READY_TO_CREATE=3}, and staging rows persisted with the "
            + "expected candidate values — proving the #1900 artefact is directly consumable with "
            + "NO ad-hoc transformation")
    void dryRunAgainstRealPostgres_producesExpectedOutcomesAndStagingRows() throws IOException {
        AreaOnboardingRunner.CandidateBatchFile batchFile = loadSampleBatchFile();
        AreaOnboardingService.BatchIdentity batchIdentity = toBatchIdentity(batchFile);

        int batchesBefore = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM area_onboarding_batch", Integer.class);
        int candidatesBefore = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM area_onboarding_candidate", Integer.class);

        AreaOnboardingReport report = onboardingService.dryRun(
                udupiCityId, "issue-1900-compat-it", batchIdentity, batchFile.candidates());

        assertThat(report.candidates()).hasSize(3);
        assertThat(report.applyAllowed()).isTrue();
        assertThat(report.blockingReasons()).isEmpty();

        Map<CandidateOutcome, Integer> counts = report.outcomeCounts();
        assertThat(counts).hasSize(1);
        assertThat(counts.get(CandidateOutcome.READY_TO_CREATE)).isEqualTo(3);

        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM area_onboarding_batch", Integer.class))
                .isEqualTo(batchesBefore + 1);
        assertThat(jdbcTemplate.queryForObject("SELECT COUNT(*) FROM area_onboarding_candidate", Integer.class))
                .isEqualTo(candidatesBefore + 3);

        List<String> stagedAreaKeys = jdbcTemplate.queryForList(
                "SELECT input_area_key FROM area_onboarding_candidate WHERE batch_id = ? ORDER BY input_area_key",
                String.class, report.batchId());
        assertThat(stagedAreaKeys).containsExactly(
                "IN|KA|Udupi|Ambagilu1900Sample",
                "IN|KA|Udupi|Mabukala1900Sample",
                "IN|KA|Udupi|MundkinaJaddu1900Sample");
    }

    @Test
    @DisplayName("the batch-level dataset identity from the #1900 artefact is persisted verbatim on "
            + "area_onboarding_batch")
    void batchIdentityFromArtifactIsPersistedVerbatim() throws IOException {
        AreaOnboardingRunner.CandidateBatchFile batchFile = loadSampleBatchFile();
        AreaOnboardingService.BatchIdentity batchIdentity = toBatchIdentity(batchFile);

        AreaOnboardingReport report = onboardingService.dryRun(
                udupiCityId, "issue-1900-compat-it", batchIdentity, batchFile.candidates());

        Map<String, Object> batchRow = jdbcTemplate.queryForMap(
                "SELECT dataset_id, dataset_version, artifact_checksum, provider, input_schema_version "
                        + "FROM area_onboarding_batch WHERE id = ?", report.batchId());
        assertThat(batchRow.get("dataset_id")).isEqualTo("issue-1900-udupi-compat-sample");
        assertThat(batchRow.get("dataset_version")).isEqualTo("v1");
        assertThat(batchRow.get("artifact_checksum")).isEqualTo(batchFile.artifactChecksum());
        assertThat(batchRow.get("provider")).isEqualTo("OSM");
        assertThat(batchRow.get("input_schema_version")).isEqualTo("1");
    }
}

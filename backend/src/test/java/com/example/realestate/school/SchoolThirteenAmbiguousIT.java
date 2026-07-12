package com.example.realestate.school;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.util.StreamUtils;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regression IT for issue #1829 (PR2 of 2) — {@code V112__resolve_thirteen_ambiguous_school_attributions.sql}.
 *
 * <p>Harness copied from {@link SchoolAreaKeyCorrectionIT} / {@link SchoolCoverageBackfillIT}:
 * {@code @DataJpaTest} + real {@code postgis/postgis:15-3.4}, full Flyway chain (through V112),
 * no DB replacement. The REAL migration file is loaded fresh from the classpath via
 * {@link ClassPathResource} and executed verbatim — NEVER a Java mirror of its literals (V112's
 * deliverable is a table of hardcoded udise_code/area_key literals plus a live-geometry-derived
 * INSERT; a Java copy of those literals would only ever prove a copy matches itself).
 *
 * <h2>Fixture setup</h2>
 * {@code trg_school_area_key} (V80) is disabled for every test in this class so the 13 schools
 * can be seeded with their EXACT historical stored coarse {@code area_key} (from
 * {@code scripts/db/fixtures/bangalore-mangalore-schools-seed.sql} /
 * {@code docs/audit/evidence/issue-1829-thirteen-ambiguous-schools/thirteen-schools.json}) without
 * V80 recomputing it against the full 313-area catalogue. The V110 coverage triggers
 * ({@code trg_sync_school_discover_area_coverage_insert}/{@code _update}) are left LIVE, so each
 * INSERT below creates the school's initial {@code primary} coverage row automatically — exactly
 * mirroring the real post-V110-backfill production state before V112 runs.
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
class SchoolThirteenAmbiguousIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private SchoolRepository schoolRepository;

    private static final String V112_CLASSPATH_LOCATION =
            "db/migration/V112__resolve_thirteen_ambiguous_school_attributions.sql";
    private static final String AREA_KEY_TRIGGER = "trg_school_area_key";

    // ── Curated (V71) area_keys ────────────────────────────────────────────────────────────────
    private static final String WHITEFIELD = "IN|KA|Bengaluru|Whitefield";
    private static final String KORAMANGALA = "IN|KA|Bengaluru|Koramangala";
    private static final String INDIRANAGAR = "IN|KA|Bengaluru|Indiranagar";
    private static final String HEBBAL = "IN|KA|Bengaluru|Hebbal";
    private static final String HSR_LAYOUT = "IN|KA|Bengaluru|HSR Layout";
    private static final String SARJAPUR_ROAD = "IN|KA|Bengaluru|Sarjapur Road";
    private static final String YELAHANKA = "IN|KA|Bengaluru|Yelahanka";
    private static final String JAYANAGAR = "IN|KA|Bengaluru|Jayanagar";
    private static final String MARATHAHALLI = "IN|KA|Bengaluru|Marathahalli";
    private static final String ELECTRONIC_CITY = "IN|KA|Bengaluru|Electronic City";

    // ── Fine (V106) destination localities for the 2 HIGH_CONFIDENCE moves ────────────────────
    private static final String NEW_TIPPASANDRA = "IN|KA|Bengaluru|New Tippasandra";
    private static final String BELLANDUR = "IN|KA|Bengaluru|Bellandur";

    // ── The 13 udise_codes, real coordinates + historical stored (coarse) area_key, from
    //    scripts/db/fixtures/bangalore-mangalore-schools-seed.sql (none corrected by V109) ──────
    private static final String BS_ELECTRONIC_CITY = "APIFY-BAN-ELEC-02";
    private static final String CARMEL_GARDEN = "APIFY-BAN-HSRL-01";
    private static final String NARAYANA_ELEC_CITY_PH1 = "APIFY-BAN-HSRL-03";
    private static final String ORCHIDS_HARALUR = "APIFY-BAN-HSRL-04";
    private static final String VIVEKANANDA_SAHAKAR_NAGAR = "APIFY-BAN-HEBB-02";
    private static final String POORNAPRAJNA = "APIFY-BAN-INDI-01";
    private static final String NARAYANA_RK_LAYOUT = "APIFY-BAN-JAYA-02";
    private static final String NPS_BANASHANKARI = "APIFY-BAN-JAYA-03";
    private static final String RMS_INTERNATIONAL = "APIFY-BAN-JAYA-04";
    private static final String EUROSCHOOL_WHITEFIELD = "APIFY-BAN-MARA-01";
    private static final String NARAYANA_KR_PURAM = "APIFY-BAN-MARA-03";
    private static final String NARAYANA_BELLANDUR = "APIFY-BAN-SARJ-01";
    private static final String ORCHIDS_SARJAPUR_ROAD = "APIFY-BAN-SARJ-02";

    @BeforeEach
    void disableAreaKeyTriggerAndSeedThirteenSchools() {
        // V80 disabled: lets us seed the EXACT historical stored area_key per school below,
        // without it being recomputed against the full 313-area catalogue. Coverage triggers
        // (V110) are left live, so each INSERT below creates a 'primary' coverage row
        // automatically at the seeded area_key.
        jdbc.execute("ALTER TABLE public.schools DISABLE TRIGGER " + AREA_KEY_TRIGGER);

        insertSchool(BS_ELECTRONIC_CITY, "BS International School, Electronic City", 12.8284568, 77.6321322, ELECTRONIC_CITY);
        insertSchool(CARMEL_GARDEN, "Carmel Garden Public School", 12.9172890, 77.6320300, HSR_LAYOUT);
        insertSchool(NARAYANA_ELEC_CITY_PH1, "Narayana eTechno (CBSE) School - Electronic City Phase 1", 12.8966245, 77.6341217, HSR_LAYOUT);
        insertSchool(ORCHIDS_HARALUR, "ORCHIDS The International School in Haralur", 12.8999972, 77.6653442, HSR_LAYOUT);
        insertSchool(VIVEKANANDA_SAHAKAR_NAGAR, "Vivekananda ORCHIDS The International School - Sahakar Nagar", 13.0688060, 77.5807851, HEBBAL);
        insertSchool(POORNAPRAJNA, "Poornaprajna Education Centre, Indiranagar", 12.9721576, 77.6563830, INDIRANAGAR);
        insertSchool(NARAYANA_RK_LAYOUT, "Narayana eTechno (CBSE) School - Rk Layout", 12.9003095, 77.5717347, JAYANAGAR);
        insertSchool(NPS_BANASHANKARI, "National Public School, Banashankari", 12.9000260, 77.5276092, JAYANAGAR);
        insertSchool(RMS_INTERNATIONAL, "RMS International School", 12.8920540, 77.5658623, JAYANAGAR);
        insertSchool(EUROSCHOOL_WHITEFIELD, "EuroSchool Whitefield - CBSE School", 12.9856361, 77.7137513, MARATHAHALLI);
        insertSchool(NARAYANA_KR_PURAM, "Narayana eTechno (CBSE) School - KR Puram", 13.0041217, 77.7130365, MARATHAHALLI);
        insertSchool(NARAYANA_BELLANDUR, "Narayana eTechno (CBSE) School - Bellandur", 12.9267614, 77.6733670, SARJAPUR_ROAD);
        insertSchool(ORCHIDS_SARJAPUR_ROAD, "ORCHIDS The International School - Sarjapur Road", 12.9170635, 77.6704478, SARJAPUR_ROAD);
    }

    private UUID insertSchool(String udiseCode, String name, double lat, double lon, String areaKey) {
        jdbc.update(
                "INSERT INTO public.schools (udise_code, name, board_type, latitude, longitude, district, area_key, source) "
                        + "VALUES (?, ?, 'CBSE', ?, ?, 'Bengaluru', ?, 'TEST_FIXTURE')",
                udiseCode, name, lat, lon, areaKey);
        return jdbc.queryForObject(
                "SELECT id FROM public.schools WHERE udise_code = ?", UUID.class, udiseCode);
    }

    private void applyV112Migration() {
        jdbc.execute(loadClasspathSql(V112_CLASSPATH_LOCATION));
    }

    private static String loadClasspathSql(String location) {
        try {
            return StreamUtils.copyToString(
                    new ClassPathResource(location).getInputStream(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to load " + location + " for regression test", e);
        }
    }

    private String areaKeyOf(String udiseCode) {
        return jdbc.queryForObject(
                "SELECT area_key FROM public.schools WHERE udise_code = ?", String.class, udiseCode);
    }

    private int coverageRowCount(String udiseCode) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM school_discover_area_coverage c "
                        + "JOIN schools s ON s.id = c.school_id WHERE s.udise_code = ?",
                Integer.class, udiseCode);
        return count == null ? 0 : count;
    }

    private Map<String, Object> coverageRow(String udiseCode, String areaKey) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT c.relationship_type, c.source FROM school_discover_area_coverage c "
                        + "JOIN schools s ON s.id = c.school_id "
                        + "WHERE s.udise_code = ? AND c.curated_area_key = ?",
                udiseCode, areaKey);
        assertThat(rows).as("coverage row for udise=%s area=%s", udiseCode, areaKey).hasSize(1);
        return rows.get(0);
    }

    private boolean coverageRowExists(String udiseCode, String areaKey) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM school_discover_area_coverage c "
                        + "JOIN schools s ON s.id = c.school_id "
                        + "WHERE s.udise_code = ? AND c.curated_area_key = ?",
                Integer.class, udiseCode, areaKey);
        return count != null && count > 0;
    }

    // ── (a) the 2 HIGH schools' area_key moved to the truthful locality ───────────────────────

    @Test
    @DisplayName("(a) AC1: the 2 HIGH_CONFIDENCE schools' canonical area_key moves to the truthful locality")
    void highConfidenceSchools_canonicalAreaKeyMoves() {
        applyV112Migration();

        assertThat(areaKeyOf(POORNAPRAJNA)).isEqualTo(NEW_TIPPASANDRA);
        assertThat(areaKeyOf(NARAYANA_BELLANDUR)).isEqualTo(BELLANDUR);
    }

    // ── (b) the other 11 UNCHANGED, per-school by name — anti-wholesale-re-derivation guard ───

    @Test
    @DisplayName("(b) AC2/AC11: the other 11 canonical localities (10 MEDIUM + 1 UNRESOLVED) are UNCHANGED, per school")
    void otherElevenSchools_canonicalAreaKeyUnchanged() {
        applyV112Migration();

        assertThat(areaKeyOf(BS_ELECTRONIC_CITY)).as("BS International, Electronic City").isEqualTo(ELECTRONIC_CITY);
        assertThat(areaKeyOf(CARMEL_GARDEN)).as("Carmel Garden Public School").isEqualTo(HSR_LAYOUT);
        assertThat(areaKeyOf(NARAYANA_ELEC_CITY_PH1)).as("Narayana eTechno - Electronic City Phase 1").isEqualTo(HSR_LAYOUT);
        assertThat(areaKeyOf(ORCHIDS_HARALUR)).as("ORCHIDS - Haralur").isEqualTo(HSR_LAYOUT);
        assertThat(areaKeyOf(VIVEKANANDA_SAHAKAR_NAGAR)).as("Vivekananda ORCHIDS - Sahakar Nagar").isEqualTo(HEBBAL);
        assertThat(areaKeyOf(NARAYANA_RK_LAYOUT)).as("Narayana eTechno - Rk Layout").isEqualTo(JAYANAGAR);
        assertThat(areaKeyOf(NPS_BANASHANKARI)).as("National Public School, Banashankari").isEqualTo(JAYANAGAR);
        assertThat(areaKeyOf(RMS_INTERNATIONAL)).as("RMS International School").isEqualTo(JAYANAGAR);
        assertThat(areaKeyOf(EUROSCHOOL_WHITEFIELD)).as("EuroSchool Whitefield").isEqualTo(MARATHAHALLI);
        assertThat(areaKeyOf(NARAYANA_KR_PURAM)).as("Narayana eTechno - KR Puram (UNRESOLVED)").isEqualTo(MARATHAHALLI);
        assertThat(areaKeyOf(ORCHIDS_SARJAPUR_ROAD)).as("ORCHIDS - Sarjapur Road").isEqualTo(SARJAPUR_ROAD);
    }

    // ── (c) the 2 migrated schools RETAIN their curated count via `contained` coverage ────────

    @Test
    @DisplayName("(c) AC4: the 2 migrated schools retain their curated count via `contained` coverage (Indiranagar, Sarjapur Road)")
    void migratedSchools_retainCuratedCount_viaContainedCoverage() {
        applyV112Migration();

        Map<String, Object> poornaprajnaAtIndiranagar = coverageRow(POORNAPRAJNA, INDIRANAGAR);
        assertThat(poornaprajnaAtIndiranagar.get("relationship_type"))
                .as("Poornaprajna must still count toward Indiranagar via a machine-derived contained row")
                .isEqualTo("contained");

        Map<String, Object> bellandurAtSarjapurRoad = coverageRow(NARAYANA_BELLANDUR, SARJAPUR_ROAD);
        assertThat(bellandurAtSarjapurRoad.get("relationship_type"))
                .as("Narayana/Bellandur must still count toward Sarjapur Road via a machine-derived contained row")
                .isEqualTo("contained");
    }

    // ── (d) ORCHIDS Haralur has `contained` coverage of Sarjapur Road (curated, not its own area) ──

    @Test
    @DisplayName("(d) AC5: ORCHIDS Haralur gains `contained` coverage of Sarjapur Road, a curated area that is NOT its stored area")
    void orchidsHaralur_gainsContainedCoverage_ofSarjapurRoad() {
        applyV112Migration();

        assertThat(areaKeyOf(ORCHIDS_HARALUR))
                .as("ORCHIDS Haralur's canonical locality is unchanged (MEDIUM confidence)")
                .isEqualTo(HSR_LAYOUT);

        Map<String, Object> row = coverageRow(ORCHIDS_HARALUR, SARJAPUR_ROAD);
        assertThat(row.get("relationship_type")).isEqualTo("contained");
        assertThat(row.get("source")).isEqualTo("proximity_backfill");
    }

    // ── (e) AC12 — NO `contained` row exists for any degenerate-bbox area ─────────────────────
    // All 10 curated (V71) areas are non-degenerate today, so this exercises the guard against
    // FUTURE drift: temporarily collapse a curated area's bbox to a single point exactly matching
    // a school's coordinates (which would otherwise trivially satisfy BETWEEN), and prove V112
    // still refuses to create a contained row there.

    @Test
    @DisplayName("(e) AC12: no `contained` row is ever created for a degenerate-bbox area, even when coordinates match exactly")
    void noContainedRow_forDegenerateBboxArea_evenOnExactCoordinateMatch() {
        // Carmel Garden's own coordinates; give it a DIFFERENT canonical area (Jayanagar) so a
        // contained row at HSR_LAYOUT would not be excluded by the "own canonical area" rule —
        // only the degenerate-bbox exclusion can suppress it here.
        jdbc.update("UPDATE public.schools SET area_key = ? WHERE udise_code = ?", JAYANAGAR, CARMEL_GARDEN);

        // Collapse HSR Layout's bbox to a single point at exactly Carmel Garden's coordinates.
        jdbc.update(
                "UPDATE public.areas SET min_lat = ?, max_lat = ?, min_lon = ?, max_lon = ? WHERE area_key = ?",
                12.9172890, 12.9172890, 77.6320300, 77.6320300, HSR_LAYOUT);

        applyV112Migration();

        assertThat(coverageRowExists(CARMEL_GARDEN, HSR_LAYOUT))
                .as("a degenerate (point) bbox must never yield a `contained` row, even on an exact coordinate match")
                .isFalse();
    }

    // ── (f) NO `nearby` rows are ever created by V112 ─────────────────────────────────────────

    @Test
    @DisplayName("(f) V112 never creates a `nearby` coverage row")
    void noNearbyRows_areEverCreated() {
        applyV112Migration();

        Integer nearbyCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM school_discover_area_coverage WHERE relationship_type = 'nearby'",
                Integer.class);
        assertThat(nearbyCount).isZero();
    }

    // ── (g) idempotence — re-running V112 yields an identical result ─────────────────────────

    @Test
    @DisplayName("(g) re-applying V112 is idempotent")
    void reapplyingV112_isIdempotent() {
        applyV112Migration();

        String poornaprajnaAfterFirst = areaKeyOf(POORNAPRAJNA);
        String bellandurAfterFirst = areaKeyOf(NARAYANA_BELLANDUR);
        int totalCoverageRowsAfterFirst = totalCoverageRowCount();

        applyV112Migration();

        assertThat(areaKeyOf(POORNAPRAJNA)).isEqualTo(poornaprajnaAfterFirst);
        assertThat(areaKeyOf(NARAYANA_BELLANDUR)).isEqualTo(bellandurAfterFirst);
        assertThat(totalCoverageRowCount())
                .as("re-applying V112 must not create duplicate coverage rows")
                .isEqualTo(totalCoverageRowsAfterFirst);
    }

    // ── (h) convergence — V112 reaches the same end state from an ALREADY-fixed starting state ──
    // (constructed independently of V112's own INSERT — a bare area_key move + a manually
    // inserted contained row — simulating an environment where a prior partial fix already
    // landed the post-migration shape before V112 itself is (re-)applied).

    @Test
    @DisplayName("(h) convergence: V112 reaches the same end state whether starting from pre-fix or already-fixed data")
    void convergesToSameEndState_fromPreFixOrAlreadyFixedStartingState() {
        // Independently construct the ALREADY-FIXED end state (not via V112's own SQL):
        // bare area_key moves for the 2 HIGH schools (fires the coverage trigger, mirroring
        // what V112's STEP A + the trigger would do), plus a manually-inserted contained row
        // for ORCHIDS Haralur at Sarjapur Road (mirroring what V112's STEP B would insert).
        jdbc.update("UPDATE public.schools SET area_key = ? WHERE udise_code = ?", NEW_TIPPASANDRA, POORNAPRAJNA);
        jdbc.update("UPDATE public.schools SET area_key = ? WHERE udise_code = ?", BELLANDUR, NARAYANA_BELLANDUR);
        jdbc.update(
                "INSERT INTO school_discover_area_coverage (school_id, curated_area_key, relationship_type, source) "
                        + "SELECT id, ?, 'contained', 'proximity_backfill' FROM public.schools WHERE udise_code = ?",
                INDIRANAGAR, POORNAPRAJNA);
        jdbc.update(
                "INSERT INTO school_discover_area_coverage (school_id, curated_area_key, relationship_type, source) "
                        + "SELECT id, ?, 'contained', 'proximity_backfill' FROM public.schools WHERE udise_code = ?",
                SARJAPUR_ROAD, NARAYANA_BELLANDUR);
        jdbc.update(
                "INSERT INTO school_discover_area_coverage (school_id, curated_area_key, relationship_type, source) "
                        + "SELECT id, ?, 'contained', 'proximity_backfill' FROM public.schools WHERE udise_code = ?",
                SARJAPUR_ROAD, ORCHIDS_HARALUR);

        applyV112Migration();

        assertThat(areaKeyOf(POORNAPRAJNA)).isEqualTo(NEW_TIPPASANDRA);
        assertThat(areaKeyOf(NARAYANA_BELLANDUR)).isEqualTo(BELLANDUR);
        assertThat(coverageRow(POORNAPRAJNA, INDIRANAGAR).get("relationship_type")).isEqualTo("contained");
        assertThat(coverageRow(NARAYANA_BELLANDUR, SARJAPUR_ROAD).get("relationship_type")).isEqualTo("contained");
        assertThat(coverageRow(ORCHIDS_HARALUR, SARJAPUR_ROAD).get("relationship_type")).isEqualTo("contained");
        // Exactly 2 rows each: the (trigger-owned) primary at the NEW canonical area, plus the
        // (V112-owned) contained row at the OLD curated area that keeps the badge counted.
        assertThat(coverageRow(POORNAPRAJNA, NEW_TIPPASANDRA).get("relationship_type")).isEqualTo("primary");
        assertThat(coverageRow(NARAYANA_BELLANDUR, BELLANDUR).get("relationship_type")).isEqualTo("primary");
        assertThat(coverageRowCount(POORNAPRAJNA)).isEqualTo(2);
        assertThat(coverageRowCount(NARAYANA_BELLANDUR)).isEqualTo(2);
    }

    // ── (i) AC10 — the 2 migrated schools' primary rows moved with source='trigger' ───────────
    // Positive proof that V110's AFTER UPDATE trigger — not V112 — performed the primary-row
    // move: V112 contains zero INSERTs of relationship_type='primary' (see AC9 below), so if the
    // new primary row exists with source='trigger', only the trigger could have written it.

    @Test
    @DisplayName("(i) AC10: the 2 migrated schools' primary coverage rows moved to the NEW areas with source='trigger'")
    void migratedSchools_primaryRowsMoveToNewAreas_withSourceTrigger() {
        applyV112Migration();

        Map<String, Object> poornaprajnaPrimary = coverageRow(POORNAPRAJNA, NEW_TIPPASANDRA);
        assertThat(poornaprajnaPrimary.get("relationship_type")).isEqualTo("primary");
        assertThat(poornaprajnaPrimary.get("source"))
                .as("only V110's coverage trigger could have moved this primary row; V112 never hand-writes 'primary'")
                .isEqualTo("trigger");

        Map<String, Object> bellandurPrimary = coverageRow(NARAYANA_BELLANDUR, BELLANDUR);
        assertThat(bellandurPrimary.get("relationship_type")).isEqualTo("primary");
        assertThat(bellandurPrimary.get("source"))
                .as("only V110's coverage trigger could have moved this primary row; V112 never hand-writes 'primary'")
                .isEqualTo("trigger");

        // The stale primary row at the OLD area (Indiranagar) must be GONE (trigger's
        // delete-stale-primary step) — only the STEP B contained row remains there.
        assertThat(coverageRow(POORNAPRAJNA, INDIRANAGAR).get("relationship_type"))
                .as("the stale primary row at Indiranagar must have been replaced by a contained row, not remain as primary")
                .isEqualTo("contained");
    }

    // ── (j) AC9 — static assertion: the SHIPPED V112 SQL text contains NO INSERT of a 'primary'
    //         coverage row. This cannot be satisfied by intention, only by the code being right ──

    @Test
    @DisplayName("(j) AC9: the shipped V112 SQL text contains no INSERT of relationship_type='primary' into school_discover_area_coverage")
    void shippedV112Sql_containsNoPrimaryInsert() {
        String sql = loadClasspathSql(V112_CLASSPATH_LOCATION);

        // Case-insensitive and schema-optional: an unqualified `insert into
        // school_discover_area_coverage` or a lowercased statement must still be caught — the
        // guard's entire value is that it "cannot be satisfied by intention", so it must not be
        // evadable by casing or omitting the `public.` schema qualifier.
        Pattern insertStart = Pattern.compile(
                "insert\\s+into\\s+(?:public\\.)?school_discover_area_coverage",
                Pattern.CASE_INSENSITIVE);
        Matcher matcher = insertStart.matcher(sql);

        int insertCount = 0;
        while (matcher.find()) {
            insertCount++;
            int from = matcher.end();
            int to = sql.indexOf("GET DIAGNOSTICS", from);
            assertThat(to)
                    .as("expected each INSERT INTO school_discover_area_coverage statement to be followed by a GET DIAGNOSTICS ROW_COUNT read")
                    .isGreaterThan(from);
            String statementText = sql.substring(from, to);

            assertThat(statementText)
                    .as("V112 must never hand-write a 'primary' coverage row — V110's trigger owns that")
                    .doesNotContain("'primary'");
        }

        assertThat(insertCount)
                .as("V112 must contain exactly one INSERT into school_discover_area_coverage (the STEP B `contained` insert)")
                .isEqualTo(1);
    }

    // ── (k) MECHANISM 3 — an INDEPENDENT PostGIS geometric formulation agrees with V112's
    //         BETWEEN-based containment predicate. A bug in one formulation cannot hide in the
    //         other ─────────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("(k) MECHANISM 3: an independent PostGIS ST_CoveredBy/ST_MakeEnvelope formulation agrees with V112's BETWEEN predicate")
    void independentPostGisFormulation_agreesWithMigrationsContainedRows() {
        applyV112Migration();

        // Independent formulation: ST_CoveredBy(point, envelope), computed fresh by the test —
        // never by reading V112's own SQL — over the SAME schools/areas rows, scoped to the 10
        // curated areas and restricted to areas that differ from each school's (post-migration)
        // own canonical area (mirroring the "own canonical area" exclusion, computed independently).
        //
        // ST_CoveredBy, not ST_Within: ST_Within is STRICTLY INTERIOR — a point exactly on the
        // envelope's edge returns false. V112's own predicate is `lat BETWEEN min_lat AND max_lat
        // AND lon BETWEEN min_lon AND max_lon`, which is INCLUSIVE of the boundary. ST_CoveredBy
        // is PostGIS's boundary-inclusive counterpart to ST_Within, so it is the formulation that
        // actually agrees with BETWEEN on edge cases — using ST_Within here would make this
        // cross-check false-FAIL on a correct migration the moment any school sits exactly on a
        // curated bbox edge.
        List<Map<String, Object>> stCoveredByPairs = jdbc.queryForList("""
                SELECT s.udise_code, a.area_key
                FROM public.schools s
                JOIN public.areas a
                  ON ST_CoveredBy(
                       ST_SetSRID(ST_MakePoint(s.longitude, s.latitude), 4326),
                       ST_MakeEnvelope(a.min_lon, a.min_lat, a.max_lon, a.max_lat, 4326)
                     )
                WHERE a.min_lat <> a.max_lat
                  AND a.min_lon <> a.max_lon
                  AND a.area_key = ANY (ARRAY[?,?,?,?,?,?,?,?,?,?])
                  AND s.udise_code = ANY (ARRAY[?,?,?,?,?,?,?,?,?,?,?,?,?])
                  AND a.area_key IS DISTINCT FROM s.area_key
                ORDER BY s.udise_code, a.area_key
                """,
                WHITEFIELD, KORAMANGALA, INDIRANAGAR, HEBBAL, HSR_LAYOUT,
                SARJAPUR_ROAD, YELAHANKA, JAYANAGAR, MARATHAHALLI, ELECTRONIC_CITY,
                BS_ELECTRONIC_CITY, CARMEL_GARDEN, NARAYANA_ELEC_CITY_PH1, ORCHIDS_HARALUR,
                VIVEKANANDA_SAHAKAR_NAGAR, POORNAPRAJNA, NARAYANA_RK_LAYOUT, NPS_BANASHANKARI,
                RMS_INTERNATIONAL, EUROSCHOOL_WHITEFIELD, NARAYANA_KR_PURAM, NARAYANA_BELLANDUR,
                ORCHIDS_SARJAPUR_ROAD);

        List<Map<String, Object>> actualContainedRows = jdbc.queryForList("""
                SELECT s.udise_code, c.curated_area_key AS area_key
                FROM school_discover_area_coverage c
                JOIN public.schools s ON s.id = c.school_id
                WHERE c.relationship_type = 'contained'
                  AND c.curated_area_key = ANY (ARRAY[?,?,?,?,?,?,?,?,?,?])
                  AND s.udise_code = ANY (ARRAY[?,?,?,?,?,?,?,?,?,?,?,?,?])
                ORDER BY s.udise_code, area_key
                """,
                WHITEFIELD, KORAMANGALA, INDIRANAGAR, HEBBAL, HSR_LAYOUT,
                SARJAPUR_ROAD, YELAHANKA, JAYANAGAR, MARATHAHALLI, ELECTRONIC_CITY,
                BS_ELECTRONIC_CITY, CARMEL_GARDEN, NARAYANA_ELEC_CITY_PH1, ORCHIDS_HARALUR,
                VIVEKANANDA_SAHAKAR_NAGAR, POORNAPRAJNA, NARAYANA_RK_LAYOUT, NPS_BANASHANKARI,
                RMS_INTERNATIONAL, EUROSCHOOL_WHITEFIELD, NARAYANA_KR_PURAM, NARAYANA_BELLANDUR,
                ORCHIDS_SARJAPUR_ROAD);

        assertThat(actualContainedRows)
                .as("the independent PostGIS ST_CoveredBy formulation must agree exactly with V112's own BETWEEN-derived `contained` rows")
                .isEqualTo(stCoveredByPairs);

        assertThat(stCoveredByPairs)
                .as("sanity: the independent formulation must find the 3 expected pairs (non-vacuity)")
                .hasSize(3);
    }

    // ── (l) AC13 — the by-area LIST and the badge COUNT must agree, per curated area, after V112.
    //         Code review cycle 2 finding: #1828 migrated only the badge onto the coverage
    //         table; V112 breaks the schools.area_key<->coverage mirror on purpose, so a list
    //         still reading schools.area_key directly would silently disagree with the badge for
    //         exactly the 2 areas V112 touches. Checked here for Indiranagar and Sarjapur Road —
    //         the two curated areas where coverage now diverges from canonical locality.
    //
    //         Non-vacuity: reverting SchoolRepository#findByAreaKey to the old bare
    //         `WHERE s.area_key = :areaKey` predicate makes this test FAIL for both areas —
    //         Poornaprajna's contained-coverage row keeps it in the Indiranagar badge but a
    //         bare area_key match no longer lists it (it moved to New Tippasandra); Sarjapur
    //         Road's badge additionally counts Narayana/Bellandur's contained row and ORCHIDS
    //         Haralur's contained row, neither of which a bare area_key match would list.

    @Test
    @DisplayName("(l) AC13: findByAreaKey list size agrees with the badge's coverage-based count for Indiranagar and Sarjapur Road")
    void byAreaListSize_agreesWithBadgeCoverageCount_forIndiranagarAndSarjapurRoad() {
        applyV112Migration();

        assertListSizeMatchesBadgeCount(INDIRANAGAR);
        assertListSizeMatchesBadgeCount(SARJAPUR_ROAD);
    }

    private void assertListSizeMatchesBadgeCount(String areaKey) {
        int badgeCount = badgeCoverageCount(areaKey);
        List<SchoolRepository.AreaSchoolProjection> listResults =
                schoolRepository.findByAreaKey(areaKey, List.of(), List.of(), 0, 1000);

        assertThat(listResults)
                .as("findByAreaKey('%s') list size must equal the badge's coverage-based count (AC13)", areaKey)
                .hasSize(badgeCount);
    }

    /**
     * Independently computes the area badge's coverage-based school_count for {@code areaKey} —
     * the SAME positive relationship_type IN-list as
     * {@code AreaSummaryService.SCHOOL_COUNT_SUBQUERY}, written here as raw SQL (never by calling
     * {@code AreaSummaryService}, which is out of scope to touch in this change) so this is a
     * genuine independent cross-check, not a restatement of {@code SchoolRepository}'s own query.
     */
    private int badgeCoverageCount(String areaKey) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM school_discover_area_coverage c "
                        + "WHERE c.curated_area_key = ? "
                        + "AND c.relationship_type IN ('contained','primary','reviewed_override')",
                Integer.class, areaKey);
        return count == null ? 0 : count;
    }

    private int totalCoverageRowCount() {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM school_discover_area_coverage c "
                        + "JOIN schools s ON s.id = c.school_id "
                        + "WHERE s.udise_code = ANY (ARRAY[?,?,?,?,?,?,?,?,?,?,?,?,?])",
                Integer.class,
                BS_ELECTRONIC_CITY, CARMEL_GARDEN, NARAYANA_ELEC_CITY_PH1, ORCHIDS_HARALUR,
                VIVEKANANDA_SAHAKAR_NAGAR, POORNAPRAJNA, NARAYANA_RK_LAYOUT, NPS_BANASHANKARI,
                RMS_INTERNATIONAL, EUROSCHOOL_WHITEFIELD, NARAYANA_KR_PURAM, NARAYANA_BELLANDUR,
                ORCHIDS_SARJAPUR_ROAD);
        return count == null ? 0 : count;
    }
}

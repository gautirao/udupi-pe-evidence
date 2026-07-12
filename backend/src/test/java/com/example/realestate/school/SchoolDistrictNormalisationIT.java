package com.example.realestate.school;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.ConnectionCallback;
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
import java.sql.SQLWarning;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regression IT for issue #1830 — {@code V111__extend_school_district_normalisation.sql}.
 *
 * <p>Harness copied from {@link SchoolAreaKeyCorrectionIT} / {@link SchoolCoverageBackfillIT}:
 * {@code @DataJpaTest} + real {@code postgis/postgis:15-3.4}, full Flyway chain through V111.
 *
 * <h2>Two distinct code paths, two distinct test styles</h2>
 * V111's corrected district-normalisation CASE is exercised by TWO independent production code
 * paths, and this class deliberately tests both:
 * <ul>
 *   <li><b>The LIVE {@code trg_school_area_key} trigger</b> (V80's trigger, redefined by V111's
 *       {@code CREATE OR REPLACE FUNCTION assign_school_area_key()}) — this is the ONLY
 *       mechanism that will ever fix #1830 in production: the UDISE seed is inserted long AFTER
 *       V111 has already been applied by Flyway, so V111's own one-shot backfill {@code UPDATE}
 *       never sees those rows. Tests exercising this path insert with the trigger left ENABLED
 *       (the default) and assert on the result of the INSERT itself — no call to
 *       {@link #applyV111Migration()} is needed or made.</li>
 *   <li><b>V111's one-shot backfill {@code UPDATE ... WHERE area_key IS NULL}</b> — relevant only
 *       for rows that predate V111 (already in the table with area_key NULL when this migration
 *       runs). To exercise this path in isolation from the trigger, those tests explicitly call
 *       {@link #disableAreaKeyTriggerForBackfillIsolation()} before inserting fixtures (so
 *       area_key stays NULL on insert instead of being auto-assigned), then load and execute the
 *       REAL {@code V111__extend_school_district_normalisation.sql} file fresh from the
 *       classpath (not a Java mirror of its CASE literals) and assert on the result.
 * </ul>
 * Trigger-disable is opt-in per test (not a blanket {@code @BeforeEach}) precisely so the
 * live-trigger path — the actual production fix — has real, uninhibited test coverage.
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
class SchoolDistrictNormalisationIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbc;

    private static final String V111_CLASSPATH_LOCATION =
            "db/migration/V111__extend_school_district_normalisation.sql";
    private static final String AREA_KEY_TRIGGER = "trg_school_area_key";

    // Real Bengaluru Jayanagar area centroid (V71 seed): lat=12.9250, lon=77.5938, district='Bengaluru'.
    // Test schools sit ~110m away — well within Jayanagar's 10km radius and closer than any other
    // configured 'bengaluru'-district area, so a match (when the CASE normalises) is deterministic.
    private static final double NEAR_JAYANAGAR_LAT = 12.9260;
    private static final double NEAR_JAYANAGAR_LON = 77.5948;
    private static final String JAYANAGAR_AREA = "IN|KA|Bengaluru|Jayanagar";

    /**
     * Opt-in only (called explicitly by backfill-focused tests) — deliberately NOT a
     * {@code @BeforeEach}. See class javadoc: blanket-disabling this trigger for every test
     * would silence the ONE code path (the live trigger) that fixes #1830 in production.
     */
    private void disableAreaKeyTriggerForBackfillIsolation() {
        jdbc.execute("ALTER TABLE public.schools DISABLE TRIGGER " + AREA_KEY_TRIGGER);
    }

    private void applyV111Migration() {
        jdbc.execute(loadV111Sql());
    }

    /** Same as {@link #applyV111Migration()} but captures any RAISE WARNING emitted by the DO block. */
    private SQLWarning applyV111MigrationCapturingWarnings() {
        String sql = loadV111Sql();
        return jdbc.execute((ConnectionCallback<SQLWarning>) conn -> {
            try (Statement stmt = conn.createStatement()) {
                stmt.execute(sql);
                return stmt.getWarnings();
            }
        });
    }

    private String loadV111Sql() {
        try {
            return StreamUtils.copyToString(
                    new ClassPathResource(V111_CLASSPATH_LOCATION).getInputStream(),
                    StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(
                    "Failed to load " + V111_CLASSPATH_LOCATION + " for regression test", e);
        }
    }

    /** Inserts with trg_school_area_key left at its current state (enabled unless disabled above). */
    private UUID insertSchool(String udiseCode, String name, double lat, double lon, String district) {
        jdbc.update(
                "INSERT INTO public.schools (udise_code, name, board_type, latitude, longitude, district, address) "
                        + "VALUES (?, ?, 'CBSE', ?, ?, ?, 'Test fixture')",
                udiseCode, name, lat, lon, district);
        return jdbc.queryForObject(
                "SELECT id FROM public.schools WHERE udise_code = ?", UUID.class, udiseCode);
    }

    private String areaKeyOf(String udiseCode) {
        return jdbc.queryForObject(
                "SELECT area_key FROM public.schools WHERE udise_code = ?", String.class, udiseCode);
    }

    private void forceAreaKey(String udiseCode, String areaKey) {
        jdbc.update("UPDATE public.schools SET area_key = ? WHERE udise_code = ?", areaKey, udiseCode);
    }

    private int coverageRowCount(UUID schoolId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM school_discover_area_coverage WHERE school_id = ?",
                Integer.class, schoolId);
        return count == null ? 0 : count;
    }

    private List<Map<String, Object>> coverageRows(UUID schoolId, String areaKey) {
        return jdbc.queryForList(
                "SELECT relationship_type, source FROM school_discover_area_coverage "
                        + "WHERE school_id = ? AND curated_area_key = ?",
                schoolId, areaKey);
    }

    // ══════════════════════════════════════════════════════════════════════════════════════
    // LIVE TRIGGER PATH — the actual production fix for #1830. Trigger stays ENABLED (no
    // disableAreaKeyTriggerForBackfillIsolation() call, no applyV111Migration() call): these
    // tests assert on the direct result of a plain INSERT, exercising exactly what happens the
    // moment the UDISE seed is ever loaded against an already-migrated database.
    // ══════════════════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("LIVE TRIGGER: BENGALURU U SOUTH gets area_key assigned on INSERT, "
            + "and V110's AFTER INSERT trigger creates exactly one primary coverage row")
    void bengaluruUSouth_liveTrigger_assignsAreaKeyOnInsert_andCreatesPrimaryCoverageRow() {
        UUID school = insertSchool("UDISE-USOUTH-LIVE-1", "UDISE Test School U South Live",
                NEAR_JAYANAGAR_LAT, NEAR_JAYANAGAR_LON, "BENGALURU U SOUTH");

        assertThat(areaKeyOf("UDISE-USOUTH-LIVE-1"))
                .as("the LIVE trg_school_area_key trigger (V111's redefined function body) must "
                        + "normalise 'BENGALURU U SOUTH' and assign area_key on INSERT — no backfill involved")
                .isEqualTo(JAYANAGAR_AREA);

        List<Map<String, Object>> rows = coverageRows(school, JAYANAGAR_AREA);
        assertThat(rows)
                .as("V110's AFTER INSERT trigger fires unconditionally on every INSERT and must "
                        + "produce exactly one coverage row for the school's newly-assigned area")
                .hasSize(1);
        assertThat(rows.get(0).get("relationship_type")).isEqualTo("primary");
        assertThat(coverageRowCount(school))
                .as("must not create more than one coverage row (uq_school_coverage_one_primary)")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("LIVE TRIGGER: BENGALURU U NORTH gets area_key assigned on INSERT, "
            + "and V110's AFTER INSERT trigger creates exactly one primary coverage row")
    void bengaluruUNorth_liveTrigger_assignsAreaKeyOnInsert_andCreatesPrimaryCoverageRow() {
        UUID school = insertSchool("UDISE-UNORTH-LIVE-1", "UDISE Test School U North Live",
                NEAR_JAYANAGAR_LAT, NEAR_JAYANAGAR_LON, "BENGALURU U NORTH");

        assertThat(areaKeyOf("UDISE-UNORTH-LIVE-1"))
                .as("the LIVE trg_school_area_key trigger (V111's redefined function body) must "
                        + "normalise 'BENGALURU U NORTH' and assign area_key on INSERT — no backfill involved")
                .isEqualTo(JAYANAGAR_AREA);

        List<Map<String, Object>> rows = coverageRows(school, JAYANAGAR_AREA);
        assertThat(rows)
                .as("V110's AFTER INSERT trigger fires unconditionally on every INSERT and must "
                        + "produce exactly one coverage row for the school's newly-assigned area")
                .hasSize(1);
        assertThat(rows.get(0).get("relationship_type")).isEqualTo("primary");
        assertThat(coverageRowCount(school))
                .as("must not create more than one coverage row (uq_school_coverage_one_primary)")
                .isEqualTo(1);
    }

    // ══════════════════════════════════════════════════════════════════════════════════════
    // BACKFILL PATH — V111's one-shot UPDATE ... WHERE area_key IS NULL. Relevant only for rows
    // that predate V111. Trigger explicitly disabled per-test to isolate this statement from
    // the live trigger above (otherwise the trigger would assign area_key on INSERT and the
    // backfill UPDATE's own WHERE area_key IS NULL clause would have nothing left to do).
    // ══════════════════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("pre-backfill sanity: BENGALURU U SOUTH school sits at area_key = NULL before V111's backfill runs")
    void preBackfillState_isNull_beforeMigrationApplied() {
        disableAreaKeyTriggerForBackfillIsolation();
        insertSchool("UDISE-BAN-USOUTH-01", "UDISE Test School U South",
                NEAR_JAYANAGAR_LAT, NEAR_JAYANAGAR_LON, "BENGALURU U SOUTH");

        assertThat(areaKeyOf("UDISE-BAN-USOUTH-01")).isNull();
    }

    @Test
    @DisplayName("BACKFILL: BENGALURU U SOUTH normalises to bengaluru and gets assigned the nearest area")
    void bengaluruUSouth_normalises_andGetsAssignedNearestArea() {
        disableAreaKeyTriggerForBackfillIsolation();
        insertSchool("UDISE-BAN-USOUTH-02", "UDISE Test School U South 2",
                NEAR_JAYANAGAR_LAT, NEAR_JAYANAGAR_LON, "BENGALURU U SOUTH");

        applyV111Migration();

        assertThat(areaKeyOf("UDISE-BAN-USOUTH-02")).isEqualTo(JAYANAGAR_AREA);
    }

    @Test
    @DisplayName("BACKFILL: BENGALURU U NORTH normalises to bengaluru and gets assigned the nearest area")
    void bengaluruUNorth_normalises_andGetsAssignedNearestArea() {
        disableAreaKeyTriggerForBackfillIsolation();
        insertSchool("UDISE-BAN-UNORTH-01", "UDISE Test School U North",
                NEAR_JAYANAGAR_LAT, NEAR_JAYANAGAR_LON, "BENGALURU U NORTH");

        applyV111Migration();

        assertThat(areaKeyOf("UDISE-BAN-UNORTH-01")).isEqualTo(JAYANAGAR_AREA);
    }

    // ── BENGALURU RURAL deliberately remains distinct: no configured area shares that bucket ──

    @Test
    @DisplayName("BENGALURU RURAL is left un-normalised (distinct district) and stays NULL after backfill")
    void bengaluruRural_staysDistinct_andRemainsNull() {
        disableAreaKeyTriggerForBackfillIsolation();
        insertSchool("UDISE-BAN-RURAL-01", "UDISE Test School Rural",
                NEAR_JAYANAGAR_LAT, NEAR_JAYANAGAR_LON, "BENGALURU RURAL");

        applyV111Migration();

        assertThat(areaKeyOf("UDISE-BAN-RURAL-01"))
                .as("Bengaluru Rural is a genuinely different district; V111 must not conflate it with bengaluru")
                .isNull();
    }

    // ── Existing non-null area_keys are never re-derived by the backfill ──────────────────────

    @Test
    @DisplayName("an existing non-null area_key is left untouched by the V111 backfill (WHERE area_key IS NULL only)")
    void existingNonNullAreaKey_isNotReDerived() {
        disableAreaKeyTriggerForBackfillIsolation();
        insertSchool("UDISE-BAN-EXIST-01", "UDISE Existing Area Key School",
                NEAR_JAYANAGAR_LAT, NEAR_JAYANAGAR_LON, "BENGALURU U SOUTH");
        // Simulate an already-correct (or operator-overridden) row: force a DIFFERENT area_key
        // than what the backfill would compute, bypassing the disabled trigger.
        forceAreaKey("UDISE-BAN-EXIST-01", "IN|KA|Bengaluru|Whitefield");

        applyV111Migration();

        assertThat(areaKeyOf("UDISE-BAN-EXIST-01"))
                .as("V111's backfill is scoped to area_key IS NULL only — must never overwrite an existing value")
                .isEqualTo("IN|KA|Bengaluru|Whitefield");
    }

    // ── Coverage convergence (#1828 interaction): the backfill UPDATE fires V110's AFTER UPDATE
    //     trigger, creating a 'primary' coverage row for the newly-backfilled school ───────────

    @Test
    @DisplayName("backfilled schools converge into school_discover_area_coverage via V110's AFTER UPDATE trigger")
    void backfilledSchool_convergesIntoCoverageTable() {
        disableAreaKeyTriggerForBackfillIsolation();
        UUID school = insertSchool("UDISE-BAN-COV-01", "UDISE Coverage Convergence School",
                NEAR_JAYANAGAR_LAT, NEAR_JAYANAGAR_LON, "BENGALURU U SOUTH");
        assertThat(coverageRowCount(school)).as("no coverage row while area_key is NULL").isZero();

        applyV111Migration();

        assertThat(areaKeyOf("UDISE-BAN-COV-01")).isEqualTo(JAYANAGAR_AREA);

        List<Map<String, Object>> rows = coverageRows(school, JAYANAGAR_AREA);
        assertThat(rows)
                .as("V110's AFTER UPDATE trigger must fire for the area_key NULL -> non-NULL transition")
                .hasSize(1);
        assertThat(rows.get(0).get("relationship_type")).isEqualTo("primary");

        // uq_school_coverage_one_primary is never at risk: exactly one coverage row for this school.
        assertThat(coverageRowCount(school))
                .as("backfill must not create more than one coverage row (uq_school_coverage_one_primary)")
                .isEqualTo(1);
    }

    // ── Fail-loud guard: BENGALURU RURAL (a bucket with zero configured areas) is surfaced ────

    @Test
    @DisplayName("fail-loud guard: a district bucket with zero configured areas (e.g. BENGALURU RURAL) raises a warning")
    void districtBucketWithZeroAreas_raisesWarning() {
        disableAreaKeyTriggerForBackfillIsolation();
        insertSchool("UDISE-BAN-RURAL-02", "UDISE Test School Rural Warning",
                NEAR_JAYANAGAR_LAT, NEAR_JAYANAGAR_LON, "BENGALURU RURAL");

        SQLWarning warning = applyV111MigrationCapturingWarnings();

        assertThat((Object) warning)
                .as("V111's fail-loud guard must surface a RAISE WARNING for a district bucket with no area coverage")
                .isNotNull();
        assertThat(collectMessages(warning)).anyMatch(msg -> msg.contains("V111 fail-loud guard"));
    }

    // ── Fail-loud guard must NOT fire for the legal "matched a bucket, but nothing within 10km" case ──

    @Test
    @DisplayName("fail-loud guard does not fire for a school whose bucket has areas but none within 10km (legal)")
    void legalTooFarCase_doesNotTriggerGuardWarning() {
        disableAreaKeyTriggerForBackfillIsolation();
        // Real Bengaluru district, but ~150km north of every configured Bengaluru area — legal
        // "no area within 10km", must not be reported as a normalisation defect.
        insertSchool("UDISE-BAN-FAR-01", "UDISE Test School Far Away", 14.2000, 77.6000, "Bengaluru");

        SQLWarning warning = applyV111MigrationCapturingWarnings();

        // 'Bengaluru' has real configured areas (V71/V106), so the guard's HAVING NOT EXISTS
        // clause must exclude this bucket entirely — the raw district string must never appear
        // in the guard's warning text, regardless of how far any individual school sits.
        assertThat(collectMessages(warning))
                .as("a school merely outside the 10km cap (bucket has real areas) must not be reported as unnormalised")
                .noneMatch(msg -> msg.contains("district='Bengaluru'"));
        assertThat(areaKeyOf("UDISE-BAN-FAR-01"))
                .as("legal 10km-cap NULL — the school's district DOES normalise, it is simply too far")
                .isNull();
    }

    // ── Idempotency: re-applying V111 twice is a no-op on the second pass ─────────────────────

    @Test
    @DisplayName("re-applying V111 twice is idempotent")
    void reapplyingV111_isIdempotent() {
        disableAreaKeyTriggerForBackfillIsolation();
        UUID school = insertSchool("UDISE-BAN-IDEMP-01", "UDISE Idempotence School",
                NEAR_JAYANAGAR_LAT, NEAR_JAYANAGAR_LON, "BENGALURU U NORTH");

        applyV111Migration();
        String afterFirst = areaKeyOf("UDISE-BAN-IDEMP-01");
        int coverageAfterFirst = coverageRowCount(school);

        applyV111Migration();
        String afterSecond = areaKeyOf("UDISE-BAN-IDEMP-01");
        int coverageAfterSecond = coverageRowCount(school);

        assertThat(afterFirst).isEqualTo(JAYANAGAR_AREA);
        assertThat(afterSecond).isEqualTo(JAYANAGAR_AREA);
        assertThat(coverageAfterFirst)
                .as("first apply must produce exactly one coverage row")
                .isEqualTo(1);
        assertThat(coverageAfterSecond)
                .as("re-applying V111 must not duplicate or disturb the coverage row (uq_school_coverage_one_primary)")
                .isEqualTo(coverageAfterFirst);
    }

    private static List<String> collectMessages(SQLWarning warning) {
        List<String> messages = new java.util.ArrayList<>();
        SQLWarning current = warning;
        while (current != null) {
            messages.add(current.getMessage());
            current = current.getNextWarning();
        }
        return messages;
    }
}

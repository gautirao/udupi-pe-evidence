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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Regression IT for issue #1828 (PR1) — {@code V110__school_discover_area_coverage.sql}.
 *
 * <p>Harness copied from {@link SchoolAreaKeyCorrectionIT} / {@link SchoolAreaMatchingIntegrationTest}:
 * {@code @DataJpaTest} + real {@code postgis/postgis:15-3.4}, full Flyway chain (V110 included),
 * no DB replacement.
 *
 * <h2>Why this test disables the coverage triggers before seeding fixtures</h2>
 * By the time {@code @BeforeEach} runs, Flyway has already applied V110's own backfill INSERT
 * against whatever schools existed at migration time (the ~20 V58-seeded legacy rows), AND the
 * {@code trg_sync_school_discover_area_coverage_insert} / {@code _update} AFTER triggers this
 * migration creates are already live — meaning a plain {@code INSERT} into {@code schools} would
 * have the TRIGGER (not the migration's backfill statement) create the coverage row, proving
 * nothing about the backfill itself. To genuinely exercise {@code V110}'s backfill
 * {@code INSERT ... SELECT} in isolation, each test disables BOTH coverage triggers and V80
 * ({@code trg_school_area_key} — so a dummy lat/lon required by the NOT NULL columns can never
 * recompute/overwrite the area_key set directly by the fixture; V80's own matching algorithm
 * already has dedicated coverage in {@code SchoolAreaKeyTriggerTest} /
 * {@code SchoolAreaMatchingIntegrationTest} / {@code SchoolAreaKeyCorrectionIT}), inserts fixture
 * schools with a directly-set {@code area_key}, and then loads and executes the REAL
 * {@code V110__school_discover_area_coverage.sql} file fresh from the classpath (not a Java
 * mirror of its SQL) — which idempotently re-creates the table/indexes (no-ops), runs the
 * backfill INSERT for the newly-visible NULL-coverage rows, re-validates the identity guard
 * across every area, and finally re-creates (hence re-enables) both coverage triggers for the
 * trigger-focused scenarios later in the same test. V80 remains disabled for the rest of the
 * test except one dedicated regression test, which re-enables it explicitly (see test (i)).
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
class SchoolCoverageBackfillIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbc;

    private static final String V110_CLASSPATH_LOCATION =
            "db/migration/V110__school_discover_area_coverage.sql";

    // ── Real, already-seeded area_keys spanning all 4 configured cities (confirmed present
    // by SchoolAreaKeyCorrectionIT / SchoolAreaMatchingIntegrationTest usage of the same keys) ──
    private static final String BENGALURU_AREA = "IN|KA|Bengaluru|Jayanagar";
    private static final String MANGALORE_AREA = "IN|KA|Mangalore|Balmatta";
    private static final String UDUPI_AREA = "IN|KA|Udupi|Brahmavar";
    private static final String KUNDAPUR_AREA = "IN|KA|Udupi|Kundapura";

    // Split into two triggers by the BLOCKING-1 fix (code review cycle 2): an unconditional
    // AFTER INSERT trigger, and an AFTER UPDATE trigger scoped by a WHEN clause on the VALUE
    // of area_key changing (OLD.area_key IS DISTINCT FROM NEW.area_key) rather than on
    // Postgres's "UPDATE OF area_key" SET-list-based firing rule — see V110 section 4.
    private static final String COVERAGE_TRIGGER_INSERT = "trg_sync_school_discover_area_coverage_insert";
    private static final String COVERAGE_TRIGGER_UPDATE = "trg_sync_school_discover_area_coverage_update";
    private static final String AREA_KEY_TRIGGER = "trg_school_area_key";

    // Known-good V71-seeded Udupi-district area/coordinate pairs, reused verbatim from
    // SchoolAreaKeyTriggerTest (proven to make V80's nearest-configured-area matching resolve
    // deterministically) — used only by the lat/lon-triggered regression test below, which
    // (unlike every other test in this class) needs V80 genuinely live and computing area_key.
    private static final String MANIPAL_AREA = "IN|KA|Udupi|Manipal";
    private static final String UDUPI_TOWN_AREA = "IN|KA|Udupi|Udupi";
    private static final double MANIPAL_LAT = 13.3511;
    private static final double MANIPAL_LON = 74.7871;
    private static final double UDUPI_TOWN_LAT = 13.3420;
    private static final double UDUPI_TOWN_LON = 74.7430;

    // schools.latitude/longitude are NOT NULL; a dummy value is required on every INSERT.
    // V80 (trg_school_area_key) is disabled for the whole class so this dummy value can never
    // cause it to silently recompute/overwrite the area_key values these tests set explicitly
    // — V80's own matching algorithm is already covered by SchoolAreaKeyTriggerTest /
    // SchoolAreaMatchingIntegrationTest / SchoolAreaKeyCorrectionIT; this class isolates and
    // tests ONLY the NEW school_discover_area_coverage backfill + AFTER trigger.
    private static final double DUMMY_LAT = 12.9716;
    private static final double DUMMY_LON = 77.5946;

    @BeforeEach
    void disableTriggersForBackfillIsolation() {
        // See class javadoc: disabling the coverage trigger is what lets the tests below
        // exercise V110's own backfill INSERT rather than the trigger's INSERT-path upsert.
        // Disabling V80 too means the dummy lat/lon required by the NOT NULL columns can never
        // recompute/overwrite the area_key values set explicitly below.
        jdbc.execute("ALTER TABLE public.schools DISABLE TRIGGER " + COVERAGE_TRIGGER_INSERT);
        jdbc.execute("ALTER TABLE public.schools DISABLE TRIGGER " + COVERAGE_TRIGGER_UPDATE);
        jdbc.execute("ALTER TABLE public.schools DISABLE TRIGGER " + AREA_KEY_TRIGGER);
    }

    private void applyV110Migration() {
        String sql;
        try {
            sql = StreamUtils.copyToString(
                    new ClassPathResource(V110_CLASSPATH_LOCATION).getInputStream(),
                    StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(
                    "Failed to load " + V110_CLASSPATH_LOCATION + " for regression test", e);
        }
        jdbc.execute(sql);
    }

    /**
     * Inserts a school with a direct area_key. Latitude/longitude are NOT NULL columns so a
     * dummy value is always supplied; since V80 (trg_school_area_key) is disabled for this
     * whole test class (see {@link #disableTriggersForBackfillIsolation()}), the dummy value
     * can never recompute or overwrite the area_key set explicitly here.
     */
    private UUID insertSchoolWithAreaKey(String udiseCode, String name, String areaKey) {
        if (udiseCode == null) {
            jdbc.update(
                    "INSERT INTO public.schools (name, board_type, latitude, longitude, district, area_key, source) "
                            + "VALUES (?, 'CBSE', ?, ?, 'Test fixture district', ?, 'TEST_FIXTURE')",
                    name, DUMMY_LAT, DUMMY_LON, areaKey);
        } else {
            jdbc.update(
                    "INSERT INTO public.schools (udise_code, name, board_type, latitude, longitude, district, area_key, source) "
                            + "VALUES (?, ?, 'CBSE', ?, ?, 'Test fixture district', ?, 'TEST_FIXTURE')",
                    udiseCode, name, DUMMY_LAT, DUMMY_LON, areaKey);
        }
        return jdbc.queryForObject(
                "SELECT id FROM public.schools WHERE name = ?", UUID.class, name);
    }

    /** Inserts a school with NO area_key (stays NULL, no coverage row should be created). */
    private UUID insertSchoolWithNullAreaKey(String name) {
        jdbc.update(
                "INSERT INTO public.schools (name, board_type, latitude, longitude, district, source) "
                        + "VALUES (?, 'CBSE', ?, ?, 'Test fixture district', 'TEST_FIXTURE')",
                name, DUMMY_LAT, DUMMY_LON);
        return jdbc.queryForObject(
                "SELECT id FROM public.schools WHERE name = ?", UUID.class, name);
    }

    private int coverageRowCount(UUID schoolId) {
        Integer count = jdbc.queryForObject(
                "SELECT COUNT(*) FROM school_discover_area_coverage WHERE school_id = ?",
                Integer.class, schoolId);
        return count == null ? 0 : count;
    }

    private Map<String, Object> coverageRow(UUID schoolId, String areaKey) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "SELECT relationship_type, source FROM school_discover_area_coverage "
                        + "WHERE school_id = ? AND curated_area_key = ?",
                schoolId, areaKey);
        assertThat(rows).as("coverage row for school=%s area=%s", schoolId, areaKey).hasSize(1);
        return rows.get(0);
    }

    /** Asserts, for EVERY area, the legacy string-equality count equals the coverage count. */
    private void assertCountIdentityAcrossAllAreas() {
        List<Map<String, Object>> mismatches = jdbc.queryForList("""
                SELECT a.area_key,
                       (SELECT COUNT(*) FROM schools s WHERE s.area_key = a.area_key) AS old_count,
                       (SELECT COUNT(*) FROM school_discover_area_coverage c
                        WHERE c.curated_area_key = a.area_key
                          AND c.relationship_type IN ('contained','primary','reviewed_override')) AS new_count
                FROM areas a
                WHERE (SELECT COUNT(*) FROM schools s WHERE s.area_key = a.area_key)
                      <> (SELECT COUNT(*) FROM school_discover_area_coverage c
                          WHERE c.curated_area_key = a.area_key
                            AND c.relationship_type IN ('contained','primary','reviewed_override'))
                """);
        assertThat(mismatches)
                .as("every area's old-style and coverage-derived school counts must agree")
                .isEmpty();
    }

    // ── (a) Count identity holds for the migration-seeded state, and still holds after adding
    //         fixture schools across multiple cities and re-applying V110's backfill ───────────

    @Test
    @DisplayName("(a) count identity holds for the migrated state and after a fresh backfill of new schools")
    void countIdentity_holdsForSeedStateAndAfterFreshBackfill() {
        assertCountIdentityAcrossAllAreas();

        insertSchoolWithAreaKey("COV-BAN-01", "Coverage Test Bengaluru", BENGALURU_AREA);
        insertSchoolWithAreaKey("COV-MAN-01", "Coverage Test Mangalore", MANGALORE_AREA);
        insertSchoolWithAreaKey(null, "Coverage Test Udupi (no udise)", UDUPI_AREA);
        insertSchoolWithAreaKey("COV-KUN-01", "Coverage Test Kundapur", KUNDAPUR_AREA);

        applyV110Migration();

        assertCountIdentityAcrossAllAreas();
    }

    // ── (b) One primary row per school across ALL cities, incl. a school with NULL udise_code ──

    @Test
    @DisplayName("(b) backfill creates exactly one primary row per school across all cities, incl. NULL udise_code")
    void backfill_createsOnePrimaryRow_perSchool_acrossAllCities_inclNullUdise() {
        UUID bengaluru = insertSchoolWithAreaKey("COV-BAN-02", "Coverage Bengaluru 2", BENGALURU_AREA);
        UUID mangalore = insertSchoolWithAreaKey("COV-MAN-02", "Coverage Mangalore 2", MANGALORE_AREA);
        UUID udupiNoUdise = insertSchoolWithAreaKey(null, "Coverage Udupi No Udise", UDUPI_AREA);
        UUID kundapur = insertSchoolWithAreaKey("COV-KUN-02", "Coverage Kundapur 2", KUNDAPUR_AREA);

        applyV110Migration();

        for (UUID id : List.of(bengaluru, mangalore, udupiNoUdise, kundapur)) {
            assertThat(coverageRowCount(id)).as("school %s", id).isEqualTo(1);
        }
        assertThat(coverageRow(bengaluru, BENGALURU_AREA).get("relationship_type")).isEqualTo("primary");
        assertThat(coverageRow(bengaluru, BENGALURU_AREA).get("source")).isEqualTo("area_key_mirror");
        assertThat(coverageRow(udupiNoUdise, UDUPI_AREA).get("relationship_type")).isEqualTo("primary");
    }

    // ── (c) School with area_key IS NULL gets NO coverage row and contributes 0 ───────────────

    @Test
    @DisplayName("(c) a school with NULL area_key gets no coverage row")
    void schoolWithNullAreaKey_getsNoCoverageRow() {
        UUID unassigned = insertSchoolWithNullAreaKey("Coverage Unassigned School");

        applyV110Migration();

        assertThat(coverageRowCount(unassigned)).isZero();
    }

    // ── (d) Idempotence — re-running V110 twice yields the same result ───────────────────────

    @Test
    @DisplayName("(d) re-applying V110 is idempotent")
    void reapplyingV110_isIdempotent() {
        UUID school = insertSchoolWithAreaKey("COV-BAN-03", "Coverage Idempotence School", BENGALURU_AREA);

        applyV110Migration();
        int countAfterFirst = coverageRowCount(school);

        applyV110Migration();
        int countAfterSecond = coverageRowCount(school);

        assertThat(countAfterFirst).isEqualTo(1);
        assertThat(countAfterSecond).isEqualTo(1);
        assertThat(coverageRow(school, BENGALURU_AREA).get("relationship_type")).isEqualTo("primary");
    }

    // ── (e) A->B->A area_key cycle does not violate the single-primary index ─────────────────

    @Test
    @DisplayName("(e) an A->B->A area_key cycle leaves exactly one primary row, back at A")
    void areaKeyCycle_aToBToA_leavesExactlyOnePrimaryRow() {
        UUID school = insertSchoolWithAreaKey("COV-CYC-01", "Coverage Cycle School", BENGALURU_AREA);
        applyV110Migration(); // backfill + re-enable trigger

        // A -> B: bare area_key UPDATE (does not retouch lat/lon/district, does not refire V80).
        jdbc.update("UPDATE public.schools SET area_key = ? WHERE id = ?", MANGALORE_AREA, school);
        assertThat(coverageRowCount(school)).as("after A->B").isEqualTo(1);
        assertThat(coverageRow(school, MANGALORE_AREA).get("relationship_type")).isEqualTo("primary");

        // B -> A: the return trip a naive delete-then-insert gets wrong.
        jdbc.update("UPDATE public.schools SET area_key = ? WHERE id = ?", BENGALURU_AREA, school);
        assertThat(coverageRowCount(school)).as("after B->A").isEqualTo(1);
        assertThat(coverageRow(school, BENGALURU_AREA).get("relationship_type")).isEqualTo("primary");
    }

    // ── (f) A->B->A where a reviewed_override on A SURVIVES the round trip ───────────────────

    @Test
    @DisplayName("(f) a reviewed_override on A survives an A->B->A area_key round trip")
    void reviewedOverrideOnA_survives_areaKeyRoundTrip() {
        UUID school = insertSchoolWithAreaKey("COV-CYC-02", "Coverage Cycle Override School", BENGALURU_AREA);
        applyV110Migration();

        // Simulate a PR2-style human ruling recorded on area A alongside the machine primary.
        jdbc.update(
                "INSERT INTO school_discover_area_coverage (school_id, curated_area_key, relationship_type, source) "
                        + "VALUES (?, ?, 'reviewed_override', 'manual_review')",
                school, UDUPI_AREA);

        // A -> B -> A.
        jdbc.update("UPDATE public.schools SET area_key = ? WHERE id = ?", MANGALORE_AREA, school);
        jdbc.update("UPDATE public.schools SET area_key = ? WHERE id = ?", BENGALURU_AREA, school);

        Map<String, Object> overrideRow = coverageRow(school, UDUPI_AREA);
        assertThat(overrideRow.get("relationship_type"))
                .as("reviewed_override on a DIFFERENT area than the primary must survive untouched")
                .isEqualTo("reviewed_override");
        assertThat(overrideRow.get("source")).isEqualTo("manual_review");
        assertThat(coverageRow(school, BENGALURU_AREA).get("relationship_type")).isEqualTo("primary");
    }

    // ── (g) GUARD — a direct area_key write's ON CONFLICT upsert never downgrades a
    //         reviewed_override that already sits on the target area ─────────────────────────
    //
    // (Renamed from the pre-fix version of this test, which set `area_key = area_key` in an
    // UPDATE's SET list purely to force-fire the old "AFTER UPDATE OF area_key" trigger. That
    // no longer means anything: after the BLOCKING-1 fix, the coverage trigger fires on the
    // VALUE of area_key changing, not on the caller's SET list, so a no-op self-assignment no
    // longer fires anything. This test now exercises the ON CONFLICT guard the way it is
    // actually reachable — a genuine area_key move onto an area that already carries a human
    // reviewed_override for this school.)

    @Test
    @DisplayName("(g) GUARD: a direct area_key write's ON CONFLICT upsert never downgrades a reviewed_override")
    void directAreaKeyWrite_onConflictGuard_neverDowngradesReviewedOverride() {
        UUID school = insertSchoolWithAreaKey("COV-REG-01", "Coverage Regression School", BENGALURU_AREA);
        applyV110Migration();

        // A human ruling (PR2, #1829) already sits on a DIFFERENT area than the current primary.
        jdbc.update(
                "INSERT INTO school_discover_area_coverage (school_id, curated_area_key, relationship_type, source) "
                        + "VALUES (?, ?, 'reviewed_override', 'manual_review')",
                school, MANGALORE_AREA);

        // A direct area_key write moves the school's primary onto the SAME area as the
        // override. The trigger's INSERT for (school, MANGALORE_AREA) collides with the
        // existing override row; the ON CONFLICT guard must leave it untouched rather than
        // downgrading it back to a machine 'primary'.
        jdbc.update("UPDATE public.schools SET area_key = ? WHERE id = ?", MANGALORE_AREA, school);

        Map<String, Object> row = coverageRow(school, MANGALORE_AREA);
        assertThat(row.get("relationship_type"))
                .as("a reviewed_override must NEVER be silently downgraded back to primary by a direct area_key write")
                .isEqualTo("reviewed_override");
        assertThat(row.get("source")).isEqualTo("manual_review");

        // The stale primary row at the OLD area (BENGALURU_AREA) is cleaned up by the
        // trigger's delete-stale-primary step; no new row is inserted at MANGALORE_AREA
        // (the ON CONFLICT guard blocked the upsert) — exactly one row remains overall.
        assertThat(coverageRowCount(school))
                .as("old BENGALURU_AREA primary removed, no duplicate row added at MANGALORE_AREA")
                .isEqualTo(1);
    }

    // ── (h) GUARD — the naive nearest-of-313 wholesale reassignment path is not reintroduced ──

    @Test
    @DisplayName("(h) GUARD: backfill is a pure mirror — it never reassigns schools.area_key itself")
    void backfill_neverReassigns_schoolsAreaKey_itself() {
        UUID bengaluru = insertSchoolWithAreaKey("COV-GRD-01", "Coverage Guard Bengaluru", BENGALURU_AREA);
        UUID kundapur = insertSchoolWithAreaKey("COV-GRD-02", "Coverage Guard Kundapur", KUNDAPUR_AREA);

        applyV110Migration();

        String bengaluruAreaKeyAfter = jdbc.queryForObject(
                "SELECT area_key FROM schools WHERE id = ?", String.class, bengaluru);
        String kundapurAreaKeyAfter = jdbc.queryForObject(
                "SELECT area_key FROM schools WHERE id = ?", String.class, kundapur);

        assertThat(bengaluruAreaKeyAfter)
                .as("V110 must never rewrite schools.area_key — only mirror it into coverage")
                .isEqualTo(BENGALURU_AREA);
        assertThat(kundapurAreaKeyAfter)
                .as("V110 must never rewrite schools.area_key — only mirror it into coverage")
                .isEqualTo(KUNDAPUR_AREA);

        // The coverage row's curated_area_key must be the EXACT school area_key value — a pure
        // mirror, never an independently-computed nearest-of-313 value.
        assertThat(coverageRow(bengaluru, BENGALURU_AREA)).isNotEmpty();
        assertThat(coverageRow(kundapur, KUNDAPUR_AREA)).isNotEmpty();
    }

    // ── (i) REGRESSION (BLOCKING-1) — a bare lat/lon UPDATE that V80 turns into an area_key
    //         move must keep coverage convergent, even though the UPDATE's own SET list never
    //         names area_key ───────────────────────────────────────────────────────────────────
    //
    // Unlike every other test in this class, this test needs BOTH real triggers genuinely
    // live — V80 (trg_school_area_key) computing area_key from lat/lon, AND the coverage
    // triggers observing whatever V80 leaves behind. It re-enables both for itself only.

    @Test
    @DisplayName("(i) REGRESSION: a bare lat/lon UPDATE that V80 turns into an area_key move keeps coverage convergent")
    void latLonTriggeredAreaKeyMove_keepsCoverageConvergent() {
        jdbc.execute("ALTER TABLE public.schools ENABLE TRIGGER " + AREA_KEY_TRIGGER);
        jdbc.execute("ALTER TABLE public.schools ENABLE TRIGGER " + COVERAGE_TRIGGER_INSERT);
        jdbc.execute("ALTER TABLE public.schools ENABLE TRIGGER " + COVERAGE_TRIGGER_UPDATE);

        // Insert near Manipal (district=Udupi, no area_key supplied) — V80 fires on INSERT
        // unconditionally and assigns MANIPAL_AREA; the now-live coverage trigger mirrors it.
        jdbc.update(
                "INSERT INTO public.schools (name, board_type, latitude, longitude, district, source) "
                        + "VALUES (?, 'CBSE', ?, ?, 'Udupi', 'TEST_FIXTURE')",
                "LatLon Move Regression School", MANIPAL_LAT, MANIPAL_LON);
        UUID school = jdbc.queryForObject(
                "SELECT id FROM public.schools WHERE name = ?", UUID.class, "LatLon Move Regression School");

        assertThat(jdbc.queryForObject("SELECT area_key FROM schools WHERE id = ?", String.class, school))
                .as("sanity: V80 must assign MANIPAL_AREA on insert")
                .isEqualTo(MANIPAL_AREA);
        assertThat(coverageRow(school, MANIPAL_AREA).get("relationship_type")).isEqualTo("primary");

        // The dominant real-world path: a bare lat/lon UPDATE whose own SET list never names
        // area_key. V80 (BEFORE trigger) recomputes area_key to UDUPI_TOWN_AREA internally.
        jdbc.update(
                "UPDATE public.schools SET latitude = ?, longitude = ? WHERE id = ?",
                UDUPI_TOWN_LAT, UDUPI_TOWN_LON, school);

        assertThat(jdbc.queryForObject("SELECT area_key FROM schools WHERE id = ?", String.class, school))
                .as("sanity: V80 must have actually moved area_key for this regression to mean anything")
                .isEqualTo(UDUPI_TOWN_AREA);

        assertThat(coverageRowCount(school))
                .as("the stale MANIPAL_AREA primary row must be replaced, not left dangling")
                .isEqualTo(1);
        assertThat(coverageRow(school, UDUPI_TOWN_AREA).get("relationship_type"))
                .as("coverage must follow schools.area_key even though the UPDATE's own SET list never named area_key")
                .isEqualTo("primary");
    }

    // ── (j) UPGRADE — a machine 'nearby' row sitting on the school's OWN new canonical area
    //         is upgraded to 'primary' (source='trigger', distance_meters reset to NULL),
    //         not left as a silently-uncounted 'nearby' row ────────────────────────────────
    //
    // Unreachable in PR1's own data (PR1 only ever emits 'primary' rows via
    // area_key_mirror), but this is exactly the state #1829 (PR2) will start generating —
    // so the ON CONFLICT guard's UPGRADE branch (V110 section 4, the WHERE clause on the
    // trigger's ON CONFLICT DO UPDATE) must not rot untested. 'nearby' is never in the
    // counted relationship_type set (idx_school_coverage_counted / AreaSummaryService's
    // SCHOOL_COUNT_SUBQUERY), so leaving it alone here would silently drop the school from
    // its own canonical area's badge count.

    @Test
    @DisplayName("(j) UPGRADE: a machine 'nearby' coverage row on the school's own new canonical area is upgraded to 'primary'")
    void nearbyCoverageRow_onOwnCanonicalArea_isUpgradedToPrimary_onAreaKeyMove() {
        UUID school = insertSchoolWithAreaKey("COV-UPG-01", "Coverage Upgrade Nearby School", BENGALURU_AREA);
        applyV110Migration(); // backfill 'primary' at BENGALURU_AREA + re-enable both coverage triggers

        // A synthetic PR2-style (#1829) machine 'nearby' row already sits at MANGALORE_AREA
        // — the school is merely near it, not primarily located there. distance_meters is
        // required non-NULL by the table's CHECK constraint for 'nearby' rows.
        jdbc.update(
                "INSERT INTO school_discover_area_coverage "
                        + "(school_id, curated_area_key, relationship_type, distance_meters, source) "
                        + "VALUES (?, ?, 'nearby', 850.5, 'proximity_backfill')",
                school, MANGALORE_AREA);

        // The school's canonical area MOVES to MANGALORE_AREA — the same area the stale
        // 'nearby' row already names. The trigger's ON CONFLICT DO UPDATE must UPGRADE that
        // row to 'primary' rather than leave it as an uncounted 'nearby' row.
        jdbc.update("UPDATE public.schools SET area_key = ? WHERE id = ?", MANGALORE_AREA, school);

        Map<String, Object> row = jdbc.queryForMap(
                "SELECT relationship_type, source, distance_meters FROM school_discover_area_coverage "
                        + "WHERE school_id = ? AND curated_area_key = ?",
                school, MANGALORE_AREA);
        assertThat(row.get("relationship_type"))
                .as("a machine 'nearby' row on the school's own new canonical area must be upgraded to 'primary', "
                        + "not left as an uncounted 'nearby' row")
                .isEqualTo("primary");
        assertThat(row.get("source"))
                .as("the upgrade must be attributed to the trigger, not the stale proximity_backfill source")
                .isEqualTo("trigger");
        assertThat(row.get("distance_meters"))
                .as("distance_meters only has meaning for 'nearby'; it must be reset to NULL on upgrade to 'primary'")
                .isNull();

        assertThat(coverageRowCount(school))
                .as("the stale BENGALURU_AREA primary is removed; exactly one row (the upgraded primary) remains")
                .isEqualTo(1);
    }

    // ── (k) UPGRADE — same guard, 'contained' branch ──────────────────────────────────────

    @Test
    @DisplayName("(k) UPGRADE: a machine 'contained' coverage row on the school's own new canonical area is upgraded to 'primary'")
    void containedCoverageRow_onOwnCanonicalArea_isUpgradedToPrimary_onAreaKeyMove() {
        UUID school = insertSchoolWithAreaKey("COV-UPG-02", "Coverage Upgrade Contained School", BENGALURU_AREA);
        applyV110Migration();

        // A synthetic PR2-style (#1829) machine 'contained' row already sits at
        // KUNDAPUR_AREA (distance_meters is NULL — the CHECK only requires it for 'nearby').
        jdbc.update(
                "INSERT INTO school_discover_area_coverage "
                        + "(school_id, curated_area_key, relationship_type, source) "
                        + "VALUES (?, ?, 'contained', 'proximity_backfill')",
                school, KUNDAPUR_AREA);

        jdbc.update("UPDATE public.schools SET area_key = ? WHERE id = ?", KUNDAPUR_AREA, school);

        Map<String, Object> row = coverageRow(school, KUNDAPUR_AREA);
        assertThat(row.get("relationship_type"))
                .as("a machine 'contained' row on the school's own new canonical area must be upgraded to 'primary'")
                .isEqualTo("primary");
        assertThat(row.get("source"))
                .as("the upgrade must be attributed to the trigger, not the stale proximity_backfill source")
                .isEqualTo("trigger");

        assertThat(coverageRowCount(school))
                .as("the stale BENGALURU_AREA primary is removed; exactly one row (the upgraded primary) remains")
                .isEqualTo(1);
    }

    // ── Sanity: uq_school_coverage_one_primary genuinely rejects a second primary ─────────────

    @Test
    @DisplayName("sanity: uq_school_coverage_one_primary rejects a second primary row for the same school")
    void uniquePrimaryIndex_rejectsSecondPrimaryRow() {
        UUID school = insertSchoolWithAreaKey("COV-SAN-01", "Coverage Sanity School", BENGALURU_AREA);
        applyV110Migration();

        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO school_discover_area_coverage "
                        + "(school_id, curated_area_key, relationship_type, source) "
                        + "VALUES (?, ?, 'primary', 'manual_review')",
                school, KUNDAPUR_AREA))
                .as("a second 'primary' row for the same school must violate uq_school_coverage_one_primary")
                .hasMessageContaining("uq_school_coverage_one_primary");
    }
}

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

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regression IT for issue #1737 — corrective migration
 * {@code V109__correct_bengaluru_school_area_keys.sql}.
 *
 * <p>Harness copied from {@link com.example.realestate.discover.AreaSummaryServiceAgriIT} /
 * {@link SchoolAreaMatchingIntegrationTest}: {@code @DataJpaTest} + real
 * {@code postgis/postgis:15-3.4}, full Flyway chain through V109, no DB replacement.
 *
 * <h2>Why this test does NOT simply insert-and-assert (the vacuous-test trap)</h2>
 * By the time this test's {@code @BeforeEach} runs, Flyway has already applied V109 against an
 * EMPTY {@code schools} table (this fixture's rows do not exist yet), so V109 itself was a
 * documented no-op at migration time — it has not been "exercised" by merely booting the
 * container. Worse: on this fully-migrated (V106-present) database, a plain {@code INSERT} of
 * these schools would make the V80 trigger compute the FINE-grained area immediately, so an
 * assertion like "Frank -> JP Nagar" would PASS even if V109 did not exist or were deleted —
 * proving nothing about the migration under test.
 *
 * <p>To make this a genuine regression test, each test explicitly re-creates the COARSE
 * PRE-FIX state that the real bug report describes (a hosted DB seeded before V106 existed):
 * insert the row (trigger computes the fine value), then issue a BARE {@code UPDATE
 * schools SET area_key = '<coarse>' WHERE udise_code = ...} — bare because the V80 trigger's
 * {@code OF} clause covers only {@code (latitude, longitude, district)}, so this update does
 * NOT re-fire it and the coarse value sticks. Only THEN is the ACTUAL
 * {@code V109__correct_bengaluru_school_area_keys.sql} file, loaded fresh from the classpath
 * and executed verbatim (not a Java mirror of its literals), applied and asserted. V109's
 * deliverable is a table of hardcoded literals with no algorithm, so a Java-literal mirror
 * would only ever prove a copy matches itself; executing the shipped file is what actually
 * exercises the artefact under test. A run with the correction SQL removed/commented out
 * would fail every corrected-school assertion in this class.
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
class SchoolAreaKeyCorrectionIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbc;

    // ── The 5 udise_codes V109 corrects, and their known coarse (V71-only) pre-fix values ──
    private static final String FRANK = "APIFY-BAN-JAYA-01";
    private static final String BRIGADE_JP_NAGAR = "APIFY-BAN-JAYA-05";
    private static final String ORCHIDS_HESARAGHATTA = "APIFY-BAN-HEBB-01";
    private static final String NARAYANA_KAGGADASAPURA = "APIFY-BAN-MARA-04";
    private static final String ORCHIDS_PANATHUR = "APIFY-BAN-MARA-06";

    // ── 2 NEEDS-MANUAL control schools that must stay UNCHANGED (proves no wholesale re-derive) ──
    private static final String EUROSCHOOL_WHITEFIELD = "APIFY-BAN-MARA-01";
    private static final String NARAYANA_BELLANDUR = "APIFY-BAN-SARJ-01";

    // ── Mangalore control (different district; must never be touched by a Bengaluru fix) ──
    private static final String MANGALORE_CONTROL = "APIFY-MAN-TEST-01";

    private static final String COARSE_JAYANAGAR = "IN|KA|Bengaluru|Jayanagar";
    private static final String COARSE_HEBBAL = "IN|KA|Bengaluru|Hebbal";
    private static final String COARSE_MARATHAHALLI = "IN|KA|Bengaluru|Marathahalli";
    private static final String COARSE_SARJAPUR_ROAD = "IN|KA|Bengaluru|Sarjapur Road";
    private static final String MANGALORE_STORED = "IN|KA|Mangalore|Balmatta";

    private static final String FINE_JP_NAGAR = "IN|KA|Bengaluru|JP Nagar";
    private static final String FINE_MALLASANDRA = "IN|KA|Bengaluru|Mallasandra";
    private static final String FINE_KAGGADASAPURA = "IN|KA|Bengaluru|Kaggadasapura";
    private static final String FINE_PANATHUR = "IN|KA|Bengaluru|Panathur";

    private static final String V109_CLASSPATH_LOCATION =
            "db/migration/V109__correct_bengaluru_school_area_keys.sql";

    // ── #1829 (AC7) — the truthful destination locality Narayana/Bellandur moves to under V112,
    //    and the curated area it retains `contained` coverage of ────────────────────────────────
    private static final String V112_CLASSPATH_LOCATION =
            "db/migration/V112__resolve_thirteen_ambiguous_school_attributions.sql";
    private static final String FINE_BELLANDUR = "IN|KA|Bengaluru|Bellandur";

    /**
     * Loads the REAL {@code V109__correct_bengaluru_school_area_keys.sql} file from the
     * classpath and executes it verbatim against the fixture data, AFTER the coarse pre-fix
     * state has been forced below. This deliberately does NOT re-derive or mirror V109's
     * literals in Java: V109's deliverable IS a table of hardcoded (udise_code, before, after)
     * literals with no surrounding algorithm, so a Java copy of those literals would only ever
     * prove a copy matches itself — a typo'd literal in the shipped file (e.g. targeting
     * "Mallasandra, Hosakote" instead of "Mallasandra") would still pass a mirrored assertion.
     * Executing the shipped file is what actually exercises the artefact under test: the single
     * {@code DO $$} block containing the STEP 0 precondition guard and the STEP 1 correction loop.
     *
     * <p>PgJDBC's simple query protocol correctly parses the dollar-quoted {@code DO $$ ... $$}
     * body as one statement in a {@link JdbcTemplate#execute(String)} call, so the semicolons
     * inside it are not mistaken for statement separators.
     */
    private void applyV109Correction() {
        String sql;
        try {
            sql = StreamUtils.copyToString(
                    new ClassPathResource(V109_CLASSPATH_LOCATION).getInputStream(),
                    StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException(
                    "Failed to load " + V109_CLASSPATH_LOCATION + " for regression test", e);
        }
        jdbc.execute(sql);
    }

    /**
     * Loads and executes the REAL {@code V112__resolve_thirteen_ambiguous_school_attributions.sql}
     * file from the classpath (#1829, AC7) — never a Java mirror. Used ONLY by
     * {@link #needsManualSchool_bellandur_isMovedByV112_whileWhitefieldRemainsUnchangedControl()}
     * to prove that the "NEEDS-MANUAL... unchanged" control this class has asserted since #1737
     * is updated DELIBERATELY, not silently, once a later PR (#1829) makes a reviewed ruling on
     * that exact school.
     */
    private void applyV112Correction() {
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

    @BeforeEach
    void seedBengaluruAndMangaloreFixtureRows() {
        // Plain INSERT: the V80 trigger fires and computes the FINE-grained (V106-present)
        // area for each row immediately. This is deliberately NOT the assertion state.
        insertSchool(FRANK, "Frank Public School", 12.9052810, 77.5799615, "Bengaluru");
        insertSchool(BRIGADE_JP_NAGAR, "The Brigade School @ J P Nagar", 12.8922999, 77.5853675, "Bengaluru");
        insertSchool(ORCHIDS_HESARAGHATTA, "Orchids The International School - Hesaraghatta Road", 13.0597741, 77.5071341, "Bengaluru");
        insertSchool(NARAYANA_KAGGADASAPURA, "Narayana eTechno (CBSE) School - Kaggadasapura", 12.9794585, 77.6774887, "Bengaluru");
        insertSchool(ORCHIDS_PANATHUR, "ORCHIDS The International School, Panathur", 12.9375874, 77.7015855, "Bengaluru");
        insertSchool(EUROSCHOOL_WHITEFIELD, "EuroSchool Whitefield", 12.9856361, 77.7137513, "Bengaluru");
        insertSchool(NARAYANA_BELLANDUR, "Narayana eTechno (CBSE) School - Bellandur", 12.9267614, 77.6733670, "Bengaluru");
        insertSchool(MANGALORE_CONTROL, "Carmel School (CBSE) - test control", 12.8572315, 74.8368034, "Mangalore");

        // ── PRE-FIX SETUP (deliberately constructs the coarse, hosted-like state) ──────────
        // Bare UPDATE of area_key alone: the V80 trigger's `OF (latitude, longitude, district)`
        // clause means this does NOT re-fire it, so the coarse value sticks — exactly as it
        // would on a hosted DB seeded before V106 existed. Without this block, every school
        // above would already sit at its FINE value from the INSERT trigger, and the
        // corrected-school assertions below would pass with or without V109 (vacuous).
        forceAreaKey(FRANK, COARSE_JAYANAGAR);
        forceAreaKey(BRIGADE_JP_NAGAR, COARSE_JAYANAGAR);
        forceAreaKey(ORCHIDS_HESARAGHATTA, COARSE_HEBBAL);
        forceAreaKey(NARAYANA_KAGGADASAPURA, COARSE_MARATHAHALLI);
        forceAreaKey(ORCHIDS_PANATHUR, COARSE_MARATHAHALLI);
        forceAreaKey(EUROSCHOOL_WHITEFIELD, COARSE_MARATHAHALLI);
        forceAreaKey(NARAYANA_BELLANDUR, COARSE_SARJAPUR_ROAD);
        forceAreaKey(MANGALORE_CONTROL, MANGALORE_STORED);
        // ── end PRE-FIX SETUP ───────────────────────────────────────────────────────────────
    }

    private void insertSchool(String udiseCode, String name, double lat, double lon, String district) {
        jdbc.update(
                "INSERT INTO public.schools (udise_code, name, board_type, latitude, longitude, district, address) "
                        + "VALUES (?, ?, 'CBSE', ?, ?, ?, 'Test fixture')",
                udiseCode, name, lat, lon, district);
    }

    /** Bare area_key UPDATE — does not touch latitude/longitude/district, so V80 does not fire. */
    private void forceAreaKey(String udiseCode, String areaKey) {
        jdbc.update("UPDATE public.schools SET area_key = ? WHERE udise_code = ?", areaKey, udiseCode);
    }

    private String areaKeyOf(String udiseCode) {
        return jdbc.queryForObject(
                "SELECT area_key FROM public.schools WHERE udise_code = ?", String.class, udiseCode);
    }

    // ── Sanity: the pre-fix setup actually landed the coarse value (proves the test CAN fail) ──

    @Test
    @DisplayName("pre-fix setup: Frank Public School sits at the coarse Jayanagar value before correction")
    void preFixState_isCoarse_beforeCorrectionApplied() {
        assertThat(areaKeyOf(FRANK)).isEqualTo(COARSE_JAYANAGAR);
        assertThat(areaKeyOf(ORCHIDS_HESARAGHATTA)).isEqualTo(COARSE_HEBBAL);
    }

    // ── AC1: the user's example, both JP Nagar schools ────────────────────────────────────────

    @Test
    @DisplayName("AC1: Frank Public School and The Brigade School @ J P Nagar move Jayanagar -> JP Nagar")
    void ac1_jpNagarSchools_correctedFromJayanagar() {
        applyV109Correction();

        assertThat(areaKeyOf(FRANK)).isEqualTo(FINE_JP_NAGAR);
        assertThat(areaKeyOf(BRIGADE_JP_NAGAR)).isEqualTo(FINE_JP_NAGAR);
    }

    @Test
    @DisplayName("the remaining 3 corrections: Hebbal->Mallasandra, Marathahalli->Kaggadasapura/Panathur")
    void remainingThreeCorrections_moveToTheirNewAreas() {
        applyV109Correction();

        assertThat(areaKeyOf(ORCHIDS_HESARAGHATTA)).isEqualTo(FINE_MALLASANDRA);
        assertThat(areaKeyOf(NARAYANA_KAGGADASAPURA)).isEqualTo(FINE_KAGGADASAPURA);
        assertThat(areaKeyOf(ORCHIDS_PANATHUR)).isEqualTo(FINE_PANATHUR);
    }

    // ── AC3 (assert_both_directions): NEEDS-MANUAL schools are left UNCHANGED BY V109 ─────────

    @Test
    @DisplayName("AC3: EuroSchool Whitefield and Narayana eTechno Bellandur are UNCHANGED by V109 (not in its correction set)")
    void needsManualSchools_remainUnchanged_byV109_provingNoWholesaleRederivation() {
        applyV109Correction();

        assertThat(areaKeyOf(EUROSCHOOL_WHITEFIELD))
                .as("EuroSchool Whitefield must stay Marathahalli — not in V109's correction set")
                .isEqualTo(COARSE_MARATHAHALLI);
        assertThat(areaKeyOf(NARAYANA_BELLANDUR))
                .as("Narayana eTechno Bellandur must stay Sarjapur Road — not in V109's correction set")
                .isEqualTo(COARSE_SARJAPUR_ROAD);
    }

    // ── #1829 AC7 — the control updated DELIBERATELY, not silently ────────────────────────────
    // Narayana eTechno Bellandur was an "unchanged NEEDS-MANUAL control" for V109 (proving #1737
    // did not silently re-derive everything). #1829 (V112) makes a reviewed HIGH_CONFIDENCE
    // ruling on this EXACT school — address and geometry agree on Bellandur — so this control is
    // updated deliberately to assert the truthful post-V112 end state, while EuroSchool
    // Whitefield remains completely untouched by EITHER migration, preserving the original guard.

    @Test
    @DisplayName("#1829 AC7: after V112, Narayana/Bellandur moves to its truthful locality and keeps `contained` coverage of Sarjapur Road; EuroSchool Whitefield remains an unchanged control")
    void needsManualSchool_bellandur_isMovedByV112_whileWhitefieldRemainsUnchangedControl() {
        applyV109Correction();
        applyV112Correction();

        assertThat(areaKeyOf(NARAYANA_BELLANDUR))
                .as("Narayana/Bellandur's canonical locality is corrected by V112 (#1829, HIGH_CONFIDENCE)")
                .isEqualTo(FINE_BELLANDUR);

        List<Map<String, Object>> containedAtSarjapurRoad = jdbc.queryForList(
                "SELECT c.relationship_type, c.source FROM school_discover_area_coverage c "
                        + "JOIN public.schools s ON s.id = c.school_id "
                        + "WHERE s.udise_code = ? AND c.curated_area_key = ?",
                NARAYANA_BELLANDUR, COARSE_SARJAPUR_ROAD);
        assertThat(containedAtSarjapurRoad)
                .as("Narayana/Bellandur must retain `contained` coverage of Sarjapur Road — truthful locality without losing the curated badge")
                .hasSize(1);
        assertThat(containedAtSarjapurRoad.get(0).get("relationship_type")).isEqualTo("contained");

        assertThat(areaKeyOf(EUROSCHOOL_WHITEFIELD))
                .as("EuroSchool Whitefield remains completely unchanged by V109 AND V112 — the guard still stands")
                .isEqualTo(COARSE_MARATHAHALLI);
    }

    // ── Mangalore schools are untouched by a Bengaluru-scoped correction ──────────────────────

    @Test
    @DisplayName("Mangalore schools are untouched by the Bengaluru-scoped V109 correction")
    void mangaloreSchools_areUntouched() {
        applyV109Correction();

        assertThat(areaKeyOf(MANGALORE_CONTROL)).isEqualTo(MANGALORE_STORED);
    }

    // ── Idempotency: re-applying the correction is a no-op (convergent, IS DISTINCT FROM guard) ──

    @Test
    @DisplayName("re-applying the correction twice is idempotent")
    void correction_isIdempotent_onRepeatedApplication() {
        applyV109Correction();
        applyV109Correction();

        assertThat(areaKeyOf(FRANK)).isEqualTo(FINE_JP_NAGAR);
        assertThat(areaKeyOf(EUROSCHOOL_WHITEFIELD)).isEqualTo(COARSE_MARATHAHALLI);
    }

    // ── Convergence: correction also no-ops when the row ALREADY holds the fine value ────────
    // (simulates a freshly-seeded local DB where the V80 trigger computed the fine value at
    // INSERT and never needed correcting in the first place — see [environment_divergence]).

    @Test
    @DisplayName("convergence: a school already at its fine target value is left alone (no-op)")
    void correction_isConvergent_whenAlreadyAtFineValue() {
        forceAreaKey(FRANK, FINE_JP_NAGAR);

        applyV109Correction();

        assertThat(areaKeyOf(FRANK)).isEqualTo(FINE_JP_NAGAR);
    }
}

package com.example.realestate.listing;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Testcontainers real-DB proof for issue #2575: a production data-correction script
 * ({@code fix-office-subtype-2575.sql}) that reclassifies five specific commercial-building
 * listings to commercial/OFFICE. The script is validated today only by a static {@code pglast}
 * parser that treats every {@code DO $$ ... $$} body as an opaque string — and those bodies
 * carry ALL of the script's state gates and post-condition assertions. This test is the only
 * thing that ever actually executes them.
 *
 * <p><b>Why no wrapping transaction.</b> The script has its own explicit {@code BEGIN;}/
 * {@code COMMIT;} and depends on a {@code DEFERRABLE INITIALLY DEFERRED} constraint trigger that
 * fires only at COMMIT. A {@code @DataJpaTest} default (rollback-per-test) transaction would
 * mean the script's COMMIT — and the trigger — never really happen, making any post-condition
 * check here vacuous. This class therefore disables Spring's test-managed transaction
 * ({@code @Transactional(propagation = Propagation.NOT_SUPPORTED)}) so each script execution runs
 * against the container on its own, real, autocommitting connection, and cleans up its own
 * fixture rows explicitly in {@code @BeforeEach} rather than relying on rollback.
 *
 * <p><b>Why the script is executed as one batch, not statement-by-statement.</b> A naive
 * split-on-{@code ;} (as used by {@code CommercialSubtypeProjectionBackfill2520IT}'s
 * {@code applyShippedBackfill()}) would shred every {@code DO $$ ... $$} block, because their
 * bodies are full of semicolons. {@link #runShippedScript(Path)} instead hands the whole file to
 * a plain {@code java.sql.Statement}, which pgjdbc sends via the simple query protocol — the same
 * protocol {@code psql} uses, which is dollar-quote aware and executes a multi-statement batch,
 * {@code DO} blocks included, as a single unit.
 *
 * <h2>Hazards</h2>
 *
 * <p>Two hazards are specific to this suite and are cross-referenced by name from the arms that
 * defend against them. They share one shape: both would make a test go green while proving
 * nothing, and neither turns anything red when it strikes.
 *
 * <p><b>Hazard 1 — a leaked {@code session_replication_role}.</b> Several arms below deliberately
 * bypass the V135/#2520 constraint triggers with {@code session_replication_role = replica}, to
 * prove that assertions unreachable through normal DML are nonetheless live under the bulk-load,
 * restore and replication-apply paths that routinely set it. If that setting ever escaped its
 * transaction and rode a pooled connection back into the pool, it would silently disarm every
 * trigger-interception arm in this class — and none of them would fail, because bypassing a
 * trigger REMOVES a constraint rather than adding one: the DELETE those arms expect to be
 * rejected would simply succeed, and an arm asserting a rejection would be the only thing that
 * noticed. Every bypass here is therefore scoped with {@code SET LOCAL} inside an explicit
 * non-autocommit transaction, and each such arm ends by proving the reset actually happened —
 * once on the same physical connection before it is released, and once through the pool.
 *
 * <p><b>Hazard 2 — a bypass that silently did not apply.</b> The mirror image. If
 * {@code SET LOCAL session_replication_role = replica} failed to take effect (insufficient
 * privilege, wrong scope, a pooled connection that never saw the SET), the corrupting statement
 * the arm depends on would be rejected by the very trigger it meant to bypass — and a bare thrown
 * exception cannot say whether the bypass or something unrelated was at fault. Each bypass block
 * therefore asserts the affected row count of the forbidden statement, which is what separates
 * "the bypass worked" from "something else went wrong". That assertion is a positive control, not
 * a redundant check.
 *
 * <p>Note that a check running under {@code SET CONSTRAINTS ALL IMMEDIATE} is required wherever a
 * DEFERRABLE INITIALLY DEFERRED trigger must be observed on a connection that will be rolled back
 * rather than committed: a deferred check on such a connection never runs at all, so the assertion
 * would pass unconditionally regardless of the state it claims to be testing.
 */
// Deliberately NOT @Tag("integration"): surefire's <excludedGroups>integration</excludedGroups>
// (pom.xml) is a literal, not a ${property}, so a tagged test would never run from the CLI. The
// surefire <includes> already carries **/*IT.java, so this untagged IT runs in the default suite.
// Same rationale as CommercialSubtypeProjectionBackfill2520IT.
@DataJpaTest
@Testcontainers
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.placeholders.concurrently_keyword="
})
class OfficeSubtypeCorrection2575IT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String FORWARD_SCRIPT_RELATIVE_PATH =
            "../../data/imports/udupi-properties-2304/fix-office-subtype-2575.sql";

    private static final String ROLLBACK_SCRIPT_RELATIVE_PATH =
            "../../data/imports/udupi-properties-2304/fix-office-subtype-2575-rollback.sql";

    private static final String CLEANUP_SCRIPT_RELATIVE_PATH =
            "../../data/imports/udupi-properties-2304/cleanup-audit-2575.sql";

    private static final String[] TARGET_SOURCE_IDS = {
            "M91395690", "Z59660870", "D90432306", "U90462182", "W88736208"
    };

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private DataSource dataSource;

    private List<UUID> targetIds;

    /**
     * Fails loudly when the container is not up.
     *
     * <p>This class deliberately does NOT carry
     * {@code @Testcontainers(disabledWithoutDocker = true)}. That attribute turns an absent or dead
     * Docker daemon into a SKIP, and a skipped test is reported green — indistinguishable from one
     * that ran and passed. This IT is the only thing that ever executes the #2575 correction
     * scripts' {@code DO $$} blocks, and it is the gate that releases a production data correction
     * to its owner, so a silent skip would forfeit the gate rather than fail it.
     *
     * <p>Docker being live on the machine where this was written is a fact about that machine, not
     * about this test — and the test outlives both.
     */
    @BeforeAll
    static void requireContainer() {
        assertThat(postgres.isRunning())
                .as("Docker/Testcontainers must be running: this IT is the ONLY execution of the "
                        + "#2575 correction scripts' DO $$ blocks, so a skip here reports green "
                        + "while proving nothing")
                .isTrue();
    }

    @BeforeEach
    void setUp() {
        targetIds = List.of(
                idFor(TARGET_SOURCE_IDS[0]), idFor(TARGET_SOURCE_IDS[1]), idFor(TARGET_SOURCE_IDS[2]),
                idFor(TARGET_SOURCE_IDS[3]), idFor(TARGET_SOURCE_IDS[4]));

        // No @Transactional rollback here, so explicit cleanup by id is mandatory: writes from a
        // prior run (or a prior failed run) persist in the container between tests. Deleting only
        // property_listings and relying on ON DELETE CASCADE (both lcsd.listing_id and
        // lcbd.listing_id reference it) is deliberate: deleting lcsd/lcbd first, while a prior
        // run's flat property_listings.commercial_subtype = 'OFFICE' still stands, trips the
        // #2520 DEFERRABLE projection-consistency trigger the moment that DELETE's own implicit
        // transaction commits (each JdbcTemplate statement here runs autocommit, one statement
        // per transaction). A single cascading delete removes the row and its children together,
        // so the trigger never observes an inconsistent intermediate state.
        for (UUID id : targetIds) {
            jdbcTemplate.update("DELETE FROM property_listings WHERE id = ?", id);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════════════════════
    // Instrument proof: does a DO $$ block actually execute?
    // ═════════════════════════════════════════════════════════════════════════════════════════

    @Test
    void forwardScript_gate1and2_raisesWhenOnlyFourOfFiveTargetsExist() {
        // Seed only 4 of the 5 targets, each otherwise eligible. If the script's first DO $$
        // block (Gate 1+2: identity + provenance) never ran, this would either silently no-op
        // (idempotent gate WHERE clauses matching nothing) or fail some other, unrelated way. A
        // RAISE EXCEPTION with this exact count proves the DO $$ block executed server-side and
        // its RAISE reached JDBC intact through pgjdbc's dollar-quote-aware parsing.
        for (int i = 0; i < 4; i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }

        assertThatThrownBy(() -> runShippedScript(resolveForwardScript()))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining(
                        "fix-office-subtype-2575: expected 5 rows matching id list + provenance, "
                                + "found 4. Aborting.");
    }

    // ═════════════════════════════════════════════════════════════════════════════════════════
    // Happy path
    // ═════════════════════════════════════════════════════════════════════════════════════════

    @Test
    void forwardScript_correctsAllFiveTargets_andCommits() throws Exception {
        for (int i = 0; i < targetIds.size(); i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }

        runShippedScript(resolveForwardScript());

        for (UUID id : targetIds) {
            String propertyType = jdbcTemplate.queryForObject(
                    "SELECT property_type FROM property_listings WHERE id = ?", String.class, id);
            String flatSubtype = jdbcTemplate.queryForObject(
                    "SELECT commercial_subtype FROM property_listings WHERE id = ?", String.class, id);
            assertThat(propertyType).isEqualTo("commercial");
            assertThat(flatSubtype).isEqualTo("OFFICE");

            Integer lcsdCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM listing_commercial_space_details WHERE listing_id = ?",
                    Integer.class, id);
            String lcsdSubtype = jdbcTemplate.queryForObject(
                    "SELECT commercial_subtype FROM listing_commercial_space_details WHERE listing_id = ?",
                    String.class, id);
            assertThat(lcsdCount).isEqualTo(1);
            assertThat(lcsdSubtype).isEqualTo("OFFICE");

            Integer lcbdCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM listing_commercial_building_details WHERE listing_id = ?",
                    Integer.class, id);
            assertThat(lcbdCount).isEqualTo(0);
        }

        // Confirms the script's own connection closed with autocommit=true (see
        // runShippedScript), so its writes were committed rather than left pending on that
        // session. This query runs through the pooled jdbcTemplate, which may reuse the same
        // physical connection the script used -- it does not by itself prove visibility from a
        // genuinely different connection, only that the script's own session is no longer
        // holding an open, uncommitted transaction over these rows.
        Integer stillOffice = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM property_listings WHERE id = ANY(?) AND commercial_subtype = 'OFFICE'",
                Integer.class, (Object) targetIds.toArray(new UUID[0]));
        assertThat(stillOffice).isEqualTo(5);
    }

    // ═════════════════════════════════════════════════════════════════════════════════════════
    // Planted-violation arms (issue #2575, run 3 part 2 of 3)
    // ═════════════════════════════════════════════════════════════════════════════════════════

    @Test
    void forwardScript_gate3_raisesOnPartialCorruptState() throws Exception {
        // Seed 2 targets already corrected (commercial/OFFICE + matching lcsd row) and 3 targets
        // still in the old (commercial_building/BUILDING) state. old_state_count then lands on 3,
        // which is neither 0 (fully corrected) nor 5 (fully uncorrected) -- Gate 3 must abort
        // rather than let steps 1-4 operate on a mixed, partially-corrected batch.
        for (int i = 0; i < 2; i++) {
            seedAlreadyCorrectedTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }
        for (int i = 2; i < 5; i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }

        assertThatThrownBy(() -> runShippedScript(resolveForwardScript()))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining(
                        "fix-office-subtype-2575: expected 0 (already corrected) or 5 (uncorrected) "
                                + "rows in old state, found 3. Aborting -- partial/corrupt state.");
    }

    @Test
    void forwardScript_gate4_raisesWhenAnLcbdRowIsMissing() {
        for (int i = 0; i < targetIds.size(); i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }
        jdbcTemplate.update(
                "DELETE FROM listing_commercial_building_details WHERE listing_id = ?",
                targetIds.get(0));

        assertThatThrownBy(() -> runShippedScript(resolveForwardScript()))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining(
                        "fix-office-subtype-2575: expected 5 in-scope targets to each have an lcbd "
                                + "row, found 4. Aborting -- rollback cannot safely capture a missing "
                                + "lcbd pre-image.");
    }

    @Test
    void forwardScript_step5_raisesWhenBadFlatColumnsAreIntroducedAfterCorrection() throws Exception {
        for (int i = 0; i < targetIds.size(); i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }
        runShippedScript(resolveForwardScript());

        // Moves one already-corrected target's flat property_type off 'commercial' directly,
        // bypassing the script. 'warehouse' is a legal chk_listing_property_type value (V86) and
        // does not satisfy trigger A's WHEN (NEW.property_type = 'commercial' AND ...), so this
        // single UPDATE commits cleanly. Gate 3's old-state predicate (property_type =
        // 'commercial_building') still matches 0 rows, so steps 1-4 no-op on the re-run and Step
        // 5's direct, ungated bad_flat_count check is the only thing that can catch this.
        jdbcTemplate.update(
                "UPDATE property_listings SET property_type = 'warehouse' WHERE id = ?",
                targetIds.get(0));

        // WHY THESE SHORT FRAGMENTS ARE SAFE HERE, AND WHAT WOULD MAKE THEM UNSAFE.
        // "bad_flat=1" is a SUBSTRING of "bad_flat=10", so as a containment check it would also
        // pass on a count of 10, 15, 100... This form is sound only because all three counters
        // join fix_2575_targets, a set bounded at FIVE rows, so a two-digit count is unreachable
        // and the three fragments together pin the whole triple.
        //
        // That soundness is EXTERNAL to the assertion: it lives in the fixture's size, not in
        // anything written here. If the target set ever grows past nine, these silently stop
        // discriminating -- and the failure is invisible, because a substring match WIDENS as the
        // number grows. Nothing turns red; the arm just stops meaning what it says.
        //
        // Deliberately not "fixed": these arms pass and are already verified. Rewriting an
        // assertion produces a NEW artefact that inherits none of the original's verification,
        // and would owe a fresh mutation proof to show the replacement still discriminates. The
        // durable guard is this comment. Contrast the cleanup-gate arm, whose count is NOT
        // bounded by a five-row join and which therefore anchors its literal through the end of
        // the sentence instead.
        assertThatThrownBy(() -> runShippedScript(resolveForwardScript()))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("bad_flat=1")
                .hasMessageContaining("missing_lcsd=0")
                .hasMessageContaining("stray_lcbd=0");
    }

    @Test
    void forwardScript_step5_raisesWhenALcbdRowIsReCreatedAfterCorrection() throws Exception {
        for (int i = 0; i < targetIds.size(); i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }
        runShippedScript(resolveForwardScript());

        // Re-creates an lcbd row for one already-corrected target. On the re-run, Gate 3's
        // old-state predicate still matches 0 rows (this target is commercial/OFFICE, not
        // commercial_building/BUILDING), so it passes vacuously and steps 1-4 no-op -- step 4's
        // DELETE is scoped to fix_2575_captured, which step 1 leaves empty on this run, so it
        // does not touch the re-created row. This is the script's actual, documented behaviour
        // (see fix-office-subtype-2575.sql step 4's comment): the re-created row survives step 4
        // and is caught only by Step 5's ungated stray_lcbd_count check. This test asserts the
        // raise fires as designed -- it must NOT "fix" the script to clean the row up.
        jdbcTemplate.update(
                "INSERT INTO listing_commercial_building_details "
                        + "(listing_id, number_of_units, total_floors, road_frontage_ft, commercial_usage) "
                        + "VALUES (?, 1, 4, 40, 'RETAIL')",
                targetIds.get(0));

        // Same bounded-set caveat as the sibling arm above, restated here because a reader
        // arriving at THIS arm will not see a note left at that one: "stray_lcbd=1" is a
        // substring of "stray_lcbd=10", so this containment form discriminates only because the
        // counters join fix_2575_targets, a five-row set. The guarantee is the fixture's size,
        // not anything in this assertion. A target set grown past nine would disarm these
        // silently -- no red, because a substring match widens as the number grows.
        assertThatThrownBy(() -> runShippedScript(resolveForwardScript()))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("bad_flat=0")
                .hasMessageContaining("missing_lcsd=0")
                .hasMessageContaining("stray_lcbd=1");
    }

    @Test
    void forwardScript_capturedSet_isPopulatedOnFirstRunAndEmptyOnRerun() throws Exception {
        // Pins the contrast the two sibling arms above only demonstrate separately. fix_2575_captured
        // is a temp table (ON COMMIT DROP, so it cannot be queried directly once a script's
        // transaction ends) that step 1 populates, via RETURNING, with only the rows that run's
        // Gate 3 old-state predicate actually matched; step 4's DELETE of stale lcbd rows is scoped
        // to it. It must be POPULATED on a first run (so step 4 can delete every matched target's
        // lcbd row) and EMPTY on a re-run (so step 4 no-ops and a re-created lcbd row survives to be
        // caught only by Step 5's ungated check). Each half alone still passes its own sibling arm
        // even if the OTHER half regresses -- only asserting both together, in one test, fails when
        // either direction breaks.
        for (int i = 0; i < targetIds.size(); i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }
        runShippedScript(resolveForwardScript());

        // Populated half: step 4 could only have deleted every target's lcbd row by reading a
        // fix_2575_captured populated with all five matched targets from step 1.
        for (UUID id : targetIds) {
            Integer lcbdCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM listing_commercial_building_details WHERE listing_id = ?",
                    Integer.class, id);
            assertThat(lcbdCount).isEqualTo(0);
        }

        // Re-creates an lcbd row for one already-corrected target, exactly as the sibling arm above
        // does.
        jdbcTemplate.update(
                "INSERT INTO listing_commercial_building_details "
                        + "(listing_id, number_of_units, total_floors, road_frontage_ft, commercial_usage) "
                        + "VALUES (?, 1, 4, 40, 'RETAIL')",
                targetIds.get(0));

        // Empty half: on the re-run, Gate 3's old-state predicate matches 0 rows (every target is
        // already commercial/OFFICE, not commercial_building/BUILDING), so step 1 leaves
        // fix_2575_captured empty this time, step 4's scoped DELETE has nothing to touch, and the
        // re-created row survives to trip Step 5's stray_lcbd_count check. Had fix_2575_captured
        // still been populated on this re-run, step 4 would have deleted the re-created row instead
        // and nothing would have raised here. Same bounded-set caveat as the sibling arms above:
        // "stray_lcbd=1" discriminates only because all three counters join fix_2575_targets, a
        // five-row set.
        assertThatThrownBy(() -> runShippedScript(resolveForwardScript()))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("bad_flat=0")
                .hasMessageContaining("missing_lcsd=0")
                .hasMessageContaining("stray_lcbd=1");

        // Observe survival directly rather than only inferring it from the raise: the failed
        // re-run's script transaction aborts and rolls back, so the re-created row must still exist.
        Integer survivingLcbdCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM listing_commercial_building_details WHERE listing_id = ?",
                Integer.class, targetIds.get(0));
        assertThat(survivingLcbdCount).isEqualTo(1);
    }

    @Test
    void forwardScript_secondRun_isTrueNoOp() throws Exception {
        for (int i = 0; i < targetIds.size(); i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }
        runShippedScript(resolveForwardScript());

        java.util.Map<UUID, String> auditAfterFirstRun = new java.util.HashMap<>();
        for (UUID id : targetIds) {
            auditAfterFirstRun.put(id, jdbcTemplate.queryForObject(
                    "SELECT (parsed_data->'fix2575RollbackAudit')::text FROM property_listings WHERE id = ?",
                    String.class, id));
        }

        runShippedScript(resolveForwardScript());

        for (UUID id : targetIds) {
            String propertyType = jdbcTemplate.queryForObject(
                    "SELECT property_type FROM property_listings WHERE id = ?", String.class, id);
            String flatSubtype = jdbcTemplate.queryForObject(
                    "SELECT commercial_subtype FROM property_listings WHERE id = ?", String.class, id);
            assertThat(propertyType).isEqualTo("commercial");
            assertThat(flatSubtype).isEqualTo("OFFICE");

            Integer lcsdCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM listing_commercial_space_details WHERE listing_id = ?",
                    Integer.class, id);
            assertThat(lcsdCount).isEqualTo(1);

            Integer lcbdCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM listing_commercial_building_details WHERE listing_id = ?",
                    Integer.class, id);
            assertThat(lcbdCount).isEqualTo(0);

            String auditAfterSecondRun = jdbcTemplate.queryForObject(
                    "SELECT (parsed_data->'fix2575RollbackAudit')::text FROM property_listings WHERE id = ?",
                    String.class, id);
            assertThat(auditAfterSecondRun).isEqualTo(auditAfterFirstRun.get(id));
        }
    }

    @Test
    void forwardScript_step5_missingLcsdArm_seedIsBlockedByV135Trigger() throws Exception {
        // Arm 3 per the brief: run successfully, delete one target's lcsd row, re-run, and expect
        // Step 5's missing_lcsd_count branch to fire. This test proves the seed step itself
        // (a bare DELETE of the lcsd row) cannot be performed while the target's flat
        // property_listings.commercial_subtype is still 'OFFICE': V135's SECOND deferred
        // constraint trigger, trg_commercial_detail_subtype_projected on
        // listing_commercial_space_details, has NO WHEN clause (unlike trigger A on
        // property_listings) and fires unconditionally on every UPDATE OR DELETE to that table.
        // At this DELETE's own commit it re-reads property_listings live, still sees
        // commercial_subtype = 'OFFICE', finds no matching lcsd row, and raises V135's own
        // "commercial_subtype projection missing" guard -- before the forward script is ever
        // re-run. See the written report: this is reported as a FINDING, not implemented around.
        for (int i = 0; i < targetIds.size(); i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }
        runShippedScript(resolveForwardScript());

        assertThatThrownBy(() -> jdbcTemplate.update(
                        "DELETE FROM listing_commercial_space_details WHERE listing_id = ?",
                        targetIds.get(0)))
                .isInstanceOf(org.springframework.dao.DataAccessException.class)
                .hasMessageContaining("commercial_subtype projection missing");
    }

    @Test
    void rollbackScript_zeroTargetArm_raisesOnPreCorrectionPostCondition() throws Exception {
        // The forward correction is never applied on this path: four targets sit in the old,
        // uncorrected state (seedEligibleTarget) and the fifth is seeded directly into the
        // corrected shape (seedAlreadyCorrectedTarget) rather than via the forward script, so no
        // row carries a fix2575RollbackAudit key. The rollback script's own target set -- rows
        // carrying that audit key -- is therefore empty, so its state gate passes vacuously at 0
        // and every step scoped to that (empty) captured set no-ops. Its post-condition check,
        // however, is scoped to all five fixture ids rather than to the set this run actually
        // touched, so it still observes that one of the five (the already-corrected row) is not
        // in the pre-correction shape and must RAISE rather than silently COMMIT.
        for (int i = 0; i < 4; i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }
        seedAlreadyCorrectedTarget(targetIds.get(4), TARGET_SOURCE_IDS[4]);

        assertThatThrownBy(() -> runShippedScript(resolveRollbackScript()))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining(
                        "fix-office-subtype-2575-rollback: post-condition failed (bad_flat=1, "
                                + "missing_lcbd=1, bad_lcsd=0, stray_audit=0). Aborting.");
    }

    /**
     * Forward-then-rollback round trip: proves the rollback script restores the EXACT pre-image,
     * not merely "some" lcbd row. The forward script captures each target's lcbd pre-image
     * (including {@code created_at}) into {@code parsed_data->'fix2575RollbackAudit'} as jsonb;
     * the rollback script reparses that captured value with {@code ::timestamptz} and re-inserts
     * it. That round trip has previously only been checked through {@code psql} -- this test
     * drives it through JDBC, a different client path that could normalize the value before it
     * ever reaches Postgres. Each fixture row is seeded with distinct {@code number_of_units},
     * {@code total_floors}, {@code road_frontage_ft}, {@code commercial_usage}, and a distinct,
     * microsecond-precision {@code created_at} so that "restored exactly" is actually falsifiable
     * (reusing {@link #seedEligibleTarget} would not be: it hardcodes identical lcbd values for
     * every row and lets {@code created_at} default).
     */
    @Test
    void forwardThenRollback_restoresExactLcbdPreImage() throws Exception {
        record LcbdFixture(
                int numberOfUnits,
                int totalFloors,
                BigDecimal roadFrontageFt,
                String commercialUsage,
                OffsetDateTime createdAt) {}

        LcbdFixture[] fixtures = {
            new LcbdFixture(2, 3, new BigDecimal("25"), "OFFICE",
                    OffsetDateTime.parse("2026-03-14T07:09:26.123456+00:00")),
            new LcbdFixture(5, 7, new BigDecimal("52"), "WAREHOUSE",
                    OffsetDateTime.parse("2026-03-15T11:22:33.234567+00:00")),
            new LcbdFixture(1, 2, new BigDecimal("18"), "SHOWROOM",
                    OffsetDateTime.parse("2026-03-16T15:35:40.345678+00:00")),
            new LcbdFixture(9, 12, new BigDecimal("99"), "INDUSTRIAL",
                    OffsetDateTime.parse("2026-03-17T19:48:47.456789+00:00")),
            new LcbdFixture(4, 6, new BigDecimal("61"), "MIXED_USE",
                    OffsetDateTime.parse("2026-03-18T23:59:58.567891+00:00")),
        };

        for (int i = 0; i < targetIds.size(); i++) {
            LcbdFixture f = fixtures[i];
            seedEligibleTargetWithDistinctLcbd(
                    targetIds.get(i),
                    TARGET_SOURCE_IDS[i],
                    f.numberOfUnits(),
                    f.totalFloors(),
                    f.roadFrontageFt(),
                    f.commercialUsage(),
                    f.createdAt());
        }

        Map<UUID, LcbdPreImage> preImages = new HashMap<>();
        for (UUID id : targetIds) {
            preImages.put(id, captureLcbdPreImage(id));
        }

        runShippedScript(resolveForwardScript());
        runShippedScript(resolveRollbackScript());

        for (int i = 0; i < targetIds.size(); i++) {
            UUID id = targetIds.get(i);
            LcbdFixture seeded = fixtures[i];
            LcbdPreImage expected = preImages.get(id);

            String propertyType = jdbcTemplate.queryForObject(
                    "SELECT property_type FROM property_listings WHERE id = ?", String.class, id);
            String commercialSubtype = jdbcTemplate.queryForObject(
                    "SELECT commercial_subtype FROM property_listings WHERE id = ?", String.class, id);
            assertThat(propertyType).isEqualTo("commercial_building");
            assertThat(commercialSubtype).isEqualTo("BUILDING");

            LcbdPreImage restored = captureLcbdPreImage(id);
            assertThat(restored.numberOfUnits()).isEqualTo(expected.numberOfUnits());
            assertThat(restored.totalFloors()).isEqualTo(expected.totalFloors());
            assertThat(restored.roadFrontageFt().compareTo(expected.roadFrontageFt())).isZero();
            assertThat(restored.commercialUsage()).isEqualTo(expected.commercialUsage());
            assertThat(restored.createdAt()).isEqualTo(expected.createdAt());

            // ANCHOR OUTSIDE BOTH READS. The comparison above proves the round trip is
            // SELF-CONSISTENT; on its own it cannot prove the round trip is CORRECT, because
            // capture and restore read through the SAME JDBC path. If that path truncated
            // microseconds, the captured value would already be truncated, the restored value
            // would match it, and captured == restored would pass while precision had been
            // silently lost on both sides of a comparison that shares the defect.
            //
            // The seeded literal is the anchor: it is known independently of anything the
            // capture/restore path produced. Asserting the CAPTURED value against it proves the
            // READ preserves microseconds; asserting the RESTORED value against it proves the
            // full jsonb -> ::timestamptz round trip does. Keeping both separates which leg lost
            // precision if one ever does, instead of only reporting that the pair disagree.
            assertThat(expected.createdAt())
                    .as("capture leg must preserve microseconds for id=%s (seeded %s)",
                            id, seeded.createdAt())
                    .isEqualTo(seeded.createdAt());
            assertThat(restored.createdAt())
                    .as("full round trip must preserve microseconds for id=%s (seeded %s)",
                            id, seeded.createdAt())
                    .isEqualTo(seeded.createdAt());

            Integer lcsdCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM listing_commercial_space_details WHERE listing_id = ?",
                    Integer.class, id);
            assertThat(lcsdCount).isEqualTo(0);
        }
    }

    /**
     * The rollback script's header claims a second run matches zero rows for two independent
     * reasons: the flat columns are back to the pre-fix shape, AND the audit key it wrote into
     * {@code parsed_data} while restoring the lcbd pre-image has been cleared. That is
     * fail-closed-by-absence rather than fail-closed-by-condition alone — but it has never been
     * executed. This arm seeds five eligible targets, runs forward then rollback once, asserts
     * the audit key is gone for all five, then runs the rollback a SECOND time and asserts it
     * completes without raising and leaves every target's state (flat columns, lcbd row, lcsd
     * count, audit key) byte-for-byte identical to what the first rollback left — proving the
     * second run is a true no-op, not merely that it happens to match expected literals.
     */
    @Test
    void rollback_clearsAuditKey_andSecondRollbackIsNoOp() throws Exception {
        for (int i = 0; i < targetIds.size(); i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }

        runShippedScript(resolveForwardScript());
        runShippedScript(resolveRollbackScript());

        for (UUID id : targetIds) {
            Boolean hasAuditKey = jdbcTemplate.queryForObject(
                    "SELECT jsonb_exists(parsed_data, 'fix2575RollbackAudit') "
                            + "FROM property_listings WHERE id = ?",
                    Boolean.class, id);
            assertThat(hasAuditKey)
                    .as("audit key must be cleared by the rollback for id=%s", id)
                    .isFalse();
        }

        Map<UUID, RollbackState> afterFirstRollback = new HashMap<>();
        for (UUID id : targetIds) {
            afterFirstRollback.put(id, captureRollbackState(id));
        }

        runShippedScript(resolveRollbackScript());

        for (UUID id : targetIds) {
            RollbackState expected = afterFirstRollback.get(id);
            RollbackState afterSecondRollback = captureRollbackState(id);
            assertThat(afterSecondRollback)
                    .as("second rollback must be a true no-op for id=%s", id)
                    .isEqualTo(expected);
        }
    }

    /**
     * The rollback script's state gate requires its captured target set (id-bound to the five
     * fixture rows, tagged with the #2304 provenance markers, still carrying the
     * {@code fix2575RollbackAudit} key, and still sitting at commercial/OFFICE) to be exactly 0 or
     * exactly 5. This arm proves the gate actually aborts on a count strictly between those two --
     * not merely above 5, which is the failure mode a weaker gate would let through: it would roll
     * back only the rows it matched, report success, and leave the operator believing the rollback
     * completed while some targets stayed corrected (with the audit key now gone from the ones it
     * did touch, making rollback permanently impossible for those) and others remained untouched.
     * That inconsistent, unrecoverable mix is exactly what the gate exists to prevent, and it has
     * never been executed until now.
     *
     * <p>All five targets are seeded and pushed through the forward script so every one of them
     * carries the audit key and sits at commercial/OFFICE. The audit key is then stripped from
     * exactly two of the five -- simulating something outside these three scripts touching
     * {@code parsed_data} on a subset of the targets -- leaving a captured set of 3 for the
     * rollback to find.
     */
    @Test
    void rollbackScript_partialAuditSet_abortsInsteadOfPartialRollback() throws Exception {
        for (int i = 0; i < targetIds.size(); i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }
        runShippedScript(resolveForwardScript());

        jdbcTemplate.update(
                "UPDATE property_listings SET parsed_data = parsed_data - 'fix2575RollbackAudit' "
                        + "WHERE id = ?",
                targetIds.get(0));
        jdbcTemplate.update(
                "UPDATE property_listings SET parsed_data = parsed_data - 'fix2575RollbackAudit' "
                        + "WHERE id = ?",
                targetIds.get(1));

        assertThatThrownBy(() -> runShippedScript(resolveRollbackScript()))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining(
                        "fix-office-subtype-2575-rollback: expected 0 (already rolled back) or 5 "
                                + "(full uncorrected set) rows to roll back, found 3. Aborting -- "
                                + "partial/corrupt state.");
    }

    /**
     * {@code cleanup-audit-2575.sql} selects targets id-bound to the five fixture listings that
     * carry the #2304 provenance markers ({@code parsed_data->>'importIssue'='2304'} and
     * {@code ->>'source'='99acres'}) and still carry the {@code fix2575RollbackAudit} key. Its
     * state gate was widened from {@code > 5} to {@code NOT IN (0, 5)} on request, but has never
     * been executed -- so until this arm runs, that fix is asserted in prose only. This proves
     * the abort half: seed five, run the forward script (all five now carry the audit key), strip
     * the key from exactly two -- leaving a captured set of 3 -- then run cleanup and assert it
     * aborts.
     *
     * <p>Resolves the cleanup script itself first and asserts the resolved path actually ends
     * with {@code cleanup-audit-2575.sql}: a resolver silently pointing at some other shipped
     * script would execute something, abort or pass for its own unrelated reasons, and tell us
     * nothing about cleanup while looking like a real result.
     */
    @Test
    void cleanupScript_partialAuditSet_aborts() throws Exception {
        Path cleanupScript = resolveCleanupScript();
        assertThat(cleanupScript.toString())
                .as("resolver must resolve the cleanup script, not some other shipped script")
                .endsWith("cleanup-audit-2575.sql");

        for (int i = 0; i < targetIds.size(); i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }
        runShippedScript(resolveForwardScript());

        jdbcTemplate.update(
                "UPDATE property_listings SET parsed_data = parsed_data - 'fix2575RollbackAudit' "
                        + "WHERE id = ?",
                targetIds.get(0));
        jdbcTemplate.update(
                "UPDATE property_listings SET parsed_data = parsed_data - 'fix2575RollbackAudit' "
                        + "WHERE id = ?",
                targetIds.get(1));

        assertThatThrownBy(() -> runShippedScript(cleanupScript))
                .isInstanceOf(SQLException.class)
                // Anchored through the END of the sentence on purpose. A bare "found 3" is a
                // containment check that also matches "found 30" and "found 35" -- so it would
                // pass while the gate reported thirty in-scope rows, which is the very
                // partial-state condition this arm exists to detect. Asserting the count against
                // the text that follows it removes that.
                //
                // Not hasMessage(): the runtime string carries a driver-added "ERROR: " prefix and
                // a trailing "Where: PL/pgSQL function inline_code_block line 8 at RAISE". Pinning
                // the whole message would couple this assertion to a LINE NUMBER INSIDE
                // cleanup-audit-2575.sql, which has nothing to do with the property under test and
                // would break on any edit to that script.
                //
                // This literal was captured from the OBSERVED failure output, not transcribed from
                // the SQL source -- the source reads "found %.", where % is a placeholder that only
                // becomes "3" at runtime. Asserting the source text would fail against a correct
                // abort and read as the assertion being broken.
                .hasMessageContaining("rows to clean, found 3. Aborting -- partial/unexpected state.");
    }

    /**
     * Full-set companion to {@link #cleanupScript_partialAuditSet_aborts()}. With all five audit
     * keys intact, the gate's captured count is exactly 5, so cleanup must complete without
     * raising, and every target's audit key must be gone afterward. Together the two arms prove
     * the gate actually discriminates on the captured count rather than always/never firing.
     */
    @Test
    void cleanupScript_fullAuditSet_completesAndClearsKey() throws Exception {
        for (int i = 0; i < targetIds.size(); i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }
        runShippedScript(resolveForwardScript());

        runShippedScript(resolveCleanupScript());

        for (UUID id : targetIds) {
            Boolean hasAuditKey = jdbcTemplate.queryForObject(
                    "SELECT jsonb_exists(parsed_data, 'fix2575RollbackAudit') "
                            + "FROM property_listings WHERE id = ?",
                    Boolean.class, id);
            assertThat(hasAuditKey)
                    .as("audit key must be cleared by cleanup for id=%s", id)
                    .isFalse();
        }
    }

    // ═════════════════════════════════════════════════════════════════════════════════════════
    // Cleanup Gate A (identity/existence) and Gate B (post-forward state)
    //
    // cleanup-audit-2575.sql is the irreversible boundary of this correction: it destroys the
    // only pre-image any rollback -- automated or manual -- could be reconstructed from. Before
    // these arms existed, two ways of passing it were untested and unsound:
    //
    //   * a row drifted off the corrected state while all five audit keys remained still
    //     satisfied the audit-key count, so the payload was deleted from all five rows and
    //     committed -- destroying the pre-image exactly when drift made it most likely to be
    //     needed; and
    //   * an ABSENT dataset made every counter degrade to 0, so the script COMMITted reporting
    //     success against a wrong database / restored snapshot / deleted dataset, while the
    //     anon-readable audit blob sat untouched on the real one.
    //
    // The arms below plant each of those conditions and require an abort. Between them they
    // exercise all three of Gate B's counters, not just the one reachable most cheaply.
    // ═════════════════════════════════════════════════════════════════════════════════════════

    /**
     * Gate B, {@code bad_flat} branch: a target drifted off the corrected flat state while all
     * five audit keys remain present must ABORT, and all five audit payloads must survive.
     *
     * <p>This is the condition the old script passed. The drift is planted through ordinary DML,
     * with no trigger bypass: {@code 'warehouse'} is a legal {@code chk_listing_property_type}
     * value, and V135's trigger on {@code property_listings} carries
     * {@code WHEN (NEW.property_type = 'commercial' AND ...)}, which is false for it — so nothing
     * is enqueued and the UPDATE commits cleanly. The audit key is left untouched on all five
     * rows precisely so the audit-key cardinality gate still counts 5 and cannot be what fires;
     * only the state gate can produce this abort.
     *
     * <p>Asserting the abort alone would be half the property. The point of aborting is that the
     * pre-image SURVIVES, so this arm reads all five payloads back afterwards and requires them
     * byte-identical to what the forward script wrote. An abort that still destroyed the payload
     * would pass an abort-only assertion.
     */
    @Test
    void cleanupScript_driftedTarget_abortsAndPreservesAllFiveAuditPayloads() throws Exception {
        for (int i = 0; i < targetIds.size(); i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }
        runShippedScript(resolveForwardScript());

        Map<UUID, String> auditBeforeCleanup = new HashMap<>();
        for (UUID id : targetIds) {
            auditBeforeCleanup.put(id, jdbcTemplate.queryForObject(
                    "SELECT (parsed_data->'fix2575RollbackAudit')::text FROM property_listings WHERE id = ?",
                    String.class, id));
        }

        jdbcTemplate.update(
                "UPDATE property_listings SET property_type = 'warehouse' WHERE id = ?",
                targetIds.get(0));

        // Anchored through the end of the sentence, not stopped at "bad_flat=1": a bare
        // "bad_flat=1" is a substring of "bad_flat=10", and unlike the forward script's Step 5
        // arms this literal is asserted here for its own sake rather than leaning on a
        // five-row-bounded join elsewhere in the file. Captured from observed runtime output --
        // the SQL source carries "%" placeholders that only become numbers at execution.
        assertThatThrownBy(() -> runShippedScript(resolveCleanupScript()))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("cleanup-audit-2575: post-forward state gate failed "
                        + "(bad_flat=1, missing_lcsd=0, stray_lcbd=0). Aborting -- audit payload "
                        + "preserved.");

        // The half that matters. The abort is only worth having because the pre-image outlives it.
        for (UUID id : targetIds) {
            String auditAfterAbort = jdbcTemplate.queryForObject(
                    "SELECT (parsed_data->'fix2575RollbackAudit')::text FROM property_listings WHERE id = ?",
                    String.class, id);
            assertThat(auditAfterAbort)
                    .as("aborted cleanup must leave the rollback pre-image intact for id=%s", id)
                    .isEqualTo(auditBeforeCleanup.get(id));
        }
    }

    /**
     * Gate B, {@code stray_lcbd} branch: a re-created stale lcbd row must ABORT cleanup.
     *
     * <p>Distinct from the {@code bad_flat} arm above, and not redundant with it: the three Gate B
     * counters are independent predicates, and an arm that only ever moves {@code property_type}
     * would leave the other two untested — able to be broken, or deleted outright, with nothing
     * turning red. No trigger bypass is needed here: {@code listing_commercial_building_details}
     * carries no V135 trigger, so the INSERT commits on ordinary DML.
     */
    @Test
    void cleanupScript_reCreatedStaleLcbdRow_aborts() throws Exception {
        for (int i = 0; i < targetIds.size(); i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }
        runShippedScript(resolveForwardScript());

        jdbcTemplate.update(
                "INSERT INTO listing_commercial_building_details "
                        + "(listing_id, number_of_units, total_floors, road_frontage_ft, commercial_usage) "
                        + "VALUES (?, 1, 4, 40, 'RETAIL')",
                targetIds.get(0));

        assertThatThrownBy(() -> runShippedScript(resolveCleanupScript()))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("cleanup-audit-2575: post-forward state gate failed "
                        + "(bad_flat=0, missing_lcsd=0, stray_lcbd=1). Aborting -- audit payload "
                        + "preserved.");
    }

    /**
     * Gate B, {@code missing_lcsd} branch — reachable only under a trigger bypass.
     *
     * <p>The third Gate B counter cannot be planted through normal DML at all: deleting a
     * commercial/OFFICE listing's lcsd row is rejected outright by V135's trigger on
     * {@code listing_commercial_space_details}, which has no {@code WHEN} clause and fires
     * unconditionally (the same interception proven by
     * {@link #forwardScript_step5_missingLcsdArm_seedIsBlockedByV135Trigger()}). That does not
     * make the counter dead — {@code session_replication_role = replica} bypasses user triggers
     * wholesale and is routine in bulk loads, restores and replication apply, which is exactly the
     * class of event that would leave an lcsd row missing while the flat columns still read
     * corrected. Cleanup must refuse to destroy the pre-image in that state.
     *
     * <p>Hazard 1 and Hazard 2 (class javadoc) both apply: the bypass is {@code SET LOCAL}-scoped
     * inside an explicit transaction, the forbidden DELETE's row count is asserted as a positive
     * control, and the reset is proven on the same physical connection under
     * {@code SET CONSTRAINTS ALL IMMEDIATE} before that connection is released.
     */
    @Test
    void cleanupScript_missingLcsdUnderReplicaMode_aborts() throws Exception {
        for (int i = 0; i < targetIds.size(); i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }
        runShippedScript(resolveForwardScript());

        try (Connection bypass = dataSource.getConnection()) {
            bypass.setAutoCommit(false);
            try {
                try (Statement setLocal = bypass.createStatement()) {
                    setLocal.execute("SET LOCAL session_replication_role = replica");
                }
                try (PreparedStatement delete = bypass.prepareStatement(
                        "DELETE FROM public.listing_commercial_space_details WHERE listing_id = ?")) {
                    delete.setObject(1, targetIds.get(0));
                    int deletedRows = delete.executeUpdate();
                    // Hazard 2 positive control -- see class javadoc.
                    assertThat(deletedRows)
                            .as("session_replication_role=replica must actually be in effect: "
                                    + "the #2520-forbidden DELETE must succeed while it applies")
                            .isEqualTo(1);
                }
                bypass.commit();
            } catch (SQLException e) {
                bypass.rollback();
                throw e;
            }

            // Hazard 1 on-connection reset proof -- see class javadoc for why
            // SET CONSTRAINTS ALL IMMEDIATE is required on a connection that will be rolled back.
            try (Statement forceImmediate = bypass.createStatement()) {
                forceImmediate.execute("SET CONSTRAINTS ALL IMMEDIATE");
            }
            try (PreparedStatement resetCheck = bypass.prepareStatement(
                    "DELETE FROM public.listing_commercial_space_details WHERE listing_id = ?")) {
                resetCheck.setObject(1, targetIds.get(1));
                assertThatThrownBy(resetCheck::executeUpdate)
                        .as("session_replication_role must have reverted on THIS SAME bypass "
                                + "connection once its transaction committed, before it is "
                                + "returned to the pool")
                        .isInstanceOf(SQLException.class)
                        .hasMessageContaining("but no listing_commercial_space_details row "
                                + "exists. Discover reads the projection, so this row would be "
                                + "invisible to a subtype filter. (#2520)");
            }
            bypass.rollback();
        }

        assertThatThrownBy(() -> runShippedScript(resolveCleanupScript()))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("cleanup-audit-2575: post-forward state gate failed "
                        + "(bad_flat=0, missing_lcsd=1, stray_lcbd=0). Aborting -- audit payload "
                        + "preserved.");

        assertThatThrownBy(() -> jdbcTemplate.update(
                        "DELETE FROM public.listing_commercial_space_details WHERE listing_id = ?",
                        targetIds.get(1)))
                .as("session_replication_role must have reverted after the bypass transaction "
                        + "committed: the #2520 trigger must be armed again for an unrelated target")
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("but no listing_commercial_space_details row exists. "
                        + "Discover reads the projection, so this row would be invisible to a "
                        + "subtype filter. (#2520)");
    }

    /**
     * The sanctioned {@code forward -> rollback -> cleanup} sequence must complete WITHOUT
     * raising, and must leave the rolled-back state untouched.
     *
     * <p>This arm pins a contract an earlier gate ordering got wrong. When the drift gate ran
     * before the audit-key cardinality check, this sequence terminated in an exception: the
     * rollback reverts the five rows to {@code commercial_building}/{@code BUILDING}, so a drift
     * gate reaching them first saw "not in the corrected state" and aborted — on a path the
     * runbook itself prescribes. That abort bought no safety and taught something false, that this
     * script raises on healthy paths; an operator who has seen it cry wolf on a prescribed
     * sequence discounts the next abort, which is the real one.
     *
     * <p>Ordering the gates identity → cardinality → drift fixes it without weakening anything,
     * because the drift gate was never the one carrying the wrong-database burden — the identity
     * gate is, and it is unmoved. At a cardinality of 0 there is no payload to protect, so the
     * drift gate's purpose is vacuous exactly where it used to fire.
     *
     * <p>Asserting "does not raise" alone would be too weak: a cleanup that silently mutated the
     * rolled-back rows would also not raise. So this checks the rows are still present, still in
     * the pre-correction shape with their lcbd rows restored and no lcsd row, and still carry no
     * audit key.
     */
    @Test
    void cleanupScript_afterRollback_exitsCleanWithNothingToClean() throws Exception {
        for (int i = 0; i < targetIds.size(); i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }
        runShippedScript(resolveForwardScript());
        runShippedScript(resolveRollbackScript());

        // The sanctioned third step. Must not raise: the rollback already cleared every audit
        // key, so there is genuinely nothing to clean.
        runShippedScript(resolveCleanupScript());

        for (UUID id : targetIds) {
            String propertyType = jdbcTemplate.queryForObject(
                    "SELECT property_type FROM property_listings WHERE id = ?", String.class, id);
            String flatSubtype = jdbcTemplate.queryForObject(
                    "SELECT commercial_subtype FROM property_listings WHERE id = ?", String.class, id);
            assertThat(propertyType)
                    .as("cleanup after rollback must not disturb the rolled-back state for id=%s", id)
                    .isEqualTo("commercial_building");
            assertThat(flatSubtype).isEqualTo("BUILDING");

            Integer lcbdCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM listing_commercial_building_details WHERE listing_id = ?",
                    Integer.class, id);
            assertThat(lcbdCount)
                    .as("the rollback-restored lcbd row must survive cleanup for id=%s", id)
                    .isEqualTo(1);

            Integer lcsdCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM listing_commercial_space_details WHERE listing_id = ?",
                    Integer.class, id);
            assertThat(lcsdCount).isEqualTo(0);

            Boolean hasAuditKey = jdbcTemplate.queryForObject(
                    "SELECT jsonb_exists(parsed_data, 'fix2575RollbackAudit') "
                            + "FROM property_listings WHERE id = ?",
                    Boolean.class, id);
            assertThat(hasAuditKey).isFalse();
        }
    }

    /**
     * Gate A, absence: against a database where the five expected listings do not exist at all,
     * cleanup must ABORT rather than COMMIT reporting success.
     *
     * <p>This is the "wrong database" case — a wrong connection string, a restored snapshot, a
     * deleted dataset, an import that never completed. {@code @BeforeEach} already deletes the
     * five fixture rows, so seeding nothing reproduces it exactly. Before Gate A existed, every
     * counter in the script reached {@code property_listings} through a join and so degraded to 0
     * here: the audit-key gate passed at 0, the UPDATE matched nothing, the post-condition found
     * no stray keys, and the script COMMITted — indistinguishable from a clean idempotent re-run,
     * on a script whose runbook calls completion mandatory.
     *
     * <p>The gate survives this case only because it is scoped to the {@code VALUES}-derived
     * five-id set rather than to a set derived by joining {@code property_listings} — so it counts
     * 0 against an expected 5 and raises, instead of vanishing along with the data it checks.
     */
    @Test
    void cleanupScript_absentDataset_abortsInsteadOfReportingSuccess() {
        assertThatThrownBy(() -> runShippedScript(resolveCleanupScript()))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("cleanup-audit-2575: expected 5 rows matching id list + "
                        + "provenance, found 0. Aborting -- refusing to report success against an "
                        + "unestablished dataset.");
    }

    /**
     * Gate A, provenance: the five ids resolving to five rows is not enough — they must be the
     * rows this correction was written for.
     *
     * <p>Distinct from the absence arm: here all five listings exist and are in the corrected
     * state, but one no longer carries the expected import provenance, as it would if an id
     * collided with an unrelated row or a re-import rewrote {@code parsed_data}. The audit key is
     * deliberately left intact on all five, so the audit-key cardinality gate would count 5 and
     * pass; only the identity gate can produce this abort.
     */
    @Test
    void cleanupScript_provenanceMismatch_aborts() throws Exception {
        for (int i = 0; i < targetIds.size(); i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }
        runShippedScript(resolveForwardScript());

        jdbcTemplate.update(
                "UPDATE property_listings "
                        + "SET parsed_data = jsonb_set(parsed_data, '{source}', '\"magicbricks\"') "
                        + "WHERE id = ?",
                targetIds.get(0));

        assertThatThrownBy(() -> runShippedScript(resolveCleanupScript()))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("cleanup-audit-2575: expected 5 rows matching id list + "
                        + "provenance, found 4. Aborting -- refusing to report success against an "
                        + "unestablished dataset.");
    }

    /**
     * The intended re-run behaviour, asserted in a form that does NOT make "already cleaned"
     * indistinguishable from "wrong database".
     *
     * <p>A re-run arm that only observed "the second run did not raise" would have passed just as
     * happily against an empty database — which is the defect Gate A exists to close, so an arm
     * shaped that way would certify the very confusion it was added to rule out. This arm
     * therefore asserts the re-run succeeds AND that the dataset it succeeded against is still
     * present and still corrected: five rows, still commercial/OFFICE, each with its OFFICE lcsd
     * projection, no lcbd row, and no audit key.
     *
     * <p>It then closes the loop by deleting the five rows and running cleanup a third time,
     * requiring it to ABORT. Same script, same "no audit keys anywhere" surface condition,
     * opposite verdicts — which is exactly the discrimination the earlier script could not make,
     * and the reason a success result from it now means something.
     */
    @Test
    void cleanupScript_secondRunIsNoOp_andIsDistinguishableFromAnAbsentDataset() throws Exception {
        for (int i = 0; i < targetIds.size(); i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }
        runShippedScript(resolveForwardScript());
        runShippedScript(resolveCleanupScript());

        // Second run: must complete without raising.
        runShippedScript(resolveCleanupScript());

        // ...against a dataset proven still present and still corrected. Without these, the
        // assertion above is satisfied by an empty database too.
        for (UUID id : targetIds) {
            Integer listingCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM property_listings WHERE id = ?", Integer.class, id);
            assertThat(listingCount)
                    .as("the no-op re-run must have run against the real dataset for id=%s", id)
                    .isEqualTo(1);

            String propertyType = jdbcTemplate.queryForObject(
                    "SELECT property_type FROM property_listings WHERE id = ?", String.class, id);
            String flatSubtype = jdbcTemplate.queryForObject(
                    "SELECT commercial_subtype FROM property_listings WHERE id = ?", String.class, id);
            assertThat(propertyType).isEqualTo("commercial");
            assertThat(flatSubtype).isEqualTo("OFFICE");

            String lcsdSubtype = jdbcTemplate.queryForObject(
                    "SELECT commercial_subtype FROM listing_commercial_space_details WHERE listing_id = ?",
                    String.class, id);
            assertThat(lcsdSubtype).isEqualTo("OFFICE");

            Integer lcbdCount = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM listing_commercial_building_details WHERE listing_id = ?",
                    Integer.class, id);
            assertThat(lcbdCount).isEqualTo(0);

            Boolean hasAuditKey = jdbcTemplate.queryForObject(
                    "SELECT jsonb_exists(parsed_data, 'fix2575RollbackAudit') "
                            + "FROM property_listings WHERE id = ?",
                    Boolean.class, id);
            assertThat(hasAuditKey).isFalse();
        }

        // The discrimination itself: remove the dataset and re-run the SAME script. Under the
        // pre-fix script this third run was indistinguishable from the second -- both COMMITted
        // reporting success. It must now abort.
        for (UUID id : targetIds) {
            jdbcTemplate.update("DELETE FROM property_listings WHERE id = ?", id);
        }

        assertThatThrownBy(() -> runShippedScript(resolveCleanupScript()))
                .as("a cleanup run against an absent dataset must not be reported the same way as "
                        + "a genuine idempotent re-run")
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("cleanup-audit-2575: expected 5 rows matching id list + "
                        + "provenance, found 0. Aborting -- refusing to report success against an "
                        + "unestablished dataset.");
    }

    // ═════════════════════════════════════════════════════════════════════════════════════════
    // bad_lcsd_count scope confirmation
    // ═════════════════════════════════════════════════════════════════════════════════════════

    /**
     * First of a pair proving the rollback script's {@code bad_lcsd_count} post-condition counter
     * (Step 5 of fix-office-subtype-2575-rollback.sql) is live and discriminating despite its
     * narrower scope -- unlike its sibling counters ({@code bad_flat_count},
     * {@code missing_lcbd_count}, {@code stray_audit_count}), which are scoped to all five target
     * ids via {@code fix_2575_rollback_ids}, {@code bad_lcsd_count} is scoped only to
     * {@code fix_2575_rollback_targets}, the subset of rows the rollback run actually mutated.
     *
     * <p>This arm shows the counter's DELETE-branch predicate is <b>not reachable through normal
     * DML</b>: seed one target in the OLD (BUILDING) shape WITH a pre-existing lcsd row via
     * {@link #seedEligibleTargetWithPreexistingLcsd(UUID, String)}, so the forward script's
     * pre_image CTE captures {@code lcsdPreExisted = true} for it, obliging the rollback script's
     * Step 3 to RESTORE (not delete) its lcsd row -- then try to delete that lcsd row out from
     * under the restore. The #2520 {@code assert_commercial_subtype_projected} trigger on
     * {@code listing_commercial_space_details} has no {@code WHEN} clause -- it fires
     * unconditionally on this DELETE. Under this test class's {@code Propagation.NOT_SUPPORTED}
     * setup, the standalone {@code jdbcTemplate.update(...)} DELETE is its own autocommitting
     * statement/transaction, so the DEFERRABLE trigger's deferred check runs at that statement's
     * own implicit commit -- immediately, synchronously, as part of the DELETE call itself. The
     * trigger rejects the DELETE outright with "commercial_subtype projection missing", so the
     * rollback script is never even invoked here, and {@code bad_lcsd_count}'s DELETE-branch
     * predicate is never exercised by this arm.
     *
     * <p>Its sibling, {@link #rollbackScript_lcsdDeleteUnderReplicaMode_raisesBadLcsdCount()},
     * shows the same corruption DOES reach the counter once the trigger is bypassed the way a bulk
     * load, restore, or replication apply routinely would -- proving {@code bad_lcsd_count} is a
     * live guard against exactly that, not a dead counter.
     */
    @Test
    void rollbackScript_lcsdDeleteBlockedByV135_whenTriggersEnabled() throws Exception {
        for (int i = 0; i < 4; i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }
        seedEligibleTargetWithPreexistingLcsd(targetIds.get(4), TARGET_SOURCE_IDS[4]);

        runShippedScript(resolveForwardScript());

        // The DELETE itself -- not the rollback script -- is what raises here. The #2520
        // assert_commercial_subtype_projected trigger on listing_commercial_space_details has no
        // WHEN clause and rejects this statement before the rollback script can ever run, so
        // bad_lcsd_count's DELETE-branch predicate is never reached by this normal-DML path. See
        // rollbackScript_lcsdDeleteUnderReplicaMode_raisesBadLcsdCount() for the bypass path.
        assertThatThrownBy(() -> jdbcTemplate.update(
                        "DELETE FROM public.listing_commercial_space_details WHERE listing_id = ?",
                        targetIds.get(4)))
                .isInstanceOf(DataIntegrityViolationException.class)
                // Captured verbatim from actual test-run output (not transcribed from the trigger
                // source), anchored through the end of the fixed portion of the message -- the
                // only variable part (the listing id) is excluded from the anchor.
                .hasMessageContaining("but no listing_commercial_space_details row exists. "
                        + "Discover reads the projection, so this row would be invisible to a "
                        + "subtype filter. (#2520)");
    }

    /**
     * Second of the pair. The sibling arm above proves {@code bad_lcsd_count}'s DELETE-branch
     * predicate is unreachable through normal DML -- the #2520 trigger blocks it. That is not the
     * same as the counter being dead: {@code session_replication_role = replica} bypasses user
     * triggers wholesale, and it is routine in bulk loads, restores, and replication apply. This
     * arm proves {@code bad_lcsd_count} is a live guard against exactly that.
     *
     * <p>Same seed and forward-script run as the sibling arm, so target index 4 again carries a
     * restorable pre-existing lcsd row after the forward script. This time the corrupting DELETE
     * runs on a dedicated connection with {@code SET LOCAL session_replication_role = replica}
     * inside an explicit, non-autocommit transaction -- {@code SET LOCAL} is transaction-scoped,
     * so the bypass reverts automatically at commit and can never leak back into the connection
     * pool to disarm the trigger for a later, unrelated test.
     *
     * <p>With the pre-existing lcsd row gone but the listing still commercial/OFFICE (still in the
     * rollback's captured target set), the rollback script's Step 3 restore UPDATE matches no row,
     * and Step 5's {@code bad_lcsd_count} sees {@code lcsdPreExisted = true} AND
     * {@code lcsd.listing_id IS NULL} for this target -- counts it, and RAISEs. The rollback
     * itself should not re-trip V135: Step 1's flat revert makes trigger A's own {@code WHEN}
     * clause false (nothing to enqueue), and Step 3 writes no lcsd row here, so the abort observed
     * below comes from Step 5's own {@code RAISE}, not from the #2520 trigger.
     */
    @Test
    void rollbackScript_lcsdDeleteUnderReplicaMode_raisesBadLcsdCount() throws Exception {
        for (int i = 0; i < 4; i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }
        seedEligibleTargetWithPreexistingLcsd(targetIds.get(4), TARGET_SOURCE_IDS[4]);

        runShippedScript(resolveForwardScript());

        // Bypass the #2520 trigger the way a bulk load, restore, or replication apply routinely
        // would. SET LOCAL is scoped to this one explicit transaction, so it cannot outlive this
        // block -- see the class javadoc's Hazard 1: a leaked session_replication_role would
        // silently disarm every V135-interception arm in this suite without any of them turning
        // red, because bypassing a trigger removes a constraint rather than adding one.
        try (Connection bypass = dataSource.getConnection()) {
            bypass.setAutoCommit(false);
            try {
                try (Statement setLocal = bypass.createStatement()) {
                    setLocal.execute("SET LOCAL session_replication_role = replica");
                }
                try (PreparedStatement delete = bypass.prepareStatement(
                        "DELETE FROM public.listing_commercial_space_details "
                                + "WHERE listing_id = ?")) {
                    delete.setObject(1, targetIds.get(4));
                    int deletedRows = delete.executeUpdate();
                    // Hazard 2 / positive control: under normal mode this exact DELETE is
                    // rejected by the #2520 trigger (proven by the sibling arm above). If the
                    // bypass silently failed to apply -- insufficient privilege, wrong scope, a
                    // pooled connection that never saw the SET -- this DELETE would throw here
                    // instead of succeeding, and a bare thrown exception would not say whether
                    // the bypass or something unrelated was at fault. Asserting the row count
                    // is what separates "the bypass worked" from "something else went wrong".
                    assertThat(deletedRows)
                            .as("session_replication_role=replica must actually be in effect: "
                                    + "the #2520-forbidden DELETE must succeed while it applies")
                            .isEqualTo(1);
                }
                bypass.commit();
            } catch (SQLException e) {
                bypass.rollback();
                throw e;
            }

            // On-connection reset proof: run the SAME check that Hazard-2 already proved succeeds
            // under an active bypass, but now on THIS SAME physical connection, AFTER its bypass
            // transaction has committed and BEFORE the connection is released back to the pool.
            // This is the only point in the code where we know which physical connection we are
            // on, so it is the only place this question can actually be answered -- the pooled
            // jdbcTemplate check below only proves SOME connection in the pool has triggers armed,
            // not that THIS bypass connection was reset before being returned.
            //
            // SET CONSTRAINTS ALL IMMEDIATE is required here because the #2520 trigger is a
            // DEFERRABLE INITIALLY DEFERRED constraint trigger (see class javadoc): without it,
            // a violation would only surface at COMMIT, not at this DELETE -- and this connection
            // is about to be rolled back, not committed, so a deferred check would never actually
            // run and this assertion would pass unconditionally regardless of reset state.
            try (Statement forceImmediate = bypass.createStatement()) {
                forceImmediate.execute("SET CONSTRAINTS ALL IMMEDIATE");
            }
            try (PreparedStatement resetCheck = bypass.prepareStatement(
                    "DELETE FROM public.listing_commercial_space_details "
                            + "WHERE listing_id = ?")) {
                resetCheck.setObject(1, targetIds.get(0));
                assertThatThrownBy(resetCheck::executeUpdate)
                        .as("session_replication_role must have reverted on THIS SAME bypass "
                                + "connection once its transaction committed, before it is "
                                + "returned to the pool -- not merely on some other pooled "
                                + "connection")
                        .isInstanceOf(SQLException.class)
                        .hasMessageContaining("but no listing_commercial_space_details row "
                                + "exists. Discover reads the projection, so this row would be "
                                + "invisible to a subtype filter. (#2520)");
            }
            bypass.rollback();
        }

        // Anchored through the trailing ", stray_audit=0" on purpose -- a bare "bad_lcsd=1" is a
        // substring of "bad_lcsd=10", so it would pass while the counter reported ten mismatched
        // rows, which is not what this arm claims. This literal was captured verbatim from the
        // OBSERVED failure output (PSQLException: "post-condition failed (bad_flat=0,
        // missing_lcbd=0, bad_lcsd=1, stray_audit=0). Aborting."), not transcribed from the SQL
        // source: the source reads "bad_lcsd=%", where % is a placeholder that only becomes a
        // number at runtime.
        assertThatThrownBy(() -> runShippedScript(resolveRollbackScript()))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("bad_lcsd=1, stray_audit=0");

        // Reset confirmation: with the bypass transaction already committed and its SET LOCAL
        // reverted, a known #2520-forbidden operation on an untouched target (index 0, also
        // carrying an lcsd row from the forward script's Step 2 upsert) must still be rejected.
        // A test that restores a safety property must demonstrate the property is back, not
        // assume it.
        assertThatThrownBy(() -> jdbcTemplate.update(
                        "DELETE FROM public.listing_commercial_space_details WHERE listing_id = ?",
                        targetIds.get(0)))
                .as("session_replication_role must have reverted after the bypass transaction "
                        + "committed: the #2520 trigger must be armed again for an unrelated target")
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("but no listing_commercial_space_details row exists. "
                        + "Discover reads the projection, so this row would be invisible to a "
                        + "subtype filter. (#2520)");
    }

    /**
     * Second of the pair with {@link #forwardScript_step5_missingLcsdArm_seedIsBlockedByV135Trigger()}.
     * That sibling proves {@code missing_lcsd_count}'s DELETE-branch predicate is unreachable
     * through normal DML -- the #2520 trigger rejects the seeding DELETE outright, at that
     * statement's own commit, before the forward script is ever re-run. That is not the same as
     * the counter being dead: {@code session_replication_role = replica} bypasses user triggers
     * wholesale, and it is routine in bulk loads, restores, and replication apply. This arm
     * proves {@code missing_lcsd_count} is a live guard against exactly that.
     *
     * <p>All five targets are seeded and corrected by one forward-script run, so each carries an
     * lcsd row the script itself created. The corrupting DELETE then runs on a dedicated
     * connection with {@code SET LOCAL session_replication_role = replica} inside an explicit,
     * non-autocommit transaction -- {@code SET LOCAL} is transaction-scoped, so the bypass
     * reverts automatically at commit and can never leak back into the connection pool to
     * disarm the trigger for a later, unrelated test (Hazard 1 from the class javadoc).
     *
     * <p>With one target's lcsd row gone but its flat columns still commercial/OFFICE, the
     * re-run's Gate 3 old-state predicate matches 0 rows (all five are already in the corrected
     * shape), so it passes and steps 1-4 no-op on the (empty) captured set; Gate 4, scoped to
     * that same empty captured set, is vacuously satisfied. Step 5's {@code missing_lcsd_count}
     * -- scoped to all five target ids, not to what this run touched -- sees the missing row and
     * RAISEs.
     */
    @Test
    void forwardScript_lcsdDeleteUnderReplicaMode_raisesMissingLcsdCount() throws Exception {
        for (int i = 0; i < targetIds.size(); i++) {
            seedEligibleTarget(targetIds.get(i), TARGET_SOURCE_IDS[i]);
        }
        runShippedScript(resolveForwardScript());

        // Bypass the #2520 trigger the way a bulk load, restore, or replication apply routinely
        // would. SET LOCAL is scoped to this one explicit transaction, so it cannot outlive this
        // block -- see the class javadoc's Hazard 1: a leaked session_replication_role would
        // silently disarm every V135-interception arm in this suite without any of them turning
        // red, because bypassing a trigger removes a constraint rather than adding one.
        try (Connection bypass = dataSource.getConnection()) {
            bypass.setAutoCommit(false);
            try {
                try (Statement setLocal = bypass.createStatement()) {
                    setLocal.execute("SET LOCAL session_replication_role = replica");
                }
                try (PreparedStatement delete = bypass.prepareStatement(
                        "DELETE FROM public.listing_commercial_space_details "
                                + "WHERE listing_id = ?")) {
                    delete.setObject(1, targetIds.get(0));
                    int deletedRows = delete.executeUpdate();
                    // Hazard 2 / positive control: under normal mode this exact DELETE is
                    // rejected by the #2520 trigger (proven by the sibling arm at
                    // forwardScript_step5_missingLcsdArm_seedIsBlockedByV135Trigger). If the
                    // bypass silently failed to apply -- insufficient privilege, wrong scope, a
                    // pooled connection that never saw the SET -- this DELETE would throw here
                    // instead of succeeding, and a bare thrown exception would not say whether
                    // the bypass or something unrelated was at fault. Asserting the row count is
                    // what separates "the bypass worked" from "something else went wrong".
                    assertThat(deletedRows)
                            .as("session_replication_role=replica must actually be in effect: "
                                    + "the #2520-forbidden DELETE must succeed while it applies")
                            .isEqualTo(1);
                }
                bypass.commit();
            } catch (SQLException e) {
                bypass.rollback();
                throw e;
            }

            // On-connection reset proof: run the SAME check that Hazard-2 already proved succeeds
            // under an active bypass, but now on THIS SAME physical connection, AFTER its bypass
            // transaction has committed and BEFORE the connection is released back to the pool.
            // This is the only point in the code where we know which physical connection we are
            // on, so it is the only place this question can actually be answered -- the pooled
            // jdbcTemplate check below only proves SOME connection in the pool has triggers armed,
            // not that THIS bypass connection was reset before being returned.
            //
            // SET CONSTRAINTS ALL IMMEDIATE is required here because the #2520 trigger is a
            // DEFERRABLE INITIALLY DEFERRED constraint trigger (see class javadoc): without it,
            // a violation would only surface at COMMIT, not at this DELETE -- and this connection
            // is about to be rolled back, not committed, so a deferred check would never actually
            // run and this assertion would pass unconditionally regardless of reset state.
            try (Statement forceImmediate = bypass.createStatement()) {
                forceImmediate.execute("SET CONSTRAINTS ALL IMMEDIATE");
            }
            try (PreparedStatement resetCheck = bypass.prepareStatement(
                    "DELETE FROM public.listing_commercial_space_details "
                            + "WHERE listing_id = ?")) {
                resetCheck.setObject(1, targetIds.get(1));
                assertThatThrownBy(resetCheck::executeUpdate)
                        .as("session_replication_role must have reverted on THIS SAME bypass "
                                + "connection once its transaction committed, before it is "
                                + "returned to the pool -- not merely on some other pooled "
                                + "connection")
                        .isInstanceOf(SQLException.class)
                        .hasMessageContaining("but no listing_commercial_space_details row "
                                + "exists. Discover reads the projection, so this row would be "
                                + "invisible to a subtype filter. (#2520)");
            }
            bypass.rollback();
        }

        // Anchored against the trailing counter (stray_lcbd=0) so this cannot match
        // missing_lcsd=10 or any other multi-digit value -- see the model test above.
        assertThatThrownBy(() -> runShippedScript(resolveForwardScript()))
                .isInstanceOf(SQLException.class)
                .hasMessageContaining("missing_lcsd=1, stray_lcbd=0");

        // Reset confirmation: with the bypass transaction already committed and its SET LOCAL
        // reverted, a known #2520-forbidden operation on an untouched target (index 1, also
        // carrying an lcsd row from the forward script's Step 2 upsert) must still be rejected.
        // A test that restores a safety property must demonstrate the property is back, not
        // assume it.
        assertThatThrownBy(() -> jdbcTemplate.update(
                        "DELETE FROM public.listing_commercial_space_details WHERE listing_id = ?",
                        targetIds.get(1)))
                .as("session_replication_role must have reverted after the bypass transaction "
                        + "committed: the #2520 trigger must be armed again for an unrelated "
                        + "target")
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("but no listing_commercial_space_details row exists. "
                        + "Discover reads the projection, so this row would be invisible to a "
                        + "subtype filter. (#2520)");
    }

    // ═════════════════════════════════════════════════════════════════════════════════════════
    // Helpers
    // ═════════════════════════════════════════════════════════════════════════════════════════

    private Path resolveForwardScript() {
        Path resolved = Paths.get(System.getProperty("user.dir"))
                .resolve(FORWARD_SCRIPT_RELATIVE_PATH)
                .normalize()
                .toAbsolutePath();
        assertThat(Files.exists(resolved))
                .as("shipped script must exist at resolved path: %s (user.dir=%s)",
                        resolved, System.getProperty("user.dir"))
                .isTrue();
        return resolved;
    }

    private Path resolveRollbackScript() {
        Path resolved = Paths.get(System.getProperty("user.dir"))
                .resolve(ROLLBACK_SCRIPT_RELATIVE_PATH)
                .normalize()
                .toAbsolutePath();
        assertThat(Files.exists(resolved))
                .as("shipped script must exist at resolved path: %s (user.dir=%s)",
                        resolved, System.getProperty("user.dir"))
                .isTrue();
        return resolved;
    }

    private Path resolveCleanupScript() {
        Path resolved = Paths.get(System.getProperty("user.dir"))
                .resolve(CLEANUP_SCRIPT_RELATIVE_PATH)
                .normalize()
                .toAbsolutePath();
        assertThat(Files.exists(resolved))
                .as("shipped script must exist at resolved path: %s (user.dir=%s)",
                        resolved, System.getProperty("user.dir"))
                .isTrue();
        return resolved;
    }

    /**
     * Executes a shipped SQL file's full text as a single batch against a raw, autocommitting
     * JDBC connection. Deliberately does NOT split on {@code ;}: the file's {@code DO $$ ... $$}
     * blocks contain semicolons in their bodies, and pgjdbc's simple query protocol (used by a
     * plain {@code Statement}, unlike a {@code PreparedStatement}) already parses dollar-quoting
     * and multi-statement batches correctly — the same way {@code psql -f} would.
     *
     * <p>JDBC {@code autoCommit=true} only governs statements sent directly over this
     * {@link Statement}; it does not reach inside the script's own text. Every shipped script
     * opens its own real Postgres transaction with an explicit {@code BEGIN;}, so when a
     * {@code RAISE EXCEPTION} inside a {@code DO $$ ... $$} block aborts that transaction,
     * {@code statement.execute(sql)} throws and the connection is left server-side aborted —
     * autoCommit never gets a chance to close out a transaction it didn't open. Returning that
     * connection to the pool (this datasource is the same Hikari-pooled one backing
     * {@code jdbcTemplate}) without rolling it back first would poison every later test that
     * happens to draw the same physical connection: the next statement on it fails with SQL state
     * 25P02 ("current transaction is aborted"), regardless of what that later test is actually
     * asserting. So on the exception path, explicitly roll back the aborted transaction before
     * the try-with-resources hands the connection back — this only restores the connection to a
     * clean, reusable state; it does not change the exception thrown to the caller, so every
     * arm's own {@code assertThatThrownBy} still observes the exact same exception type and
     * message text as before.
     *
     * <p>The rollback itself MUST be issued as a raw {@code ROLLBACK} SQL statement, not via
     * {@link Connection#rollback()}: this connection has {@code autoCommit=true}, and the JDBC
     * spec (enforced by pgjdbc) forbids calling {@code Connection.rollback()} on an
     * auto-committing connection — it throws {@code SQLException: Cannot rollback: connection is
     * in auto-commit mode} instead of rolling back, which would both replace the arm's expected
     * exception with this unrelated one AND leave the real server-side transaction aborted,
     * continuing to poison the pool. A plain {@code ROLLBACK} sent as SQL text is not gated by
     * the driver's client-side autoCommit flag, so it reaches Postgres and actually clears the
     * aborted transaction.
     */
    private void runShippedScript(Path script) throws Exception {
        String sql = Files.readString(script, StandardCharsets.UTF_8);
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(true);
            try (Statement statement = connection.createStatement()) {
                statement.execute(sql);
            } catch (SQLException e) {
                try (Statement rollback = connection.createStatement()) {
                    rollback.execute("ROLLBACK");
                }
                throw e;
            }
        }
    }

    /** Deterministic id the #2304 import used: md5("99acres:" + sourceId), formatted as a UUID. */
    private static UUID idFor(String sourceId) {
        try {
            MessageDigest md5 = MessageDigest.getInstance("MD5");
            byte[] digest = md5.digest(("99acres:" + sourceId).getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(32);
            for (byte b : digest) {
                hex.append(String.format("%02x", b));
            }
            String h = hex.toString();
            String uuidText = h.substring(0, 8) + "-" + h.substring(8, 12) + "-"
                    + h.substring(12, 16) + "-" + h.substring(16, 20) + "-" + h.substring(20, 32);
            return UUID.fromString(uuidText);
        } catch (Exception e) {
            throw new IllegalStateException("failed to derive fixture id for " + sourceId, e);
        }
    }

    /**
     * Seeds one row that satisfies every gate the forward script checks before Step 1: identity +
     * provenance (id list membership, {@code parsed_data->>'importIssue'='2304'} and
     * {@code parsed_data->>'source'='99acres'}), old state ({@code commercial_building}/
     * {@code BUILDING}), and an lcbd row (Gate 4 — the rollback pre-image source).
     */
    private void seedEligibleTarget(UUID id, String sourceId) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, property_type, "
                        + " listing_family, commercial_subtype, floor_number, total_floors, "
                        + " furnishing_status, washrooms, parking_count, road_frontage_ft, "
                        + " commercial_usage, latitude, longitude, price_paise, parsed_data, "
                        + " created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, 'commercial_building', "
                        + " 'COMMERCIAL', 'BUILDING', 2, 4, 'UNFURNISHED', 1, 3, 40, 'RETAIL', "
                        + " 13.0, 74.0, 5000000, "
                        + " jsonb_build_object('importIssue', '2304', 'source', '99acres'), ?, ?)",
                id, "2575|OfficeSubtypeCorrection|fixture", now, now);

        jdbcTemplate.update(
                "INSERT INTO public.listing_commercial_building_details "
                        + "(listing_id, number_of_units, total_floors, road_frontage_ft, commercial_usage) "
                        + "VALUES (?, 1, 4, 40, 'RETAIL')",
                id);
    }

    /**
     * Sibling of {@link #seedEligibleTarget} for the round-trip arm: same eligible old-state
     * shape (identity + provenance, {@code commercial_building}/{@code BUILDING}, an lcbd row),
     * but with caller-supplied, per-row-distinct lcbd values (including an explicit
     * microsecond-precision {@code created_at}) instead of {@code seedEligibleTarget}'s
     * hardcoded, identical-across-rows values. Not a reuse of {@code seedEligibleTarget}: that
     * method's fixed lcbd values would make a "restored exactly" assertion unfalsifiable.
     * Mirrors {@code seedEligibleTarget} in hardcoding {@code area_key} to the fixture literal
     * regardless of {@code sourceId} (the forward script's provenance gates key off
     * {@code parsed_data}, not {@code area_key}).
     */
    private void seedEligibleTargetWithDistinctLcbd(
            UUID id,
            String sourceId,
            int numberOfUnits,
            int totalFloors,
            BigDecimal roadFrontageFt,
            String commercialUsage,
            OffsetDateTime lcbdCreatedAt) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, property_type, "
                        + " listing_family, commercial_subtype, floor_number, total_floors, "
                        + " furnishing_status, washrooms, parking_count, road_frontage_ft, "
                        + " commercial_usage, latitude, longitude, price_paise, parsed_data, "
                        + " created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, 'commercial_building', "
                        + " 'COMMERCIAL', 'BUILDING', 2, 4, 'UNFURNISHED', 1, 3, 40, 'RETAIL', "
                        + " 13.0, 74.0, 5000000, "
                        + " jsonb_build_object('importIssue', '2304', 'source', '99acres'), ?, ?)",
                id, "2575|OfficeSubtypeCorrection|fixture", now, now);

        jdbcTemplate.update(
                "INSERT INTO public.listing_commercial_building_details "
                        + "(listing_id, number_of_units, total_floors, road_frontage_ft, commercial_usage, "
                        + " created_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?)",
                id, numberOfUnits, totalFloors, roadFrontageFt, commercialUsage,
                Timestamp.from(lcbdCreatedAt.toInstant()));
    }

    /**
     * Captures the current lcbd row for {@code id} as a bit-for-bit comparable snapshot,
     * including {@code created_at} to microsecond precision. Reads {@code road_frontage_ft} as
     * {@link BigDecimal} rather than {@code getObject(col, Double.class)} -- the latter throws
     * and aborts the whole query for a {@code numeric} column.
     */
    private LcbdPreImage captureLcbdPreImage(UUID id) {
        return jdbcTemplate.queryForObject(
                "SELECT number_of_units, total_floors, road_frontage_ft, commercial_usage, created_at "
                        + "FROM public.listing_commercial_building_details WHERE listing_id = ?",
                (rs, rowNum) -> new LcbdPreImage(
                        rs.getInt("number_of_units"),
                        rs.getInt("total_floors"),
                        rs.getBigDecimal("road_frontage_ft"),
                        rs.getString("commercial_usage"),
                        rs.getObject("created_at", OffsetDateTime.class)),
                id);
    }

    private record LcbdPreImage(
            int numberOfUnits,
            int totalFloors,
            BigDecimal roadFrontageFt,
            String commercialUsage,
            OffsetDateTime createdAt) {}

    /**
     * Full observable state of one target used to prove a second rollback run is a true no-op:
     * flat columns, the lcbd row, the lcsd count, and whether the audit key is still present.
     */
    private record RollbackState(
            String propertyType,
            String commercialSubtype,
            LcbdPreImage lcbd,
            int lcsdCount,
            boolean hasAuditKey) {}

    private RollbackState captureRollbackState(UUID id) {
        String propertyType = jdbcTemplate.queryForObject(
                "SELECT property_type FROM property_listings WHERE id = ?", String.class, id);
        String commercialSubtype = jdbcTemplate.queryForObject(
                "SELECT commercial_subtype FROM property_listings WHERE id = ?", String.class, id);
        Boolean hasAuditKey = jdbcTemplate.queryForObject(
                "SELECT jsonb_exists(parsed_data, 'fix2575RollbackAudit') "
                        + "FROM property_listings WHERE id = ?",
                Boolean.class, id);
        Integer lcsdCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM listing_commercial_space_details WHERE listing_id = ?",
                Integer.class, id);
        return new RollbackState(
                propertyType, commercialSubtype, captureLcbdPreImage(id), lcsdCount, hasAuditKey);
    }

    /**
     * Seeds one row already in the CORRECTED (post-fix) shape: property_type='commercial',
     * commercial_subtype='OFFICE', with a matching listing_commercial_space_details row whose
     * commercial_subtype is also 'OFFICE' (no lcbd row -- Step 4 already removed it on the run
     * this simulates having happened). The matching lcsd row is required: V135's
     * assert_commercial_subtype_projected guard is DEFERRABLE INITIALLY DEFERRED and fires at
     * COMMIT, so a commercial/OFFICE flat row with no lcsd projection would make the seed itself
     * raise "commercial_subtype projection missing" before the forward script ever runs.
     *
     * <p>Both inserts MUST land in the same transaction. Under this test class's
     * {@code Propagation.NOT_SUPPORTED}, two independent {@code jdbcTemplate.update(...)} calls
     * are NOT atomic with each other -- each autocommits as its own transaction -- so the deferred
     * trigger would evaluate (and raise) at the first insert's own commit, before the second
     * (lcsd) row exists. This mirrors {@link #runShippedScript(Path)}'s manually-managed
     * connection: obtain one directly from {@code dataSource}, disable autocommit, run both
     * inserts as {@link PreparedStatement}s, and commit once so the trigger sees both rows
     * together.
     */
    private void seedAlreadyCorrectedTarget(UUID id, String sourceId) throws SQLException {
        Timestamp now = Timestamp.from(OffsetDateTime.now().toInstant());
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                try (PreparedStatement listing = connection.prepareStatement(
                        "INSERT INTO public.property_listings "
                                + "(id, area_key, status, archived_at, is_duplicate, is_valid, property_type, "
                                + " listing_family, commercial_subtype, floor_number, total_floors, "
                                + " furnishing_status, washrooms, parking_count, road_frontage_ft, "
                                + " commercial_usage, latitude, longitude, price_paise, parsed_data, "
                                + " created_at, updated_at) "
                                + "VALUES (?, ?, 'LIVE', NULL, false, true, 'commercial', "
                                + " 'COMMERCIAL', 'OFFICE', 2, 4, 'UNFURNISHED', 1, 3, 40, 'RETAIL', "
                                + " 13.0, 74.0, 5000000, "
                                + " jsonb_build_object('importIssue', '2304', 'source', '99acres'), ?, ?)")) {
                    listing.setObject(1, id);
                    listing.setString(2, "2575|OfficeSubtypeCorrection|fixture");
                    listing.setTimestamp(3, now);
                    listing.setTimestamp(4, now);
                    listing.executeUpdate();
                }

                try (PreparedStatement lcsd = connection.prepareStatement(
                        "INSERT INTO public.listing_commercial_space_details "
                                + "(listing_id, commercial_subtype, floor_number, total_floors, "
                                + " furnishing_status, washrooms, parking_count, road_frontage_ft, "
                                + " commercial_usage, created_at) "
                                + "VALUES (?, 'OFFICE', 2, 4, 'UNFURNISHED', 1, 3, 40, 'RETAIL', ?)")) {
                    lcsd.setObject(1, id);
                    lcsd.setTimestamp(2, now);
                    lcsd.executeUpdate();
                }

                connection.commit();
            } catch (SQLException e) {
                connection.rollback();
                throw e;
            }
        }
    }

    /**
     * Seeds one row in the OLD/eligible (commercial_building/BUILDING) shape -- same as
     * {@link #seedEligibleTarget(UUID, String)}, including its matching
     * listing_commercial_building_details row -- but ALSO seeds a pre-existing
     * listing_commercial_space_details row for the same listing_id, with values distinct from
     * what the forward script's Step 2 UPSERT will later set (2/4/1/3/40), so the pre-existing
     * row is distinguishable if needed.
     *
     * <p>This makes the forward script's pre_image CTE capture {@code lcsdPreExisted = true} for
     * this target (its {@code LEFT JOIN listing_commercial_space_details} finds a match), which
     * in turn obliges the rollback script's Step 3 to RESTORE this listing's lcsd row rather than
     * DELETE it. Seeding the lcsd row while the listing is still commercial_building/BUILDING
     * (not commercial/OFFICE) does not risk the #2520 DEFERRABLE
     * assert_commercial_subtype_projected guard: the eager {@code WHEN} clause on that trigger's
     * property_listings-side copy only fires for {@code property_type = 'commercial'}, which this
     * seed row is not.
     *
     * <p>All three inserts (listing, lcbd, lcsd) land in one transaction, for the same reason
     * documented on {@link #seedAlreadyCorrectedTarget(UUID, String)}: under this test class's
     * {@code Propagation.NOT_SUPPORTED}, independent {@code jdbcTemplate.update(...)} calls are
     * not atomic with each other.
     */
    private void seedEligibleTargetWithPreexistingLcsd(UUID id, String sourceId) throws SQLException {
        Timestamp now = Timestamp.from(OffsetDateTime.now().toInstant());
        try (Connection connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try {
                try (PreparedStatement listing = connection.prepareStatement(
                        "INSERT INTO public.property_listings "
                                + "(id, area_key, status, archived_at, is_duplicate, is_valid, property_type, "
                                + " listing_family, commercial_subtype, floor_number, total_floors, "
                                + " furnishing_status, washrooms, parking_count, road_frontage_ft, "
                                + " commercial_usage, latitude, longitude, price_paise, parsed_data, "
                                + " created_at, updated_at) "
                                + "VALUES (?, ?, 'LIVE', NULL, false, true, 'commercial_building', "
                                + " 'COMMERCIAL', 'BUILDING', 2, 4, 'UNFURNISHED', 1, 3, 40, 'RETAIL', "
                                + " 13.0, 74.0, 5000000, "
                                + " jsonb_build_object('importIssue', '2304', 'source', '99acres'), ?, ?)")) {
                    listing.setObject(1, id);
                    listing.setString(2, "2575|OfficeSubtypeCorrection|fixture");
                    listing.setTimestamp(3, now);
                    listing.setTimestamp(4, now);
                    listing.executeUpdate();
                }
                try (PreparedStatement lcbd = connection.prepareStatement(
                        "INSERT INTO public.listing_commercial_building_details "
                                + "(listing_id, number_of_units, total_floors, road_frontage_ft, commercial_usage) "
                                + "VALUES (?, 1, 4, 40, 'RETAIL')")) {
                    lcbd.setObject(1, id);
                    lcbd.executeUpdate();
                }
                try (PreparedStatement lcsd = connection.prepareStatement(
                        "INSERT INTO public.listing_commercial_space_details "
                                + "(listing_id, commercial_subtype, floor_number, total_floors, "
                                + " furnishing_status, washrooms, parking_count, road_frontage_ft, "
                                + " commercial_usage, created_at) "
                                + "VALUES (?, 'OFFICE', 9, 12, 'UNFURNISHED', 7, 9, 88, 'RETAIL', ?)")) {
                    lcsd.setObject(1, id);
                    lcsd.setTimestamp(2, now);
                    lcsd.executeUpdate();
                }
                connection.commit();
            } catch (SQLException e) {
                connection.rollback();
                throw e;
            }
        }
    }
}

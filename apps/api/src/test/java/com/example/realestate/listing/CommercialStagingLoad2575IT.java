package com.example.realestate.listing;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import javax.sql.DataSource;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Issue #2575 — proves the SEAM: the adapter's generated load SQL actually applies to the V136
 * staging tables in real Postgres.
 *
 * <p><b>Why this exists.</b> The adapter and V136 were each verified independently while the join
 * between them was not, and `load_staging_sql.py` emits SQL that its own Python pre-check
 * approves. That pre-check is not the authority — Postgres is. The distinction is not theoretical:
 * the first generated SQL passed `LOAD_SQL: PASS` while almost certainly being unappliable, because
 * `INSERT ... SELECT FROM (VALUES ...)` makes Postgres infer column types and three columns
 * ({@code monthly_rent}, {@code floor_number}, {@code commercial_furnishing_status}) are NULL in
 * every row of both captures, inferring as {@code text} and failing to coerce into BIGINT/INTEGER.
 * A green self-check sitting on top of SQL the database rejects is exactly the failure this class
 * is here to make impossible.
 *
 * <p><b>DELIBERATELY UNTAGGED.</b> Surefire includes {@code **&#47;*IT.java} and excludes the
 * {@code integration} group, so an untagged IT runs under a plain {@code mvn test}; every
 * {@code -P} profile skips surefire and narrows failsafe to one named file, so this under a
 * profile would execute nowhere and still report success.
 *
 * <p><b>{@code Propagation.NOT_SUPPORTED}</b> because the generated files carry their own
 * BEGIN/COMMIT and the idempotency case needs two real commits.
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
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class CommercialStagingLoad2575IT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    /** Repo-relative: surefire's working directory is the apps/api module root. */
    private static final Path IMPORTS =
            Path.of("..", "..", "data", "imports", "commercial-inventory-2575");

    private static final String UDUPI_SQL = "udupi-load-staging.sql";
    private static final String BLR_SQL = "bengaluru-load-staging.sql";
    private static final String MLR_SQL = "mangalore-load-staging.sql";

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private DataSource dataSource;

    /** Applies a generated file verbatim. The file supplies its own BEGIN/COMMIT. */
    private void applyGenerated(String fileName) throws Exception {
        String sql = Files.readString(IMPORTS.resolve(fileName));
        try (Connection c = dataSource.getConnection(); Statement st = c.createStatement()) {
            st.execute(sql);
        }
    }

    private long count(String sql) {
        Long n = jdbc.queryForObject(sql, Long.class);
        return n == null ? 0L : n;
    }

    @BeforeEach
    void clean() {
        // NOT_SUPPORTED means nothing rolls back for us. FK order matters.
        jdbc.update("DELETE FROM public.commercial_import_candidate");
        jdbc.update("DELETE FROM public.commercial_import_batch");
    }

    @Test
    @DisplayName("the generated Udupi load APPLIES to real Postgres and lands 11 staged / 89 rejected")
    void udupiLoadApplies() throws Exception {
        applyGenerated(UDUPI_SQL);

        assertThat(count("SELECT count(*) FROM commercial_import_batch"))
                .as("exactly one batch row per applied file").isEqualTo(1);
        assertThat(count("SELECT count(*) FROM commercial_import_candidate"))
                .as("every fetched row is loaded, rejects included").isEqualTo(100);
        assertThat(count("SELECT count(*) FROM commercial_import_candidate WHERE outcome='STAGED'"))
                .isEqualTo(11);
        assertThat(count("SELECT count(*) FROM commercial_import_candidate WHERE outcome='REJECTED'"))
                .isEqualTo(89);
    }

    @Test
    @DisplayName("the generated Bengaluru load APPLIES and lands 32 staged / 68 rejected")
    void bengaluruLoadApplies() throws Exception {
        applyGenerated(BLR_SQL);

        assertThat(count("SELECT count(*) FROM commercial_import_candidate")).isEqualTo(100);
        assertThat(count("SELECT count(*) FROM commercial_import_candidate WHERE outcome='STAGED'"))
                .isEqualTo(32);
        assertThat(count("SELECT count(*) FROM commercial_import_candidate WHERE outcome='REJECTED'"))
                .isEqualTo(68);
        assertThat(count("""
                SELECT count(*) FROM commercial_import_candidate
                WHERE outcome='STAGED' AND commercial_subtype='WAREHOUSE'
                """))
                .as("WAREHOUSE reaches staging — the subtype Udupi could not populate at all")
                .isEqualTo(2);
    }

    @Test
    @DisplayName("the generated Mangalore load APPLIES and lands 18 staged / 82 rejected")
    void mangaloreLoadApplies() throws Exception {
        // ADDED BECAUSE THIS CLASS'S OWN DOCTRINE DEMANDED IT. Mangalore was the one city whose
        // generated load artefact had never been applied to a real database, while the PR's
        // evidence table reported "load SQL PASS" for it — and that figure comes from
        // load_staging_sql.py's PYTHON pre-check, which is precisely the instrument this class
        // exists to distrust: staging-load-report.md section 3 records a case where that check
        // printed PASS over SQL Postgres could not apply.
        //
        // The risk was not hypothetical in shape, only in likelihood: promote.sql is all-or-nothing
        // across every batch, so an operator applying this file and then promoting would carry 18
        // rows through a staging apply no test had exercised. Raised as MEDIUM-1 in the exact-head
        // review of 393c8cd1.
        applyGenerated(MLR_SQL);

        assertThat(count("SELECT count(*) FROM commercial_import_candidate")).isEqualTo(100);
        assertThat(count("SELECT count(*) FROM commercial_import_candidate WHERE outcome='STAGED'"))
                .isEqualTo(18);
        assertThat(count("SELECT count(*) FROM commercial_import_candidate WHERE outcome='REJECTED'"))
                .isEqualTo(82);

        // The reject reason that only Mangalore exercises. `unsupported_area_unit` was documented
        // in the adapter as "currently unreachable" while both earlier captures were sqft-only;
        // this capture makes it live, so the claim is now asserted rather than narrated.
        assertThat(count("""
                SELECT count(*) FROM commercial_import_candidate
                WHERE outcome='REJECTED' AND reject_reason='unsupported_area_unit'
                """))
                .as("the guard a comment once called unreachable rejects 3 real rows here")
                .isEqualTo(3);

        assertThat(count("""
                SELECT count(*) FROM commercial_import_candidate
                WHERE outcome='STAGED' AND commercial_subtype='SHOP'
                """))
                .as("SHOP includes the rows reached only by the new bare 'Shop' label mapping")
                .isEqualTo(4);
    }

    @Test
    @DisplayName("both cities coexist — the identity key is per source listing, not per city")
    void bothCitiesCoexist() throws Exception {
        applyGenerated(UDUPI_SQL);
        applyGenerated(BLR_SQL);

        assertThat(count("SELECT count(*) FROM commercial_import_batch")).isEqualTo(2);
        assertThat(count("SELECT count(*) FROM commercial_import_candidate")).isEqualTo(200);
        assertThat(count("SELECT count(*) FROM commercial_import_candidate WHERE outcome='STAGED'"))
                .as("11 Udupi + 32 Bengaluru").isEqualTo(43);
    }

    @Test
    @DisplayName("re-applying the same load UPDATES in place — a rerun never duplicates")
    void reapplyingIsIdempotent() throws Exception {
        applyGenerated(UDUPI_SQL);
        long after1 = count("SELECT count(*) FROM commercial_import_candidate");

        applyGenerated(UDUPI_SQL);

        assertThat(count("SELECT count(*) FROM commercial_import_candidate"))
                .as("#2575: a repeated run is idempotent on the candidate identity")
                .isEqualTo(after1);
        assertThat(count("SELECT count(*) FROM commercial_import_batch"))
                .as("batches are an audit trail — a second apply is a second batch, by design")
                .isEqualTo(2);
        assertThat(count("""
                SELECT count(DISTINCT batch_id) FROM commercial_import_candidate
                """))
                .as("candidates repoint to the newest batch rather than splitting across both")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("the seam end to end: a known capture row arrives with its mapped subtype and provenance")
    void seamCarriesARowFromCaptureToStaging() throws Exception {
        applyGenerated(UDUPI_SQL);

        // M91395690 is one of the five office listings #2594 corrected. Post-sync it must be
        // property_type 'commercial' + OFFICE — the classification that makes it reachable by an
        // OFFICE filter and guarded by V135 once promoted.
        assertThat(jdbc.queryForMap("""
                SELECT property_type, commercial_subtype, listing_purpose, payload_checksum
                FROM commercial_import_candidate WHERE source_listing_id='M91395690'
                """))
                .containsEntry("property_type", "commercial")
                .containsEntry("commercial_subtype", "OFFICE")
                .containsEntry("listing_purpose", "sale");

        assertThat(count("""
                SELECT count(*) FROM commercial_import_candidate
                WHERE raw_payload = '{}'::jsonb OR payload_checksum IS NULL
                """))
                .as("every row carries its source payload and checksum — provenance is not optional")
                .isZero();

        assertThat(count("""
                SELECT count(*) FROM commercial_import_candidate
                WHERE raw_payload -> '_derived' ->> 'area_resolution_reason' IS NOT NULL
                  AND outcome = 'STAGED'
                """))
                .as("area_resolution_reason survives into raw_payload — V136 has no column for it, "
                    + "and dropping provenance silently is what this preserves against")
                .isEqualTo(11);
    }

    @Test
    @DisplayName("every REJECTED row carries a reason — rejects are inspectable rows, not absences")
    void rejectsCarryReasons() throws Exception {
        applyGenerated(UDUPI_SQL);

        assertThat(count("""
                SELECT count(*) FROM commercial_import_candidate
                WHERE outcome='REJECTED' AND (reject_reason IS NULL OR reject_reason='')
                """)).isZero();
        assertThat(count("""
                SELECT count(DISTINCT reject_reason) FROM commercial_import_candidate
                WHERE outcome='REJECTED'
                """))
                .as("the five Udupi reject reasons are all represented").isEqualTo(5);
    }

    @Test
    @DisplayName("CONTROL: the V136 CHECKs actually bite (so the assertions above are not vacuous)")
    void v136ConstraintsHaveTeeth() throws Exception {
        applyGenerated(UDUPI_SQL);
        Integer batchId = jdbc.queryForObject(
                "SELECT id FROM commercial_import_batch ORDER BY id DESC LIMIT 1", Integer.class);

        // Without this control, every constraint assertion above would pass identically against a
        // database whose CHECKs had been dropped — they would only show that the generated data
        // happens to comply, not that the schema forbids the alternative.
        //
        // COVERAGE NOTE: an earlier revision armed three of the six V136 CHECKs and omitted
        // chk_cic_promoted_not_rejected — which is the constraint added as the PREVIOUS review's
        // MED-2 remediation. A teeth control that skips the most recently added constraint is the
        // one gap most likely to matter, because that constraint has the least history behind it.
        // It is armed below.
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO commercial_import_candidate
                    (batch_id, source_platform, source_listing_id, outcome, reject_reason)
                VALUES (?, '99acres', 'SYNTH-VIOLATION-4', 'PROMOTED', 'coordinate_untrusted')
                """, batchId))
                .as("a PROMOTED row carrying a reject_reason must be rejected by "
                    + "chk_cic_promoted_not_rejected — the constraint that stops a "
                    + "coordinate-untrusted row being promoted by an UPDATE")
                .hasMessageContaining("chk_cic_promoted_not_rejected");

        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO commercial_import_candidate
                    (batch_id, source_platform, source_listing_id, listing_purpose,
                     monthly_rent, outcome)
                VALUES (?, '99acres', 'SYNTH-VIOLATION-1', 'sale', 45000, 'STAGED')
                """, batchId))
                .as("a sale row carrying monthly_rent must be rejected by chk_cic_purpose_money")
                .hasMessageContaining("chk_cic_purpose_money");

        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO commercial_import_candidate
                    (batch_id, source_platform, source_listing_id, outcome, reject_reason)
                VALUES (?, '99acres', 'SYNTH-VIOLATION-2', 'REJECTED', NULL)
                """, batchId))
                .as("a REJECTED row with no reason must be rejected by chk_cic_reject_reason")
                .hasMessageContaining("chk_cic_reject_reason");

        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO commercial_import_candidate
                    (batch_id, source_platform, source_listing_id, outcome, commercial_subtype)
                VALUES (?, '99acres', 'SYNTH-VIOLATION-3', 'STAGED', 'PENTHOUSE')
                """, batchId))
                .as("a sixth subtype must be rejected by chk_cic_subtype — no taxonomy fork")
                .hasMessageContaining("chk_cic_subtype");

        // chk_cic_listing_purpose — the 'lease' door. LEASE is the value chk_listing_purpose
        // (V32) refuses on property_listings, so staging must refuse it too or the staging
        // table becomes a way in that the live table would have blocked.
        //
        // NOTE ON WHAT THIS CAN AND CANNOT ISOLATE. A 'lease' row violates chk_cic_purpose_money
        // as well: that constraint's only satisfying branches are NULL, sale-with-no-rent and
        // rent-with-no-price, so ANY third purpose value fails both constraints at once. There is
        // therefore no row that violates chk_cic_listing_purpose alone, and which name Postgres
        // reports is an ordering detail of the two CHECKs, not a property of the schema. The
        // assertion below names the constraint this arm is for; the count that follows asserts the
        // BEHAVIOUR that actually matters — no 'lease' row exists afterwards — so this arm still
        // has teeth regardless of which of the two names the error carries.
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO commercial_import_candidate
                    (batch_id, source_platform, source_listing_id, listing_purpose, outcome)
                VALUES (?, '99acres', 'SYNTH-VIOLATION-5', 'lease', 'STAGED')
                """, batchId))
                .as("'lease' must be refused at the staging door, mirroring chk_listing_purpose (V32)")
                .hasMessageContaining("chk_cic_listing_purpose");

        assertThat(count("""
                SELECT count(*) FROM commercial_import_candidate WHERE listing_purpose = 'lease'
                """))
                .as("and no 'lease' row survives the attempt — the behaviour the constraint exists for")
                .isZero();

        // chk_cic_outcome — the SIXTH and last V136 CHECK, and the one this control omitted until
        // an exact-head reviewer pointed at it. It matters more than its lateness suggests:
        // `outcome` is what partitions rejected rows from promotable ones, and promote.sql selects
        // on it, so an unconstrained third value would be a silent way into the promotion path.
        //
        // UNLIKE the 'lease' arm above, this one IS cleanly isolable, and the contrast is the
        // useful part. 'MAYBE' satisfies every other constraint on the table: chk_cic_reject_reason
        // and chk_cic_promoted_not_rejected are both vacuously true because the outcome is neither
        // REJECTED nor PROMOTED, and the money/subtype/purpose checks pass on NULL columns. So
        // exactly one constraint can reject this row, and naming it is a property of the schema
        // rather than an artefact of CHECK evaluation order.
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO commercial_import_candidate
                    (batch_id, source_platform, source_listing_id, outcome)
                VALUES (?, '99acres', 'SYNTH-VIOLATION-6', 'MAYBE')
                """, batchId))
                .as("a fourth outcome value must be rejected by chk_cic_outcome — the column that "
                    + "decides which rows promote at all")
                .hasMessageContaining("chk_cic_outcome");

        assertThat(count("""
                SELECT count(*) FROM commercial_import_candidate
                WHERE outcome NOT IN ('STAGED', 'REJECTED', 'PROMOTED')
                """))
                .as("and no row outside the three permitted outcomes survives")
                .isZero();
    }
}

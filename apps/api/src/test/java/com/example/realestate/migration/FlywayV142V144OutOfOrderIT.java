package com.example.realestate.migration;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationState;
import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.flywaydb.core.api.exception.FlywayValidateException;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Regression guard for the production incident of 2026-09-23: PR #2681 (#2675, Mangalore/Kundapur
 * region policy) and PR #2682 (#2680, Commercial staging RLS) both forked from
 * {@code main@470d970a} and both allocated {@code V142}. #2682 was merged first and its own
 * second commit mechanically renumbered its migration V142 -> V143 (see
 * {@code FlywayV126V127UpgradePathsIT} for the #2272 precedent of this exact failure shape).
 * #2681 merged afterwards still carrying its original {@code V142} filename, so production ended
 * up with V143 already applied (from the earlier deploy) and a newer deploy trying to resolve a
 * V142 file — a version BELOW the highest already-applied version. Flyway's default
 * {@code outOfOrder=false} validation rejects that outright, which is exactly what blocked the
 * production deploy: the app log recorded
 * {@code "Detected resolved migration not applied to database: 142."} wrapped in a
 * {@code FlywayValidateException}, and the Spring context failed to start.
 *
 * <p>This class reproduces that failure mode directly against a real Postgres (RED), then proves
 * the chosen fix — renaming the never-applied V142 file to V144, leaving the already-live V143
 * completely untouched — migrates the identical database cleanly, in order (GREEN). Neither arm
 * touches {@code outOfOrder}, {@code ignoreMigrationPatterns}, {@code repair()}, or
 * {@code flyway_schema_history} by hand.
 */
@Testcontainers(disabledWithoutDocker = true)
class FlywayV142V144OutOfOrderIT {

    @Container
    PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private FluentConfiguration baseConfig() {
        return Flyway.configure()
                .dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("classpath:db/test-stubs", "classpath:db/migration")
                .mixed(true)
                .placeholders(Map.of("concurrently_keyword", ""));
    }

    @Test
    @DisplayName("RED: reproduces the real incident — with V143 already applied (prod's actual "
            + "deployed history), resolving the pre-fix V142 file (a version BELOW the applied max) "
            + "fails Flyway validation with the exact production error, "
            + "'Detected resolved migration not applied to database: 142'")
    void productionIncidentReproduction_v142AfterV143Applied_failsValidation() throws Exception {
        // Arrange: bring this database to exactly prod's real deployed history — V140, V141, V143
        // applied, V142 never applied anywhere (confirmed via flyway_schema_history in the #2680
        // incident investigation: no row for version 142 in any reachable environment).
        Flyway toV141 = baseConfig().target("141").load();
        assertDoesNotThrow(toV141::migrate);

        Flyway toV143 = baseConfig().target("143").load();
        assertDoesNotThrow(toV143::migrate);
        assertThat(findByVersion(toV143, "143"))
                .as("V143 applied, matching prod's real deployed history").isNotNull();
        assertThat(findByVersion(toV143, "142"))
                .as("V142 never applied anywhere, matching prod").isNull();

        // Act: reintroduce the ORIGINAL (pre-fix) V142 filename — byte-identical SQL to today's
        // V144, only the version token differs — as the sole resolved location. This simulates a
        // deploy still carrying the colliding V142 file against this same, already-at-V143
        // database, exactly as production was on 2026-09-23T15:42-15:45Z.
        Path staleMigrationDir = Files.createTempDirectory("flyway-v142-repro");
        Path v144Source = classpathFile("db/migration/V144__seed_mangalore_kundapur_region_policy.sql");
        Files.copy(v144Source, staleMigrationDir.resolve("V142__seed_mangalore_kundapur_region_policy.sql"));

        Flyway staleFlyway = Flyway.configure()
                .dataSource(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword())
                .locations("filesystem:" + staleMigrationDir)
                .mixed(true)
                .load();

        // Assert: the exact production failure mode. Default outOfOrder=false means a resolved
        // migration whose version is lower than the highest already-applied version fails
        // validation (which migrate() runs first, validateOnMigrate defaulting to true) rather
        // than silently applying or silently skipping it.
        FlywayValidateException ex =
                catchThrowableOfType(staleFlyway::migrate, FlywayValidateException.class);
        assertThat(ex).as("migrate() must fail validation exactly as it did in production").isNotNull();
        assertThat(ex.getMessage())
                .as("must reproduce the literal production log line, not a generic Flyway failure")
                .contains("142")
                .containsIgnoringCase("not applied to database");
    }

    @Test
    @DisplayName("GREEN: the renumbered fix (V141 -> V143 -> V144) migrates the SAME already-at-V143 "
            + "database cleanly, in order — no outOfOrder, ignoreMigrationPatterns, repair(), or "
            + "flyway_schema_history edits — and V143 is left exactly as it was")
    void renumberedFix_v144AfterV143_migratesCleanlyInOrder() {
        Flyway toV141 = baseConfig().target("141").load();
        assertDoesNotThrow(toV141::migrate);

        Flyway toV143 = baseConfig().target("143").load();
        assertDoesNotThrow(toV143::migrate);
        String v143ChecksumBefore = String.valueOf(findByVersion(toV143, "143").getChecksum());

        // The real, current classpath — V142 no longer exists there; V144 does.
        Flyway toLatest = baseConfig().load();
        assertDoesNotThrow(toLatest::migrate);
        assertDoesNotThrow(toLatest::validate);

        MigrationInfo v144 = findByVersion(toLatest, "144");
        assertThat(v144).as("V144 present in schema history").isNotNull();
        assertThat(v144.getState()).isEqualTo(MigrationState.SUCCESS);
        assertThat(countOccurrences(toLatest, "144")).isEqualTo(1);
        assertThat(findByVersion(toLatest, "142"))
                .as("V142 must never appear — the file no longer exists at that version").isNull();

        MigrationInfo v143After = findByVersion(toLatest, "143");
        assertThat(v143After).as("V143 (already live in prod) is untouched").isNotNull();
        assertThat(v143After.getState()).isEqualTo(MigrationState.SUCCESS);
        assertThat(String.valueOf(v143After.getChecksum())).isEqualTo(v143ChecksumBefore);
    }

    @Test
    @DisplayName("fresh empty database: full migrate (V1...V144) applies cleanly and validation "
            + "succeeds — insufficient on its own to prove this incident's fix (it never reproduces "
            + "the out-of-order condition), but must stay green alongside the RED/GREEN pair above")
    void freshDatabase_fullMigrate_appliesCleanlyThroughV144() {
        Flyway flyway = baseConfig().load();

        assertDoesNotThrow(flyway::migrate);
        assertDoesNotThrow(flyway::validate);

        assertThat(findByVersion(flyway, "143").getState()).isEqualTo(MigrationState.SUCCESS);
        assertThat(findByVersion(flyway, "144").getState()).isEqualTo(MigrationState.SUCCESS);
    }

    private static Path classpathFile(String resource) throws Exception {
        URL url = Thread.currentThread().getContextClassLoader().getResource(resource);
        assertThat(url).as("%s must be present on the test classpath", resource).isNotNull();
        return Path.of(url.toURI());
    }

    private static MigrationInfo findByVersion(Flyway flyway, String version) {
        for (MigrationInfo info : flyway.info().applied()) {
            if (info.getVersion() != null && version.equals(info.getVersion().toString())) {
                return info;
            }
        }
        return null;
    }

    private static long countOccurrences(Flyway flyway, String version) {
        return java.util.Arrays.stream(flyway.info().applied())
                .filter(info -> info.getVersion() != null && version.equals(info.getVersion().toString()))
                .count();
    }
}

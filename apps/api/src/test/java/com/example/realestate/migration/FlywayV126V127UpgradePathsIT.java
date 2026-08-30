package com.example.realestate.migration;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationState;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Proves the #2272 repair (V126 = #2269 agri-conversion-status, V127 = #2270 locality-alias
 * seed, renamed from its original colliding V126) across the three real-world upgrade paths a
 * deployed environment can be in. The container field is a non-static instance field, so
 * Testcontainers starts a fresh, disposable Postgres instance per test method — no state or
 * schema history leaks between the three upgrade-path scenarios below.
 */
@Testcontainers(disabledWithoutDocker = true)
class FlywayV126V127UpgradePathsIT {

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
    @DisplayName("empty database: full migrate applies V126 once and V127 once, validation succeeds")
    void emptyDatabase_migrateAll_v126AndV127EachAppliedOnce() {
        Flyway flyway = baseConfig().load();

        assertDoesNotThrow(flyway::migrate);
        assertDoesNotThrow(flyway::validate);

        MigrationInfo v126 = findByVersion(flyway, "126");
        MigrationInfo v127 = findByVersion(flyway, "127");

        assertThat(v126).as("V126 present in schema history").isNotNull();
        assertThat(v126.getDescription()).isEqualTo("add agri conversion status");
        assertThat(v126.getState()).isEqualTo(MigrationState.SUCCESS);

        assertThat(v127).as("V127 present in schema history").isNotNull();
        assertThat(v127.getDescription()).isEqualTo("seed manipal and subordinate locality aliases");
        assertThat(v127.getState()).isEqualTo(MigrationState.SUCCESS);

        assertThat(countOccurrences(flyway, "126")).isEqualTo(1);
        assertThat(countOccurrences(flyway, "127")).isEqualTo(1);
    }

    @Test
    @DisplayName("existing V125 database upgraded on repaired branch: V126 (agri) then V127 "
            + "(locality aliases) both apply, validation succeeds")
    void existingV125Database_upgrade_appliesV126ThenV127() {
        Flyway toV125 = baseConfig().target("125").load();
        assertDoesNotThrow(toV125::migrate);

        assertThat(findByVersion(toV125, "126")).as("V126 not yet applied at target 125").isNull();
        assertThat(findByVersion(toV125, "127")).as("V127 not yet applied at target 125").isNull();

        Flyway toLatest = baseConfig().load();
        assertDoesNotThrow(toLatest::migrate);
        assertDoesNotThrow(toLatest::validate);

        assertThat(findByVersion(toLatest, "126").getState()).isEqualTo(MigrationState.SUCCESS);
        assertThat(findByVersion(toLatest, "127").getState()).isEqualTo(MigrationState.SUCCESS);
    }

    @Test
    @DisplayName("existing database already at the preserved #2269 V126: upgrading to the "
            + "repaired branch leaves V126 valid (no re-apply / checksum conflict) and applies "
            + "the new V127 exactly once")
    void existingV126AgriDatabase_upgrade_v126StaysValidAndV127AppliesOnce() {
        Flyway toV126 = baseConfig().target("126").load();
        assertDoesNotThrow(toV126::migrate);

        MigrationInfo v126Before = findByVersion(toV126, "126");
        assertThat(v126Before).as("V126 applied at target 126").isNotNull();
        assertThat(v126Before.getState()).isEqualTo(MigrationState.SUCCESS);
        String checksumBefore = String.valueOf(v126Before.getChecksum());
        assertThat(findByVersion(toV126, "127")).as("V127 not yet applied at target 126").isNull();

        Flyway toLatest = baseConfig().load();
        assertDoesNotThrow(toLatest::migrate);
        assertDoesNotThrow(toLatest::validate);

        MigrationInfo v126After = findByVersion(toLatest, "126");
        assertThat(v126After.getState()).isEqualTo(MigrationState.SUCCESS);
        assertThat(String.valueOf(v126After.getChecksum())).isEqualTo(checksumBefore);

        MigrationInfo v127After = findByVersion(toLatest, "127");
        assertThat(v127After).as("V127 applied after upgrade").isNotNull();
        assertThat(v127After.getState()).isEqualTo(MigrationState.SUCCESS);
        assertThat(countOccurrences(toLatest, "127")).isEqualTo(1);
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

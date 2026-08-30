package com.example.realestate.migration;

import org.junit.jupiter.api.Test;

import java.io.File;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regression guard for the #2272 incident: two Flyway migrations both declared
 * as V126 (PR #2269 and PR #2270) reached main, which fails Flyway's duplicate-version
 * validation and blocks backend startup. This scans the real migration directory on the
 * classpath and fails the build if any two files declare the same Flyway version token,
 * before any environment ever tries to apply them.
 */
class FlywayMigrationVersionUniquenessTest {

    // Matches Flyway's own versioned-migration filename convention: V<version>__<description>.sql
    // <version> may contain digits and dots (e.g. "126", "0.1") per Flyway's version parsing rules.
    private static final Pattern VERSIONED_MIGRATION = Pattern.compile("^V([0-9]+(?:\\.[0-9]+)*)__.*\\.sql$");

    @Test
    void noTwoMigrationFilesDeclareTheSameFlywayVersion() throws Exception {
        URL migrationDirUrl = Thread.currentThread().getContextClassLoader().getResource("db/migration");
        assertThat(migrationDirUrl).as("db/migration must be present on the test classpath").isNotNull();

        Path migrationDir = Path.of(migrationDirUrl.toURI());
        Map<String, List<String>> filesByVersion = new HashMap<>();

        try (Stream<Path> files = Files.list(migrationDir)) {
            for (Path path : (Iterable<Path>) files::iterator) {
                File file = path.toFile();
                if (!file.isFile()) {
                    continue;
                }
                Matcher matcher = VERSIONED_MIGRATION.matcher(file.getName());
                if (!matcher.matches()) {
                    continue;
                }
                String version = matcher.group(1);
                filesByVersion.computeIfAbsent(version, v -> new ArrayList<>()).add(file.getName());
            }
        }

        assertThat(filesByVersion).as("no versioned migration files found under db/migration").isNotEmpty();

        List<String> duplicateReport = new ArrayList<>();
        for (Map.Entry<String, List<String>> entry : filesByVersion.entrySet()) {
            if (entry.getValue().size() > 1) {
                duplicateReport.add("V" + entry.getKey() + " -> " + entry.getValue());
            }
        }

        assertThat(duplicateReport)
                .as("duplicate Flyway version(s) found among migration filenames: %s", duplicateReport)
                .isEmpty();
    }
}

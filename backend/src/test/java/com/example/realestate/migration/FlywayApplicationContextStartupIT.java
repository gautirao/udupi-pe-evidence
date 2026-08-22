package com.example.realestate.migration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * #2272 required proof: against a genuinely empty database, the real Spring application context
 * (not just the raw Flyway API exercised by {@link FlywayV126V127UpgradePathsIT}) boots
 * successfully once V126/V127 are no longer in conflict, and Flyway's own history confirms both
 * applied exactly once. Uses the same real-Postgres-plus-full-context pattern as
 * {@code AdminCityLaunchControllerIT} (#1911 PR2) rather than a Flyway-only slice, since a
 * duplicate-version Flyway exception is thrown during {@code FlywayMigrationInitializer}, which
 * only a full context boot exercises.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE)
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.mixed=true",
        "spring.flyway.placeholders.concurrently_keyword=",
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://test.example.com/auth/v1",
        "AI_API_KEY=test-dummy-not-used-in-flyway-startup-it",
        "spring.task.scheduling.enabled=false"
})
class FlywayApplicationContextStartupIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    // Mirrors AdminCityLaunchControllerIT's (#1911 PR2) stub JwtDecoder: the real
    // OAuth2 resource-server security chain wires eagerly regardless of web environment, so a
    // context boot needs a JwtDecoder bean present even though this test never issues a request.
    @TestConfiguration
    static class TestJwtDecoderConfig {
        @Bean
        @Primary
        public JwtDecoder testJwtDecoder() {
            return token -> Jwt.withTokenValue(token)
                    .header("alg", "none")
                    .subject(token)
                    .issuedAt(Instant.now())
                    .expiresAt(Instant.now().plusSeconds(3600))
                    .build();
        }
    }

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void emptyDatabase_applicationContextStarts_v126AndV127EachAppliedOnce() {
        // Reaching this point (context injected, no BeanCreationException from
        // FlywayMigrationInitializer) already proves the application context started
        // successfully against a genuinely empty database with the full migration set applied.
        var rows = jdbcTemplate.queryForList(
                "SELECT version, description, success FROM flyway_schema_history "
                        + "WHERE version IN ('126', '127') ORDER BY version");

        assertThat(rows).hasSize(2);

        assertThat(rows.get(0).get("version")).isEqualTo("126");
        assertThat(rows.get(0).get("description")).isEqualTo("add agri conversion status");
        assertThat(rows.get(0).get("success")).isEqualTo(true);

        assertThat(rows.get(1).get("version")).isEqualTo("127");
        assertThat(rows.get(1).get("description")).isEqualTo("seed manipal and subordinate locality aliases");
        assertThat(rows.get(1).get("success")).isEqualTo(true);

        Integer duplicateVersionCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE version = '126'", Integer.class);
        assertThat(duplicateVersionCount).isEqualTo(1);
    }
}

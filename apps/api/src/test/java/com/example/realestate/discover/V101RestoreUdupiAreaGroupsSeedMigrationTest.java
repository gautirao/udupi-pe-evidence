package com.example.realestate.discover;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.sql.Connection;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;

/**
 * Integration test for V101 Flyway repair migration restoring Udupi area groups seed data.
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
class V101RestoreUdupiAreaGroupsSeedMigrationTest {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    @DisplayName("V101 restores canonical 5 Udupi area groups")
    void udupiAreaGroups_restoredToCanonicalCount() {
        List<String> slugs = jdbcTemplate.queryForList(
                "SELECT ag.slug FROM area_groups ag JOIN cities c ON c.id = ag.city_id WHERE c.slug = 'udupi' ORDER BY ag.display_order",
                String.class);

        assertThat(slugs).containsExactly(
                "university-belt",
                "coastal-strip",
                "city-centre",
                "north-udupi",
                "south-udupi"
        );
    }

    @Test
    @DisplayName("university-belt metadata, description, and memberships are canonical")
    void universityBelt_metadataAndMembers_restored() {
        Map<String, Object> group = jdbcTemplate.queryForMap(
                "SELECT ag.* FROM area_groups ag JOIN cities c ON c.id = ag.city_id WHERE c.slug = 'udupi' AND ag.slug = 'university-belt'");

        assertThat(group.get("name")).isEqualTo("University Belt");
        assertThat(group.get("subtitle")).isEqualTo("Academic and student housing");
        assertThat(group.get("region_label")).isEqualTo("Central Udupi");
        assertThat(group.get("description").toString()).contains("Manipal's academic spine");
        assertThat(((Number) group.get("display_order")).intValue()).isEqualTo(1);

        List<String> memberKeys = jdbcTemplate.queryForList(
                "SELECT m.area_key FROM area_group_members m JOIN area_groups ag ON ag.id = m.area_group_id WHERE ag.slug = 'university-belt' ORDER BY m.display_order",
                String.class);

        assertThat(memberKeys).containsExactly("IN|KA|Udupi|Manipal", "IN|KA|Udupi|Katapadi");
    }

    @Test
    @DisplayName("coastal-strip metadata, description, and memberships are canonical")
    void coastalStrip_metadataAndMembers_restored() {
        Map<String, Object> group = jdbcTemplate.queryForMap(
                "SELECT ag.* FROM area_groups ag JOIN cities c ON c.id = ag.city_id WHERE c.slug = 'udupi' AND ag.slug = 'coastal-strip'");

        assertThat(group.get("name")).isEqualTo("Coastal Strip");
        assertThat(group.get("description").toString()).contains("beachside villages");

        List<String> memberKeys = jdbcTemplate.queryForList(
                "SELECT m.area_key FROM area_group_members m JOIN area_groups ag ON ag.id = m.area_group_id WHERE ag.slug = 'coastal-strip' ORDER BY m.display_order",
                String.class);

        assertThat(memberKeys).containsExactly("IN|KA|Udupi|Malpe", "IN|KA|Udupi|Kaup");
    }

    @Test
    @DisplayName("V101 migration is idempotent when re-executed")
    void migration_isIdempotent() {
        assertDoesNotThrow(() -> {
            try (Connection conn = jdbcTemplate.getDataSource().getConnection()) {
                ScriptUtils.executeSqlScript(conn, new ClassPathResource("db/migration/V101__restore_udupi_area_groups_seed.sql"));
            }
        });

        List<String> slugs = jdbcTemplate.queryForList(
                "SELECT ag.slug FROM area_groups ag JOIN cities c ON c.id = ag.city_id WHERE c.slug = 'udupi' ORDER BY ag.display_order",
                String.class);

        assertThat(slugs).hasSize(5);
    }
}

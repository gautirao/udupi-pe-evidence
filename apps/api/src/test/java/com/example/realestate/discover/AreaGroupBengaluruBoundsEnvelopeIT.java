package com.example.realestate.discover;

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

/**
 * Regression IT for #1819: the "north-emerging" (North Bangalore Emerging) Bengaluru area
 * group was seeded (V106) with a mis-geocoded member, "Mukkidipeta"
 * (IN|KA|Bengaluru|Mukkidipeta, 13.826627/77.490273 -- ~55km north near the Andhra Pradesh
 * border). The Discover map frames macro-regions by unioning member area bounding boxes
 * (src/utils/discoverGroupBounds.ts), so a single wild-outlier coordinate silently stretches
 * a group's rendered map framing far beyond the real city.
 *
 * <p>V108 removes Mukkidipeta's membership (and, guarded, the now-orphaned area row) and
 * re-derives the north-emerging group's stored bounds from its remaining members. This test
 * runs the FULL Flyway chain (including V108) against a real Postgres and asserts:
 * <ul>
 *   <li>every Bengaluru area_group MEMBER area's bbox corners + center lie within a plausible
 *       Bengaluru coordinate envelope -- this directly encodes the bug condition (Mukkidipeta's
 *       13.826627 lat would violate the upper bound; pre-fix this assertion fails, post-fix it
 *       passes with zero violators);</li>
 *   <li>the north-emerging group's own stored max_lat is corrected to ~13.311576 (Kodalagurki,
 *       the next-highest legitimate member) and no longer 13.826627;</li>
 *   <li>no area_group_member row for Mukkidipeta remains under the bangalore city;</li>
 *   <li>Airport Belt and Thanisandra-Hennur Belt member counts are unchanged from their V106
 *       seed -- proving the fix is scoped to north-emerging only.</li>
 * </ul>
 *
 * <p>Harness copied from {@code AreaSummaryServiceAgriIT}: {@code @DataJpaTest} +
 * {@code postgis/postgis:15-3.4}, no DB replacement, {@code concurrently_keyword} emptied so
 * any CONCURRENTLY index migrations run inside Flyway's transaction.
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
class AreaGroupBengaluruBoundsEnvelopeIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    // Plausible Bengaluru coordinate envelope. Tightest legitimate extents on record
    // (see .claude/handoffs/issue-1819/approved-plan.toml [envelope_verification]):
    //   max_lat 13.311576 (Kodalagurki, V106) / min_lat 12.579089 (Virupakshipura, V106)
    //   max_lon 77.940854 (Malur / East Bangalore Emerging, V106) / min_lon 77.230649 (Virupakshipura, V106)
    // Every legitimate member has ~0.06-0.09 deg (~7-10km) of headroom to these bounds;
    // Mukkidipeta's 13.826627 lat is ~0.5 deg beyond the upper bound -- a clean violation,
    // not a borderline case.
    private static final double MIN_LAT = 12.5;
    private static final double MAX_LAT = 13.4;
    private static final double MIN_LON = 77.15;
    private static final double MAX_LON = 78.0;

    private static final String MUKKIDIPETA_AREA_KEY = "IN|KA|Bengaluru|Mukkidipeta";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private javax.sql.DataSource dataSource;

    // ── AC4: V108 is idempotent -- re-running it a second time against an already-migrated
    //    DB (Flyway has already applied it once via the full chain in @BeforeAll-equivalent
    //    context init) must be a no-op with no errors and unchanged, already-correct bounds. ──

    @Test
    void reRunningV108_isANoOpAndDoesNotError() {
        Map<String, Object> before = jdbcTemplate.queryForMap(
                "SELECT ag.min_lat, ag.min_lon, ag.max_lat, ag.max_lon FROM public.area_groups ag "
                        + "JOIN public.cities c ON c.id = ag.city_id "
                        + "WHERE c.slug = 'bangalore' AND ag.slug = 'north-emerging'");

        try (Connection connection = dataSource.getConnection()) {
            ScriptUtils.executeSqlScript(connection,
                    new ClassPathResource("db/migration/V108__fix_mukkidipeta_north_emerging_bounds.sql"));
        } catch (Exception e) {
            throw new AssertionError("re-running V108 a second time must not error", e);
        }

        Map<String, Object> after = jdbcTemplate.queryForMap(
                "SELECT ag.min_lat, ag.min_lon, ag.max_lat, ag.max_lon FROM public.area_groups ag "
                        + "JOIN public.cities c ON c.id = ag.city_id "
                        + "WHERE c.slug = 'bangalore' AND ag.slug = 'north-emerging'");

        assertThat(after).as("bounds must be unchanged after a second, idempotent V108 run").isEqualTo(before);

        Integer remainingMembership = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.area_group_members agm "
                        + "JOIN public.area_groups ag ON ag.id = agm.area_group_id "
                        + "JOIN public.cities c ON c.id = ag.city_id "
                        + "WHERE c.slug = 'bangalore' AND agm.area_key = ?",
                Integer.class, MUKKIDIPETA_AREA_KEY);
        assertThat(remainingMembership).isZero();
    }

    @Test
    void everyBengaluruAreaGroupMember_liesWithinPlausibleEnvelope() {
        List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                "SELECT ag.slug AS group_slug, a.area_key, "
                        + "a.min_lat, a.max_lat, a.min_lon, a.max_lon, "
                        + "a.geo_center_lat, a.geo_center_lon "
                        + "FROM public.area_group_members agm "
                        + "JOIN public.area_groups ag ON ag.id = agm.area_group_id "
                        + "JOIN public.cities c ON c.id = ag.city_id "
                        + "JOIN public.areas a ON a.area_key = agm.area_key "
                        + "WHERE c.slug = 'bangalore'");

        assertThat(rows).as("bangalore area_group members must exist post-migration").isNotEmpty();

        List<Map<String, Object>> violators = rows.stream()
                .filter(AreaGroupBengaluruBoundsEnvelopeIT::isOutsideEnvelope)
                .toList();

        assertThat(violators)
                .as("no bangalore area_group member may fall outside the plausible Bengaluru envelope "
                        + "lat [%s, %s] / lon [%s, %s]; violators: %s", MIN_LAT, MAX_LAT, MIN_LON, MAX_LON, violators)
                .isEmpty();
    }

    @Test
    void northEmergingBounds_areCorrectedAfterMukkidipetaRemoval() {
        Map<String, Object> group = jdbcTemplate.queryForMap(
                "SELECT ag.max_lat, ag.min_lat, ag.min_lon, ag.max_lon "
                        + "FROM public.area_groups ag "
                        + "JOIN public.cities c ON c.id = ag.city_id "
                        + "WHERE c.slug = 'bangalore' AND ag.slug = 'north-emerging'");

        double maxLat = ((Number) group.get("max_lat")).doubleValue();
        assertThat(maxLat)
                .as("north-emerging max_lat must no longer be Mukkidipeta's 13.826627")
                .isLessThanOrEqualTo(MAX_LAT);
        assertThat(maxLat).isCloseTo(13.311576, org.assertj.core.data.Offset.offset(0.0001));

        Integer remainingMembership = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.area_group_members agm "
                        + "JOIN public.area_groups ag ON ag.id = agm.area_group_id "
                        + "JOIN public.cities c ON c.id = ag.city_id "
                        + "WHERE c.slug = 'bangalore' AND agm.area_key = ?",
                Integer.class, MUKKIDIPETA_AREA_KEY);
        assertThat(remainingMembership)
                .as("Mukkidipeta must have no remaining bangalore area_group membership")
                .isZero();
    }

    @Test
    void airportBeltAndThanisandraHennurBelt_memberCountsAreUnchanged() {
        // V106 first DELETEs airport-belt's 2 pre-existing V78 members (Yelahanka, Hebbal --
        // moved back to north-growth to repair a dual-membership overlap), then adds 6 new
        // members (Devanahalli, Kogilu, Bagalur, Rajanukunte, Bettahalsoor, Kattigenahalli)
        // => 6. thanisandra-hennur-belt is created fresh by V106 with 29 members (V106:639-667).
        // Neither group is touched by V108, which only ever touches north-emerging.
        Integer airportBeltCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.area_group_members agm "
                        + "JOIN public.area_groups ag ON ag.id = agm.area_group_id "
                        + "JOIN public.cities c ON c.id = ag.city_id "
                        + "WHERE c.slug = 'bangalore' AND ag.slug = 'airport-belt'",
                Integer.class);
        Integer thanisandraHennurBeltCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM public.area_group_members agm "
                        + "JOIN public.area_groups ag ON ag.id = agm.area_group_id "
                        + "JOIN public.cities c ON c.id = ag.city_id "
                        + "WHERE c.slug = 'bangalore' AND ag.slug = 'thanisandra-hennur-belt'",
                Integer.class);

        assertThat(airportBeltCount).as("airport-belt member count must be untouched by V108").isEqualTo(6);
        assertThat(thanisandraHennurBeltCount)
                .as("thanisandra-hennur-belt member count must be untouched by V108")
                .isEqualTo(29);
    }

    private static boolean isOutsideEnvelope(Map<String, Object> row) {
        return isOutside((Number) row.get("min_lat"))
                || isOutside((Number) row.get("max_lat"))
                || isOutsideLon((Number) row.get("min_lon"))
                || isOutsideLon((Number) row.get("max_lon"))
                || isOutside((Number) row.get("geo_center_lat"))
                || isOutsideLon((Number) row.get("geo_center_lon"));
    }

    private static boolean isOutside(Number lat) {
        if (lat == null) {
            return false;
        }
        double v = lat.doubleValue();
        return v < MIN_LAT || v > MAX_LAT;
    }

    private static boolean isOutsideLon(Number lon) {
        if (lon == null) {
            return false;
        }
        double v = lon.doubleValue();
        return v < MIN_LON || v > MAX_LON;
    }
}

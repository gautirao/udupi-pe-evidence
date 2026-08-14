package com.example.realestate.discover;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * #2151 PR B — THE EQUIVALENCE PROOF (Task 1 of the QA gate).
 *
 * <p><b>Why this test exists.</b> The corridor read path used to read {@code
 * regional_area_classifications} (V87, populated by {@link RegionalClassificationBackfillService}'s
 * no-delete UPSERT — a row for an area is written once and never removed, even after the area is
 * later made {@code INACTIVE}/{@code MERGED}). It now reads {@code agri_destination_classification}
 * (V125, #2151 PR A), which is populated by {@code CityLaunchPromotionService} via REPLACE discipline
 * (delete-by-city-id then insert) — a promoted snapshot that can NEVER contain a row for an area that
 * is not part of the current promoted geography (see the V125 migration header comment, "STALE-ROW
 * DISCIPLINE"). These two population mechanisms are NOT guaranteed to agree row-for-row for the same
 * city, and this test proves that where they DO disagree, the disagreement is the intended one.
 *
 * <p><b>Method.</b> Seed one city with two areas, both initially {@code ACTIVE}. Populate {@code
 * regional_area_classifications} via the REAL legacy backfill service (both areas get a row, since
 * both are {@code ACTIVE} at that time). Then simulate a later admin action — merge one area
 * ({@code lifecycle_status = 'MERGED'}) — exactly as would happen between a legacy backfill run and
 * today. Populate {@code agri_destination_classification} the way {@code
 * CityLaunchPromotionService.promoteAgriDestinationClassification} is documented to (V125 REPLACE
 * discipline) — one row per CURRENTLY-ACTIVE area only, i.e. the merged area gets NO row. (Driving
 * the full City Launch prepare/promote pipeline here would pull in {@code city_launch_revision},
 * sandbox tables, and checksum machinery unrelated to what this test is proving — the read-side
 * comparison — so the promoted table is populated directly per its own documented invariant; this is
 * a deliberate, disclosed simplification, not a claim that the promotion pipeline itself is tested
 * here.) Then run BOTH read queries — the OLD corridor SQL (reproduced verbatim from the pre-#2151
 * cutover source, commit 88d8b486, since {@link RegionalAreaGroupsService} no longer contains it) and
 * the NEW {@link AgriDestinationPortPostgresAdapter#findDestinations} — for the SAME city and compare.
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
class AgriDestinationEquivalenceIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY = "equivproof";
    private static final double CITY_LAT = 13.0;
    private static final double CITY_LON = 74.0;

    // Alpha: stays ACTIVE through the whole test — must agree between OLD and NEW sources.
    private static final String ALPHA = "IN|KA|EquivProof|Alpha";
    private static final double ALPHA_LAT = 13.045; // ~5km N of city origin
    private static final double ALPHA_LON = 74.0;

    // StaleMerged: ACTIVE when the legacy backfill runs, MERGED afterwards — simulates the exact
    // scenario the V125 REPLACE discipline exists to prevent from leaking into the promoted table.
    private static final String STALE_MERGED = "IN|KA|EquivProof|StaleMerged";
    private static final double STALE_LAT = 13.072; // ~8km N of city origin
    private static final double STALE_LON = 74.0;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private RegionalClassificationBackfillService backfillService;
    private AgriDestinationPortPostgresAdapter agriDestinationPort;

    @BeforeEach
    void setUp() {
        backfillService = new RegionalClassificationBackfillService(jdbcTemplate);
        CityActivationGuard guard = new CityActivationGuard(jdbcTemplate);
        agriDestinationPort = new AgriDestinationPortPostgresAdapter(jdbcTemplate, guard);
        jdbcTemplate.update("DELETE FROM property_listings");
    }

    @Test
    @DisplayName("EQUIVALENCE PROOF: OLD vs NEW corridor source — every difference must be the "
            + "intended one (stale-merged-area row absent from the promoted snapshot)")
    void oldAndNewCorridorSources_onlyDifferByIntendedStaleRowExclusion() {
        int cityId = insertCity(CITY, CITY_LAT, CITY_LON);
        insertArea(ALPHA, cityId, "ACTIVE", ALPHA_LAT, ALPHA_LON);
        insertArea(STALE_MERGED, cityId, "ACTIVE", STALE_LAT, STALE_LON);

        insertLiveAgriListing(ALPHA);
        insertLiveAgriListing(STALE_MERGED);

        // ── Step 1: legacy backfill runs while BOTH areas are still ACTIVE — real
        //    RegionalClassificationBackfillService, no shortcuts.
        int upserted = backfillService.runBackfill(CITY);
        assertThat(upserted).as("both areas classified while ACTIVE").isEqualTo(2);

        // ── Step 2: admin merges StaleMerged sometime after the backfill ran. The legacy table's
        //    UPSERT-only writer never revisits this row — it is now permanently stale.
        jdbcTemplate.update(
                "UPDATE public.areas SET lifecycle_status = 'MERGED' WHERE area_key = ?", STALE_MERGED);

        // ── Step 3: populate the promoted table per its documented REPLACE-discipline invariant —
        //    one row per CURRENTLY-ACTIVE area only (V125: "an area renamed/merged/made INACTIVE
        //    cannot leave an orphaned classification row behind").
        double alphaDistance = RegionalGeo.haversineKm(CITY_LAT, CITY_LON, ALPHA_LAT, ALPHA_LON);
        double alphaBearing = RegionalGeo.bearingDeg(CITY_LAT, CITY_LON, ALPHA_LAT, ALPHA_LON);
        insertPromotedClassification(cityId, ALPHA, CITY_LAT, CITY_LON, alphaDistance, alphaBearing);
        // Deliberately NO row inserted for StaleMerged — that omission IS the thing under test.

        // ── Step 4: read BOTH sources for the same city and compare.
        Map<String, OldRow> oldSource = queryOldSource(CITY).stream()
                .collect(Collectors.toMap(OldRow::areaKey, r -> r));
        Map<String, AgriDestinationPort.DestinationBucket> newSource =
                agriDestinationPort.findDestinations(new AgriDestinationPort.DestinationScopeQuery(
                                CITY, null, null,
                                new AgriDestinationPort.AgriDestinationFilters(null), true))
                        .destinations().stream()
                        .collect(Collectors.toMap(AgriDestinationPort.DestinationBucket::areaKey, b -> b));

        // ── Difference 1 (INTENDED): StaleMerged is present in the OLD source (its stale row was
        //    never deleted, and the old count query never joined `areas` at all, so it has no way to
        //    notice the area was merged) but ABSENT from the NEW source (the promoted snapshot never
        //    contained it in the first place — REPLACE discipline).
        assertThat(oldSource).as("OLD source still returns the stale-merged area — proves the leak "
                + "this cutover fixes").containsKey(STALE_MERGED);
        assertThat(newSource).as("NEW source correctly excludes the merged area — REPLACE discipline "
                + "means agri_destination_classification never held a row for it post-merge")
                .doesNotContainKey(STALE_MERGED);

        // ── Agreement check: for the area present in BOTH sources (Alpha), every field must agree
        //    exactly — an unexplained divergence here (not just the documented StaleMerged omission)
        //    would be a genuine cutover blocker.
        assertThat(newSource).containsKey(ALPHA);
        OldRow oldAlpha = oldSource.get(ALPHA);
        AgriDestinationPort.DestinationBucket newAlpha = newSource.get(ALPHA);
        assertThat(newAlpha.direction()).as("direction must agree between sources")
                .isEqualTo(oldAlpha.directionKey());
        assertThat(newAlpha.distanceKm()).as("distanceKm must agree between sources (same geometry, "
                + "same haversine math)").isCloseTo(oldAlpha.distanceKm(), org.assertj.core.data.Offset.offset(0.001));
        assertThat(newAlpha.parcelCount()).as("live parcel count must agree between sources — both "
                + "apply the SAME live-listing guards (status=LIVE, not archived, not duplicate, "
                + "area_resolution_status=RESOLVED, 4-segment area_key)")
                .isEqualTo(oldAlpha.listingCount());

        // ── No OTHER unexplained differences: the two key sets differ by EXACTLY the documented
        //    StaleMerged omission — nothing else was silently dropped or added.
        assertThat(newSource.keySet())
                .as("NEW source's key set must be OLD source's key set minus exactly the merged area")
                .isEqualTo(
                        oldSource.keySet().stream()
                                .filter(k -> !k.equals(STALE_MERGED))
                                .collect(Collectors.toSet()));
    }

    // ── OLD source: reproduced verbatim from RegionalAreaGroupsService @ commit 88d8b486 (the
    //    pre-#2151-cutover REGIONAL_GROUPS_SQL), since that query no longer exists in production
    //    source after the cutover this PR performs.
    private record OldRow(String areaKey, String directionKey, double distanceKm, long listingCount) {}

    private static final String OLD_REGIONAL_GROUPS_SQL = """
            SELECT
                rac.area_key,
                rac.direction_key,
                rac.distance_km,
                COALESCE(agg.listing_count, 0) AS listing_count
            FROM regional_area_classifications rac
            JOIN regional_directions rd
                ON rd.direction_key = rac.direction_key
            JOIN regional_distance_bands rdb
                ON rdb.band_key = rac.distance_band_key
            LEFT JOIN (
                SELECT pl.area_key, COUNT(*) AS listing_count
                FROM property_listings pl
                WHERE pl.status = 'LIVE'
                  AND pl.archived_at IS NULL
                  AND pl.is_duplicate = false
                  AND pl.area_resolution_status = 'RESOLVED'
                  AND LOWER(pl.property_type) = LOWER(?)
                  AND array_length(string_to_array(pl.area_key, '|'), 1) = 4
                GROUP BY pl.area_key
            ) agg ON agg.area_key = rac.area_key
            WHERE rac.city_key = ?
              AND COALESCE(agg.listing_count, 0) > 0
            """;

    private List<OldRow> queryOldSource(String citySlug) {
        RowMapper<OldRow> mapper = (rs, rowNum) -> new OldRow(
                rs.getString("area_key"), rs.getString("direction_key"),
                rs.getDouble("distance_km"), rs.getLong("listing_count"));
        return jdbcTemplate.query(OLD_REGIONAL_GROUPS_SQL, mapper, "agricultural_land", citySlug);
    }

    // ── seeding helpers ─────────────────────────────────────────────────────────

    private int insertCity(String slug, double lat, double lon) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, ?, ?, true) RETURNING id",
                Integer.class, slug, slug, lat, lon);
    }

    private void insertArea(String areaKey, int cityId, String lifecycleStatus, double lat, double lon) {
        jdbcTemplate.update(
                "INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon, lifecycle_status) "
                        + "VALUES (?, ?, ?, ?, ?, ?)",
                areaKey, cityId, areaKey, lat, lon, lifecycleStatus);
    }

    private void insertLiveAgriListing(String areaKey) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, land_area, land_area_unit, listing_purpose, "
                        + " latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, 'agricultural_land', 3, 'acre', "
                        + " 'sale', 13.0, 74.0, ?, ?)",
                UUID.randomUUID(), areaKey, now, now);
    }

    private void insertPromotedClassification(int cityId, String areaKey, double originLat, double originLon,
                                                double distanceKm, double bearingDeg) {
        String directionKey = RegionalGeo.directionKey(bearingDeg);
        String bandKey = RegionalGeo.distanceBandKey(distanceKm);
        jdbcTemplate.update(
                "INSERT INTO public.agri_destination_classification "
                        + "(city_id, area_key, origin_lat, origin_lon, distance_km, bearing_deg, "
                        + " direction_key, distance_band_key, generator_version, generated_at) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'test-generator-v1', now())",
                cityId, areaKey, originLat, originLon, distanceKm, bearingDeg, directionKey, bandKey);
    }
}

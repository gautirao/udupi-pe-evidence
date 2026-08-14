package com.example.realestate.discover;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.OffsetDateTime;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * #2151 PR B — port-level contract IT for {@link AgriDestinationPort}
 * ({@link AgriDestinationPortPostgresAdapter} is the sole implementation under test).
 *
 * <p>Covers Tasks 2–5 of the PR B cutover QA gate:
 * <ul>
 *   <li>Task 2 — AC7 parity (I1/I2) at the PORT level, asserted on DISTINCT parcel ids, including
 *       the overlapping-scope partition property;</li>
 *   <li>Task 3 — distance boundary ({@code distanceKm <= maxKm}) and a falsifiable no-recompute
 *       assertion;</li>
 *   <li>Task 4 — {@code area_resolution_status} alignment between the count side and the parcel
 *       side;</li>
 *   <li>Task 5 — the remaining required IT matrix: direction/maxKm scope filtering,
 *       {@code listingPurpose} identical-effect parity, zero-result states, #1935 inactive-city
 *       parity, port-level exposure (always exact — no anon branch exists at this layer), and
 *       listing-lifecycle count changes without geography regeneration.
 * </ul>
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
class AgriDestinationPortContractIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY = "contracttest";
    private static final String AREA_N_NEAR = "IN|KA|ContractTest|NNear";   // N, 5km
    private static final String AREA_N_FAR = "IN|KA|ContractTest|NFar";    // N, 15km
    private static final String AREA_E = "IN|KA|ContractTest|East";        // E, 8km

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private AgriDestinationPortPostgresAdapter port;
    private int cityId;

    @BeforeEach
    void setUp() {
        CityActivationGuard guard = new CityActivationGuard(jdbcTemplate);
        port = new AgriDestinationPortPostgresAdapter(jdbcTemplate, guard);
        jdbcTemplate.update("DELETE FROM property_listings");
        jdbcTemplate.update("DELETE FROM agri_destination_classification");
        jdbcTemplate.update("DELETE FROM areas WHERE city_id IN (SELECT id FROM cities WHERE slug = ?)", CITY);
        jdbcTemplate.update("DELETE FROM cities WHERE slug = ?", CITY);

        cityId = insertCity(CITY, 13.0, 74.0);
        insertArea(AREA_N_NEAR, cityId, 13.02, 74.0);
        insertArea(AREA_N_FAR, cityId, 13.10, 74.0);
        insertArea(AREA_E, cityId, 13.0, 74.06);

        insertClassification(cityId, AREA_N_NEAR, 5.0, 0.0, "N", "0_10");
        insertClassification(cityId, AREA_N_FAR, 15.0, 0.0, "N", "10_25");
        insertClassification(cityId, AREA_E, 8.0, 90.0, "E", "0_10");
    }

    // ── Task 2: AC7 parity (I1) — per-bucket parcelCount == single-area findParcels total ────────

    @Test
    @DisplayName("AC7 I1: every bucket's parcelCount equals findParcels(single areaKey).totalMatching")
    void ac7_i1_perBucketParcelCountMatchesSingleAreaParcelTotal() {
        insertLiveAgriListing(AREA_N_NEAR, "sale");
        insertLiveAgriListing(AREA_N_NEAR, "sale");
        insertLiveAgriListing(AREA_N_FAR, "sale");

        AgriDestinationPort.DestinationScope scope = port.findDestinations(
                new AgriDestinationPort.DestinationScopeQuery(CITY, null, null, filters(null), true));

        assertThat(scope.destinations()).hasSize(3);
        for (AgriDestinationPort.DestinationBucket bucket : scope.destinations()) {
            AgriDestinationPort.ParcelPage page = port.findParcels(new AgriDestinationPort.ParcelQuery(
                    CITY, List.of(bucket.areaKey()), filters(null),
                    new AgriDestinationPort.PageSpec(0, 1), null));
            assertThat(page.totalMatching())
                    .as("bucket %s parcelCount must equal single-area findParcels total", bucket.areaKey())
                    .isEqualTo(bucket.parcelCount());
        }
        assertThat(bucketFor(scope, AREA_N_NEAR).parcelCount()).isEqualTo(2L);
        assertThat(bucketFor(scope, AREA_N_FAR).parcelCount()).isEqualTo(1L);
        assertThat(bucketFor(scope, AREA_E).parcelCount()).isEqualTo(0L);
    }

    // ── Task 2: AC7 parity (I2) — subset sum == findParcels(subset).totalMatching, on DISTINCT ids ─

    @Test
    @DisplayName("AC7 I2: subset-of-buckets parcelCount sum equals findParcels(subset).totalMatching, "
            + "and the underlying parcel id sets partition (no double count) — asserted on distinct ids")
    void ac7_i2_subsetSumMatchesParcelTotal_andPartitionsOnDistinctIds() {
        String p1 = insertLiveAgriListing(AREA_N_NEAR, "sale");
        String p2 = insertLiveAgriListing(AREA_N_NEAR, "sale");
        String p3 = insertLiveAgriListing(AREA_N_FAR, "sale");
        String p4 = insertLiveAgriListing(AREA_E, "sale");

        AgriDestinationPort.DestinationScope scope = port.findDestinations(
                new AgriDestinationPort.DestinationScopeQuery(CITY, null, null, filters(null), true));

        // Subset K = {NNear, NFar} — cumulative-tier-style overlapping scope (both are "N" corridor,
        // NNear is also within NFar's wider radius conceptually) — property_listings.area_key is
        // single-valued, so even though these two destinations both belong to the same direction,
        // each PARCEL belongs to exactly one of them.
        List<String> subset = List.of(AREA_N_NEAR, AREA_N_FAR);
        long subsetBucketSum = scope.destinations().stream()
                .filter(b -> subset.contains(b.areaKey()))
                .mapToLong(AgriDestinationPort.DestinationBucket::parcelCount)
                .sum();

        AgriDestinationPort.ParcelPage subsetPage = port.findParcels(new AgriDestinationPort.ParcelQuery(
                CITY, subset, filters(null), new AgriDestinationPort.PageSpec(0, 250), null));

        assertThat(subsetPage.totalMatching()).isEqualTo(subsetBucketSum).isEqualTo(3L);

        // Assert on DISTINCT parcel ids, not row counts — collect every id returned for the subset
        // and confirm it is EXACTLY {p1, p2, p3}, not merely the same cardinality by coincidence.
        Set<String> subsetIds = subsetPage.content().stream()
                .map(AgriDestinationPort.AgriParcel::id).collect(Collectors.toSet());
        assertThat(subsetIds).containsExactlyInAnyOrder(p1, p2, p3);

        // Partition property: fetch each area's parcels independently and confirm the id sets are
        // pairwise DISJOINT and their union equals the whole-city id set — a parcel can never be
        // counted under two destinations (property_listings.area_key is single-valued).
        Set<String> nNearIds = parcelIds(AREA_N_NEAR);
        Set<String> nFarIds = parcelIds(AREA_N_FAR);
        Set<String> eastIds = parcelIds(AREA_E);
        assertThat(nNearIds).containsExactlyInAnyOrder(p1, p2);
        assertThat(nFarIds).containsExactlyInAnyOrder(p3);
        assertThat(eastIds).containsExactlyInAnyOrder(p4);

        Set<String> disjointCheck = new HashSet<>(nNearIds);
        assertThat(disjointCheck.retainAll(nFarIds) ? disjointCheck : Set.of())
                .as("NNear and NFar parcel id sets must be disjoint").isEmpty();

        Set<String> union = new HashSet<>(nNearIds);
        union.addAll(nFarIds);
        union.addAll(eastIds);
        AgriDestinationPort.ParcelPage wholeCity = port.findParcels(new AgriDestinationPort.ParcelQuery(
                CITY, List.of(AREA_N_NEAR, AREA_N_FAR, AREA_E), filters(null),
                new AgriDestinationPort.PageSpec(0, 250), null));
        assertThat(union).as("union of per-area distinct id sets must equal the whole-scope distinct set")
                .isEqualTo(wholeCity.content().stream().map(AgriDestinationPort.AgriParcel::id)
                        .collect(Collectors.toSet()));
        assertThat(wholeCity.totalMatching()).isEqualTo(4L);
    }

    // ── Task 3: distance boundary — distanceKm <= maxKm, exact boundary INCLUDED, +epsilon EXCLUDED ─

    @Test
    @DisplayName("distance boundary: destination at EXACTLY maxKm is included, maxKm+epsilon excluded")
    void distanceBoundary_exactMaxKmIncluded_epsilonBeyondExcluded() {
        // Reuse NNear (distance_km=5.0) at boundary maxKm=5.0 exactly.
        AgriDestinationPort.DestinationScope atBoundary = port.findDestinations(
                new AgriDestinationPort.DestinationScopeQuery(CITY, null, 5.0, filters(null), false));
        assertThat(atBoundary.destinations()).extracting(AgriDestinationPort.DestinationBucket::areaKey)
                .as("distanceKm == maxKm must be INCLUDED (<=, not <)").contains(AREA_N_NEAR);

        AgriDestinationPort.DestinationScope justBeyond = port.findDestinations(
                new AgriDestinationPort.DestinationScopeQuery(CITY, null, 4.999, filters(null), false));
        assertThat(justBeyond.destinations()).extracting(AgriDestinationPort.DestinationBucket::areaKey)
                .as("maxKm just below the destination's distance must EXCLUDE it")
                .doesNotContain(AREA_N_NEAR);
    }

    // ── Task 3: no per-request geodesic recomputation (AC6) — falsifiable ──────────────────────────

    @Test
    @DisplayName("AC6: findDestinations returns the STORED distance_km/bearing_deg verbatim — would "
            + "FAIL if a Haversine/bearing recomputation were reintroduced at request time")
    void noPerRequestGeodesicRecomputation_returnsStoredValueVerbatim() {
        // Deliberately store a distance/bearing that is GEOMETRICALLY WRONG for the area's actual
        // lat/lon (AREA_N_NEAR is ~2km from city origin by its seeded coordinates, but the stored
        // promoted value below claims 987.65km/123.45deg). If the adapter ever recomputed the
        // distance from areas.geo_center_lat/lon instead of returning the stored column, this
        // assertion would fail (it would see ~2km, not 987.65).
        jdbcTemplate.update("DELETE FROM agri_destination_classification WHERE city_id = ? AND area_key = ?",
                cityId, AREA_N_NEAR);
        insertClassification(cityId, AREA_N_NEAR, 987.65, 123.45, "NE", "50_up");

        AgriDestinationPort.DestinationScope scope = port.findDestinations(
                new AgriDestinationPort.DestinationScopeQuery(CITY, null, null, filters(null), false));

        AgriDestinationPort.DestinationBucket bucket = bucketFor(scope, AREA_N_NEAR);
        assertThat(bucket.distanceKm()).as("must return the stored value verbatim, not a recomputed one")
                .isEqualTo(987.65);
        assertThat(bucket.bearingDeg()).isEqualTo(123.45);
        assertThat(bucket.direction()).isEqualTo("NE");
    }

    // ── Task 4: area_resolution_status alignment — UNRESOLVED excluded from BOTH sides ──────────────

    @Test
    @DisplayName("area_resolution_status=UNRESOLVED parcel excluded from BOTH bucket count and "
            + "parcel results — the two sides now agree (previously the parcel path leaked it)")
    void unresolvedAreaResolutionStatus_excludedFromBothCountAndParcels() {
        String resolvedId = insertLiveAgriListing(AREA_N_NEAR, "sale");
        String unresolvedId = insertLiveAgriListing(AREA_N_NEAR, "sale");
        jdbcTemplate.update(
                "UPDATE property_listings SET area_resolution_status = 'UNRESOLVED' WHERE id = ?::uuid",
                unresolvedId);

        AgriDestinationPort.DestinationScope scope = port.findDestinations(
                new AgriDestinationPort.DestinationScopeQuery(CITY, null, null, filters(null), true));
        assertThat(bucketFor(scope, AREA_N_NEAR).parcelCount())
                .as("count side excludes the UNRESOLVED parcel — unchanged behaviour").isEqualTo(1L);

        AgriDestinationPort.ParcelPage page = port.findParcels(new AgriDestinationPort.ParcelQuery(
                CITY, List.of(AREA_N_NEAR), filters(null), new AgriDestinationPort.PageSpec(0, 10), null));
        assertThat(page.content()).as("parcel side now ALSO excludes the UNRESOLVED parcel — #2151 PR B "
                        + "alignment fix; previously it rendered on the map inside a bucket that did not "
                        + "count it, a live inconsistency this cutover closes")
                .extracting(AgriDestinationPort.AgriParcel::id)
                .containsExactly(resolvedId)
                .doesNotContain(unresolvedId);
        assertThat(page.totalMatching()).isEqualTo(1L);
    }

    // ── Task 5: stable-key scope filtering by direction and maxKm ─────────────────────────────────

    @Test
    @DisplayName("scope filtering: direction restricts to that direction only; maxKm restricts by "
            + "distance only — independently and combined")
    void scopeFiltering_byDirectionAndMaxKm() {
        AgriDestinationPort.DestinationScope nOnly = port.findDestinations(
                new AgriDestinationPort.DestinationScopeQuery(CITY, "N", null, filters(null), false));
        assertThat(nOnly.destinations()).extracting(AgriDestinationPort.DestinationBucket::areaKey)
                .containsExactlyInAnyOrder(AREA_N_NEAR, AREA_N_FAR);

        AgriDestinationPort.DestinationScope within10 = port.findDestinations(
                new AgriDestinationPort.DestinationScopeQuery(CITY, null, 10.0, filters(null), false));
        assertThat(within10.destinations()).extracting(AgriDestinationPort.DestinationBucket::areaKey)
                .containsExactlyInAnyOrder(AREA_N_NEAR, AREA_E); // 5km and 8km, not 15km

        AgriDestinationPort.DestinationScope nWithin10 = port.findDestinations(
                new AgriDestinationPort.DestinationScopeQuery(CITY, "N", 10.0, filters(null), false));
        assertThat(nWithin10.destinations()).extracting(AgriDestinationPort.DestinationBucket::areaKey)
                .containsExactly(AREA_N_NEAR);
    }

    // ── Task 5: listingPurpose filter changes bucket counts and parcel results IDENTICALLY ────────

    @Test
    @DisplayName("listingPurpose sale/rent changes bucket count and parcel results identically")
    void listingPurposeFilter_changesBucketAndParcelResultsIdentically() {
        String saleId = insertLiveAgriListing(AREA_N_NEAR, "sale");
        String rentId = insertLiveAgriListing(AREA_N_NEAR, "rent");

        AgriDestinationPort.DestinationScope saleScope = port.findDestinations(
                new AgriDestinationPort.DestinationScopeQuery(CITY, null, null, filters("sale"), true));
        assertThat(bucketFor(saleScope, AREA_N_NEAR).parcelCount()).isEqualTo(1L);

        AgriDestinationPort.ParcelPage salePage = port.findParcels(new AgriDestinationPort.ParcelQuery(
                CITY, List.of(AREA_N_NEAR), filters("sale"), new AgriDestinationPort.PageSpec(0, 10), null));
        assertThat(salePage.content()).extracting(AgriDestinationPort.AgriParcel::id).containsExactly(saleId);
        assertThat(salePage.totalMatching()).isEqualTo(bucketFor(saleScope, AREA_N_NEAR).parcelCount());

        AgriDestinationPort.DestinationScope rentScope = port.findDestinations(
                new AgriDestinationPort.DestinationScopeQuery(CITY, null, null, filters("rent"), true));
        AgriDestinationPort.ParcelPage rentPage = port.findParcels(new AgriDestinationPort.ParcelQuery(
                CITY, List.of(AREA_N_NEAR), filters("rent"), new AgriDestinationPort.PageSpec(0, 10), null));
        assertThat(bucketFor(rentScope, AREA_N_NEAR).parcelCount()).isEqualTo(1L);
        assertThat(rentPage.content()).extracting(AgriDestinationPort.AgriParcel::id).containsExactly(rentId);
        assertThat(rentPage.totalMatching()).isEqualTo(bucketFor(rentScope, AREA_N_NEAR).parcelCount());
    }

    // ── Task 5: zero-result states — explicit, not scope-broadening ───────────────────────────────

    @Test
    @DisplayName("zero-result: a direction with no destinations returns empty WITHOUT falling back to "
            + "other directions")
    void zeroResult_directionWithNoDestinations_emptyNotBroadened() {
        AgriDestinationPort.DestinationScope sw = port.findDestinations(
                new AgriDestinationPort.DestinationScopeQuery(CITY, "SW", null, filters(null), false));
        assertThat(sw.destinations()).isEmpty();

        // Sanity: the SAME city, unfiltered, is non-empty — proves the SW result is a genuine
        // zero, not an accidental empty city.
        AgriDestinationPort.DestinationScope all = port.findDestinations(
                new AgriDestinationPort.DestinationScopeQuery(CITY, null, null, filters(null), false));
        assertThat(all.destinations()).isNotEmpty();
    }

    @Test
    @DisplayName("zero-result: a destination with zero matching parcels is present with count=0, not "
            + "omitted, and findParcels agrees with empty content + totalMatching=0")
    void zeroResult_destinationWithNoMatchingParcels_explicitZeroNotOmitted() {
        // No listings inserted anywhere — every destination must report parcelCount=0.
        AgriDestinationPort.DestinationScope scope = port.findDestinations(
                new AgriDestinationPort.DestinationScopeQuery(CITY, null, null, filters(null), true));
        assertThat(scope.destinations()).hasSize(3);
        assertThat(scope.destinations()).allSatisfy(b ->
                assertThat(b.parcelCount()).as("bucket %s must be explicit 0, not omitted", b.areaKey())
                        .isEqualTo(0L));

        AgriDestinationPort.ParcelPage page = port.findParcels(new AgriDestinationPort.ParcelQuery(
                CITY, List.of(AREA_N_NEAR), filters(null), new AgriDestinationPort.PageSpec(0, 10), null));
        assertThat(page.content()).isEmpty();
        assertThat(page.totalMatching()).isZero();
        assertThat(page.hasMore()).isFalse();
    }

    // ── Task 5: #1935 inactive city indistinguishable from unknown city ───────────────────────────

    @Test
    @DisplayName("#1935 parity: inactive city and unknown city both yield the SAME empty shape")
    void inactiveCity_indistinguishableFromUnknownCity() {
        jdbcTemplate.update("UPDATE cities SET is_active = false WHERE slug = ?", CITY);
        try {
            AgriDestinationPort.DestinationScope inactive = port.findDestinations(
                    new AgriDestinationPort.DestinationScopeQuery(CITY, null, null, filters(null), false));
            AgriDestinationPort.DestinationScope unknown = port.findDestinations(
                    new AgriDestinationPort.DestinationScopeQuery("no-such-city-xyz", null, null, filters(null), false));

            assertThat(inactive.destinations()).isEmpty();
            assertThat(unknown.destinations()).isEmpty();
            assertThat(inactive).as("inactive-city response shape must be identical to unknown-city")
                    .isEqualTo(new AgriDestinationPort.DestinationScope(CITY, List.of()));
            assertThat(unknown).isEqualTo(new AgriDestinationPort.DestinationScope("no-such-city-xyz", List.of()));

            AgriDestinationPort.ParcelPage inactiveParcels = port.findParcels(new AgriDestinationPort.ParcelQuery(
                    CITY, List.of(AREA_N_NEAR), filters(null), new AgriDestinationPort.PageSpec(0, 10), null));
            AgriDestinationPort.ParcelPage unknownParcels = port.findParcels(new AgriDestinationPort.ParcelQuery(
                    "no-such-city-xyz", List.of(AREA_N_NEAR), filters(null), new AgriDestinationPort.PageSpec(0, 10), null));
            assertThat(inactiveParcels.content()).isEmpty();
            assertThat(inactiveParcels.totalMatching()).isZero();
            assertThat(unknownParcels.content()).isEmpty();
            assertThat(unknownParcels.totalMatching()).isZero();
        } finally {
            jdbcTemplate.update("UPDATE cities SET is_active = true WHERE slug = ?", CITY);
        }
    }

    // ── Task 5: port-level exposure — ALWAYS exact (no anon branch exists at this layer) ──────────

    @Test
    @DisplayName("port always returns EXACT coordinates and price — anon coarsening/withholding has "
            + "no branch at this layer (applied strictly above the port, per its javadoc contract)")
    void portLevel_alwaysReturnsExactCoordinatesAndPrice_noAnonBranch() {
        String id = insertLiveAgriListingWithCoordsAndPrice(AREA_N_NEAR, 13.34091, 74.74215, 12500000L);

        AgriDestinationPort.ParcelPage page = port.findParcels(new AgriDestinationPort.ParcelQuery(
                CITY, List.of(AREA_N_NEAR), filters(null), new AgriDestinationPort.PageSpec(0, 10), null));

        AgriDestinationPort.AgriParcel parcel = page.content().stream()
                .filter(p -> p.id().equals(id)).findFirst().orElseThrow();
        assertThat(parcel.latitude()).as("port never coarsens — the AgriDestinationPort interface "
                + "signature has no isAuthenticated parameter at all").isEqualTo(13.34091);
        assertThat(parcel.longitude()).isEqualTo(74.74215);
        assertThat(parcel.pricePaise()).as("port never withholds price").isEqualTo(12500000L);
    }

    // ── Task 5: listing lifecycle changes move counts WITHOUT geography regeneration ──────────────

    @Test
    @DisplayName("archiving a listing moves the bucket count WITHOUT touching "
            + "agri_destination_classification — counts are live, geometry is precomputed")
    void listingLifecycleChange_movesCountWithoutGeographyRegeneration() {
        String id = insertLiveAgriListing(AREA_N_NEAR, "sale");

        ClassificationSnapshot before = snapshotClassification(cityId, AREA_N_NEAR);
        AgriDestinationPort.DestinationScope beforeScope = port.findDestinations(
                new AgriDestinationPort.DestinationScopeQuery(CITY, null, null, filters(null), true));
        assertThat(bucketFor(beforeScope, AREA_N_NEAR).parcelCount()).isEqualTo(1L);

        // Archive the listing — a pure lifecycle event, nothing geography-related.
        jdbcTemplate.update("UPDATE property_listings SET archived_at = now() WHERE id = ?::uuid", id);

        AgriDestinationPort.DestinationScope afterScope = port.findDestinations(
                new AgriDestinationPort.DestinationScopeQuery(CITY, null, null, filters(null), true));
        assertThat(bucketFor(afterScope, AREA_N_NEAR).parcelCount())
                .as("count must move to 0 after archival").isEqualTo(0L);

        ClassificationSnapshot after = snapshotClassification(cityId, AREA_N_NEAR);
        assertThat(after).as("agri_destination_classification row must be byte-identical — "
                + "archiving a listing must never trigger geography regeneration").isEqualTo(before);
    }

    // ── helpers ─────────────────────────────────────────────────────────────────────────────────

    private static AgriDestinationPort.AgriDestinationFilters filters(String listingPurpose) {
        return new AgriDestinationPort.AgriDestinationFilters(listingPurpose);
    }

    private static AgriDestinationPort.DestinationBucket bucketFor(
            AgriDestinationPort.DestinationScope scope, String areaKey) {
        return scope.destinations().stream()
                .filter(b -> b.areaKey().equals(areaKey))
                .findFirst()
                .orElseThrow(() -> new AssertionError("no bucket for " + areaKey));
    }

    private Set<String> parcelIds(String areaKey) {
        AgriDestinationPort.ParcelPage page = port.findParcels(new AgriDestinationPort.ParcelQuery(
                CITY, List.of(areaKey), filters(null), new AgriDestinationPort.PageSpec(0, 250), null));
        return page.content().stream().map(AgriDestinationPort.AgriParcel::id).collect(Collectors.toSet());
    }

    private record ClassificationSnapshot(double distanceKm, double bearingDeg, String directionKey) {}

    private ClassificationSnapshot snapshotClassification(int cityId, String areaKey) {
        return jdbcTemplate.queryForObject(
                "SELECT distance_km, bearing_deg, direction_key FROM agri_destination_classification "
                        + "WHERE city_id = ? AND area_key = ?",
                (rs, rowNum) -> new ClassificationSnapshot(
                        rs.getDouble("distance_km"), rs.getDouble("bearing_deg"), rs.getString("direction_key")),
                cityId, areaKey);
    }

    private int insertCity(String slug, double lat, double lon) {
        return jdbcTemplate.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, ?, ?, true) RETURNING id",
                Integer.class, slug, slug, lat, lon);
    }

    private void insertArea(String areaKey, int cityId, double lat, double lon) {
        jdbcTemplate.update(
                "INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon, lifecycle_status) "
                        + "VALUES (?, ?, ?, ?, ?, 'ACTIVE')",
                areaKey, cityId, areaKey, lat, lon);
    }

    private void insertClassification(int cityId, String areaKey, double distanceKm, double bearingDeg,
                                       String directionKey, String bandKey) {
        jdbcTemplate.update(
                "INSERT INTO public.agri_destination_classification "
                        + "(city_id, area_key, origin_lat, origin_lon, distance_km, bearing_deg, "
                        + " direction_key, distance_band_key, generator_version, generated_at) "
                        + "VALUES (?, ?, 13.0, 74.0, ?, ?, ?, ?, 'test-generator-v1', now())",
                cityId, areaKey, distanceKm, bearingDeg, directionKey, bandKey);
    }

    private String insertLiveAgriListing(String areaKey, String listingPurpose) {
        return insertLiveAgriListingWithCoordsAndPrice(areaKey, 13.0, 74.0, 5000000L, listingPurpose);
    }

    private String insertLiveAgriListingWithCoordsAndPrice(String areaKey, double lat, double lon, Long pricePaise) {
        return insertLiveAgriListingWithCoordsAndPrice(areaKey, lat, lon, pricePaise, "sale");
    }

    private String insertLiveAgriListingWithCoordsAndPrice(
            String areaKey, double lat, double lon, Long pricePaise, String listingPurpose) {
        UUID id = UUID.randomUUID();
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, land_area, land_area_unit, listing_purpose, price_paise, "
                        + " latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, 'agricultural_land', 3, 'acre', "
                        + " ?, ?, ?, ?, ?, ?)",
                id, areaKey, listingPurpose, pricePaise, lat, lon, now, now);
        return id.toString();
    }
}

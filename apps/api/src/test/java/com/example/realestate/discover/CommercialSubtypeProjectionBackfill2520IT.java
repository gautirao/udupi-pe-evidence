package com.example.realestate.discover;

import com.example.realestate.discover.navigation.NavigationCacheProperties;
import com.example.realestate.discover.navigation.NavigationGraphCache;
import com.example.realestate.discover.navigation.NavigationGraphLoader;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.typed.CommercialSpaceDetail;
import com.example.realestate.listing.typed.CommercialSpaceDetailRepository;
import com.example.realestate.search.indexer.ListingIndexDocument;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

/**
 * Testcontainers real-DB proof for issue #2520: a commercial listing whose subtype was written to
 * the V104 write model but never projected to the V102 read model is invisible to the Discover
 * filter that names it — and V135 makes it visible on all four read surfaces at once, then makes
 * the drifted state unreachable.
 *
 * <p><b>The four surfaces, measured rather than assumed.</b> The owner's ruling on #2520 is
 * explicit that membership agreement is the load-bearing claim, because a membership disagreement
 * is the defect's own signature. Three surfaces plus an assumption would be exactly the shape of
 * the bug. So each arm below measures:
 *
 * <ul>
 *   <li><b>list</b> — {@code DiscoverListingsPage.content()}, via DiscoverListingsController;</li>
 *   <li><b>count</b> — {@code DiscoverListingsPage.totalElements()}, which is an INDEPENDENT
 *       {@code SELECT COUNT(*)} in DiscoverListingsService (~L98), not {@code content().size()};</li>
 *   <li><b>marker</b> — {@code DiscoverMarkersResponse.markers()}, via DiscoverMarkersController;</li>
 *   <li><b>index</b> — {@code ListingIndexDocument.getCommercialSubtype()}, assembled exactly as
 *       SearchOutboxPoller does it (~L228-241): load the entity, load the V102 projection when the
 *       family is COMMERCIAL, hand both to {@code fromListing}. This is what would be written to
 *       OpenSearch, so it is index membership rather than a proxy for it.</li>
 * </ul>
 *
 * <p><b>Why a real database.</b> Every claim here is a claim about SQL semantics — that
 * {@code UPPER(NULL) IN ('SHOP')} yields NULL and therefore excludes, that a DEFERRED constraint
 * trigger fires at COMMIT and not before. A mock would assert the string this file contains rather
 * than what Postgres does with it.
 *
 * <p><b>Why the "before" arm can exist at all.</b> V135 has already been applied to this container
 * by Flyway, so the drifted state it forbids ought to be unconstructable. It is constructable here
 * for exactly one reason: the guard is DEFERRED, {@code @DataJpaTest} rolls its transaction back,
 * and a deferred check never fires in a transaction that never commits. That is not a hole in the
 * guard — {@link #guard_bypassingWriteFailsRatherThanDivergingSilently()} forces the check with
 * {@code SET CONSTRAINTS ALL IMMEDIATE} and shows it rejecting the same write. It is what makes a
 * before/after comparison possible on a database that has already been fixed.
 *
 * <p><b>Why the backfill SQL is read from the migration file.</b> The "after" arm applies the
 * shipped statements out of
 * {@code V135__backfill_and_guard_commercial_subtype_projection.sql}, not a copy of them pasted
 * into this test. A copy would keep passing after someone narrowed the real migration.
 */
// Deliberately NOT @Tag("integration"): surefire's <excludedGroups>integration</excludedGroups>
// (pom.xml L155) is a literal rather than a ${property}, so a tagged test cannot be run from the
// CLI and only executes under an opt-in profile. The surefire <includes> already carries
// **/*IT.java, so an untagged IT runs in the DEFAULT suite — which is right for a permanent
// regression guard on filter membership. Same rationale, same wording, as CommercialSubtypeFilter2431IT.
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
class CommercialSubtypeProjectionBackfill2520IT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String MIGRATION_RESOURCE =
            "db/migration/V135__backfill_and_guard_commercial_subtype_projection.sql";

    private static final String CITY_SLUG = "qa2520commercial";
    private static final String AREA_KEY = "QA|QA|" + CITY_SLUG + "|CommercialArea";

    private static final double CENTRE_LAT = 13.00;
    private static final double CENTRE_LON = 74.00;

    // ── The drifted LIVE set: the rows a buyer cannot reach. ─────────────────────────────────
    /** The #2304 import shape: V104 carries SHOP, no projection row exists at all. */
    private static final UUID DRIFT_SHOP_NO_ROW =
            UUID.fromString("25200001-0000-0000-0000-000000000001");
    /** The V102-backfill shape: the projection row EXISTS and its subtype is NULL. */
    private static final UUID DRIFT_SHOP_NULL_ROW =
            UUID.fromString("25200002-0000-0000-0000-000000000002");
    /** A second subtype, so "the fix works" cannot mean "the fix hardcodes SHOP". */
    private static final UUID DRIFT_OFFICE_NO_ROW =
            UUID.fromString("25200003-0000-0000-0000-000000000003");

    // ── Controls. ───────────────────────────────────────────────────────────────────────────
    /** LIVE commercial row with NO subtype in EITHER column — the honest-absence legacy shape. */
    private static final UUID LEGACY_NO_SUBTYPE =
            UUID.fromString("25200004-0000-0000-0000-000000000004");
    /** Non-commercial control, so "only shops came back" cannot pass on an all-shop fixture. */
    private static final UUID APARTMENT =
            UUID.fromString("25200005-0000-0000-0000-000000000005");
    /** Non-LIVE rows where the two columns already AGREE — the other half of the matrix. */
    private static final UUID NONLIVE_AGREE_A =
            UUID.fromString("25200006-0000-0000-0000-000000000006");
    private static final UUID NONLIVE_AGREE_B =
            UUID.fromString("25200007-0000-0000-0000-000000000007");

    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private ListingRepository listingRepository;
    @Autowired
    private CommercialSpaceDetailRepository commercialSpaceDetailRepository;
    @PersistenceContext
    private EntityManager entityManager;

    private DiscoverListingsController listingsController;
    private DiscoverMarkersController markersController;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM listing_commercial_space_details WHERE listing_id IN ("
                + "SELECT id FROM property_listings WHERE area_key LIKE 'QA|QA|%' ESCAPE '')");
        jdbcTemplate.update("DELETE FROM property_listings WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM areas WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM cities WHERE slug = ?", CITY_SLUG);

        int cityId = insertCity();
        insertArea(cityId);

        DiscoverListingsService listingsService =
                new DiscoverListingsService(jdbcTemplate, new SimpleMeterRegistry());
        DiscoverMarkersService markersService =
                new DiscoverMarkersService(jdbcTemplate, new SimpleMeterRegistry());
        NavigationGraphCache cache = new NavigationGraphCache(
                mock(NavigationGraphLoader.class), new NavigationCacheProperties());
        ObjectMapper objectMapper = new ObjectMapper();
        PolygonGeographicSafetyPolicy policy = new PolygonGeographicSafetyPolicy(jdbcTemplate);
        listingsController = new DiscoverListingsController(listingsService, objectMapper, cache, policy);
        markersController = new DiscoverMarkersController(markersService, objectMapper, cache, policy);

        // NOTE: the drifted rows are seeded INSIDE the tests that need them, never here. The guard
        // tests call SET CONSTRAINTS ALL IMMEDIATE, which fires every deferred check queued so far
        // in the transaction — a drifted row seeded in @BeforeEach would detonate those tests from
        // outside their own subject matter.
    }

    // ═════════════════════════════════════════════════════════════════════════════════════════
    // The agreement matrix — the ruling's required proof
    // ═════════════════════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("#2520: the LIVE agreement matrix inverts after the backfill, and list / count / "
            + "marker / index membership move together — measured, not assumed")
    void backfill_invertsTheLiveAgreementMatrix_andAllFourSurfacesAgree() {
        seedDriftedFixture();

        // ── BEFORE: reproduce the defect (CLAUDE.md §5 step 2 — confirm fail) ────────────────
        //
        // The baseline this must beat, from the owner's ruling: for LIVE rows the two columns
        // disagree on every row; for non-LIVE rows they agree on every row. The projection is
        // correct only where no buyer can see it.
        assertThat(disagreeingRows(true))
                .as("BEFORE / LIVE: every LIVE commercial row carrying a V104 subtype must disagree "
                        + "with its V102 projection, or this fixture does not reproduce #2520 and "
                        + "everything below is measuring the wrong thing")
                .isEqualTo(3);
        assertThat(agreeingRows(true))
                .as("BEFORE / LIVE: and none of them agrees")
                .isZero();
        assertThat(agreeingRows(false))
                .as("BEFORE / non-LIVE: the rows nobody can see are the ones that are correct")
                .isEqualTo(2);
        assertThat(disagreeingRows(false))
                .as("BEFORE / non-LIVE: none of them disagrees")
                .isZero();

        // The inventory is present — it is only unreachable. Without this arm, "SHOP returns
        // nothing" is indistinguishable from "the fixture has no commercial rows", and the
        // assertions below would pass against an empty database.
        assertThat(listIds(List.of("commercial"), null))
                .as("BEFORE: broad Commercial returns the drifted rows, so they exist, are LIVE, "
                        + "and are reachable by SOME filter — the subtype axis is what loses them")
                .contains(DRIFT_SHOP_NO_ROW.toString(),
                        DRIFT_SHOP_NULL_ROW.toString(),
                        DRIFT_OFFICE_NO_ROW.toString());

        Surfaces shopBefore = measure("SHOP");
        assertThat(shopBefore.list())
                .as("BEFORE / list: a Commercial→Shop filter returns none of the live Shop rows")
                .doesNotContain(DRIFT_SHOP_NO_ROW.toString(), DRIFT_SHOP_NULL_ROW.toString());
        assertThat(shopBefore.count())
                .as("BEFORE / count: the independent COUNT(*) agrees with the empty page — the two "
                        + "read the same predicate")
                .isZero();
        assertThat(shopBefore.markers())
                .as("BEFORE / marker: the map loses the same rows the list does")
                .doesNotContain(DRIFT_SHOP_NO_ROW.toString(), DRIFT_SHOP_NULL_ROW.toString());
        assertThat(indexedSubtype(DRIFT_SHOP_NO_ROW))
                .as("BEFORE / index: the document OpenSearch would receive carries no subtype, "
                        + "because it is assembled from the V102 projection")
                .isNull();
        assertThat(indexedSubtype(DRIFT_SHOP_NULL_ROW))
                .as("BEFORE / index: same for the row whose projection exists but is NULL")
                .isNull();

        // ── APPLY: the shipped migration statements, not a copy of them ──────────────────────
        applyShippedBackfill();

        // ── AFTER: the matrix inverts for the LIVE set ───────────────────────────────────────
        assertThat(disagreeingRows(true))
                .as("AFTER / LIVE: the inversion the ruling requires — no LIVE commercial row's "
                        + "projection disagrees with its write model any more")
                .isZero();
        assertThat(agreeingRows(true))
                .as("AFTER / LIVE: and all three now agree")
                .isEqualTo(3);
        assertThat(agreeingRows(false))
                .as("AFTER / non-LIVE: the rows that were already correct are untouched — the "
                        + "backfill converges the wrong rows, it does not churn the right ones")
                .isEqualTo(2);
        assertThat(disagreeingRows(false))
                .as("AFTER / non-LIVE: still none")
                .isZero();

        // ── AFTER: all four surfaces, same query, moved together ─────────────────────────────
        Surfaces shopAfter = measure("SHOP");

        assertThat(shopAfter.list())
                .as("AFTER / list: the live Shop rows are discoverable by the filter that names them")
                .contains(DRIFT_SHOP_NO_ROW.toString(), DRIFT_SHOP_NULL_ROW.toString());
        assertThat(shopAfter.count())
                .as("AFTER / count: the independent COUNT(*) reports exactly the page's membership. "
                        + "A count that lagged the list is the same class of defect as #2520 itself")
                .isEqualTo(shopAfter.list().size())
                .isEqualTo(2);
        assertThat(shopAfter.markers())
                .as("AFTER / marker: markers and cards return the SAME id set — the map and the "
                        + "list cannot disagree about which rows are Shops")
                .containsExactlyInAnyOrderElementsOf(shopAfter.list());
        assertThat(indexedSubtype(DRIFT_SHOP_NO_ROW))
                .as("AFTER / index: the document now carries the subtype, so OpenSearch membership "
                        + "moves with SQL membership rather than diverging from it")
                .isEqualTo("SHOP");
        assertThat(indexedSubtype(DRIFT_SHOP_NULL_ROW))
                .as("AFTER / index: same for the NULL-projection shape")
                .isEqualTo("SHOP");

        // The second subtype. Without it, every assertion above is consistent with a backfill that
        // stamps SHOP on every commercial row it can find.
        Surfaces officeAfter = measure("OFFICE");
        assertThat(officeAfter.list())
                .as("AFTER: OFFICE resolves to the OFFICE row and to nothing else — the backfill "
                        + "moved each row's own value, it did not stamp one value everywhere")
                .containsExactly(DRIFT_OFFICE_NO_ROW.toString());
        assertThat(officeAfter.count()).isEqualTo(1);
        assertThat(officeAfter.markers()).containsExactly(DRIFT_OFFICE_NO_ROW.toString());
        assertThat(indexedSubtype(DRIFT_OFFICE_NO_ROW)).isEqualTo("OFFICE");

        // ── AFTER: nothing was invented ──────────────────────────────────────────────────────
        assertThat(shopAfter.list())
                .as("the legacy row has no subtype in EITHER column. V102's rule is 'never guess', "
                        + "and a backfill that promoted it to SHOP would be fabricating a fact")
                .doesNotContain(LEGACY_NO_SUBTYPE.toString())
                .doesNotContain(APARTMENT.toString());
        assertThat(indexedSubtype(LEGACY_NO_SUBTYPE))
                .as("honest absence survives the backfill")
                .isNull();
        assertThat(projectedSubtype(LEGACY_NO_SUBTYPE))
                .as("and its projection row is left exactly as it was")
                .isNull();
        assertThat(listIds(List.of("commercial"), null))
                .as("the legacy row is still reachable under broad Commercial — the backfill took "
                        + "nothing away from a row it could not help")
                .contains(LEGACY_NO_SUBTYPE.toString());

        // Non-LIVE rows stay non-LIVE. The backfill touches the projection, never the status gate.
        assertThat(shopAfter.list())
                .as("a non-LIVE row whose columns agreed all along is still not shown to a buyer")
                .doesNotContain(NONLIVE_AGREE_A.toString(), NONLIVE_AGREE_B.toString());
    }

    @Test
    @DisplayName("#2520: the backfill writes what the application would have written — the "
            + "projection row it creates is the upsertFromListing shape, not a subtype-only stub")
    void backfill_createdRowMatchesTheApplicationWriteShape() {
        seedDriftedFixture();
        applyShippedBackfill();

        // DRIFT_SHOP_NO_ROW had no projection row at all, so this row was CREATED by the backfill.
        // refreshTypedProjections / upsertFromListing source the non-subtype columns from the
        // LEGACY flat columns on property_listings; a row created here that carried only the
        // subtype would be a different shape from one the application writes, and the next edit
        // through ListingCrudService would silently change columns this migration left empty.
        assertThat(jdbcTemplate.queryForMap(
                "SELECT commercial_subtype, floor_number, total_floors, furnishing_status, "
                        + "washrooms, parking_count, commercial_usage "
                        + "FROM listing_commercial_space_details WHERE listing_id = ?",
                DRIFT_SHOP_NO_ROW))
                .containsEntry("commercial_subtype", "SHOP")
                .containsEntry("floor_number", 2)
                .containsEntry("total_floors", 4)
                .containsEntry("furnishing_status", "UNFURNISHED")
                .containsEntry("washrooms", 1)
                .containsEntry("parking_count", 3)
                .containsEntry("commercial_usage", "RETAIL");
    }

    @Test
    @DisplayName("#2520: the backfill is idempotent — a second run changes nothing")
    void backfill_isIdempotent() {
        seedDriftedFixture();
        applyShippedBackfill();

        List<String> afterFirst = listIds(null, List.of("SHOP"));
        applyShippedBackfill();

        assertThat(listIds(null, List.of("SHOP")))
                .as("re-running the migration's DML must be a no-op; a migration that is not "
                        + "idempotent cannot be safely re-applied to a partially-migrated database")
                .containsExactlyInAnyOrderElementsOf(afterFirst);
        assertThat(disagreeingRows(true)).isZero();
    }

    // ═════════════════════════════════════════════════════════════════════════════════════════
    // The guard — "a bypassing write now FAILS rather than silently diverging"
    // ═════════════════════════════════════════════════════════════════════════════════════════

    @Test
    @DisplayName("#2520 guard: a write that reaches V104 with NO projection row at all FAILS with "
            + "'projection missing'")
    void guard_bypassingWriteFailsRatherThanDivergingSilently() {
        UUID bypassing = UUID.fromString("25200008-0000-0000-0000-000000000008");

        // A write that touches property_listings and nothing else. NOTE: this is NOT the shape the
        // #2304 import produces — that one writes a projection row carrying NULL, and is covered by
        // guard_importShapeNullProjectionFails below. An earlier revision of this test claimed to
        // reproduce "the exact shape of the #2304 import"; it does not, and the branch the real
        // import trips went untested through trigger A as a result.
        //
        // This case is still worth holding: it is the shape of any future writer that creates a
        // commercial listing and forgets the projection entirely, and it exercises the OTHER of
        // trigger A's two raise branches.
        insertListing(bypassing, "commercial", "COMMERCIAL", "LIVE", "SHOP");

        assertThat(hasProjectionRow(bypassing))
                .as("precondition: this write really did skip the projection entirely, or the test "
                        + "is not exercising the absent-row branch it names")
                .isFalse();

        // The check is DEFERRED, so it fires at COMMIT — which a rolled-back @DataJpaTest never
        // reaches. Forcing it IMMEDIATE here asks the database the same question a COMMIT would.
        // This is the LAST statement in the test: it aborts the transaction.
        assertThatThrownBy(() -> jdbcTemplate.execute("SET CONSTRAINTS ALL IMMEDIATE"))
                .as("the drift must now be a hard failure. Before V135 this write committed "
                        + "silently and produced a listing no subtype filter could reach")
                .hasStackTraceContaining("#2520")
                .hasStackTraceContaining("projection missing");
    }

    @Test
    @DisplayName("#2520 guard: the #2304 import's ACTUAL shape — projection row PRESENT but "
            + "carrying NULL — FAILS through trigger A with 'out of step'")
    void guard_importShapeNullProjectionFails() {
        UUID importShape = UUID.fromString("25200017-0000-0000-0000-000000000017");

        // THE SHAPE THE PRODUCTION IMPORT ACTUALLY PRODUCES.
        //
        // data/imports/udupi-properties-2304/import.sql DOES write the projection table: three
        // INSERT INTO public.listing_commercial_space_details statements at :632, :668 and :705,
        // whose VALUES tuples (:633, :669, :706) set commercial_subtype explicitly to NULL —
        //   ((md5('99acres:' || 'Y92487718'))::uuid, NULL, NULL, 4, NULL, 0, NULL, NULL, NULL)
        // while that listing's V104 column carries 'SHOP'.
        //
        // WHY THIS NEEDS ITS OWN TEST. guard_clearingTheProjectionFails also asserts "out of step",
        // but it reaches that branch by UPDATEing listing_commercial_space_details — which fires
        // trigger B: a different function, no WHEN clause, id resolved through TG_OP. Arriving at
        // the same message by a different route is not coverage of this one. Without this case, the
        // branch the production import actually trips is never exercised through trigger A.
        insertListing(importShape, "commercial", "COMMERCIAL", "LIVE", "SHOP");
        insertProjection(importShape, null);

        assertThat(hasProjectionRow(importShape))
                .as("precondition: the import shape HAS a projection row — that is exactly what "
                        + "distinguishes it from the absent-row case above")
                .isTrue();
        assertThat(projectedSubtype(importShape))
                .as("precondition: and its subtype is NULL, which is what makes the row "
                        + "unreachable by a SHOP filter while broad Commercial still returns it")
                .isNull();

        assertThatThrownBy(() -> jdbcTemplate.execute("SET CONSTRAINTS ALL IMMEDIATE"))
                .as("trigger A must reject the real import shape, reached through the listing-side "
                        + "trigger rather than the projection-side one")
                .hasStackTraceContaining("#2520")
                .hasStackTraceContaining("out of step");
    }

    @Test
    @DisplayName("#2520 guard: clearing the projection out from under a populated write model also "
            + "FAILS — the same hole, opened from the other side")
    void guard_clearingTheProjectionFails() {
        UUID consistent = UUID.fromString("25200009-0000-0000-0000-000000000009");
        insertListing(consistent, "commercial", "COMMERCIAL", "LIVE", "SHOP");
        insertProjection(consistent, "SHOP");

        jdbcTemplate.update(
                "UPDATE listing_commercial_space_details SET commercial_subtype = NULL "
                        + "WHERE listing_id = ?", consistent);

        assertThatThrownBy(() -> jdbcTemplate.execute("SET CONSTRAINTS ALL IMMEDIATE"))
                .as("a guard that only watched property_listings would let the identical defect "
                        + "back in through an UPDATE on the projection table")
                .hasStackTraceContaining("#2520")
                .hasStackTraceContaining("out of step");
    }

    @Test
    @DisplayName("#2520 guard: the application's own write order is accepted — the guard rejects "
            + "drift, not commercial writes")
    void guard_acceptsTheApplicationWriteOrder() {
        UUID viaApp = UUID.fromString("25200010-0000-0000-0000-000000000010");

        // ListingCrudService saves the listing and THEN refreshes the projection, both inside one
        // transaction. An IMMEDIATE constraint would reject this correct sequence between the two
        // statements; DEFERRED asks only whether the invariant holds when the transaction ends.
        insertListing(viaApp, "commercial", "COMMERCIAL", "LIVE", "SHOP");
        insertProjection(viaApp, "SHOP");

        assertThatCode(() -> jdbcTemplate.execute("SET CONSTRAINTS ALL IMMEDIATE"))
                .as("a guard that also rejected valid writes would be indistinguishable from one "
                        + "that always throws — which is what makes the two failing tests above "
                        + "mean something")
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("#2520 guard: silent on the cases contracts/commercial-subtype-mapping.json "
            + "declares legitimate — a stray subtype off-family, and a commercial row with none")
    void guard_doesNotContradictTheSubtypeContract() {
        // "non-commercial-with-stray-subtype": an apartment carrying a subtype resolves to null on
        // both resolvers. It has no commercial projection row by design — refreshTypedProjections
        // DELETES one — so demanding a projection here would put the guard in direct conflict with
        // the #2458 contract.
        UUID strayOffFamily = UUID.fromString("25200011-0000-0000-0000-000000000011");
        insertListing(strayOffFamily, "apartment", "RESIDENTIAL", "LIVE", "SHOP");

        // "legacy-generic-commercial": a commercial row with no declared subtype. V102's rule is
        // never to guess one, so this must stay writable.
        UUID commercialNoSubtype = UUID.fromString("25200012-0000-0000-0000-000000000012");
        insertListing(commercialNoSubtype, "commercial", "COMMERCIAL", "LIVE", null);

        assertThatCode(() -> jdbcTemplate.execute("SET CONSTRAINTS ALL IMMEDIATE"))
                .as("the guard's scope is exactly the axis that can drift: property_type "
                        + "'commercial' with a declared subtype. Widening it would change the "
                        + "taxonomy's meaning, which #2520 explicitly does not do")
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("#2520 guard: a self-describing BUILDING / WAREHOUSE / LAND row with NO projection "
            + "row is ACCEPTED — for those types the V104 column is the subtype's only home")
    void guard_acceptsSelfDescribingTypesWithNoProjectionRow() {
        // THE SCOPE BOUNDARY, and why it is drawn at property_type rather than listing_family.
        //
        // Only listing_commercial_space_details carries a V102 commercial_subtype column. For the
        // self-describing types the subtype lives ONLY in the V104 flat column, and the typed
        // projection row belongs in a DIFFERENT table entirely:
        //
        //   commercial          -> SHOP | OFFICE | NULL -> listing_commercial_space_details
        //   commercial_building -> BUILDING             -> listing_commercial_building_details
        //   warehouse           -> WAREHOUSE            -> listing_warehouse_details
        //   commercial_land     -> LAND                 -> listing_commercial_land_details
        //
        // stated as the fixture's own contract in
        // scripts/db/fixtures/commercial-listings-seed.sql (~L79-88).
        //
        // A guard scoped on listing_family='COMMERCIAL' demands an lcsd row for all four, which the
        // schema deliberately does not provide. An earlier revision of V135 did exactly that and
        // REJECTED the canonical Commercial E2E fixture (#2517) at load time, on its BUILDING row,
        // written through raw psql. These rows also cannot exhibit the #2520 defect at all: every
        // read surface resolves their subtype from property_type alone, so a missing lcsd row
        // loses nothing. Only 'commercial' has a BEARING subtype — the one axis on which SHOP and
        // OFFICE can be told apart, and therefore the only one a NULL projection can hide.
        UUID building = UUID.fromString("25200014-0000-0000-0000-000000000014");
        insertListing(building, "commercial_building", "COMMERCIAL", "LIVE", "BUILDING");
        UUID warehouse = UUID.fromString("25200015-0000-0000-0000-000000000015");
        insertListing(warehouse, "warehouse", "COMMERCIAL", "LIVE", "WAREHOUSE");
        UUID land = UUID.fromString("25200016-0000-0000-0000-000000000016");
        insertListing(land, "commercial_land", "COMMERCIAL", "LIVE", "LAND");

        assertThat(hasProjectionRow(building))
                .as("precondition: the shape under test is a self-describing row with NO "
                        + "commercial-space projection row — the canonical fixture's own shape")
                .isFalse();

        assertThatCode(() -> jdbcTemplate.execute("SET CONSTRAINTS ALL IMMEDIATE"))
                .as("the guard must not demand a projection row the schema does not provide; "
                        + "rejecting these breaks the canonical Commercial fixture and guards rows "
                        + "that cannot exhibit the defect")
                .doesNotThrowAnyException();
    }

    @Test
    @DisplayName("#2520 guard: a case-only difference between the two columns is accepted, because "
            + "all four read surfaces already normalise case")
    void guard_toleratesCaseOnlyDifference() {
        UUID lowerProjection = UUID.fromString("25200013-0000-0000-0000-000000000013");
        insertListing(lowerProjection, "commercial", "COMMERCIAL", "LIVE", "SHOP");
        insertProjection(lowerProjection, "shop");

        assertThatCode(() -> jdbcTemplate.execute("SET CONSTRAINTS ALL IMMEDIATE"))
                .as("the column has no CHECK constraint (V102 ~L85, deliberate) and every read path "
                        + "applies UPPER() or normalizeCommercialSubtype, so these two agree "
                        + "everywhere it matters. Rejecting this would fail rows that are not broken")
                .doesNotThrowAnyException();
    }

    // ═════════════════════════════════════════════════════════════════════════════════════════
    // Fixture + measurement helpers
    // ═════════════════════════════════════════════════════════════════════════════════════════

    /** The four numbers the surfaces are compared on, captured from ONE filter selection. */
    private record Surfaces(List<String> list, long count, List<String> markers) {}

    private Surfaces measure(String subtype) {
        DiscoverListingsPage page = listingsController
                .getListings(CITY_SLUG, null, List.of(subtype), null, null, null, null, null, null,
                        null, null, null, null, null, null, null, null, null, null,
                        0, 50, false, null, null, null, null, null, null, null)
                .getBody();
        assertThat(page).as("the listings endpoint must return a body").isNotNull();

        DiscoverMarkersResponse markers = markersController
                .getMarkers(CITY_SLUG, null, List.of(subtype), null, null, null, null, null, null,
                        null, null, null, null, null, null, null, null, null, null, null, null,
                        null, null, null, null, null, null)
                .getBody();
        assertThat(markers).as("the markers endpoint must return a body").isNotNull();

        return new Surfaces(
                page.content().stream().map(DiscoverListingResponse::id).toList(),
                page.totalElements(),
                markers.markers().stream().map(DiscoverMarker::id).toList());
    }

    private List<String> listIds(List<String> propertyTypes, List<String> subtypes) {
        DiscoverListingsPage page = listingsController
                .getListings(CITY_SLUG, propertyTypes, subtypes, null, null, null, null, null, null,
                        null, null, null, null, null, null, null, null, null, null,
                        0, 50, false, null, null, null, null, null, null, null)
                .getBody();
        assertThat(page).isNotNull();
        return page.content().stream().map(DiscoverListingResponse::id).toList();
    }

    /**
     * The index surface, assembled exactly as SearchOutboxPoller does it (~L228-241): the entity,
     * plus the V102 projection loaded only when the family is COMMERCIAL. Returns the value that
     * would be written to the OpenSearch {@code commercial_subtype} field.
     */
    private String indexedSubtype(UUID listingId) {
        // Read from the DATABASE, not from this test's session. The backfill is raw SQL, so an
        // entity already loaded in the BEFORE arm would still be carrying its pre-backfill subtype
        // and the AFTER arm would report a failure that exists only in Hibernate's first-level
        // cache. SearchOutboxPoller gets a fresh persistence context on every poll cycle, so
        // clearing here models the indexer rather than papering over anything.
        entityManager.clear();

        Listing listing = listingRepository.findById(listingId)
                .orElseThrow(() -> new AssertionError("fixture listing " + listingId + " not found"));
        CommercialSpaceDetail commercial = "COMMERCIAL".equals(listing.getListingFamily())
                ? commercialSpaceDetailRepository.findById(listingId).orElse(null)
                : null;
        return ListingIndexDocument.fromListing(listing, null, commercial, null).getCommercialSubtype();
    }

    /**
     * Rows in this fixture's area where the write model carries a subtype and the read model does
     * NOT match it — either because the projection row is absent, or because its value is NULL or
     * different. {@code live} partitions the matrix the way the ruling states it.
     */
    private int disagreeingRows(boolean live) {
        return matrixCount(live, "(lcsd.listing_id IS NULL OR lcsd.commercial_subtype IS NULL "
                + "OR UPPER(lcsd.commercial_subtype) <> UPPER(pl.commercial_subtype))");
    }

    private int agreeingRows(boolean live) {
        return matrixCount(live, "(lcsd.commercial_subtype IS NOT NULL "
                + "AND UPPER(lcsd.commercial_subtype) = UPPER(pl.commercial_subtype))");
    }

    private int matrixCount(boolean live, String agreementPredicate) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM property_listings pl "
                        + "LEFT JOIN listing_commercial_space_details lcsd ON lcsd.listing_id = pl.id "
                        + "WHERE pl.area_key = ? "
                        + "  AND pl.listing_family = 'COMMERCIAL' "
                        + "  AND pl.commercial_subtype IS NOT NULL "
                        + "  AND (pl.status = 'LIVE') = ? "
                        + "  AND " + agreementPredicate,
                Integer.class, AREA_KEY, live);
        return n == null ? 0 : n;
    }

    /**
     * Executes the DML half of the shipped V135 migration — everything before the STEP 3 guard,
     * which is DDL this container already has. Reading the real file rather than restating the
     * statements is the point: a narrowed migration must fail this test, not slip past a copy.
     */
    private void applyShippedBackfill() {
        String sql;
        try (InputStream in = new ClassPathResource(MIGRATION_RESOURCE).getInputStream()) {
            sql = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new AssertionError("V135 migration not on the classpath at " + MIGRATION_RESOURCE, e);
        }

        int guardStart = sql.indexOf("-- STEP 3:");
        assertThat(guardStart)
                .as("the migration's STEP 3 marker anchors this split. If it is renamed, this test "
                        + "must be updated rather than silently executing the DDL as well")
                .isGreaterThan(0);

        String dml = Arrays.stream(sql.substring(0, guardStart).split("\n"))
                .filter(line -> !line.stripLeading().startsWith("--"))
                .reduce("", (a, b) -> a + "\n" + b);

        List<String> statements = Arrays.stream(dml.split(";"))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();

        assertThat(statements)
                .as("STEP 1 (INSERT the missing projection rows) and STEP 2 (UPDATE the ones that "
                        + "disagree). A different count means the migration's DML changed shape and "
                        + "this test is no longer running what ships")
                .hasSize(2);

        statements.forEach(jdbcTemplate::execute);
    }

    private void seedDriftedFixture() {
        insertListing(DRIFT_SHOP_NO_ROW, "commercial", "COMMERCIAL", "LIVE", "SHOP");
        insertListing(DRIFT_SHOP_NULL_ROW, "commercial", "COMMERCIAL", "LIVE", "SHOP");
        insertProjection(DRIFT_SHOP_NULL_ROW, null);
        insertListing(DRIFT_OFFICE_NO_ROW, "commercial", "COMMERCIAL", "LIVE", "OFFICE");

        insertListing(LEGACY_NO_SUBTYPE, "commercial", "COMMERCIAL", "LIVE", null);
        insertProjection(LEGACY_NO_SUBTYPE, null);
        insertListing(APARTMENT, "apartment", "RESIDENTIAL", "LIVE", null);

        insertListing(NONLIVE_AGREE_A, "commercial", "COMMERCIAL", "PENDING_REVIEW","SHOP");
        insertProjection(NONLIVE_AGREE_A, "SHOP");
        insertListing(NONLIVE_AGREE_B, "commercial", "COMMERCIAL", "PENDING_REVIEW","OFFICE");
        insertProjection(NONLIVE_AGREE_B, "OFFICE");

        // Fixture authenticity. Asserted before anything under test runs, so a fixture that
        // accidentally populated both columns fails HERE rather than as a green result later.
        assertThat(hasProjectionRow(DRIFT_SHOP_NO_ROW))
                .as("precondition: the import shape has NO projection row")
                .isFalse();
        assertThat(projectedSubtype(DRIFT_SHOP_NULL_ROW))
                .as("precondition: the V102-backfill shape has a row whose subtype is NULL")
                .isNull();
        assertThat(flatSubtype(DRIFT_SHOP_NULL_ROW))
                .as("precondition: and its write model DOES carry the value — 'known but unread' "
                        + "is the whole defect")
                .isEqualTo("SHOP");
    }

    private int insertCity() {
        jdbcTemplate.update(
                "INSERT INTO cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, ?, ?, true)",
                CITY_SLUG, CITY_SLUG, CENTRE_LAT, CENTRE_LON);
        return jdbcTemplate.queryForObject(
                "SELECT id FROM cities WHERE slug = ?", Integer.class, CITY_SLUG);
    }

    private void insertArea(int cityId) {
        jdbcTemplate.update(
                "INSERT INTO areas (area_key, city_id, name, geo_center_lat, geo_center_lon, "
                        + "min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                AREA_KEY, cityId, "Commercial Area", CENTRE_LAT, CENTRE_LON,
                CENTRE_LAT - 0.1, CENTRE_LON - 0.1, CENTRE_LAT + 0.1, CENTRE_LON + 0.1);
    }

    /**
     * Writes a listing the way the #2304 import does — straight into property_listings, including
     * the V104 flat {@code commercial_subtype}, with no statement touching the projection table.
     * The legacy flat columns are populated so the backfill's STEP 1 has real values to carry over
     * and {@link #backfill_createdRowMatchesTheApplicationWriteShape()} can check that it did.
     */
    private void insertListing(UUID id, String propertyType, String family, String status,
                               String v104Subtype) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, property_type, "
                        + " listing_family, commercial_subtype, floor_number, total_floors, "
                        + " furnishing_status, washrooms, parking_count, commercial_usage, "
                        + " latitude, longitude, price_paise, created_at, updated_at) "
                        + "VALUES (?, ?, ?, NULL, false, true, ?, ?, ?, 2, 4, 'UNFURNISHED', 1, 3, "
                        + " 'RETAIL', ?, ?, 5000000, ?, ?)",
                id, AREA_KEY, status, propertyType, family, v104Subtype,
                CENTRE_LAT, CENTRE_LON, now, now);
    }

    /** Writes the V102 projection row. A null subtype reproduces the V102 backfill shape exactly. */
    private void insertProjection(UUID listingId, String subtype) {
        jdbcTemplate.update(
                "INSERT INTO public.listing_commercial_space_details (listing_id, commercial_subtype) "
                        + "VALUES (?, ?)",
                listingId, subtype);
    }

    private String projectedSubtype(UUID listingId) {
        return jdbcTemplate.queryForObject(
                "SELECT commercial_subtype FROM listing_commercial_space_details WHERE listing_id = ?",
                String.class, listingId);
    }

    private String flatSubtype(UUID listingId) {
        return jdbcTemplate.queryForObject(
                "SELECT commercial_subtype FROM property_listings WHERE id = ?",
                String.class, listingId);
    }

    private boolean hasProjectionRow(UUID listingId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM listing_commercial_space_details WHERE listing_id = ?",
                Integer.class, listingId);
        return count != null && count > 0;
    }
}

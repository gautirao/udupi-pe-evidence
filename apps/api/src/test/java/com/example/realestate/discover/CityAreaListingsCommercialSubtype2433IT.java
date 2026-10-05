package com.example.realestate.discover;

import com.example.realestate.discover.navigation.NavigationCacheProperties;
import com.example.realestate.discover.navigation.NavigationGraphCache;
import com.example.realestate.discover.navigation.NavigationGraphLoader;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
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
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * Testcontainers real-DB proof for issue #2433: the ANON city-area Discover read path projects
 * {@code commercialSubtype}, spells it the same way the authenticated path does, and does not
 * disturb the empty-area or per-area-cap behaviour that path already guaranteed.
 *
 * <h2>Why this endpoint needed the field at all</h2>
 *
 * <p>{@code PropertyCard} is fed by three different backends and, before this change, only
 * {@code /api/discover/listings} could express a subtype. That is not a cosmetic gap. The card's
 * summary model falls back to a legacy-generic branch when the subtype is absent, and that branch
 * asserts a claim about the DATA — "this row's Shop-vs-Office was never recorded". Reached through
 * this endpoint it would have stated that falsely for a listing whose subtype IS recorded,
 * indistinguishable from a genuine V102 legacy row. Honest absence only works if absence means
 * absence, which is why the field is projected rather than the card being taught to guess.
 *
 * <p>This is the READ-MODEL counterpart of #2509, which covers only the query direction (this
 * endpoint still cannot be FILTERED by subtype). Scope expansion into {@code CityAreaListingsService}
 * was explicitly authorised for the single-field append; the fact set is deliberately NOT added here.
 *
 * <h2>Why a real database rather than a mocked JdbcTemplate</h2>
 *
 * <p>Every claim under test is a claim about SQL semantics: that a LEFT JOIN onto a projection table
 * keyed by {@code listing_id} PK cannot multiply a row or drop one, and — the case a mock cannot
 * reach at all — that an area with ZERO live listings still returns its row after a second LEFT JOIN
 * was added beneath the first. A mock would assert the string that was written, not what Postgres
 * does with it.
 *
 * <p>That distinction is not hypothetical on this issue. #2433's first backend cut passed three
 * mock-based unit tests while every authenticated {@code GET /api/discover/listings} returned 500,
 * because {@code getObject(col, Double.class)} is rejected by pgjdbc on a {@code numeric} column.
 * Mocks cannot execute SQL, so they cannot catch SQL defects.
 *
 * <p><b>Facts have since been added to this service by #2516</b>, so the warning this file used to
 * carry — that {@code road_frontage_ft} and {@code warehouse_clear_height_ft} are {@code numeric}
 * on this path too and must never go through {@code getObject(..., Double.class)} — is now
 * enforced rather than advisory: both feeds read every commercial column through
 * {@link CommercialFactAuthority}, and {@code CityAreaListingsCommercialFacts2516IT} drives real
 * {@code numeric} values through it. The subtype arms below remain this file's subject; the fact
 * arms live in that file.
 */
// Deliberately NOT annotated @Tag("integration") — surefire's <excludedGroups>integration</...> is a
// literal, so a tagged test cannot be run from the CLI and only executes under an opt-in profile
// (#1794). The surefire <includes> already carries **/*IT.java, so an untagged IT runs in the
// DEFAULT suite, which is what a permanent regression guard should do.
// @Testcontainers(disabledWithoutDocker = true) makes it skip gracefully where Docker is absent.
// Same rationale and same wording as CommercialSubtypeFilter2431IT.
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
class CityAreaListingsCommercialSubtype2433IT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String CITY_SLUG = "qa2433cards";
    private static final String AREA_KEY = "QA|QA|" + CITY_SLUG + "|CardArea";
    /** A second area with NO live listings — the LEFT JOIN regression target. */
    private static final String EMPTY_AREA_KEY = "QA|QA|" + CITY_SLUG + "|EmptyArea";

    private static final double CENTRE_LAT = 13.00;
    private static final double CENTRE_LON = 74.00;

    private static final UUID SHOP_ID = UUID.fromString("24330001-0000-0000-0000-000000000001");
    private static final UUID OFFICE_ID = UUID.fromString("24330002-0000-0000-0000-000000000002");
    /** Legacy commercial row WITH a projection row whose subtype is NULL (the V102 backfill shape). */
    private static final UUID LEGACY_NULL_SUBTYPE_ID = UUID.fromString("24330003-0000-0000-0000-000000000003");
    /** Legacy commercial row with NO projection row at all. */
    private static final UUID LEGACY_NO_ROW_ID = UUID.fromString("24330004-0000-0000-0000-000000000004");
    /** Non-commercial control, so "only shops carry a subtype" cannot pass vacuously. */
    private static final UUID APARTMENT_ID = UUID.fromString("24330005-0000-0000-0000-000000000005");
    /** Subtype stored LOWER case — the column carries no CHECK constraint, so this is representable. */
    private static final UUID LOWERCASE_SHOP_ID = UUID.fromString("24330006-0000-0000-0000-000000000006");
    /** A self-describing Commercial family type, which carries no subtype on any axis. */
    private static final UUID WAREHOUSE_ID = UUID.fromString("24330007-0000-0000-0000-000000000007");
    /**
     * #2509 — an ARCHIVED commercial row carrying a genuine SHOP subtype. It exists solely to make
     * the union's wrapping parentheses testable as BEHAVIOUR rather than as captured text: {@code OR}
     * has the lowest precedence in SQL, so an unparenthesised union would regroup the LEFT JOIN ON
     * clause into {@code (… AND status='LIVE' AND leftBranch) OR (rightBranch AND agriExclusion)},
     * detaching {@code status} and {@code area_key} from the right branch entirely — and this row,
     * which satisfies the right branch alone, would leak into an anon buyer's results.
     */
    private static final UUID ARCHIVED_SHOP_ID = UUID.fromString("25090001-0000-0000-0000-000000000001");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private CityAreaListingsService cityAreaService;
    private DiscoverListingsController listingsController;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("DELETE FROM listing_commercial_space_details WHERE listing_id IN ("
                + "SELECT id FROM property_listings WHERE area_key LIKE 'QA|QA|%' ESCAPE '')");
        jdbcTemplate.update("DELETE FROM property_listings WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM areas WHERE area_key LIKE 'QA|QA|%' ESCAPE ''");
        jdbcTemplate.update("DELETE FROM cities WHERE slug = ?", CITY_SLUG);

        int cityId = insertCity();
        insertArea(cityId, AREA_KEY, "Card Area");
        insertArea(cityId, EMPTY_AREA_KEY, "Empty Area");

        insertLiveListing(SHOP_ID, "commercial");
        insertLiveListing(OFFICE_ID, "commercial");
        insertLiveListing(LEGACY_NULL_SUBTYPE_ID, "commercial");
        insertLiveListing(LEGACY_NO_ROW_ID, "commercial");
        insertLiveListing(APARTMENT_ID, "apartment");
        insertLiveListing(LOWERCASE_SHOP_ID, "commercial");
        insertLiveListing(WAREHOUSE_ID, "warehouse");

        insertCommercialDetail(SHOP_ID, "SHOP");
        insertCommercialDetail(OFFICE_ID, "OFFICE");
        insertCommercialDetail(LEGACY_NULL_SUBTYPE_ID, null);
        insertCommercialDetail(LOWERCASE_SHOP_ID, "shop");
        // LEGACY_NO_ROW_ID, APARTMENT_ID and WAREHOUSE_ID deliberately get NO projection row.

        // #2509 — the parentheses fixture. Deliberately NOT live, so every existing arm above is
        // unaffected (they all read through the status='LIVE' predicate and therefore cannot see
        // it), while the subtype-filter arms below can prove it never leaks.
        insertArchivedListing(ARCHIVED_SHOP_ID, "commercial");
        insertCommercialDetail(ARCHIVED_SHOP_ID, "SHOP");

        // Fixture-authenticity preconditions, asserted BEFORE anything under test runs, so a broken
        // fixture fails here rather than as a misleading assertion further down.
        assertThat(storedSubtype(SHOP_ID)).isEqualTo("SHOP");
        assertThat(storedSubtype(LOWERCASE_SHOP_ID)).isEqualTo("shop");
        assertThat(storedSubtype(LEGACY_NULL_SUBTYPE_ID)).isNull();
        assertThat(hasDetailRow(LEGACY_NO_ROW_ID))
                .as("precondition: the no-projection-row fixture must genuinely have no row — "
                        + "otherwise it duplicates the NULL-subtype case instead of covering its own")
                .isFalse();
        assertThat(liveListingCount(EMPTY_AREA_KEY))
                .as("precondition: the empty-area fixture must genuinely have zero LIVE listings — "
                        + "otherwise the LEFT JOIN regression test below cannot fail")
                .isZero();

        cityAreaService = new CityAreaListingsService(jdbcTemplate);

        // Built exactly as CommercialSubtypeFilter2431IT builds it, so the authenticated arm of
        // the parity test below exercises the real controller path rather than a shortcut.
        DiscoverListingsService listingsService =
                new DiscoverListingsService(jdbcTemplate, new SimpleMeterRegistry());
        NavigationGraphCache cache = new NavigationGraphCache(
                mock(NavigationGraphLoader.class), new NavigationCacheProperties());
        listingsController = new DiscoverListingsController(
                listingsService, new ObjectMapper(), cache,
                new PolygonGeographicSafetyPolicy(jdbcTemplate), new AreaSummaryService(jdbcTemplate));
    }

    @Test
    @DisplayName("AC: the anon city-area card carries commercialSubtype for a Shop and an Office, "
            + "and reports honest absence — never a fabricated value — for every other shape")
    void areaCards_carrySubtype_andReportHonestAbsence() {
        List<AreaListingCard> cards = areaCards();

        assertThat(subtypeOf(cards, SHOP_ID)).isEqualTo("SHOP");
        assertThat(subtypeOf(cards, OFFICE_ID)).isEqualTo("OFFICE");

        // All three absence shapes must be null, and null must not be confused between them —
        // the caller separates them using propertyType, which is NOT NULL.
        assertThat(subtypeOf(cards, LEGACY_NULL_SUBTYPE_ID))
                .as("legacy commercial WITH a projection row whose subtype is NULL")
                .isNull();
        assertThat(subtypeOf(cards, LEGACY_NO_ROW_ID))
                .as("legacy commercial with NO projection row at all")
                .isNull();
        assertThat(subtypeOf(cards, APARTMENT_ID))
                .as("not a commercial listing")
                .isNull();
        assertThat(subtypeOf(cards, WAREHOUSE_ID))
                .as("self-describing Commercial family type — resolves from propertyType, "
                        + "carries no subtype on any axis")
                .isNull();
    }

    @Test
    @DisplayName("AC: a lower-case stored subtype is canonicalised to UPPER case, so the card "
            + "surface never has to know the column lacks a CHECK constraint")
    void areaCards_canonicaliseStoredCase() {
        assertThat(subtypeOf(areaCards(), LOWERCASE_SHOP_ID)).isEqualTo("SHOP");
    }

    @Test
    @DisplayName("AC (the reason this test exists): the anon card path and the authenticated "
            + "listings path return the SAME spelling of the subtype for the SAME listing")
    void bothDiscoverReadPathsAgreeOnTheSubtypeSpelling() {
        List<AreaListingCard> cards = areaCards();
        List<DiscoverListingResponse> authListings = authListings();

        // Asserted as EQUALITY per listing, not "both non-null": a both-present assertion passes
        // even when one path says "SHOP" and the other says "shop", which is exactly the drift
        // that duplicating normalizeCommercialSubtype across two services could introduce.
        for (UUID id : List.of(SHOP_ID, OFFICE_ID, LOWERCASE_SHOP_ID, LEGACY_NULL_SUBTYPE_ID,
                LEGACY_NO_ROW_ID, APARTMENT_ID, WAREHOUSE_ID)) {
            assertThat(subtypeOf(cards, id))
                    .as("anon card path and authenticated listings path must agree for " + id)
                    .isEqualTo(authSubtypeOf(authListings, id));
        }
    }

    @Test
    @DisplayName("AC (regression): an area with ZERO live listings still returns its entry — the "
            + "new LEFT JOIN must not convert the outer LEFT JOIN on property_listings to an inner one")
    void emptyAreaStillReturnsItsEntry() {
        CityAreaListingsResponse response = cityAreaService.getAreaListings(
                CITY_SLUG, List.of(AREA_KEY, EMPTY_AREA_KEY), 20, null, null, null, null, null,
                null, null, null, false);

        assertThat(response.areas().stream().map(AreaListingsEntry::areaKey))
                .as("both requested areas must be present, including the one with no listings")
                .containsExactlyInAnyOrder(AREA_KEY, EMPTY_AREA_KEY);

        AreaListingsEntry empty = response.areas().stream()
                .filter(a -> EMPTY_AREA_KEY.equals(a.areaKey()))
                .findFirst()
                .orElseThrow();
        assertThat(empty.listings())
                .as("the empty area's entry must carry zero listings, not a phantom row")
                .isEmpty();
    }

    @Test
    @DisplayName("AC (no row multiplication): the projection LEFT JOIN is 1:0..1 on a PK, so each "
            + "listing appears exactly once and the per-area cap still counts real listings")
    void projectionJoinDoesNotMultiplyRows() {
        List<AreaListingCard> cards = areaCards();

        assertThat(cards.stream().map(AreaListingCard::id))
                .as("every fixture listing appears exactly once")
                .containsExactlyInAnyOrder(SHOP_ID, OFFICE_ID, LEGACY_NULL_SUBTYPE_ID,
                        LEGACY_NO_ROW_ID, APARTMENT_ID, LOWERCASE_SHOP_ID, WAREHOUSE_ID);

        // The per-area cap is applied by ROW_NUMBER() inside the subquery. If the join could
        // duplicate a row, the cap would silently count duplicates and drop real listings.
        CityAreaListingsResponse capped = cityAreaService.getAreaListings(
                CITY_SLUG, List.of(AREA_KEY), 3, null, null, null, null, null, null, null, null, false);
        assertThat(capped.areas()).hasSize(1);
        assertThat(capped.areas().get(0).listings())
                .as("limitPerArea=3 must return 3 DISTINCT listings")
                .hasSize(3);
        assertThat(capped.areas().get(0).listings().stream().map(AreaListingCard::id).distinct().count())
                .isEqualTo(3L);
    }

    // ── #2509: the query direction — this endpoint can now be FILTERED by subtype ────
    // The arms above prove the subtype is PROJECTED onto the card. These prove it can be used to
    // narrow, which is the half #2509 tracked as still open. A mocked JdbcTemplate cannot reach
    // any of this: every claim below is a claim about what Postgres does with the emitted SQL.

    @Test
    @DisplayName("#2509: a SHOP filter returns exactly the Shop rows — case-insensitively on the "
            + "stored column — and never classifies a legacy NULL or missing projection row as SHOP")
    void subtypeFilter_returnsOnlyShops_andNeverGuessesLegacyRows() {
        List<AreaListingCard> cards = areaCardsFiltered(null, List.of("SHOP"));

        assertThat(cards.stream().map(AreaListingCard::id))
                .as("both genuinely-Shop rows, including the one stored lower-case — UPPER() is "
                        + "applied to the COLUMN precisely because no CHECK constraint enforces case")
                .containsExactlyInAnyOrder(SHOP_ID, LOWERCASE_SHOP_ID);

        // Stated as explicit exclusions rather than left to the containsExactly above, because each
        // is a DIFFERENT reason and a future change could reintroduce any one of them alone.
        assertThat(cards.stream().map(AreaListingCard::id))
                .as("OFFICE is a different subtype; NULL IN ('SHOP') is NULL, not TRUE; a row with "
                        + "no projection row satisfies no EXISTS; an apartment is not commercial")
                .doesNotContain(OFFICE_ID, LEGACY_NULL_SUBTYPE_ID, LEGACY_NO_ROW_ID, APARTMENT_ID);
    }

    @Test
    @DisplayName("#2509 (the reason the clause is a UNION): Shop + Warehouse returns BOTH, which an "
            + "AND of the two axes could not express at all")
    void mixedSelection_spansBearingAndSelfDescribingTypes() {
        List<AreaListingCard> cards = areaCardsFiltered(null, List.of("SHOP", "WAREHOUSE"));

        // The Warehouse row has NO listing_commercial_space_details row whatsoever — V102 inserts
        // only WHERE property_type = 'commercial'. Under the pre-#2458 AND it passed
        // property_type IN (...) and was then eliminated by UPPER(commercial_subtype) IN ('SHOP'),
        // so this approved buyer selection returned an incomplete set. It is matched here by the
        // non-bearing branch instead, on property_type, which is NOT NULL and always correct.
        assertThat(cards.stream().map(AreaListingCard::id))
                .containsExactlyInAnyOrder(SHOP_ID, LOWERCASE_SHOP_ID, WAREHOUSE_ID);

        assertThat(cards.stream().map(AreaListingCard::id))
                .as("still no OFFICE, and still no fabricated classification of the legacy rows")
                .doesNotContain(OFFICE_ID, LEGACY_NULL_SUBTYPE_ID, LEGACY_NO_ROW_ID);
    }

    @Test
    @DisplayName("#2509 (parentheses, proved behaviourally): a row that satisfies the subtype branch "
            + "but fails status='LIVE' must NOT leak — OR binds looser than AND")
    void theUnionCannotLeakARowThatFailsTheOtherPredicates() {
        // THE SELECTION IS LOAD-BEARING AND MUST SPAN BOTH BRANCHES. An earlier version of this arm
        // passed List.of("SHOP") and could not fail for its own input: SHOP implies only
        // `commercial`, which is the sole member of SUBTYPE_BEARING_PROPERTY_TYPES, so nonBearing
        // was empty, the emitter never appended " OR ", and removing the outer parenthesis still
        // left `AND (bearing AND EXISTS)` — correctly grouped, archived row still excluded. The arm
        // passed with and without the thing it is named for. Its isNotEmpty() control did not
        // rescue it: a positive control rules out passing-by-emptiness, which is a DIFFERENT hazard
        // from a mutation that is inert for the input under test.
        //
        // SHOP + WAREHOUSE spans bearing and non-bearing, so the union genuinely emits
        // `(nonBearing OR (bearing AND EXISTS))` and the parentheses become load-bearing here.
        List<AreaListingCard> cards = areaCardsFiltered(null, List.of("SHOP", "WAREHOUSE"));

        // ARCHIVED_SHOP_ID is a genuine commercial+SHOP row, so it satisfies the union's right-hand
        // branch outright. The ONLY thing keeping it out is that the union is parenthesised, so the
        // sibling `pl.status = 'LIVE'` and `pl.area_key = a.area_key` in the same ON clause still
        // apply to it. Unparenthesised, `A AND B AND (X OR Y)` degrades to `(A AND B AND X) OR Y`,
        // the right disjunct sheds status and area_key, and an ARCHIVED listing is served to an
        // anonymous buyer.
        assertThat(cards.stream().map(AreaListingCard::id))
                .as("an ARCHIVED shop must never be served, however well it matches the subtype")
                .doesNotContain(ARCHIVED_SHOP_ID);

        // Positive control — rules out passing-by-emptiness. Kept, but note it is NOT what makes
        // the mutation detectable; the SHOP+WAREHOUSE selection is.
        assertThat(cards).as("the filter must still return live rows").isNotEmpty();

        // Both branches must genuinely be populated, or the union degenerates to the single-branch
        // shape that made the earlier version inert.
        assertThat(cards.stream().map(AreaListingCard::id))
                .as("the bearing branch (SHOP) and the non-bearing branch (WAREHOUSE) must BOTH "
                        + "contribute, or there is no OR for the parentheses to bind")
                .contains(SHOP_ID, WAREHOUSE_ID);
    }

    @Test
    @DisplayName("#2509 (no exhaustive collapse): selecting ALL five subtypes still excludes the "
            + "legacy un-subtyped rows — it is not equivalent to 'no filter'")
    void allFiveSubtypes_doNotCollapseToNoFilter() {
        List<AreaListingCard> cards =
                areaCardsFiltered(null, List.of("SHOP", "OFFICE", "BUILDING", "WAREHOUSE", "LAND"));

        // normalizeCommercialSubtypes deliberately has NO `size() == ALLOWED.size()` collapse
        // branch, unlike normalizePropertyTypes. That asymmetry is correct and is the property most
        // likely to be "tidied up" by someone who reads it as an oversight: commercial_subtype is
        // NULLABLE and V102-backfilled rows carry NULL, so collapsing to no-clause would readmit
        // exactly the un-disambiguated rows the buyer narrowed away.
        assertThat(cards.stream().map(AreaListingCard::id))
                .as("'all five subtypes' is not the same question as 'all commercial' — a row whose "
                        + "subtype was never recorded is none of the five")
                .doesNotContain(LEGACY_NULL_SUBTYPE_ID, LEGACY_NO_ROW_ID, APARTMENT_ID);

        assertThat(cards.stream().map(AreaListingCard::id))
                .as("the peers that DO exist in this fixture must still be returned")
                .contains(SHOP_ID, LOWERCASE_SHOP_ID, OFFICE_ID, WAREHOUSE_ID);

        // Negative control: unfiltered, those legacy rows ARE returned — so the exclusion above is
        // the filter's doing rather than an empty or broken fixture.
        assertThat(areaCards().stream().map(AreaListingCard::id))
                .as("without the filter the legacy rows are present, so their absence above means "
                        + "something")
                .contains(LEGACY_NULL_SUBTYPE_ID, LEGACY_NO_ROW_ID, APARTMENT_ID);
    }

    @Test
    @DisplayName("#2509: an area with zero matching listings still returns its entry under a "
            + "subtype filter — the clause stayed in the LEFT JOIN ON, not the WHERE")
    void emptyAreaSurvivesASubtypeFilter() {
        CityAreaListingsResponse response = cityAreaService.getAreaListings(
                CITY_SLUG, List.of(AREA_KEY, EMPTY_AREA_KEY), 20, null, null, null, null,
                List.of("SHOP"), null, null, null, null, false);

        // Moving filters into the WHERE clause collapses the outer join and deletes zero-match areas
        // from the response entirely. That is also why this service cannot simply delegate to
        // DiscoverListingPredicateBuilder#build, which emits WHERE-shaped SQL (#2541).
        assertThat(response.areas().stream().map(AreaListingsEntry::areaKey))
                .containsExactlyInAnyOrder(AREA_KEY, EMPTY_AREA_KEY);

        AreaListingsEntry empty = response.areas().stream()
                .filter(a -> EMPTY_AREA_KEY.equals(a.areaKey()))
                .findFirst()
                .orElseThrow();
        assertThat(empty.listings()).isEmpty();
    }

    @Test
    @DisplayName("#2509: a subtype naming no selected property type returns NOTHING rather than the "
            + "whole apartment inventory presented as a Shop result")
    void subtypeNamingNoSelectedType_returnsNothing() {
        List<AreaListingCard> cards = areaCardsFiltered(List.of("apartment"), List.of("SHOP"));

        // The quiet wrongness the union had to prevent deliberately: emitting
        // property_type IN ('apartment') and dropping the subtype constraint would answer a Shop
        // filter with every apartment in the city. The emitter produces a literal FALSE instead.
        assertThat(cards).isEmpty();
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private List<AreaListingCard> areaCardsFiltered(List<String> propertyTypes,
                                                    List<String> subtypes) {
        CityAreaListingsResponse response = cityAreaService.getAreaListings(
                CITY_SLUG, List.of(AREA_KEY), 50, null, null, null, propertyTypes, subtypes,
                null, null, null, null, false);
        return response.areas().stream()
                .filter(a -> AREA_KEY.equals(a.areaKey()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("fixture area not returned"))
                .listings();
    }

    /**
     * Inserts a NON-live listing. Deliberately separate from {@link #insertLiveListing} rather than
     * adding a status parameter to it, so the arms that predate #2509 keep calling byte-identical
     * code.
     */
    private void insertArchivedListing(UUID id, String propertyType) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, property_type, "
                        + " latitude, longitude, price_paise, created_at, updated_at) "
                        + "VALUES (?, ?, 'ARCHIVED', ?, false, true, ?, ?, ?, 5000000, ?, ?)",
                id, AREA_KEY, now, propertyType, CENTRE_LAT, CENTRE_LON, now, now);
    }

    private List<AreaListingCard> areaCards() {
        CityAreaListingsResponse response = cityAreaService.getAreaListings(
                CITY_SLUG, List.of(AREA_KEY), 50, null, null, null, null, null, null, null, null, false);
        return response.areas().stream()
                .filter(a -> AREA_KEY.equals(a.areaKey()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("fixture area not returned"))
                .listings();
    }

    private List<DiscoverListingResponse> authListings() {
        DiscoverListingsPage page = listingsController.getListings(
                CITY_SLUG, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null,
                0, 50, false, null, null, null, null, null, null, null, null).getBody();
        assertThat(page).isNotNull();
        return page.content();
    }

    private static String subtypeOf(List<AreaListingCard> cards, UUID id) {
        return cards.stream()
                .filter(c -> id.equals(c.id()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("fixture listing " + id + " not returned"))
                .commercialSubtype();
    }

    private static String authSubtypeOf(List<DiscoverListingResponse> listings, UUID id) {
        return listings.stream()
                .filter(l -> id.toString().equals(l.id()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("fixture listing " + id
                        + " not returned by the authenticated path"))
                .commercialSubtype();
    }

    private String storedSubtype(UUID listingId) {
        return jdbcTemplate.queryForObject(
                "SELECT commercial_subtype FROM listing_commercial_space_details WHERE listing_id = ?",
                String.class, listingId);
    }

    private boolean hasDetailRow(UUID listingId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM listing_commercial_space_details WHERE listing_id = ?",
                Integer.class, listingId);
        return count != null && count > 0;
    }

    private int liveListingCount(String areaKey) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM property_listings WHERE area_key = ? AND status = 'LIVE'",
                Integer.class, areaKey);
        return count == null ? 0 : count;
    }

    private int insertCity() {
        jdbcTemplate.update(
                "INSERT INTO cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, ?, ?, true)",
                CITY_SLUG, CITY_SLUG, CENTRE_LAT, CENTRE_LON);
        return jdbcTemplate.queryForObject("SELECT id FROM cities WHERE slug = ?", Integer.class, CITY_SLUG);
    }

    private void insertArea(int cityId, String areaKey, String name) {
        jdbcTemplate.update(
                "INSERT INTO areas (area_key, city_id, name, geo_center_lat, geo_center_lon, "
                        + "min_lat, min_lon, max_lat, max_lon) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                areaKey, cityId, name, CENTRE_LAT, CENTRE_LON,
                CENTRE_LAT - 0.1, CENTRE_LON - 0.1, CENTRE_LAT + 0.1, CENTRE_LON + 0.1);
    }

    private void insertLiveListing(UUID id, String propertyType) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbcTemplate.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, property_type, "
                        + " latitude, longitude, price_paise, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, ?, ?, ?, 5000000, ?, ?)",
                id, AREA_KEY, propertyType, CENTRE_LAT, CENTRE_LON, now, now);
    }

    /**
     * Writes the typed commercial projection row. Mirrors what
     * {@code CommercialSpaceDetailRepository#upsertFromListing} writes for the same inputs; a
     * {@code null} subtype reproduces the V102 backfill shape exactly.
     */
    private void insertCommercialDetail(UUID listingId, String subtype) {
        jdbcTemplate.update(
                "INSERT INTO public.listing_commercial_space_details (listing_id, commercial_subtype) "
                        + "VALUES (?, ?)",
                listingId, subtype);
    }
}

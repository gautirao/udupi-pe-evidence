package com.example.realestate.discover;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Testcontainers integration test (real Postgres) for {@link RelaxationPreviewsService} (#2018
 * slice 2): deterministic single-filter relaxation offers with REAL counts.
 *
 * <p>Boilerplate (container, JWT test config, school-trigger disable dance, seeding/cleanup shape)
 * mirrors {@link NearbyAreaCandidatesServiceIT}, the sibling endpoint's suite. Unlike that suite,
 * these fixtures need price, bedroom, possession and type columns populated, because every
 * assertion here is about a count changing when exactly one of those is relaxed.
 *
 * <p>Counts are asserted against seeded rows whose expected value is derived by hand from the
 * fixture, never by re-running the production query and asserting it equals itself.
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
        "AI_API_KEY=test-dummy-not-used-in-relaxation-previews-it",
        "spring.task.scheduling.enabled=false"
})
class RelaxationPreviewsServiceIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine").asCompatibleSubstituteFor("postgres"));

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

    @Autowired private JdbcTemplate jdbc;
    @Autowired private RelaxationPreviewsService service;

    private final List<String> testCitySlugs = new ArrayList<>();

    @AfterEach
    void cleanup() {
        for (String slug : testCitySlugs) {
            Integer cityId = jdbc.queryForObject("SELECT id FROM public.cities WHERE slug = ?", Integer.class, slug);
            if (cityId == null) {
                continue;
            }
            jdbc.update("DELETE FROM public.property_listings WHERE area_key LIKE ?", "IN|KA|" + slug + "|%");
            jdbc.update("DELETE FROM public.areas WHERE city_id = ?", cityId);
            jdbc.update("DELETE FROM public.cities WHERE id = ?", cityId);
        }
        testCitySlugs.clear();
    }

    // ── Fixtures ───────────────────────────────────────────────────────────────────────────────

    private int seedCity(String slug) {
        testCitySlugs.add(slug);
        return jdbc.queryForObject(
                "INSERT INTO public.cities (slug, name, geo_center_lat, geo_center_lon, is_active) "
                        + "VALUES (?, ?, 13.0, 74.7, true) RETURNING id",
                Integer.class, slug, slug + "-test-city");
    }

    private void seedArea(int cityId, String areaKey) {
        jdbc.update("INSERT INTO public.areas (area_key, city_id, name, geo_center_lat, geo_center_lon) "
                + "VALUES (?, ?, ?, 13.05, 74.70)", areaKey, cityId, areaKey);
    }

    /**
     * @param priceRupees   list price in RUPEES (stored as paise)
     * @param possession    'READY' matches the readyToMove filter; anything else does not
     */
    private void insertListing(String areaKey, String propertyType, String purpose,
                               long priceRupees, int bedrooms, String possession) {
        OffsetDateTime now = OffsetDateTime.now();
        jdbc.update(
                "INSERT INTO public.property_listings "
                        + "(id, area_key, status, archived_at, is_duplicate, is_valid, "
                        + " property_type, listing_purpose, price_paise, bedrooms, possession_status, "
                        + " latitude, longitude, created_at, updated_at) "
                        + "VALUES (?, ?, 'LIVE', NULL, false, true, ?, ?, ?, ?, ?, 13.05, 74.70, ?, ?)",
                UUID.randomUUID(), areaKey, propertyType, purpose,
                priceRupees * 100L, bedrooms, possession, now, now);
    }

    /**
     * Seeds a fixture in which ALL FOUR relaxations independently help, with counts 1/2/3/4 in
     * {@link RelaxationPreview.Kind} declaration order.
     *
     * <p>Getting this right is the whole trick: because only ONE filter is relaxed at a time, every
     * other active filter still applies to every probe. So each listing must fail EXACTLY ONE of
     * the active filters and satisfy all the rest, or the probe that relaxes a different filter
     * still excludes it. (An earlier version of this fixture made every listing
     * {@code UNDER_CONSTRUCTION} while {@code readyToMove} was active, so every probe except the
     * possession one correctly returned zero.)
     *
     * <p>The counts ASCEND in kind order on purpose: a count-descending sort would emit exactly the
     * reverse sequence, so {@link #previews_orderedByKindNotCount} genuinely discriminates between
     * the two orderings rather than passing under either.
     *
     * <p>Pairs with {@link #allFourRelaxationsFilters(String)}.
     */
    private void seedAllFourRelaxationsHelpful(String areaKey) {
        // 1 — fails ONLY the price ceiling (₹55L > ₹50L, inside the ×1.2 band).
        insertListing(areaKey, "villa", "sale", 5_500_000L, 3, "READY");
        // 2 — fail ONLY the possession constraint.
        insertListing(areaKey, "villa", "sale", 4_000_000L, 3, "UNDER_CONSTRUCTION");
        insertListing(areaKey, "villa", "sale", 4_100_000L, 3, "UNDER_CONSTRUCTION");
        // 3 — fail ONLY the bedroom count (2 BHK is the adjacent value below 3).
        insertListing(areaKey, "villa", "sale", 4_200_000L, 2, "READY");
        insertListing(areaKey, "villa", "sale", 4_300_000L, 2, "READY");
        insertListing(areaKey, "villa", "sale", 4_400_000L, 2, "READY");
        // 4 — fail ONLY the property type.
        insertListing(areaKey, "house", "sale", 4_500_000L, 3, "READY");
        insertListing(areaKey, "house", "sale", 4_600_000L, 3, "READY");
        insertListing(areaKey, "house", "sale", 4_700_000L, 3, "READY");
        insertListing(areaKey, "apartment", "sale", 4_800_000L, 3, "READY");
    }

    /** The active filters {@link #seedAllFourRelaxationsHelpful} is built against. */
    private static DiscoverListingPredicateBuilder.Filters allFourRelaxationsFilters(String city) {
        return filters(city, 5_000_000L, List.of(3), true, List.of("villa"), "sale");
    }

    /** Active filters with a price ceiling only. */
    private static DiscoverListingPredicateBuilder.Filters filters(
            String city, Long priceMaxRupees, List<Integer> bedrooms,
            Boolean readyToMove, List<String> propertyTypes, String purpose) {
        return new DiscoverListingPredicateBuilder.Filters(
                city, propertyTypes,
                null, priceMaxRupees != null ? priceMaxRupees * 100L : null,
                null, null, bedrooms, null, null, null, null, readyToMove,
                null, null, null, null, null, null, purpose, null, null, null);
    }

    // =========================================================================================

    @Test
    @DisplayName("PRICE_MAX offers the first band that actually has matches, with the real count")
    void priceMax_offersFirstBandWithMatches() {
        String slug = "rpx1";
        int cityId = seedCity(slug);
        String areaKey = "IN|KA|" + slug + "|area-a";
        seedArea(cityId, areaKey);

        // Ceiling is ₹50L. Nothing at or below it, so the search is a genuine zero.
        // ×1.2 → ₹60L: two listings at ₹55L and ₹60L qualify. That is the offer.
        // ×1.6 → ₹80L would find three, but the smallest helpful change wins.
        insertListing(areaKey, "apartment", "sale", 5_500_000L, 3, "UNDER_CONSTRUCTION");
        insertListing(areaKey, "apartment", "sale", 6_000_000L, 3, "UNDER_CONSTRUCTION");
        insertListing(areaKey, "apartment", "sale", 7_500_000L, 3, "UNDER_CONSTRUCTION");

        RelaxationPreviewsResponse response = service.findPreviews(
                slug, List.of(areaKey), null, filters(slug, 5_000_000L, null, null, null, "sale"));

        assertThat(response.baselineCount()).as("fixture must be a genuine zero").isZero();
        assertThat(response.previews()).hasSize(1);
        RelaxationPreview preview = response.previews().get(0);
        assertThat(preview.kind()).isEqualTo(RelaxationPreview.Kind.PRICE_MAX);
        assertThat(preview.priceMax()).as("₹50L × 1.2, rounded to the nearest lakh").isEqualTo(6_000_000L);
        assertThat(preview.resultingCount()).as("₹55L and ₹60L, not the ₹75L one").isEqualTo(2L);
    }

    @Test
    @DisplayName("READY_TO_MOVE offers dropping the possession constraint, with the real count")
    void readyToMove_offersRemoval() {
        String slug = "rpx2";
        int cityId = seedCity(slug);
        String areaKey = "IN|KA|" + slug + "|area-a";
        seedArea(cityId, areaKey);

        insertListing(areaKey, "apartment", "sale", 4_000_000L, 3, "UNDER_CONSTRUCTION");
        insertListing(areaKey, "apartment", "sale", 4_500_000L, 3, "UNDER_CONSTRUCTION");

        RelaxationPreviewsResponse response = service.findPreviews(
                slug, List.of(areaKey), null, filters(slug, null, null, true, null, "sale"));

        assertThat(response.baselineCount()).isZero();
        assertThat(response.previews())
                .singleElement()
                .satisfies(p -> {
                    assertThat(p.kind()).isEqualTo(RelaxationPreview.Kind.READY_TO_MOVE);
                    assertThat(p.readyToMove()).isFalse();
                    assertThat(p.resultingCount()).isEqualTo(2L);
                });
    }

    @Test
    @DisplayName("BEDROOMS offers the adjacent lower count, not a full clear, when that is enough")
    void bedrooms_offersAdjacentCount() {
        String slug = "rpx3";
        int cityId = seedCity(slug);
        String areaKey = "IN|KA|" + slug + "|area-a";
        seedArea(cityId, areaKey);

        // Asking for 3 BHK, none exist. Two 2 BHK do, one 1 BHK does.
        // The adjacent count (2) is offered, and the resulting SET is {2,3}, so the count is 2.
        insertListing(areaKey, "apartment", "sale", 4_000_000L, 2, "READY");
        insertListing(areaKey, "apartment", "sale", 4_100_000L, 2, "READY");
        insertListing(areaKey, "apartment", "sale", 3_000_000L, 1, "READY");

        RelaxationPreviewsResponse response = service.findPreviews(
                slug, List.of(areaKey), null, filters(slug, null, List.of(3), null, null, "sale"));

        assertThat(response.baselineCount()).isZero();
        assertThat(response.previews())
                .singleElement()
                .satisfies(p -> {
                    assertThat(p.kind()).isEqualTo(RelaxationPreview.Kind.BEDROOMS);
                    assertThat(p.bedrooms())
                            .as("the FULL resulting set, adjacent value added to the active one")
                            .containsExactly(2, 3);
                    assertThat(p.resultingCount()).as("the two 2 BHK, not the 1 BHK").isEqualTo(2L);
                });
    }

    @Test
    @DisplayName("BEDROOMS falls through to clearing the filter only when no adjacent count helps")
    void bedrooms_clearsOnlyAsLastResort() {
        String slug = "rpx4";
        int cityId = seedCity(slug);
        String areaKey = "IN|KA|" + slug + "|area-a";
        seedArea(cityId, areaKey);

        // Asking for 3 BHK. Nothing at 1 or 2 either — only a 4 BHK, which no downward probe
        // reaches, so the only offer left is "accept any number".
        insertListing(areaKey, "apartment", "sale", 4_000_000L, 4, "READY");

        RelaxationPreviewsResponse response = service.findPreviews(
                slug, List.of(areaKey), null, filters(slug, null, List.of(3), null, null, "sale"));

        assertThat(response.previews())
                .singleElement()
                .satisfies(p -> {
                    assertThat(p.kind()).isEqualTo(RelaxationPreview.Kind.BEDROOMS);
                    assertThat(p.bedrooms()).as("empty list means CLEAR the filter").isEmpty();
                    assertThat(p.resultingCount()).isEqualTo(1L);
                });
    }

    @Test
    @DisplayName("PROPERTY_TYPES offers clearing the type restriction, with the real count")
    void propertyTypes_offersClear() {
        String slug = "rpx5";
        int cityId = seedCity(slug);
        String areaKey = "IN|KA|" + slug + "|area-a";
        seedArea(cityId, areaKey);

        insertListing(areaKey, "apartment", "sale", 4_000_000L, 3, "READY");
        insertListing(areaKey, "house", "sale", 4_100_000L, 3, "READY");

        RelaxationPreviewsResponse response = service.findPreviews(
                slug, List.of(areaKey), null, filters(slug, null, null, null, List.of("villa"), "sale"));

        assertThat(response.baselineCount()).isZero();
        assertThat(response.previews())
                .singleElement()
                .satisfies(p -> {
                    assertThat(p.kind()).isEqualTo(RelaxationPreview.Kind.PROPERTY_TYPES);
                    assertThat(p.propertyTypes()).isEmpty();
                    assertThat(p.resultingCount()).isEqualTo(2L);
                });
    }

    @Test
    @DisplayName("a relaxation that still yields zero is omitted, never rendered as a 0-count row")
    void relaxationYieldingZero_isOmitted() {
        String slug = "rpx6";
        int cityId = seedCity(slug);
        String areaKey = "IN|KA|" + slug + "|area-a";
        seedArea(cityId, areaKey);

        // ₹50L ceiling; the only listing is ₹5 Cr, beyond even the ×3 ceiling of the price ladder.
        insertListing(areaKey, "apartment", "sale", 50_000_000L, 3, "READY");

        RelaxationPreviewsResponse response = service.findPreviews(
                slug, List.of(areaKey), null, filters(slug, 5_000_000L, null, null, null, "sale"));

        assertThat(response.previews())
                .as("no price band within the bounded ladder reaches a ₹5 Cr listing")
                .isEmpty();
    }

    @Test
    @DisplayName("previews are ordered by relaxation kind, not by count")
    void previews_orderedByKindNotCount() {
        String slug = "rpx7";
        int cityId = seedCity(slug);
        String areaKey = "IN|KA|" + slug + "|area-a";
        seedArea(cityId, areaKey);

        seedAllFourRelaxationsHelpful(areaKey);

        RelaxationPreviewsResponse response = service.findPreviews(
                slug, List.of(areaKey), null, allFourRelaxationsFilters(slug));

        assertThat(response.previews())
                .extracting(RelaxationPreview::kind)
                .as("Kind declaration order, independent of the counts")
                .containsExactly(
                        RelaxationPreview.Kind.PRICE_MAX,
                        RelaxationPreview.Kind.READY_TO_MOVE,
                        RelaxationPreview.Kind.BEDROOMS,
                        RelaxationPreview.Kind.PROPERTY_TYPES);

        assertThat(response.previews())
                .extracting(RelaxationPreview::resultingCount)
                .as("counts ASCEND in kind order, so a count-descending sort would reverse this list "
                        + "— the assertion above therefore discriminates between the two orderings")
                .containsExactly(1L, 2L, 3L, 4L);
    }

    @Test
    @DisplayName("identical input yields identical output across repeated calls")
    void repeatedCalls_areDeterministic() {
        String slug = "rpx8";
        int cityId = seedCity(slug);
        String areaKey = "IN|KA|" + slug + "|area-a";
        seedArea(cityId, areaKey);
        insertListing(areaKey, "villa", "sale", 5_500_000L, 3, "UNDER_CONSTRUCTION");
        insertListing(areaKey, "house", "sale", 9_000_000L, 2, "UNDER_CONSTRUCTION");

        DiscoverListingPredicateBuilder.Filters f =
                filters(slug, 5_000_000L, List.of(3), true, List.of("villa"), "sale");

        RelaxationPreviewsResponse first = service.findPreviews(slug, List.of(areaKey), null, f);
        RelaxationPreviewsResponse second = service.findPreviews(slug, List.of(areaKey), null, f);

        assertThat(second)
                .as("records compare by value: same previews, same order, same counts")
                .isEqualTo(first);
    }

    @Test
    @DisplayName("scope is never broadened: listings outside the requested areas are not counted")
    void scope_isNeverBroadened() {
        String slug = "rpx9";
        int cityId = seedCity(slug);
        String inScope = "IN|KA|" + slug + "|area-in";
        String outOfScope = "IN|KA|" + slug + "|area-out";
        seedArea(cityId, inScope);
        seedArea(cityId, outOfScope);

        insertListing(inScope, "apartment", "sale", 5_500_000L, 3, "READY");
        // Same shape, different area. Must never appear in any count.
        insertListing(outOfScope, "apartment", "sale", 5_500_000L, 3, "READY");
        insertListing(outOfScope, "apartment", "sale", 5_600_000L, 3, "READY");

        RelaxationPreviewsResponse response = service.findPreviews(
                slug, List.of(inScope), null, filters(slug, 5_000_000L, null, null, null, "sale"));

        assertThat(response.areaKeys()).containsExactly(inScope);
        assertThat(response.previews())
                .singleElement()
                .satisfies(p -> assertThat(p.resultingCount())
                        .as("only the in-scope listing, never the two next door")
                        .isEqualTo(1L));
    }

    @Test
    @DisplayName("purpose is never relaxed: a rent listing cannot rescue a buy search")
    void purpose_isNeverRelaxed() {
        String slug = "rpx10";
        int cityId = seedCity(slug);
        String areaKey = "IN|KA|" + slug + "|area-a";
        seedArea(cityId, areaKey);

        // Priced within the ×1.2 band, but it is a RENT listing and the search is a BUY search.
        insertListing(areaKey, "apartment", "rent", 5_500_000L, 3, "READY");

        RelaxationPreviewsResponse response = service.findPreviews(
                slug, List.of(areaKey), null, filters(slug, 5_000_000L, null, null, null, "sale"));

        assertThat(response.previews())
                .as("relaxing price must not silently switch the shopper to rentals")
                .isEmpty();
    }

    @Test
    @DisplayName("an empty area-key scope (POLYGON/VIEWPORT) yields no previews, never a city-wide answer")
    void emptyScope_yieldsNoPreviews() {
        String slug = "rpx11";
        int cityId = seedCity(slug);
        String areaKey = "IN|KA|" + slug + "|area-a";
        seedArea(cityId, areaKey);
        insertListing(areaKey, "apartment", "sale", 5_500_000L, 3, "READY");

        RelaxationPreviewsResponse response = service.findPreviews(
                slug, List.of(), null, filters(slug, 5_000_000L, null, null, null, "sale"));

        assertThat(response.previews()).isEmpty();
        assertThat(response.areaKeys()).isEmpty();
        assertThat(response.baselineCount()).isZero();
    }

    @Test
    @DisplayName("baselineCount reports real current matches rather than assuming zero")
    void baselineCount_reportsRealCurrentMatches() {
        String slug = "rpx12";
        int cityId = seedCity(slug);
        String areaKey = "IN|KA|" + slug + "|area-a";
        seedArea(cityId, areaKey);

        insertListing(areaKey, "apartment", "sale", 4_000_000L, 3, "READY");
        insertListing(areaKey, "apartment", "sale", 5_500_000L, 3, "READY");

        RelaxationPreviewsResponse response = service.findPreviews(
                slug, List.of(areaKey), null, filters(slug, 5_000_000L, null, null, null, "sale"));

        assertThat(response.baselineCount())
                .as("one listing is under the ₹50L ceiling right now")
                .isEqualTo(1L);
    }

    @Test
    @DisplayName("all counts come from ONE statement — no N+1 probe-per-candidate")
    void allCounts_useASingleQuery() {
        String slug = "rpx13";
        int cityId = seedCity(slug);
        String areaKey = "IN|KA|" + slug + "|area-a";
        seedArea(cityId, areaKey);
        seedAllFourRelaxationsHelpful(areaKey);

        AtomicInteger queryCount = new AtomicInteger();
        // Counting delegate around the REAL JdbcTemplate: the query still runs against the real
        // database (so the counts remain genuine), while every statement issued is tallied.
        JdbcTemplate counting = new JdbcTemplate(jdbc.getDataSource()) {
            @Override
            public <T> T queryForObject(String sql, org.springframework.jdbc.core.RowMapper<T> rowMapper,
                                        Object... args) {
                queryCount.incrementAndGet();
                return super.queryForObject(sql, rowMapper, args);
            }
        };

        RelaxationPreviewsResponse response = new RelaxationPreviewsService(counting).findPreviews(
                slug, List.of(areaKey), null, allFourRelaxationsFilters(slug));

        assertThat(response.previews())
                .as("four relaxations are live, so this is not a trivially-one-probe case")
                .hasSize(4);
        assertThat(queryCount.get())
                .as("baseline + every candidate probe resolved in a single round trip")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("limit caps the number of previews without changing their order")
    void limit_capsWithoutReordering() {
        String slug = "rpx14";
        int cityId = seedCity(slug);
        String areaKey = "IN|KA|" + slug + "|area-a";
        seedArea(cityId, areaKey);
        seedAllFourRelaxationsHelpful(areaKey);

        RelaxationPreviewsResponse response = service.findPreviews(
                slug, List.of(areaKey), 2, allFourRelaxationsFilters(slug));

        assertThat(response.previews())
                .extracting(RelaxationPreview::kind)
                .containsExactly(RelaxationPreview.Kind.PRICE_MAX, RelaxationPreview.Kind.READY_TO_MOVE);
    }
}

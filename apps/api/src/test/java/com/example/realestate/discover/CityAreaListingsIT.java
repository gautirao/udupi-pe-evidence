package com.example.realestate.discover;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.IngestionApiKeyFilter;
import com.example.realestate.security.JwtConfig;
import com.example.realestate.security.PrometheusApiKeyFilter;
import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Security integration test for GET /api/discover/cities/{city}/listings (#1616).
 *
 * <p>Uses the <strong>real</strong> {@link JwtConfig} security filter chain (same pattern as
 * {@link DiscoverAgriMapListingsControllerIT}) so the
 * {@code !(auth instanceof AnonymousAuthenticationToken)} guard in
 * {@link CityAreaListingsController} is exercised by the actual Spring Security infrastructure.
 *
 * <h2>What this test proves (Gate F required evidence)</h2>
 * <ol>
 *   <li><strong>ANON – price key-absence</strong>: anonymous caller (no Auth header) →
 *       {@code pricePaise} KEY is ABSENT from JSON (not just null — {@code @JsonInclude(NON_NULL)}
 *       omits it entirely), {@code priceBand} is present, Cache-Control is public max-age=60.</li>
 *   <li><strong>AUTHED – exact price</strong>: authenticated caller ({@code @WithMockUser} →
 *       {@code UsernamePasswordAuthenticationToken}, not {@code AnonymousAuthenticationToken}) →
 *       {@code pricePaise} is the seeded exact value, {@code priceBand} KEY is ABSENT,
 *       Cache-Control is no-store.</li>
 *   <li><strong>NULL price – both absent</strong>: listing with null DB price → neither
 *       {@code pricePaise} nor {@code priceBand} present for either caller type.</li>
 *   <li><strong>School-radius endpoint</strong>: GET /api/discover/cities/{city}/school-radius-listings
 *       (anon-only) → JSON has {@code priceBand}, no {@code pricePaise} key.</li>
 * </ol>
 *
 * <p>The services are mocked — this test is about security-context propagation and HTTP JSON
 * serialization contract (Jackson {@code @JsonInclude(NON_NULL)} on {@link AreaListingCard}
 * and {@link PublicSchoolRadiusListingCard}), not JDBC.
 *
 * <p>The service mock is configured to return fixtures with the correct auth-branched projection
 * (pricePaise populated vs null, priceBand populated vs null), matching what the real
 * {@link CityAreaListingsService} would return for each auth state. This validates that the
 * full serialization path — service projection → record constructor → Jackson NON_NULL —
 * produces the expected JSON wire contract.
 */
@WebMvcTest(
        controllers = {CityAreaListingsController.class, PublicSchoolRadiusListingsController.class},
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({JwtConfig.class, IngestionApiKeyFilter.class, PrometheusApiKeyFilter.class,
        GlobalExceptionHandler.class})
@TestPropertySource(properties = {
        "app.ingestion.api-key=test-ingestion-key-it",
        "app.metrics.api-key=test-metrics-key-it"
})
class CityAreaListingsIT {

    private static final String LISTINGS_URL = "/api/discover/cities/udupi/listings";
    private static final String SCHOOL_RADIUS_URL = "/api/discover/cities/udupi/school-radius-listings";
    private static final String AREA_KEY = "IN|KA|Udupi|Manipal";

    // Realistic price: ₹75 L = 75,00,000 rupees × 100 paise = 7_500_000_00L paise
    // PriceBand.of(7_500_000_00L) → "₹50L–1Cr" (falls in [₹50L, ₹1Cr) bucket)
    private static final long PRICE_PAISE = 7_500_000_00L;
    private static final String EXPECTED_BAND = "₹50L–1Cr";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private CityAreaListingsService cityAreaListingsService;

    @MockitoBean
    private PublicSchoolRadiusListingsService schoolRadiusListingsService;

    @MockitoBean
    private UserRoleService userRoleService;

    /**
     * Satisfies Spring Security's oauth2ResourceServer JWT wiring without a real issuer URI.
     * The decoder is never invoked for anonymous or {@code @WithMockUser} requests.
     */
    @MockitoBean
    private JwtDecoder jwtDecoder;

    @BeforeEach
    void setUp() {
        reset(cityAreaListingsService, schoolRadiusListingsService);
    }

    // ── ANON: pricePaise absent, priceBand present, Cache-Control public ────────

    @Test
    @DisplayName("anon: pricePaise KEY absent, priceBand present, Cache-Control public max-age=60")
    void anonCaller_pricePaiseKeyAbsent_priceBandPresent_cachePublic() throws Exception {
        UUID id = UUID.randomUUID();
        // Anon projection: pricePaise=null (omitted by @JsonInclude NON_NULL), priceBand=EXPECTED_BAND
        AreaListingCard anonCard = new AreaListingCard(
                id,
                null,           // pricePaise null → omitted from JSON
                EXPECTED_BAND,  // priceBand present
                "apartment",
                "Manipal Town",
                null,
                "sale",
                2,
                "Spacious 2BHK Manipal",
                2,
                1100.0, "sq ft",
                null, null,
                null, null, null,
                "2025-01-10T09:00:00Z",
                // Already-projected public value ("B" -> "trusted") — CityAreaListingsService
                // projects via TrustBadge.publicBadge(...) before constructing the card.
                "trusted",
                13.35, 74.79,
                null, null,
                null, // #2433 commercialSubtype — this fixture declares none
                null  // #2516 commercialFacts — this fixture declares none
        );
        AreaListingsEntry entry = new AreaListingsEntry(AREA_KEY, "Manipal", null, List.of(anonCard));
        CityAreaListingsResponse resp = new CityAreaListingsResponse("udupi", 5, List.of(entry));

        when(cityAreaListingsService.getAreaListings(
                eq("udupi"), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), eq(false)))
                .thenReturn(resp);

        mockMvc.perform(get(LISTINGS_URL)
                        .param("areaKeys", AREA_KEY))
                .andExpect(status().isOk())
                // pricePaise MUST be absent from JSON — not null, not 0, not present at all
                .andExpect(jsonPath("$.areas[0].listings[0].pricePaise").doesNotExist())
                // priceBand MUST be present with correct band string
                .andExpect(jsonPath("$.areas[0].listings[0].priceBand", is(EXPECTED_BAND)))
                // Non-price fields pass through normally
                .andExpect(jsonPath("$.areas[0].listings[0].id", is(id.toString())))
                .andExpect(jsonPath("$.areas[0].listings[0].propertyType", is("apartment")))
                .andExpect(jsonPath("$.areas[0].listings[0].trustBadge", is("trusted")))
                // Raw letter grade must never appear under the old field name.
                .andExpect(jsonPath("$.areas[0].listings[0].trustTier").doesNotExist())
                // Cache-Control: public (anon response is CDN-cacheable for 60s)
                .andExpect(header().string("Cache-Control", containsString("public")))
                .andExpect(header().string("Cache-Control", containsString("max-age=60")))
                .andExpect(header().string("Cache-Control", not(containsString("no-store"))));
    }

    // ── AUTHED: pricePaise present, priceBand KEY absent, Cache-Control no-store ──

    @Test
    @WithMockUser
    @DisplayName("authed: pricePaise present (exact value), priceBand KEY absent, Cache-Control no-store")
    void authedCaller_pricePaisePresent_priceBandKeyAbsent_cacheNoStore() throws Exception {
        UUID id = UUID.randomUUID();
        // Authed projection: pricePaise=PRICE_PAISE (exact), priceBand=null (omitted)
        AreaListingCard authedCard = new AreaListingCard(
                id,
                PRICE_PAISE,    // exact pricePaise present
                null,           // priceBand null → omitted from JSON
                "villa",
                "Eshwar Nagar",
                null,
                "sale",
                3,
                "Luxury 3BHK Villa",
                3,
                2000.0, "sq ft",
                null, null,
                null, null, null,
                "2025-02-15T11:00:00Z",
                // Already-projected public value ("A" -> "verified"); trustBadge is never
                // auth-branched, so this proves the SAME public value shape as the anon card
                // above (each mapped from its own raw tier, per the TrustBadge allow-list).
                "verified",
                13.36, 74.80,
                null, null,
                null, // #2433 commercialSubtype — this fixture declares none
                null  // #2516 commercialFacts — this fixture declares none
        );
        AreaListingsEntry entry = new AreaListingsEntry(AREA_KEY, "Manipal", null, List.of(authedCard));
        CityAreaListingsResponse resp = new CityAreaListingsResponse("udupi", 5, List.of(entry));

        // Authed: service called with isAuthenticated=true
        when(cityAreaListingsService.getAreaListings(
                eq("udupi"), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), eq(true)))
                .thenReturn(resp);

        mockMvc.perform(get(LISTINGS_URL)
                        .param("areaKeys", AREA_KEY))
                .andExpect(status().isOk())
                // pricePaise MUST be present with the exact seeded value.
                // JSON numeric comparison: Jackson serializes Long as a number; JSONPath returns
                // Integer for values <= Integer.MAX_VALUE. Use intValue() to avoid type mismatch.
                .andExpect(jsonPath("$.areas[0].listings[0].pricePaise",
                        is((int) PRICE_PAISE)))
                // priceBand MUST be absent from JSON (not null, not present at all)
                .andExpect(jsonPath("$.areas[0].listings[0].priceBand").doesNotExist())
                // Non-price fields pass through normally
                .andExpect(jsonPath("$.areas[0].listings[0].id", is(id.toString())))
                .andExpect(jsonPath("$.areas[0].listings[0].propertyType", is("villa")))
                .andExpect(jsonPath("$.areas[0].listings[0].trustBadge", is("verified")))
                // Raw letter grade must never appear under the old field name.
                .andExpect(jsonPath("$.areas[0].listings[0].trustTier").doesNotExist())
                // Cache-Control: no-store (authed response with exact price must not be cached)
                .andExpect(header().string("Cache-Control", containsString("no-store")))
                .andExpect(header().string("Cache-Control", not(containsString("public"))))
                .andExpect(header().string("Cache-Control", not(containsString("max-age=60"))));
    }

    // ── NULL price: both pricePaise and priceBand absent for anon ───────────────

    @Test
    @DisplayName("null DB price – anon: pricePaise absent, priceBand absent (not fabricated)")
    void anonCaller_nullDbPrice_bothPriceFieldsAbsent() throws Exception {
        UUID id = UUID.randomUUID();
        // Null DB price: PriceBand.of(null)=null → priceBand null, pricePaise null → both omitted
        AreaListingCard nullPriceCard = new AreaListingCard(
                id,
                null,   // pricePaise null (anon path, but also null DB price)
                null,   // priceBand null (PriceBand.of(null) = null)
                "house",
                "Katapadi",
                null,
                "sale",
                null, null, null, null, null, null, null, null, null, null,
                "2025-03-01T08:00:00Z",
                null,
                13.34, 74.78,
                null, null,
                null, // #2433 commercialSubtype — this fixture declares none
                null  // #2516 commercialFacts — this fixture declares none
        );
        AreaListingsEntry entry = new AreaListingsEntry(AREA_KEY, "Manipal", null, List.of(nullPriceCard));
        CityAreaListingsResponse resp = new CityAreaListingsResponse("udupi", 5, List.of(entry));

        when(cityAreaListingsService.getAreaListings(
                eq("udupi"), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), eq(false)))
                .thenReturn(resp);

        mockMvc.perform(get(LISTINGS_URL)
                        .param("areaKeys", AREA_KEY))
                .andExpect(status().isOk())
                // Both price fields must be absent — never fabricated for null DB price
                .andExpect(jsonPath("$.areas[0].listings[0].pricePaise").doesNotExist())
                .andExpect(jsonPath("$.areas[0].listings[0].priceBand").doesNotExist())
                // Other fields still present
                .andExpect(jsonPath("$.areas[0].listings[0].id", is(id.toString())))
                .andExpect(jsonPath("$.areas[0].listings[0].propertyType", is("house")));
    }

    // ── NULL price: both pricePaise and priceBand absent for authed ─────────────

    @Test
    @WithMockUser
    @DisplayName("null DB price – authed: pricePaise absent, priceBand absent (not fabricated)")
    void authedCaller_nullDbPrice_bothPriceFieldsAbsent() throws Exception {
        UUID id = UUID.randomUUID();
        // Null DB price on authed path: pricePaise null (passed through as-is), priceBand null
        AreaListingCard nullPriceCard = new AreaListingCard(
                id,
                null,   // DB had null price_paise — exact null passed through for authed
                null,   // priceBand null (authed path never sets priceBand)
                "land",
                "Udupi Town",
                null,
                "sale",
                null, null, null, null, null, null, null, null, null, null,
                "2025-01-20T12:00:00Z",
                null,
                13.33, 74.77,
                null, null,
                null, // #2433 commercialSubtype — this fixture declares none
                null  // #2516 commercialFacts — this fixture declares none
        );
        AreaListingsEntry entry = new AreaListingsEntry(AREA_KEY, "Manipal", null, List.of(nullPriceCard));
        CityAreaListingsResponse resp = new CityAreaListingsResponse("udupi", 5, List.of(entry));

        when(cityAreaListingsService.getAreaListings(
                eq("udupi"), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), eq(true)))
                .thenReturn(resp);

        mockMvc.perform(get(LISTINGS_URL)
                        .param("areaKeys", AREA_KEY))
                .andExpect(status().isOk())
                // Both price fields must be absent for null DB price on authed path too
                .andExpect(jsonPath("$.areas[0].listings[0].pricePaise").doesNotExist())
                .andExpect(jsonPath("$.areas[0].listings[0].priceBand").doesNotExist())
                .andExpect(jsonPath("$.areas[0].listings[0].id", is(id.toString())));
    }

    // ── #2051 RENT: anon monthlyRentBand present, monthlyRentRupees KEY absent ──────

    @Test
    @DisplayName("#2051 rent anon: monthlyRentBand present, monthlyRentRupees KEY absent, no sale price/band")
    void anonCaller_rentListing_monthlyRentBandPresent_exactRentAbsent() throws Exception {
        UUID id = UUID.randomUUID();
        AreaListingCard rentCard = new AreaListingCard(
                id, null, null, "apartment", "Manipal Town", null, "rent",
                2, "Cozy 2BHK for rent", 2, 900.0, "sq ft",
                null, null, null, null, "semi-furnished",
                "2025-04-01T09:00:00Z", "verified", 13.35, 74.79,
                null, "₹20–35K",
                null, // #2433 commercialSubtype — this fixture declares none
                null  // #2516 commercialFacts — this fixture declares none
        );
        AreaListingsEntry entry = new AreaListingsEntry(AREA_KEY, "Manipal", null, List.of(rentCard));
        CityAreaListingsResponse resp = new CityAreaListingsResponse("udupi", 5, List.of(entry));

        when(cityAreaListingsService.getAreaListings(
                eq("udupi"), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), eq(false)))
                .thenReturn(resp);

        mockMvc.perform(get(LISTINGS_URL)
                        .param("areaKeys", AREA_KEY))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areas[0].listings[0].monthlyRentBand", is("₹20–35K")))
                .andExpect(jsonPath("$.areas[0].listings[0].monthlyRentRupees").doesNotExist())
                .andExpect(jsonPath("$.areas[0].listings[0].pricePaise").doesNotExist())
                .andExpect(jsonPath("$.areas[0].listings[0].priceBand").doesNotExist());
    }

    // ── #2051 RENT: authed monthlyRentRupees exact, monthlyRentBand KEY absent ──────

    @Test
    @WithMockUser
    @DisplayName("#2051 rent authed: monthlyRentRupees exact (no /100 or *100), monthlyRentBand KEY absent")
    void authedCaller_rentListing_exactMonthlyRentRupees_noConversionError() throws Exception {
        UUID id = UUID.randomUUID();
        AreaListingCard rentCard = new AreaListingCard(
                id, null, null, "apartment", "Manipal Town", null, "lease",
                2, "Cozy 2BHK for lease", 2, 900.0, "sq ft",
                null, null, null, null, "semi-furnished",
                "2025-04-01T09:00:00Z", "verified", 13.35, 74.79,
                25000L, null,
                null, // #2433 commercialSubtype — this fixture declares none
                null  // #2516 commercialFacts — this fixture declares none
        );
        AreaListingsEntry entry = new AreaListingsEntry(AREA_KEY, "Manipal", null, List.of(rentCard));
        CityAreaListingsResponse resp = new CityAreaListingsResponse("udupi", 5, List.of(entry));

        when(cityAreaListingsService.getAreaListings(
                eq("udupi"), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), eq(true)))
                .thenReturn(resp);

        mockMvc.perform(get(LISTINGS_URL)
                        .param("areaKeys", AREA_KEY))
                .andExpect(status().isOk())
                // exact rupee value, verbatim — NOT 250 (÷100 error) and NOT 2,500,000 (×100 error)
                .andExpect(jsonPath("$.areas[0].listings[0].monthlyRentRupees", is(25000)))
                .andExpect(jsonPath("$.areas[0].listings[0].monthlyRentBand").doesNotExist())
                .andExpect(jsonPath("$.areas[0].listings[0].pricePaise").doesNotExist())
                .andExpect(jsonPath("$.areas[0].listings[0].priceBand").doesNotExist())
                .andExpect(jsonPath("$.areas[0].listings[0].listingPurpose", is("lease")));
    }

    // ── School-radius endpoint: priceBand present, pricePaise absent (anon-only) ──

    @Test
    @DisplayName("school-radius: priceBand present, pricePaise KEY absent, Cache-Control public")
    void schoolRadius_priceBandPresent_pricePaiseAbsent_cachePublic() throws Exception {
        // School-radius is anon-only; card only has priceBand (never pricePaise)
        PublicSchoolRadiusListingCard card = new PublicSchoolRadiusListingCard(
                "sr-listing-001",
                "L-SR-001",
                "house",
                "House near school",
                "Manipal Town",
                AREA_KEY,
                EXPECTED_BAND,  // priceBand present
                null, null,
                1000.0, "sq ft",
                3,
                13.35, 74.79,
                null,
                "sale",
                "READY",
                14,
                false,
                java.time.OffsetDateTime.now()
        );
        PublicSchoolRadiusListingsPage page = new PublicSchoolRadiusListingsPage(
                List.of(card), 0, 20, false);

        when(schoolRadiusListingsService.getListings(
                eq("udupi"), anyDouble(), anyDouble(), anyDouble(), anyInt(), anyInt(), any()))
                .thenReturn(page);

        mockMvc.perform(get(SCHOOL_RADIUS_URL)
                        .param("schoolLat", "13.35")
                        .param("schoolLon", "74.79"))
                .andExpect(status().isOk())
                // priceBand present with correct band string
                .andExpect(jsonPath("$.content[0].priceBand", is(EXPECTED_BAND)))
                // pricePaise MUST be absent — school-radius is anon-only, never exposes exact price
                .andExpect(jsonPath("$.content[0].pricePaise").doesNotExist())
                // Other fields pass through
                .andExpect(jsonPath("$.content[0].id", is("sr-listing-001")))
                .andExpect(jsonPath("$.content[0].propertyType", is("house")))
                // Cache-Control: public (school-radius is anon-only, always public-cacheable)
                .andExpect(header().string("Cache-Control", containsString("public")))
                .andExpect(header().string("Cache-Control", containsString("max-age=60")));
    }

    // ── Auth-branch wiring: anon call must pass isAuthenticated=false to service ──

    @Test
    @DisplayName("anon: controller passes isAuthenticated=false to service (auth-branch wiring)")
    void anonCaller_serviceCalledWithIsAuthenticatedFalse() throws Exception {
        when(cityAreaListingsService.getAreaListings(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get(LISTINGS_URL)
                        .param("areaKeys", AREA_KEY))
                .andExpect(status().isOk());

        // isAuthenticated=false must be passed — never true for an anonymous caller
        verify(cityAreaListingsService).getAreaListings(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), eq(false));
    }

    // ── Auth-branch wiring: authed call must pass isAuthenticated=true to service ──

    @Test
    @WithMockUser
    @DisplayName("authed: controller passes isAuthenticated=true to service (auth-branch wiring)")
    void authedCaller_serviceCalledWithIsAuthenticatedTrue() throws Exception {
        when(cityAreaListingsService.getAreaListings(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get(LISTINGS_URL)
                        .param("areaKeys", AREA_KEY))
                .andExpect(status().isOk());

        // isAuthenticated=true must be passed — @WithMockUser is not AnonymousAuthenticationToken
        verify(cityAreaListingsService).getAreaListings(
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), eq(true));
    }
}

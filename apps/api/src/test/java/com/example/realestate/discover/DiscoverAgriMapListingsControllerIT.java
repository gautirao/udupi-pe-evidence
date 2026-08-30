package com.example.realestate.discover;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.IngestionApiKeyFilter;
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

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.hamcrest.Matchers.closeTo;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.notNullValue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Spring Security integration test for {@link DiscoverAgriMapListingsController}.
 *
 * <p>Uses the <strong>real</strong> {@link com.example.realestate.security.JwtConfig} security
 * filter chain (same pattern as {@code RegionalAreaGroupsSecurityIT}) so the
 * {@code !(auth instanceof AnonymousAuthenticationToken)} guard in the controller is exercised
 * by the actual Spring Security infrastructure, not a permit-all stub.
 *
 * <h2>What this test proves (Gate F assertions)</h2>
 * <ol>
 *   <li>Anonymous caller (no Auth header) → Spring Security sets {@code AnonymousAuthenticationToken}
 *       → controller detects {@code isAuthenticated=false} → service returns anon projection
 *       → {@code pricePaise} null + coarsened coords + new non-PII fields present + correct Cache-Control.</li>
 *   <li>Authenticated caller ({@code @WithMockUser} → {@code UsernamePasswordAuthenticationToken},
 *       not {@code AnonymousAuthenticationToken}) → controller detects {@code isAuthenticated=true}
 *       → service returns authed projection → {@code pricePaise} present + exact coords
 *       + new fields present + {@code Cache-Control: no-store}.</li>
 *   <li>Each new field (roadAccess, soilType, cultivationStatus, ownershipType, updatedAt) is
 *       individually asserted in both projections — not just pricePaise.</li>
 *   <li>surveyNumber is NOT present in either projection (detail-only security boundary).</li>
 * </ol>
 *
 * <p>The service is mocked — this test is about security-context propagation and HTTP contract,
 * not JDBC. Real Postgres is not needed; JDBC is already covered by
 * {@link DiscoverAgriMapListingsServiceTest} unit tests.
 */
@WebMvcTest(
        controllers = DiscoverAgriMapListingsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({com.example.realestate.security.JwtConfig.class, IngestionApiKeyFilter.class,
        PrometheusApiKeyFilter.class, GlobalExceptionHandler.class})
@TestPropertySource(properties = {
        "app.ingestion.api-key=test-ingestion-key-it",
        "app.metrics.api-key=test-metrics-key-it"
})
class DiscoverAgriMapListingsControllerIT {

    private static final String URL = "/api/discover/agri-map-listings";
    private static final String AREA_KEY = "IN|KA|Udupi|Area1";

    // ── Shared test data ──────────────────────────────────────────────────────

    /** Anon projection: pricePaise=null, coords coarsened to 2dp, new fields present. */
    private static final AgriMapListingItem ANON_ITEM = new AgriMapListingItem(
            "anon-id-1", "Farm Anon", AREA_KEY,
            13.34,   // latitude coarsened (2dp)
            74.74,   // longitude coarsened (2dp)
            "agricultural_land", "Shirva",
            null,                              // boundaryGeoJson
            new BigDecimal("2.5"), "acres", new BigDecimal("2.47"),
            null,                              // pricePaise withheld for anon
            "sale",
            "BOREWELL", "wetland", true, false,
            "PAVED", "RED_LATERITE", "CULTIVATED", "SINGLE_OWNER",
            OffsetDateTime.of(2025, 6, 1, 10, 0, 0, 0, ZoneOffset.UTC)
    );

    /** Authed projection: pricePaise present, exact coords, new fields present. */
    private static final AgriMapListingItem AUTHED_ITEM = new AgriMapListingItem(
            "authed-id-1", "Farm Authed", AREA_KEY,
            13.34091,  // exact latitude
            74.74215,  // exact longitude
            "agricultural_land", "Brahmavar",
            null,
            new BigDecimal("5.0"), "acres", new BigDecimal("5.0"),
            12500000L,                         // pricePaise present for authed
            "sale",
            "WELL", "RED_LATERITE", false, true,
            "DIRT_TRACK", "BLACK_COTTON", "FALLOW", "JOINT_FAMILY",
            OffsetDateTime.of(2025, 3, 15, 8, 0, 0, 0, ZoneOffset.UTC)
    );

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private DiscoverAgriMapListingsService agriMapListingsService;

    @MockitoBean
    private UserRoleService userRoleService;

    /**
     * Satisfies Spring Security's oauth2ResourceServer JWT wiring without a real issuer URI.
     * The decoder is never invoked for anonymous or @WithMockUser requests.
     */
    @MockitoBean
    private JwtDecoder jwtDecoder;

    @BeforeEach
    void setUp() {
        reset(agriMapListingsService);
    }

    // ── Anon projection (Gate F AC3 + AC4) ───────────────────────────────────

    @Test
    @DisplayName("anon: pricePaise null, coords coarsened to 2dp, new non-PII fields pass through")
    void anonCaller_anonProjection_priceNullCoordsCoarsenedNewFieldsPresent() throws Exception {
        when(agriMapListingsService.findAgriMapListings(
                eq("udupi"), any(), any(Optional.class), eq(false), any()))
                .thenReturn(new AgriMapListingsResponse("udupi", List.of(ANON_ITEM), false, 250));

        mockMvc.perform(get(URL)
                        .param("city", "udupi")
                        .param("areaKey", AREA_KEY))
                .andExpect(status().isOk())
                // AC3: pricePaise absent (null → omitted by @JsonInclude NON_NULL)
                .andExpect(jsonPath("$.listings[0].pricePaise").doesNotExist())
                // AC3: coords coarsened — exactly 2dp values (no extra precision)
                .andExpect(jsonPath("$.listings[0].latitude", is(13.34)))
                .andExpect(jsonPath("$.listings[0].longitude", is(74.74)))
                // AC4: roadAccess present for anon (non-PII)
                .andExpect(jsonPath("$.listings[0].roadAccess", is("PAVED")))
                // AC4: soilType present for anon
                .andExpect(jsonPath("$.listings[0].soilType", is("RED_LATERITE")))
                // AC4: cultivationStatus present for anon
                .andExpect(jsonPath("$.listings[0].cultivationStatus", is("CULTIVATED")))
                // AC4: ownershipType present for anon
                .andExpect(jsonPath("$.listings[0].ownershipType", is("SINGLE_OWNER")))
                // AC4: updatedAt present for anon
                .andExpect(jsonPath("$.listings[0].updatedAt", notNullValue()))
                // AC10: surveyNumber must not appear
                .andExpect(jsonPath("$.listings[0].surveyNumber").doesNotExist())
                // Cache-Control: public (anon response is CDN-cacheable)
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("public")))
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("max-age=120")));
    }

    // ── Authed projection (Gate F AC1 + AC2) ─────────────────────────────────

    @Test
    @WithMockUser
    @DisplayName("authed: pricePaise present, exact coords, new fields present, Cache-Control no-store")
    void authedCaller_authedProjection_pricePresentExactCoordsNewFieldsPresent() throws Exception {
        when(agriMapListingsService.findAgriMapListings(
                eq("udupi"), any(), any(Optional.class), eq(true), any()))
                .thenReturn(new AgriMapListingsResponse("udupi", List.of(AUTHED_ITEM), false, 250));

        mockMvc.perform(get(URL)
                        .param("city", "udupi")
                        .param("areaKey", AREA_KEY))
                .andExpect(status().isOk())
                // AC2: pricePaise present for authed
                .andExpect(jsonPath("$.listings[0].pricePaise", is(12500000)))
                // AC2: exact coords (not coarsened)
                .andExpect(jsonPath("$.listings[0].latitude", closeTo(13.34091, 0.000001)))
                .andExpect(jsonPath("$.listings[0].longitude", closeTo(74.74215, 0.000001)))
                // AC1: new canonical agri fields present for authed — each field individually
                .andExpect(jsonPath("$.listings[0].roadAccess", is("DIRT_TRACK")))
                .andExpect(jsonPath("$.listings[0].soilType", is("BLACK_COTTON")))
                .andExpect(jsonPath("$.listings[0].cultivationStatus", is("FALLOW")))
                .andExpect(jsonPath("$.listings[0].ownershipType", is("JOINT_FAMILY")))
                .andExpect(jsonPath("$.listings[0].updatedAt", notNullValue()))
                // AC5/AC11: surveyNumber must not appear
                .andExpect(jsonPath("$.listings[0].surveyNumber").doesNotExist())
                // Cache-Control: no-store (authed response must not be CDN-cached)
                .andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")));
    }

    // ── Null new fields: omitted by @JsonInclude NON_NULL (AC10) ─────────────

    @Test
    @DisplayName("anon: null new agri fields omitted from JSON by @JsonInclude NON_NULL")
    void anonCaller_nullNewFields_omittedFromJson() throws Exception {
        AgriMapListingItem noNewFields = new AgriMapListingItem(
                "sparse-id", "Sparse Farm", AREA_KEY,
                13.34, 74.74, "agricultural_land", "Malpe",
                null,
                null, null, null, null, "sale",
                null, null, null, null,
                null, null, null, null, null  // all new fields null
        );
        when(agriMapListingsService.findAgriMapListings(
                eq("udupi"), any(), any(Optional.class), eq(false), any()))
                .thenReturn(new AgriMapListingsResponse("udupi", List.of(noNewFields), false, 250));

        mockMvc.perform(get(URL)
                        .param("city", "udupi")
                        .param("areaKey", AREA_KEY))
                .andExpect(status().isOk())
                // All null new fields must be absent (not serialised as JSON null)
                .andExpect(jsonPath("$.listings[0].roadAccess").doesNotExist())
                .andExpect(jsonPath("$.listings[0].soilType").doesNotExist())
                .andExpect(jsonPath("$.listings[0].cultivationStatus").doesNotExist())
                .andExpect(jsonPath("$.listings[0].ownershipType").doesNotExist())
                .andExpect(jsonPath("$.listings[0].updatedAt").doesNotExist())
                // surveyNumber never present
                .andExpect(jsonPath("$.listings[0].surveyNumber").doesNotExist());
    }

    // ── Real security chain is live (falsifiability check) ───────────────────

    @Test
    @DisplayName("real security chain: this endpoint is permitAll — anonymous GET returns 200")
    void anonymousGet_publicEndpoint_returns200() throws Exception {
        when(agriMapListingsService.findAgriMapListings(
                anyString(), any(), any(Optional.class), eq(false), any()))
                .thenReturn(new AgriMapListingsResponse("udupi", List.of(), false, 250));

        mockMvc.perform(get(URL)
                        .param("city", "udupi")
                        .param("areaKey", AREA_KEY))
                .andExpect(status().isOk());
    }
}

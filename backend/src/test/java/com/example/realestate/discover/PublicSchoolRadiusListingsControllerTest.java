package com.example.realestate.discover;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.List;

import static org.hamcrest.Matchers.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * WebMvcTest for GET /api/discover/cities/{city}/school-radius-listings.
 *
 * <p>Security config uses anyRequest().permitAll() to match the production behaviour
 * (public endpoint — no JWT required). This lets us assert 200 without a JWT
 * post-processor and isolate 400 validation from auth failures.
 */
@WebMvcTest(
        controllers = PublicSchoolRadiusListingsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({PublicSchoolRadiusListingsControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class PublicSchoolRadiusListingsControllerTest {

    @TestConfiguration
    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                    .build();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private PublicSchoolRadiusListingsService service;

    @MockitoBean
    private UserRoleService userRoleService;

    private static final String BASE_URL = "/api/discover/cities/udupi/school-radius-listings";

    private static PublicSchoolRadiusListingsPage emptyPage() {
        return new PublicSchoolRadiusListingsPage(List.of(), 0, 20, false);
    }

    private static PublicSchoolRadiusListingCard sampleCard() {
        return new PublicSchoolRadiusListingCard(
                "abc-123",
                "L-001",
                "house",
                "Test listing near school",
                "Malpe",
                "IN|KA|Udupi|Malpe",
                5_000_000L,
                null,
                null,
                100.0,
                "sq m",
                3,
                13.3,
                74.7,
                "https://example.com/hero.jpg",
                "sale",
                "READY",
                5,
                false,
                OffsetDateTime.now()
        );
    }

    @BeforeEach
    void setUp() {
        reset(service, userRoleService);
    }

    // ── 1. No JWT → 200 (public endpoint) ────────────────────────────────────

    @Test
    void noJwt_returns200_publicEndpoint() throws Exception {
        when(service.getListings(anyString(), anyDouble(), anyDouble(), anyDouble(), anyInt(), anyInt()))
                .thenReturn(emptyPage());

        mockMvc.perform(get(BASE_URL)
                        .param("schoolLat", "13.3")
                        .param("schoolLon", "74.7"))
                .andExpect(status().isOk());
    }

    // ── 2. Missing schoolLat → 400 ────────────────────────────────────────────

    @Test
    void missingSchoolLat_returns400() throws Exception {
        mockMvc.perform(get(BASE_URL)
                        .param("schoolLon", "74.7"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 3. Missing schoolLon → 400 ────────────────────────────────────────────

    @Test
    void missingSchoolLon_returns400() throws Exception {
        mockMvc.perform(get(BASE_URL)
                        .param("schoolLat", "13.3"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 4. Both coords missing → 400 ─────────────────────────────────────────

    @Test
    void bothCoordsAbsent_returns400() throws Exception {
        mockMvc.perform(get(BASE_URL))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 5. Invalid lat (> 90) → 400 ──────────────────────────────────────────

    @Test
    void invalidLatAbove90_returns400() throws Exception {
        mockMvc.perform(get(BASE_URL)
                        .param("schoolLat", "91")
                        .param("schoolLon", "74.7"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 6. Invalid lon (> 180) → 400 ─────────────────────────────────────────

    @Test
    void invalidLonAbove180_returns400() throws Exception {
        mockMvc.perform(get(BASE_URL)
                        .param("schoolLat", "13.3")
                        .param("schoolLon", "181"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 7. Negative page → 400 ───────────────────────────────────────────────

    @Test
    void negativePage_returns400() throws Exception {
        mockMvc.perform(get(BASE_URL)
                        .param("schoolLat", "13.3")
                        .param("schoolLon", "74.7")
                        .param("page", "-1"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 8. page > 1000 → 400 ────────────────────────────────────────────────

    @Test
    void pageExceedsMax_returns400() throws Exception {
        mockMvc.perform(get(BASE_URL)
                        .param("schoolLat", "13.3")
                        .param("schoolLon", "74.7")
                        .param("page", "1001"))
                .andExpect(status().isBadRequest());

        verifyNoInteractions(service);
    }

    // ── 9. size=51 → clamped to 50 ───────────────────────────────────────────

    @Test
    void sizeAboveMax_clampedTo50() throws Exception {
        when(service.getListings(anyString(), anyDouble(), anyDouble(), anyDouble(), anyInt(), anyInt()))
                .thenReturn(new PublicSchoolRadiusListingsPage(List.of(), 0, 50, false));

        mockMvc.perform(get(BASE_URL)
                        .param("schoolLat", "13.3")
                        .param("schoolLon", "74.7")
                        .param("size", "51"))
                .andExpect(status().isOk());

        verify(service).getListings(eq("udupi"), eq(13.3), eq(74.7), anyDouble(), eq(0), eq(50));
    }

    // ── 9. radius > 10 → clamped to 10 ──────────────────────────────────────

    @Test
    void radiusAboveMax_clampedTo10() throws Exception {
        when(service.getListings(anyString(), anyDouble(), anyDouble(), anyDouble(), anyInt(), anyInt()))
                .thenReturn(emptyPage());

        mockMvc.perform(get(BASE_URL)
                        .param("schoolLat", "13.3")
                        .param("schoolLon", "74.7")
                        .param("schoolRadiusKm", "99"))
                .andExpect(status().isOk());

        verify(service).getListings(eq("udupi"), eq(13.3), eq(74.7), eq(10.0), eq(0), anyInt());
    }

    // ── 10. Valid request → 200, correct shape, 20 included fields present ────

    @Test
    void validRequest_returns200_withCorrectShape() throws Exception {
        PublicSchoolRadiusListingCard card = sampleCard();
        PublicSchoolRadiusListingsPage page = new PublicSchoolRadiusListingsPage(
                List.of(card), 0, 20, false);

        when(service.getListings(anyString(), anyDouble(), anyDouble(), anyDouble(), anyInt(), anyInt()))
                .thenReturn(page);

        mockMvc.perform(get(BASE_URL)
                        .param("schoolLat", "13.3")
                        .param("schoolLon", "74.7"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(1)))
                .andExpect(jsonPath("$.page", is(0)))
                .andExpect(jsonPath("$.size", is(20)))
                .andExpect(jsonPath("$.hasMore", is(false)))
                // All 20 included fields must be present
                .andExpect(jsonPath("$.content[0].id").exists())
                .andExpect(jsonPath("$.content[0].listingNumber").exists())
                .andExpect(jsonPath("$.content[0].propertyType").exists())
                .andExpect(jsonPath("$.content[0].title").exists())
                .andExpect(jsonPath("$.content[0].locality").exists())
                .andExpect(jsonPath("$.content[0].areaKey").exists())
                .andExpect(jsonPath("$.content[0].pricePaise").exists())
                .andExpect(jsonPath("$.content[0].builtArea").exists())
                .andExpect(jsonPath("$.content[0].builtAreaUnit").exists())
                .andExpect(jsonPath("$.content[0].bedrooms").exists())
                .andExpect(jsonPath("$.content[0].latitude").exists())
                .andExpect(jsonPath("$.content[0].longitude").exists())
                .andExpect(jsonPath("$.content[0].heroImageUrl").exists())
                .andExpect(jsonPath("$.content[0].listingPurpose").exists())
                .andExpect(jsonPath("$.content[0].possessionStatus").exists())
                .andExpect(jsonPath("$.content[0].daysOnMarket").exists())
                .andExpect(jsonPath("$.content[0].backOnMarket").exists())
                .andExpect(jsonPath("$.content[0].createdAt").exists())
                // All 8 excluded fields must be ABSENT
                .andExpect(jsonPath("$.content[0].trustTier").doesNotExist())
                .andExpect(jsonPath("$.content[0].reraNumber").doesNotExist())
                .andExpect(jsonPath("$.content[0].reraValid").doesNotExist())
                .andExpect(jsonPath("$.content[0].sellerType").doesNotExist())
                .andExpect(jsonPath("$.content[0].status").doesNotExist())
                .andExpect(jsonPath("$.content[0].updatedAt").doesNotExist())
                .andExpect(jsonPath("$.content[0].lastUpdatedAt").doesNotExist())
                .andExpect(jsonPath("$.content[0].firstPublishedAt").doesNotExist());
    }

    // ── 11. City with 0 results → 200, empty content ─────────────────────────

    @Test
    void cityWithNoResults_returns200_emptyContent() throws Exception {
        when(service.getListings(anyString(), anyDouble(), anyDouble(), anyDouble(), anyInt(), anyInt()))
                .thenReturn(emptyPage());

        mockMvc.perform(get("/api/discover/cities/unknown-city/school-radius-listings")
                        .param("schoolLat", "13.3")
                        .param("schoolLon", "74.7"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content", hasSize(0)))
                .andExpect(jsonPath("$.hasMore", is(false)));
    }

    // ── 12. Default radius applied when schoolRadiusKm omitted ───────────────

    @Test
    void omittedRadius_appliesDefault2km() throws Exception {
        when(service.getListings(anyString(), anyDouble(), anyDouble(), anyDouble(), anyInt(), anyInt()))
                .thenReturn(emptyPage());

        mockMvc.perform(get(BASE_URL)
                        .param("schoolLat", "13.3")
                        .param("schoolLon", "74.7"))
                .andExpect(status().isOk());

        verify(service).getListings(eq("udupi"), eq(13.3), eq(74.7), eq(2.0), eq(0), eq(20));
    }

    // ── 13. radius=0 is valid (exact-location match) ─────────────────────────

    @Test
    void radiusZero_isValid_returns200() throws Exception {
        when(service.getListings(anyString(), anyDouble(), anyDouble(), anyDouble(), anyInt(), anyInt()))
                .thenReturn(emptyPage());

        mockMvc.perform(get(BASE_URL)
                        .param("schoolLat", "13.3")
                        .param("schoolLon", "74.7")
                        .param("schoolRadiusKm", "0"))
                .andExpect(status().isOk());

        verify(service).getListings(eq("udupi"), eq(13.3), eq(74.7), eq(0.0), eq(0), anyInt());
    }
}

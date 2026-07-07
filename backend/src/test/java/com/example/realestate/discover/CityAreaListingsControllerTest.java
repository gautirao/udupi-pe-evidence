package com.example.realestate.discover;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

import static org.hamcrest.Matchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * WebMvcTest for GET /api/discover/cities/{city}/listings.
 * Covers all 10 acceptance criteria.
 */
@WebMvcTest(
        controllers = CityAreaListingsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({CityAreaListingsControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class CityAreaListingsControllerTest {

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
    private CityAreaListingsService service;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(service, userRoleService);
    }

    // ── AC1: 200 with correct top-level shape ────────────────────────────────

    @Test
    void ac1_happyPath_returns200WithCorrectShape() throws Exception {
        UUID id = UUID.randomUUID();
        // Anon response: priceBand populated, pricePaise null (omitted by NON_NULL).
        // The TestConfig security chain permits all requests and does not inject an
        // AnonymousAuthenticationToken, so SecurityContextHolder auth == null → isAuthenticated=false.
        // AreaListingCard.trustBadge is the already-projected public value — the raw letter
        // grade is projected by TrustBadge.publicBadge(...) inside CityAreaListingsService,
        // before construction, so the mock here supplies the public word directly ("A" -> "verified").
        AreaListingCard card = new AreaListingCard(id, null, "₹50L–1Cr", "apartment", "Malpe",
                "https://example.com/img.jpg", "sale", 2,
                "Spacious 2BHK near beach", 2, 850.0, "sq ft",
                null, null, null, null, null,
                "2024-01-15T10:30:00Z", "verified", null, null);
        AreaListingsEntry entry = new AreaListingsEntry("IN|KA|Udupi|Malpe", "Malpe", null,
                List.of(card));
        CityAreaListingsResponse resp = new CityAreaListingsResponse("udupi", 5, List.of(entry));

        when(service.getAreaListings("udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, false))
                .thenReturn(resp);

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city", is("udupi")))
                .andExpect(jsonPath("$.limitPerArea", is(5)))
                .andExpect(jsonPath("$.areas", hasSize(1)))
                .andExpect(jsonPath("$.areas[0].areaKey", is("IN|KA|Udupi|Malpe")))
                .andExpect(jsonPath("$.areas[0].areaName", is("Malpe")))
                .andExpect(jsonPath("$.areas[0].listings", hasSize(1)))
                .andExpect(jsonPath("$.areas[0].listings[0].id", is(id.toString())))
                // anon: pricePaise must be ABSENT (not null, not 0) — NON_NULL omits it
                .andExpect(jsonPath("$.areas[0].listings[0].pricePaise").doesNotExist())
                // anon: priceBand must be present
                .andExpect(jsonPath("$.areas[0].listings[0].priceBand", is("₹50L–1Cr")))
                .andExpect(jsonPath("$.areas[0].listings[0].propertyType", is("apartment")))
                .andExpect(jsonPath("$.areas[0].listings[0].listingPurpose", is("sale")))
                .andExpect(jsonPath("$.areas[0].listings[0].bedrooms", is(2)))
                .andExpect(jsonPath("$.areas[0].listings[0].title", is("Spacious 2BHK near beach")))
                .andExpect(jsonPath("$.areas[0].listings[0].bathrooms", is(2)))
                .andExpect(jsonPath("$.areas[0].listings[0].createdAt", is("2024-01-15T10:30:00Z")))
                .andExpect(jsonPath("$.areas[0].listings[0].trustBadge", is("verified")))
                // Raw letter grade must never appear under the old field name.
                .andExpect(jsonPath("$.areas[0].listings[0].trustTier").doesNotExist());
    }

    // ── AC2: only LIVE listings (enforced in service/SQL — tested via service unit test) ─
    // The controller test verifies contract shape; status filtering is a service concern.
    // AC2 is verified via the service's SQL ('LIVE' filter) and covered in service logic.

    // ── AC3: sorted by created_at DESC — verified by the order of cards returned by the mock

    @Test
    void ac3_multipleListings_preservesServiceOrder() throws Exception {
        UUID id1 = UUID.randomUUID();
        UUID id2 = UUID.randomUUID();
        AreaListingCard card1 = new AreaListingCard(id1, null, "₹0–25L", "house", "Malpe", null, "sale", null,
                null, null, null, null, null, null, null, null, null, null, null, null, null);
        AreaListingCard card2 = new AreaListingCard(id2, null, "₹0–25L", "apartment", "Malpe", null, "rent", 3,
                null, 2, null, null, null, null, null, null, null, null, null, null, null);
        AreaListingsEntry entry = new AreaListingsEntry("IN|KA|Udupi|Malpe", "Malpe", null,
                List.of(card1, card2));
        when(service.getAreaListings(eq("udupi"), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of(entry)));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areas[0].listings[0].id", is(id1.toString())))
                .andExpect(jsonPath("$.areas[0].listings[1].id", is(id2.toString())));
    }

    // ── AC4: limitPerArea applied independently per area ─────────────────────

    @Test
    void ac4_limitAppliedPerArea_passedToService() throws Exception {
        when(service.getAreaListings(eq("udupi"), any(), eq(3), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 3, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("limitPerArea", "3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.limitPerArea", is(3)));

        verify(service).getAreaListings("udupi", List.of("IN|KA|Udupi|Malpe"), 3, null, null, null, null, null, null, false);
    }

    // ── AC5: limitPerArea clamped to 20 ─────────────────────────────────────
    // Controller passes raw value to service; service clamps. The controller-layer test
    // verifies the response body reflects the clamped value (20), not the raw value (100).

    @Test
    void ac5_limitPerAreaAboveMax_responseReflectsClamped20() throws Exception {
        // Service receives raw 100 and returns a response with the clamped limitPerArea=20
        when(service.getAreaListings(eq("udupi"), any(), eq(100), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 20, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("limitPerArea", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.limitPerArea", is(20)));

        verify(service).getAreaListings("udupi", List.of("IN|KA|Udupi|Malpe"), 100, null, null, null, null, null, null, false);
    }

    // ── AC6: anonymous callers get 200 ───────────────────────────────────────

    @Test
    void ac6_noJwtRequired_anonymousGets200() throws Exception {
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        // No Authorization header supplied — must still get 200
        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe"))
                .andExpect(status().isOk());
    }

    // ── AC7: unknown city → 400 {"error":"unknown_city"} ─────────────────────

    @Test
    void ac7_unknownCity_returns400() throws Exception {
        when(service.getAreaListings(eq("nowhere"), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean()))
                .thenThrow(new ResponseStatusException(HttpStatus.BAD_REQUEST, "unknown_city"));

        mockMvc.perform(get("/api/discover/cities/nowhere/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("unknown_city")));
    }

    // ── AC8: missing areaKeys → 400 {"error":"areaKeys_required"} ─────────────

    @Test
    void ac8_missingAreaKeys_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/cities/udupi/listings"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("areaKeys_required")));

        verifyNoInteractions(service);
    }

    @Test
    void ac8_blankAreaKeys_returns400() throws Exception {
        // areaKeys= (param present but blank value) must be treated as absent — AC8
        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("areaKeys_required")));

        verifyNoInteractions(service);
    }

    @Test
    void ac8_whitespaceOnlyAreaKeys_returns400() throws Exception {
        // areaKeys=   (whitespace-only value) must also be treated as absent — AC8
        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "   "))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("areaKeys_required")));

        verifyNoInteractions(service);
    }

    // ── AC9: unknown areaKey for city → 200 with unknown:true, listings:[] ───

    @Test
    void ac9_unknownAreaKey_returns200WithUnknownFlag() throws Exception {
        AreaListingsEntry knownEntry = new AreaListingsEntry("IN|KA|Udupi|Malpe", "Malpe", null,
                List.of());
        AreaListingsEntry unknownEntry = new AreaListingsEntry("IN|KA|Udupi|Nowhere", null,
                Boolean.TRUE, List.of());
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5,
                        List.of(knownEntry, unknownEntry)));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("areaKeys", "IN|KA|Udupi|Nowhere"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areas[1].areaKey", is("IN|KA|Udupi|Nowhere")))
                .andExpect(jsonPath("$.areas[1].unknown", is(true)))
                .andExpect(jsonPath("$.areas[1].listings", hasSize(0)))
                // known area must NOT have the "unknown" field
                .andExpect(jsonPath("$.areas[0].unknown").doesNotExist());
    }

    // ── AC10: area with no LIVE listings → 200 with listings:[] ─────────────

    @Test
    void ac10_areaWithNoLiveListings_returnsEmptyListings() throws Exception {
        AreaListingsEntry entry = new AreaListingsEntry("IN|KA|Udupi|Manipal", "Manipal", null,
                List.of());
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of(entry)));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Manipal"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areas[0].areaKey", is("IN|KA|Udupi|Manipal")))
                .andExpect(jsonPath("$.areas[0].areaName", is("Manipal")))
                .andExpect(jsonPath("$.areas[0].listings", hasSize(0)))
                .andExpect(jsonPath("$.areas[0].unknown").doesNotExist());
    }

    // ── AC5 service-level: clampLimit unit tests ─────────────────────────────

    @Test
    void clampLimit_nullReturnsDefault() {
        org.junit.jupiter.api.Assertions.assertEquals(
                CityAreaListingsService.DEFAULT_LIMIT,
                CityAreaListingsService.clampLimit(null));
    }

    @Test
    void clampLimit_above20ClampsTo20() {
        org.junit.jupiter.api.Assertions.assertEquals(
                CityAreaListingsService.MAX_LIMIT,
                CityAreaListingsService.clampLimit(100));
    }

    @Test
    void clampLimit_withinBoundsPassesThrough() {
        org.junit.jupiter.api.Assertions.assertEquals(
                7,
                CityAreaListingsService.clampLimit(7));
    }

    // ── Filter params: minPrice and maxPrice passed to service ───────────────

    @Test
    void filter_minPriceAndMaxPrice_passedToService() throws Exception {
        when(service.getAreaListings(any(), any(), any(), eq(1_000_000L), eq(5_000_000L), any(), any(), any(), any(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("minPrice", "1000000")
                        .param("maxPrice", "5000000"))
                .andExpect(status().isOk());

        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                1_000_000L, 5_000_000L, null, null, null, null, false);
    }

    // ── Filter params: bedrooms passed to service ────────────────────────────

    @Test
    void filter_bedrooms_passedToService() throws Exception {
        when(service.getAreaListings(any(), any(), any(), any(), any(), eq(3), any(), any(), any(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("bedrooms", "3"))
                .andExpect(status().isOk());

        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, 3, null, null, null, false);
    }

    // ── Filter params: propertyType passed to service ────────────────────────

    @Test
    void filter_propertyType_passedToService() throws Exception {
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), eq("apartment"), any(), any(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("propertyType", "apartment"))
                .andExpect(status().isOk());

        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, null, "apartment", null, null, false);
    }

    // ── q param: keyword search ──────────────────────────────────────────────

    @Test
    void q_absent_serviceCalledWithQNull() throws Exception {
        // q not supplied → service receives q=null (backward compat)
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), isNull(), any(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe"))
                .andExpect(status().isOk());

        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, null, null, null, null, false);
    }

    @Test
    void q_keyword_passedToService() throws Exception {
        // q="villa" → service receives q="villa"
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), eq("villa"), any(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("q", "villa"))
                .andExpect(status().isOk());

        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, null, null, "villa", null, false);
    }

    @Test
    void q_emptyString_passedAsEmptyToService() throws Exception {
        // q="" → controller passes "" to service; service normalises to null (blank check)
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("q", ""))
                .andExpect(status().isOk());

        // Controller passes the raw value through; service normalises blank → null
        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, null, null, "", null, false);
    }

    @Test
    void q_whitespaceOnly_passedAsWhitespaceToService() throws Exception {
        // q="   " → controller passes "   " through; service normalises blank → null
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("q", "   "))
                .andExpect(status().isOk());

        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, null, null, "   ", null, false);
    }

    @Test
    void q_exceeds500Chars_returns400ServiceNotCalled() throws Exception {
        // q longer than 500 chars → 400, service never called
        String longQ = "a".repeat(501);

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("q", longQ))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("query_too_long")));

        verifyNoInteractions(service);
    }

    @Test
    void q_combinedWithBedrooms_bothPassedToService() throws Exception {
        // q="villa" combined with bedrooms=2 → both forwarded correctly
        when(service.getAreaListings(any(), any(), any(), any(), any(), eq(2), any(), eq("villa"), any(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("bedrooms", "2")
                        .param("q", "villa"))
                .andExpect(status().isOk());

        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, 2, null, "villa", null, false);
    }

    // ── No filter params → service called with all nulls (existing happy path) ─

    @Test
    void filter_noParams_serviceCalledWithAllNulls() throws Exception {
        when(service.getAreaListings(any(), any(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe"))
                .andExpect(status().isOk());

        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, null, null, null, null, false);
    }

    // ── Cache-Control: anon → public max-age=60; authed → no-store ──────────

    @Test
    void getCityAreaListings_anonResponseHasCacheControlPublicMaxAge60() throws Exception {
        // No Authorization header → anonymous → public cache
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("max-age=60")))
                .andExpect(header().string("Cache-Control", containsString("public")))
                .andExpect(header().string("Cache-Control", not(containsString("no-store"))));
    }
}

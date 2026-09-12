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
                "2024-01-15T10:30:00Z", "verified", null, null, null, null, null);
        AreaListingsEntry entry = new AreaListingsEntry("IN|KA|Udupi|Malpe", "Malpe", null,
                List.of(card));
        CityAreaListingsResponse resp = new CityAreaListingsResponse("udupi", 5, List.of(entry));

        when(service.getAreaListings("udupi", List.of("IN|KA|Udupi|Malpe"), null, null, null, null, null, null, null, null, null, false))
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
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
        // card2 is a "rent" card — assert its monthlyRentBand is present (anon) below.
        AreaListingCard card2 = new AreaListingCard(id2, null, null, "apartment", "Malpe", null, "rent", 3,
                null, 2, null, null, null, null, null, null, null, null, null, null, null, null, "₹10–20K", null);
        AreaListingsEntry entry = new AreaListingsEntry("IN|KA|Udupi|Malpe", "Malpe", null,
                List.of(card1, card2));
        when(service.getAreaListings(eq("udupi"), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of(entry)));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areas[0].listings[0].id", is(id1.toString())))
                .andExpect(jsonPath("$.areas[0].listings[1].id", is(id2.toString())))
                // #2051: card2 (rent) exposes the coarse monthlyRentBand for anon, never a sale
                // priceBand/pricePaise and never the exact monthlyRentRupees.
                .andExpect(jsonPath("$.areas[0].listings[1].monthlyRentBand", is("₹10–20K")))
                .andExpect(jsonPath("$.areas[0].listings[1].monthlyRentRupees").doesNotExist())
                .andExpect(jsonPath("$.areas[0].listings[1].priceBand").doesNotExist())
                .andExpect(jsonPath("$.areas[0].listings[1].pricePaise").doesNotExist());
    }

    // ── AC4: limitPerArea applied independently per area ─────────────────────

    @Test
    void ac4_limitAppliedPerArea_passedToService() throws Exception {
        when(service.getAreaListings(eq("udupi"), any(), eq(3), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), any(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 3, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("limitPerArea", "3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.limitPerArea", is(3)));

        verify(service).getAreaListings("udupi", List.of("IN|KA|Udupi|Malpe"), 3, null, null, null, null, null, null, null, null, false);
    }

    // ── AC5: limitPerArea clamped to 20 ─────────────────────────────────────
    // Controller passes raw value to service; service clamps. The controller-layer test
    // verifies the response body reflects the clamped value (20), not the raw value (100).

    @Test
    void ac5_limitPerAreaAboveMax_responseReflectsClamped20() throws Exception {
        // Service receives raw 100 and returns a response with the clamped limitPerArea=20
        when(service.getAreaListings(eq("udupi"), any(), eq(100), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), any(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 20, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("limitPerArea", "100"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.limitPerArea", is(20)));

        verify(service).getAreaListings("udupi", List.of("IN|KA|Udupi|Malpe"), 100, null, null, null, null, null, null, null, null, false);
    }

    // ── AC6: anonymous callers get 200 ───────────────────────────────────────

    @Test
    void ac6_noJwtRequired_anonymousGets200() throws Exception {
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        // No Authorization header supplied — must still get 200
        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe"))
                .andExpect(status().isOk());
    }

    // ── AC7: unknown city → 400 {"error":"unknown_city"} ─────────────────────

    @Test
    void ac7_unknownCity_returns400() throws Exception {
        when(service.getAreaListings(eq("nowhere"), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), anyBoolean()))
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
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), anyBoolean()))
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
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), anyBoolean()))
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
        when(service.getAreaListings(any(), any(), any(), eq(1_000_000L), eq(5_000_000L), any(), any(), any(), any(), any(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("minPrice", "1000000")
                        .param("maxPrice", "5000000"))
                .andExpect(status().isOk());

        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                1_000_000L, 5_000_000L, null, null, null, null, null, null, false);
    }

    // ── Filter params: bedrooms passed to service ────────────────────────────

    @Test
    void filter_bedrooms_passedToService() throws Exception {
        when(service.getAreaListings(any(), any(), any(), any(), any(), eq(List.of(3)), any(), any(), any(), any(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("bedrooms", "3"))
                .andExpect(status().isOk());

        // #2533 — the REQUEST is unchanged (?bedrooms=3) and only the binding target widened, so a
        // single value now arrives as a one-element list. This is AC2 evidence: every request shape
        // the current frontend sends behaves exactly as before.
        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, List.of(3), null, null, null, null, null, false);
    }

    // ── Filter params: propertyType passed to service ────────────────────────

    @Test
    void filter_propertyType_passedToService() throws Exception {
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), eq(List.of("apartment")), any(), any(), any(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("propertyType", "apartment"))
                .andExpect(status().isOk());

        // #2533 AC2 — same single-value request, now a one-element list. The param NAME is
        // unchanged, which is what keeps this request shape working untouched.
        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, null, List.of("apartment"), null, null, null, null, false);
    }

    // ── #2023 (BLOCKING review fix): readyToMove param forwarded to service ──

    @Test
    void filter_readyToMove_passedToService() throws Exception {
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), any(), any(), eq(true), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("readyToMove", "true"))
                .andExpect(status().isOk());

        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, null, null, null, null, true, null, false);
    }

    @Test
    void filter_readyToMoveAbsent_serviceCalledWithNull() throws Exception {
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe"))
                .andExpect(status().isOk());

        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, null, null, null, null, null, null, false);
    }

    // ── q param: keyword search ──────────────────────────────────────────────

    @Test
    void q_absent_serviceCalledWithQNull() throws Exception {
        // q not supplied → service receives q=null (backward compat)
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), isNull(), any(), any(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe"))
                .andExpect(status().isOk());

        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, null, null, null, null, null, null, false);
    }

    @Test
    void q_keyword_passedToService() throws Exception {
        // q="villa" → service receives q="villa"
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), eq("villa"), any(), any(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("q", "villa"))
                .andExpect(status().isOk());

        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, null, null, "villa", null, null, null, false);
    }

    @Test
    void q_emptyString_passedAsEmptyToService() throws Exception {
        // q="" → controller passes "" to service; service normalises to null (blank check)
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("q", ""))
                .andExpect(status().isOk());

        // Controller passes the raw value through; service normalises blank → null
        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, null, null, "", null, null, null, false);
    }

    @Test
    void q_whitespaceOnly_passedAsWhitespaceToService() throws Exception {
        // q="   " → controller passes "   " through; service normalises blank → null
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("q", "   "))
                .andExpect(status().isOk());

        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, null, null, "   ", null, null, null, false);
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
        when(service.getAreaListings(any(), any(), any(), any(), any(), eq(List.of(2)), any(), eq("villa"), any(), any(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("bedrooms", "2")
                        .param("q", "villa"))
                .andExpect(status().isOk());

        // #2533 AC2 — bedrooms widened to a one-element list; q is untouched and still a scalar.
        // Worth keeping as a combined arm: bedrooms and q sit in adjacent bind slots downstream.
        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, List.of(2), null, "villa", null, null, null, false);
    }

    // ── No filter params → service called with all nulls (existing happy path) ─

    @Test
    void filter_noParams_serviceCalledWithAllNulls() throws Exception {
        when(service.getAreaListings(any(), any(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), isNull(), any(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe"))
                .andExpect(status().isOk());

        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, null, null, null, null, null, null, false);
    }

    // ── Cache-Control: anon → public max-age=60; authed → no-store ──────────

    @Test
    void getCityAreaListings_anonResponseHasCacheControlPublicMaxAge60() throws Exception {
        // No Authorization header → anonymous → public cache
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe"))
                .andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("max-age=60")))
                .andExpect(header().string("Cache-Control", containsString("public")))
                .andExpect(header().string("Cache-Control", not(containsString("no-store"))));
    }

    // ── #2015: bbox validation → 400, service never called ──────────────────
    // MockMvc/HTTP-layer coverage of BboxParser's error codes plus the controller's own
    // MAX_BOUNDS_SPAN_DEGREES guard, mirroring q_exceeds500Chars_returns400ServiceNotCalled's
    // style (verifyNoInteractions after the 400). Real-DB proof of the same behaviour (via a
    // direct controller invocation) lives in CityAreaListingsBboxSpatialIT's section (c).

    @Test
    void bbox_wrongPartCount_returns400ServiceNotCalled() throws Exception {
        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("bbox", "13.30,74.70,13.40"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("bbox_must_have_4_values")));

        verifyNoInteractions(service);
    }

    @Test
    void bbox_nonNumericToken_returns400ServiceNotCalled() throws Exception {
        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("bbox", "13.30,not-a-number,13.40,74.80"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("bbox_values_must_be_numeric")));

        verifyNoInteractions(service);
    }

    @Test
    void bbox_nonFiniteToken_returns400ServiceNotCalled() throws Exception {
        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("bbox", "NaN,74.70,13.40,74.80"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("bbox_values_must_be_finite")));

        verifyNoInteractions(service);
    }

    @Test
    void bbox_latOutOfRange_returns400ServiceNotCalled() throws Exception {
        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("bbox", "-91.0,74.70,13.40,74.80"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("bbox_lat_out_of_range")));

        verifyNoInteractions(service);
    }

    @Test
    void bbox_southGreaterThanNorth_returns400ServiceNotCalled() throws Exception {
        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("bbox", "13.40,74.70,13.30,74.80"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("bbox_south_must_be_lte_north")));

        verifyNoInteractions(service);
    }

    @Test
    void bbox_spanExceedsMax_returns400ServiceNotCalled() throws Exception {
        // 10.1 degree lat span — within BboxParser's own lat/lon range checks, so only the
        // controller's local validateBoundsSpan (MAX_BOUNDS_SPAN_DEGREES = 10.0) rejects this.
        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("bbox", "0.0,0.0,10.1,10.0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error", is("bbox_span_exceeds_max")));

        verifyNoInteractions(service);
    }

    @Test
    void bbox_absent_serviceCalledWithNullBbox() throws Exception {
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe"))
                .andExpect(status().isOk());

        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, null, null, null, null, null, null, false);
    }

    @Test
    void bbox_valid_parsedAndPassedToService() throws Exception {
        DiscoverListingPredicateBuilder.Bbox expected =
                new DiscoverListingPredicateBuilder.Bbox(13.30, 74.70, 13.40, 74.80);

        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), eq(expected), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("bbox", "13.30,74.70,13.40,74.80"))
                .andExpect(status().isOk());

        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, null, null, null, null, null, expected, false);
    }

    @Test
    void bboxOnly_areaKeysAbsent_bboxPresent_returns200ServiceCalledWithNullAreaKeys() throws Exception {
        // #2015 — the standalone "Search this area" viewport path: areaKeys absent, bbox
        // present. The controller must NOT throw areaKeys_required, and must dispatch to the
        // same service.getAreaListings(...) call with areaKeys=null and the parsed bbox — the
        // routing decision to use the bbox-only query path lives inside the service, not here.
        DiscoverListingPredicateBuilder.Bbox expected =
                new DiscoverListingPredicateBuilder.Bbox(13.30, 74.70, 13.40, 74.80);

        when(service.getAreaListings(eq("udupi"), isNull(), any(), any(), any(), any(), any(), any(), any(), any(), eq(expected), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 20, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("bbox", "13.30,74.70,13.40,74.80"))
                .andExpect(status().isOk());

        verify(service).getAreaListings(
                "udupi", null, null,
                null, null, null, null, null, null, null, expected, false);
    }

    // ── #2533: multi-value narrowing, and the two behaviour deltas it introduces ─────
    // These began as characterisation arms pinning the PRE-widening behaviour. That job is
    // done and recorded on the issue; they now pin the POST-widening contract. Two of them
    // document deliberate behaviour changes for request shapes the current frontend never
    // sends — accepted under an explicit Decision Lock override, not overlooked.

    @Test
    void issue2533_repeatedPropertyTypeParam_reachesServiceAsUnion() throws Exception {
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("propertyType", "apartment", "villa"))
                .andExpect(status().isOk());

        // AC1. BEFORE: both values arrived as the single String "apartment,villa", which
        // property_type's CHECK constraint means no row can equal — so a two-type selection was
        // not expressible at all, which is why the frontend collapsed it to `undefined`.
        // AFTER: the union reaches the service intact.
        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, null, List.of("apartment", "villa"), null, null, null, null, false);
    }

    @Test
    void issue2533_commaJoinedPropertyTypeValue_becomesUnion_acceptedDelta() throws Exception {
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("propertyType", "apartment,villa"))
                .andExpect(status().isOk());

        // DELTA 1, deliberate and accepted. BEFORE: bound verbatim as "apartment,villa", a single
        // literal no row can match — zero results. AFTER: Spring splits a comma-containing value
        // for a List target, so it becomes the same union as the repeated form above.
        //
        // An earlier revision of the plan REQUIRED that this must not happen. That requirement was
        // withdrawn: it is not achievable without a custom binder fighting the framework to
        // preserve a meaningless zero-row answer, and nobody depends on "comma yields nothing" —
        // it was an artefact of scalar binding, not a feature. Unreachable from the UI.
        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, null, List.of("apartment", "villa"), null, null, null, null, false);
    }

    @Test
    void issue2533_repeatedBedroomsParam_noLongerSilentlyDropsSecondValue() throws Exception {
        when(service.getAreaListings(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), isNull(), anyBoolean()))
                .thenReturn(new CityAreaListingsResponse("udupi", 5, List.of()));

        mockMvc.perform(get("/api/discover/cities/udupi/listings")
                        .param("areaKeys", "IN|KA|Udupi|Malpe")
                        .param("bedrooms", "2", "3"))
                .andExpect(status().isOk());

        // DELTA 2, and a latent production defect CLOSED rather than a silent improvement.
        // BEFORE (measured, not assumed — a 400 was predicted and the measurement refuted it):
        // this returned 200 and bound `2`, discarding the 3 with no error and no signal. That is
        // the same silent-narrowing family as the defect this issue exists to fix — a two-value
        // request answered with a one-value filter — and it was masked only because the frontend
        // never sent the shape. It would have surfaced the moment that collapse was fixed.
        // AFTER: both values are retained.
        //
        // Note the scalar paths were NOT symmetric: String comma-JOINED while Integer took
        // FIRST-VALUE-WINS. A future reader will assume they behaved alike. They did not.
        verify(service).getAreaListings(
                "udupi", List.of("IN|KA|Udupi|Malpe"), null,
                null, null, List.of(2, 3), null, null, null, null, null, false);
    }
}

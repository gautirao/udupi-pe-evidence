package com.example.realestate.listing.api;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.crud.BrokerDashboardService;
import com.example.realestate.listing.crud.ListingCrudService;
import com.example.realestate.listing.image.ListingImageRepository;
import com.example.realestate.listing.workflow.ListingWorkflowService;
import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.hamcrest.Matchers.matchesPattern;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Controller-boundary (AC11) tests for #2038: the fallback 500 handler on {@code PUT
 * /api/listings/{id}}. This is a SIBLING class to {@link ListingControllerTest} (identical
 * {@code @WebMvcTest}/{@code @Import} shape, per the approved plan's [controller_boundary_harness]
 * note), kept separate because one test in this class needs to force a real
 * {@code MDC.get("requestId") == null} condition via a small test-only filter, which would
 * otherwise interfere with every other test sharing {@code ListingControllerTest}'s cached Spring
 * context.
 *
 * <p>Gap this class closes: there was previously NO test anywhere that drove a real
 * {@code DataIntegrityViolationException} (the actual exception type #2038's fix eliminates)
 * through the full controller → {@code GlobalExceptionHandler} boundary and asserted the
 * response shape.
 */
@WebMvcTest(
        controllers = ListingController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({ListingController500ResponseTest.TestConfig.class, WebMvcConfig.class, CallerInfoResolver.class,
        com.example.realestate.exception.GlobalExceptionHandler.class})
class ListingController500ResponseTest {

    private static final UUID DEALER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");

    /**
     * Test-only header: when present with value "true", the {@link NullRequestIdTestFilter} below
     * removes the {@code requestId} MDC key that {@code MdcRequestFilter} (real production filter,
     * auto-detected by this @WebMvcTest slice since it is a {@code @Component} implementing
     * {@code Filter}) has already set, BEFORE the request reaches the controller/exception handler.
     * This is the only reliable way to exercise {@code GlobalExceptionHandler}'s null-MDC branch
     * through a real HTTP round trip in this slice: {@code MdcRequestFilter} unconditionally
     * assigns a requestId to every request, so the null case cannot occur organically once that
     * filter is active. The filter genuinely clears the real MDC key; nothing about
     * {@code GlobalExceptionHandler} itself is stubbed or bypassed.
     */
    private static final String FORCE_NULL_REQUEST_ID_HEADER = "X-Test-Force-Null-RequestId";

    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                    .build();
        }

        @Bean
        @Order(Ordered.HIGHEST_PRECEDENCE + 1)
        public NullRequestIdTestFilter nullRequestIdTestFilter() {
            return new NullRequestIdTestFilter();
        }
    }

    static class NullRequestIdTestFilter extends OncePerRequestFilter {
        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                         FilterChain filterChain) throws ServletException, IOException {
            if ("true".equals(request.getHeader(FORCE_NULL_REQUEST_ID_HEADER))) {
                MDC.remove("requestId");
            }
            filterChain.doFilter(request, response);
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ListingCrudService listingCrudService;

    @MockitoBean
    private ListingWorkflowService listingWorkflowService;

    @MockitoBean
    private ListingImageRepository listingImageRepository;

    @MockitoBean
    private ListingResponseMapper listingResponseMapper;

    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private BrokerDashboardService brokerDashboardService;

    @BeforeEach
    void setUp() {
        when(listingImageRepository.countByListingId(any())).thenReturn(0L);
        when(listingImageRepository.findByListingIdOrderByPositionAsc(any())).thenReturn(List.of());
    }

    private Listing buildListing(UUID id, String status, String propertyType, String title,
                                  String locality, BigDecimal price, String description) {
        Listing l = new Listing();
        l.setId(id);
        l.setListingNumber(42);
        l.setStatus(status);
        l.setPropertyType(propertyType);
        l.setTitle(title);
        l.setLocality(locality);
        l.setPrice(price);
        l.setDescription(description);
        l.setLandAreaUnit("sqft");
        l.setBuiltAreaUnit("sqft");
        l.setCreatedAt(OffsetDateTime.now());
        l.setUpdatedAt(OffsetDateTime.now());
        return l;
    }

    // ==================== TASK 3(a): real DataIntegrityViolationException -> genuine 500 ====================

    @Test
    void updateListing_dataIntegrityViolationFromService_returns500WithRequestIdAndNoLeakedDetails() throws Exception {
        // The REAL exception type (org.springframework.dao.DataIntegrityViolationException) that
        // ListingCrudService.updateListing threw pre-fix on the overlapping child-set REPLACE
        // race (#2038). The nested cause message deliberately contains SQL/constraint text and a
        // fake secret-shaped token, purely to prove none of it leaks into the HTTP response body.
        when(listingCrudService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any(), any()))
                .thenThrow(new DataIntegrityViolationException(
                        "could not execute statement",
                        new RuntimeException("ERROR: duplicate key value violates unique constraint "
                                + "\"uq_listing_amenities_listing_id_code\" Detail: Key (listing_id, code)="
                                + "(11111111-1111-1111-1111-111111111111, LIFT) already exists. "
                                + "sql=[insert into listing_amenities (id, listing_id, code) values (?,?,?)] "
                                + "secret-token=sk_live_should_never_leak_12345")));

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"house","title":"Updated title","locality":"Manipal",
                                 "price":6000000,"description":"Updated desc"}
                                """))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("INTERNAL_ERROR"))
                // requestId key present: MdcRequestFilter (real, auto-detected @Component Filter in
                // this @WebMvcTest slice) unconditionally assigns one before the handler runs.
                .andExpect(jsonPath("$.requestId").exists())
                .andExpect(jsonPath("$.requestId").value(matchesPattern("[\\w-]{1,36}")))
                // Exactly two keys in the body — no stack trace, no SQL, no exception message,
                // no constraint name, no secret token, no broker/location data.
                .andExpect(jsonPath("$.length()").value(2))
                .andExpect(jsonPath("$").value(not(containsString("duplicate key"))))
                .andExpect(jsonPath("$").value(not(containsString("uq_listing_amenities"))))
                .andExpect(jsonPath("$").value(not(containsString("insert into"))))
                .andExpect(jsonPath("$").value(not(containsString("sk_live_should_never_leak"))))
                .andExpect(jsonPath("$").value(not(containsString("Manipal"))))
                .andExpect(jsonPath("$").value(not(containsString("DataIntegrityViolationException"))))
                // X-Request-Id response header — provided by MdcRequestFilter, independent of the fix,
                // but asserted here so the header and body requestId are proven consistent.
                .andExpect(header().exists("X-Request-Id"))
                .andExpect(result -> {
                    String headerId = result.getResponse().getHeader("X-Request-Id");
                    String bodyJson = result.getResponse().getContentAsString();
                    org.assertj.core.api.Assertions.assertThat(bodyJson)
                            .as("X-Request-Id response header must match the body's requestId field")
                            .contains("\"requestId\":\"" + headerId + "\"");
                });
    }

    // ==================== TASK 3(b): mocked service succeeds -> 2xx ====================

    @Test
    void updateListing_serviceSucceeds_returns200() throws Exception {
        // listingResponseMapper is a @MockitoBean; its unstubbed toResponse(...) returns null,
        // and ResponseEntity.ok(null) is a legitimate 200 with an empty body — sufficient to prove
        // the success path is unaffected by #2038's exception-handling change (already covered in
        // more detail, with full response-shape assertions, by ListingControllerTest's
        // update_withDealerRole_returns200 / updateListing_draftListing_returns200; this test exists
        // only to keep TASK 3(b) self-contained in this sibling class).
        Listing updated = buildListing(LISTING_ID, "DRAFT", "house", "Updated title",
                "Manipal", new BigDecimal("6000000"), "Updated desc");
        when(listingCrudService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any(), any()))
                .thenReturn(updated);

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"house","title":"Updated title","locality":"Manipal",
                                 "price":6000000,"description":"Updated desc"}
                                """))
                .andExpect(status().is2xxSuccessful());
    }

    // ==================== TASK 3(c): null-MDC path -> requestId key OMITTED, still valid JSON ====================

    @Test
    void updateListing_dataIntegrityViolationWithNoMdcRequestId_bodyOmitsRequestIdKey_staysValidJson() throws Exception {
        when(listingCrudService.updateListing(eq(LISTING_ID), eq(DEALER_ID), eq(false),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyBoolean(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(), any(), any(), any(), any(), any(), any(), any(),
                any(), any(), any(),
                any(), any(), any()))
                .thenThrow(new DataIntegrityViolationException("could not execute statement",
                        new RuntimeException("duplicate key value violates unique constraint")));

        mockMvc.perform(put("/api/listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_DEALER")))
                        .header(FORCE_NULL_REQUEST_ID_HEADER, "true")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"propertyType":"house","title":"Updated title","locality":"Manipal",
                                 "price":6000000,"description":"Updated desc"}
                                """))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("INTERNAL_ERROR"))
                .andExpect(jsonPath("$.requestId").doesNotExist())
                // Exactly one key ("error") — confirms the ternary's Map.of("error", ...) branch
                // (no "requestId" entry at all, not even a JSON null), per the deliberate shape
                // decision in GlobalExceptionHandler.handleUnexpected.
                .andExpect(jsonPath("$.length()").value(1));
    }
}

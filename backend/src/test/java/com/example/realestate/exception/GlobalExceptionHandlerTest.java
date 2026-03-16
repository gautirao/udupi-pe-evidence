package com.example.realestate.exception;

import com.example.realestate.booking.BookingController;
import com.example.realestate.booking.BookingService;
import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mapping.PropertyReferenceException;
import org.springframework.data.util.TypeInformation;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.PlatformTransactionManager;

import io.github.bucket4j.Bucket;
import org.mockito.Mockito;

import java.util.UUID;

import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WebMvcTest for GlobalExceptionHandler.
 *
 * Uses BookingController as the MVC slice under test so that real request routing is exercised.
 * The handler is imported explicitly via @Import so it participates in the slice context.
 *
 * Test cases:
 *   1. Malformed JSON body → 400 MALFORMED_REQUEST
 *   2. PropertyReferenceException from service → 400 INVALID_SORT_FIELD
 *   3. Unexpected RuntimeException from service → 500 INTERNAL_ERROR (message not leaked)
 *   4. Valid happy-path request → 200, no error field
 */
@WebMvcTest(
        controllers = BookingController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({GlobalExceptionHandler.class, GlobalExceptionHandlerTest.TestConfig.class})
class GlobalExceptionHandlerTest {

    private static final UUID REQUESTER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID LISTING_ID   = UUID.fromString("00000000-0000-0000-0000-000000000088");

    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                    .build();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private BookingService bookingService;

    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private PlatformTransactionManager transactionManager;

    @MockitoBean
    private RateLimiterService rateLimiterService;

    @BeforeEach
    void setUp() {
        // Default: booking bucket allows all requests
        Bucket allowBucket = Mockito.mock(Bucket.class);
        when(allowBucket.tryConsume(1)).thenReturn(true);
        when(rateLimiterService.getBookingBucket(anyString())).thenReturn(allowBucket);
    }

    // ===== Test 1: Malformed JSON → 400 MALFORMED_REQUEST =====

    @Test
    void malformedJson_returns400WithMalformedRequestError() throws Exception {
        mockMvc.perform(post("/api/bookings")
                        .with(jwt().jwt(j -> j.subject(REQUESTER_ID.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{invalid json"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("MALFORMED_REQUEST"));
    }

    // ===== Test 2: PropertyReferenceException from service → 400 INVALID_SORT_FIELD =====

    @Test
    @SuppressWarnings("unchecked")
    void invalidSortField_returns400WithInvalidSortFieldError() throws Exception {
        // Bypass the controller's allowlist guard by throwing from the service directly.
        // TypeInformation.of(Object.class) is the simplest valid TypeInformation instance.
        PropertyReferenceException ex = new PropertyReferenceException(
                "badField", TypeInformation.of(Object.class), java.util.List.of());

        when(bookingService.getBookingsForRequesterPaged(eq(REQUESTER_ID), any(Pageable.class)))
                .thenThrow(ex);

        // Use a sort field that passes the controller allowlist ("createdAt") so the request
        // reaches the service call, where the mock throws PropertyReferenceException.
        mockMvc.perform(get("/api/bookings/mine?sort=createdAt,asc")
                        .with(jwt().jwt(j -> j.subject(REQUESTER_ID.toString()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("INVALID_SORT_FIELD"));
    }

    // ===== Test 3: Unexpected RuntimeException → 500 INTERNAL_ERROR, message not leaked =====

    @Test
    void unhandledException_returns500WithInternalErrorOnly() throws Exception {
        when(bookingService.getBookingsForRequesterPaged(any(), any(Pageable.class)))
                .thenThrow(new RuntimeException("internal details — do not expose"));

        mockMvc.perform(get("/api/bookings/mine")
                        .with(jwt().jwt(j -> j.subject(REQUESTER_ID.toString()))))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.error").value("INTERNAL_ERROR"))
                .andExpect(jsonPath("$").value(not(containsString("internal details"))));
    }

    // ===== Test 4: Valid request → 200, no error field =====

    @Test
    void validRequest_isNotAffectedByHandler() throws Exception {
        when(bookingService.getBookingsForRequesterPaged(eq(REQUESTER_ID), any(Pageable.class)))
                .thenReturn(Page.empty());

        mockMvc.perform(get("/api/bookings/mine")
                        .with(jwt().jwt(j -> j.subject(REQUESTER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.error").doesNotExist());
    }
}

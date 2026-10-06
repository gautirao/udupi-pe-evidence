package com.example.realestate.propertyrequest;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.IngestionApiKeyFilter;
import com.example.realestate.security.JwtConfig;
import com.example.realestate.security.PrometheusApiKeyFilter;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidationException;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * FF1 (#1793): with {@code app.property-requests.enabled} unset (default) or false, the public
 * create endpoint is not wired at all. Run through the REAL {@link JwtConfig} chain (whose
 * permitAll still covers the path) so the 404 is proven end-to-end, not just at the controller.
 * The repository, limiter and hasher are mocks asserted to be NEVER touched.
 */
@WebMvcTest(
        controllers = {PublicPropertyRequestController.class, AdminPropertyRequestController.class},
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({
        JwtConfig.class,
        IngestionApiKeyFilter.class,
        PrometheusApiKeyFilter.class,
        GlobalExceptionHandler.class,
        WebMvcConfig.class,
        CallerInfoResolver.class,
        PropertyRequestService.class
})
@TestPropertySource(properties = {
        "app.ingestion.api-key=test-ingestion-key",
        "app.metrics.api-key=test-metrics-key",
        "cors.allowed-origins=http://localhost:5174"
        // app.property-requests.enabled deliberately NOT set: the default must be OFF
})
class PropertyRequestFlagOffTest {

    private static final String URL = "/api/public/property-requests";
    private static final String ADMIN_URL = "/api/admin/property-requests";
    private static final String BODY = "{\"city\":\"Udupi\",\"phone\":\"+919876541234\",\"consent\":true}";

    @Autowired private MockMvc mockMvc;
    @Autowired private ApplicationContext context;

    @MockitoBean private PropertyRequestRepository repository;
    @MockitoBean private PropertyRequestRateLimiter rateLimiter;
    @MockitoBean private PhoneHasher phoneHasher;
    @MockitoBean private UserRoleService userRoleService;
    @MockitoBean private JwtDecoder jwtDecoder;

    @Test
    @DisplayName("FF1: default (flag unset) -> the public controller bean does not exist")
    void controllerIsNotWired() {
        assertThat(context.getBeanNamesForType(PublicPropertyRequestController.class)).isEmpty();
    }

    @Test
    @DisplayName("FF1: flag off -> anonymous POST valid body -> 404 through the real chain; repository/limiter/hasher untouched; no detail leaked")
    void flagOff_post_returns404_andTouchesNothing() throws Exception {
        MvcResult result = mockMvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isNotFound())
                .andReturn();

        verifyNoInteractions(repository, rateLimiter, phoneHasher);
        String body = result.getResponse().getContentAsString();
        assertThat(body).doesNotContain("Exception").doesNotContain("trace").doesNotContain("at com.example")
                .doesNotContain("PropertyRequest").doesNotContain("enabled").doesNotContain("9876541234");
    }

    @Test
    @DisplayName("FF1: flag off -> POST with an expired Bearer is still 404 (not 401/403), nothing touched")
    void flagOff_postWithExpiredBearer_returns404() throws Exception {
        when(jwtDecoder.decode(any())).thenThrow(
                new JwtValidationException("Jwt expired", List.of(new OAuth2Error("invalid_token", "Jwt expired", null))));
        mockMvc.perform(post(URL).header("Authorization", "Bearer expired.jwt.token")
                        .contentType(MediaType.APPLICATION_JSON).content(BODY))
                .andExpect(status().isNotFound());
        verifyNoInteractions(repository, rateLimiter, phoneHasher);
    }

    @Test
    @DisplayName("FF1: flag off -> malformed / empty POST bodies are also 404 (body is never parsed), nothing touched")
    void flagOff_postMalformed_returns404() throws Exception {
        mockMvc.perform(post(URL).contentType(MediaType.APPLICATION_JSON).content("{not json 9876541234"))
                .andExpect(status().isNotFound());
        mockMvc.perform(post(URL)).andExpect(status().isNotFound());
        verifyNoInteractions(repository, rateLimiter, phoneHasher);
    }

    @Test
    @DisplayName("FF1 admin choice: the admin list stays UNFLAGGED and admin-only -> admin 200, non-admin 403, anonymous 401")
    void adminList_isUnflagged_andStillAdminOnly() throws Exception {
        when(repository.findAllByOrderByCreatedAtDesc(any(Pageable.class))).thenReturn(List.of());
        mockMvc.perform(get(ADMIN_URL).with(jwt().jwt(j -> j.subject(UUID.randomUUID().toString()))
                        .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"))))
                .andExpect(status().isOk());
        mockMvc.perform(get(ADMIN_URL).with(jwt().jwt(j -> j.subject(UUID.randomUUID().toString()))
                        .authorities(new SimpleGrantedAuthority("ROLE_USER"))))
                .andExpect(status().isForbidden());
        mockMvc.perform(get(ADMIN_URL)).andExpect(status().isUnauthorized());
    }
}

package com.example.realestate.ingestion;

import com.example.realestate.security.IngestionApiKeyFilter;
import com.example.realestate.security.UserRoleService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SEC-CRIT-8 security contract tests for IngestionApiKeyFilter.
 *
 * Uses @WebMvcTest so no database or Supabase connection is required.
 * IngestionApiKeyFilter is imported directly as a real bean.
 * A custom TestConfig provides the SecurityFilterChain that inserts the filter
 * before Spring Security's own filter, exactly mirroring JwtConfig's wiring.
 *
 * @TestPropertySource injects app.ingestion.api-key=test-key-abc123 so the filter
 * uses a known key for the duration of the test suite.
 */
@WebMvcTest(
        controllers = IngestionController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({IngestionApiKeySecurityTest.TestConfig.class, IngestionApiKeyFilter.class})
@TestPropertySource(properties = {
        "app.ingestion.api-key=test-key-abc123",
        "cors.allowed-origins=http://localhost:5173"
})
class IngestionApiKeySecurityTest {

    private static final String ENDPOINT = "/api/ingestion/ingest-posts";
    private static final String API_KEY_HEADER = "X-Ingestion-Api-Key";
    private static final String VALID_KEY = "test-key-abc123";

    /**
     * Provides the security filter chain with IngestionApiKeyFilter wired in,
     * and a mocked RawPostRepository/RawPostService for the controller.
     */
    static class TestConfig {

        @Bean
        public SecurityFilterChain testSecurityFilterChain(
                HttpSecurity http,
                IngestionApiKeyFilter ingestionApiKeyFilter) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    // Register the real filter before Spring's own BasicAuthenticationFilter
                    .addFilterBefore(ingestionApiKeyFilter, BasicAuthenticationFilter.class)
                    .authorizeHttpRequests(auth -> auth
                            // permitAll so Spring Security doesn't block it;
                            // auth enforcement is done by IngestionApiKeyFilter
                            .requestMatchers(ENDPOINT).permitAll()
                            .anyRequest().authenticated())
                    .build();
        }

        @Bean
        public RawPostRepository rawPostRepository() {
            return org.mockito.Mockito.mock(RawPostRepository.class);
        }

        @Bean
        public RawPostService rawPostService(RawPostRepository rawPostRepository) {
            return new RawPostService(rawPostRepository);
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private UserRoleService userRoleService;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RawPostRepository rawPostRepository;

    @BeforeEach
    void setUp() {
        reset(rawPostRepository);
        when(rawPostRepository.save(any(RawPost.class))).thenAnswer(inv -> {
            RawPost p = inv.getArgument(0);
            p.setId(UUID.randomUUID());
            return p;
        });
    }

    // ==================== API Key Authentication Tests ====================

    @Test
    void ingestPosts_missingApiKey_returns401() throws Exception {
        mockMvc.perform(post(ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(singlePostBody()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Invalid or missing API key"));
    }

    @Test
    void ingestPosts_wrongApiKey_returns401() throws Exception {
        mockMvc.perform(post(ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(API_KEY_HEADER, "wrong-key")
                        .content(singlePostBody()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error").value("Invalid or missing API key"));
    }

    @Test
    void ingestPosts_correctApiKey_returns202() throws Exception {
        mockMvc.perform(post(ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(API_KEY_HEADER, VALID_KEY)
                        .content(singlePostBody()))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.success").value(true));
    }

    // ==================== Array Cap Tests ====================

    @Test
    void ingestPosts_arrayTooLarge_returns400() throws Exception {
        mockMvc.perform(post(ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(API_KEY_HEADER, VALID_KEY)
                        .content(postsBody(51)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Too many posts. Maximum 50 posts per request."));
    }

    @Test
    void ingestPosts_exactlyFiftyPosts_returns202() throws Exception {
        mockMvc.perform(post(ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(API_KEY_HEADER, VALID_KEY)
                        .content(postsBody(50)))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    void ingestPosts_emptyPosts_returns400() throws Exception {
        String body = """
                {
                    "posts": [],
                    "source_url": "https://facebook.com/groups/test"
                }
                """;
        mockMvc.perform(post(ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(API_KEY_HEADER, VALID_KEY)
                        .content(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("No posts provided"));
    }

    // ==================== Rate Limit Test ====================

    /**
     * Sends 11 requests with the valid API key. The first 10 must succeed (202);
     * the 11th must be rate-limited (429).
     *
     * @DirtiesContext resets the Spring context after this test so the
     * IngestionApiKeyFilter's ConcurrentHashMap (rate limit buckets) is cleared,
     * preventing cross-test bucket state pollution.
     */
    @Test
    @DirtiesContext(methodMode = DirtiesContext.MethodMode.BEFORE_METHOD)
    void ingestPosts_rateLimitExceeded_returns429() throws Exception {
        // First 10 requests must succeed
        for (int i = 0; i < 10; i++) {
            mockMvc.perform(post(ENDPOINT)
                            .contentType(MediaType.APPLICATION_JSON)
                            .header(API_KEY_HEADER, VALID_KEY)
                            .content(singlePostBody()))
                    .andExpect(status().isAccepted());
        }
        // 11th request must be rate-limited
        mockMvc.perform(post(ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(API_KEY_HEADER, VALID_KEY)
                        .content(singlePostBody()))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value(
                        "Rate limit exceeded. Max 10 requests per minute."));
    }

    // ==================== Helpers ====================

    /**
     * Builds a request body with a single valid post (content length > 10 chars).
     */
    private static String singlePostBody() {
        return """
                {
                    "posts": [
                        {
                            "content": "3 BHK house for sale in Manipal, 2400 sqft, price 85 lakhs",
                            "author_name": "Test User",
                            "external_post_id": "sec-test-001",
                            "posted_at": "2026-02-04T10:00:00Z",
                            "images": []
                        }
                    ],
                    "source_url": "https://facebook.com/groups/udupi-realestate",
                    "group_name": "Udupi Real Estate"
                }
                """;
    }

    /**
     * Builds a request body with {@code count} valid posts.
     */
    private static String postsBody(int count) {
        StringBuilder posts = new StringBuilder();
        for (int i = 0; i < count; i++) {
            if (i > 0) posts.append(",\n");
            posts.append(String.format("""
                    {
                        "content": "Property listing number %d with enough content to pass filter",
                        "author_name": "Author %d",
                        "external_post_id": "cap-test-%03d",
                        "posted_at": "2026-02-04T10:00:00Z",
                        "images": []
                    }""", i + 1, i + 1, i + 1));
        }
        return String.format("""
                {
                    "posts": [%s],
                    "source_url": "https://facebook.com/groups/test"
                }
                """, posts);
    }
}

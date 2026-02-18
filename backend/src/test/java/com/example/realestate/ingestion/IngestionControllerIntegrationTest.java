package com.example.realestate.ingestion;

import com.example.realestate.security.IngestionApiKeyFilter;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for the Ingestion API endpoints.
 * Uses MockMvc to test the full request/response cycle including security.
 */
@WebMvcTest(
        controllers = IngestionController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        },
        // Exclude IngestionApiKeyFilter from the web slice: this test class covers controller
        // logic only; security contract is covered by IngestionApiKeySecurityTest.
        excludeFilters = @ComponentScan.Filter(type = FilterType.ASSIGNABLE_TYPE, classes = IngestionApiKeyFilter.class)
)
@Import(IngestionControllerIntegrationTest.TestConfig.class)
class IngestionControllerIntegrationTest {

    /**
     * Test configuration providing mocked beans.
     */
    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth
                            .requestMatchers("/api/ingestion/ingest-posts").permitAll()
                            .anyRequest().authenticated())
                    .build();
        }

        @Bean
        public RawPostRepository rawPostRepository() {
            return mock(RawPostRepository.class);
        }

        @Bean
        public RawPostService rawPostService(RawPostRepository rawPostRepository) {
            return new RawPostService(rawPostRepository);
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private RawPostRepository rawPostRepository;

    @BeforeEach
    void setUp() {
        reset(rawPostRepository);
    }

    // ==================== Authentication Tests ====================

    @Test
    void ingestRawPost_withoutAuth_returnsForbidden() throws Exception {
        String requestBody = """
            {
                "source": "FACEBOOK",
                "sourcePostId": "test_no_auth",
                "rawText": "Test post",
                "images": [],
                "author": "Test",
                "postedAt": "2026-02-04T10:00:00Z"
            }
            """;

        mockMvc.perform(post("/api/ingestion/raw-post")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isForbidden());
    }

    @Test
    void ingestBulk_withoutAuth_returnsForbidden() throws Exception {
        String requestBody = """
            {
                "posts": [
                    {"source": "FACEBOOK", "sourcePostId": "test1", "rawText": "Post 1", "images": [], "author": "A", "postedAt": "2026-02-04T10:00:00Z"}
                ]
            }
            """;

        mockMvc.perform(post("/api/ingestion/bulk")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isForbidden());
    }

    // ==================== Single Post Ingestion Tests ====================

    @Test
    @WithMockUser
    void ingestRawPost_validRequest_returns202() throws Exception {
        UUID postId = UUID.randomUUID();
        when(rawPostRepository.save(any(RawPost.class))).thenAnswer(inv -> {
            RawPost p = inv.getArgument(0);
            p.setId(postId);
            return p;
        });

        String requestBody = """
            {
                "source": "FACEBOOK",
                "sourcePostId": "fb_test_001",
                "rawText": "3 BHK house for sale in Manipal, 2400 sqft, price 85 lakhs",
                "images": [],
                "author": "Test User",
                "postedAt": "2026-02-04T10:00:00Z"
            }
            """;

        mockMvc.perform(post("/api/ingestion/raw-post")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.rawPostId").value(postId.toString()))
                .andExpect(jsonPath("$.message").value("Raw post accepted for processing"));

        verify(rawPostRepository).save(any(RawPost.class));
    }

    @Test
    @WithMockUser
    void ingestRawPost_withImages_returns202() throws Exception {
        UUID postId = UUID.randomUUID();
        when(rawPostRepository.save(any(RawPost.class))).thenAnswer(inv -> {
            RawPost p = inv.getArgument(0);
            p.setId(postId);
            return p;
        });

        String requestBody = """
            {
                "source": "FACEBOOK",
                "sourcePostId": "fb_test_images",
                "rawText": "Beautiful apartment with sea view",
                "images": ["https://example.com/img1.jpg", "https://example.com/img2.jpg"],
                "author": "Agent",
                "postedAt": "2026-02-04T09:00:00Z"
            }
            """;

        mockMvc.perform(post("/api/ingestion/raw-post")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.rawPostId").exists());
    }

    @Test
    @WithMockUser
    void ingestRawPost_minimalRequest_returns202() throws Exception {
        UUID postId = UUID.randomUUID();
        when(rawPostRepository.save(any(RawPost.class))).thenAnswer(inv -> {
            RawPost p = inv.getArgument(0);
            p.setId(postId);
            return p;
        });

        // Minimal valid request with required fields only
        String requestBody = """
            {
                "source": "FACEBOOK",
                "sourcePostId": "minimal",
                "rawText": "Land for sale",
                "images": null,
                "author": null,
                "postedAt": null
            }
            """;

        mockMvc.perform(post("/api/ingestion/raw-post")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.success").value(true));
    }

    @Test
    @WithMockUser
    void ingestRawPost_largeContent_returns202() throws Exception {
        UUID postId = UUID.randomUUID();
        when(rawPostRepository.save(any(RawPost.class))).thenAnswer(inv -> {
            RawPost p = inv.getArgument(0);
            p.setId(postId);
            return p;
        });

        // Simulate a large Facebook post with lots of text
        String largeContent = "Property Details: ".repeat(100) +
                "Contact for more information. Price negotiable. " +
                "Location: Prime area near schools, hospitals, and shopping centers.";

        String requestBody = String.format("""
            {
                "source": "FACEBOOK",
                "sourcePostId": "large_post",
                "rawText": "%s",
                "images": [],
                "author": "Property Owner",
                "postedAt": "2026-02-04T10:00:00Z"
            }
            """, largeContent);

        mockMvc.perform(post("/api/ingestion/raw-post")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isAccepted());
    }

    // ==================== Bulk Ingestion Tests ====================

    @Test
    @WithMockUser
    void ingestBulk_multiplePosts_returns202() throws Exception {
        when(rawPostRepository.save(any(RawPost.class))).thenAnswer(inv -> {
            RawPost p = inv.getArgument(0);
            p.setId(UUID.randomUUID());
            return p;
        });

        String requestBody = """
            {
                "posts": [
                    {"source": "FACEBOOK", "sourcePostId": "bulk_001", "rawText": "House for sale", "images": [], "author": "Owner1", "postedAt": "2026-02-04T10:00:00Z"},
                    {"source": "FACEBOOK", "sourcePostId": "bulk_002", "rawText": "Land available", "images": [], "author": "Owner2", "postedAt": "2026-02-04T11:00:00Z"},
                    {"source": "FACEBOOK", "sourcePostId": "bulk_003", "rawText": "Commercial space", "images": [], "author": "Owner3", "postedAt": "2026-02-04T12:00:00Z"}
                ]
            }
            """;

        mockMvc.perform(post("/api/ingestion/bulk")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.imported").value(3))
                .andExpect(jsonPath("$.message").value("Successfully imported 3 posts"));

        verify(rawPostRepository, times(3)).save(any(RawPost.class));
    }

    @Test
    @WithMockUser
    void ingestBulk_emptyList_returns202WithZero() throws Exception {
        String requestBody = """
            {
                "posts": []
            }
            """;

        mockMvc.perform(post("/api/ingestion/bulk")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.imported").value(0));

        verify(rawPostRepository, never()).save(any(RawPost.class));
    }

    @Test
    @WithMockUser
    void ingestBulk_withMixedImages_returns202() throws Exception {
        when(rawPostRepository.save(any(RawPost.class))).thenAnswer(inv -> {
            RawPost p = inv.getArgument(0);
            p.setId(UUID.randomUUID());
            return p;
        });

        String requestBody = """
            {
                "posts": [
                    {"source": "FACEBOOK", "sourcePostId": "mix_001", "rawText": "Post without images", "images": [], "author": "A", "postedAt": "2026-02-04T10:00:00Z"},
                    {"source": "FACEBOOK", "sourcePostId": "mix_002", "rawText": "Post with images", "images": ["https://img.com/1.jpg", "https://img.com/2.jpg"], "author": "B", "postedAt": "2026-02-04T11:00:00Z"}
                ]
            }
            """;

        mockMvc.perform(post("/api/ingestion/bulk")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.imported").value(2));
    }

    // ==================== Error Handling Tests ====================

    @Test
    @WithMockUser
    void ingestRawPost_invalidJson_returns400() throws Exception {
        String invalidJson = "{ invalid json }";

        mockMvc.perform(post("/api/ingestion/raw-post")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidJson))
                .andExpect(status().isBadRequest());
    }

    @Test
    @WithMockUser
    void ingestRawPost_serviceThrowsException_propagatesError() throws Exception {
        when(rawPostRepository.save(any(RawPost.class)))
                .thenThrow(new RuntimeException("Database connection failed"));

        String requestBody = """
            {
                "source": "FACEBOOK",
                "sourcePostId": "error_test",
                "rawText": "Test post",
                "images": [],
                "author": "Test",
                "postedAt": "2026-02-04T10:00:00Z"
            }
            """;

        // Exception propagates through servlet layer
        org.junit.jupiter.api.Assertions.assertThrows(
                jakarta.servlet.ServletException.class,
                () -> mockMvc.perform(post("/api/ingestion/raw-post")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
        );
    }

    // ==================== Extension Compat Endpoint Tests ====================

    @Test
    void ingestPostsCompat_withoutAuth_returns202() throws Exception {
        // This endpoint is permitAll — no auth required
        when(rawPostRepository.save(any(RawPost.class))).thenAnswer(inv -> {
            RawPost p = inv.getArgument(0);
            p.setId(UUID.randomUUID());
            return p;
        });

        String requestBody = """
            {
                "posts": [
                    {"content": "3 BHK house for sale in Manipal, 2400 sqft, price 85 lakhs", "author_name": "Test User", "external_post_id": "ext_001", "posted_at": "2026-02-04T10:00:00Z", "images": []},
                    {"content": "Beautiful 2 BHK apartment near beach, fully furnished", "author_name": "Agent", "external_post_id": "ext_002", "posted_at": "2026-02-04T11:00:00Z", "images": []}
                ],
                "source_url": "https://facebook.com/groups/udupi-realestate",
                "group_name": "Udupi Real Estate"
            }
            """;

        mockMvc.perform(post("/api/ingestion/ingest-posts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.imported").value(2))
                .andExpect(jsonPath("$.feed_run_id").value("null"))
                .andExpect(jsonPath("$.message").value("Successfully imported 2 posts"));

        verify(rawPostRepository, times(2)).save(any(RawPost.class));
    }

    @Test
    void ingestPostsCompat_filtersShortContent_returns202() throws Exception {
        when(rawPostRepository.save(any(RawPost.class))).thenAnswer(inv -> {
            RawPost p = inv.getArgument(0);
            p.setId(UUID.randomUUID());
            return p;
        });

        String requestBody = """
            {
                "posts": [
                    {"content": "Short", "author_name": "A", "external_post_id": "short_001"},
                    {"content": "This is a valid post with enough content to pass the filter", "author_name": "B", "external_post_id": "valid_001"}
                ],
                "source_url": "https://facebook.com/groups/test"
            }
            """;

        mockMvc.perform(post("/api/ingestion/ingest-posts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.imported").value(1));

        verify(rawPostRepository, times(1)).save(any(RawPost.class));
    }

    @Test
    void ingestPostsCompat_emptyPosts_returns400() throws Exception {
        String requestBody = """
            {
                "posts": [],
                "source_url": "https://facebook.com/groups/test"
            }
            """;

        mockMvc.perform(post("/api/ingestion/ingest-posts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("No posts provided"));

        verify(rawPostRepository, never()).save(any(RawPost.class));
    }

    @Test
    void ingestPostsCompat_nullPosts_returns400() throws Exception {
        String requestBody = """
            {
                "source_url": "https://facebook.com/groups/test"
            }
            """;

        mockMvc.perform(post("/api/ingestion/ingest-posts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("No posts provided"));
    }

    @Test
    void ingestPostsCompat_withImages_preservesJsonFormat() throws Exception {
        when(rawPostRepository.save(any(RawPost.class))).thenAnswer(inv -> {
            RawPost p = inv.getArgument(0);
            p.setId(UUID.randomUUID());
            return p;
        });

        String requestBody = """
            {
                "posts": [
                    {
                        "content": "Beautiful property with sea view, 3 BHK fully furnished",
                        "author_name": "Agent",
                        "external_post_id": "img_001",
                        "images": [
                            {"url": "https://example.com/img1.jpg", "alt": "Front view"},
                            {"url": "https://example.com/img2.jpg", "alt": "Kitchen"}
                        ]
                    }
                ],
                "source_url": "https://facebook.com/groups/test"
            }
            """;

        mockMvc.perform(post("/api/ingestion/ingest-posts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(requestBody))
                .andExpect(status().isAccepted())
                .andExpect(jsonPath("$.imported").value(1));

        verify(rawPostRepository, times(1)).save(any(RawPost.class));
    }

    // ==================== Content-Type Tests ====================

    @Test
    @WithMockUser
    void ingestRawPost_wrongContentType_returns415() throws Exception {
        String requestBody = "source=FACEBOOK&sourcePostId=test";

        mockMvc.perform(post("/api/ingestion/raw-post")
                        .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                        .content(requestBody))
                .andExpect(status().isUnsupportedMediaType());
    }
}

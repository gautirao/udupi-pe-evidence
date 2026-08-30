package com.example.realestate.listing.api;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Testcontainers integration test for #2361: the broker "Archived" tab
 * (GET /api/listings/mine?status=ARCHIVED) must actually surface a listing immediately after it
 * is archived via POST /api/listings/{id}/archive.
 *
 * <p>Root cause this guards against: {@code ListingCrudService.getListingsByOwner()} previously
 * routed status=ARCHIVED through {@code findByCreatedByAndStatusAndArchivedAtIsNull}, but
 * {@code archiveListing()} always sets {@code archived_at} alongside {@code status=ARCHIVED} in
 * the same transaction — so that query's "archived_at IS NULL" predicate could never match an
 * ARCHIVED row. The service-level {@code ListingCrudServiceTest} unit test only proves the
 * correct repository method is *called* against a mocked repository; it cannot catch a real
 * query/serialization/param-name regression. This IT drives both endpoints through the real
 * Spring Security filter chain, the real controller, the real service, and a real Postgres
 * database — no mocked repository — exactly the gap flagged in exact-head review.
 *
 * <p>Auth pattern: mirrors {@code RbacSmokeIT}/{@code ListingImageUploadUrlIT}. The
 * {@code TestJwtDecoderConfig} makes the Bearer token value equal to the UUID subject;
 * {@code DbRoleJwtAuthenticationConverter} then performs a REAL DB lookup against
 * {@code user_roles} to resolve the ROLE_* authority.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.mixed=true",
        "spring.flyway.placeholders.concurrently_keyword=",
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://test.example.com/auth/v1",
        "AI_API_KEY=test-dummy-not-used-in-archived-listings-filter-it",
        "spring.task.scheduling.enabled=false"
})
class BrokerArchivedListingsFilterIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine").asCompatibleSubstituteFor("postgres"));

    @TestConfiguration
    static class TestJwtDecoderConfig {
        @Bean
        @Primary
        public JwtDecoder testJwtDecoder() {
            return token -> Jwt.withTokenValue(token)
                    .header("alg", "none")
                    .subject(token)
                    .issuedAt(Instant.now())
                    .expiresAt(Instant.now().plusSeconds(3600))
                    .build();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ListingRepository listingRepository;

    private static final UUID OWNER_ID = UUID.fromString("23610001-0000-0000-0000-000000000001");

    private UUID listingId;

    @BeforeEach
    void setUp() {
        jdbc.update(
                "INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                OWNER_ID, "it-2361-" + OWNER_ID + "@test.local");
        jdbc.update(
                "INSERT INTO public.user_roles (user_id, role) VALUES (?, CAST(? AS public.app_role)) "
                        + "ON CONFLICT (user_id, role) DO NOTHING",
                OWNER_ID, "dealer");

        OffsetDateTime now = OffsetDateTime.now();
        Listing listing = new Listing();
        listing.setCreatedBy(OWNER_ID);
        listing.setStatus(ListingStatus.LIVE.toDbValue());
        listing.setPropertyType("house");
        listing.setTitle("IT-2361-ArchivedTabFilter");
        listing.setCreatedAt(now);
        listing.setUpdatedAt(now);
        listingId = listingRepository.saveAndFlush(listing).getId();
    }

    @AfterEach
    void cleanUp() {
        // archive() writes a listing_status_history row (fk_lsh_listing) — delete it first.
        jdbc.update("DELETE FROM public.listing_status_history WHERE listing_id = ?", listingId);
        jdbc.update("DELETE FROM public.property_listings WHERE id = ?", listingId);
        jdbc.update("DELETE FROM auth.users WHERE id = ?", OWNER_ID);
    }

    @Test
    @DisplayName("#2361: archived listing appears under GET /api/listings/mine?status=ARCHIVED "
            + "immediately after POST /api/listings/{id}/archive (real controller, real DB, no mocks)")
    void archiveThenQueryArchivedTab_realHttpRoundTrip_returnsTheArchivedListing() throws Exception {
        // Sanity: before archiving, the Archived tab must NOT show this LIVE listing.
        mockMvc.perform(get("/api/listings/mine")
                        .param("status", "ARCHIVED")
                        .header("Authorization", "Bearer " + OWNER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id=='" + listingId + "')]").doesNotExist());

        // Archive via the real endpoint (real ListingWorkflowService, real DB write).
        mockMvc.perform(post("/api/listings/" + listingId + "/archive")
                        .header("Authorization", "Bearer " + OWNER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ARCHIVED"));

        // The Archived tab's real query must now surface it.
        mockMvc.perform(get("/api/listings/mine")
                        .param("status", "ARCHIVED")
                        .header("Authorization", "Bearer " + OWNER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id=='" + listingId + "')].status")
                        .value("ARCHIVED"));

        // No regression: the "All" tab (no status filter) must still exclude archived listings.
        mockMvc.perform(get("/api/listings/mine")
                        .header("Authorization", "Bearer " + OWNER_ID))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id=='" + listingId + "')]").doesNotExist());
    }
}

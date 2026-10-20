package com.example.realestate.trust;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.storage.SupabaseStorageService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * #2859 B1 (TIR3.2, TIR6-a.2 persistence, TIR7-b) — replaces the phantom TrustIdentityReviewIT of
 * e2e/journey/trust-identity-review.spec.ts with a real round trip on Testcontainers Postgres:
 * owner submit-evidence -> evidence row + IDENTITY dimension PENDING (re-read from the DB) -> trust-progress PENDING
 * -> a non-admin approve is refused (state unchanged) -> admin approve -> evidence APPROVED + IDENTITY EARNED
 * (re-read from the DB) -> trust-progress IDENTITY EARNED.
 *
 * <p>Real: the Spring Security filter chain, DbRoleJwtAuthenticationConverter (roles from {@code user_roles}),
 * TrustController, AdminTrustController, BadgeService, the JPA repositories, Flyway migrations.
 * Mocked: {@link SupabaseStorageService} only (isEnabled() == false), so NO network call is made and the evidence
 * stores the {@code storage-disabled://} sentinel path. Auth: the bearer token value is the user UUID
 * (TestJwtDecoderConfig, precedent BrokerArchivedListingsFilterIT / RbacSmokeIT).
 *
 * <p>UNTAGGED on purpose: apps/api/pom.xml surefire excludes {@code @Tag("integration")}; this class runs under
 * {@code mvn -f apps/api/pom.xml test -Dtest=TrustIdentityApprovalIT}. Without Docker it is skipped
 * ({@code disabledWithoutDocker}) — cite it only with surefire XML showing tests>0 and skipped=0.
 * Synthetic identity values only; no signed URL is ever produced.
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
        "AI_API_KEY=test-dummy-not-used-in-trust-identity-approval-it",
        "spring.task.scheduling.enabled=false",
        "supabase.storage.enabled=false"
})
class TrustIdentityApprovalIT {

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

    private static final UUID OWNER_ID = UUID.fromString("28590001-0000-0000-0000-000000000001");
    private static final UUID ADMIN_ID = UUID.fromString("28590002-0000-0000-0000-000000000002");

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private ObjectMapper objectMapper;
    @Autowired
    private ListingRepository listingRepository;
    @Autowired
    private IdentityEvidenceRepository identityEvidenceRepository;
    @Autowired
    private ListingVerificationDimensionRepository dimensionRepository;

    /** Mocked so no storage call can leave the loopback test; isEnabled() defaults to false. */
    @MockitoBean
    private SupabaseStorageService supabaseStorageService;

    private UUID listingId;

    @BeforeEach
    void seed() {
        // auth.users insert fires handle_new_user() (V0.1): creates the profiles row + the 'user' role.
        jdbc.update("INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                OWNER_ID, "it-2859-owner@test.local");
        jdbc.update("INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                ADMIN_ID, "it-2859-admin@test.local");
        jdbc.update("INSERT INTO public.user_roles (user_id, role) VALUES (?, CAST(? AS public.app_role)) "
                + "ON CONFLICT (user_id, role) DO NOTHING", OWNER_ID, "dealer");
        jdbc.update("INSERT INTO public.user_roles (user_id, role) VALUES (?, CAST(? AS public.app_role)) "
                + "ON CONFLICT (user_id, role) DO NOTHING", ADMIN_ID, "admin");

        OffsetDateTime now = OffsetDateTime.now();
        Listing listing = new Listing();
        listing.setCreatedBy(OWNER_ID);
        listing.setStatus(ListingStatus.LIVE.toDbValue());
        listing.setPropertyType("house");
        listing.setSellerType("broker");
        listing.setTitle("IT-2859-TrustIdentityApproval");
        listing.setCreatedAt(now);
        listing.setUpdatedAt(now);
        listingId = listingRepository.saveAndFlush(listing).getId();
        // No @AfterEach cleanup: one test, and the container is discarded with the class.
    }

    private String identityStateFromTrustProgress() throws Exception {
        MvcResult res = mockMvc.perform(get("/api/listings/" + listingId + "/trust-progress")
                        .header("Authorization", "Bearer " + OWNER_ID))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode badges = objectMapper.readTree(res.getResponse().getContentAsString()).get("badges");
        for (JsonNode b : badges) {
            if ("IDENTITY".equals(b.get("dimensionType").asText())) {
                return b.get("badgeState").asText();
            }
        }
        throw new AssertionError("no IDENTITY badge in trust-progress: " + badges);
    }

    private String identityStateFromDb() {
        return dimensionRepository.findByListingIdAndDimensionType(listingId, "IDENTITY")
                .map(ListingVerificationDimension::getBadgeState)
                .orElse("<no row>");
    }

    @Test
    @DisplayName("#2859 submit-evidence -> PENDING (DB + trust-progress) -> non-admin approve refused -> admin approve -> APPROVED + IDENTITY EARNED (DB + trust-progress)")
    void submitThenAdminApprove_identityBecomesEarned_endToEndOnRealDb() throws Exception {
        // ── before: nothing submitted ────────────────────────────────────────────────────────
        assertThat(identityStateFromTrustProgress()).isEqualTo("AVAILABLE");
        assertThat(identityStateFromDb()).isEqualTo("<no row>");

        // ── step 1 (TIR3.2): owner submits identity evidence ────────────────────────────────
        MockMultipartFile file = new MockMultipartFile("file", "synthetic-id-2859.pdf", "application/pdf",
                "%PDF-1.4 synthetic 2859".getBytes(StandardCharsets.US_ASCII));
        MvcResult submit = mockMvc.perform(multipart("/api/listings/" + listingId + "/trust/identity/submit-evidence")
                        .file(file)
                        .param("legal_name", "Test Owner Name")
                        .param("phone_number", "+91 00000 02859")
                        .param("document_type", "AADHAAR")
                        .header("Authorization", "Bearer " + OWNER_ID))
                .andExpect(status().isOk())
                .andReturn();
        UUID evidenceId = UUID.fromString(objectMapper.readTree(submit.getResponse().getContentAsString())
                .get("evidenceId").asText());

        IdentityEvidence pending = identityEvidenceRepository.findById(evidenceId).orElseThrow();
        assertThat(pending.getReviewState()).isEqualTo("PENDING");
        assertThat(pending.getListingId()).isEqualTo(listingId);
        assertThat(pending.getProfileId()).isEqualTo(OWNER_ID);
        assertThat(pending.getDocumentType()).isEqualTo("AADHAAR");
        assertThat(pending.getDocumentUrl()).startsWith(SupabaseStorageService.STORAGE_DISABLED_SENTINEL_PREFIX);
        assertThat(identityStateFromDb()).isEqualTo("PENDING");
        assertThat(identityStateFromTrustProgress()).isEqualTo("PENDING");

        // ── a non-admin (the owner, role dealer) cannot approve; nothing changes ────────────
        mockMvc.perform(post("/api/admin/trust/identity/" + evidenceId + "/approve")
                        .header("Authorization", "Bearer " + OWNER_ID))
                .andExpect(status().isForbidden());
        assertThat(identityEvidenceRepository.findById(evidenceId).orElseThrow().getReviewState()).isEqualTo("PENDING");
        assertThat(identityStateFromDb()).isEqualTo("PENDING");

        // ── step 2 (TIR6-a.2): admin approves ────────────────────────────────────────────────
        mockMvc.perform(post("/api/admin/trust/identity/" + evidenceId + "/approve")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(status().isOk());

        IdentityEvidence approved = identityEvidenceRepository.findById(evidenceId).orElseThrow();
        assertThat(approved.getReviewState()).isEqualTo("APPROVED");
        assertThat(approved.getReviewedBy()).isEqualTo(ADMIN_ID);
        assertThat(approved.getReviewedAt()).isNotNull();
        assertThat(identityStateFromDb()).isEqualTo("EARNED");

        // ── step 3 (TIR7-b): the owner's trust-progress now reports IDENTITY EARNED ──────────
        assertThat(identityStateFromTrustProgress()).isEqualTo("EARNED");
    }
}

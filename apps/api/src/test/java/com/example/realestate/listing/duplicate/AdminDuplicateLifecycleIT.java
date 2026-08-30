package com.example.realestate.listing.duplicate;

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

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Testcontainers integration test (real Postgres + the REAL Spring Security filter chain) for
 * {@link AdminDuplicateController}'s duplicate-candidate review lifecycle (#1713 D8-5).
 *
 * <p>Mirrors {@code AdminCityLaunchPreviewControllerIT}'s pattern: a no-op {@link JwtDecoder}
 * whose token value IS the JWT subject, so {@code DbRoleJwtAuthenticationConverter} performs a
 * REAL {@code user_roles} DB lookup — exercising the actual {@code caller.isAdmin()} authz gate
 * in {@link AdminDuplicateController} end-to-end (no mocked authorization layer).
 *
 * <p>Covers two things NOT proven by any existing mocked {@code *Test} in this package:
 * <ol>
 *   <li>The full admin lifecycle chain PENDING → CONFIRMED → (undo) PENDING → DISMISSED
 *       actually PERSISTS across each transition (verified via a direct JDBC read, not the
 *       Hibernate first-level cache / the controller's mocked response).</li>
 *   <li>A non-admin authenticated caller gets a real HTTP 403 from confirm/undo/dismiss, and the
 *       candidate row is verifiably untouched afterward (still its pre-request status).</li>
 * </ol>
 *
 * <p><b>Scope note (D8-5 honesty requirement):</b> this IT does NOT replace every behaviour in
 * {@code e2e/journey/admin-duplicates.spec.ts}, and the split is by LAYER, not by AC number — do
 * not read "AD2/AD3/AD4" as fully replaced just because they are not named below.
 * <ul>
 *   <li><b>Replaced</b> (backend layer): the persisted status transitions asserted by AD2/AD3/AD4
 *       — PENDING → CONFIRMED → (undo) PENDING → DISMISSED — verified here via direct JDBC reads;
 *       plus non-admin 403 authz coverage on confirm/undo/dismiss, which the E2E spec never
 *       asserted at all.</li>
 *   <li><b>NOT replaced</b> (UI layer, still only covered by the E2E spec): AD2/AD3/AD4's
 *       UI-rendering half — the toast firing ("Duplicate confirmed" / "Review undone" /
 *       "Candidate dismissed") and the badge label / Undo-Confirm-Dismiss button visibility
 *       re-rendering after each transition — plus AD1 (page render / error boundary) and AD5
 *       (pagination of the admin queue), which have no backend equivalent here at all.</li>
 * </ul>
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
        "AI_API_KEY=test-dummy-not-used-in-admin-duplicate-lifecycle-it",
        "spring.task.scheduling.enabled=false"
})
class AdminDuplicateLifecycleIT {

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

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ListingRepository listingRepository;
    @Autowired private DuplicateCandidateRepository candidateRepository;

    private static final UUID ADMIN_ID = UUID.fromString("17130501-0000-0000-0000-000000000001");
    private static final UUID BUYER_ID = UUID.fromString("17130502-0000-0000-0000-000000000002");

    private UUID listingAId;
    private UUID listingBId;

    @BeforeEach
    void setUp() {
        seedRole(ADMIN_ID, "admin");
        seedRole(BUYER_ID, "user");

        // listingB is deliberately created after listingA so DuplicateCandidateService's
        // "newer listing gets archived" tie-break resolves to listingB — asserted below.
        OffsetDateTime now = OffsetDateTime.now();
        listingAId = seedListing(ListingStatus.LIVE.toDbValue(), now.minusDays(2));
        listingBId = seedListing(ListingStatus.LIVE.toDbValue(), now.minusDays(1));
    }

    @AfterEach
    void cleanup() {
        jdbc.update("DELETE FROM public.duplicate_candidates WHERE listing_id_a IN (?, ?) OR listing_id_b IN (?, ?)",
                listingAId, listingBId, listingAId, listingBId);
        jdbc.update("DELETE FROM public.property_listings WHERE id IN (?, ?)", listingAId, listingBId);
        jdbc.update("DELETE FROM public.user_roles WHERE user_id IN (?, ?)", ADMIN_ID, BUYER_ID);
        jdbc.update("DELETE FROM auth.users WHERE id IN (?, ?)", ADMIN_ID, BUYER_ID);
    }

    private void seedRole(UUID userId, String role) {
        jdbc.update(
                "INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                userId, "adl-it-" + userId + "@test.local");
        jdbc.update(
                "INSERT INTO public.user_roles (user_id, role) VALUES (?, CAST(? AS public.app_role)) "
                        + "ON CONFLICT (user_id, role) DO NOTHING",
                userId, role);
    }

    private UUID seedListing(String status, OffsetDateTime createdAt) {
        Listing listing = new Listing();
        listing.setStatus(status);
        listing.setPropertyType("house");
        listing.setCreatedAt(createdAt);
        listing.setUpdatedAt(createdAt);
        return listingRepository.saveAndFlush(listing).getId();
    }

    private UUID seedCandidate(DuplicateCandidateStatus status) {
        DuplicateCandidate candidate = new DuplicateCandidate();
        candidate.setListingIdA(listingAId);
        candidate.setListingIdB(listingBId);
        candidate.setSimilarityScore(new BigDecimal("0.95"));
        candidate.setDistanceMeters(new BigDecimal("12.50"));
        candidate.setStatus(status);
        return candidateRepository.saveAndFlush(candidate).getId();
    }

    private String adminAuth() {
        return "Bearer " + ADMIN_ID;
    }

    private String buyerAuth() {
        return "Bearer " + BUYER_ID;
    }

    private String candidateStatus(UUID candidateId) {
        return jdbc.queryForObject(
                "SELECT status FROM public.duplicate_candidates WHERE id = ?", String.class, candidateId);
    }

    // =========================================================================================
    // Admin lifecycle chain — PENDING -> CONFIRMED -> (undo) PENDING -> DISMISSED
    // =========================================================================================

    @Test
    @DisplayName("Admin lifecycle: confirm -> undo -> dismiss persists each transition (AD2/AD4/AD3)")
    void adminLifecycle_confirmThenUndoThenDismiss_persistsEachTransition() throws Exception {
        UUID candidateId = seedCandidate(DuplicateCandidateStatus.PENDING);

        // ── Confirm: PENDING -> CONFIRMED, newer listing (B) archived ──
        mockMvc.perform(post("/api/admin/duplicates/{id}/confirm", candidateId)
                        .header("Authorization", adminAuth()))
                .andExpect(status().isOk());

        assertThat(candidateStatus(candidateId)).isEqualTo("CONFIRMED");
        UUID reviewedByAfterConfirm = jdbc.queryForObject(
                "SELECT reviewed_by FROM public.duplicate_candidates WHERE id = ?", UUID.class, candidateId);
        assertThat(reviewedByAfterConfirm).isEqualTo(ADMIN_ID);

        String listingBStatusAfterConfirm = jdbc.queryForObject(
                "SELECT status FROM public.property_listings WHERE id = ?", String.class, listingBId);
        Boolean listingBDuplicateAfterConfirm = jdbc.queryForObject(
                "SELECT is_duplicate FROM public.property_listings WHERE id = ?", Boolean.class, listingBId);
        assertThat(listingBStatusAfterConfirm).isEqualTo(ListingStatus.ARCHIVED.toDbValue());
        assertThat(listingBDuplicateAfterConfirm).isTrue();

        // ── Undo: CONFIRMED -> PENDING, archived listing restored ──
        mockMvc.perform(post("/api/admin/duplicates/{id}/undo", candidateId)
                        .header("Authorization", adminAuth()))
                .andExpect(status().isOk());

        assertThat(candidateStatus(candidateId)).isEqualTo("PENDING");
        UUID reviewedByAfterUndo = jdbc.queryForObject(
                "SELECT reviewed_by FROM public.duplicate_candidates WHERE id = ?", UUID.class, candidateId);
        assertThat(reviewedByAfterUndo).isNull();

        String listingBStatusAfterUndo = jdbc.queryForObject(
                "SELECT status FROM public.property_listings WHERE id = ?", String.class, listingBId);
        assertThat(listingBStatusAfterUndo).isEqualTo(ListingStatus.LIVE.toDbValue());

        // ── Dismiss: PENDING -> DISMISSED ──
        mockMvc.perform(post("/api/admin/duplicates/{id}/dismiss", candidateId)
                        .header("Authorization", adminAuth()))
                .andExpect(status().isOk());

        assertThat(candidateStatus(candidateId)).isEqualTo("DISMISSED");
        UUID reviewedByAfterDismiss = jdbc.queryForObject(
                "SELECT reviewed_by FROM public.duplicate_candidates WHERE id = ?", UUID.class, candidateId);
        assertThat(reviewedByAfterDismiss).isEqualTo(ADMIN_ID);
    }

    // =========================================================================================
    // Non-admin authorization — real 403, no persisted state change
    // =========================================================================================

    @Test
    @DisplayName("Non-admin confirm -> 403, candidate stays PENDING")
    void nonAdminConfirm_returns403_candidateStaysPending() throws Exception {
        UUID candidateId = seedCandidate(DuplicateCandidateStatus.PENDING);

        mockMvc.perform(post("/api/admin/duplicates/{id}/confirm", candidateId)
                        .header("Authorization", buyerAuth()))
                .andExpect(status().isForbidden());

        assertThat(candidateStatus(candidateId)).isEqualTo("PENDING");
    }

    @Test
    @DisplayName("Non-admin dismiss -> 403, candidate stays PENDING")
    void nonAdminDismiss_returns403_candidateStaysPending() throws Exception {
        UUID candidateId = seedCandidate(DuplicateCandidateStatus.PENDING);

        mockMvc.perform(post("/api/admin/duplicates/{id}/dismiss", candidateId)
                        .header("Authorization", buyerAuth()))
                .andExpect(status().isForbidden());

        assertThat(candidateStatus(candidateId)).isEqualTo("PENDING");
    }

    @Test
    @DisplayName("Non-admin undo -> 403, candidate stays CONFIRMED")
    void nonAdminUndo_returns403_candidateStaysConfirmed() throws Exception {
        UUID candidateId = seedCandidate(DuplicateCandidateStatus.CONFIRMED);

        mockMvc.perform(post("/api/admin/duplicates/{id}/undo", candidateId)
                        .header("Authorization", buyerAuth()))
                .andExpect(status().isForbidden());

        assertThat(candidateStatus(candidateId)).isEqualTo("CONFIRMED");
    }
}

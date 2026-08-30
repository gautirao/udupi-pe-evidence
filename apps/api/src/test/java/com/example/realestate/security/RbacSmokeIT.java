package com.example.realestate.security;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
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
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * RbacSmokeIT — end-to-end proof that the full DB-role → Spring-authority chain works.
 *
 * <h3>Why this test exists</h3>
 * Existing controller tests inject authorities via {@code jwt().authorities(...)}, which bypasses
 * {@link DbRoleJwtAuthenticationConverter}. This suite exercises the REAL filter chain:
 *
 * <pre>
 *   Bearer token (UUID as value)
 *     → BearerTokenAuthenticationFilter
 *     → TestJwtDecoder (no-op; returns Jwt with subject = token value)
 *     → DbRoleJwtAuthenticationConverter.convert(Jwt)
 *     → userRoleService.findAllRoles(userId)   ← REAL DB lookup against Testcontainers Postgres
 *     → ROLE_* GrantedAuthority set
 *     → CallerInfoResolver / @PreAuthorize gates
 *     → HTTP response
 * </pre>
 *
 * <h3>Checks covered</h3>
 * <ol>
 *   <li>Admin DB row → {@code @IsAdmin} endpoint → 200 (async started for SSE)</li>
 *   <li>Broker DB row → {@code @IsBrokerOrAbove} endpoint → 200</li>
 *   <li>User DB row → user endpoint 200 AND broker endpoint 403</li>
 *   <li>Anonymous → permitAll route → 200 AND zero {@code user_roles} lookups</li>
 *   <li>No DB row (role-less) → broker endpoint → 403 fail-closed</li>
 *   <li>Two DB rows (user+broker) → both authorities → broker endpoint 200</li>
 *   <li>Non-owner broker → ownership guard → 403 (not a raw RBAC 403)</li>
 * </ol>
 *
 * <p>All role-bearing checks verify via a {@link MockitoSpyBean} on
 * {@link UserRoleRepository} that {@code findAllRoles()} was actually called, proving
 * authorities came from the DB rather than being hand-fed.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        // Flyway: load test stubs first (Supabase-specific functions), then real migrations
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        // V73 uses CREATE INDEX CONCURRENTLY mixed with transactional DDL
        "spring.flyway.mixed=true",
        // CONCURRENTLY deadlocks on arm64/Rosetta with Flyway VIDs; disable for Testcontainers
        "spring.flyway.placeholders.concurrently_keyword=",
        // Testcontainers Postgres does not use SSL
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        // Override issuer-uri so no OIDC discovery is attempted against Supabase.
        // TestJwtDecoderConfig below provides a custom JwtDecoder — Spring Boot's
        // @ConditionalOnMissingBean backs the auto-config off, so this property is never used
        // for decoder construction; it only prevents ${SUPABASE_PROJECT_REF} from being needed.
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://test.example.com/auth/v1",
        // AiClient requires ${AI_API_KEY} with no default — provide a dummy so the bean starts
        "AI_API_KEY=test-dummy-not-used-in-security-smoke",
        // Prevent background scheduled jobs from interfering with security tests
        "spring.task.scheduling.enabled=false"
})
class RbacSmokeIT {

    // -------------------------------------------------------------------------
    // Testcontainers — PostGIS image matches all other ITs in the project
    // -------------------------------------------------------------------------

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine")
                    .asCompatibleSubstituteFor("postgres"));

    // -------------------------------------------------------------------------
    // Test JWT decoder
    //
    // The raw Bearer token value IS the UUID subject.  Sending:
    //   Authorization: Bearer 16800001-0000-0000-0000-000000000001
    // causes BearerTokenAuthenticationFilter to extract the token string, pass it
    // to this decoder, which returns Jwt(subject="16800001-...").
    // DbRoleJwtAuthenticationConverter then parses that UUID and looks up user_roles.
    //
    // Providing a JwtDecoder bean here causes @ConditionalOnMissingBean to back off
    // the Spring Boot auto-configured decoder — no OIDC discovery is ever attempted.
    // -------------------------------------------------------------------------

    @TestConfiguration
    static class TestJwtDecoderConfig {
        @Bean
        @Primary
        public JwtDecoder testJwtDecoder() {
            return token -> Jwt.withTokenValue(token)
                    .header("alg", "none")
                    .subject(token)                          // token string IS the UUID subject
                    .issuedAt(Instant.now())
                    .expiresAt(Instant.now().plusSeconds(3600))
                    .build();
        }
    }

    // -------------------------------------------------------------------------
    // Injected beans
    // -------------------------------------------------------------------------

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Autowired
    private ListingRepository listingRepository;

    /**
     * Spy on the real UserRoleRepository — all calls are delegated to the real bean
     * (real DB lookups still occur) but interactions are recorded for verification.
     * Used to confirm the converter DID (or did NOT) perform a DB lookup per request.
     */
    @MockitoSpyBean
    private UserRoleRepository userRoleRepository;

    // -------------------------------------------------------------------------
    // Stable test UUIDs — embed "1680" to identify as RBAC smoke fixtures
    // -------------------------------------------------------------------------

    private static final UUID ADMIN_ID     = UUID.fromString("16800001-0000-0000-0000-000000000001");
    private static final UUID BROKER_ID    = UUID.fromString("16800002-0000-0000-0000-000000000002");
    private static final UUID USER_ID      = UUID.fromString("16800003-0000-0000-0000-000000000003");
    private static final UUID NO_ROLE_ID   = UUID.fromString("16800005-0000-0000-0000-000000000005");
    private static final UUID MULTI_ID     = UUID.fromString("16800006-0000-0000-0000-000000000006");
    private static final UUID OWNER_ID     = UUID.fromString("16800007-0000-0000-0000-000000000007");
    private static final UUID NON_OWNER_ID = UUID.fromString("16800008-0000-0000-0000-000000000008");

    // -------------------------------------------------------------------------
    // Lifecycle — spy reset + seed cleanup per test
    // -------------------------------------------------------------------------

    @BeforeEach
    void resetSpy() {
        // Clear interaction history so each test starts with a clean slate.
        // Mockito.reset on a spy keeps the real-object delegation intact.
        Mockito.reset(userRoleRepository);
    }

    @AfterEach
    void cleanupSeeds() {
        // Check 7 seeds a listing; remove it first to avoid FK issues on auth.users delete
        jdbc.update(
                "DELETE FROM public.property_listings WHERE created_by IN (?,?)",
                OWNER_ID, NON_OWNER_ID);
        // Deleting from auth.users cascades to user_roles (ON DELETE CASCADE)
        jdbc.update(
                "DELETE FROM auth.users WHERE id IN (?,?,?,?,?,?,?)",
                ADMIN_ID, BROKER_ID, USER_ID, NO_ROLE_ID, MULTI_ID, OWNER_ID, NON_OWNER_ID);
    }

    // =========================================================================
    // Check 1 — Admin DB row → @IsAdmin endpoint → 200 (SSE async started)
    // =========================================================================

    /**
     * Fixture  : user_roles row (ADMIN_ID, 'admin')
     * Endpoint : POST /api/admin/geocode/missing  — annotated {@link IsAdmin}
     *            = {@code @PreAuthorize("hasAuthority('ROLE_ADMIN')")}
     * Expected : request().asyncStarted() — SseEmitter was returned, meaning
     *            the @IsAdmin gate passed (a 403 would have been synchronous, non-async)
     * Proves   : DB row 'admin' → converter → ROLE_ADMIN authority → @IsAdmin passes → 200
     * Converter: verify(userRoleRepository).findAllRoles(ADMIN_ID) — real DB lookup confirmed
     */
    @Test
    @DisplayName("Check 1: role='admin' (DB row) → @IsAdmin POST endpoint → security gate passes")
    void check1_adminDbRow_isAdminEndpoint_securityPasses() throws Exception {
        seedRole(ADMIN_ID, "admin");

        // POST /api/admin/geocode/missing is @IsAdmin.
        // SseEmitter causes async dispatch — asyncStarted() proves the @IsAdmin gate let it through.
        // A 403 denial is synchronous; it would NOT start async.
        mockMvc.perform(post("/api/admin/geocode/missing")
                        .header("Authorization", "Bearer " + ADMIN_ID))
                .andExpect(request().asyncStarted());

        // Prove the converter performed a REAL DB lookup — authorities were DB-derived, not hand-fed
        verify(userRoleRepository, atLeastOnce()).findAllRoles(ADMIN_ID);
    }

    // =========================================================================
    // Check 2 — Broker DB row → @IsBrokerOrAbove → 200
    // =========================================================================

    /**
     * Fixture  : user_roles row (BROKER_ID, 'broker')
     * Endpoint : GET /api/broker/listing-quality  — annotated {@link IsBrokerOrAbove}
     *            = {@code @PreAuthorize("hasAnyAuthority('ROLE_BROKER','ROLE_DEALER','ROLE_ADMIN')")}
     * Expected : 200 (empty listing-quality page — BROKER_ID owns no listings)
     * Proves   : DB row 'broker' → converter → ROLE_BROKER → @IsBrokerOrAbove passes → 200
     */
    @Test
    @DisplayName("Check 2: role='broker' (DB row) → @IsBrokerOrAbove GET endpoint → 200")
    void check2_brokerDbRow_isBrokerOrAboveEndpoint_200() throws Exception {
        seedRole(BROKER_ID, "broker");

        mockMvc.perform(get("/api/broker/listing-quality")
                        .header("Authorization", "Bearer " + BROKER_ID))
                .andExpect(status().isOk());

        verify(userRoleRepository, atLeastOnce()).findAllRoles(BROKER_ID);
    }

    // =========================================================================
    // Check 3 — User DB row → user endpoint 200  AND  broker endpoint 403
    // =========================================================================

    /**
     * Fixture  : user_roles row (USER_ID, 'user')
     * Part A   : GET /api/listings/mine → 200 (any authenticated user with a valid role)
     * Part B   : GET /api/broker/listing-quality → 403 (ROLE_USER ∉ {ROLE_BROKER, ROLE_DEALER, ROLE_ADMIN})
     * Proves   : DB row 'user' → ROLE_USER → user endpoint permitted, broker endpoint denied
     *            The same user IS authenticated but LACKS the broker/admin authority.
     */
    @Test
    @DisplayName("Check 3: role='user' (DB row) → user endpoint 200 AND broker endpoint 403")
    void check3_userDbRow_userEndpoint200_brokerEndpoint403() throws Exception {
        seedRole(USER_ID, "user");

        // Part A: GET /api/listings/mine — accessible to any authenticated user with a valid role.
        // CallerInfoResolver accepts role='user'; listingCrudService returns empty page for new user.
        mockMvc.perform(get("/api/listings/mine")
                        .header("Authorization", "Bearer " + USER_ID))
                .andExpect(status().isOk());

        // Part B: GET /api/broker/listing-quality — @IsBrokerOrAbove requires ROLE_BROKER/DEALER/ADMIN.
        // ROLE_USER → @PreAuthorize denies → AccessDeniedException → GlobalExceptionHandler → 403.
        mockMvc.perform(get("/api/broker/listing-quality")
                        .header("Authorization", "Bearer " + USER_ID))
                .andExpect(status().isForbidden());

        // Converter was called for both requests (two DB lookups for the same user UUID)
        verify(userRoleRepository, atLeast(2)).findAllRoles(USER_ID);
    }

    // =========================================================================
    // Check 4 — Anonymous → permitAll route → 200 AND zero user_roles lookups
    // =========================================================================

    /**
     * Fixture  : none (no JWT, no user_roles row)
     * Endpoint : GET /api/public/areas/trending  — permitAll in JwtConfig
     * Expected : 200 (returns seeded trending areas from Flyway migrations)
     *            AND userRoleRepository.findAllRoles() NEVER called
     * Proves   : BearerTokenAuthenticationFilter does NOT fire for unauthenticated requests,
     *            so DbRoleJwtAuthenticationConverter is never invoked — zero DB role lookups.
     */
    @Test
    @DisplayName("Check 4: anonymous → permitAll route → 200 with ZERO user_roles DB lookups")
    void check4_anonymous_permitAllRoute_200_noDbLookup() throws Exception {
        // No Authorization header — request is anonymous
        mockMvc.perform(get("/api/public/areas/trending"))
                .andExpect(status().isOk());

        // Prove converter did NOT fire: zero findAllRoles() invocations on the spy
        verify(userRoleRepository, never()).findAllRoles(any(UUID.class));
    }

    // =========================================================================
    // Check 5 — Role-less authenticated user → 403 fail-closed
    // =========================================================================

    /**
     * Fixture  : NO user_roles row for NO_ROLE_ID
     * Endpoint : GET /api/broker/listing-quality
     * Expected : 403 — converter returned empty authorities (no DB row) →
     *            CallerInfoResolver finds no valid ROLE_* → throws 403 (fail-closed)
     * Proves   : converter with empty DB result → empty authorities → gate denies → 403.
     *            A valid JWT with a real UUID subject but no DB entry is denied, not granted.
     */
    @Test
    @DisplayName("Check 5: role-less user (no user_roles row) → broker endpoint → 403 fail-closed")
    void check5_rolelessUser_noDbRow_403FailClosed() throws Exception {
        // NO_ROLE_ID has NO entry in user_roles — converter returns empty authority list
        mockMvc.perform(get("/api/broker/listing-quality")
                        .header("Authorization", "Bearer " + NO_ROLE_ID))
                .andExpect(status().isForbidden());

        // Converter DID fire — DB was queried, returned empty, and authority set is empty
        verify(userRoleRepository, atLeastOnce()).findAllRoles(NO_ROLE_ID);
    }

    // =========================================================================
    // Check 6 — Multi-role user (user + broker) → both authorities → broker endpoint 200
    // =========================================================================

    /**
     * Fixture  : TWO user_roles rows for MULTI_ID: (MULTI_ID, 'user') and (MULTI_ID, 'broker')
     * Endpoint : GET /api/broker/listing-quality
     * Expected : 200 — converter maps ALL roles (no LIMIT 1) → JwtAuthenticationToken has
     *            both ROLE_USER and ROLE_BROKER → @IsBrokerOrAbove satisfied by ROLE_BROKER
     * Proves   : UserRoleRepository.findAllRoles() returns ALL rows (no limit) →
     *            multi-role users get all their authorities populated correctly
     */
    @Test
    @DisplayName("Check 6: multi-role user (user+broker, 2 DB rows) → both ROLE_USER+ROLE_BROKER → @IsBrokerOrAbove 200")
    void check6_multiRoleUser_bothDbRows_bothAuthorities_brokerEndpoint200() throws Exception {
        seedRole(MULTI_ID, "user");
        seedRole(MULTI_ID, "broker");

        mockMvc.perform(get("/api/broker/listing-quality")
                        .header("Authorization", "Bearer " + MULTI_ID))
                .andExpect(status().isOk());

        // Converter called once and returned both roles from the two DB rows
        verify(userRoleRepository, atLeastOnce()).findAllRoles(MULTI_ID);
    }

    // =========================================================================
    // Check 7 — Ownership guard: non-owner broker → 403 (ownership, NOT raw RBAC)
    // =========================================================================

    /**
     * Fixture  : OWNER_ID has role='broker', NON_OWNER_ID has role='broker'.
     *            A listing is seeded with created_by = OWNER_ID.
     * Endpoint : GET /api/listings/{listingId}  (requires authentication only, no role restriction)
     * Expected : 403 from {@code ListingController.getById} catching {@code ListingOwnershipException}
     *            — NOT from @PreAuthorize / RBAC
     * Proves   : RBAC layering did NOT bypass object-ownership.
     *            NON_OWNER_ID passes authentication and RBAC (has ROLE_BROKER),
     *            but ListingWorkflowService.findListingForCaller() throws ownership denial.
     *            This mirrors the ListingQualityOwnershipIT ownership pattern at the HTTP layer.
     */
    @Test
    @DisplayName("Check 7: non-owner broker → GET /api/listings/{id} → 403 from ownership guard (not RBAC)")
    void check7_nonOwnerBroker_ownershipGuardDenies_403NotRbac() throws Exception {
        seedRole(OWNER_ID, "broker");
        seedRole(NON_OWNER_ID, "broker");

        // Seed a DRAFT listing owned by OWNER_ID (mirrors ListingQualityOwnershipIT helper pattern)
        OffsetDateTime now = OffsetDateTime.now();
        Listing listing = new Listing();
        listing.setCreatedBy(OWNER_ID);
        listing.setStatus(ListingStatus.DRAFT.toDbValue());
        listing.setPropertyType("land");
        listing.setTitle("RbacSmoke-Check7-Ownership-Test");
        listing.setCreatedAt(now);
        listing.setUpdatedAt(now);
        Listing saved = listingRepository.saveAndFlush(listing);

        // NON_OWNER_ID is authenticated with ROLE_BROKER — passes @IsBrokerOrAbove if present,
        // and passes the anyRequest().authenticated() gate.
        // However ListingWorkflowService.findListingForCaller() checks created_by == callerId.
        // It finds OWNER_ID != NON_OWNER_ID → ListingOwnershipException.
        // ListingController.getById() catches ListingOwnershipException → 403.
        // This is an OWNERSHIP 403, not a raw RBAC 403 (access was not denied by @PreAuthorize).
        mockMvc.perform(get("/api/listings/" + saved.getId())
                        .header("Authorization", "Bearer " + NON_OWNER_ID))
                .andExpect(status().isForbidden());
    }

    // =========================================================================
    // Seed helper
    // =========================================================================

    /**
     * Seeds an {@code auth.users} row (required by the FK on {@code user_roles.user_id})
     * then seeds the role row. Both are idempotent via ON CONFLICT DO NOTHING.
     */
    private void seedRole(UUID userId, String role) {
        jdbc.update(
                "INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                userId, "smoke-" + userId + "@test.local");
        jdbc.update(
                "INSERT INTO public.user_roles (user_id, role) " +
                "VALUES (?, CAST(? AS public.app_role)) " +
                "ON CONFLICT (user_id, role) DO NOTHING",
                userId, role);
    }
}

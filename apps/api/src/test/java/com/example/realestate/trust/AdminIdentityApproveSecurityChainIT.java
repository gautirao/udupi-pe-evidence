package com.example.realestate.trust;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.storage.SupabaseStorageService;
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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * #2878 / #2888 — real-chain proof that {@code POST /api/admin/trust/identity/{id}/approve} and {@code /api/admin/**}
 * are admin-only at the Spring Security FILTER CHAIN (JwtConfig matcher, hasAuthority("ROLE_ADMIN")), independently of
 * controller-level {@code @IsAdmin}, {@code @PreAuthorize("#caller.isAdmin()")}, or {@code caller.isAdmin()} checks.
 *
 * <p>Layer signatures (observed, .claude/handoffs/issue-2878/evidence/observed-responses.txt):
 * <ul>
 *   <li>CHAIN refusal: 403, {@code WWW-Authenticate: Bearer error="insufficient_scope", ...}, empty body
 *       (BearerTokenAccessDeniedHandler; never reaches the controller).</li>
 *   <li>CONTROLLER refusal: 403, no WWW-Authenticate, JSON {@code {"error":"Admin access required"}}.</li>
 * </ul>
 *
 * <p>Real: filter chain (JwtConfig), DbRoleJwtAuthenticationConverter (roles read from {@code public.user_roles}),
 * CallerInfoResolver, AdminTrustController, BadgeService, JPA, Flyway. Replaced: JwtDecoder only (bearer token value
 * == JWT subject, precedent TrustIdentityApprovalIT); SupabaseStorageService mocked (no network). The admin path uses
 * a bearer token, never a jwt() post-processor or a hand-built authority. Every case seeds a FRESH PENDING evidence row
 * so an earlier approval cannot mask the result, and re-reads review_state from the DB after the call.
 *
 * <p>UNTAGGED on purpose (surefire excludes {@code @Tag("integration")}): runs in the default {@code mvn test}.
 * Skipped without Docker ({@code disabledWithoutDocker}) — a skipped run is NOT_RUN, never PASS.
 * Path-variant probes run through MockMvc, whose fidelity to a real servlet container's URL handling (Tomcat
 * normalisation / StrictHttpFirewall inputs) is best-effort, not proof for production.
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
        "AI_API_KEY=test-dummy-not-used-in-admin-identity-approve-security-chain-it",
        "spring.task.scheduling.enabled=false",
        "supabase.storage.enabled=false"
})
class AdminIdentityApproveSecurityChainIT {

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

    /** roles {user, admin} */
    private static final UUID ADMIN_ID = UUID.fromString("28780001-0000-0000-0000-000000000001");
    /** roles {user, dealer} */
    private static final UUID DEALER_ID = UUID.fromString("28780002-0000-0000-0000-000000000002");
    /** roles {user} (the auth.users trigger role only) */
    private static final UUID USER_ID = UUID.fromString("28780003-0000-0000-0000-000000000003");
    /** roles {user, dealer, admin} */
    private static final UUID MULTI_ID = UUID.fromString("28780004-0000-0000-0000-000000000004");

    private static final String CONTROLLER_DENY_MESSAGE = "Admin access required";

    @Autowired private MockMvc mockMvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private ListingRepository listingRepository;
    @Autowired private IdentityEvidenceRepository identityEvidenceRepository;

    /** Mocked so no storage call can leave the loopback test; isEnabled() defaults to false. */
    @MockitoBean private SupabaseStorageService supabaseStorageService;

    @BeforeEach
    void seedUsers() {
        // auth.users insert fires handle_new_user() (V0.1): profiles row + the 'user' role.
        seedUser(ADMIN_ID, "admin");
        seedUser(DEALER_ID, "dealer");
        seedUser(USER_ID, null);
        seedUser(MULTI_ID, "dealer");
        seedUser(MULTI_ID, "admin");
    }

    private void seedUser(UUID id, String extraRole) {
        jdbc.update("INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                id, "it-2878-" + id + "@test.local");
        if (extraRole != null) {
            jdbc.update("INSERT INTO public.user_roles (user_id, role) VALUES (?, CAST(? AS public.app_role)) "
                    + "ON CONFLICT (user_id, role) DO NOTHING", id, extraRole);
        }
    }

    /** A new listing + a new PENDING identity_evidence row, so no earlier case can pre-approve it. */
    private UUID freshPendingEvidence() {
        OffsetDateTime now = OffsetDateTime.now();
        Listing listing = new Listing();
        listing.setCreatedBy(DEALER_ID);
        listing.setStatus(ListingStatus.LIVE.toDbValue());
        listing.setPropertyType("house");
        listing.setSellerType("broker");
        listing.setTitle("IT-2878-AdminIdentityApproveSecurityChain");
        listing.setCreatedAt(now);
        listing.setUpdatedAt(now);
        UUID listingId = listingRepository.saveAndFlush(listing).getId();

        IdentityEvidence e = new IdentityEvidence();
        e.setProfileId(DEALER_ID);
        e.setListingId(listingId);
        e.setLegalName("Synthetic 2878");
        e.setPhoneNumber("+91 00000 02878");
        e.setDocumentType("AADHAAR");
        e.setDocumentUrl(SupabaseStorageService.STORAGE_DISABLED_SENTINEL_PREFIX + "it-2878");
        e.setReviewState("PENDING");
        e.setUpdatedAt(now);
        UUID id = identityEvidenceRepository.saveAndFlush(e).getId();
        assertThat(reviewState(id)).isEqualTo("PENDING");
        return id;
    }

    private String reviewState(UUID evidenceId) {
        return identityEvidenceRepository.findById(evidenceId).orElseThrow().getReviewState();
    }

    private MockHttpServletResponse call(String label, MockHttpServletRequestBuilder req) throws Exception {
        MockHttpServletResponse r = mockMvc.perform(req).andReturn().getResponse();
        System.out.println("OBSERVED-2878 | " + label + " | status=" + r.getStatus()
                + " | WWW-Authenticate=" + r.getHeader("WWW-Authenticate") + " | body=" + r.getContentAsString());
        return r;
    }

    private static MockHttpServletRequestBuilder approve(UUID evidenceId) {
        return post("/api/admin/trust/identity/" + evidenceId + "/approve");
    }

    private static MockHttpServletRequestBuilder as(MockHttpServletRequestBuilder b, Object bearer) {
        return b.header("Authorization", "Bearer " + bearer);
    }

    /** 403 from the filter chain: insufficient_scope challenge, no controller JSON. */
    private static void assertChainRefusal(MockHttpServletResponse r) throws Exception {
        assertThat(r.getStatus()).isEqualTo(403);
        assertThat(r.getHeader("WWW-Authenticate"))
                .as("chain signature: BearerTokenAccessDeniedHandler challenge")
                .isNotNull()
                .startsWith("Bearer ")
                .contains("error=\"insufficient_scope\"");
        assertThat(r.getContentAsString())
                .as("chain refusal must not be the controller's JSON body")
                .doesNotContain(CONTROLLER_DENY_MESSAGE)
                .isEmpty();
    }

    @Test
    @DisplayName("a) admin (bearer -> DbRoleJwtAuthenticationConverter -> user_roles) approves: 200, APPROVED, reviewedBy=admin")
    void admin_approves() throws Exception {
        UUID id = freshPendingEvidence();
        MockHttpServletResponse r = call("a admin approve", as(approve(id), ADMIN_ID));
        assertThat(r.getStatus()).isEqualTo(200);
        assertThat(objectMapper.readTree(r.getContentAsString()).path("message").asText())
                .isEqualTo("Identity evidence approved");
        IdentityEvidence after = identityEvidenceRepository.findById(id).orElseThrow();
        assertThat(after.getReviewState()).isEqualTo("APPROVED");
        assertThat(after.getReviewedBy()).isEqualTo(ADMIN_ID);
        assertThat(after.getReviewedAt()).isNotNull();
    }

    @Test
    @DisplayName("b) dealer {user,dealer} approve: 403 with the CHAIN signature; evidence stays PENDING")
    void dealer_refusedByChain() throws Exception {
        UUID id = freshPendingEvidence();
        assertChainRefusal(call("b dealer approve", as(approve(id), DEALER_ID)));
        assertThat(reviewState(id)).isEqualTo("PENDING");
    }

    @Test
    @DisplayName("c) plain user {user} approve: 403 with the CHAIN signature; evidence stays PENDING")
    void plainUser_refusedByChain() throws Exception {
        UUID id = freshPendingEvidence();
        assertChainRefusal(call("c user approve", as(approve(id), USER_ID)));
        assertThat(reviewState(id)).isEqualTo("PENDING");
    }

    @Test
    @DisplayName("d) anonymous approve: 401 Bearer challenge from the chain; evidence stays PENDING")
    void anonymous_unauthenticated() throws Exception {
        UUID id = freshPendingEvidence();
        MockHttpServletResponse r = call("d anonymous approve", approve(id));
        assertThat(r.getStatus()).isEqualTo(401);
        assertThat(r.getHeader("WWW-Authenticate")).isEqualTo("Bearer");
        assertThat(r.getContentAsString()).isEmpty();
        assertThat(reviewState(id)).isEqualTo("PENDING");
    }

    @Test
    @DisplayName("e) #2888: sibling endpoints (dealer reject + GET pending) are now refused by the FILTER CHAIN; evidence stays PENDING")
    void scopePin_siblingEndpointsStillControllerGuardedOnly() throws Exception {
        UUID id = freshPendingEvidence();
        assertChainRefusal(call("e1 dealer reject", as(post("/api/admin/trust/identity/" + id + "/reject"), DEALER_ID)
                .contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"x\"}")));
        assertThat(reviewState(id)).isEqualTo("PENDING");
        assertChainRefusal(call("e2 dealer GET pending", as(get("/api/admin/trust/identity/pending"), DEALER_ID)));
        assertThat(reviewState(id)).isEqualTo("PENDING");
    }

    @Test
    @DisplayName("f) multi-role {user,dealer,admin} approves: 200, APPROVED")
    void multiRoleAdmin_approves() throws Exception {
        UUID id = freshPendingEvidence();
        MockHttpServletResponse r = call("f multi-role approve", as(approve(id), MULTI_ID));
        assertThat(r.getStatus()).isEqualTo(200);
        IdentityEvidence after = identityEvidenceRepository.findById(id).orElseThrow();
        assertThat(after.getReviewState()).isEqualTo("APPROVED");
        assertThat(after.getReviewedBy()).isEqualTo(MULTI_ID);
    }

    @Test
    @DisplayName("g) malformed subject 'not-a-uuid' (empty authorities): 403 CHAIN signature; PENDING")
    void malformedSubject_refusedByChain() throws Exception {
        UUID id = freshPendingEvidence();
        assertChainRefusal(call("g malformed subject approve", as(approve(id), "not-a-uuid")));
        assertThat(reviewState(id)).isEqualTo("PENDING");
    }

    @Test
    @DisplayName("h) unknown evidence id: non-admin 403 (no existence oracle), admin 404")
    void unknownEvidence_noExistenceOracle() throws Exception {
        UUID unknown = UUID.fromString("28780000-dead-0000-0000-000000000099");
        assertThat(identityEvidenceRepository.findById(unknown)).isEmpty();
        assertChainRefusal(call("h1 dealer approve unknown uuid", as(approve(unknown), DEALER_ID)));
        MockHttpServletResponse admin = call("h2 admin approve unknown uuid", as(approve(unknown), ADMIN_ID));
        assertThat(admin.getStatus()).isEqualTo(404);
        assertThat(objectMapper.readTree(admin.getContentAsString()).path("error").asText())
                .isEqualTo("Identity evidence not found");
        assertThat(identityEvidenceRepository.findById(unknown)).isEmpty();
    }

    @Test
    @DisplayName("i) dealer path-variant probes never reach approval (MockMvc fidelity is best-effort)")
    void pathVariantProbes_neverApprove() throws Exception {
        UUID id = freshPendingEvidence();
        String canonical = "/api/admin/trust/identity/" + id + "/approve";
        String[][] probes = {
                {"i1 trailing slash", canonical + "/"},
                {"i2 upper-case path", canonical.toUpperCase(java.util.Locale.ROOT)},
                {"i4 path parameter", canonical + ";x=y"},
                {"i5 mixed-case action segment", "/api/admin/trust/identity/" + id + "/Approve"},
        };
        for (String[] p : probes) {
            MockHttpServletResponse r = call(p[0], as(post(p[1]), DEALER_ID));
            assertThat(r.getStatus()).as(p[0] + " must never succeed").isNotEqualTo(200);
            assertThat(r.getStatus()).as(p[0] + " must be a 4xx refusal").isBetween(400, 499);
            assertThat(reviewState(id)).as(p[0] + " must leave evidence PENDING").isEqualTo("PENDING");
        }
        // Double slash: MockMvc parses "//api/..." as a scheme-relative URI (authority "api"), so the request URI is
        // set explicitly to exercise the firewall / matcher with a literal "//" prefix.
        MockHttpServletResponse dbl = call("i3 double slash (explicit requestURI)", as(post(canonical), DEALER_ID)
                .with(req -> {
                    req.setRequestURI("/" + canonical);
                    req.setServletPath("/" + canonical);
                    return req;
                }));
        assertThat(dbl.getStatus()).as("i3 must never succeed").isNotEqualTo(200);
        assertThat(dbl.getStatus()).as("i3 must be a 4xx refusal").isBetween(400, 499);
        assertThat(reviewState(id)).as("i3 must leave evidence PENDING").isEqualTo("PENDING");
    }

    @ParameterizedTest(name = "j) #2888 representative GET {0}: dealer/user -> 403 chain refusal; anonymous -> 401")
    @ValueSource(strings = {
            "/api/admin/trust/identity/pending",
            "/api/admin/listings/pending",
            "/api/admin/intelligence/areas",
            "/api/admin/audit-log",
            "/api/admin/localities/candidates",
            "/api/admin/duplicates",
            "/api/admin/property-requests",
            "/api/admin/city-launch/cities",
            "/api/admin/area-onboarding/batches/1"
    })
    void representativeAdminGetRoutes_enforcedAtChain(String path) throws Exception {
        assertChainRefusal(call("j dealer GET " + path, as(get(path), DEALER_ID)));
        assertChainRefusal(call("j user GET " + path, as(get(path), USER_ID)));

        MockHttpServletResponse anon = call("j anon GET " + path, get(path));
        assertThat(anon.getStatus()).isEqualTo(401);
        assertThat(anon.getHeader("WWW-Authenticate")).isEqualTo("Bearer");
        assertThat(anon.getContentAsString()).isEmpty();
    }

    @ParameterizedTest(name = "k) #2888 safe GET {0}: admin succeeds with 200")
    @ValueSource(strings = {
            "/api/admin/trust/identity/pending",
            "/api/admin/listings/pending",
            "/api/admin/intelligence/areas",
            "/api/admin/audit-log",
            "/api/admin/localities/candidates",
            "/api/admin/duplicates",
            "/api/admin/property-requests",
            "/api/admin/city-launch/cities"
    })
    void representativeSafeAdminGetRoutes_adminSucceeds(String path) throws Exception {
        MockHttpServletResponse r = call("k admin GET " + path, as(get(path), ADMIN_ID));
        assertThat(r.getStatus()).isEqualTo(200);
    }

    @Test
    @DisplayName("l) #2888 nonexistent batch GET /api/admin/area-onboarding/batches/1: admin passes chain (404, not 403)")
    void nonexistentBatch_adminPassesChain() throws Exception {
        MockHttpServletResponse r = call("l admin GET batches/1", as(get("/api/admin/area-onboarding/batches/1"), ADMIN_ID));
        assertThat(r.getStatus()).isNotEqualTo(403).isNotEqualTo(401);
        assertThat(r.getStatus()).isIn(200, 400, 404, 409);
    }

    @Test
    @DisplayName("m) #2888 mutation POST /api/admin/trust/identity/{id}/reject: dealer/user 403 chain, anon 401; stays PENDING")
    void rejectMutation_enforcedAtChainWithoutStateChange() throws Exception {
        UUID id = freshPendingEvidence();
        String path = "/api/admin/trust/identity/" + id + "/reject";
        String body = "{\"reason\":\"valid rejection reason\"}";

        assertChainRefusal(call("m dealer POST reject",
                as(post(path).contentType(MediaType.APPLICATION_JSON).content(body), DEALER_ID)));
        assertThat(reviewState(id)).isEqualTo("PENDING");

        assertChainRefusal(call("m user POST reject",
                as(post(path).contentType(MediaType.APPLICATION_JSON).content(body), USER_ID)));
        assertThat(reviewState(id)).isEqualTo("PENDING");

        MockHttpServletResponse anon = call("m anon POST reject",
                post(path).contentType(MediaType.APPLICATION_JSON).content(body));
        assertThat(anon.getStatus()).isEqualTo(401);
        assertThat(anon.getHeader("WWW-Authenticate")).isEqualTo("Bearer");
        assertThat(anon.getContentAsString()).isEmpty();
        assertThat(reviewState(id)).isEqualTo("PENDING");
    }

    @Test
    @DisplayName("n) #2888 mutation POST /api/admin/listings/{id}/archive (non-existent UUID): dealer/user 403 chain (no existence oracle), anon 401, admin 404")
    void archiveListingMutation_enforcedAtChainNoExistenceOracle() throws Exception {
        UUID unknownListing = UUID.fromString("28880000-dead-0000-0000-000000000099");
        assertThat(listingRepository.findById(unknownListing)).isEmpty();
        String path = "/api/admin/listings/" + unknownListing + "/archive";
        String body = "{\"reason\":\"archived in test\"}";

        assertChainRefusal(call("n dealer POST archive",
                as(post(path).contentType(MediaType.APPLICATION_JSON).content(body), DEALER_ID)));
        assertChainRefusal(call("n user POST archive",
                as(post(path).contentType(MediaType.APPLICATION_JSON).content(body), USER_ID)));

        MockHttpServletResponse anon = call("n anon POST archive",
                post(path).contentType(MediaType.APPLICATION_JSON).content(body));
        assertThat(anon.getStatus()).isEqualTo(401);
        assertThat(anon.getHeader("WWW-Authenticate")).isEqualTo("Bearer");
        assertThat(anon.getContentAsString()).isEmpty();

        MockHttpServletResponse admin = call("n admin POST archive",
                as(post(path).contentType(MediaType.APPLICATION_JSON).content(body), ADMIN_ID));
        assertThat(admin.getStatus()).isNotEqualTo(403).isNotEqualTo(401);
        assertThat(admin.getStatus()).isIn(400, 404, 409);
        assertThat(listingRepository.findById(unknownListing)).isEmpty();
    }
}

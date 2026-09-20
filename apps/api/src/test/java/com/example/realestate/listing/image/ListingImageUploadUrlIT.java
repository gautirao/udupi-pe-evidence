package com.example.realestate.listing.image;

import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.storage.ListingImageStorage;
import com.example.realestate.listing.storage.SupabaseStorageService;
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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.startsWith;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Testcontainers integration test for POST /api/listings/{listingId}/images/upload-url (#1686).
 *
 * <p>Purpose: prove the ownership DB read in {@link ListingImageController#requestUploadUrl}
 * works against a REAL Postgres. The @WebMvcTest suite (ListingImageControllerTest) already
 * covers the full validation matrix with mocked service layer — this IT closes the gap by
 * booting the full Spring context against Testcontainers Postgres so
 * {@link com.example.realestate.listing.workflow.ListingWorkflowService#findListingForCaller}
 * performs a real DB query.
 *
 * <p>Supabase boundary: {@link SupabaseStorageService} is mocked via {@code @MockitoBean}.
 * The real class starts cleanly with no config (all fields default to empty / disabled)
 * but the mock is explicitly registered so {@code createSignedUploadUrl} can return a
 * deterministic value without any live Supabase call.
 *
 * <p>Auth pattern: mirrors {@link com.example.realestate.security.RbacSmokeIT}. The
 * {@code TestJwtDecoderConfig} makes the Bearer token value equal to the UUID subject;
 * {@code DbRoleJwtAuthenticationConverter} then performs a REAL DB lookup against
 * {@code user_roles} to resolve the ROLE_* authority, which proves the full chain runs.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        // Flyway: load test stubs (Supabase-specific functions) before real migrations
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        // V73 uses CREATE INDEX CONCURRENTLY mixed with transactional DDL
        "spring.flyway.mixed=true",
        // CONCURRENTLY deadlocks on arm64/Rosetta with Flyway VIDs; empty = non-concurrent (safe on fresh container)
        "spring.flyway.placeholders.concurrently_keyword=",
        // Testcontainers Postgres does not use SSL
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        // Override issuer-uri so no OIDC discovery is attempted against Supabase.
        // TestJwtDecoderConfig provides a @Primary JwtDecoder so this value is never used
        // for decoder construction; it only prevents ${SUPABASE_PROJECT_REF} from being needed.
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://test.example.com/auth/v1",
        // AiClient requires ${AI_API_KEY} with no default — provide a dummy so the bean starts
        "AI_API_KEY=test-dummy-not-used-in-upload-url-it",
        // Prevent background scheduled jobs from interfering with tests
        "spring.task.scheduling.enabled=false"
})
class ListingImageUploadUrlIT {

    // -------------------------------------------------------------------------
    // Testcontainers — PostGIS image matches all other ITs in this project
    // -------------------------------------------------------------------------

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine")
                    .asCompatibleSubstituteFor("postgres"));

    // -------------------------------------------------------------------------
    // Test JWT decoder — mirrors RbacSmokeIT.TestJwtDecoderConfig exactly.
    // The raw Bearer token value IS the UUID subject. Sending:
    //   Authorization: Bearer 16860001-0000-0000-0000-000000000001
    // causes BearerTokenAuthenticationFilter to extract the token string, pass it
    // to this decoder, which returns Jwt(subject="16860001-...").
    // DbRoleJwtAuthenticationConverter then performs a REAL DB lookup against user_roles.
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
     * Mock replaces the storage service so createUploadTarget returns a
     * deterministic URL without a live storage call. The DB ownership path (controller →
     * ListingWorkflowService → ListingRepository → Postgres) is fully real.
     */
    @MockitoBean
    private ListingImageStorage storageService;

    // -------------------------------------------------------------------------
    // Stable test UUIDs — embed "1686" to identify as upload-url IT fixtures
    // -------------------------------------------------------------------------

    private static final UUID OWNER_ID     = UUID.fromString("16860001-0000-0000-0000-000000000001");
    private static final UUID NON_OWNER_ID = UUID.fromString("16860002-0000-0000-0000-000000000002");

    private static final String SIGNED_URL =
            "https://storage.example.com/object/sign/listing-images/test-upload-token";

    // Set in @BeforeEach; used in @AfterEach cleanup
    private UUID listingId;
    private UUID scrapedListingId;

    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------

    @BeforeEach
    void setUp() {
        // Seed auth.users rows (FK required by user_roles.user_id)
        seedAuthUser(OWNER_ID);
        seedAuthUser(NON_OWNER_ID);

        // Seed dealer roles — DbRoleJwtAuthenticationConverter reads these to build ROLE_DEALER
        seedRole(OWNER_ID, "dealer");
        seedRole(NON_OWNER_ID, "dealer");

        OffsetDateTime now = OffsetDateTime.now();

        // Seed a DRAFT listing owned by OWNER_ID — the primary target for ownership assertions
        Listing ownerListing = new Listing();
        ownerListing.setCreatedBy(OWNER_ID);
        ownerListing.setStatus(ListingStatus.DRAFT.toDbValue());
        ownerListing.setPropertyType("house");
        ownerListing.setTitle("IT-UploadUrl-Owner-Draft-1686");
        ownerListing.setCreatedAt(now);
        ownerListing.setUpdatedAt(now);
        listingId = listingRepository.saveAndFlush(ownerListing).getId();

        // Seed a scraped listing (null createdBy) — used for the 403 scraped-owner scenario
        Listing scraped = new Listing();
        scraped.setCreatedBy(null);
        scraped.setStatus(ListingStatus.DRAFT.toDbValue());
        scraped.setPropertyType("house");
        scraped.setTitle("IT-UploadUrl-Scraped-1686");
        scraped.setCreatedAt(now);
        scraped.setUpdatedAt(now);
        scrapedListingId = listingRepository.saveAndFlush(scraped).getId();

        // Reset mock interaction history for each test (context is shared; mock is reused)
        Mockito.reset(storageService);
    }

    @AfterEach
    void cleanUp() {
        // Delete listings before auth.users: property_listings.created_by FK has no CASCADE
        if (listingId != null) {
            jdbc.update("DELETE FROM public.property_listings WHERE id = ?", listingId);
        }
        if (scrapedListingId != null) {
            jdbc.update("DELETE FROM public.property_listings WHERE id = ?", scrapedListingId);
        }
        // Deleting from auth.users cascades to user_roles (ON DELETE CASCADE)
        jdbc.update("DELETE FROM auth.users WHERE id IN (?,?)", OWNER_ID, NON_OWNER_ID);
    }

    // =========================================================================
    // IT1 — owner + DRAFT + valid input → 200; storagePath prefixed by real DB createdBy
    // =========================================================================

    /**
     * Fixture  : OWNER_ID has role='dealer'; listing owned by OWNER_ID in DRAFT status.
     * Flow     : Bearer OWNER_ID → TestJwtDecoder → DbRoleJwtAuthenticationConverter (REAL DB)
     *            → ROLE_DEALER → CallerInfo(dealer) → findListingForCaller (REAL DB read)
     *            → ownership check passes → validation passes → storageService mock called.
     * Asserts  : 200; storagePath = "listings/{OWNER_ID}/{listingId}/{uuid}.jpg";
     *            no serviceRoleKey/authorization leak in response body.
     */
    @Test
    @DisplayName("IT1: owner + DRAFT + valid input → 200; storagePath uses DB createdBy (real ownership read)")
    void ownerDraftValidInput_returns200_storagePathPrefixedByOwner() throws Exception {
        when(storageService.createUploadTarget(eq("listing-images"), any(), any()))
                .thenAnswer(inv -> {
                    String path = inv.getArgument(1);
                    String ct = inv.getArgument(2);
                    return Optional.of(new com.example.realestate.listing.storage.UploadTarget(
                            SIGNED_URL, path, null, java.util.Map.of("Content-Type", ct != null ? ct : "image/jpeg")));
                });

        mockMvc.perform(post("/api/listings/" + listingId + "/images/upload-url")
                        .header("Authorization", "Bearer " + OWNER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fileName":"photo.jpg","contentType":"image/jpeg","sizeBytes":102400}
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.signedUrl").value(SIGNED_URL))
                .andExpect(jsonPath("$.storagePath",
                        startsWith("listings/" + OWNER_ID + "/" + listingId + "/")))
                .andExpect(jsonPath("$.storagePath", endsWith(".jpg")))
                // Service-role key and internal auth headers must never appear in the response
                .andExpect(jsonPath("$.serviceRoleKey").doesNotExist())
                .andExpect(jsonPath("$.authorization").doesNotExist());

        verify(storageService).createUploadTarget(eq("listing-images"), any(), any());
    }

    // =========================================================================
    // IT2 — authenticated non-owner → 404 from real DB ownership check
    // =========================================================================

    /**
     * Fixture  : NON_OWNER_ID has role='dealer' (valid auth); listing owned by OWNER_ID.
     * Flow     : Bearer NON_OWNER_ID → ROLE_DEALER → CallerInfo(dealer, NON_OWNER_ID)
     *            → findListingForCaller (REAL DB) → createdBy=OWNER_ID ≠ NON_OWNER_ID
     *            → ListingOwnershipException → findOwnedListing re-reads (createdBy non-null) → 404.
     * Asserts  : 404; createSignedUploadUrl NOT called (rejection before signing).
     */
    @Test
    @DisplayName("IT2: authenticated non-owner → 404; real DB ownership check fails before URL is signed")
    void nonOwner_returns404_realOwnershipCheck() throws Exception {
        mockMvc.perform(post("/api/listings/" + listingId + "/images/upload-url")
                        .header("Authorization", "Bearer " + NON_OWNER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fileName":"photo.jpg","contentType":"image/jpeg","sizeBytes":1024}
                                """))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));

        verify(storageService, never()).createUploadTarget(any(), any(), any());
    }

    // =========================================================================
    // IT3 — scraped listing (null createdBy) + non-admin caller → 403
    // =========================================================================

    /**
     * Fixture  : OWNER_ID has role='dealer'; scraped listing has createdBy=null.
     * Flow     : Bearer OWNER_ID → ROLE_DEALER → CallerInfo(dealer, isAdmin=false)
     *            → findListingForCaller (REAL DB) → createdBy=null → ListingOwnershipException
     *            → findOwnedListing re-reads (createdBy=null) → 403 "Access denied: listing has no owner".
     * Asserts  : 403; createSignedUploadUrl NOT called.
     */
    @Test
    @DisplayName("IT3: scraped listing (null createdBy) + non-admin caller → 403; no signed URL issued")
    void scrapedListing_nonAdmin_returns403_noSignedUrl() throws Exception {
        mockMvc.perform(post("/api/listings/" + scrapedListingId + "/images/upload-url")
                        .header("Authorization", "Bearer " + OWNER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fileName":"photo.jpg","contentType":"image/jpeg","sizeBytes":1024}
                                """))
                .andExpect(status().isForbidden());

        verify(storageService, never()).createUploadTarget(any(), any(), any());
    }

    // =========================================================================
    // IT4 — invalid contentType → 400; createSignedUploadUrl NOT called
    // =========================================================================

    /**
     * Fixture  : OWNER_ID is the owner (ownership check passes against real DB).
     * Flow     : ownership passes → validation: contentType "application/pdf" not in allowlist → 400.
     * Asserts  : 400; createSignedUploadUrl NOT called (validation fires before signing).
     *
     * <p>This proves the real DB ownership read + early validation rejection in one sweep,
     * which is distinct from the @WebMvcTest layer where ownership is mocked.
     */
    @Test
    @DisplayName("IT4: owner + invalid contentType → 400; real DB ownership passes, validation rejects before signing")
    void invalidContentType_returns400_noSignCall() throws Exception {
        mockMvc.perform(post("/api/listings/" + listingId + "/images/upload-url")
                        .header("Authorization", "Bearer " + OWNER_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"fileName":"photo.pdf","contentType":"application/pdf","sizeBytes":1024}
                                """))
                .andExpect(status().isBadRequest());

        verify(storageService, never()).createUploadTarget(any(), any(), any());
    }

    // =========================================================================
    // Seed helpers — mirror RbacSmokeIT.seedRole exactly
    // =========================================================================

    private void seedAuthUser(UUID userId) {
        jdbc.update(
                "INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                userId, "it-upload-url-" + userId + "@test.local");
    }

    private void seedRole(UUID userId, String role) {
        jdbc.update(
                "INSERT INTO public.user_roles (user_id, role) " +
                "VALUES (?, CAST(? AS public.app_role)) " +
                "ON CONFLICT (user_id, role) DO NOTHING",
                userId, role);
    }
}

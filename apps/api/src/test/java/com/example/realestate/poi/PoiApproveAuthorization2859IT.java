package com.example.realestate.poi;

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
import org.springframework.test.web.servlet.ResultActions;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * #2859 B4 (handoff 285904) AC4 — POI approve authorization and public visibility.
 *
 * <p>Replaces the browser-only proof in {@code e2e/poi-display.spec.ts} (PM1k.persist, PM1k.public,
 * PM1.authz), whose backends were all {@code page.route} stubs.
 *
 * <p>Everything here is real: the Spring Security filter chain (JwtConfig: the public
 * {@code GET /api/listings/*}{@code /pois} is permitAll, the PATCH is authenticated), the
 * {@code DbRoleJwtAuthenticationConverter} role lookup against seeded {@code user_roles} rows, the
 * {@code CallerInfoResolver}, the real {@code ListingPoiController}, the real
 * {@code ListingWorkflowService.findListingForCaller} ownership guard, and a real Postgres
 * (Testcontainers). Nothing is mocked. Auth follows {@code BrokerArchivedListingsFilterIT}: the test
 * {@link JwtDecoder} makes the bearer token value the JWT subject (the user UUID).
 *
 * <p>The anonymous reads send NO {@code Authorization} header, exactly as {@code NearbyPois.tsx}
 * calls the endpoint with {@code skipAuth}. Every refusal has its positive control in the same test.
 *
 * <p>Untagged on purpose: pom.xml excludes {@code @Tag("integration")} from the default run.
 * Synthetic data only; every id uses the fixed prefix {@code 28590400-}.
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
        "AI_API_KEY=test-dummy-not-used-in-poi-approve-authorization-2859-it",
        "spring.task.scheduling.enabled=false"
})
class PoiApproveAuthorization2859IT {

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

    /** Broker who owns listing A. */
    private static final UUID OWNER_ID = UUID.fromString("28590400-0000-0000-0000-000000000001");
    /** A different broker; owns listing B, does not own listing A. */
    private static final UUID OTHER_BROKER_ID = UUID.fromString("28590400-0000-0000-0000-000000000002");
    /** Admin (user_roles 'admin'); owns no listing. */
    private static final UUID ADMIN_ID = UUID.fromString("28590400-0000-0000-0000-000000000003");

    /** Listing A amenity POI (HOSPITAL, unapproved). */
    private static final UUID POI_A_AMENITY = UUID.fromString("28590400-0000-0000-0000-0000000000a1");
    /** Listing A settlement POI (TOWN_CENTER, unapproved so "unchanged" is observable). */
    private static final UUID POI_A_TOWN = UUID.fromString("28590400-0000-0000-0000-0000000000a2");
    /** Listing B amenity POI (SCHOOL, unapproved). */
    private static final UUID POI_B_AMENITY = UUID.fromString("28590400-0000-0000-0000-0000000000b1");

    private UUID listingA;
    private UUID listingB;

    @BeforeEach
    void setUp() {
        seedUser(OWNER_ID, "broker");
        seedUser(OTHER_BROKER_ID, "broker");
        seedUser(ADMIN_ID, "admin");

        listingA = seedListing(OWNER_ID, "IT-2859-B4-PoiApprove-A");
        listingB = seedListing(OTHER_BROKER_ID, "IT-2859-B4-PoiApprove-B");

        seedPoi(POI_A_AMENITY, listingA, "IT-2859 City Hospital", "HOSPITAL", 800, "osm-2859-a1");
        seedPoi(POI_A_TOWN, listingA, "IT-2859 Town Hall", "TOWN_CENTER", 2500, "osm-2859-a2");
        seedPoi(POI_B_AMENITY, listingB, "IT-2859 Public School", "SCHOOL", 600, "osm-2859-b1");
    }

    @AfterEach
    void cleanUp() {
        for (UUID id : new UUID[]{listingA, listingB}) {
            if (id == null) continue;
            jdbc.update("DELETE FROM public.listing_status_history WHERE listing_id = ?", id);
            // listing_pois cascades on listing delete (V25 ON DELETE CASCADE).
            jdbc.update("DELETE FROM public.property_listings WHERE id = ?", id);
        }
        for (UUID u : new UUID[]{OWNER_ID, OTHER_BROKER_ID, ADMIN_ID}) {
            jdbc.update("DELETE FROM public.user_roles WHERE user_id = ?", u);
            jdbc.update("DELETE FROM auth.users WHERE id = ?", u);
        }
    }

    // ===== AC4 (a) + (b) =====

    @Test
    @DisplayName("AC4(a)(b): owner approve 200 persists approved=true/approvedBy=owner (DB re-read); "
            + "the ANONYMOUS public read lacks the POI before and contains it after")
    void ownerApprove_persists_andAppearsOnAnonymousPublicRead() throws Exception {
        // (b) before: anonymous public read (NO Authorization header) does not contain the POI.
        anonymousRead(listingA)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + POI_A_AMENITY + "')]").doesNotExist());
        assertPoiRow(POI_A_AMENITY, false, null);

        // (a) owner approves through the real filter chain + ownership guard.
        approve(listingA, POI_A_AMENITY, OWNER_ID)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(POI_A_AMENITY.toString()))
                .andExpect(jsonPath("$.approved").value(true));

        // (a) persisted: DB re-read.
        assertPoiRow(POI_A_AMENITY, true, OWNER_ID);

        // (b) after: the same anonymous read now contains it (follow-up read).
        anonymousRead(listingA)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + POI_A_AMENITY + "')].name").value("IT-2859 City Hospital"))
                .andExpect(jsonPath("$[?(@.id=='" + POI_A_AMENITY + "')].approved").value(true));
    }

    // ===== AC4 (c) =====

    @Test
    @DisplayName("AC4(c): admin (user_roles 'admin') approves a POI on another broker's listing: 200, approvedBy=admin")
    void adminApprove_onAnotherBrokersListing_succeeds() throws Exception {
        // The admin does not own listing A.
        assertThat(jdbc.queryForObject("SELECT created_by FROM public.property_listings WHERE id = ?",
                UUID.class, listingA)).isEqualTo(OWNER_ID);
        assertPoiRow(POI_A_AMENITY, false, null);

        approve(listingA, POI_A_AMENITY, ADMIN_ID)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.approved").value(true));

        assertPoiRow(POI_A_AMENITY, true, ADMIN_ID);
        anonymousRead(listingA)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + POI_A_AMENITY + "')].approved").value(true));
    }

    // ===== AC4 (d) =====

    @Test
    @DisplayName("AC4(d): a non-owner broker gets 403, the POI row is unchanged and still absent from the anonymous "
            + "read; control: the owner's approve of the same POI then succeeds")
    void nonOwnerBroker_isForbidden_andPoiStaysUnapprovedAndHidden() throws Exception {
        approve(listingA, POI_A_AMENITY, OTHER_BROKER_ID)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Access denied: not listing owner or admin"));

        assertPoiRow(POI_A_AMENITY, false, null);
        anonymousRead(listingA)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + POI_A_AMENITY + "')]").doesNotExist());

        // Positive control (same test): the owner's identical request succeeds and is publicly visible.
        approve(listingA, POI_A_AMENITY, OWNER_ID)
                .andExpect(status().isOk());
        assertPoiRow(POI_A_AMENITY, true, OWNER_ID);
        anonymousRead(listingA)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + POI_A_AMENITY + "')].approved").value(true));
    }

    // ===== AC4 (e) =====

    @Test
    @DisplayName("AC4(e): a POI of another listing is 404 under the caller's own listing URL and stays unchanged; "
            + "control: the same POI under its own listing URL by its owner is 200")
    void poiOfAnotherListing_isNotFound_andUnchanged() throws Exception {
        // OWNER owns listing A (the URL's listing) but POI_B_AMENITY belongs to listing B.
        approve(listingA, POI_B_AMENITY, OWNER_ID)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("POI not found"));

        assertPoiRow(POI_B_AMENITY, false, null);
        anonymousRead(listingB)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + POI_B_AMENITY + "')]").doesNotExist());
        anonymousRead(listingA)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + POI_B_AMENITY + "')]").doesNotExist());

        // Positive control (same test): the POI under its own listing URL, by that listing's owner.
        approve(listingB, POI_B_AMENITY, OTHER_BROKER_ID)
                .andExpect(status().isOk());
        assertPoiRow(POI_B_AMENITY, true, OTHER_BROKER_ID);
    }

    // ===== AC4 (f) =====

    @Test
    @DisplayName("AC4(f): approving a settlement POI (TOWN_CENTER) is 400 and leaves it unchanged; "
            + "control: the owner's amenity approve on the same listing is 200")
    void settlementPoi_isBadRequest_andUnchanged() throws Exception {
        approve(listingA, POI_A_TOWN, OWNER_ID)
                .andExpect(status().isBadRequest());

        assertPoiRow(POI_A_TOWN, false, null);
        anonymousRead(listingA)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id=='" + POI_A_TOWN + "')]").doesNotExist());

        // Positive control (same test, same caller, same listing): an amenity approve succeeds.
        approve(listingA, POI_A_AMENITY, OWNER_ID)
                .andExpect(status().isOk());
        assertPoiRow(POI_A_AMENITY, true, OWNER_ID);
    }

    // ===== #2887: Non-public listings must return 404 on GET /api/listings/{id}/pois =====

    @Test
    @DisplayName("#2887: DRAFT, PENDING_REVIEW, REJECTED, ARCHIVED, SCRAPED, soft-deleted, deleted, and nonexistent "
            + "listings return identical 404 {'error':'Listing not found'} on public POI read; LIVE control returns 200")
    void nonPublicAndMissingListings_return404OnPublicPoiRead_whileLiveControlReturns200() throws Exception {
        UUID draftListing = seedListingWithStatus(OWNER_ID, "IT-2887-Draft", ListingStatus.DRAFT, null);
        UUID pendingListing = seedListingWithStatus(OWNER_ID, "IT-2887-Pending", ListingStatus.PENDING_REVIEW, null);
        UUID rejectedListing = seedListingWithStatus(OWNER_ID, "IT-2887-Rejected", ListingStatus.REJECTED, null);
        UUID archivedListing = seedListingWithStatus(OWNER_ID, "IT-2887-Archived", ListingStatus.ARCHIVED, Instant.now());
        UUID scrapedListing = seedListingWithStatus(null, "IT-2887-Scraped", ListingStatus.SCRAPED, null);
        UUID softDeletedLiveListing = seedListingWithStatus(OWNER_ID, "IT-2887-SoftDeletedLive", ListingStatus.LIVE, Instant.now());
        UUID deletedListing = seedListingWithStatus(OWNER_ID, "IT-2887-Deleted", ListingStatus.LIVE, null);
        UUID nonexistentListing = UUID.fromString("28590400-0000-0000-0000-00000000dead");

        UUID draftPoi = UUID.fromString("28590400-0000-0000-0000-0000000000c1");
        UUID pendingPoi = UUID.fromString("28590400-0000-0000-0000-0000000000c2");
        UUID rejectedPoi = UUID.fromString("28590400-0000-0000-0000-0000000000c3");
        UUID archivedPoi = UUID.fromString("28590400-0000-0000-0000-0000000000c4");
        UUID scrapedPoi = UUID.fromString("28590400-0000-0000-0000-0000000000c5");
        UUID softDeletedPoi = UUID.fromString("28590400-0000-0000-0000-0000000000c6");
        UUID deletedPoi = UUID.fromString("28590400-0000-0000-0000-0000000000c7");

        try {
            seedApprovedPoi(draftPoi, draftListing, "Secret Draft Hospital", "HOSPITAL", 350, "osm-2887-c1");
            seedApprovedPoi(pendingPoi, pendingListing, "Secret Pending Hospital", "HOSPITAL", 400, "osm-2887-c2");
            seedApprovedPoi(rejectedPoi, rejectedListing, "Secret Rejected Hospital", "HOSPITAL", 450, "osm-2887-c3");
            seedApprovedPoi(archivedPoi, archivedListing, "Secret Archived Hospital", "HOSPITAL", 500, "osm-2887-c4");
            seedApprovedPoi(scrapedPoi, scrapedListing, "Secret Scraped Hospital", "HOSPITAL", 550, "osm-2887-c5");
            seedApprovedPoi(softDeletedPoi, softDeletedLiveListing, "Secret SoftDeleted Hospital", "HOSPITAL", 600, "osm-2887-c6");
            seedApprovedPoi(deletedPoi, deletedListing, "Secret Deleted Hospital", "HOSPITAL", 650, "osm-2887-c7");

            // Hard-delete deletedListing (cascades its POIs).
            jdbc.update("DELETE FROM public.property_listings WHERE id = ?", deletedListing);

            UUID[] nonPublicIds = new UUID[]{
                    draftListing, pendingListing, rejectedListing, archivedListing,
                    scrapedListing, softDeletedLiveListing, deletedListing, nonexistentListing
            };

            for (UUID id : nonPublicIds) {
                // Anonymous caller gets 404 with identical body {"error":"Listing not found"}
                anonymousRead(id)
                        .andExpect(status().isNotFound())
                        .andExpect(jsonPath("$.error").value("Listing not found"));

                // Authenticated non-owner caller also gets 404 on the public POI endpoint
                authenticatedRead(id, OTHER_BROKER_ID)
                        .andExpect(status().isNotFound())
                        .andExpect(jsonPath("$.error").value("Listing not found"));
            }

            // Positive control: LIVE listing with approved POI returns 200 to anonymous and authenticated callers
            approve(listingA, POI_A_AMENITY, OWNER_ID)
                    .andExpect(status().isOk());
            anonymousRead(listingA)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[?(@.id=='" + POI_A_AMENITY + "')].name").value("IT-2859 City Hospital"));
            authenticatedRead(listingA, OTHER_BROKER_ID)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[?(@.id=='" + POI_A_AMENITY + "')].name").value("IT-2859 City Hospital"));
        } finally {
            for (UUID id : new UUID[]{draftListing, pendingListing, rejectedListing, archivedListing, scrapedListing, softDeletedLiveListing, deletedListing}) {
                if (id == null) continue;
                jdbc.update("DELETE FROM public.listing_status_history WHERE listing_id = ?", id);
                jdbc.update("DELETE FROM public.property_listings WHERE id = ?", id);
            }
        }
    }

    @Test
    @DisplayName("#2887: owner and admin can still manage POIs (/suggestions, /approve) on non-LIVE listings, "
            + "while public GET /pois returns 404 until the listing becomes LIVE")
    void nonLiveListing_ownerAndAdminManagementPreserved_whilePublicReadGatedByLiveStatus() throws Exception {
        UUID draftListing = seedListingWithStatus(OWNER_ID, "IT-2887-Draft-Manage", ListingStatus.DRAFT, null);
        UUID draftPoi = UUID.fromString("28590400-0000-0000-0000-0000000000d1");

        try {
            seedPoi(draftPoi, draftListing, "IT-2887 Draft School", "SCHOOL", 420, "osm-2887-d1");

            // Anonymous caller is rejected with 401 by the real security filter chain on /suggestions
            mockMvc.perform(get("/api/listings/" + draftListing + "/pois/suggestions"))
                    .andExpect(status().isUnauthorized());

            // Authenticated non-owner broker is rejected with 403 on /suggestions and /approve
            suggestions(draftListing, OTHER_BROKER_ID)
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error").value("Access denied: not listing owner or admin"));
            approve(draftListing, draftPoi, OTHER_BROKER_ID)
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.error").value("Access denied: not listing owner or admin"));

            // Owner and admin can read /suggestions on the DRAFT listing
            suggestions(draftListing, OWNER_ID)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.pois[?(@.id=='" + draftPoi + "')].name").value("IT-2887 Draft School"));
            suggestions(draftListing, ADMIN_ID)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.pois[?(@.id=='" + draftPoi + "')].name").value("IT-2887 Draft School"));

            // Owner approves the POI while listing is still DRAFT
            approve(draftListing, draftPoi, OWNER_ID)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.approved").value(true));
            assertPoiRow(draftPoi, true, OWNER_ID);

            // Even though the POI is approved, public GET /pois still returns 404 while listing is DRAFT
            anonymousRead(draftListing)
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.error").value("Listing not found"));

            // Transition listing to LIVE -> public GET /pois now returns 200 with the approved POI
            jdbc.update("UPDATE public.property_listings SET status = 'LIVE' WHERE id = ?", draftListing);
            anonymousRead(draftListing)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[?(@.id=='" + draftPoi + "')].name").value("IT-2887 Draft School"));

            // Transition listing to ARCHIVED -> public GET /pois returns 404 again, while owner/admin /suggestions still works
            jdbc.update("UPDATE public.property_listings SET status = 'ARCHIVED', archived_at = NOW() WHERE id = ?", draftListing);
            anonymousRead(draftListing)
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.error").value("Listing not found"));
            suggestions(draftListing, OWNER_ID)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.pois[?(@.id=='" + draftPoi + "')].name").value("IT-2887 Draft School"));
            suggestions(draftListing, ADMIN_ID)
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.pois[?(@.id=='" + draftPoi + "')].name").value("IT-2887 Draft School"));
        } finally {
            jdbc.update("DELETE FROM public.listing_status_history WHERE listing_id = ?", draftListing);
            jdbc.update("DELETE FROM public.property_listings WHERE id = ?", draftListing);
        }
    }

    // ===== helpers =====

    private ResultActions anonymousRead(UUID listingId) throws Exception {
        // Deliberately NO Authorization header (NearbyPois.tsx calls this endpoint with skipAuth).
        return mockMvc.perform(get("/api/listings/" + listingId + "/pois"));
    }

    private ResultActions authenticatedRead(UUID listingId, UUID caller) throws Exception {
        return mockMvc.perform(get("/api/listings/" + listingId + "/pois")
                .header("Authorization", "Bearer " + caller));
    }

    private ResultActions suggestions(UUID listingId, UUID caller) throws Exception {
        return mockMvc.perform(get("/api/listings/" + listingId + "/pois/suggestions")
                .header("Authorization", "Bearer " + caller));
    }

    private ResultActions approve(UUID listingId, UUID poiId, UUID caller) throws Exception {
        return mockMvc.perform(patch("/api/listings/" + listingId + "/pois/" + poiId + "/approve")
                .header("Authorization", "Bearer " + caller));
    }

    private void assertPoiRow(UUID poiId, boolean approved, UUID approvedBy) {
        Map<String, Object> row = jdbc.queryForMap(
                "SELECT approved, approved_by FROM public.listing_pois WHERE id = ?", poiId);
        assertThat(row.get("approved")).as("approved for %s", poiId).isEqualTo(approved);
        assertThat(row.get("approved_by")).as("approved_by for %s", poiId).isEqualTo(approvedBy);
    }

    private void seedUser(UUID id, String role) {
        jdbc.update("INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT (id) DO NOTHING",
                id, "it-2859-b4-" + id + "@test.local");
        jdbc.update("INSERT INTO public.user_roles (user_id, role) VALUES (?, CAST(? AS public.app_role)) "
                + "ON CONFLICT (user_id, role) DO NOTHING", id, role);
    }

    private UUID seedListing(UUID owner, String title) {
        return seedListingWithStatus(owner, title, ListingStatus.LIVE, null);
    }

    private UUID seedListingWithStatus(UUID owner, String title, ListingStatus status, Instant archivedAt) {
        OffsetDateTime now = OffsetDateTime.now();
        Listing listing = new Listing();
        listing.setCreatedBy(owner);
        listing.setStatus(status.toDbValue());
        listing.setArchivedAt(archivedAt);
        listing.setPropertyType("house");
        listing.setTitle(title);
        listing.setCreatedAt(now);
        listing.setUpdatedAt(now);
        return listingRepository.saveAndFlush(listing).getId();
    }

    private void seedPoi(UUID id, UUID listingId, String name, String category, int distance, String osmId) {
        jdbc.update("INSERT INTO public.listing_pois (id, listing_id, name, category, distance_meters, source, osm_id, "
                        + "approved, pinned) VALUES (?, ?, ?, ?, ?, 'overpass', ?, false, false)",
                id, listingId, name, category, distance, osmId);
    }

    private void seedApprovedPoi(UUID id, UUID listingId, String name, String category, int distance, String osmId) {
        jdbc.update("INSERT INTO public.listing_pois (id, listing_id, name, category, distance_meters, source, osm_id, "
                        + "approved, pinned) VALUES (?, ?, ?, ?, ?, 'overpass', ?, true, false)",
                id, listingId, name, category, distance, osmId);
    }
}

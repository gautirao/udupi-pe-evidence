package com.example.realestate.listing.api;

import com.example.realestate.listing.area.ListingAreaResolutionService;
import com.example.realestate.listing.core.Listing;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.listing.core.ListingStatus;
import com.example.realestate.listing.storage.SupabaseStorageService;
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

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * #2859 B2 (handoff 285902) IT-1: the persisted listing moderation state machine, replacing the browser-level
 * persistence claims of e2e/journey/admin-moderation.spec.ts, e2e/listing-rejection-resubmit.spec.ts,
 * e2e/journey/pending-approvals-review-2369.spec.ts and e2e/journey/listing-lifecycle.spec.ts.
 *
 * <p>Real: the Spring Security filter chain, DbRoleJwtAuthenticationConverter (roles read from {@code user_roles}),
 * {@code @PreAuthorize} method security, CallerInfo resolution, AdminListingController / ListingController,
 * ListingWorkflowService, ListingTransitionPolicy, ListingOwnershipGuard, the JPA repositories, Flyway migrations and
 * the {@code @Async} AFTER_COMMIT NotificationEventListener. Every write is re-read from the database with JDBC.
 *
 * <p>Mocked: {@link ListingAreaResolutionService} (void, would call the geocoder) and {@link SupabaseStorageService}
 * (no storage I/O). Nothing about geocoding, area keys or storage is asserted here.
 *
 * <p>UNTAGGED on purpose: apps/api/pom.xml surefire excludes {@code @Tag("integration")}; this class runs under
 * {@code mvn -f apps/api/pom.xml test -Dtest=ListingModerationLifecycleIT}. Without Docker it is skipped
 * ({@code disabledWithoutDocker}) — cite it only with surefire XML showing tests>0 and skipped=0.
 * Synthetic data only: fixed UUIDs, {@code @test.local} e-mails, literal titles.
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
        "AI_API_KEY=test-dummy-not-used-in-listing-moderation-lifecycle-it",
        "spring.task.scheduling.enabled=false",
        "supabase.storage.enabled=false"
})
class ListingModerationLifecycleIT {

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

    private static final UUID OWNER_ID = UUID.fromString("28590201-0000-0000-0000-000000000001");
    private static final UUID OTHER_BROKER_ID = UUID.fromString("28590202-0000-0000-0000-000000000002");
    private static final UUID ADMIN_ID = UUID.fromString("28590203-0000-0000-0000-000000000003");
    private static final List<UUID> USERS = List.of(OWNER_ID, OTHER_BROKER_ID, ADMIN_ID);

    private static final String VALID_REASON = "INCOMPLETE_INFO: Add the carpet area and a floor plan";
    private static final String FREE_TEXT_REASON = "Photos are blurry";

    @Autowired
    private MockMvc mockMvc;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private ListingRepository listingRepository;

    @MockitoBean
    private ListingAreaResolutionService listingAreaResolutionService;
    @MockitoBean
    private SupabaseStorageService supabaseStorageService;

    private final List<UUID> createdListings = new ArrayList<>();

    @BeforeEach
    void seedUsers() {
        seedUser(OWNER_ID, "it-2859-b2-owner@test.local", "dealer");
        seedUser(OTHER_BROKER_ID, "it-2859-b2-other@test.local", "dealer");
        seedUser(ADMIN_ID, "it-2859-b2-admin@test.local", "admin");
    }

    private void seedUser(UUID id, String email, String role) {
        jdbc.update("INSERT INTO auth.users (id, email) VALUES (?, ?) ON CONFLICT (id) DO NOTHING", id, email);
        jdbc.update("INSERT INTO public.user_roles (user_id, role) VALUES (?, CAST(? AS public.app_role)) "
                + "ON CONFLICT (user_id, role) DO NOTHING", id, role);
    }

    /** Deletes every row this test wrote: rows in any table with a FK to property_listings, then the listings,
     *  the users' notifications / audit rows / roles, and the auth users. Verifies nothing of ours is left. */
    @AfterEach
    void cleanUp() {
        if (!createdListings.isEmpty()) {
            List<Map<String, Object>> fks = jdbc.queryForList("""
                    SELECT DISTINCT tc.table_schema, tc.table_name, kcu.column_name
                    FROM information_schema.table_constraints tc
                    JOIN information_schema.key_column_usage kcu
                      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
                    JOIN information_schema.constraint_column_usage ccu
                      ON tc.constraint_name = ccu.constraint_name
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                      AND ccu.table_schema = 'public' AND ccu.table_name = 'property_listings'
                    """);
            for (UUID id : createdListings) {
                for (Map<String, Object> fk : fks) {
                    jdbc.update("DELETE FROM " + fk.get("table_schema") + "." + fk.get("table_name")
                            + " WHERE " + fk.get("column_name") + " = ?", id);
                }
                // listing_search_outbox.listing_id is TEXT (no FK)
                jdbc.update("DELETE FROM public.listing_search_outbox WHERE listing_id = ?", id.toString());
                jdbc.update("DELETE FROM public.property_listings WHERE id = ?", id);
            }
        }
        for (UUID u : USERS) {
            jdbc.update("DELETE FROM public.notifications WHERE user_id = ?", u);
            jdbc.update("DELETE FROM public.admin_audit_log WHERE admin_id = ?", u);
            jdbc.update("DELETE FROM public.user_roles WHERE user_id = ?", u);
            jdbc.update("DELETE FROM auth.users WHERE id = ?", u);
        }
        for (UUID id : createdListings) {
            assertThat(jdbc.queryForObject("SELECT count(*) FROM public.property_listings WHERE id = ?",
                    Long.class, id)).as("cleanup left listing %s", id).isZero();
        }
        createdListings.clear();
    }

    // ── helpers ──────────────────────────────────────────────────────────────────────────────

    /** A listing that passes both completeness gates (submit + admin approve): sale house, price > 0,
     *  locality, confirmed address and exactly 3 images. */
    private UUID seedCompleteListing(ListingStatus status, String title) {
        OffsetDateTime now = OffsetDateTime.now();
        Listing l = new Listing();
        l.setCreatedBy(OWNER_ID);
        l.setStatus(status.toDbValue());
        l.setPropertyType("house");
        l.setSellerType("broker");
        l.setListingPurpose("sale");
        l.setTitle(title);
        l.setLocality("Synthetic Locality 2859");
        l.setPrice(new BigDecimal("5000000"));
        l.setAddressConfirmed(true);
        l.setSubmissionCount(status == ListingStatus.DRAFT || status == ListingStatus.LIVE ? 0 : 1);
        if (status == ListingStatus.REJECTED) {
            l.setRejectionReason("OTHER: synthetic earlier rejection");
        }
        l.setCreatedAt(now);
        l.setUpdatedAt(now);
        UUID id = listingRepository.saveAndFlush(l).getId();
        createdListings.add(id);
        for (int i = 0; i < 3; i++) {
            jdbc.update("INSERT INTO public.listing_images (id, listing_id, storage_path, url, position, created_at) "
                            + "VALUES (?, ?, ?, ?, ?, now())",
                    UUID.randomUUID(), id, "it-2859/" + i + ".jpg", "http://127.0.0.1:1/it-2859/" + i + ".jpg", i);
        }
        return id;
    }

    private Map<String, Object> row(UUID id) {
        return jdbc.queryForMap("SELECT status, title, rejection_reason, status_reason_code, status_reason_note, "
                + "rejected_at, approved_at, archived_at, submission_count FROM public.property_listings WHERE id = ?", id);
    }

    private long history(UUID id, String from, String to) {
        return jdbc.queryForObject("SELECT count(*) FROM public.listing_status_history "
                + "WHERE listing_id = ? AND from_status = ? AND to_status = ?", Long.class, id, from, to);
    }

    private long historyTotal(UUID id) {
        return jdbc.queryForObject("SELECT count(*) FROM public.listing_status_history WHERE listing_id = ?",
                Long.class, id);
    }

    private static String bearer(UUID user) {
        return "Bearer " + user;
    }

    private static String json(String key, String value) {
        return "{\"" + key + "\":\"" + value.replace("\"", "\\\"") + "\"}";
    }

    // ── tests ────────────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("AM2.e / PA3.d / RR1.1 / RR1.2 / AM3.d: dealer reject 403 + free-text 400 leave state unchanged; "
            + "valid code -> REJECTED with the FULL reason in 3 columns + 1 history row; broker /mine?status=REJECTED returns it")
    void reject_validCodePersistsFullReason_dealerAndFreeTextRefusedWithStateUnchanged() throws Exception {
        UUID id = seedCompleteListing(ListingStatus.PENDING_REVIEW, "IT-2859-B2 reject target");

        mockMvc.perform(get("/api/listings/mine").param("status", "REJECTED").header("Authorization", bearer(OWNER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id=='" + id + "')]").doesNotExist());

        // a dealer (the owner) cannot reject — real filter chain + DB role lookup
        mockMvc.perform(post("/api/admin/listings/" + id + "/reject").header("Authorization", bearer(OWNER_ID))
                        .contentType(MediaType.APPLICATION_JSON).content(json("rejectionReason", VALID_REASON)))
                .andExpect(status().isForbidden());
        assertThat(row(id).get("status")).isEqualTo("PENDING_REVIEW");
        assertThat(row(id).get("rejection_reason")).isNull();
        assertThat(historyTotal(id)).isZero();

        // RR1.1 (STALE in the legacy spec): a free-text reason is refused with 400; nothing changes
        mockMvc.perform(post("/api/admin/listings/" + id + "/reject").header("Authorization", bearer(ADMIN_ID))
                        .contentType(MediaType.APPLICATION_JSON).content(json("rejectionReason", FREE_TEXT_REASON)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("Unrecognized rejection code: " + FREE_TEXT_REASON));
        assertThat(row(id).get("status")).isEqualTo("PENDING_REVIEW");
        assertThat(row(id).get("rejection_reason")).isNull();
        assertThat(historyTotal(id)).isZero();

        // positive control in the same test: a valid code is accepted
        mockMvc.perform(post("/api/admin/listings/" + id + "/reject").header("Authorization", bearer(ADMIN_ID))
                        .contentType(MediaType.APPLICATION_JSON).content(json("rejectionReason", VALID_REASON)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("REJECTED"))
                .andExpect(jsonPath("$.rejectionReason").value(VALID_REASON));

        Map<String, Object> after = row(id);
        assertThat(after.get("status")).isEqualTo("REJECTED");
        assertThat(after.get("rejection_reason")).isEqualTo(VALID_REASON);
        assertThat(after.get("status_reason_code")).isEqualTo(VALID_REASON);
        assertThat(after.get("status_reason_note")).isEqualTo(VALID_REASON);
        assertThat(after.get("rejected_at")).isNotNull();
        assertThat(history(id, "PENDING_REVIEW", "REJECTED")).isEqualTo(1L);
        assertThat(historyTotal(id)).isEqualTo(1L);
        assertThat(jdbc.queryForObject("SELECT reason_code || '|' || note FROM public.listing_status_history "
                + "WHERE listing_id = ? AND to_status = 'REJECTED'", String.class, id))
                .isEqualTo(VALID_REASON + "|" + VALID_REASON);

        // AM3.d / RR1.2: the broker's own Rejected tab returns the row with the reason
        mockMvc.perform(get("/api/listings/mine").param("status", "REJECTED").header("Authorization", bearer(OWNER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id=='" + id + "')].status").value("REJECTED"))
                .andExpect(jsonPath("$.content[?(@.id=='" + id + "')].rejectionReason").value(VALID_REASON));
        // ... and not another broker's
        mockMvc.perform(get("/api/listings/mine").param("status", "REJECTED")
                        .header("Authorization", bearer(OTHER_BROKER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[?(@.id=='" + id + "')]").doesNotExist());
    }

    @Test
    @DisplayName("AM1.e / PA1.d / PA4.c / L5.c: dealer approve 403 unchanged; admin approve -> LIVE + 1 history row; "
            + "second approve -> 409 still 1 row; listing_approved notification with metadata listing_id")
    void approve_thenSecondApproveConflicts_andNotifiesOwnerWithListingIdMetadata() throws Exception {
        UUID id = seedCompleteListing(ListingStatus.PENDING_REVIEW, "IT-2859-B2 approve target");

        mockMvc.perform(post("/api/admin/listings/" + id + "/approve").header("Authorization", bearer(OWNER_ID)))
                .andExpect(status().isForbidden());
        assertThat(row(id).get("status")).isEqualTo("PENDING_REVIEW");
        assertThat(row(id).get("approved_at")).isNull();
        assertThat(historyTotal(id)).isZero();

        mockMvc.perform(post("/api/admin/listings/" + id + "/approve").header("Authorization", bearer(ADMIN_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("LIVE"));
        assertThat(row(id).get("status")).isEqualTo("LIVE");
        assertThat(row(id).get("approved_at")).isNotNull();
        assertThat(history(id, "PENDING_REVIEW", "LIVE")).isEqualTo(1L);

        // PA4.c: the stale second approve is a 409 and writes no second history row
        mockMvc.perform(post("/api/admin/listings/" + id + "/approve").header("Authorization", bearer(ADMIN_ID)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error", containsString("LIVE")));
        assertThat(row(id).get("status")).isEqualTo("LIVE");
        assertThat(history(id, "PENDING_REVIEW", "LIVE")).isEqualTo(1L);
        assertThat(history(id, "LIVE", "LIVE")).isZero();
        assertThat(historyTotal(id)).isEqualTo(1L);

        // L5.c: @Async AFTER_COMMIT listener — bounded poll (10 s, 100 ms)
        long found = 0;
        long deadline = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < deadline) {
            found = jdbc.queryForObject("SELECT count(*) FROM public.notifications WHERE user_id = ? "
                    + "AND type = 'listing_approved' AND metadata ->> 'listing_id' = ?", Long.class, OWNER_ID, id.toString());
            if (found > 0) break;
            Thread.sleep(100);
        }
        assertThat(found).as("listing_approved notification with metadata.listing_id within 10 s").isEqualTo(1L);
        assertThat(jdbc.queryForObject("SELECT title FROM public.notifications WHERE user_id = ? "
                + "AND type = 'listing_approved' AND metadata ->> 'listing_id' = ?", String.class, OWNER_ID, id.toString()))
                .isEqualTo("Listing approved");
    }

    @Test
    @DisplayName("PA2.d: dealer return-for-edits 403 and blank note 422 leave state unchanged; with a note -> DRAFT, "
            + "status_reason_note = note, rejected_at NULL, 1 history row")
    void returnForEdits_requiresAdminAndNote_persistsDraftWithNote() throws Exception {
        UUID id = seedCompleteListing(ListingStatus.PENDING_REVIEW, "IT-2859-B2 return target");
        String note = "Please add a floor plan photo";

        mockMvc.perform(post("/api/admin/listings/" + id + "/return-for-edits").header("Authorization", bearer(OWNER_ID))
                        .contentType(MediaType.APPLICATION_JSON).content(json("note", note)))
                .andExpect(status().isForbidden());
        assertThat(row(id).get("status")).isEqualTo("PENDING_REVIEW");
        assertThat(historyTotal(id)).isZero();

        mockMvc.perform(post("/api/admin/listings/" + id + "/return-for-edits").header("Authorization", bearer(ADMIN_ID))
                        .contentType(MediaType.APPLICATION_JSON).content(json("note", "   ")))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.code").value("RETURN_NOTE_REQUIRED"));
        assertThat(row(id).get("status")).isEqualTo("PENDING_REVIEW");
        assertThat(row(id).get("status_reason_note")).isNull();
        assertThat(historyTotal(id)).isZero();

        mockMvc.perform(post("/api/admin/listings/" + id + "/return-for-edits").header("Authorization", bearer(ADMIN_ID))
                        .contentType(MediaType.APPLICATION_JSON).content(json("note", note)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"));
        Map<String, Object> after = row(id);
        assertThat(after.get("status")).isEqualTo("DRAFT");
        assertThat(after.get("status_reason_note")).isEqualTo(note);
        assertThat(after.get("rejected_at")).isNull();
        assertThat(history(id, "PENDING_REVIEW", "DRAFT")).isEqualTo(1L);
        assertThat(jdbc.queryForObject("SELECT note FROM public.listing_status_history WHERE listing_id = ? "
                + "AND to_status = 'DRAFT'", String.class, id)).isEqualTo(note);
    }

    @Test
    @DisplayName("RR1.7 / RR1.9: REJECTED listing — another broker's PUT 403 unchanged; owner PUT title persists; "
            + "owner resubmit -> PENDING_REVIEW, submission_count 2, 1 REJECTED->PENDING_REVIEW history row")
    void rejectedListing_ownerEditsAndResubmits_toPendingReview() throws Exception {
        UUID id = seedCompleteListing(ListingStatus.REJECTED, "IT-2859-B2 rejected original");

        mockMvc.perform(put("/api/listings/" + id).header("Authorization", bearer(OTHER_BROKER_ID))
                        .contentType(MediaType.APPLICATION_JSON).content(json("title", "IT-2859-B2 hijacked")))
                .andExpect(status().isForbidden());
        assertThat(row(id).get("title")).isEqualTo("IT-2859-B2 rejected original");

        mockMvc.perform(put("/api/listings/" + id).header("Authorization", bearer(OWNER_ID))
                        .contentType(MediaType.APPLICATION_JSON).content(json("title", "IT-2859-B2 rejected edited")))
                .andExpect(status().isOk());
        assertThat(row(id).get("title")).isEqualTo("IT-2859-B2 rejected edited");
        assertThat(row(id).get("status")).isEqualTo("REJECTED");

        mockMvc.perform(post("/api/listings/" + id + "/submit").header("Authorization", bearer(OWNER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PENDING_REVIEW"));
        Map<String, Object> after = row(id);
        assertThat(after.get("status")).isEqualTo("PENDING_REVIEW");
        assertThat(((Number) after.get("submission_count")).intValue()).isEqualTo(2);
        assertThat(after.get("title")).isEqualTo("IT-2859-B2 rejected edited");
        assertThat(history(id, "REJECTED", "PENDING_REVIEW")).isEqualTo(1L);
    }

    @Test
    @DisplayName("LC1.P1c / LC1.P2c: non-owner GET/archive/reopen 403 unchanged (owner controls); owner archive LIVE -> "
            + "ARCHIVED (archived_at set, history), archived row 404s owner PUT; reopen-as-draft -> DRAFT, archived_at NULL")
    void brokerArchiveThenReopenAsDraft_ownershipEnforced_archivedAtCleared() throws Exception {
        UUID id = seedCompleteListing(ListingStatus.LIVE, "IT-2859-B2 lifecycle target");

        mockMvc.perform(get("/api/listings/" + id).header("Authorization", bearer(OTHER_BROKER_ID)))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/listings/" + id).header("Authorization", bearer(OWNER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("LIVE"));

        mockMvc.perform(post("/api/listings/" + id + "/archive").header("Authorization", bearer(OTHER_BROKER_ID)))
                .andExpect(status().isForbidden());
        assertThat(row(id).get("status")).isEqualTo("LIVE");
        assertThat(row(id).get("archived_at")).isNull();

        mockMvc.perform(post("/api/listings/" + id + "/archive").header("Authorization", bearer(OWNER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ARCHIVED"));
        assertThat(row(id).get("status")).isEqualTo("ARCHIVED");
        assertThat(row(id).get("archived_at")).isNotNull();
        assertThat(history(id, "LIVE", "ARCHIVED")).isEqualTo(1L);

        // the owner still reads the archived row, but owner-scoped writes treat it as gone
        mockMvc.perform(get("/api/listings/" + id).header("Authorization", bearer(OWNER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ARCHIVED"));
        mockMvc.perform(put("/api/listings/" + id).header("Authorization", bearer(OWNER_ID))
                        .contentType(MediaType.APPLICATION_JSON).content(json("title", "IT-2859-B2 edit while archived")))
                .andExpect(status().isNotFound());
        assertThat(row(id).get("title")).isEqualTo("IT-2859-B2 lifecycle target");

        mockMvc.perform(post("/api/listings/" + id + "/reopen-as-draft").header("Authorization", bearer(OTHER_BROKER_ID)))
                .andExpect(status().isForbidden());
        assertThat(row(id).get("status")).isEqualTo("ARCHIVED");

        mockMvc.perform(post("/api/listings/" + id + "/reopen-as-draft").header("Authorization", bearer(OWNER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"));
        assertThat(row(id).get("status")).isEqualTo("DRAFT");
        assertThat(row(id).get("archived_at")).isNull();
        assertThat(history(id, "ARCHIVED", "DRAFT")).isEqualTo(1L);
    }

    @Test
    @DisplayName("B1 carry-over (INV4a-a.3 / INV4a-c.2 backend half / INV4a-d.3): dealer admin-archive/restore 403 "
            + "unchanged; admin archive -> ARCHIVED + note + history; admin restore -> DRAFT, archived_at NULL; again -> 409")
    void b1CarryOver_adminArchiveAndRestore_persist() throws Exception {
        UUID id = seedCompleteListing(ListingStatus.LIVE, "IT-2859-B2 admin archive target");
        String reason = "Synthetic admin archive note 2859";

        mockMvc.perform(post("/api/admin/listings/" + id + "/archive").header("Authorization", bearer(OWNER_ID))
                        .contentType(MediaType.APPLICATION_JSON).content(json("reasonNote", reason)))
                .andExpect(status().isForbidden());
        assertThat(row(id).get("status")).isEqualTo("LIVE");
        assertThat(row(id).get("archived_at")).isNull();
        assertThat(historyTotal(id)).isZero();

        mockMvc.perform(post("/api/admin/listings/" + id + "/archive").header("Authorization", bearer(ADMIN_ID))
                        .contentType(MediaType.APPLICATION_JSON).content(json("reasonNote", reason)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ARCHIVED"));
        assertThat(row(id).get("status")).isEqualTo("ARCHIVED");
        assertThat(row(id).get("archived_at")).isNotNull();
        assertThat(row(id).get("status_reason_note")).isEqualTo(reason);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM public.listing_status_history WHERE listing_id = ? "
                + "AND from_status = 'LIVE' AND to_status = 'ARCHIVED' AND actor_type = 'ADMIN'", Long.class, id))
                .isEqualTo(1L);

        mockMvc.perform(post("/api/admin/listings/" + id + "/restore").header("Authorization", bearer(OWNER_ID)))
                .andExpect(status().isForbidden());
        assertThat(row(id).get("status")).isEqualTo("ARCHIVED");
        assertThat(row(id).get("archived_at")).isNotNull();

        mockMvc.perform(post("/api/admin/listings/" + id + "/restore").header("Authorization", bearer(ADMIN_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"));
        assertThat(row(id).get("status")).isEqualTo("DRAFT");
        assertThat(row(id).get("archived_at")).isNull();

        mockMvc.perform(post("/api/admin/listings/" + id + "/restore").header("Authorization", bearer(ADMIN_ID)))
                .andExpect(status().isConflict());
        assertThat(row(id).get("status")).isEqualTo("DRAFT");
    }
}

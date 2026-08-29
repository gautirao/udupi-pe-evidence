package com.example.realestate.notification;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Tag;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Full-context regression guard for the PR #2392 review finding: {@code NotificationController
 * #markAllAsRead} calls a custom {@code @Modifying @Query} bulk-update repository method, which
 * requires an active transaction. {@link NotificationControllerTest} mocks the repository via
 * {@code @WebMvcTest}, so it cannot detect a missing {@code @Transactional} boundary — the mock
 * never touches an {@code EntityManager}.
 *
 * <p>This test boots the real Spring context (real {@code TransactionManager}, real
 * {@code NotificationRepository}, real Postgres via Testcontainers) and drives the endpoint over
 * MockMvc with no test-level {@code @Transactional} of its own, so it exercises exactly the
 * runtime path production traffic takes. Without {@code @Transactional} on the controller method,
 * this test fails with a 5xx wrapping {@code TransactionRequiredException}.
 */
@Tag("integration")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@Testcontainers(disabledWithoutDocker = true)
@TestPropertySource(properties = {
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        // V73 has CREATE INDEX CONCURRENTLY mixed with transactional DDL.
        "spring.flyway.mixed=true",
        // CONCURRENTLY deadlocks on arm64/Rosetta with Flyway VIDs; disable for Testcontainers.
        "spring.flyway.placeholders.concurrently_keyword=",
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        // Override issuer-uri so no OIDC discovery is attempted against Supabase.
        // TestJwtDecoderConfig below provides a custom JwtDecoder; @ConditionalOnMissingBean
        // backs the auto-configured decoder off, so this property is never used to build one.
        "spring.security.oauth2.resourceserver.jwt.issuer-uri=https://test.example.com/auth/v1",
        // AiClient requires ${AI_API_KEY} with no default; provide a dummy so context starts.
        "AI_API_KEY=test-dummy-not-used-in-notification-it",
        "spring.task.scheduling.enabled=false"
})
class NotificationMarkAllAsReadIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4-alpine")
                    .asCompatibleSubstituteFor("postgres"));

    /**
     * The raw Bearer token value IS the UUID subject — mirrors {@code RbacSmokeIT}'s
     * TestJwtDecoderConfig so no real Supabase JWKS/issuer is needed.
     */
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

    private static final UUID USER_A = UUID.fromString("20720001-0000-0000-0000-000000000001");
    private static final UUID USER_B = UUID.fromString("20720002-0000-0000-0000-000000000002");

    @AfterEach
    void cleanup() {
        jdbc.update("DELETE FROM public.notifications WHERE user_id IN (?, ?)", USER_A, USER_B);
    }

    @Test
    @DisplayName("PUT /api/notifications/read-all runs the bulk update in a real transaction and returns 204")
    void markAllAsRead_realTransaction_updatesOnlyCallersUnreadRows() throws Exception {
        UUID unread1 = seedNotification(USER_A, false);
        UUID unread2 = seedNotification(USER_A, false);
        UUID alreadyRead = seedNotification(USER_A, true);
        UUID otherUserUnread = seedNotification(USER_B, false);

        mockMvc.perform(put("/api/notifications/read-all")
                        .header("Authorization", "Bearer " + USER_A))
                .andExpect(status().isNoContent());

        assertThat(isRead(unread1)).as("previously-unread notification for the caller").isTrue();
        assertThat(isRead(unread2)).as("previously-unread notification for the caller").isTrue();
        assertThat(isRead(alreadyRead)).as("already-read notification for the caller").isTrue();
        assertThat(isRead(otherUserUnread)).as("another user's unread notification must be untouched").isFalse();
    }

    private UUID seedNotification(UUID userId, boolean read) {
        UUID id = UUID.randomUUID();
        jdbc.update(
                "INSERT INTO public.notifications (id, user_id, type, title, message, metadata, is_read, created_at) "
                        + "VALUES (?, ?, 'listing_approved', 'Test', 'Test message', '{}'::jsonb, ?, now())",
                id, userId, read);
        return id;
    }

    private boolean isRead(UUID id) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT is_read FROM public.notifications WHERE id = ?", Boolean.class, id));
    }
}

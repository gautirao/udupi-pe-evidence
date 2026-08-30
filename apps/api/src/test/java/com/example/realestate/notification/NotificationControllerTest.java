package com.example.realestate.notification;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import com.example.realestate.security.UserRoleService;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * WebMvcTest for NotificationController.
 * Uses jwt() post-processor; mocks NotificationRepository.
 */
@WebMvcTest(
        controllers = NotificationController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import(NotificationControllerTest.TestConfig.class)
class NotificationControllerTest {

    private static final UUID USER_A = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID USER_B = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID NOTIF_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");

    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                    .build();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private NotificationRepository notificationRepository;

    @BeforeEach
    void setUp() {
        reset(notificationRepository);
    }

    // ==================== Test 1: GET notifications -> 200 with Page shape ====================

    @Test
    void list_returnsNotificationsForUser() throws Exception {
        Notification n = buildNotification(NOTIF_ID, USER_A, "listing_approved",
                "Listing approved", "Your listing was approved.", false);
        when(notificationRepository.findByUserId(eq(USER_A), any()))
                .thenReturn(new PageImpl<>(List.of(n), PageRequest.of(0, 20), 1));

        mockMvc.perform(get("/api/notifications")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(1))
                .andExpect(jsonPath("$.content[0].id").value(NOTIF_ID.toString()))
                .andExpect(jsonPath("$.content[0].type").value("listing_approved"))
                .andExpect(jsonPath("$.content[0].title").value("Listing approved"))
                .andExpect(jsonPath("$.content[0].message").value("Your listing was approved."))
                .andExpect(jsonPath("$.content[0].isRead").value(false))
                .andExpect(jsonPath("$.page.totalElements").value(1))
                .andExpect(jsonPath("$.page.totalPages").value(1));

        verify(notificationRepository).findByUserId(eq(USER_A), any());
    }

    // ==================== Test 2: GET notifications empty -> 200 with empty Page ====================

    @Test
    void list_emptyReturnsEmptyPage() throws Exception {
        when(notificationRepository.findByUserId(eq(USER_A), any()))
                .thenReturn(new PageImpl<>(List.of(), PageRequest.of(0, 20), 0));

        mockMvc.perform(get("/api/notifications")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content.length()").value(0))
                .andExpect(jsonPath("$.page.totalElements").value(0));
    }

    // ==================== Test 3: GET notifications without JWT -> 403 ====================

    @Test
    void list_withoutJwt_returns403() throws Exception {
        mockMvc.perform(get("/api/notifications"))
                .andExpect(status().isForbidden());
    }

    // ==================== Test 4: GET unread-count -> 200 ====================

    @Test
    void unreadCount_returnsCount() throws Exception {
        when(notificationRepository.countByUserIdAndIsReadFalse(USER_A)).thenReturn(3L);

        mockMvc.perform(get("/api/notifications/unread-count")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.count").value(3));

        verify(notificationRepository).countByUserIdAndIsReadFalse(USER_A);
    }

    // ==================== Test 5: PUT read -> 204 ====================

    @Test
    void markAsRead_unreadNotification_returns204() throws Exception {
        Notification n = buildNotification(NOTIF_ID, USER_A, "listing_approved",
                "Approved", "Approved.", false);
        when(notificationRepository.findByIdAndUserId(NOTIF_ID, USER_A))
                .thenReturn(Optional.of(n));

        mockMvc.perform(put("/api/notifications/" + NOTIF_ID + "/read")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString()))))
                .andExpect(status().isNoContent());

        verify(notificationRepository).save(n);
    }

    // ==================== Test 6: PUT read already read (idempotent) -> 204 ====================

    @Test
    void markAsRead_alreadyRead_returns204WithoutSave() throws Exception {
        Notification n = buildNotification(NOTIF_ID, USER_A, "listing_approved",
                "Approved", "Approved.", true);
        when(notificationRepository.findByIdAndUserId(NOTIF_ID, USER_A))
                .thenReturn(Optional.of(n));

        mockMvc.perform(put("/api/notifications/" + NOTIF_ID + "/read")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString()))))
                .andExpect(status().isNoContent());

        verify(notificationRepository, never()).save(any());
    }

    // ==================== Test 7: PUT read not found -> 404 ====================

    @Test
    void markAsRead_notFound_returns404() throws Exception {
        when(notificationRepository.findByIdAndUserId(NOTIF_ID, USER_A))
                .thenReturn(Optional.empty());

        mockMvc.perform(put("/api/notifications/" + NOTIF_ID + "/read")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Notification not found"));
    }

    // ==================== Test 8: PUT read other user's notification -> 404 ====================

    @Test
    void markAsRead_otherUsersNotification_returns404() throws Exception {
        // findByIdAndUserId with USER_B won't find USER_A's notification
        when(notificationRepository.findByIdAndUserId(NOTIF_ID, USER_B))
                .thenReturn(Optional.empty());

        mockMvc.perform(put("/api/notifications/" + NOTIF_ID + "/read")
                        .with(jwt().jwt(j -> j.subject(USER_B.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Notification not found"));
    }

    // ==================== Test 9: PUT read-all -> 204 ====================

    @Test
    void markAllAsRead_returns204() throws Exception {
        when(notificationRepository.markAllAsReadByUserId(USER_A)).thenReturn(5);

        mockMvc.perform(put("/api/notifications/read-all")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString()))))
                .andExpect(status().isNoContent());

        verify(notificationRepository).markAllAsReadByUserId(USER_A);
    }

    // ==================== Test 10: PUT read-all without JWT -> 403 ====================

    @Test
    void markAllAsRead_withoutJwt_returns403() throws Exception {
        mockMvc.perform(put("/api/notifications/read-all"))
                .andExpect(status().isForbidden());

        verify(notificationRepository, never()).markAllAsReadByUserId(any());
    }

    // ==================== Helper ====================

    private Notification buildNotification(UUID id, UUID userId, String type,
                                            String title, String message, boolean isRead) {
        Notification n = new Notification();
        n.setId(id);
        n.setUserId(userId);
        n.setType(type);
        n.setTitle(title);
        n.setMessage(message);
        n.setRead(isRead);
        n.setCreatedAt(OffsetDateTime.now());
        return n;
    }
}

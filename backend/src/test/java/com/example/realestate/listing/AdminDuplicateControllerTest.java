package com.example.realestate.listing;

import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * WebMvcTest for AdminDuplicateController.
 * Uses jwt() post-processor to inject JwtAuthenticationToken; mocks service beans.
 */
@WebMvcTest(
        controllers = AdminDuplicateController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import(AdminDuplicateControllerTest.TestConfig.class)
class AdminDuplicateControllerTest {

    private static final UUID ADMIN_ID     = UUID.fromString("00000000-0000-0000-0000-000000000010");
    private static final UUID DEALER_ID    = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID CANDIDATE_ID = UUID.fromString("00000000-0000-0000-0000-000000000099");
    private static final UUID LISTING_A_ID = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID LISTING_B_ID = UUID.fromString("00000000-0000-0000-0000-000000000003");

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
    private DuplicateCandidateService duplicateCandidateService;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(duplicateCandidateService, userRoleService);
    }

    // ==================== GET /api/admin/duplicates ====================

    @Test
    void list_withAdminRole_returns200WithPageContent() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));

        DuplicateCandidate candidate = buildCandidate();
        Page<DuplicateCandidate> page = new PageImpl<>(
                List.of(candidate), PageRequest.of(0, 20), 1);
        when(duplicateCandidateService.getPage(0, 20)).thenReturn(page);

        mockMvc.perform(get("/api/admin/duplicates")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content").isArray())
                .andExpect(jsonPath("$.content[0].status").value("PENDING"))
                .andExpect(jsonPath("$.page.totalElements").value(1));

        verify(duplicateCandidateService).getPage(0, 20);
    }

    // ==================== POST /api/admin/duplicates/{id}/confirm ====================

    @Test
    void confirm_withAdminRole_returns200() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        doNothing().when(duplicateCandidateService).confirm(CANDIDATE_ID, ADMIN_ID);

        mockMvc.perform(post("/api/admin/duplicates/" + CANDIDATE_ID + "/confirm")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Duplicate confirmed"));

        verify(duplicateCandidateService).confirm(CANDIDATE_ID, ADMIN_ID);
    }

    // ==================== POST /api/admin/duplicates/{id}/dismiss ====================

    @Test
    void dismiss_withAdminRole_returns200() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        doNothing().when(duplicateCandidateService).dismiss(CANDIDATE_ID, ADMIN_ID);

        mockMvc.perform(post("/api/admin/duplicates/" + CANDIDATE_ID + "/dismiss")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Duplicate dismissed"));

        verify(duplicateCandidateService).dismiss(CANDIDATE_ID, ADMIN_ID);
    }

    // ==================== POST /api/admin/duplicates/{id}/undo ====================

    @Test
    void undo_withAdminRole_returns200() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        doNothing().when(duplicateCandidateService).undo(CANDIDATE_ID, ADMIN_ID);

        mockMvc.perform(post("/api/admin/duplicates/" + CANDIDATE_ID + "/undo")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Duplicate review undone"));

        verify(duplicateCandidateService).undo(CANDIDATE_ID, ADMIN_ID);
    }

    // ==================== Error paths ====================

    @Test
    void confirm_notFound_returns404() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        doThrow(new DuplicateCandidateService.DuplicateCandidateNotFoundException(CANDIDATE_ID))
                .when(duplicateCandidateService).confirm(CANDIDATE_ID, ADMIN_ID);

        mockMvc.perform(post("/api/admin/duplicates/" + CANDIDATE_ID + "/confirm")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value(
                        "Duplicate candidate not found: " + CANDIDATE_ID));
    }

    @Test
    void confirm_notPending_returns409() throws Exception {
        when(userRoleService.getUserRole(ADMIN_ID)).thenReturn(Optional.of("admin"));
        doThrow(new IllegalStateException("Candidate is not PENDING"))
                .when(duplicateCandidateService).confirm(CANDIDATE_ID, ADMIN_ID);

        mockMvc.perform(post("/api/admin/duplicates/" + CANDIDATE_ID + "/confirm")
                        .with(jwt().jwt(j -> j.subject(ADMIN_ID.toString()))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Candidate is not PENDING"));
    }

    // ==================== Auth guard ====================

    @Test
    void confirm_withDealerRole_returns403() throws Exception {
        when(userRoleService.getUserRole(DEALER_ID)).thenReturn(Optional.of("dealer"));

        mockMvc.perform(post("/api/admin/duplicates/" + CANDIDATE_ID + "/confirm")
                        .with(jwt().jwt(j -> j.subject(DEALER_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires admin role"));

        verify(duplicateCandidateService, never()).confirm(any(), any());
    }

    // ==================== Helper ====================

    private DuplicateCandidate buildCandidate() {
        DuplicateCandidate c = new DuplicateCandidate();
        c.setListingIdA(LISTING_A_ID);
        c.setListingIdB(LISTING_B_ID);
        c.setSimilarityScore(new BigDecimal("0.92"));
        c.setDistanceMeters(new BigDecimal("45.00"));
        c.setStatus(DuplicateCandidateStatus.PENDING);
        setIdViaReflection(c, CANDIDATE_ID);
        setCreatedAtViaReflection(c);
        return c;
    }

    private static void setIdViaReflection(DuplicateCandidate candidate, UUID id) {
        try {
            java.lang.reflect.Field field = DuplicateCandidate.class.getDeclaredField("id");
            field.setAccessible(true);
            field.set(candidate, id);
        } catch (Exception e) {
            throw new RuntimeException("Failed to set id via reflection in test", e);
        }
    }

    private static void setCreatedAtViaReflection(DuplicateCandidate candidate) {
        try {
            java.lang.reflect.Field field = DuplicateCandidate.class.getDeclaredField("createdAt");
            field.setAccessible(true);
            field.set(candidate, Instant.now());
        } catch (Exception e) {
            throw new RuntimeException("Failed to set createdAt via reflection in test", e);
        }
    }
}

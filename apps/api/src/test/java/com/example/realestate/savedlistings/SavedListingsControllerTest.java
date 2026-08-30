package com.example.realestate.savedlistings;

import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Controller-level tests for #1566 saved-homes. Mocks {@link SavedListingsService}
 * so these are pure MockMvc/security tests — the repository/JPA/FK behavior is
 * covered separately by {@link SavedListingsRepositoryIT}.
 */
@WebMvcTest(
        controllers = SavedListingsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import(SavedListingsControllerTest.TestConfig.class)
class SavedListingsControllerTest {

    private static final UUID USER_A = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final UUID USER_B = UUID.fromString("00000000-0000-0000-0000-000000000002");
    private static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-0000000000aa");

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
    private SavedListingsService savedListingsService;

    @BeforeEach
    void setUp() {
        reset(savedListingsService);
    }

    // ==================== POST — save ====================

    @Test
    void save_newListing_returns201() throws Exception {
        when(savedListingsService.save(USER_A, LISTING_ID))
                .thenReturn(SavedListingsService.SaveOutcome.CREATED);

        mockMvc.perform(post("/api/me/saved-listings")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"listingId\":\"" + LISTING_ID + "\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.saved").value(true));
    }

    @Test
    void save_duplicateListing_returns200Idempotent() throws Exception {
        when(savedListingsService.save(USER_A, LISTING_ID))
                .thenReturn(SavedListingsService.SaveOutcome.ALREADY_SAVED);

        mockMvc.perform(post("/api/me/saved-listings")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"listingId\":\"" + LISTING_ID + "\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.saved").value(true));

        // idempotent: service.save invoked once per request, never creates a second row
        verify(savedListingsService, times(1)).save(USER_A, LISTING_ID);
    }

    @Test
    void save_nonexistentListing_returns404() throws Exception {
        when(savedListingsService.save(USER_A, LISTING_ID))
                .thenReturn(SavedListingsService.SaveOutcome.LISTING_NOT_FOUND);

        mockMvc.perform(post("/api/me/saved-listings")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"listingId\":\"" + LISTING_ID + "\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Listing not found"));
    }

    @Test
    void save_nullListingId_returns400() throws Exception {
        mockMvc.perform(post("/api/me/saved-listings")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"listingId\":null}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("listingId is required"));

        verifyNoInteractions(savedListingsService);
    }

    @Test
    void save_blankListingId_returns400() throws Exception {
        mockMvc.perform(post("/api/me/saved-listings")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString())))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"listingId\":\"   \"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("listingId is required"));
    }

    @Test
    void save_withoutJwt_returnsUnauthenticatedStatus() throws Exception {
        mockMvc.perform(post("/api/me/saved-listings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"listingId\":\"" + LISTING_ID + "\"}"))
                .andExpect(status().is4xxClientError());

        verifyNoInteractions(savedListingsService);
    }

    // ==================== DELETE — unsave ====================

    @Test
    void delete_ownRow_returns204() throws Exception {
        mockMvc.perform(delete("/api/me/saved-listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(USER_A.toString()))))
                .andExpect(status().isNoContent());

        verify(savedListingsService).unsave(USER_A, LISTING_ID);
    }

    @Test
    void delete_absentRow_isStillIdempotent204() throws Exception {
        // Service.unsave is a delete-if-present no-op; the controller always returns 204
        // regardless of whether a row existed — assert the contract, not the (absent) row count.
        mockMvc.perform(delete("/api/me/saved-listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(USER_A.toString()))))
                .andExpect(status().isNoContent());

        verify(savedListingsService).unsave(USER_A, LISTING_ID);
    }

    @Test
    void delete_neverTouchesAnotherUsersRow() throws Exception {
        // IDOR guard at the controller boundary: userId always comes from the caller's own
        // JWT subject, so a DELETE from user B can only ever be scoped to (userB, listingId) —
        // it is structurally incapable of naming user A's row.
        mockMvc.perform(delete("/api/me/saved-listings/" + LISTING_ID)
                        .with(jwt().jwt(j -> j.subject(USER_B.toString()))))
                .andExpect(status().isNoContent());

        verify(savedListingsService).unsave(USER_B, LISTING_ID);
        verify(savedListingsService, never()).unsave(eq(USER_A), any());
    }

    @Test
    void delete_withoutJwt_returnsUnauthenticatedStatus() throws Exception {
        mockMvc.perform(delete("/api/me/saved-listings/" + LISTING_ID))
                .andExpect(status().is4xxClientError());

        verifyNoInteractions(savedListingsService);
    }

    // ==================== GET — list ====================

    @Test
    void list_returnsOnlyCallersOwnSaves() throws Exception {
        SavedListingCard cardA = new SavedListingCard(
                UUID.randomUUID(), LISTING_ID, "2026-01-01T00:00:00Z", "Nice house", 5_000_000_00L,
                "house", "Manipal", "http://img/1.jpg", "sale", 3, 2, 1200.0, "sq ft", null, null,
                "LIVE", true);

        when(savedListingsService.listSaved(USER_A)).thenReturn(List.of(cardA));
        when(savedListingsService.listSaved(USER_B)).thenReturn(List.of());

        mockMvc.perform(get("/api/me/saved-listings")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].listingId").value(LISTING_ID.toString()))
                .andExpect(jsonPath("$[0].available").value(true));

        mockMvc.perform(get("/api/me/saved-listings")
                        .with(jwt().jwt(j -> j.subject(USER_B.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(0));
    }

    @Test
    void list_archivedListing_badgedNotAvailable() throws Exception {
        SavedListingCard archivedCard = new SavedListingCard(
                UUID.randomUUID(), LISTING_ID, "2026-01-01T00:00:00Z", "Old listing", null,
                "house", "Manipal", null, "sale", null, null, null, null, null, null,
                "ARCHIVED", false);

        when(savedListingsService.listSaved(USER_A)).thenReturn(List.of(archivedCard));

        mockMvc.perform(get("/api/me/saved-listings")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].status").value("ARCHIVED"))
                .andExpect(jsonPath("$[0].available").value(false));
    }

    @Test
    void list_withoutJwt_returnsUnauthenticatedStatus() throws Exception {
        mockMvc.perform(get("/api/me/saved-listings"))
                .andExpect(status().is4xxClientError());

        verifyNoInteractions(savedListingsService);
    }

    // ==================== GET /ids ====================

    @Test
    void listIds_returnsOnlyCallersOwnIds() throws Exception {
        when(savedListingsService.listSavedIds(USER_A)).thenReturn(List.of(LISTING_ID));

        mockMvc.perform(get("/api/me/saved-listings/ids")
                        .with(jwt().jwt(j -> j.subject(USER_A.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0]").value(LISTING_ID.toString()));

        verify(savedListingsService, never()).listSavedIds(USER_B);
    }
}

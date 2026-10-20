package com.example.realestate.trust;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.listing.core.ListingRepository;
import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * #2859 B1 (TIR6-a.2) — controller contract for POST /api/admin/trust/identity/{evidenceId}/approve
 * (AdminTrustController#approveIdentityEvidence), which had no test.
 *
 * <p>Scope disclosure: the test SecurityFilterChain is permitAll (as AdminTrustControllerTest), so what is proven is
 * the IN-CONTROLLER {@code caller.isAdmin()} guard, not the production {@code /api/admin/**} filter-chain gate.
 * Repositories, BadgeService and the audit service are Mockito mocks: persistence is proven separately by
 * TrustIdentityApprovalIT. Synthetic identity values only.
 */
@WebMvcTest(
        controllers = AdminTrustController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({AdminTrustControllerIdentityApproveTest.TestConfig.class, WebMvcConfig.class, CallerInfoResolver.class,
        GlobalExceptionHandler.class})
class AdminTrustControllerIdentityApproveTest {

    private static final UUID ADMIN_ID = UUID.fromString("00000000-0000-0000-0000-000000002851");
    private static final UUID BROKER_ID = UUID.fromString("00000000-0000-0000-0000-000000002852");
    private static final UUID OWNER_PROFILE_ID = UUID.fromString("00000000-0000-0000-0000-000000002853");
    private static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000002859");
    private static final UUID OTHER_LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000002860");
    private static final UUID EVIDENCE_ID = UUID.fromString("00000000-0000-0000-0000-0000000028e1");
    private static final String URL = "/api/admin/trust/identity/{evidenceId}/approve";

    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                    .build();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ListingVerificationDimensionRepository dimensionRepository;
    @MockitoBean
    private ListingRepository listingRepository;
    @MockitoBean
    private BadgeService badgeService;
    @MockitoBean
    private UserRoleService userRoleService;
    @MockitoBean
    private IdentityEvidenceRepository identityEvidenceRepository;
    @MockitoBean
    private com.example.realestate.listing.audit.AdminAuditService adminAuditService;
    @MockitoBean
    private com.example.realestate.listing.storage.SupabaseStorageService supabaseStorageService;

    @BeforeEach
    void setUp() {
        reset(identityEvidenceRepository, badgeService, adminAuditService);
    }

    private static RequestPostProcessor admin() {
        return jwt().jwt(j -> j.subject(ADMIN_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
    }

    private static RequestPostProcessor broker() {
        return jwt().jwt(j -> j.subject(BROKER_ID.toString())).authorities(new SimpleGrantedAuthority("ROLE_BROKER"));
    }

    private static IdentityEvidence evidence(String reviewState, UUID listingId) {
        IdentityEvidence e = new IdentityEvidence();
        e.setProfileId(OWNER_PROFILE_ID);
        e.setListingId(listingId);
        e.setLegalName("Test Owner Name");
        e.setPhoneNumber("+91 00000 02859");
        e.setDocumentType("AADHAAR");
        e.setDocumentUrl("storage-disabled://synthetic-2859");
        e.setReviewState(reviewState);
        return e;
    }

    @Test
    void approveIdentity_nonAdmin_returns403_savesNothing_grantsNothing_thenAdminControlDoes() throws Exception {
        IdentityEvidence pending = evidence("PENDING", LISTING_ID);
        when(identityEvidenceRepository.findById(EVIDENCE_ID)).thenReturn(Optional.of(pending));

        mockMvc.perform(post(URL, EVIDENCE_ID).with(broker()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Admin access required"));
        verify(identityEvidenceRepository, never()).save(any());
        verify(badgeService, never()).grantIdentityBadge(any(), any());
        assertThat(pending.getReviewState()).isEqualTo("PENDING");

        // same-test positive control: the SAME evidence, an admin caller -> it is saved and the badge granted
        mockMvc.perform(post(URL, EVIDENCE_ID).with(admin()))
                .andExpect(status().isOk());
        verify(identityEvidenceRepository, times(1)).save(pending);
        verify(badgeService, times(1)).grantIdentityBadge(LISTING_ID, ADMIN_ID);
    }

    @Test
    void approveIdentity_unknownEvidence_returns404() throws Exception {
        when(identityEvidenceRepository.findById(EVIDENCE_ID)).thenReturn(Optional.empty());

        mockMvc.perform(post(URL, EVIDENCE_ID).with(admin()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Identity evidence not found"));
    }

    @Test
    void approveIdentity_notPending_returns409_withCurrentState() throws Exception {
        when(identityEvidenceRepository.findById(EVIDENCE_ID)).thenReturn(Optional.of(evidence("APPROVED", LISTING_ID)));

        mockMvc.perform(post(URL, EVIDENCE_ID).with(admin()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("Evidence is not in PENDING state — current state: APPROVED"));
    }

    @Test
    void approveIdentity_pending_admin_returns200_setsApproved_andGrantsIdentityForTheEvidenceListing() throws Exception {
        IdentityEvidence pending = evidence("PENDING", OTHER_LISTING_ID);
        when(identityEvidenceRepository.findById(EVIDENCE_ID)).thenReturn(Optional.of(pending));

        mockMvc.perform(post(URL, EVIDENCE_ID).with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Identity evidence approved"));

        ArgumentCaptor<IdentityEvidence> saved = ArgumentCaptor.forClass(IdentityEvidence.class);
        verify(identityEvidenceRepository).save(saved.capture());
        assertThat(saved.getValue().getReviewState()).isEqualTo("APPROVED");
        assertThat(saved.getValue().getReviewedBy()).isEqualTo(ADMIN_ID);
        assertThat(saved.getValue().getReviewedAt()).isNotNull();
        // the badge is granted for the EVIDENCE's listing (not a path/caller-derived id), by the approving admin
        verify(badgeService).grantIdentityBadge(OTHER_LISTING_ID, ADMIN_ID);
        verify(adminAuditService).record(eq(ADMIN_ID), eq("IDENTITY_EVIDENCE_APPROVED"), eq("identity_evidence"),
                eq(EVIDENCE_ID), isNull(), isNull());
    }

    @Test
    void approveIdentity_identityAlreadyEarned_isIdempotent_returns200_andEvidenceStillApproved() throws Exception {
        IdentityEvidence pending = evidence("PENDING", LISTING_ID);
        when(identityEvidenceRepository.findById(EVIDENCE_ID)).thenReturn(Optional.of(pending));
        doThrow(new IdentityAlreadyVerifiedException()).when(badgeService).grantIdentityBadge(LISTING_ID, ADMIN_ID);

        mockMvc.perform(post(URL, EVIDENCE_ID).with(admin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.message").value("Identity evidence approved"));

        verify(badgeService).grantIdentityBadge(LISTING_ID, ADMIN_ID); // the throwing path really ran
        verify(identityEvidenceRepository).save(pending);
        assertThat(pending.getReviewState()).isEqualTo("APPROVED");
    }
}

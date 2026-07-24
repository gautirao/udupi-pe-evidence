package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.navigation.NavigationBoundsResponse;
import com.example.realestate.discover.navigation.NavigationTreeValidationException;
import com.example.realestate.discover.navigation.ValidationError;
import com.example.realestate.discover.navigation.ValidationReport;
import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Web-layer contract test (#1955 Stage-B FIX cycle 1, code-reviewer gap) for {@link
 * AdminCityLaunchNavigationOverrideController} — pins the ACTUAL serialized JSON wire shape of
 * every admin navigation-override endpoint via MockMvc, so the shape the frontend aligns to is a
 * tested truth rather than an assumption. No prior test in this repo serialized these DTOs to the
 * wire (only {@link CityLaunchNavigationOverrideServiceIT} exercised the service layer directly),
 * which is how a shape mismatch between backend and frontend could ship undetected.
 *
 * <p>Mirrors {@code com.example.realestate.geo.AdminGeocodingControllerTest}'s {@code @WebMvcTest}
 * + {@code jwt().authorities(...)} harness for {@code @IsAdmin} (@PreAuthorize) enforcement.
 */
@WebMvcTest(
        controllers = AdminCityLaunchNavigationOverrideController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({AdminCityLaunchNavigationOverrideControllerTest.TestConfig.class, WebMvcConfig.class, CallerInfoResolver.class})
@TestPropertySource(properties = "spring.test.mockmvc.print=NONE")
class AdminCityLaunchNavigationOverrideControllerTest {

    private static final UUID ADMIN_ID = UUID.fromString("00000000-0000-0000-0000-000000000010");
    private static final int CITY_ID = 7;
    private static final long REVISION_ID = 99L;

    /** @EnableMethodSecurity is required for @IsAdmin (@PreAuthorize) to fire in tests. */
    @EnableMethodSecurity
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

    @Autowired
    private ObjectMapper objectMapper;

    /** Required to satisfy the JwtConfig -> RoleAuthoritiesConverter bean dependency in the WebMvcTest context. */
    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private CityLaunchNavigationOverrideService service;

    @BeforeEach
    void setUp() {
        reset(userRoleService, service);
    }

    private org.springframework.test.web.servlet.request.RequestPostProcessor asAdmin() {
        return jwt().jwt(j -> j.subject(ADMIN_ID.toString()))
                .authorities(new SimpleGrantedAuthority("ROLE_ADMIN"));
    }

    private String basePath() {
        return "/api/admin/city-launch/cities/" + CITY_ID + "/revisions/" + REVISION_ID + "/navigation";
    }

    // ── GET .../navigation/tree — FLAT {revisionId, validationStatus, validationErrors, nodes[]} ──

    @Test
    void getTree_wireShape_isFlatNotNestedRootChildren() throws Exception {
        NavigationBoundsResponse bounds = new NavigationBoundsResponse(13.05, 74.75, 13.0, 74.7, 13.1, 74.8);
        NavigationPreviewTreeResponse.PreviewNode node = new NavigationPreviewTreeResponse.PreviewNode(
                "c:north:area-1-area-2", "CLUSTER", "north-root", "north", null, "Area One & Area Two",
                1, List.of("north-root"), List.of("area-1", "area-2"), 1, 2, bounds);
        NavigationPreviewTreeResponse response = new NavigationPreviewTreeResponse(
                REVISION_ID, "VALID", List.of(), List.of(node));
        when(service.getPreviewTree(CITY_ID, REVISION_ID)).thenReturn(response);

        mockMvc.perform(get(basePath() + "/tree").with(asAdmin()))
                .andExpect(status().isOk())
                // Flat object — no nested "root"/"children" tree shape.
                .andExpect(jsonPath("$.root").doesNotExist())
                .andExpect(jsonPath("$.revisionId").value(REVISION_ID))
                .andExpect(jsonPath("$.validationStatus").value("VALID"))
                .andExpect(jsonPath("$.validationErrors").isArray())
                .andExpect(jsonPath("$.validationErrors").isEmpty())
                .andExpect(jsonPath("$.nodes").isArray())
                .andExpect(jsonPath("$.nodes.length()").value(1))
                .andExpect(jsonPath("$.nodes[0].nodeKey").value("c:north:area-1-area-2"))
                .andExpect(jsonPath("$.nodes[0].nodeType").value("CLUSTER"))
                .andExpect(jsonPath("$.nodes[0].displayLabel").value("Area One & Area Two"))
                .andExpect(jsonPath("$.nodes[0].representativeAreaKeys").isArray())
                .andExpect(jsonPath("$.nodes[0].representativeAreaKeys[0]").value("area-1"))
                .andExpect(jsonPath("$.nodes[0].representativeAreaKeys[1]").value("area-2"))
                .andExpect(jsonPath("$.nodes[0].parentNodeKey").value("north-root"))
                .andExpect(jsonPath("$.nodes[0].depth").value(1))
                .andExpect(jsonPath("$.nodes[0].descendantAreaCount").value(2))
                // AC14 item 2 — bounds IS present on every tree node (pinned wire shape, reusing
                // NavigationBoundsResponse's exact field names: centreLat/centreLon/minLat/minLon/
                // maxLat/maxLon), never omitted.
                .andExpect(jsonPath("$.nodes[0].bounds").exists())
                .andExpect(jsonPath("$.nodes[0].bounds.centreLat").value(13.05))
                .andExpect(jsonPath("$.nodes[0].bounds.centreLon").value(74.75))
                .andExpect(jsonPath("$.nodes[0].bounds.minLat").value(13.0))
                .andExpect(jsonPath("$.nodes[0].bounds.minLon").value(74.7))
                .andExpect(jsonPath("$.nodes[0].bounds.maxLat").value(13.1))
                .andExpect(jsonPath("$.nodes[0].bounds.maxLon").value(74.8));
    }

    // ── GET .../navigation/diff?against=BASE ────────────────────────────────────────────────────

    @Test
    void getDiff_wireShape_addedRemovedAsNodeKeyStrings_fingerprintNullable() throws Exception {
        NavigationTreeDiffResponse response = new NavigationTreeDiffResponse(
                REVISION_ID, "BASE", null,
                List.of("a:new-area"), List.of("a:old-area"),
                List.of(new NavigationTreeDiffResponse.MovedNode("a:moved-area", "cluster-old", "cluster-new")),
                List.of(new NavigationTreeDiffResponse.RelabeledNode("c:relabeled", "Old Label", "New Label")),
                List.of(new NavigationTreeDiffResponse.RepresentativeChange(
                        "c:reps-changed", List.of("area-1"), List.of("area-2"))));
        when(service.getDiff(CITY_ID, REVISION_ID, "BASE")).thenReturn(response);

        mockMvc.perform(get(basePath() + "/diff").param("against", "BASE").with(asAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.revisionId").value(REVISION_ID))
                .andExpect(jsonPath("$.against").value("BASE"))
                // Zero-override revision -> fingerprint MAY be null (present, value null); asserted explicitly.
                .andExpect(jsonPath("$.overridesFingerprint").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.added").isArray())
                .andExpect(jsonPath("$.added[0]").value("a:new-area"))
                .andExpect(jsonPath("$.removed").isArray())
                .andExpect(jsonPath("$.removed[0]").value("a:old-area"))
                .andExpect(jsonPath("$.moved[0].nodeKey").value("a:moved-area"))
                .andExpect(jsonPath("$.moved[0].fromParentNodeKey").value("cluster-old"))
                .andExpect(jsonPath("$.moved[0].toParentNodeKey").value("cluster-new"))
                .andExpect(jsonPath("$.relabeled[0].nodeKey").value("c:relabeled"))
                .andExpect(jsonPath("$.relabeled[0].fromLabel").value("Old Label"))
                .andExpect(jsonPath("$.relabeled[0].toLabel").value("New Label"))
                .andExpect(jsonPath("$.representativeChanges[0].nodeKey").value("c:reps-changed"))
                .andExpect(jsonPath("$.representativeChanges[0].fromRepresentativeAreaKeys[0]").value("area-1"))
                .andExpect(jsonPath("$.representativeChanges[0].toRepresentativeAreaKeys[0]").value("area-2"));
    }

    // ── GET .../navigation/overrides — BARE ARRAY, field is "id" not "overrideId", no appliedAt ──

    @Test
    void listOverrides_wireShape_bareArrayWithIdFieldNoAppliedAt() throws Exception {
        AdminNavigationOverrideResponse override = new AdminNavigationOverrideResponse(
                42L, "EXCLUDE_AREA", "a:excluded", null, null, null, null, null, 1, "test reason", ADMIN_ID);
        when(service.listOverrides(CITY_ID, REVISION_ID)).thenReturn(List.of(override));

        mockMvc.perform(get(basePath() + "/overrides").with(asAdmin()))
                .andExpect(status().isOk())
                // Bare array at the response root, not wrapped in an object.
                .andExpect(jsonPath("$").isArray())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(42))
                .andExpect(jsonPath("$[0].overrideId").doesNotExist())
                .andExpect(jsonPath("$[0].appliedAt").doesNotExist())
                .andExpect(jsonPath("$[0].kind").value("EXCLUDE_AREA"))
                .andExpect(jsonPath("$[0].subjectAreaKey").value("a:excluded"))
                .andExpect(jsonPath("$[0].reason").value("test reason"));
    }

    // ── POST .../navigation/overrides — status codes ────────────────────────────────────────────

    @Test
    void createOverride_duplicate_returns409() throws Exception {
        when(service.createOverride(eq(CITY_ID), eq(REVISION_ID), any(), any()))
                .thenThrow(new ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,
                        "An override of kind=EXCLUDE_AREA already exists for this subject on this revision"));

        AdminNavigationOverrideRequest req = new AdminNavigationOverrideRequest(
                "EXCLUDE_AREA", "a:dup", null, null, null, null, null, null);

        mockMvc.perform(post(basePath() + "/overrides").with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("already exists")));
    }

    @Test
    void createOverride_nonPreparedRevision_returns409() throws Exception {
        when(service.createOverride(eq(CITY_ID), eq(REVISION_ID), any(), any()))
                .thenThrow(new ResponseStatusException(org.springframework.http.HttpStatus.CONFLICT,
                        "Navigation overrides can only be mutated while the revision is PREPARED (status=VALIDATED)"));

        AdminNavigationOverrideRequest req = new AdminNavigationOverrideRequest(
                "EXCLUDE_AREA", "a:x", null, null, null, null, null, null);

        mockMvc.perform(post(basePath() + "/overrides").with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isConflict());
    }

    @Test
    void createOverride_blockingValidation_returns422WithValidationReport() throws Exception {
        ValidationReport report = new ValidationReport(List.of(
                new ValidationError("ONE_CHILD_CLUSTER", "cluster c:x has exactly one child", "c:x")));
        when(service.createOverride(eq(CITY_ID), eq(REVISION_ID), any(), any()))
                .thenThrow(new NavigationTreeValidationException(report));

        AdminNavigationOverrideRequest req = new AdminNavigationOverrideRequest(
                "MOVE_AREA", "a:leaf", null, null, "c:target", null, null, null);

        mockMvc.perform(post(basePath() + "/overrides").with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("NAVIGATION_TREE_VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errors[0].code").value("ONE_CHILD_CLUSTER"))
                .andExpect(jsonPath("$.errors[0].nodeKey").value("c:x"));
    }

    // ── DELETE .../navigation/overrides/{overrideId} — unknown -> 404 ──────────────────────────

    @Test
    void deleteOverride_unknown_returns404() throws Exception {
        when(service.deleteOverride(eq(CITY_ID), eq(REVISION_ID), eq(9999L)))
                .thenThrow(new ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND,
                        "Navigation override not found"));

        mockMvc.perform(delete(basePath() + "/overrides/9999").with(asAdmin()))
                .andExpect(status().isNotFound());
    }
}

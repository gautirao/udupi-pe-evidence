package com.example.realestate.security;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link CallerInfoResolver}.
 * Verifies role resolution, CallerInfo construction, and FORBIDDEN paths.
 */
@ExtendWith(MockitoExtension.class)
class CallerInfoResolverTest {

    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    @Mock
    private UserRoleService userRoleService;

    @InjectMocks
    private CallerInfoResolver resolver;

    @BeforeEach
    void installToken() {
        // Install a JwtAuthenticationToken into the SecurityContext so the resolver can extract it.
        Jwt jwt = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject(USER_ID.toString())
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(3600))
                .build();
        JwtAuthenticationToken token = new JwtAuthenticationToken(jwt);
        SecurityContextHolder.getContext().setAuthentication(token);
    }

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    // ===== supportsParameter =====

    @Test
    void supportsParameter_returnsTrue_forCallerInfoType() throws Exception {
        // Minimal MethodParameter pointing at the first argument of a dummy method
        MethodParameter param = MethodParameter.forExecutable(
                DummyHandler.class.getDeclaredMethod("handle", CallerInfo.class), 0);
        assertThat(resolver.supportsParameter(param)).isTrue();
    }

    @Test
    void supportsParameter_returnsFalse_forOtherType() throws Exception {
        MethodParameter param = MethodParameter.forExecutable(
                DummyHandler.class.getDeclaredMethod("handleOther", String.class), 0);
        assertThat(resolver.supportsParameter(param)).isFalse();
    }

    // ===== resolveArgument — happy paths =====

    @Test
    void resolveArgument_dealerRole_returnsDealerCallerInfo() throws Exception {
        when(userRoleService.getUserRole(USER_ID)).thenReturn(Optional.of("dealer"));

        CallerInfo result = (CallerInfo) resolver.resolveArgument(null, null, null, null);

        assertThat(result.userId()).isEqualTo(USER_ID);
        assertThat(result.role()).isEqualTo("dealer");
        assertThat(result.isAdmin()).isFalse();
    }

    @Test
    void resolveArgument_adminRole_returnsAdminCallerInfo() throws Exception {
        when(userRoleService.getUserRole(USER_ID)).thenReturn(Optional.of("admin"));

        CallerInfo result = (CallerInfo) resolver.resolveArgument(null, null, null, null);

        assertThat(result.userId()).isEqualTo(USER_ID);
        assertThat(result.role()).isEqualTo("admin");
        assertThat(result.isAdmin()).isTrue();
    }

    @Test
    void resolveArgument_userRole_returnsCallerInfoWithIsAdminFalse() throws Exception {
        when(userRoleService.getUserRole(USER_ID)).thenReturn(Optional.of("user"));

        CallerInfo result = (CallerInfo) resolver.resolveArgument(null, null, null, null);

        assertThat(result.userId()).isEqualTo(USER_ID);
        assertThat(result.role()).isEqualTo("user");
        assertThat(result.isAdmin()).isFalse();
    }

    // ===== resolveArgument — FORBIDDEN paths =====

    @Test
    void resolveArgument_emptyRole_throwsForbidden() {
        when(userRoleService.getUserRole(USER_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> resolver.resolveArgument(null, null, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
                    assertThat(rse.getReason()).contains("Requires dealer, owner, or admin role");
                });
    }

    @Test
    void resolveArgument_disallowedRole_throwsForbidden() {
        when(userRoleService.getUserRole(USER_ID)).thenReturn(Optional.of("viewer"));

        assertThatThrownBy(() -> resolver.resolveArgument(null, null, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
                });
    }

    @Test
    void resolveArgument_malformedSubject_throwsForbidden() {
        // Override the JWT in SecurityContext with a non-UUID subject
        Jwt badJwt = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject("not-a-uuid")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(3600))
                .build();
        SecurityContextHolder.getContext().setAuthentication(new JwtAuthenticationToken(badJwt));

        assertThatThrownBy(() -> resolver.resolveArgument(null, null, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
                });
    }

    // ===== Dummy methods used for MethodParameter construction =====

    @SuppressWarnings("unused")
    static class DummyHandler {
        public void handle(CallerInfo caller) {}
        public void handleOther(String s) {}
    }
}

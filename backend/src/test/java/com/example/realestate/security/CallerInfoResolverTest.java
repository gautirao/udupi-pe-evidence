package com.example.realestate.security;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Unit tests for {@link CallerInfoResolver}.
 *
 * <p>After the RBAC foundation refactor, {@link CallerInfoResolver} reads the caller's role
 * from pre-populated {@code ROLE_*} authorities on the {@link JwtAuthenticationToken} — it
 * issues <strong>zero</strong> {@code user_roles} DB lookups. {@link DbRoleJwtAuthenticationConverter}
 * performs the single lookup upstream; these tests set authorities directly to verify resolver
 * behaviour in isolation.
 *
 * <h3>Single-lookup invariant</h3>
 * <p>{@link CallerInfoResolver} has no {@link UserRoleService} dependency. Successful resolution
 * with only {@code ROLE_*} authorities in the token proves the resolver does not touch the DB.
 */
class CallerInfoResolverTest {

    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    // CallerInfoResolver has no dependencies — zero-arg constructor proves zero DB lookups.
    private final CallerInfoResolver resolver = new CallerInfoResolver();

    @AfterEach
    void clearContext() {
        SecurityContextHolder.clearContext();
    }

    // ===== supportsParameter =====

    @Test
    void supportsParameter_returnsTrue_forCallerInfoType() throws Exception {
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

    // ===== resolveArgument — happy paths: reads role from ROLE_* authorities =====

    @Test
    void resolveArgument_adminAuthority_returnsAdminCallerInfo() throws Exception {
        installToken(USER_ID, new SimpleGrantedAuthority("ROLE_ADMIN"));

        CallerInfo result = (CallerInfo) resolver.resolveArgument(null, null, null, null);

        assertThat(result.userId()).isEqualTo(USER_ID);
        assertThat(result.role()).isEqualTo("admin");
        assertThat(result.isAdmin()).isTrue();
    }

    @Test
    void resolveArgument_brokerAuthority_returnsBrokerCallerInfo() throws Exception {
        installToken(USER_ID, new SimpleGrantedAuthority("ROLE_BROKER"));

        CallerInfo result = (CallerInfo) resolver.resolveArgument(null, null, null, null);

        assertThat(result.userId()).isEqualTo(USER_ID);
        assertThat(result.role()).isEqualTo("broker");
        assertThat(result.isAdmin()).isFalse();
    }

    @Test
    void resolveArgument_dealerAuthority_returnsDealerCallerInfo() throws Exception {
        installToken(USER_ID, new SimpleGrantedAuthority("ROLE_DEALER"));

        CallerInfo result = (CallerInfo) resolver.resolveArgument(null, null, null, null);

        assertThat(result.userId()).isEqualTo(USER_ID);
        assertThat(result.role()).isEqualTo("dealer");
        assertThat(result.isAdmin()).isFalse();
    }

    @Test
    void resolveArgument_userAuthority_returnsCallerInfoWithIsAdminFalse() throws Exception {
        installToken(USER_ID, new SimpleGrantedAuthority("ROLE_USER"));

        CallerInfo result = (CallerInfo) resolver.resolveArgument(null, null, null, null);

        assertThat(result.userId()).isEqualTo(USER_ID);
        assertThat(result.role()).isEqualTo("user");
        assertThat(result.isAdmin()).isFalse();
    }

    @Test
    void resolveArgument_multipleAuthorities_picksHighestPrecedenceRole() throws Exception {
        // ROLE_ADMIN + ROLE_BROKER → "admin" wins (admin > broker precedence)
        installToken(USER_ID,
                new SimpleGrantedAuthority("ROLE_BROKER"),
                new SimpleGrantedAuthority("ROLE_ADMIN"));
        CallerInfo result = (CallerInfo) resolver.resolveArgument(null, null, null, null);
        assertThat(result.role()).isEqualTo("admin");
        assertThat(result.isAdmin()).isTrue();
    }

    /**
     * Proves the single-lookup contract: {@link CallerInfoResolver} has no
     * {@link UserRoleService} dependency (zero-arg constructor). Successful resolution
     * with only {@code ROLE_ADMIN} in the token proves no DB lookup occurs — any service
     * call would produce a {@code NullPointerException} since no service is wired.
     */
    @Test
    void resolveArgument_readsRoleFromAuthority_notFromUserRoleService() throws Exception {
        installToken(USER_ID, new SimpleGrantedAuthority("ROLE_ADMIN"));

        CallerInfo result = (CallerInfo) resolver.resolveArgument(null, null, null, null);

        // Successful return without NPE proves no UserRoleService.getUserRole() was called.
        assertThat(result.role()).isEqualTo("admin");
        assertThat(result.isAdmin()).isTrue();
    }

    // ===== resolveArgument — FORBIDDEN paths =====

    @Test
    void resolveArgument_noRoleAuthority_throwsForbidden() {
        // Token with no ROLE_* authorities — resolver must throw 403 without any DB call.
        installToken(USER_ID /* no authorities */);

        assertThatThrownBy(() -> resolver.resolveArgument(null, null, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
                    assertThat(rse.getReason()).contains("Requires broker, dealer, user, or admin role");
                });
    }

    @Test
    void resolveArgument_unknownRoleAuthority_throwsForbidden() {
        // Token with an authority not in the known ROLE_* precedence set.
        // Resolver must throw 403 — no DB re-query for unknown authorities.
        installToken(USER_ID, new SimpleGrantedAuthority("ROLE_VIEWER"));

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
        SecurityContextHolder.getContext().setAuthentication(
                new JwtAuthenticationToken(badJwt, List.of(new SimpleGrantedAuthority("ROLE_ADMIN"))));

        assertThatThrownBy(() -> resolver.resolveArgument(null, null, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(ex -> {
                    ResponseStatusException rse = (ResponseStatusException) ex;
                    assertThat(rse.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
                });
    }

    // ===== Helpers =====

    /**
     * Installs a {@link JwtAuthenticationToken} with the given authorities into the SecurityContext.
     * Mirrors how {@link DbRoleJwtAuthenticationConverter} populates the authentication in production.
     */
    private static void installToken(UUID userId, GrantedAuthority... authorities) {
        Jwt jwt = Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject(userId.toString())
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(3600))
                .build();
        List<GrantedAuthority> authorityList = Arrays.asList(authorities);
        SecurityContextHolder.getContext().setAuthentication(
                new JwtAuthenticationToken(jwt, authorityList));
    }

    @SuppressWarnings("unused")
    static class DummyHandler {
        public void handle(CallerInfo caller) {}
        public void handleOther(String s) {}
    }
}

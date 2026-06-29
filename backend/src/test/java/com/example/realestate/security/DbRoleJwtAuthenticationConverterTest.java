package com.example.realestate.security;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DbRoleJwtAuthenticationConverterTest {

    private static final UUID USER_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");

    @Mock
    private UserRoleService userRoleService;

    @InjectMocks
    private DbRoleJwtAuthenticationConverter converter;

    private Jwt buildJwt(String subject) {
        return Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject(subject)
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(3600))
                .build();
    }

    private Jwt buildBlankSubjectJwt() {
        return Jwt.withTokenValue("token")
                .header("alg", "RS256")
                .subject("   ")
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(3600))
                .build();
    }

    private static Collection<String> authorityNames(JwtAuthenticationToken token) {
        return token.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .toList();
    }

    @Test
    void multiRole_adminAndBroker_returnsBothAuthorities() {
        when(userRoleService.findAllRoles(USER_ID)).thenReturn(List.of("admin", "broker"));

        JwtAuthenticationToken result = converter.convert(buildJwt(USER_ID.toString()));

        assertThat(authorityNames(result)).containsExactlyInAnyOrder("ROLE_ADMIN", "ROLE_BROKER");
        verify(userRoleService, times(1)).findAllRoles(USER_ID);
    }

    @Test
    void multiRole_allFour_returnsFourAuthorities() {
        when(userRoleService.findAllRoles(USER_ID)).thenReturn(List.of("admin", "broker", "dealer", "user"));

        JwtAuthenticationToken result = converter.convert(buildJwt(USER_ID.toString()));

        assertThat(authorityNames(result)).containsExactlyInAnyOrder(
                "ROLE_ADMIN", "ROLE_BROKER", "ROLE_DEALER", "ROLE_USER");
    }

    @Test
    void singleRole_admin_returnsRoleAdmin() {
        when(userRoleService.findAllRoles(USER_ID)).thenReturn(List.of("admin"));

        JwtAuthenticationToken result = converter.convert(buildJwt(USER_ID.toString()));

        assertThat(authorityNames(result)).containsExactly("ROLE_ADMIN");
    }

    @Test
    void singleRole_broker_returnsRoleBroker() {
        when(userRoleService.findAllRoles(USER_ID)).thenReturn(List.of("broker"));

        JwtAuthenticationToken result = converter.convert(buildJwt(USER_ID.toString()));

        assertThat(authorityNames(result)).containsExactly("ROLE_BROKER");
    }

    @Test
    void singleRole_dealer_returnsRoleDealer() {
        when(userRoleService.findAllRoles(USER_ID)).thenReturn(List.of("dealer"));

        JwtAuthenticationToken result = converter.convert(buildJwt(USER_ID.toString()));

        assertThat(authorityNames(result)).containsExactly("ROLE_DEALER");
    }

    @Test
    void singleRole_user_returnsRoleUser() {
        when(userRoleService.findAllRoles(USER_ID)).thenReturn(List.of("user"));

        JwtAuthenticationToken result = converter.convert(buildJwt(USER_ID.toString()));

        assertThat(authorityNames(result)).containsExactly("ROLE_USER");
    }

    @Test
    void unknownFutureRole_mapsGenericRoleAuthority() {
        when(userRoleService.findAllRoles(USER_ID)).thenReturn(List.of("superadmin"));

        JwtAuthenticationToken result = converter.convert(buildJwt(USER_ID.toString()));

        assertThat(authorityNames(result)).containsExactly("ROLE_SUPERADMIN");
    }

    @Test
    void noRoles_returnsEmptyAuthorities_failClosed() {
        when(userRoleService.findAllRoles(USER_ID)).thenReturn(List.of());

        JwtAuthenticationToken result = converter.convert(buildJwt(USER_ID.toString()));

        assertThat(result).isNotNull();
        assertThat(result.getAuthorities()).isEmpty();
    }

    @Test
    void dbException_returnsEmptyAuthorities_neverThrows() {
        when(userRoleService.findAllRoles(USER_ID))
                .thenThrow(new RuntimeException("DB connection refused"));

        JwtAuthenticationToken result = converter.convert(buildJwt(USER_ID.toString()));

        assertThat(result).isNotNull();
        assertThat(result.getAuthorities()).isEmpty();
    }

    @Test
    void malformedSubject_returnsEmptyAuthorities_neverThrows() {
        JwtAuthenticationToken result = converter.convert(buildJwt("not-a-uuid"));

        assertThat(result.getAuthorities()).isEmpty();
        verifyNoInteractions(userRoleService);
    }

    @Test
    void blankSubject_returnsEmptyAuthorities_failClosed() {
        JwtAuthenticationToken result = converter.convert(buildBlankSubjectJwt());

        assertThat(result.getAuthorities()).isEmpty();
        verifyNoInteractions(userRoleService);
    }

    @Test
    void originalJwtPreserved_inReturnedToken() {
        when(userRoleService.findAllRoles(USER_ID)).thenReturn(List.of("admin"));
        Jwt jwt = buildJwt(USER_ID.toString());

        JwtAuthenticationToken result = converter.convert(jwt);

        assertThat(result.getToken()).isSameAs(jwt);
    }
}

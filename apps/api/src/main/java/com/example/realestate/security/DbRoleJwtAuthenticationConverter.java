package com.example.realestate.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Converts a Supabase-validated {@link Jwt} into a {@link JwtAuthenticationToken} carrying
 * ALL {@code ROLE_*} {@link GrantedAuthority} values derived from the {@code user_roles} table.
 *
 * <h3>Multi-role support</h3>
 * <p>Calls {@link UserRoleService#findAllRoles(UUID)} — no LIMIT — and maps every returned DB
 * role to a {@code ROLE_<UPPER>} authority via generic mapping
 * {@code "ROLE_" + role.toUpperCase(Locale.ROOT)}. Future roles require zero converter changes.
 *
 * <h3>Fail-closed design</h3>
 * <p>Any error (null/malformed JWT subject, DB exception) returns a
 * {@link JwtAuthenticationToken} with <em>no authorities</em>. The converter never throws:
 * an exception here would surface as 401, not the required 403.
 * Empty authorities are denied by {@link IsAdmin}/{@link IsBrokerOrAbove} and by
 * {@link CallerInfoResolver}'s authority check — both produce 403.
 */
@Component
public class DbRoleJwtAuthenticationConverter implements Converter<Jwt, JwtAuthenticationToken> {

    private static final Logger log = LoggerFactory.getLogger(DbRoleJwtAuthenticationConverter.class);

    private final UserRoleService userRoleService;

    public DbRoleJwtAuthenticationConverter(UserRoleService userRoleService) {
        this.userRoleService = userRoleService;
    }

    @Override
    public JwtAuthenticationToken convert(Jwt jwt) {
        String subject = jwt.getSubject();
        if (subject == null || subject.isBlank()) {
            log.warn("DbRoleJwtAuthenticationConverter: null/blank JWT subject — returning empty authorities (fail-closed)");
            return new JwtAuthenticationToken(jwt, Collections.emptyList());
        }

        UUID userId;
        try {
            userId = UUID.fromString(subject);
        } catch (IllegalArgumentException e) {
            log.warn("DbRoleJwtAuthenticationConverter: malformed JWT subject '{}' — returning empty authorities (fail-closed)",
                    subject);
            return new JwtAuthenticationToken(jwt, Collections.emptyList());
        }

        try {
            List<String> dbRoles = userRoleService.findAllRoles(userId);
            List<GrantedAuthority> authorities = dbRoles.stream()
                    .filter(r -> r != null && !r.isBlank())
                    .map(r -> (GrantedAuthority) new SimpleGrantedAuthority("ROLE_" + r.toUpperCase(Locale.ROOT)))
                    .collect(Collectors.toList());
            if (authorities.isEmpty()) {
                log.warn("DbRoleJwtAuthenticationConverter: no roles found for userId={} — returning empty authorities (fail-closed)",
                        userId);
            }
            return new JwtAuthenticationToken(jwt, authorities);
        } catch (Exception e) {
            log.error("DbRoleJwtAuthenticationConverter: DB error for userId={} — returning empty authorities (fail-closed)",
                    userId, e);
            return new JwtAuthenticationToken(jwt, Collections.emptyList());
        }
    }
}

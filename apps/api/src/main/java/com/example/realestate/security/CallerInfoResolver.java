package com.example.realestate.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import org.springframework.web.server.ResponseStatusException;

import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Resolves {@link CallerInfo} method parameters in {@code @RestController} handlers.
 *
 * <h3>Resolution steps</h3>
 * <ol>
 *   <li>Extract {@link JwtAuthenticationToken} from {@link SecurityContextHolder}.</li>
 *   <li>Parse {@code UUID} from JWT subject — throws {@code 403} on null/blank/malformed subject.</li>
 *   <li>Read the DB role string from the pre-populated {@code ROLE_*} authority on the token.
 *       The authority was set by {@link DbRoleJwtAuthenticationConverter} during
 *       {@code BearerTokenAuthenticationFilter} processing — this resolver issues
 *       <strong>zero</strong> additional {@code user_roles} DB lookups.</li>
 *   <li>Throws {@code 403} if no valid role authority is present (fail-closed). The resolver
 *       does <em>not</em> fall back to a DB query on missing authorities.</li>
 * </ol>
 *
 * <h3>Single-lookup invariant</h3>
 * <p>{@link DbRoleJwtAuthenticationConverter} performs exactly ONE {@code user_roles} lookup per
 * authenticated request. This resolver reads from the pre-populated authorities — the net
 * per-request lookup count is exactly ONE, never more.
 */
@Component
public class CallerInfoResolver implements HandlerMethodArgumentResolver {

    private static final Logger log = LoggerFactory.getLogger(CallerInfoResolver.class);

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return CallerInfo.class.equals(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(MethodParameter parameter,
                                   ModelAndViewContainer mavContainer,
                                   NativeWebRequest webRequest,
                                   WebDataBinderFactory binderFactory) {

        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof JwtAuthenticationToken token)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
        }

        String subject = token.getToken().getSubject();
        if (subject == null || subject.isBlank()) {
            log.warn("CallerInfoResolver: null/blank JWT subject");
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid user identity in token");
        }

        UUID userId;
        try {
            userId = UUID.fromString(subject);
        } catch (IllegalArgumentException e) {
            log.warn("CallerInfoResolver: malformed JWT subject '{}'", subject);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid user identity in token");
        }

        // Read role from ROLE_* authorities populated by DbRoleJwtAuthenticationConverter.
        // Precedence: admin > broker > dealer > user. Zero additional user_roles DB lookups here.
        String role = pickHighestRole(token.getAuthorities());
        if (role == null) {
            log.warn("CallerInfoResolver: no valid role authority for userId={}", userId);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Requires broker, dealer, user, or admin role");
        }

        return new CallerInfo(userId, role, "admin".equals(role));
    }

    private static final List<String> ROLE_PRECEDENCE = List.of(
            "ROLE_ADMIN", "ROLE_BROKER", "ROLE_DEALER", "ROLE_USER");

    private static String pickHighestRole(Collection<? extends GrantedAuthority> authorities) {
        java.util.Set<String> authorityNames = authorities.stream()
                .map(GrantedAuthority::getAuthority)
                .collect(java.util.stream.Collectors.toSet());
        for (String authority : ROLE_PRECEDENCE) {
            if (authorityNames.contains(authority)) {
                // Strip ROLE_ prefix and lowercase → DB role string
                return authority.substring("ROLE_".length()).toLowerCase(Locale.ROOT);
            }
        }
        return null;
    }
}

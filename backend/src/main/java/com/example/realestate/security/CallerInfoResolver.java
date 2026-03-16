package com.example.realestate.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import org.springframework.web.server.ResponseStatusException;

import java.util.Set;
import java.util.UUID;

/**
 * Resolves {@link CallerInfo} method parameters in {@code @RestController} handlers.
 *
 * <p>Resolution steps:
 * <ol>
 *   <li>Extract {@link JwtAuthenticationToken} from {@link SecurityContextHolder}.</li>
 *   <li>Parse {@code UUID} from JWT subject — throws {@code 403} on malformed subject.</li>
 *   <li>Look up role via {@link UserRoleService} — throws {@code 403} if role is absent
 *       or not in the allowed set {dealer, admin, user}.</li>
 * </ol>
 */
@Component
public class CallerInfoResolver implements HandlerMethodArgumentResolver {

    private static final Logger log = LoggerFactory.getLogger(CallerInfoResolver.class);
    private static final Set<String> ALLOWED_ROLES = Set.of("dealer", "admin", "user");

    private final UserRoleService userRoleService;

    public CallerInfoResolver(UserRoleService userRoleService) {
        this.userRoleService = userRoleService;
    }

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return CallerInfo.class.equals(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(MethodParameter parameter,
                                   ModelAndViewContainer mavContainer,
                                   NativeWebRequest webRequest,
                                   WebDataBinderFactory binderFactory) {

        JwtAuthenticationToken token =
                (JwtAuthenticationToken) SecurityContextHolder.getContext().getAuthentication();

        if (token == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Authentication required");
        }

        UUID userId;
        try {
            userId = UUID.fromString(token.getToken().getSubject());
        } catch (IllegalArgumentException e) {
            log.warn("CallerInfoResolver: malformed JWT subject '{}'", token.getToken().getSubject());
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Invalid user identity in token");
        }

        String role = userRoleService.getUserRole(userId).orElse(null);
        if (role == null || !ALLOWED_ROLES.contains(role)) {
            log.warn("CallerInfoResolver: access denied userId={} role={}", userId, role);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Requires dealer, owner, or admin role");
        }

        return new CallerInfo(userId, role, "admin".equals(role));
    }
}

package com.example.realestate.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

/**
 * Servlet filter that assigns a unique requestId to every HTTP request and
 * propagates it via MDC so all log lines within a request carry the ID.
 *
 * Behaviour:
 * - If the caller sends an {@code X-Request-Id} header, it is validated: must be
 *   36 chars max and contain only hex digits, hyphens, and alphanumeric chars
 *   (rejects log-injection attempts via newlines/control chars). Invalid values
 *   are silently replaced with a freshly generated UUID (CWE-117 mitigation).
 * - Otherwise a new {@code UUID.randomUUID()} is generated.
 * - The ID is placed into {@code MDC} under the key {@code "requestId"} before
 *   the filter chain executes.
 * - The ID is echoed back to the caller via the {@code X-Request-Id} response header.
 * - {@code MDC.clear()} is called in a {@code finally} block to prevent thread-local
 *   leaks when threads are returned to the container thread pool.
 *
 * Registered at {@link Ordered#HIGHEST_PRECEDENCE} so it runs before all other
 * filters, including Spring Security's filter chain.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class MdcRequestFilter extends OncePerRequestFilter {

    static final String REQUEST_ID_HEADER = "X-Request-Id";
    static final String MDC_KEY = "requestId";

    // UUID format: 8-4-4-4-12 hex chars + dashes = 36 chars max.
    // Only allow chars that appear in a UUID to prevent log injection (CWE-117).
    private static final java.util.regex.Pattern SAFE_ID = java.util.regex.Pattern.compile("[\\w\\-]{1,36}");

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String incomingId = request.getHeader(REQUEST_ID_HEADER);
        String requestId;
        if (incomingId != null && !incomingId.isBlank() && SAFE_ID.matcher(incomingId).matches()) {
            requestId = incomingId;
        } else {
            requestId = UUID.randomUUID().toString();
        }

        MDC.put(MDC_KEY, requestId);
        response.setHeader(REQUEST_ID_HEADER, requestId);

        try {
            filterChain.doFilter(request, response);
        } finally {
            MDC.clear();
        }
    }
}

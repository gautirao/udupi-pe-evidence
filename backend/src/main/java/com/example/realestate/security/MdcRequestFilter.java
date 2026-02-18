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
 * - If the caller sends an {@code X-Request-Id} header, that value is used as-is
 *   (pass-through / correlation with upstream callers).
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

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        String requestId = request.getHeader(REQUEST_ID_HEADER);
        if (requestId == null || requestId.isBlank()) {
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

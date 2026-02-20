package com.example.realestate.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Staging-only endpoint for verifying Sentry integration.
 *
 * SECURITY: This bean is registered ONLY when {@code sentry.test.enabled=true} (default: false).
 * It is never active in production. The {@link ConditionalOnProperty} annotation with
 * {@code matchIfMissing=false} ensures the endpoint does not exist unless explicitly enabled.
 *
 * Purpose: throw a recognizable RuntimeException so Sentry captures it with the
 * {@code requestId} from MDC (set by {@code MdcRequestFilter} before this handler runs).
 */
@RestController
@RequestMapping("/api/sentry")
@ConditionalOnProperty(name = "sentry.test.enabled", havingValue = "true", matchIfMissing = false)
public class SentryTestController {

    private static final Logger log = LoggerFactory.getLogger(SentryTestController.class);

    /**
     * Triggers a test exception for Sentry capture verification.
     * Returns HTTP 500; Sentry captures the event with requestId in MDC context.
     * Requires authentication (JWT) — see OBSERVABILITY_VERIFICATION.md.
     */
    @GetMapping("/test")
    public void test() {
        log.warn("GET /api/sentry/test — triggering test exception for Sentry verification");
        throw new RuntimeException(
                "Sentry test exception — triggered manually for observability verification");
    }
}

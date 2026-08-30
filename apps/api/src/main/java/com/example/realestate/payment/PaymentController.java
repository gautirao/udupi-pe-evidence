package com.example.realestate.payment;

import com.example.realestate.exception.RateLimiterService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.UUID;

/**
 * POST /api/payments/insights-pass — stub endpoint for granting insights access.
 *
 * Security controls (Sprint 5 §7, security-reviewer mandated):
 *   M12: Idempotency — rejects 409 if insights_access_until > NOW().
 *        Per-user rate limit (1 grant per 30d) is satisfied by this same check:
 *        a grant sets access 30 days out so re-grant is blocked until expiry.
 *   M13: Feature flag — payments.stub.enabled must be true; default false in production.
 *   M14: Grant duration (GRANT_DAYS) is a server-side constant — never from request body.
 *   M15: Audit log on every call: userId, timestamp, newExpiry.
 *
 * Transactional boundary is owned by {@link PaymentService}.
 */
@RestController
@RequestMapping("/api/payments")
public class PaymentController {

    private static final Logger log = LoggerFactory.getLogger(PaymentController.class);

    @Value("${payments.stub.enabled:false}")
    private boolean stubEnabled;

    private final PaymentService paymentService;
    private final RateLimiterService rateLimiterService;

    public PaymentController(PaymentService paymentService, RateLimiterService rateLimiterService) {
        this.paymentService = paymentService;
        this.rateLimiterService = rateLimiterService;
    }

    @PostMapping("/insights-pass")
    public ResponseEntity<?> grantInsightsPass(JwtAuthenticationToken auth) {
        // M13: Feature flag — must be explicitly enabled; default false in production.
        // Return 404 (not 503) so the endpoint appears non-existent when disabled.
        if (!stubEnabled) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).build();
        }

        UUID userId = UUID.fromString(auth.getToken().getSubject());

        if (!rateLimiterService.getPaymentBucket(userId.toString()).tryConsume(1)) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "RATE_LIMIT_EXCEEDED");
        }

        PaymentService.InsightsGrantResult result = paymentService.grantInsightsPass(userId);

        switch (result.status()) {
            case GRANTED -> {
                log.info("POST /api/payments/insights-pass -> 200 userId={} newExpiry={}",
                        userId, result.until());
                return ResponseEntity.ok(Map.of("insightsAccessUntil", result.until().toString()));
            }
            case ALREADY_ACTIVE -> {
                log.warn("POST /api/payments/insights-pass -> 409 (still active) userId={} expiresAt={}",
                        userId, result.until());
                return ResponseEntity.status(HttpStatus.CONFLICT)
                        .body(Map.of("error", "Insights access is still active.",
                                     "insightsAccessUntil", result.until().toString()));
            }
            case NO_PROFILE_ROW -> {
                log.error("POST /api/payments/insights-pass -> 500 no profile row userId={}", userId);
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(Map.of("error", "User profile not found."));
            }
            default -> throw new IllegalStateException("Unhandled InsightsGrantResult.Status: " + result.status());
        }
    }
}

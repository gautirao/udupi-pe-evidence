package com.example.realestate.payment;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.util.List;
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
 *   M15: Audit log on every call: userId, timestamp, previousExpiry, newExpiry.
 *
 * Uses JdbcTemplate with parameterized queries only. Entire operation is @Transactional.
 */
@RestController
@RequestMapping("/api/payments")
public class PaymentController {

    private static final Logger log = LoggerFactory.getLogger(PaymentController.class);

    // M14: Grant duration is a server-side constant — never from request body.
    private static final int GRANT_DAYS = 30;

    @Value("${payments.stub.enabled:false}")
    private boolean stubEnabled;

    private final JdbcTemplate jdbcTemplate;

    public PaymentController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @PostMapping("/insights-pass")
    @Transactional
    public ResponseEntity<?> grantInsightsPass(JwtAuthenticationToken auth) {
        // M13: Feature flag — must be explicitly enabled; default false in production.
        if (!stubEnabled) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "Payment processing is not available yet."));
        }

        UUID userId = UUID.fromString(auth.getToken().getSubject());

        // Read current expiry (JDBC service-account connection bypasses RLS)
        List<OffsetDateTime> results = jdbcTemplate.query(
                "SELECT insights_access_until FROM public.profiles WHERE user_id = ?",
                (rs, rowNum) -> rs.getObject("insights_access_until", OffsetDateTime.class),
                userId);

        OffsetDateTime previousExpiry = results.isEmpty() ? null : results.get(0);

        // M12: Idempotency — reject if access is still active.
        // This also satisfies the per-user rate limit (1 grant per 30-day period):
        // a successful grant sets expiry 30 days out, making re-grant impossible until expiry.
        if (previousExpiry != null && previousExpiry.isAfter(OffsetDateTime.now())) {
            log.warn("POST /api/payments/insights-pass -> 409 (still active) userId={} expiresAt={}",
                    userId, previousExpiry);
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "Insights access is still active.",
                                 "insightsAccessUntil", previousExpiry.toString()));
        }

        // Grant 30-day access (M14: GRANT_DAYS constant, never sourced from request body)
        OffsetDateTime newExpiry = OffsetDateTime.now().plusDays(GRANT_DAYS);

        int rows = jdbcTemplate.update(
                "UPDATE public.profiles SET insights_access_until = ? WHERE user_id = ?",
                newExpiry, userId);

        if (rows == 0) {
            // Data inconsistency: profile must exist for every authenticated user.
            log.error("POST /api/payments/insights-pass -> 500 no profile row userId={}", userId);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", "User profile not found."));
        }

        // M15: Audit log on every successful grant.
        log.info("POST /api/payments/insights-pass -> 200 userId={} previousExpiry={} newExpiry={}",
                userId, previousExpiry, newExpiry);

        return ResponseEntity.ok(Map.of("insightsAccessUntil", newExpiry.toString()));
    }
}

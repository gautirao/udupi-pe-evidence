package com.example.realestate.payment;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Transactional service for payment operations.
 *
 * Owns the DB mutation for insights-pass grants.
 * Encodes the three possible outcomes as {@link InsightsGrantResult}
 * so the controller can map them to HTTP responses without touching
 * persistence concerns.
 *
 * Security controls (delegated from PaymentController):
 *   M12: Atomic conditional UPDATE — only updates if access is not currently active.
 *   M14: GRANT_DAYS is a server-side constant — never from request body.
 *   M15: Audit log on successful grant.
 */
@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    // M14: Grant duration is a server-side constant — never from request body.
    private static final int GRANT_DAYS = 30;

    private final JdbcTemplate jdbcTemplate;

    public PaymentService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Grants a 30-day insights pass for the given user.
     *
     * <p>Uses an atomic conditional UPDATE (M12) to close the TOCTOU window:
     * only one concurrent request can win the UPDATE; all others see rows == 0
     * and fall through to the follow-up SELECT to determine whether access is
     * still active or the profile row is missing.
     *
     * @param userId the authenticated user's UUID (derived from JWT by caller — never client-supplied)
     * @return {@link InsightsGrantResult} encoding one of three outcomes
     */
    @Transactional
    public InsightsGrantResult grantInsightsPass(UUID userId) {
        // Grant 30-day access (M14: GRANT_DAYS constant, never sourced from request body)
        OffsetDateTime newExpiry = OffsetDateTime.now().plusDays(GRANT_DAYS);

        // M12: Atomic conditional UPDATE — only updates if access is not currently active.
        // Fixes TOCTOU: concurrent requests both see null/expired, but only one succeeds.
        int rows = jdbcTemplate.update(
                "UPDATE public.profiles SET insights_access_until = ? " +
                "WHERE user_id = ? AND (insights_access_until IS NULL OR insights_access_until <= NOW())",
                newExpiry, userId);

        if (rows >= 1) {
            // M15: Audit log on every successful grant.
            log.info("grantInsightsPass -> GRANTED userId={} newExpiry={}", userId, newExpiry);
            return new InsightsGrantResult(InsightsGrantResult.Status.GRANTED, newExpiry);
        }

        // rows == 0: follow-up SELECT to distinguish no-profile-row vs still-active.
        List<OffsetDateTime> results = jdbcTemplate.query(
                "SELECT insights_access_until FROM public.profiles WHERE user_id = ?",
                (rs, rowNum) -> rs.getObject("insights_access_until", OffsetDateTime.class),
                userId);

        if (results.isEmpty()) {
            log.error("grantInsightsPass -> NO_PROFILE_ROW userId={}", userId);
            return new InsightsGrantResult(InsightsGrantResult.Status.NO_PROFILE_ROW, null);
        }

        OffsetDateTime activeExpiry = results.get(0);
        if (activeExpiry == null) {
            // Null expiry means the atomic UPDATE should have matched — data inconsistency.
            log.error("grantInsightsPass -> NO_PROFILE_ROW (unexpected null expiry) userId={}", userId);
            return new InsightsGrantResult(InsightsGrantResult.Status.NO_PROFILE_ROW, null);
        }

        log.warn("grantInsightsPass -> ALREADY_ACTIVE userId={} expiresAt={}", userId, activeExpiry);
        return new InsightsGrantResult(InsightsGrantResult.Status.ALREADY_ACTIVE, activeExpiry);
    }

    // ===== Result type =====

    public record InsightsGrantResult(Status status, OffsetDateTime until) {
        public enum Status { GRANTED, ALREADY_ACTIVE, NO_PROFILE_ROW }
    }
}

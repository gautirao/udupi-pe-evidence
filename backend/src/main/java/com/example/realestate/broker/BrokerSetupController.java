package com.example.realestate.broker;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * POST /api/broker/setup — assigns the 'broker' role to the authenticated user.
 *
 * This is the canonical broker setup endpoint. The underlying DB role is 'broker'
 * following the V41 migration that renamed the app_role enum value.
 *
 * Security controls (M1-M3):
 *   M1: Role value is a server-side constant — never taken from request body.
 *   M2: Rejects 409 if the user already has 'broker', 'dealer' (legacy), or 'admin' role.
 *   M3: Phone number validated server-side (regex + max 15 chars).
 *
 * Uses JdbcTemplate with only parameterized queries (no string concatenation).
 * Entire operation is @Transactional.
 */
@RestController
@RequestMapping("/api/broker")
public class BrokerSetupController {

    private static final Logger log = LoggerFactory.getLogger(BrokerSetupController.class);

    // M1: Role is a server-side constant — never sourced from request body.
    // DB value is 'broker' following the V41 app_role enum rename.
    private static final String BROKER_ROLE = "broker";

    // M3: Valid Indian phone: optional + prefix followed by 10–15 digits.
    private static final Pattern PHONE_PATTERN = Pattern.compile("^[+]?[0-9]{10,15}$");
    private static final int PHONE_MAX_LENGTH = 15;

    private final JdbcTemplate jdbcTemplate;

    public BrokerSetupController(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    // Note: @Transactional on a controller method is intentional here — mirrors DealerSetupController.
    // CGLIB proxy ensures atomicity (role insert + phone update). Refactor to a shared service is a
    // tracked follow-up when the deprecated dealer/ path is fully removed.
    @PostMapping("/setup")
    @Transactional
    public ResponseEntity<?> setup(JwtAuthenticationToken auth, @RequestBody SetupRequest req) {
        UUID userId = UUID.fromString(auth.getToken().getSubject());

        // --- Validate acceptedTerms ---
        if (req.acceptedTerms() == null || !req.acceptedTerms()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("field", "acceptedTerms", "error", "You must accept the terms to proceed."));
        }

        // --- Validate phone (M3) ---
        String phone = req.phone() != null ? req.phone().trim() : "";
        if (phone.isEmpty()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("field", "phone", "error", "Phone number is required."));
        }
        if (phone.length() > PHONE_MAX_LENGTH) {
            return ResponseEntity.badRequest()
                    .body(Map.of("field", "phone", "error", "Phone number must be 15 characters or fewer."));
        }
        if (!PHONE_PATTERN.matcher(phone).matches()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("field", "phone", "error",
                            "Invalid phone number. Use a valid Indian mobile number (e.g. +919876543210 or 9876543210)."));
        }

        // --- M2: Reject if user already has 'broker', 'dealer' (legacy), or 'admin' role ---
        List<String> existingRoles = jdbcTemplate.query(
                "SELECT role::text FROM public.user_roles WHERE user_id = ? AND role::text IN ('broker', 'dealer', 'admin') LIMIT 1",
                (rs, rowNum) -> rs.getString(1),
                userId);

        if (!existingRoles.isEmpty()) {
            log.warn("POST /api/broker/setup -> 409 (already broker/admin) userId={}", userId);
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "You already have a broker or admin role."));
        }

        // --- Assign broker role (M1: BROKER_ROLE constant, never from body) ---
        // ON CONFLICT DO NOTHING makes this idempotent; capture rows to detect concurrent duplicate (C-2).
        int rows = jdbcTemplate.update(
                "INSERT INTO public.user_roles (user_id, role) " +
                "VALUES (?, CAST(? AS public.app_role)) " +
                "ON CONFLICT (user_id, role) DO NOTHING",
                userId, BROKER_ROLE);

        if (rows == 0) {
            log.warn("POST /api/broker/setup -> 409 (concurrent duplicate) userId={}", userId);
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "You already have a broker or admin role."));
        }

        // Persist phone to profiles (C-1 fix: phone was validated but never stored).
        // C-2 fix: if no profiles row exists, roll back role grant and return 500.
        int profileRows = jdbcTemplate.update(
                "UPDATE public.profiles SET phone = ? WHERE user_id = ?",
                phone, userId);
        if (profileRows == 0) {
            log.error("POST /api/broker/setup -> 500 no profile row userId={}", userId);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "User profile not found — cannot complete broker setup.");
        }

        log.info("POST /api/broker/setup -> 200 userId={} role={}", userId, BROKER_ROLE);
        return ResponseEntity.ok(Map.of("role", BROKER_ROLE));
    }

    // --- DTO ---

    public record SetupRequest(String phone, Boolean acceptedTerms) {}
}

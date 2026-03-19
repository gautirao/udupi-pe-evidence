package com.example.realestate.dealer;

import com.example.realestate.profile.ProfileService;
import com.example.realestate.security.UserRoleService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * POST /api/dealer/setup — assigns the 'broker' role to the authenticated user.
 *
 * @deprecated Use {@code POST /api/broker/setup} instead. This path is kept for backward
 *   compatibility during the dealer → broker terminology transition (RE-114) and will be
 *   removed in a future cleanup sprint once all callers have migrated.
 *
 * Security controls (M1-M3):
 *   M1: Role value is a server-side constant — never taken from request body.
 *   M2: Rejects 409 if the user already has 'broker' or 'admin' role.
 *   M3: Phone number validated server-side (regex + max 15 chars).
 *
 * Delegates persistence to {@link ProfileService} and {@link UserRoleService}.
 * Entire operation is @Transactional.
 */
@Deprecated
@RestController
@RequestMapping("/api/dealer")
public class DealerSetupController {

    private static final Logger log = LoggerFactory.getLogger(DealerSetupController.class);

    // M1: Role is a server-side constant — never sourced from request body.
    // Write 'broker' so both /api/dealer/setup and /api/broker/setup produce the same role value.
    private static final String BROKER_ROLE = "broker";

    // M3: Valid Indian phone: optional + prefix followed by 10–15 digits.
    private static final Pattern PHONE_PATTERN = Pattern.compile("^[+]?[0-9]{10,15}$");
    private static final int PHONE_MAX_LENGTH = 15;

    private final ProfileService profileService;
    private final UserRoleService userRoleService;

    public DealerSetupController(ProfileService profileService, UserRoleService userRoleService) {
        this.profileService = profileService;
        this.userRoleService = userRoleService;
    }

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
        // findSecurityRole filters to only those three values — a plain 'user' role returns empty.
        Optional<String> existingRole = userRoleService.findSecurityRole(userId);
        if (existingRole.isPresent()) {
            log.warn("POST /api/dealer/setup -> 409 (already broker/admin) userId={}", userId);
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "You already have a broker or admin role."));
        }

        // --- Assign broker role (M1: BROKER_ROLE constant, never from body) ---
        // ON CONFLICT DO NOTHING is the final concurrent-duplicate guard (C-2).
        boolean roleInserted = userRoleService.assignRole(userId, BROKER_ROLE);
        if (!roleInserted) {
            log.warn("POST /api/dealer/setup -> 409 (concurrent duplicate) userId={}", userId);
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "You already have a broker or admin role."));
        }

        // Persist phone to profiles (C-1 fix: phone was validated but never stored).
        // C-2 fix: if no profiles row exists, roll back role grant and return 500.
        boolean phoneUpdated = profileService.updatePhone(userId, phone);
        if (!phoneUpdated) {
            log.error("POST /api/dealer/setup -> 500 no profile row userId={}", userId);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "User profile not found — cannot complete broker setup.");
        }

        log.info("POST /api/dealer/setup -> 200 userId={} role={}", userId, BROKER_ROLE);
        return ResponseEntity.ok(Map.of("role", BROKER_ROLE));
    }

    // --- DTO ---

    public record SetupRequest(String phone, Boolean acceptedTerms) {}
}

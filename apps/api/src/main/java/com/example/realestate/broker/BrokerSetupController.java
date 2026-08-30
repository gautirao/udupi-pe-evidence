package com.example.realestate.broker;

import com.example.realestate.security.PhoneValidator;
import com.example.realestate.security.UserRoleService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * POST /api/broker/setup — assigns the 'broker' role to the authenticated user.
 *
 * This is the canonical broker setup endpoint. The underlying DB role is 'broker'
 * following the V41 migration that renamed the app_role enum value.
 *
 * Security controls (M1-M3):
 *   M1: Role value is a server-side constant — never taken from request body.
 *   M2: Rejects 409 if the user already has 'broker', 'dealer' (legacy), or 'admin' role.
 *   M3: Phone number validated server-side (strict E.164 regex + max 16 chars).
 *
 * The atomic DB mutations (role insert + phone update) are delegated to
 * {@link BrokerOnboardingService}, which owns the @Transactional boundary.
 */
@RestController
@RequestMapping("/api/broker")
public class BrokerSetupController {

    private static final Logger log = LoggerFactory.getLogger(BrokerSetupController.class);

    // M1: Role is a server-side constant — never sourced from request body.
    // DB value is 'broker' following the V41 app_role enum rename.
    private static final String BROKER_ROLE = "broker";

    private final UserRoleService userRoleService;
    private final BrokerOnboardingService onboardingService;

    public BrokerSetupController(UserRoleService userRoleService,
                                  BrokerOnboardingService onboardingService) {
        this.userRoleService = userRoleService;
        this.onboardingService = onboardingService;
    }

    @PostMapping("/setup")
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
        if (phone.length() > PhoneValidator.PHONE_MAX_LENGTH) {
            return ResponseEntity.badRequest()
                    .body(Map.of("field", "phone", "error", "Phone number must be 16 characters or fewer."));
        }
        if (!PhoneValidator.PHONE_PATTERN.matcher(phone).matches()) {
            return ResponseEntity.badRequest()
                    .body(Map.of("field", "phone", "error",
                            "Phone number must be in E.164 format (e.g. +919876543210)."));
        }

        // --- M2: Reject if user already has 'broker', 'dealer' (legacy), or 'admin' role ---
        // findSecurityRole filters to only those three values — a plain 'user' role returns empty.
        Optional<String> existingRole = userRoleService.findSecurityRole(userId);
        if (existingRole.isPresent()) {
            log.warn("POST /api/broker/setup -> 409 (already broker/admin) userId={}", userId);
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "You already have a broker or admin role."));
        }

        // --- Atomic: assign broker role + persist phone (C-1 + C-2 guard) ---
        // BrokerOnboardingService owns the @Transactional boundary so that if updatePhone
        // fails (no profiles row), the role insert is rolled back.
        // Returns false if assignRole returned false (concurrent-duplicate C-2).
        // Throws ResponseStatusException(500) if no profiles row exists.
        boolean roleInserted = onboardingService.assignRoleAndPhone(userId, BROKER_ROLE, phone);
        if (!roleInserted) {
            log.warn("POST /api/broker/setup -> 409 (concurrent duplicate) userId={}", userId);
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "You already have a broker or admin role."));
        }

        log.info("POST /api/broker/setup -> 200 userId={} role={}", userId, BROKER_ROLE);
        return ResponseEntity.ok(Map.of("role", BROKER_ROLE));
    }

    // --- DTO ---

    public record SetupRequest(String phone, Boolean acceptedTerms) {}
}

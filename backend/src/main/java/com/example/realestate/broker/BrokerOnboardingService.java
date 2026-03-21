package com.example.realestate.broker;

import com.example.realestate.profile.ProfileService;
import com.example.realestate.security.UserRoleService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/**
 * Transactional service for broker/dealer onboarding.
 *
 * <p>Wraps role assignment and phone update in a single {@link Transactional} boundary so
 * that if {@code updatePhone} fails (no profiles row), the role insert is rolled back.
 *
 * <p>Authorization (terms acceptance, phone validation, M2 pre-check) is the caller's
 * responsibility. This service only performs the atomic DB mutations.
 */
@Service
public class BrokerOnboardingService {

    private final UserRoleService userRoleService;
    private final ProfileService profileService;

    public BrokerOnboardingService(UserRoleService userRoleService, ProfileService profileService) {
        this.userRoleService = userRoleService;
        this.profileService = profileService;
    }

    /**
     * Atomically assigns the given role and persists the phone number.
     *
     * @param userId the authenticated user
     * @param role   the role to assign (server-side constant — never from request body)
     * @param phone  the validated phone number to persist
     * @return {@code true} if the role was newly inserted and phone saved;
     *         {@code false} if the role already existed (concurrent-duplicate C-2)
     * @throws ResponseStatusException (500) if no profiles row exists for the user
     *                                       (role insert is rolled back by the transaction)
     */
    @Transactional
    public boolean assignRoleAndPhone(UUID userId, String role, String phone) {
        boolean roleInserted = userRoleService.assignRole(userId, role);
        if (!roleInserted) {
            return false; // C-2: concurrent duplicate — role already exists
        }
        boolean phoneUpdated = profileService.updatePhone(userId, phone);
        if (!phoneUpdated) {
            // No profiles row — data inconsistency. Throw so @Transactional rolls back role insert.
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "User profile not found — cannot complete broker setup.");
        }
        return true;
    }
}

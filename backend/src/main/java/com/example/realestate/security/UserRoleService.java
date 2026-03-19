package com.example.realestate.security;

import org.springframework.stereotype.Service;

import java.util.Optional;
import java.util.UUID;

/**
 * Provides user-role lookup for controllers across all packages.
 * Extracted from ListingService to break the listing-package coupling
 * on role resolution (RE-105).
 */
@Service
public class UserRoleService {

    private final UserRoleRepository userRoleRepository;

    public UserRoleService(UserRoleRepository userRoleRepository) {
        this.userRoleRepository = userRoleRepository;
    }

    /**
     * Returns the app_role for the given user, or empty if no role row exists.
     * No @Transactional — single SELECT reuses the enclosing transaction if present.
     */
    public Optional<String> getUserRole(UUID userId) {
        return userRoleRepository.findUserRole(userId);
    }

    /**
     * Returns the user's role only when it is a security-relevant value
     * ('broker', 'dealer', 'admin'). Returns empty for a plain 'user' role.
     * Use this for M2-style pre-checks rather than {@link #getUserRole}.
     */
    public Optional<String> findSecurityRole(UUID userId) {
        return userRoleRepository.findSecurityRole(userId);
    }

    /**
     * Assigns the given role to the user using ON CONFLICT DO NOTHING.
     *
     * <p>Uses PROPAGATION.REQUIRED (default) so this call participates in the
     * caller's transaction. Must NOT be annotated @Transactional(REQUIRES_NEW).
     *
     * @return {@code true} if the role was newly inserted; {@code false} if the
     *         role already existed (concurrent or sequential duplicate).
     */
    public boolean assignRole(UUID userId, String role) {
        return userRoleRepository.insertRoleIfAbsent(userId, role) == 1;
    }
}

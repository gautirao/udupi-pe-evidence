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
}

package com.example.realestate.security;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Data-access layer for the user_roles table.
 * Uses JdbcTemplate to avoid requiring a JPA entity for this single-column lookup.
 */
@Repository
public class UserRoleRepository {

    private final JdbcTemplate jdbc;

    public UserRoleRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Returns the role string for the given user, or empty if no row exists.
     * Mirrors the native query formerly in ListingRepository.
     */
    public Optional<String> findUserRole(UUID userId) {
        List<String> results = jdbc.queryForList(
                "SELECT role::text FROM public.user_roles WHERE user_id = ? LIMIT 1",
                String.class,
                userId);
        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }
}

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

    /**
     * Returns the user's role only if it is one of the security-relevant values
     * ('broker', 'dealer', 'admin'). A plain 'user' role returns empty.
     * Mirrors the filtered query in BrokerSetupController's original SQL.
     */
    public Optional<String> findSecurityRole(UUID userId) {
        List<String> results = jdbc.queryForList(
                "SELECT role::text FROM public.user_roles" +
                " WHERE user_id = ? AND role::text IN ('broker', 'dealer', 'admin') LIMIT 1",
                String.class,
                userId);
        return results.isEmpty() ? Optional.empty() : Optional.of(results.get(0));
    }

    /**
     * Inserts the given role for the user using ON CONFLICT DO NOTHING.
     *
     * @return 1 if the row was inserted; 0 if the role already existed (conflict was suppressed).
     */
    public int insertRoleIfAbsent(UUID userId, String role) {
        return jdbc.update(
                "INSERT INTO public.user_roles (user_id, role) " +
                "VALUES (?, CAST(? AS public.app_role)) " +
                "ON CONFLICT (user_id, role) DO NOTHING",
                userId, role);
    }
}

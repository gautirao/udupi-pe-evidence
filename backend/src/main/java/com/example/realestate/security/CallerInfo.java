package com.example.realestate.security;

import java.util.UUID;

/**
 * Resolved caller identity — userId, role, and admin flag derived from JWT + user_roles table.
 * Produced by {@link CallerInfoResolver}; injected as a controller method parameter.
 */
public record CallerInfo(UUID userId, String role, boolean isAdmin) {}

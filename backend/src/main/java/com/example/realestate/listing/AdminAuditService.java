package com.example.realestate.listing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Writes tamper-evident audit rows to admin_audit_log after admin actions.
 * All writes are fire-and-forget (@Async); failures are logged but never re-thrown
 * so audit failures cannot affect the primary admin workflow.
 */
@Service
public class AdminAuditService {

    private static final Logger log = LoggerFactory.getLogger(AdminAuditService.class);

    private final JdbcTemplate jdbcTemplate;

    public AdminAuditService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * Records an admin action asynchronously.
     *
     * @param adminId    UUID of the admin performing the action
     * @param action     Short action name (e.g. "listing_approved", "locality_renamed")
     * @param entityType Entity type (e.g. "listing", "locality")
     * @param entityId   UUID of the affected entity (nullable)
     * @param beforeJson JSON string of state before the action (nullable)
     * @param afterJson  JSON string of state after the action (nullable)
     */
    /**
     * Returns the most recent audit log entries (up to {@code limit} rows).
     */
    public List<AuditLogEntry> getRecent(int limit) {
        return jdbcTemplate.query(
                """
                SELECT id, admin_id, action, entity_type, entity_id,
                       before_json::text, after_json::text, created_at
                FROM public.admin_audit_log
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (rs, rowNum) -> new AuditLogEntry(
                        UUID.fromString(rs.getString("id")),
                        UUID.fromString(rs.getString("admin_id")),
                        rs.getString("action"),
                        rs.getString("entity_type"),
                        rs.getString("entity_id") != null
                                ? UUID.fromString(rs.getString("entity_id")) : null,
                        rs.getString("before_json"),
                        rs.getString("after_json"),
                        rs.getObject("created_at", OffsetDateTime.class)),
                limit);
    }

    public record AuditLogEntry(UUID id, UUID adminId, String action, String entityType,
                                UUID entityId, String beforeJson, String afterJson,
                                OffsetDateTime createdAt) {}

    @Async
    public void record(UUID adminId, String action, String entityType,
                       UUID entityId, String beforeJson, String afterJson) {
        try {
            jdbcTemplate.update(
                    """
                    INSERT INTO public.admin_audit_log
                        (admin_id, action, entity_type, entity_id, before_json, after_json)
                    VALUES (?, ?, ?, ?, CAST(? AS jsonb), CAST(? AS jsonb))
                    """,
                    adminId, action, entityType, entityId, beforeJson, afterJson);
            log.debug("Audit record written adminId={} action={} entityType={} entityId={}",
                    adminId, action, entityType, entityId);
        } catch (Exception e) {
            log.error("Failed to write audit record adminId={} action={}", adminId, action, e);
            // Do NOT rethrow — audit failure must not affect the primary action
        }
    }
}

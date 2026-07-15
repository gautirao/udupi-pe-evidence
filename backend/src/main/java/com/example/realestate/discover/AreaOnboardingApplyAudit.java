package com.example.realestate.discover;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Component;

/**
 * Writes {@code area_onboarding_apply_audit} rows on behalf of {@link AreaOnboardingApplyService}
 * (#1887 PR2, design decision D2). A thin DAO — no business logic, no decision-making about
 * WHETHER to audit (that is the service's job); this class only serializes and persists.
 *
 * <h2>Idempotent insert (#1887 rework FIX 2)</h2>
 * {@code area_onboarding_apply_audit} carries a {@code UNIQUE (batch_id, candidate_id, action)}
 * constraint; {@link #record} inserts with {@code ON CONFLICT ... DO NOTHING} and returns whether
 * a NEW row was actually inserted. This makes a repeat identical action (most notably
 * {@link ApplyAction#GEOMETRY_PRESERVED} on an unchanged re-apply) a true no-op instead of
 * re-auditing the same protected-geometry decision on every call.
 */
@Component
class AreaOnboardingApplyAudit {

    private final JdbcOperations jdbcOperations;
    private final ObjectMapper objectMapper;

    AreaOnboardingApplyAudit(JdbcOperations jdbcOperations, ObjectMapper objectMapper) {
        this.jdbcOperations = jdbcOperations;
        this.objectMapper = objectMapper;
    }

    /**
     * Persists one audit row. {@code candidateId} may be {@code null} (a batch-scoped action, e.g.
     * {@link ApplyAction#REGION_RECLASS_ENQUEUED}, is not tied to a single candidate).
     * {@code before}/{@code after} may be {@code null} and are serialized verbatim via Jackson —
     * callers pass whatever snapshot record best documents the change. Returns {@code true} iff a
     * NEW row was inserted (i.e. this exact {@code (batch_id, candidate_id, action)} had not
     * already been recorded — #1887 rework FIX 2).
     */
    boolean record(long batchId, Long candidateId, String areaKey, ApplyAction action,
            Object before, Object after, String reason, String appliedBy) {
        int rows = jdbcOperations.update(INSERT_AUDIT_SQL,
                batchId, candidateId, areaKey, action.name(),
                toJson(before), toJson(after), reason, appliedBy);
        return rows > 0;
    }

    private String toJson(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            // Audit payloads are plain records of String/Double/Set<String> fields — Jackson
            // cannot fail to serialize them. Treated as a hard failure (not silently swallowed):
            // an apply whose own audit trail can't be captured must not proceed as if it had been.
            throw new IllegalStateException("Failed to serialize apply-audit payload", e);
        }
    }

    private static final String INSERT_AUDIT_SQL = """
            INSERT INTO area_onboarding_apply_audit
                (batch_id, candidate_id, area_key, action, before_json, after_json, reason, applied_by)
            VALUES (?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?)
            ON CONFLICT (batch_id, candidate_id, action) DO NOTHING
            """;
}

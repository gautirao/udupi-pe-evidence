package com.example.realestate.trust;

import com.example.realestate.listing.audit.AdminAuditService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Revokes EARNED badges when trust-relevant listing fields are changed by an edit.
 *
 * <p>Material field → badge mapping:
 * <ul>
 *   <li>{@code latitude}, {@code longitude}, {@code locality}, {@code areaKey} →
 *       revoke LOCATION badge if EARNED</li>
 *   <li>{@code propertyType} → revoke PHOTOS badge if EARNED</li>
 * </ul>
 *
 * <p>Revocation transitions the badge state EARNED → AVAILABLE (not SUSPENDED).
 * An audit record with action {@code BADGE_INVALIDATED} is written for each badge
 * revoked. After all revocations in a single call, the trust tier is recalculated
 * and persisted via {@link BadgeService#recalculateAndPersistTier(UUID)}.
 *
 * <p>This service is intentionally not calling {@link BadgeService#grantBadge} or
 * any other mutating method on {@link BadgeService} to avoid double tier recalculation.
 * It writes directly to the repository and calls
 * {@link BadgeService#recalculateAndPersistTier(UUID)} once after all revocations.
 */
@Service
public class BadgeInvalidationService {

    private static final Logger log = LoggerFactory.getLogger(BadgeInvalidationService.class);

    /**
     * Sentinel actor UUID used in audit records when badge invalidation is triggered
     * automatically by a listing edit (no human actor present).
     */
    static final UUID SYSTEM_ACTOR =
            UUID.fromString("00000000-0000-0000-0000-000000000000");

    private static final String ENTITY_TYPE_BADGE = "listing_verification_dimension";

    /** Listing field names whose change invalidates the LOCATION badge. */
    private static final List<String> LOCATION_FIELDS =
            List.of("latitude", "longitude", "locality", "areaKey");

    /** Listing field names whose change invalidates the PHOTOS badge. */
    private static final List<String> PHOTOS_FIELDS =
            List.of("propertyType");

    private final ListingVerificationDimensionRepository dimensionRepository;
    private final BadgeService badgeService;
    private final AdminAuditService adminAuditService;
    private final ObjectMapper objectMapper;

    public BadgeInvalidationService(
            ListingVerificationDimensionRepository dimensionRepository,
            BadgeService badgeService,
            AdminAuditService adminAuditService,
            ObjectMapper objectMapper) {
        this.dimensionRepository = dimensionRepository;
        this.badgeService = badgeService;
        this.adminAuditService = adminAuditService;
        this.objectMapper = objectMapper;
    }

    /**
     * Unconditionally revokes the named badge dimension for a listing if it is currently EARNED.
     *
     * <p>Use this method when the trigger is not a field edit but a discrete operation such as
     * an image add or delete. Unlike {@link #invalidateOnEdit}, this method does not compare
     * snapshots — the caller is responsible for deciding that revocation is warranted.
     *
     * <p>If the dimension row does not exist, or is not in EARNED state, this is a no-op.
     * After revocation the trust tier is recalculated and persisted via
     * {@link BadgeService#recalculateAndPersistTier(UUID)}.
     *
     * @param listingId     the listing whose badge may be revoked; must not be null
     * @param dimensionType the badge dimension to revoke (e.g. "PHOTOS")
     * @param triggerField  a short label written to the audit log (e.g. "IMAGE_CHANGE")
     */
    @Transactional
    public void invalidateSpecificDimension(UUID listingId, String dimensionType, String triggerField) {
        Objects.requireNonNull(listingId, "listingId must not be null");

        boolean revoked = revokeIfEarned(listingId, dimensionType, triggerField);
        if (revoked) {
            badgeService.recalculateAndPersistTier(listingId);
        }
    }

    /**
     * Inspects the pre-update and post-update field snapshots for a listing edit and
     * revokes any EARNED badges whose trust-relevant fields have changed.
     *
     * <p>The method is a no-op when neither snapshot contains a material field change.
     * Only badges in {@code EARNED} state are affected; badges in any other state
     * (AVAILABLE, PENDING, SUSPENDED, EXPIRED) are left untouched.
     *
     * <p>After all revocations in this call, the trust tier is recalculated and
     * persisted exactly once regardless of how many badges were revoked.
     *
     * @param listingId      the listing being edited; must not be null
     * @param previousValues field snapshot before the edit (field name → value, may be null/empty)
     * @param newValues      field snapshot after the edit (field name → value, may be null/empty)
     */
    @Transactional
    public void invalidateOnEdit(
            UUID listingId,
            Map<String, Object> previousValues,
            Map<String, Object> newValues) {

        Objects.requireNonNull(listingId, "listingId must not be null");

        if (previousValues == null || newValues == null) {
            return;
        }

        boolean locationChanged = anyFieldChanged(previousValues, newValues, LOCATION_FIELDS);
        boolean photosChanged = anyFieldChanged(previousValues, newValues, PHOTOS_FIELDS);

        if (!locationChanged && !photosChanged) {
            return;
        }

        boolean anyRevoked = false;

        if (locationChanged) {
            String triggerField = firstChangedField(previousValues, newValues, LOCATION_FIELDS);
            boolean revoked = revokeIfEarned(listingId, "LOCATION", triggerField);
            if (revoked) {
                anyRevoked = true;
            }
        }

        if (photosChanged) {
            String triggerField = firstChangedField(previousValues, newValues, PHOTOS_FIELDS);
            boolean revoked = revokeIfEarned(listingId, "PHOTOS", triggerField);
            if (revoked) {
                anyRevoked = true;
            }
        }

        if (anyRevoked) {
            badgeService.recalculateAndPersistTier(listingId);
        }
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Returns true if any field in {@code fields} has a different value between
     * {@code previousValues} and {@code newValues}, using {@link Objects#equals}
     * for comparison. A field present in only one map is considered changed.
     */
    private boolean anyFieldChanged(
            Map<String, Object> previousValues,
            Map<String, Object> newValues,
            List<String> fields) {
        for (String field : fields) {
            if (!Objects.equals(previousValues.get(field), newValues.get(field))) {
                return true;
            }
        }
        return false;
    }

    /**
     * Returns the name of the first changed field from {@code fields}, or the first
     * field name as a fallback (should not occur in practice given the prior
     * {@link #anyFieldChanged} guard).
     */
    private String firstChangedField(
            Map<String, Object> previousValues,
            Map<String, Object> newValues,
            List<String> fields) {
        for (String field : fields) {
            if (!Objects.equals(previousValues.get(field), newValues.get(field))) {
                return field;
            }
        }
        return fields.get(0);
    }

    /**
     * If the given {@code dimensionType} badge is currently EARNED, transitions it to
     * AVAILABLE, clears {@code granted_at}, and writes a {@code BADGE_INVALIDATED}
     * audit record including the triggering field name.
     *
     * @param listingId     the listing whose badge may be revoked
     * @param dimensionType the badge dimension to check (e.g. "LOCATION", "PHOTOS")
     * @param triggerField  the field name that triggered the invalidation; written to the audit log
     * @return true if the badge was revoked, false if it was absent or not in EARNED state
     */
    private boolean revokeIfEarned(UUID listingId, String dimensionType, String triggerField) {
        return dimensionRepository
                .findByListingIdAndDimensionType(listingId, dimensionType)
                .filter(d -> "EARNED".equals(d.getBadgeState()))
                .map(d -> {
                    OffsetDateTime now = OffsetDateTime.now();
                    String previousState = d.getBadgeState();

                    d.setBadgeState("AVAILABLE");
                    d.setGrantedAt(null);
                    d.setUpdatedAt(now);

                    ListingVerificationDimension saved = dimensionRepository.save(d);

                    String beforeJson = buildStateJson(dimensionType, previousState);
                    String afterJson = buildInvalidatedAuditJson(dimensionType, "AVAILABLE", triggerField);

                    adminAuditService.record(
                            SYSTEM_ACTOR,
                            "BADGE_INVALIDATED",
                            ENTITY_TYPE_BADGE,
                            saved.getId(),
                            beforeJson,
                            afterJson);

                    log.info("Badge invalidated listingId={} dimension={} triggerField={}",
                            listingId, dimensionType, triggerField);

                    return true;
                })
                .orElse(false);
    }

    /**
     * Builds a minimal state snapshot JSON string for the before-state audit payload.
     * Returns null when {@code badgeState} is null.
     */
    private String buildStateJson(String dimensionType, String badgeState) {
        if (badgeState == null) {
            return null;
        }
        Map<String, String> payload = new LinkedHashMap<>();
        payload.put("dimensionType", dimensionType);
        payload.put("badgeState", badgeState);
        return toJsonOrNull(payload);
    }

    /**
     * Builds the after-state audit JSON for a badge invalidation, including the
     * field name that triggered revocation.
     */
    private String buildInvalidatedAuditJson(
            String dimensionType, String badgeState, String triggerField) {
        Map<String, String> payload = new LinkedHashMap<>();
        payload.put("dimensionType", dimensionType);
        payload.put("badgeState", badgeState);
        payload.put("triggerField", triggerField);
        return toJsonOrNull(payload);
    }

    /**
     * Converts a map to a JSON string. On {@link JsonProcessingException}, logs a warning
     * and returns null so that audit serialization failures never abort the main transaction.
     */
    private String toJsonOrNull(Map<String, String> payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize audit JSON payload — audit record will have null json", e);
            return null;
        }
    }
}

package com.example.realestate.savedsearch;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface SavedSearchRepository extends JpaRepository<SavedSearch, UUID> {

    Optional<SavedSearch> findByIdAndUserId(UUID id, UUID userId);

    List<SavedSearch> findByUserIdOrderByCreatedAtDesc(UUID userId);

    Optional<SavedSearch> findByUserIdAndFingerprint(UUID userId, String fingerprint);

    long countByUserIdAndStatus(UUID userId, SavedSearchStatus status);

    /**
     * #2019 Slice B: ACTIVE, non-OFF searches whose frequency interval has elapsed since the
     * last alert (never-alerted rows are always due). 30-minute tolerance absorbs scheduler
     * jitter so a DAILY search alerted at 03:17 is due again at the 03:17 tick the next day, not
     * 04:17. {@code OFF} keeps the search browsable but never alerts. Deterministic order for a
     * stable run.
     */
    @Query(value = """
            SELECT s.* FROM saved_searches s
            WHERE s.status = 'ACTIVE'
              AND s.alert_frequency <> 'OFF'
              AND (s.last_alerted_at IS NULL
                   OR s.last_alerted_at <= CAST(:now AS timestamptz) - (
                        CASE s.alert_frequency
                            WHEN 'INSTANT' THEN INTERVAL '0'
                            WHEN 'WEEKLY'  THEN INTERVAL '7 days'
                            ELSE                INTERVAL '24 hours'
                        END - INTERVAL '30 minutes'))
            ORDER BY s.created_at ASC, s.id ASC
            """, nativeQuery = true)
    List<SavedSearch> findDueForAlertEvaluation(@Param("now") OffsetDateTime now);

    /**
     * #2019 Slice B: compare-and-set advance of the lexicographic delivery cursor
     * {@code (alert_watermark, alert_watermark_listing_id)}. Returns 1 only if the row is still
     * ACTIVE and BOTH cursor halves are exactly what the matcher evaluated against ({@code IS NOT
     * DISTINCT FROM} handles the NULL first-run case); 0 means an overlapping run won or the
     * search was paused/deleted mid-run — the caller must roll back its bookkeeping.
     */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = """
            UPDATE saved_searches
               SET alert_watermark            = CAST(:watermarkTo AS timestamptz),
                   alert_watermark_listing_id = CAST(:watermarkToListingId AS uuid),
                   last_alerted_at            = CAST(:alertedAt AS timestamptz),
                   alert_status               = 'SENT'
             WHERE id = :id
               AND status = 'ACTIVE'
               AND alert_watermark IS NOT DISTINCT FROM CAST(:expected AS timestamptz)
               AND alert_watermark_listing_id IS NOT DISTINCT FROM CAST(:expectedListingId AS uuid)
            """, nativeQuery = true)
    int advanceWatermark(
            @Param("id") UUID id,
            @Param("expected") OffsetDateTime expected,
            @Param("expectedListingId") UUID expectedListingId,
            @Param("watermarkTo") OffsetDateTime watermarkTo,
            @Param("watermarkToListingId") UUID watermarkToListingId,
            @Param("alertedAt") OffsetDateTime alertedAt);

    /** #2019 Slice B: evaluation failure marker; watermark untouched so the next run retries. */
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query(value = "UPDATE saved_searches SET alert_status = 'ERROR' WHERE id = :id", nativeQuery = true)
    int markAlertError(@Param("id") UUID id);

    /**
     * #2481: scalar JPQL projection (NOT {@code findById}) so the read bypasses the Hibernate L1
     * cache and always reflects the current DB state, even when the entity is already managed in
     * the caller's persistence context from a load minutes earlier. Used to re-check email consent
     * immediately before the outbound send, since the field on an already-loaded {@link SavedSearch}
     * can go stale mid-run if the owner opts out concurrently.
     */
    @Query("select s.emailAlertsEnabled from SavedSearch s where s.id = :id")
    Optional<Boolean> findEmailAlertsEnabledById(@Param("id") UUID id);
}

package com.example.realestate.broker.demand;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Repository for {@link BrokerDemandGapState}.
 *
 * <p>All read and write operations are scoped to the calling broker via
 * {@code broker_id = :brokerId} in every WHERE clause — ownership is enforced at the
 * SQL layer, not post-query in Java. The caller supplies only their JWT-resolved userId;
 * no client-supplied broker identity is accepted.
 *
 * <p><b>Idempotent upsert pattern</b> (mirroring {@code BrokerMarketFocusService}):
 * {@code INSERT ... ON CONFLICT ON CONSTRAINT uq_broker_demand_gap_state_bucket DO UPDATE}
 * sets only the target timestamp (read_at or dismissed_at). First-write created_at is
 * preserved by limiting DO UPDATE to the specific column; a second upsert for the same
 * bucket is a controlled SET, not a full replace.
 *
 * <p><b>IDOR safety:</b> load-by-id methods include {@code broker_id = :brokerId}
 * so a broker cannot load or mutate another broker's state row even if they guess the UUID.
 */
public interface BrokerDemandGapStateRepository extends JpaRepository<BrokerDemandGapState, UUID> {

    /**
     * Returns all state rows for the calling broker.
     * Ownership-scoped: only rows where broker_id = brokerId are returned.
     *
     * @param brokerId JWT-resolved broker UUID; never client-supplied
     * @return list of rows; empty when none exist
     */
    List<BrokerDemandGapState> findByBrokerId(UUID brokerId);

    /**
     * Loads a specific state row by id, scoped to the calling broker.
     * Returns empty when the row does not exist OR is owned by a different broker —
     * the caller cannot distinguish which; both surface as 404 (no enumeration).
     *
     * @param id       state row UUID (from /alerts/{id} path param)
     * @param brokerId JWT-resolved broker UUID
     * @return the row if it exists and is owned by this broker; empty otherwise
     */
    Optional<BrokerDemandGapState> findByIdAndBrokerId(UUID id, UUID brokerId);

    /**
     * Idempotent upsert: inserts a new state row or updates read_at on conflict.
     *
     * <p>ON CONFLICT ON CONSTRAINT uq_broker_demand_gap_state_bucket
     * DO UPDATE SET read_at = EXCLUDED.read_at — only read_at is updated; dismissed_at
     * and created_at are not touched. Re-marking as read is a no-op if read_at is already set
     * (COALESCE preserves the first read_at).
     *
     * @param brokerId      JWT-resolved broker UUID
     * @param areaKey       area key
     * @param propertyType  property type
     * @param listingPurpose listing purpose
     * @param budgetBand    budget band (may be UNSPECIFIED)
     * @param week          ISO week Monday UTC
     * @param readAt        timestamp to record as read_at
     */
    @Modifying
    @Query(value = """
            INSERT INTO broker_demand_gap_state
                (broker_id, area_key, property_type, listing_purpose, budget_band, week, read_at, created_at)
            VALUES (:brokerId, :areaKey, :propertyType, :listingPurpose, :budgetBand, :week, :readAt, now())
            ON CONFLICT ON CONSTRAINT uq_broker_demand_gap_state_bucket
            DO UPDATE SET
                read_at = COALESCE(broker_demand_gap_state.read_at, EXCLUDED.read_at)
            """, nativeQuery = true)
    void upsertReadAt(@Param("brokerId") UUID brokerId,
                      @Param("areaKey") String areaKey,
                      @Param("propertyType") String propertyType,
                      @Param("listingPurpose") String listingPurpose,
                      @Param("budgetBand") String budgetBand,
                      @Param("week") LocalDate week,
                      @Param("readAt") Instant readAt);

    /**
     * Idempotent upsert: inserts a new state row or updates dismissed_at on conflict.
     *
     * <p>ON CONFLICT ON CONSTRAINT uq_broker_demand_gap_state_bucket
     * DO UPDATE SET dismissed_at = COALESCE(existing.dismissed_at, EXCLUDED.dismissed_at)
     * — preserves the FIRST dismiss timestamp; subsequent dismiss calls are true no-ops for the
     * dismissed_at value. This mirrors {@link #upsertReadAt} and ensures first-dismiss time is
     * immutable, which is required for the #1589 durable-history follow-up. created_at is not touched.
     *
     * @param brokerId      JWT-resolved broker UUID
     * @param areaKey       area key
     * @param propertyType  property type
     * @param listingPurpose listing purpose
     * @param budgetBand    budget band (may be UNSPECIFIED)
     * @param week          ISO week Monday UTC
     * @param dismissedAt   timestamp to record as dismissed_at (preserved as first-dismiss only)
     */
    @Modifying
    @Query(value = """
            INSERT INTO broker_demand_gap_state
                (broker_id, area_key, property_type, listing_purpose, budget_band, week, dismissed_at, created_at)
            VALUES (:brokerId, :areaKey, :propertyType, :listingPurpose, :budgetBand, :week, :dismissedAt, now())
            ON CONFLICT ON CONSTRAINT uq_broker_demand_gap_state_bucket
            DO UPDATE SET
                dismissed_at = COALESCE(broker_demand_gap_state.dismissed_at, EXCLUDED.dismissed_at)
            """, nativeQuery = true)
    void upsertDismissedAt(@Param("brokerId") UUID brokerId,
                           @Param("areaKey") String areaKey,
                           @Param("propertyType") String propertyType,
                           @Param("listingPurpose") String listingPurpose,
                           @Param("budgetBand") String budgetBand,
                           @Param("week") LocalDate week,
                           @Param("dismissedAt") Instant dismissedAt);
}

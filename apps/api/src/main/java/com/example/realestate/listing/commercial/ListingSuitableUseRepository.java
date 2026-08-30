package com.example.realestate.listing.commercial;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Repository
public interface ListingSuitableUseRepository extends JpaRepository<ListingSuitableUse, UUID> {

    List<ListingSuitableUse> findByListingIdOrderByCodeAsc(UUID listingId);

    /**
     * Explicit JPQL bulk delete (#2038) — replaces the previous Spring Data DERIVED delete,
     * which SELECTed the rows and queued {@code EntityDeleteAction}s instead of issuing an
     * immediate SQL DELETE. Because {@link ListingSuitableUse#id} is
     * {@code @GeneratedValue(AUTO)}, the matching re-inserts in the REPLACE writer are also
     * queued as {@code EntityInsertAction}s, and Hibernate's {@code ActionQueue} always runs ALL
     * queued insertions before ALL queued deletions — so a forced flush elsewhere in the same
     * transaction (see {@code ResidentialUnitDetailRepository.upsertFromListing}) re-inserted
     * the new codes while the old identical rows still physically existed, violating
     * {@code UNIQUE (listing_id, code)}. A JPQL bulk delete is executed immediately against the
     * database, before any queued insert, which eliminates the ordering hazard. This table was
     * inferred (not empirically tested) to share the defect — same constraint, same code shape
     * as the three confirmed tables (SQ3) — so it is fixed alongside them for consistency.
     *
     * <p>{@code flushAutomatically = true} does NOT make this DELETE execute sooner — a JPQL
     * bulk {@code executeUpdate()} always hits the database directly, regardless of the flush
     * flag. Unlike {@code listing_amenities} (shared by both the residential {@code amenities}
     * writer and the commercial {@code utilities} writer, and previously written by both in the
     * same request before {@code ListingCrudService.updateListing} gated them on mutually
     * exclusive family membership; see {@code ListingAmenityRepository#deleteByListingId}),
     * {@code listing_suitable_uses} has exactly one writer per request ({@code
     * writeCommercialChildSets}), so no equivalent double-write hazard exists today. The flag
     * is kept for consistency with that shared repository pattern and as a defensive guard
     * should a second writer ever be added to this table. {@code clearAutomatically} is
     * deliberately left at its default
     * ({@code false}) — this repository is called from {@code ListingCrudService.updateListing}
     * before {@code refreshTypedProjections}, {@code updateBoundary} and
     * {@code snapshotTrustFields}, all of which read the already-loaded {@code saved} {@code
     * Listing} entity later in the SAME transaction; a persistence-context clear would detach
     * that entity and is an unnecessary, unjustified side effect for a delete that touches an
     * unrelated table.
     *
     * <p>A JPQL bulk delete intentionally bypasses the persistence context: it does NOT fire
     * {@code @PreRemove}/{@code @PostRemove} lifecycle callbacks and does NOT cascade to
     * associations. {@link ListingSuitableUse} declares neither, so this is a safe no-op change
     * in that respect for this entity.
     */
    @Modifying(flushAutomatically = true)
    @Transactional
    @Query("DELETE FROM ListingSuitableUse u WHERE u.listingId = :listingId")
    void deleteByListingId(@Param("listingId") UUID listingId);
}

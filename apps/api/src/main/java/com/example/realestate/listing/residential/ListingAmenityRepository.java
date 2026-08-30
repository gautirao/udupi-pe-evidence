package com.example.realestate.listing.residential;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Repository
public interface ListingAmenityRepository extends JpaRepository<ListingAmenity, UUID> {

    List<ListingAmenity> findByListingIdOrderByCodeAsc(UUID listingId);

    /**
     * Explicit JPQL bulk delete (#2038) — replaces the previous Spring Data DERIVED delete,
     * which SELECTed the rows and queued {@code EntityDeleteAction}s instead of issuing an
     * immediate SQL DELETE. Because {@link ListingAmenity#id} is {@code @GeneratedValue(AUTO)},
     * the matching re-inserts in the REPLACE writer are also queued as
     * {@code EntityInsertAction}s, and Hibernate's {@code ActionQueue} always runs ALL queued
     * insertions before ALL queued deletions — so a forced flush elsewhere in the same
     * transaction (see {@code ResidentialUnitDetailRepository.upsertFromListing}) re-inserted
     * the new codes while the old identical rows still physically existed, violating
     * {@code UNIQUE (listing_id, code)}. A JPQL bulk delete is executed immediately against the
     * database, before any queued insert, which eliminates the ordering hazard.
     *
     * <p>{@code flushAutomatically = true} is retained defensively, not because it makes the
     * DELETE execute sooner — a JPQL bulk {@code executeUpdate()} always hits the database
     * directly, regardless of the flush flag. {@code listing_amenities} is written by BOTH
     * {@code writeResidentialChildSets} (for {@code amenities}) and {@code
     * writeCommercialChildSets} (for {@code utilities}), because the commercial {@code utilities}
     * list reuses this same table — but {@code ListingCrudService.updateListing} now gates which
     * of those two writers can run for a given request on {@code isResidentialFamily} /
     * {@code isCommercialFamily} (mutually-exclusive property_type membership checks), so the two
     * writers can no longer both fire in the same request and the cross-family double write this
     * flag originally guarded against is prevented by construction at the call site. The flag is
     * left in place so that if a future change ever reintroduces two writers touching this table
     * in one request, queued inserts still flush to the database before any subsequent DELETE in
     * the same transaction, rather than relying on every future caller to remember why that
     * matters. {@code clearAutomatically} is deliberately left at its default
     * ({@code false}) — this repository is called from {@code ListingCrudService.updateListing}
     * before {@code refreshTypedProjections}, {@code updateBoundary} and
     * {@code snapshotTrustFields}, all of which read the already-loaded {@code saved} {@code
     * Listing} entity later in the SAME transaction; a persistence-context clear would detach
     * that entity and is an unnecessary, unjustified side effect for a delete that touches an
     * unrelated table.
     *
     * <p>A JPQL bulk delete intentionally bypasses the persistence context: it does NOT fire
     * {@code @PreRemove}/{@code @PostRemove} lifecycle callbacks and does NOT cascade to
     * associations. {@link ListingAmenity} declares neither, so this is a safe no-op change in
     * that respect for this entity.
     */
    @Modifying(flushAutomatically = true)
    @Transactional
    @Query("DELETE FROM ListingAmenity a WHERE a.listingId = :listingId")
    void deleteByListingId(@Param("listingId") UUID listingId);
}

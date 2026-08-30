package com.example.realestate.listing.agricultural;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Repository
public interface ListingAgriCropRepository extends JpaRepository<ListingAgriCrop, UUID> {

    List<ListingAgriCrop> findByListingIdOrderByCodeAsc(UUID listingId);

    /**
     * Explicit JPQL bulk delete (mirrors
     * {@link com.example.realestate.listing.residential.ListingLocationFeatureRepository#deleteByListingId}
     * — see that method's javadoc for the full ordering-hazard rationale (#2038):
     * a JPQL bulk {@code executeUpdate()} hits the database immediately, before any queued
     * insert in the same transaction, avoiding a UNIQUE constraint violation that a
     * Spring-Data-derived delete (which queues an {@code EntityDeleteAction} instead) could
     * trigger when a forced flush elsewhere in the same transaction re-inserts the same codes.
     */
    @Modifying(flushAutomatically = true)
    @Transactional
    @Query("DELETE FROM ListingAgriCrop f WHERE f.listingId = :listingId")
    void deleteByListingId(@Param("listingId") UUID listingId);
}

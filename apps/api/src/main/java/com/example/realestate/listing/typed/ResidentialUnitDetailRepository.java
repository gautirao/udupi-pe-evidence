package com.example.realestate.listing.typed;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * Repository for {@link ResidentialUnitDetail}.
 *
 * <p>Read path: used by {@code SearchOutboxPoller} to load the residential detail row when
 * indexing a RESIDENTIAL listing into OpenSearch.
 *
 * <p>Write path (#1734): {@link #upsertFromListing} is called by {@code ListingCrudService}
 * in the same transaction as the {@code property_listings} write, keeping this projection
 * table current for newly created/updated residential listings (previously only populated by
 * the one-time V102 backfill).
 */
@Repository
public interface ResidentialUnitDetailRepository extends JpaRepository<ResidentialUnitDetail, UUID> {

    /**
     * Idempotent upsert of the residential-unit projection row for a listing, keyed on
     * {@code listing_id}. Source columns mirror the V102 backfill SELECT exactly
     * (V102__typed_listing_schema_expand_and_backfill.sql ~L262-267): bedrooms, bathrooms,
     * floor_number, total_floors, furnishing_status — the legacy flat columns on
     * {@code property_listings}.
     *
     * <p>{@code ON CONFLICT (listing_id) DO UPDATE} sets every column unconditionally
     * (no {@code COALESCE}) so a field the caller cleared to {@code null} on the listing
     * propagates to the projection row. {@code created_at} is intentionally omitted — it
     * keeps its {@code DEFAULT now()} on first insert and is never touched again, matching
     * the V102 backfill's own omission of the column.
     *
     * <p>{@code flushAutomatically = true} is required: this is a native SQL statement, and
     * Hibernate does not auto-flush pending entity changes before native queries. Without it,
     * the just-saved parent {@code Listing} row may not yet be visible to Postgres when this
     * INSERT runs, and the {@code listing_id} FK (REFERENCES property_listings(id)) would
     * fail. {@code clearAutomatically = true} evicts the first-level cache afterward so a
     * subsequent {@code findById} in the same transaction reads the fresh row.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Transactional
    @Query(nativeQuery = true, value = """
            INSERT INTO public.listing_residential_unit_details
                (listing_id, bedrooms, bathrooms, floor_number, total_floors, furnishing_status)
            VALUES
                (:listingId, :bedrooms, :bathrooms, :floorNumber, :totalFloors, :furnishingStatus)
            ON CONFLICT (listing_id) DO UPDATE SET
                bedrooms          = EXCLUDED.bedrooms,
                bathrooms         = EXCLUDED.bathrooms,
                floor_number      = EXCLUDED.floor_number,
                total_floors      = EXCLUDED.total_floors,
                furnishing_status = EXCLUDED.furnishing_status
            """)
    void upsertFromListing(
            @Param("listingId") UUID listingId,
            @Param("bedrooms") Integer bedrooms,
            @Param("bathrooms") Integer bathrooms,
            @Param("floorNumber") Integer floorNumber,
            @Param("totalFloors") Integer totalFloors,
            @Param("furnishingStatus") String furnishingStatus);

    /**
     * Deletes the residential-unit projection row for a listing (idempotent no-op if no row
     * exists). Called on family-switch away from RESIDENTIAL so a stale row never lingers.
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    void deleteByListingId(@Param("listingId") UUID listingId);
}

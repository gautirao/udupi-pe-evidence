package com.example.realestate.listing.typed;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * Repository for {@link CommercialSpaceDetail}.
 *
 * <p>Read path: used by {@code SearchOutboxPoller} to load the commercial detail row when
 * indexing a COMMERCIAL listing into OpenSearch.
 *
 * <p>Write path (#1734): {@link #upsertFromListing} is called by {@code ListingCrudService}
 * in the same transaction as the {@code property_listings} write, keeping this projection
 * table current for newly created/updated commercial listings (previously only populated by
 * the one-time V102 backfill).
 */
@Repository
public interface CommercialSpaceDetailRepository extends JpaRepository<CommercialSpaceDetail, UUID> {

    /**
     * Idempotent upsert of the commercial-space projection row for a listing, keyed on
     * {@code listing_id}. Source columns mirror the V102 backfill SELECT
     * (V102__typed_listing_schema_expand_and_backfill.sql ~L273-280) — the legacy flat
     * columns on {@code property_listings} (floor_number, total_floors, furnishing_status,
     * washrooms, parking_count, road_frontage_ft, commercial_usage) — NOT the V104 split
     * columns (washrooms_public/private, parking_public/private_count, office_*, warehouse_*,
     * etc.) — so backfilled and newly-written rows stay consistent for those columns.
     *
     * <p><b>Deliberate exception — {@code commercial_subtype}:</b> V102's backfill INSERT
     * hardcodes this column to {@code NULL} for every legacy row (V102 ~L270, "cannot
     * disambiguate shop vs office from legacy data"). This upsert does NOT mirror that;
     * populating {@code commercial_subtype} for newly created/updated listings is the core
     * purpose of #1734 (typed-search parity), so it is intentionally sourced from
     * {@code Listing.commercialSubtype} — the V104/#1730 field, written by the broker-facing
     * commercial typed-listing flow. Net effect: a V102-backfilled row that is never
     * subsequently edited keeps {@code commercial_subtype = NULL} (accepted, documented
     * divergence); any row touched by create/update through this path gets a real subtype.
     *
     * <p>{@code ON CONFLICT (listing_id) DO UPDATE} sets every column unconditionally
     * (no {@code COALESCE}) so a field the caller cleared to {@code null} on the listing
     * propagates to the projection row rather than leaving a stale non-null value behind.
     * {@code created_at} is intentionally omitted from both the INSERT column list and the
     * UPDATE SET clause — it keeps its {@code DEFAULT now()} on first insert and is never
     * touched again, matching the V102 backfill's own omission of the column.
     *
     * <p>{@code flushAutomatically = true} is required: this is a native SQL statement, and
     * Hibernate does not auto-flush pending entity changes before native queries (unlike
     * JPQL/Criteria queries). Without it, the just-saved parent {@code Listing} row may not
     * yet be visible to Postgres when this INSERT runs, and the {@code listing_id} FK
     * (REFERENCES property_listings(id)) would fail. {@code clearAutomatically = true}
     * evicts the first-level cache afterward so a subsequent {@code findById} in the same
     * transaction (e.g. a family-switch or subtype-switch re-check) reads the fresh row
     * rather than a stale cached one.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Transactional
    @Query(nativeQuery = true, value = """
            INSERT INTO public.listing_commercial_space_details
                (listing_id, commercial_subtype, floor_number, total_floors, furnishing_status,
                 washrooms, parking_count, road_frontage_ft, commercial_usage)
            VALUES
                (:listingId, :commercialSubtype, :floorNumber, :totalFloors, :furnishingStatus,
                 :washrooms, :parkingCount, :roadFrontageFt, :commercialUsage)
            ON CONFLICT (listing_id) DO UPDATE SET
                commercial_subtype = EXCLUDED.commercial_subtype,
                floor_number       = EXCLUDED.floor_number,
                total_floors       = EXCLUDED.total_floors,
                furnishing_status  = EXCLUDED.furnishing_status,
                washrooms          = EXCLUDED.washrooms,
                parking_count      = EXCLUDED.parking_count,
                road_frontage_ft   = EXCLUDED.road_frontage_ft,
                commercial_usage   = EXCLUDED.commercial_usage
            """)
    void upsertFromListing(
            @Param("listingId") UUID listingId,
            @Param("commercialSubtype") String commercialSubtype,
            @Param("floorNumber") Integer floorNumber,
            @Param("totalFloors") Integer totalFloors,
            @Param("furnishingStatus") String furnishingStatus,
            @Param("washrooms") Integer washrooms,
            @Param("parkingCount") Integer parkingCount,
            @Param("roadFrontageFt") BigDecimal roadFrontageFt,
            @Param("commercialUsage") String commercialUsage);

    /**
     * Deletes the commercial-space projection row for a listing (idempotent no-op if no row
     * exists). Called on family-switch away from COMMERCIAL so a stale row never lingers.
     */
    @Modifying(clearAutomatically = true)
    @Transactional
    void deleteByListingId(@Param("listingId") UUID listingId);
}

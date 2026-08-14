package com.example.realestate.discover;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

/**
 * Stable-key, adapter-agnostic read contract for the Agricultural Destination journey (#2151 PR B).
 *
 * <p><b>ONE implementation exists today</b> — {@link AgriDestinationPortPostgresAdapter}, reading
 * the promoted {@code agri_destination_classification} table (#2151 PR A) JOIN {@code areas} JOIN
 * {@code property_listings}. There is NO routing wrapper, NO {@code @Primary} annotation, and NO
 * class on this path reads the OpenSearch enablement flag ({@code discover} + {@code .opensearch}
 * + {@code .enabled}, deliberately never spelled as one literal in this file — see
 * {@code AgriDestinationPortStructuralAntiDriftTest}) — the insulation from a future OpenSearch
 * cutover is structural (one bean, zero flag readers), not behavioural. See {@code
 * AgriDestinationPortFlagFlipSafetyIT} (D3-T2) for the executable proof.
 *
 * <p><b>Every type reachable from this interface is deliberately adapter-agnostic</b> — a stable
 * key, a scalar, or a nested {@code record}/{@code enum} value object. No JDBC type, no
 * Postgres-specific geo function, no Spring Data repository type, and no Jackson annotation may
 * appear anywhere in this file or in any type it references. This is enforced statically by
 * {@code AgriDestinationPortStructuralAntiDriftTest} (D3-T1), which is proven able to fail by two
 * deliberately-introduced violations (see that test's class javadoc).
 *
 * <p>Count/parcel parity (AC7) holds BY CONSTRUCTION: both {@link #findDestinations} and
 * {@link #findParcels} are implemented against the SAME shared predicate
 * ({@code AgriDestinationPortPostgresAdapter#AGRI_BASE_PREDICATE}, built from ONE
 * {@code toPredicateFilters(...)} call) — there is no separately-maintained count query.
 *
 * <p>Anon projection (coarsened coordinates, withheld price) is applied ABOVE this port, in
 * {@link DiscoverAgriMapListingsService}. This port ALWAYS returns exact coordinates and price —
 * pushing coarsening into the adapter would create a second place that decides public exposure.
 */
public interface AgriDestinationPort {

    /** Maximum number of destination area keys accepted in a single scope request. Single owner
     *  of this constant (moved off {@code DiscoverAgriMapListingsService}, #2151 PR B). */
    int MAX_DESTINATION_AREA_KEYS = 50;

    /** Maximum number of parcels returned on a single page of {@link #findParcels}. */
    int MAX_PARCELS_PER_PAGE = 250;

    /**
     * Returns the destination buckets for a city, optionally scoped to a single compass direction
     * and/or a maximum distance from the city's configured origin.
     *
     * @param query stable-key scope query — see {@link DestinationScopeQuery}
     * @return the destination scope; {@code destinations} is empty (never null) for an
     *         inactive/unknown city, a direction/maxKm combination with zero eligible destinations,
     *         or a destination set with zero eligible parcels under the given filters
     * @throws org.springframework.web.server.ResponseStatusException 503 (Agri destinations not yet
     *         promoted) when the given city is ACTIVE but has never been promoted through Agri City
     *         Launch at all — see {@link AgriDestinationPortPostgresAdapter#AGRI_DESTINATIONS_NOT_YET_PROMOTED}.
     *         This is deliberately distinguishable from the empty-{@code destinations} cases above,
     *         which all represent a genuine (promoted) zero-match state (#2151 PR B correction pass, B2)
     */
    DestinationScope findDestinations(DestinationScopeQuery query);

    /**
     * Returns a page of parcels (agricultural listings) scoped to one or more destination area
     * keys.
     *
     * @param query stable-key parcel query — see {@link ParcelQuery}
     * @return one page of parcels; {@code totalMatching} is the exact count under the SAME
     *         predicate as {@link #findDestinations}'s {@code parcelCount} sum for the same scope
     */
    ParcelPage findParcels(ParcelQuery query);

    // ── Query value objects ─────────────────────────────────────────────────────────────────────

    /**
     * @param citySlug            city slug, lower-cased by the adapter
     * @param direction            compass direction key (N/NE/E/SE/S/SW/W/NW); {@code null} = all
     *                             directions
     * @param maxKm                maximum distance in km from the city origin; {@code null} = no
     *                             upper bound
     * @param filters               supported filter set — see {@link AgriDestinationFilters}
     * @param includeParcelCounts  when {@code false}, {@code parcelCount}/{@code parcelAcreage} on
     *                             each bucket are {@code null} rather than computed — a cheaper
     *                             direction/distance-only lookup
     */
    record DestinationScopeQuery(String citySlug, String direction, Double maxKm,
                                  AgriDestinationFilters filters, boolean includeParcelCounts) {}

    /**
     * @param citySlug city slug, lower-cased by the adapter
     * @param areaKeys one or more stable destination area keys (max {@value #MAX_DESTINATION_AREA_KEYS})
     * @param filters  supported filter set — see {@link AgriDestinationFilters}
     * @param page     page/size — see {@link PageSpec}
     * @param viewport optional viewport rectangle; {@code null} = no viewport filter
     */
    record ParcelQuery(String citySlug, List<String> areaKeys, AgriDestinationFilters filters,
                        PageSpec page, GeoBox viewport) {}

    /** Zero-based page index and page size (capped at {@value #MAX_PARCELS_PER_PAGE} by the adapter). */
    record PageSpec(int page, int size) {}

    /** Geographic bounding box in decimal degrees. */
    record GeoBox(double south, double west, double north, double east) {}

    /**
     * The currently server-side-supported filter set for the Agricultural Destination journey
     * (#2151 OQ2 ruling) — {@code listingPurpose} ONLY. Agri attribute filters (water source, land
     * category, etc.) remain client-side and are explicitly out of scope; this record is the
     * documented extension point for any future server-side filter.
     *
     * @param listingPurpose {@code "sale"}, {@code "rent"}, or {@code null} (no intent filter)
     */
    record AgriDestinationFilters(String listingPurpose) {}

    // ── Result value objects ────────────────────────────────────────────────────────────────────

    /** @param city         normalised city slug
     *  @param destinations ordered destination buckets; empty (never null) when nothing is in scope */
    record DestinationScope(String city, List<DestinationBucket> destinations) {}

    /**
     * One destination (stable {@code areaKey}) with its precomputed geometry and — when
     * {@code includeParcelCounts} was {@code true} on the query — its live parcel count/acreage
     * under the given filters.
     *
     * @param areaKey     the stable Destination identity — {@code areas.area_key}
     * @param displayName human-readable area name ({@code areas.name})
     * @param distanceKm  precomputed distance in km from the city's configured origin (#2151 PR A;
     *                    never recomputed per request)
     * @param bearingDeg  precomputed bearing in degrees [0,360) from the city's configured origin
     * @param direction   precomputed compass direction key
     * @param parcelCount exact count of eligible parcels for this area under the query's filters;
     *                    {@code null} when {@code includeParcelCounts} was {@code false}
     * @param parcelAcreage sum of parseable acreage across eligible parcels for this area; may be
     *                    {@code null} when no parcel has parseable land-area data, or when
     *                    {@code includeParcelCounts} was {@code false}
     */
    record DestinationBucket(String areaKey, String displayName, double distanceKm, double bearingDeg,
                              String direction, Long parcelCount, Double parcelAcreage) {}

    /**
     * @param content        the parcels on this page
     * @param page           the zero-based page index that was served
     * @param size           the page size that was served (may be less than requested if capped)
     * @param totalMatching  exact count of parcels matching the query's scope and filters
     *                       (unpaginated) — the AC7 parity anchor
     * @param hasMore        {@code true} iff {@code (page + 1) * size < totalMatching}
     */
    record ParcelPage(List<AgriParcel> content, int page, int size, long totalMatching, boolean hasMore) {}

    /**
     * Field-for-field twin of {@link AgriMapListingItem}, minus its Jackson annotation (kept out of
     * this port so the interface stays serialization-library-agnostic). Exact coordinates and price
     * are ALWAYS populated here — anonymous coarsening/withholding is applied by the composer
     * ({@link DiscoverAgriMapListingsService}), never by the port or its adapter.
     */
    record AgriParcel(
            String id,
            String title,
            String areaKey,
            Double latitude,
            Double longitude,
            String propertyType,
            String locality,
            String boundaryGeoJson,
            BigDecimal landArea,
            String landAreaUnit,
            BigDecimal computedAreaAcres,
            Long pricePaise,
            String listingPurpose,
            String waterSource,
            String landCategory,
            Boolean farmhouseAvailable,
            Boolean fencingDone,
            String roadAccess,
            String soilType,
            String cultivationStatus,
            String ownershipType,
            OffsetDateTime updatedAt
    ) {}
}

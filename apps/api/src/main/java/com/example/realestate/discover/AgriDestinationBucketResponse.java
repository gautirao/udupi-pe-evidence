package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * One destination bucket in the response of GET /api/discover/agri-destinations (#2151 PR C).
 *
 * <p>Field-for-field mirror of {@link AgriDestinationPort.DestinationBucket}. Carries no price and
 * no exact parcel coordinates — {@code distanceKm}/{@code bearingDeg} are precomputed CORRIDOR-level
 * geometry from the city's configured origin (#2151 PR A), not a parcel's own location. See
 * {@link AgriDestinationsController#getAgriDestinations}'s Cache-Control javadoc for why that makes
 * this response identical for anonymous and authenticated callers.
 *
 * <p>{@code parcelAcreage} is omitted from JSON when null ({@code @JsonInclude(NON_NULL)}) — null
 * means no parseable acreage exists among this destination's eligible parcels (mirrors
 * {@link AvailableMaxDistance#agriAcreage}'s convention).
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record AgriDestinationBucketResponse(
        /** Stable Destination identity — {@code areas.area_key}. */
        String areaKey,
        /** Human-readable area name ({@code areas.name}). */
        String displayName,
        /** Precomputed distance in km from the city's configured origin. */
        double distanceKm,
        /** Precomputed bearing in degrees [0,360) from the city's configured origin. */
        double bearingDeg,
        /** Precomputed compass direction key (N/NE/E/SE/S/SW/W/NW). */
        String direction,
        /** Exact count of eligible parcels for this area under the query's filters (never null —
         *  this endpoint always requests parcel counts). */
        Long parcelCount,
        /** Sum of parseable acreage in acres across eligible parcels for this area; may be null when
         *  no parcel has parseable land-area data. */
        Double parcelAcreage
) {}

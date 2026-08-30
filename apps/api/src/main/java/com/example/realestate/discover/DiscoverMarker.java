package com.example.realestate.discover;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Lightweight map marker payload.
 *
 * <p>Jackson serializes Java record component names verbatim, so {@code @JsonProperty} is placed
 * on each component that must use a different JSON key.  {@code latitude} → {@code lat} and
 * {@code longitude} → {@code lon} shrink marker payloads and match the frontend contract
 * (issue #984).
 *
 * <p>{@code propertyType} is nullable; {@link JsonInclude#NON_NULL} is scoped to this field
 * only so it is omitted from the payload when null, leaving existing clients that do not use it
 * unaffected. {@code pricePaise} and {@code locality} retain their existing serialisation
 * contract (null serialises as JSON null) — no class-level NON_NULL annotation.
 *
 * <p>{@code boundaryGeoJson} carries the GeoJSON polygon string produced by
 * {@code ST_AsGeoJSON(pl.boundary)} for {@code agricultural_land} listings that have a saved
 * plot boundary. Null for all other property types (and agri listings without a boundary),
 * and omitted from the JSON response via {@link JsonInclude#NON_NULL} to preserve backward
 * compatibility — existing clients ignoring unknown fields are unaffected (#1373).
 */
public record DiscoverMarker(
        String id,
        @JsonProperty("lat") double latitude,
        @JsonProperty("lon") double longitude,
        Long pricePaise,
        String locality,
        @JsonInclude(JsonInclude.Include.NON_NULL) String propertyType,
        @JsonInclude(JsonInclude.Include.NON_NULL)
        @JsonProperty("boundary")
        String boundaryGeoJson
) {}

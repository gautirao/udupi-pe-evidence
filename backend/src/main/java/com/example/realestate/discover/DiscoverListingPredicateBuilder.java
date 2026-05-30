package com.example.realestate.discover;

import java.util.ArrayList;
import java.util.List;

/**
 * Builds the shared WHERE fragment + positional params used by both
 * DiscoverListingsService and DiscoverMarkersService.
 *
 * <p>Having a single static method guarantees that both endpoints filter on
 * exactly the same predicate for the same input — the consistency gate is
 * structural, not behavioural.
 */
public class DiscoverListingPredicateBuilder {

    /**
     * Validated bounding box: south, west, north, east in decimal degrees.
     *
     * <p>All four values are in [-90,90] × [-180,180] with south ≤ north and west ≤ east.
     * Antimeridian-crossing boxes are rejected at the controller layer.
     */
    public record Bbox(double south, double west, double north, double east) {}

    public record Filters(
            String city,
            List<String> propertyTypes,
            Long priceMinPaise,       // already converted from rupees by caller
            Long priceMaxPaise,
            String dateFrom,          // ISO-8601 date string, nullable
            String dateTo,
            List<Integer> bedrooms,   // 4 means "4+"
            List<String> sellerTypes,
            Boolean backOnMarket,
            Boolean newToMarket,
            Boolean reraRegistered,
            Boolean readyToMove,
            List<List<Double>> polygon,   // [[lat,lon],...] ≥3 vertices, nullable
            Double schoolLat,
            Double schoolLon,
            Double schoolRadiusKm,         // default 2.0 when schoolLat+schoolLon provided
            Bbox bbox,                     // viewport rectangle filter, nullable
            String q                       // keyword search query; null/blank = no FTS filter
    ) {}

    /**
     * Assembled SQL fragment + bound params + derived flags.
     *
     * <p>{@code bboxApplied} is {@code true} iff a non-null {@link Bbox} was present in the
     * {@link Filters} and the {@code ST_MakeEnvelope} predicate was appended to the WHERE
     * fragment. Callers must derive the response {@code boundsApplied} field from this flag
     * rather than re-inspecting {@code filters.bbox() != null}, so the flag stays correct if
     * the builder ever adds further bbox validity checks.
     */
    public record Sql(String whereFragment, List<Object> params, boolean bboxApplied) {}

    public static Sql build(Filters f) {
        StringBuilder sb = new StringBuilder();
        List<Object> params = new ArrayList<>();

        // Base predicate — always present
        sb.append("pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false");

        // city — property_listings has no city column; resolve via areas→cities join
        sb.append(" AND pl.area_key IN (SELECT a.area_key FROM areas a JOIN cities c ON c.id = a.city_id WHERE c.slug = ?)");
        params.add(f.city());

        // propertyTypes
        if (f.propertyTypes() != null && !f.propertyTypes().isEmpty()) {
            sb.append(" AND pl.property_type IN (");
            for (int i = 0; i < f.propertyTypes().size(); i++) {
                sb.append(i == 0 ? "?" : ",?");
                params.add(f.propertyTypes().get(i));
            }
            sb.append(")");
        }

        // price range
        if (f.priceMinPaise() != null) {
            sb.append(" AND pl.price_paise >= ?");
            params.add(f.priceMinPaise());
        }
        if (f.priceMaxPaise() != null) {
            sb.append(" AND pl.price_paise <= ?");
            params.add(f.priceMaxPaise());
        }

        // date range on created_at
        if (f.dateFrom() != null) {
            sb.append(" AND pl.created_at >= ?::timestamptz");
            params.add(f.dateFrom());
        }
        if (f.dateTo() != null) {
            sb.append(" AND pl.created_at <= ?::timestamptz");
            params.add(f.dateTo());
        }

        // bedrooms — 4 means "4 or more"
        if (f.bedrooms() != null && !f.bedrooms().isEmpty()) {
            if (f.bedrooms().contains(4)) {
                List<Integer> exact = f.bedrooms().stream().filter(b -> b < 4).toList();
                if (exact.isEmpty()) {
                    sb.append(" AND pl.bedrooms >= 4");
                } else {
                    sb.append(" AND (pl.bedrooms >= 4 OR pl.bedrooms IN (");
                    for (int i = 0; i < exact.size(); i++) {
                        sb.append(i == 0 ? "?" : ",?");
                        params.add(exact.get(i));
                    }
                    sb.append("))");
                }
            } else {
                sb.append(" AND pl.bedrooms IN (");
                for (int i = 0; i < f.bedrooms().size(); i++) {
                    sb.append(i == 0 ? "?" : ",?");
                    params.add(f.bedrooms().get(i));
                }
                sb.append(")");
            }
        }

        // sellerTypes
        if (f.sellerTypes() != null && !f.sellerTypes().isEmpty()) {
            sb.append(" AND pl.seller_type IN (");
            for (int i = 0; i < f.sellerTypes().size(); i++) {
                sb.append(i == 0 ? "?" : ",?");
                params.add(f.sellerTypes().get(i));
            }
            sb.append(")");
        }

        // backOnMarket — back_to_market_at is a real column; backOnMarket is Java-derived
        if (Boolean.TRUE.equals(f.backOnMarket())) {
            sb.append(" AND pl.back_to_market_at IS NOT NULL AND pl.back_to_market_at > NOW() - INTERVAL '30 days'");
        }

        // newToMarket — first_published_at is a real column; newToMarket is Java-derived.
        // Upper bound is <= CURRENT_DATE (inclusive) so listings published today are included.
        if (Boolean.TRUE.equals(f.newToMarket())) {
            sb.append(" AND COALESCE(pl.first_published_at::date, pl.created_at::date) >= CURRENT_DATE - INTERVAL '7 days'");
            sb.append(" AND COALESCE(pl.first_published_at::date, pl.created_at::date) <= CURRENT_DATE");
        }

        // reraRegistered — rera_valid is Java-derived; use regex match on the real column
        if (Boolean.TRUE.equals(f.reraRegistered())) {
            sb.append(" AND pl.rera_number IS NOT NULL AND pl.rera_number ~ '^[A-Z]{3}/[A-Z]{2}/[0-9]{4}/[0-9]{4}$'");
        }

        // readyToMove
        if (Boolean.TRUE.equals(f.readyToMove())) {
            sb.append(" AND pl.possession_status = 'READY'");
        }

        // polygon — two-stage PostGIS predicate exploiting the idx_property_listings_geog GiST index.
        //
        // Stage 1 (prefilter): ST_Intersects on the envelope of the polygon against pl.geog.
        //   The GiST index on pl.geog supports geography operators natively; feeding it the
        //   bounding-box envelope of the drawn polygon eliminates rows outside the bounding
        //   rectangle cheaply before the exact containment test runs.
        //
        // Stage 2 (exact): ST_Contains on the full polygon geometry against pl.geog::geometry.
        //   Using pl.geog::geometry (the stored generated column) instead of
        //   ST_SetSRID(ST_Point(pl.longitude, pl.latitude), 4326) avoids recalculating the
        //   point geography per row and is consistent with the school-proximity and bbox predicates.
        //   ST_Contains is boundary-exclusive: points exactly on the polygon edge are excluded.
        //
        // The WKT string is built once and bound twice (once per ? placeholder).
        if (f.polygon() != null && f.polygon().size() >= 3) {
            // Build WKT polygon string from [[lat,lon],...] — PostGIS expects lon lat order
            StringBuilder wkt = new StringBuilder("POLYGON((");
            for (int i = 0; i < f.polygon().size(); i++) {
                List<Double> pt = f.polygon().get(i);
                if (i > 0) wkt.append(",");
                wkt.append(pt.get(1)).append(" ").append(pt.get(0)); // lon lat
            }
            // Close the ring
            List<Double> first = f.polygon().get(0);
            wkt.append(",").append(first.get(1)).append(" ").append(first.get(0));
            wkt.append("))");
            String wktStr = wkt.toString();
            // Prefilter: envelope intersect via GiST index on pl.geog
            sb.append(" AND ST_Intersects(ST_Envelope(ST_GeomFromText(?, 4326))::geography, pl.geog)");
            params.add(wktStr);
            // Exact: point-in-polygon on the narrowed candidate set
            sb.append(" AND ST_Contains(ST_GeomFromText(?, 4326), pl.geog::geometry)");
            params.add(wktStr);
        }

        // school proximity — PostGIS ST_DWithin on geography
        // pl.geog = property_listings.geog, the stored generated column added by V73.
        // (schools.geog is a separate column added by V75; it is not referenced here.)
        // Using the stored column avoids recalculating ST_MakePoint(pl.longitude, pl.latitude)::geography
        // per row and allows the idx_property_listings_geog GiST index to be used.
        // pl.geog is NULL only if lat/lon were NULL when the row was written; ST_DWithin
        // returns NULL (falsy) for a NULL first argument, so those listings are excluded.
        if (f.schoolLat() != null && f.schoolLon() != null) {
            double radiusKm = f.schoolRadiusKm() != null ? f.schoolRadiusKm() : 2.0;
            sb.append(" AND ST_DWithin(pl.geog, ST_MakePoint(?, ?)::geography, ?)");
            params.add(f.schoolLon());
            params.add(f.schoolLat());
            params.add(radiusKm * 1000.0); // metres
        }

        // bbox — viewport rectangle filter using the GIST-indexed geog column.
        // The && operator (geometry/geography overlap) is supported by the idx_property_listings_geog
        // GiST index and is the correct operator for a rectangular viewport test.
        // ST_MakeEnvelope(west, south, east, north, srid) produces a geometry bounding box;
        // casting to ::geography makes the && operands type-compatible with pl.geog.
        // Antimeridian-crossing boxes (west > east) are rejected at the controller layer.
        boolean bboxApplied = false;
        if (f.bbox() != null) {
            Bbox b = f.bbox();
            sb.append(" AND pl.geog && ST_MakeEnvelope(?, ?, ?, ?, 4326)::geography");
            params.add(b.west());
            params.add(b.south());
            params.add(b.east());
            params.add(b.north());
            bboxApplied = true;
        }

        // keyword search — FTS via the search_vector generated column added by V18.
        // websearch_to_tsquery accepts natural-language input (quoted phrases, negation, OR).
        // Normalise: blank/whitespace-only q is treated as absent so no FTS clause is added.
        // Malformed input may cause DataAccessException — falls through to the global
        // Exception handler (500 INTERNAL_ERROR); no dedicated handler is needed here.
        String normQ = (f.q() != null && !f.q().isBlank()) ? f.q().trim() : null;
        if (normQ != null) {
            sb.append(" AND pl.search_vector @@ websearch_to_tsquery('english', ?)");
            params.add(normQ);
        }

        return new Sql(sb.toString(), params, bboxApplied);
    }
}

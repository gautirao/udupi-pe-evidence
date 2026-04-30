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

    public record Filters(
            String city,
            List<String> propertyTypes,
            List<String> localities,
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
            Double schoolRadiusKm         // default 2.0 when schoolLat+schoolLon provided
    ) {}

    public record Sql(String whereFragment, List<Object> params) {}

    public static Sql build(Filters f) {
        StringBuilder sb = new StringBuilder();
        List<Object> params = new ArrayList<>();

        // Base predicate — always present
        sb.append("pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false");

        // city
        sb.append(" AND pl.city = ?");
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

        // localities
        if (f.localities() != null && !f.localities().isEmpty()) {
            sb.append(" AND pl.locality IN (");
            for (int i = 0; i < f.localities().size(); i++) {
                sb.append(i == 0 ? "?" : ",?");
                params.add(f.localities().get(i));
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

        // polygon — PostGIS ST_Contains
        if (f.polygon() != null && f.polygon().size() >= 3) {
            // Build WKT polygon string from [[lat,lon],...] — ST_Contains uses lon,lat
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
            sb.append(" AND ST_Contains(ST_GeomFromText(?, 4326), ST_SetSRID(ST_Point(pl.longitude, pl.latitude), 4326))");
            params.add(wkt.toString());
        }

        // school proximity — PostGIS ST_DWithin on geography
        if (f.schoolLat() != null && f.schoolLon() != null) {
            double radiusKm = f.schoolRadiusKm() != null ? f.schoolRadiusKm() : 2.0;
            sb.append(" AND ST_DWithin(ST_MakePoint(pl.longitude, pl.latitude)::geography, ST_MakePoint(?, ?)::geography, ?)");
            params.add(f.schoolLon());
            params.add(f.schoolLat());
            params.add(radiusKm * 1000.0); // metres
        }

        return new Sql(sb.toString(), params);
    }
}

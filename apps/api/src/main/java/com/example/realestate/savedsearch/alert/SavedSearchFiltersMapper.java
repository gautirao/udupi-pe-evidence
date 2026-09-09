package com.example.realestate.savedsearch.alert;

import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import com.example.realestate.discover.DiscoverListingPredicateBuilder.Bbox;
import com.example.realestate.discover.DiscoverListingPredicateBuilder.Filters;
import com.example.realestate.savedsearch.SavedSearch;
import com.example.realestate.savedsearch.SavedSearchFilterAllowlist;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * #2019 Slice B: turns a persisted {@link SavedSearch} (result scope + allow-listed filter
 * snapshot) into the {@link Filters} record that {@link DiscoverListingPredicateBuilder#build}
 * consumes.
 *
 * <p>This is the parity seam. The matcher never writes its own listing predicate: it hands this
 * {@code Filters} to the SAME {@code build} the live Discover listings/markers queries use, which
 * canonicalises the vocabulary via {@code DiscoverFilterNormalizer} internally. Every key in
 * {@code SavedSearchFilterAllowlist.SUPPORTED_KEYS} is consumed here (proven by
 * {@code SavedSearchFiltersMapperParityTest}); every non-alertable {@code Filters} component
 * ({@code dateFrom/dateTo}, school proximity, {@code q}, {@code bbox}) is left {@code null}.
 *
 * <p>Scope mapping mirrors #2016's result-scope exclusivity: exactly one of {@code areaKeys}
 * (AREA_SET), {@code polygon} (POLYGON) or {@code viewportScope} (VIEWPORT — the #2015
 * boundary-inclusive committed-bounds predicate, NOT the render-only {@code bbox}) is set.
 */
public final class SavedSearchFiltersMapper {

    private SavedSearchFiltersMapper() {
    }

    /**
     * @throws IllegalStateException when the STORED filter map carries a key outside
     *         {@code SavedSearchFilterAllowlist.SUPPORTED_KEYS} (e.g. a row saved while
     *         {@code excludePropertyTypes} was still accepted). Such a key has no mapping below,
     *         so proceeding would silently broaden the search — the delivery service turns this
     *         into {@code alert_status = ERROR} and the job isolates it as a failed search.
     */
    public static Filters toFilters(SavedSearch s) {
        Map<String, Object> f = s.getFilters() == null ? Map.of() : s.getFilters();
        Set<String> unsupported = SavedSearchFilterAllowlist.unsupportedKeys(f);
        if (!unsupported.isEmpty()) {
            throw new IllegalStateException("saved_search_unsupported_stored_filter:" + unsupported);
        }

        List<String> areaKeys = null;
        List<List<Double>> polygon = null;
        Bbox viewportScope = null;
        switch (s.getResultScopeKind()) {
            case AREA_SET -> areaKeys = List.copyOf(s.getAreaKeys());
            case POLYGON -> polygon = s.getPolygon();
            case VIEWPORT -> viewportScope = new Bbox(
                    s.getViewportSouth(), s.getViewportWest(), s.getViewportNorth(), s.getViewportEast());
        }

        return new Filters(
                s.getCitySlug(),
                stringList(f.get("propertyTypes")),
                stringList(f.get("commercialSubtypes")),
                longValue(f.get("priceMinPaise")),
                longValue(f.get("priceMaxPaise")),
                null, // dateFrom — non-alertable
                null, // dateTo — non-alertable
                intList(f.get("bedrooms")),
                stringList(f.get("sellerTypes")),
                boolValue(f.get("backOnMarket")),
                boolValue(f.get("newToMarket")),
                boolValue(f.get("reraRegistered")),
                boolValue(f.get("readyToMove")),
                polygon,
                null, // schoolLat — non-alertable
                null, // schoolLon — non-alertable
                null, // schoolRadiusKm — non-alertable
                null, // bbox — render-only viewport prefilter, never a saved scope
                null, // q — free text is rejected at save time
                stringValue(f.get("listingPurpose")),
                null, // excludePropertyTypes — non-alertable (no restore-link representation; rejected at save)
                areaKeys,
                viewportScope);
    }

    private static String stringValue(Object v) {
        return v == null ? null : v.toString();
    }

    private static Long longValue(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.longValue();
        }
        return Long.parseLong(v.toString());
    }

    private static Boolean boolValue(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Boolean b) {
            return b;
        }
        return Boolean.parseBoolean(v.toString());
    }

    private static List<String> stringList(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Collection<?> c) {
            List<String> out = new ArrayList<>(c.size());
            for (Object o : c) {
                if (o != null) {
                    out.add(o.toString());
                }
            }
            return out.isEmpty() ? null : out;
        }
        return List.of(v.toString());
    }

    private static List<Integer> intList(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Collection<?> c) {
            List<Integer> out = new ArrayList<>(c.size());
            for (Object o : c) {
                if (o instanceof Number n) {
                    out.add(n.intValue());
                } else if (o != null) {
                    out.add(Integer.parseInt(o.toString()));
                }
            }
            return out.isEmpty() ? null : out;
        }
        return List.of(v instanceof Number n ? n.intValue() : Integer.parseInt(v.toString()));
    }
}

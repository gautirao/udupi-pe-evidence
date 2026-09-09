package com.example.realestate.savedsearch.alert;

import com.example.realestate.savedsearch.SavedSearch;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * #2019 Slice B: writes the canonical Discover URL that restores a saved search EXACTLY, per the
 * #2016 result-scope URL contract ({@code apps/web/src/features/discover/state/url/resultScope.ts})
 * and the filters URL domain ({@code .../url/filters.ts}, purpose from {@code .../url/city.ts}).
 *
 * <p>Emitted keys (and nothing else — in particular NO {@code node=}, which is navigation
 * context only and never controls results):
 * <pre>
 *   city=&lt;slug&gt;
 *   rscope=areas|poly|vp  +  rareas=k1,k2 | rpoly=lat:lon;lat:lon;... (5dp) | rvp=s,w,n,e
 *   intent=rent                 (only when listingPurpose is 'rent'; buy is the default, omitted)
 *   type=, subtype=, beds=, seller=   comma-joined lists
 *   priceMin= / priceMax=       RUPEES (the saved snapshot is paise; /100)
 *   bom=1 ntm=1 rera=1 rtm=1    boolean flags
 * </pre>
 * Every alertable filter key ({@code SavedSearchFilterAllowlist.SUPPORTED_KEYS}) has a URL
 * representation here, so a link always restores the exact saved search
 * ({@code excludePropertyTypes}, which has none in the contract, is not alertable).
 */
public final class SavedSearchRestoreLink {

    static final String DISCOVER_PATH = "/discover";
    static final String MANAGE_PATH = "/saved-searches";

    private static final int LAT_LON_DP = 5;

    private SavedSearchRestoreLink() {
    }

    /** Absolute URL when {@code baseUrl} is non-blank, otherwise a site-relative path. */
    public static String restoreUrl(String baseUrl, SavedSearch s) {
        return prefix(baseUrl) + restorePath(s);
    }

    public static String manageUrl(String baseUrl) {
        return prefix(baseUrl) + MANAGE_PATH;
    }

    public static String restorePath(SavedSearch s) {
        StringBuilder q = new StringBuilder(DISCOVER_PATH).append('?');
        param(q, "city", s.getCitySlug());

        switch (s.getResultScopeKind()) {
            case AREA_SET -> {
                param(q, "rscope", "areas");
                param(q, "rareas", String.join(",", s.getAreaKeys()));
            }
            case POLYGON -> {
                param(q, "rscope", "poly");
                param(q, "rpoly", s.getPolygon().stream()
                        .map(pt -> fixed(pt.get(0)) + ":" + fixed(pt.get(1)))
                        .collect(Collectors.joining(";")));
            }
            case VIEWPORT -> {
                param(q, "rscope", "vp");
                param(q, "rvp", s.getViewportSouth() + "," + s.getViewportWest() + ","
                        + s.getViewportNorth() + "," + s.getViewportEast());
            }
        }

        Map<String, Object> f = s.getFilters() == null ? Map.of() : s.getFilters();
        Object purpose = f.get("listingPurpose");
        if (purpose != null && "rent".equalsIgnoreCase(purpose.toString())) {
            param(q, "intent", "rent");
        }
        list(q, "type", f.get("propertyTypes"));
        list(q, "subtype", f.get("commercialSubtypes"));
        list(q, "beds", f.get("bedrooms"));
        rupees(q, "priceMin", f.get("priceMinPaise"));
        rupees(q, "priceMax", f.get("priceMaxPaise"));
        list(q, "seller", f.get("sellerTypes"));
        flag(q, "bom", f.get("backOnMarket"));
        flag(q, "ntm", f.get("newToMarket"));
        flag(q, "rera", f.get("reraRegistered"));
        flag(q, "rtm", f.get("readyToMove"));

        return q.toString();
    }

    private static String prefix(String baseUrl) {
        if (baseUrl == null || baseUrl.isBlank()) {
            return "";
        }
        String b = baseUrl.trim();
        return b.endsWith("/") ? b.substring(0, b.length() - 1) : b;
    }

    private static String fixed(Double d) {
        return String.format(Locale.ROOT, "%." + LAT_LON_DP + "f", d);
    }

    private static void param(StringBuilder q, String key, String value) {
        if (q.charAt(q.length() - 1) != '?') {
            q.append('&');
        }
        q.append(key).append('=').append(URLEncoder.encode(value, StandardCharsets.UTF_8));
    }

    private static void list(StringBuilder q, String key, Object v) {
        if (v instanceof Collection<?> c && !c.isEmpty()) {
            param(q, key, c.stream().map(String::valueOf).collect(Collectors.joining(",")));
        } else if (v != null && !(v instanceof Collection<?>)) {
            param(q, key, String.valueOf(v));
        }
    }

    private static void rupees(StringBuilder q, String key, Object paise) {
        if (paise == null) {
            return;
        }
        long p = paise instanceof Number n ? n.longValue() : Long.parseLong(paise.toString());
        param(q, key, Long.toString(p / 100L));
    }

    private static void flag(StringBuilder q, String key, Object v) {
        if (Boolean.TRUE.equals(v) || (v != null && "true".equalsIgnoreCase(v.toString()))) {
            param(q, key, "1");
        }
    }

    /** Test/diagnostic helper: the filter keys this writer represents in a URL (= every alertable key). */
    static List<String> urlRepresentableFilterKeys() {
        return List.of(
                "listingPurpose", "propertyTypes", "commercialSubtypes", "bedrooms",
                "priceMinPaise", "priceMaxPaise", "sellerTypes",
                "backOnMarket", "newToMarket", "reraRegistered", "readyToMove");
    }
}

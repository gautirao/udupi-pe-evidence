package com.example.realestate.savedsearch.alert;

import com.example.realestate.savedsearch.SavedSearch;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * #2019 Slice B: human-readable scope + filter summaries for notifications. Derived from
 * canonical data only. Deliberately coarse for POLYGON / VIEWPORT (no geometry or bounds are
 * ever rendered) so an email never carries more location precision than the existing
 * exposure rules allow. The user's free-text label is NOT interpolated here; callers HTML-escape
 * it separately.
 */
public final class SavedSearchSummary {

    private SavedSearchSummary() {
    }

    /** e.g. {@code "Manipal, Udupi Town"} / {@code "Drawn area (5 points)"} / {@code "Visible map area"}. */
    public static String scopeSummary(SavedSearch s) {
        return switch (s.getResultScopeKind()) {
            case AREA_SET -> s.getAreaKeys().stream()
                    .map(SavedSearchSummary::areaDisplayName)
                    .collect(Collectors.joining(", "));
            case POLYGON -> "Drawn area (" + s.getPolygon().size() + " points)";
            case VIEWPORT -> "Visible map area";
        };
    }

    /** e.g. {@code "Buy · Apartment, Villa · 2, 3 BHK · ₹50.0 L – ₹1.2 Cr"}; empty when no filters. */
    public static String filtersSummary(SavedSearch s) {
        Map<String, Object> f = s.getFilters() == null ? Map.of() : s.getFilters();
        List<String> parts = new ArrayList<>();

        Object purpose = f.get("listingPurpose");
        if (purpose != null) {
            parts.add("rent".equalsIgnoreCase(purpose.toString()) ? "Rent" : "Buy");
        }
        joined(f.get("propertyTypes")).ifPresent(v -> parts.add(titleCase(v)));
        joined(f.get("commercialSubtypes")).ifPresent(v -> parts.add(titleCase(v)));
        joined(f.get("bedrooms")).ifPresent(v -> parts.add(v.replace("4", "4+") + " BHK"));
        joined(f.get("sellerTypes")).ifPresent(v -> parts.add(titleCase(v)));

        Long min = paise(f.get("priceMinPaise"));
        Long max = paise(f.get("priceMaxPaise"));
        if (min != null && max != null) {
            parts.add(rupees(min) + " – " + rupees(max));
        } else if (min != null) {
            parts.add("from " + rupees(min));
        } else if (max != null) {
            parts.add("up to " + rupees(max));
        }

        if (isTrue(f.get("backOnMarket"))) parts.add("Back on market");
        if (isTrue(f.get("newToMarket"))) parts.add("New to market");
        if (isTrue(f.get("reraRegistered"))) parts.add("RERA registered");
        if (isTrue(f.get("readyToMove"))) parts.add("Ready to move");

        return String.join(" · ", parts);
    }

    /** Last segment of a canonical {@code IN|KA|Udupi|Manipal} key; the key itself if unsegmented. */
    static String areaDisplayName(String areaKey) {
        if (areaKey == null) {
            return "";
        }
        int idx = areaKey.lastIndexOf('|');
        return idx >= 0 ? areaKey.substring(idx + 1) : areaKey;
    }

    static String rupees(long paise) {
        long r = paise / 100L;
        if (r >= 10_000_000L) {
            return String.format(Locale.ROOT, "₹%.1f Cr", r / 10_000_000.0);
        }
        if (r >= 100_000L) {
            return String.format(Locale.ROOT, "₹%.1f L", r / 100_000.0);
        }
        return "₹" + String.format(Locale.ROOT, "%,d", r);
    }

    private static java.util.Optional<String> joined(Object v) {
        if (v instanceof Collection<?> c && !c.isEmpty()) {
            return java.util.Optional.of(c.stream().map(String::valueOf).collect(Collectors.joining(", ")));
        }
        if (v != null && !(v instanceof Collection<?>)) {
            return java.util.Optional.of(String.valueOf(v));
        }
        return java.util.Optional.empty();
    }

    private static Long paise(Object v) {
        if (v == null) {
            return null;
        }
        return v instanceof Number n ? n.longValue() : Long.parseLong(v.toString());
    }

    private static boolean isTrue(Object v) {
        return Boolean.TRUE.equals(v) || (v != null && "true".equalsIgnoreCase(v.toString()));
    }

    private static String titleCase(String commaJoined) {
        StringBuilder sb = new StringBuilder();
        for (String token : commaJoined.split(", ")) {
            if (sb.length() > 0) {
                sb.append(", ");
            }
            String t = token.replace('_', ' ').toLowerCase(Locale.ROOT);
            sb.append(t.isEmpty() ? t : Character.toUpperCase(t.charAt(0)) + t.substring(1));
        }
        return sb.toString();
    }
}

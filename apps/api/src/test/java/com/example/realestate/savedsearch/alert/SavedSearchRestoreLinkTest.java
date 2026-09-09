package com.example.realestate.savedsearch.alert;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.realestate.savedsearch.ResultScopeKind;
import com.example.realestate.savedsearch.SavedSearch;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * #2019 Slice B restore-link round trip. The parser below mirrors the frontend's read side of
 * the #2016 contract ({@code state/url/resultScope.ts}: {@code rscope} is authoritative, only the
 * matching payload key is honoured; {@code state/url/filters.ts}: {@code type/subtype/beds/
 * priceMin/priceMax/seller/bom/ntm/rera/rtm}; {@code state/url/city.ts}: {@code intent=rent}
 * else buy). Link → parsed scope + filters must equal what was saved.
 */
class SavedSearchRestoreLinkTest {

    // ---- frontend-mirroring parser --------------------------------------------------------

    record ParsedScope(ResultScopeKind kind, List<String> areaKeys, List<List<Double>> polygon, double[] bounds) {
    }

    static Map<String, String> query(String url) {
        String q = URI.create(url).getRawQuery();
        Map<String, String> out = new LinkedHashMap<>();
        for (String pair : q.split("&")) {
            int i = pair.indexOf('=');
            out.put(URLDecoder.decode(pair.substring(0, i), StandardCharsets.UTF_8),
                    URLDecoder.decode(pair.substring(i + 1), StandardCharsets.UTF_8));
        }
        return out;
    }

    static ParsedScope parseScope(Map<String, String> p) {
        String rscope = p.get("rscope");
        if ("areas".equals(rscope)) {
            List<String> keys = Arrays.stream(p.get("rareas").split(",")).map(String::trim)
                    .filter(s -> !s.isEmpty()).toList();
            return new ParsedScope(ResultScopeKind.AREA_SET, keys, null, null);
        }
        if ("poly".equals(rscope)) {
            List<List<Double>> coords = new ArrayList<>();
            for (String pair : p.get("rpoly").split(";")) {
                String[] ll = pair.split(":");
                coords.add(List.of(Double.parseDouble(ll[0]), Double.parseDouble(ll[1])));
            }
            return new ParsedScope(ResultScopeKind.POLYGON, null, coords, null);
        }
        if ("vp".equals(rscope)) {
            double[] b = Arrays.stream(p.get("rvp").split(",")).mapToDouble(Double::parseDouble).toArray();
            return new ParsedScope(ResultScopeKind.VIEWPORT, null, null, b);
        }
        throw new AssertionError("no committed result scope in link");
    }

    static Map<String, Object> parseFilters(Map<String, String> p) {
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("listingPurpose", "rent".equals(p.get("intent")) ? "rent" : "sale");
        if (p.containsKey("type")) f.put("propertyTypes", List.of(p.get("type").split(",")));
        if (p.containsKey("subtype")) f.put("commercialSubtypes", List.of(p.get("subtype").split(",")));
        if (p.containsKey("beds")) f.put("bedrooms", Arrays.stream(p.get("beds").split(",")).map(Integer::parseInt).toList());
        if (p.containsKey("priceMin")) f.put("priceMinPaise", Long.parseLong(p.get("priceMin")) * 100L);
        if (p.containsKey("priceMax")) f.put("priceMaxPaise", Long.parseLong(p.get("priceMax")) * 100L);
        if (p.containsKey("seller")) f.put("sellerTypes", List.of(p.get("seller").split(",")));
        if ("1".equals(p.get("bom"))) f.put("backOnMarket", true);
        if ("1".equals(p.get("ntm"))) f.put("newToMarket", true);
        if ("1".equals(p.get("rera"))) f.put("reraRegistered", true);
        if ("1".equals(p.get("rtm"))) f.put("readyToMove", true);
        return f;
    }

    // ---- tests ----------------------------------------------------------------------------

    @Test
    @DisplayName("AREA_SET link round-trips exact area keys and every URL-representable filter")
    void areaSetRoundTrip() {
        Map<String, Object> filters = new LinkedHashMap<>(SavedSearchFiltersMapperParityTest.fullyPopulatedFilters());
        SavedSearch s = SavedSearchFiltersMapperParityTest.savedSearch(
                ResultScopeKind.AREA_SET, List.of("IN|KA|Udupi|Manipal", "IN|KA|Udupi|Kunjibettu"),
                null, null, null, null, null, filters);

        String url = SavedSearchRestoreLink.restoreUrl("https://example.test/", s);
        assertThat(url).startsWith("https://example.test/discover?city=udupi");
        assertThat(url).doesNotContain("node=");

        Map<String, String> p = query(url);
        ParsedScope scope = parseScope(p);
        assertThat(scope.kind()).isEqualTo(ResultScopeKind.AREA_SET);
        assertThat(scope.areaKeys()).isEqualTo(s.getAreaKeys());

        Map<String, Object> parsed = parseFilters(p);
        assertThat(parsed.get("listingPurpose")).isEqualTo("rent");
        assertThat(parsed.get("propertyTypes")).isEqualTo(List.of("apartment", "villa"));
        assertThat(parsed.get("commercialSubtypes")).isEqualTo(List.of("SHOP"));
        assertThat(parsed.get("bedrooms")).isEqualTo(List.of(2, 3));
        assertThat(parsed.get("priceMinPaise")).isEqualTo(5_000_000_00L);
        assertThat(parsed.get("priceMaxPaise")).isEqualTo(12_000_000_00L);
        assertThat(parsed.get("sellerTypes")).isEqualTo(List.of("owner"));
        assertThat(parsed.get("backOnMarket")).isEqualTo(true);
        assertThat(parsed.get("newToMarket")).isEqualTo(true);
        assertThat(parsed.get("reraRegistered")).isEqualTo(true);
        assertThat(parsed.get("readyToMove")).isEqualTo(true);
        assertThat(parsed.keySet()).containsExactlyInAnyOrderElementsOf(filters.keySet());
    }

    @Test
    @DisplayName("buy purpose is the default: no intent param is written, and parsing yields sale")
    void buyIsDefaultOmitted() {
        SavedSearch s = SavedSearchFiltersMapperParityTest.savedSearch(
                ResultScopeKind.AREA_SET, List.of("IN|KA|Udupi|Manipal"), null, null, null, null, null,
                Map.of("listingPurpose", "sale", "bedrooms", List.of(3)));
        String path = SavedSearchRestoreLink.restorePath(s);
        assertThat(path).doesNotContain("intent=");
        assertThat(path).isEqualTo("/discover?city=udupi&rscope=areas&rareas=IN%7CKA%7CUdupi%7CManipal&beds=3");
        assertThat(parseFilters(query("http://x" + path)).get("listingPurpose")).isEqualTo("sale");
    }

    @Test
    @DisplayName("POLYGON link round-trips the vertex list at 5dp; no bounds/geometry leak elsewhere")
    void polygonRoundTrip() {
        List<List<Double>> poly = List.of(List.of(13.34, 74.78), List.of(13.37, 74.78), List.of(13.37, 74.82), List.of(13.34, 74.82));
        SavedSearch s = SavedSearchFiltersMapperParityTest.savedSearch(ResultScopeKind.POLYGON, null, poly,
                null, null, null, null, Map.of());
        String path = SavedSearchRestoreLink.restorePath(s);
        ParsedScope scope = parseScope(query("http://x" + path));
        assertThat(scope.kind()).isEqualTo(ResultScopeKind.POLYGON);
        assertThat(scope.polygon()).isEqualTo(poly);
        assertThat(path).doesNotContain("rareas=").doesNotContain("rvp=");
    }

    @Test
    @DisplayName("VIEWPORT link round-trips the committed bounds s,w,n,e")
    void viewportRoundTrip() {
        SavedSearch s = SavedSearchFiltersMapperParityTest.savedSearch(ResultScopeKind.VIEWPORT, null, null,
                13.32, 74.73, 13.35, 74.76, Map.of("listingPurpose", "rent"));
        String path = SavedSearchRestoreLink.restorePath(s);
        ParsedScope scope = parseScope(query("http://x" + path));
        assertThat(scope.kind()).isEqualTo(ResultScopeKind.VIEWPORT);
        assertThat(scope.bounds()).containsExactly(13.32, 74.73, 13.35, 74.76);
        assertThat(path).contains("intent=rent");
    }

    @Test
    @DisplayName("blank base url yields a site-relative path; manage link is the owner-scoped page")
    void relativeWhenNoBaseUrl() {
        SavedSearch s = SavedSearchFiltersMapperParityTest.savedSearch(ResultScopeKind.AREA_SET,
                List.of("IN|KA|Udupi|Manipal"), null, null, null, null, null, Map.of());
        assertThat(SavedSearchRestoreLink.restoreUrl("", s)).startsWith("/discover?");
        assertThat(SavedSearchRestoreLink.restoreUrl(null, s)).startsWith("/discover?");
        assertThat(SavedSearchRestoreLink.manageUrl("https://example.test")).isEqualTo("https://example.test/saved-searches");
        assertThat(SavedSearchRestoreLink.manageUrl("")).isEqualTo("/saved-searches");
    }

    @Test
    @DisplayName("EVERY alertable filter key is URL-representable, so a link always restores the exact saved search")
    void urlRepresentableKeysPinned() {
        List<String> expected = SavedSearchFiltersMapperParityTest.SUPPORTED_KEYS.stream()
                .sorted().collect(Collectors.toList());
        assertThat(SavedSearchRestoreLink.urlRepresentableFilterKeys().stream().sorted().toList()).isEqualTo(expected);
    }
}

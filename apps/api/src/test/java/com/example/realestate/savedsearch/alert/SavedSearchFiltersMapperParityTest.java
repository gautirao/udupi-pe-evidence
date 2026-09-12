package com.example.realestate.savedsearch.alert;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import com.example.realestate.discover.DiscoverListingPredicateBuilder.Bbox;
import com.example.realestate.discover.DiscoverListingPredicateBuilder.Filters;
import com.example.realestate.savedsearch.AlertFrequency;
import com.example.realestate.savedsearch.AlertStatus;
import com.example.realestate.savedsearch.ResultScopeKind;
import com.example.realestate.savedsearch.SavedSearch;
import com.example.realestate.savedsearch.SavedSearchStatus;
import java.lang.reflect.RecordComponent;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * #2019 Slice B parity proof: the matcher's {@link Filters} is built by
 * {@link SavedSearchFiltersMapper} and fed to the SAME {@link DiscoverListingPredicateBuilder#build}
 * as the live Discover query, so parity is structural. These tests pin the mapper end of that
 * seam:
 * <ol>
 *   <li>every key in {@code SavedSearchFilterAllowlist.SUPPORTED_KEYS} (mirrored here verbatim —
 *       it is package-private in {@code savedsearch}) lands on the {@code Filters} component of
 *       the SAME NAME (a supported key the mapper forgets to consume fails here);</li>
 *   <li>every non-alertable component stays {@code null} (the matcher never widens or narrows
 *       beyond what was saved);</li>
 *   <li>the predicate SQL + params produced from a saved search are byte-identical to the SQL
 *       the live query would produce from a hand-built canonical {@code Filters}.</li>
 * </ol>
 */
class SavedSearchFiltersMapperParityTest {

    /** Mirror of {@code SavedSearchFilterAllowlist.SUPPORTED_KEYS} (package-private in Slice A). */
    static final Set<String> SUPPORTED_KEYS = Set.of(
            "listingPurpose", "propertyTypes", "bedrooms", "sellerTypes", "commercialSubtypes",
            "priceMinPaise", "priceMaxPaise", "backOnMarket", "newToMarket", "reraRegistered",
            "readyToMove");

    /**
     * Components that are scope/city (first-class columns) or explicitly non-alertable
     * ({@code excludePropertyTypes}: no #2016 restore-link representation → rejected at save).
     */
    static final Set<String> NON_FILTER_COMPONENTS = Set.of(
            "city", "areaKeys", "polygon", "viewportScope",
            "dateFrom", "dateTo", "schoolLat", "schoolLon", "schoolRadiusKm", "bbox", "q",
            "excludePropertyTypes",
            // #2459 contextual area bounds. Classified NON-ALERTABLE for now — deliberately, and
            // narrowly: #2459 delivers the PREDICATE and the two query params, not a saved-search
            // representation. Making them alertable means adding them to
            // SavedSearchFilterAllowlist.SUPPORTED_KEYS and to the mapper, which is #2019's domain
            // and needs its own ruling (a size range saved today would silently mean "any size"
            // if the meaning mapping later changed for a stored type). Until that ruling, a saved
            // search does not carry an area bound, which is honest rather than approximate.
            "areaMinSqft", "areaMaxSqft");

    private static final UUID USER = UUID.fromString("aaaaaaaa-0000-0000-0000-0000000000a1");

    static SavedSearch savedSearch(ResultScopeKind kind, List<String> areaKeys, List<List<Double>> polygon,
                                   Double s, Double w, Double n, Double e, Map<String, Object> filters) {
        OffsetDateTime now = OffsetDateTime.now();
        return new SavedSearch(UUID.randomUUID(), USER, "udupi", kind, areaKeys, polygon, s, w, n, e,
                filters, "fp", "label", SavedSearchStatus.ACTIVE, AlertFrequency.DAILY, AlertStatus.IDLE, now, now);
    }

    static Map<String, Object> fullyPopulatedFilters() {
        Map<String, Object> f = new HashMap<>();
        f.put("listingPurpose", "rent");
        f.put("propertyTypes", List.of("apartment", "villa"));
        f.put("commercialSubtypes", List.of("SHOP"));
        f.put("bedrooms", List.of(2, 3));
        f.put("sellerTypes", List.of("owner"));
        f.put("priceMinPaise", 5_000_000_00L);
        f.put("priceMaxPaise", 12_000_000_00);   // Integer on purpose: JSONB round-trips small ints as Integer
        f.put("backOnMarket", true);
        f.put("newToMarket", true);
        f.put("reraRegistered", true);
        f.put("readyToMove", true);
        return f;
    }

    private static Object component(Filters f, String name) throws Exception {
        for (RecordComponent rc : Filters.class.getRecordComponents()) {
            if (rc.getName().equals(name)) {
                return rc.getAccessor().invoke(f);
            }
        }
        throw new AssertionError("no Filters component named " + name);
    }

    @Test
    @DisplayName("SUPPORTED_KEYS and NON_FILTER_COMPONENTS partition Filters' 25 components exactly")
    void keySetsPartitionFiltersComponents() {
        Set<String> components = Arrays.stream(Filters.class.getRecordComponents())
                .map(RecordComponent::getName).collect(Collectors.toSet());
        assertThat(components).hasSize(25);
        assertThat(SUPPORTED_KEYS).doesNotContainAnyElementsOf(NON_FILTER_COMPONENTS);
        Set<String> union = new java.util.HashSet<>(SUPPORTED_KEYS);
        union.addAll(NON_FILTER_COMPONENTS);
        assertThat(union).as("a new Filters component must be classified here").isEqualTo(components);
    }

    @Test
    @DisplayName("every supported key is consumed by the mapper onto the same-named Filters component")
    void everySupportedKeyMapsToItsComponent() throws Exception {
        Map<String, Object> full = fullyPopulatedFilters();
        for (String key : SUPPORTED_KEYS) {
            assertThat(full).as("test fixture must populate " + key).containsKey(key);
            Filters only = SavedSearchFiltersMapper.toFilters(
                    savedSearch(ResultScopeKind.AREA_SET, List.of("IN|KA|Udupi|Manipal"), null,
                            null, null, null, null, Map.of(key, full.get(key))));
            for (RecordComponent rc : Filters.class.getRecordComponents()) {
                Object v = rc.getAccessor().invoke(only);
                if (rc.getName().equals(key)) {
                    assertThat(v).as("filter key %s must land on Filters.%s", key, key).isNotNull();
                } else if (!Set.of("city", "areaKeys").contains(rc.getName())) {
                    assertThat(v).as("filter key %s must not leak into Filters.%s", key, rc.getName()).isNull();
                }
            }
        }
    }

    @Test
    @DisplayName("non-alertable components are always null; scope maps to exactly one of areaKeys/polygon/viewportScope")
    void nonAlertableStayNullAndScopeIsExclusive() throws Exception {
        Filters area = SavedSearchFiltersMapper.toFilters(savedSearch(
                ResultScopeKind.AREA_SET, List.of("IN|KA|Udupi|Manipal", "IN|KA|Udupi|Kunjibettu"),
                null, null, null, null, null, fullyPopulatedFilters()));
        Filters poly = SavedSearchFiltersMapper.toFilters(savedSearch(
                ResultScopeKind.POLYGON, null, List.of(List.of(13.34, 74.78), List.of(13.37, 74.78), List.of(13.37, 74.82)),
                null, null, null, null, Map.of()));
        Filters vp = SavedSearchFiltersMapper.toFilters(savedSearch(
                ResultScopeKind.VIEWPORT, null, null, 13.32, 74.73, 13.35, 74.76, Map.of()));

        for (Filters f : List.of(area, poly, vp)) {
            for (String c : Set.of("dateFrom", "dateTo", "schoolLat", "schoolLon", "schoolRadiusKm", "bbox", "q",
                    "excludePropertyTypes")) {
                assertThat(component(f, c)).as(c).isNull();
            }
            assertThat(f.city()).isEqualTo("udupi");
        }
        assertThat(area.areaKeys()).containsExactly("IN|KA|Udupi|Manipal", "IN|KA|Udupi|Kunjibettu");
        assertThat(area.polygon()).isNull();
        assertThat(area.viewportScope()).isNull();

        assertThat(poly.areaKeys()).isNull();
        assertThat(poly.polygon()).hasSize(3);
        assertThat(poly.viewportScope()).isNull();

        assertThat(vp.areaKeys()).isNull();
        assertThat(vp.polygon()).isNull();
        assertThat(vp.viewportScope()).isEqualTo(new Bbox(13.32, 74.73, 13.35, 74.76));
    }

    @Test
    @DisplayName("predicate SQL + params from a saved search equal the live query's for the equivalent canonical Filters")
    void predicateSqlIsIdenticalToLiveQuery() {
        SavedSearch saved = savedSearch(
                ResultScopeKind.AREA_SET, List.of("IN|KA|Udupi|Manipal", "IN|KA|Udupi|Kunjibettu"),
                null, null, null, null, null, fullyPopulatedFilters());

        Filters live = new Filters(
                "udupi", List.of("apartment", "villa"), List.of("SHOP"),
                5_000_000_00L, 12_000_000_00L, null, null, List.of(2, 3), List.of("owner"),
                true, true, true, true, null, null, null, null, null, null, "rent", null,
                List.of("IN|KA|Udupi|Manipal", "IN|KA|Udupi|Kunjibettu"), null);

        DiscoverListingPredicateBuilder.Sql fromSaved = DiscoverListingPredicateBuilder.build(SavedSearchFiltersMapper.toFilters(saved));
        DiscoverListingPredicateBuilder.Sql fromLive = DiscoverListingPredicateBuilder.build(live);

        assertThat(fromSaved.whereFragment()).isEqualTo(fromLive.whereFragment());
        assertThat(fromSaved.params()).isEqualTo(fromLive.params());
        assertThat(fromSaved.whereFragment())
                .as("trust/visibility base predicate is inherited, never re-implemented")
                .startsWith("pl.status = 'LIVE' AND pl.archived_at IS NULL AND pl.is_duplicate = false");
    }
}

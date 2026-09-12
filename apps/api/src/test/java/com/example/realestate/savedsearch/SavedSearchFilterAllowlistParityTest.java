package com.example.realestate.savedsearch;

import static org.assertj.core.api.Assertions.assertThat;

import com.example.realestate.ai.PropertyType;
import com.example.realestate.discover.DiscoverFilterNormalizer;
import com.example.realestate.discover.DiscoverListingPredicateBuilder;
import java.lang.reflect.RecordComponent;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Supplier;
import java.util.stream.Collectors;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Binds {@link SavedSearchFilterAllowlist#SUPPORTED_KEYS} to Discover's two authoritative
 * sources (#2019 Slice A review ruling 2, tightened per the c8341bbd review):
 *
 * <ol>
 *   <li>{@code DiscoverListingPredicateBuilder.Filters} — which keys Discover understands at
 *       all. {@code SUPPORTED_KEYS} and the explicit {@link #NON_ALERTABLE} set must partition
 *       its record components exactly, so a newly added Discover field fails here until a human
 *       decides whether it is alertable.</li>
 *   <li>{@link DiscoverFilterNormalizer} — which of those keys carry a normalised VALUE
 *       vocabulary. {@link DiscoverFilterNormalizer#VOCABULARY_FILTER_KEYS} must be a subset of
 *       {@code SUPPORTED_KEYS}; {@link DiscoverFilterNormalizer#normalize} must change exactly
 *       that set of components (proved by pushing a fully populated, un-normalised
 *       {@code Filters} through the real normaliser); and each vocabulary key is pushed through
 *       its real per-field handler and must come back canonicalised (not a no-op). A field the
 *       normaliser starts canonicalising without updating {@code VOCABULARY_FILTER_KEYS}, or a
 *       vocabulary key missing from {@code SUPPORTED_KEYS}, fails here.</li>
 * </ol>
 */
class SavedSearchFilterAllowlistParityTest {

    /**
     * Verbatim snapshot of {@code DiscoverListingPredicateBuilder.Filters}'s 25 record component
     * names (23 as of #2019 Slice A, plus the two #2459 area bounds). Hard-coded (not derived) so
     * the shape assertion detects drift.
     */
    private static final Set<String> EXPECTED_FILTERS_COMPONENTS =
            Set.of(
                    "city", "propertyTypes", "commercialSubtypes", "priceMinPaise", "priceMaxPaise",
                    "dateFrom", "dateTo", "bedrooms", "sellerTypes", "backOnMarket", "newToMarket",
                    "reraRegistered", "readyToMove", "polygon", "schoolLat", "schoolLon",
                    "schoolRadiusKm", "bbox", "q", "listingPurpose", "excludePropertyTypes",
                    "areaKeys", "viewportScope", "areaMinSqft", "areaMaxSqft");

    /**
     * Discover fields that are deliberately NOT persistable as saved-search filters: the city
     * and the three result scopes are first-class saved-search columns, the school/bbox/date
     * fields are transient UI/session inputs, and {@code q} is free text (never stored).
     */
    static final Set<String> NON_ALERTABLE =
            Set.of(
                    "city", "dateFrom", "dateTo", "polygon", "schoolLat", "schoolLon",
                    "schoolRadiusKm", "bbox", "q", "areaKeys", "viewportScope",
                    // #2019 Slice B ruling: no #2016 restore-link URL representation → not alertable
                    "excludePropertyTypes",
                    // #2459 contextual area bounds. Classified NON-ALERTABLE for now — deliberately,
                    // and narrowly: #2459 delivers the PREDICATE and the two query params, not a
                    // saved-search representation. Making them alertable means adding them to
                    // SUPPORTED_KEYS and to SavedSearchFiltersMapper, which is #2019's domain and
                    // needs its own ruling. Until then a saved search carries no area bound, which
                    // is honest rather than approximate.
                    "areaMinSqft", "areaMaxSqft");

    private static Set<String> actualFiltersComponentNames() {
        RecordComponent[] components = DiscoverListingPredicateBuilder.Filters.class.getRecordComponents();
        return Arrays.stream(components).map(RecordComponent::getName).collect(Collectors.toSet());
    }

    // ── 1. Filters record binding ───────────────────────────────────────────────────

    @Test
    @DisplayName("Filters record shape matches the pinned 25-component snapshot")
    void filtersRecordComponents_matchExpectedSnapshot() {
        assertThat(actualFiltersComponentNames())
                .as("Filters record shape changed — update EXPECTED_FILTERS_COMPONENTS AND decide whether "
                        + "the new/removed key belongs in SUPPORTED_KEYS or NON_ALERTABLE")
                .isEqualTo(EXPECTED_FILTERS_COMPONENTS);
    }

    @Test
    @DisplayName("SUPPORTED_KEYS and NON_ALERTABLE partition the Filters components exactly (disjoint, exhaustive)")
    void supportedAndNonAlertable_partitionFiltersComponentsExactly() {
        Set<String> union = new HashSet<>(SavedSearchFilterAllowlist.SUPPORTED_KEYS);
        union.addAll(NON_ALERTABLE);

        assertThat(SavedSearchFilterAllowlist.SUPPORTED_KEYS)
                .as("a key must be either alertable or explicitly non-alertable, never both")
                .doesNotContainAnyElementsOf(NON_ALERTABLE);
        assertThat(union)
                .as("every Filters component must be classified; an unclassified one means a new Discover "
                        + "field could silently become (or fail to become) alertable")
                .isEqualTo(actualFiltersComponentNames());
    }

    // ── 2. Normaliser binding ───────────────────────────────────────────────────────

    @Test
    @DisplayName("every key the normaliser canonicalises is alertable")
    void normalizerVocabularyKeys_areAllSupported() {
        assertThat(SavedSearchFilterAllowlist.SUPPORTED_KEYS)
                .as("DiscoverFilterNormalizer.VOCABULARY_FILTER_KEYS must be a subset of SUPPORTED_KEYS")
                .containsAll(DiscoverFilterNormalizer.VOCABULARY_FILTER_KEYS);
    }

    @Test
    @DisplayName("normalize() changes exactly VOCABULARY_FILTER_KEYS and passes every other component through")
    void normalize_changesExactlyTheDeclaredVocabularyKeys() throws Exception {
        DiscoverListingPredicateBuilder.Filters raw = fullyPopulatedUnnormalised();
        DiscoverListingPredicateBuilder.Filters normalised = DiscoverFilterNormalizer.normalize(raw);

        Set<String> changed = new HashSet<>();
        for (RecordComponent component : DiscoverListingPredicateBuilder.Filters.class.getRecordComponents()) {
            Object before = component.getAccessor().invoke(raw);
            Object after = component.getAccessor().invoke(normalised);
            if (!Objects.equals(before, after)) {
                changed.add(component.getName());
            }
        }

        assertThat(changed)
                .as("the set of components normalize() actually rewrote must equal the declared contract; "
                        + "a newly normalised field must be added to VOCABULARY_FILTER_KEYS (and reviewed for "
                        + "SUPPORTED_KEYS)")
                .isEqualTo(DiscoverFilterNormalizer.VOCABULARY_FILTER_KEYS);
    }

    @Test
    @DisplayName("each vocabulary key is recognised and canonicalised (not a no-op) by its real normaliser handler")
    void eachVocabularyKey_isCanonicalisedByRealHandler() {
        String firstPropertyType = PropertyType.values()[0].getValue();

        // key -> {actual through the REAL per-field handler, expected canonical form}
        Map<String, Supplier<Object[]>> handlers = new LinkedHashMap<>();
        handlers.put("listingPurpose", () -> new Object[] {
                DiscoverFilterNormalizer.normalizePurpose(" SALE "), "sale"});
        handlers.put("propertyTypes", () -> new Object[] {
                DiscoverFilterNormalizer.normalizePropertyTypes(List.of(firstPropertyType.toUpperCase())),
                List.of(firstPropertyType)});
        handlers.put("commercialSubtypes", () -> new Object[] {
                DiscoverFilterNormalizer.normalizeCommercialSubtypes(List.of("shop")), List.of("SHOP")});
        handlers.put("sellerTypes", () -> new Object[] {
                DiscoverFilterNormalizer.normalizeSellerTypes(List.of("OWNER", "owner")), List.of("owner")});
        handlers.put("bedrooms", () -> new Object[] {
                DiscoverFilterNormalizer.normalizeBedrooms(List.of(9, 9)), List.of(4)});

        assertThat(handlers.keySet())
                .as("this test must exercise a real handler for every declared vocabulary key")
                .isEqualTo(DiscoverFilterNormalizer.VOCABULARY_FILTER_KEYS);

        handlers.forEach((key, run) -> {
            Object[] actualExpected = run.get();
            assertThat(actualExpected[0])
                    .as("normaliser handler for '%s' must canonicalise, not pass through", key)
                    .isEqualTo(actualExpected[1]);
            assertThat(SavedSearchFilterAllowlist.SUPPORTED_KEYS).contains(key);
        });
    }

    /**
     * Every component populated with a value the normaliser would rewrite IF it handled that
     * component: mixed case / out-of-bucket for vocabulary fields, and non-canonical-looking but
     * pass-through values for everything else.
     */
    private static DiscoverListingPredicateBuilder.Filters fullyPopulatedUnnormalised() {
        String firstPropertyType = PropertyType.values()[0].getValue();
        return new DiscoverListingPredicateBuilder.Filters(
                "BANGALORE",
                List.of(firstPropertyType.toUpperCase()),
                List.of("shop"),
                1_000_000L,
                9_000_000L,
                "2026-01-01",
                "2026-12-31",
                List.of(9),
                List.of("OWNER"),
                Boolean.TRUE,
                Boolean.TRUE,
                Boolean.TRUE,
                Boolean.TRUE,
                List.of(List.of(12.9, 77.5), List.of(12.91, 77.5), List.of(12.91, 77.51)),
                12.9,
                77.5,
                2.5,
                new DiscoverListingPredicateBuilder.Bbox(12.9, 77.5, 13.0, 77.6),
                "Free Text",
                " SALE ",
                List.of("VILLA"),
                List.of("IN|KA|Bangalore|Indiranagar"),
                new DiscoverListingPredicateBuilder.Bbox(12.8, 77.4, 13.1, 77.7),
                // #2459: populated, so "normalize() leaves them byte-for-byte alone" is proved
                // against real values rather than against two nulls.
                800,
                2400);
    }
}

package com.example.realestate.discover.opensearch;

import com.example.realestate.discover.DiscoverCommercialFacts;
import com.example.realestate.discover.DiscoverListingResponse;
import com.example.realestate.discover.DiscoverListingsService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * #2433 — Postgres/OpenSearch parity for the Commercial summary facts.
 *
 * <p>Lives in the {@code opensearch} package because {@link OpenSearchHitMapper} is
 * package-private: the mapper's visibility is deliberate and worth more than the
 * convenience of co-locating this with the rest of the #2433 backend tests.
 */
class OpenSearchCommercialFactsParityTest {

    private static DiscoverCommercialFacts facts(
            String floorChoice, String floorMode, Integer floorNumber, Integer totalFloors,
            String hubType, Integer officeSeats, String occupancyStatus,
            Double clearHeight, Integer loadingBays, Double roadFrontage, String zoning) {
        return new DiscoverCommercialFacts(floorChoice, floorMode, floorNumber, totalFloors,
                hubType, officeSeats, occupancyStatus, clearHeight, loadingBays, roadFrontage, zoning);
    }

    private static DiscoverCommercialFacts empty() {
        return facts(null, null, null, null, null, null, null, null, null, null, null);
    }


    private static final String FLOOR_CHOICE = "GROUND";
    private static final String HUB_TYPE = "HIGH_STREET";
    private static final String OCCUPANCY = "PARTIALLY_OCCUPIED";
    private static final String ZONING = "MIXED_USE";

    private static DiscoverCommercialFacts populated() {
        return facts(FLOOR_CHOICE, "SPECIFIC", 3, 7, HUB_TYPE, 40, OCCUPANCY,
                18.5, 4, 30.0, ZONING);
    }

    private static Map<String, Object> indexSource() {
        Map<String, Object> source = new HashMap<>();
        source.put("floor_choice", FLOOR_CHOICE);
        source.put("floor_mode", "SPECIFIC");
        source.put("floor_number", 3);
        source.put("total_floors", 7);
        source.put("hub_type", HUB_TYPE);
        source.put("office_seats", 40);
        source.put("occupancy_status", OCCUPANCY);
        source.put("warehouse_clear_height_ft", 18.5);
        source.put("warehouse_loading_bays", 4);
        source.put("road_frontage_ft", 30.0);
        source.put("commercial_zoning", ZONING);
        return source;
    }

    /** Invokes the mapper's private facts projection — the unit actually under test. */
    private static DiscoverCommercialFacts mapFromIndex(Map<String, Object> source) throws Exception {
        Method m = OpenSearchHitMapper.class.getDeclaredMethod("commercialFacts", Map.class);
        m.setAccessible(true);
        return (DiscoverCommercialFacts) m.invoke(null, source);
    }

    @Test
    @DisplayName("both backends produce EQUAL facts, not merely both-present")
    void backendsProduceEqualFacts() throws Exception {
        DiscoverCommercialFacts fromIndex = mapFromIndex(indexSource());

        // Equality, not null-checks: a mapper that read the right keys into the wrong
        // components would pass a both-present assertion and fail this one.
        assertThat(fromIndex).isEqualTo(populated());
    }

    @Test
    @DisplayName("a key the index does not carry reads as absent, never as a fabricated zero")
    void missingIndexKeysAreAbsent() throws Exception {
        Map<String, Object> partial = new HashMap<>();
        partial.put("office_seats", 12);

        DiscoverCommercialFacts fromIndex = mapFromIndex(partial);

        assertThat(fromIndex).isNotNull();
        assertThat(fromIndex.officeSeats()).isEqualTo(12);
        assertThat(fromIndex.warehouseLoadingBays())
                .as("absent must be null — 0 loading bays is a claim the row never made")
                .isNull();
        assertThat(fromIndex.totalFloors()).isNull();
        assertThat(fromIndex.roadFrontageFt()).isNull();
    }

    @Test
    @DisplayName("an index hit with no commercial facts at all maps to null")
    void emptyIndexSourceMapsToNull() throws Exception {
        assertThat(mapFromIndex(new HashMap<>())).isNull();
    }

    @Test
    @DisplayName("the shared buildListing funnel carries facts through unchanged")
    void buildListingCarriesFactsThrough() {
        DiscoverListingResponse response = DiscoverListingsService.buildListing(
                "id", "L-1", "commercial", "Title", "Locality", "area:key", 1_000L,
                null, null, 850.0, "sq ft", null, 12.9, 74.7,
                null, null, null, null, null, null,
                0, false, null, false, "D",
                null, null, "sale", "LIVE",
                "SHOP", populated());

        assertThat(response.commercialFacts()).isEqualTo(populated());
        assertThat(response.commercialSubtype())
                .as("#2444's subtype must survive the #2433 append untouched")
                .isEqualTo("SHOP");
    }

    @Test
    @DisplayName("a listing with no commercial facts serialises without the object")
    void buildListingCollapsesEmptyFacts() {
        DiscoverListingResponse response = DiscoverListingsService.buildListing(
                "id", "L-2", "apartment", "Title", "Locality", "area:key", 1_000L,
                null, null, 900.0, "sq ft", 2, 12.9, 74.7,
                null, null, null, null, null, null,
                0, false, null, false, "D",
                null, null, "sale", "LIVE",
                null, empty());

        assertThat(response.commercialFacts()).isNull();
    }
}

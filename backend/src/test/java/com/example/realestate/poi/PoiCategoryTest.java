package com.example.realestate.poi;

import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class PoiCategoryTest {

    // --- Null / empty guards ---

    @Test
    void from_nullTags_returnsNull() {
        assertThat(PoiCategory.from(null)).isNull();
    }

    @Test
    void from_emptyTags_returnsNull() {
        assertThat(PoiCategory.from(Map.of())).isNull();
    }

    // --- Existing amenity categories ---

    @Nested
    class AmenityCategories {

        @Test
        void worship() {
            assertThat(PoiCategory.from(Map.of("amenity", "place_of_worship"))).isEqualTo(PoiCategory.WORSHIP);
        }

        @Test
        void hospitalByHospital() {
            assertThat(PoiCategory.from(Map.of("amenity", "hospital"))).isEqualTo(PoiCategory.HOSPITAL);
        }

        @Test
        void hospitalByClinic() {
            assertThat(PoiCategory.from(Map.of("amenity", "clinic"))).isEqualTo(PoiCategory.HOSPITAL);
        }

        @Test
        void schoolBySchool() {
            assertThat(PoiCategory.from(Map.of("amenity", "school"))).isEqualTo(PoiCategory.SCHOOL);
        }

        @Test
        void schoolByUniversity() {
            assertThat(PoiCategory.from(Map.of("amenity", "university"))).isEqualTo(PoiCategory.SCHOOL);
        }

        @Test
        void hotelByTourism() {
            assertThat(PoiCategory.from(Map.of("tourism", "hotel"))).isEqualTo(PoiCategory.HOTEL);
        }

        @Test
        void transportByBusStop() {
            assertThat(PoiCategory.from(Map.of("highway", "bus_stop"))).isEqualTo(PoiCategory.TRANSPORT);
        }

        @Test
        void transportByRailwayStation() {
            assertThat(PoiCategory.from(Map.of("railway", "station"))).isEqualTo(PoiCategory.TRANSPORT);
        }

        @Test
        void airport() {
            assertThat(PoiCategory.from(Map.of("aeroway", "aerodrome"))).isEqualTo(PoiCategory.AIRPORT);
        }

        @Test
        void groceryBySupermarket() {
            assertThat(PoiCategory.from(Map.of("shop", "supermarket"))).isEqualTo(PoiCategory.GROCERY);
        }

        @Test
        void unknownAmenity_returnsNull() {
            assertThat(PoiCategory.from(Map.of("amenity", "fountain"))).isNull();
        }
    }

    // --- Settlement categories (RE-70) ---

    @Nested
    class SettlementCategories {

        @Test
        void townCenter_fromTown() {
            assertThat(PoiCategory.from(Map.of("place", "town"))).isEqualTo(PoiCategory.TOWN_CENTER);
        }

        @Test
        void townCenter_fromCity() {
            assertThat(PoiCategory.from(Map.of("place", "city"))).isEqualTo(PoiCategory.TOWN_CENTER);
        }

        @Test
        void villageCenter_fromVillage() {
            assertThat(PoiCategory.from(Map.of("place", "village"))).isEqualTo(PoiCategory.VILLAGE_CENTER);
        }

        @Test
        void villageCenter_fromHamlet() {
            assertThat(PoiCategory.from(Map.of("place", "hamlet"))).isEqualTo(PoiCategory.VILLAGE_CENTER);
        }

        @Test
        void villageCenter_fromLocality() {
            assertThat(PoiCategory.from(Map.of("place", "locality"))).isEqualTo(PoiCategory.VILLAGE_CENTER);
        }

        @Test
        void villageCenter_fromSuburb() {
            assertThat(PoiCategory.from(Map.of("place", "suburb"))).isEqualTo(PoiCategory.VILLAGE_CENTER);
        }

        @Test
        void highway_fromTrunk() {
            assertThat(PoiCategory.from(Map.of("highway", "trunk", "ref", "NH 66"))).isEqualTo(PoiCategory.HIGHWAY);
        }

        @Test
        void highway_fromPrimary() {
            assertThat(PoiCategory.from(Map.of("highway", "primary"))).isEqualTo(PoiCategory.HIGHWAY);
        }

        @Test
        void highway_fromSecondary() {
            assertThat(PoiCategory.from(Map.of("highway", "secondary"))).isEqualTo(PoiCategory.HIGHWAY);
        }

        @Test
        void highway_fromTertiary() {
            assertThat(PoiCategory.from(Map.of("highway", "tertiary"))).isEqualTo(PoiCategory.HIGHWAY);
        }

        @Test
        void highway_trunkWithRef_notBusStop() {
            // Verify trunk highway is not confused with bus_stop
            assertThat(PoiCategory.from(Map.of("highway", "trunk"))).isEqualTo(PoiCategory.HIGHWAY);
            assertThat(PoiCategory.from(Map.of("highway", "trunk"))).isNotEqualTo(PoiCategory.TRANSPORT);
        }

        @Test
        void busStop_stillResolvesToTransport() {
            // Regression: highway=bus_stop must not be reclassified as HIGHWAY
            assertThat(PoiCategory.from(Map.of("highway", "bus_stop"))).isEqualTo(PoiCategory.TRANSPORT);
        }

        @Test
        void placeSettlement_winsOverCoincidentalAmenity() {
            // If a node has both place=town and amenity=hospital, settlement category wins
            assertThat(PoiCategory.from(Map.of("place", "town", "amenity", "hospital")))
                    .isEqualTo(PoiCategory.TOWN_CENTER);
        }

        @Test
        void unknownPlaceType_returnsNull() {
            assertThat(PoiCategory.from(Map.of("place", "country"))).isNull();
        }
    }
}

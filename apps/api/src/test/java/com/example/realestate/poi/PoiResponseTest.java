package com.example.realestate.poi;

import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for {@link PoiResponse#from(ListingPoi)}.
 *
 * #2642 (user-approved extension): {@code brokerAdded} surfaces the entity's
 * {@code source} field as a boolean so the frontend can render a BROKER-ADDED
 * provenance badge off a real signal instead of guessing from distanceMeters
 * presence/absence.
 */
class PoiResponseTest {

    private static ListingPoi poiWithSource(String source) {
        ListingPoi poi = new ListingPoi();
        poi.setId(UUID.randomUUID());
        poi.setListingId(UUID.randomUUID());
        poi.setName("Test POI");
        poi.setCategory("HOSPITAL");
        poi.setSource(source);
        poi.setApproved(true);
        poi.setPinned(false);
        return poi;
    }

    @Test
    void from_manualSource_setsBrokerAddedTrue() {
        PoiResponse response = PoiResponse.from(poiWithSource("manual"));

        assertTrue(response.brokerAdded());
    }

    @Test
    void from_overpassSource_setsBrokerAddedFalse() {
        PoiResponse response = PoiResponse.from(poiWithSource("overpass"));

        assertFalse(response.brokerAdded());
    }

    @Test
    void from_overpassSettlementSource_setsBrokerAddedFalse() {
        PoiResponse response = PoiResponse.from(poiWithSource("overpass_settlement"));

        assertFalse(response.brokerAdded());
    }
}

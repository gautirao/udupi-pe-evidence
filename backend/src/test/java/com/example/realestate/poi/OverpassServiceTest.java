package com.example.realestate.poi;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OverpassServiceTest {

    @Mock
    private ListingPoiRepository repository;

    // ===== 1. Haversine accuracy =====

    @Test
    void haversine_knownDistance() {
        // Udupi city center: 13.3409, 74.7421
        // A point ~500m north (roughly +0.0045 deg lat)
        double lat1 = 13.3409, lon1 = 74.7421;
        double lat2 = 13.3454, lon2 = 74.7421;

        int dist = OverpassService.haversineMeters(lat1, lon1, lat2, lon2);

        // 0.0045 deg lat ≈ 500m; allow ±10m tolerance
        assertThat(dist).isBetween(490, 510);
    }

    // ===== 2. Cache guard — skips Overpass when fresh data exists =====

    @Test
    void cacheGuard_skipsOverpassWhenFresh() {
        UUID listingId = UUID.randomUUID();
        when(repository.existsByListingIdAndSourceAndCreatedAtAfter(
                eq(listingId), eq("overpass"), any(OffsetDateTime.class)))
                .thenReturn(true);

        // Track whether the HTTP client was ever called
        boolean[] called = {false};
        OverpassHttpClient mockClient = (url, body) -> {
            called[0] = true;
            return Optional.of("{}");
        };

        OverpassService service = new OverpassService(repository, mockClient);
        List<ListingPoi> result = service.fetchAndCache(listingId, 13.3409, 74.7421);

        assertThat(result).isEmpty();
        assertThat(called[0]).isFalse();
    }

    // ===== 3. Fallback used when primary fails =====

    @Test
    void fallback_usedWhenMainFails() {
        UUID listingId = UUID.randomUUID();
        when(repository.existsByListingIdAndSourceAndCreatedAtAfter(
                eq(listingId), eq("overpass"), any(OffsetDateTime.class)))
                .thenReturn(false);

        List<String> calledUrls = new java.util.ArrayList<>();
        OverpassHttpClient mockClient = (url, body) -> {
            calledUrls.add(url);
            // Primary fails, fallback returns empty elements JSON
            if (calledUrls.size() == 1) return Optional.empty();
            return Optional.of("{\"elements\":[]}");
        };

        OverpassService service = new OverpassService(repository, mockClient);
        service.fetchAndCache(listingId, 13.3409, 74.7421);

        assertThat(calledUrls).hasSize(2);
        assertThat(calledUrls.get(0)).contains("overpass-api.de");
        assertThat(calledUrls.get(1)).contains("kumi.systems");
    }

    // ===== 4. Both endpoints fail — empty result, no exception =====

    @Test
    void bothEndpointsFail_returnsEmpty() {
        UUID listingId = UUID.randomUUID();
        when(repository.existsByListingIdAndSourceAndCreatedAtAfter(
                eq(listingId), eq("overpass"), any(OffsetDateTime.class)))
                .thenReturn(false);

        OverpassHttpClient mockClient = (url, body) -> Optional.empty();

        OverpassService service = new OverpassService(repository, mockClient);
        List<ListingPoi> result = service.fetchAndCache(listingId, 13.3409, 74.7421);

        assertThat(result).isEmpty();
        verify(repository, never()).saveAll(any());
    }

    // ===== 5. Valid Overpass response — correct POI data inserted =====

    @Test
    void parse_validResponse_insertsRows() {
        UUID listingId = UUID.randomUUID();
        when(repository.existsByListingIdAndSourceAndCreatedAtAfter(
                eq(listingId), eq("overpass"), any(OffsetDateTime.class)))
                .thenReturn(false);

        String json = """
                {
                  "elements": [
                    {
                      "id": 123456,
                      "lat": 13.3415,
                      "lon": 74.7430,
                      "tags": {
                        "amenity": "hospital",
                        "name": "Udupi District Hospital"
                      }
                    },
                    {
                      "id": 789012,
                      "lat": 13.3420,
                      "lon": 74.7440,
                      "tags": {
                        "amenity": "school",
                        "name": "St. Mary's School"
                      }
                    }
                  ]
                }
                """;

        OverpassHttpClient mockClient = (url, body) -> Optional.of(json);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ListingPoi>> captor = ArgumentCaptor.forClass(List.class);
        when(repository.saveAll(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

        OverpassService service = new OverpassService(repository, mockClient);
        service.fetchAndCache(listingId, 13.3409, 74.7421);

        List<ListingPoi> saved = captor.getValue();
        assertThat(saved).hasSize(2);

        ListingPoi hospital = saved.stream()
                .filter(p -> "HOSPITAL".equals(p.getCategory()))
                .findFirst()
                .orElseThrow();
        assertThat(hospital.getListingId()).isEqualTo(listingId);
        assertThat(hospital.getName()).isEqualTo("Udupi District Hospital");
        assertThat(hospital.getOsmId()).isEqualTo("123456");
        assertThat(hospital.getSource()).isEqualTo("overpass");
        assertThat(hospital.getApproved()).isFalse();
        assertThat(hospital.getDistanceMeters()).isPositive();

        ListingPoi school = saved.stream()
                .filter(p -> "SCHOOL".equals(p.getCategory()))
                .findFirst()
                .orElseThrow();
        assertThat(school.getName()).isEqualTo("St. Mary's School");
    }

    // ===== 6. fetchAndCacheAmenities — uses profile radius =====

    @Test
    void fetchAndCacheAmenities_landProfile_usesWiderRadius() {
        UUID listingId = UUID.randomUUID();
        when(repository.existsByListingIdAndSourceAndCreatedAtAfter(
                eq(listingId), eq("overpass"), any(OffsetDateTime.class)))
                .thenReturn(false);

        List<String> capturedBodies = new java.util.ArrayList<>();
        OverpassHttpClient mockClient = (url, body) -> {
            capturedBodies.add(body);
            return Optional.of("{\"elements\":[]}");
        };

        OverpassService service = new OverpassService(repository, mockClient);
        service.fetchAndCacheAmenities(listingId, 13.3409, 74.7421, "land");

        // Land profile amenity radius = 3000m; default = 1500m
        assertThat(capturedBodies).hasSize(1);
        assertThat(capturedBodies.get(0)).contains("3000");
    }

    @Test
    void fetchAndCacheAmenities_apartmentProfile_usesDefaultRadius() {
        UUID listingId = UUID.randomUUID();
        when(repository.existsByListingIdAndSourceAndCreatedAtAfter(
                eq(listingId), eq("overpass"), any(OffsetDateTime.class)))
                .thenReturn(false);

        List<String> capturedBodies = new java.util.ArrayList<>();
        OverpassHttpClient mockClient = (url, body) -> {
            capturedBodies.add(body);
            return Optional.of("{\"elements\":[]}");
        };

        OverpassService service = new OverpassService(repository, mockClient);
        service.fetchAndCacheAmenities(listingId, 13.3409, 74.7421, "apartment");

        // Apartment profile amenity radius = 1500m
        assertThat(capturedBodies).hasSize(1);
        assertThat(capturedBodies.get(0)).contains("1500");
    }

    // ===== 7. enrichSettlement — apartment skipped (no settlement queries) =====

    @Test
    void enrichSettlement_apartment_skipsAllQueries() {
        UUID listingId = UUID.randomUUID();
        boolean[] called = {false};
        OverpassHttpClient mockClient = (url, body) -> {
            called[0] = true;
            return Optional.of("{\"elements\":[]}");
        };

        OverpassService service = new OverpassService(repository, mockClient);
        List<ListingPoi> result = service.enrichSettlement(listingId, 13.3409, 74.7421, "apartment");

        assertThat(result).isEmpty();
        assertThat(called[0]).as("HTTP client should not be called for apartment type").isFalse();
        verify(repository, never()).existsByListingIdAndSourceAndCreatedAtAfter(any(), anyString(), any());
    }

    @Test
    void enrichSettlement_settlementCacheHit_skipsHttpCall() {
        UUID listingId = UUID.randomUUID();
        when(repository.existsByListingIdAndSourceAndCreatedAtAfter(
                eq(listingId), eq("overpass_settlement"), any(OffsetDateTime.class)))
                .thenReturn(true);

        boolean[] called = {false};
        OverpassHttpClient mockClient = (url, body) -> {
            called[0] = true;
            return Optional.of("{\"elements\":[]}");
        };

        OverpassService service = new OverpassService(repository, mockClient);
        List<ListingPoi> result = service.enrichSettlement(listingId, 13.3409, 74.7421, "land");

        assertThat(result).isEmpty();
        assertThat(called[0]).isFalse();
    }

    @Test
    void enrichSettlement_parsesPlaceNodeAsApprovedTownCenter() {
        UUID listingId = UUID.randomUUID();
        when(repository.existsByListingIdAndSourceAndCreatedAtAfter(
                eq(listingId), eq("overpass_settlement"), any(OffsetDateTime.class)))
                .thenReturn(false);

        String json = """
                {
                  "elements": [
                    {
                      "type": "node",
                      "id": 111111,
                      "lat": 13.3300,
                      "lon": 74.7421,
                      "tags": { "place": "town", "name": "Udupi" }
                    }
                  ]
                }
                """;

        OverpassHttpClient mockClient = (url, body) -> Optional.of(json);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ListingPoi>> captor = ArgumentCaptor.forClass(List.class);
        when(repository.saveAll(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

        OverpassService service = new OverpassService(repository, mockClient);
        service.enrichSettlement(listingId, 13.3409, 74.7421, "land");

        List<ListingPoi> saved = captor.getValue();
        assertThat(saved).hasSize(1);
        ListingPoi town = saved.get(0);
        assertThat(town.getCategory()).isEqualTo("TOWN_CENTER");
        assertThat(town.getName()).isEqualTo("Udupi");
        assertThat(town.getSource()).isEqualTo("overpass_settlement");
        assertThat(town.getApproved()).isTrue();
        assertThat(town.getDistanceMeters()).isPositive();
    }

    // ===== 8. buildSettlementQuery — radius clauses present / absent =====

    @Test
    void buildSettlementQuery_land_includesAllClauses() {
        String query = OverpassService.buildSettlementQuery(13.34, 74.74, PoiQueryProfile.LAND);
        assertThat(query).contains("city|town");
        assertThat(query).contains("village|hamlet");
        assertThat(query).contains("highway~\"trunk|primary");
        assertThat(query).contains("25000");  // town radius
        assertThat(query).contains("15000");  // village radius
        assertThat(query).contains("out geom;");
    }

    @Test
    void buildSettlementQuery_apartment_returnsQueryWithNoContent() {
        // Apartment has all zero radii — hasSettlementQueries() would prevent this call,
        // but if called directly it should produce a valid (empty) query structure.
        String query = OverpassService.buildSettlementQuery(13.34, 74.74, PoiQueryProfile.APARTMENT);
        assertThat(query).contains("[out:json]");
        assertThat(query).doesNotContain("city|town");
        assertThat(query).doesNotContain("highway");
    }

    // ===== 9. Highway name extraction =====

    @Test
    void extractHighwayName_refTag_normalizedWithDash() {
        Map<String, String> tags = Map.of("highway", "trunk", "ref", "NH 66");
        assertThat(OverpassService.extractHighwayName(tags, "trunk")).isEqualTo("NH-66");
    }

    @Test
    void extractHighwayName_refWithSpaces_allNormalized() {
        Map<String, String> tags = Map.of("highway", "primary", "ref", "SH 57");
        assertThat(OverpassService.extractHighwayName(tags, "primary")).isEqualTo("SH-57");
    }

    @Test
    void extractHighwayName_nameTagUsedWhenNoRef() {
        Map<String, String> tags = Map.of("highway", "primary", "name", "Manipal-Udupi Road");
        assertThat(OverpassService.extractHighwayName(tags, "primary")).isEqualTo("Manipal-Udupi Road");
    }

    @Test
    void extractHighwayName_tierFallback_trunk() {
        assertThat(OverpassService.extractHighwayName(Map.of(), "trunk")).isEqualTo("National Highway");
    }

    @Test
    void extractHighwayName_tierFallback_primary() {
        assertThat(OverpassService.extractHighwayName(Map.of(), "primary")).isEqualTo("State Highway");
    }

    @Test
    void extractHighwayName_tierFallback_secondary() {
        assertThat(OverpassService.extractHighwayName(Map.of(), "secondary")).isEqualTo("District Road");
    }

    @Test
    void extractHighwayName_tierFallback_tertiary() {
        assertThat(OverpassService.extractHighwayName(Map.of(), "tertiary")).isEqualTo("Local Road");
    }

    // ===== 10. PoiQueryProfile — factory =====

    @Test
    void queryProfile_land_hasWideRadii() {
        PoiQueryProfile p = PoiQueryProfile.forPropertyType("land");
        assertThat(p.amenityRadiusMeters()).isEqualTo(3_000);
        assertThat(p.townRadiusMeters()).isEqualTo(25_000);
        assertThat(p.villageRadiusMeters()).isEqualTo(15_000);
        assertThat(p.highwayRadiusMeters()).isEqualTo(3_000);
        assertThat(p.hasSettlementQueries()).isTrue();
    }

    @Test
    void queryProfile_apartment_noSettlement() {
        PoiQueryProfile p = PoiQueryProfile.forPropertyType("apartment");
        assertThat(p.amenityRadiusMeters()).isEqualTo(1_500);
        assertThat(p.hasSettlementQueries()).isFalse();
    }

    @Test
    void queryProfile_unknownType_usesDefault() {
        PoiQueryProfile p = PoiQueryProfile.forPropertyType("studio");
        assertThat(p.amenityRadiusMeters()).isEqualTo(1_500);
        assertThat(p.hasSettlementQueries()).isFalse();
    }

    @Test
    void queryProfile_null_usesDefault() {
        PoiQueryProfile p = PoiQueryProfile.forPropertyType(null);
        assertThat(p).isEqualTo(PoiQueryProfile.DEFAULT);
    }

    // ===== 6. Cap: top 3 per category =====

    @Test
    void cap_top3PerCategory() {
        UUID listingId = UUID.randomUUID();
        when(repository.existsByListingIdAndSourceAndCreatedAtAfter(
                eq(listingId), eq("overpass"), any(OffsetDateTime.class)))
                .thenReturn(false);

        // 5 hospitals at increasing distances from listing center 13.3409, 74.7421
        // Each ~100m further north than the previous
        String json = """
                {
                  "elements": [
                    { "id": 1, "lat": 13.3418, "lon": 74.7421, "tags": { "amenity": "hospital", "name": "H1" } },
                    { "id": 2, "lat": 13.3427, "lon": 74.7421, "tags": { "amenity": "hospital", "name": "H2" } },
                    { "id": 3, "lat": 13.3436, "lon": 74.7421, "tags": { "amenity": "hospital", "name": "H3" } },
                    { "id": 4, "lat": 13.3445, "lon": 74.7421, "tags": { "amenity": "hospital", "name": "H4" } },
                    { "id": 5, "lat": 13.3454, "lon": 74.7421, "tags": { "amenity": "hospital", "name": "H5" } }
                  ]
                }
                """;

        OverpassHttpClient mockClient = (url, body) -> Optional.of(json);

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ListingPoi>> captor = ArgumentCaptor.forClass(List.class);
        when(repository.saveAll(captor.capture())).thenAnswer(inv -> inv.getArgument(0));

        OverpassService service = new OverpassService(repository, mockClient);
        service.fetchAndCache(listingId, 13.3409, 74.7421);

        List<ListingPoi> saved = captor.getValue();
        // Only the 3 closest hospitals should be persisted
        assertThat(saved).hasSize(3);
        assertThat(saved).allMatch(p -> "HOSPITAL".equals(p.getCategory()));

        // Verify they are the closest 3 (H1, H2, H3 — sorted ASC by distance)
        List<String> names = saved.stream()
                .sorted(java.util.Comparator.comparingInt(ListingPoi::getDistanceMeters))
                .map(ListingPoi::getName)
                .toList();
        assertThat(names).containsExactly("H1", "H2", "H3");
    }
}

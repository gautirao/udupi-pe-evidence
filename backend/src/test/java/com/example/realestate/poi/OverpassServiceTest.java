package com.example.realestate.poi;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OverpassServiceTest {

    @Mock
    ListingPoiRepository repository;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    private OverpassService service(OverpassHttpClient client) {
        return new OverpassService(repository, client, MAPPER, 1500);
    }

    // -------------------------------------------------------------------------
    // Haversine
    // -------------------------------------------------------------------------

    @Nested
    class HaversineTests {

        @Test
        void zeroDistance_samePoint() {
            assertThat(OverpassService.haversineMeters(13.34, 74.74, 13.34, 74.74)).isEqualTo(0);
        }

        @Test
        void knownDistance_udupiBangalore_roughly311km() {
            // Udupi ~13.3392°N 74.7464°E, Bangalore ~12.9716°N 77.5946°E → ~311 km straight-line
            int dist = OverpassService.haversineMeters(13.3392, 74.7464, 12.9716, 77.5946);
            assertThat(dist).isBetween(300_000, 325_000);
        }

        @Test
        void shortDistance_100mApprox() {
            // ~100 m north of reference point
            int dist = OverpassService.haversineMeters(13.3400, 74.7464, 13.3409, 74.7464);
            assertThat(dist).isBetween(80, 120);
        }
    }

    // -------------------------------------------------------------------------
    // Cache guard
    // -------------------------------------------------------------------------

    @Nested
    class CacheGuardTests {

        @Test
        void freshCacheExists_httpNotCalled() {
            UUID listingId = UUID.randomUUID();
            when(repository.existsByListingIdAndSourceAndCreatedAtAfter(
                    eq(listingId), eq("overpass"), any(OffsetDateTime.class)))
                    .thenReturn(true);
            when(repository.findByListingIdAndApproved(listingId, false)).thenReturn(List.of());

            AtomicInteger calls = new AtomicInteger();
            service((_url, _body) -> { calls.incrementAndGet(); return Optional.empty(); })
                    .fetchAndCache(listingId, 13.34, 74.74);

            assertThat(calls.get()).isZero();
        }

        @Test
        void staleCacheOrNone_httpIsCalled() {
            UUID listingId = UUID.randomUUID();
            when(repository.existsByListingIdAndSourceAndCreatedAtAfter(any(), any(), any()))
                    .thenReturn(false);

            AtomicInteger calls = new AtomicInteger();
            service((_url, _body) -> { calls.incrementAndGet(); return Optional.of("{\"elements\":[]}"); })
                    .fetchAndCache(listingId, 13.34, 74.74);

            assertThat(calls.get()).isGreaterThan(0);
        }
    }

    // -------------------------------------------------------------------------
    // Fallback / failure
    // -------------------------------------------------------------------------

    @Nested
    class FallbackTests {

        @Test
        void primaryFails_retriesKumi() {
            UUID listingId = UUID.randomUUID();
            when(repository.existsByListingIdAndSourceAndCreatedAtAfter(any(), any(), any()))
                    .thenReturn(false);

            AtomicInteger calls = new AtomicInteger();
            OverpassHttpClient client = (url, body) -> {
                calls.incrementAndGet();
                if (url.contains("overpass-api.de")) return Optional.empty();
                return Optional.of("{\"elements\":[]}");
            };

            service(client).fetchAndCache(listingId, 13.34, 74.74);

            assertThat(calls.get()).isEqualTo(2);
        }

        @Test
        void bothEndpointsFail_returnsEmptyNoException() {
            UUID listingId = UUID.randomUUID();
            when(repository.existsByListingIdAndSourceAndCreatedAtAfter(any(), any(), any()))
                    .thenReturn(false);

            List<ListingPoi> result = service((_u, _b) -> Optional.empty())
                    .fetchAndCache(listingId, 13.34, 74.74);

            assertThat(result).isEmpty();
            verify(repository, never()).save(any());
        }

        @Test
        void malformedJson_returnsEmptyNoException() {
            UUID listingId = UUID.randomUUID();
            when(repository.existsByListingIdAndSourceAndCreatedAtAfter(any(), any(), any()))
                    .thenReturn(false);

            List<ListingPoi> result = service((_u, _b) -> Optional.of("not-json"))
                    .fetchAndCache(listingId, 13.34, 74.74);

            assertThat(result).isEmpty();
        }
    }

    // -------------------------------------------------------------------------
    // Parse + persist
    // -------------------------------------------------------------------------

    @Nested
    class ParseTests {

        private static final UUID LISTING_ID = UUID.randomUUID();

        private OverpassService serviceWithJson(String json) {
            when(repository.existsByListingIdAndSourceAndCreatedAtAfter(any(), any(), any()))
                    .thenReturn(false);
            when(repository.existsByListingIdAndOsmId(any(), any())).thenReturn(false);
            when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));
            return service((_u, _b) -> Optional.of(json));
        }

        @Test
        void nodeElement_savedWithCorrectCategory() {
            String json = """
                    {"elements":[
                      {"type":"node","id":111,"lat":13.341,"lon":74.747,
                       "tags":{"amenity":"place_of_worship","name":"Sri Anantheshwara"}}
                    ]}""";

            serviceWithJson(json).fetchAndCache(LISTING_ID, 13.340, 74.746);

            verify(repository).save(argThat(p ->
                    "WORSHIP".equals(p.getCategory())
                            && "Sri Anantheshwara".equals(p.getName())
                            && "overpass".equals(p.getSource())
                            && !p.isApproved()
                            && "111".equals(p.getOsmId())
            ));
        }

        @Test
        void wayElement_usesCenter() {
            String json = """
                    {"elements":[
                      {"type":"way","id":222,
                       "center":{"lat":13.341,"lon":74.747},
                       "tags":{"amenity":"hospital","name":"City Hospital"}}
                    ]}""";

            serviceWithJson(json).fetchAndCache(LISTING_ID, 13.340, 74.746);

            verify(repository).save(argThat(p -> "HOSPITAL".equals(p.getCategory())));
        }

        @Test
        void duplicateOsmId_notSavedAgain() {
            when(repository.existsByListingIdAndSourceAndCreatedAtAfter(any(), any(), any()))
                    .thenReturn(false);
            when(repository.existsByListingIdAndOsmId(any(), eq("333"))).thenReturn(true);

            String json = """
                    {"elements":[
                      {"type":"node","id":333,"lat":13.341,"lon":74.747,
                       "tags":{"amenity":"school","name":"Govt School"}}
                    ]}""";

            service((_u, _b) -> Optional.of(json)).fetchAndCache(LISTING_ID, 13.340, 74.746);

            verify(repository, never()).save(any());
        }

        @Test
        void unknownTags_skipped() {
            when(repository.existsByListingIdAndSourceAndCreatedAtAfter(any(), any(), any()))
                    .thenReturn(false);

            String json = """
                    {"elements":[
                      {"type":"node","id":444,"lat":13.341,"lon":74.747,
                       "tags":{"amenity":"parking","name":"Car Park"}}
                    ]}""";

            service((_u, _b) -> Optional.of(json)).fetchAndCache(LISTING_ID, 13.340, 74.746);

            verify(repository, never()).save(any());
        }
    }

    // -------------------------------------------------------------------------
    // Caps
    // -------------------------------------------------------------------------

    @Nested
    class CapTests {

        @Test
        void capsAtThreePerCategory() {
            when(repository.existsByListingIdAndSourceAndCreatedAtAfter(any(), any(), any()))
                    .thenReturn(false);
            when(repository.existsByListingIdAndOsmId(any(), any())).thenReturn(false);
            when(repository.save(any())).thenAnswer(inv -> inv.getArgument(0));

            // 5 worship nodes close by
            String json = """
                    {"elements":[
                      {"type":"node","id":1,"lat":13.3401,"lon":74.74,"tags":{"amenity":"place_of_worship","name":"A"}},
                      {"type":"node","id":2,"lat":13.3402,"lon":74.74,"tags":{"amenity":"place_of_worship","name":"B"}},
                      {"type":"node","id":3,"lat":13.3403,"lon":74.74,"tags":{"amenity":"place_of_worship","name":"C"}},
                      {"type":"node","id":4,"lat":13.3404,"lon":74.74,"tags":{"amenity":"place_of_worship","name":"D"}},
                      {"type":"node","id":5,"lat":13.3405,"lon":74.74,"tags":{"amenity":"place_of_worship","name":"E"}}
                    ]}""";

            UUID listingId = UUID.randomUUID();
            service((_u, _b) -> Optional.of(json)).fetchAndCache(listingId, 13.340, 74.74);

            // Only 3 saves expected (cap per category = 3)
            verify(repository, times(3)).save(any());
        }
    }
}

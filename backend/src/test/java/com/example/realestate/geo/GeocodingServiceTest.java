package com.example.realestate.geo;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class GeocodingServiceTest {

    @Mock
    private GeocodeCacheRepository cacheRepository;

    private GeocodingService service;

    @BeforeEach
    void setUp() {
        service = new GeocodingService(cacheRepository);
    }

    // ===== Cache hit =====

    @Test
    void geocode_cacheHit_returnsCachedResult() {
        GeocodeCache cached = new GeocodeCache("manipal", 13.3528, 74.7906, "Manipal, Karnataka", OffsetDateTime.now());
        setId(cached);
        when(cacheRepository.findByLocalityIgnoreCase("manipal")).thenReturn(Optional.of(cached));

        GeocodingService.GeoResult result = service.geocode("Manipal");

        assertThat(result).isNotNull();
        assertThat(result.latitude()).isEqualTo(13.3528);
        assertThat(result.longitude()).isEqualTo(74.7906);
        verifyNoMoreInteractions(cacheRepository);
    }

    @Test
    void geocode_nullLocality_returnsNull() {
        assertThat(service.geocode(null)).isNull();
        verifyNoInteractions(cacheRepository);
    }

    @Test
    void geocode_blankLocality_returnsNull() {
        assertThat(service.geocode("   ")).isNull();
        verifyNoInteractions(cacheRepository);
    }

    // ===== Locality simplification =====

    @Test
    void simplify_removesNoiseWords() {
        String result = GeocodingService.simplify("NH Highway Junction, Manipal");
        assertThat(result).doesNotContainIgnoringCase("highway");
        assertThat(result).doesNotContainIgnoringCase("junction");
        assertThat(result).containsIgnoringCase("manipal");
    }

    @Test
    void simplify_collapsesWhitespace() {
        String result = GeocodingService.simplify("Near   Temple,  Udupi");
        assertThat(result).doesNotContain("  ");
    }

    @Test
    void simplify_preservesMeaningfulParts() {
        String result = GeocodingService.simplify("Manipal");
        assertThat(result).isEqualToIgnoringCase("Manipal");
    }

    @Test
    void simplify_removesLeadingTrailingCommas() {
        String result = GeocodingService.simplify("Near beach, Udupi,");
        assertThat(result).doesNotEndWith(",");
    }

    // ===== Private helper =====

    private void setId(GeocodeCache cache) {
        try {
            var field = GeocodeCache.class.getDeclaredField("id");
            field.setAccessible(true);
            field.set(cache, UUID.randomUUID());
        } catch (Exception ignored) {}
    }
}

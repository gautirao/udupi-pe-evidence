package com.example.realestate.intelligence;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link AdminIntelligenceService}.
 *
 * <p>Covers:
 * <ul>
 *   <li>parseDistrict — normal, malformed (fewer than 3 segments), blank segment, null</li>
 *   <li>avgQualityScore null-coercion guard — scoredCount=0 yields null avgQuality, not 0</li>
 *   <li>demand fields always null in mapped response</li>
 *   <li>confidence label derives from live90dCount via AreaConfidence.classify()</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class AdminIntelligenceServiceTest {

    @Mock
    private AreaIntelligenceRepository areaIntelligenceRepository;

    @InjectMocks
    private AdminIntelligenceService service;

    // ==================== parseDistrict tests ====================

    @Test
    void parseDistrict_normalKey_returnsDistrict() {
        assertThat(AdminIntelligenceService.parseDistrict("IN|KA|Udupi|Manipal")).isEqualTo("Udupi");
    }

    @Test
    void parseDistrict_onlyTwoSegments_returnsNull() {
        assertThat(AdminIntelligenceService.parseDistrict("IN|KA")).isNull();
    }

    @Test
    void parseDistrict_oneSegment_returnsNull() {
        assertThat(AdminIntelligenceService.parseDistrict("IN")).isNull();
    }

    @Test
    void parseDistrict_emptyString_returnsNull() {
        assertThat(AdminIntelligenceService.parseDistrict("")).isNull();
    }

    @Test
    void parseDistrict_nullInput_returnsNull() {
        assertThat(AdminIntelligenceService.parseDistrict(null)).isNull();
    }

    @Test
    void parseDistrict_blankDistrictSegment_returnsNull() {
        // area_key with blank district segment: "IN|KA||Manipal"
        assertThat(AdminIntelligenceService.parseDistrict("IN|KA||Manipal")).isNull();
    }

    @Test
    void parseDistrict_exactlyThreeSegments_returnsDistrict() {
        assertThat(AdminIntelligenceService.parseDistrict("IN|KA|Udupi")).isEqualTo("Udupi");
    }

    // ==================== getAreaIntelligence mapping tests ====================

    @Test
    void getAreaIntelligence_allNullQualityScore_yieldsNullAvgNotZero() {
        // Simulate a row where all quality_scores are NULL: scoredCount=0, avgQuality=null
        AreaIntelligenceRow row = buildRow("IN|KA|Udupi|Karkala", "Karkala", 12L, 0L, null);
        when(areaIntelligenceRepository.findLive90dAggregates()).thenReturn(List.of(row));

        List<AreaIntelligenceResponse> result = service.getAreaIntelligence(null);

        assertThat(result).hasSize(1);
        AreaIntelligenceResponse resp = result.get(0);
        assertThat(resp.avgQualityScore()).isNull();       // must be null, NOT 0
        assertThat(resp.scoredListingCount()).isZero();
        assertThat(resp.live90dCount()).isEqualTo(12);
        assertThat(resp.confidence()).isEqualTo("limited"); // 12 → LIMITED
    }

    @Test
    void getAreaIntelligence_demandFieldsAlwaysNull() {
        AreaIntelligenceRow row = buildRow("IN|KA|Udupi|Manipal", "Manipal", 35L, 30L, 72.5);
        when(areaIntelligenceRepository.findLive90dAggregates()).thenReturn(List.of(row));

        List<AreaIntelligenceResponse> result = service.getAreaIntelligence(null);

        assertThat(result.get(0).demandEventCount()).isNull();
        assertThat(result.get(0).topGaps()).isNull();
    }

    @Test
    void getAreaIntelligence_confidenceLabelFull_for30() {
        AreaIntelligenceRow row = buildRow("IN|KA|Udupi|Manipal", "Manipal", 30L, 30L, 80.0);
        when(areaIntelligenceRepository.findLive90dAggregates()).thenReturn(List.of(row));

        List<AreaIntelligenceResponse> result = service.getAreaIntelligence(null);

        assertThat(result.get(0).confidence()).isEqualTo("full");
    }

    @Test
    void getAreaIntelligence_confidenceLabelInsufficient_for9() {
        AreaIntelligenceRow row = buildRow("IN|KA|Udupi|Hiriyadka", "Hiriyadka", 9L, 5L, 60.0);
        when(areaIntelligenceRepository.findLive90dAggregates()).thenReturn(List.of(row));

        List<AreaIntelligenceResponse> result = service.getAreaIntelligence(null);

        assertThat(result.get(0).confidence()).isEqualTo("insufficient");
    }

    @Test
    void getAreaIntelligence_cityFilter_delegatesToDistrictQuery() {
        AreaIntelligenceRow row = buildRow("IN|KA|Udupi|Manipal", "Manipal", 20L, 15L, 65.0);
        when(areaIntelligenceRepository.findLive90dAggregatesByDistrict("Udupi")).thenReturn(List.of(row));

        List<AreaIntelligenceResponse> result = service.getAreaIntelligence("Udupi");

        assertThat(result).hasSize(1);
        assertThat(result.get(0).district()).isEqualTo("Udupi");
    }

    @Test
    void getAreaIntelligence_blankCityFilter_returnsAllAreas() {
        AreaIntelligenceRow row = buildRow("IN|KA|Udupi|Manipal", "Manipal", 20L, 15L, 65.0);
        when(areaIntelligenceRepository.findLive90dAggregates()).thenReturn(List.of(row));

        List<AreaIntelligenceResponse> result = service.getAreaIntelligence("  "); // blank

        assertThat(result).hasSize(1);
    }

    @Test
    void getAreaIntelligence_emptyList_returnsEmpty() {
        when(areaIntelligenceRepository.findLive90dAggregates()).thenReturn(List.of());

        List<AreaIntelligenceResponse> result = service.getAreaIntelligence(null);

        assertThat(result).isEmpty();
    }

    // ==================== Helpers ====================

    private static AreaIntelligenceRow buildRow(String areaKey, String areaLabel,
                                                Long live90dCount, Long scoredCount,
                                                Double avgQuality) {
        return new AreaIntelligenceRow() {
            @Override public String getAreaKey() { return areaKey; }
            @Override public String getAreaLabel() { return areaLabel; }
            @Override public Long getLive90dCount() { return live90dCount; }
            @Override public Long getScoredCount() { return scoredCount; }
            @Override public Double getAvgQuality() { return avgQuality; }
        };
    }
}

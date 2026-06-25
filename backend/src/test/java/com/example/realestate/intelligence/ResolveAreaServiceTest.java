package com.example.realestate.intelligence;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;

/**
 * Unit tests for {@link BuyerAreaIntelligenceService#resolveArea(String, String)}.
 */
@ExtendWith(MockitoExtension.class)
class ResolveAreaServiceTest {

    @Mock
    private AreaIntelligenceSnapshotRepository repository;

    @Mock
    private JdbcOperations jdbcOperations;

    private BuyerAreaIntelligenceService service;

    @BeforeEach
    void setUp() {
        service = new BuyerAreaIntelligenceService(repository, jdbcOperations);
    }

    @Test
    @DisplayName("RA-S01: snapshot missing + static area missing -> matched=false")
    @SuppressWarnings("unchecked")
    void resolveArea_staticAreaMissing_matchedFalse() {
        when(jdbcOperations.query(anyString(), any(RowMapper.class), eq("udupi"), eq("non-existent-area")))
                .thenReturn(Collections.emptyList());

        ResolveAreaResponse resp = service.resolveArea("udupi", "non-existent-area");

        assertThat(resp.matched()).isFalse();
        assertThat(resp.areaKey()).isNull();
        assertThat(resp.areaLabel()).isNull();
        assertThat(resp.citySlug()).isEqualTo("udupi");
        assertThat(resp.areaSlug()).isEqualTo("non-existent-area");
    }

    @Test
    @DisplayName("RA-S02: snapshot missing + static area present -> matched=true, returns static area details")
    @SuppressWarnings("unchecked")
    void resolveArea_snapshotMissing_staticAreaPresent_matchedTrue() {
        BuyerAreaIntelligenceService.StaticAreaRow staticRow =
                new BuyerAreaIntelligenceService.StaticAreaRow("IN|KA|Udupi|Malpe", "Malpe");
        when(jdbcOperations.query(anyString(), any(RowMapper.class), eq("udupi"), eq("malpe")))
                .thenReturn(List.of(staticRow));

        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|Malpe")))
                .thenReturn(Optional.empty());

        ResolveAreaResponse resp = service.resolveArea("udupi", "malpe");

        assertThat(resp.matched()).isTrue();
        assertThat(resp.areaKey()).isEqualTo("IN|KA|Udupi|Malpe");
        assertThat(resp.areaLabel()).isEqualTo("Malpe");
        assertThat(resp.citySlug()).isEqualTo("udupi");
        assertThat(resp.areaSlug()).isEqualTo("malpe");
    }

    @Test
    @DisplayName("RA-S03: snapshot present -> existing behaviour preserved (returns snapshot label)")
    @SuppressWarnings("unchecked")
    void resolveArea_snapshotPresent_matchedTrue() {
        BuyerAreaIntelligenceService.StaticAreaRow staticRow =
                new BuyerAreaIntelligenceService.StaticAreaRow("IN|KA|Udupi|Malpe", "Malpe");
        when(jdbcOperations.query(anyString(), any(RowMapper.class), eq("udupi"), eq("malpe")))
                .thenReturn(List.of(staticRow));

        AreaIntelligenceSnapshot s = snapshot("udupi", "IN|KA|Udupi|Malpe", "Malpe Snapshot Label", 20);
        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|Malpe")))
                .thenReturn(Optional.of(s));

        ResolveAreaResponse resp = service.resolveArea("udupi", "malpe");

        assertThat(resp.matched()).isTrue();
        assertThat(resp.areaKey()).isEqualTo("IN|KA|Udupi|Malpe");
        assertThat(resp.areaLabel()).isEqualTo("Malpe Snapshot Label");
    }

    @Test
    @DisplayName("RA-S04: null area_label in snapshot -> fallback to static name or null")
    @SuppressWarnings("unchecked")
    void resolveArea_nullLabelInSnapshot_fallsBack() {
        BuyerAreaIntelligenceService.StaticAreaRow staticRow =
                new BuyerAreaIntelligenceService.StaticAreaRow("IN|KA|Udupi|Malpe", "Malpe");
        when(jdbcOperations.query(anyString(), any(RowMapper.class), eq("udupi"), eq("malpe")))
                .thenReturn(List.of(staticRow));

        AreaIntelligenceSnapshot s = snapshot("udupi", "IN|KA|Udupi|Malpe", null, 10);
        when(repository.findById(new AreaIntelligenceSnapshotId("udupi", "IN|KA|Udupi|Malpe")))
                .thenReturn(Optional.of(s));

        ResolveAreaResponse resp = service.resolveArea("udupi", "malpe");

        assertThat(resp.matched()).isTrue();
        assertThat(resp.areaKey()).isEqualTo("IN|KA|Udupi|Malpe");
        assertThat(resp.areaLabel()).isNull();
    }

    private static AreaIntelligenceSnapshot snapshot(
            String citySlug, String areaKey, String areaLabel, int activeListingCount) {
        AreaIntelligenceSnapshot s = new AreaIntelligenceSnapshot();
        s.setCitySlug(citySlug);
        s.setAreaKey(areaKey);
        s.setAreaLabel(areaLabel);
        s.setActiveListingCount(activeListingCount);
        s.setConfidence("insufficient");
        s.setComputedAt(java.time.Instant.now());
        return s;
    }
}

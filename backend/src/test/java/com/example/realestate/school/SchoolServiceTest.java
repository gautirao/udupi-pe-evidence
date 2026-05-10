package com.example.realestate.school;

import com.example.realestate.area.AreaNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link SchoolService#findPopularByArea}.
 * Uses Mockito to isolate the service from the database.
 */
@ExtendWith(MockitoExtension.class)
class SchoolServiceTest {

    @Mock
    private SchoolRepository repository;

    private SchoolService service;

    @BeforeEach
    void setUp() {
        service = new SchoolService(repository);
    }

    // ==================== findPopularByArea — valid area returns schools ====================

    @Test
    void findPopularByArea_validArea_returns_schools() {
        UUID id = UUID.fromString("00000000-0000-0000-0000-000000000001");
        SchoolRepository.AreaSchoolProjection proj = stubProjection(id, "Sharada Vidyalaya",
                "CBSE", "CBSE", 13.3511, 74.7871, "Manipal, Udupi", "notable", null);

        when(repository.countByAreaKey(eq("IN|KA|Udupi|Manipal"))).thenReturn(1);
        when(repository.findPopularByAreaKey(eq("IN|KA|Udupi|Manipal"), anyInt()))
                .thenReturn(List.of(proj));

        List<SchoolResponse> results = service.findPopularByArea("IN|KA|Udupi|Manipal", 10);

        assertThat(results).hasSize(1);
        assertThat(results.get(0).id()).isEqualTo(id.toString());
        assertThat(results.get(0).name()).isEqualTo("Sharada Vidyalaya");
        assertThat(results.get(0).prominenceTier()).isEqualTo("notable");
        assertThat(results.get(0).distanceKm()).isNull();
    }

    // ==================== findPopularByArea — unknown area throws AreaNotFoundException ====================

    @Test
    void findPopularByArea_unknownArea_throws_AreaNotFoundException() {
        when(repository.countByAreaKey(eq("IN|KA|Udupi|Unknown"))).thenReturn(0);

        assertThatThrownBy(() -> service.findPopularByArea("IN|KA|Udupi|Unknown", 10))
                .isInstanceOf(AreaNotFoundException.class)
                .hasMessageContaining("IN|KA|Udupi|Unknown");
    }

    // ==================== findPopularByArea — limit clamping (0 → 1, 51 → 50) ====================

    @Test
    void findPopularByArea_limitClamping_min_and_max() {
        UUID id = UUID.fromString("00000000-0000-0000-0000-000000000002");
        SchoolRepository.AreaSchoolProjection proj = stubProjection(id, "Test School",
                null, null, 13.3, 74.7, "Udupi", null, null);

        when(repository.countByAreaKey(eq("IN|KA|Udupi|Manipal"))).thenReturn(1);

        // limit=0 → clamped to 1
        when(repository.findPopularByAreaKey(eq("IN|KA|Udupi|Manipal"), eq(1)))
                .thenReturn(List.of(proj));

        List<SchoolResponse> resultsMin = service.findPopularByArea("IN|KA|Udupi|Manipal", 0);
        assertThat(resultsMin).hasSize(1);

        // limit=51 → clamped to 50
        when(repository.findPopularByAreaKey(eq("IN|KA|Udupi|Manipal"), eq(50)))
                .thenReturn(List.of(proj));

        List<SchoolResponse> resultsMax = service.findPopularByArea("IN|KA|Udupi|Manipal", 51);
        assertThat(resultsMax).hasSize(1);
    }

    // ==================== helpers ====================

    /**
     * Returns a minimal {@link SchoolRepository.AreaSchoolProjection} backed by a concrete class.
     * All fields are delegated directly to constructor parameters.
     */
    private SchoolRepository.AreaSchoolProjection stubProjection(
            UUID id, String name, String boardType, String board,
            double latitude, double longitude, String address,
            String prominenceTier, String schoolCategory) {

        return new SchoolRepository.AreaSchoolProjection() {
            @Override public UUID getId()             { return id; }
            @Override public String getName()         { return name; }
            @Override public String getBoardType()    { return boardType; }
            @Override public String getBoard()        { return board; }
            @Override public Double getLatitude()     { return latitude; }
            @Override public Double getLongitude()    { return longitude; }
            @Override public String getAddress()      { return address; }
            @Override public String getProminenceTier(){ return prominenceTier; }
            @Override public String getSchoolCategory(){ return schoolCategory; }
        };
    }
}

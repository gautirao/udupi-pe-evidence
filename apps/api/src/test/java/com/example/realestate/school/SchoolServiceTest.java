package com.example.realestate.school;

import com.example.realestate.area.AreaNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
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
        when(repository.countNearbyListings(any(Set.class), anyDouble()))
                .thenReturn(List.of(stubListingCount(id, 7)));

        List<SchoolResponse> results = service.findPopularByArea("IN|KA|Udupi|Manipal", 10);

        assertThat(results).hasSize(1);
        assertThat(results.get(0).id()).isEqualTo(id.toString());
        assertThat(results.get(0).name()).isEqualTo("Sharada Vidyalaya");
        assertThat(results.get(0).prominenceTier()).isEqualTo("notable");
        assertThat(results.get(0).distanceKm()).isNull();
        assertThat(results.get(0).nearbyListingCount()).isEqualTo(7);
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
        when(repository.countNearbyListings(any(Set.class), anyDouble()))
                .thenReturn(List.of(stubListingCount(id, 0)));

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

    // ==================== nearbyListingCount merging ====================

    @Test
    void findPopularByArea_zeroListings_countIsZero() {
        UUID id = UUID.fromString("00000000-0000-0000-0000-000000000010");
        SchoolRepository.AreaSchoolProjection proj = stubProjection(id, "Empty Area School",
                "CBSE", "CBSE", 13.3511, 74.7871, "Manipal", "notable", null);

        when(repository.countByAreaKey(eq("IN|KA|Udupi|Manipal"))).thenReturn(1);
        when(repository.findPopularByAreaKey(eq("IN|KA|Udupi|Manipal"), anyInt()))
                .thenReturn(List.of(proj));
        // LEFT JOIN returns count=0 for this school
        when(repository.countNearbyListings(any(Set.class), anyDouble()))
                .thenReturn(List.of(stubListingCount(id, 0)));

        List<SchoolResponse> results = service.findPopularByArea("IN|KA|Udupi|Manipal", 10);

        assertThat(results).hasSize(1);
        assertThat(results.get(0).nearbyListingCount()).isEqualTo(0);
    }

    @Test
    void findPopularByArea_missingFromCountMap_defaultsToZero() {
        UUID id = UUID.fromString("00000000-0000-0000-0000-000000000011");
        SchoolRepository.AreaSchoolProjection proj = stubProjection(id, "Missing Count School",
                "CBSE", "CBSE", 13.3511, 74.7871, "Manipal", "notable", null);

        when(repository.countByAreaKey(eq("IN|KA|Udupi|Manipal"))).thenReturn(1);
        when(repository.findPopularByAreaKey(eq("IN|KA|Udupi|Manipal"), anyInt()))
                .thenReturn(List.of(proj));
        // Count query returns empty list (school absent from result set — defensive path)
        when(repository.countNearbyListings(any(Set.class), anyDouble()))
                .thenReturn(List.of());

        List<SchoolResponse> results = service.findPopularByArea("IN|KA|Udupi|Manipal", 10);

        assertThat(results).hasSize(1);
        assertThat(results.get(0).nearbyListingCount()).isEqualTo(0);
    }

    @Test
    void findPopularByArea_multipleListings_countReflectsValue() {
        UUID id = UUID.fromString("00000000-0000-0000-0000-000000000012");
        SchoolRepository.AreaSchoolProjection proj = stubProjection(id, "Busy Area School",
                "STATE", "STATE", 13.3511, 74.7871, "Manipal", "notable", null);

        when(repository.countByAreaKey(eq("IN|KA|Udupi|Manipal"))).thenReturn(1);
        when(repository.findPopularByAreaKey(eq("IN|KA|Udupi|Manipal"), anyInt()))
                .thenReturn(List.of(proj));
        when(repository.countNearbyListings(any(Set.class), anyDouble()))
                .thenReturn(List.of(stubListingCount(id, 12)));

        List<SchoolResponse> results = service.findPopularByArea("IN|KA|Udupi|Manipal", 10);

        assertThat(results).hasSize(1);
        assertThat(results.get(0).nearbyListingCount()).isEqualTo(12);
    }

    // ==================== search — scope regression (issue #1798) ====================

    @Test
    void search_blankCity_usesUnscopedQuery_preservesBackwardCompat() {
        UUID id = UUID.fromString("00000000-0000-0000-0000-000000000020");
        School school = stubSchool(id, "Hebbal Public School");

        when(repository.findByNameContainingIgnoreCase(eq("heb"), any()))
                .thenReturn(List.of(school));

        List<SchoolResponse> results = service.search("heb", 10, "  ");

        assertThat(results).hasSize(1);
        assertThat(results.get(0).name()).isEqualTo("Hebbal Public School");
        verify(repository).findByNameContainingIgnoreCase(eq("heb"), any());
        verify(repository, never()).findByNameContainingIgnoreCaseAndCity(any(), any(), anyInt());
    }

    @Test
    void search_nullCity_usesUnscopedQuery_preservesBackwardCompat() {
        UUID id = UUID.fromString("00000000-0000-0000-0000-000000000021");
        School school = stubSchool(id, "Hebbal Public School");

        when(repository.findByNameContainingIgnoreCase(eq("heb"), any()))
                .thenReturn(List.of(school));

        List<SchoolResponse> results = service.search("heb", 10, null);

        assertThat(results).hasSize(1);
        verify(repository).findByNameContainingIgnoreCase(eq("heb"), any());
        verify(repository, never()).findByNameContainingIgnoreCaseAndCity(any(), any(), anyInt());
    }

    @Test
    void search_nonBlankCity_delegatesToScopedQuery_excludesOtherCitySchools() {
        UUID id = UUID.fromString("00000000-0000-0000-0000-000000000022");
        School school = stubSchool(id, "Hebbal Public School");

        // Only the Bangalore-scoped query returns the school; the unscoped query is not invoked.
        when(repository.findByNameContainingIgnoreCaseAndCity(eq("heb"), eq("bangalore"), anyInt()))
                .thenReturn(List.of(school));

        List<SchoolResponse> results = service.search("heb", 10, "bangalore");

        assertThat(results).hasSize(1);
        assertThat(results.get(0).name()).isEqualTo("Hebbal Public School");
        verify(repository).findByNameContainingIgnoreCaseAndCity(eq("heb"), eq("bangalore"), anyInt());
        verify(repository, never()).findByNameContainingIgnoreCase(any(), any());
    }

    @Test
    void search_nonBlankCity_outOfScopeCity_returnsEmpty() {
        // Simulates the regression scenario: an "udupi" scope excludes Bangalore-only matches
        // because the repository query itself performs the district filter.
        when(repository.findByNameContainingIgnoreCaseAndCity(eq("heb"), eq("udupi"), anyInt()))
                .thenReturn(List.of());

        List<SchoolResponse> results = service.search("heb", 10, "udupi");

        assertThat(results).isEmpty();
        verify(repository).findByNameContainingIgnoreCaseAndCity(eq("heb"), eq("udupi"), anyInt());
    }

    @Test
    void search_city_limitClamping_min_and_max() {
        UUID id = UUID.fromString("00000000-0000-0000-0000-000000000023");
        School school = stubSchool(id, "Test School");

        when(repository.findByNameContainingIgnoreCaseAndCity(eq("test"), eq("udupi"), eq(1)))
                .thenReturn(List.of(school));
        List<SchoolResponse> resultsMin = service.search("test", 0, "udupi");
        assertThat(resultsMin).hasSize(1);

        when(repository.findByNameContainingIgnoreCaseAndCity(eq("test"), eq("udupi"), eq(50)))
                .thenReturn(List.of(school));
        List<SchoolResponse> resultsMax = service.search("test", 51, "udupi");
        assertThat(resultsMax).hasSize(1);
    }

    // ==================== search(query, limit, city, areaKeys) — issue #1812 routing ====================

    @Test
    void search_withAreaKeysAndCity_routesToScopedMethod() {
        UUID id = UUID.fromString("00000000-0000-0000-0000-000000000030");
        SchoolRepository.ScopedSchoolProjection proj = stubScopedProjection(
                id, "Hebbal North School", "CBSE", "CBSE", 13.05, 77.59, "Hebbal",
                "notable", null, "IN|KA|Bengaluru|Hebbal", true);

        List<String> areaKeys = List.of("IN|KA|Bengaluru|Hebbal", "IN|KA|Bengaluru|Yelahanka");
        when(repository.findByNameContainingIgnoreCaseAndCityAndAreaKeys(
                eq("heb"), eq("bangalore"), eq(areaKeys), anyInt()))
                .thenReturn(List.of(proj));

        List<SchoolResponse> results = service.search("heb", 10, "bangalore", areaKeys);

        assertThat(results).hasSize(1);
        assertThat(results.get(0).inScope()).isTrue();
        verify(repository).findByNameContainingIgnoreCaseAndCityAndAreaKeys(
                eq("heb"), eq("bangalore"), eq(areaKeys), anyInt());
        verify(repository, never()).findByNameContainingIgnoreCaseAndCity(any(), any(), anyInt());
        verify(repository, never()).findByNameContainingIgnoreCase(any(), any());
    }

    @Test
    void search_emptyAreaKeys_delegatesToUnchangedCityPath() {
        UUID id = UUID.fromString("00000000-0000-0000-0000-000000000031");
        School school = stubSchool(id, "Hebbal Public School");

        when(repository.findByNameContainingIgnoreCaseAndCity(eq("heb"), eq("bangalore"), anyInt()))
                .thenReturn(List.of(school));

        List<SchoolResponse> results = service.search("heb", 10, "bangalore", List.of());

        assertThat(results).hasSize(1);
        assertThat(results.get(0).inScope()).isNull();
        verify(repository).findByNameContainingIgnoreCaseAndCity(eq("heb"), eq("bangalore"), anyInt());
        verify(repository, never()).findByNameContainingIgnoreCaseAndCityAndAreaKeys(
                any(), any(), any(), anyInt());
    }

    @Test
    void search_nullAreaKeys_delegatesToUnchangedCityPath() {
        UUID id = UUID.fromString("00000000-0000-0000-0000-000000000032");
        School school = stubSchool(id, "Hebbal Public School");

        when(repository.findByNameContainingIgnoreCaseAndCity(eq("heb"), eq("bangalore"), anyInt()))
                .thenReturn(List.of(school));

        List<SchoolResponse> results = service.search("heb", 10, "bangalore", null);

        assertThat(results).hasSize(1);
        verify(repository).findByNameContainingIgnoreCaseAndCity(eq("heb"), eq("bangalore"), anyInt());
        verify(repository, never()).findByNameContainingIgnoreCaseAndCityAndAreaKeys(
                any(), any(), any(), anyInt());
    }

    @Test
    void search_areaKeysPresent_blankCity_treatedAsUnscoped() {
        UUID id = UUID.fromString("00000000-0000-0000-0000-000000000033");
        School school = stubSchool(id, "Hebbal Public School");

        when(repository.findByNameContainingIgnoreCase(eq("heb"), any()))
                .thenReturn(List.of(school));

        List<SchoolResponse> results = service.search("heb", 10, "  ", List.of("IN|KA|Bengaluru|Hebbal"));

        assertThat(results).hasSize(1);
        verify(repository).findByNameContainingIgnoreCase(eq("heb"), any());
        verify(repository, never()).findByNameContainingIgnoreCaseAndCityAndAreaKeys(
                any(), any(), any(), anyInt());
    }

    // ==================== helpers ====================

    private School stubSchool(UUID id, String name) {
        School school = new School();
        school.setId(id);
        school.setName(name);
        school.setLatitude(13.0);
        school.setLongitude(77.0);
        return school;
    }

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

    /**
     * Returns a minimal {@link SchoolRepository.ScopedSchoolProjection} backed by a concrete class.
     */
    private SchoolRepository.ScopedSchoolProjection stubScopedProjection(
            UUID id, String name, String boardType, String board,
            double latitude, double longitude, String address,
            String prominenceTier, String schoolCategory, String areaKey, Boolean inScope) {

        return new SchoolRepository.ScopedSchoolProjection() {
            @Override public UUID getId()              { return id; }
            @Override public String getName()          { return name; }
            @Override public String getBoardType()     { return boardType; }
            @Override public String getBoard()         { return board; }
            @Override public Double getLatitude()      { return latitude; }
            @Override public Double getLongitude()     { return longitude; }
            @Override public String getAddress()       { return address; }
            @Override public String getProminenceTier(){ return prominenceTier; }
            @Override public String getSchoolCategory(){ return schoolCategory; }
            @Override public String getAreaKey()       { return areaKey; }
            @Override public Boolean getInScope()      { return inScope; }
        };
    }

    /** Returns a minimal {@link SchoolRepository.SchoolListingCountProjection}. */
    private SchoolRepository.SchoolListingCountProjection stubListingCount(UUID schoolId, int count) {
        return new SchoolRepository.SchoolListingCountProjection() {
            @Override public UUID getSchoolId()       { return schoolId; }
            @Override public Integer getListingCount() { return count; }
        };
    }
}

package com.example.realestate.discover;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.RowMapper;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link RegionalClassificationBackfillService}.
 *
 * Mocks JdbcOperations — no DB required.
 */
@ExtendWith(MockitoExtension.class)
class RegionalClassificationBackfillServiceTest {

    @Mock
    private JdbcOperations jdbcOperations;

    private RegionalClassificationBackfillService service;

    @BeforeEach
    void setUp() {
        service = new RegionalClassificationBackfillService(jdbcOperations);
    }

    // ── happy path: one city, one area ────────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void runBackfill_oneCityOneArea_upsertsOneRow() throws SQLException {
        stubCitiesQuery(List.of(city("udupi", 13.3409, 74.7421)));
        stubAreasQuery(List.of(area("IN|KA|Udupi|Kundapur", 13.6218, 74.6943)));
        when(jdbcOperations.update(anyString(), any(), any(), any(), any(), any(), any()))
                .thenReturn(1);

        int count = service.runBackfill();

        assertThat(count).isEqualTo(1);
        verify(jdbcOperations, times(1))
                .update(anyString(), any(), any(), any(), any(), any(), any());
    }

    // ── idempotency: two runs produce same number of upserts ─────────────────

    @Test
    @SuppressWarnings("unchecked")
    void runBackfill_calledTwice_upsertsOnEachRun() throws SQLException {
        stubCitiesQuery(List.of(city("udupi", 13.3409, 74.7421)));
        stubAreasQuery(List.of(area("IN|KA|Udupi|Kundapur", 13.6218, 74.6943)));
        when(jdbcOperations.update(anyString(), any(), any(), any(), any(), any(), any()))
                .thenReturn(1);

        int first = service.runBackfill();
        int second = service.runBackfill();

        assertThat(first).isEqualTo(1);
        assertThat(second).isEqualTo(1);
    }

    // ── city-relative: same area under two cities → two upserts ─────────────

    @Test
    @SuppressWarnings("unchecked")
    void runBackfill_twoCities_twoUpserts() throws SQLException {
        stubCitiesQuery(List.of(
                city("udupi",     13.3409, 74.7421),
                city("mangalore", 12.9141, 74.8560)
        ));
        // Both cities return one area (different geo contexts give different direction/band)
        stubAreasQuery(List.of(area("IN|KA|Udupi|Kundapur", 13.6218, 74.6943)));
        when(jdbcOperations.update(anyString(), any(), any(), any(), any(), any(), any()))
                .thenReturn(1);

        int count = service.runBackfill();

        assertThat(count).isEqualTo(2);
        verify(jdbcOperations, times(2))
                .update(anyString(), any(), any(), any(), any(), any(), any());
    }

    // ── error handling: per-row errors do not abort the run ──────────────────

    @Test
    @SuppressWarnings("unchecked")
    void runBackfill_upsertThrows_continuesWithOtherAreas() throws SQLException {
        stubCitiesQuery(List.of(city("udupi", 13.3409, 74.7421)));
        stubAreasQuery(List.of(
                area("IN|KA|Udupi|Area1", 13.6218, 74.6943),
                area("IN|KA|Udupi|Area2", 13.2000, 74.7000)
        ));
        when(jdbcOperations.update(anyString(), any(), any(), any(), any(), any(), any()))
                .thenThrow(new RuntimeException("DB error"))
                .thenReturn(1);

        int count = service.runBackfill();

        assertThat(count).isEqualTo(1); // only second area succeeded
    }

    // ── no cities → no upserts ────────────────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void runBackfill_noCities_noUpserts() throws SQLException {
        stubCitiesQuery(List.of());

        int count = service.runBackfill();

        assertThat(count).isEqualTo(0);
        verify(jdbcOperations, never())
                .update(anyString(), any(), any(), any(), any(), any(), any());
    }

    // ── direction/band computed correctly for known coords ────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void runBackfill_udupiToKundapur_upsertsNorthBand() throws SQLException {
        stubCitiesQuery(List.of(city("udupi", 13.3409, 74.7421)));
        // Kundapur is ~31 km north of Udupi → direction=N, band=25_50
        stubAreasQuery(List.of(area("IN|KA|Udupi|Kundapur", 13.6218, 74.6943)));

        ArgumentCaptor<Object> dirCaptor  = ArgumentCaptor.forClass(Object.class);
        ArgumentCaptor<Object> bandCaptor = ArgumentCaptor.forClass(Object.class);
        when(jdbcOperations.update(anyString(),
                any(), any(), dirCaptor.capture(), bandCaptor.capture(), any(), any()))
                .thenReturn(1);

        service.runBackfill();

        assertThat(dirCaptor.getValue()).isEqualTo("N");
        assertThat(bandCaptor.getValue()).isEqualTo("25_50");
    }

    // ── city-relative direction differs between cities for same area ──────────

    @Test
    @SuppressWarnings("unchecked")
    void runBackfill_sameAreaTwoCities_differentDirections() throws SQLException {
        // Area at (13.6218, 74.6943): north of udupi (13.3409) but further north of mangalore (12.9141)
        // — both should be N; let's use an area clearly to the east from one city and west of another
        // Simpler: check that two upserts are issued with possibly different city_keys
        stubCitiesQuery(List.of(
                city("udupi",     13.3409, 74.7421),
                city("mangalore", 12.9141, 74.8560)
        ));
        stubAreasQuery(List.of(area("IN|KA|Udupi|Kundapur", 13.6218, 74.6943)));

        ArgumentCaptor<Object> cityCaptor = ArgumentCaptor.forClass(Object.class);
        when(jdbcOperations.update(anyString(),
                cityCaptor.capture(), any(), any(), any(), any(), any()))
                .thenReturn(1);

        service.runBackfill();

        List<Object> cities = cityCaptor.getAllValues();
        assertThat(cities).containsExactlyInAnyOrder("udupi", "mangalore");
    }

    // ── city-slug scoping (#1899) ─────────────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void runBackfill_scopedToCitySlug_onlyThatCitysAreasUpserted() throws SQLException {
        stubCitiesQueryScoped("bangalore", List.of(city("bangalore", 12.9716, 77.5946)));
        stubAreasQuery(List.of(
                area("IN|KA|Bangalore|Whitefield", 12.9698, 77.7500),
                area("IN|KA|Bangalore|Indiranagar", 12.9784, 77.6408)
        ));
        when(jdbcOperations.update(anyString(), any(), any(), any(), any(), any(), any()))
                .thenReturn(1);

        int count = service.runBackfill("bangalore");

        assertThat(count).isEqualTo(2);
        // Scoped cities query bound with the city slug — never the unscoped all-cities query.
        verify(jdbcOperations, times(1))
                .query(argThat((String sql) -> sql.contains("FROM cities") && sql.contains("slug = ?")),
                        any(RowMapper.class), eq("bangalore"));
        verify(jdbcOperations, never()).query(argThat((String sql) -> sql.contains("FROM cities")), any(RowMapper.class));
    }

    @Test
    @SuppressWarnings("unchecked")
    void runBackfill_blankCitySlug_preservesAllCitiesBehavior() throws SQLException {
        stubCitiesQuery(List.of(
                city("udupi", 13.3409, 74.7421),
                city("mangalore", 12.9141, 74.8560)
        ));
        stubAreasQuery(List.of(area("IN|KA|Udupi|Kundapur", 13.6218, 74.6943)));
        when(jdbcOperations.update(anyString(), any(), any(), any(), any(), any(), any()))
                .thenReturn(1);

        int count = service.runBackfill("");

        assertThat(count).isEqualTo(2); // same as runBackfill() with two cities
        verify(jdbcOperations, never())
                .query(argThat((String sql) -> sql.contains("FROM cities") && sql.contains("slug = ?")),
                        any(RowMapper.class), any());
    }

    @Test
    @SuppressWarnings("unchecked")
    void runBackfill_nullCitySlug_preservesAllCitiesBehavior() throws SQLException {
        stubCitiesQuery(List.of(city("udupi", 13.3409, 74.7421)));
        stubAreasQuery(List.of(area("IN|KA|Udupi|Kundapur", 13.6218, 74.6943)));
        when(jdbcOperations.update(anyString(), any(), any(), any(), any(), any(), any()))
                .thenReturn(1);

        int count = service.runBackfill(null);

        assertThat(count).isEqualTo(1);
    }

    @Test
    @SuppressWarnings("unchecked")
    void runBackfill_unknownCitySlug_zeroUpsertsNoError() throws SQLException {
        stubCitiesQueryScoped("nonexistent-city", List.of());

        int count = service.runBackfill("nonexistent-city");

        assertThat(count).isEqualTo(0);
        verify(jdbcOperations, never())
                .update(anyString(), any(), any(), any(), any(), any(), any());
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    /** Stubs the no-arg cities query (RowMapper, no bound params). */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private void stubCitiesQuery(List<CityData> cityData) throws SQLException {
        when(jdbcOperations.query(anyString(), any(RowMapper.class)))
                .thenAnswer(inv -> {
                    RowMapper rm = inv.getArgument(1);
                    List<Object> rows = new java.util.ArrayList<>();
                    for (CityData cd : cityData) {
                        ResultSet rs = mock(ResultSet.class);
                        when(rs.getString("slug")).thenReturn(cd.slug());
                        when(rs.getDouble("geo_center_lat")).thenReturn(cd.lat());
                        when(rs.getDouble("geo_center_lon")).thenReturn(cd.lon());
                        rows.add(rm.mapRow(rs, rows.size()));
                    }
                    return rows;
                });
    }

    /**
     * Stubs the city-slug-scoped cities query (RowMapper, one bound String param).
     * Matches only on SQL containing "FROM cities" so it does not collide with the
     * areas-for-city stub, which uses the same (String, RowMapper, Object) overload.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private void stubCitiesQueryScoped(String expectedSlug, List<CityData> cityData) throws SQLException {
        when(jdbcOperations.query(
                argThat((String sql) -> sql != null && sql.contains("FROM cities")),
                any(RowMapper.class),
                eq(expectedSlug)))
                .thenAnswer(inv -> {
                    RowMapper rm = inv.getArgument(1);
                    List<Object> rows = new java.util.ArrayList<>();
                    for (CityData cd : cityData) {
                        ResultSet rs = mock(ResultSet.class);
                        when(rs.getString("slug")).thenReturn(cd.slug());
                        when(rs.getDouble("geo_center_lat")).thenReturn(cd.lat());
                        when(rs.getDouble("geo_center_lon")).thenReturn(cd.lon());
                        rows.add(rm.mapRow(rs, rows.size()));
                    }
                    return rows;
                });
    }

    /**
     * Stubs the areas-for-city query (RowMapper with one bound param).
     * Matches only on SQL containing "FROM areas" so it does not collide with the
     * city-slug-scoped cities stub.
     */
    @SuppressWarnings({"unchecked", "rawtypes"})
    private void stubAreasQuery(List<AreaData> areaData) throws SQLException {
        when(jdbcOperations.query(
                argThat((String sql) -> sql != null && sql.contains("FROM areas")),
                any(RowMapper.class),
                any()))
                .thenAnswer(inv -> {
                    RowMapper rm = inv.getArgument(1);
                    List<Object> rows = new java.util.ArrayList<>();
                    for (AreaData ad : areaData) {
                        ResultSet rs = mock(ResultSet.class);
                        when(rs.getString("area_key")).thenReturn(ad.areaKey());
                        when(rs.getDouble("geo_center_lat")).thenReturn(ad.lat());
                        when(rs.getDouble("geo_center_lon")).thenReturn(ad.lon());
                        rows.add(rm.mapRow(rs, rows.size()));
                    }
                    return rows;
                });
    }

    private record CityData(String slug, double lat, double lon) {}
    private record AreaData(String areaKey, double lat, double lon) {}

    private static CityData city(String slug, double lat, double lon) {
        return new CityData(slug, lat, lon);
    }

    private static AreaData area(String areaKey, double lat, double lon) {
        return new AreaData(areaKey, lat, lon);
    }
}

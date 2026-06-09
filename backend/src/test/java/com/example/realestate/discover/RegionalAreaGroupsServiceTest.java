package com.example.realestate.discover;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.RowMapper;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link RegionalAreaGroupsService}.
 *
 * Verifies: live aggregation, empty-group omission, ordering, label composition,
 * acreage computation (PER-ROW-SKIP), city-relative grouping.
 */
@ExtendWith(MockitoExtension.class)
class RegionalAreaGroupsServiceTest {

    @Mock
    private JdbcOperations jdbcOperations;

    private RegionalAreaGroupsService service;

    @BeforeEach
    void setUp() {
        service = new RegionalAreaGroupsService(jdbcOperations);
    }

    // ── live aggregation parity — counts come from DB subquery ────────────────

    @Test
    @SuppressWarnings("unchecked")
    void getRegionalGroups_returnsGroupsWithLiveCounts() throws SQLException {
        stubGroupsQuery(List.of(
                groupRow("IN|KA|Udupi|Kundapur", "N", "North", 1, "25_50", "25–50 km", 2, 3L)
        ));
        stubAcreageQuery(List.of()); // no parseable acreage

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");

        assertThat(resp.city()).isEqualTo("udupi");
        assertThat(resp.groups()).hasSize(1);
        RegionalAreaGroup g = resp.groups().get(0);
        assertThat(g.listingCount()).isEqualTo(3L);
        assertThat(g.areaKeys()).containsExactly("IN|KA|Udupi|Kundapur");
    }

    // ── empty-group omission — groups with 0 listings excluded ───────────────

    @Test
    @SuppressWarnings("unchecked")
    void getRegionalGroups_zeroCountGroupsOmitted() throws SQLException {
        // The SQL already filters via WHERE COALESCE(listing_count,0) > 0,
        // but the service also has a belt-and-suspenders check.
        // Simulate: only non-zero rows returned from SQL.
        stubGroupsQuery(List.of(
                groupRow("IN|KA|Udupi|Area1", "N", "North", 1, "0_10", "Within 10 km", 1, 2L)
        ));
        stubAcreageQuery(List.of());

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");

        assertThat(resp.groups()).hasSize(1);
        assertThat(resp.groups().get(0).listingCount()).isGreaterThan(0);
    }

    // ── ordering: band sort_order then direction sort_order ───────────────────

    @Test
    @SuppressWarnings("unchecked")
    void getRegionalGroups_orderedByBandThenDirection() throws SQLException {
        // SQL returns in ORDER BY band sort_order, direction sort_order
        stubGroupsQuery(List.of(
                groupRow("IN|KA|Udupi|Area1", "N",  "North", 1, "0_10",  "Within 10 km", 1, 1L),
                groupRow("IN|KA|Udupi|Area2", "NE", "Northeast", 2, "0_10", "Within 10 km", 1, 1L),
                groupRow("IN|KA|Udupi|Area3", "N",  "North", 1, "10_25", "10–25 km", 2, 1L)
        ));
        stubAcreageQuery(List.of());

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");

        // Two groups: (0_10|N), (0_10|NE) — Area3 collapses into its own (10_25|N) group
        assertThat(resp.groups()).hasSize(3);
        assertThat(resp.groups().get(0).distanceBandKey()).isEqualTo("0_10");
        assertThat(resp.groups().get(0).directionKey()).isEqualTo("N");
        assertThat(resp.groups().get(1).distanceBandKey()).isEqualTo("0_10");
        assertThat(resp.groups().get(1).directionKey()).isEqualTo("NE");
        assertThat(resp.groups().get(2).distanceBandKey()).isEqualTo("10_25");
    }

    // ── label composition ─────────────────────────────────────────────────────

    @Test
    void composeLabel_udupiNorth25_50km_correctLabel() {
        String label = RegionalAreaGroupsService.composeLabel("North", "udupi", "25–50 km");
        assertThat(label).isEqualTo("North of Udupi · 25–50 km");
    }

    @Test
    void composeLabel_bangaloreEastWithin10km() {
        String label = RegionalAreaGroupsService.composeLabel("East", "bangalore", "Within 10 km");
        assertThat(label).isEqualTo("East of Bangalore · Within 10 km");
    }

    // ── acreage: null when no parseable rows (@JsonInclude NON_NULL) ──────────

    @Test
    @SuppressWarnings("unchecked")
    void getRegionalGroups_noParseableAcreage_acreageIsNull() throws SQLException {
        stubGroupsQuery(List.of(
                groupRow("IN|KA|Udupi|Area1", "N", "North", 1, "25_50", "25–50 km", 2, 2L)
        ));
        stubAcreageQuery(List.of()); // empty — no parseable rows

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");

        assertThat(resp.groups().get(0).agriAcreage()).isNull();
    }

    // ── acreage: sum of parseable rows per PER-ROW-SKIP ──────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void getRegionalGroups_parseableAcreage_summedCorrectly() throws SQLException {
        stubGroupsQuery(List.of(
                groupRow("IN|KA|Udupi|Area1", "N", "North", 1, "25_50", "25–50 km", 2, 2L)
        ));
        // Two listings: 1 acre + 2 acres = 3 acres total
        stubAcreageQuery(List.of(
                acreageRow("IN|KA|Udupi|Area1", new BigDecimal("4046.8564224"), "sqm"), // 1 acre in sqm
                acreageRow("IN|KA|Udupi|Area1", new BigDecimal("8093.7128448"), "sqm")  // 2 acres in sqm
        ));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");

        assertThat(resp.groups().get(0).agriAcreage()).isNotNull();
        assertThat(resp.groups().get(0).agriAcreage()).isGreaterThan(2.9);
    }

    // ── no classifications → empty groups ────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void getRegionalGroups_noClassifications_emptyGroups() throws SQLException {
        stubGroupsQuery(List.of());

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");

        assertThat(resp.groups()).isEmpty();
    }

    // ── city slug normalised to lowercase ─────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void getRegionalGroups_cityNormalisedToLowercase() throws SQLException {
        stubGroupsQuery(List.of());

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("UDUPI", "agricultural_land");

        assertThat(resp.city()).isEqualTo("udupi");
    }

    // ── multiple areas in same group are accumulated ──────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void getRegionalGroups_twoAreasInSameGroup_singleGroupWithBothKeys() throws SQLException {
        stubGroupsQuery(List.of(
                groupRow("IN|KA|Udupi|Area1", "N", "North", 1, "25_50", "25–50 km", 2, 1L),
                groupRow("IN|KA|Udupi|Area2", "N", "North", 1, "25_50", "25–50 km", 2, 2L)
        ));
        stubAcreageQuery(List.of());

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");

        assertThat(resp.groups()).hasSize(1);
        RegionalAreaGroup g = resp.groups().get(0);
        assertThat(g.listingCount()).isEqualTo(3L); // 1 + 2
        assertThat(g.areaKeys()).containsExactly("IN|KA|Udupi|Area1", "IN|KA|Udupi|Area2");
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private record GroupRowData(
            String areaKey, String dirKey, String dirLabel, int dirSort,
            String bandKey, String bandLabel, int bandSort, long listingCount) {}

    private record AcreageRowData(String areaKey, BigDecimal landArea, String unit) {}

    private static GroupRowData groupRow(String areaKey, String dirKey, String dirLabel, int dirSort,
                                          String bandKey, String bandLabel, int bandSort, long count) {
        return new GroupRowData(areaKey, dirKey, dirLabel, dirSort, bandKey, bandLabel, bandSort, count);
    }

    private static AcreageRowData acreageRow(String areaKey, BigDecimal landArea, String unit) {
        return new AcreageRowData(areaKey, landArea, unit);
    }

    @SuppressWarnings({"unchecked", "rawtypes"})
    private void stubGroupsQuery(List<GroupRowData> rows) throws SQLException {
        when(jdbcOperations.query(anyString(), any(RowMapper.class), any(), any()))
                .thenAnswer(inv -> {
                    RowMapper rm = inv.getArgument(1);
                    List<Object> result = new java.util.ArrayList<>();
                    for (GroupRowData r : rows) {
                        ResultSet rs = mock(ResultSet.class);
                        when(rs.getString("area_key")).thenReturn(r.areaKey());
                        when(rs.getString("direction_key")).thenReturn(r.dirKey());
                        when(rs.getString("direction_label")).thenReturn(r.dirLabel());
                        when(rs.getInt("direction_sort_order")).thenReturn(r.dirSort());
                        when(rs.getString("band_key")).thenReturn(r.bandKey());
                        when(rs.getString("band_label")).thenReturn(r.bandLabel());
                        when(rs.getInt("band_sort_order")).thenReturn(r.bandSort());
                        when(rs.getLong("listing_count")).thenReturn(r.listingCount());
                        result.add(rm.mapRow(rs, result.size()));
                    }
                    return result;
                });
    }

    @SuppressWarnings({"unchecked"})
    private void stubAcreageQuery(List<AcreageRowData> rows) throws SQLException {
        // JdbcOperations.query(String, RowCallbackHandler, Object...) returns void —
        // must use doAnswer, not when(...).thenAnswer.
        doAnswer(inv -> {
            RowCallbackHandler rch = inv.getArgument(1);
            for (AcreageRowData r : rows) {
                ResultSet rs = mock(ResultSet.class);
                when(rs.getString("area_key")).thenReturn(r.areaKey());
                when(rs.getBigDecimal("land_area")).thenReturn(r.landArea());
                when(rs.getString("land_area_unit")).thenReturn(r.unit());
                rch.processRow(rs);
            }
            return null;
        }).when(jdbcOperations).query(anyString(), any(RowCallbackHandler.class), any(), any());
    }
}

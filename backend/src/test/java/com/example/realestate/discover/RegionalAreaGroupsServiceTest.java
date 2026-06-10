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
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link RegionalAreaGroupsService} — corridor-first cumulative shape.
 *
 * <p>Verifies: corridor shape, cumulative tier building, monotonic invariant,
 * empty-tier suppression, group-name fallback, acreage computation, city normalisation,
 * canonical '50_up' band code.
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

    // ── Corridor-first shape ──────────────────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void getRegionalGroups_returnsCorridorShape() throws SQLException {
        // One direction (N), one band (0_10), 3 live listings
        stubGroupsQuery(List.of(
                groupRow("IN|KA|Udupi|Brahmavar", "N", 1, "0_10", 3L)
        ));
        stubAcreageQuery(List.of());
        stubLabelsQuery(List.of(labelRow("N", "N towards Brahmavar", 1)));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");

        assertThat(resp.city()).isEqualTo("udupi");
        assertThat(resp.groups()).hasSize(1);
        CorridorGroup g = resp.groups().get(0);
        assertThat(g.directionCode()).isEqualTo("N");
        assertThat(g.groupName()).isEqualTo("N towards Brahmavar");
        assertThat(g.availableMaxDistances()).isNotEmpty();
        AvailableMaxDistance firstTier = g.availableMaxDistances().get(0);
        assertThat(firstTier.maxKm()).isEqualTo(10);
        assertThat(firstTier.listingCount()).isEqualTo(3L);
    }

    // ── Cumulative mapping: 0_10 + 10_25 → tiers for maxKm=10 and maxKm=25 ──

    @Test
    @SuppressWarnings("unchecked")
    void getRegionalGroups_cumulativeTiers_twoDataBands_producesExpectedTiers() throws SQLException {
        stubGroupsQuery(List.of(
                groupRow("IN|KA|Udupi|Area1", "N", 1, "0_10",  2L),
                groupRow("IN|KA|Udupi|Area2", "N", 1, "10_25", 3L)
        ));
        stubAcreageQuery(List.of());
        stubLabelsQuery(List.of(labelRow("N", "N towards Brahmavar", 1)));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");

        CorridorGroup g = resp.groups().get(0);
        // Must have maxKm=10 tier (only 0_10 data) and maxKm=25 tier (0_10 + 10_25)
        assertThat(g.availableMaxDistances()).hasSizeGreaterThanOrEqualTo(2);
        AvailableMaxDistance tier10 = tierWithMaxKm(g, 10);
        AvailableMaxDistance tier25 = tierWithMaxKm(g, 25);
        assertThat(tier10).isNotNull();
        assertThat(tier25).isNotNull();
        assertThat(tier10.listingCount()).isEqualTo(2L);
        assertThat(tier25.listingCount()).isEqualTo(5L); // 2 + 3
    }

    // ── Monotonic invariant: listingCount(maxKm=25) >= listingCount(maxKm=10) ─

    @Test
    @SuppressWarnings("unchecked")
    void getRegionalGroups_cumulativeCounts_areMonotonic() throws SQLException {
        stubGroupsQuery(List.of(
                groupRow("IN|KA|Udupi|Area1", "N", 1, "0_10",  4L),
                groupRow("IN|KA|Udupi|Area2", "N", 1, "10_25", 2L),
                groupRow("IN|KA|Udupi|Area3", "N", 1, "25_50", 1L)
        ));
        stubAcreageQuery(List.of());
        stubLabelsQuery(List.of(labelRow("N", "N corridor", 1)));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");
        CorridorGroup g = resp.groups().get(0);

        long count10  = tierWithMaxKm(g, 10).listingCount();
        long count25  = tierWithMaxKm(g, 25).listingCount();
        long count50  = tierWithMaxKm(g, 50).listingCount();
        assertThat(count25).isGreaterThanOrEqualTo(count10);
        assertThat(count50).isGreaterThanOrEqualTo(count25);
    }

    // ── Empty-tier suppression: maxKm=50 absent when no data in 0_10+10_25+25_50 ─

    @Test
    @SuppressWarnings("unchecked")
    void getRegionalGroups_emptyTiersSuppressed() throws SQLException {
        // Only 50_up has data — tiers 10/25/50 should be absent (cumulative includes nothing
        // until we reach the tier that includes 50_up, which is maxKm=100)
        stubGroupsQuery(List.of(
                groupRow("IN|KA|Udupi|Area1", "N", 1, "50_up", 5L)
        ));
        stubAcreageQuery(List.of());
        stubLabelsQuery(List.of(labelRow("N", "N corridor", 1)));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");
        CorridorGroup g = resp.groups().get(0);

        // Only the maxKm=100 tier should exist (it includes 50_up)
        assertThat(g.availableMaxDistances()).hasSize(1);
        assertThat(g.availableMaxDistances().get(0).maxKm()).isEqualTo(100);
        // Tiers 10/25/50 must be absent
        assertThat(tierWithMaxKm(g, 10)).isNull();
        assertThat(tierWithMaxKm(g, 25)).isNull();
        assertThat(tierWithMaxKm(g, 50)).isNull();
    }

    // ── NAMED REQUIRED TEST: groupName fallback to "<dir> corridor" ─────────

    @Test
    @SuppressWarnings("unchecked")
    void getRegionalGroups_groupNameFallsBackToDirectionCorridorWhenNoLabelRowExists()
            throws SQLException {
        // Setup: no row in city_regional_direction_labels for (testCity, "SW");
        //        one live listing classified as SW
        stubGroupsQuery(List.of(
                groupRow("IN|KA|Udupi|Area1", "SW", 6, "0_10", 1L)
        ));
        stubAcreageQuery(List.of());
        // Labels query returns empty (no SW row for this city)
        stubLabelsQuery(List.of());

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");

        assertThat(resp.groups()).hasSize(1);
        CorridorGroup g = resp.groups().get(0);
        assertThat(g.directionCode()).isEqualTo("SW");
        assertThat(g.groupName()).isEqualTo("SW corridor");
    }

    // ── Canonical '50_up' in includedBandCodes ────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void getRegionalGroups_canonicalBandCode_50up_inMaxKm100Tier() throws SQLException {
        stubGroupsQuery(List.of(
                groupRow("IN|KA|Udupi|Area1", "N", 1, "0_10",  1L),
                groupRow("IN|KA|Udupi|Area2", "N", 1, "50_up", 2L)
        ));
        stubAcreageQuery(List.of());
        stubLabelsQuery(List.of(labelRow("N", "N corridor", 1)));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");
        CorridorGroup g = resp.groups().get(0);
        AvailableMaxDistance tier100 = tierWithMaxKm(g, 100);
        assertThat(tier100).isNotNull();
        assertThat(tier100.includedBandCodes()).contains("50_up");
        assertThat(tier100.includedBandCodes()).doesNotContain("50_PLUS");
    }

    // ── No classifications → empty groups ─────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void getRegionalGroups_noClassifications_emptyGroups() throws SQLException {
        stubGroupsQuery(List.of());

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");

        assertThat(resp.groups()).isEmpty();
    }

    // ── City slug normalised to lowercase ─────────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void getRegionalGroups_cityNormalisedToLowercase() throws SQLException {
        stubGroupsQuery(List.of());

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("UDUPI", "agricultural_land");

        assertThat(resp.city()).isEqualTo("udupi");
    }

    // ── Multiple areas in same direction-band are accumulated ─────────────────

    @Test
    @SuppressWarnings("unchecked")
    void getRegionalGroups_twoAreasInSameDirectionBand_accumulatedInTier() throws SQLException {
        stubGroupsQuery(List.of(
                groupRow("IN|KA|Udupi|Area1", "N", 1, "0_10", 1L),
                groupRow("IN|KA|Udupi|Area2", "N", 1, "0_10", 2L)
        ));
        stubAcreageQuery(List.of());
        stubLabelsQuery(List.of(labelRow("N", "N corridor", 1)));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");

        assertThat(resp.groups()).hasSize(1);
        CorridorGroup g = resp.groups().get(0);
        AvailableMaxDistance tier10 = tierWithMaxKm(g, 10);
        assertThat(tier10).isNotNull();
        assertThat(tier10.listingCount()).isEqualTo(3L); // 1 + 2
        assertThat(tier10.areaKeys()).containsExactlyInAnyOrder(
                "IN|KA|Udupi|Area1", "IN|KA|Udupi|Area2");
    }

    // ── Two directions produce two CorridorGroups ─────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void getRegionalGroups_twoDirections_twoCorridorGroups() throws SQLException {
        stubGroupsQuery(List.of(
                groupRow("IN|KA|Udupi|Area1", "N",  1, "0_10", 2L),
                groupRow("IN|KA|Udupi|Area2", "NE", 2, "0_10", 1L)
        ));
        stubAcreageQuery(List.of());
        stubLabelsQuery(List.of(
                labelRow("N",  "N towards Brahmavar", 1),
                labelRow("NE", "NE towards Hiriadka", 2)
        ));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");

        assertThat(resp.groups()).hasSize(2);
        assertThat(resp.groups().get(0).directionCode()).isEqualTo("N");
        assertThat(resp.groups().get(1).directionCode()).isEqualTo("NE");
    }

    // ── Acreage: null when no parseable rows ──────────────────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void getRegionalGroups_noParseableAcreage_acreageIsNullInTier() throws SQLException {
        stubGroupsQuery(List.of(
                groupRow("IN|KA|Udupi|Area1", "N", 1, "0_10", 2L)
        ));
        stubAcreageQuery(List.of()); // no parseable acreage
        stubLabelsQuery(List.of(labelRow("N", "N corridor", 1)));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");
        AvailableMaxDistance tier10 = tierWithMaxKm(resp.groups().get(0), 10);
        assertThat(tier10).isNotNull();
        assertThat(tier10.agriAcreage()).isNull();
    }

    // ── Acreage: sum of parseable rows per PER-ROW-SKIP ──────────────────────

    @Test
    @SuppressWarnings("unchecked")
    void getRegionalGroups_parseableAcreage_summedInTier() throws SQLException {
        stubGroupsQuery(List.of(
                groupRow("IN|KA|Udupi|Area1", "N", 1, "0_10", 2L)
        ));
        // 1 acre + 2 acres = 3 acres total
        stubAcreageQuery(List.of(
                acreageRow("IN|KA|Udupi|Area1", new BigDecimal("4046.8564224"), "sqm"),
                acreageRow("IN|KA|Udupi|Area1", new BigDecimal("8093.7128448"), "sqm")
        ));
        stubLabelsQuery(List.of(labelRow("N", "N corridor", 1)));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");
        AvailableMaxDistance tier10 = tierWithMaxKm(resp.groups().get(0), 10);
        assertThat(tier10).isNotNull();
        assertThat(tier10.agriAcreage()).isNotNull();
        assertThat(tier10.agriAcreage()).isGreaterThan(2.9);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private static AvailableMaxDistance tierWithMaxKm(CorridorGroup g, int maxKm) {
        return g.availableMaxDistances().stream()
                .filter(t -> t.maxKm() == maxKm)
                .findFirst()
                .orElse(null);
    }

    private record GroupRowData(
            String areaKey, String dirKey, int dirSort,
            String bandKey, long listingCount) {}

    private record LabelRowData(String directionCode, String groupName, int sortOrder) {}

    private record AcreageRowData(String areaKey, BigDecimal landArea, String unit) {}

    private static GroupRowData groupRow(String areaKey, String dirKey, int dirSort,
                                         String bandKey, long count) {
        return new GroupRowData(areaKey, dirKey, dirSort, bandKey, count);
    }

    private static LabelRowData labelRow(String directionCode, String groupName, int sortOrder) {
        return new LabelRowData(directionCode, groupName, sortOrder);
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
                        when(rs.getInt("direction_sort_order")).thenReturn(r.dirSort());
                        when(rs.getString("band_key")).thenReturn(r.bandKey());
                        when(rs.getLong("listing_count")).thenReturn(r.listingCount());
                        result.add(rm.mapRow(rs, result.size()));
                    }
                    return result;
                });
    }

    @SuppressWarnings("unchecked")
    private void stubAcreageQuery(List<AcreageRowData> rows) throws SQLException {
        // AGRI_AREA_LAND_SQL contains "land_area" — pin by SQL content to avoid
        // varargs ambiguity with stubLabelsQuery.
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
        }).when(jdbcOperations).query(
                argThat(sql -> sql != null && sql.contains("land_area")),
                any(RowCallbackHandler.class), any(), any());
    }

    @SuppressWarnings("unchecked")
    private void stubLabelsQuery(List<LabelRowData> rows) throws SQLException {
        // LABELS_SQL contains "city_regional_direction_labels" — pin by SQL content.
        doAnswer(inv -> {
            RowCallbackHandler rch = inv.getArgument(1);
            for (LabelRowData r : rows) {
                ResultSet rs = mock(ResultSet.class);
                when(rs.getString("direction_code")).thenReturn(r.directionCode());
                when(rs.getString("group_name")).thenReturn(r.groupName());
                when(rs.getInt("sort_order")).thenReturn(r.sortOrder());
                rch.processRow(rs);
            }
            return null;
        }).when(jdbcOperations).query(
                argThat(sql -> sql != null && sql.contains("city_regional_direction_labels")),
                any(RowCallbackHandler.class), any());
    }
}

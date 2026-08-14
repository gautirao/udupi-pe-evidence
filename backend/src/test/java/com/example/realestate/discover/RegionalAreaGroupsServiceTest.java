package com.example.realestate.discover;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowCallbackHandler;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Unit tests for {@link RegionalAreaGroupsService} — corridor-first cumulative shape.
 *
 * <p>#2151 PR B: the service is now a COMPOSER over {@link AgriDestinationPort}. Tests mock the
 * port (returning {@link AgriDestinationPort.DestinationBucket} rows carrying precomputed
 * {@code distanceKm}/{@code direction}/{@code parcelCount}/{@code parcelAcreage}) instead of
 * mocking classification-table JDBC rows directly. {@code city_regional_direction_labels} is
 * still read via {@code JdbcOperations} directly (unaffected by the cutover) and is stubbed the
 * same way as before.
 *
 * <p>Distance-tier membership is now {@code distanceKm <= maxKm} (#2151 OQ5 fix) rather than band
 * membership — bucket {@code distanceKm} values below are chosen to land in the same tiers the old
 * band-keyed fixtures did: 0_10→5km, 10_25→15km, 25_50→30km, 50_up→60km (which now correctly lands
 * ONLY in the maxKm=100 tier, not an unbounded catch-all).
 */
@ExtendWith(MockitoExtension.class)
class RegionalAreaGroupsServiceTest {

    @Mock
    private JdbcOperations jdbcOperations;

    @Mock
    private CityActivationGuard cityActivationGuard;

    @Mock
    private AgriDestinationPort agriDestinationPort;

    private RegionalAreaGroupsService service;

    @BeforeEach
    void setUp() {
        when(cityActivationGuard.isActiveCitySlug(anyString())).thenReturn(true);
        service = new RegionalAreaGroupsService(jdbcOperations, cityActivationGuard, agriDestinationPort);
    }

    // ── Corridor-first shape ──────────────────────────────────────────────────

    @Test
    void getRegionalGroups_returnsCorridorShape() throws SQLException {
        stubDestinations(List.of(
                bucket("IN|KA|Udupi|Brahmavar", "N", 5.0, 3L, null)
        ));
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

    // ── Cumulative mapping: 5km + 15km → tiers for maxKm=10 and maxKm=25 ──────

    @Test
    void getRegionalGroups_cumulativeTiers_twoBuckets_producesExpectedTiers() throws SQLException {
        stubDestinations(List.of(
                bucket("IN|KA|Udupi|Area1", "N", 5.0,  2L, null),
                bucket("IN|KA|Udupi|Area2", "N", 15.0, 3L, null)
        ));
        stubLabelsQuery(List.of(labelRow("N", "N towards Brahmavar", 1)));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");

        CorridorGroup g = resp.groups().get(0);
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
    void getRegionalGroups_cumulativeCounts_areMonotonic() throws SQLException {
        stubDestinations(List.of(
                bucket("IN|KA|Udupi|Area1", "N", 5.0,  4L, null),
                bucket("IN|KA|Udupi|Area2", "N", 15.0, 2L, null),
                bucket("IN|KA|Udupi|Area3", "N", 30.0, 1L, null)
        ));
        stubLabelsQuery(List.of(labelRow("N", "N corridor", 1)));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");
        CorridorGroup g = resp.groups().get(0);

        long count10  = tierWithMaxKm(g, 10).listingCount();
        long count25  = tierWithMaxKm(g, 25).listingCount();
        long count50  = tierWithMaxKm(g, 50).listingCount();
        assertThat(count25).isGreaterThanOrEqualTo(count10);
        assertThat(count50).isGreaterThanOrEqualTo(count25);
    }

    // ── Empty-tier suppression + OQ5 fix: 60km lands ONLY in the maxKm=100 tier ─

    @Test
    void getRegionalGroups_emptyTiersSuppressed() throws SQLException {
        stubDestinations(List.of(
                bucket("IN|KA|Udupi|Area1", "N", 60.0, 5L, null)
        ));
        stubLabelsQuery(List.of(labelRow("N", "N corridor", 1)));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");
        CorridorGroup g = resp.groups().get(0);

        assertThat(g.availableMaxDistances()).hasSize(1);
        assertThat(g.availableMaxDistances().get(0).maxKm()).isEqualTo(100);
        assertThat(tierWithMaxKm(g, 10)).isNull();
        assertThat(tierWithMaxKm(g, 25)).isNull();
        assertThat(tierWithMaxKm(g, 50)).isNull();
    }

    // ── #2151 OQ5: a destination beyond 100km is excluded from EVERY tier ─────

    @Test
    void getRegionalGroups_beyond100km_excludedFromEveryTier() throws SQLException {
        stubDestinations(List.of(
                bucket("IN|KA|Udupi|FarAway", "N", 400.0, 5L, null)
        ));
        stubLabelsQuery(List.of(labelRow("N", "N corridor", 1)));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");

        // No tier includes it anywhere → the whole direction has no tiers → corridor suppressed
        assertThat(resp.groups()).isEmpty();
    }

    // ── #2151 Task 3: exact-boundary inclusion — distanceKm == maxKm is INCLUDED (<=, not <) ────

    @Test
    void getRegionalGroups_exactlyAtTierBoundary_included() throws SQLException {
        // 10.0km is EXACTLY the maxKm=10 tier boundary — must be included in that tier (and every
        // wider cumulative tier), proving the composer's comparison is `distanceKm <= maxKm`.
        stubDestinations(List.of(
                bucket("IN|KA|Udupi|AtBoundary", "N", 10.0, 1L, null)
        ));
        stubLabelsQuery(List.of(labelRow("N", "N corridor", 1)));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");
        CorridorGroup g = resp.groups().get(0);

        assertThat(tierWithMaxKm(g, 10))
                .as("distanceKm == maxKm=10 must be INCLUDED in the maxKm=10 tier").isNotNull();
        assertThat(tierWithMaxKm(g, 10).listingCount()).isEqualTo(1L);
    }

    // ── #2151 Task 3: epsilon-beyond-boundary exclusion ───────────────────────────────────────────

    @Test
    void getRegionalGroups_epsilonBeyondTierBoundary_excludedFromThatTierOnly() throws SQLException {
        // 10.00001km is JUST beyond the maxKm=10 boundary — must be excluded from the maxKm=10 tier
        // but still included in the maxKm=25 tier (cumulative), proving strict "<=" semantics rather
        // than a rounded/fuzzy comparison.
        stubDestinations(List.of(
                bucket("IN|KA|Udupi|JustBeyond", "N", 10.00001, 1L, null)
        ));
        stubLabelsQuery(List.of(labelRow("N", "N corridor", 1)));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");
        CorridorGroup g = resp.groups().get(0);

        assertThat(tierWithMaxKm(g, 10))
                .as("distanceKm=10.00001 must be EXCLUDED from the maxKm=10 tier").isNull();
        assertThat(tierWithMaxKm(g, 25))
                .as("but still included in the wider cumulative maxKm=25 tier").isNotNull();
        assertThat(tierWithMaxKm(g, 25).listingCount()).isEqualTo(1L);
    }

    // ── #2151 OQ5 intended fix: exactly 100km included in maxKm=100 tier, 100.00001km excluded ────

    @Test
    void getRegionalGroups_exactly100km_includedInOuterTier_epsilonBeyondExcludedEntirely() throws SQLException {
        stubDestinations(List.of(
                bucket("IN|KA|Udupi|Exactly100", "N", 100.0, 1L, null)
        ));
        stubLabelsQuery(List.of(labelRow("N", "N corridor", 1)));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");
        CorridorGroup g = resp.groups().get(0);
        assertThat(tierWithMaxKm(g, 100))
                .as("distanceKm == maxKm=100 must be INCLUDED — the OQ5 fix is strict <=, not <")
                .isNotNull();
        assertThat(tierWithMaxKm(g, 100).listingCount()).isEqualTo(1L);
    }

    // ── groupName fallback to "<dir> corridor" ────────────────────────────────

    @Test
    void getRegionalGroups_groupNameFallsBackToDirectionCorridorWhenNoLabelRowExists() throws SQLException {
        stubDestinations(List.of(
                bucket("IN|KA|Udupi|Area1", "SW", 5.0, 1L, null)
        ));
        stubLabelsQuery(List.of());

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");

        assertThat(resp.groups()).hasSize(1);
        CorridorGroup g = resp.groups().get(0);
        assertThat(g.directionCode()).isEqualTo("SW");
        assertThat(g.groupName()).isEqualTo("SW corridor");
    }

    // ── Canonical '50_up' legacy band code still present in maxKm=100 tier ────

    @Test
    void getRegionalGroups_canonicalBandCode_50up_inMaxKm100Tier() throws SQLException {
        stubDestinations(List.of(
                bucket("IN|KA|Udupi|Area1", "N", 5.0,  1L, null),
                bucket("IN|KA|Udupi|Area2", "N", 60.0, 2L, null)
        ));
        stubLabelsQuery(List.of(labelRow("N", "N corridor", 1)));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");
        CorridorGroup g = resp.groups().get(0);
        AvailableMaxDistance tier100 = tierWithMaxKm(g, 100);
        assertThat(tier100).isNotNull();
        assertThat(tier100.includedBandCodes()).contains("50_up");
    }

    // ── No destinations in scope → empty groups ───────────────────────────────

    @Test
    void getRegionalGroups_noDestinations_emptyGroups() {
        when(agriDestinationPort.findDestinations(any())).thenReturn(
                new AgriDestinationPort.DestinationScope("udupi", List.of()));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");

        assertThat(resp.groups()).isEmpty();
    }

    // ── City slug normalised to lowercase ─────────────────────────────────────

    @Test
    void getRegionalGroups_cityNormalisedToLowercase() {
        when(agriDestinationPort.findDestinations(any())).thenReturn(
                new AgriDestinationPort.DestinationScope("udupi", List.of()));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("UDUPI", "agricultural_land");

        assertThat(resp.city()).isEqualTo("udupi");
    }

    // ── Inactive/unknown city short-circuits BEFORE calling the port ─────────

    @Test
    void getRegionalGroups_inactiveCity_shortCircuitsBeforePortCall() {
        when(cityActivationGuard.isActiveCitySlug("ghost")).thenReturn(false);

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("ghost", "agricultural_land");

        assertThat(resp.groups()).isEmpty();
        org.mockito.Mockito.verifyNoInteractions(agriDestinationPort);
    }

    // ── Multiple areas in same direction/tier are accumulated ─────────────────

    @Test
    void getRegionalGroups_twoAreasInSameDirectionTier_accumulated() throws SQLException {
        stubDestinations(List.of(
                bucket("IN|KA|Udupi|Area1", "N", 5.0, 1L, null),
                bucket("IN|KA|Udupi|Area2", "N", 6.0, 2L, null)
        ));
        stubLabelsQuery(List.of(labelRow("N", "N corridor", 1)));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");

        CorridorGroup g = resp.groups().get(0);
        AvailableMaxDistance tier10 = tierWithMaxKm(g, 10);
        assertThat(tier10).isNotNull();
        assertThat(tier10.listingCount()).isEqualTo(3L); // 1 + 2
        assertThat(tier10.areaKeys()).containsExactlyInAnyOrder(
                "IN|KA|Udupi|Area1", "IN|KA|Udupi|Area2");
    }

    // ── Two directions produce two CorridorGroups ─────────────────────────────

    @Test
    void getRegionalGroups_twoDirections_twoCorridorGroups() throws SQLException {
        stubDestinations(List.of(
                bucket("IN|KA|Udupi|Area1", "N",  5.0, 2L, null),
                bucket("IN|KA|Udupi|Area2", "NE", 6.0, 1L, null)
        ));
        stubLabelsQuery(List.of(
                labelRow("N",  "N towards Brahmavar", 1),
                labelRow("NE", "NE towards Hiriadka", 2)
        ));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");

        assertThat(resp.groups()).hasSize(2);
        assertThat(resp.groups().get(0).directionCode()).isEqualTo("N");
        assertThat(resp.groups().get(1).directionCode()).isEqualTo("NE");
    }

    // ── Acreage: null when no parseable acreage from the port ────────────────

    @Test
    void getRegionalGroups_noParseableAcreage_acreageIsNullInTier() throws SQLException {
        stubDestinations(List.of(
                bucket("IN|KA|Udupi|Area1", "N", 5.0, 2L, null)
        ));
        stubLabelsQuery(List.of(labelRow("N", "N corridor", 1)));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");
        AvailableMaxDistance tier10 = tierWithMaxKm(resp.groups().get(0), 10);
        assertThat(tier10).isNotNull();
        assertThat(tier10.agriAcreage()).isNull();
    }

    // ── Acreage: summed across buckets in the tier ────────────────────────────

    @Test
    void getRegionalGroups_parseableAcreage_summedInTier() throws SQLException {
        stubDestinations(List.of(
                bucket("IN|KA|Udupi|Area1", "N", 5.0, 2L, 1.0),
                bucket("IN|KA|Udupi|Area2", "N", 6.0, 1L, 2.0)
        ));
        stubLabelsQuery(List.of(labelRow("N", "N corridor", 1)));

        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "agricultural_land");
        AvailableMaxDistance tier10 = tierWithMaxKm(resp.groups().get(0), 10);
        assertThat(tier10).isNotNull();
        assertThat(tier10.agriAcreage()).isNotNull();
        assertThat(tier10.agriAcreage()).isGreaterThan(2.9);
    }

    // ── Non-agricultural propertyType → empty response, port never called ────

    @Test
    void getRegionalGroups_nonAgriPropertyType_returnsEmptyWithoutCallingPort() {
        RegionalAreaGroupsResponse resp = service.getRegionalGroups("udupi", "residential");

        assertThat(resp.groups()).isEmpty();
        org.mockito.Mockito.verifyNoInteractions(agriDestinationPort);
    }

    // ── listingPurpose forwarded to the port's filters (#2151 AC7 ruling) ────

    @Test
    void getRegionalGroups_listingPurposeForwardedToPort() {
        when(agriDestinationPort.findDestinations(any())).thenReturn(
                new AgriDestinationPort.DestinationScope("udupi", List.of()));

        service.getRegionalGroups("udupi", "agricultural_land", "rent");

        org.mockito.ArgumentCaptor<AgriDestinationPort.DestinationScopeQuery> captor =
                org.mockito.ArgumentCaptor.forClass(AgriDestinationPort.DestinationScopeQuery.class);
        org.mockito.Mockito.verify(agriDestinationPort).findDestinations(captor.capture());
        assertThat(captor.getValue().filters().listingPurpose()).isEqualTo("rent");
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private static AvailableMaxDistance tierWithMaxKm(CorridorGroup g, int maxKm) {
        return g.availableMaxDistances().stream()
                .filter(t -> t.maxKm() == maxKm)
                .findFirst()
                .orElse(null);
    }

    private record LabelRowData(String directionCode, String groupName, int sortOrder) {}

    private static AgriDestinationPort.DestinationBucket bucket(
            String areaKey, String direction, double distanceKm, long parcelCount, Double acreage) {
        return new AgriDestinationPort.DestinationBucket(
                areaKey, areaKey, distanceKm, 0.0, direction, parcelCount, acreage);
    }

    private static LabelRowData labelRow(String directionCode, String groupName, int sortOrder) {
        return new LabelRowData(directionCode, groupName, sortOrder);
    }

    private void stubDestinations(List<AgriDestinationPort.DestinationBucket> buckets) {
        when(agriDestinationPort.findDestinations(any())).thenReturn(
                new AgriDestinationPort.DestinationScope("udupi", buckets));
    }

    @SuppressWarnings("unchecked")
    private void stubLabelsQuery(List<LabelRowData> rows) throws SQLException {
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

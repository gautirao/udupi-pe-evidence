package com.example.realestate.discover;

import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit tests for {@link DiscoverMarkersService} metadata correctness (AC-B3, AC-B4)
 * and bbox AND-composition with all filter types (AC-B5).
 *
 * <p>Uses Mockito only — no Spring context required. All tests exercise the real
 * {@link DiscoverListingPredicateBuilder} (pure static, no mocks needed) so the
 * WHERE-fragment assertions reflect actual production SQL.
 *
 * <h2>AND-composition strategy</h2>
 * <p>The WHERE fragment is assembled by {@link DiscoverListingPredicateBuilder#build}.
 * This test captures the SQL string passed to {@code JdbcOperations.query} (the main
 * SELECT) and verifies that every requested filter clause appears as a substring — i.e.
 * they are joined by AND (conjunction), not OR (disjunction). The fragments are well-
 * known from {@link DiscoverListingPredicateBuilderTest}; this layer confirms they
 * survive through the service layer to the actual JDBC call.
 */
@ExtendWith(MockitoExtension.class)
class DiscoverMarkersServiceMetadataTest {

    @Mock
    private JdbcOperations jdbc;

    private SimpleMeterRegistry registry;
    private DiscoverMarkersService service;

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** Returns MINIMAL_FILTERS with only city set (no spatial / keyword filters). */
    private static DiscoverListingPredicateBuilder.Filters minimalFilters() {
        return new DiscoverListingPredicateBuilder.Filters(
                "udupi",
                null, null, null, null, null, null, null,
                null, null, null, null, null,
                null, null, null,
                null, null, null, null, null
        , null);
    }

    /** Creates a list of N distinct DiscoverMarker stubs. */
    private static List<DiscoverMarker> markers(int count) {
        List<DiscoverMarker> list = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            list.add(new DiscoverMarker("id-" + i, 13.3 + i * 0.001, 74.7 + i * 0.001, null, "Locality", null, null, null));
        }
        return list;
    }

    @BeforeEach
    void setUp() {
        registry = new SimpleMeterRegistry();
        service = new DiscoverMarkersService(jdbc, registry);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // AC-B3 / AC-B4 — Metadata field correctness
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Non-truncated path: returnedElements == markers.size(), totalFilteredElements ==
     * returnedElements, limit == 1000, boundsApplied == false, no COUNT query issued.
     */
    @Test
    void nonTruncatedPath_metadataCorrect_noCountQuery() {
        // Arrange: 3 markers returned (well below CAP=1000)
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(markers(3));

        // Act
        DiscoverMarkersResponse response = service.getMarkers(minimalFilters());

        // Assert metadata
        assertThat(response.truncated()).isFalse();
        assertThat(response.returnedElements()).isEqualTo(3);
        assertThat(response.totalFilteredElements()).isEqualTo(3L);
        assertThat(response.limit()).isEqualTo(1000);
        assertThat(response.boundsApplied()).isFalse();

        // No COUNT query must have been issued
        verify(jdbc, never()).queryForObject(anyString(), eq(Long.class), any(Object[].class));
    }

    /**
     * Empty result: returnedElements == 0, totalFilteredElements == 0, truncated == false.
     */
    @Test
    void emptyResult_metadataCorrect() {
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        DiscoverMarkersResponse response = service.getMarkers(minimalFilters());

        assertThat(response.truncated()).isFalse();
        assertThat(response.returnedElements()).isEqualTo(0);
        assertThat(response.totalFilteredElements()).isEqualTo(0L);
        assertThat(response.markers()).isEmpty();
        verify(jdbc, never()).queryForObject(anyString(), eq(Long.class), any(Object[].class));
    }

    /**
     * Truncated path (FETCH_LIMIT = 1001 rows returned by JDBC):
     * truncated == true, returnedElements == 1000 (capped), totalFilteredElements comes
     * from COUNT(*) query, boundsApplied == false (no bbox on this call), limit == 1000.
     */
    @Test
    void truncatedPath_countQueryIssued_metadataCorrect() {
        // Arrange: service fetches FETCH_LIMIT (1001) rows → triggers truncation
        List<DiscoverMarker> fetchLimitRows = markers(1001);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(fetchLimitRows);
        // COUNT returns 2500 (simulates a dense city)
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(Object[].class)))
                .thenReturn(2500L);

        // Act
        DiscoverMarkersResponse response = service.getMarkers(minimalFilters());

        // Assert
        assertThat(response.truncated()).isTrue();
        assertThat(response.returnedElements()).isEqualTo(1000);        // capped to CAP
        assertThat(response.markers()).hasSize(1000);
        assertThat(response.totalFilteredElements()).isEqualTo(2500L);  // from COUNT
        assertThat(response.limit()).isEqualTo(1000);
        assertThat(response.boundsApplied()).isFalse();

        // COUNT must have been issued exactly once
        verify(jdbc, times(1)).queryForObject(anyString(), eq(Long.class), any(Object[].class));
    }

    /**
     * Truncated path: the COUNT query must use the SAME WHERE fragment AND the SAME params
     * array as the main SELECT, ensuring the count is viewport-scoped (Option A) and reuses
     * the existing geog GiST index predicates.
     *
     * <p>Params equality is asserted via an {@link ArgumentCaptor} on both call sites so
     * that a future regression (e.g. empty params or a second {@code .toArray()} on a
     * different list) is caught, not just the SQL string.
     */
    @Test
    void truncatedPath_countSqlReusesWhereFragmentAndParams() {
        // Use a bbox filter so the params list is non-trivial (city slug + 4 bbox doubles).
        DiscoverListingPredicateBuilder.Bbox bbox =
                new DiscoverListingPredicateBuilder.Bbox(13.3, 74.7, 13.4, 74.8);
        DiscoverListingPredicateBuilder.Filters filtersWithBbox =
                new DiscoverListingPredicateBuilder.Filters(
                        "udupi",
                        null, null, null, null, null, null, null,
                        null, null, null, null, null,
                        null, null, null,
                        bbox, null, null, null, null
                , null);

        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(markers(1001));
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(Object[].class)))
                .thenReturn(1500L);

        ArgumentCaptor<String>   selectSqlCaptor    = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object[]> selectParamsCaptor = ArgumentCaptor.forClass(Object[].class);
        ArgumentCaptor<String>   countSqlCaptor     = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object[]> countParamsCaptor  = ArgumentCaptor.forClass(Object[].class);

        service.getMarkers(filtersWithBbox);

        verify(jdbc).query(selectSqlCaptor.capture(), any(RowMapper.class), selectParamsCaptor.capture());
        verify(jdbc).queryForObject(countSqlCaptor.capture(), eq(Long.class), countParamsCaptor.capture());

        // COUNT SQL must be the SELECT WHERE fragment prefixed with COUNT(*)
        String selectSql = selectSqlCaptor.getValue();
        String countSql  = countSqlCaptor.getValue();
        assertThat(countSql)
                .startsWith("SELECT COUNT(*) FROM property_listings pl WHERE ")
                .contains("pl.status = 'LIVE'")
                .contains("pl.archived_at IS NULL")
                .contains("pl.area_key IN (SELECT a.area_key")
                .contains("pl.geog && ST_MakeEnvelope(?, ?, ?, ?, 4326)::geography");

        // The WHERE fragment in the COUNT must equal the one embedded in the SELECT
        String selectWhere = selectSql.substring(selectSql.indexOf(" WHERE ") + 7,
                selectSql.indexOf(" ORDER BY "));
        String countWhere  = countSql.substring(countSql.indexOf(" WHERE ") + 7);
        assertThat(countWhere).isEqualTo(selectWhere);

        // The params arrays passed to both calls must be identical (same array instance
        // or identical content), so a divergent-params regression is caught immediately.
        assertThat(countParamsCaptor.getValue())
                .containsExactly(selectParamsCaptor.getValue());
    }

    // ══════════════════════════════════════════════════════════════════════════
    // boundsApplied correctness
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * boundsApplied == true when a valid, non-null Bbox is present in filters.
     */
    @Test
    void boundsApplied_trueWhenBboxPresent() {
        DiscoverListingPredicateBuilder.Bbox bbox =
                new DiscoverListingPredicateBuilder.Bbox(13.3, 74.7, 13.4, 74.8);
        DiscoverListingPredicateBuilder.Filters filtersWithBbox =
                new DiscoverListingPredicateBuilder.Filters(
                        "udupi",
                        null, null, null, null, null, null, null,
                        null, null, null, null, null,
                        null, null, null,
                        bbox, null, null, null, null
                , null);

        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(markers(1));

        DiscoverMarkersResponse response = service.getMarkers(filtersWithBbox);

        assertThat(response.boundsApplied()).isTrue();
    }

    /**
     * boundsApplied == false when bbox is null (absent or rejected by BboxParser).
     */
    @Test
    void boundsApplied_falseWhenBboxAbsent() {
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(markers(1));

        DiscoverMarkersResponse response = service.getMarkers(minimalFilters());

        assertThat(response.boundsApplied()).isFalse();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // AC-B5 — bbox composes as AND (intersection) with all existing filter types
    //
    // Strategy: capture the SQL string passed to jdbc.query() and assert that
    // BOTH the bbox predicate AND the other filter predicate appear in the
    // WHERE fragment. Since DiscoverListingPredicateBuilder assembles all clauses
    // as " AND <clause>", their simultaneous presence proves AND-composition.
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * No-bbox baseline: WHERE fragment must NOT contain the envelope predicate.
     */
    @Test
    void filterComposition_noBbox_noEnvelopeClause() {
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        service.getMarkers(minimalFilters());

        verify(jdbc).query(sqlCaptor.capture(), any(RowMapper.class), any(Object[].class));
        assertThat(sqlCaptor.getValue()).doesNotContain("ST_MakeEnvelope");
    }

    /**
     * bbox-only (no other spatial filter): WHERE fragment contains the envelope predicate
     * and the base city predicate — both present as an AND conjunction.
     */
    @Test
    void filterComposition_bboxOnly_containsEnvelopeAndBasePredicates() {
        DiscoverListingPredicateBuilder.Bbox bbox =
                new DiscoverListingPredicateBuilder.Bbox(13.3, 74.7, 13.4, 74.8);
        DiscoverListingPredicateBuilder.Filters f =
                new DiscoverListingPredicateBuilder.Filters(
                        "udupi",
                        null, null, null, null, null, null, null,
                        null, null, null, null, null,
                        null, null, null,
                        bbox, null, null, null, null
                , null);

        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        service.getMarkers(f);

        verify(jdbc).query(sqlCaptor.capture(), any(RowMapper.class), any(Object[].class));
        String sql = sqlCaptor.getValue();

        // Both base and bbox predicates must be present (AND-composition)
        assertThat(sql)
                .contains("pl.status = 'LIVE'")                                 // base
                .contains("pl.area_key IN (SELECT a.area_key")                  // city
                .contains("pl.geog && ST_MakeEnvelope(?, ?, ?, ?, 4326)::geography"); // bbox
        // Must NOT contain school-radius or FTS predicates
        assertThat(sql)
                .doesNotContain("ST_DWithin")
                .doesNotContain("search_vector");
    }

    /**
     * bbox + school-radius: WHERE fragment must contain BOTH ST_MakeEnvelope (bbox) AND
     * ST_DWithin (school radius) as AND-combined predicates — intersection, not union.
     */
    @Test
    void filterComposition_bboxAndSchoolRadius_bothPredicatesPresent() {
        DiscoverListingPredicateBuilder.Bbox bbox =
                new DiscoverListingPredicateBuilder.Bbox(13.3, 74.7, 13.4, 74.8);
        DiscoverListingPredicateBuilder.Filters f =
                new DiscoverListingPredicateBuilder.Filters(
                        "udupi",
                        null, null, null, null, null, null, null,
                        null, null, null, null, null,
                        13.35, 74.75, 2.0,  // schoolLat, schoolLon, schoolRadiusKm
                        bbox, null, null, null, null
                , null);

        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        service.getMarkers(f);

        verify(jdbc).query(sqlCaptor.capture(), any(RowMapper.class), any(Object[].class));
        String sql = sqlCaptor.getValue();

        // Both geospatial predicates must appear — AND-composition (intersection)
        assertThat(sql)
                .contains("pl.geog && ST_MakeEnvelope(?, ?, ?, ?, 4326)::geography")
                .contains("ST_DWithin(pl.geog, ST_MakePoint(?, ?)::geography, ?)");

        // Verify it is a conjunction: neither OR nor UNION appears
        assertThat(sql.toUpperCase())
                .doesNotContain(" OR ")
                .doesNotContain("UNION");
    }

    /**
     * bbox + keyword q: WHERE fragment must contain BOTH the bbox envelope predicate AND
     * the FTS search_vector predicate as AND-combined clauses.
     */
    @Test
    void filterComposition_bboxAndQ_bothPredicatesPresent() {
        DiscoverListingPredicateBuilder.Bbox bbox =
                new DiscoverListingPredicateBuilder.Bbox(13.3, 74.7, 13.4, 74.8);
        DiscoverListingPredicateBuilder.Filters f =
                new DiscoverListingPredicateBuilder.Filters(
                        "udupi",
                        null, null, null, null, null, null, null,
                        null, null, null, null, null,
                        null, null, null,
                        bbox, "villa", null, null, null
                , null);

        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        service.getMarkers(f);

        verify(jdbc).query(sqlCaptor.capture(), any(RowMapper.class), any(Object[].class));
        String sql = sqlCaptor.getValue();

        // bbox AND q both present as AND-combined clauses
        assertThat(sql)
                .contains("pl.geog && ST_MakeEnvelope(?, ?, ?, ?, 4326)::geography")
                .contains("pl.search_vector @@ websearch_to_tsquery('english', ?)");

        // bbox must appear BEFORE the FTS clause in the WHERE fragment
        int bboxPos = sql.indexOf("ST_MakeEnvelope");
        int ftsPos  = sql.indexOf("search_vector");
        assertThat(bboxPos).isLessThan(ftsPos);
    }

    /**
     * bbox + property filters (propertyTypes + priceMin): WHERE fragment must contain
     * the bbox envelope predicate AND both property filter clauses as AND-combined.
     */
    @Test
    void filterComposition_bboxAndPropertyFilters_bothPredicatesPresent() {
        DiscoverListingPredicateBuilder.Bbox bbox =
                new DiscoverListingPredicateBuilder.Bbox(13.3, 74.7, 13.4, 74.8);
        DiscoverListingPredicateBuilder.Filters f =
                new DiscoverListingPredicateBuilder.Filters(
                        "udupi",
                        List.of("apartment"),   // propertyTypes
                        5_000_000L,             // priceMinPaise
                        null, null, null, null, null,
                        null, null, null, null, null,
                        null, null, null,
                        bbox, null, null, null, null
                , null);

        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        service.getMarkers(f);

        verify(jdbc).query(sqlCaptor.capture(), any(RowMapper.class), any(Object[].class));
        String sql = sqlCaptor.getValue();

        // All three filters must be AND-combined in the WHERE fragment
        assertThat(sql)
                .contains("pl.property_type IN (?)")
                .contains("pl.price_paise >= ?")
                .contains("pl.geog && ST_MakeEnvelope(?, ?, ?, ?, 4326)::geography");

        // Verify no OR/UNION — pure AND conjunction
        assertThat(sql.toUpperCase())
                .doesNotContain(" OR ")
                .doesNotContain("UNION");
    }

    /**
     * Truncated path with bbox: boundsApplied == true, COUNT query also uses the same
     * WHERE fragment (including bbox envelope predicate) — confirming viewport-scoped
     * totalFilteredElements on the truncated path.
     */
    @Test
    void truncatedPath_withBbox_countSqlIncludesBboxPredicate() {
        DiscoverListingPredicateBuilder.Bbox bbox =
                new DiscoverListingPredicateBuilder.Bbox(13.3, 74.7, 13.4, 74.8);
        DiscoverListingPredicateBuilder.Filters f =
                new DiscoverListingPredicateBuilder.Filters(
                        "udupi",
                        null, null, null, null, null, null, null,
                        null, null, null, null, null,
                        null, null, null,
                        bbox, null, null, null, null
                , null);

        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class)))
                .thenReturn(markers(1001)); // triggers truncation
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(Object[].class)))
                .thenReturn(3000L);

        ArgumentCaptor<String> countSqlCaptor = ArgumentCaptor.forClass(String.class);
        DiscoverMarkersResponse response = service.getMarkers(f);

        verify(jdbc).queryForObject(countSqlCaptor.capture(), eq(Long.class), any(Object[].class));
        String countSql = countSqlCaptor.getValue();

        // COUNT must be viewport-scoped: bbox predicate must be in the COUNT query
        assertThat(countSql).contains("pl.geog && ST_MakeEnvelope(?, ?, ?, ?, 4326)::geography");
        // metadata must reflect truncated state + boundsApplied
        assertThat(response.truncated()).isTrue();
        assertThat(response.boundsApplied()).isTrue();
        assertThat(response.totalFilteredElements()).isEqualTo(3000L);
    }
}

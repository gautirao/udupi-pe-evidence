package com.example.realestate.discover;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

/**
 * Unit test for {@link NearbyAreaCandidatesService}'s assembled CTE SQL (#2017).
 *
 * <p>The SQL is built by string-splicing three optional fragments (the selected-area IN clause,
 * {@link DiscoverListingPredicateBuilder}'s filter WHERE fragment, and the exclusion clause) plus
 * a hand-aligned positional {@code Object[] args} list. Nothing in production enforces that the
 * '?' count in the final SQL matches {@code args.length} — a mismatch here would surface only at
 * JDBC execution time (or worse, as a silently mis-bound query if two adjacent params share a
 * type). This test asserts the two counts agree directly, for a representative mix of both the
 * "has selection" and "no selection" branches and a non-trivial filter.
 */
class NearbyAreaCandidatesServiceSqlTest {

    private static final DiscoverListingPredicateBuilder.Filters MINIMAL_FILTERS =
            new DiscoverListingPredicateBuilder.Filters(
                    "udupi", null, null, null, null, null, null, null, null, null,
                    null, null, null, null, null, null, null, null, null, null, null, null);

    private static final DiscoverListingPredicateBuilder.Filters RICH_FILTERS =
            new DiscoverListingPredicateBuilder.Filters(
                    "udupi",
                    List.of("house", "apartment"),
                    5_000_000L,
                    20_000_000L,
                    "2026-01-01",
                    "2026-06-01",
                    List.of(2, 3),
                    List.of("owner", "agent"),
                    true,
                    false,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    "manipal",
                    "sale",
                    null,
                    null,
                    null);

    @Test
    @DisplayName("placeholder count matches arg-list size: no selected areas, minimal filters")
    void placeholderCount_matchesArgCount_noSelection_minimalFilters() {
        assertPlaceholderCountMatchesArgs(List.of(), null, MINIMAL_FILTERS);
    }

    @Test
    @DisplayName("placeholder count matches arg-list size: selected areas present, rich filters")
    void placeholderCount_matchesArgCount_withSelection_richFilters() {
        assertPlaceholderCountMatchesArgs(
                List.of("IN|KA|Udupi|Manipal", "IN|KA|Udupi|Malpe"), 8, RICH_FILTERS);
    }

    @Test
    @DisplayName("placeholder count matches arg-list size: single selected area, minimal filters")
    void placeholderCount_matchesArgCount_singleSelection_minimalFilters() {
        assertPlaceholderCountMatchesArgs(List.of("IN|KA|Udupi|Manipal"), 4, MINIMAL_FILTERS);
    }

    @SuppressWarnings("unchecked")
    private void assertPlaceholderCountMatchesArgs(
            List<String> selected, Integer limit, DiscoverListingPredicateBuilder.Filters filters) {
        JdbcOperations jdbcOperations = mock(JdbcOperations.class);
        NearbyAreaCandidatesService service = new NearbyAreaCandidatesService(jdbcOperations);

        service.findCandidates("udupi", selected, limit, filters);

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object[]> argsCaptor = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcOperations).query(sqlCaptor.capture(), any(RowMapper.class), argsCaptor.capture());

        String sql = sqlCaptor.getValue();
        Object[] args = argsCaptor.getValue();

        long placeholderCount = sql.chars().filter(c -> c == '?').count();

        assertThat(placeholderCount)
                .as("every '?' in the assembled SQL must have exactly one positional bind value: "
                        + "sql=[%s] args=%s", sql, List.of(args))
                .isEqualTo(args.length);
    }
}

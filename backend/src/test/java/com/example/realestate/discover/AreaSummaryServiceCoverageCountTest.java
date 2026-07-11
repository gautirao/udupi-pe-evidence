package com.example.realestate.discover;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;

import java.lang.reflect.Field;
import java.sql.ResultSet;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Unit test for the #1828 PR1 change to {@link AreaSummaryService}'s school-count derivation.
 *
 * <p>Nothing in production enforced that {@code AREAS_BY_CITY_SQL} and
 * {@code AREAS_BY_CITY_TYPE_FILTERED_SQL} share the same school-count subquery text — the two
 * constants were hand-maintained byte-identical copies. Editing one and not the other (or
 * inlining a divergent copy instead of reusing the shared constant) is the single most likely
 * error in this PR, so this test asserts identity directly against the compiled class's own
 * SQL text via reflection rather than trusting the source layout.
 *
 * <p>Also guards R3 (the CRITICAL bind-param-shift risk): the shared subquery must contain
 * ZERO {@code '?'} placeholders, because a stray one would sit textually before the existing
 * {@code '?'}s and silently shift {@code typeFilter}/{@code city} into the wrong JDBC bind
 * slots (all values are {@code String}, so the driver would raise nothing).
 */
class AreaSummaryServiceCoverageCountTest {

    private static String readPrivateStaticString(String fieldName) throws Exception {
        Field field = AreaSummaryService.class.getDeclaredField(fieldName);
        field.setAccessible(true);
        return (String) field.get(null);
    }

    @Test
    @DisplayName("SCHOOL_COUNT_SUBQUERY appears byte-identically inside both AREAS_BY_CITY_SQL and AREAS_BY_CITY_TYPE_FILTERED_SQL")
    void schoolCountSubquery_isByteIdentical_inBothSqlConstants() throws Exception {
        String subquery = readPrivateStaticString("SCHOOL_COUNT_SUBQUERY");
        String blended = readPrivateStaticString("AREAS_BY_CITY_SQL");
        String filtered = readPrivateStaticString("AREAS_BY_CITY_TYPE_FILTERED_SQL");

        assertThat(blended)
                .as("AREAS_BY_CITY_SQL must contain the shared school-count subquery verbatim")
                .contains(subquery);
        assertThat(filtered)
                .as("AREAS_BY_CITY_TYPE_FILTERED_SQL must contain the shared school-count subquery verbatim")
                .contains(subquery);
    }

    @Test
    @DisplayName("R3 guard: the school-count subquery contains ZERO bind parameters")
    void schoolCountSubquery_hasZeroBindParameters() throws Exception {
        String subquery = readPrivateStaticString("SCHOOL_COUNT_SUBQUERY");

        assertThat(subquery)
                .as("a bound '?' here would shift every downstream JDBC arg silently (R3)")
                .doesNotContain("?");
    }

    @Test
    @DisplayName("R5 guard: the count uses the POSITIVE relationship_type IN-list, never a negative '<> nearby' form")
    void schoolCountSubquery_usesPositiveInList_notNegativeExclusion() throws Exception {
        String subquery = readPrivateStaticString("SCHOOL_COUNT_SUBQUERY");

        assertThat(subquery)
                .as("must use a positive IN-list so a future new relationship_type is excluded by default")
                .contains("IN ('contained','primary','reviewed_override')")
                .doesNotContain("<>")
                .doesNotContain("!=");
    }

    @Test
    @DisplayName("the subquery shape is a correlated scalar COUNT(*), not a LEFT JOIN + GROUP BY")
    void schoolCountSubquery_isCorrelatedScalarCount_notLeftJoin() throws Exception {
        String subquery = readPrivateStaticString("SCHOOL_COUNT_SUBQUERY");

        // COUNT(*) over an (possibly empty) correlated subquery always yields 0, never NULL —
        // this is what lets AreaSummary.schoolCount (a primitive long) be populated safely
        // without a NULL-vs-0 hazard, by construction rather than a COALESCE patch.
        assertThat(subquery).contains("SELECT COUNT(*)");
        assertThat(subquery).doesNotContain("GROUP BY");
        assertThat(subquery).doesNotContain("LEFT JOIN");
    }

    @Test
    @DisplayName("blended path: Object[] args stays [city] — unchanged by the coverage-count edit")
    void blendedPath_argsUnchanged_singleCityArg() {
        JdbcOperations jdbcOperations = mock(JdbcOperations.class);
        AreaSummaryService service = new AreaSummaryService(jdbcOperations);

        service.getAreasByCity("udupi");

        ArgumentCaptor<Object[]> argsCaptor = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcOperations).query(anyString(), any(RowMapper.class), argsCaptor.capture());
        assertThat(argsCaptor.getValue()).containsExactly("udupi");
    }

    @Test
    @DisplayName("filtered path: Object[] args stays [type, city] — unchanged by the coverage-count edit")
    void filteredPath_argsUnchanged_typeThenCity() {
        JdbcOperations jdbcOperations = mock(JdbcOperations.class);
        AreaSummaryService service = new AreaSummaryService(jdbcOperations);

        service.getAreasByCity("bangalore", "agricultural_land");

        ArgumentCaptor<Object[]> argsCaptor = ArgumentCaptor.forClass(Object[].class);
        verify(jdbcOperations).query(anyString(), any(RowMapper.class), argsCaptor.capture());
        assertThat(argsCaptor.getValue()).containsExactly("agricultural_land", "bangalore");
    }

    @Test
    @DisplayName("an area with zero schools yields 0, not null, via the RowMapper's rs.getLong(\"school_count\")")
    void zeroSchoolArea_yieldsPrimitiveZero_notNull() throws Exception {
        JdbcOperations jdbcOperations = mock(JdbcOperations.class);
        AreaSummaryService service = new AreaSummaryService(jdbcOperations);

        ResultSet rs = mock(ResultSet.class);
        when(rs.getString("area_key")).thenReturn("IN|KA|Udupi|Empty");
        when(rs.getString("name")).thenReturn("Empty Area");
        when(rs.getDouble("geo_center_lat")).thenReturn(13.0);
        when(rs.getDouble("geo_center_lon")).thenReturn(74.0);
        when(rs.getObject("min_lat")).thenReturn(null);
        when(rs.getObject("min_lon")).thenReturn(null);
        when(rs.getObject("max_lat")).thenReturn(null);
        when(rs.getObject("max_lon")).thenReturn(null);
        when(rs.getLong("listing_count")).thenReturn(0L);
        when(rs.getObject("median_price_paise")).thenReturn(null);
        when(rs.getString("trend_direction")).thenReturn(null);
        when(rs.getString("confidence_tier")).thenReturn(null);
        when(rs.getLong("school_count")).thenReturn(0L);

        // Invoke the production query(...) call, capturing the RowMapper so we can drive it
        // against a mocked zero-school-count ResultSet row exactly as the JDBC driver would.
        service.getAreasByCity("udupi");
        ArgumentCaptor<RowMapper<AreaSummary>> mapperCaptor = ArgumentCaptor.forClass(RowMapper.class);
        verify(jdbcOperations).query(anyString(), mapperCaptor.capture(), any(Object[].class));

        AreaSummary summary = mapperCaptor.getValue().mapRow(rs, 0);

        assertThat(summary.schoolCount())
                .as("zero-school area must yield primitive 0, never null/NPE")
                .isZero();
    }
}

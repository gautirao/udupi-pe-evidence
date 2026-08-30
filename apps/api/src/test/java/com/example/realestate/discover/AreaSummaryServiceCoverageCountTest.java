package com.example.realestate.discover;

import com.example.realestate.school.SchoolRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowMapper;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.sql.ResultSet;
import java.util.List;

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
    @DisplayName("#1829 drift guard: the counted relationship-type list is IDENTICAL between "
            + "AreaSummaryService's badge count and SchoolRepository's by-area/popular list query")
    void countedRelationshipTypes_matchBetweenBadgeCountAndListRepository() throws Exception {
        String subquery = readPrivateStaticString("SCHOOL_COUNT_SUBQUERY");

        Field repositoryField = SchoolRepository.class.getDeclaredField("COUNTED_RELATIONSHIP_TYPES_SQL");
        repositoryField.setAccessible(true);
        String repositoryList = (String) repositoryField.get(null);

        // Neither copy may use the negative "<> 'nearby'" / "!= 'nearby'" form. A negative form
        // is default-ALLOW: a future new relationship_type would silently start being counted
        // toward the badge (or listed) AND would stop matching idx_school_coverage_counted's
        // positive partial-index predicate (V110), causing a silent seq-scan-or-wrong-count split
        // instead of the deliberate, reviewed positive allow-list.
        assertThat(subquery)
                .as("AreaSummaryService.SCHOOL_COUNT_SUBQUERY must never use the negative exclusion form")
                .doesNotContain("<> 'nearby'")
                .doesNotContain("!= 'nearby'");
        assertThat(repositoryList)
                .as("SchoolRepository.COUNTED_RELATIONSHIP_TYPES_SQL must never use the negative exclusion form")
                .doesNotContain("<> 'nearby'")
                .doesNotContain("!= 'nearby'");

        // The badge (SCHOOL_COUNT_SUBQUERY) and the by-area/popular LIST queries
        // (SchoolRepository.COUNTED_RELATIONSHIP_TYPES_SQL, used by findByAreaKey and
        // findPopularByAreaKey) are two hand-maintained copies of the SAME predicate — nothing in
        // production enforces they stay aligned beyond a comment-documented convention. If they
        // ever drift, the badge and the list silently disagree again: the precise defect #1829
        // fixed. Asserting the repository's parenthesized list appears verbatim, immediately
        // after "IN ", inside the service's subquery proves both the relationship-type SET and
        // its POSITIVE-IN-LIST form are identical between the two call sites.
        assertThat(subquery)
                .as("AreaSummaryService's badge-count subquery must contain SchoolRepository's "
                        + "COUNTED_RELATIONSHIP_TYPES_SQL verbatim as its IN-list -- if these ever drift, "
                        + "the area badge and the by-area/popular school lists will silently disagree again")
                .contains("IN " + repositoryList);

        // The above only proves the CONSTANT is consistent with itself. It says nothing about
        // whether findByAreaKey/findPopularByAreaKey's SHIPPED @Query SQL actually USES that
        // constant -- someone could inline a literal relationship-type list into either @Query
        // (e.g. dropping 'reviewed_override') while leaving COUNTED_RELATIONSHIP_TYPES_SQL
        // untouched, and every assertion above would stay green while the badge and the list
        // silently diverge again (the precise defect #1829 fixed). So reflect the actual
        // shipped @Query annotation VALUES here too -- the annotation value is a compile-time
        // constant, so reflection sees SchoolRepository's fully concatenated SQL, not a copy.
        Method findByAreaKey = SchoolRepository.class.getMethod(
                "findByAreaKey", String.class, List.class, List.class, int.class, int.class);
        String findByAreaKeySql = findByAreaKey.getAnnotation(Query.class).value();
        assertThat(findByAreaKeySql)
                .as("SchoolRepository#findByAreaKey's SHIPPED @Query SQL must actually use "
                        + "COUNTED_RELATIONSHIP_TYPES_SQL as its IN-list, not an inlined literal copy "
                        + "that could silently drift from it")
                .contains("IN " + repositoryList);

        Method findPopularByAreaKey = SchoolRepository.class.getMethod(
                "findPopularByAreaKey", String.class, int.class);
        String findPopularByAreaKeySql = findPopularByAreaKey.getAnnotation(Query.class).value();
        assertThat(findPopularByAreaKeySql)
                .as("SchoolRepository#findPopularByAreaKey's SHIPPED @Query SQL must actually use "
                        + "COUNTED_RELATIONSHIP_TYPES_SQL as its IN-list, not an inlined literal copy "
                        + "that could silently drift from it")
                .contains("IN " + repositoryList);
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

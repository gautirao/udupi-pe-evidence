package com.example.realestate.discover.navigation;

import com.example.realestate.discover.AreaSummaryService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pins {@link PostgresAreaSchoolCountProvider}'s counted-relationship IN-list as CHARACTER-IDENTICAL
 * to {@link AreaSummaryService}'s existing school-count subquery (#1956 PR1 product ruling — see
 * {@link PostgresAreaSchoolCountProvider}'s class javadoc), mirroring the existing {@code
 * AreaSummaryServiceCoverageCountTest} reflection pattern rather than trusting the source layout.
 *
 * <p><b>Precisely what this class proves — and what it does NOT.</b> It proves that the two surfaces
 * draw from the SAME counted-relationship SET, so a future vocabulary change (a new
 * {@code relationship_type}, or dropping one) cannot start counting a school on one surface and not
 * the other, and cannot silently stop matching V110's {@code idx_school_coverage_counted} partial
 * index, which is defined on this exact predicate text. That property is UNCHANGED by the #1956 PR1
 * per-area counting fix — the counted-relationship set was never what was wrong.
 *
 * <p>It does NOT prove the two counts are equal. An IN-list identity assertion structurally cannot
 * see the aggregation shape, which is where the real behaviour lives — and where the defect lived:
 * this test passed unchanged while {@code DISTINCT ON (school_id)} was globally partitioning each
 * school to one area and making other areas report {@code 0}. Per-area equality with the badge is
 * now true, but it is established by
 * {@code NavigationCountsFilterAndSchoolCountIT#schoolCount_perArea_equalsAreaSummaryBadge_evenForMultiAreaSchools}
 * (against a real database, including a check that V110's {@code PRIMARY KEY (school_id,
 * curated_area_key)} rejects a duplicate pair) — never by anything asserted here.
 */
class PostgresAreaSchoolCountProviderSqlIdentityTest {

    private static String readPrivateStaticString(Class<?> clazz, String fieldName) throws Exception {
        Field field = clazz.getDeclaredField(fieldName);
        field.setAccessible(true);
        return (String) field.get(null);
    }

    @Test
    @DisplayName("PostgresAreaSchoolCountProvider's counted-relationship IN-list is byte-identical to "
            + "AreaSummaryService's SCHOOL_COUNT_SUBQUERY IN-list")
    void countedRelationshipTypesSql_isByteIdentical_toAreaSummaryServiceSubquery() throws Exception {
        String providerList = readPrivateStaticString(
                PostgresAreaSchoolCountProvider.class, "COUNTED_RELATIONSHIP_TYPES_SQL");
        String areaSummarySubquery = readPrivateStaticString(AreaSummaryService.class, "SCHOOL_COUNT_SUBQUERY");

        assertThat(areaSummarySubquery)
                .as("AreaSummaryService.SCHOOL_COUNT_SUBQUERY must contain PostgresAreaSchoolCountProvider's "
                        + "IN-list verbatim as its IN-list -- if these ever drift, the navigation school-count "
                        + "badge and the AreaSummary school-count badge will silently disagree for the same area")
                .contains("IN " + providerList);
    }

    @Test
    @DisplayName("R3-equivalent guard: the counted-relationship IN-list contains ZERO bind parameters")
    void countedRelationshipTypesSql_hasZeroBindParameters() throws Exception {
        String providerList = readPrivateStaticString(
                PostgresAreaSchoolCountProvider.class, "COUNTED_RELATIONSHIP_TYPES_SQL");

        assertThat(providerList)
                .as("a bound '?' here would shift the citySlug bind parameter silently")
                .doesNotContain("?");
    }

    @Test
    @DisplayName("uses the POSITIVE relationship_type IN-list, never a negative '<> nearby' form")
    void countedRelationshipTypesSql_usesPositiveInList_notNegativeExclusion() throws Exception {
        String providerList = readPrivateStaticString(
                PostgresAreaSchoolCountProvider.class, "COUNTED_RELATIONSHIP_TYPES_SQL");

        assertThat(providerList)
                .contains("'contained'", "'primary'", "'reviewed_override'")
                .doesNotContain("<>")
                .doesNotContain("!=");
    }

    /**
     * DELIBERATE RULE CHANGE — this previously asserted the shipped SQL {@code contains("DISTINCT ON
     * (c.school_id)")}, i.e. it pinned the global per-school partition that made an area report
     * {@code 0} for a school it genuinely contains. The constant was also renamed
     * ({@code SCHOOL_COUNT_BY_AREA_SQL} -> {@code SCHOOL_COVERAGE_BY_AREA_SQL}) because it no longer
     * returns counts; it returns the {@code (area_key, school_id)} pairs the counts are derived from.
     * The shared-constant check itself is unchanged and still load-bearing.
     */
    @Test
    @DisplayName("the shipped SCHOOL_COVERAGE_BY_AREA_SQL uses COUNTED_RELATIONSHIP_TYPES_SQL rather "
            + "than an inlined literal copy, and no longer partitions schools across areas")
    void schoolCoverageSql_usesTheSharedConstant_andDoesNotPartitionSchoolsGlobally() throws Exception {
        String providerList = readPrivateStaticString(
                PostgresAreaSchoolCountProvider.class, "COUNTED_RELATIONSHIP_TYPES_SQL");
        String sql = readPrivateStaticString(
                PostgresAreaSchoolCountProvider.class, "SCHOOL_COVERAGE_BY_AREA_SQL");

        assertThat(sql).contains("IN " + providerList);
        assertThat(sql)
                .as("DISTINCT ON (school_id) globally attributes each school to ONE area, which is "
                        + "exactly the defect this fix removed -- it must not come back")
                .doesNotContain("DISTINCT ON");
        assertThat(sql)
                .as("the query returns the (area_key, school_id) pairs; per-area counts and union "
                        + "roll-ups are both derived from them in AreaSchoolCoverage")
                .contains("c.curated_area_key")
                .contains("c.school_id");
    }
}

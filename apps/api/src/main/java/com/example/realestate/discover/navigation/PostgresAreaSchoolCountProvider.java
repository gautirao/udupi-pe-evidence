package com.example.realestate.discover.navigation;

import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Whole-city school coverage provider for the navigation counts endpoint (#1956 PR1, Decision 1) —
 * a SEPARATE concrete bean, deliberately NOT added to {@link AreaCountProvider}.
 *
 * <p><b>Why not on {@link AreaCountProvider}.</b> That interface has a deliberately loud-failing
 * {@link OpenSearchAreaCountProvider} stub (throws {@link UnsupportedOperationException} — see its
 * javadoc). Hanging school counts off the SAME interface would force that stub to own data it can
 * never serve, so flipping {@code discover.opensearch.enabled=true} would silently break school
 * counts via {@link AreaCountRollupService}'s {@code activeProvider()} routing. School counts are
 * also NOT filter-sensitive (unlike listing counts), so hanging them off the filter-hashed {@link
 * AreaCountQuery} would multiply identical cache entries per filter permutation for no reason — see
 * {@link AreaCountRollupService#schoolCoverageForCity}, which caches this under an empty filter
 * hash, ONE entry per city/revision.
 *
 * <p><b>Product ruling (#1956 PR1): a school counts as "located inside" an area when its coverage
 * relationship type is one of {@code ('contained','primary','reviewed_override')}.</b> That ruling
 * is unchanged. {@link #COUNTED_RELATIONSHIP_TYPES_SQL} is kept CHARACTER-IDENTICAL (no space after
 * commas) to {@code AreaSummaryService.SCHOOL_COUNT_SUBQUERY}'s IN-list — see {@code
 * PostgresAreaSchoolCountProviderSqlIdentityTest}. That identity buys two things: both surfaces draw
 * from the SAME counted-relationship set, and V110's partial index {@code
 * idx_school_coverage_counted} is defined {@code WHERE relationship_type IN (...)} on exactly this
 * set, so a divergent copy would stop matching the index predicate.
 *
 * <p><b>Each area counts its OWN schools (contract fix).</b> This provider returns the DISTINCT
 * {@code (area_key, school_id)} pairs for the city and nothing more; {@link AreaSchoolCoverage} owns
 * both derivations from them. An earlier revision used {@code DISTINCT ON (school_id)} to partition
 * each school GLOBALLY to a single "canonical" area by a precedence ladder. That was wrong: when a
 * school qualified for both Area A and Area B, one of them reported {@code 0} despite genuinely
 * containing the school. It was done to make "sum of children == parent" true by construction —
 * buying roll-up convenience with a factually wrong per-area number. De-duplication now happens at
 * ROLL-UP time over school identity ({@link AreaSchoolCoverage#distinctSchoolCountOver}) instead,
 * which keeps parents honest without any area under-reporting. There is no precedence ladder any
 * more, and none is needed: no area has to lose.
 *
 * <p><b>Relationship to {@code AreaSummary#schoolCount}'s badge: EQUAL for every area THIS QUERY
 * RETURNS.</b> The badge is a correlated {@code COUNT(*)} over the same counted-relationship rows
 * for the area, with no {@code DISTINCT}. That could differ from a distinct-school count only if one
 * school could hold TWO counted rows for the SAME area — and it cannot: {@code
 * school_discover_area_coverage} is keyed {@code PRIMARY KEY (school_id, curated_area_key)}
 * (V110:49), so at most one row exists per (school, area) pair regardless of {@code
 * relationship_type}. {@code COUNT(*)} and {@code COUNT(DISTINCT school_id)} are therefore identical
 * per area by construction.
 *
 * <p><b>Scope caveat — the equality is "per area IN SCOPE", not universal.</b> This query
 * additionally requires {@code ci.is_active = true} and a 4-segment {@code area_key}. An area
 * failing EITHER is simply ABSENT here (so reads as {@code 0}) while {@code AreaSummaryService}'s
 * badge for it can be non-zero, because that query applies neither guard. This is a difference in
 * which areas each surface covers, NOT a disagreement about how a covered area is counted. Stated
 * explicitly because this javadoc has overstated twice already: an earlier revision asserted an
 * equality the {@code DISTINCT ON} implementation could not deliver, and its replacement documented
 * the resulting divergence as if it were intended. Equality holds now because the implementation was
 * fixed — not because the claim was restated — and it holds within the scope named here.
 *
 * <p><b>ONE query, no N+1.</b> A node's roll-up needs the union of its descendants' school sets, but
 * that must not become one query per node — a Direction with 65 children would be 66 queries and
 * would break AC1.11's one-request-per-view contract. Instead this issues a SINGLE whole-city pair
 * query; every per-area count and every node/child roll-up is then derived IN MEMORY over the
 * descendant sets {@link NavigationGraph} has already materialised.
 */
@Component
public class PostgresAreaSchoolCountProvider {

    /**
     * Character-identical (no space after commas) to {@code AreaSummaryService}'s private {@code
     * SCHOOL_COUNT_SUBQUERY} IN-list and to {@code SchoolRepository.COUNTED_RELATIONSHIP_TYPES_SQL}
     * — see {@code PostgresAreaSchoolCountProviderSqlIdentityTest} for the reflection proof.
     */
    static final String COUNTED_RELATIONSHIP_TYPES_SQL = "('contained','primary','reviewed_override')";

    /**
     * The DISTINCT {@code (area_key, school_id)} pairs for one city's counted school coverage,
     * scoped by {@code cities.slug} + {@code is_active} and the 4-segment {@code area_key} guard.
     *
     * <p>{@code DISTINCT} is belt-and-braces rather than load-bearing: V110's {@code PRIMARY KEY
     * (school_id, curated_area_key)} already guarantees at most one row per pair. It is kept so the
     * query states its own contract, and stays correct if that key is ever widened.
     *
     * <p><b>Index fit (EXPECTATION, not a measured plan).</b> V110's {@code
     * idx_school_coverage_counted} is {@code (curated_area_key, school_id) WHERE relationship_type
     * IN (...)}: its partial predicate matches this query's exactly, and both selected columns are
     * in the index, so an index-only scan is the plan we would EXPECT. Separately — and this part is
     * structural rather than predictive — the previous {@code DISTINCT ON (school_id)} shape
     * REQUIRED {@code ORDER BY c.school_id, …}, leading on a column the index does not lead on, so
     * it forced a sort of the city's counted rows; this shape imposes no such ordering, so that
     * particular cost is gone by construction.
     *
     * <p>Nothing here has been verified against a production-volume plan. QP-7 in {@code
     * scripts/run_explain_harness.py} runs this exact SQL under {@code EXPLAIN (ANALYZE, BUFFERS)};
     * treat its captured output as the authority and this paragraph as the hypothesis it tests. Said
     * plainly because confident performance claims in this file have twice turned out to be wrong.
     */
    static final String SCHOOL_COVERAGE_BY_AREA_SQL = """
            SELECT DISTINCT c.curated_area_key AS area_key, c.school_id AS school_id
            FROM school_discover_area_coverage c
            JOIN areas a ON a.area_key = c.curated_area_key
            JOIN cities ci ON ci.id = a.city_id
            WHERE ci.slug = ?
              AND ci.is_active = true
              AND array_length(string_to_array(a.area_key, '|'), 1) = 4
              AND c.relationship_type IN %s
            """.formatted(COUNTED_RELATIONSHIP_TYPES_SQL);

    private final JdbcOperations jdbcOperations;

    public PostgresAreaSchoolCountProvider(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    /**
     * The city's counted {@code (area_key, school_id)} coverage in ONE query. An area with zero
     * counted schools is simply ABSENT from the map — callers derive {@code 0} for it, mirroring
     * {@link AreaCountProvider#countsByAreaKey}'s contract. NOT filter-sensitive — no {@link
     * AreaCountQuery} parameter, by design (see class javadoc).
     */
    @Transactional(readOnly = true)
    public AreaSchoolCoverage schoolCoverageForCity(String citySlug) {
        Map<String, Set<UUID>> schoolIdsByAreaKey = new LinkedHashMap<>();
        jdbcOperations.query(SCHOOL_COVERAGE_BY_AREA_SQL,
                rs -> {
                    String areaKey = rs.getString("area_key");
                    // Typed getObject rather than an unchecked (UUID) cast: same cost, but it states
                    // the column's expected type instead of deferring a mismatch to a ClassCastException.
                    UUID schoolId = rs.getObject("school_id", UUID.class);
                    schoolIdsByAreaKey.computeIfAbsent(areaKey, k -> new LinkedHashSet<>()).add(schoolId);
                },
                citySlug);
        return new AreaSchoolCoverage(schoolIdsByAreaKey);
    }

    /**
     * Convenience derivation of {@link AreaSchoolCoverage#countsByAreaKey()} — each area's OWN
     * distinct school count. Retained for callers that need only the per-area numbers; anything
     * rolling counts UP a hierarchy must use {@link #schoolCoverageForCity} and union the school
     * sets, because per-area school counts CANNOT be summed (see {@link AreaSchoolCoverage}).
     */
    @Transactional(readOnly = true)
    public Map<String, Long> schoolCountsByAreaKey(String citySlug) {
        return schoolCoverageForCity(citySlug).countsByAreaKey();
    }
}

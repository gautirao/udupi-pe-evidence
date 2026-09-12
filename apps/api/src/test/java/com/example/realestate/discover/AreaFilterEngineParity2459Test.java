package com.example.realestate.discover;

import com.example.realestate.ai.PropertyType;
import com.example.realestate.discover.opensearch.DiscoverQueryDsl;
import com.example.realestate.listing.area.AreaNormalizer;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Pure unit tests for the #2459 area predicate on BOTH engines, and for the property that matters
 * most: <b>they make the same decision, including the same UNRESOLVED decision</b> (#2459 R2, the
 * issue's HOLD condition).
 *
 * <p>This family has shipped an unnoticed engine divergence before, so the parity is asserted over
 * the emitted artefacts — the SQL text and the DSL map tree — rather than assumed because both call
 * the same helper.
 */
class AreaFilterEngineParity2459Test {

    private static DiscoverListingPredicateBuilder.Filters withBounds(Integer min, Integer max) {
        return new DiscoverListingPredicateBuilder.Filters(
                "udupi", null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, min, max);
    }

    // ── Absent bounds change nothing on either engine ──────────────────────────────────────────

    @Test
    @DisplayName("no bound → byte-identical SQL to the pre-#2459 shape, and no DSL clause")
    void noBound_emitsNothingOnEitherEngine() {
        DiscoverListingPredicateBuilder.Sql sql =
                DiscoverListingPredicateBuilder.build(withBounds(null, null));
        assertFalse(sql.whereFragment().contains("built_area"),
                "an absent filter must not add a clause — every existing journey takes this branch");
        assertFalse(sql.whereFragment().contains("land_area"));
        assertEquals(1, sql.params().size(), "city only");

        // Inspect the QUERY subtree only: the _source field list legitimately names both area
        // columns, so asserting over the whole body would pass no matter what the predicate did.
        String query = dslJson(buildDsl(null, null).get("query"));
        assertFalse(query.contains("built_area"));
        assertFalse(query.contains("land_area"));
        assertTrue(dslJson(buildDsl(1000, 1500).get("query")).contains("built_area"),
                "control: the same inspection DOES see the clause when a bound is present");
    }

    // ── Postgres side ──────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("a min bound emits ONE comparison against the resolved primary area, binding only "
            + "the bound itself")
    void minBound_bindsOnlyTheBound() {
        DiscoverListingPredicateBuilder.Sql sql =
                DiscoverListingPredicateBuilder.build(withBounds(1000, null));

        assertTrue(sql.whereFragment().contains(" >= ?"));
        assertFalse(sql.whereFragment().contains(" <= ?"), "no max bound was supplied");
        assertEquals(List.of("udupi", 1000), sql.params(),
                "the generated CASE must bind nothing, so the bound is the only added parameter");
    }

    @Test
    void bothBounds_emitTwoComparisonsInOrder() {
        DiscoverListingPredicateBuilder.Sql sql =
                DiscoverListingPredicateBuilder.build(withBounds(1000, 1500));
        assertEquals(List.of("udupi", 1000, 1500), sql.params());
        assertTrue(sql.whereFragment().contains(" >= ?"));
        assertTrue(sql.whereFragment().contains(" <= ?"));
    }

    @Test
    @DisplayName("the area predicate composes with the other filters without disturbing their "
            + "positional binds")
    void areaPredicateDoesNotReorderExistingParams() {
        DiscoverListingPredicateBuilder.Filters f = new DiscoverListingPredicateBuilder.Filters(
                "udupi", List.of("apartment"), null, 100L, 900L, null, null, null, null, null, null,
                null, null, null, null, null, null, null, null, null, null, null, null, 1000, 1500);
        DiscoverListingPredicateBuilder.Sql sql = DiscoverListingPredicateBuilder.build(f);
        assertEquals(List.of("udupi", "apartment", 100L, 900L, 1000, 1500), sql.params());
    }

    // ── The UNRESOLVED decision, on both engines ───────────────────────────────────────────────

    @Test
    @DisplayName("R2: both engines name EXACTLY the same property types, so the set they leave "
            + "UNRESOLVED is the same set")
    void bothEnginesNameTheSamePropertyTypes() {
        Set<String> sqlTypes = typesNamedInSql();
        Set<String> dslTypes = typesNamedInDsl();

        assertEquals(sqlTypes, dslTypes,
                "a type named by one engine and not the other is a silent membership divergence");

        // And the complement is genuinely non-empty — otherwise "the same UNRESOLVED set" is the
        // empty set and this test proves nothing about UNRESOLVED at all.
        Set<String> unresolved = new TreeSet<>();
        for (PropertyType pt : PropertyType.values()) {
            if (!sqlTypes.contains(pt.getValue())) {
                unresolved.add(pt.getValue());
            }
        }
        assertEquals(Set.of("other"), unresolved,
                "today exactly one stored type is UNRESOLVED; if that changes, both engines must "
                        + "change together and this assertion is where you find out");
    }

    @Test
    @DisplayName("R2: both engines recognise EXACTLY the same unit vocabulary")
    void bothEnginesRecogniseTheSameUnits() {
        String sql = DiscoverPrimaryArea.primaryAreaSqftSql("pl");
        String dsl = dslJson(buildDsl(1000, 1500));

        for (AreaNormalizer.AreaUnit unit : AreaNormalizer.AreaUnit.values()) {
            for (String alias : unit.aliases()) {
                assertTrue(sql.contains("'" + alias + "'"), "SQL must recognise " + alias);
                assertTrue(dsl.contains(alias), "DSL must recognise " + alias);
            }
        }
        // Neither may recognise a unit with no conversion path.
        assertFalse(sql.contains("sq_yd"));
        assertFalse(dsl.contains("sq_yd"));
    }

    /**
     * The parity that the rest of this file was one assertion short of.
     *
     * <p>{@link #bothEnginesNameTheSamePropertyTypes} compares the SET of types each engine names.
     * That set survives a column swap untouched: if the Postgres {@code CASE} arm for apartments
     * started reading {@code land_area} while the DSL branch for apartments kept reading
     * {@code built_area}, both engines would still name apartment, still recognise the same units,
     * and still leave {@code other} unresolved — and every existing assertion here would stay
     * green while the two engines answered different questions about the same row.
     *
     * <p>That is not a hypothetical class of bug for this feature; it IS the feature. "1,200 sq ft
     * of an apartment is its BUILT-UP area, 1,200 sq ft of a plot is the LAND under it" is the
     * whole premise of #2459, and the column each type reads is where that premise is cashed in.
     *
     * <p>Asserted over the emitted artefacts on both sides — the generated SQL text parsed back
     * into (type → column), and the DSL map tree walked structurally rather than string-matched —
     * per this file's standing rule that shared-helper provenance is not evidence of parity.
     */
    @Test
    @DisplayName("R2: every property type reads the SAME area column on both engines — the "
            + "built-up vs land distinction the whole feature rests on")
    void bothEnginesBindEachTypeToTheSameAreaColumn() {
        Map<String, String> sqlColumns = areaColumnByTypeInSql();
        Map<String, String> dslColumns = areaColumnByTypeInDsl();

        assertEquals(sqlColumns, dslColumns,
                "a type reading built_area on one engine and land_area on the other is a silent "
                        + "MEANING divergence: same rows named, different quantity compared");

        // Control arm. Equality above is worth nothing if the mapping is constant — two engines
        // that both put every type on built_area would agree perfectly and be perfectly wrong.
        assertEquals(Set.of("built_area", "land_area"), new TreeSet<>(sqlColumns.values()),
                "the mapping must actually DISTINGUISH two columns, or this parity is vacuous");

        // Anchors, so the direction is pinned and not merely self-consistent.
        assertEquals("built_area", sqlColumns.get("apartment"));
        assertEquals("land_area", sqlColumns.get("residential_plot"));
        assertEquals("land_area", sqlColumns.get("agricultural_land"));
    }

    @Test
    @DisplayName("R2: a non-positive stored area carries NO area on either engine")
    void bothEnginesExcludeNonPositiveAreas() {
        // The DSL half was already asserted (`gt=0` in dslClauseShape); the Postgres half — which
        // this class's own header claims is its mirror — was not asserted anywhere.
        String sql = DiscoverPrimaryArea.primaryAreaSqftSql("pl");
        for (String column : new TreeSet<>(areaColumnByTypeInSql().values())) {
            assertTrue(sql.contains("pl." + column + " IS NULL OR pl." + column + " <= 0 THEN NULL"),
                    column + " must yield NULL for absent or non-positive values, mirroring "
                            + "AreaNormalizer#toSqft and the DSL's gt:0 branch");
        }
        assertTrue(dslJson(DiscoverQueryDsl.buildPrimaryAreaClause(1000, 1500)).contains("gt=0"),
                "the DSL half of the same rule, asserted here so the pair cannot be half-removed");
    }

    // ── OpenSearch side ────────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("the DSL clause is a self-contained should-union, one branch per (column pair, "
            + "unit), each excluding non-positive values")
    void dslClauseShape() {
        Map<String, Object> clause = DiscoverQueryDsl.buildPrimaryAreaClause(1000, 1500);

        @SuppressWarnings("unchecked")
        Map<String, Object> bool = (Map<String, Object>) clause.get("bool");
        assertEquals(1, bool.get("minimum_should_match"),
                "a bare should without minimum_should_match would not constrain results");

        @SuppressWarnings("unchecked")
        List<Object> should = (List<Object>) bool.get("should");
        assertEquals(
                DiscoverPrimaryArea.columnGroups().size() * AreaNormalizer.AreaUnit.values().length,
                should.size());

        String json = dslJson(clause);
        assertTrue(json.contains("gt=0"), "non-positive areas carry no area on either engine");
        assertTrue(json.contains("built_area_unit"));
        assertTrue(json.contains("land_area_unit"));
        assertFalse(json.contains("carpet"), "AC1: carpet_area is queried nowhere");
        assertFalse(json.contains("other"), "UNRESOLVED types appear in no branch");
    }

    @Test
    @DisplayName("the DSL converts the BOUND into each row's unit, exactly where the quotient "
            + "terminates")
    void dslConvertsBoundsPerUnit() {
        String json = dslJson(DiscoverQueryDsl.buildPrimaryAreaClause(1089, 43560));
        // 1089 sq ft is exactly 2.5 cent and exactly 1 gunta; 43560 sq ft is exactly 1 acre.
        assertTrue(json.contains("gte=2.5,"), "1089 sq ft = 2.5 cent, exactly");
        assertTrue(json.contains("lte=100}"), "43560 sq ft = 100 cent, exactly");
        assertTrue(json.contains("gte=1089,"), "1089 sq ft in sq ft is 1089");
        assertTrue(json.contains("gte=0.025,"), "1089 sq ft = 0.025 acre, exactly");
        assertTrue(json.contains("lte=1}"), "43560 sq ft = 1 acre, exactly");
    }

    @Test
    void dslOmitsTheBoundItWasNotGiven() {
        String minOnly = dslJson(DiscoverQueryDsl.buildPrimaryAreaClause(1000, null));
        assertTrue(minOnly.contains("gte="));
        assertFalse(minOnly.contains("lte="));

        String maxOnly = dslJson(DiscoverQueryDsl.buildPrimaryAreaClause(null, 1000));
        assertTrue(maxOnly.contains("lte="));
        assertFalse(maxOnly.contains("gte="));
    }

    // ── Helpers ────────────────────────────────────────────────────────────────────────────────

    private static Map<String, Object> buildDsl(Integer min, Integer max) {
        DiscoverListingsQuery q = new DiscoverListingsQuery(
                "udupi", null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null, null, null, 0, 20, false, null, null, null, null, min, max);
        return DiscoverQueryDsl.buildListingsQuery(q, List.of("QA|QA|udupi|A"));
    }

    /** The DSL is a nested Map tree; its {@code toString()} is a faithful, stable rendering for
     *  containment assertions — no JSON dependency needed. */
    private static String dslJson(Object dsl) {
        return String.valueOf(dsl);
    }

    @SuppressWarnings("unchecked")
    private static <T> T cast(Object o) {
        return (T) o;
    }

    /**
     * Parses the EMITTED SQL back into (property type → area column), by reading each {@code CASE}
     * arm's {@code IN (...)} list and the column its {@code THEN} branch immediately guards.
     *
     * <p>Parsed rather than substring-matched: {@code land} is a substring of {@code land_area} and
     * of {@code commercial_land}, so {@code contains()} cannot tell which arm a token belongs to.
     */
    private static Map<String, String> areaColumnByTypeInSql() {
        String sql = DiscoverPrimaryArea.primaryAreaSqftSql("pl");
        Matcher m = Pattern.compile(
                "WHEN pl\\.property_type IN \\(([^)]+)\\) THEN \\(CASE WHEN pl\\.(\\w+) IS NULL")
                .matcher(sql);

        Map<String, String> byType = new TreeMap<>();
        while (m.find()) {
            String column = m.group(2);
            for (String token : m.group(1).split(",")) {
                byType.put(token.trim().replace("'", ""), column);
            }
        }
        assertFalse(byType.isEmpty(), "the SQL arms must parse, or this test asserts nothing");
        return byType;
    }

    /**
     * Walks the EMITTED DSL tree into the same (property type → area column) shape.
     *
     * <p>A type appears once per unit, so the column is also asserted CONSISTENT across that type's
     * own branches — a per-unit divergence would be invisible in the merged map.
     */
    private static Map<String, String> areaColumnByTypeInDsl() {
        Map<String, Object> bool = cast(DiscoverQueryDsl.buildPrimaryAreaClause(1000, 1500).get("bool"));
        List<Object> should = cast(bool.get("should"));

        Map<String, String> byType = new TreeMap<>();
        for (Object branchObj : should) {
            Map<String, Object> branchBool = cast(((Map<String, Object>) cast(branchObj)).get("bool"));
            List<Object> filter = cast(branchBool.get("filter"));

            List<String> types = null;
            String areaColumn = null;
            for (Object clauseObj : filter) {
                Map<String, Object> clause = cast(clauseObj);
                if (clause.containsKey("terms")) {
                    Map<String, Object> terms = cast(clause.get("terms"));
                    if (terms.containsKey("property_type")) {
                        types = cast(terms.get("property_type"));
                    }
                } else if (clause.containsKey("range") && areaColumn == null) {
                    // The first range clause in a branch is the `gt: 0` presence guard; both range
                    // clauses in a branch name the same column by construction.
                    areaColumn = ((Map<String, Object>) cast(clause.get("range")))
                            .keySet().iterator().next();
                }
            }

            assertTrue(types != null && areaColumn != null,
                    "every should-branch must name both its property types and its area column");
            for (String type : types) {
                String previous = byType.put(type, areaColumn);
                assertTrue(previous == null || previous.equals(areaColumn),
                        type + " reads two different columns across its own unit branches");
            }
        }
        assertFalse(byType.isEmpty(), "the DSL branches must parse, or this test asserts nothing");
        return byType;
    }

    private static Set<String> typesNamedInSql() {
        String sql = DiscoverPrimaryArea.primaryAreaSqftSql("pl");
        Set<String> named = new LinkedHashSet<>();
        for (PropertyType pt : PropertyType.values()) {
            if (sql.contains("'" + pt.getValue() + "'")) {
                named.add(pt.getValue());
            }
        }
        return new TreeSet<>(named);
    }

    private static Set<String> typesNamedInDsl() {
        String json = dslJson(DiscoverQueryDsl.buildPrimaryAreaClause(1000, 1500));
        List<String> named = new ArrayList<>();
        for (PropertyType pt : PropertyType.values()) {
            // Match on the property_type terms list, not on an incidental substring: `land` is a
            // substring of `commercial_land` and of `land_area`, so a naive contains() would
            // over-report. The rendered list separates entries by ", " or bounds them with [ ].
            if (json.contains("[" + pt.getValue() + ",")
                    || json.contains(" " + pt.getValue() + ",")
                    || json.contains(" " + pt.getValue() + "]")
                    || json.contains("[" + pt.getValue() + "]")) {
                named.add(pt.getValue());
            }
        }
        return new TreeSet<>(named);
    }
}

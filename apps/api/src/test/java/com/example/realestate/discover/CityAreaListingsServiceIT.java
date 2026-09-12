package com.example.realestate.discover;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Captor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowCallbackHandler;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Issue #2533 — BYTE-IDENTICAL BASELINE for the SQL-assembly restructure.
 *
 * <p><b>Why this file exists.</b> The approved plan restructures {@code CityAreaListingsService}
 * so each filter clause carries its own bind params instead of being hand-synchronised with a
 * separate {@code buildParams} method ~130 lines away. The PLAN_REVIEW approval is conditional on
 * that restructure being provably behaviour-preserving: its
 * {@code evidence_that_would_change_decision} names "failure in byte-identical regression tests".
 * These tests ARE that gate. They are written against the UNCHANGED service and must keep passing,
 * unmodified, after the restructure. If any of them has to be edited to make the restructure pass,
 * the restructure changed behaviour and the approval is void.
 *
 * <p><b>What "byte-identical" means here, precisely.</b> Each case pins the exact bind ARRAY
 * (via {@code containsExactly}, so it is exhaustive) and the PRESENCE of specific clause fragments
 * (via {@code contains}, so it is not). It does NOT pin a digest of the whole SELECT.
 *
 * <p>Read that as fragment-PRESENCE-and-bind-identity, not as whole-clause-text identity. One gap
 * follows from it and is stated rather than left for a reader to discover: a spurious extra clause
 * that emits a LITERAL — no placeholder, no bind — would evade both assertions, since
 * {@code contains} only checks that expected fragments are present and {@code containsExactly}
 * only sees the bind array. The placeholder-count seal below closes the mirror-image gap (an extra
 * placeholder with no bind); a literal-only addition remains outside what this class proves.
 * An earlier draft of this class did exactly that and the approach was dropped deliberately: a
 * digest over the full ~60-line SELECT breaks on any unrelated column or comment change, reports
 * only "hash differs", and trains readers to refresh the constant reflexively — which destroys the
 * signal it exists to give. The restructure changes filter-clause emission and param assembly and
 * nothing else; the surrounding SELECT skeleton is a string literal it does not touch. So these
 * assertions cover the whole blast radius of the change, and a reviewer should read them as
 * proving fragment-and-bind identity rather than whole-statement identity.
 *
 * <p><b>Why it is named *IT but mocks the database.</b> {@code CityAreaListingsServiceIT} is the
 * filename in the approved plan's {@code allowed_files}. {@code pom.xml:151-155} configures
 * surefire to include BOTH {@code **}{@code /*Test.java} and {@code **}{@code /*IT.java}, excluding
 * only {@code @Tag("integration")} — so this class runs under a plain {@code mvn test}. It is
 * deliberately NOT tagged: every Testcontainers-backed IT in this repo runs via its own bespoke
 * pom profile with explicit includes (see the profiles from ~line 187), and a newly-added tagged
 * IT would be excluded by {@code <excludedGroups>} and execute NOWHERE. A test that silently never
 * runs is worse than no test.
 *
 * <p><b>Why mocking is the right instrument here, not a compromise.</b> The hazard is a mismatch
 * between the {@code ?} placeholders emitted into the SQL text and the positional array bound
 * against them. Capturing both and comparing them inspects that failure directly. A row-level
 * database test only surfaces the same bug when the fixture happens to produce visibly wrong rows —
 * and an ORDER swap between two same-typed params (e.g. {@code propertyType} and {@code q}, both
 * Strings in nearby slots) can easily produce plausible-looking rows instead.
 */
@ExtendWith(MockitoExtension.class)
class CityAreaListingsServiceIT {

    private static final String CITY = "udupi";
    private static final String AREA = "IN|KA|Udupi|Malpe";
    private static final int LIMIT = 5;

    @Mock
    private JdbcOperations jdbc;

    @Captor
    private ArgumentCaptor<String> sqlCaptor;

    @Captor
    private ArgumentCaptor<Object[]> argsCaptor;

    private CityAreaListingsService service;

    @BeforeEach
    void setUp() {
        service = new CityAreaListingsService(jdbc);
        // City-existence probe: 1 = known and active, so getAreaListings proceeds to the main query.
        when(jdbc.queryForObject(anyString(), eq(Integer.class), any())).thenReturn(1);
    }

    // ── Area-grouped path ───────────────────────────────────────────────────────────

    @Test
    void baseline_noFilters_sqlAndBindsAreStable() {
        service.getAreaListings(CITY, List.of(AREA), LIMIT,
                null, null, null, null, null, null, null, null, false);

        // No filter clauses at all beyond the two unconditional guards, so the bind array is
        // exactly [city, areaKey, limit] — the WHERE-clause tail with nothing preceding it.
        assertThat(capturedArgs()).containsExactly(CITY, AREA, LIMIT);
        assertThat(capturedSql()).contains("AND LOWER(pl.property_type) != LOWER('agricultural_land')");
    }

    @Test
    void baseline_bedroomsBelowFour_emitsPlaceholderBeforeCity() {
        service.getAreaListings(CITY, List.of(AREA), LIMIT,
                null, null, List.of(2), null, null, null, null, null, false);

        // #2533 — the clause TEXT changed with the widening (a one-element IN rather than an
        // equality) but the BIND did not. That distinction is what AC2 turns on: single-value
        // input still produces the same parameter, so no request the frontend sends changes
        // meaning.
        assertThat(capturedSql()).contains("AND (pl.bedrooms IN (?))");
        // The bedrooms bind precedes the WHERE-clause tail, because the LEFT JOIN ON clause is
        // emitted earlier in the SQL text and JDBC binds positionally left-to-right.
        assertThat(capturedArgs()).containsExactly(2, CITY, AREA, LIMIT);
    }

    @Test
    void baseline_bedroomsFourOrMore_emitsLiteralAndBindsNothing() {
        service.getAreaListings(CITY, List.of(AREA), LIMIT,
                null, null, List.of(5), null, null, null, null, null, false);

        // THE ASYMMETRY at the heart of the AC8 hazard: >= 4 is a LITERAL, contributing a clause
        // but NO placeholder, while any other value contributes both. Going multi-value makes the
        // placeholder count vary per element, which is what a separately-maintained param array
        // cannot track reliably.
        assertThat(capturedSql()).contains("AND pl.bedrooms >= 4");
        assertThat(capturedSql()).doesNotContain("AND pl.bedrooms = ?");
        assertThat(capturedArgs()).containsExactly(CITY, AREA, LIMIT);
    }

    @Test
    void baseline_bedroomsFourOrMorePlusKeyword_isTheOrderShiftShape() {
        service.getAreaListings(CITY, List.of(AREA), LIMIT,
                null, null, List.of(5), null, "beach", null, null, null, false);

        // Arm 9's mechanism, pinned on the UNCHANGED code. The bedrooms clause emits no bind, so
        // the keyword bind moves up a slot relative to the naive expectation. If a future edit
        // adds a placeholder here without adding the matching bind (or vice versa), "beach" lands
        // in the wrong position and the query silently returns wrong rows rather than throwing.
        assertThat(capturedSql()).contains("AND pl.bedrooms >= 4");
        assertThat(capturedSql()).contains("websearch_to_tsquery('english', ?)");
        assertThat(capturedArgs()).containsExactly("beach", CITY, AREA, LIMIT);
        // The arm where the asymmetry bites: the bedrooms clause emits a literal and no
        // placeholder, so a mis-emitted "?" here would shift every later bind silently.
        assertPlaceholderCountMatchesBindCount();
    }

    @Test
    void baseline_propertyTypeAndKeyword_areTwoAdjacentStringBinds() {
        service.getAreaListings(CITY, List.of(AREA), LIMIT,
                null, null, null, List.of("apartment"), "beach", null, null, null, false);

        // Two same-typed binds in adjacent slots: the silent-failure mode. A swap between them
        // throws no exception and yields plausible-looking rows, which is precisely why the
        // combined-axis arms exist and why count-only assertions are insufficient.
        assertThat(capturedArgs()).containsExactly("apartment", "beach", CITY, AREA, LIMIT);
    }

    @Test
    void baseline_allScalarFilters_fullBindOrderIsPinned() {
        service.getAreaListings(CITY, List.of(AREA), LIMIT,
                1_000L, 9_000L, List.of(3), List.of("apartment"), "beach", "sale", Boolean.TRUE, null, false);

        assertThat(capturedArgs())
                .containsExactly(1_000L, 9_000L, 3, "apartment", "beach", "sale", CITY, AREA, LIMIT);
        assertPlaceholderCountMatchesBindCount();
        // readyToMove is a fixed literal, not a bind — same no-placeholder shape as bedrooms >= 4.
        assertThat(capturedSql()).contains("AND pl.possession_status = 'READY'");
    }

    // ── bbox-only path (separate SQL, separate param assembly) ──────────────────────

    @Test
    void baseline_bboxOnlyPath_hasItsOwnIndependentBindOrder() {
        DiscoverListingPredicateBuilder.Bbox bbox =
                new DiscoverListingPredicateBuilder.Bbox(13.30, 74.70, 13.40, 74.80);

        service.getAreaListings(CITY, null, LIMIT,
                null, null, List.of(2), List.of("apartment"), null, null, null, bbox, false);

        // This path builds its own WHERE-clause string and its own param list, duplicating the
        // hazard independently. City leads here (WHERE precedes the filters), the reverse of the
        // area-grouped path where the filters sit in the LEFT JOIN ON clause and therefore come
        // first. Fixing one path demonstrably does not fix the other.
        assertThat(capturedArgs())
                .containsExactly(CITY, 2, "apartment", 74.70, 13.30, 74.80, 13.40, 20);
        // Applied to BOTH assemblies deliberately — this path builds its SQL and its param list
        // separately from the area-grouped one, so sealing one proves nothing about the other.
        assertPlaceholderCountMatchesBindCount();
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────────

    private String capturedSql() {
        verify(jdbc).query(sqlCaptor.capture(), any(RowCallbackHandler.class), argsCaptor.capture());
        return sqlCaptor.getValue();
    }

    private Object[] capturedArgs() {
        verify(jdbc).query(sqlCaptor.capture(), any(RowCallbackHandler.class), argsCaptor.capture());
        return argsCaptor.getValue();
    }

    /**
     * Every {@code ?} emitted into the SQL must have exactly one bind behind it.
     *
     * <p>This closes a real asymmetry in the assertions above. An extra BIND with no placeholder is
     * caught by {@code containsExactly}, because that sees the whole array. An extra PLACEHOLDER
     * with no bind is NOT — {@code containsExactly} never looks at the SQL, and {@code
     * JdbcOperations} is mocked here, so no runtime parameter-count mismatch is ever raised. A
     * careless {@code sql.append("… = ?")} that forgets its bind therefore fails in the one
     * direction nothing else here watches.
     */
    private void assertPlaceholderCountMatchesBindCount() {
        assertThat(capturedSql().chars().filter(c -> c == '?').count())
                .isEqualTo(capturedArgs().length);
    }

}

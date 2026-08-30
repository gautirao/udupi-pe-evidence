package com.example.realestate.discover.navigation;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcOperations;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Pins the provably-empty SHORT-CIRCUIT (#1956 PR1 AC1.15 #7/#8): an unsatisfiable filter set must
 * cost ZERO queries, not one aggregate scan that proves the obvious.
 *
 * <p>These assert on the ABSENCE OF A QUERY via a mocked {@link JdbcOperations}, not merely on an
 * empty result — an empty result is exactly what the un-optimised path would also return, so it
 * cannot distinguish "skipped the database" from "scanned the whole city and found nothing". That
 * distinction is the entire point of the finding.
 */
class PostgresAreaCountProviderShortCircuitTest {

    private static final String CITY = "bengaluru";

    @Test
    @DisplayName("an unsatisfiable propertyTypes filter returns empty WITHOUT touching the database")
    void unsatisfiablePropertyTypes_executesNoQuery() {
        JdbcOperations jdbc = mock(JdbcOperations.class);
        PostgresAreaCountProvider provider = new PostgresAreaCountProvider(jdbc);

        Map<String, Long> counts = provider.countsByAreaKey(
                AreaCountQuery.blended(CITY).withPropertyTypes(List.of("penthouse")));

        assertThat(counts).isEmpty();
        verifyNoInteractions(jdbc);
    }

    @Test
    @DisplayName("an unsatisfiable sellerTypes filter returns empty WITHOUT touching the database")
    void unsatisfiableSellerTypes_executesNoQuery() {
        JdbcOperations jdbc = mock(JdbcOperations.class);
        PostgresAreaCountProvider provider = new PostgresAreaCountProvider(jdbc);

        Map<String, Long> counts = provider.countsByAreaKey(
                AreaCountQuery.blended(CITY).withSellerTypes(List.of("landlord")));

        assertThat(counts).isEmpty();
        verifyNoInteractions(jdbc);
    }

    @Test
    @DisplayName("unsatisfiability short-circuits regardless of what the OTHER filters say — ANDing "
            + "anything onto an empty set stays empty")
    void unsatisfiableCombinedWithOtherFilters_stillExecutesNoQuery() {
        JdbcOperations jdbc = mock(JdbcOperations.class);
        PostgresAreaCountProvider provider = new PostgresAreaCountProvider(jdbc);

        Map<String, Long> counts = provider.countsByAreaKey(
                AreaCountQuery.blended(CITY)
                        .withPropertyTypes(List.of("penthouse"))
                        .withListingPurpose("sale")
                        .withBedrooms(List.of(2))
                        .withPriceRange(100L, 900L));

        assertThat(counts).isEmpty();
        verifyNoInteractions(jdbc);
    }

    /**
     * The guard against over-reach: a SATISFIABLE filter set must still run its query. Without this,
     * a short-circuit that accidentally matched everything would look "correct" in the tests above
     * while silently returning zero for every real request.
     */
    @Test
    @DisplayName("a satisfiable filter set DOES query the database — the short-circuit must not "
            + "swallow real requests")
    void satisfiableFilters_stillExecuteTheQuery() {
        JdbcOperations jdbc = mock(JdbcOperations.class);
        when(jdbc.query(anyString(), any(org.springframework.jdbc.core.RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());
        PostgresAreaCountProvider provider = new PostgresAreaCountProvider(jdbc);

        provider.countsByAreaKey(AreaCountQuery.blended(CITY).withPropertyTypes(List.of("APARTMENT")));

        verify(jdbc).query(anyString(), any(org.springframework.jdbc.core.RowMapper.class), any(Object[].class));
    }

    /**
     * bedrooms carries NO CHECK constraint on property_listings (plain nullable INTEGER, V0:87), so
     * an out-of-vocabulary bedrooms value is NOT provably empty and MUST still hit the database.
     * Short-circuiting it would be wrong-answer cache poisoning rather than an optimisation — the
     * reason public callers 400 on negative bedrooms instead.
     */
    @Test
    @DisplayName("bedrooms is NEVER short-circuited — it has no CHECK constraint, so emptiness is "
            + "not provable and the query must still run")
    void negativeBedrooms_isNotShortCircuited_queryStillRuns() {
        JdbcOperations jdbc = mock(JdbcOperations.class);
        when(jdbc.query(anyString(), any(org.springframework.jdbc.core.RowMapper.class), any(Object[].class)))
                .thenReturn(List.of());
        PostgresAreaCountProvider provider = new PostgresAreaCountProvider(jdbc);

        provider.countsByAreaKey(AreaCountQuery.blended(CITY).withBedrooms(List.of(-5)));

        verify(jdbc).query(anyString(), any(org.springframework.jdbc.core.RowMapper.class), any(Object[].class));
    }
}

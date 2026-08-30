package com.example.realestate.listing.core;

import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.Query;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Regression tests for the PSQLException fix in findOpportunitiesByAreaKeys.
 *
 * Root cause: prepareThreshold=0 (set in application.yml) forces server-side
 * prepared statements immediately. PostgreSQL must determine the type of every
 * parameter at parse time. A bare ":areaKeys IS NULL" gives no type context
 * for that parameter → PSQLException: could not determine data type of parameter $2.
 *
 *   BROKEN:  :areaKeys IS NULL
 *   FIXED:   CAST(:areaKeys AS text[]) IS NULL   (explicit type → no ambiguity)
 *
 * Same class of issue for interval arithmetic:
 *   BROKEN:  :freshDays * INTERVAL '1 day'
 *   FIXED:   CAST(:freshDays AS integer) * INTERVAL '1 day'
 *
 * These tests read the @Query annotation value via reflection so that any
 * accidental revert of the explicit casts immediately breaks the build.
 */
class OpportunityQueryRegressionTest {

    // ==================== :areaKeys IS NULL cast ====================

    /**
     * All findOpportunitiesByAreaKeys main queries must use the explicit cast.
     * Covers both the deprecated List variant and the paginated Page variant.
     */
    @Test
    void allFindOpportunitiesByAreaKeys_mainQuery_usesExplicitCastForNullCheck() {
        boolean testedAtLeastOne = false;

        for (Method method : ListingRepository.class.getMethods()) {
            if (!method.getName().equals("findOpportunitiesByAreaKeys")) continue;
            Query query = method.getAnnotation(Query.class);
            if (query == null) continue;

            assertThat(query.value())
                    .as("main query on %s must not contain bare ':areaKeys IS NULL'",
                            method.toGenericString())
                    .doesNotContain(":areaKeys IS NULL");

            assertThat(query.value())
                    .as("main query on %s must use CAST(:areaKeys AS text[]) IS NULL",
                            method.toGenericString())
                    .contains("CAST(:areaKeys AS text[]) IS NULL");

            testedAtLeastOne = true;
        }

        assertThat(testedAtLeastOne)
                .as("Expected at least one findOpportunitiesByAreaKeys method with @Query")
                .isTrue();
    }

    /**
     * The paginated variant's countQuery must also use the explicit cast.
     * Spring Data executes the count query separately for pagination — it has
     * the same parameter binding and would fail the same way if not fixed.
     */
    @Test
    void findOpportunitiesByAreaKeys_countQuery_usesExplicitCastForNullCheck() {
        boolean testedAtLeastOne = false;

        for (Method method : ListingRepository.class.getMethods()) {
            if (!method.getName().equals("findOpportunitiesByAreaKeys")) continue;
            Query query = method.getAnnotation(Query.class);
            if (query == null || query.countQuery().isEmpty()) continue;

            assertThat(query.countQuery())
                    .as("count query on %s must not contain bare ':areaKeys IS NULL'",
                            method.toGenericString())
                    .doesNotContain(":areaKeys IS NULL");

            assertThat(query.countQuery())
                    .as("count query on %s must use CAST(:areaKeys AS text[]) IS NULL",
                            method.toGenericString())
                    .contains("CAST(:areaKeys AS text[]) IS NULL");

            testedAtLeastOne = true;
        }

        assertThat(testedAtLeastOne)
                .as("Expected at least one findOpportunitiesByAreaKeys method with a countQuery")
                .isTrue();
    }

    // ==================== :freshDays interval arithmetic cast ====================

    /**
     * All findOpportunitiesByAreaKeys queries must cast :freshDays to integer
     * before multiplying with INTERVAL, for the same reason: server-side
     * prepared statements require explicit type context.
     */
    @Test
    void allFindOpportunitiesByAreaKeys_freshDaysIntervalArithmetic_usesExplicitCast() {
        for (Method method : ListingRepository.class.getMethods()) {
            if (!method.getName().equals("findOpportunitiesByAreaKeys")) continue;
            Query query = method.getAnnotation(Query.class);
            if (query == null) continue;

            assertThat(query.value())
                    .as("main query on %s must not contain bare ':freshDays * INTERVAL'",
                            method.toGenericString())
                    .doesNotContain(":freshDays * INTERVAL");

            assertThat(query.value())
                    .as("main query on %s must use CAST(:freshDays AS integer) * INTERVAL",
                            method.toGenericString())
                    .contains("CAST(:freshDays AS integer) * INTERVAL");
        }
    }
}

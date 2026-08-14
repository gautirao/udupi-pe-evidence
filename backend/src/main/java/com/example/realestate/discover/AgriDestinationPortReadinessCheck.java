package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * #2151 PR B correction pass (B1, BLOCKING — RULED a deploy gate, not a fallback).
 *
 * <p><b>The problem this guards against.</b> {@code agri_destination_classification} has exactly
 * ONE production writer: PR A's City Launch promotion pipeline ({@code
 * CityLaunchPromotionService.launch}, published as {@code CityNavigationRevisionPromoted}). Any
 * city that was PROMOTED before this table existed — i.e. every city active today, on the deploy
 * that introduces #2151 PR B — has ZERO rows in it. {@link AgriDestinationPortPostgresAdapter}
 * (the sole {@link AgriDestinationPort} implementation) reads this table exclusively; with zero
 * rows, {@code findDestinations} silently returns an empty destination list, and the public,
 * unauthenticated, 120s-cached Agri corridor endpoints
 * ({@code RegionalAreaGroupsController}/{@code DiscoverAgriMapListingsController}) render EMPTY
 * for that city, indistinguishable from "this city genuinely has no agri listings".
 *
 * <p><b>What this class deliberately does NOT do.</b> No in-adapter legacy-table fallback (the
 * Main Agent explicitly rejected this — it would recreate the exact dual-production-read-source
 * pattern #2151 PR B's own forbidden_items bars, and a "temporary" exception to that discipline
 * tends to outlive the PR that added it). No general backfill tooling, no repair logic, no admin
 * endpoint. This class does exactly one thing: make the gap LOUD and VISIBLE at startup, ERROR
 * level, so it cannot ship silently. The human remediation step — re-promote every active city
 * before this deploys — is documented as an explicit pre-deploy runbook step in {@code
 * docs/architecture/agri-opensearch-query-contract.md}. The code alone does NOT make this deploy
 * safe; only that operator action does.
 */
@Component
public class AgriDestinationPortReadinessCheck {

    private static final Logger log = LoggerFactory.getLogger(AgriDestinationPortReadinessCheck.class);

    /**
     * Active cities with ZERO {@code agri_destination_classification} rows. A city with rows for
     * SOME but not all directions/areas is not flagged here — this check exists to catch the
     * "never promoted under the new table at all" case (AC of B1), not to audit classification
     * completeness within a city.
     */
    private static final String CITIES_MISSING_AGRI_DESTINATION_ROWS_SQL = """
            SELECT c.slug
            FROM cities c
            WHERE c.is_active = true
              AND NOT EXISTS (
                  SELECT 1 FROM agri_destination_classification adc WHERE adc.city_id = c.id
              )
            ORDER BY c.slug
            """;

    private final JdbcOperations jdbcOperations;

    public AgriDestinationPortReadinessCheck(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    /**
     * Runs once at application startup. DB errors are logged and swallowed, never rethrown — a
     * failed readiness check must not prevent the application from starting (mirrors {@code
     * CityRegionBackfillReadinessScheduler}'s convention).
     */
    @EventListener(ApplicationReadyEvent.class)
    public void checkAgriDestinationClassificationCoverage() {
        try {
            List<String> citiesMissingRows = findActiveCitiesMissingAgriDestinationRows();
            for (String citySlug : citiesMissingRows) {
                log.error("AgriDestinationPortReadinessCheck: city={} is ACTIVE but has ZERO "
                        + "agri_destination_classification rows — the public, unauthenticated Agri "
                        + "corridor/parcel endpoints will render EMPTY for this city until it is "
                        + "re-promoted. ACTION REQUIRED: re-run City Launch promotion for this city "
                        + "(see the pre-deploy runbook step in "
                        + "docs/architecture/agri-opensearch-query-contract.md).",
                        citySlug);
            }
            if (citiesMissingRows.isEmpty()) {
                log.info("AgriDestinationPortReadinessCheck: every active city has at least one "
                        + "agri_destination_classification row");
            }
        } catch (Exception e) {
            log.error("AgriDestinationPortReadinessCheck: readiness check itself failed — coverage of "
                    + "agri_destination_classification across active cities could NOT be verified", e);
        }
    }

    /** Package-private for direct assertion in tests, independent of the ApplicationReadyEvent wiring. */
    List<String> findActiveCitiesMissingAgriDestinationRows() {
        return jdbcOperations.queryForList(CITIES_MISSING_AGRI_DESTINATION_ROWS_SQL, String.class);
    }
}

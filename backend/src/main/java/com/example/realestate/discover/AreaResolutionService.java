package com.example.realestate.discover;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Resolves an ingested listing's geocoded area against canonical {@code areas} / reviewed
 * {@code area_alias} rows (#1887 PR3). READ-ONLY: every method here issues SELECTs only — this
 * service NEVER inserts or updates {@code areas}, {@code area_alias}, or any other canonical
 * geography table. It is a LOOKUP, not an onboarding path; area creation/update remains the sole
 * responsibility of {@link AreaOnboardingApplyService} (a different, forbidden-to-touch class in
 * this PR).
 *
 * <h2>Resolution order (first hit wins — approved OQ1: provider-first)</h2>
 * <ol>
 *   <li><b>PROVIDER_ID</b> — only attempted when both {@code provider} and
 *       {@code externalSourceId} are supplied. Looks for a single, distinct
 *       {@code matched_area_key} across APPLIED+FINALIZED+APPROVED
 *       {@code area_onboarding_candidate} rows for that provider/external-source-id pair.
 *       Zero matches → falls through to step 2. Exactly one distinct match → RESOLVED. Two or
 *       more DISTINCT matches → the provider signal is ambiguous and is treated as a stop, not a
 *       downgrade: this method returns UNRESOLVED immediately without falling through to steps
 *       2/3 (approved AC2).</li>
 *   <li><b>CANONICAL_KEY</b> — exact match of the normalised geocoded area_key against an ACTIVE
 *       {@code areas.area_key}. A malformed (non-4-segment) geocoded key is treated as "no
 *       canonical-key match" and falls through to step 3 — {@link AreaKeyFormat#normalise} is
 *       never allowed to throw into the ingestion write path.</li>
 *   <li><b>ALIAS</b> — city-scoped, reviewed {@code area_alias} match on the trimmed/lower-cased
 *       locality name. Miss → UNRESOLVED.</li>
 * </ol>
 *
 * <p>{@link #resolve} is defensive by design: any unexpected internal failure is logged and
 * degrades to {@link AreaResolution#unresolved()} rather than propagating, so a resolver bug can
 * never abort listing ingestion.
 */
@Service
public class AreaResolutionService {

    private static final Logger log = LoggerFactory.getLogger(AreaResolutionService.class);

    private final JdbcOperations jdbcOperations;

    public AreaResolutionService(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    /**
     * Resolves a listing's canonical area. Never throws — any failure degrades to
     * {@link AreaResolution#unresolved()}.
     *
     * @param cityId           the listing's city id (scopes the ALIAS step).
     * @param provider         provider identity for a curated-batch-sourced listing, or null for
     *                         an organic/scraped post with no provider concept.
     * @param externalSourceId provider-scoped external id for this listing/post, or null.
     * @param geocodedAreaKey  the raw area_key computed from geocoding (may be malformed or null).
     * @param locality         the raw locality string used for the ALIAS lookup, or null.
     */
    public AreaResolution resolve(
            int cityId, String provider, String externalSourceId, String geocodedAreaKey, String locality) {
        try {
            AreaResolution byProvider = resolveByProviderId(cityId, provider, externalSourceId);
            if (byProvider != null) {
                return byProvider;
            }

            AreaResolution byCanonicalKey = resolveByCanonicalKey(geocodedAreaKey);
            if (byCanonicalKey != null) {
                return byCanonicalKey;
            }

            AreaResolution byAlias = resolveByAlias(cityId, locality);
            if (byAlias != null) {
                return byAlias;
            }

            return AreaResolution.unresolved();
        } catch (Exception e) {
            // Defensive: a resolver bug must never propagate into the ingestion write path.
            log.warn("AreaResolutionService: unexpected error resolving cityId={} provider={} "
                            + "externalSourceId={} geocodedAreaKey={} — defaulting to UNRESOLVED: {}",
                    cityId, provider, externalSourceId, geocodedAreaKey, e.getMessage(), e);
            return AreaResolution.unresolved();
        }
    }

    /**
     * Step 1: PROVIDER_ID. Returns null (fall through) when provider/externalSourceId are absent
     * or when zero candidate rows match; returns {@link AreaResolution#unresolved()} directly
     * (NOT null — a stop, not a fall-through) when 2+ distinct matched_area_key values are found.
     */
    private AreaResolution resolveByProviderId(int cityId, String provider, String externalSourceId) {
        if (provider == null || provider.isBlank() || externalSourceId == null || externalSourceId.isBlank()) {
            return null;
        }
        List<String> matches = jdbcOperations.queryForList(
                PROVIDER_ID_MATCH_SQL, String.class, provider, externalSourceId, cityId, cityId);
        if (matches.isEmpty()) {
            return null;
        }
        if (matches.size() > 1) {
            log.warn("AreaResolutionService: ambiguous PROVIDER_ID match provider={} externalSourceId={} "
                            + "— {} distinct matched_area_key values; treating as UNRESOLVED (never guessed)",
                    provider, externalSourceId, matches.size());
            return AreaResolution.unresolved();
        }
        return AreaResolution.resolved(AreaResolution.Method.PROVIDER_ID, matches.get(0));
    }

    /**
     * Step 2: CANONICAL_KEY. Returns null (fall through) for a malformed key or a miss.
     */
    private AreaResolution resolveByCanonicalKey(String geocodedAreaKey) {
        if (geocodedAreaKey == null || geocodedAreaKey.isBlank()) {
            return null;
        }
        String normalised;
        try {
            normalised = AreaKeyFormat.normalise(geocodedAreaKey);
        } catch (IllegalArgumentException e) {
            // Malformed (non-4-segment) key — treated as "no canonical-key match", not an error.
            return null;
        }
        List<String> matches = jdbcOperations.queryForList(ACTIVE_AREA_BY_KEY_SQL, String.class, normalised);
        if (matches.isEmpty()) {
            return null;
        }
        return AreaResolution.resolved(AreaResolution.Method.CANONICAL_KEY, matches.get(0));
    }

    /**
     * Step 3: ALIAS, city-scoped. Returns null only in the sense that callers treat a miss as
     * final — but for symmetry with the other steps this returns null on a miss (interpreted by
     * {@link #resolve} as "no match found by any step", i.e. UNRESOLVED).
     */
    private AreaResolution resolveByAlias(int cityId, String locality) {
        if (locality == null || locality.isBlank()) {
            return null;
        }
        // AreaOnboardingService.normaliseName's exact semantics (trim().toLowerCase()) — that
        // method is private to AreaOnboardingService (a forbidden-to-touch class in this PR), so
        // the same normalisation is replicated verbatim here rather than exposing it there.
        String aliasNormalised = locality.trim().toLowerCase();
        List<String> matches = jdbcOperations.queryForList(
                ALIAS_MATCH_SQL, String.class, cityId, cityId, aliasNormalised);
        if (matches.isEmpty()) {
            return null;
        }
        return AreaResolution.resolved(AreaResolution.Method.ALIAS, matches.get(0));
    }

    // ── SQL (canonical tables: SELECT only) ─────────────────────────────────────

    private static final String PROVIDER_ID_MATCH_SQL = """
            SELECT DISTINCT a.area_key
            FROM area_onboarding_candidate c
            JOIN area_onboarding_batch b ON c.batch_id = b.id
            JOIN areas a ON a.area_key = c.matched_area_key
            WHERE b.provider = ?
              AND c.external_source_id = ?
              AND b.city_id = ?
              AND a.city_id = ?
              AND a.lifecycle_status = 'ACTIVE'
              AND b.apply_status = 'APPLIED'
              AND b.review_status = 'FINALIZED'
              AND c.review_decision = 'APPROVED'
            """;

    private static final String ACTIVE_AREA_BY_KEY_SQL =
            "SELECT area_key FROM areas WHERE area_key = ? AND lifecycle_status = 'ACTIVE'";

    private static final String ALIAS_MATCH_SQL = """
            SELECT aa.area_key
            FROM area_alias aa
            JOIN areas a ON a.area_key = aa.area_key
            WHERE aa.city_id = ?
              AND a.city_id = ?
              AND a.lifecycle_status = 'ACTIVE'
              AND aa.alias_normalised = ?
            """;
}

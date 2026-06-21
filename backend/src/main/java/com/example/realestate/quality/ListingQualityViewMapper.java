package com.example.realestate.quality;

import com.example.realestate.broker.dto.EngagementSummary;
import com.example.realestate.broker.dto.ListingQualityItem;
import com.example.realestate.broker.dto.QualityFinding;
import com.example.realestate.broker.dto.QualityFixAction;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Pure, stateless mapper that converts persisted quality data into
 * {@link ListingQualityItem} view objects.
 *
 * <h3>Breakdown JSON discrimination</h3>
 * The {@code quality_breakdown} column may hold two shapes:
 * <ol>
 *   <li><b>Canonical</b>: {@code {"overall":N,"computedAt":"...","components":[...]}}
 *       — produced by {@link QualityScoreService#toCanonicalJson}.</li>
 *   <li><b>Insufficient-data marker</b>: {@code {"status":"insufficient_data","missing":[...]}}
 *       — produced when the scorer cannot evaluate.</li>
 * </ol>
 * Detection rule: if the root object has a {@code "components"} array field, it is
 * canonical. Otherwise it is an insufficient-data or unknown marker and is treated as
 * NOT_SCORED.
 *
 * <h3>Band boundaries (single source of truth)</h3>
 * <ul>
 *   <li>score &ge; 80 → BUYER_READY</li>
 *   <li>50 &le; score &lt; 80 → NEEDS_IMPROVEMENT</li>
 *   <li>score &lt; 50 → PRIORITY_FIX</li>
 *   <li>score == null → UNSCORED</li>
 * </ul>
 *
 * <h3>Impact tiers</h3>
 * {@code impactScore = weightBp * (100 - componentScore)} — computed only for applied
 * components below the needs-work threshold ({@link #NEEDS_WORK_SCORE_THRESHOLD}).
 * Uses {@code long} arithmetic (max value: 2000 * 100 = 200 000 — never overflows).
 * Ranked: HIGH ≥ {@link #HIGH_IMPACT_MIN}, MEDIUM ≥ {@link #MEDIUM_IMPACT_MIN}, else LOW.
 *
 * <h3>Thread safety</h3>
 * Jackson {@link ObjectMapper} is thread-safe after construction; this bean is safe for
 * concurrent use.
 */
@Component
public class ListingQualityViewMapper {

    private static final Logger log = LoggerFactory.getLogger(ListingQualityViewMapper.class);

    // -----------------------------------------------------------------------
    // Band boundary constants (single source of truth — spec §1)
    // -----------------------------------------------------------------------

    /** Minimum score (inclusive) for BUYER_READY band. */
    public static final int BUYER_READY_MIN = 80;

    /** Minimum score (inclusive) for NEEDS_IMPROVEMENT band. */
    public static final int NEEDS_IMPROVEMENT_MIN = 50;

    // score < NEEDS_IMPROVEMENT_MIN → PRIORITY_FIX

    // -----------------------------------------------------------------------
    // Fix-plan impact tier constants
    // -----------------------------------------------------------------------

    /**
     * Components with score strictly below this threshold are included in fixPlan.
     * Score == threshold is "passing" and excluded from the fix plan.
     */
    public static final int NEEDS_WORK_SCORE_THRESHOLD = 75;

    /**
     * impactScore >= HIGH_IMPACT_MIN → HIGH.
     * impactScore range: [weightBp * 26, weightBp * 100] for below-75 components.
     * Using 100 000 (e.g. TRUST 2000 * 50 = 100 000) as HIGH boundary captures the worst performers.
     */
    public static final long HIGH_IMPACT_MIN = 100_000L;

    /** impactScore >= MEDIUM_IMPACT_MIN → MEDIUM; else LOW. */
    public static final long MEDIUM_IMPACT_MIN = 40_000L;

    // -----------------------------------------------------------------------
    // Action copy by component type (server-side authored — never from breakdown)
    // -----------------------------------------------------------------------

    private static String actionForComponent(String componentType) {
        return switch (componentType) {
            case "TRUST"             -> "Complete identity and authority verification to improve your trust tier";
            case "PHOTOS"           -> "Add more high-quality photos (aim for 10+) to attract buyers";
            case "DESCRIPTION"      -> "Expand the listing description to at least 300 characters";
            case "KEY_FIELDS"       -> "Fill in all key fields: locality, area, property type, and price";
            case "PRICE_SANITY"     -> "Review your price against comparable listings in the area";
            case "LOCATION"         -> "Confirm the exact location by adding coordinates and area tag";
            case "AGRI_COMPLETENESS" -> "Complete all agricultural details (water source, soil type, road access, etc.)";
            case "RECENCY"          -> "Refresh your listing to signal availability to buyers";
            default                  -> "Update this section to improve listing quality";
        };
    }

    // -----------------------------------------------------------------------
    // Jackson mapper (thread-safe; created once at construction time)
    // -----------------------------------------------------------------------

    private final ObjectMapper objectMapper = new ObjectMapper();

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Maps persisted quality data for one listing into a {@link ListingQualityItem}.
     *
     * @param listingId       Listing UUID.
     * @param title           Listing title (may be null).
     * @param status          Listing status string.
     * @param qualityScore    Persisted quality_score (may be null).
     * @param qualityBreakdown Persisted quality_breakdown JSON string (may be null).
     * @param qualityComputedAt Persisted quality_computed_at (may be null).
     * @return A fully-populated {@link ListingQualityItem}.
     */
    public ListingQualityItem map(
            UUID listingId,
            String title,
            String status,
            Short qualityScore,
            String qualityBreakdown,
            Instant qualityComputedAt) {

        if (qualityScore == null) {
            // NOT_SCORED: score is null regardless of breakdown content.
            return unscoredItem(listingId, title, status, qualityComputedAt);
        }

        // score is non-null — attempt to parse canonical breakdown.
        List<QualityFinding> findings = List.of();
        List<QualityFixAction> fixPlan = List.of();

        if (qualityBreakdown != null && !qualityBreakdown.isBlank()) {
            try {
                JsonNode root = objectMapper.readTree(qualityBreakdown);
                JsonNode componentsNode = root.get("components");
                if (componentsNode != null && componentsNode.isArray()) {
                    // Canonical shape — parse components
                    findings = new ArrayList<>();
                    fixPlan = new ArrayList<>();
                    for (JsonNode compNode : componentsNode) {
                        boolean applied = compNode.path("applied").asBoolean(false);
                        if (!applied) {
                            continue; // applied==false components excluded from both lists
                        }
                        String type = compNode.path("type").asText("");
                        int score = compNode.path("score").asInt(0);
                        String finding = compNode.path("finding").asText("");

                        findings.add(new QualityFinding(type, score, true, finding));

                        // Fix plan: only for components below the needs-work threshold
                        if (score < NEEDS_WORK_SCORE_THRESHOLD) {
                            int weightBp = compNode.path("weightBp").asInt(0);
                            long impactScore = (long) weightBp * (100 - score);
                            String impact = impactTier(impactScore);
                            String action = actionForComponent(type);
                            String editDeepLink = "/broker/listings/" + listingId + "/edit";
                            fixPlan.add(new QualityFixAction(type, impact, action, editDeepLink));
                        }
                    }
                    // Sort fixPlan by impact descending (HIGH → MEDIUM → LOW)
                    fixPlan.sort((a, b) -> impactOrdinal(b.impact()) - impactOrdinal(a.impact()));
                    findings = List.copyOf(findings);
                    fixPlan = List.copyOf(fixPlan);
                }
                // else: no "components" field → insufficient_data or unknown shape → empty lists
            } catch (Exception e) {
                log.warn("Failed to parse quality_breakdown for listing {}: {}", listingId, e.getMessage());
                // Defensive: leave findings/fixPlan empty, still return the score
            }
        }

        int score = qualityScore.intValue();
        String band = band(score);

        return new ListingQualityItem(
                listingId,
                title,
                status,
                "SCORED",
                score,
                band,
                qualityComputedAt,
                findings,
                fixPlan,
                EngagementSummary.UNAVAILABLE
        );
    }

    // -----------------------------------------------------------------------
    // Band logic (single source of truth)
    // -----------------------------------------------------------------------

    /**
     * Maps a quality score to a band string.
     * Boundaries: score&ge;80=BUYER_READY, 50&le;score&lt;80=NEEDS_IMPROVEMENT, score&lt;50=PRIORITY_FIX.
     */
    public static String band(int score) {
        if (score >= BUYER_READY_MIN) {
            return "BUYER_READY";
        } else if (score >= NEEDS_IMPROVEMENT_MIN) {
            return "NEEDS_IMPROVEMENT";
        } else {
            return "PRIORITY_FIX";
        }
    }

    /**
     * Returns true when the listing qualifies as a "priority fix" for the
     * {@code priorityFixesCount} aggregate: band==PRIORITY_FIX OR has >=1 HIGH-impact fix.
     */
    public static boolean isPriorityFix(ListingQualityItem item) {
        if ("PRIORITY_FIX".equals(item.band())) {
            return true;
        }
        return item.fixPlan().stream().anyMatch(f -> "HIGH".equals(f.impact()));
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private static ListingQualityItem unscoredItem(
            UUID listingId, String title, String status, Instant computedAt) {
        return new ListingQualityItem(
                listingId,
                title,
                status,
                "NOT_SCORED",
                null,
                "UNSCORED",
                computedAt,
                List.of(),
                List.of(),
                EngagementSummary.UNAVAILABLE
        );
    }

    private static String impactTier(long impactScore) {
        if (impactScore >= HIGH_IMPACT_MIN) {
            return "HIGH";
        } else if (impactScore >= MEDIUM_IMPACT_MIN) {
            return "MEDIUM";
        } else {
            return "LOW";
        }
    }

    private static int impactOrdinal(String impact) {
        return switch (impact) {
            case "HIGH"   -> 2;
            case "MEDIUM" -> 1;
            default       -> 0;
        };
    }
}

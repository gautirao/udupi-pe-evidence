package com.example.realestate.quality;

import com.example.realestate.broker.dto.ListingQualityItem;
import com.example.realestate.broker.dto.QualityFixAction;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Pure unit tests for {@link ListingQualityViewMapper}.
 *
 * <p>Breakdown JSON fixtures are pinned to the exact canonical output of
 * {@link QualityScoreService#toCanonicalJson} — field order: overall, computedAt, components[],
 * with each component having: type, score, weightBp, applied, finding.
 */
class ListingQualityViewMapperTest {

    private final ListingQualityViewMapper mapper = new ListingQualityViewMapper();

    private static final UUID LISTING_ID = UUID.fromString("00000000-0000-0000-0000-000000000001");
    private static final Instant COMPUTED_AT = Instant.parse("2026-06-20T10:00:00Z");

    // -----------------------------------------------------------------------
    // Canonical breakdown fixture helpers
    // -----------------------------------------------------------------------

    /**
     * Builds a canonical breakdown JSON exactly as {@link QualityScoreService#toCanonicalJson}
     * produces it. Field order: overall, computedAt, components[].
     * Component field order: type, score, weightBp, applied, finding.
     */
    private static String canonicalJson(int overall, ComponentEntry... components) {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"overall\":").append(overall).append(',');
        sb.append("\"computedAt\":\"").append(COMPUTED_AT).append("\",");
        sb.append("\"components\":[");
        for (int i = 0; i < components.length; i++) {
            if (i > 0) sb.append(',');
            ComponentEntry c = components[i];
            sb.append('{');
            sb.append("\"type\":\"").append(c.type()).append("\",");
            sb.append("\"score\":").append(c.score()).append(',');
            sb.append("\"weightBp\":").append(c.weightBp()).append(',');
            sb.append("\"applied\":").append(c.applied()).append(',');
            sb.append("\"finding\":\"").append(c.finding()).append('"');
            sb.append('}');
        }
        sb.append("]}");
        return sb.toString();
    }

    private record ComponentEntry(String type, int score, int weightBp, boolean applied, String finding) {}

    // -----------------------------------------------------------------------
    // 1. Null score → NOT_SCORED, UNSCORED band
    // -----------------------------------------------------------------------

    @Test
    void nullScore_returnsNotScored() {
        ListingQualityItem item = mapper.map(LISTING_ID, "Test listing", "DRAFT",
                null, null, null);

        assertThat(item.scoreStatus()).isEqualTo("NOT_SCORED");
        assertThat(item.band()).isEqualTo("UNSCORED");
        assertThat(item.qualityScore()).isNull();
        assertThat(item.findings()).isEmpty();
        assertThat(item.fixPlan()).isEmpty();
        assertThat(item.computedAt()).isNull();
    }

    @Test
    void nullScore_withNonNullComputedAt_returnsNotScored() {
        // computedAt may be non-null on insufficient_data path
        ListingQualityItem item = mapper.map(LISTING_ID, "Test listing", "LIVE",
                null, "{\"status\":\"insufficient_data\",\"missing\":[\"photos\"]}", COMPUTED_AT);

        assertThat(item.scoreStatus()).isEqualTo("NOT_SCORED");
        assertThat(item.band()).isEqualTo("UNSCORED");
        assertThat(item.computedAt()).isEqualTo(COMPUTED_AT);
        assertThat(item.findings()).isEmpty();
        assertThat(item.fixPlan()).isEmpty();
    }

    // -----------------------------------------------------------------------
    // 2. Band boundary tests (single source of truth)
    // -----------------------------------------------------------------------

    @Test
    void score80_returnsBuyerReady() {
        String breakdown = canonicalJson(80,
                new ComponentEntry("TRUST", 80, 2000, true, "Tier B — verified with minor gaps"));
        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 80, breakdown, COMPUTED_AT);
        assertThat(item.band()).isEqualTo("BUYER_READY");
        assertThat(item.scoreStatus()).isEqualTo("SCORED");
        assertThat(item.qualityScore()).isEqualTo(80);
    }

    @Test
    void score79_returnsNeedsImprovement() {
        String breakdown = canonicalJson(79,
                new ComponentEntry("TRUST", 79, 2000, true, "Tier B — verified with minor gaps"));
        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 79, breakdown, COMPUTED_AT);
        assertThat(item.band()).isEqualTo("NEEDS_IMPROVEMENT");
    }

    @Test
    void score50_returnsNeedsImprovement() {
        String breakdown = canonicalJson(50,
                new ComponentEntry("TRUST", 50, 2000, true, "Tier C — partially verified"));
        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 50, breakdown, COMPUTED_AT);
        assertThat(item.band()).isEqualTo("NEEDS_IMPROVEMENT");
    }

    @Test
    void score49_returnsPriorityFix() {
        String breakdown = canonicalJson(49,
                new ComponentEntry("TRUST", 49, 2000, true, "Tier D — minimal verification"));
        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 49, breakdown, COMPUTED_AT);
        assertThat(item.band()).isEqualTo("PRIORITY_FIX");
    }

    @Test
    void score0_returnsPriorityFix() {
        String breakdown = canonicalJson(0,
                new ComponentEntry("TRUST", 0, 2000, true, "No verification signals"));
        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 0, breakdown, COMPUTED_AT);
        assertThat(item.band()).isEqualTo("PRIORITY_FIX");
    }

    @Test
    void score100_returnsBuyerReady() {
        String breakdown = canonicalJson(100,
                new ComponentEntry("TRUST", 100, 2000, true, "Tier A — highest verification level"));
        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 100, breakdown, COMPUTED_AT);
        assertThat(item.band()).isEqualTo("BUYER_READY");
    }

    // -----------------------------------------------------------------------
    // 3. Applied-only filtering: applied==false components excluded from findings + fixPlan
    // -----------------------------------------------------------------------

    @Test
    void notAppliedComponents_excludedFromFindingsAndFixPlan() {
        // AGRI_COMPLETENESS not applied (non-agri listing); TRUST applied with score 25
        String breakdown = canonicalJson(25,
                new ComponentEntry("TRUST", 25, 2000, true, "Tier D — minimal verification"),
                new ComponentEntry("AGRI_COMPLETENESS", 0, 1000, false, "Not applicable (non-agricultural listing)"));

        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 25, breakdown, COMPUTED_AT);

        assertThat(item.findings()).hasSize(1);
        assertThat(item.findings().get(0).component()).isEqualTo("TRUST");
        // AGRI_COMPLETENESS must not appear in findings
        assertThat(item.findings()).noneMatch(f -> f.component().equals("AGRI_COMPLETENESS"));
        // fixPlan should only contain applied components below threshold
        assertThat(item.fixPlan()).noneMatch(f -> f.component().equals("AGRI_COMPLETENESS"));
    }

    // -----------------------------------------------------------------------
    // 4. Fix plan: only below NEEDS_WORK_SCORE_THRESHOLD (75)
    // -----------------------------------------------------------------------

    @Test
    void score75_notInFixPlan() {
        // score==75 is exactly at threshold — should NOT appear in fix plan
        String breakdown = canonicalJson(75,
                new ComponentEntry("PHOTOS", 75, 1500, true, "Good coverage"),
                new ComponentEntry("TRUST", 100, 2000, true, "Tier A — highest verification level"));
        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 87, breakdown, COMPUTED_AT);
        assertThat(item.fixPlan()).isEmpty();
    }

    @Test
    void score74_inFixPlan() {
        // score==74 is below threshold — should appear in fix plan
        String breakdown = canonicalJson(74,
                new ComponentEntry("DESCRIPTION", 74, 1500, true, "Good description (120 characters)"));
        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 74, breakdown, COMPUTED_AT);
        assertThat(item.fixPlan()).hasSize(1);
        assertThat(item.fixPlan().get(0).component()).isEqualTo("DESCRIPTION");
    }

    // -----------------------------------------------------------------------
    // 5. Impact tier ordering: HIGH > MEDIUM > LOW
    // -----------------------------------------------------------------------

    @Test
    void fixPlan_orderedByImpactDescending() {
        // RECENCY: weightBp=500, score=10 → impactScore = 500 * 90 = 45 000 → MEDIUM
        // TRUST: weightBp=2000, score=0 → impactScore = 2000 * 100 = 200 000 → HIGH
        // PHOTOS: weightBp=1500, score=50 → impactScore = 1500 * 50 = 75 000 → LOW (75000 < 100000 but >= 40000 → MEDIUM)
        // Let's use values that clearly hit each tier:
        // HIGH: weightBp=2000, score=0 → impactScore=200000 >= 100000
        // MEDIUM: weightBp=500, score=10 → impactScore=45000 >= 40000
        // LOW: weightBp=500, score=80 → but score 80 >= threshold 75, not in fix plan. use score=70 → 500*(100-70)=15000 < 40000 → LOW
        String breakdown = canonicalJson(20,
                new ComponentEntry("TRUST", 0, 2000, true, "No verification signals"),
                new ComponentEntry("RECENCY", 10, 500, true, "Old listing"),
                new ComponentEntry("AGRI_COMPLETENESS", 70, 500, true, "2 of 8 fields complete"));

        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 20, breakdown, COMPUTED_AT);

        // All three are below threshold (0, 10, 70 all < 75)
        assertThat(item.fixPlan()).hasSize(3);
        assertThat(item.fixPlan().get(0).impact()).isEqualTo("HIGH");    // TRUST
        assertThat(item.fixPlan().get(1).impact()).isEqualTo("MEDIUM");  // RECENCY
        assertThat(item.fixPlan().get(2).impact()).isEqualTo("LOW");     // AGRI_COMPLETENESS
    }

    // -----------------------------------------------------------------------
    // 6. Insufficient-data discrimination: {"status":"insufficient_data",...} → empty lists
    // -----------------------------------------------------------------------

    @Test
    void insufficientData_breakdown_returnsEmptyFindingsAndFixPlan() {
        // Score is non-null but breakdown is insufficient-data marker (no "components" key)
        String breakdown = "{\"status\":\"insufficient_data\",\"missing\":[\"photos\",\"description\"]}";

        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 30, breakdown, COMPUTED_AT);

        assertThat(item.scoreStatus()).isEqualTo("SCORED");
        assertThat(item.qualityScore()).isEqualTo(30);
        assertThat(item.findings()).isEmpty();
        assertThat(item.fixPlan()).isEmpty();
    }

    // -----------------------------------------------------------------------
    // 7. Null breakdown with non-null score → scored with empty lists (no NPE)
    // -----------------------------------------------------------------------

    @Test
    void nullBreakdown_withNonNullScore_returnsEmptyFindingsNoNPE() {
        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 60, null, COMPUTED_AT);

        assertThat(item.scoreStatus()).isEqualTo("SCORED");
        assertThat(item.qualityScore()).isEqualTo(60);
        assertThat(item.band()).isEqualTo("NEEDS_IMPROVEMENT");
        assertThat(item.findings()).isEmpty();
        assertThat(item.fixPlan()).isEmpty();
    }

    // -----------------------------------------------------------------------
    // 8. Finding text is verbatim from breakdown (not re-authored)
    // -----------------------------------------------------------------------

    @Test
    void finding_textIsVerbatimFromBreakdown() {
        String verbatimFinding = "10 photos — excellent coverage";
        String breakdown = canonicalJson(100,
                new ComponentEntry("PHOTOS", 100, 1500, true, verbatimFinding));

        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 100, breakdown, COMPUTED_AT);

        assertThat(item.findings()).hasSize(1);
        assertThat(item.findings().get(0).finding()).isEqualTo(verbatimFinding);
    }

    // -----------------------------------------------------------------------
    // 9. editDeepLink format
    // -----------------------------------------------------------------------

    @Test
    void fixPlan_editDeepLinkFormat() {
        String breakdown = canonicalJson(0,
                new ComponentEntry("TRUST", 0, 2000, true, "No verification signals"));

        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 0, breakdown, COMPUTED_AT);

        assertThat(item.fixPlan()).hasSize(1);
        assertThat(item.fixPlan().get(0).editDeepLink())
                .isEqualTo("/broker/listings/" + LISTING_ID + "/edit");
    }

    // -----------------------------------------------------------------------
    // 10. isPriorityFix: band==PRIORITY_FIX OR >=1 HIGH-impact fix (DISTINCT rule)
    // -----------------------------------------------------------------------

    @Test
    void isPriorityFix_band() {
        String breakdown = canonicalJson(30,
                new ComponentEntry("TRUST", 30, 2000, true, "Tier D — minimal verification"),
                new ComponentEntry("PHOTOS", 30, 1500, true, "1 photo — very limited coverage"));
        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 30, breakdown, COMPUTED_AT);
        assertThat(item.band()).isEqualTo("PRIORITY_FIX");
        assertThat(ListingQualityViewMapper.isPriorityFix(item)).isTrue();
    }

    @Test
    void isPriorityFix_highImpactFix_evenIfBandIsNeedsImprovement() {
        // score=60 → NEEDS_IMPROVEMENT band, but TRUST score=0 → impactScore=200000 → HIGH
        // So isPriorityFix must be true
        String breakdown = canonicalJson(60,
                new ComponentEntry("TRUST", 0, 2000, true, "No verification signals"),
                new ComponentEntry("PHOTOS", 100, 1500, true, "10 photos — excellent coverage"),
                new ComponentEntry("DESCRIPTION", 100, 1500, true, "Rich description"),
                new ComponentEntry("KEY_FIELDS", 100, 1500, true, "All key fields present"),
                new ComponentEntry("LOCATION", 100, 1000, true, "Location confirmed"),
                new ComponentEntry("RECENCY", 100, 500, true, "Fresh listing"),
                new ComponentEntry("PRICE_SANITY", 0, 1000, false, "Comparables unavailable"));
        // Weighted: (0*2000+100*1500+100*1500+100*1500+100*1000+100*500)/(2000+1500+1500+1500+1000+500)=...
        // Regardless of band, with TRUST score=0 impactScore=200000 >= HIGH_IMPACT_MIN
        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 60, breakdown, COMPUTED_AT);
        // TRUST is applied and score=0 < 75, so it's in fixPlan with impact HIGH
        boolean hasTrustHighFix = item.fixPlan().stream()
                .anyMatch(f -> "TRUST".equals(f.component()) && "HIGH".equals(f.impact()));
        assertThat(hasTrustHighFix).isTrue();
        assertThat(ListingQualityViewMapper.isPriorityFix(item)).isTrue();
    }

    @Test
    void isPriorityFix_buyerReady_isFalse() {
        String breakdown = canonicalJson(90,
                new ComponentEntry("TRUST", 90, 2000, true, "Tier A — highest verification level"),
                new ComponentEntry("PHOTOS", 90, 1500, true, "10 photos — excellent coverage"));
        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 90, breakdown, COMPUTED_AT);
        assertThat(item.band()).isEqualTo("BUYER_READY");
        assertThat(ListingQualityViewMapper.isPriorityFix(item)).isFalse();
    }

    // -----------------------------------------------------------------------
    // 11. Engagement is always UNAVAILABLE
    // -----------------------------------------------------------------------

    @Test
    void engagement_alwaysUnavailable() {
        ListingQualityItem scored = mapper.map(LISTING_ID, "T", "LIVE", (short) 85,
                canonicalJson(85, new ComponentEntry("TRUST", 85, 2000, true, "Tier A")), COMPUTED_AT);
        assertThat(scored.engagement().status()).isEqualTo("UNAVAILABLE");
        assertThat(scored.engagement().views()).isNull();
        assertThat(scored.engagement().enquiries()).isNull();
        assertThat(scored.engagement().enquiryRate()).isNull();

        ListingQualityItem unscored = mapper.map(LISTING_ID, "T", "DRAFT", null, null, null);
        assertThat(unscored.engagement().status()).isEqualTo("UNAVAILABLE");
    }

    // -----------------------------------------------------------------------
    // 12. impactScore arithmetic — never overflows int/short
    // -----------------------------------------------------------------------

    @Test
    void impactScore_trustScore0_isHighImpact() {
        // TRUST weightBp=2000, score=0 → impactScore = 2000 * 100 = 200 000 → HIGH
        // 200 000 fits in long; verify tier assignment
        String breakdown = canonicalJson(0,
                new ComponentEntry("TRUST", 0, 2000, true, "No verification signals — listing has not been reviewed"));
        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 0, breakdown, COMPUTED_AT);
        assertThat(item.fixPlan()).hasSize(1);
        assertThat(item.fixPlan().get(0).impact()).isEqualTo("HIGH");
    }

    @Test
    void impactScore_recencyScore10_isMediumImpact() {
        // RECENCY weightBp=500, score=10 → impactScore = 500 * 90 = 45 000 → MEDIUM (>=40000 <100000)
        String breakdown = canonicalJson(10,
                new ComponentEntry("RECENCY", 10, 500, true, "Listing is over a year old"));
        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 10, breakdown, COMPUTED_AT);
        assertThat(item.fixPlan()).hasSize(1);
        assertThat(item.fixPlan().get(0).impact()).isEqualTo("MEDIUM");
    }

    @Test
    void impactScore_lowScoreSmallWeight_isLowImpact() {
        // RECENCY weightBp=500, score=70 → impactScore = 500 * 30 = 15 000 → LOW (<40000)
        String breakdown = canonicalJson(70,
                new ComponentEntry("RECENCY", 70, 500, true, "Listing posted 100 days ago — moderately aged"));
        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 70, breakdown, COMPUTED_AT);
        assertThat(item.fixPlan()).hasSize(1);
        assertThat(item.fixPlan().get(0).impact()).isEqualTo("LOW");
    }

    // -----------------------------------------------------------------------
    // 13. Malformed JSON → defensive: scored with empty lists, no exception
    // -----------------------------------------------------------------------

    @Test
    void malformedBreakdownJson_noException_emptyFindingsReturned() {
        String breakdown = "not-valid-json{{{";
        ListingQualityItem item = mapper.map(LISTING_ID, "T", "LIVE", (short) 55, breakdown, COMPUTED_AT);
        assertThat(item.scoreStatus()).isEqualTo("SCORED");
        assertThat(item.qualityScore()).isEqualTo(55);
        assertThat(item.findings()).isEmpty();
        assertThat(item.fixPlan()).isEmpty();
    }
}

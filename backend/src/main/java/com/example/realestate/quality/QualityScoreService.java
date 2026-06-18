package com.example.realestate.quality;

import com.example.realestate.ai.PropertyType;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Pure, stateless service that computes a {@link QualityScore} from a
 * {@link QualityScoreInputs} value object.
 *
 * <h3>Purity guarantees</h3>
 * <ul>
 *   <li>No database or HTTP access.</li>
 *   <li>No {@code System.currentTimeMillis()}, {@code Instant.now()}, or
 *       {@code Clock} calls — the caller supplies {@link QualityScoreInputs#now()}.</li>
 *   <li>No {@code Random} or non-deterministic operations.</li>
 *   <li>All string case-folding uses {@code Locale.ROOT} — never the JVM default
 *       locale.</li>
 *   <li>Integer-only arithmetic (no floating-point rounding surprises).</li>
 * </ul>
 *
 * <h3>Scoring formula</h3>
 * <pre>
 *   overall = clamp( round( sum(score_i * weightBp_i) / sum(appliedWeightBp_i) ), 0, 100 )
 * </pre>
 * Division is performed with long arithmetic; rounding is half-up (standard integer
 * {@code (numerator + denominator/2) / denominator}).
 *
 * <h3>Determinism</h3>
 * Components are built by iterating {@link QualityComponentType#values()} in enum
 * declaration order — never via a HashMap — so the output list is byte-identical across
 * calls with the same inputs. Use {@link #toCanonicalJson(QualityScore)} to obtain a
 * stable JSON string for persistence.
 */
@Service
public class QualityScoreService {

    // -----------------------------------------------------------------------
    // Threshold constants — single source of truth (spec § 4)
    // -----------------------------------------------------------------------

    /** TRUST: unknown/null tier defaults to lowest band (not neutral 50). */
    static final int TRUST_SCORE_A = 100;
    static final int TRUST_SCORE_B = 75;
    static final int TRUST_SCORE_C = 50;
    static final int TRUST_SCORE_D = 25;
    static final int TRUST_SCORE_UNKNOWN = 25;

    /** PHOTOS: band thresholds (minimum photo count to reach each band). */
    static final int PHOTOS_BAND_HIGH_MIN   = 10;   // score 100
    static final int PHOTOS_BAND_GOOD_MIN   = 5;    // score 75
    static final int PHOTOS_BAND_FAIR_MIN   = 2;    // score 50
    static final int PHOTOS_BAND_LOW_MIN    = 1;    // score 25
    // 0 photos → score 0 ("No photos provided")

    /** DESCRIPTION: character-count thresholds. */
    static final int DESC_RICH_CHARS    = 300;  // score 100
    static final int DESC_GOOD_CHARS    = 150;  // score 75
    static final int DESC_SHORT_CHARS   = 50;   // score 50
    // < 50 chars → score 25 ("Very short description")
    // null/blank → score 0 ("No description provided")

    /** PRICE_SANITY: ratio thresholds (percentage of median, integer). */
    /** Listings at/below 100% of median score 100. */
    static final int PRICE_SANITY_NEUTRAL_PCT   = 100;
    /** Above 150% of median → soft reduction applied. */
    static final int PRICE_SANITY_HIGH_PCT      = 150;
    /** Above 200% of median → lowest non-zero score. */
    static final int PRICE_SANITY_VERY_HIGH_PCT = 200;

    /** RECENCY: age thresholds in days. */
    static final int RECENCY_FRESH_DAYS    = 30;   // score 100
    static final int RECENCY_RECENT_DAYS   = 90;   // score 75
    static final int RECENCY_MODERATE_DAYS = 180;  // score 50
    static final int RECENCY_STALE_DAYS    = 365;  // score 25
    // > 365 days → score 10 ("Listing is over a year old")
    // null createdAt → score 0 ("Creation date unavailable")

    /** Total agri sub-fields counted for AGRI_COMPLETENESS. */
    static final int AGRI_FIELD_COUNT = 8;

    // -----------------------------------------------------------------------
    // Public API
    // -----------------------------------------------------------------------

    /**
     * Compute a quality score from the given inputs.
     *
     * @param in All scoring inputs; {@code in.now()} must not be null.
     * @return   A fully-populated {@link QualityScore} in enum-declaration component order.
     */
    public QualityScore compute(QualityScoreInputs in) {
        List<QualityComponent> components = new ArrayList<>(QualityComponentType.values().length);

        for (QualityComponentType type : QualityComponentType.values()) {
            QualityComponent component = switch (type) {
                case TRUST             -> scoreTrust(in);
                case PHOTOS            -> scorePhotos(in);
                case DESCRIPTION       -> scoreDescription(in);
                case KEY_FIELDS        -> scoreKeyFields(in);
                case PRICE_SANITY      -> scorePriceSanity(in);
                case LOCATION          -> scoreLocation(in);
                case AGRI_COMPLETENESS -> scoreAgriCompleteness(in);
                case RECENCY           -> scoreRecency(in);
            };
            components.add(component);
        }

        int overall = computeOverall(components);
        return new QualityScore(overall, List.copyOf(components), in.now());
    }

    // -----------------------------------------------------------------------
    // Per-dimension scorers
    // -----------------------------------------------------------------------

    private QualityComponent scoreTrust(QualityScoreInputs in) {
        String tier = in.trustTier();
        if (tier == null) {
            return component(QualityComponentType.TRUST, TRUST_SCORE_UNKNOWN, true,
                    "No verification signals — listing has not been reviewed");
        }
        int score = switch (tier.toUpperCase(Locale.ROOT)) {
            case "A" -> TRUST_SCORE_A;
            case "B" -> TRUST_SCORE_B;
            case "C" -> TRUST_SCORE_C;
            case "D" -> TRUST_SCORE_D;
            default  -> TRUST_SCORE_UNKNOWN;
        };
        String finding = switch (tier.toUpperCase(Locale.ROOT)) {
            case "A" -> "Tier A — highest verification level";
            case "B" -> "Tier B — verified with minor gaps";
            case "C" -> "Tier C — partially verified";
            case "D" -> "Tier D — minimal verification";
            default  -> "No verification signals — unrecognised tier";
        };
        return component(QualityComponentType.TRUST, score, true, finding);
    }

    private QualityComponent scorePhotos(QualityScoreInputs in) {
        int count = in.photoCount();
        if (count <= 0) {
            return component(QualityComponentType.PHOTOS, 0, true,
                    "No photos provided");
        }
        int score;
        String finding;
        if (count >= PHOTOS_BAND_HIGH_MIN) {
            score = 100; finding = count + " photos — excellent coverage";
        } else if (count >= PHOTOS_BAND_GOOD_MIN) {
            score = 75;  finding = count + " photos — good coverage";
        } else if (count >= PHOTOS_BAND_FAIR_MIN) {
            score = 50;  finding = count + " photos — limited coverage";
        } else {
            score = 25;  finding = count + " photo — very limited coverage, consider adding more";
        }
        return component(QualityComponentType.PHOTOS, score, true, finding);
    }

    private QualityComponent scoreDescription(QualityScoreInputs in) {
        String desc = in.description();
        if (desc == null || desc.isBlank()) {
            return component(QualityComponentType.DESCRIPTION, 0, true,
                    "No description provided");
        }
        int len = desc.strip().length();
        int score;
        String finding;
        if (len >= DESC_RICH_CHARS) {
            score = 100; finding = "Rich description (" + len + " characters)";
        } else if (len >= DESC_GOOD_CHARS) {
            score = 75;  finding = "Good description (" + len + " characters)";
        } else if (len >= DESC_SHORT_CHARS) {
            score = 50;  finding = "Short description (" + len + " characters) — consider expanding";
        } else {
            score = 25;  finding = "Very short description (" + len + " characters) — buyers need more detail";
        }
        return component(QualityComponentType.DESCRIPTION, score, true, finding);
    }

    private QualityComponent scoreKeyFields(QualityScoreInputs in) {
        // Fields: title (via description non-blank as proxy for title presence is wrong;
        // KEY_FIELDS checks area, locality, price, propertyType).
        // title is not in inputs — we check the 4 directly available key fields:
        // locality, areaKey, listingPricePaise, propertyType.
        int missing = 0;
        List<String> gaps = new ArrayList<>();

        if (isBlankOrNull(in.locality()))          { missing++; gaps.add("locality"); }
        if (isBlankOrNull(in.areaKey()))           { missing++; gaps.add("area"); }
        if (in.listingPricePaise() == null)        { missing++; gaps.add("price"); }
        if (isBlankOrNull(in.propertyType()))      { missing++; gaps.add("property type"); }

        int present = 4 - missing;
        int score;
        String finding;
        if (missing == 0) {
            score = 100; finding = "All key fields present";
        } else if (present == 3) {
            score = 75;  finding = "Missing: " + String.join(", ", gaps);
        } else if (present == 2) {
            score = 50;  finding = "Missing: " + String.join(", ", gaps);
        } else if (present == 1) {
            score = 25;  finding = "Missing: " + String.join(", ", gaps);
        } else {
            score = 0;   finding = "All key fields missing — listing is incomplete";
        }
        return component(QualityComponentType.KEY_FIELDS, score, true, finding);
    }

    private QualityComponent scorePriceSanity(QualityScoreInputs in) {
        if (in.medianComparablePricePaise() == null) {
            // INDETERMINATE — excluded from denominator
            return new QualityComponent(
                    QualityComponentType.PRICE_SANITY,
                    0, QualityComponentType.PRICE_SANITY.getWeightBp(),
                    false,
                    "Comparables unavailable — price sanity check skipped"
            );
        }
        if (in.listingPricePaise() == null) {
            return component(QualityComponentType.PRICE_SANITY, 50, true,
                    "No listing price to compare");
        }

        long price  = in.listingPricePaise();
        long median = in.medianComparablePricePaise();

        if (median <= 0) {
            return component(QualityComponentType.PRICE_SANITY, 50, true,
                    "Median comparable is zero — unable to evaluate price");
        }

        // Integer percentage: (price * 100) / median
        long pctOfMedian = (price * 100L) / median;

        int score;
        String finding;
        if (pctOfMedian <= PRICE_SANITY_NEUTRAL_PCT) {
            score = 100;
            finding = "Price is at or below the area median — competitive";
        } else if (pctOfMedian <= PRICE_SANITY_HIGH_PCT) {
            score = 75;
            finding = "Price is moderately above the area median";
        } else if (pctOfMedian <= PRICE_SANITY_VERY_HIGH_PCT) {
            // Soft reduction with honest language — never call it 'overpriced'
            score = 50;
            finding = "Price may be above similar visible listings in this area";
        } else {
            score = 25;
            finding = "Price appears significantly above similar visible listings in this area";
        }
        return component(QualityComponentType.PRICE_SANITY, score, true, finding);
    }

    private QualityComponent scoreLocation(QualityScoreInputs in) {
        boolean hasLocality  = !isBlankOrNull(in.locality());
        boolean hasAreaKey   = !isBlankOrNull(in.areaKey());
        boolean hasCoords    = in.latitude() != null && in.longitude() != null;

        int signals = (hasLocality ? 1 : 0) + (hasAreaKey ? 1 : 0) + (hasCoords ? 1 : 0);

        int score;
        String finding;
        if (signals == 3) {
            score = 100; finding = "Locality, area, and coordinates all confirmed";
        } else if (signals == 2) {
            score = 75;  finding = "Location mostly confirmed — " + locationGaps(hasLocality, hasAreaKey, hasCoords);
        } else if (signals == 1) {
            score = 40;  finding = "Location partially confirmed — " + locationGaps(hasLocality, hasAreaKey, hasCoords);
        } else {
            score = 0;   finding = "Location unconfirmed — locality, area, and coordinates missing";
        }
        return component(QualityComponentType.LOCATION, score, true, finding);
    }

    private QualityComponent scoreAgriCompleteness(QualityScoreInputs in) {
        boolean isAgri = PropertyType.AGRICULTURAL_LAND.getValue()
                .equalsIgnoreCase(nullToEmpty(in.propertyType()));

        if (!isAgri) {
            return new QualityComponent(
                    QualityComponentType.AGRI_COMPLETENESS,
                    0, QualityComponentType.AGRI_COMPLETENESS.getWeightBp(),
                    false,
                    "Not applicable (non-agricultural listing)"
            );
        }

        // Count the 8 agri sub-fields that are present (non-null, non-blank for strings;
        // non-null for booleans — false is a valid value meaning "no").
        int present = 0;
        if (!isBlankOrNull(in.landCategory()))       present++;
        if (!isBlankOrNull(in.waterSource()))        present++;
        if (!isBlankOrNull(in.soilType()))           present++;
        if (!isBlankOrNull(in.roadAccess()))         present++;
        if (!isBlankOrNull(in.cultivationStatus()))  present++;
        if (!isBlankOrNull(in.ownershipType()))      present++;
        if (in.farmhouseAvailable() != null)         present++;
        if (in.fencingDone() != null)                present++;

        // Map present count (0–8) to a score that is strictly monotone.
        // Bands: 0→0, 1–2→25, 3–4→50, 5–6→75, 7–8→100.
        int score;
        String finding;
        if (present == 0) {
            score = 0;
            finding = "No agricultural fields completed — buyers need this information";
        } else if (present <= 2) {
            score = 25;
            finding = present + " of " + AGRI_FIELD_COUNT + " agricultural fields complete";
        } else if (present <= 4) {
            score = 50;
            finding = present + " of " + AGRI_FIELD_COUNT + " agricultural fields complete";
        } else if (present <= 6) {
            score = 75;
            finding = present + " of " + AGRI_FIELD_COUNT + " agricultural fields complete";
        } else {
            score = 100;
            finding = present + " of " + AGRI_FIELD_COUNT + " agricultural fields complete — excellent";
        }
        return component(QualityComponentType.AGRI_COMPLETENESS, score, true, finding);
    }

    private QualityComponent scoreRecency(QualityScoreInputs in) {
        if (in.createdAt() == null) {
            return component(QualityComponentType.RECENCY, 0, true,
                    "Creation date unavailable");
        }

        Instant created = in.createdAt().toInstant();
        long ageDays = ChronoUnit.DAYS.between(created, in.now());

        int score;
        String finding;
        if (ageDays < 0) {
            // Clock skew or future-dated listing — treat as fresh
            score = 100; finding = "Listing posted recently";
        } else if (ageDays <= RECENCY_FRESH_DAYS) {
            score = 100; finding = "Listing posted within the last " + ageDays + " day(s) — very fresh";
        } else if (ageDays <= RECENCY_RECENT_DAYS) {
            score = 75;  finding = "Listing posted " + ageDays + " days ago — recent";
        } else if (ageDays <= RECENCY_MODERATE_DAYS) {
            score = 50;  finding = "Listing posted " + ageDays + " days ago — moderately aged";
        } else if (ageDays <= RECENCY_STALE_DAYS) {
            score = 25;  finding = "Listing posted " + ageDays + " days ago — consider refreshing";
        } else {
            score = 10;  finding = "Listing is over a year old (" + ageDays + " days) — strongly consider refreshing";
        }
        return component(QualityComponentType.RECENCY, score, true, finding);
    }

    // -----------------------------------------------------------------------
    // Overall score aggregation
    // -----------------------------------------------------------------------

    /**
     * Weighted average over applied components only.
     * Uses long arithmetic + half-up rounding; clamps to [0, 100].
     */
    private int computeOverall(List<QualityComponent> components) {
        long numerator   = 0L;
        long denominator = 0L;

        for (QualityComponent c : components) {
            if (c.applied()) {
                numerator   += (long) c.score() * c.weightBp();
                denominator += c.weightBp();
            }
        }

        if (denominator == 0L) {
            return 0;
        }

        // Half-up rounding: (n + d/2) / d
        long rounded = (numerator + denominator / 2L) / denominator;
        return (int) Math.max(0L, Math.min(100L, rounded));
    }

    // -----------------------------------------------------------------------
    // Canonical JSON serialisation (byte-identical across calls)
    // -----------------------------------------------------------------------

    /**
     * Returns a deterministic JSON string for the given score.
     *
     * <p>The JSON structure is hand-built (no reflection, no HashMap) so field order
     * is always: {@code overall}, {@code computedAt}, {@code components[]} with each
     * component in {@code type, score, weightBp, applied, finding} order.
     * This guarantees byte-identical output for identical inputs — qa asserts this.
     *
     * <p>Only ASCII-safe characters are included (no locale-sensitive number formatting).
     * String fields are JSON-escaped via a minimal escaper covering the subset that
     * can appear in finding strings.
     */
    public String toCanonicalJson(QualityScore qs) {
        StringBuilder sb = new StringBuilder(512);
        sb.append('{');
        sb.append("\"overall\":").append(qs.overall()).append(',');
        sb.append("\"computedAt\":\"").append(qs.computedAt().toString()).append("\",");
        sb.append("\"components\":[");
        List<QualityComponent> comps = qs.components();
        for (int i = 0; i < comps.size(); i++) {
            if (i > 0) sb.append(',');
            QualityComponent c = comps.get(i);
            sb.append('{');
            sb.append("\"type\":\"").append(c.type().name()).append("\",");
            sb.append("\"score\":").append(c.score()).append(',');
            sb.append("\"weightBp\":").append(c.weightBp()).append(',');
            sb.append("\"applied\":").append(c.applied()).append(',');
            sb.append("\"finding\":\"").append(jsonEscape(c.finding())).append('"');
            sb.append('}');
        }
        sb.append("]}");
        return sb.toString();
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private static QualityComponent component(
            QualityComponentType type, int score, boolean applied, String finding) {
        return new QualityComponent(type, score, type.getWeightBp(), applied, finding);
    }

    private static boolean isBlankOrNull(String s) {
        return s == null || s.isBlank();
    }

    private static String nullToEmpty(String s) {
        return s == null ? "" : s;
    }

    private static String locationGaps(boolean hasLocality, boolean hasAreaKey, boolean hasCoords) {
        List<String> missing = new ArrayList<>(3);
        if (!hasLocality) missing.add("locality missing");
        if (!hasAreaKey)  missing.add("area missing");
        if (!hasCoords)   missing.add("coordinates missing");
        return String.join(", ", missing);
    }

    /**
     * Minimal JSON string escaper.
     * Handles backslash, double-quote, and the C0 control characters (U+0000–U+001F)
     * that can appear in user-supplied finding strings.
     */
    private static String jsonEscape(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length() + 4);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\\') {
                sb.append("\\\\");
            } else if (c == '"') {
                sb.append("\\\"");
            } else if (c < 0x20) {
                sb.append(String.format(Locale.ROOT, "\\u%04x", (int) c));
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }
}

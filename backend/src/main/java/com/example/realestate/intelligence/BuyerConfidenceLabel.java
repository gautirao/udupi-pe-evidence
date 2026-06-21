package com.example.realestate.intelligence;

/**
 * Buyer-facing label mapping for {@link AreaConfidence}.
 *
 * <p>This is a BOUNDARY mapper only — it does NOT mutate the {@link AreaConfidence} enum
 * and adds no logic beyond the string mapping. The mapping lives here rather than on
 * {@link AreaConfidence} so that the internal admin enum stays free of buyer-facing concerns.
 *
 * <p>Usage: {@link #of(AreaConfidence)} converts an internal confidence level to the
 * human-readable label shown on buyer-facing area cards.
 *
 * <p>In this issue (#1526) there is no public buyer API — the mapper is authored here
 * as a reusable helper ready for #1527 (buyer area detail endpoint).
 *
 * <p>Accepted forms: the {@link #of(AreaConfidence)} factory accepts the
 * {@link AreaConfidence} enum directly; {@link #ofLabel(String)} accepts the lowercase
 * confidence string (e.g. "full", "limited", "insufficient") that is stored in the
 * {@code area_intelligence_snapshot.confidence} column.
 */
public enum BuyerConfidenceLabel {

    /** Buyer label for {@link AreaConfidence#FULL}. */
    ENOUGH_DATA("Enough data"),

    /** Buyer label for {@link AreaConfidence#LIMITED}. */
    LIMITED_DATA("Limited data"),

    /** Buyer label for {@link AreaConfidence#INSUFFICIENT}. */
    NOT_ENOUGH_DATA("Not enough data yet");

    private final String displayLabel;

    BuyerConfidenceLabel(String displayLabel) {
        this.displayLabel = displayLabel;
    }

    /**
     * Human-readable label for display to buyers.
     *
     * @return display string, e.g. "Enough data"
     */
    public String getDisplayLabel() {
        return displayLabel;
    }

    /**
     * Map an {@link AreaConfidence} enum value to the corresponding buyer-facing label.
     *
     * @param confidence internal confidence level; must not be null
     * @return buyer-facing label enum constant
     * @throws IllegalArgumentException if confidence is null
     */
    public static BuyerConfidenceLabel of(AreaConfidence confidence) {
        if (confidence == null) {
            throw new IllegalArgumentException("confidence must not be null");
        }
        return switch (confidence) {
            case FULL         -> ENOUGH_DATA;
            case LIMITED      -> LIMITED_DATA;
            case INSUFFICIENT -> NOT_ENOUGH_DATA;
        };
    }

    /**
     * Map a lowercase confidence string (as stored in {@code area_intelligence_snapshot.confidence})
     * to the corresponding buyer-facing label.
     *
     * <p>Accepted values: {@code "full"}, {@code "limited"}, {@code "insufficient"} (case-insensitive).
     *
     * @param confidenceLabel lowercase confidence string; must not be null
     * @return buyer-facing label enum constant
     * @throws IllegalArgumentException if the label does not match a known confidence value
     */
    public static BuyerConfidenceLabel ofLabel(String confidenceLabel) {
        if (confidenceLabel == null) {
            throw new IllegalArgumentException("confidenceLabel must not be null");
        }
        return of(AreaConfidence.valueOf(confidenceLabel.toUpperCase()));
    }
}

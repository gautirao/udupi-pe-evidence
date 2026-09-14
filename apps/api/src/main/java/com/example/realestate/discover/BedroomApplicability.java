package com.example.realestate.discover;

import java.util.List;
import java.util.Locale;

/**
 * The ONE server-side answer to "can this property shape have bedrooms at all?" (#2537).
 *
 * <p>The server counterpart of {@code apps/web/src/features/discover/filters/bedroomApplicability.ts},
 * deliberately given the same name so the two halves of one rule are findable from each other. The
 * frontend module answers whether the predicate may be SUBMITTED for a selection; this one answers,
 * per shape, whether the predicate may be APPLIED to a row. They are different questions and both
 * are needed: the frontend suppresses bedrooms only when EVERY selected shape is incapable, which
 * is exactly why a MIXED selection still reaches the server carrying a bedroom constraint.
 *
 * <h2>Why this exists — the defect it removes</h2>
 *
 * <p>A Commercial row carries {@code bedrooms} NULL and a plot has no bedrooms at all. Applied as a
 * global conjunct, {@code AND pl.bedrooms IN (3)} evaluates to NULL — not TRUE — for every one of
 * them, so a buyer selecting Apartment + Shop + 3 BHK was served zero shops. HTTP 200, no error,
 * and no reason the buyer could see. The owner ruling on #2537 requires the predicate to be scoped
 * to the shapes it is meaningful for rather than dropped or applied globally.
 *
 * <h2>The taxonomy is DERIVED, never restated</h2>
 *
 * <p>There is no literal list of dwelling types here, and adding one would be a mistake of the kind
 * this package has removed twice already (#2458, #1956 PR1): a second declaration of the same
 * taxonomy with nothing holding it in step, so a newly-added property type keeps whatever answer
 * falls out. Capability is derived from the two existing single declarations:
 *
 * <ul>
 *   <li><b>Commercial family</b> — {@link DiscoverPrimaryArea#admissibleSubtypes} inverts
 *       {@code DiscoverFilterNormalizer.BUYER_SUBTYPE_TO_PROPERTY_TYPE}, the single declaration of
 *       the Commercial taxonomy. A type that inverts to any buyer subtype is Commercial, and no
 *       Commercial shape has bedrooms.</li>
 *   <li><b>Plot</b> — {@link DiscoverPrimaryArea#resolve} already answers whether a shape is
 *       measured as a land parcel. {@code residential_plot}, {@code land} and
 *       {@code agricultural_land} resolve to {@link DiscoverPrimaryArea#PLOT}.</li>
 * </ul>
 *
 * <p><b>Why {@link DiscoverPrimaryArea} alone cannot answer this.</b> It maps shapes to AREA
 * meanings, and a Shop and an Apartment are both {@code BUILT_UP} — the meaning that decides which
 * column to measure says nothing about bedrooms. The Commercial-family test is what separates them,
 * which is why capability is the conjunction of two questions rather than a lookup in one map.
 *
 * <h2>An unrecognised shape is treated as CAPABLE, on purpose</h2>
 *
 * <p>{@code other}, and any stored token with no resolvable meaning, is bedroom-capable here. That
 * matches the direction the frontend module already documents for the same shrug: a type that might
 * be a dwelling keeps the buyer's constraint, because silently DROPPING a constraint the buyer set
 * hides inventory they excluded on purpose, which is the more damaging of the two errors. The
 * mirror-image choice — treating an unknown shape as incapable — would quietly readmit rows into a
 * result the buyer narrowed.
 */
final class BedroomApplicability {

    private BedroomApplicability() {
    }

    /**
     * Whether a stored {@code property_type} names a shape that can have bedrooms.
     *
     * @param propertyType a NORMALISED (stored, lower-case) property type; {@code null} or blank is
     *                     answered {@code false}, which is the direction that cannot widen a result
     *                     — such a token can only ever join the OR arm as a bind that matches no row
     */
    static boolean isBedroomCapable(String propertyType) {
        if (propertyType == null || propertyType.isBlank()) {
            return false;
        }
        String type = propertyType.trim().toLowerCase(Locale.ROOT);

        // Commercial family: shop, office, commercial building, warehouse, commercial land.
        if (!DiscoverPrimaryArea.admissibleSubtypes(type).isEmpty()) {
            return false;
        }

        // Land parcels: residential_plot, land, agricultural_land.
        return DiscoverPrimaryArea.resolve(type, null) != DiscoverPrimaryArea.PLOT;
    }

    /**
     * The selected shapes that CANNOT have bedrooms — the right-hand arm of the ruling's membership
     * shape. Order is preserved from the caller's normalised list so the emitted bind order is
     * deterministic.
     */
    static List<String> nonBedroomCapable(List<String> normalizedPropertyTypes) {
        if (normalizedPropertyTypes == null || normalizedPropertyTypes.isEmpty()) {
            return List.of();
        }
        return normalizedPropertyTypes.stream()
                .filter(type -> !isBedroomCapable(type))
                .toList();
    }
}

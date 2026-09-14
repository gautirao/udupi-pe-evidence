package com.example.realestate.discover;

import com.example.realestate.ai.PropertyType;
import com.example.realestate.listing.area.AreaNormalizer;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * The ONE declaration of what "area" MEANS for a Discover row, and of the buyer-facing label that
 * discloses that meaning (#2459 Step 1).
 *
 * <p>A single numeric range control spans property shapes whose areas are not the same quantity.
 * 1,200 sq ft of an apartment is its BUILT-UP area; 1,200 sq ft of a plot is the LAND it sits on.
 * Filtering both against one column would be quietly wrong in one direction or the other, so the
 * meaning is resolved PER ROW, from the row's own {@code property_type} (and, only where that type
 * is genuinely ambiguous, its commercial subtype).
 *
 * <h2>Carpet area is deliberately absent</h2>
 *
 * <p>There is no {@code CARPET} meaning and {@code carpet_area} is projected nowhere. This is an
 * owner ruling on #2459's AC1, not an oversight: 0 of 1,916 LIVE dwellings carry a
 * {@code carpet_area} value (apartment 0/1650, house 0/187, villa 0/79), while {@code built_area}
 * covers 1,641 of 1,650 live apartments. A carpet-area control would have been empty for every
 * shopper who used it. <b>Do not "restore parity" with the #2429 label table by adding one.</b>
 *
 * <h2>The convergence rule</h2>
 *
 * <p>Under the #2458 contract only {@code property_type = 'commercial'} is subtype-BEARING; every
 * other commercial type is self-describing and resolves from {@code property_type} alone. A legacy
 * {@code commercial} row whose {@code commercial_subtype} was never recorded therefore cannot have
 * its subtype recovered — and this class never guesses one.
 *
 * <p>It does not have to. The owner's rule is:
 *
 * <blockquote>if every valid subtype interpretation converges on the same primary-area semantic,
 * that area semantic may be used without resolving the subtype.</blockquote>
 *
 * <p>The admissible subtypes of {@code commercial} are exactly {@code SHOP} and {@code OFFICE}
 * (derived from the #2458 mapping, not restated here), and BOTH mean {@link #BUILT_UP}. So the
 * MEANING is determined even though the SUBTYPE is not. That is resolution of area meaning, not
 * subtype inference: the row is never labelled a Shop, and never labelled an Office.
 *
 * <p><b>The rule is implemented generally, not as a special case for {@code 'commercial'}.</b>
 * {@link #resolve} converges over whatever admissible set a type has; the moment a type's admissible
 * subtypes disagree — say a hypothetical token spanning {@code SHOP} and {@code LAND} — the answer
 * is {@link #UNRESOLVED} again, with no code change. {@code DiscoverPrimaryAreaTest} exercises that
 * non-converging branch directly, so the general rule is tested rather than merely asserted.
 *
 * <h2>UNRESOLVED is a real, honest answer</h2>
 *
 * <p>{@link #UNRESOLVED} rows (today: {@code other}, plus any future stored type not mapped here)
 * have NO primary area. They stay fully visible under "Any size" and are honestly EXCLUDED the
 * moment a bound is active. They are never rescued by coalescing across {@code land_area} /
 * {@code built_area} — a row retained by borrowing a different quantity's number is a row presented
 * as matching a filter it was never measured against.
 *
 * <h2>Resolution happens in SQL, never after the fetch</h2>
 *
 * <p>{@link #primaryAreaSqftSql} emits the whole resolution — meaning, column choice, unit
 * conversion — as ONE scalar expression, so it composes into the shared WHERE fragment in
 * {@link DiscoverListingPredicateBuilder}. Computing it in Java over an already-fetched page would
 * give listings one membership and counts/markers another, which is exactly the divergence #2459's
 * AC4 forbids.
 */
public enum DiscoverPrimaryArea {

    /**
     * The built structure's area — dwellings (apartment/villa/house), shops, offices and commercial
     * buildings. Sourced from {@code built_area} / {@code built_area_unit}.
     */
    BUILT_UP("BUILT-UP AREA (SQ FT)", "built_area", "built_area_unit"),

    /**
     * The land parcel's area — residential plots, legacy {@code land}, commercial land and
     * agricultural land. Sourced from {@code land_area} / {@code land_area_unit}.
     */
    PLOT("PLOT SIZE (SQ FT)", "land_area", "land_area_unit"),

    /**
     * A warehouse/godown's covered area. Shares the {@code built_area} pair with {@link #BUILT_UP}
     * (there is no separate warehouse-area column, and none is proposed) but is a DISTINCT meaning
     * because the buyer-facing label differs — which is the point of AC3 and of the D1 disclosure
     * ruling. Collapsing it into {@code BUILT_UP} would lose the label, not just a constant.
     */
    WAREHOUSE("WAREHOUSE AREA (SQ FT)", "built_area", "built_area_unit"),

    /**
     * No primary area can be determined for this row without guessing. Carries no label and no
     * column: visible under "Any size", excluded under any bound.
     */
    UNRESOLVED(null, null, null);

    private final String buyerLabel;
    private final String areaColumn;
    private final String unitColumn;

    DiscoverPrimaryArea(String buyerLabel, String areaColumn, String unitColumn) {
        this.buyerLabel = buyerLabel;
        this.areaColumn = areaColumn;
        this.unitColumn = unitColumn;
    }

    /**
     * The disclosed buyer-facing control/chip label for this meaning, or {@code null} for
     * {@link #UNRESOLVED}.
     *
     * <p>Disclosure is an acceptance criterion (D1), not copy polish: a broad or mixed selection
     * whose rows resolve to DIFFERENT meanings must say so. {@link #isResolved} tells a caller
     * whether a label exists at all.
     */
    public String buyerLabel() {
        return buyerLabel;
    }

    /** The {@code property_listings} column holding this meaning's value, or {@code null}. */
    public String areaColumn() {
        return areaColumn;
    }

    /** The {@code property_listings} column holding that value's unit, or {@code null}. */
    public String unitColumn() {
        return unitColumn;
    }

    /** {@code true} for every meaning except {@link #UNRESOLVED}. */
    public boolean isResolved() {
        return this != UNRESOLVED;
    }

    // ── The mapping ─────────────────────────────────────────────────────────────────────────────

    /**
     * Buyer commercial subtype → primary-area meaning. Keyed on the #2458 buyer vocabulary
     * ({@code SHOP}/{@code OFFICE}/{@code BUILDING}/{@code WAREHOUSE}/{@code LAND}), which is the
     * axis the #2429 label table is written against.
     */
    private static final Map<String, DiscoverPrimaryArea> MEANING_BY_SUBTYPE = Map.of(
            "SHOP", BUILT_UP,
            "OFFICE", BUILT_UP,
            "BUILDING", BUILT_UP,
            "WAREHOUSE", WAREHOUSE,
            "LAND", PLOT);

    /**
     * Non-commercial stored {@code property_type} → meaning. The commercial types are deliberately
     * ABSENT: they resolve through {@link #MEANING_BY_SUBTYPE} and the convergence rule, so the
     * Commercial taxonomy keeps exactly one declaration ({@code DiscoverFilterNormalizer}'s
     * {@code BUYER_SUBTYPE_TO_PROPERTY_TYPE}) rather than gaining a second one here.
     *
     * <p>{@code other} is ABSENT ON PURPOSE and therefore {@link #UNRESOLVED}. It is the catch-all
     * token: nothing bounds what such a row is, so no admissible set converges on a meaning. (The
     * write path happens to validate {@code other} in its PLOT field family, but a validation
     * family is not a measurement claim, and legacy rows predate it.) Its rows stay visible under
     * "Any size" and are honestly excluded when a bound is active.
     */
    private static final Map<String, DiscoverPrimaryArea> MEANING_BY_PROPERTY_TYPE = Map.of(
            "apartment", BUILT_UP,
            "villa", BUILT_UP,
            "house", BUILT_UP,
            "residential_plot", PLOT,
            "land", PLOT,
            "agricultural_land", PLOT);

    /**
     * Resolves the primary-area meaning of ONE row.
     *
     * @param propertyType      the stored {@code property_listings.property_type}
     *                          (case-insensitive)
     * @param commercialSubtype the stored {@code listing_commercial_space_details.commercial_subtype}
     *                          when present, else {@code null}. A {@code null} here is NOT a defect:
     *                          it is the normal state of every self-describing type, and of legacy
     *                          {@code commercial} rows whose subtype was never recorded.
     * @return the meaning, or {@link #UNRESOLVED}
     */
    public static DiscoverPrimaryArea resolve(String propertyType, String commercialSubtype) {
        if (propertyType == null || propertyType.isBlank()) {
            return UNRESOLVED;
        }
        String type = propertyType.trim().toLowerCase(Locale.ROOT);

        if (commercialSubtype != null && !commercialSubtype.isBlank()) {
            DiscoverPrimaryArea bySubtype =
                    MEANING_BY_SUBTYPE.get(commercialSubtype.trim().toUpperCase(Locale.ROOT));
            if (bySubtype != null) {
                return bySubtype;
            }
            // An unrecognised subtype is not a licence to fall back to a guess about the type; fall
            // through to the admissible-set rule below, which answers UNRESOLVED unless the type's
            // OWN admissible interpretations converge.
        }

        Set<String> admissible = admissibleSubtypes(type);
        if (!admissible.isEmpty()) {
            return resolveFromAdmissibleSubtypes(admissible);
        }

        return MEANING_BY_PROPERTY_TYPE.getOrDefault(type, UNRESOLVED);
    }

    /**
     * The buyer subtypes a stored {@code property_type} could admissibly be, derived from the #2458
     * {@code BUYER_SUBTYPE_TO_PROPERTY_TYPE} mapping by inversion — NOT restated. A self-describing
     * type inverts to exactly one subtype; {@code commercial} inverts to {@code SHOP} and
     * {@code OFFICE}; a non-commercial type inverts to the empty set.
     */
    static Set<String> admissibleSubtypes(String propertyType) {
        Set<String> admissible = new TreeSet<>();
        DiscoverFilterNormalizer.BUYER_SUBTYPE_TO_PROPERTY_TYPE.forEach((subtype, type) -> {
            if (type.equals(propertyType)) {
                admissible.add(subtype);
            }
        });
        return admissible;
    }

    /**
     * The owner's convergence rule, in one place: an admissible set whose members all mean the same
     * thing resolves to that meaning WITHOUT resolving which member the row actually is; anything
     * else is {@link #UNRESOLVED}.
     *
     * <p>Package-private rather than inlined so the non-converging branch is directly testable. It
     * has no divergent live caller today only because every current admissible set happens to
     * converge — a fact about today's taxonomy, not a property this code may assume.
     */
    static DiscoverPrimaryArea resolveFromAdmissibleSubtypes(Set<String> admissibleSubtypes) {
        DiscoverPrimaryArea converged = null;
        for (String subtype : admissibleSubtypes) {
            DiscoverPrimaryArea meaning = MEANING_BY_SUBTYPE.get(subtype);
            if (meaning == null) {
                return UNRESOLVED;
            }
            if (converged == null) {
                converged = meaning;
            } else if (converged != meaning) {
                return UNRESOLVED;
            }
        }
        return converged == null ? UNRESOLVED : converged;
    }

    /**
     * The stored {@code property_type} values that resolve to {@code meaning} with NO subtype
     * available — i.e. purely from {@code property_type}. Sorted, so generated SQL and DSL are
     * deterministic (two identical requests must mint ONE cache key, not several).
     */
    public static List<String> propertyTypesFor(DiscoverPrimaryArea meaning) {
        Set<String> types = new TreeSet<>();
        for (PropertyType pt : PropertyType.values()) {
            if (resolve(pt.getValue(), null) == meaning) {
                types.add(pt.getValue());
            }
        }
        return List.copyOf(types);
    }

    /**
     * One {@code (area column, unit column)} pair and every stored {@code property_type} that reads
     * it — the shape both engines enumerate over.
     *
     * @param areaColumn    the {@code property_listings} area column
     * @param unitColumn    the matching unit column
     * @param propertyTypes the stored property types resolving to this pair, sorted
     */
    public record ColumnGroup(String areaColumn, String unitColumn, List<String> propertyTypes) {}

    /**
     * The resolved meanings grouped by the column pair they read, in deterministic order.
     *
     * <p>{@link #BUILT_UP} and {@link #WAREHOUSE} collapse into ONE group here because they read the
     * same pair; they stay separate constants because their buyer LABELS differ, which is a display
     * concern, not a query concern.
     *
     * <p><b>Both engines enumerate this same list</b> — Postgres to build its {@code CASE} arms,
     * OpenSearch to build its {@code should} branches. That is what makes "the same UNRESOLVED
     * decision on both engines" structural rather than a coincidence of two hand-written lists: a
     * property type absent from every group is UNRESOLVED for both, because neither can name it.
     */
    public static List<ColumnGroup> columnGroups() {
        Map<String, List<String>> typesByColumnPair = new LinkedHashMap<>();
        for (DiscoverPrimaryArea meaning : values()) {
            if (!meaning.isResolved()) {
                continue;
            }
            List<String> types = propertyTypesFor(meaning);
            if (types.isEmpty()) {
                continue;
            }
            typesByColumnPair
                    .computeIfAbsent(meaning.areaColumn() + " " + meaning.unitColumn(),
                            k -> new ArrayList<>())
                    .addAll(types);
        }
        List<ColumnGroup> groups = new ArrayList<>();
        typesByColumnPair.forEach((pair, types) -> {
            int sep = pair.indexOf(' ');
            groups.add(new ColumnGroup(
                    pair.substring(0, sep),
                    pair.substring(sep + 1),
                    List.copyOf(new TreeSet<>(types))));
        });
        return List.copyOf(groups);
    }

    // ── SQL projection ──────────────────────────────────────────────────────────────────────────

    /**
     * Emits the per-row primary area IN SQUARE FEET as one SQL scalar expression, or SQL
     * {@code NULL} where the area is unresolvable.
     *
     * <p>The expression resolves three things at once, all row-side:
     * <ol>
     *   <li><b>meaning</b> — which column pair this row's {@code property_type} designates;</li>
     *   <li><b>presence</b> — {@code NULL} when the value is absent or {@code <= 0}, mirroring
     *       {@link AreaNormalizer#toSqft};</li>
     *   <li><b>unit</b> — the SAME alias vocabulary and the SAME exact factors as
     *       {@link AreaNormalizer.AreaUnit}, generated from it rather than restated. An unrecognised
     *       unit yields {@code NULL}; it is never defaulted to sq ft.</li>
     * </ol>
     *
     * <p>The result is {@code ROUND(..., }{@link AreaNormalizer#SQFT_SCALE}{@code )}, so a row's SQL
     * sq-ft value equals the {@link AreaNormalizer#toSqft} value for the same inputs — the two
     * cannot disagree at a boundary.
     *
     * <p>Because the expression is {@code NULL} for unresolvable rows, {@code expr >= ?} and
     * {@code expr <= ?} are both {@code NULL} (not {@code TRUE}) there, so such rows drop out under
     * a bound and are untouched when no bound is applied. AC5 falls out of SQL three-valued logic
     * rather than needing a rule of its own.
     *
     * @param tableAlias the alias of {@code property_listings} in the caller's FROM clause
     *                   (e.g. {@code "pl"})
     * @return a parenthesised SQL scalar expression; binds NOTHING, so it is safe to embed and
     *         cannot shift a caller's positional parameter order
     */
    public static String primaryAreaSqftSql(String tableAlias) {
        StringBuilder sb = new StringBuilder("(CASE");
        for (ColumnGroup group : columnGroups()) {
            sb.append(" WHEN ").append(tableAlias).append(".property_type IN (");
            List<String> types = group.propertyTypes();
            for (int i = 0; i < types.size(); i++) {
                // Literals, not binds: these are this class's own constants, never user input, and
                // keeping them out of the bind list means embedding this expression cannot reorder
                // a caller's positional parameters.
                sb.append(i == 0 ? "" : ", ").append('\'').append(types.get(i)).append('\'');
            }
            sb.append(") THEN ")
              .append(sqftExpr(tableAlias, group.areaColumn(), group.unitColumn()));
        }
        sb.append(" ELSE NULL END)");
        return sb.toString();
    }

    /**
     * One area-bound WHERE fragment and the binds it consumes, in the order the fragment consumes
     * them.
     *
     * @param sql    the fragment, or {@code ""} when neither bound is present
     * @param params the binds, empty when {@code sql} is empty
     */
    public record AreaBoundSql(String sql, List<Object> params) {}

    /**
     * Emits the {@code areaMinSqft}/{@code areaMaxSqft} narrowing as a WHERE/ON fragment — the ONE
     * place that predicate is spelled, for every surface that narrows by area.
     *
     * <h2>Why this is shared rather than written per endpoint</h2>
     *
     * <p>The bound is not {@code built_area >= ?}. It is a bound on the row's PRIMARY area, which
     * {@link #primaryAreaSqftSql} resolves per row — built-up for dwellings/shops/offices/buildings,
     * warehouse area for warehouses, plot size for land — and which is {@code NULL} when no meaning
     * can be resolved. A second endpoint computing "primary area" independently is how this codebase
     * produced the listings/markers disagreements #2459 and #2450 exist to stop; two hand-written
     * copies drift SILENTLY, since the only symptom is different numbers. So the operators, their
     * order, and the bind order live here alongside the expression, not just the expression.
     *
     * <p><b>AC5 is inherited, not re-decided.</b> An unresolved row makes the expression {@code NULL},
     * so {@code NULL >= ?} and {@code NULL <= ?} are both {@code NULL} rather than {@code TRUE}: the
     * row stays visible under "Any size" and is honestly excluded the moment a bound is active. That
     * is SQL three-valued logic, so no caller can forget it and nothing is ever coalesced across the
     * land/built columns to keep such a row in.
     *
     * <p>{@link #primaryAreaSqftSql} binds nothing, so the returned fragment consumes exactly the
     * returned params and embedding it cannot disturb a caller's positional parameter order.
     *
     * @param tableAlias      alias of {@code property_listings} in the caller's FROM clause
     * @param areaMinSqft     inclusive lower bound in sq ft, or {@code null}
     * @param areaMaxSqft     inclusive upper bound in sq ft, or {@code null}
     * @param clauseSeparator emitted before each {@code AND} so a caller controls its own layout
     *                        (a single space for a one-line WHERE, a newline+indent for a
     *                        multi-line JOIN ON clause). Affects whitespace only.
     * @return the fragment and its binds; both empty when neither bound is present
     */
    public static AreaBoundSql areaBoundSql(String tableAlias,
                                            Integer areaMinSqft,
                                            Integer areaMaxSqft,
                                            String clauseSeparator) {
        if (areaMinSqft == null && areaMaxSqft == null) {
            return new AreaBoundSql("", List.of());
        }
        String areaSqft = primaryAreaSqftSql(tableAlias);
        StringBuilder sb = new StringBuilder();
        List<Object> params = new ArrayList<>(2);
        if (areaMinSqft != null) {
            sb.append(clauseSeparator).append("AND ").append(areaSqft).append(" >= ?");
            params.add(areaMinSqft);
        }
        if (areaMaxSqft != null) {
            sb.append(clauseSeparator).append("AND ").append(areaSqft).append(" <= ?");
            params.add(areaMaxSqft);
        }
        return new AreaBoundSql(sb.toString(), List.copyOf(params));
    }

    /**
     * The unit-resolving sq-ft conversion for ONE column pair — the SQL twin of
     * {@link AreaNormalizer#toSqft}, including its {@code value <= 0} and unrecognised-unit
     * {@code NULL}s.
     *
     * <p>{@code btrim(regexp_replace(lower(u), '\s+', ' ', 'g'))} reproduces
     * {@link AreaNormalizer#canonicalUnitToken} for every unit spelling reachable from the write
     * path (lower-case, collapse internal whitespace, trim). A {@code NULL} unit yields {@code NULL}
     * from {@code lower()} and so matches no {@code WHEN} arm — the same answer {@code toSqft} gives
     * for a null unit.
     */
    private static String sqftExpr(String tableAlias, String areaColumn, String unitColumn) {
        String area = tableAlias + "." + areaColumn;
        String unit = tableAlias + "." + unitColumn;
        StringBuilder sb = new StringBuilder();
        sb.append("(CASE WHEN ").append(area).append(" IS NULL OR ").append(area)
          .append(" <= 0 THEN NULL ELSE (CASE btrim(regexp_replace(lower(")
          .append(unit).append("), '\\s+', ' ', 'g'))");
        for (AreaNormalizer.AreaUnit areaUnit : AreaNormalizer.AreaUnit.values()) {
            for (String alias : areaUnit.aliases()) {
                sb.append(" WHEN '").append(alias).append("' THEN ROUND(").append(area)
                  .append(" * ").append(areaUnit.sqftFactor().toPlainString()).append(", ")
                  .append(AreaNormalizer.SQFT_SCALE).append(")");
            }
        }
        sb.append(" ELSE NULL END) END)");
        return sb.toString();
    }
}

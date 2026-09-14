package com.example.realestate.discover;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Locale;
import java.util.Set;

/**
 * #2506 — the single place that decides WHICH stored copy of a Commercial fact wins.
 *
 * <h2>The problem this exists to solve</h2>
 *
 * <p>The same logical Commercial fact is stored in more than one column, and neither
 * copy is authoritative on its own:
 *
 * <ul>
 *   <li><b>V102</b> ({@code V102__typed_listing_schema_expand_and_backfill.sql}) created
 *       the per-family typed child tables and backfilled them FROM the legacy flat
 *       columns on {@code property_listings} — copying {@code floor_number},
 *       {@code total_floors} and {@code furnishing_status}. It set
 *       {@code commercial_subtype = NULL} explicitly for every pre-existing commercial
 *       row, because the Shop-vs-Office distinction was never recorded for them.</li>
 *   <li><b>V104</b> then added ~25 flat commercial columns back onto
 *       {@code property_listings}, all nullable, <b>with no backfill</b>.</li>
 *   <li><b>V32</b> is older still, and is where the flat {@code total_floors} and
 *       {@code road_frontage_ft} columns that V102 backfilled FROM came from.</li>
 * </ul>
 *
 * <p>A renderer that reads one source shows an empty fact for every row authored through
 * another path. Worse than blank: the two Discover read paths were reading <b>different
 * sources for the same field</b>. {@code DiscoverListingsService} took {@code total_floors}
 * from the V102 typed tables while {@code CityAreaListingsService} took it from the V32
 * flat column — so one listing could report two different floor counts depending on which
 * panel a shopper was looking at, in the same session.
 *
 * <h2>The rule, stated once</h2>
 *
 * <p>Per fact, in precedence order. The ordering principle is the same each time:
 * <b>the most recent deliberate write wins, and a backfilled copy is never preferred over
 * the source it was derived from being re-written.</b>
 *
 * <table border="1">
 *   <caption>Source precedence per Commercial fact</caption>
 *   <tr><th>Fact</th><th>First</th><th>Fallback</th><th>Why this order</th></tr>
 *   <tr>
 *     <td>{@code totalFloors}</td>
 *     <td>V102 typed child ({@code lcsd}/{@code lcbd}/{@code lwd})</td>
 *     <td>V32 flat {@code property_listings.total_floors}</td>
 *     <td>The typed projection is the current commercial write path
 *         ({@code CommercialSpaceDetailRepository#upsertFromListing}) and V102 seeded it
 *         from the flat column, so typed is never staler than flat for a row that HAS a
 *         projection row. A commercial row with no projection row at all still reads its
 *         flat value rather than rendering blank.</td>
 *   </tr>
 *   <tr>
 *     <td>{@code roadFrontageFt}</td>
 *     <td>V102 typed child ({@code lcsd}/{@code lcbd}/{@code lwd}/{@code lcld})</td>
 *     <td>V32 flat {@code property_listings.road_frontage_ft}</td>
 *     <td>Identical argument to {@code totalFloors} — same backfill, same writer.</td>
 *   </tr>
 *   <tr>
 *     <td>{@code floorNumber}</td>
 *     <td>V102 typed child ({@code lcsd})</td>
 *     <td>V32 flat {@code property_listings.floor_number}</td>
 *     <td>Identical argument to {@code totalFloors} again — {@code floor_number} is the
 *         THIRD fact with a flat copy ({@code V32}), which V102 backfilled the typed
 *         column from, and which {@code ListingCrudService} still writes. Missed in the
 *         first cut of this class, which gave the fallback to {@code totalFloors} and
 *         {@code roadFrontageFt} but not to this one — so a commercial row with no
 *         projection row rendered its floor blank while its other two facts fell back
 *         correctly.</td>
 *   </tr>
 *   <tr>
 *     <td>floor LABEL (the V104 token)</td>
 *     <td>V104 flat ({@code floor_choice} / {@code floor_mode})</td>
 *     <td>V102 typed {@code floor_number}</td>
 *     <td>Reversed relative to the two above, and deliberately so. V104 has NO backfill,
 *         so a non-null value there can only have been written by the current commercial
 *         author flow — its presence is itself evidence of a deliberate write. V102's
 *         {@code floor_number} is the backfilled legacy copy.</td>
 *   </tr>
 * </table>
 *
 * <h2>Why floor is resolved by the client and the other two are resolved here</h2>
 *
 * <p>{@code totalFloors} and {@code roadFrontageFt} have ONE shape in both locations — an
 * {@code int} and a {@code numeric} — so picking a winner loses nothing and is done here,
 * once, for every consumer.
 *
 * <p>Floor does not: V104 stores a free-text token ({@code "GROUND"}, {@code "MEZZANINE"})
 * while V102 stores an integer that renders as {@code "Floor 2 of 5"}. Collapsing them
 * server-side would throw away the distinction the presentation layer needs, so
 * {@link DiscoverCommercialFacts} carries BOTH shapes and {@code resolveFloorFact} in
 * {@code apps/web/src/lib/commercialSummary.ts} applies the precedence declared in the
 * table above. That function is the client half of THIS rule, not a second rule — if the
 * order above ever changes, it changes there too.
 *
 * <h2>Why both feeds call {@link #readFrom} instead of each mapping their own columns</h2>
 *
 * <p>#2506 requires the rule to live in one place that both the detail surface (#2432) and
 * the card surface (#2433/#2516) consume. Two services each holding a correct-looking copy
 * of the precedence is exactly how they diverged in the first place, so the shared thing is
 * the READER, not a documented convention. Both SELECTs expose the aliases named in
 * {@link #readFrom}'s contract and neither service maps a commercial column itself.
 */
public final class CommercialFactAuthority {

    private CommercialFactAuthority() {
    }

    /**
     * The Commercial-family property types.
     *
     * <p>Matches {@code ListingCrudService.COMMERCIAL_PROPERTY_TYPES} and the domain of
     * {@link DiscoverListingsService#resolveBuyerCommercialSubtype}'s switch. Those are
     * pre-existing private copies in the write path; consolidating them is not in scope
     * here, but this set must not drift from them.
     */
    private static final Set<String> COMMERCIAL_PROPERTY_TYPES =
            Set.of("commercial", "commercial_building", "warehouse", "commercial_land");

    /**
     * True when the listing belongs to the Commercial family.
     *
     * <p>Keyed on {@code property_type}, NOT on whether a subtype resolved: a legacy
     * {@code property_type = 'commercial'} row whose Shop-vs-Office was never recorded is
     * still a Commercial listing, and treating it as Residential is precisely the leak
     * this predicate exists to prevent.
     */
    public static boolean isCommercialFamily(String propertyType) {
        if (propertyType == null) {
            return false;
        }
        return COMMERCIAL_PROPERTY_TYPES.contains(propertyType.trim().toLowerCase(Locale.ROOT));
    }

    /**
     * Reads the allowlisted Commercial facts from a row, applying the precedence rule above.
     *
     * <p><b>Column alias contract.</b> Every caller's SELECT must expose exactly these
     * aliases. They are deliberately explicit about provenance rather than reusing the bare
     * column name, so that a query which forgets one source fails loudly at
     * {@code getObject} rather than silently resolving to the surviving copy:
     *
     * <ul>
     *   <li>V104 flat, straight off {@code property_listings}: {@code floor_choice},
     *       {@code floor_mode}, {@code hub_type}, {@code office_seats},
     *       {@code occupancy_status}, {@code warehouse_clear_height_ft},
     *       {@code warehouse_loading_bays}, {@code commercial_zoning}</li>
     *   <li>V102 typed: {@code commercial_floor_number}, {@code typed_total_floors},
     *       {@code typed_road_frontage_ft}</li>
     *   <li>V32 flat legacy: {@code legacy_floor_number}, {@code legacy_total_floors},
     *       {@code legacy_road_frontage_ft}</li>
     * </ul>
     *
     * <p>Returns {@code null} when no fact is populated, so a {@code NON_NULL} DTO omits the
     * object entirely rather than emitting an empty {@code {}} that invites a client to
     * render an empty summary row.
     */
    public static DiscoverCommercialFacts readFrom(ResultSet rs) throws SQLException {
        return DiscoverCommercialFacts.orNullIfEmpty(new DiscoverCommercialFacts(
                rs.getString("floor_choice"),
                rs.getString("floor_mode"),
                // getObject(..., Class) — NOT getInt, which returns 0 for a SQL NULL and
                // would turn "no seats recorded" into "0 seats", fabricating a fact.
                resolveFloorNumber(
                        rs.getObject("commercial_floor_number", Integer.class),
                        rs.getObject("legacy_floor_number", Integer.class)),
                resolveTotalFloors(
                        rs.getObject("typed_total_floors", Integer.class),
                        rs.getObject("legacy_total_floors", Integer.class)),
                rs.getString("hub_type"),
                rs.getObject("office_seats", Integer.class),
                rs.getString("occupancy_status"),
                nullableDouble(rs, "warehouse_clear_height_ft"),
                rs.getObject("warehouse_loading_bays", Integer.class),
                resolveRoadFrontageFt(
                        nullableDouble(rs, "typed_road_frontage_ft"),
                        nullableDouble(rs, "legacy_road_frontage_ft")),
                rs.getString("commercial_zoning")));
    }

    /**
     * V102 typed wins; V32 flat {@code property_listings.total_floors} is the fallback.
     *
     * <p>Also correct for non-Commercial rows, which is why the card path can call it
     * unconditionally — but for a narrower reason than "a Residential listing has no typed
     * row". It HAS one: {@code listing_residential_unit_details} carries {@code total_floors}
     * (V102) and the current residential write path fills it. What makes this safe is that
     * {@code typed_total_floors} coalesces only the three COMMERCIAL projections and
     * deliberately excludes the residential table, so a Residential row's {@code typed} is
     * null here and its flat value passes through unchanged.
     *
     * <p>That exclusion is a CHOICE, not a property of the data: Residential total-floors is
     * read flat-only on both feeds. Consistent, and no divergence — but if you are tempted to
     * "fix" the coalesce by adding the residential table, understand you would be extending
     * this precedence rule to Residential, which is a separate decision and needs its own
     * fixture.
     */
    public static Integer resolveTotalFloors(Integer typed, Integer legacyFlat) {
        return typed != null ? typed : legacyFlat;
    }

    /**
     * V102 typed wins; V32 flat {@code property_listings.floor_number} is the fallback.
     *
     * <p>The third dual-storage fact, and the one the first cut of this class missed.
     * {@code floor_number} has exactly the same shape as {@code totalFloors} — a V32 flat
     * column that V102 backfilled the typed copy from, still written today by
     * {@code ListingCrudService} — so it gets the same precedence. Without this, a commercial
     * row with no typed projection row rendered a blank floor while its {@code totalFloors}
     * and {@code roadFrontageFt} fell back correctly, which is the exact "renders blank for
     * rows authored through the other path" defect #2506 exists to close.
     *
     * <p>Distinct from the V104 {@code floor_choice}/{@code floor_mode} TOKEN, which the
     * client prefers over this integer — see the precedence table on this class. This
     * resolves which stored copy of the INTEGER wins; the client then decides whether to
     * render the token or the integer.
     */
    public static Integer resolveFloorNumber(Integer typed, Integer legacyFlat) {
        return typed != null ? typed : legacyFlat;
    }

    /** V102 typed wins; V32 flat {@code property_listings.road_frontage_ft} is the fallback. */
    public static Double resolveRoadFrontageFt(Double typed, Double legacyFlat) {
        return typed != null ? typed : legacyFlat;
    }

    /**
     * Reads a Postgres {@code numeric} column as a nullable {@code Double}.
     *
     * <p><b>Do not replace this with {@code rs.getObject(column, Double.class)}.</b> pgjdbc
     * has no such conversion for {@code numeric} and throws
     * {@code "conversion to class java.lang.Double from numeric not supported"} on the FIRST
     * row, aborting the entire query. That exact defect once turned every authenticated
     * {@code GET /api/discover/listings} into a 500 — for every city, whether or not the page
     * contained a commercial row.
     *
     * <p>The throw keys on the column's TYPE, not its value, so an all-NULL commercial
     * fixture provides zero protection and a mocked {@code ResultSet} cannot reproduce it at
     * all. Only a real-database test over a genuinely {@code numeric} column guards this.
     *
     * <p>The columns that need it: {@code road_frontage_ft} (V32 flat and all four V102 typed
     * tables) and {@code warehouse_clear_height_ft} (V104).
     *
     * <p>{@code BigDecimal.class} IS supported for {@code numeric}, so read that and narrow.
     * The null check is what keeps "no clear height recorded" from becoming "0.0 ft".
     */
    static Double nullableDouble(ResultSet rs, String column) throws SQLException {
        BigDecimal value = rs.getObject(column, BigDecimal.class);
        return value == null ? null : value.doubleValue();
    }
}

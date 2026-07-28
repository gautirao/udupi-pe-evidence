package com.example.realestate.discover.navigation;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;
import java.util.Map;

/**
 * Response body for {@code GET /api/discover/cities/{city}/navigation/{nodeKey}/counts} (#1955
 * Areas PR A, SLICE 2e, AC8b; school counts + per-area map added #1956 PR1) — display-time counts
 * ONLY, deliberately separate from the structural {@link NavigationNodeResponse} (see that
 * record's javadoc).
 *
 * <p>{@code count} keeps its pre-#1956 field name for the listing total — renaming it would be a
 * breaking wire change for no benefit, and no {@code listingCount} alias is added alongside it (two
 * names for one number invites drift).
 *
 * <p><b>{@code schoolCount} vs {@code AreaSummary#schoolCount}'s badge.</b> For an AREA node the two
 * are EQUAL: both count that area's own qualifying coverage rows, and V110's {@code PRIMARY KEY
 * (school_id, curated_area_key)} means the badge's {@code COUNT(*)} cannot exceed a distinct-school
 * count. For a CLUSTER/DIRECTION node, {@code schoolCount} is the DISTINCT UNION over its descendant
 * areas, so a school covering two of them counts once — which is why it may be LESS than the sum of
 * those areas' badges, and why {@code areaSchoolCounts} must not be summed. See {@link
 * PostgresAreaSchoolCountProvider} and {@link AreaSchoolCoverage}.
 *
 * <p>(Two earlier revisions of this paragraph were wrong: the first asserted an equality the
 * then-current implementation could not deliver, the second documented the resulting per-area
 * divergence as if intended. Per-area equality is now true because the implementation was fixed.)
 *
 * <p><b>Anonymous-caller policy (#1956 PR1 AC1.15).</b> These counts are PRECISE and IDENTICAL for
 * anonymous and authenticated callers. That is deliberate and safe, not an oversight: the same
 * per-area listing counts are already public on {@code GET /api/discover/areas}, and the school
 * counts are provably a SUBSET of that endpoint's already-public per-area school badge, so this
 * route exposes no aggregate an anonymous caller could not already obtain. There is therefore no
 * bucketing, rounding, or suppression to apply here. {@code AreaCountQuery#exposure} is RESERVED for
 * a future public/authenticated tiering distinction and is currently inert — it participates only in
 * the cache key. It MUST NOT be used to tier counts without a corresponding server-side
 * authorization check: a client-supplied exposure value is not an authorization decision, and
 * treating it as one would let any caller select the more privileged tier by asking for it.
 *
 * @param nodeKey           the node this count is for (or the literal {@code "root"})
 * @param count             this node's own rolled-up listing total (unique-leaf-area SUM — a listing
 *                          belongs to exactly one area; see {@link AreaCountRollupService})
 * @param schoolCount       this node's own rolled-up school total: the DISTINCT UNION over its
 *                          descendant areas' schools, NOT a sum of their per-area counts. A school
 *                          covering two descendant areas counts ONCE here while counting for each of
 *                          those areas individually in {@code areaSchoolCounts}. See {@link
 *                          AreaSchoolCoverage}. (For {@code "root"} this is the union across the
 *                          whole city.)
 * @param areaCounts        the WHOLE-CITY {@code area_key -> listing count} map this response's
 *                          totals were rolled up from (already fetched server-side — exposed here so
 *                          callers needing per-area listing counts don't need a follow-up round trip)
 * @param areaSchoolCounts  the WHOLE-CITY {@code area_key -> school count} map, mirroring {@code
 *                          areaCounts} in shape and purpose. Each entry is that area's OWN distinct
 *                          school count: a school with qualifying coverage in two areas is counted
 *                          in BOTH, because it genuinely is in both. These values therefore CANNOT
 *                          be summed to obtain a parent's total — {@code count}/{@code schoolCount}
 *                          and {@code children} already carry the correctly union-deduplicated
 *                          roll-ups, and a client must use those rather than adding these up. An
 *                          area with no counted schools is ABSENT from the map, not zero-valued.
 * @param children          each direct child's own rolled-up listing + school totals, in display
 *                          order
 * @param revisionId        the production revision the counts' structural fold was computed against
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record NavigationCountsResponse(
        String nodeKey,
        long count,
        long schoolCount,
        Map<String, Long> areaCounts,
        Map<String, Long> areaSchoolCounts,
        List<AreaCountRollupService.NodeCount> children,
        long revisionId
) {
}

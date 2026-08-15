package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.navigation.SandboxNavigationNode;
import com.example.realestate.discover.navigation.SandboxNavigationOverride;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Deterministic checksum of one {@link CityLaunchRevision}'s full {@code sandbox_*} row set (#1911
 * PR5, the "before" anchor {@link CityLaunchGraphWriter} stores as {@code persisted_revision_checksum}
 * and the SAME digest {@link CityLaunchPromotionService} recomputes at launch time to verify no
 * out-of-band sandbox mutation occurred between prep completion and promotion).
 *
 * <p>Package-private static so both call sites compute the IDENTICAL digest by construction — this
 * class is the ONE place the algorithm is defined. Mirrors the {@code
 * AreaOnboardingApplyService}/{@code AreaOnboardingReviewService} precedent (V115/V116) of a
 * length-prefixed, null-distinguishing field encoding ({@link #appendField}) feeding a SHA-256
 * digest ({@link #sha256Hex}) — those two pure helpers are DUPLICATED here (not imported/promoted
 * to public on the frozen {@code AreaOnboardingApplyService}), matching that file's own documented
 * duplication convention (its javadoc: "duplicated (not shared) ... mirrors the same duplication
 * already present between AreaOnboardingService and CityRegionOnboardingService").
 *
 * <h2>Ordering</h2>
 * Each of the six {@code sandbox_*} row lists is sorted by a stable natural key before encoding
 * (area_key, alias_normalised, region_key, a composite owning-area-key+region_key key, slug, and a
 * composite owning-group-slug+owning-area-key key respectively) so the digest is independent of
 * read/insertion order and JDBC/JPA result-set ordering — two reads of the identical row set always
 * produce the identical digest. Memberships/groupMembers sort (and hash) by the referenced row's
 * NATURAL key rather than its surrogate id, so the digest also detects an out-of-band reassignment
 * to a different area/group (see {@link #resolveAreaKey} / {@link #resolveGroupSlug}).
 *
 * <h2>Serialization</h2>
 * Every field of every row, across all six tables in a fixed table order, is appended via {@link
 * #appendField} — a length-prefixed encoding where changing any ONE field's value always changes
 * the resulting digest, even across adjacent free-text fields (an area's {@code name} can never be
 * misread as bleeding into {@code district}, etc.).
 *
 * <h2>#1955 Areas PR A — seventh-table extension (D2, APPEND-ONLY)</h2>
 * {@link #compute(List, List, List, List, List, List, List)} appends a SEVENTH, TRAILING section
 * for {@code sandbox_navigation_nodes} after the original six. The six-arg {@link #compute(List,
 * List, List, List, List, List)} overload is UNCHANGED — it delegates with an empty navigation-node
 * list, and an empty list contributes NO characters to the raw string (the trailing section is
 * only appended when non-empty) — so every pre-#1955 revision's {@code persisted_revision_checksum}
 * still verifies, byte-for-byte, against the ORIGINAL six-section algorithm. No version bump.
 *
 * <h2>#1955 Areas PR A, SLICE 2f+2g — eighth-table extension (APPEND-ONLY)</h2>
 * {@link #compute(List, List, List, List, List, List, List, List)} appends an EIGHTH, TRAILING
 * section for {@code sandbox_navigation_override} after the seven above, on the same "empty list
 * contributes nothing" append-only discipline — so every revision prepared before an override was
 * ever applied to it still verifies against the seven-section digest. Overrides are covered
 * DIRECTLY here (not merely indirectly via their effect on {@code sandbox_navigation_nodes})
 * so the checksum gate can detect a tampered/added/removed override row even in the rare case
 * its structural effect on the generated tree happens to be a no-op.
 *
 * <h2>#2151 PR A — ninth-table extension (APPEND-ONLY, RELEASE-BLOCKING contract, AC16)</h2>
 * {@link #compute(List, List, List, List, List, List, List, List, List)} appends a NINTH, TRAILING
 * section for {@code sandbox_agri_destination_classification} after the eight above, on the SAME
 * "empty list contributes nothing" append-only discipline as every prior extension — so every
 * revision prepared before this change (and any revision generation legitimately produced zero Agri
 * rows for) leaves the raw string byte-identical to the eight-section encoding, and its
 * ALREADY-persisted {@code persisted_revision_checksum} keeps verifying without a re-prepare. The
 * eight-arg {@link #compute(List, List, List, List, List, List, List, List)} overload is UNCHANGED
 * — it delegates with an empty Agri list. Getting this wrong makes every historical {@code
 * persisted_revision_checksum} fail verification with a 422 at the next promotion — a
 * pipeline-wide outage, not a degraded feature — which is why this contract is covered by a
 * dedicated release-blocking unit test ({@code RevisionChecksumTest}, AC16).
 */
final class RevisionChecksum {

    private RevisionChecksum() {}

    /** Pre-#1955 six-table signature, preserved for existing call sites. Delegates with an empty
     *  navigation-node list, which is a no-op on the raw string (see class javadoc). */
    static String compute(
            List<SandboxArea> areas,
            List<SandboxAreaAlias> aliases,
            List<SandboxCityRegion> regions,
            List<SandboxCityRegionMembership> memberships,
            List<SandboxAreaGroup> groups,
            List<SandboxAreaGroupMember> groupMembers) {
        return compute(areas, aliases, regions, memberships, groups, groupMembers, List.of());
    }

    /** #1955 Areas PR A seventh-table signature, preserved for existing call sites. Delegates with
     *  an empty override list, which is a no-op on the raw string (see class javadoc). */
    static String compute(
            List<SandboxArea> areas,
            List<SandboxAreaAlias> aliases,
            List<SandboxCityRegion> regions,
            List<SandboxCityRegionMembership> memberships,
            List<SandboxAreaGroup> groups,
            List<SandboxAreaGroupMember> groupMembers,
            List<SandboxNavigationNode> navigationNodes) {
        return compute(areas, aliases, regions, memberships, groups, groupMembers, navigationNodes, List.of());
    }

    /**
     * #1955 Areas PR A, SLICE 2f+2g eighth-table signature, preserved for existing call sites.
     * Delegates with an empty Agri-destination list, which is a no-op on the raw string (see class
     * javadoc, #2151 PR A AC16).
     */
    static String compute(
            List<SandboxArea> areas,
            List<SandboxAreaAlias> aliases,
            List<SandboxCityRegion> regions,
            List<SandboxCityRegionMembership> memberships,
            List<SandboxAreaGroup> groups,
            List<SandboxAreaGroupMember> groupMembers,
            List<SandboxNavigationNode> navigationNodes,
            List<SandboxNavigationOverride> overrides) {
        return compute(areas, aliases, regions, memberships, groups, groupMembers, navigationNodes,
                overrides, List.of());
    }

    /**
     * #2151 PR A ninth-table signature — see class javadoc for the append-only contract (AC16).
     * {@code agriDestinations} is appended as a NINTH, TRAILING section after {@code overrides},
     * only when non-empty, so an empty Agri-destination list (every revision prepared before this
     * change) leaves the raw string byte-identical to the eight-section encoding.
     */
    static String compute(
            List<SandboxArea> areas,
            List<SandboxAreaAlias> aliases,
            List<SandboxCityRegion> regions,
            List<SandboxCityRegionMembership> memberships,
            List<SandboxAreaGroup> groups,
            List<SandboxAreaGroupMember> groupMembers,
            List<SandboxNavigationNode> navigationNodes,
            List<SandboxNavigationOverride> overrides,
            List<SandboxAgriDestinationClassification> agriDestinations) {
        StringBuilder raw = new StringBuilder();

        // Owning-row-identity lookups: membership/groupMember digests must hash the NATURAL key of
        // the area/group they reference, not just the row's own value fields — otherwise an
        // out-of-band reassignment (repoint a membership to a different area, or swap which area two
        // group-members reference) that preserves the serialized-value multiset is invisible to the
        // digest. See RevisionChecksum javadoc / #1911 PR5 AC5 tamper-detection contract.
        Map<Long, String> areaKeyBySandboxAreaId = new HashMap<>();
        areas.forEach(a -> areaKeyBySandboxAreaId.put(a.getId(), a.getAreaKey()));
        Map<Long, String> groupSlugBySandboxAreaGroupId = new HashMap<>();
        groups.forEach(g -> groupSlugBySandboxAreaGroupId.put(g.getId(), g.getSlug()));

        raw.append("areas=[");
        areas.stream()
                .sorted(Comparator.comparing(SandboxArea::getAreaKey, Comparator.nullsFirst(Comparator.naturalOrder())))
                .forEach(a -> {
                    raw.append('{');
                    appendField(raw, a.getAreaKey());
                    appendField(raw, a.getName());
                    appendField(raw, a.getDistrict());
                    appendField(raw, a.getGeoCenterLat());
                    appendField(raw, a.getGeoCenterLon());
                    appendField(raw, a.getMinLat());
                    appendField(raw, a.getMinLon());
                    appendField(raw, a.getMaxLat());
                    appendField(raw, a.getMaxLon());
                    appendField(raw, a.getGeometrySource());
                    appendField(raw, a.getOsmElementType());
                    appendField(raw, a.getOsmElementId());
                    appendField(raw, a.getLifecycleStatus());
                    raw.append('}');
                });
        raw.append("];aliases=[");
        aliases.stream()
                .sorted(Comparator
                        .comparing((SandboxAreaAlias al) -> resolveAreaKey(al.getSandboxAreaId(), areaKeyBySandboxAreaId),
                                Comparator.nullsFirst(Comparator.naturalOrder()))
                        .thenComparing(SandboxAreaAlias::getAliasNormalised, Comparator.nullsFirst(Comparator.naturalOrder())))
                .forEach(al -> {
                    raw.append('{');
                    // Owning area's NATURAL key hashed FIRST — a reassignment of this alias to a
                    // different sandbox area changes the digest even if alias/aliasNormalised (the
                    // value multiset) are unchanged.
                    appendField(raw, resolveAreaKey(al.getSandboxAreaId(), areaKeyBySandboxAreaId));
                    appendField(raw, al.getAlias());
                    appendField(raw, al.getAliasNormalised());
                    raw.append('}');
                });
        raw.append("];regions=[");
        regions.stream()
                .sorted(Comparator.comparing(SandboxCityRegion::getRegionKey, Comparator.nullsFirst(Comparator.naturalOrder())))
                .forEach(r -> {
                    raw.append('{');
                    appendField(raw, r.getRegionKey());
                    appendField(raw, r.getDisplayLabel());
                    appendField(raw, r.getDisplayOrder());
                    appendField(raw, r.getCentreLat());
                    appendField(raw, r.getCentreLon());
                    appendField(raw, r.getMinLat());
                    appendField(raw, r.getMinLon());
                    appendField(raw, r.getMaxLat());
                    appendField(raw, r.getMaxLon());
                    appendField(raw, r.getPolicyFingerprint());
                    raw.append('}');
                });
        raw.append("];memberships=[");
        memberships.stream()
                .sorted(Comparator
                        .comparing((SandboxCityRegionMembership m) -> resolveAreaKey(m.getSandboxAreaId(), areaKeyBySandboxAreaId),
                                Comparator.nullsFirst(Comparator.naturalOrder()))
                        .thenComparing(SandboxCityRegionMembership::getRegionKey, Comparator.nullsFirst(Comparator.naturalOrder())))
                .forEach(m -> {
                    raw.append('{');
                    // Owning area's NATURAL key hashed FIRST — a reassignment of this membership to a
                    // different sandbox area changes the digest even if regionKey/assignmentSource
                    // (the value multiset) are unchanged.
                    appendField(raw, resolveAreaKey(m.getSandboxAreaId(), areaKeyBySandboxAreaId));
                    appendField(raw, m.getRegionKey());
                    appendField(raw, m.getAssignmentSource() == null ? null : m.getAssignmentSource().name());
                    raw.append('}');
                });
        raw.append("];groups=[");
        groups.stream()
                .sorted(Comparator.comparing(SandboxAreaGroup::getSlug, Comparator.nullsFirst(Comparator.naturalOrder())))
                .forEach(g -> {
                    raw.append('{');
                    appendField(raw, g.getSlug());
                    appendField(raw, g.getName());
                    appendField(raw, g.getSubtitle());
                    appendField(raw, g.getRegionLabel());
                    appendField(raw, g.getDisplayOrder());
                    appendField(raw, Boolean.toString(g.isActive()));
                    appendField(raw, g.getFocusLat());
                    appendField(raw, g.getFocusLon());
                    appendField(raw, g.getMinLat());
                    appendField(raw, g.getMinLon());
                    appendField(raw, g.getMaxLat());
                    appendField(raw, g.getMaxLon());
                    raw.append('}');
                });
        raw.append("];groupMembers=[");
        groupMembers.stream()
                .sorted(Comparator
                        .comparing((SandboxAreaGroupMember gm) -> resolveGroupSlug(gm.getSandboxAreaGroupId(), groupSlugBySandboxAreaGroupId),
                                Comparator.nullsFirst(Comparator.naturalOrder()))
                        .thenComparing(gm -> resolveAreaKey(gm.getSandboxAreaId(), areaKeyBySandboxAreaId),
                                Comparator.nullsFirst(Comparator.naturalOrder())))
                .forEach(gm -> {
                    raw.append('{');
                    // Owning group's + owning area's NATURAL keys hashed FIRST — swapping which area
                    // two group-members reference (keeping displayOrder identical) changes the digest.
                    appendField(raw, resolveGroupSlug(gm.getSandboxAreaGroupId(), groupSlugBySandboxAreaGroupId));
                    appendField(raw, resolveAreaKey(gm.getSandboxAreaId(), areaKeyBySandboxAreaId));
                    appendField(raw, gm.getDisplayOrder());
                    raw.append('}');
                });
        raw.append(']');

        // #1955 Areas PR A: seventh, TRAILING section — appended ONLY when non-empty so an empty
        // navigation-node list (every pre-#1955 revision, and any revision this generator hasn't
        // run for yet) leaves the raw string byte-identical to the original six-section encoding.
        if (!navigationNodes.isEmpty()) {
            Map<Long, String> nodeKeyBySandboxNodeId = new HashMap<>();
            navigationNodes.forEach(n -> nodeKeyBySandboxNodeId.put(n.getId(), n.getNodeKey()));

            raw.append(";navigationNodes=[");
            navigationNodes.stream()
                    .sorted(Comparator.comparing(SandboxNavigationNode::getNodeKey,
                            Comparator.nullsFirst(Comparator.naturalOrder())))
                    .forEach(n -> {
                        raw.append('{');
                        appendField(raw, n.getNodeKey());
                        appendField(raw, n.getRegionKey());
                        appendField(raw, n.getNodeType());
                        // Parent's NATURAL key (node_key), not the sandbox surrogate id — same
                        // reassignment-detection contract as resolveAreaKey/resolveGroupSlug above.
                        appendField(raw, resolveParentNodeKey(n.getParentNodeId(), nodeKeyBySandboxNodeId));
                        appendField(raw, n.getAreaKey());
                        appendListField(raw, n.getRepresentativeAreaKeys());
                        appendField(raw, n.getDisplayLabel());
                        appendField(raw, n.getDisplayOrder());
                        appendField(raw, n.getDepth());
                        appendListField(raw, n.getAncestorKeys());
                        appendField(raw, n.getDescendantAreaCount());
                        appendField(raw, n.getCentreLat());
                        appendField(raw, n.getCentreLon());
                        appendField(raw, n.getMinLat());
                        appendField(raw, n.getMinLon());
                        appendField(raw, n.getMaxLat());
                        appendField(raw, n.getMaxLon());
                        appendField(raw, n.getPolicyFingerprint());
                        raw.append('}');
                    });
            raw.append(']');
        }

        // #1955 Areas PR A, SLICE 2f+2g: eighth, TRAILING section — appended ONLY when non-empty,
        // same append-only discipline as the seventh (navigationNodes) section above.
        if (!overrides.isEmpty()) {
            raw.append(";overrides=[");
            overrides.stream()
                    .sorted(Comparator
                            .comparing((SandboxNavigationOverride o) -> o.getOverrideKind().name())
                            .thenComparing(SandboxNavigationOverride::getSubjectAreaKey,
                                    Comparator.nullsFirst(Comparator.naturalOrder()))
                            .thenComparing(SandboxNavigationOverride::getSubjectNodeKey,
                                    Comparator.nullsFirst(Comparator.naturalOrder()))
                            .thenComparing(SandboxNavigationOverride::getApplyOrder))
                    .forEach(o -> {
                        raw.append('{');
                        appendField(raw, o.getOverrideKind().name());
                        appendField(raw, o.getSubjectAreaKey());
                        appendField(raw, o.getSubjectNodeKey());
                        appendField(raw, o.getTargetRegionKey());
                        appendField(raw, o.getTargetNodeKey());
                        appendField(raw, o.getNewLabel());
                        appendListField(raw, o.getNewRepresentativeAreaKeys());
                        appendField(raw, o.getApplyOrder());
                        appendField(raw, o.getReason());
                        appendField(raw, o.getCreatedBy() == null ? null : o.getCreatedBy().toString());
                        raw.append('}');
                    });
            raw.append(']');
        }

        // #2151 PR A: ninth, TRAILING section — appended ONLY when non-empty, same append-only
        // discipline as the seventh (navigationNodes) and eighth (overrides) sections above.
        // generatedAt is deliberately NOT hashed (see AgriDestinationClassificationGenerator class
        // javadoc "Determinism & idempotency") — it is the one column that legitimately varies
        // between two runs over otherwise-unchanged input, and hashing it would make the checksum
        // gate fail on every re-prepare even when nothing about the classification actually changed.
        if (!agriDestinations.isEmpty()) {
            raw.append(";agriDestinations=[");
            agriDestinations.stream()
                    .sorted(Comparator.comparing(SandboxAgriDestinationClassification::getAreaKey,
                            Comparator.nullsFirst(Comparator.naturalOrder())))
                    .forEach(a -> {
                        raw.append('{');
                        appendField(raw, a.getAreaKey());
                        appendField(raw, a.getOriginLat());
                        appendField(raw, a.getOriginLon());
                        appendField(raw, a.getDistanceKm());
                        appendField(raw, a.getBearingDeg());
                        appendField(raw, a.getDirectionKey());
                        appendField(raw, a.getDistanceBandKey());
                        appendField(raw, a.getGeneratorVersion());
                        raw.append('}');
                    });
            raw.append(']');
        }

        return sha256Hex(raw.toString());
    }

    /**
     * Computed-ON-READ fingerprint of a revision's CURRENT override row set — never persisted,
     * used only by the preview/diff endpoints ({@code overridesFingerprint} in {@code
     * NavigationTreeDiffResponse}) so an admin/UI can cheaply tell "did the override set change
     * since I last looked" without diffing the full tree. {@code null} for an empty override list
     * (distinct from "some fixed sentinel hash"), matching this class's null-is-meaningful
     * convention elsewhere.
     */
    static String computeOverridesFingerprint(List<SandboxNavigationOverride> overrides) {
        if (overrides == null || overrides.isEmpty()) {
            return null;
        }
        StringBuilder raw = new StringBuilder("overrides=[");
        overrides.stream()
                .sorted(Comparator
                        .comparing((SandboxNavigationOverride o) -> o.getOverrideKind().name())
                        .thenComparing(SandboxNavigationOverride::getSubjectAreaKey,
                                Comparator.nullsFirst(Comparator.naturalOrder()))
                        .thenComparing(SandboxNavigationOverride::getSubjectNodeKey,
                                Comparator.nullsFirst(Comparator.naturalOrder()))
                        .thenComparing(SandboxNavigationOverride::getApplyOrder))
                .forEach(o -> {
                    raw.append('{');
                    appendField(raw, o.getOverrideKind().name());
                    appendField(raw, o.getSubjectAreaKey());
                    appendField(raw, o.getSubjectNodeKey());
                    appendField(raw, o.getTargetRegionKey());
                    appendField(raw, o.getTargetNodeKey());
                    appendField(raw, o.getNewLabel());
                    appendListField(raw, o.getNewRepresentativeAreaKeys());
                    appendField(raw, o.getApplyOrder());
                    raw.append('}');
                });
        raw.append(']');
        return sha256Hex(raw.toString());
    }

    /**
     * Resolves a membership's owning area surrogate id to its natural {@code areaKey}. Falls back to
     * a deterministic, distinctly-prefixed encoding of the raw surrogate id — never silently drops a
     * row from the digest — should the id fail to resolve, which is unreachable post-prep-validation
     * (every {@code sandbox_area_id} referenced by a membership/group-member is guaranteed to exist
     * in {@code areas} for the same revision).
     */
    private static String resolveAreaKey(Long sandboxAreaId, Map<Long, String> areaKeyBySandboxAreaId) {
        if (sandboxAreaId == null) {
            return null;
        }
        String areaKey = areaKeyBySandboxAreaId.get(sandboxAreaId);
        return areaKey != null ? areaKey : "unresolved-area-id:" + sandboxAreaId;
    }

    /** Same fallback contract as {@link #resolveAreaKey}, for a group-member's owning group. */
    private static String resolveGroupSlug(Long sandboxAreaGroupId, Map<Long, String> groupSlugBySandboxAreaGroupId) {
        if (sandboxAreaGroupId == null) {
            return null;
        }
        String slug = groupSlugBySandboxAreaGroupId.get(sandboxAreaGroupId);
        return slug != null ? slug : "unresolved-group-id:" + sandboxAreaGroupId;
    }

    /** Same fallback contract as {@link #resolveAreaKey}, for a navigation node's parent. A {@code
     *  null} sandboxParentNodeId (a root node) resolves to {@code null} — distinct from an
     *  unresolvable non-null id, which resolves to the distinctly-prefixed fallback. */
    private static String resolveParentNodeKey(Long sandboxParentNodeId, Map<Long, String> nodeKeyBySandboxNodeId) {
        if (sandboxParentNodeId == null) {
            return null;
        }
        String nodeKey = nodeKeyBySandboxNodeId.get(sandboxParentNodeId);
        return nodeKey != null ? nodeKey : "unresolved-node-id:" + sandboxParentNodeId;
    }

    /**
     * Length-prefixed, null-distinguishing field encoding — duplicated from {@code
     * AreaOnboardingApplyService#appendField} (String overload only there); overloaded here for the
     * non-String column types sandbox rows carry so every call site stays a one-liner.
     */
    private static void appendField(StringBuilder sb, String value) {
        if (value == null) {
            sb.append("N;");
        } else {
            sb.append(value.length()).append(':').append(value).append(';');
        }
    }

    private static void appendField(StringBuilder sb, Object value) {
        appendField(sb, value == null ? null : value.toString());
    }

    /**
     * #2178 (follow-up to #2177): every {@code Double} column hashed by {@link #compute} — lat/lon/
     * centre/bounds/distance/bearing across all nine tables — routes through THIS overload (Java
     * overload resolution picks it over {@link #appendField(StringBuilder, Object)} for every
     * {@code Double}-typed getter call site above, with no call-site changes needed) rather than
     * hashing {@code Double.toString(value)} directly.
     *
     * <p>#2177's detach-then-re-query fix guarantees prepare-time and promote-time both issue a
     * genuinely fresh read of the same underlying row — but does NOT guarantee they get the SAME
     * wire representation of that read. pgjdbc negotiates BINARY transfer (full IEEE-754 precision)
     * after roughly 5 executions of the same prepared statement, but stays on TEXT transfer (subject
     * to the server's {@code extra_float_digits} setting, 0 on the hosted connection — 15
     * significant digits) before that threshold. Depending on connection/statement-cache state at
     * prepare time vs. promote time, one side could hash a full-precision BINARY read and the other a
     * 15-significant-digit TEXT read of the IDENTICAL stored value, still producing different digests
     * — a genuine gap distinct from (and found after) the identity-map staleness #2177 already fixed.
     *
     * <p>Canonicalizing every double to 15 significant digits before hashing closes this regardless of
     * which wire format either side happened to get: a double already carrying <=15 significant
     * digits (a TEXT-transfer read) is unaffected, and a full-precision BINARY-transfer read of the
     * SAME underlying value rounds down to the identical 15-digit decimal. 15 is the largest precision
     * that is safe for this purpose — {@code DBL_DIG}, the IEEE-754 double guarantee that any decimal
     * with <=15 significant digits survives a parse-to-double-and-back-to-decimal round trip exactly
     * — so this canonicalization is idempotent: re-rounding an already-15-digit value can never change
     * it, and both a TEXT-truncated read and a BINARY-exact read of one true value always converge on
     * the SAME canonical string. Going any higher than 15 would let true precision differences distinguish TEXT
     * from BINARY reads of the identical value again, reopening this exact gap; going lower would
     * throw away real precision this checksum needs for tamper detection (e.g. distinguishing two
     * areas whose coordinates differ only in the 13th/14th significant digit).
     */
    private static void appendField(StringBuilder sb, Double value) {
        appendField(sb, value == null ? null : canonicalizeDouble(value));
    }

    /** See {@link #appendField(StringBuilder, Double)} javadoc for the full #2177/#2178 rationale. */
    private static String canonicalizeDouble(double value) {
        if (Double.isNaN(value) || Double.isInfinite(value)) {
            // Unreachable for every current Double column (lat/lon/distance/bearing are always finite
            // real numbers) — handled defensively so this helper never throws on an unexpected input.
            return Double.toString(value);
        }
        return new BigDecimal(value)
                .round(new MathContext(15, RoundingMode.HALF_UP))
                .stripTrailingZeros()
                .toPlainString();
    }

    /**
     * #1955 Areas PR A: length-prefixed encoding for an ordered {@code text[]} field (
     * {@code representative_area_keys}, {@code ancestor_keys}) — element count first, then every
     * element via {@link #appendField(StringBuilder, String)} so a value containing a delimiter
     * character can never be misread as spanning two elements, and a {@code null} list is
     * distinguishable from an empty one.
     */
    private static void appendListField(StringBuilder sb, List<String> values) {
        if (values == null) {
            sb.append("NL;");
            return;
        }
        sb.append(values.size()).append('#');
        for (String v : values) {
            appendField(sb, v);
        }
    }

    /** sha256 hex digest, duplicated (not shared) from {@code AreaOnboardingApplyService#sha256Hex}. */
    private static String sha256Hex(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is guaranteed available on every JVM; unreachable in practice.
            return value;
        }
    }
}

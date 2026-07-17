package com.example.realestate.discover.citylaunch;

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
 */
final class RevisionChecksum {

    private RevisionChecksum() {}

    static String compute(
            List<SandboxArea> areas,
            List<SandboxAreaAlias> aliases,
            List<SandboxCityRegion> regions,
            List<SandboxCityRegionMembership> memberships,
            List<SandboxAreaGroup> groups,
            List<SandboxAreaGroupMember> groupMembers) {
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

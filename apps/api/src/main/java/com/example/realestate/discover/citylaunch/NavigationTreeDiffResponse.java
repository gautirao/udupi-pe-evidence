package com.example.realestate.discover.citylaunch;

import java.util.List;

/**
 * Structural diff of a revision's SANDBOX navigation tree against a comparison basis (#1955 Areas
 * PR A, SLICE 2f+2g) — {@code GET .../navigation/diff} and the 200-body of a successful
 * override POST/DELETE. Compares STRUCTURAL fields only (node_key/parent/label/representatives) —
 * {@code generated_at} and {@code policy_fingerprint} are deliberately excluded, matching the
 * approved design's "structural-only" diff contract; listing counts never enter this comparison
 * either (see {@link com.example.realestate.discover.navigation.NavigationTreeGenerator} class
 * javadoc — the tree itself never carries listing volume).
 */
public record NavigationTreeDiffResponse(
        long revisionId,
        String against,
        String overridesFingerprint,
        List<String> added,
        List<String> removed,
        List<MovedNode> moved,
        List<RelabeledNode> relabeled,
        List<RepresentativeChange> representativeChanges) {

    public record MovedNode(String nodeKey, String fromParentNodeKey, String toParentNodeKey) {}

    public record RelabeledNode(String nodeKey, String fromLabel, String toLabel) {}

    public record RepresentativeChange(String nodeKey, List<String> fromRepresentativeAreaKeys,
                                        List<String> toRepresentativeAreaKeys) {}
}

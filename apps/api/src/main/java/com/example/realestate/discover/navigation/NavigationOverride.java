package com.example.realestate.discover.navigation;

import java.util.List;

/**
 * Entity-agnostic view of one controlled-override input (#1955 Areas PR A, SLICE 2f+2g),
 * consumed by {@link NavigationTreeValidationService#checkOverrides} (AC7 #12) and {@link
 * NavigationTreeOverrideApplier}. {@code kind} is one of the five {@link OverrideKind} names.
 * Exactly one of {@code subjectAreaKey}/{@code subjectNodeKey} is non-null, matching the V122
 * DB CHECK's subject-XOR + kind-shape constraints — see {@link SandboxNavigationOverride}
 * javadoc for the per-kind field-shape contract this record mirrors.
 */
public record NavigationOverride(
        String kind, String subjectAreaKey, String subjectNodeKey, String targetRegionKey,
        String targetNodeKey, String newLabel, List<String> newRepresentativeAreaKeys, int applyOrder) {
}

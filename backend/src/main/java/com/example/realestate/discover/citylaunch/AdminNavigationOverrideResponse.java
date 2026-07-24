package com.example.realestate.discover.citylaunch;

import com.example.realestate.discover.navigation.SandboxNavigationOverride;

import java.util.List;
import java.util.UUID;

/** One persisted controlled-override row (#1955 Areas PR A, SLICE 2f+2g) — {@code GET .../navigation/overrides}. */
public record AdminNavigationOverrideResponse(
        long id,
        String kind,
        String subjectAreaKey,
        String subjectNodeKey,
        String targetRegionKey,
        String targetNodeKey,
        String newLabel,
        List<String> newRepresentativeAreaKeys,
        int applyOrder,
        String reason,
        UUID createdBy) {

    static AdminNavigationOverrideResponse from(SandboxNavigationOverride o) {
        return new AdminNavigationOverrideResponse(
                o.getId(), o.getOverrideKind().name(), o.getSubjectAreaKey(), o.getSubjectNodeKey(),
                o.getTargetRegionKey(), o.getTargetNodeKey(), o.getNewLabel(), o.getNewRepresentativeAreaKeys(),
                o.getApplyOrder(), o.getReason(), o.getCreatedBy());
    }
}

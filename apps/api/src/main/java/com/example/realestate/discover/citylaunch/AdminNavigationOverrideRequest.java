package com.example.realestate.discover.citylaunch;

import java.util.List;

/**
 * POST body for {@code .../navigation/overrides} (#1955 Areas PR A, SLICE 2f+2g). Field shape
 * mirrors {@link com.example.realestate.discover.navigation.SandboxNavigationOverride}'s five
 * per-kind field-shape contracts (V122) — the service layer validates the shape server-side; no
 * field here is trusted blindly.
 */
public record AdminNavigationOverrideRequest(
        String kind,
        String subjectAreaKey,
        String subjectNodeKey,
        String targetRegionKey,
        String targetNodeKey,
        String newLabel,
        List<String> newRepresentativeAreaKeys,
        String reason) {
}

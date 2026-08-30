package com.example.realestate.discover.citylaunch;

/**
 * Request body for {@code PUT .../validation/checks/{checkKey}} (#1911 PR4).
 * {@code value} is required — a missing/null value is rejected as a 400 by the controller before
 * it ever reaches the service layer.
 */
public record ToggleCheckRequest(Boolean value) {
}

package com.example.realestate.discover.citylaunch;

/**
 * Request body for {@code POST /api/admin/city-launch/cities/{cityId}/revisions/{revisionId}/launch}
 * (#1911 PR5, AC2).
 *
 * <p>{@code confirmCityName} is a UI-only type-to-confirm guard — the Launch button in {@link
 * CityLaunchReadService} et al.'s admin readiness screen stays disabled until the admin types the
 * exact city name. The SERVER deliberately never reads, validates, or compares this field: the
 * server's write authority is the SQL CAS + checksum verification in {@link
 * CityLaunchPromotionService#launch}, never this string. A direct API call with a blank or wrong
 * {@code confirmCityName} is still fully guarded by that CAS + checksum path (AC2).
 */
public record LaunchRequest(String confirmCityName) {
}

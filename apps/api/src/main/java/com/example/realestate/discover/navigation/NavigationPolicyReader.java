package com.example.realestate.discover.navigation;

import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/**
 * Read-only access to a city's {@code city_region_policy} row, including the #1955 V121
 * recursive-cluster generator knobs, plus the direction-label pairs {@link
 * NavigationPolicyFingerprint} folds in — mirrors {@link
 * com.example.realestate.discover.citylaunch.CanonicalGeographyReader}'s JdbcOperations,
 * SELECT-only convention. SELECT-only: never writes, never calls any onboarding/apply path.
 */
@Component
public class NavigationPolicyReader {

    private final JdbcOperations jdbcOperations;

    public NavigationPolicyReader(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    @Transactional(readOnly = true)
    public Optional<CityRegionPolicyRow> findPolicy(int cityId) {
        List<CityRegionPolicyRow> rows = jdbcOperations.query(
                """
                SELECT region_model, central_radius_km, max_direct_children, min_areas_per_cluster,
                       max_safety_depth, one_child_prevention, compactness_threshold, separation_threshold,
                       partition_method, representative_selection, outlier_rule, centre_treatment
                FROM public.city_region_policy WHERE city_id = ?
                """,
                (rs, rowNum) -> new CityRegionPolicyRow(
                        rs.getString("region_model"),
                        rs.getDouble("central_radius_km"),
                        new GeneratorPolicy(
                                rs.getInt("max_direct_children"),
                                rs.getInt("min_areas_per_cluster"),
                                rs.getInt("max_safety_depth"),
                                rs.getBoolean("one_child_prevention"),
                                (BigDecimal) rs.getObject("compactness_threshold"),
                                (BigDecimal) rs.getObject("separation_threshold"),
                                rs.getString("partition_method"),
                                rs.getString("representative_selection"),
                                rs.getString("outlier_rule"),
                                rs.getString("centre_treatment"))),
                cityId);
        return rows.stream().findFirst();
    }

    @Transactional(readOnly = true)
    public List<String> findSortedDirectionLabelPairs(String citySlug) {
        return jdbcOperations.query(
                "SELECT direction_code, group_name FROM public.city_regional_direction_labels "
                        + "WHERE city_key = ? ORDER BY direction_code",
                (rs, rowNum) -> rs.getString("direction_code") + ":" + rs.getString("group_name"),
                citySlug);
    }

    public record CityRegionPolicyRow(String regionModel, double centralRadiusKm, GeneratorPolicy knobs) {
    }
}

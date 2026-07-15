package com.example.realestate.discover;

import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.health.HealthContributorNameFactory;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Verifies (rather than assumes, per #1907's spec) that Spring Boot's real bean-name-to-
 * contributor-id derivation resolves {@link CityRegionBackfillReadinessHealthIndicator}'s
 * default bean name to the {@code cityRegionBackfillReadiness} contributor id used by
 * {@code application.yml}'s {@code management.endpoint.health.group.cityRegionBackfill.include}.
 *
 * <p>{@link HealthContributorNameFactory} is the exact {@code Function<String, String>} Spring
 * Boot's {@code HealthContributorRegistry} applies to every {@code HealthIndicator}/
 * {@code HealthContributor} bean name at registration time — this test exercises that real
 * class directly rather than re-implementing its stripping/decapitalization rule.
 */
class CityRegionBackfillReadinessHealthContributorNameTest {

    @Test
    void defaultBeanName_resolvesTo_cityRegionBackfillReadiness_contributorId() {
        // Default Spring bean name for an unannotated @Component class: decapitalized simple
        // class name — exactly what CityRegionBackfillReadinessHealthIndicator gets since it
        // declares no explicit @Component("...") bean name.
        String defaultBeanName = "cityRegionBackfillReadinessHealthIndicator";

        String contributorId = HealthContributorNameFactory.INSTANCE.apply(defaultBeanName);

        assertThat(contributorId).isEqualTo("cityRegionBackfillReadiness");
    }
}

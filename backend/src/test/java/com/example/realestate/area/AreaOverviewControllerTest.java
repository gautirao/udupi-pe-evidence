package com.example.realestate.area;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.net.URI;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * WebMvcTest for AreaOverviewController (unauthenticated public endpoint).
 * No JWT is required — security config permits all GET /api/public/areas/ * /overview.
 */
@WebMvcTest(
        controllers = AreaOverviewController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({AreaOverviewControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class AreaOverviewControllerTest {

    /** Minimal security config: permit all (mirrors production permitAll on this path). */
    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                    .build();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AreaOverviewService areaOverviewService;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(areaOverviewService, userRoleService);
    }

    // ==================== Full-confidence response → 200 ====================

    @Test
    void getOverview_fullConfidence_returns200WithSnapshotAndActivity() throws Exception {
        AreaOverviewResponse.SnapshotData snapshot = new AreaOverviewResponse.SnapshotData(
                5000000L, 3000000L, 7000000L,
                Map.of("house", 0.6, "apartment", 0.4),
                "rising", 6.5
        );
        AreaOverviewResponse.ActivityData activity = new AreaOverviewResponse.ActivityData(42, 8);

        AreaOverviewResponse response = new AreaOverviewResponse(
                "IN|KA|Udupi|Manipal",
                "Manipal",
                "IN|KA|Udupi",
                "Udupi",
                "full",
                25,
                snapshot,
                null,         // no fallback for full confidence
                List.of(),
                List.of(),
                activity
        );

        when(areaOverviewService.assembleResponse("IN|KA|Udupi|Manipal")).thenReturn(response);

        // Pipe must be URL-encoded as %7C in the path
        mockMvc.perform(get(URI.create("/api/public/areas/IN%7CKA%7CUdupi%7CManipal/overview")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.areaKey").value("IN|KA|Udupi|Manipal"))
                .andExpect(jsonPath("$.areaLabel").value("Manipal"))
                .andExpect(jsonPath("$.confidence").value("full"))
                .andExpect(jsonPath("$.listingCount90d").value(25))
                .andExpect(jsonPath("$.snapshot").isNotEmpty())
                .andExpect(jsonPath("$.snapshot.medianPricePaise").value(5000000))
                .andExpect(jsonPath("$.snapshot.trendDirection").value("rising"))
                .andExpect(jsonPath("$.fallback").doesNotExist())
                .andExpect(jsonPath("$.activity").isNotEmpty())
                .andExpect(jsonPath("$.activity.activeCount").value(42))
                .andExpect(jsonPath("$.activity.new30d").value(8));
    }

    // ==================== Limited-confidence response → 200 ====================

    @Test
    void getOverview_limitedConfidence_returns200WithAmberConfidence() throws Exception {
        AreaOverviewResponse.SnapshotData snapshot = new AreaOverviewResponse.SnapshotData(
                4500000L, 2500000L, 6500000L, null, "stable", 1.2
        );
        AreaOverviewResponse.ActivityData activity = new AreaOverviewResponse.ActivityData(7, 2);

        AreaOverviewResponse response = new AreaOverviewResponse(
                "IN|KA|Udupi|Katapadi",
                "Katapadi",
                "IN|KA|Udupi",
                "Udupi",
                "limited",
                10,
                snapshot,
                null,
                List.of(),
                List.of(),
                activity
        );

        when(areaOverviewService.assembleResponse("IN|KA|Udupi|Katapadi")).thenReturn(response);

        mockMvc.perform(get(URI.create("/api/public/areas/IN%7CKA%7CUdupi%7CKatapadi/overview")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.confidence").value("limited"))
                .andExpect(jsonPath("$.snapshot").isNotEmpty())
                .andExpect(jsonPath("$.fallback").doesNotExist())
                .andExpect(jsonPath("$.activity.activeCount").value(7));
    }

    // ==================== Fallback-confidence response → 200 ====================

    @Test
    void getOverview_fallbackConfidence_returns200WithFallbackAndNoActivity() throws Exception {
        AreaOverviewResponse.FallbackData fallback = new AreaOverviewResponse.FallbackData(
                "district", "IN|KA|Udupi", "Udupi", 120
        );
        AreaOverviewResponse.SnapshotData districtSnapshot = new AreaOverviewResponse.SnapshotData(
                4800000L, 2800000L, 6800000L, null, "stable", 2.0
        );

        AreaOverviewResponse response = new AreaOverviewResponse(
                "IN|KA|Udupi|TinyVillage",
                "TinyVillage",
                "IN|KA|Udupi",
                "Udupi",
                "fallback",
                2,
                districtSnapshot,  // district snapshot shown instead
                fallback,
                List.of(),
                List.of(),
                null               // activity is null for fallback confidence
        );

        when(areaOverviewService.assembleResponse("IN|KA|Udupi|TinyVillage")).thenReturn(response);

        mockMvc.perform(get(URI.create("/api/public/areas/IN%7CKA%7CUdupi%7CTinyVillage/overview")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.confidence").value("fallback"))
                .andExpect(jsonPath("$.fallback").isNotEmpty())
                .andExpect(jsonPath("$.fallback.level").value("district"))
                .andExpect(jsonPath("$.fallback.districtKey").value("IN|KA|Udupi"))
                .andExpect(jsonPath("$.fallback.listingCount90d").value(120))
                .andExpect(jsonPath("$.activity").doesNotExist());
    }

    // ==================== Fallback where district row is also sparse → 200, no crash ====================

    @Test
    void getOverview_fallbackWithSparseDistrict_returns200WithNullSnapshot() throws Exception {
        // District row exists but has < 5 listings; snapshot is null but should NOT 404
        AreaOverviewResponse.FallbackData fallback = new AreaOverviewResponse.FallbackData(
                "district", "IN|KA|Udupi", "Udupi", 3
        );

        AreaOverviewResponse response = new AreaOverviewResponse(
                "IN|KA|Udupi|Remote",
                "Remote",
                "IN|KA|Udupi",
                "Udupi",
                "fallback",
                1,
                null,     // district row is also sparse — snapshot is null
                fallback,
                List.of(),
                List.of(),
                null
        );

        when(areaOverviewService.assembleResponse("IN|KA|Udupi|Remote")).thenReturn(response);

        mockMvc.perform(get(URI.create("/api/public/areas/IN%7CKA%7CUdupi%7CRemote/overview")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.confidence").value("fallback"))
                .andExpect(jsonPath("$.fallback.listingCount90d").value(3));
        // snapshot is null — no assertion that it exists; response is 200 not 404
    }

    // ==================== Unknown area key → 404 ====================

    @Test
    void getOverview_unknownAreaKey_returns404WithErrorBody() throws Exception {
        when(areaOverviewService.assembleResponse(anyString()))
                .thenThrow(new AreaNotFoundException("IN|KA|Nowhere|Unknown"));

        mockMvc.perform(get(URI.create("/api/public/areas/IN%7CKA%7CNowhere%7CUnknown/overview")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error").value("Area not found"));
    }

    // ==================== Non-empty comparison and schools → fields appear in JSON ====================

    @Test
    void getOverview_withComparisonAndSchools_returnsThoseFieldsInResponse() throws Exception {
        AreaOverviewResponse.SnapshotData snapshot = new AreaOverviewResponse.SnapshotData(
                5000000L, null, null, null, null, null
        );
        AreaOverviewResponse.ComparisonEntry compEntry = new AreaOverviewResponse.ComparisonEntry(
                "IN|KA|Udupi|Karkala", "Karkala", 4200000L, 18, "stable", false
        );
        AreaOverviewResponse.SchoolEntry schoolEntry = new AreaOverviewResponse.SchoolEntry(
                "school-001", "Manipal Public School", 1.2, "CBSE", "notable"
        );

        AreaOverviewResponse response = new AreaOverviewResponse(
                "IN|KA|Udupi|Manipal",
                "Manipal",
                "IN|KA|Udupi",
                "Udupi",
                "full",
                22,
                snapshot,
                null,
                List.of(compEntry),
                List.of(schoolEntry),
                new AreaOverviewResponse.ActivityData(10, 3)
        );

        when(areaOverviewService.assembleResponse("IN|KA|Udupi|Manipal")).thenReturn(response);

        mockMvc.perform(get(URI.create("/api/public/areas/IN%7CKA%7CUdupi%7CManipal/overview")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.comparison").isArray())
                .andExpect(jsonPath("$.comparison[0].areaKey").value("IN|KA|Udupi|Karkala"))
                .andExpect(jsonPath("$.comparison[0].areaLabel").value("Karkala"))
                .andExpect(jsonPath("$.comparison[0].medianPricePaise").value(4200000))
                .andExpect(jsonPath("$.comparison[0].isApproximate").value(false))
                .andExpect(jsonPath("$.schools").isArray())
                .andExpect(jsonPath("$.schools[0].id").value("school-001"))
                .andExpect(jsonPath("$.schools[0].name").value("Manipal Public School"))
                .andExpect(jsonPath("$.schools[0].distanceKm").value(1.2))
                .andExpect(jsonPath("$.schools[0].prominenceTier").value("notable"));
    }
}

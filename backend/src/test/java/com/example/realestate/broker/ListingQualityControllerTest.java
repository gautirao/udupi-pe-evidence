package com.example.realestate.broker;

import com.example.realestate.broker.dto.EngagementSummary;
import com.example.realestate.broker.dto.ListingQualityItem;
import com.example.realestate.broker.dto.ListingQualityResponse;
import com.example.realestate.broker.dto.QualityFinding;
import com.example.realestate.broker.dto.QualityFixAction;
import com.example.realestate.quality.ListingQualityService;
import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
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

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * @WebMvcTest for {@link ListingQualityController}.
 *
 * <p>Follows the ListingControllerTest pattern: jwt() post-processor, MockitoBean for
 * service and UserRoleService, TestConfig for the security filter.
 */
@WebMvcTest(
        controllers = ListingQualityController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({ListingQualityControllerTest.TestConfig.class, WebMvcConfig.class, CallerInfoResolver.class,
        com.example.realestate.exception.GlobalExceptionHandler.class})
class ListingQualityControllerTest {

    private static final UUID BROKER_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    private static final UUID LISTING_ID_A = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final UUID LISTING_ID_B = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    private static final Instant GENERATED_AT = Instant.parse("2026-06-20T10:00:00Z");
    private static final Instant COMPUTED_AT = Instant.parse("2026-06-19T08:00:00Z");

    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth.anyRequest().authenticated())
                    .build();
        }
    }

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private ListingQualityService listingQualityService;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(listingQualityService, userRoleService);
    }

    // -----------------------------------------------------------------------
    // 1. Scored listing — happy path
    // -----------------------------------------------------------------------

    @Test
    void getListingQuality_scoredRow_returns200WithFindings() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("broker"));

        ListingQualityItem scoredItem = new ListingQualityItem(
                LISTING_ID_A, "My Farm", "LIVE",
                "SCORED", 85, "BUYER_READY", COMPUTED_AT,
                List.of(new QualityFinding("TRUST", 100, true, "Tier A — highest verification level")),
                List.of(),
                EngagementSummary.UNAVAILABLE
        );
        ListingQualityResponse response = buildResponse(List.of(scoredItem), 1, 1, 85.0);

        when(listingQualityService.getQualityPage(BROKER_ID)).thenReturn(response);

        mockMvc.perform(get("/api/broker/listing-quality")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.backfill.status").value("COMPLETE"))
                .andExpect(jsonPath("$.backfill.scoredCount").value(1))
                .andExpect(jsonPath("$.backfill.totalCount").value(1))
                .andExpect(jsonPath("$.aggregates.averageQuality").value(85.0))
                .andExpect(jsonPath("$.aggregates.buyerReadyCount").value(1))
                .andExpect(jsonPath("$.aggregates.needImprovementCount").value(0))
                .andExpect(jsonPath("$.listings[0].listingId").value(LISTING_ID_A.toString()))
                .andExpect(jsonPath("$.listings[0].scoreStatus").value("SCORED"))
                .andExpect(jsonPath("$.listings[0].qualityScore").value(85))
                .andExpect(jsonPath("$.listings[0].band").value("BUYER_READY"))
                .andExpect(jsonPath("$.listings[0].findings[0].component").value("TRUST"))
                .andExpect(jsonPath("$.listings[0].findings[0].finding")
                        .value("Tier A — highest verification level"));
    }

    // -----------------------------------------------------------------------
    // 2. NOT_SCORED row — null qualityScore, UNSCORED band
    // -----------------------------------------------------------------------

    @Test
    void getListingQuality_nullScoreRow_returnsNotScored() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("broker"));

        ListingQualityItem unscoredItem = new ListingQualityItem(
                LISTING_ID_B, "Draft Listing", "DRAFT",
                "NOT_SCORED", null, "UNSCORED", null,
                List.of(), List.of(), EngagementSummary.UNAVAILABLE
        );
        ListingQualityResponse response = buildResponse(List.of(unscoredItem), 0, 1, null);

        when(listingQualityService.getQualityPage(BROKER_ID)).thenReturn(response);

        mockMvc.perform(get("/api/broker/listing-quality")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.listings[0].scoreStatus").value("NOT_SCORED"))
                .andExpect(jsonPath("$.listings[0].qualityScore").doesNotExist())
                .andExpect(jsonPath("$.listings[0].band").value("UNSCORED"))
                .andExpect(jsonPath("$.listings[0].findings").isEmpty())
                .andExpect(jsonPath("$.listings[0].fixPlan").isEmpty());
    }

    // -----------------------------------------------------------------------
    // 3. Backfill INCOMPLETE when some listings not scored
    // -----------------------------------------------------------------------

    @Test
    void getListingQuality_backfillIncomplete_whenSomeNotScored() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("broker"));

        ListingQualityItem scored = new ListingQualityItem(
                LISTING_ID_A, "Farm", "LIVE", "SCORED", 70, "NEEDS_IMPROVEMENT", COMPUTED_AT,
                List.of(), List.of(), EngagementSummary.UNAVAILABLE);
        ListingQualityItem unscored = new ListingQualityItem(
                LISTING_ID_B, "Draft", "DRAFT", "NOT_SCORED", null, "UNSCORED", null,
                List.of(), List.of(), EngagementSummary.UNAVAILABLE);
        ListingQualityResponse response = buildResponse(List.of(scored, unscored), 1, 2, 70.0);

        when(listingQualityService.getQualityPage(BROKER_ID)).thenReturn(response);

        mockMvc.perform(get("/api/broker/listing-quality")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.backfill.status").value("INCOMPLETE"))
                .andExpect(jsonPath("$.backfill.scoredCount").value(1))
                .andExpect(jsonPath("$.backfill.totalCount").value(2));
    }

    // -----------------------------------------------------------------------
    // 4. averageQuality is null (not 0) when all listings are unscored
    // -----------------------------------------------------------------------

    @Test
    void getListingQuality_allUnscored_averageQualityIsNull() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("broker"));

        ListingQualityItem unscored = new ListingQualityItem(
                LISTING_ID_A, "Draft", "DRAFT", "NOT_SCORED", null, "UNSCORED", null,
                List.of(), List.of(), EngagementSummary.UNAVAILABLE);
        ListingQualityResponse response = buildResponse(List.of(unscored), 0, 1, null);

        when(listingQualityService.getQualityPage(BROKER_ID)).thenReturn(response);

        mockMvc.perform(get("/api/broker/listing-quality")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.aggregates.averageQuality").doesNotExist())
                .andExpect(jsonPath("$.aggregates.filterCounts.notScored").value(1))
                .andExpect(jsonPath("$.backfill.status").value("INCOMPLETE"));
    }

    // -----------------------------------------------------------------------
    // 5. Engagement is always UNAVAILABLE
    // -----------------------------------------------------------------------

    @Test
    void getListingQuality_engagementIsAlwaysUnavailable() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("broker"));

        ListingQualityItem item = new ListingQualityItem(
                LISTING_ID_A, "Farm", "LIVE", "SCORED", 90, "BUYER_READY", COMPUTED_AT,
                List.of(), List.of(), EngagementSummary.UNAVAILABLE);
        ListingQualityResponse response = buildResponse(List.of(item), 1, 1, 90.0);

        when(listingQualityService.getQualityPage(BROKER_ID)).thenReturn(response);

        mockMvc.perform(get("/api/broker/listing-quality")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.listings[0].engagement.status").value("UNAVAILABLE"))
                .andExpect(jsonPath("$.listings[0].engagement.views").doesNotExist())
                .andExpect(jsonPath("$.listings[0].engagement.enquiries").doesNotExist())
                .andExpect(jsonPath("$.listings[0].engagement.enquiryRate").doesNotExist());
    }

    // -----------------------------------------------------------------------
    // 6. Role guard: "user" role → 403 (CallerInfoResolver passes user, controller rejects)
    // -----------------------------------------------------------------------

    @Test
    void getListingQuality_userRole_returns403() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("user"));

        mockMvc.perform(get("/api/broker/listing-quality")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("Requires broker, dealer, or admin role"));
    }

    // -----------------------------------------------------------------------
    // 7. No JWT → 403 (Spring Security TestConfig anyRequest().authenticated() returns
    //    AccessDeniedException for anonymous; matches ListingControllerTest line ~260 pattern)
    // -----------------------------------------------------------------------

    @Test
    void getListingQuality_noJwt_returnsForbidden() throws Exception {
        mockMvc.perform(get("/api/broker/listing-quality"))
                .andExpect(status().isForbidden());
    }

    // -----------------------------------------------------------------------
    // 8. dealer role is allowed (same as broker for this endpoint)
    // -----------------------------------------------------------------------

    @Test
    void getListingQuality_dealerRole_returns200() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("dealer"));
        when(listingQualityService.getQualityPage(BROKER_ID))
                .thenReturn(buildResponse(List.of(), 0, 0, null));

        mockMvc.perform(get("/api/broker/listing-quality")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isOk());
    }

    // -----------------------------------------------------------------------
    // 9. Fix plan content — component, impact, action, editDeepLink
    // -----------------------------------------------------------------------

    @Test
    void getListingQuality_fixPlan_fields() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("broker"));

        QualityFixAction fix = new QualityFixAction("TRUST", "HIGH",
                "Complete identity and authority verification to improve your trust tier",
                "/broker/listings/" + LISTING_ID_A + "/edit");
        ListingQualityItem item = new ListingQualityItem(
                LISTING_ID_A, "Farm", "LIVE", "SCORED", 20, "PRIORITY_FIX", COMPUTED_AT,
                List.of(new QualityFinding("TRUST", 0, true, "No verification signals")),
                List.of(fix),
                EngagementSummary.UNAVAILABLE);
        ListingQualityResponse response = buildResponse(List.of(item), 1, 1, 20.0);

        when(listingQualityService.getQualityPage(BROKER_ID)).thenReturn(response);

        mockMvc.perform(get("/api/broker/listing-quality")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.listings[0].fixPlan[0].component").value("TRUST"))
                .andExpect(jsonPath("$.listings[0].fixPlan[0].impact").value("HIGH"))
                .andExpect(jsonPath("$.listings[0].fixPlan[0].editDeepLink")
                        .value("/broker/listings/" + LISTING_ID_A + "/edit"));
    }

    // -----------------------------------------------------------------------
    // 10. aggregates.priorityFixesCount
    // -----------------------------------------------------------------------

    @Test
    void getListingQuality_priorityFixesCount_inAggregates() throws Exception {
        when(userRoleService.getUserRole(BROKER_ID)).thenReturn(Optional.of("broker"));

        ListingQualityItem priorityItem = new ListingQualityItem(
                LISTING_ID_A, "Farm", "LIVE", "SCORED", 30, "PRIORITY_FIX", COMPUTED_AT,
                List.of(), List.of(), EngagementSummary.UNAVAILABLE);
        // aggregates: priorityFixesCount=1
        ListingQualityResponse.BackfillStatus backfill =
                new ListingQualityResponse.BackfillStatus("COMPLETE", 1, 1);
        ListingQualityResponse.FilterCounts fc =
                new ListingQualityResponse.FilterCounts(1, 0, 0, 1, 0);
        ListingQualityResponse.Aggregates agg =
                new ListingQualityResponse.Aggregates(30.0, 0, 0, 1, fc);
        ListingQualityResponse response =
                new ListingQualityResponse(GENERATED_AT, backfill, agg, List.of(priorityItem));

        when(listingQualityService.getQualityPage(BROKER_ID)).thenReturn(response);

        mockMvc.perform(get("/api/broker/listing-quality")
                        .with(jwt().jwt(j -> j.subject(BROKER_ID.toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.aggregates.priorityFixesCount").value(1));
    }

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    private static ListingQualityResponse buildResponse(
            List<ListingQualityItem> items, int scoredCount, int total, Double avg) {

        String backfillStatus = scoredCount == total ? "COMPLETE" : "INCOMPLETE";
        int buyerReady = (int) items.stream().filter(i -> "BUYER_READY".equals(i.band())).count();
        int needsImprovement = (int) items.stream().filter(i -> "NEEDS_IMPROVEMENT".equals(i.band())).count();
        int priorityFix = (int) items.stream().filter(i -> "PRIORITY_FIX".equals(i.band())).count();
        int notScored = (int) items.stream().filter(i -> "UNSCORED".equals(i.band())).count();

        ListingQualityResponse.BackfillStatus backfill =
                new ListingQualityResponse.BackfillStatus(backfillStatus, scoredCount, total);
        ListingQualityResponse.FilterCounts fc =
                new ListingQualityResponse.FilterCounts(total, buyerReady, needsImprovement, priorityFix, notScored);
        ListingQualityResponse.Aggregates agg =
                new ListingQualityResponse.Aggregates(avg, buyerReady, needsImprovement, priorityFix, fc);

        return new ListingQualityResponse(GENERATED_AT, backfill, agg, items);
    }
}

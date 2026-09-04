package com.example.realestate.discover;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Filter-parsing parity between {@link RelaxationPreviewsController} and its sibling
 * {@link NearbyAreaCandidatesController} (#2018 slice 2, raised by exact-head review of
 * {@code 0e0fac01} as a non-blocking completion item).
 *
 * <p><b>The risk this closes.</b> Both endpoints promise counts that agree with what the shopper
 * will actually see, and both get that guarantee by handing a {@code Filters} value to the shared
 * {@link DiscoverListingPredicateBuilder}. But each controller does its OWN request-param parsing
 * on the way in — rupees-to-paise conversion, list binding, silent polygon/bbox normalization. A
 * shared predicate builder does nothing to protect against the two parsers drifting apart: if this
 * endpoint ever read {@code priceMax} in paise, or dropped a param the listings query honours, its
 * previews would be confidently, silently wrong while every other test still passed.
 *
 * <p>So this test drives BOTH controllers with a byte-identical query string and asserts the
 * {@code Filters} they construct are equal on every component they share. It deliberately does not
 * touch the database: the claim under test is about parsing, and a DB would only obscure it.
 *
 * <p>The three components that legitimately differ are asserted individually, not skipped —
 * {@code areaKeys} (this endpoint scopes by it, the sibling does not), and {@code excludePropertyTypes}
 * / {@code viewportScope} (neither endpoint accepts them, so both must be null).
 */
@WebMvcTest(
        controllers = {RelaxationPreviewsController.class, NearbyAreaCandidatesController.class},
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({RelaxationPreviewsFilterParityTest.TestConfig.class, GlobalExceptionHandler.class})
class RelaxationPreviewsFilterParityTest {

    @TestConfiguration
    static class TestConfig {
        @Bean
        public SecurityFilterChain testSecurityFilterChain(HttpSecurity http) throws Exception {
            return http
                    .csrf(AbstractHttpConfigurer::disable)
                    .authorizeHttpRequests(auth -> auth.anyRequest().permitAll())
                    .build();
        }
    }

    @Autowired private MockMvc mockMvc;
    @MockitoBean private RelaxationPreviewsService relaxationService;
    @MockitoBean private NearbyAreaCandidatesService nearbyService;
    @MockitoBean private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        when(relaxationService.findPreviews(anyString(), any(), any(), any()))
                .thenReturn(new RelaxationPreviewsResponse("bangalore", List.of(), 0L, List.of()));
        when(nearbyService.findCandidates(anyString(), any(), any(), any()))
                .thenReturn(new NearbyAreaCandidatesResponse("bangalore", List.of(), List.of()));
    }

    /** Every filter param both endpoints accept, with values chosen to be individually falsifiable. */
    private static MockHttpServletRequestBuilder withEveryFilter(String path) {
        return get(path)
                .param("city", "bangalore")
                .param("propertyTypes", "apartment", "villa")
                .param("priceMin", "1000000")
                .param("priceMax", "5000000")
                .param("dateFrom", "2026-01-01")
                .param("dateTo", "2026-06-30")
                .param("bedrooms", "2", "3")
                .param("sellerTypes", "owner", "broker")
                .param("backOnMarket", "true")
                .param("newToMarket", "true")
                .param("reraRegistered", "true")
                .param("readyToMove", "true")
                .param("polygon", "[[12.9,77.5],[12.95,77.55],[12.9,77.6]]")
                .param("schoolLat", "13.05")
                .param("schoolLon", "77.62")
                .param("schoolRadiusKm", "3.5")
                .param("q", "corner plot")
                .param("bbox", "12.9,77.5,13.1,77.7")
                .param("listingPurpose", "sale");
    }

    private DiscoverListingPredicateBuilder.Filters capture(boolean relaxation) throws Exception {
        String path = relaxation
                ? "/api/discover/areas/relaxation-previews"
                : "/api/discover/areas/nearby-candidates";
        mockMvc.perform(withEveryFilter(path)).andExpect(status().isOk());

        ArgumentCaptor<DiscoverListingPredicateBuilder.Filters> captor =
                ArgumentCaptor.forClass(DiscoverListingPredicateBuilder.Filters.class);
        if (relaxation) {
            org.mockito.Mockito.verify(relaxationService)
                    .findPreviews(anyString(), any(), any(), captor.capture());
        } else {
            org.mockito.Mockito.verify(nearbyService)
                    .findCandidates(anyString(), any(), any(), captor.capture());
        }
        return captor.getValue();
    }

    @Test
    @DisplayName("both discover suggestion endpoints parse an identical query string identically")
    void filterParsing_isIdenticalAcrossBothSuggestionEndpoints() throws Exception {
        DiscoverListingPredicateBuilder.Filters relaxation = capture(true);
        DiscoverListingPredicateBuilder.Filters nearby = capture(false);

        assertThat(relaxation.city()).isEqualTo(nearby.city());
        assertThat(relaxation.propertyTypes()).isEqualTo(nearby.propertyTypes());
        // The unit trap: PropertyFilters carries rupees, the predicate carries paise. If these two
        // ever disagree, every previewed count silently becomes wrong by a factor of 100.
        assertThat(relaxation.priceMinPaise()).isEqualTo(nearby.priceMinPaise());
        assertThat(relaxation.priceMaxPaise()).isEqualTo(nearby.priceMaxPaise());
        assertThat(relaxation.dateFrom()).isEqualTo(nearby.dateFrom());
        assertThat(relaxation.dateTo()).isEqualTo(nearby.dateTo());
        assertThat(relaxation.bedrooms()).isEqualTo(nearby.bedrooms());
        assertThat(relaxation.sellerTypes()).isEqualTo(nearby.sellerTypes());
        assertThat(relaxation.backOnMarket()).isEqualTo(nearby.backOnMarket());
        assertThat(relaxation.newToMarket()).isEqualTo(nearby.newToMarket());
        assertThat(relaxation.reraRegistered()).isEqualTo(nearby.reraRegistered());
        assertThat(relaxation.readyToMove()).isEqualTo(nearby.readyToMove());
        assertThat(relaxation.polygon()).isEqualTo(nearby.polygon());
        assertThat(relaxation.schoolLat()).isEqualTo(nearby.schoolLat());
        assertThat(relaxation.schoolLon()).isEqualTo(nearby.schoolLon());
        assertThat(relaxation.schoolRadiusKm()).isEqualTo(nearby.schoolRadiusKm());
        assertThat(relaxation.bbox()).isEqualTo(nearby.bbox());
        assertThat(relaxation.q()).isEqualTo(nearby.q());
        assertThat(relaxation.listingPurpose()).isEqualTo(nearby.listingPurpose());

        // The three that legitimately differ, asserted rather than ignored.
        assertThat(relaxation.areaKeys())
                .as("both leave areaKeys for the service to set from its own param")
                .isNull();
        assertThat(nearby.areaKeys()).isNull();
        assertThat(relaxation.excludePropertyTypes()).isNull();
        assertThat(nearby.excludePropertyTypes()).isNull();
        assertThat(relaxation.viewportScope()).isNull();
        assertThat(nearby.viewportScope()).isNull();
    }

    @Test
    @DisplayName("the parsed values are the RIGHT ones, not merely equal to each other")
    void filterParsing_producesTheExpectedValues() throws Exception {
        // Parity alone would still pass if BOTH controllers were wrong in the same way, so the
        // absolute values are pinned too.
        DiscoverListingPredicateBuilder.Filters f = capture(true);

        assertThat(f.city()).isEqualTo("bangalore");
        assertThat(f.propertyTypes()).containsExactly("apartment", "villa");
        assertThat(f.priceMinPaise()).isEqualTo(100_000_000L);
        assertThat(f.priceMaxPaise()).isEqualTo(500_000_000L);
        assertThat(f.bedrooms()).containsExactly(2, 3);
        assertThat(f.sellerTypes()).containsExactly("owner", "broker");
        assertThat(f.readyToMove()).isTrue();
        assertThat(f.polygon()).hasSize(3);
        assertThat(f.schoolRadiusKm()).isEqualTo(3.5);
        assertThat(f.q()).isEqualTo("corner plot");
        assertThat(f.listingPurpose()).isEqualTo("sale");
        assertThat(f.bbox()).isNotNull();
    }
}

package com.example.realestate.discover;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.UserRoleService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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

import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * {@code @WebMvcTest} for {@link NearbyAreaCandidatesController} (#2017) — param binding,
 * {@code limit} clamping, {@code selected} capping, and the "malformed filter never 400s"
 * contract. Business logic (SQL/ranking) is covered by {@code NearbyAreaCandidatesServiceIT};
 * this test only proves the HTTP layer parses/delegates correctly.
 */
@WebMvcTest(
        controllers = NearbyAreaCandidatesController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({NearbyAreaCandidatesControllerTest.TestConfig.class, GlobalExceptionHandler.class})
class NearbyAreaCandidatesControllerTest {

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

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @MockitoBean
    private NearbyAreaCandidatesService service;

    @MockitoBean
    private UserRoleService userRoleService;

    @BeforeEach
    void setUp() {
        reset(service, userRoleService);
        when(service.findCandidates(anyString(), any(), any(), any()))
                .thenReturn(new NearbyAreaCandidatesResponse("udupi", List.of(), List.of()));
    }

    @Test
    void getNearbyCandidates_returns200WithBody_forMinimalRequest() throws Exception {
        mockMvc.perform(get("/api/discover/areas/nearby-candidates").param("city", "udupi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.city").value("udupi"));

        verify(service).findCandidates(eq("udupi"), isNull(), isNull(), any());
    }

    @Test
    void getNearbyCandidates_passesSelectedAndLimit_throughUnclamped_whenInRange() throws Exception {
        mockMvc.perform(get("/api/discover/areas/nearby-candidates")
                        .param("city", "udupi")
                        .param("selected", "IN|KA|Udupi|Manipal", "IN|KA|Udupi|Malpe")
                        .param("limit", "8"))
                .andExpect(status().isOk());

        ArgumentCaptor<List<String>> selectedCaptor = ArgumentCaptor.forClass(List.class);
        ArgumentCaptor<Integer> limitCaptor = ArgumentCaptor.forClass(Integer.class);
        verify(service).findCandidates(eq("udupi"), selectedCaptor.capture(), limitCaptor.capture(), any());

        org.assertj.core.api.Assertions.assertThat(selectedCaptor.getValue())
                .containsExactly("IN|KA|Udupi|Manipal", "IN|KA|Udupi|Malpe");
        org.assertj.core.api.Assertions.assertThat(limitCaptor.getValue()).isEqualTo(8);
    }

    @Test
    void getNearbyCandidates_missingCity_returns400() throws Exception {
        mockMvc.perform(get("/api/discover/areas/nearby-candidates"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getNearbyCandidates_malformedPolygon_doesNot400_delegatesWithNullPolygonFilter() throws Exception {
        mockMvc.perform(get("/api/discover/areas/nearby-candidates")
                        .param("city", "udupi")
                        .param("polygon", "{not-valid-json"))
                .andExpect(status().isOk());

        ArgumentCaptor<DiscoverListingPredicateBuilder.Filters> filtersCaptor =
                ArgumentCaptor.forClass(DiscoverListingPredicateBuilder.Filters.class);
        verify(service).findCandidates(eq("udupi"), isNull(), isNull(), filtersCaptor.capture());

        org.assertj.core.api.Assertions.assertThat(filtersCaptor.getValue().polygon()).isNull();
    }

    @Test
    void getNearbyCandidates_malformedBbox_doesNot400_delegatesWithNullBboxFilter() throws Exception {
        mockMvc.perform(get("/api/discover/areas/nearby-candidates")
                        .param("city", "udupi")
                        .param("bbox", "not,a,valid,bbox,too,many,parts"))
                .andExpect(status().isOk());

        ArgumentCaptor<DiscoverListingPredicateBuilder.Filters> filtersCaptor =
                ArgumentCaptor.forClass(DiscoverListingPredicateBuilder.Filters.class);
        verify(service).findCandidates(eq("udupi"), isNull(), isNull(), filtersCaptor.capture());

        org.assertj.core.api.Assertions.assertThat(filtersCaptor.getValue().bbox()).isNull();
    }

    @Test
    void getNearbyCandidates_convertsPriceParamsToPaise() throws Exception {
        mockMvc.perform(get("/api/discover/areas/nearby-candidates")
                        .param("city", "udupi")
                        .param("priceMin", "500000")
                        .param("priceMax", "2000000"))
                .andExpect(status().isOk());

        ArgumentCaptor<DiscoverListingPredicateBuilder.Filters> filtersCaptor =
                ArgumentCaptor.forClass(DiscoverListingPredicateBuilder.Filters.class);
        verify(service).findCandidates(eq("udupi"), isNull(), isNull(), filtersCaptor.capture());

        org.assertj.core.api.Assertions.assertThat(filtersCaptor.getValue().priceMinPaise()).isEqualTo(50_000_000L);
        org.assertj.core.api.Assertions.assertThat(filtersCaptor.getValue().priceMaxPaise()).isEqualTo(200_000_000L);
    }
}

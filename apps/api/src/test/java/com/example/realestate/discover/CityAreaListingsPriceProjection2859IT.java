package com.example.realestate.discover;

import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.IngestionApiKeyFilter;
import com.example.realestate.security.JwtConfig;
import com.example.realestate.security.PrometheusApiKeyFilter;
import com.example.realestate.security.UserRoleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

import static org.hamcrest.Matchers.is;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * #2859 B6 (handoff 285906) backend slice: the anon-vs-authed price projection of
 * GET /api/discover/cities/{city}/listings, with BOTH viewers inside the SAME test method
 * (R_control_existing: every negative assertion has its opposite-auth or present-key positive control
 * in the same method; only the Authorization header — or, for the present-key arm, the row's
 * listing_purpose — varies between the arms).
 *
 * <p>What runs for real: the production {@link JwtConfig} filter chain, {@link CityAreaListingsController}
 * (its {@code isAuthenticated} mapping and Cache-Control split), {@link CityAreaListingsService}'s row
 * projection (price / rent / band / {@link TrustBadge}), and Jackson {@code @JsonInclude(NON_NULL)} on
 * {@link AreaListingCard} (so "absent" below means the JSON KEY is absent). What is injected:
 * {@link JdbcOperations} (one synthetic row, no database of any kind) and the {@link JwtDecoder}
 * (a stub: this proves filter wiring + the isAuthenticated mapping, NOT JWT signature validation, which
 * stays RETAIN on #2848). Untagged, so the default surefire run includes it.
 */
@WebMvcTest(
        controllers = CityAreaListingsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({JwtConfig.class, IngestionApiKeyFilter.class, PrometheusApiKeyFilter.class,
        GlobalExceptionHandler.class, CityAreaListingsService.class})
@TestPropertySource(properties = {
        "app.ingestion.api-key=test-ingestion-key-2859",
        "app.metrics.api-key=test-metrics-key-2859"
})
class CityAreaListingsPriceProjection2859IT {

    private static final String URL = "/api/discover/cities/udupi/listings";
    private static final String AREA_KEY = "IN|KA|Udupi|Malpe";
    private static final String TOKEN = "test-token-2859";
    private static final String CARD = "$.areas[0].listings[0]";

    private static final long SALE_PRICE_PAISE = 6_000_000_00L; // ₹60L -> "₹50L–1Cr"
    private static final long MONTHLY_RENT = 25_000L;            // ₹25,000/mo -> "₹20–35K"

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private JdbcOperations jdbc;

    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    // The synthetic row the next request will see (read at answer time, so one method can vary it).
    private String rowPurpose;
    private Long rowPricePaise;
    private Long rowMonthlyRent;

    @BeforeEach
    void setUp() throws Exception {
        reset(jdbc, jwtDecoder);
        when(jdbc.queryForObject(anyString(), eq(Integer.class), org.mockito.ArgumentMatchers.<Object>any()))
                .thenReturn(1);
        doAnswer(inv -> {
            RowCallbackHandler rch = inv.getArgument(1);
            rch.processRow(row());
            return null;
        }).when(jdbc).query(anyString(), any(RowCallbackHandler.class), any(Object[].class));
        Instant now = Instant.now();
        when(jwtDecoder.decode(TOKEN)).thenReturn(Jwt.withTokenValue(TOKEN)
                .header("alg", "none")
                .subject(UUID.randomUUID().toString())
                .issuedAt(now)
                .expiresAt(now.plusSeconds(3600))
                .build());
    }

    private ResultSet row() throws Exception {
        ResultSet rs = mock(ResultSet.class);
        when(rs.getString("area_key")).thenReturn(AREA_KEY);
        when(rs.getString("area_name")).thenReturn("Malpe");
        when(rs.getString("listing_id")).thenReturn("00000000-0000-4000-8000-000000002859");
        when(rs.getObject("price_paise")).thenReturn(rowPricePaise);
        if (rowPricePaise != null) {
            when(rs.getLong("price_paise")).thenReturn(rowPricePaise);
        }
        when(rs.getObject("monthly_rent")).thenReturn(rowMonthlyRent);
        if (rowMonthlyRent != null) {
            when(rs.getLong("monthly_rent")).thenReturn(rowMonthlyRent);
        }
        when(rs.getString("listing_purpose")).thenReturn(rowPurpose);
        when(rs.getString("property_type")).thenReturn("house");
        when(rs.getString("locality")).thenReturn("Malpe");
        when(rs.getString("title")).thenReturn("B6 house");
        when(rs.getTimestamp("created_at")).thenReturn(Timestamp.from(Instant.parse("2026-01-01T00:00:00Z")));
        // Raw internal letter grade; the wire must carry only the public word.
        when(rs.getString("trust_tier")).thenReturn("A");
        when(rs.getObject("latitude")).thenReturn(13.34091);
        when(rs.getDouble("latitude")).thenReturn(13.34091);
        when(rs.getObject("longitude")).thenReturn(74.74215);
        when(rs.getDouble("longitude")).thenReturn(74.74215);
        return rs;
    }

    @Test
    @DisplayName("#2859 B6 S2-1/S2-4/S2-6/S2-13/S2-14/S2-15 + 1567-4/1567-7c (L120, L95): one SALE row, no Authorization "
            + "-> anon projection (pricePaise KEY absent, priceBand present, public cache, decoder untouched); "
            + "Bearer (decoder stubbed) -> authed projection (exact pricePaise, priceBand KEY absent, no-store); "
            + "trustBadge 'verified' and no trustTier key for BOTH viewers, in the same test")
    void saleRow_anonVsBearer_sameTest() throws Exception {
        rowPurpose = "sale";
        rowPricePaise = SALE_PRICE_PAISE;
        rowMonthlyRent = null;

        // ---- anon: no Authorization header ----
        mockMvc.perform(get(URL).param("areaKeys", AREA_KEY))
                .andExpect(status().isOk())
                .andExpect(jsonPath(CARD + ".listingPurpose", is("sale")))
                .andExpect(jsonPath(CARD + ".pricePaise").doesNotExist())
                .andExpect(jsonPath(CARD + ".priceBand", is("₹50L–1Cr")))
                .andExpect(jsonPath(CARD + ".monthlyRentRupees").doesNotExist())
                .andExpect(jsonPath(CARD + ".trustBadge", is("verified")))
                .andExpect(jsonPath(CARD + ".trustTier").doesNotExist())
                .andExpect(header().string("Cache-Control", is("max-age=60, public")));
        verifyNoInteractions(jwtDecoder);

        // ---- authed: the same request with a Bearer token (decoder stubbed) ----
        mockMvc.perform(get(URL).param("areaKeys", AREA_KEY).header("Authorization", "Bearer " + TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath(CARD + ".listingPurpose", is("sale")))
                .andExpect(jsonPath(CARD + ".pricePaise", is((int) SALE_PRICE_PAISE)))
                .andExpect(jsonPath(CARD + ".priceBand").doesNotExist())
                .andExpect(jsonPath(CARD + ".monthlyRentBand").doesNotExist())
                .andExpect(jsonPath(CARD + ".trustBadge", is("verified")))
                .andExpect(jsonPath(CARD + ".trustTier").doesNotExist())
                .andExpect(header().string("Cache-Control", is("no-store")));
        verify(jwtDecoder).decode(TOKEN);
    }

    @Test
    @DisplayName("#2859 B6 S2-5/S2-10/S2-11/S2-12/S2-17 (L120): one RENT row that ALSO carries price_paise, no Authorization "
            + "-> monthlyRentBand present, monthlyRentRupees / pricePaise / priceBand KEYS absent; Bearer -> exact "
            + "monthlyRentRupees, both band KEYS absent, pricePaise absent; present-key control in the same test: the "
            + "SAME price_paise surfaces as pricePaise once the row is 'sale' for the Bearer caller")
    void rentRowWithPricePaise_anonVsBearer_sameTest() throws Exception {
        rowPurpose = "rent";
        rowPricePaise = SALE_PRICE_PAISE;
        rowMonthlyRent = MONTHLY_RENT;

        // ---- anon ----
        mockMvc.perform(get(URL).param("areaKeys", AREA_KEY))
                .andExpect(status().isOk())
                .andExpect(jsonPath(CARD + ".listingPurpose", is("rent")))
                .andExpect(jsonPath(CARD + ".monthlyRentBand", is("₹20–35K")))
                .andExpect(jsonPath(CARD + ".monthlyRentRupees").doesNotExist())
                .andExpect(jsonPath(CARD + ".pricePaise").doesNotExist())
                .andExpect(jsonPath(CARD + ".priceBand").doesNotExist())
                .andExpect(header().string("Cache-Control", is("max-age=60, public")));
        verifyNoInteractions(jwtDecoder);

        // ---- authed (opposite-auth control) ----
        mockMvc.perform(get(URL).param("areaKeys", AREA_KEY).header("Authorization", "Bearer " + TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath(CARD + ".listingPurpose", is("rent")))
                .andExpect(jsonPath(CARD + ".monthlyRentRupees", is((int) MONTHLY_RENT)))
                .andExpect(jsonPath(CARD + ".monthlyRentBand").doesNotExist())
                .andExpect(jsonPath(CARD + ".pricePaise").doesNotExist())
                .andExpect(jsonPath(CARD + ".priceBand").doesNotExist())
                .andExpect(header().string("Cache-Control", is("no-store")));

        // ---- present-key control: same price_paise column, row purpose 'sale', Bearer caller ----
        rowPurpose = "sale";
        clearInvocations(jwtDecoder);
        mockMvc.perform(get(URL).param("areaKeys", AREA_KEY).header("Authorization", "Bearer " + TOKEN))
                .andExpect(status().isOk())
                .andExpect(jsonPath(CARD + ".pricePaise", is((int) SALE_PRICE_PAISE)));
        verify(jwtDecoder).decode(TOKEN);
    }
}

package com.example.realestate.security;

import com.example.realestate.area.AreaOverviewService;
import com.example.realestate.area.TrendsController;
import com.example.realestate.area.TrendsOptionsResponse;
import com.example.realestate.exception.GlobalExceptionHandler;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests for {@link TrendsRateLimitFilter} (#1612) — the public trends GET/HEAD anti-abuse guard.
 *
 * <p>Mirrors {@link DiscoverRateLimitFilterTest}'s structure: loads the REAL {@link JwtConfig}
 * filter chain and a REAL trends controller ({@link TrendsController}, the simplest of the family
 * — {@code GET /api/trends/options?city=udupi}) so path-matching parity between the filter and
 * JwtConfig's permitAll matchers is exercised against actual routes.
 *
 * <p>Unlike {@code DiscoverRateLimitFilterTest}'s HEAD case (which 401s under budget because only
 * some discover paths are excluded from auth), the entire {@code /api/trends/**} GET family is
 * {@code permitAll()} in {@link JwtConfig} — so under-budget GETs here return real {@code 200}s,
 * not {@code 401}s.
 *
 * <p>Split into three top-level classes because {@code app.ratelimit.trends.*} is varied via
 * {@code @TestPropertySource} (fixed per class, each gets its own isolated, sliced Spring
 * context):
 * <ul>
 *   <li>{@link TrendsRateLimitFilterTest} — enabled, tiny limit=3, default IP keying.</li>
 *   <li>{@link TrendsRateLimitFilterKeyIsolationTest} — enabled, tiny limit=3, XFF keying.</li>
 *   <li>{@link TrendsRateLimitFilterDisabledTest} — kill-switch off.</li>
 * </ul>
 *
 * <p>Each test method draws from its own fake IP via {@link #fromIp(String)} so bucket state
 * never leaks between test methods sharing this class's cached {@code @WebMvcTest} context. The
 * module-wide {@code app.ratelimit.trends.enabled=false} shield in
 * {@code src/test/resources/application.properties} is overridden back to {@code enabled=true} by
 * this class's own {@code @TestPropertySource}.
 */
@WebMvcTest(
        controllers = TrendsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({JwtConfig.class, IngestionApiKeyFilter.class, PrometheusApiKeyFilter.class,
        TrendsRateLimitFilter.class, GlobalExceptionHandler.class, SimpleMeterRegistry.class})
@TestPropertySource(properties = {
        "app.ingestion.api-key=test-key-for-security-it",
        "app.metrics.api-key=test-metrics-key",
        "app.ratelimit.trends.enabled=true",
        "app.ratelimit.trends.requests-per-minute=3",
        "app.ratelimit.trends.trust-forwarded-header=false",
        "app.ratelimit.trends.max-entries=100000"
})
class TrendsRateLimitFilterTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MeterRegistry meterRegistry;

    @MockitoBean
    private AreaOverviewService areaOverviewService;

    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    private void stubOptionsOk() {
        when(areaOverviewService.getOptions(any(), anyInt())).thenReturn(
                new TrendsOptionsResponse("udupi", List.of()));
    }

    /** Fakes {@code getRemoteAddr()} so each test method draws from its own, fresh bucket. */
    private static RequestPostProcessor fromIp(String ip) {
        return request -> {
            request.setRemoteAddr(ip);
            return request;
        };
    }

    // ── AC1: Allow under limit ─────────────────────────────────────────────

    @Test
    void allowUnderLimit_allThreeRequestsSucceed() throws Exception {
        stubOptionsOk();

        for (int i = 0; i < 3; i++) {
            mockMvc.perform(get("/api/trends/options").param("city", "udupi").with(fromIp("10.1.1.1")))
                    .andExpect(status().isOk());
        }
    }

    // ── AC2: Throttle over limit ────────────────────────────────────────────

    @Test
    void overLimit_fourthRequestReturns429WithRetryAfterAndErrorShape() throws Exception {
        stubOptionsOk();

        for (int i = 0; i < 3; i++) {
            mockMvc.perform(get("/api/trends/options").param("city", "udupi").with(fromIp("10.1.1.2")))
                    .andExpect(status().isOk());
        }

        mockMvc.perform(get("/api/trends/options").param("city", "udupi").with(fromIp("10.1.1.2")))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "60"))
                .andExpect(jsonPath("$.error").exists());
    }

    // ── AC3: Throttled counter increments ───────────────────────────────────

    @Test
    void overLimit_incrementsThrottledCounter() throws Exception {
        stubOptionsOk();
        double before = meterRegistry.counter("trends.ratelimit.throttled").count();

        for (int i = 0; i < 3; i++) {
            mockMvc.perform(get("/api/trends/options").param("city", "udupi").with(fromIp("10.1.1.3")))
                    .andExpect(status().isOk());
        }
        mockMvc.perform(get("/api/trends/options").param("city", "udupi").with(fromIp("10.1.1.3")))
                .andExpect(status().isTooManyRequests());

        assertThat(meterRegistry.counter("trends.ratelimit.throttled").count()).isEqualTo(before + 1.0);
    }

    // ── AC4: HEAD consumes and is throttled by the same budget as GET ──────

    /**
     * {@link JwtConfig}'s {@code permitAll()} matcher for {@code /api/trends/**} is
     * {@code HttpMethod.GET}-specific (Spring Security does not implicitly fold {@code HEAD} into
     * a {@code GET} matcher the way Spring MVC's handler mapping does), so an anonymous
     * under-budget {@code HEAD} still gets {@code 401} from {@code JwtConfig}'s
     * {@code anyRequest().authenticated()} fallthrough — {@link TrendsRateLimitFilter} (which runs
     * before the authorization filter) still consumed a token for it, same reasoning as
     * {@code DiscoverRateLimitFilterTest}'s HEAD case. This test proves that consumption: 2 GETs +
     * 1 HEAD exhaust the 3-request budget, so a following HEAD is stopped by
     * {@link TrendsRateLimitFilter} itself — visible as {@code 429} + {@code Retry-After}, returned
     * before the request ever reaches {@link JwtConfig}'s authorization check — proving HEAD both
     * consumes and is subject to the same bucket as GET.
     */
    @Test
    void headRequest_consumesAndIsThrottledBySameBudgetAsGet() throws Exception {
        stubOptionsOk();

        mockMvc.perform(get("/api/trends/options").param("city", "udupi").with(fromIp("10.1.1.9")))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/trends/options").param("city", "udupi").with(fromIp("10.1.1.9")))
                .andExpect(status().isOk());
        // 3rd of 3: token still available, so the request passes TrendsRateLimitFilter and is
        // rejected further downstream by JwtConfig's GET-only permitAll matcher instead — 401, not
        // 429 — but the token is now spent.
        mockMvc.perform(head("/api/trends/options").param("city", "udupi").with(fromIp("10.1.1.9")))
                .andExpect(status().isUnauthorized());

        // 4th request: budget exhausted, so TrendsRateLimitFilter itself stops this HEAD with 429 +
        // Retry-After, proving HEAD both consumes and is subject to the same bucket as GET.
        mockMvc.perform(head("/api/trends/options").param("city", "udupi").with(fromIp("10.1.1.9")))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "60"));
    }

    // ── AC5: OPTIONS is never throttled ─────────────────────────────────────

    @Test
    void optionsPreflight_neverThrottled_evenWhenPublicBudgetExhausted() throws Exception {
        stubOptionsOk();

        for (int i = 0; i < 3; i++) {
            mockMvc.perform(get("/api/trends/options").param("city", "udupi").with(fromIp("10.1.1.5")))
                    .andExpect(status().isOk());
        }
        mockMvc.perform(get("/api/trends/options").param("city", "udupi").with(fromIp("10.1.1.5")))
                .andExpect(status().isTooManyRequests());

        mockMvc.perform(options("/api/trends/options").with(fromIp("10.1.1.5")))
                .andExpect(result -> assertThat(result.getResponse().getStatus()).isNotEqualTo(429))
                .andExpect(header().doesNotExist("Retry-After"));
    }

    // ── AC6: Only /api/trends/** paths are scoped by this filter ───────────

    /**
     * A non-{@code /api/trends/**} path is untouched by {@link TrendsRateLimitFilter}
     * ({@code shouldNotFilter} returns {@code true} for it), so exhausting the trends budget for an
     * IP has no effect on it. This made-up path has no controller in this {@code @WebMvcTest}
     * slice AND is not covered by {@link JwtConfig}'s {@code permitAll()} matchers, so
     * {@code JwtConfig}'s {@code anyRequest().authenticated()} fallthrough rejects it with
     * {@code 401} — consistently, before AND after the trends bucket for the same IP is exhausted.
     * The assertion that matters is that it is NEVER {@code 429}, proving this filter's scoping is
     * path-based and never runs against it.
     */
    @Test
    void nonTrendsPath_isNotThrottledByThisFilter() throws Exception {
        stubOptionsOk();

        mockMvc.perform(get("/api/other/path").with(fromIp("10.1.1.6")))
                .andExpect(status().isUnauthorized());

        for (int i = 0; i < 3; i++) {
            mockMvc.perform(get("/api/trends/options").param("city", "udupi").with(fromIp("10.1.1.6")))
                    .andExpect(status().isOk());
        }
        mockMvc.perform(get("/api/trends/options").param("city", "udupi").with(fromIp("10.1.1.6")))
                .andExpect(status().isTooManyRequests());

        // Trends budget for this IP is now exhausted, but the non-trends path is still just 401
        // (auth fallthrough), never a 429 — proving this filter's scoping is path-based.
        mockMvc.perform(get("/api/other/path").with(fromIp("10.1.1.6")))
                .andExpect(status().isUnauthorized());
    }

    // ── AC7: Client-key resolution: null/blank remoteAddr ───────────────────

    /**
     * {@link TrendsRateLimitFilter#resolveClientKey} must map a null or blank
     * {@code getRemoteAddr()} to the fixed {@code "unknown"} bucket key. Mixing null and blank
     * across requests onto the same shared "unknown" bucket proves both are normalized to the same
     * key.
     */
    @Test
    void nullOrBlankRemoteAddr_mapsToSharedUnknownBucket() throws Exception {
        stubOptionsOk();

        mockMvc.perform(get("/api/trends/options").param("city", "udupi").with(fromIp("")))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/trends/options").param("city", "udupi").with(fromIp(null)))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/trends/options").param("city", "udupi").with(fromIp("")))
                .andExpect(status().isOk());

        // 4th request against the shared "unknown" bucket (limit=3) is throttled — proving null
        // and blank collapsed onto the same key instead of each getting their own budget.
        mockMvc.perform(get("/api/trends/options").param("city", "udupi").with(fromIp(null)))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "60"));
    }
}

/**
 * Per-client-key isolation — {@code app.ratelimit.trends.trust-forwarded-header=true}, so bucket
 * keying uses the leftmost {@code X-Forwarded-For} entry instead of {@code getRemoteAddr()}.
 * Separate top-level class: a distinct {@code @TestPropertySource} value means a distinct,
 * isolated Spring context — no shared buckets with {@link TrendsRateLimitFilterTest}.
 */
@WebMvcTest(
        controllers = TrendsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({JwtConfig.class, IngestionApiKeyFilter.class, PrometheusApiKeyFilter.class,
        TrendsRateLimitFilter.class, GlobalExceptionHandler.class, SimpleMeterRegistry.class})
@TestPropertySource(properties = {
        "app.ingestion.api-key=test-key-for-security-it",
        "app.metrics.api-key=test-metrics-key",
        "app.ratelimit.trends.enabled=true",
        "app.ratelimit.trends.requests-per-minute=3",
        "app.ratelimit.trends.trust-forwarded-header=true",
        "app.ratelimit.trends.max-entries=100000"
})
class TrendsRateLimitFilterKeyIsolationTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AreaOverviewService areaOverviewService;

    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Test
    void twoDistinctXffKeys_eachTrackedAgainstItsOwnBudget() throws Exception {
        when(areaOverviewService.getOptions(any(), anyInt())).thenReturn(
                new TrendsOptionsResponse("udupi", List.of()));

        // Client A (1.1.1.1) exhausts its own budget of 3.
        for (int i = 0; i < 3; i++) {
            mockMvc.perform(get("/api/trends/options")
                            .param("city", "udupi")
                            .header("X-Forwarded-For", "1.1.1.1"))
                    .andExpect(status().isOk());
        }
        mockMvc.perform(get("/api/trends/options")
                        .param("city", "udupi")
                        .header("X-Forwarded-For", "1.1.1.1"))
                .andExpect(status().isTooManyRequests());

        // Client B (2.2.2.2) is unaffected — independent bucket, still has its own full budget.
        for (int i = 0; i < 3; i++) {
            mockMvc.perform(get("/api/trends/options")
                            .param("city", "udupi")
                            .header("X-Forwarded-For", "2.2.2.2"))
                    .andExpect(status().isOk());
        }
    }
}

/**
 * Kill switch — {@code app.ratelimit.trends.enabled=false} disables the filter entirely regardless
 * of the configured limit, proving {@code shouldNotFilter()} short-circuits on the disabled flag
 * before any bucket logic runs.
 */
@WebMvcTest(
        controllers = TrendsController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({JwtConfig.class, IngestionApiKeyFilter.class, PrometheusApiKeyFilter.class,
        TrendsRateLimitFilter.class, GlobalExceptionHandler.class, SimpleMeterRegistry.class})
@TestPropertySource(properties = {
        "app.ingestion.api-key=test-key-for-security-it",
        "app.metrics.api-key=test-metrics-key",
        "app.ratelimit.trends.enabled=false",
        "app.ratelimit.trends.requests-per-minute=3",
        "app.ratelimit.trends.trust-forwarded-header=false",
        "app.ratelimit.trends.max-entries=100000"
})
class TrendsRateLimitFilterDisabledTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private AreaOverviewService areaOverviewService;

    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Test
    void disabledFlag_neverThrottles_evenWellPastTheConfiguredLimit() throws Exception {
        when(areaOverviewService.getOptions(any(), anyInt())).thenReturn(
                new TrendsOptionsResponse("udupi", List.of()));

        // 5 requests against a would-be limit of 3 — all succeed because the filter is disabled.
        for (int i = 0; i < 5; i++) {
            mockMvc.perform(get("/api/trends/options").param("city", "udupi"))
                    .andExpect(status().isOk());
        }
    }
}

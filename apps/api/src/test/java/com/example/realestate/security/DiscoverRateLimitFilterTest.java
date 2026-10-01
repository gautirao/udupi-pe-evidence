package com.example.realestate.security;

import com.example.realestate.discover.DiscoverListingsController;
import com.example.realestate.discover.DiscoverListingsPort;
import com.example.realestate.discover.DiscoverMarkersController;
import com.example.realestate.discover.DiscoverMarkersPort;
import com.example.realestate.discover.DiscoverSummaryController;
import com.example.realestate.discover.DiscoverSummaryPort;
import com.example.realestate.discover.DiscoverSummaryResponse;
import com.example.realestate.discover.event.DiscoverEventController;
import com.example.realestate.discover.event.DiscoverEventService;
import com.example.realestate.exception.GlobalExceptionHandler;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Tests for {@link DiscoverRateLimitFilter} (#1671) — the public discover GET/HEAD anti-abuse guard.
 *
 * <p>Loads the REAL {@link JwtConfig} filter chain and REAL discover controllers (mirroring
 * {@link DiscoverSummarySecurityIT}), so path-matching parity between the filter's exclusion list
 * and JwtConfig's permitAll matchers is exercised against the actual routes, not stand-ins.
 *
 * <p>Split into three top-level classes in this file because {@code app.ratelimit.discover.*} is
 * varied via {@code @TestPropertySource}, which is fixed per class (each gets its own, separately
 * cached, sliced Spring context — no shared state between them or with any other test class):
 * <ul>
 *   <li>{@link DiscoverRateLimitFilterTest} — enabled, tiny limit=3, default IP keying.</li>
 *   <li>{@link DiscoverRateLimitFilterKeyIsolationTest} — enabled, tiny limit=3, XFF keying.</li>
 *   <li>{@link DiscoverRateLimitFilterDisabledTest} — kill-switch off.</li>
 * </ul>
 *
 * <p>{@link DiscoverRateLimitFilterTest}'s {@code @WebMvcTest} context (and therefore the single
 * {@link DiscoverRateLimitFilter} bean and its bucket map) is shared and cached across every test
 * method in the class. Each method that needs a fresh budget sets its own fake
 * {@code getRemoteAddr()} via {@link #fromIp(String)} so bucket state never leaks between test
 * methods — the same isolation concern this filter's design must solve for real shared
 * {@code @SpringBootTest} suites. The module-wide default for that concern is the
 * {@code app.ratelimit.discover.enabled=false} shield in {@code src/test/resources/application.properties}
 * (deliberately a {@code .properties} file, not {@code .yml} — a same-named {@code .yml} shield
 * would shadow {@code src/main/resources/application.yml} on the test classpath instead of merging
 * with it); this class's own {@code @TestPropertySource} above overrides that default back to
 * {@code enabled=true} so the throttle behavior below is actually exercised.
 */
@WebMvcTest(
        controllers = {
                DiscoverSummaryController.class,
                DiscoverEventController.class
        },
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({JwtConfig.class, IngestionApiKeyFilter.class, PrometheusApiKeyFilter.class,
        DiscoverRateLimitFilter.class, GlobalExceptionHandler.class, SimpleMeterRegistry.class})
@TestPropertySource(properties = {
        "app.ingestion.api-key=test-key-for-security-it",
        "app.metrics.api-key=test-metrics-key",
        "app.ratelimit.discover.enabled=true",
        "app.ratelimit.discover.requests-per-minute=3",
        "app.ratelimit.discover.trust-forwarded-header=false",
        "app.ratelimit.discover.max-entries=100000"
})
class DiscoverRateLimitFilterTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private MeterRegistry meterRegistry;

    @MockitoBean
    private DiscoverSummaryPort discoverSummaryPort;

    @MockitoBean
    private DiscoverEventService discoverEventService;

    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    private void stubSummaryOk() {
        when(discoverSummaryPort.getSummary(any())).thenReturn(
                new DiscoverSummaryResponse("udupi", null, "area_group", 0L, List.of(), List.of(), Instant.now()));
    }

    /** Fakes {@code getRemoteAddr()} so each test method draws from its own, fresh bucket. */
    private static RequestPostProcessor fromIp(String ip) {
        return request -> {
            request.setRemoteAddr(ip);
            return request;
        };
    }

    // ── Allow under limit ─────────────────────────────────────────────────

    @Test
    void allowUnderLimit_allThreeRequestsSucceed() throws Exception {
        stubSummaryOk();

        for (int i = 0; i < 3; i++) {
            mockMvc.perform(get("/api/discover/summary").param("city", "udupi").with(fromIp("10.0.1.1")))
                    .andExpect(status().isOk());
        }
    }

    // ── Throttle over limit ───────────────────────────────────────────────

    @Test
    void overLimit_fourthRequestReturns429WithRetryAfterAndErrorShape() throws Exception {
        stubSummaryOk();

        for (int i = 0; i < 3; i++) {
            mockMvc.perform(get("/api/discover/summary").param("city", "udupi").with(fromIp("10.0.1.2")))
                    .andExpect(status().isOk());
        }

        mockMvc.perform(get("/api/discover/summary").param("city", "udupi").with(fromIp("10.0.1.2")))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "60"))
                .andExpect(jsonPath("$.error").exists());
    }

    @Test
    void overLimit_incrementsThrottledCounter() throws Exception {
        stubSummaryOk();
        double before = meterRegistry.counter("discover.ratelimit.throttled").count();

        for (int i = 0; i < 3; i++) {
            mockMvc.perform(get("/api/discover/summary").param("city", "udupi").with(fromIp("10.0.1.3")))
                    .andExpect(status().isOk());
        }
        mockMvc.perform(get("/api/discover/summary").param("city", "udupi").with(fromIp("10.0.1.3")))
                .andExpect(status().isTooManyRequests());

        assertThat(meterRegistry.counter("discover.ratelimit.throttled").count()).isEqualTo(before + 1.0);
    }

    // ── Authenticated discover GETs are never throttled, even with budget exhausted ──

    @Test
    void authenticatedEndpoints_neverThrottled_evenWhenPublicBudgetExhausted() throws Exception {
        stubSummaryOk();

        // Exhaust this test's dedicated public budget.
        for (int i = 0; i < 3; i++) {
            mockMvc.perform(get("/api/discover/summary").param("city", "udupi").with(fromIp("10.0.1.4")))
                    .andExpect(status().isOk());
        }
        mockMvc.perform(get("/api/discover/summary").param("city", "udupi").with(fromIp("10.0.1.4")))
                .andExpect(status().isTooManyRequests());

        // Authenticated discover GETs — real JwtConfig returns 401 (no Authorization header),
        // never 429, proving DiscoverRateLimitFilter.shouldNotFilter() excluded them. Same fake
        // IP as the exhausted bucket above, to prove the bypass is path-based, not key-based.
        mockMvc.perform(get("/api/discover/markers").param("city", "udupi").with(fromIp("10.0.1.4")))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/discover/listings").param("city", "udupi").with(fromIp("10.0.1.4")))
                .andExpect(status().isUnauthorized());
        // #2454: the authenticated POLYGON relaxation-previews sibling is paired the same way.
        // (Its controller is not in this slice; 401 from the real JwtConfig chain — not 429 —
        // is still the observable proof that the filter excluded the path before dispatch.)
        mockMvc.perform(get("/api/discover/listings/relaxation-previews").param("city", "udupi")
                        .with(fromIp("10.0.1.4")))
                .andExpect(status().isUnauthorized());
    }

    // ── Method scoping: HEAD shares the GET budget; OPTIONS and POST /api/discover/events bypass ──

    /**
     * Regression guard: Spring MVC's {@code FrameworkServlet#doHead} dispatches {@code HEAD} to
     * the same {@code @GetMapping} handler as {@code GET}, running the full request and only
     * suppressing the response body. If {@code shouldNotFilter} treated {@code HEAD} as
     * unthrottled, a {@code curl -I} loop would execute the identical DB path with zero rate
     * limiting — a complete bypass.
     *
     * <p>Note: {@link JwtConfig}'s {@code permitAll()} matchers for the public discover paths are
     * {@code HttpMethod.GET}-specific (Spring Security does not implicitly fold {@code HEAD} into
     * a {@code GET} matcher the way Spring MVC's handler mapping does), so an anonymous
     * under-budget {@code HEAD} still gets {@code 401} from {@link JwtConfig}'s
     * {@code anyRequest().authenticated()} fallthrough — DiscoverRateLimitFilter (which runs
     * before the authorization filter, via {@code addFilterBefore(..., BearerTokenAuthenticationFilter.class)})
     * still consumed a token for it. This test proves that consumption: 2 GETs + 1 HEAD exhaust the
     * 3-request budget, so a following HEAD is stopped by DiscoverRateLimitFilter itself — visible
     * as {@code 429} + {@code Retry-After}, returned before the request ever reaches JwtConfig's
     * authorization check — proving HEAD both consumes and is subject to the same bucket as GET.
     */
    @Test
    void headRequest_consumesAndIsThrottledBySameBudgetAsGet() throws Exception {
        stubSummaryOk();

        mockMvc.perform(get("/api/discover/summary").param("city", "udupi").with(fromIp("10.0.1.9")))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/discover/summary").param("city", "udupi").with(fromIp("10.0.1.9")))
                .andExpect(status().isOk());
        // 3rd of 3: token still available, so the request passes DiscoverRateLimitFilter and is
        // rejected further downstream by JwtConfig's GET-only permitAll matcher instead — 401, not
        // 429 — but the token is now spent.
        mockMvc.perform(head("/api/discover/summary").param("city", "udupi").with(fromIp("10.0.1.9")))
                .andExpect(status().isUnauthorized());

        // 4th request: budget exhausted, so DiscoverRateLimitFilter itself stops this HEAD with
        // 429 + Retry-After, before JwtConfig's authorization filter ever runs — proving the guard,
        // not authentication, is the source of this rejection.
        mockMvc.perform(head("/api/discover/summary").param("city", "udupi").with(fromIp("10.0.1.9")))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "60"));
    }

    @Test
    void optionsPreflight_neverThrottled_evenWhenPublicBudgetExhausted() throws Exception {
        stubSummaryOk();

        for (int i = 0; i < 3; i++) {
            mockMvc.perform(get("/api/discover/summary").param("city", "udupi").with(fromIp("10.0.1.5")))
                    .andExpect(status().isOk());
        }
        mockMvc.perform(get("/api/discover/summary").param("city", "udupi").with(fromIp("10.0.1.5")))
                .andExpect(status().isTooManyRequests());

        mockMvc.perform(options("/api/discover/summary").with(fromIp("10.0.1.5")))
                .andExpect(status().isOk())
                .andExpect(header().doesNotExist("Retry-After"));
    }

    @Test
    void postDiscoverEvents_neverThrottled_evenWhenPublicBudgetExhausted() throws Exception {
        stubSummaryOk();
        when(discoverEventService.ingestBatch(any())).thenReturn(0);

        for (int i = 0; i < 3; i++) {
            mockMvc.perform(get("/api/discover/summary").param("city", "udupi").with(fromIp("10.0.1.6")))
                    .andExpect(status().isOk());
        }
        mockMvc.perform(get("/api/discover/summary").param("city", "udupi").with(fromIp("10.0.1.6")))
                .andExpect(status().isTooManyRequests());

        mockMvc.perform(post("/api/discover/events")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"events\":[]}")
                        .with(fromIp("10.0.1.6")))
                .andExpect(status().isAccepted())
                .andExpect(header().doesNotExist("Retry-After"));
    }

    // ── Public path works without any JWT ─────────────────────────────────

    @Test
    void publicDiscoverPath_worksWithoutAnyAuthorizationHeader() throws Exception {
        stubSummaryOk();

        mockMvc.perform(get("/api/discover/summary").param("city", "udupi").with(fromIp("10.0.1.7")))
                .andExpect(status().isOk());
    }

    // ── Path-matching regression guard: substring vs exact match ──────────

    /**
     * Guards against a naive {@code path.contains("listings")}-style regression in
     * {@link DiscoverRateLimitFilter#shouldNotFilter}. {@code /api/discover/areas/udupi/listings}
     * contains the word "listings" but is NOT the exact excluded
     * {@code /api/discover/listings} path, so it must still be throttled under the public budget.
     * No controller is registered for this made-up subpath in this {@code @WebMvcTest} slice, so
     * under-budget requests 404 (no handler) — the filter runs before dispatch regardless, and the
     * assertion that matters is the status flip from 404 to 429 once the bucket is exhausted,
     * proving the filter's own bucket accounting (not the missing handler) drives the 429. The
     * exact excluded path is then proven to stay bypassed even with that same IP's public bucket
     * now exhausted.
     */
    @Test
    void publicSubpathContainingListings_isThrottled_whileExactListingsPathStaysExcluded() throws Exception {
        for (int i = 0; i < 3; i++) {
            mockMvc.perform(get("/api/discover/areas/udupi/listings").with(fromIp("10.0.1.8")))
                    .andExpect(status().isNotFound());
        }
        mockMvc.perform(get("/api/discover/areas/udupi/listings").with(fromIp("10.0.1.8")))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "60"));

        // Exact excluded path bypasses the filter entirely — real JwtConfig returns 401, never
        // 429, even though the public bucket for this same IP is now exhausted.
        mockMvc.perform(get("/api/discover/listings").param("city", "udupi").with(fromIp("10.0.1.8")))
                .andExpect(status().isUnauthorized());
    }

    // ── Client-key resolution: null/blank remoteAddr ───────────────────────

    /**
     * {@link DiscoverRateLimitFilter#resolveClientKey} must map a null or blank
     * {@code getRemoteAddr()} to the fixed {@code "unknown"} bucket key rather than throwing an
     * NPE or using null/blank as a {@link java.util.concurrent.ConcurrentHashMap} key (which
     * itself would NPE). Mixing null and blank across requests onto the same shared "unknown"
     * bucket proves both are normalized to the same key.
     */
    @Test
    void nullOrBlankRemoteAddr_mapsToSharedUnknownBucket_withNoNpe() throws Exception {
        stubSummaryOk();

        mockMvc.perform(get("/api/discover/summary").param("city", "udupi").with(fromIp("")))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/discover/summary").param("city", "udupi").with(fromIp(null)))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/discover/summary").param("city", "udupi").with(fromIp("")))
                .andExpect(status().isOk());

        // 4th request against the shared "unknown" bucket (limit=3) is throttled — proving null
        // and blank collapsed onto the same key instead of each getting their own budget.
        mockMvc.perform(get("/api/discover/summary").param("city", "udupi").with(fromIp(null)))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().string("Retry-After", "60"));
    }
}

/**
 * Per-client-key isolation — {@code app.ratelimit.discover.trust-forwarded-header=true}, so
 * bucket keying uses the leftmost {@code X-Forwarded-For} entry instead of {@code getRemoteAddr()}.
 * Separate top-level class: a distinct {@code @TestPropertySource} value means a distinct, isolated
 * Spring context — no shared buckets with {@link DiscoverRateLimitFilterTest}.
 */
@WebMvcTest(
        controllers = DiscoverSummaryController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({JwtConfig.class, IngestionApiKeyFilter.class, PrometheusApiKeyFilter.class,
        DiscoverRateLimitFilter.class, GlobalExceptionHandler.class, SimpleMeterRegistry.class})
@TestPropertySource(properties = {
        "app.ingestion.api-key=test-key-for-security-it",
        "app.metrics.api-key=test-metrics-key",
        "app.ratelimit.discover.enabled=true",
        "app.ratelimit.discover.requests-per-minute=3",
        "app.ratelimit.discover.trust-forwarded-header=true",
        "app.ratelimit.discover.max-entries=100000"
})
class DiscoverRateLimitFilterKeyIsolationTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private DiscoverSummaryPort discoverSummaryPort;

    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Test
    void twoDistinctXffKeys_eachTrackedAgainstItsOwnBudget() throws Exception {
        when(discoverSummaryPort.getSummary(any())).thenReturn(
                new DiscoverSummaryResponse("udupi", null, "area_group", 0L, List.of(), List.of(), Instant.now()));

        // Client A (1.1.1.1) exhausts its own budget of 3.
        for (int i = 0; i < 3; i++) {
            mockMvc.perform(get("/api/discover/summary")
                            .param("city", "udupi")
                            .header("X-Forwarded-For", "1.1.1.1"))
                    .andExpect(status().isOk());
        }
        mockMvc.perform(get("/api/discover/summary")
                        .param("city", "udupi")
                        .header("X-Forwarded-For", "1.1.1.1"))
                .andExpect(status().isTooManyRequests());

        // Client B (2.2.2.2) is unaffected — independent bucket, still has its own full budget.
        for (int i = 0; i < 3; i++) {
            mockMvc.perform(get("/api/discover/summary")
                            .param("city", "udupi")
                            .header("X-Forwarded-For", "2.2.2.2"))
                    .andExpect(status().isOk());
        }
    }
}

/**
 * Kill switch — {@code app.ratelimit.discover.enabled=false} disables the filter entirely
 * regardless of the configured limit, proving {@code shouldNotFilter()} short-circuits on the
 * disabled flag before any bucket logic runs.
 */
@WebMvcTest(
        controllers = DiscoverSummaryController.class,
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({JwtConfig.class, IngestionApiKeyFilter.class, PrometheusApiKeyFilter.class,
        DiscoverRateLimitFilter.class, GlobalExceptionHandler.class, SimpleMeterRegistry.class})
@TestPropertySource(properties = {
        "app.ingestion.api-key=test-key-for-security-it",
        "app.metrics.api-key=test-metrics-key",
        "app.ratelimit.discover.enabled=false",
        "app.ratelimit.discover.requests-per-minute=3",
        "app.ratelimit.discover.trust-forwarded-header=false",
        "app.ratelimit.discover.max-entries=100000"
})
class DiscoverRateLimitFilterDisabledTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private DiscoverSummaryPort discoverSummaryPort;

    @MockitoBean
    private UserRoleService userRoleService;

    @MockitoBean
    private JwtDecoder jwtDecoder;

    @Test
    void disabledFlag_neverThrottles_evenWellPastTheConfiguredLimit() throws Exception {
        when(discoverSummaryPort.getSummary(any())).thenReturn(
                new DiscoverSummaryResponse("udupi", null, "area_group", 0L, List.of(), List.of(), Instant.now()));

        // 5 requests against a would-be limit of 3 — all succeed because the filter is disabled.
        for (int i = 0; i < 5; i++) {
            mockMvc.perform(get("/api/discover/summary").param("city", "udupi"))
                    .andExpect(status().isOk());
        }
    }
}

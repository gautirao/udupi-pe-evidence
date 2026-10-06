package com.example.realestate.propertyrequest;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.ThrowableProxyUtil;
import ch.qos.logback.core.read.ListAppender;
import com.example.realestate.exception.GlobalExceptionHandler;
import com.example.realestate.security.CallerInfoResolver;
import com.example.realestate.security.IngestionApiKeyFilter;
import com.example.realestate.security.JwtConfig;
import com.example.realestate.security.PrometheusApiKeyFilter;
import com.example.realestate.security.UserRoleService;
import com.example.realestate.security.WebMvcConfig;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Pageable;
import org.springframework.http.MediaType;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.jwt.BadJwtException;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtValidationException;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Slice tests for the #1793 property-request endpoints, run through the REAL {@link JwtConfig}
 * security chain (incl. its BearerTokenResolver) and the REAL service/limiter/hasher. Only the
 * repository and the JWT decoder are mocked.
 */
@WebMvcTest(
        controllers = {PublicPropertyRequestController.class, AdminPropertyRequestController.class},
        excludeAutoConfiguration = {
                org.springframework.boot.autoconfigure.security.oauth2.resource.servlet.OAuth2ResourceServerAutoConfiguration.class
        }
)
@Import({
        JwtConfig.class,
        IngestionApiKeyFilter.class,
        PrometheusApiKeyFilter.class,
        GlobalExceptionHandler.class,
        WebMvcConfig.class,
        CallerInfoResolver.class,
        PropertyRequestService.class,
        PropertyRequestRateLimiter.class,
        PhoneHasher.class,
        PhoneKeyResolver.class
})
@TestPropertySource(properties = {
        "app.property-requests.enabled=true",
        "app.ingestion.api-key=test-ingestion-key",
        "app.metrics.api-key=test-metrics-key",
        "cors.allowed-origins=http://localhost:5174",
        "app.ratelimit.property-request.client-per-hour=3",
        "app.ratelimit.property-request.phone-per-hour=2",
        "app.ratelimit.property-request.trust-forwarded-header=true"
})
class PropertyRequestControllerTest {

    private static final String URL = "/api/public/property-requests";
    private static final String ADMIN_URL = "/api/admin/property-requests";
    private static final String PHONE = "+919876541234";
    private static final String PHONE_DIGITS_SUBSTRING = "9876541234";

    @Autowired private MockMvc mockMvc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private PropertyRequestRateLimiter rateLimiter;

    @MockitoBean private PropertyRequestRepository repository;
    @MockitoBean private UserRoleService userRoleService;
    @MockitoBean private JwtDecoder jwtDecoder;
    // The controller depends on the guard (L2); its fail-closed behaviour is covered by
    // PropertyRequestEncryptionKeyGuardTest / PropertyRequestGuardLazyInitTest, not here.
    @MockitoBean private PropertyRequestEncryptionKeyGuard keyGuard;

    private ListAppender<ILoggingEvent> logAppender;
    private Logger rootLogger;

    @BeforeEach
    void setUp() {
        reset(repository, jwtDecoder);
        rateLimiter.reset();
        when(repository.saveAndFlush(any(PropertyRequest.class))).thenAnswer(inv -> {
            PropertyRequest e = inv.getArgument(0);
            ReflectionTestUtils.setField(e, "id", UUID.randomUUID());
            // simulate the DB-generated column that saveAndFlush reads back
            ReflectionTestUtils.setField(e, "createdAt", OffsetDateTime.now());
            return e;
        });
        rootLogger = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        logAppender = new ListAppender<>();
        logAppender.start();
        rootLogger.addAppender(logAppender);
        rootLogger.setLevel(Level.DEBUG);
    }

    @AfterEach
    void tearDown() {
        rootLogger.detachAppender(logAppender);
    }

    // ── helpers ────────────────────────────────────────────────────────────────

    private Map<String, Object> validBody() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("city", "Udupi");
        m.put("areaKey", "karnataka/udupi/manipal");
        m.put("areaLabel", "Manipal");
        m.put("journey", "AREA");
        m.put("intent", "BUY");
        m.put("requirement", "2BHK near the school");
        m.put("budgetMin", 2000000);
        m.put("budgetMax", 5000000);
        m.put("phone", PHONE);
        m.put("contactVia", "WHATSAPP");
        m.put("consent", true);
        m.put("consentVersion", "v1");
        return m;
    }

    private MockHttpServletRequestBuilder postJson(Object body) throws Exception {
        return post(URL).contentType(MediaType.APPLICATION_JSON).content(objectMapper.writeValueAsString(body));
    }

    private static String stringOf(MvcResult r) throws Exception {
        return r.getResponse().getContentAsString();
    }

    private static PropertyRequest sampleEntity(String phone) {
        PropertyRequest e = new PropertyRequest("Udupi", "karnataka/udupi/manipal", "Manipal", "AREA", "BUY",
                "2BHK", 2000000L, 5000000L, phone, "hash", "WHATSAPP", "v1", OffsetDateTime.now());
        ReflectionTestUtils.setField(e, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(e, "createdAt", OffsetDateTime.now());
        return e;
    }

    // ── B3: happy path ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("B3: valid POST -> 201 {id,status,createdAt} and nothing else; phone never echoed")
    void validPost_returns201_withoutPhone() throws Exception {
        MvcResult result = mockMvc.perform(postJson(validBody()))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNotEmpty())
                .andExpect(jsonPath("$.status").value("RECEIVED"))
                .andExpect(jsonPath("$.createdAt").isNotEmpty())
                .andExpect(jsonPath("$.*").value(org.hamcrest.Matchers.hasSize(3)))
                .andReturn();
        assertThat(stringOf(result)).doesNotContain(PHONE_DIGITS_SUBSTRING);

        ArgumentCaptor<PropertyRequest> saved = ArgumentCaptor.forClass(PropertyRequest.class);
        verify(repository).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getConsentedAt()).as("consented_at is set server-side").isNotNull();
        assertThat(saved.getValue().getPhoneHash()).isNotBlank().doesNotContain(PHONE_DIGITS_SUBSTRING);
    }

    // ── B3: validation -> 400 VALIDATION_FAILED, no echo ───────────────────────

    private void assertValidationFailure(Map<String, Object> body, String expectedField) throws Exception {
        MvcResult result = mockMvc.perform(postJson(body))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fields[?(@.field=='" + expectedField + "')]").exists())
                .andReturn();
        assertThat(stringOf(result)).doesNotContain(PHONE_DIGITS_SUBSTRING);
        org.mockito.Mockito.verifyNoInteractions(repository);
    }

    @Test
    @DisplayName("B3: consent=false -> 400 on field consent")
    void consentFalse_returns400() throws Exception {
        Map<String, Object> b = validBody();
        b.put("consent", false);
        assertValidationFailure(b, "consent");
    }

    @Test
    @DisplayName("B3: consent missing -> 400 on field consent")
    void consentMissing_returns400() throws Exception {
        Map<String, Object> b = validBody();
        b.remove("consent");
        assertValidationFailure(b, "consent");
    }

    @Test
    @DisplayName("B3 strict consent: JSON string \"true\" is NOT accepted -> 400 on consent, nothing saved")
    void consentStringTrue_returns400() throws Exception {
        Map<String, Object> b = validBody();
        b.put("consent", "true");
        assertValidationFailure(b, "consent");
    }

    @Test
    @DisplayName("B3 strict consent: JSON number 1 is NOT accepted -> 400 on consent")
    void consentNumberOne_returns400() throws Exception {
        Map<String, Object> b = validBody();
        b.put("consent", 1);
        assertValidationFailure(b, "consent");
    }

    @Test
    @DisplayName("B3 strict consent: rejected consent does not consume rate-limit budget (limiter not invoked)")
    void consentStringTrue_doesNotConsumeBudget() throws Exception {
        Map<String, Object> bad = validBody();
        bad.put("consent", "true");
        for (int i = 0; i < 5; i++) {
            mockMvc.perform(postJson(bad).header("X-Forwarded-For", "10.0.3.1")).andExpect(status().isBadRequest());
        }
        mockMvc.perform(postJson(validBody()).header("X-Forwarded-For", "10.0.3.1")).andExpect(status().isCreated());
    }

    @Test
    @DisplayName("B3: a 00-prefixed 14-digit phone is accepted and stored in canonical +91 form")
    void doubleZeroPrefixedPhone_isCanonicalised() throws Exception {
        Map<String, Object> b = validBody();
        b.put("phone", "00919876541234");
        mockMvc.perform(postJson(b)).andExpect(status().isCreated());
        ArgumentCaptor<PropertyRequest> saved = ArgumentCaptor.forClass(PropertyRequest.class);
        verify(repository).saveAndFlush(saved.capture());
        assertThat(saved.getValue().getPhone()).isEqualTo(PHONE);
    }

    @Test
    @DisplayName("B3: consentVersion blank -> 400")
    void consentVersionBlank_returns400() throws Exception {
        Map<String, Object> b = validBody();
        b.put("consentVersion", "  ");
        assertValidationFailure(b, "consentVersion");
    }

    @ParameterizedTest
    @ValueSource(strings = {"12345", "98765abcde", "+1234567890123456", "98 76 54 12 34", ""})
    @DisplayName("B3: bad phone formats -> 400 on field phone, value not echoed")
    void badPhone_returns400(String phone) throws Exception {
        Map<String, Object> b = validBody();
        b.put("phone", phone);
        MvcResult result = mockMvc.perform(postJson(b))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.fields[?(@.field=='phone')]").exists())
                .andReturn();
        if (!phone.isEmpty()) {
            assertThat(stringOf(result)).doesNotContain(phone);
        }
    }

    @Test
    @DisplayName("B3: requirement of 501 chars -> 400")
    void requirementTooLong_returns400() throws Exception {
        Map<String, Object> b = validBody();
        b.put("requirement", "x".repeat(501));
        assertValidationFailure(b, "requirement");
    }

    @Test
    @DisplayName("B3: budgetMax < budgetMin -> 400")
    void budgetMaxBelowMin_returns400() throws Exception {
        Map<String, Object> b = validBody();
        b.put("budgetMin", 5000000);
        b.put("budgetMax", 1000000);
        assertValidationFailure(b, "budgetRangeValid");
    }

    @Test
    @DisplayName("B3: negative budget -> 400")
    void negativeBudget_returns400() throws Exception {
        Map<String, Object> b = validBody();
        b.put("budgetMin", -1);
        assertValidationFailure(b, "budgetMin");
    }

    @Test
    @DisplayName("B3: lowercase journey -> 400 (exact uppercase enum values only)")
    void lowercaseJourney_returns400() throws Exception {
        Map<String, Object> b = validBody();
        b.put("journey", "area");
        assertValidationFailure(b, "journey");
    }

    @Test
    @DisplayName("B3: lowercase intent / contactVia -> 400")
    void lowercaseIntentAndContactVia_return400() throws Exception {
        Map<String, Object> b = validBody();
        b.put("intent", "buy");
        assertValidationFailure(b, "intent");
        Map<String, Object> c = validBody();
        c.put("contactVia", "whatsapp");
        assertValidationFailure(c, "contactVia");
    }

    @Test
    @DisplayName("B3: city missing -> 400")
    void cityMissing_returns400() throws Exception {
        Map<String, Object> b = validBody();
        b.remove("city");
        assertValidationFailure(b, "city");
    }

    @Test
    @DisplayName("B3/B7: malformed JSON containing a phone -> 400, body never echoes it, nothing logs it")
    void malformedJson_returns400_withoutEcho_andWithoutLogging() throws Exception {
        MvcResult result = mockMvc.perform(post(URL)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phone\":\"" + PHONE + "\", \"consent\": tru"))
                .andExpect(status().isBadRequest())
                .andReturn();
        assertThat(stringOf(result)).doesNotContain(PHONE_DIGITS_SUBSTRING);
        assertNoPhoneInLogs();
    }

    // ── B4: rate limiting ──────────────────────────────────────────────────────

    @Test
    @DisplayName("B4: per-client-key bucket -> 429 RATE_LIMIT_EXCEEDED after the configured limit; other clients unaffected")
    void clientKeyBucket_returns429AfterLimit() throws Exception {
        for (int i = 0; i < 3; i++) {
            Map<String, Object> b = validBody();
            b.put("phone", "+9198765400" + (10 + i));
            mockMvc.perform(postJson(b).header("X-Forwarded-For", "10.0.0.1")).andExpect(status().isCreated());
        }
        Map<String, Object> fourth = validBody();
        fourth.put("phone", "+919876540099");
        MvcResult blocked = mockMvc.perform(postJson(fourth).header("X-Forwarded-For", "10.0.0.1"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("RATE_LIMIT_EXCEEDED"))
                .andReturn();
        assertThat(stringOf(blocked)).doesNotContain("9876540099");

        mockMvc.perform(postJson(fourth).header("X-Forwarded-For", "10.0.0.2")).andExpect(status().isCreated());
    }

    @Test
    @DisplayName("B4: per-phone-hash bucket -> 429 for the same phone across different clients, incl. reformatted phone")
    void phoneHashBucket_returns429AfterLimit() throws Exception {
        mockMvc.perform(postJson(validBody()).header("X-Forwarded-For", "10.0.1.1")).andExpect(status().isCreated());
        Map<String, Object> second = validBody();
        second.put("phone", "9876541234"); // same subscriber without +91
        mockMvc.perform(postJson(second).header("X-Forwarded-For", "10.0.1.2")).andExpect(status().isCreated());

        mockMvc.perform(postJson(validBody()).header("X-Forwarded-For", "10.0.1.3"))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.error").value("RATE_LIMIT_EXCEEDED"));

        Map<String, Object> other = validBody();
        other.put("phone", "+919876540077");
        mockMvc.perform(postJson(other).header("X-Forwarded-For", "10.0.1.3")).andExpect(status().isCreated());
    }

    @Test
    @DisplayName("B4: invalid requests do not consume rate-limit budget")
    void invalidRequests_doNotConsumeBudget() throws Exception {
        Map<String, Object> bad = validBody();
        bad.put("consent", false);
        for (int i = 0; i < 6; i++) {
            mockMvc.perform(postJson(bad).header("X-Forwarded-For", "10.0.2.1")).andExpect(status().isBadRequest());
        }
        mockMvc.perform(postJson(validBody()).header("X-Forwarded-For", "10.0.2.1")).andExpect(status().isCreated());
    }

    // ── B8: public POST never 401s on a bad/absent JWT ─────────────────────────

    @Test
    @DisplayName("B8: no Authorization header -> 201")
    void noAuthHeader_returns201() throws Exception {
        mockMvc.perform(postJson(validBody())).andExpect(status().isCreated());
    }

    @Test
    @DisplayName("B8: garbage Bearer token -> 201, not 401")
    void garbageBearer_returns201() throws Exception {
        when(jwtDecoder.decode(any())).thenThrow(new BadJwtException("garbage"));
        mockMvc.perform(postJson(validBody()).header("Authorization", "Bearer not-a-jwt"))
                .andExpect(status().isCreated());
    }

    @Test
    @DisplayName("B8: expired Bearer token -> 201, not 401")
    void expiredBearer_returns201() throws Exception {
        when(jwtDecoder.decode(any())).thenThrow(
                new JwtValidationException("Jwt expired", List.of(new OAuth2Error("invalid_token", "Jwt expired", null))));
        mockMvc.perform(postJson(validBody()).header("Authorization", "Bearer expired.jwt.token"))
                .andExpect(status().isCreated());
    }

    @Test
    @DisplayName("B8 scope: the resolver exemption is ONLY for the public POST — admin GET with an expired token is still 401")
    void expiredBearer_onAdminEndpoint_stillReturns401() throws Exception {
        when(jwtDecoder.decode(any())).thenThrow(
                new JwtValidationException("Jwt expired", List.of(new OAuth2Error("invalid_token", "Jwt expired", null))));
        mockMvc.perform(get(ADMIN_URL).header("Authorization", "Bearer expired.jwt.token"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("B8 scope: PUT and GET on the public path with an expired Bearer are still 401 (exemption is POST-only)")
    void expiredBearer_onPublicPathNonPost_stillReturns401() throws Exception {
        when(jwtDecoder.decode(any())).thenThrow(
                new JwtValidationException("Jwt expired", List.of(new OAuth2Error("invalid_token", "Jwt expired", null))));
        mockMvc.perform(put(URL).header("Authorization", "Bearer expired.jwt.token")
                        .contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get(URL).header("Authorization", "Bearer expired.jwt.token"))
                .andExpect(status().isUnauthorized());
    }

    // ── B6: admin list ─────────────────────────────────────────────────────────

    private static org.springframework.test.web.servlet.request.RequestPostProcessor asRole(String role) {
        return jwt().jwt(j -> j.subject(UUID.randomUUID().toString()))
                .authorities(new SimpleGrantedAuthority(role));
    }

    @Test
    @DisplayName("B6: anonymous admin GET -> 401")
    void adminList_anonymous_returns401() throws Exception {
        mockMvc.perform(get(ADMIN_URL)).andExpect(status().isUnauthorized());
    }

    @Test
    @DisplayName("B6: non-admin admin GET -> 403")
    void adminList_nonAdmin_returns403() throws Exception {
        mockMvc.perform(get(ADMIN_URL).with(asRole("ROLE_USER"))).andExpect(status().isForbidden());
    }

    @Test
    @DisplayName("B6: admin GET -> 200 with phoneMasked, and no plaintext/ciphertext/hash anywhere in the body")
    void adminList_admin_returnsMaskedPhoneOnly() throws Exception {
        when(repository.findAllByOrderByCreatedAtDesc(any(Pageable.class)))
                .thenReturn(List.of(sampleEntity(PHONE)));

        MvcResult result = mockMvc.perform(get(ADMIN_URL).with(asRole("ROLE_ADMIN")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].phoneMasked").value("+91******1234"))
                .andExpect(jsonPath("$[0].phone").doesNotExist())
                .andExpect(jsonPath("$[0].phoneEnc").doesNotExist())
                .andExpect(jsonPath("$[0].phoneHash").doesNotExist())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
                .andReturn();
        assertThat(stringOf(result)).doesNotContain(PHONE_DIGITS_SUBSTRING).doesNotContain(PHONE).doesNotContain("ENC:");
    }

    private int requestedPageSize(String limitParam) throws Exception {
        when(repository.findAllByOrderByCreatedAtDesc(any(Pageable.class))).thenReturn(List.of());
        mockMvc.perform(get(ADMIN_URL).param("limit", limitParam).with(asRole("ROLE_ADMIN")))
                .andExpect(status().isOk());
        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findAllByOrderByCreatedAtDesc(captor.capture());
        int size = captor.getValue().getPageSize();
        reset(repository);
        return size;
    }

    @Test
    @DisplayName("B6: limit clamped to 1..200 (0 -> 1, 500 -> 200, -5 -> 1, 50 -> 50)")
    void adminList_limitIsClamped() throws Exception {
        assertThat(requestedPageSize("0")).isEqualTo(1);
        assertThat(requestedPageSize("500")).isEqualTo(200);
        assertThat(requestedPageSize("-5")).isEqualTo(1);
        assertThat(requestedPageSize("50")).isEqualTo(50);
    }

    // ── B7: no PII in logs on the POST path ────────────────────────────────────

    private void assertNoPhoneInLogs() {
        for (ILoggingEvent e : logAppender.list) {
            String rendered = e.getFormattedMessage() + " "
                    + (e.getThrowableProxy() == null ? "" : ThrowableProxyUtil.asString(e.getThrowableProxy()));
            assertThat(rendered).as("log line from %s", e.getLoggerName())
                    .doesNotContain(PHONE_DIGITS_SUBSTRING)
                    .doesNotContain("ENC:");
        }
    }

    @Test
    @DisplayName("B7: no log line on the success, validation-failure or 429 path contains the phone digits")
    void noPhoneInLogs_onAnyPostPath() throws Exception {
        mockMvc.perform(postJson(validBody()).header("X-Forwarded-For", "10.0.9.1")).andExpect(status().isCreated());
        Map<String, Object> bad = validBody();
        bad.put("consent", false);
        mockMvc.perform(postJson(bad)).andExpect(status().isBadRequest());
        mockMvc.perform(postJson(validBody()).header("X-Forwarded-For", "10.0.9.2")).andExpect(status().isCreated());
        mockMvc.perform(postJson(validBody()).header("X-Forwarded-For", "10.0.9.3")).andExpect(status().isTooManyRequests());

        assertThat(logAppender.list).as("log capture is live (guards against a vacuous pass)").isNotEmpty();
        assertNoPhoneInLogs();
    }
}

package com.example.realestate.propertyrequest;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.classic.spi.ThrowableProxyUtil;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Unit tests (Mockito) for {@link PropertyRequestService}: masking, listing and B7 log hygiene. */
class PropertyRequestServiceTest {

    private static final String KEY = "QUVTMjU2R0NNLXRlc3Qta2V5LWZvci1kZXYtb25seTA=";
    private static final String PHONE = "+919876541234";

    private PropertyRequestRepository repository;
    private PropertyRequestService service;
    private ListAppender<ILoggingEvent> appender;
    private Logger root;

    @BeforeEach
    void setUp() {
        repository = mock(PropertyRequestRepository.class);
        when(repository.saveAndFlush(any(PropertyRequest.class))).thenAnswer(inv -> {
            PropertyRequest e = inv.getArgument(0);
            ReflectionTestUtils.setField(e, "id", UUID.randomUUID());
            ReflectionTestUtils.setField(e, "createdAt", OffsetDateTime.now());
            return e;
        });
        service = new PropertyRequestService(repository, new PhoneHasher(KEY),
                new PropertyRequestRateLimiter(2, 1, false, 1000));
        root = (Logger) LoggerFactory.getLogger(Logger.ROOT_LOGGER_NAME);
        appender = new ListAppender<>();
        appender.start();
        root.addAppender(appender);
        root.setLevel(Level.DEBUG);
    }

    @AfterEach
    void tearDown() {
        root.detachAppender(appender);
    }

    private static CreatePropertyRequestDto dto(String phone) {
        return new CreatePropertyRequestDto("Udupi", null, null, "MAP", "RENT", null, null, null,
                phone, "PHONE", true, "v1");
    }

    @Test
    @DisplayName("mask keeps country prefix and last 4 digits")
    void mask() {
        assertThat(PropertyRequestService.mask("+919876541234")).isEqualTo("+91******1234");
        assertThat(PropertyRequestService.mask("9876541234")).doesNotContain("98765").endsWith("1234");
        assertThat(PropertyRequestService.mask(null)).isEqualTo("****");
        assertThat(PropertyRequestService.mask("12")).isEqualTo("****");
    }

    @Test
    @DisplayName("mask never reveals more than last 4 digits plus a +91 prefix (only when the number starts with 91)")
    void maskCap() {
        assertThat(PropertyRequestService.mask("9876541234")).isEqualTo("+******1234");        // 10
        assertThat(PropertyRequestService.mask("12345678901")).isEqualTo("+*******8901");      // 11
        assertThat(PropertyRequestService.mask("919876541234")).isEqualTo("+91******1234");    // 12, 91
        assertThat(PropertyRequestService.mask("441234567890")).isEqualTo("+********7890");    // 12, not 91
        assertThat(PropertyRequestService.mask("9198765412345")).isEqualTo("+91*******2345");  // 13, 91
        assertThat(PropertyRequestService.mask("4412345678901")).isEqualTo("+*********8901");  // 13, not 91
        assertThat(PropertyRequestService.mask("+919876541234")).isEqualTo("+91******1234");   // plus ignored
        assertThat(PropertyRequestService.mask("")).isEqualTo("****");
        assertThat(PropertyRequestService.mask("1234567")).isEqualTo("****");                   // too short
    }

    @Test
    @DisplayName("create stores the canonical phone, a keyed hash, and sets consented_at server-side")
    void createStoresCanonicalPhoneAndHash() {
        PropertyRequestCreatedResponse r = service.create(dto("9876541234"), "client-1");
        assertThat(r.status()).isEqualTo("RECEIVED");
        assertThat(r.id()).isNotNull();
        org.mockito.ArgumentCaptor<PropertyRequest> c = org.mockito.ArgumentCaptor.forClass(PropertyRequest.class);
        org.mockito.Mockito.verify(repository).saveAndFlush(c.capture());
        assertThat(c.getValue().getPhone()).isEqualTo("+919876541234");
        assertThat(c.getValue().getConsentedAt()).isNotNull();
    }

    @Test
    @DisplayName("create rejects with 429 RATE_LIMIT_EXCEEDED when the per-phone bucket is empty, before saving")
    void rateLimitedPhone() {
        service.create(dto(PHONE), "c1");
        assertThatThrownBy(() -> service.create(dto(PHONE), "c2"))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> {
                    assertThat(e.getStatusCode().value()).isEqualTo(429);
                    assertThat(e.getReason()).isEqualTo("RATE_LIMIT_EXCEEDED");
                });
        org.mockito.Mockito.verify(repository, org.mockito.Mockito.times(1)).saveAndFlush(any());
    }

    @Test
    @DisplayName("B7: create + list + rate-limit paths log nothing containing the phone, ENC: or the hash")
    void noPhoneEncOrHashInLogs() {
        service.create(dto(PHONE), "c1");
        try {
            service.create(dto(PHONE), "c2");
        } catch (ResponseStatusException expected) {
            // 429 path exercised for logging
        }
        PropertyRequest e = new PropertyRequest("Udupi", null, null, "MAP", "RENT", null, null, null,
                PHONE, "deadbeefhash", "PHONE", "v1", OffsetDateTime.now());
        ReflectionTestUtils.setField(e, "id", UUID.randomUUID());
        ReflectionTestUtils.setField(e, "createdAt", OffsetDateTime.now());
        when(repository.findAllByOrderByCreatedAtDesc(any())).thenReturn(List.of(e));
        service.listRecent(10);

        assertThat(appender.list).as("log capture is live").isNotEmpty();
        for (ILoggingEvent ev : appender.list) {
            String rendered = ev.getFormattedMessage()
                    + (ev.getThrowableProxy() == null ? "" : ThrowableProxyUtil.asString(ev.getThrowableProxy()));
            assertThat(rendered)
                    .as("log from %s", ev.getLoggerName())
                    .doesNotContain("9876541234")
                    .doesNotContain("ENC:")
                    .doesNotContain("deadbeefhash");
        }
    }
}

package com.example.realestate.propertyrequest;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import javax.sql.DataSource;
import java.sql.Connection;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Issue #1793 PR-B — V146 applies cleanly and the phone is encrypted at rest (B5). The raw column
 * is read via JdbcTemplate (bypassing the JPA converter) and must start with {@code ENC:} and
 * not contain the plaintext digits.
 */
@DataJpaTest
@Testcontainers(disabledWithoutDocker = true)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@TestPropertySource(properties = {
        "spring.datasource.hikari.data-source-properties.ssl=false",
        "spring.datasource.hikari.data-source-properties.sslmode=disable",
        "spring.datasource.hikari.data-source-properties.stringtype=unspecified",
        "spring.flyway.locations=classpath:db/test-stubs,classpath:db/migration",
        "spring.flyway.placeholders.concurrently_keyword="
})
@Import({PropertyRequestService.class, PhoneHasher.class, PhoneKeyResolver.class, PropertyRequestRateLimiter.class})
@Transactional(propagation = Propagation.NOT_SUPPORTED)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class PropertyRequestPersistenceIT {

    @Container
    @ServiceConnection
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>(
            DockerImageName.parse("postgis/postgis:15-3.4").asCompatibleSubstituteFor("postgres"));

    private static final String PHONE = "+919876541234";
    private static final String DIGITS = "9876541234";

    @Autowired private PropertyRequestService service;
    @Autowired private PropertyRequestRepository repository;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private DataSource dataSource;

    @Autowired private PropertyRequestRateLimiter rateLimiter;

    @BeforeEach
    void clean() {
        rateLimiter.reset(); // the limiter bean is shared across test methods
        jdbc.update("DELETE FROM public.property_requests");
    }

    private CreatePropertyRequestDto dto(String phone) {
        return new CreatePropertyRequestDto("Udupi", "karnataka/udupi/manipal", "Manipal", "AREA", "BUY",
                "2BHK", 2000000L, 5000000L, phone, "WHATSAPP", true, "v1");
    }

    @Test
    @DisplayName("datasource proof: the IT talks to the Testcontainers database, not a hosted one")
    void datasourceIsTheTestcontainer() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            String url = c.getMetaData().getURL();
            System.out.println("DATASOURCE_URL_PROOF[PersistenceIT]=" + url);
            assertThat(url).isEqualTo(postgres.getJdbcUrl());
            assertThat(url).matches("jdbc:postgresql://(localhost|127\\.0\\.0\\.1):\\d+/.*");
        }
    }

    @Test
    @DisplayName("B5: raw phone_enc starts with ENC: and lacks the plaintext digits; phone_hash is present and is not the digits")
    void phoneEncryptedAtRest() {
        PropertyRequestCreatedResponse created = service.create(dto(PHONE), "it-client");

        Map<String, Object> raw = jdbc.queryForMap(
                "SELECT phone_enc, phone_hash, status, consent_version, consented_at, created_at "
                        + "FROM public.property_requests WHERE id = ?", created.id());
        String phoneEnc = (String) raw.get("phone_enc");
        String phoneHash = (String) raw.get("phone_hash");
        assertThat(phoneEnc).startsWith("ENC:").doesNotContain(DIGITS).doesNotContain(PHONE);
        assertThat(phoneHash).isNotBlank().isNotEqualTo(DIGITS).doesNotContain(DIGITS).matches("[0-9a-f]{64}");
        assertThat(raw.get("status")).isEqualTo("RECEIVED");
        assertThat(raw.get("consent_version")).isEqualTo("v1");
        assertThat(raw.get("consented_at")).isNotNull();
        assertThat(raw.get("created_at")).isNotNull();
    }

    @Test
    @DisplayName("retention: retain_until equals created_at + 12 months (raw read); created response carries the DB created_at")
    void retainUntilIsTwelveMonthsAfterCreatedAt() {
        PropertyRequestCreatedResponse created = service.create(dto(PHONE), "it-client");

        Map<String, Object> raw = jdbc.queryForMap(
                "SELECT retain_until = created_at + interval '12 months' AS exact, "
                        + "created_at, retain_until FROM public.property_requests WHERE id = ?", created.id());
        assertThat(raw.get("exact")).as("retain_until == created_at + 12 months").isEqualTo(true);
        assertThat(raw.get("retain_until")).isNotEqualTo(raw.get("created_at"));
        java.time.OffsetDateTime dbCreatedAt = jdbc.queryForObject(
                "SELECT created_at FROM public.property_requests WHERE id = ?",
                java.time.OffsetDateTime.class, created.id());
        assertThat(created.createdAt()).as("response createdAt present").isNotNull();
        assertThat(created.createdAt().toInstant())
                .as("response createdAt equals the raw DB created_at (not an app-side clock)")
                .isEqualTo(dbCreatedAt.toInstant());
    }

    @Test
    @DisplayName("retain_until is not part of any admin view")
    void retainUntilNotExposedInAdminView() {
        service.create(dto(PHONE), "it-client");
        assertThat(java.util.Arrays.stream(AdminPropertyRequestView.class.getRecordComponents())
                .map(java.lang.reflect.RecordComponent::getName))
                .doesNotContain("retainUntil", "retain_until");
    }

    @Test
    @DisplayName("B5/B6: the entity round-trips the plaintext through the converter; admin view is masked only")
    void roundTripAndAdminMasking() {
        service.create(dto(PHONE), "it-client");

        List<PropertyRequest> loaded = repository.findAll();
        assertThat(loaded).hasSize(1);
        assertThat(loaded.get(0).getPhone()).isEqualTo(PHONE);

        List<AdminPropertyRequestView> view = service.listRecent(10);
        assertThat(view).hasSize(1);
        assertThat(view.get(0).phoneMasked()).isEqualTo("+91******1234");
        assertThat(view.get(0).toString()).doesNotContain(DIGITS);
    }

    @Test
    @DisplayName("admin list is newest-first and honours the limit")
    void listIsNewestFirstAndLimited() throws Exception {
        service.create(dto("+919876540001"), "c1");
        Thread.sleep(5);
        service.create(dto("+919876540002"), "c2");
        Thread.sleep(5);
        service.create(dto("+919876540003"), "c3");

        List<AdminPropertyRequestView> two = service.listRecent(2);
        assertThat(two).hasSize(2);
        assertThat(two.get(0).phoneMasked()).endsWith("0003");
        assertThat(two.get(1).phoneMasked()).endsWith("0002");
    }

    @Test
    @DisplayName("V146 CHECK constraints reject a lowercase journey and budget_max < budget_min at the DB level")
    void checkConstraintsHold() {
        org.junit.jupiter.api.Assertions.assertThrows(Exception.class, () -> jdbc.update(
                "INSERT INTO public.property_requests (city, journey, intent, phone_enc, phone_hash, contact_via, "
                        + "consent_version, consented_at) VALUES ('c','area','BUY','ENC:x','h','PHONE','v1',now())"));
        org.junit.jupiter.api.Assertions.assertThrows(Exception.class, () -> jdbc.update(
                "INSERT INTO public.property_requests (city, journey, intent, budget_min, budget_max, phone_enc, "
                        + "phone_hash, contact_via, consent_version, consented_at) "
                        + "VALUES ('c','AREA','BUY',10,5,'ENC:x','h','PHONE','v1',now())"));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM public.property_requests", Long.class)).isZero();
    }
}

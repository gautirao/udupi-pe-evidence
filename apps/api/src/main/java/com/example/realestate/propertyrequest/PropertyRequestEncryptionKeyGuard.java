package com.example.realestate.propertyrequest;

import jakarta.annotation.PostConstruct;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.HexFormat;

/**
 * Fail-closed startup guard for the public property-request endpoint (#1793, FF2). Only created
 * when {@code app.property-requests.enabled=true}; refuses to start the application when the phone
 * encryption key the converter will actually use is absent, the development fallback, or malformed.
 *
 * <p>The key is resolved by the shared {@link PhoneKeyResolver} (the same one that keys
 * {@link PhoneHasher}), which mirrors {@code PhoneEncryptionConverter#resolveKey} exactly (that class
 * is deliberately not touched). "Neither environment variable nor system property set" means the
 * converter would use its dev literal, so it fails. The key is not trimmed (the converter does not
 * trim), so a whitespace-padded key fails here instead of passing and failing later at the converter.
 * It also fails when the Spring property {@code security.phone.encryption-key} (for example set via
 * {@code SECURITY_PHONE_ENCRYPTION_KEY}) disagrees with the resolved key.
 *
 * <p>L2: {@link PublicPropertyRequestController} takes this guard as a constructor dependency, so the
 * guard runs whenever the controller is created, even with {@code spring.main.lazy-initialization=true}.
 *
 * <p>Dev detection: the dev literal is not copied here. The decoded key is compared with the
 * SHA-256 fingerprint of the decoded dev key ({@link #DEV_KEY_SHA256}). Messages are value-free and
 * nothing is logged.
 */
@Component
@ConditionalOnProperty(name = "app.property-requests.enabled", havingValue = "true")
public class PropertyRequestEncryptionKeyGuard {

    private static final String ENV_VAR = PhoneKeyResolver.ENV_VAR;

    /** SHA-256 (hex) of the 32 decoded bytes of the development-only fallback key. */
    private static final String DEV_KEY_SHA256 =
            "7d6a2faec0a637b9fb03e3a07ad063f1b31d51b30012d609f87f9930650fe9c8";

    private final PhoneKeyResolver keyResolver;

    public PropertyRequestEncryptionKeyGuard(PhoneKeyResolver keyResolver) {
        this.keyResolver = keyResolver;
    }

    @PostConstruct
    void validate() {
        PhoneKeyResolver.Resolution resolution = keyResolver.resolve();
        if (resolution.source() == PhoneKeyResolver.Source.SPRING_DEFAULT) {
            throw new IllegalStateException("app.property-requests.enabled=true requires a production phone "
                    + "encryption key: set " + ENV_VAR + " (Base64, 32 bytes). Neither the environment "
                    + "variable nor the system property is set, so the development fallback key would be used.");
        }
        if (!resolution.key().equals(resolution.springProperty())) {
            throw new IllegalStateException("app.property-requests.enabled=true but the Spring property "
                    + "security.phone.encryption-key disagrees with the key the converter resolves from "
                    + ENV_VAR + " / the system property. Remove the conflicting override.");
        }
        byte[] key;
        try {
            key = Base64.getDecoder().decode(resolution.key());
        } catch (IllegalArgumentException e) {
            throw new IllegalStateException("app.property-requests.enabled=true but " + ENV_VAR
                    + " is not valid Base64 (surrounding whitespace is not accepted).");
        }
        if (key.length != 32) {
            throw new IllegalStateException("app.property-requests.enabled=true but " + ENV_VAR
                    + " must decode to exactly 32 bytes.");
        }
        if (DEV_KEY_SHA256.equals(sha256Hex(key))) {
            throw new IllegalStateException("app.property-requests.enabled=true but " + ENV_VAR
                    + " is the development-only fallback key; set a production key.");
        }
    }

    private static String sha256Hex(byte[] data) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable");
        }
    }
}

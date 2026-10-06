package com.example.realestate.propertyrequest;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.HexFormat;

/**
 * Keyed, deterministic phone fingerprint used ONLY for per-phone rate limiting (#1793).
 *
 * <p>{@code subkey = HMAC-SHA256(master, "property-request-phone-hash-v1")} and
 * {@code hash = hex(HMAC-SHA256(subkey, normalisedDigits))}. The master is the key
 * the phone converter uses (no new env var), resolved by {@link PhoneKeyResolver} so it can never come
 * from a different source than the converter's; deriving a
 * subkey means the AES key itself is never used as an HMAC key. An unkeyed hash of a 10-digit
 * phone would be trivially reversible, so the hash is never unkeyed.
 */
@Component
public class PhoneHasher {

    private static final String HMAC = "HmacSHA256";
    private static final String SUBKEY_LABEL = "property-request-phone-hash-v1";

    private final byte[] subkey;

    /** Production wiring: keyed from the shared resolver, never directly from the Spring property. */
    @Autowired
    public PhoneHasher(PhoneKeyResolver keyResolver) {
        this(keyResolver.resolve().key());
    }

    PhoneHasher(String masterKey) {
        this.subkey = hmac(masterKey.getBytes(StandardCharsets.UTF_8),
                SUBKEY_LABEL.getBytes(StandardCharsets.UTF_8));
    }

    public String hash(String phone) {
        return HexFormat.of().formatHex(hmac(subkey, normalizeDigits(phone).getBytes(StandardCharsets.UTF_8)));
    }

    /**
     * Digits only. An international "00" prefix, or else a single trunk "0", is stripped first
     * (country codes never start with 0). A bare 10-digit number is then an Indian mobile and gets
     * the {@code 91} country code, so "9876541234", "09876541234", "0919876541234",
     * "00919876541234" and "+919876541234" are all the same subscriber.
     */
    public static String normalizeDigits(String phone) {
        String digits = phone == null ? "" : phone.replaceAll("[^0-9]", "");
        if (digits.startsWith("00")) {
            digits = digits.substring(2);
        } else if (digits.startsWith("0")) {
            digits = digits.substring(1);
        }
        return digits.length() == 10 ? "91" + digits : digits;
    }

    private static byte[] hmac(byte[] key, byte[] data) {
        try {
            Mac mac = Mac.getInstance(HMAC);
            mac.init(new SecretKeySpec(key, HMAC));
            return mac.doFinal(data);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("HMAC-SHA256 unavailable", e);
        }
    }
}

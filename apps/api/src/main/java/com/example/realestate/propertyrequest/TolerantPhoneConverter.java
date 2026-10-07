package com.example.realestate.propertyrequest;

import com.example.realestate.trust.PhoneEncryptionConverter;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Wraps {@link PhoneEncryptionConverter} for {@link PropertyRequest#getPhone()} so ONE row that
 * cannot be decrypted (for example written under a previous PHONE_ENCRYPTION_KEY) does not make
 * Hibernate throw while hydrating the admin list. On a failed read the attribute becomes
 * {@link #UNDECRYPTABLE}, never the ciphertext. Writes delegate unchanged, and the sentinel can
 * never be written back.
 *
 * <p>Not auto-applied ({@code autoApply} is false): used only through {@code @Convert} on
 * {@link PropertyRequest}. The exception is swallowed without logging because its message can
 * chain ciphertext; callers count {@link #UNDECRYPTABLE} values and log the count only.
 */
@Converter
public class TolerantPhoneConverter implements AttributeConverter<String, String> {

    /** Marker for an unreadable phone. Contains no digits so it can never be mistaken for a number. */
    static final String UNDECRYPTABLE = "\u0000undecryptable";

    private final PhoneEncryptionConverter delegate = new PhoneEncryptionConverter();

    @Override
    public String convertToDatabaseColumn(String attribute) {
        if (UNDECRYPTABLE.equals(attribute)) {
            throw new IllegalStateException("Refusing to persist an undecryptable phone placeholder");
        }
        return delegate.convertToDatabaseColumn(attribute);
    }

    @Override
    public String convertToEntityAttribute(String dbData) {
        try {
            return delegate.convertToEntityAttribute(dbData);
        } catch (RuntimeException e) {
            return UNDECRYPTABLE;
        }
    }
}

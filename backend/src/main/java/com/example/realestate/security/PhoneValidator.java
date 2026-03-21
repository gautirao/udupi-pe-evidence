package com.example.realestate.security;

import java.util.regex.Pattern;

/**
 * Shared phone-number validation constants used by setup controllers.
 *
 * <p>Both {@code BrokerSetupController} and {@code DealerSetupController} reference
 * these constants so that the validation rules stay in sync. Callers are responsible
 * for running the checks; this class provides no instance methods.
 */
public final class PhoneValidator {

    /** Accepts an optional {@code +} prefix followed by 10–15 digits. */
    public static final Pattern PHONE_PATTERN = Pattern.compile("^[+]?[0-9]{10,15}$");

    /** Maximum allowed length for a phone number string (must match the regex upper bound). */
    public static final int PHONE_MAX_LENGTH = 15;

    private PhoneValidator() {}
}

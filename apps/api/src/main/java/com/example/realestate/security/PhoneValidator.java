package com.example.realestate.security;

import java.util.regex.Pattern;

/**
 * Shared phone-number validation constants used by setup controllers.
 *
 * <p>Both {@code BrokerSetupController} and {@code DealerSetupController} reference
 * these constants so that the validation rules stay in sync. Callers are responsible
 * for running the checks; this class provides no instance methods.
 *
 * <p>Phone stored as plaintext. At-rest protection is enforced via Supabase Row Level
 * Security: only the owning user and admin can read profile rows. Column-level encryption
 * deferred to a future sprint.
 */
public final class PhoneValidator {

    /**
     * Strict E.164 format: {@code +} followed by 1–15 digits starting with a non-zero digit.
     * Requires the {@code +} country-code prefix; bare digit strings are rejected.
     */
    public static final Pattern PHONE_PATTERN = Pattern.compile("^\\+[1-9]\\d{7,14}$");

    /** Maximum allowed length for a phone number string (15 digits + 1 for {@code +}). */
    public static final int PHONE_MAX_LENGTH = 16;

    private PhoneValidator() {}
}

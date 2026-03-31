package com.example.realestate.trust;

/**
 * Utility for masking phone numbers in API responses.
 *
 * <p>Shows only the last 4 digits; replaces all preceding characters with {@code *}.
 * Example: {@code +919876543210} becomes {@code **********3210}.
 *
 * <p>Created for future use when phone numbers appear in response DTOs
 * (e.g. admin identity-evidence review). Not wired into any DTO yet.
 */
public final class PhoneMaskingUtil {

    private PhoneMaskingUtil() { }

    /**
     * Mask a phone number, preserving only the last 4 digits.
     *
     * @param phone the plaintext phone number (may be null)
     * @return masked phone or {@code "****"} if input is null or shorter than 4 chars
     */
    public static String mask(String phone) {
        if (phone == null || phone.length() < 4) {
            return "****";
        }
        return "*".repeat(phone.length() - 4) + phone.substring(phone.length() - 4);
    }
}

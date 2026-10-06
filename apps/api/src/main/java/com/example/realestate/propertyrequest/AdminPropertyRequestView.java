package com.example.realestate.propertyrequest;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Admin list row. Carries only {@code phoneMasked}; the plaintext phone, ciphertext and hash are
 * never part of any response.
 */
public record AdminPropertyRequestView(
        UUID id,
        String city,
        String areaKey,
        String areaLabel,
        String journey,
        String intent,
        String requirement,
        Long budgetMin,
        Long budgetMax,
        String phoneMasked,
        String contactVia,
        String consentVersion,
        OffsetDateTime consentedAt,
        String status,
        OffsetDateTime createdAt
) {
}

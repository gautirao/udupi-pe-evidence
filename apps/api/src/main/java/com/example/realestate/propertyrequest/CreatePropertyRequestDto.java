package com.example.realestate.propertyrequest;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.io.IOException;

/**
 * Public request body for POST /api/public/property-requests.
 *
 * <p>All validation messages are static strings: field errors must never carry the rejected value,
 * because {@code phone} is PII and the 400 body is returned to an anonymous caller.
 * The free-text fields {@code city}, {@code areaLabel} and {@code requirement} reject phone-like
 * content ({@link ContactNumberRule}; the dedicated {@code phone} field below is the only place a
 * number is accepted, so keep the two in step).
 * {@code toString()} is overridden so an accidental log of this object cannot leak the phone.
 */
public record CreatePropertyRequestDto(
        @NotBlank(message = "city is required")
        @Size(max = 100, message = "city must be at most 100 characters")
        @NoContactNumber
        String city,

        @Size(max = 200, message = "areaKey must be at most 200 characters")
        String areaKey,

        @Size(max = 200, message = "areaLabel must be at most 200 characters")
        @NoContactNumber
        String areaLabel,

        @NotNull(message = "journey is required")
        @Pattern(regexp = "AREA|SCHOOL|MAP", message = "journey must be one of AREA, SCHOOL, MAP")
        String journey,

        @NotNull(message = "intent is required")
        @Pattern(regexp = "BUY|RENT", message = "intent must be one of BUY, RENT")
        String intent,

        @Size(max = 500, message = "requirement must be at most 500 characters")
        @NoContactNumber
        String requirement,

        @PositiveOrZero(message = "budgetMin must be zero or positive")
        Long budgetMin,

        @PositiveOrZero(message = "budgetMax must be zero or positive")
        Long budgetMax,

        @NotBlank(message = "phone is required")
        @Pattern(regexp = "^\\+?[0-9]{10,14}$", message = "phone must be 10 to 14 digits, optionally prefixed with +")
        String phone,

        @NotNull(message = "contactVia is required")
        @Pattern(regexp = "PHONE|WHATSAPP", message = "contactVia must be one of PHONE, WHATSAPP")
        String contactVia,

        @NotNull(message = "consent is required")
        @AssertTrue(message = "consent must be given")
        @JsonDeserialize(using = StrictBooleanDeserializer.class)
        Boolean consent,

        @NotBlank(message = "consentVersion is required")
        @Size(max = 32, message = "consentVersion must be at most 32 characters")
        String consentVersion
) {

    /**
     * Accepts only the JSON literals {@code true} / {@code false}. Anything else (string "true",
     * number 1, ...) becomes {@code null}, so {@code @NotNull} rejects it with the usual
     * VALIDATION_FAILED shape and the rejected value is never echoed. (Jackson's default would
     * coerce "true" and 1 to TRUE, which is not an explicit consent.)
     */
    static final class StrictBooleanDeserializer extends JsonDeserializer<Boolean> {
        @Override
        public Boolean deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
            JsonToken token = p.currentToken();
            if (token == JsonToken.VALUE_TRUE) {
                return Boolean.TRUE;
            }
            if (token == JsonToken.VALUE_FALSE) {
                return Boolean.FALSE;
            }
            p.skipChildren();
            return null;
        }
    }

    @AssertTrue(message = "budgetMax must be greater than or equal to budgetMin")
    public boolean isBudgetRangeValid() {
        return budgetMin == null || budgetMax == null || budgetMax >= budgetMin;
    }

    @Override
    public String toString() {
        return "CreatePropertyRequestDto[redacted]";
    }
}

package com.example.realestate.trust;

/**
 * Request body for {@code POST /api/listings/{id}/trust/identity/verify-otp}.
 */
public class OtpVerifyRequest {

    private String code;

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }
}

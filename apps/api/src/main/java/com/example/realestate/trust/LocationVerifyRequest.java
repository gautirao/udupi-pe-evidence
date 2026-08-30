package com.example.realestate.trust;

/**
 * Request body for {@code POST /api/listings/{id}/trust/location/verify}.
 *
 * <p>All three fields are required. {@code accuracy} is accepted for client logging/audit
 * purposes but is not used in the 200-meter threshold check.
 */
public class LocationVerifyRequest {

    private Double latitude;
    private Double longitude;
    private Double accuracy;

    public Double getLatitude() {
        return latitude;
    }

    public void setLatitude(Double latitude) {
        this.latitude = latitude;
    }

    public Double getLongitude() {
        return longitude;
    }

    public void setLongitude(Double longitude) {
        this.longitude = longitude;
    }

    public Double getAccuracy() {
        return accuracy;
    }

    public void setAccuracy(Double accuracy) {
        this.accuracy = accuracy;
    }
}

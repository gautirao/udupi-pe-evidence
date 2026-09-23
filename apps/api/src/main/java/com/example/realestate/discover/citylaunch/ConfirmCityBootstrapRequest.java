package com.example.realestate.discover.citylaunch;

/** Request body for {@code POST /api/admin/city-launch/bootstrap/{jobId}/confirm} — the
 *  operator's explicit disambiguation choice (#2676 Slice A). {@code candidateIndex} indexes
 *  into the SAME ordered candidate list the job's {@code GET} status returned; the server
 *  re-validates it against the job's own persisted candidates rather than trusting anything
 *  else in the request body, so a client cannot smuggle in geometry the provider never
 *  returned. */
public record ConfirmCityBootstrapRequest(int candidateIndex) {
}

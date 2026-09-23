package com.example.realestate.discover.citylaunch;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.Duration;
import java.util.Collections;
import java.util.List;

/**
 * Default {@link CityGeocodingProvider}: OpenStreetMap Nominatim's public {@code /search}
 * endpoint (#2676 Slice A).
 *
 * <p><b>Why Nominatim, and why this is a Clarification, not a closed decision:</b>
 * {@code cities.geo_center_lat}/{@code geo_center_lon} are {@code NOT NULL} (V71) — so
 * idempotent city creation for a genuinely new name needs a REAL coordinate; a "no-network,
 * dedup-only" default cannot satisfy that column for a city that doesn't already exist. This
 * class is the smallest default that can: it's free, needs no API key, and returns a
 * display_name + point + coarse bounding box, which is exactly Slice A's scope (identity +
 * disambiguation) — it deliberately does NOT attempt Slice B's authoritative, validated
 * boundary acquisition. Posted as a formal Clarification on the Slice A PR since it's a live
 * outbound call from the backend and the owner may prefer a paid/keyed provider (Google
 * Places, Mapbox) for reliability/ToS reasons; swapping providers means implementing {@link
 * CityGeocodingProvider} again, nothing else changes.
 *
 * <p>Usage-policy discipline for this low-volume, admin-only, human-triggered call: a single
 * request per "Start launch" submission (never a per-keystroke autocomplete call), a
 * descriptive User-Agent identifying this application (Nominatim's policy requires one), and
 * the result is persisted on the {@link CityBootstrapJob} row so a page refresh or retry
 * never re-issues the same lookup.
 *
 * <p><b>Explicit, dedicated timeout (team-lead review, #2676 Slice A):</b> this class builds
 * its OWN {@link RestTemplate} with a short connect/read timeout rather than depending on
 * {@code AppConfig}'s shared bean (10s connect / 60s read, tuned for a different caller,
 * {@code AiClient}) — a slow/hanging third-party host should fail this specific admin action
 * quickly, not silently inherit whatever timeout another caller happens to need. A timeout,
 * zero results, or a malformed response are ALL surfaced as {@link
 * CityGeocodingProviderException} (mapped to a FAILED job with an actionable reason) — never
 * a fabricated coordinate, per the issue's own "stop for an admin decision rather than
 * fabricating a result" requirement.
 *
 * <p><b>Outbound payload discipline:</b> the ONLY thing sent to this third-party host is the
 * operator-typed free-text city name ({@code query}) plus fixed, non-identifying query
 * parameters ({@code format}/{@code addressdetails}/{@code limit}). No internal id (job id,
 * city id, caller id/admin identity) is ever included.
 */
@Component
public class NominatimGeocodingProvider implements CityGeocodingProvider {

    private static final Logger log = LoggerFactory.getLogger(NominatimGeocodingProvider.class);

    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(5);

    private final RestTemplate restTemplate;
    private final String baseUrl;
    private final String userAgent;

    public NominatimGeocodingProvider(
            RestTemplateBuilder restTemplateBuilder,
            @Value("${citylaunch.geocoding.nominatim.base-url:https://nominatim.openstreetmap.org}") String baseUrl,
            @Value("${citylaunch.geocoding.nominatim.user-agent:udupi-property-explorer-city-launch/1.0}")
                    String userAgent) {
        this.restTemplate = restTemplateBuilder
                .connectTimeout(CONNECT_TIMEOUT)
                .readTimeout(READ_TIMEOUT)
                .build();
        this.baseUrl = baseUrl;
        this.userAgent = userAgent;
    }

    @Override
    public List<GeocodeCandidate> search(String query) {
        // Only the operator-typed name plus fixed, non-identifying params ever leave this
        // process — see class javadoc "Outbound payload discipline".
        String url = UriComponentsBuilder.fromHttpUrl(baseUrl + "/search")
                .queryParam("q", query)
                .queryParam("format", "jsonv2")
                .queryParam("addressdetails", 1)
                .queryParam("limit", 8)
                .toUriString();

        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.USER_AGENT, userAgent);

        try {
            ResponseEntity<NominatimResult[]> response =
                    restTemplate.exchange(url, HttpMethod.GET, new HttpEntity<>(headers), NominatimResult[].class);
            NominatimResult[] body = response.getBody();
            if (body == null) {
                return Collections.emptyList();
            }
            return List.of(body).stream()
                    .map(NominatimGeocodingProvider::toCandidate)
                    .filter(candidate -> candidate != null)
                    .toList();
        } catch (RestClientException e) {
            // Includes ResourceAccessException for a connect/read timeout — fail closed with
            // an actionable reason, never fall through to a fabricated coordinate.
            log.error("Nominatim geocoding lookup failed for query='{}'", query, e);
            throw new CityGeocodingProviderException(
                    "Geocoding lookup failed — try again, or provide the city manually.", e);
        }
    }

    /** Returns null (excluded, never fabricated) for a candidate whose lat/lon are missing or
     *  malformed — a bad point from a third-party host must never crash the whole lookup nor
     *  masquerade as a usable coordinate. */
    private static GeocodeCandidate toCandidate(NominatimResult r) {
        Double lat = parseCoordinate(r.lat);
        Double lon = parseCoordinate(r.lon);
        if (lat == null || lon == null) {
            return null;
        }
        Double minLat = null;
        Double maxLat = null;
        Double minLon = null;
        Double maxLon = null;
        if (r.boundingbox != null && r.boundingbox.length == 4) {
            minLat = parseCoordinate(r.boundingbox[0]);
            maxLat = parseCoordinate(r.boundingbox[1]);
            minLon = parseCoordinate(r.boundingbox[2]);
            maxLon = parseCoordinate(r.boundingbox[3]);
        }
        return new GeocodeCandidate(r.displayName, r.addressCountryCode(), r.type, lat, lon, minLat, minLon, maxLat, maxLon);
    }

    private static Double parseCoordinate(String raw) {
        if (raw == null) {
            return null;
        }
        try {
            return Double.parseDouble(raw);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /**
     * Every field is explicitly {@code @JsonProperty}-annotated, even ones whose Java name
     * already matches the JSON key ({@code lat}/{@code lon}/{@code type}/{@code boundingbox}/
     * {@code address}) — Jackson's default field visibility is {@code PUBLIC_ONLY}, and these
     * fields are package-private, so without an explicit annotation Jackson silently leaves
     * them {@code null} instead of failing loudly. That silent-null failure mode is exactly
     * how this class first shipped: every candidate's lat/lon came back null, {@link
     * #toCandidate} correctly excluded all of them, and the whole lookup surfaced as a
     * false NOT_FOUND — caught only by manual browser verification against the real Nominatim
     * endpoint (#2676 Slice A), not by the fake-provider-backed test suite (which never
     * exercises this class's JSON deserialization at all).
     */
    @JsonIgnoreProperties(ignoreUnknown = true)
    static final class NominatimResult {
        @JsonProperty("display_name")
        String displayName;
        @JsonProperty("lat")
        String lat;
        @JsonProperty("lon")
        String lon;
        @JsonProperty("type")
        String type;
        @JsonProperty("boundingbox")
        String[] boundingbox;
        @JsonProperty("address")
        Address address;

        String addressCountryCode() {
            return address != null ? address.countryCode : null;
        }

        @JsonIgnoreProperties(ignoreUnknown = true)
        static final class Address {
            @JsonProperty("country_code")
            String countryCode;
        }
    }
}

package com.example.realestate.geo;

import com.example.realestate.exception.RateLimiterService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Proxy endpoints for Nominatim geocoding, accessible to any authenticated user.
 *
 * <p>Nominatim requires a meaningful User-Agent header which cannot be set from browser Fetch
 * (forbidden header). This controller adds the User-Agent server-side and forwards the request.
 * Complies with Nominatim usage policy (1 req/sec per IP) — frontend debounces at 400 ms.
 *
 * <p>Rate-limited to 10 requests per user per minute (per-user Bucket4j token bucket).
 *
 * <p>Endpoints:
 * <ul>
 *   <li>GET /api/geocode?q=&limit= — forward geocode (search by text)
 *   <li>GET /api/geocode/reverse?lat=&lon= — reverse geocode (lat/lon → address)
 * </ul>
 */
@RestController
@RequestMapping("/api/geocode")
public class GeocodingProxyController {

    private static final Logger log = LoggerFactory.getLogger(GeocodingProxyController.class);

    private final GeocodingService geocodingService;
    private final RateLimiterService rateLimiterService;

    public GeocodingProxyController(GeocodingService geocodingService,
                                    RateLimiterService rateLimiterService) {
        this.geocodingService = geocodingService;
        this.rateLimiterService = rateLimiterService;
    }

    /**
     * Forward geocode: search for places by text query.
     *
     * @param q     search text (required, 2–200 chars)
     * @param limit max results (1–10, default 5)
     */
    @GetMapping
    public ResponseEntity<?> search(
            JwtAuthenticationToken auth,
            @RequestParam String q,
            @RequestParam(defaultValue = "5") int limit) {

        String userId = UUID.fromString(auth.getToken().getSubject()).toString();
        if (!rateLimiterService.getGeocodingBucket(userId).tryConsume(1)) {
            return ResponseEntity.status(429).body(Map.of("error", "Rate limit exceeded"));
        }

        String trimmed = q == null ? "" : q.trim();
        if (trimmed.length() < 2 || trimmed.length() > 200) {
            return ResponseEntity.badRequest().body(Map.of("error", "q must be 2–200 characters"));
        }

        int effectiveLimit = Math.min(Math.max(limit, 1), 10);
        List<GeocodingService.PlaceResult> results = geocodingService.searchPlaces(trimmed, effectiveLimit);

        log.debug("GET /api/geocode q={} limit={} results={}", trimmed, effectiveLimit, results.size());
        return ResponseEntity.ok(results);
    }

    /**
     * Reverse geocode: get a display name + address for a lat/lon pair.
     */
    @GetMapping("/reverse")
    public ResponseEntity<?> reverse(
            JwtAuthenticationToken auth,
            @RequestParam double lat,
            @RequestParam double lon) {

        String userId = UUID.fromString(auth.getToken().getSubject()).toString();
        if (!rateLimiterService.getGeocodingBucket(userId).tryConsume(1)) {
            return ResponseEntity.status(429).body(Map.of("error", "Rate limit exceeded"));
        }

        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid lat/lon"));
        }

        GeocodingService.PlaceResult result = geocodingService.reverseGeocodePlace(lat, lon);
        if (result == null) {
            return ResponseEntity.ok(Map.of());
        }
        log.debug("GET /api/geocode/reverse lat={} lon={} display={}", lat, lon, result.display_name());
        return ResponseEntity.ok(result);
    }
}

package com.example.realestate.geo;

import com.example.realestate.listing.ListingService;
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
    private final ListingService listingService;

    public GeocodingProxyController(GeocodingService geocodingService,
                                    ListingService listingService) {
        this.geocodingService = geocodingService;
        this.listingService = listingService;
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

        if (!isAuthenticated(auth)) {
            return ResponseEntity.status(401).body(Map.of("error", "Authentication required"));
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

        if (!isAuthenticated(auth)) {
            return ResponseEntity.status(401).body(Map.of("error", "Authentication required"));
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

    private boolean isAuthenticated(JwtAuthenticationToken auth) {
        if (auth == null || auth.getToken() == null) return false;
        try {
            UUID.fromString(auth.getToken().getSubject());
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}

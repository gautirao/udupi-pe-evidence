package com.example.realestate.intelligence;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public (unauthenticated) buyer-facing area-intelligence API.
 *
 * <p>GET /api/trends/area-intelligence?city=X&areaKey=Y
 * <p>GET /api/trends/resolve-area?city=X&slug=Y
 *
 * <p>Declared public via {@code .requestMatchers(HttpMethod.GET, "/api/trends/**").permitAll()}
 * in {@link com.example.realestate.security.JwtConfig} — no JWT required.
 *
 * <p>Style mirrors {@link com.example.realestate.area.TrendsController}: blank params return 400;
 * missing/no-data rows return 200 with an UNAVAILABLE-shaped response (not 404).
 */
@RestController
@RequestMapping("/api/trends")
public class BuyerAreaIntelligenceController {

    private static final Logger log = LoggerFactory.getLogger(BuyerAreaIntelligenceController.class);

    private final BuyerAreaIntelligenceService buyerAreaIntelligenceService;

    public BuyerAreaIntelligenceController(BuyerAreaIntelligenceService buyerAreaIntelligenceService) {
        this.buyerAreaIntelligenceService = buyerAreaIntelligenceService;
    }

    /**
     * Returns buyer-facing area intelligence for the given city and area.
     *
     * <p>Both params are required. Returns 200 in all non-error cases, including when
     * no snapshot row exists — the response body signals unavailability via {@code available=false}.
     *
     * @param city    city slug (e.g. "udupi", "mangalore") — required, case-sensitive
     * @param areaKey pipe-delimited area key (e.g. IN|KA|Udupi|Manipal) — required
     * @return 200 with intelligence response; 400 if either param is blank
     */
    @GetMapping("/area-intelligence")
    public ResponseEntity<BuyerAreaIntelligenceResponse> getAreaIntelligence(
            @RequestParam String city,
            @RequestParam String areaKey) {

        if (city.isBlank()) {
            log.warn("GET /api/trends/area-intelligence rejected: blank city param");
            return ResponseEntity.badRequest().build();
        }
        if (areaKey.isBlank()) {
            log.warn("GET /api/trends/area-intelligence rejected: blank areaKey param");
            return ResponseEntity.badRequest().build();
        }

        log.debug("GET /api/trends/area-intelligence city={} areaKey={}", city, areaKey);
        BuyerAreaIntelligenceResponse response =
                buyerAreaIntelligenceService.getAreaIntelligence(city, areaKey);
        return ResponseEntity.ok(response);
    }

    /**
     * Resolves a buyer-friendly area slug to the full pipe-delimited area key.
     *
     * <p>Returns 200 in all non-error cases, including when no area matches the slug —
     * the response body signals no-match via {@code matched=false}.
     *
     * <p>Slug validation: lowercase ASCII letters, digits, and hyphens only (no leading,
     * trailing, or consecutive hyphens), length 1..128. Invalid slug pattern returns 400.
     * Blank or whitespace-only city or slug returns 400.
     *
     * @param city the city slug (e.g. "udupi") — required, non-blank
     * @param slug the area slug (e.g. "malpe-beach-road") — required, valid slug charset
     * @return 200 with resolve response; 400 if params are blank or slug has invalid charset
     */
    @GetMapping("/resolve-area")
    public ResponseEntity<ResolveAreaResponse> resolveArea(
            @RequestParam String city,
            @RequestParam String slug) {

        if (city.isBlank()) {
            log.warn("GET /api/trends/resolve-area rejected: blank city param");
            return ResponseEntity.badRequest().build();
        }
        if (slug.isBlank()) {
            log.warn("GET /api/trends/resolve-area rejected: blank slug param");
            return ResponseEntity.badRequest().build();
        }
        // Validate city: slug charset (lowercase letters, digits, hyphens), length 1..128
        if (city.length() > SLUG_MAX_LENGTH || !SLUG_PATTERN.matcher(city).matches()) {
            log.warn("GET /api/trends/resolve-area rejected: invalid city param city={}",
                    city.length() > 32 ? city.substring(0, 32) + "…" : city);
            return ResponseEntity.badRequest().build();
        }
        // Validate slug: lowercase ASCII letters, digits, hyphens, no lead/trail/consecutive hyphens, 1..128
        if (slug.length() > SLUG_MAX_LENGTH || !SLUG_PATTERN.matcher(slug).matches()) {
            log.warn("GET /api/trends/resolve-area rejected: invalid slug param slug={}",
                    slug.length() > 32 ? slug.substring(0, 32) + "…" : slug);
            return ResponseEntity.badRequest().build();
        }

        log.debug("GET /api/trends/resolve-area city={} slug={}", city, slug);
        ResolveAreaResponse response = buyerAreaIntelligenceService.resolveArea(city, slug);
        return ResponseEntity.ok(response);
    }

    /**
     * Slug pattern: lowercase ASCII letters, digits, and hyphens; no leading/trailing/consecutive
     * hyphens; length 1..128 characters.
     *
     * <p>Breakdown:
     * <ul>
     *   <li>{@code [a-z0-9]} — must start with letter or digit (no leading hyphen)</li>
     *   <li>{@code (?:[a-z0-9]|-(?=[a-z0-9]))*} — allows [a-z0-9] freely and hyphens only when
     *       the next char is alphanumeric (prevents trailing and consecutive hyphens)</li>
     *   <li>Total length enforced outside via a pre-check before the pattern.</li>
     * </ul>
     *
     * <p>Matches canonical output of {@link AreaSlug#slugify(String)}.
     */
    private static final java.util.regex.Pattern SLUG_PATTERN =
            java.util.regex.Pattern.compile("^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9]))*$");

    /** Maximum allowed length for city and slug parameters. */
    private static final int SLUG_MAX_LENGTH = 128;
}

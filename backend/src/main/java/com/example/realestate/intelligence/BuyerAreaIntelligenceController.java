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
}

package com.example.realestate.intelligence;

import com.example.realestate.security.CallerInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.Set;

/**
 * REST controller for the broker-facing area-insights API.
 *
 * <h3>Endpoint</h3>
 * {@code GET /api/broker/areas/{citySlug}/{areaKey}/insights}
 *
 * <h3>Security</h3>
 * <ul>
 *   <li>All endpoints require a valid JWT. In production, {@code oauth2ResourceServer} in
 *       JwtConfig returns 401 for a missing/invalid JWT. In {@code @WebMvcTest} the simplified
 *       TestConfig security filter (no oauth2ResourceServer) returns 403 for the no-JWT case —
 *       tests assert 403 to match the actual test-layer behaviour (consistent with
 *       BrokerDemandGapsControllerTest and BrokerMarketFocusControllerTest precedent).</li>
 *   <li>Requires broker, dealer, or admin role — "user" role is rejected with 403.</li>
 *   <li>{@code brokerId} is ALWAYS derived from the JWT via {@link CallerInfo#userId()}.
 *       No broker identity is accepted from the request (path, query, or body).
 *       The path carries only {@code citySlug} and {@code areaKey}.</li>
 * </ul>
 *
 * <h3>No SecurityConfig/JwtConfig edit required</h3>
 * {@code .anyRequest().authenticated()} in JwtConfig already gates these endpoints.
 * No permit-all override is added — all /api/broker/** require authentication.
 *
 * <p>Pattern mirrors {@link com.example.realestate.broker.demand.BrokerDemandGapsController}
 * verbatim for the role-gate and identity-resolution contract.
 */
@RestController
@RequestMapping("/api/broker/areas")
public class BrokerAreaInsightsController {

    private static final Logger log = LoggerFactory.getLogger(BrokerAreaInsightsController.class);

    /** Roles permitted to access broker area-insights endpoints (mirrors BrokerDemandGapsController). */
    private static final Set<String> BROKER_ROLES = Set.of("broker", "dealer", "admin");

    private final BrokerAreaInsightsService service;

    public BrokerAreaInsightsController(BrokerAreaInsightsService service) {
        this.service = service;
    }

    /**
     * Returns broker-facing area insights for the given city/area pair.
     *
     * <p>The caller's identity is resolved from the JWT ({@link CallerInfo#userId()}).
     * No broker id is read from the path, query, or body — the path carries only
     * {@code citySlug} and {@code areaKey} to identify the area.
     *
     * <p>A missing area snapshot returns 200 with {@code available=false} (not 404).
     * Broker-scoped counts are always present as primitive ints (0 = true zero).
     *
     * @param citySlug city slug (e.g. "udupi", "mangalore") — identifies the city
     * @param areaKey  area key (e.g. "IN|KA|Udupi|Malpe") — identifies the area
     * @param caller   resolved caller identity from JWT — brokerId = caller.userId()
     * @return 200 with insights response; 403 for non-broker roles; 401 when no JWT (production)
     */
    @GetMapping("/{citySlug}/{areaKey}/insights")
    public ResponseEntity<BrokerAreaInsightsResponse> getAreaInsights(
            @PathVariable String citySlug,
            @PathVariable String areaKey,
            CallerInfo caller) {

        requireBrokerRole(caller);
        log.debug("GET /api/broker/areas/{}/{}/insights userId={}", citySlug, areaKey, caller.userId());

        BrokerAreaInsightsResponse response = service.getAreaInsights(citySlug, areaKey, caller.userId());
        return ResponseEntity.ok(response);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Enforces that the caller has a broker, dealer, or admin role.
     * Mirrors {@code BrokerDemandGapsController.requireBrokerRole} verbatim.
     *
     * @throws ResponseStatusException 403 when caller.role() is not in BROKER_ROLES
     */
    private static void requireBrokerRole(CallerInfo caller) {
        if (!BROKER_ROLES.contains(caller.role())) {
            log.warn("area-insights role gate userId={} role={}", caller.userId(), caller.role());
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Requires broker, dealer, or admin role");
        }
    }
}

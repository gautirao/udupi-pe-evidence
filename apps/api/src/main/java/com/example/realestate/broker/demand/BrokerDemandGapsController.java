package com.example.realestate.broker.demand;

import com.example.realestate.security.CallerInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * REST controller for the broker-facing demand-gaps API.
 *
 * <h3>Endpoints</h3>
 * <ul>
 *   <li>{@code GET  /api/broker/demand-gaps}           — full page payload (summary, topGaps, allGaps, captureDemandListings)</li>
 *   <li>{@code GET  /api/broker/alerts?status=open|all} — broker's gap alert list</li>
 *   <li>{@code POST /api/broker/alerts/{id}/read}       — mark gap as read (idempotent, ownership-checked)</li>
 *   <li>{@code POST /api/broker/alerts/{id}/dismiss}    — dismiss gap (idempotent, ownership-checked)</li>
 * </ul>
 *
 * <h3>Security</h3>
 * <ul>
 *   <li>All endpoints require a valid JWT. In production, {@code oauth2ResourceServer} in
 *       JwtConfig returns 401 for a missing/invalid JWT. In {@code @WebMvcTest} the simplified
 *       TestConfig security filter (no oauth2ResourceServer) returns 403 for the no-JWT case —
 *       tests assert 403 to match the actual test-layer behaviour (consistent with the
 *       BrokerMarketFocusControllerTest precedent).</li>
 *   <li>Requires broker, dealer, or admin role — "user" role is rejected with 403.</li>
 *   <li>broker_id is always derived from the JWT via {@link CallerInfo#userId()}.
 *       No broker identity is accepted from the request (path, query, or body).</li>
 *   <li>IDOR: /alerts/{id}/read and /alerts/{id}/dismiss enforce load-then-verify-owner
 *       in {@link BrokerDemandGapsService}. A broker cannot act on another broker's state row.</li>
 * </ul>
 *
 * <h3>No SecurityConfig/JwtConfig edit required</h3>
 * {@code .anyRequest().authenticated()} in JwtConfig already gates these endpoints.
 * No permit-all override is added — all /api/broker/** require authentication.
 */
@RestController
@RequestMapping("/api/broker")
public class BrokerDemandGapsController {

    private static final Logger log = LoggerFactory.getLogger(BrokerDemandGapsController.class);

    /** Roles permitted to access broker demand-gaps endpoints (mirrors BrokerMarketFocusController). */
    private static final Set<String> BROKER_ROLES = Set.of("broker", "dealer", "admin");

    private static final String DEFAULT_ALERT_STATUS = "open";

    private final BrokerDemandGapsService service;

    public BrokerDemandGapsController(BrokerDemandGapsService service) {
        this.service = service;
    }

    // -----------------------------------------------------------------------
    // GET /api/broker/demand-gaps
    // -----------------------------------------------------------------------

    /**
     * Returns the full demand-gaps page payload for the calling broker.
     *
     * <p>Derived read-only from area_demand_signal × LIVE supply × broker_market_focus
     * (optional, with broker-LIVE-bucket fallback) × broker_demand_gap_state.
     * Dismissed gaps are excluded. Auto-resolve is derived visibility only.
     *
     * @return 200 OK with page payload; 403 for non-broker roles; 401 when no JWT
     */
    @GetMapping("/demand-gaps")
    public ResponseEntity<BrokerDemandGapsResponse> getDemandGaps(CallerInfo caller) {
        requireBrokerRole(caller);
        log.debug("GET /api/broker/demand-gaps userId={}", caller.userId());
        BrokerDemandGapsResponse response = service.getDemandGaps(caller.userId());
        return ResponseEntity.ok(response);
    }

    // -----------------------------------------------------------------------
    // GET /api/broker/alerts?status=open|all
    // -----------------------------------------------------------------------

    /**
     * Returns the broker's gap alert list.
     *
     * @param status "open" (default, non-dismissed) or "all" (includes dismissed)
     * @return 200 OK with list of gap items; 400 if status is invalid; 403 for non-broker
     */
    @GetMapping("/alerts")
    public ResponseEntity<List<BrokerDemandGapsResponse.GapItem>> getAlerts(
            CallerInfo caller,
            @RequestParam(defaultValue = "open") String status) {

        requireBrokerRole(caller);

        if (!"open".equalsIgnoreCase(status) && !"all".equalsIgnoreCase(status)) {
            log.warn("GET /api/broker/alerts rejected: invalid status={} userId={}", status, caller.userId());
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "status must be 'open' or 'all'");
        }

        log.debug("GET /api/broker/alerts userId={} status={}", caller.userId(), status);
        List<BrokerDemandGapsResponse.GapItem> items = service.getAlerts(caller.userId(), status);
        return ResponseEntity.ok(items);
    }

    // -----------------------------------------------------------------------
    // POST /api/broker/alerts/{id}/read
    // -----------------------------------------------------------------------

    /**
     * Marks a demand-gap state row as read. Idempotent — re-calling is a no-op.
     *
     * <p>Ownership is enforced in the service via load-then-verify-owner (the state row
     * is loaded by id AND broker_id from the JWT). A broker cannot mark another broker's
     * gap as read. Returns 404 when the state row does not exist or is not owned by
     * the caller (no enumeration of other brokers' rows).
     *
     * @param id path variable — the broker_demand_gap_state.id UUID
     * @return 204 No Content on success; 404 when not found / not owned; 403 for non-broker
     */
    @PostMapping("/alerts/{id}/read")
    public ResponseEntity<Void> markRead(CallerInfo caller, @PathVariable UUID id) {
        requireBrokerRole(caller);
        log.debug("POST /api/broker/alerts/{}/read userId={}", id, caller.userId());
        service.markRead(id, caller.userId());
        return ResponseEntity.noContent().build();
    }

    // -----------------------------------------------------------------------
    // POST /api/broker/alerts/{id}/dismiss
    // -----------------------------------------------------------------------

    /**
     * Dismisses a demand-gap state row. Idempotent — re-calling updates dismissed_at
     * but the bucket remains suppressed from the open payload.
     *
     * <p>Ownership is enforced in the service via load-then-verify-owner. Returns 404
     * when the state row does not exist or is not owned by the caller.
     *
     * @param id path variable — the broker_demand_gap_state.id UUID
     * @return 204 No Content on success; 404 when not found / not owned; 403 for non-broker
     */
    @PostMapping("/alerts/{id}/dismiss")
    public ResponseEntity<Void> dismiss(CallerInfo caller, @PathVariable UUID id) {
        requireBrokerRole(caller);
        log.debug("POST /api/broker/alerts/{}/dismiss userId={}", id, caller.userId());
        service.dismiss(id, caller.userId());
        return ResponseEntity.noContent().build();
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private static void requireBrokerRole(CallerInfo caller) {
        if (!BROKER_ROLES.contains(caller.role())) {
            log.warn("demand-gaps role gate userId={} role={}", caller.userId(), caller.role());
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Requires broker, dealer, or admin role");
        }
    }
}

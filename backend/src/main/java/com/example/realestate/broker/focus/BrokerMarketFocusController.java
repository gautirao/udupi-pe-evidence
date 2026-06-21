package com.example.realestate.broker.focus;

import com.example.realestate.security.CallerInfo;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * REST controller for the broker market-focus feature.
 *
 * <h3>Endpoints</h3>
 * <ul>
 *   <li>{@code GET  /api/broker/market-focus}       — list all focus rows for the caller</li>
 *   <li>{@code POST /api/broker/market-focus}       — add a manual focus tuple</li>
 *   <li>{@code DELETE /api/broker/market-focus}     — remove a focus tuple</li>
 *   <li>{@code POST /api/broker/market-focus/seed}  — seed focus from LIVE listings</li>
 * </ul>
 *
 * <h3>Security</h3>
 * <ul>
 *   <li>Requires a valid JWT — {@link com.example.realestate.security.CallerInfoResolver}
 *       returns 401 when no JWT is present.</li>
 *   <li>Requires broker, dealer, or admin role — "user" role is rejected with 403.</li>
 *   <li>Owner identity is always derived from the JWT; no identity parameter is accepted
 *       from the request (see {@link BrokerMarketFocusService}).</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/broker/market-focus")
public class BrokerMarketFocusController {

    private static final Logger log = LoggerFactory.getLogger(BrokerMarketFocusController.class);

    /** Roles permitted to access broker market-focus endpoints. */
    private static final Set<String> BROKER_ROLES = Set.of("broker", "dealer", "admin");

    private final BrokerMarketFocusService service;

    public BrokerMarketFocusController(BrokerMarketFocusService service) {
        this.service = service;
    }

    // -----------------------------------------------------------------------
    // GET /api/broker/market-focus
    // -----------------------------------------------------------------------

    /**
     * Returns all market-focus rows for the calling broker.
     * Ownership is enforced in {@link BrokerMarketFocusService#listFocus} at the SQL layer.
     *
     * @return 200 OK with list (empty list when none exist); 403 for non-broker roles
     */
    @GetMapping
    public ResponseEntity<List<BrokerMarketFocusRow>> listFocus(CallerInfo caller) {
        requireBrokerRole(caller);
        log.debug("GET /api/broker/market-focus userId={}", caller.userId());
        List<BrokerMarketFocusRow> rows = service.listFocus(caller.userId());
        return ResponseEntity.ok(rows);
    }

    // -----------------------------------------------------------------------
    // POST /api/broker/market-focus
    // -----------------------------------------------------------------------

    /**
     * Adds a manual focus tuple for the calling broker.
     * Re-adding an existing tuple is a no-op (idempotent — 204 either way).
     *
     * @return 204 No Content on success (whether inserted or already existed); 403 for non-broker
     */
    @PostMapping
    public ResponseEntity<Void> addFocus(CallerInfo caller,
                                         @Valid @RequestBody AddFocusRequest request) {
        requireBrokerRole(caller);
        log.debug("POST /api/broker/market-focus userId={} areaKey={}",
                caller.userId(), request.areaKey());
        service.addFocus(caller.userId(), request);
        return ResponseEntity.noContent().build();
    }

    // -----------------------------------------------------------------------
    // DELETE /api/broker/market-focus
    // -----------------------------------------------------------------------

    /**
     * Removes a focus tuple belonging to the calling broker.
     * A broker cannot remove another broker's row — the service enforces ownership
     * in the DELETE SQL and throws 404 if no matching row is found for this caller.
     *
     * @return 204 No Content on success; 404 if not found (or owned by another broker); 403 for non-broker
     */
    @DeleteMapping
    public ResponseEntity<Void> removeFocus(CallerInfo caller,
                                             @Valid @RequestBody RemoveFocusRequest request) {
        requireBrokerRole(caller);
        log.debug("DELETE /api/broker/market-focus userId={} citySlug={} areaKey={}",
                caller.userId(), request.citySlug(), request.areaKey());
        service.removeFocus(caller.userId(), request);
        return ResponseEntity.noContent().build();
    }

    // -----------------------------------------------------------------------
    // POST /api/broker/market-focus/seed
    // -----------------------------------------------------------------------

    /**
     * Seeds focus rows from the calling broker's LIVE listings.
     * Idempotent: re-running produces no duplicates and never clobbers source='manual' rows.
     *
     * @return 200 OK with {@code {"inserted": N}} — 0 when already up-to-date or no LIVE listings
     */
    @PostMapping("/seed")
    public ResponseEntity<Map<String, Integer>> seedFocus(CallerInfo caller) {
        requireBrokerRole(caller);
        log.debug("POST /api/broker/market-focus/seed userId={}", caller.userId());
        int inserted = service.seedFocus(caller.userId());
        return ResponseEntity.ok(Map.of("inserted", inserted));
    }

    // -----------------------------------------------------------------------
    // Private helpers
    // -----------------------------------------------------------------------

    private static void requireBrokerRole(CallerInfo caller) {
        if (!BROKER_ROLES.contains(caller.role())) {
            log.warn("market-focus role gate userId={} role={}", caller.userId(), caller.role());
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Requires broker, dealer, or admin role");
        }
    }
}

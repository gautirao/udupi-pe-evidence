package com.example.realestate.discover.event;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public anonymous ingest endpoint for discover_event telemetry.
 *
 * <p>Declared public (no auth required) in {@link com.example.realestate.security.JwtConfig}.
 *
 * <p><strong>PII log contract:</strong>
 * <ul>
 *   <li>The request body is NEVER logged.</li>
 *   <li>Client IP, X-Forwarded-For, and User-Agent are NEVER read or logged.</li>
 *   <li>session_id is NEVER logged (only a length-8 prefix may appear in rate-limit
 *       warnings, emitted by {@link DiscoverEventService}, not here).</li>
 * </ul>
 * All validation and persistence is delegated to {@link DiscoverEventService}.
 */
@RestController
@RequestMapping("/api/discover/events")
public class DiscoverEventController {

    private static final Logger log = LoggerFactory.getLogger(DiscoverEventController.class);

    private final DiscoverEventService discoverEventService;

    public DiscoverEventController(DiscoverEventService discoverEventService) {
        this.discoverEventService = discoverEventService;
    }

    /**
     * Accepts a batch of anonymous discover events.
     *
     * <p>POST /api/discover/events — no authentication required.
     *
     * <p>Returns 202 Accepted (not 200 OK) because the client does not need a
     * synchronous confirmation of persistence beyond "we received it".
     *
     * @param request batch of events; see {@link DiscoverEventAllowList} for constraints
     * @return 202 with accepted count; 400/413/429 on validation/rate-limit failure
     */
    @PostMapping
    public ResponseEntity<DiscoverEventResponse> ingest(@RequestBody DiscoverEventRequest request) {
        int accepted = discoverEventService.ingestBatch(request);
        return ResponseEntity.accepted().body(new DiscoverEventResponse(accepted));
    }
}

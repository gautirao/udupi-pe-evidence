package com.example.realestate.broker;

import com.example.realestate.broker.dto.ListingQualityResponse;
import com.example.realestate.quality.ListingQualityService;
import com.example.realestate.security.CallerInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.util.Set;

/**
 * GET /api/broker/listing-quality
 *
 * <p>Returns per-listing quality data for the calling broker's own non-archived listings.
 *
 * <h3>Security</h3>
 * <ul>
 *   <li>Requires a valid JWT — {@link com.example.realestate.security.CallerInfoResolver}
 *       returns 401 when no JWT is present.</li>
 *   <li>Requires broker, dealer, or admin role — this endpoint explicitly rejects the
 *       "user" role with 403, because {@code CallerInfoResolver.ALLOWED_ROLES} includes
 *       "user" and the resolver alone is not sufficient.</li>
 *   <li>Ownership boundary is enforced in {@link ListingQualityService#getQualityPage}
 *       via the {@code created_by} predicate in the repository query — no identity
 *       parameter is accepted from the request.</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/broker")
public class ListingQualityController {

    private static final Logger log = LoggerFactory.getLogger(ListingQualityController.class);

    /** Roles allowed to access broker-facing quality endpoints. */
    private static final Set<String> BROKER_ROLES = Set.of("broker", "dealer", "admin");

    private final ListingQualityService listingQualityService;

    public ListingQualityController(ListingQualityService listingQualityService) {
        this.listingQualityService = listingQualityService;
    }

    /**
     * Returns quality data for all non-archived listings owned by the calling broker.
     *
     * <p>No request parameters accepted. Owner identity is derived exclusively from
     * the JWT via {@link CallerInfo#userId()}.
     *
     * @param caller Resolved from JWT by {@link com.example.realestate.security.CallerInfoResolver}.
     * @return 200 OK with {@link ListingQualityResponse}; 403 if role is not broker/dealer/admin.
     */
    @GetMapping("/listing-quality")
    public ResponseEntity<ListingQualityResponse> getListingQuality(CallerInfo caller) {
        if (!BROKER_ROLES.contains(caller.role())) {
            log.warn("GET /api/broker/listing-quality -> 403 userId={} role={}",
                    caller.userId(), caller.role());
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Requires broker, dealer, or admin role");
        }

        log.debug("GET /api/broker/listing-quality userId={} role={}", caller.userId(), caller.role());
        ListingQualityResponse response = listingQualityService.getQualityPage(caller.userId());
        return ResponseEntity.ok(response);
    }
}

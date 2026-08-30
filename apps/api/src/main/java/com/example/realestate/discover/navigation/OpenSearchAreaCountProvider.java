package com.example.realestate.discover.navigation;

import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * NON-BLOCKING stub {@link AreaCountProvider} (#1955 Areas PR A, SLICE 2e, AC12). No OpenSearch
 * hierarchy/count index or reindex exists yet — this bean exists purely so the wiring shape
 * mirrors {@code RoutingDiscoverSummaryService}'s {@code openSearchSummaryAdapter} precedent
 * (always compiles + is injectable via its qualifier bean name; never REQUIRED by any consumer).
 *
 * <p>Guarded at the CALL SITE, not here: {@link AreaCountRollupService} only ever invokes this
 * bean when {@code discover.opensearch.enabled=true} AND it was actually autowired (it is always
 * registered as a Spring bean regardless of that flag, exactly like {@code
 * RoutingDiscoverSummaryService}'s dormant OpenSearch seam). Since {@code
 * discover.opensearch.enabled} defaults to {@code false} repo-wide, {@link #countsByAreaKey} is
 * unreachable in every current deployment; it throws rather than silently returning an empty/zero
 * map so a future flip of the flag fails LOUDLY instead of masking as "every area has zero
 * listings".
 */
@Component("openSearchAreaCountProvider")
public class OpenSearchAreaCountProvider implements AreaCountProvider {

    @Override
    public Map<String, Long> countsByAreaKey(AreaCountQuery query) {
        throw new UnsupportedOperationException(
                "OpenSearchAreaCountProvider is a non-blocking stub (#1955 Areas PR A) — no OpenSearch "
                        + "hierarchy/count index exists yet. discover.opensearch.enabled must stay false.");
    }
}

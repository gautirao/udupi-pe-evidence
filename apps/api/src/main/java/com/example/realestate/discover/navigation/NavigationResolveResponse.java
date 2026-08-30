package com.example.realestate.discover.navigation;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Response body for {@code GET /api/discover/cities/{city}/navigation/resolve?node=<key>} (#1956
 * AC18). {@code node} is the FULL inlined {@link NavigationNodeResponse} for whatever {@code
 * resolution} resolved to — deliberately never a bare reference requiring a follow-up {@code
 * NavigationController#getNode} call, so a client with a possibly-stale held key gets a working
 * node in exactly one round trip.
 *
 * @param requested   the client-supplied {@code node} query value, verbatim (even when stale)
 * @param resolution  how {@code requested} mapped onto the current active graph
 * @param node        the full structural node body for the resolved node — never {@code null}
 *                     for a city with an active hierarchy; {@link NavigationResolution#CITY_ROOT}
 *                     always resolves to the synthetic {@code "root"} node
 * @param revisionId  the production revision this snapshot was built from
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record NavigationResolveResponse(
        String requested,
        NavigationResolution resolution,
        NavigationNodeResponse node,
        long revisionId
) {
}

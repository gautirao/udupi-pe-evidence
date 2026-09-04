package com.example.realestate.savedsearch;

import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.stream.Collectors;

/**
 * Computes a stable fingerprint for a saved search's (citySlug, resultScopeKind, scope
 * payload, filters) tuple. Used for idempotent create (a repeat create of an equivalent
 * search returns the existing row instead of duplicating it) and for the unique
 * {@code (user_id, fingerprint)} database index.
 *
 * <p>Stability rules:
 * <ul>
 *   <li>Map keys (filters, and the top-level envelope) are sorted so key order in the
 *       request never affects the fingerprint.
 *   <li>AREA_SET's {@code areaKeys} are sorted so selection order never affects it.
 *   <li>VIEWPORT bounds are rounded to 6 decimal places (~11cm) before hashing, matching
 *       the precision {@code BboxParser}-style validation already operates at.
 *   <li>POLYGON vertices are rounded to 6 decimal places but are deliberately NOT
 *       reordered — a rotated or reflected polygon that encloses the same area produces a
 *       different fingerprint. Rotation/reflection invariance is out of scope for this
 *       slice; see the PR's "Owner decisions taken (reversible)" section.
 * </ul>
 *
 * <p>Package-private: this is an internal implementation detail of the saved-search
 * service, not a reusable public utility.
 */
final class SavedSearchFingerprint {

    private static final ObjectMapper MAPPER =
            new ObjectMapper().configure(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY, true);

    private SavedSearchFingerprint() {
    }

    static String compute(
            String citySlug,
            ResultScopeKind resultScopeKind,
            List<String> areaKeys,
            List<List<Double>> polygon,
            Double viewportSouth,
            Double viewportWest,
            Double viewportNorth,
            Double viewportEast,
            Map<String, Object> filters) {
        Map<String, Object> envelope = new TreeMap<>();
        envelope.put("citySlug", citySlug);
        envelope.put("resultScopeKind", resultScopeKind.name());
        envelope.put("scope", scopePayload(resultScopeKind, areaKeys, polygon, viewportSouth, viewportWest, viewportNorth, viewportEast));
        envelope.put("filters", new TreeMap<>(filters));

        try {
            byte[] canonicalJson = MAPPER.writeValueAsBytes(envelope);
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(canonicalJson);
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            // SHA-256 is a JDK-guaranteed algorithm; this is unreachable in practice.
            throw new IllegalStateException("SHA-256 unavailable", e);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize saved-search fingerprint payload", e);
        }
    }

    private static Map<String, Object> scopePayload(
            ResultScopeKind resultScopeKind,
            List<String> areaKeys,
            List<List<Double>> polygon,
            Double viewportSouth,
            Double viewportWest,
            Double viewportNorth,
            Double viewportEast) {
        Map<String, Object> scope = new LinkedHashMap<>();
        switch (resultScopeKind) {
            case AREA_SET -> {
                List<String> sorted = areaKeys.stream().sorted().collect(Collectors.toCollection(ArrayList::new));
                scope.put("areaKeys", sorted);
            }
            case POLYGON -> {
                List<List<Double>> rounded =
                        polygon.stream()
                                .map(vertex -> List.of(round(vertex.get(0)), round(vertex.get(1))))
                                .collect(Collectors.toCollection(ArrayList::new));
                scope.put("polygon", rounded);
            }
            case VIEWPORT -> {
                scope.put("south", round(viewportSouth));
                scope.put("west", round(viewportWest));
                scope.put("north", round(viewportNorth));
                scope.put("east", round(viewportEast));
            }
        }
        return scope;
    }

    private static double round(double value) {
        return Math.round(value * 1_000_000.0) / 1_000_000.0;
    }
}

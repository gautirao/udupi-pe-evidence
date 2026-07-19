package com.example.realestate.discover;

import org.springframework.jdbc.core.JdbcOperations;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Shared active-city gate for read paths that have NO existing {@code cities} join to piggyback
 * a {@code c.is_active = true} predicate on (#1935).
 *
 * <p>For every OTHER read path (one that already joins {@code cities} or reaches it via
 * {@code areas.city_id}), the {@code is_active} predicate is added inline to the existing join —
 * that makes an inactive city fall into the SAME code branch as a missing/unknown city, so no
 * separate guard call is needed there. This component exists ONLY for the paths that have no such
 * join (e.g. {@code regional_area_classifications.city_key}, or a denormalized read model keyed
 * by area_key/city slug with no FK to {@code cities}) — callers must invoke it BEFORE reading the
 * denormalized model and short-circuit to the SAME response an unknown city/area yields.
 */
@Component
public class CityActivationGuard {

    private final JdbcOperations jdbcOperations;

    public CityActivationGuard(JdbcOperations jdbcOperations) {
        this.jdbcOperations = jdbcOperations;
    }

    /**
     * Returns {@code true} iff {@code slug} (case-insensitive) identifies an active city.
     * Null/blank input always returns {@code false} (never active).
     */
    public boolean isActiveCitySlug(String slug) {
        if (slug == null || slug.isBlank()) {
            return false;
        }
        Boolean result = jdbcOperations.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM cities WHERE lower(slug) = lower(?) AND is_active = true)",
                Boolean.class,
                slug);
        return Boolean.TRUE.equals(result);
    }

    /**
     * Returns {@code true} iff {@code areaKey} resolves to a canonical {@code areas} row whose
     * owning city is active — the canonical {@code areas -> cities} relationship (PR review
     * fix, #1935), not a string-split heuristic on the area_key's district segment. This also
     * means an {@code areaKey} that does not resolve to any {@code areas} row (orphan/malformed)
     * fails closed exactly like an inactive city does. Null/blank input always returns
     * {@code false}.
     */
    public boolean isActiveForAreaKey(String areaKey) {
        if (areaKey == null || areaKey.isBlank()) {
            return false;
        }
        Boolean result = jdbcOperations.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM areas a JOIN cities c ON c.id = a.city_id "
                        + "WHERE a.area_key = ? AND c.is_active = true)",
                Boolean.class,
                areaKey);
        return Boolean.TRUE.equals(result);
    }

    /**
     * Returns the immutable set of {@code area_key} values belonging to active areas of the
     * city identified by {@code citySlug} — the OpenSearch-path equivalent of the {@code
     * areas -> cities} subselect in {@link DiscoverListingPredicateBuilder#build}, mirrored
     * EXACTLY so both read paths enforce the identical active-city invariant keyed on the
     * same (always-populated) field.
     *
     * <p>Null/blank {@code citySlug} returns an empty immutable set without querying the
     * database — mirrors the Postgres builder, which requires a city and yields nothing
     * without one.
     *
     * <p>This is a LIVE, uncached read executed once per request. A {@link
     * org.springframework.dao.DataAccessException} thrown by the JDBC call is NOT caught here —
     * it propagates to the caller so the OpenSearch adapter's existing failure handling falls
     * back to the (independently gated) Postgres path, rather than silently returning an
     * empty/all-docs result that would mask a DB failure as a legitimate "no active areas"
     * answer.
     */
    public Set<String> activeAreaKeysForCity(String citySlug) {
        if (citySlug == null || citySlug.isBlank()) {
            return Collections.emptySet();
        }
        List<String> areaKeys = jdbcOperations.queryForList(
                "SELECT a.area_key FROM areas a JOIN cities c ON c.id = a.city_id "
                        + "WHERE c.slug = ? AND c.is_active = true",
                String.class,
                citySlug);
        return Collections.unmodifiableSet(new LinkedHashSet<>(areaKeys));
    }
}

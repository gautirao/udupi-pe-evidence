package com.example.realestate.discover;

import com.example.realestate.discover.citylaunch.SandboxAgriDestinationClassification;
import com.example.realestate.discover.citylaunch.SandboxAgriDestinationClassificationRepository;
import com.example.realestate.discover.citylaunch.SandboxArea;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * Generates the revision-scoped Agricultural destination direction/distance classification for one
 * {@link com.example.realestate.discover.citylaunch.CityLaunchRevision} (#2151 PR A, decision.d2).
 *
 * <p>Deliberately co-located in {@code com.example.realestate.discover} — the SAME package as
 * {@link RegionalGeo} — so this generator can call {@link RegionalGeo}'s package-private haversine/
 * bearing/direction/band helpers directly, without widening {@link RegionalGeo}'s visibility (it
 * stays a package-private, static-method-only utility class exactly as {@link
 * RegionalClassificationBackfillService} already relies on it).
 *
 * <p>For each ACTIVE area with non-null {@code geo_center_lat}/{@code geo_center_lon} in the
 * CAPTURED revision area input the caller supplies (see {@link #generateAndStoreForRevision}),
 * computes the great-circle distance and initial bearing from the supplied city origin (see class
 * javadoc on {@code originLat}/{@code originLon} below), maps them to a direction_key/
 * distance_band_key via {@link RegionalGeo}, and persists one {@link
 * SandboxAgriDestinationClassification} row per area.
 *
 * <h2>Snapshot consistency (correctness fix, #2151 PR A)</h2>
 * This generator deliberately does NOT run its own SQL read of {@code public.areas}. It used to —
 * an {@code AREAS_FOR_CITY_SQL} query scoped by {@code cityId} — but {@code
 * CityLaunchGraphWriter#writeGraphTransactional} already reads canonical geography ONCE (via {@code
 * CanonicalGeographyReader#loadGeography}) and writes it into {@code sandbox_areas} BEFORE calling
 * this generator. Under PostgreSQL READ COMMITTED, being inside the SAME {@code @Transactional}
 * method does NOT guarantee the same snapshot across statements — each statement takes a fresh
 * snapshot — so a second, independent {@code SELECT ... FROM public.areas} here could observe a
 * DIFFERENT snapshot than the one {@code sandbox_areas} was written from (a concurrent area
 * status/coordinate change lands in the gap between the two reads). That would let {@code
 * sandbox_areas} and {@code sandbox_agri_destination_classification} for the SAME revision disagree
 * about an area's status/coordinates, and the checksum computed over both tables would bind that
 * inconsistent pair without detecting it. Consuming the ALREADY-CAPTURED {@code List<SandboxArea>}
 * the caller just persisted (or is about to persist) closes that gap: there is only ever ONE read of
 * area geometry per revision, and every sandbox table derived from it is guaranteed consistent by
 * construction.
 *
 * <h2>Determinism &amp; idempotency</h2>
 * <ul>
 *   <li>The captured area list is explicitly sorted by {@code area_key} before use (see
 *       {@link #generateAndStoreForRevision}) — the in-memory equivalent of the old query's stable
 *       {@code ORDER BY area_key} — so two runs over unchanged input always produce rows in the
 *       same order, regardless of the iteration order the caller's list happens to arrive in.</li>
 *   <li>No {@code HashMap} (or any other unordered structure) is used to accumulate rows — a plain
 *       {@link ArrayList}, appended to in the sorted area_key order above.</li>
 *   <li>{@code generatedAt} is the ONLY column that varies run-to-run for otherwise-unchanged input
 *       — it is never folded into {@link com.example.realestate.discover.citylaunch.RevisionChecksum}'s
 *       digest (see that class), so it never affects checksum determinism.</li>
 *   <li>{@link #generateAndStoreForRevision} clears any prior sandbox rows for the SAME
 *       {@code revisionId} before writing (via {@link
 *       SandboxAgriDestinationClassificationRepository#deleteByRevisionId}) — a defensive
 *       regeneration safety net mirroring {@code SandboxNavigationNodeRepository
 *       #deleteByRevisionId}, so a rerun for the same revision can never leave an orphaned row for
 *       an area that has since dropped out of scope (renamed, merged, made INACTIVE, or its
 *       coordinates cleared). The production-table equivalent (an area renamed/merged between
 *       prepare and a LATER launch) is closed at promotion time by {@code
 *       CityLaunchPromotionService#promoteAgriDestinationClassification}'s REPLACE discipline, not
 *       here.</li>
 * </ul>
 *
 * <h2>Origin precondition</h2>
 * The caller ({@code CityLaunchGraphWriter#validate}) is responsible for verifying the city's
 * {@code geo_center_lat}/{@code geo_center_lon} are non-null and non-zero BEFORE calling this
 * method (AC3) — this class trusts the {@code originLat}/{@code originLon} it is given and does not
 * re-validate them, so that the hard-fail precondition lives in exactly ONE place, checked before
 * ANY sandbox row (of any of the eight tables) is written.
 */
@Service
public class AgriDestinationClassificationGenerator {

    /**
     * Provenance tag stamped into every generated row's {@code generator_version} column
     * (decision.d2 required_columns item (d)). Bump this string whenever the generation algorithm
     * (not merely input data) changes in a way an operator should be able to see per-row.
     */
    static final String GENERATOR_VERSION = "agri-destination-classification-v1";

    /**
     * The in-memory equivalent of the old {@code AREAS_FOR_CITY_SQL}'s {@code WHERE} clause,
     * replicated EXACTLY (correctness fix, #2151 PR A) — every {@link SandboxArea} in the caller's
     * captured revision input must pass all three of these predicates to be classified:
     * {@code lifecycle_status = 'ACTIVE'}, non-null {@code geo_center_lat}, non-null
     * {@code geo_center_lon}. (The old SQL carried no additional {@code area_key} shape filter, so
     * none is replicated here either.)
     */
    private static boolean inScope(SandboxArea area) {
        return "ACTIVE".equals(area.getLifecycleStatus())
                && area.getGeoCenterLat() != null
                && area.getGeoCenterLon() != null;
    }

    private final SandboxAgriDestinationClassificationRepository sandboxRepository;

    public AgriDestinationClassificationGenerator(
            SandboxAgriDestinationClassificationRepository sandboxRepository) {
        this.sandboxRepository = sandboxRepository;
    }

    /**
     * Generates and persists the Agricultural destination classification for every in-scope area
     * of {@code capturedAreas}, scoped to {@code revisionId}. Returns the saved rows in the SAME
     * (area_key-ascending) order they were computed and persisted, for the caller to pass straight
     * into {@code RevisionChecksum.compute(...)} without a re-sort.
     *
     * @param revisionId     the revision to scope generated rows to
     * @param capturedAreas  the SAME already-captured revision area input the caller wrote into
     *                       {@code sandbox_areas} for this revision (typically {@code
     *                       CityLaunchGraphWriter}'s {@code savedAreas}) — NEVER re-queried from
     *                       {@code public.areas} here (see class javadoc "Snapshot consistency"),
     *                       so this generator's output can never disagree with {@code
     *                       sandbox_areas} about which areas exist or what their status/coordinates
     *                       are. Filtered to ACTIVE + non-null coordinates via {@link #inScope}.
     * @param originLat      the city's {@code geo_center_lat}, ALREADY validated non-null/non-zero
     *                       by the caller (AC3)
     * @param originLon      the city's {@code geo_center_lon}, ALREADY validated non-null/non-zero
     *                       by the caller (AC3)
     * @param generatedAt    timestamp to stamp on every row; NOT checksum-relevant (see class
     *                       javadoc)
     */
    @Transactional
    public List<SandboxAgriDestinationClassification> generateAndStoreForRevision(
            Long revisionId, List<SandboxArea> capturedAreas, double originLat, double originLon,
            Instant generatedAt) {
        // Defensive regeneration safety net — see class javadoc "Determinism & idempotency".
        sandboxRepository.deleteByRevisionId(revisionId);

        List<SandboxArea> areas = capturedAreas.stream()
                .filter(AgriDestinationClassificationGenerator::inScope)
                .sorted(Comparator.comparing(
                        SandboxArea::getAreaKey, Comparator.nullsFirst(Comparator.naturalOrder())))
                .toList();

        List<SandboxAgriDestinationClassification> saved = new ArrayList<>(areas.size());
        for (SandboxArea area : areas) {
            double lat = area.getGeoCenterLat();
            double lon = area.getGeoCenterLon();
            double distanceKm = RegionalGeo.haversineKm(originLat, originLon, lat, lon);
            double bearingDeg = RegionalGeo.bearingDeg(originLat, originLon, lat, lon);
            String directionKey = RegionalGeo.directionKey(bearingDeg);
            String distanceBandKey = RegionalGeo.distanceBandKey(distanceKm);

            saved.add(sandboxRepository.save(new SandboxAgriDestinationClassification(
                    revisionId, area.getAreaKey(), originLat, originLon,
                    distanceKm, bearingDeg, directionKey, distanceBandKey,
                    GENERATOR_VERSION, generatedAt)));
        }
        return saved;
    }
}

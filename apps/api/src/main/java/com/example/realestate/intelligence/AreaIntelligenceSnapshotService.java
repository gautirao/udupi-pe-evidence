package com.example.realestate.intelligence;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Service that computes per-area aggregate statistics and upserts them into
 * {@code area_intelligence_snapshot}.
 *
 * <p><b>Design:</b> a single native aggregate query ({@link AreaIntelligenceSnapshotRepository#findRawAggregates})
 * produces one row per {@code (city_slug, area_key)} bucket with NO N+1 round trips.
 * The service applies k-anonymity suppression, confidence classification, and saves all
 * rows in one batch via {@code saveAllAndFlush}.
 *
 * <p><b>Upsert semantics:</b> JPA merge ({@code saveAllAndFlush}) on an existing
 * composite PK performs an UPDATE, which is functionally equivalent to
 * {@code INSERT ... ON CONFLICT DO UPDATE}. The repository JPA provider (Hibernate)
 * issues a SELECT-before-INSERT sequence; for a full replace pattern this is acceptable
 * because snapshots are refreshed in bulk periodically, not at high-concurrency per-row rate.
 *
 * <p>{@link AreaIntelligenceSnapshot} has no {@code @Version} and a composite {@code @IdClass}
 * key that is never null, so Spring Data's default {@code isNew()} treats every instance as
 * "not new" and this merge is a <b>full-column</b> UPDATE — it would silently overwrite a
 * column this service does not itself compute (see {@code demand_score} below) unless that
 * column is explicitly preserved first. See {@link #preserveExistingDemandScores}.
 *
 * <p><b>k-anonymity suppression rule ({@link AggregationConstants#K_ANON_MIN}):</b>
 * When {@code activeListingCount < K_ANON_MIN}, precise values ({@code median_price_paise},
 * {@code dominant_property_type}) are suppressed (set to NULL, never 0).
 * {@code price_comparison_supported} is set to false. Suppressing to NULL (not 0) is
 * required because 0 is a false value that could mislead callers into thinking there is
 * zero price, not that price is unknown.
 *
 * <p><b>demand_score:</b> not computed by this service. It is written separately by
 * {@link AreaDemandSignalRepository#updateDemandScore} (issue #1532), driven by the
 * hourly {@code AreaDemandSignalRollupJob}, via a targeted {@code UPDATE} that touches
 * only that one column. Because {@link #buildSnapshots} performs a full-column merge
 * (see above), {@link #preserveExistingDemandScores} copies each row's current
 * {@code demand_score} onto the freshly built entity before save so this recompute never
 * clobbers that separately-maintained value. Never fabricate a value.
 *
 * <p><b>avg_listing_quality:</b> SQL AVG returns NULL when no scored rows exist.
 * The service passes the raw Double (which may be null) through directly — NEVER coerces
 * null to 0.
 */
@Service
public class AreaIntelligenceSnapshotService {

    private static final Logger log = LoggerFactory.getLogger(AreaIntelligenceSnapshotService.class);

    private final AreaIntelligenceSnapshotRepository snapshotRepository;

    public AreaIntelligenceSnapshotService(AreaIntelligenceSnapshotRepository snapshotRepository) {
        this.snapshotRepository = snapshotRepository;
    }

    /**
     * Compute per-area aggregates and upsert one {@link AreaIntelligenceSnapshot} row per
     * {@code (city_slug, area_key)} bucket.
     *
     * <p>This method is idempotent: calling it multiple times produces the same stable
     * snapshot state (latest data wins via upsert). {@code computed_at} is refreshed on
     * every invocation to record when the snapshot was last computed.
     *
     * @return count of snapshot rows written (for monitoring/logging)
     */
    @Transactional
    public int buildSnapshots() {
        log.info("AreaIntelligenceSnapshotService: starting snapshot build");

        List<AreaIntelligenceSnapshotRow> rows =
                snapshotRepository.findRawAggregates(AggregationConstants.FRESH_WINDOW_DAYS);

        log.debug("AreaIntelligenceSnapshotService: aggregate query returned {} buckets", rows.size());

        Instant now = Instant.now();
        List<AreaIntelligenceSnapshot> snapshots = rows.stream()
                .map(row -> toSnapshot(row, now))
                .toList();

        preserveExistingDemandScores(snapshots);

        snapshotRepository.saveAllAndFlush(snapshots);

        log.info("AreaIntelligenceSnapshotService: upserted {} snapshot rows", snapshots.size());
        return snapshots.size();
    }

    /**
     * Preserve each row's currently-persisted {@code demand_score} across the full-column
     * merge performed by {@link #buildSnapshots}.
     *
     * <p>{@link #toSnapshot} never sets {@code demand_score} — it is populated separately and
     * asynchronously by {@link AreaDemandSignalRepository#updateDemandScore} (issue #1532),
     * driven by the hourly {@code AreaDemandSignalRollupJob}. Because {@code saveAllAndFlush}
     * on this composite-key, unversioned entity performs a full-column
     * {@code EntityManager.merge()} (see class javadoc), leaving {@code demand_score} unset on
     * the in-memory entity would silently null out a live, separately-maintained column on
     * every existing row on every nightly run. This looks up the current persisted value for
     * each {@code (city_slug, area_key)} bucket in one batch fetch (no N+1) and copies it onto
     * the freshly built entity before save. Newly-created buckets (no existing row) correctly
     * keep {@code demand_score = null} — there is nothing to preserve yet.
     *
     * @param snapshots freshly built entities (pre-save), mutated in place
     */
    private void preserveExistingDemandScores(List<AreaIntelligenceSnapshot> snapshots) {
        if (snapshots.isEmpty()) {
            return;
        }

        List<AreaIntelligenceSnapshotId> ids = snapshots.stream()
                .map(s -> new AreaIntelligenceSnapshotId(s.getCitySlug(), s.getAreaKey()))
                .toList();

        // Collectors.toMap() throws NullPointerException on a null value, and most rows'
        // demand_score IS legitimately null — filter those out before collecting; the
        // lookup below already treats "absent from the map" the same as "null", so this
        // changes nothing observable, it just avoids the NPE.
        Map<AreaIntelligenceSnapshotId, BigDecimal> existingDemandScoresById =
                snapshotRepository.findAllById(ids).stream()
                        .filter(s -> s.getDemandScore() != null)
                        .collect(Collectors.toMap(
                                s -> new AreaIntelligenceSnapshotId(s.getCitySlug(), s.getAreaKey()),
                                AreaIntelligenceSnapshot::getDemandScore));

        for (AreaIntelligenceSnapshot snapshot : snapshots) {
            BigDecimal existingDemandScore = existingDemandScoresById.get(
                    new AreaIntelligenceSnapshotId(snapshot.getCitySlug(), snapshot.getAreaKey()));
            if (existingDemandScore != null) {
                snapshot.setDemandScore(existingDemandScore);
            }
        }
    }

    /**
     * Map one aggregate query row to an {@link AreaIntelligenceSnapshot} entity,
     * applying k-anonymity suppression and confidence classification.
     *
     * @param row   raw aggregate row from the native query
     * @param now   snapshot computation timestamp (caller-supplied for consistency)
     * @return fully populated snapshot entity ({@code demand_score} stays null here — see
     *         {@link #preserveExistingDemandScores}, applied by the caller after mapping)
     */
    AreaIntelligenceSnapshot toSnapshot(AreaIntelligenceSnapshotRow row, Instant now) {
        int activeCount = row.getActiveListingCount() != null
                ? row.getActiveListingCount().intValue()
                : 0;

        // Confidence classification — reuses AreaConfidence as-is; thresholds not redefined here.
        String confidence = AreaConfidence.classify(activeCount).name().toLowerCase();

        // k-anonymity suppression: precise values MUST be NULL (not 0) below K_ANON_MIN.
        boolean supported = activeCount >= AggregationConstants.K_ANON_MIN;

        // PERCENTILE_CONT over BIGINT returns DOUBLE PRECISION via JDBC; convert to Long via
        // Math.round() for the entity's BIGINT column. NULL propagates (no price rows → null).
        Long medianPricePaise = (supported && row.getMedianPricePaise() != null)
                ? Math.round(row.getMedianPricePaise())
                : null;
        String dominantPropertyType = supported ? row.getDominantPropertyType() : null;

        // avg_listing_quality: preserve the SQL AVG result (null when scoredCount=0).
        // MUST NOT coerce to 0 — null signals backfill-incomplete state.
        // setScale(2, HALF_UP) ensures the in-memory value deterministically matches the
        // NUMERIC(5,2) column scale rather than relying on Hibernate's implicit rounding.
        BigDecimal avgListingQuality = null;
        if (row.getAvgQuality() != null) {
            avgListingQuality = BigDecimal.valueOf(row.getAvgQuality())
                    .setScale(2, RoundingMode.HALF_UP);
        }

        int freshListingCount = row.getFreshListingCount() != null
                ? row.getFreshListingCount().intValue()
                : 0;

        // price_comparison_sample_count = activeListingCount (the bucket itself; approved D4).
        int priceComparisonSampleCount = activeCount;

        AreaIntelligenceSnapshot snapshot = new AreaIntelligenceSnapshot();
        snapshot.setCitySlug(row.getCitySlug());
        snapshot.setAreaKey(row.getAreaKey());
        snapshot.setAreaLabel(row.getAreaLabel());
        snapshot.setComputedAt(now);
        snapshot.setActiveListingCount(activeCount);
        snapshot.setMedianPricePaise(medianPricePaise);
        snapshot.setDominantPropertyType(dominantPropertyType);
        snapshot.setFreshListingCount(freshListingCount);
        snapshot.setAvgListingQuality(avgListingQuality);
        snapshot.setPriceComparisonSampleCount(priceComparisonSampleCount);
        snapshot.setPriceComparisonSupported(supported);
        snapshot.setConfidence(confidence);
        // demand_score intentionally not set here — preserved separately by the caller
        // (preserveExistingDemandScores), since it is maintained by a different job (#1532).

        return snapshot;
    }
}
